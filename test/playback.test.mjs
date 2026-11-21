import assert from 'node:assert/strict'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'
import { createPlayback, MAX_TRACKS, playbackArgs, playlistText, queueDir } from '../src/playback.mjs'
import { createHandlers } from '../src/player.mjs'

const DIR = 'C:\\Users\\me\\AppData\\Local\\B-Side\\queue'
const ROOT = 'C:\\Users\\me\\Music\\Hi-Fi Collection'
const ELSEWHERE = 'C:\\elsewhere\\song.flac'

const track = (id, album, disc, number, file) => ({ id, albumId: album, disc, number, path: `${ROOT}\\${file}` })
const ALBUM = [
  track('t3', 'a1', 1, 3, 'Fishmans\\空中キャンプ\\03 Slow Days.flac'),
  track('t1', 'a1', 1, 1, 'Fishmans\\空中キャンプ\\01 ずっと前.flac'),
  track('t5', 'a1', 2, 1, 'Fishmans\\空中キャンプ\\2-01 Bonus.flac'),
  track('t2', 'a1', 1, 2, 'Fishmans\\空中キャンプ\\02 Baby Blue.flac')
]
const OTHER = [track('r1', 'a2', 1, 1, 'Rosalía\\MOTOMAMI +\\01 SAOKO.flac'), track('r2', 'a2', 1, 2, "10cc\\The Original Soundtrack\\02 I'm Not In Love.flac")]
const ALL = [...ALBUM, ...OTHER]
const paths = (...ids) => ids.map((id) => ALL.find((t) => t.id === id).path)

function fakeFs() {
  const files = new Map()
  let busy = 0
  return {
    files,
    set busy(n) {
      busy = n
    },
    async mkdir() {},
    async writeFile(p, text) {
      files.set(p, { text, mtimeMs: 1000 })
    },
    async rename(from, to) {
      if (busy > 0) {
        busy--
        throw Object.assign(new Error('busy'), { code: 'EBUSY' })
      }
      files.set(to, files.get(from))
      files.delete(from)
    },
    async readdir(dir) {
      return [...files.keys()].filter((p) => dirname(p) === dir).map((p) => basename(p))
    },
    async stat(p) {
      if (!files.has(p)) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return { mtimeMs: files.get(p).mtimeMs }
    },
    async unlink(p) {
      files.delete(p)
    }
  }
}

/**
 * A fake helper and AIMP, as measured on AIMP 4.60: "open" on an audio file replaces the playing
 * list with that file and plays it (AIMP's "Add to empty playlist 'Default'"); /INSERT of a
 * playlist appends its tracks. `lag` state reads pass before an open takes effect, the first of
 * them reading "stopped" as AIMP does while it switches files.
 */
function fakeAimp(fs, { playing = null, state = 'playing', positionMs = 0, lag = 0 } = {}) {
  const calls = []
  const s = { file: playing, state, positionMs, list: playing ? [playing] : [] }
  let pending = null
  const call = async (cmd, args = {}) => {
    calls.push({ cmd, args })
    if (cmd === 'state') {
      if (pending && pending.reads-- <= 0) {
        Object.assign(s, { file: pending.path, state: 'playing', positionMs: 0, list: [pending.path] })
        pending = null
      }
      const shown = pending && pending.reads === lag - 1 ? { ...s, state: 'stopped' } : s
      return shown.file ? { running: true, state: shown.state, positionMs: shown.positionMs, track: { active: true, fileName: shown.file } } : { running: true, state: 'stopped', track: { active: false } }
    }
    if (cmd === 'openFile') {
      pending = { path: args.path, reads: lag }
      return 'store'
    }
    if (cmd === 'insertFile') {
      s.list.push(...fs.files.get(args.path).text.split('\n').filter((l) => l && !l.startsWith('#')))
      return 'store'
    }
    if (cmd === 'seek') s.positionMs = args.positionMs
    if (cmd === 'pause') s.state = s.state === 'paused' ? 'playing' : 'paused'
    return true
  }
  return { calls, call, s, cmds: (all = false) => calls.map((c) => c.cmd).filter((c) => all || c !== 'state') }
}

function setup(opts = {}) {
  const fs = fakeFs()
  const aimp = fakeAimp(fs, opts)
  let clock = 5000
  const playback = createPlayback({
    call: aimp.call,
    resolveTracks: async (ids) => (opts.tracks ?? ALL).filter((t) => ids.includes(t.id)),
    albumTracks: async (id) => ALL.filter((t) => t.albumId === id),
    dir: DIR,
    fs,
    now: () => (clock += 10),
    sleep: async (ms) => {
      clock += ms
    },
    random: () => 'r'
  })
  return { fs, aimp, playback }
}

