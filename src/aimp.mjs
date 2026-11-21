// Client for the AIMP helper: starts it on first use, keeps it running, and matches JSON-line
// replies to requests. The helper is bside-helper-<arch>.exe (built from native/helper; the
// release's build, downloaded and checked by src/native-helper.mjs, or a local build in native/bin)
// and, when there is none or it cannot start (an antivirus, a work PC's policy),
// native/aimp-helper.ps1 in Windows PowerShell, which speaks the same protocol. The helper talks to AIMP through window messages and
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
const EXIT_DRAIN_MS = 250 // after the process exits, for its last answers to be read

/** A local build of the native helper in native/bin for this PC, or null (none, or no build for it). */
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
 * Each helper first answers a `ping`, which does nothing; requests wait until it has, so none
 * reaches a helper that might not carry it out. A native helper that fails before that answer (it
 * cannot start, it exits, or it stays silent past a waiting request's time plus the start-up
 * grace) is stopped and replaced by the PowerShell helper for the rest of the worker's life: the
 * waiting requests, never sent, move over, and the switch is logged once. After the ping, a helper
 * that stops fails the requests sent to it and is started again on the next request.
 * `ready`, a promise: requests wait for it (the worker settles it once it knows whether a native
 * helper is here). `useNative(path)` sets the native helper later (a finished download) or drops
 * it (null): an idle helper of the other kind is stopped, and the next request starts the new one.
 */
