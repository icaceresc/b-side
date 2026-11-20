import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { createAimp, helperCommand, MAX_ENCODED_COMMAND } from '../src/aimp.mjs'
import { codecOf, createHandlers, createOnlineMonitor, describeQuality, shapeState, titleFromFile } from '../src/player.mjs'

const track = (over = {}) => ({
  active: true,
  bitrate: 1011,
  channels: 2,
  durationMs: 320357,
  fileSize: 40586744,
  sampleRate: 44100,
  trackNumber: 1,
  album: 'Album',
  artist: 'Artist',
  date: '2001',
  fileName: 'cloud://onedrive/Music/Artist/Album/01 Song.flac',
  genre: '',
  title: 'Song',
  ...over
})
const raw = (over = {}) => ({ running: true, state: 'playing', positionMs: 1000, durationMs: 320357, volume: 55, mute: false, repeat: false, shuffle: false, track: track(), ...over })

test('codec comes from local paths and cloud URLs, ignoring query strings', () => {
  assert.equal(codecOf('C:\\Music\\a.flac'), 'FLAC')
  assert.equal(codecOf('https://host/x/01%20Song.m4a?token=abc'), 'M4A')
  assert.equal(codecOf('cloud://item/12345'), null)
})

test('quality is CD only for lossless 44.1 kHz stereo, and never invents bit depth', () => {
  const q = describeQuality(track())
  assert.equal(q.codec, 'FLAC')
  assert.equal(q.lossless, true)
  assert.equal(q.cd, true)
  assert.equal(q.sampleRateLabel, '44.1 kHz')
  assert.equal('bits' in q, false)
  assert.equal(describeQuality(track({ fileName: 'x.mp3' })).lossless, false)
  assert.equal(describeQuality(track({ sampleRate: 96000 })).cd, false)
  assert.equal(describeQuality(track({ sampleRate: 96000 })).sampleRateLabel, '96 kHz')
  assert.equal(describeQuality(track({ fileName: 'cloud://id/1' })).lossless, null)
  assert.equal(describeQuality({ active: false }), null)
})

test('state shapes AIMP closed, idle and playing', () => {
  assert.deepEqual(shapeState({ running: false }), { running: false })
  assert.equal(shapeState(raw({ track: { ...track(), active: false } })).track, null)
  const s = shapeState(raw())
  assert.equal(s.track.title, 'Song')
  assert.equal(s.track.cloud, true)
  assert.equal(s.track.quality.cd, true)
  assert.equal(shapeState(raw({ track: track({ fileName: 'C:\\m\\a.flac' }) })).track.cloud, false)
})

test('missing tags fall back to the file name', () => {
  const s = shapeState(raw({ track: track({ title: '', artist: '', fileName: 'https://h/Music/07%20Superheroes.flac' }) }))
  assert.equal(s.track.title, 'Superheroes')
  assert.equal(s.track.artist, '')
})

function fakeAimp(replies) {
  const calls = []
  return {
    calls,
    request: async (cmd, args) => {
      calls.push([cmd, args])
      const r = replies[cmd]
      if (r instanceof Error) throw r
      return typeof r === 'function' ? r(args) : r
    },
    close() {}
  }
}
const closedError = Object.assign(new Error('AIMP is not running'), { code: 'aimp_closed' })

test('handlers report AIMP closed and offline without throwing on state', async () => {
  const h = createHandlers({ aimp: fakeAimp({ state: { running: false } }), online: { get: () => ({ online: false, error: 'timeout' }) } })
  assert.deepEqual(await h['player.state'](), { running: false, online: false, onlineError: 'timeout' })
})

test('commands are whitelisted and keep the error code', async () => {
  const aimp = fakeAimp({ next: true, seek: true, volume: closedError })
  const h = createHandlers({ aimp, online: { get: () => ({ online: true, error: null }) } })
  assert.deepEqual(await h['player.command']({ command: 'next' }), { ok: true })
  await h['player.command']({ command: 'seek', args: { positionMs: 5000 } })
  assert.deepEqual(aimp.calls.at(-1), ['seek', { positionMs: 5000 }])
  await assert.rejects(h['player.command']({ command: 'quit' }), { code: 'invalid' })
  await assert.rejects(h['player.command']({ command: 'volume', args: { volume: 3 } }), { code: 'aimp_closed' })
})

test('cover art is fetched once per track', async () => {
  const aimp = fakeAimp({ art: '/9j/AAAA' })
  const h = createHandlers({ aimp, online: { get: () => ({ online: true, error: null }) } })
  const a = await h['player.art']({ key: 't1' })
  assert.equal(a.dataUrl, 'data:image/jpeg;base64,/9j/AAAA')
  await h['player.art']({ key: 't1' })
  assert.equal(aimp.calls.filter(([c]) => c === 'art').length, 1)
  const none = await createHandlers({ aimp: fakeAimp({ art: null }), online: { get: () => ({ online: true, error: null }) } })['player.art']({ key: 't2' })
  assert.equal(none.dataUrl, null)
})

