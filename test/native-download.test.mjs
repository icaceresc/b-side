import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createAimp } from '../src/aimp.mjs'
import { connectNativeHelper, downloadNativeHelper, findNativeHelper, helperUrl, MAX_BYTES, nativeHelper, PINNED_SHA256, pluginVersion, RETRY_AFTER_MS, sha256 } from '../src/native-helper.mjs'

const SCRATCH = fileURLToPath(new URL('../scratch/', import.meta.url))
const dirs = []
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))))
async function tempRoot() {
  await mkdir(SCRATCH, { recursive: true })
  const d = await mkdtemp(join(SCRATCH, 'tmp-native-'))
  dirs.push(d)
  return join(d, 'helper')
}

const GOOD = Buffer.from('MZ a stand-in for the helper build')
const BAD = Buffer.from('MZ something else entirely')
const pins = { x64: sha256(GOOD) }

/** A fetch that answers every URL with `bytes` (or throws `error`), and records what it was asked. */
function fakeFetch({ bytes = GOOD, status = 200, error = null, finalUrl } = {}) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, init })
    if (error) throw error
    return {
      ok: status >= 200 && status < 300,
      status,
      url: finalUrl ?? url,
      headers: new Map([['content-length', String(bytes.length)]]),
      body: (async function* () {
        yield bytes.subarray(0, 5)
        yield bytes.subarray(5)
      })()
    }
  }
  return { fetch, calls }
}

const opts = (root, over = {}) => ({ root, version: '9.8.7', arch: 'x64', pins, local: null, ...over })
const files = (dir) => (existsSync(dir) ? readdirSync(dir) : [])

test('the pins name both release builds, and the URL is this version on B-Side\'s own release', () => {
  assert.match(PINNED_SHA256.x64, /^[0-9a-f]{64}$/)
  assert.match(PINNED_SHA256.arm64, /^[0-9a-f]{64}$/)
  assert.equal(helperUrl('2.3.1', 'x64'), 'https://github.com/icaceresc/b-side/releases/download/v2.3.1/bside-helper-x64.exe')
  assert.match(pluginVersion(), /^\d+\.\d+\.\d+$/)
})

test('a download whose SHA-256 is the pinned one is kept, and a later start uses it without downloading', async () => {
  const root = await tempRoot()
  const net = fakeFetch()
  const logs = []
  const got = await nativeHelper({ ...opts(root), fetch: net.fetch, log: (m) => logs.push(m) })
  assert.equal(got.source, 'download')
  assert.equal(got.path, join(root, '9.8.7', 'bside-helper-x64.exe'))
  assert.deepEqual(readFileSync(got.path), GOOD)
  assert.deepEqual(net.calls.map((c) => c.url), ['https://github.com/icaceresc/b-side/releases/download/v9.8.7/bside-helper-x64.exe'])
  assert.equal(net.calls[0].init.redirect, 'follow')
  assert.ok(logs.some((m) => /downloaded bside-helper-x64\.exe 9\.8\.7 .*as pinned/.test(m)))
  assert.deepEqual(files(join(root, '9.8.7')), ['bside-helper-x64.exe']) // no .part left
  const again = await nativeHelper({ ...opts(root), fetch: net.fetch })
  assert.deepEqual(again, { path: got.path, source: 'cache' })
  assert.equal(net.calls.length, 1)
})

test('a download with another SHA-256 is deleted, never kept, and the next try waits for a later start', async () => {
  const root = await tempRoot()
  const net = fakeFetch({ bytes: BAD })
  const logs = []
  let t = 1_000_000
  const now = () => t
  const got = await nativeHelper({ ...opts(root), fetch: net.fetch, now, log: (m) => logs.push(m) })
  assert.equal(got.path, null)
  assert.match(got.reason, /SHA-256 [0-9a-f]{64} is not the pinned/)
  assert.deepEqual(files(join(root, '9.8.7')), [])
  assert.ok(logs.some((m) => /cannot get the native helper .*not the pinned.*using the powershell helper/.test(m)))
  const state = JSON.parse(readFileSync(join(root, 'download.json'), 'utf8'))
  assert.equal(state.failures, 1)
  assert.equal(state.nextAt, t + RETRY_AFTER_MS[0])
  // Before the wait is over: no download, PowerShell.
  t += RETRY_AFTER_MS[0] - 1
  const waiting = await nativeHelper({ ...opts(root), fetch: net.fetch, now })
  assert.equal(waiting.path, null)
  assert.equal(waiting.download, false)
  assert.equal(net.calls.length, 1)
  // After it: one more try, and a longer wait when it fails again.
  t += 1
  await nativeHelper({ ...opts(root), fetch: net.fetch, now })
  assert.equal(net.calls.length, 2)
  const second = JSON.parse(readFileSync(join(root, 'download.json'), 'utf8'))
  assert.equal(second.failures, 2)
  assert.equal(second.nextAt, t + RETRY_AFTER_MS[1])
})

test('with no network the download fails quietly to PowerShell, and a later good one clears the failure', async () => {
  const root = await tempRoot()
  let t = 5_000_000
  const offline = fakeFetch({ error: new TypeError('fetch failed') })
  const got = await nativeHelper({ ...opts(root), fetch: offline.fetch, now: () => t })
  assert.deepEqual(got, { path: null, reason: 'fetch failed' })
  t += RETRY_AFTER_MS[0]
  const online = fakeFetch()
  assert.equal((await nativeHelper({ ...opts(root), fetch: online.fetch, now: () => t })).source, 'download')
  assert.equal(existsSync(join(root, 'download.json')), false)
})