export function createAimp({ spawnHelper = helperProcess, kind = 'auto', nativePath, ready = null, timeoutMs = 6000, now = () => Date.now(), log } = {}) {
  let native = nativePath === undefined ? nativeHelperPath() : nativePath
  let kinds = kind === 'auto' ? (native ? ['native', 'powershell'] : ['powershell']) : [kind]
  let waiting = ready ? Promise.resolve(ready).then(() => (waiting = null), () => (waiting = null)) : null
  let helper = null
  let nextId = 1
  let failedAt = null
  let lastFailure = ''

  const canFallBack = (h) => !h.ready && kinds.length > 1 && kinds[0] === h.kind

  const write = (h, id, p) => {
    h.pending.set(id, p)
    p.timer = setTimeout(() => {
      h.pending.delete(id)
      p.reject(new AimpError('aimp_timeout', `AIMP did not answer "${p.cmd}" in time`))
    }, p.timeout)
    h.child.stdin.write(`${JSON.stringify({ id, cmd: p.cmd, args: p.args })}\n`)
  }

  // Until the helper has answered its ping, a request waits in its queue, unsent.
  const enqueue = (h, id, p) => {
    // A helper that already stopped (it can, before its start returns) hands over to the next one.
    if (!h.alive) {
      try {
        h = ensure()
      } catch (error) {
        return p.reject(error)
      }
      if (!h.alive) return p.reject(new AimpError('helper_failed', lastFailure || 'The AIMP helper is not available'))
    }
    if (h.ready) return write(h, id, p)
    h.queue.set(id, p)
    p.timer = setTimeout(() => {
      if (!h.queue.has(id)) return
      if (h.alive && canFallBack(h)) {
        try {
          h.child.kill()
        } catch {}
        h.fail(`The ${h.kind} AIMP helper did not answer`)
        return
      }
      h.queue.delete(id)
      p.reject(new AimpError('aimp_timeout', `AIMP did not answer "${p.cmd}" in time`))
    }, p.timeout + STARTUP_GRACE_MS[h.kind])
  }

  // Requests and the read buffer belong to one helper process, so a late exit of an old helper
  // never fails the requests of a new one.
  function launch() {
    const which = kinds[0]
    const h = { kind: which, pending: new Map(), queue: new Map(), buffer: '', stderr: '', alive: true, ready: false }
    h.fail = (reason) => {
      if (!h.alive) return
      h.alive = false
      clearTimeout(h.exitTimer)
      if (helper === h) helper = null
      const queued = [...h.queue.entries()]
      const sent = [...h.pending.values()]
      h.queue.clear()
      h.pending.clear()
      for (const [, p] of queued) clearTimeout(p.timer)
      for (const p of sent) clearTimeout(p.timer)
      if (canFallBack(h)) {
        kinds = kinds.slice(1)
        log?.(`AIMP helper: the ${h.kind} helper could not start (${reason}); using the ${kinds[0]} helper instead`)
        let next
        try {
          next = ensure()
        } catch (error) {
          for (const [, p] of queued) p.reject(error)
          return
        }
        for (const [id, p] of queued) enqueue(next, id, p)
        return
      }
      // Only a helper that never answered is held back; one that worked restarts on the next request.
      failedAt = h.ready ? null : now()
      lastFailure = reason
      const error = new AimpError('helper_failed', reason)
      for (const [, p] of queued) p.reject(error)
      for (const p of sent) p.reject(error)
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
        let msg
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        // The answer to the ping: the helper reads requests and answers them. Anything but `true`
        // means it does not work.
        if (msg?.id === 0 && !h.ready && h.alive) {
          if (msg.ok !== true || msg.result !== true) {
            try {
              h.child.kill()
            } catch {}
            h.fail(`The ${h.kind} AIMP helper refused its ping (${msg.code ?? 'no answer'}: ${msg.error ?? ''})`)
            return
          }
          h.ready = true
          const queued = [...h.queue.entries()]
          h.queue.clear()
          for (const [id, p] of queued) {
            clearTimeout(p.timer)
            write(h, id, p)
          }
          continue
        }
        const p = h.pending.get(msg?.id)
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
    const stopped = (code) => `The AIMP helper stopped (exit ${code})${h.stderr.trim() ? `: ${h.stderr.trim().split(/\r?\n/).slice(-2).join(' ')}` : ''}`
    // 'close' comes once stdout is drained, so the last answers are read first. A program the
    // helper started may hold its pipes open, so 'exit' (and a write to a closed stdin, which
    // comes with it) ends the helper too, a moment later.
    const soon = (reason) => {
      if (h.alive && !h.exitTimer) h.exitTimer = setTimeout(() => h.fail(reason), EXIT_DRAIN_MS)
    }
    child.stdin.on('error', (error) => soon(`The AIMP helper stopped (${error.code ?? error.message})`))
    child.on('error', (error) => h.fail(`Cannot start the AIMP helper: ${error.message}`))
    child.on('close', (code) => h.fail(stopped(code)))
    child.on('exit', (code) => soon(stopped(code)))
    child.stdin.write(`${JSON.stringify({ id: 0, cmd: 'ping', args: {} })}\n`)
    return h
  }

  function ensure() {
    // After useNative, an idle helper of the other kind gives way (stdin closed: it exits).
    if (helper?.alive && helper.ready && helper.kind !== kinds[0] && !helper.pending.size && !helper.queue.size) {
      const old = helper
      helper = null
      old.alive = false
      clearTimeout(old.exitTimer)
      try {
        old.child.stdin.end()
      } catch {}
      log?.(`AIMP helper: switching from the ${old.kind} helper to the ${kinds[0]} helper`)
    }
    if (helper?.alive) return helper
    // A helper that cannot start (blocked PowerShell, policy) must not respawn on every poll.
    if (failedAt !== null && now() - failedAt < RESTART_BACKOFF_MS) throw new AimpError('helper_failed', lastFailure || 'The AIMP helper is not available')
    helper = launch()
    return helper
  }

  function request(cmd, args = {}, { timeout = timeoutMs } = {}) {
    if (waiting) return waiting.then(() => request(cmd, args, { timeout }))
    let h
    try {
      h = ensure()
    } catch (error) {
      return Promise.reject(error)
    }
    const id = nextId++
    return new Promise((resolve, reject) => enqueue(h, id, { cmd, args, timeout, resolve, reject }))
  }

  return {
    request,
    /** The helper in use now, or that the next request starts: 'native' or 'powershell'. */
    get kind() {
      return helper?.alive ? helper.kind : kinds[0]
    },
    useNative(path) {
      if (kind !== 'auto' || (path ?? null) === (native ?? null)) return
      native = path ?? null
      kinds = native ? ['native', 'powershell'] : ['powershell']
      failedAt = null
      if (helper?.alive && helper.kind !== kinds[0] && helper.ready && !helper.pending.size && !helper.queue.size) {
        try {
          ensure()
        } catch {
          /* the next request reports it */
        }
      }
    },
    close() {
      const h = helper
      helper = null
      if (!h) return
      h.alive = false
      clearTimeout(h.exitTimer)
      for (const p of [...h.pending.values(), ...h.queue.values()]) {
        clearTimeout(p.timer)
        p.reject(new AimpError('helper_closed', 'closed'))
      }
      h.pending.clear()
      h.queue.clear()
      try {
        h.child.stdin.end()
      } catch {}
    }
  }
}