test('playback arguments are checked before anything is written', () => {
  const invalid = (name, input) => assert.throws(() => playbackArgs(name, input), (e) => e.code === 'invalid', JSON.stringify(input))
  invalid('playAlbum', {})
  invalid('playAlbum', { albumId: '' })
  invalid('playAlbum', { albumId: 7 })
  invalid('playAlbum', { albumId: 'a1', trackId: 3 })
  invalid('playAlbum', { albumId: 'x'.repeat(201) })
  invalid('playAlbum', null)
  assert.deepEqual(playbackArgs('playAlbum', { albumId: 'a1' }), { albumId: 'a1', trackId: null })
  assert.deepEqual(playbackArgs('playAlbum', { albumId: 'a1', trackId: null }), { albumId: 'a1', trackId: null })
  invalid('playTracks', { trackIds: [] })
  invalid('playTracks', { trackIds: 't1' })
  invalid('playTracks', { trackIds: ['t1', 2] })
  invalid('playTracks', { trackIds: Array(MAX_TRACKS + 1).fill('t1') })
  invalid('playTracks', { trackIds: ['t1'], startIndex: 1 })
  invalid('playTracks', { trackIds: ['t1'], startIndex: -1 })
  invalid('playTracks', { trackIds: ['t1', 't2'], startIndex: 0.5 })
  assert.deepEqual(playbackArgs('playTracks', { trackIds: ['t1', 't2'] }), { trackIds: ['t1', 't2'], startIndex: 0 })
  invalid('enqueue', { trackIds: ['t1'] })
  invalid('enqueue', { trackIds: ['t1'], mode: 'first' })
  assert.deepEqual(playbackArgs('enqueue', { trackIds: ['t1'], mode: 'end' }), { trackIds: ['t1'], mode: 'end' })
  invalid('shuffle', {})
})

test('the playlist is extended M3U with one absolute path per line, LF, no BOM', () => {
  const text = playlistText(paths('t1', 'r2'))
  assert.equal(text, `#EXTM3U\n${paths('t1')[0]}\n${paths('r2')[0]}\n`)
  assert.equal(text.charCodeAt(0), 0x23)
})

test('playlist files live in LOCALAPPDATA\\B-Side\\queue', () => {
  assert.equal(queueDir({ LOCALAPPDATA: 'C:\\L' }), join('C:\\L', 'B-Side', 'queue'))
})

test('playAlbum plays the album in disc and track order from the chosen track', async () => {
  const { aimp, playback } = setup()
  assert.deepEqual(await playback.playAlbum({ albumId: 'a1', trackId: 't2' }), { ok: true })
  assert.deepEqual(aimp.s.list, paths('t2', 't3', 't5'))
  assert.equal(aimp.s.file, paths('t2')[0])
  assert.deepEqual(aimp.cmds(), ['openFile', 'insertFile'])
  await playback.playAlbum({ albumId: 'a1' })
  assert.deepEqual(aimp.s.list, paths('t1', 't2', 't3', 't5')) // 01 ずっと前, as is
})

test('the rest of the queue is appended only once AIMP plays the first track', async () => {
  const { aimp, playback } = setup({ playing: ELSEWHERE, lag: 5 })
  await playback.playTracks({ trackIds: ['t1', 't2'] })
  // Appended earlier, it would have gone to the playlist that was playing before.
  assert.deepEqual(aimp.s.list, paths('t1', 't2'))
  const all = aimp.cmds(true)
  assert.ok(all.slice(all.indexOf('openFile'), all.indexOf('insertFile')).filter((c) => c === 'state').length > 5)
})

test('a one-track queue appends nothing', async () => {
  const { aimp, playback } = setup()
  await playback.playTracks({ trackIds: ['r2'] })
  assert.deepEqual(aimp.cmds(), ['openFile'])
})

test('playAlbum refuses an unknown album or a track from another album', async () => {
  const { aimp, playback } = setup()
  await assert.rejects(playback.playAlbum({ albumId: 'nope' }), (e) => e.code === 'invalid')
  await assert.rejects(playback.playAlbum({ albumId: 'a1', trackId: 'r1' }), (e) => e.code === 'invalid')
  assert.equal(aimp.calls.length, 0)
})

test('playTracks starts at startIndex, keeps the order asked and skips ids the library lost', async () => {
  const { aimp, playback } = setup()
  await playback.playTracks({ trackIds: ['r2', 'gone', 't1', 'r1'], startIndex: 1 })
  assert.deepEqual(aimp.s.list, paths('t1', 'r1'))
  await assert.rejects(playback.playTracks({ trackIds: ['gone'] }), (e) => e.code === 'invalid')
})