test('HTTP errors, a redirect off HTTPS and an oversized file are refused', async () => {
  const root = await tempRoot()
  const run = async (net) => (await downloadNativeHelper({ ...opts(root), fetch: net.fetch })).reason
  assert.equal(await run(fakeFetch({ status: 404 })), 'HTTP 404')
  assert.match(await run(fakeFetch({ finalUrl: 'http://example.invalid/x.exe' })), /off HTTPS/)
  assert.match(await run(fakeFetch({ bytes: Buffer.alloc(MAX_BYTES + 1) })), /more than/)
  assert.deepEqual(files(join(root, '9.8.7')), [])
})

test('a cached file that is not the pinned build is deleted and downloaded again', async () => {
  const root = await tempRoot()
  await mkdir(join(root, '9.8.7'), { recursive: true })
  await writeFile(join(root, '9.8.7', 'bside-helper-x64.exe'), BAD)
  const logs = []
  const found = await findNativeHelper({ ...opts(root), log: (m) => logs.push(m) })
  assert.deepEqual(found, { path: null, reason: 'not downloaded yet', download: true })
  assert.equal(existsSync(join(root, '9.8.7', 'bside-helper-x64.exe')), false)
  assert.match(logs[0], /SHA-256 differs.*deleted it, never started/)
})

test('a new version downloads its own build and removes the old one', async () => {
  const root = await tempRoot()
  const net = fakeFetch()
  await nativeHelper({ ...opts(root), version: '1.0.0', fetch: net.fetch })
  const next = await nativeHelper({ ...opts(root), version: '1.0.1', fetch: net.fetch })
  assert.equal(next.source, 'download')
  assert.deepEqual(net.calls.map((c) => c.url.split('/').at(-2)), ['v1.0.0', 'v1.0.1'])
  assert.deepEqual(files(root), ['1.0.1'])
})

test('the setting turned off, an architecture with no build and a local build never download', async () => {
  const root = await tempRoot()
  const net = fakeFetch()
  assert.deepEqual(await nativeHelper({ ...opts(root), enabled: false, fetch: net.fetch }), { path: null, reason: 'its download is turned off in Settings', download: false })
  assert.equal((await nativeHelper({ ...opts(root), arch: 'ia32', fetch: net.fetch })).download, false)
  assert.deepEqual(await nativeHelper({ ...opts(root), local: 'C:\\dev\\native\\bin\\bside-helper-x64.exe', fetch: net.fetch }), { path: 'C:\\dev\\native\\bin\\bside-helper-x64.exe', source: 'local' })
  assert.equal(net.calls.length, 0)
})

// The AIMP client side: requests wait for `ready`, and a finished download takes over from an idle
// PowerShell helper.
function fakeHelper(from) {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin.on('data', (chunk) => {
    for (const line of String(chunk).split('\n').filter(Boolean)) {
      const req = JSON.parse(line)
      child.stdout.write(`${JSON.stringify(req.cmd === 'ping' ? { id: 0, ok: true, result: true } : { id: req.id, ok: true, result: { from } })}\n`)
    }
  })
  return child
}

test('requests wait for ready; a finished download hands over from an idle PowerShell helper', async () => {
  const spawned = []
  const children = []
  const spawnHelper = (spec) => {
    spawned.push(spec.exe.endsWith('powershell.exe') ? 'powershell' : spec.exe)
    const c = fakeHelper(spec.kind)
    children.push(c)
    return c
  }
  let settle
  const ready = new Promise((r) => (settle = r))
  const a = createAimp({ kind: 'auto', nativePath: null, ready, spawnHelper })
  const first = a.request('state')
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(spawned, []) // nothing starts before ready
  settle()
  assert.deepEqual(await first, { from: 'powershell' })
  a.useNative('C:\\cache\\bside-helper-x64.exe')
  assert.equal(children[0].stdin.writableEnded, true) // the idle PowerShell helper was told to stop
  assert.deepEqual(await a.request('state'), { from: 'native' })
  assert.deepEqual(spawned, ['powershell', 'C:\\cache\\bside-helper-x64.exe'])
  assert.equal(a.kind, 'native')
  a.useNative(null) // the setting turned off: back to PowerShell
  assert.deepEqual(await a.request('state'), { from: 'powershell' })
  a.close()
})

test('connectNativeHelper: a cached build is ready before the first request; a due download runs in the background', async () => {
  const root = await tempRoot()
  const net = fakeFetch()
  const used = []
  const client = { useNative: (p) => used.push(p) }
  const logs = []
  // First start: nothing cached, so ready settles with PowerShell and the download follows.
  const one = connectNativeHelper({ options: { ...opts(root), fetch: net.fetch }, log: (m) => logs.push(m) })
  one.attach(client)
  await one.ready
  await one.done
  assert.deepEqual(used, [null, join(root, '9.8.7', 'bside-helper-x64.exe')])
  // Second start: the cached build, no download.
  const two = connectNativeHelper({ options: { ...opts(root), fetch: net.fetch }, log: (m) => logs.push(m) })
  two.attach(client)
  await two.done
  assert.deepEqual(used.at(-1), join(root, '9.8.7', 'bside-helper-x64.exe'))
  assert.equal(net.calls.length, 1)
  assert.ok(logs.some((m) => /native, cached at/.test(m)))
  // The setting off: PowerShell, and turning it on again uses the cached build.
  let listener
  const settings = { value: false, get: async () => settings.value, onDidChange: (l) => ((listener = l), { dispose() {} }) }
  const three = connectNativeHelper({ settings, options: { ...opts(root), fetch: net.fetch }, log: (m) => logs.push(m) })
  three.attach(client)
  await three.done
  assert.equal(used.at(-1), null)
  assert.ok(logs.some((m) => /turned off in Settings/.test(m)))
  settings.value = true
  listener({ key: 'nativeHelper' })
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(used.at(-1), join(root, '9.8.7', 'bside-helper-x64.exe'))
  three.dispose()
})
