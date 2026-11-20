// Client for native/aimp-helper.ps1: starts the helper on first use, keeps it running, and
// matches JSON-line replies to requests. The helper talks to AIMP through window messages and
// shared memory only; nothing here opens a network port.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export class AimpError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const HELPER = new URL('../native/aimp-helper.ps1', import.meta.url)
export const MAX_ENCODED_COMMAND = 30000 // Windows caps a command line at 32767 characters
const STARTUP_GRACE_MS = 15000 // PowerShell start plus compiling the helper's C#
const RESTART_BACKOFF_MS = 10000

export function helperCommand(env = process.env) {
  const script = readFileSync(HELPER, 'utf8')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  if (encoded.length > MAX_ENCODED_COMMAND) throw new AimpError('helper_failed', 'The AIMP helper is too large to start')
  // Full path: never pick up a powershell.exe from the working directory.
  const exe = join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return { exe, args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded] }
}

export function createAimp({ spawnHelper, timeoutMs = 6000, now = () => Date.now() } = {}) {
  let helper = null
  let nextId = 1
  let failedAt = null
  let lastFailure = ''

  const start =
    spawnHelper ??
    (() => {
      const { exe, args } = helperCommand()
      return spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    })

  // Pending requests and the read buffer belong to one helper process, so a late exit of an old
  // helper never fails the requests of a new one.
  function launch() {
    const h = { child: start(), pending: new Map(), buffer: '', stderr: '', fresh: true, alive: true }
    const fail = (reason) => {
      if (!h.alive) return
      h.alive = false
      if (helper === h) helper = null
      failedAt = now()
      lastFailure = reason
      const error = new AimpError('helper_failed', reason)
      for (const p of h.pending.values()) {
        clearTimeout(p.timer)
        p.reject(error)
      }
      h.pending.clear()
    }
    const { child } = h
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      h.buffer += chunk
      let nl
      while ((nl = h.buffer.indexOf('\n')) >= 0) {
        const line = h.buffer.slice(0, nl).trim()
        h.buffer = h.buffer.slice(nl + 1)
        if (!line.startsWith('{')) continue
        let msg
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        const p = h.pending.get(msg.id)
        if (!p) continue
        h.pending.delete(msg.id)
        clearTimeout(p.timer)
        if (msg.ok) p.resolve(msg.result)
        else {
          const code = ['aimp_closed', 'aimp_timeout'].includes(msg.code) ? msg.code : 'aimp_error'
          p.reject(new AimpError(code, code === 'aimp_closed' ? 'AIMP is not running' : String(msg.error ?? 'AIMP refused the request')))
        }
      }
    })
    child.stderr.setEncoding?.('utf8')
    child.stderr.on('data', (chunk) => {
      h.stderr = (h.stderr + chunk).slice(-600)
    })
    child.stdin.on('error', (error) => fail(`The AIMP helper stopped (${error.code ?? error.message})`))
    child.on('error', (error) => fail(`Cannot start the AIMP helper: ${error.message}`))
    child.on('exit', (code) => fail(`The AIMP helper stopped (exit ${code})${h.stderr.trim() ? `: ${h.stderr.trim().split(/\r?\n/).slice(-2).join(' ')}` : ''}`))
    return h
  }

  function ensure() {
    if (helper?.alive) return helper
    // A helper that cannot start (blocked PowerShell, policy) must not respawn on every poll.
    if (failedAt !== null && now() - failedAt < RESTART_BACKOFF_MS) throw new AimpError('helper_failed', lastFailure || 'The AIMP helper is not available')
    helper = launch()
    return helper
  }

  function request(cmd, args = {}, { timeout = timeoutMs } = {}) {
    let h
    try {
      h = ensure()
    } catch (error) {
      return Promise.reject(error)
    }
    const id = nextId++
    const grace = h.fresh ? STARTUP_GRACE_MS : 0
    h.fresh = false
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        h.pending.delete(id)
        reject(new AimpError('aimp_timeout', `AIMP did not answer "${cmd}" in time`))
      }, timeout + grace)
      h.pending.set(id, { resolve, reject, timer })
      h.child.stdin.write(`${JSON.stringify({ id, cmd, args })}\n`)
    })
  }

  return {
    request,
    close() {
      const h = helper
      helper = null
      if (!h) return
      h.alive = false
      for (const p of h.pending.values()) {
        clearTimeout(p.timer)
        p.reject(new AimpError('helper_closed', 'closed'))
      }
      h.pending.clear()
      try {
        h.child.stdin.end()
      } catch {}
    }
  }
}
