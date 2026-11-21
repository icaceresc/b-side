// Client for the AIMP helper: starts it on first use, keeps it running, and matches JSON-line
// replies to requests. The helper is native/bin/bside-helper-<arch>.exe (built from native/helper)
// and, when that cannot start (an antivirus, a work PC's policy), native/aimp-helper.ps1 in Windows
// PowerShell, which speaks the same protocol. The helper talks to AIMP through window messages and
// shared memory only; nothing here opens a network port.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export class AimpError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const HELPER = new URL('../native/aimp-helper.ps1', import.meta.url)
const NATIVE = { x64: 'bside-helper-x64.exe', arm64: 'bside-helper-arm64.exe' }
export const MAX_ENCODED_COMMAND = 30000 // Windows caps a command line at 32767 characters
// Extra time for a helper's first answer: PowerShell's start plus compiling the helper's C#; for
// the native helper, an antivirus scanning a file it has not seen before.
const STARTUP_GRACE_MS = { powershell: 15000, native: 4000 }
const RESTART_BACKOFF_MS = 10000

/** The native helper for this PC's architecture, or null (no build for it, or the file is gone). */
export function nativeHelperPath(arch = process.arch) {
  if (!NATIVE[arch]) return null
  const path = fileURLToPath(new URL(`../native/bin/${NATIVE[arch]}`, import.meta.url))
  return existsSync(path) ? path : null
}

/**
 * The PowerShell helper runs from a small loader passed with -EncodedCommand: it reads
 * native/aimp-helper.ps1 and runs it as a script block. Execution policy applies to script files,
 * not to a script block built from text, so this works where scripts are blocked, as passing the
 * whole helper did; and the helper is not bound by the command-line limit.
 */
export function helperLoader(path = fileURLToPath(HELPER)) {
  readFileSync(path) // fail here, not inside PowerShell, when the file is missing
  const quoted = `'${path.replace(/'/g, "''")}'`
  return `& ([scriptblock]::Create([IO.File]::ReadAllText(${quoted}, [Text.Encoding]::UTF8)))`
}

export function helperCommand(env = process.env, path) {
  const encoded = Buffer.from(helperLoader(path), 'utf16le').toString('base64')
  if (encoded.length > MAX_ENCODED_COMMAND) throw new AimpError('helper_failed', 'The AIMP helper is too large to start')
  // Full path: never pick up a powershell.exe from the working directory.
  const exe = join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return { exe, args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded] }
}

/** What to start for `kind` ('native' or 'powershell'): { kind, exe, args }. */
export function helperSpec(kind, { nativePath = nativeHelperPath(), env = process.env } = {}) {
  if (kind === 'native') {
    if (!nativePath) throw new AimpError('helper_failed', `No native AIMP helper for ${process.arch}`)
    return { kind, exe: nativePath, args: [] }
  }
  return { kind: 'powershell', ...helperCommand(env) }
}

/** Starts a helper process from a spec, by its full path, with no window. */
export function helperProcess({ exe, args }) {
  return spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
}

/**
 * kind: 'auto' (the native helper, falling back to PowerShell), 'native' or 'powershell'.
 * A native helper that fails before its first answer (it cannot start, it exits, or it stays
 * silent past its first request's time) is replaced by the PowerShell helper for the rest of the
 * worker's life; the requests waiting on it move over, and the switch is logged.
 */
export function createAimp({ spawnHelper = helperProcess, kind = 'auto', nativePath, timeoutMs = 6000, now = () => Date.now(), log } = {}) {
  const native = nativePath === undefined ? nativeHelperPath() : nativePath
  let kinds = kind === 'auto' ? (native ? ['native', 'powershell'] : ['powershell']) : [kind]
  let helper = null
  let nextId = 1
  let failedAt = null
  let lastFailure = ''

  const arm = (h, id, p, extra) => {
    p.timer = setTimeout(() => {
      // A native helper that never answered is treated as one that cannot start.
      if (!h.answered && kinds.length > 1 && h.kind === kinds[0] && h.alive) {
        try {
          h.child.kill()
        } catch {}
        h.fail(`The ${h.kind} AIMP helper did not answer`)
        return
      }
      h.pending.delete(id)
      p.reject(new AimpError('aimp_timeout', `AIMP did not answer "${p.cmd}" in time`))
    }, p.timeout + extra)
  }

  const send = (h, id, p) => {
    h.pending.set(id, p)
    // Every request sent before the helper's first answer waits for it to start.
    arm(h, id, p, h.answered ? 0 : STARTUP_GRACE_MS[h.kind])
    h.child.stdin.write(`${JSON.stringify({ id, cmd: p.cmd, args: p.args })}\n`)
  }

  // Pending requests and the read buffer belong to one helper process, so a late exit of an old
  // helper never fails the requests of a new one.
  function launch() {
    const which = kinds[0]
    const h = { kind: which, pending: new Map(), buffer: '', stderr: '', alive: true, answered: false }
    h.fail = (reason) => {
      if (!h.alive) return
      h.alive = false
      if (helper === h) helper = null
      const waiting = [...h.pending.entries()]
      h.pending.clear()
      for (const [, p] of waiting) clearTimeout(p.timer)
      if (!h.answered && kinds.length > 1 && kinds[0] === h.kind) {
        kinds = kinds.slice(1)
        log?.(`AIMP helper: the ${h.kind} helper could not start (${reason}); using the ${kinds[0]} helper instead`)
        let next
        try {
          next = ensure()
        } catch (error) {
          for (const [, p] of waiting) p.reject(error)
          return
        }
        for (const [id, p] of waiting) send(next, id, p)
        return
      }
      // Only a helper that never answered is held back; one that worked restarts on the next request.
      failedAt = h.answered ? null : now()
      lastFailure = reason
      const error = new AimpError('helper_failed', reason)
      for (const [, p] of waiting) p.reject(error)
    }
    try {
      h.child = spawnHelper(helperSpec(which, { nativePath: native }))
    } catch (error) {
      if (kinds.length < 2) throw error
      kinds = kinds.slice(1)
      log?.(`AIMP helper: the ${which} helper could not start (${error.message}); using the ${kinds[0]} helper instead`)
      return launch()
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
        h.answered = true
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
          const code = ['aimp_closed', 'aimp_timeout', 'invalid'].includes(msg.code) ? msg.code : 'aimp_error'
          p.reject(new AimpError(code, code === 'aimp_closed' ? 'AIMP is not running' : String(msg.error ?? 'AIMP refused the request')))
        }
      }
    })
    child.stderr.setEncoding?.('utf8')
    child.stderr.on('data', (chunk) => {
      h.stderr = (h.stderr + chunk).slice(-600)
    })
    child.stdin.on('error', (error) => h.fail(`The AIMP helper stopped (${error.code ?? error.message})`))
    child.on('error', (error) => h.fail(`Cannot start the AIMP helper: ${error.message}`))
    child.on('exit', (code) => h.fail(`The AIMP helper stopped (exit ${code})${h.stderr.trim() ? `: ${h.stderr.trim().split(/\r?\n/).slice(-2).join(' ')}` : ''}`))
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
    return new Promise((resolve, reject) => send(h, id, { cmd, args, timeout, resolve, reject }))
  }

  return {
    request,
    /** The helper in use now, or that the next request starts: 'native' or 'powershell'. */
    get kind() {
      return helper?.alive ? helper.kind : kinds[0]
    },
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