function fakeHelper(answer) {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin.on('data', (chunk) => {
    for (const line of String(chunk).split('\n').filter(Boolean)) {
      const req = JSON.parse(line)
      child.stdout.write(`${JSON.stringify(answer(req))}\n`)
    }
  })
  return child
}

test('helper client matches replies and maps aimp_closed', async () => {
  const a = createAimp({
    spawnHelper: () =>
      fakeHelper((req) => (req.cmd === 'state' ? { id: req.id, ok: true, result: { running: true } } : { id: req.id, ok: false, code: 'aimp_closed', error: 'AIMP is not running' }))
  })
  assert.deepEqual(await a.request('state'), { running: true })
  await assert.rejects(a.request('next'), { code: 'aimp_closed' })
  a.close()
})

test('helper client fails pending requests when the helper exits', async () => {
  let child
  const a = createAimp({
    spawnHelper: () => {
      child = fakeHelper(() => null)
      child.stdin.removeAllListeners('data')
      return child
    }
  })
  const pending = a.request('state')
  child.emit('exit', 1)
  await assert.rejects(pending, { code: 'helper_failed' })
})

test('a literal % in an untagged file name does not break the state', () => {
  assert.equal(titleFromFile('C:\\m\\07 100% Pure.flac'), '100% Pure')
  assert.equal(shapeState(raw({ track: track({ title: '', fileName: 'C:\\m\\07 100% Pure.flac' }) })).track.title, '100% Pure')
})

test('a missing cover is not cached, so a later request can find it', async () => {
  let n = 0
  const aimp = fakeAimp({ art: () => (++n === 1 ? null : '/9j/BBBB') })
  const h = createHandlers({ aimp, online: { get: () => ({ online: true }) } })
  assert.equal((await h['player.art']({ key: 'k' })).dataUrl, null)
  assert.equal((await h['player.art']({ key: 'k' })).dataUrl, 'data:image/jpeg;base64,/9j/BBBB')
})

test('concurrent state requests share one AIMP read', async () => {
  let reads = 0
  const aimp = { request: async () => (reads++, await new Promise((r) => setTimeout(r, 20)), { running: false }), close() {} }
  const h = createHandlers({ aimp, online: { get: () => ({ online: true }) } })
  await Promise.all([h['player.state'](), h['player.state'](), h['player.state']()])
  assert.equal(reads, 1)
})

test('the online monitor answers at once and probes once at a time', async () => {
  let probes = 0
  let release
  const m = createOnlineMonitor({ probe: () => (probes++, new Promise((r) => (release = r))) })
  assert.equal(m.get().online, null)
  m.get()
  assert.equal(probes, 1)
  release({ online: true, error: null })
  await m.refresh()
  assert.equal(m.get().online, true)
})

test('the helper fits on a Windows command line and starts by full path', () => {
  const { exe, args } = helperCommand({ SystemRoot: 'C:\\Windows' })
  assert.equal(exe, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  assert.ok(args.at(-1).length <= MAX_ENCODED_COMMAND, `encoded helper is ${args.at(-1).length} chars`)
})

test('a helper that cannot start is not respawned on every poll', async () => {
  let spawns = 0
  let clock = 0
  const a = createAimp({
    now: () => clock,
    spawnHelper: () => {
      spawns++
      const child = fakeHelper(() => null)
      queueMicrotask(() => child.emit('error', new Error('blocked by policy')))
      return child
    }
  })
  await assert.rejects(a.request('state'), { code: 'helper_failed', message: /blocked by policy/ })
  await assert.rejects(a.request('state'), { code: 'helper_failed' })
  assert.equal(spawns, 1)
  clock = 11000
  await assert.rejects(a.request('state'), { code: 'helper_failed' })
  assert.equal(spawns, 2)
})

test('a write to a dead helper fails the request instead of crashing the worker', async () => {
  const a = createAimp({
    spawnHelper: () => {
      const child = fakeHelper(() => null)
      child.stdin.removeAllListeners('data')
      child.stdin.write = () => queueMicrotask(() => child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })))
      return child
    }
  })
  await assert.rejects(a.request('state'), { code: 'helper_failed', message: /EPIPE/ })
})

test('helper error codes are kept', async () => {
  const a = createAimp({ spawnHelper: () => fakeHelper((req) => ({ id: req.id, ok: false, code: 'aimp_timeout', error: 'AIMP did not answer' })) })
  await assert.rejects(a.request('next'), { code: 'aimp_timeout' })
  a.close()
})