import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createAimp, helperCommand, helperLoader, helperSpec, MAX_ENCODED_COMMAND, nativeHelperPath } from '../src/aimp.mjs'
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

test('handlers report AIMP closed without throwing on state, and no connectivity without a stream', async () => {
  const h = createHandlers({ aimp: fakeAimp({ state: { running: false } }), online: { get: () => ({ online: false, error: 'timeout' }) } })
  assert.deepEqual(await h['player.state'](), { running: false, online: null })
})

test('offline is reported for a cloud track only: a local file never probes nor shows offline', async () => {
  let probes = 0
  const online = { get: () => (probes++, { online: false, error: 'ETIMEDOUT' }) }
  const logs = []
  const local = createHandlers({ aimp: fakeAimp({ state: raw({ track: track({ fileName: 'C:\\Music\\01 Song.flac' }) }) }), online, log: (m) => logs.push(m) })
  const s = await local['player.state']()
  assert.equal(s.track.cloud, false)
  assert.equal(s.online, null)
  assert.equal('onlineError' in s, false)
  assert.equal(probes, 0)
  const cloud = createHandlers({ aimp: fakeAimp({ state: raw() }), online, log: (m) => logs.push(m) })
  const c = await cloud['player.state']()
  assert.equal(c.online, false)
  assert.equal(c.onlineError, 'ETIMEDOUT')
  await cloud['player.state']()
  assert.equal(logs.length, 1, 'the change to offline is logged once')
})

