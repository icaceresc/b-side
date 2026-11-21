// Gets the native AIMP helper for this PC. The repository carries no executable: each release
// attaches the CI's builds of native/helper (bside-helper-x64.exe and bside-helper-arm64.exe), and
// on first use the worker downloads the one for this PC's architecture, from this plugin version's
// own release only, over HTTPS, into %LOCALAPPDATA%\B-Side\helper\<version>. It runs only when its
// SHA-256 is the one pinned below for this version; any other file is deleted, never started.
// Until it is there (downloading, offline, a failed download or check, an antivirus that removes
// it), B-Side uses the PowerShell helper, and the next try waits for a later start, longer after
// each failure. The `nativeHelper` setting turns the download off: always the PowerShell helper.
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = 'icaceresc/b-side'
// The SHA-256 of the helper builds this version runs: the CI's builds of native/helper, attached
// to this version's release (and to its SHA256SUMS). `node native/pins.mjs <dir>` checks a build
// against them; the CI does it on every build, and a release tag fails when they differ.
export const PINNED_SHA256 = {
  x64: '32d62ea1cf997a5d98996e81e90ac659ce451387aded3231cd5d029a6dffcaf3',
  arm64: 'aa466243eabba04fc1d2a650eed2a34931bad3d28a5a214d435ecd3f6c254257'
}
export const MAX_BYTES = 8 * 1024 * 1024 // the builds are about 0.5 MB
const DOWNLOAD_TIMEOUT_MS = 120000
// The wait before the next download after 1, 2, 3... failed ones; checked when the worker starts.
export const RETRY_AFTER_MS = [10 * 60000, 60 * 60000, 6 * 3600000, 24 * 3600000]

export const helperName = (arch) => `bside-helper-${arch}.exe`
export const helperUrl = (version, arch) => `https://github.com/${REPO}/releases/download/v${version}/${helperName(arch)}`
export const helperRoot = (env = process.env) => join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'B-Side', 'helper')
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** This plugin's version, from the manifest next to the code. */
export function pluginVersion() {
  return JSON.parse(readFileSync(new URL('../orca-plugin.json', import.meta.url), 'utf8')).version
}

/** A helper built in this checkout (node native/build.mjs), for development; never in a release. */
export function localBuild(arch = process.arch) {
  if (!PINNED_SHA256[arch]) return null
  const path = fileURLToPath(new URL(`../native/bin/${helperName(arch)}`, import.meta.url))
  return existsSync(path) ? path : null
}

async function readState(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return {}
  }
}