test('playing the track already playing waits for AIMP to restart it', async () => {
  const { aimp, playback } = setup({ playing: paths('t1')[0], positionMs: 90000, lag: 4 })
  await playback.playTracks({ trackIds: ['t1', 't2'] })
  assert.deepEqual(aimp.s.list, paths('t1', 't2'))
  const all = aimp.cmds(true)
  assert.ok(all.slice(all.indexOf('openFile'), all.indexOf('insertFile')).filter((c) => c === 'state').length > 4)
})

test('AIMP never playing the opened track is a timeout, and nothing is appended', async () => {
  const { aimp, playback } = setup({ playing: ELSEWHERE, lag: Infinity })
  await assert.rejects(playback.playTracks({ trackIds: ['t1', 't2'] }), (e) => e.code === 'aimp_timeout')
  assert.equal(aimp.cmds().includes('insertFile'), false)
})

test('paths that could break a playlist line or the helper are never used', async () => {
  const tracks = [
    { id: 'q', path: 'C:\\a\\"x".flac' },
    { id: 'n', path: 'C:\\a\\x.flac\nC:\\evil.flac' },
    { id: 'r', path: 'music\\x.flac' },
    { id: 'ok', path: '\\\\nas\\music\\x.flac' },
    { id: 'ok2', path: 'D:\\m\\y.flac' }
  ]
  const { aimp, playback } = setup({ tracks })
  await playback.playTracks({ trackIds: ['q', 'n', 'r', 'ok', 'ok2'] })
  assert.deepEqual(aimp.s.list, ['\\\\nas\\music\\x.flac', 'D:\\m\\y.flac'])
})

test('a playlist file is written aside and renamed, retrying while Windows reports it busy', async () => {
  const { fs, aimp, playback } = setup()
  fs.busy = 2
  await playback.playTracks({ trackIds: ['t1', 't2'] })
  assert.deepEqual(aimp.s.list, paths('t1', 't2'))
  assert.deepEqual([...fs.files.keys()].filter((k) => k.endsWith('.tmp')), [])
  fs.busy = 9
  await assert.rejects(playback.playTracks({ trackIds: ['t2', 't3'] }), (e) => e.code === 'aimp_error')
  assert.deepEqual([...fs.files.keys()].filter((k) => k.endsWith('.tmp')), [])
})

test('enqueue with nothing playing plays the tracks', async () => {
  const { aimp, playback } = setup()
  await playback.enqueue({ trackIds: ['r1', 'r2'], mode: 'end' })
  assert.deepEqual(aimp.s.list, paths('r1', 'r2'))
  assert.equal(aimp.s.file, paths('r1')[0])
})

test('enqueue end appends a playlist of the tracks with /INSERT', async () => {
  const { aimp, playback } = setup()
  await playback.playAlbum({ albumId: 'a1' })
  aimp.calls.length = 0
  await playback.enqueue({ trackIds: ['r1', 'r2'], mode: 'end' })
  const insert = aimp.calls.at(-1)
  assert.equal(insert.cmd, 'insertFile')
  assert.match(basename(insert.args.path), /^B-Side-\d+-r\.m3u8$/)
  assert.equal(dirname(insert.args.path), DIR)
  assert.deepEqual(aimp.s.list, paths('t1', 't2', 't3', 't5', 'r1', 'r2'))
  // B-Side's queue follows: "next" while the last appended track plays lands after it.
  aimp.s.file = paths('r2')[0]
  await playback.enqueue({ trackIds: ['t1'], mode: 'next' })
  assert.deepEqual(aimp.s.list, paths('r2', 't1'))
})

test('enqueue next rebuilds the queue after the playing track and returns to its position', async () => {
  const { aimp, playback } = setup()
  await playback.playAlbum({ albumId: 'a1' })
  Object.assign(aimp.s, { file: paths('t2')[0], positionMs: 61000 }) // playing 02 Baby Blue
  aimp.calls.length = 0
  await playback.enqueue({ trackIds: ['r1'], mode: 'next' })
  assert.deepEqual(aimp.s.list, paths('t2', 'r1', 't3', 't5'))
  const seek = aimp.calls.find((c) => c.cmd === 'seek')
  assert.ok(seek.args.positionMs >= 61000 && seek.args.positionMs < 63000, `seek ${seek.args.positionMs}`)
  assert.equal(aimp.s.state, 'playing')
})

test('enqueue next while paused stays paused', async () => {
  const { aimp, playback } = setup()
  await playback.playAlbum({ albumId: 'a1' })
  Object.assign(aimp.s, { state: 'paused', positionMs: 5000 })
  await playback.enqueue({ trackIds: ['r1'], mode: 'next' })
  assert.equal(aimp.s.state, 'paused')
  assert.equal(aimp.s.positionMs > 5000, true)
})