test('the online monitor takes two failed probes in a row to say offline, and retries sooner', async () => {
  let clock = 0
  const answers = [{ online: true }, { online: false, error: 'ENOTFOUND' }, { online: true }, { online: false, error: 'x' }, { online: false, error: 'y' }]
  const m = createOnlineMonitor({ probe: async () => answers.shift(), now: () => clock })
  await m.refresh()
  assert.equal(m.get().online, true)
  await m.refresh()
  assert.equal(m.get().online, true, 'one blip keeps the last answer')
  await m.refresh()
  await m.refresh()
  assert.equal(m.get().online, true)
  await m.refresh()
  assert.equal(m.get().online, false)
  assert.equal(m.get().error, 'y')
  clock = 10 * 60 * 1000
  assert.equal(m.get().online, null, 'an old answer is unknown again')
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

// A helper process over streams. Like the real helpers it answers `ping` with true, unless ping: false.
function fakeHelper(answer, { ping = true } = {}) {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin.on('data', (chunk) => {
    for (const line of String(chunk).split('\n').filter(Boolean)) {
      const req = JSON.parse(line)
      child.stdout.write(`${JSON.stringify(ping && req.cmd === 'ping' ? { id: req.id, ok: true, result: true } : answer(req))}\n`)
    }
  })
  return child
}

test('helper client matches replies and maps aimp_closed', async () => {
  const a = createAimp({
    kind: 'powershell',
    spawnHelper: () => fakeHelper((req) => (req.cmd === 'state' ? { id: req.id, ok: true, result: { running: true } } : { id: req.id, ok: false, code: 'aimp_closed', error: 'AIMP is not running' }))
  })
  assert.deepEqual(await a.request('state'), { running: true })
  await assert.rejects(a.request('next'), { code: 'aimp_closed' })
  a.close()
})

test('helper client fails pending requests when the helper exits', async () => {
  let child
  const a = createAimp({
    kind: 'powershell',
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

// A library that knows one playing file (by what AIMP reports) and its album's cover.
function fakeLibrary({ ids = {}, cover = 'data:image/jpeg;base64,/9j/ALBUM' } = {}) {
  return {
    handlers: {},
    model: { trackById: new Map() },
    ensureLoaded: async () => {},
    rebuild() {},
    idsForPath: (f) => ({ trackId: ids[f] ?? null, albumId: ids[f] ? 'l1' : null }),
    albumCover: async (id) => (id ? cover : null),
    artistImage: async () => 'data:image/jpeg;base64,/9j/ARTIST',
    trackPaths: () => [],
    albumTrackIds: () => null,
    pathOf: () => null
  }
}

test("a OneDrive track's cover is its album's in the library, not AIMP's (none) nor the artist's", async () => {
  const link = 'https://download.example/01%20Wild%20Guess.flac?tempauth=x'
  const aimp = fakeAimp({ state: raw({ track: track({ fileName: link }) }), art: null })
  const onedrive = { cloud: { playEntry: async () => ({}), pathOf: () => null }, handlers: {} }
  const h = createHandlers({ aimp, onedrive, library: fakeLibrary({ ids: { [link]: 't9' } }), online: { get: () => ({ online: true }) }, playback: { dir: fileURLToPath(new URL('../scratch/', import.meta.url)) } })
  const r = await h['player.art']({ key: 'k1' })
  assert.equal(r.dataUrl, 'data:image/jpeg;base64,/9j/ALBUM')
  assert.equal(aimp.calls.filter(([c]) => c === 'art').length, 0, "the library's cover is enough")
  await h['player.art']({ key: 'k1' })
  assert.equal(aimp.calls.filter(([c]) => c === 'state').length, 1, 'cached per track')
  // An album without a cover image: AIMP's cover, if any.
  const bare = createHandlers({ aimp: fakeAimp({ state: raw({ track: track({ fileName: link }) }), art: '/9j/AIMP' }), onedrive, library: fakeLibrary({ ids: { [link]: 't9' }, cover: null }), online: { get: () => ({ online: true }) }, playback: { dir: fileURLToPath(new URL('../scratch/', import.meta.url)) } })
  assert.equal((await bare['player.art']({ key: 'k2' })).dataUrl, 'data:image/jpeg;base64,/9j/AIMP')
})

test("a local track's cover is AIMP's, else its album's in the library", async () => {
  const file = 'C:\\Music\\Artist\\Album\\01 Song.flac'
  const state = raw({ track: track({ fileName: file }) })
  const withArt = createHandlers({ aimp: fakeAimp({ state, art: '/9j/AIMP' }), library: fakeLibrary({ ids: { [file]: 't1' } }), online: { get: () => ({ online: true }) } })
  assert.equal((await withArt['player.art']({ key: 'a' })).dataUrl, 'data:image/jpeg;base64,/9j/AIMP')
  const without = createHandlers({ aimp: fakeAimp({ state, art: null }), library: fakeLibrary({ ids: { [file]: 't1' } }), online: { get: () => ({ online: true }) } })
  assert.equal((await without['player.art']({ key: 'b' })).dataUrl, 'data:image/jpeg;base64,/9j/ALBUM')
  const unknown = createHandlers({ aimp: fakeAimp({ state, art: null }), library: fakeLibrary(), online: { get: () => ({ online: true }) } })
  assert.equal((await unknown['player.art']({ key: 'c' })).dataUrl, null, 'not in the library: no cover')
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

test('the helper starts by full path from a small loader that reads native/aimp-helper.ps1', () => {
  const { exe, args } = helperCommand({ SystemRoot: 'C:\\Windows' })
  assert.equal(exe, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  assert.deepEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand'])
  assert.ok(args.at(-1).length <= MAX_ENCODED_COMMAND, `encoded loader is ${args.at(-1).length} chars`)
  const loader = Buffer.from(args.at(-1), 'base64').toString('utf16le')
  assert.match(loader, /^& \(\[scriptblock\]::Create\(\[IO\.File\]::ReadAllText\('.+aimp-helper\.ps1', \[Text\.Encoding\]::UTF8\)\)\)$/)
})

test('the loader doubles apostrophes in the path and fails early when the helper is missing', () => {
  const real = fileURLToPath(new URL('../native/aimp-helper.ps1', import.meta.url))
  assert.ok(helperLoader(real).includes(`'${real}'`))
  assert.throws(() => helperLoader("C:\\nowhere\\it's\\missing.ps1"), { code: 'ENOENT' })
})

test('a helper that cannot start is not respawned on every poll', async () => {
  let spawns = 0
  let clock = 0
  const a = createAimp({
    kind: 'powershell',
    now: () => clock,
    spawnHelper: () => {
      spawns++
      const child = fakeHelper(() => null, { ping: false })
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
    kind: 'powershell',
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
  const a = createAimp({ kind: 'powershell', spawnHelper: () => fakeHelper((req) => ({ id: req.id, ok: false, code: 'aimp_timeout', error: 'AIMP did not answer' })) })
  await assert.rejects(a.request('next'), { code: 'aimp_timeout' })
  a.close()
})
test('a track with no title and no usable file name is flagged untitled, not named in one language', () => {
  for (const fileName of ['', String.raw`C:\m\.flac`, 'https://h/x/']) {
    const s = shapeState(raw({ track: track({ title: '', fileName }) }))
    assert.equal(s.track.title, '', fileName)
    assert.equal(s.track.untitled, true, fileName)
  }
  assert.equal(shapeState(raw()).track.untitled, false)
})

test('a helper that worked and then stopped is restarted on the next request', async () => {
  let spawns = 0
  let child
  const a = createAimp({
    kind: 'powershell',
    now: () => 0,
    spawnHelper: () => {
      spawns++
      child = fakeHelper((req) => ({ id: req.id, ok: true, result: { running: false } }))
      return child
    }
  })
  assert.deepEqual(await a.request('state'), { running: false })
  child.emit('exit', 1) // PowerShell crashed or was killed after working fine
  child.emit('close', 1)
  assert.deepEqual(await a.request('state'), { running: false })
  assert.equal(spawns, 2)
  a.close()
})

// The native helper and its PowerShell fallback. `spawned` records which helper each start asked for.
function helpers(native) {
  const spawned = []
  const logs = []
  const spawnHelper = (spec) => {
    spawned.push(spec.kind)
    if (spec.kind === 'native') return native(spec)
    return fakeHelper((req) => ({ id: req.id, ok: true, result: { running: false, from: 'powershell' } }))
  }
  return { spawned, logs, options: { kind: 'auto', nativePath: 'C:\\b-side\\native\\bin\\bside-helper-x64.exe', spawnHelper, log: (m) => logs.push(m) } }
}

test('the native helper answers when it starts, with no fallback', async () => {
  const h = helpers(() => fakeHelper((req) => ({ id: req.id, ok: true, result: { running: false, from: 'native' } })))
  const a = createAimp(h.options)
  assert.equal(a.kind, 'native')
  assert.deepEqual(await a.request('state'), { running: false, from: 'native' })
  assert.deepEqual(h.spawned, ['native'])
  assert.deepEqual(h.logs, [])
  a.close()
})

test('a native helper blocked at start (antivirus, policy) falls back to PowerShell, logged, and the request still answers', async () => {
  const h = helpers(() => {
    const child = fakeHelper(() => null)
    child.stdin.removeAllListeners('data')
    queueMicrotask(() => child.emit('error', Object.assign(new Error('spawn UNKNOWN'), { code: 'UNKNOWN' })))
    return child
  })
  const a = createAimp(h.options)
  assert.deepEqual(await a.request('state'), { running: false, from: 'powershell' })
  assert.deepEqual(await a.request('state'), { running: false, from: 'powershell' })
  assert.deepEqual(h.spawned, ['native', 'powershell'])
  assert.equal(h.logs.length, 1)
  assert.match(h.logs[0], /native helper could not start \(Cannot start the AIMP helper: spawn UNKNOWN\); using the powershell helper/)
  assert.equal(a.kind, 'powershell')
  a.close()
})

test('a native helper that exits before answering, or cannot be spawned at all, falls back to PowerShell', async () => {
  const exits = helpers(() => {
    const child = fakeHelper(() => null)
    child.stdin.removeAllListeners('data')
    child.stdin.on('data', () => child.emit('exit', 3221225781))
    return child
  })
  const a = createAimp(exits.options)
  assert.deepEqual(await a.request('art'), { running: false, from: 'powershell' })
  assert.match(exits.logs[0], /exit 3221225781/)
  a.close()

  const throws = helpers(() => {
    throw Object.assign(new Error('spawn EACCES'), { code: 'EACCES' })
  })
  const b = createAimp(throws.options)
  assert.deepEqual(await b.request('state'), { running: false, from: 'powershell' })
  assert.deepEqual(throws.spawned, ['native', 'powershell'])
  assert.match(throws.logs[0], /EACCES/)
  b.close()
})

test(
  'a native helper that never answers is stopped and replaced by PowerShell, keeping the waiting requests',
  async () => {
    let killed = 0
    const h = helpers(() => {
      const child = fakeHelper(() => null)
      child.stdin.removeAllListeners('data')
      child.kill = () => killed++
      return child
    })
    const a = createAimp({ ...h.options, timeoutMs: 20 })
    const [one, two] = await Promise.all([a.request('state'), a.request('state')])
    assert.deepEqual(
      [one, two],
      [
        { running: false, from: 'powershell' },
        { running: false, from: 'powershell' }
      ]
    )
    assert.equal(killed, 1)
    assert.match(h.logs[0], /did not answer/)
    a.close()
  },
  { timeout: 15000 }
)

test('a native helper that worked and then stopped starts again natively', async () => {
  let child
  const h = helpers(() => (child = fakeHelper((req) => ({ id: req.id, ok: true, result: { running: false, from: 'native' } }))))
  const a = createAimp(h.options)
  await a.request('state')
  child.emit('exit', 1)
  child.emit('close', 1)
  assert.deepEqual(await a.request('state'), { running: false, from: 'native' })
  assert.deepEqual(h.spawned, ['native', 'native'])
  assert.deepEqual(h.logs, [])
  a.close()
})

test('with no native build the PowerShell helper starts directly; the native one starts by full path', () => {
  const h = helpers(() => assert.fail('no native helper'))
  const a = createAimp({ ...h.options, nativePath: null })
  assert.equal(a.kind, 'powershell')
  assert.equal(nativeHelperPath('ia32'), null)
  assert.deepEqual(helperSpec('native', { nativePath: 'C:\\x\\bside-helper-x64.exe' }), { kind: 'native', exe: 'C:\\x\\bside-helper-x64.exe', args: [] })
  assert.throws(() => helperSpec('native', { nativePath: null }), { code: 'helper_failed' })
  const path = nativeHelperPath('x64')
  if (path) assert.match(path, /^[A-Z]:\\.+\\native\\bin\\bside-helper-x64\.exe$/i)
})

test('no request reaches a helper before it answers its ping, so a fallback never repeats a control', async () => {
  const seen = []
  const h = helpers(() => {
    const child = fakeHelper(() => null)
    child.stdin.removeAllListeners('data')
    child.stdin.on('data', (chunk) => {
      for (const line of String(chunk).split('\n').filter(Boolean)) seen.push(JSON.parse(line).cmd)
      queueMicrotask(() => {
        child.emit('exit', 1)
        child.emit('close', 1)
      })
    })
    return child
  })
  const a = createAimp(h.options)
  assert.deepEqual(await a.request('next'), { running: false, from: 'powershell' })
  assert.deepEqual(seen, ['ping'], 'the native helper got only the ping')
  a.close()
})

test('after its ping, a native helper that stops fails the request sent to it instead of moving it', async () => {
  let child
  const h = helpers(() => {
    child = fakeHelper((req) => (req.cmd === 'next' ? null : { id: req.id, ok: true, result: req.cmd }))
    return child
  })
  const a = createAimp(h.options)
  assert.equal(await a.request('state'), 'state')
  const next = a.request('next')
  child.emit('exit', 1)
  child.emit('close', 1)
  await assert.rejects(next, { code: 'helper_failed' })
  assert.deepEqual(h.spawned, ['native'], 'not sent again to PowerShell')
  a.close()
})

test('an answer written just before the helper exits is still read', async () => {
  const h = helpers(() => {
    const child = fakeHelper(() => null)
    child.stdin.removeAllListeners('data')
    child.stdin.on('data', (chunk) => {
      for (const line of String(chunk).split('\n').filter(Boolean)) {
        const req = JSON.parse(line)
        if (req.cmd === 'ping') child.stdout.write(`${JSON.stringify({ id: 0, ok: true, result: true })}\n`)
        else {
          child.emit('exit', 0) // Node may report the exit before the last output is read
          child.stdout.write(`${JSON.stringify({ id: req.id, ok: false, code: 'aimp_timeout', error: 'AIMP did not answer' })}\n`)
          setTimeout(() => child.emit('close', 0), 5)
        }
      }
    })
    return child
  })
  const a = createAimp(h.options)
  await assert.rejects(a.request('state'), { code: 'aimp_timeout' })
  assert.deepEqual(h.spawned, ['native'])
  a.close()
})

test(
  'a broken first line does not count as the ping answer',
  async () => {
    const h = helpers(() => {
      const child = fakeHelper(() => null)
      child.stdin.removeAllListeners('data')
      child.stdin.on('data', () => child.stdout.write('{"id":0,"ok":tr\n'))
      child.kill = () => {}
      return child
    })
    const a = createAimp({ ...h.options, timeoutMs: 20 })
    assert.deepEqual(await a.request('state'), { running: false, from: 'powershell' })
    a.close()
  },
  { timeout: 15000 }
)

test('a native helper that refuses its ping falls back to PowerShell', async () => {
  const h = helpers(() => {
    const child = fakeHelper((req) => ({ id: req.id, ok: false, code: 'aimp_error', error: 'broken' }), { ping: false })
    child.kill = () => {}
    return child
  })
  const a = createAimp(h.options)
  assert.deepEqual(await a.request('state'), { running: false, from: 'powershell' })
  assert.match(h.logs[0], /refused its ping/)
  a.close()
})

test('an answer still in stdout when stdin breaks is read before the helper counts as gone', async () => {
  const h = helpers(() => {
    const child = fakeHelper(() => null)
    child.stdin.removeAllListeners('data')
    child.stdin.on('data', (chunk) => {
      for (const line of String(chunk).split('\n').filter(Boolean)) {
        const req = JSON.parse(line)
        if (req.cmd === 'ping') child.stdout.write(`${JSON.stringify({ id: 0, ok: true, result: true })}\n`)
        else {
          child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
          setTimeout(() => child.stdout.write(`${JSON.stringify({ id: req.id, ok: false, code: 'aimp_timeout', error: 'AIMP did not answer' })}\n`), 20)
        }
      }
    })
    return child
  })
  const a = createAimp(h.options)
  await assert.rejects(a.request('state'), { code: 'aimp_timeout' })
  a.close()
})