/** Reads a response body, failing past `max` bytes. */
async function body(res, max) {
  const length = Number(res.headers?.get?.('content-length'))
  if (length > max) throw new Error(`the file is ${length} bytes, more than ${max}`)
  const chunks = []
  let size = 0
  for await (const chunk of res.body) {
    size += chunk.length
    if (size > max) throw new Error(`the file is more than ${max} bytes`)
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

const where = ({ version = pluginVersion(), arch = process.arch, env = process.env, root = helperRoot(env) }) => {
  const dir = join(root, version)
  return { version, arch, root, dir, file: join(dir, helperName(arch)), stateFile: join(root, 'download.json') }
}

/**
 * The native helper already on this PC, with no network: a local development build in
 * native/bin, or the cached download whose SHA-256 is the pinned one (any other file there is
 * deleted). Returns { path, source: 'local' | 'cache' }, or { path: null, reason, download } where
 * `download` says whether to try a download now (it is on, there is a build for this PC, and the
 * last failure is far enough behind).
 */
export async function findNativeHelper({ pins = PINNED_SHA256, enabled = true, local, now = () => Date.now(), log = () => {}, ...at } = {}) {
  const { version, arch, file, stateFile } = where(at)
  const build = local === undefined ? localBuild(arch) : local
  if (build) return { path: build, source: 'local' }
  if (!enabled) return { path: null, reason: 'its download is turned off in Settings', download: false }
  const pin = pins[arch]
  if (!pin) return { path: null, reason: `there is no native helper for ${arch}`, download: false }
  try {
    if (sha256(await readFile(file)) === pin) return { path: file, source: 'cache' }
    await unlink(file).catch(() => {})
    log(`AIMP helper: ${file} is not the build this version pins (its SHA-256 differs); deleted it, never started`)
  } catch {
    /* not downloaded yet */
  }
  const state = await readState(stateFile)
  if (state.version === version && state.arch === arch && Number(state.nextAt) > now()) {
    return { path: null, reason: `the last download failed (${state.reason}); next try after ${new Date(state.nextAt).toISOString()}`, download: false }
  }
  return { path: null, reason: 'not downloaded yet', download: true }
}

/**
 * Downloads this version's helper for this PC from its GitHub release, checks its SHA-256 against
 * the pinned one and keeps it only then. Returns { path, source: 'download', ms } or
 * { path: null, reason } (the failure is recorded, so the next try waits for a later start).
 */
export async function downloadNativeHelper({ pins = PINNED_SHA256, fetch = globalThis.fetch, now = () => Date.now(), log = () => {}, ...at } = {}) {
  const { version, arch, root, dir, file, stateFile } = where(at)
  const pin = pins[arch]
  const url = helperUrl(version, arch)
  const state = await readState(stateFile)
  const started = now()
  const part = `${file}.${process.pid}-${randomBytes(4).toString('hex')}.part`
  try {
    if (!pin) throw new Error(`there is no native helper for ${arch}`)
    log(`AIMP helper: downloading ${url}; the powershell helper answers meanwhile`)
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
    if (!String(res.url || url).startsWith('https://')) throw new Error(`redirected off HTTPS to ${res.url}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const bytes = await body(res, MAX_BYTES)
    await mkdir(dir, { recursive: true })
    await writeFile(part, bytes)
    const digest = sha256(bytes)
    if (digest !== pin) {
      await unlink(part).catch(() => {})
      throw new Error(`its SHA-256 ${digest} is not the pinned ${pin}; deleted it, never started`)
    }
    await rename(part, file)
    // An antivirus can quarantine the file as soon as it lands: it must still be there, intact.
    if (sha256(await readFile(file)) !== pin) throw new Error('the file changed after it was written')
  } catch (error) {
    await unlink(part).catch(() => {})
    const failures = state.version === version && state.arch === arch ? (state.failures ?? 0) + 1 : 1
    const nextAt = now() + RETRY_AFTER_MS[Math.min(failures, RETRY_AFTER_MS.length) - 1]
    const reason = error?.name === 'TimeoutError' ? 'timed out' : String(error?.message ?? error)
    await mkdir(root, { recursive: true })
      .then(() => writeFile(stateFile, JSON.stringify({ version, arch, failures, nextAt, reason })))
      .catch(() => {})
    log(`AIMP helper: cannot get the native helper (${reason}); using the powershell helper, next try after ${new Date(nextAt).toISOString()}`)
    return { path: null, reason }
  }
  const ms = now() - started
  log(`AIMP helper: downloaded ${helperName(arch)} ${version} in ${ms} ms, SHA-256 as pinned (${pin})`)
  await unlink(stateFile).catch(() => {})
  // Builds of other versions are no longer used: remove them (only B-Side's own helper files).
  for (const other of await readdir(root).catch(() => [])) {
    if (other === version || !/^\d+\.\d+\.\d+$/.test(other)) continue
    const old = join(root, other)
    for (const name of await readdir(old).catch(() => [])) if (/^bside-helper-[a-z0-9]+\.exe(\..+\.part)?$/.test(name)) await unlink(join(old, name)).catch(() => {})
    await rmdir(old).catch(() => {})
  }
  return { path: file, source: 'download', ms }
}

/** The native helper: the one already here, or a download when one is due. */
export async function nativeHelper(options = {}) {
  const found = await findNativeHelper(options)
  return found.path || !found.download ? found : downloadNativeHelper(options)
}

/**
 * Wires the native helper into an AIMP client (createAimp with `ready` and, once known, its
 * useNative): `ready` settles once it is known whether a native helper is already here, so the
 * first request does not start PowerShell for nothing (or after `readyTimeoutMs`). A download,
 * when due, then goes on in the background with the PowerShell helper answering, and hands over
 * to the native helper once verified. The `nativeHelper` setting is read at start and on change.
 */
export function connectNativeHelper({ settings = null, log = () => {}, options = {}, readyTimeoutMs = 3000 } = {}) {
  let aimp = null
  let generation = 0
  let settle
  const ready = new Promise((resolve) => (settle = resolve))
  const timer = setTimeout(() => settle(), readyTimeoutMs)
  const use = (path) => aimp?.useNative(path ?? null)
  const enabled = async () => {
    try {
      return (await settings?.get?.('nativeHelper')) !== false
    } catch {
      return true
    }
  }
  const run = async () => {
    const mine = ++generation
    const opts = { ...options, enabled: await enabled(), log }
    const found = await findNativeHelper(opts)
    if (mine !== generation) return
    use(found.path)
    clearTimeout(timer)
    settle()
    if (found.path) return log(`AIMP helper: native, ${found.source === 'local' ? 'the local build' : 'cached'} at ${found.path}`)
    if (!found.download) return log(`AIMP helper: using the powershell helper (${found.reason})`)
    const got = await downloadNativeHelper(opts)
    if (mine === generation && got.path) use(got.path)
  }
  const done = run().catch((error) => {
    log(`AIMP helper: ${error.message}; using the powershell helper`)
    clearTimeout(timer)
    settle()
  })
  const sub = settings?.onDidChange?.((change) => {
    if (change?.key === 'nativeHelper') run().catch((error) => log(`AIMP helper: ${error.message}`))
  })
  return {
    ready,
    done,
    attach(client) {
      aimp = client
      return client
    },
    dispose() {
      generation++
      clearTimeout(timer)
      sub?.dispose?.()
    }
  }
}