test('enqueue while AIMP plays a playlist of its own appends to it, even for next', async () => {
  const { aimp, playback } = setup({ playing: ELSEWHERE })
  await playback.enqueue({ trackIds: ['r1'], mode: 'next' })
  assert.deepEqual(aimp.cmds(), ['insertFile'])
  assert.deepEqual(aimp.s.list, [ELSEWHERE, ...paths('r1')])
})

test('a moment of "stopped" between files is not taken for nothing playing', async () => {
  const { fs, aimp } = setup({ playing: ELSEWHERE })
  let first = true
  const flaky = async (cmd, args) => {
    if (cmd === 'state' && first) {
      first = false
      return { running: true, state: 'stopped', positionMs: 0, track: { active: true, fileName: ELSEWHERE } }
    }
    return aimp.call(cmd, args)
  }
  const playback = createPlayback({ call: flaky, resolveTracks: async (ids) => ALL.filter((t) => ids.includes(t.id)), albumTracks: async () => [], dir: DIR, fs, sleep: async () => {}, random: () => 'r' })
  await playback.enqueue({ trackIds: ['r1'], mode: 'end' })
  assert.deepEqual(aimp.cmds(), ['insertFile'])
  assert.deepEqual(aimp.s.list, [ELSEWHERE, ...paths('r1')])
})

test('old playlist files are removed once AIMP has had time to read them', async () => {
  const { fs, playback } = setup({ playing: ELSEWHERE })
  fs.files.set(join(DIR, 'B-Side-1-old.m3u8'), { text: '#EXTM3U\n', mtimeMs: -10 * 60 * 1000 })
  fs.files.set(join(DIR, 'notes.txt'), { text: '', mtimeMs: -10 * 60 * 1000 })
  await playback.enqueue({ trackIds: ['r1'], mode: 'end' })
  assert.equal(fs.files.has(join(DIR, 'B-Side-1-old.m3u8')), false)
  assert.equal(fs.files.has(join(DIR, 'notes.txt')), true)
  assert.equal([...fs.files.keys()].filter((k) => basename(k).startsWith('B-Side-')).length, 1)
})

test('requests run one at a time', async () => {
  const { aimp, playback } = setup({ lag: 3 })
  await Promise.all([playback.playTracks({ trackIds: ['t1', 't2'] }), playback.playTracks({ trackIds: ['r1', 'r2'] })])
  assert.deepEqual(aimp.cmds(), ['openFile', 'insertFile', 'openFile', 'insertFile'])
  assert.deepEqual(aimp.s.list, paths('r1', 'r2'))
})

const emptyLibrary = () => ({ handlers: {}, idsForPath: () => ({ trackId: null, albumId: null }), trackPaths: () => [], albumTrackIds: () => null, ensureLoaded: async () => {} })

test('the worker registers the playback handlers; tracks the library does not know are refused', async () => {
  const handlers = createHandlers({ aimp: { request: async () => ({ running: false }) }, online: { get: () => ({ online: true }) }, library: emptyLibrary() })
  for (const name of ['player.playAlbum', 'player.playTracks', 'player.enqueue']) assert.equal(typeof handlers[name], 'function', name)
  await assert.rejects(handlers['player.playAlbum']({ albumId: 'a1' }), (e) => e.code === 'invalid')
  await assert.rejects(handlers['player.enqueue']({ trackIds: ['t1'], mode: 'end' }), (e) => e.code === 'invalid')
  await assert.rejects(handlers['player.playTracks']({}), (e) => e.code === 'invalid')
})

test('the worker hands the paths of the library to the helper', async () => {
  const fs = fakeFs()
  const aimp = fakeAimp(fs)
  const handlers = createHandlers({
    aimp: { request: (cmd, args) => aimp.call(cmd, args) },
    online: { get: () => ({ online: true }) },
    // As W7's library answers: ids in order, unknown ids left out; an album's ids in play order.
    library: {
      ...emptyLibrary(),
      trackPaths: (ids) => ids.filter((id) => ALL.some((t) => t.id === id)).map((id) => ({ id, path: ALL.find((t) => t.id === id).path, cloudOnly: false })),
      albumTrackIds: (albumId) => (albumId === 'a1' ? ['t1', 't2', 't3', 't5'] : null)
    },
    playback: { dir: DIR, fs, sleep: async () => {} }
  })
  assert.deepEqual(await handlers['player.playTracks']({ trackIds: ['t1', 'gone', 'r2'] }), { ok: true })
  assert.deepEqual(aimp.calls.find((c) => c.cmd === 'openFile').args, { path: paths('t1')[0] })
  assert.deepEqual(aimp.s.list, paths('t1', 'r2'))
  await handlers['player.playAlbum']({ albumId: 'a1', trackId: 't3' })
  assert.deepEqual(aimp.s.list, paths('t3', 't5'))
  await assert.rejects(handlers['player.playAlbum']({ albumId: 'nope' }), (e) => e.code === 'invalid')
})
