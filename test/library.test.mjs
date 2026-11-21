// Library index: cloud-only rule, folders, model fallbacks, search (with a timing budget), the
// library.* handlers over a fake helper, the on-disk cache and player.state's library ids.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createLibrary } from '../src/library/index.mjs'
import { buildModel, parseFileName, VARIOUS } from '../src/library/model.mjs'
import { folderName, isCloudOnly, listFolder, parseFolders } from '../src/library/scan.mjs'
import { createSearchIndex, fold } from '../src/library/search.mjs'
import { createHandlers } from '../src/player.mjs'

const SCRATCH = fileURLToPath(new URL('../scratch/', import.meta.url))
const dirs = []
async function tempDir() {
  const { mkdir } = await import('node:fs/promises')
  await mkdir(SCRATCH, { recursive: true })
  const d = await mkdtemp(join(SCRATCH, 'tmp-lib-'))
  dirs.push(d)
  return d
}
after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true })
})

const LOCAL = 0x20 | 0x400 // archive + cloud placeholder reparse point, data on disk (OneDrive "available")
const ROOT = 'C:\\Music'
const file = (rel, kind, attrs = LOCAL, extra = {}) => ({ path: `${ROOT}\\${rel}`, size: 1000, mtime: 1700000000000, attrs, kind, root: ROOT, ...extra })

// ---------------------------------------------------------------- scan

test('cloud-only: RECALL_ON_DATA_ACCESS, RECALL_ON_OPEN and OFFLINE, nothing else', () => {
  assert.equal(isCloudOnly(0x00400000), true)
  assert.equal(isCloudOnly(0x00040000), true)
  assert.equal(isCloudOnly(0x00001000), true)
  assert.equal(isCloudOnly(0x00400000 | 0x400 | 0x20), true)
  assert.equal(isCloudOnly(0x420), false) // a OneDrive file kept on this PC
  assert.equal(isCloudOnly(0x80000 | 0x20), false) // pinned
  assert.equal(isCloudOnly(0), false)
})

test('libraryFolders: one absolute folder per line, quotes and duplicates dropped; names only for the panel', () => {
  assert.deepEqual(parseFolders('  C:\\Music\\  \r\n"D:\\Hi-Fi"\nrelative\\x\n\nc:\\music\n\\\\nas\\share\\FLAC'), ['C:\\Music', 'D:\\Hi-Fi', '\\\\nas\\share\\FLAC'])
  assert.deepEqual(parseFolders(''), [])
  assert.equal(folderName('C:\\Users\\me\\OneDrive\\Música\\Hi-Fi Collection'), 'Hi-Fi Collection')
  assert.equal(folderName('D:\\'), 'D')
})

test('listFolder follows the helper chunks and reports a missing folder', async () => {
  const calls = []
  const helper = {
    async request(cmd, args) {
      calls.push(args)
      if (args.root === 'X:\\gone') return { missing: true, done: true, entries: [] }
      if (!args.token) return { token: '7', done: false, entries: [{ path: 'C:\\M\\a.flac', size: 1, mtime: 2, attrs: 32, kind: 'audio' }] }
      return { token: '7', done: true, entries: [{ path: 'C:\\M\\b.lrc', size: 1, mtime: 2, attrs: 32, kind: 'lyrics' }, { path: 'C:\\M\\x', kind: 'other' }] }
    }
  }
  const r = await listFolder(helper, 'C:\\M')
  assert.deepEqual(
    r.entries.map((e) => e.path),
    ['C:\\M\\a.flac', 'C:\\M\\b.lrc']
  )
  assert.deepEqual(calls, [{ root: 'C:\\M' }, { token: '7' }])
  assert.equal((await listFolder(helper, 'X:\\gone')).missing, true)
})

// ---------------------------------------------------------------- model

test('file names: leading track numbers in their usual forms', () => {
  assert.deepEqual(parseFileName('01 Song.flac'), { disc: null, number: 1, title: 'Song' })
  assert.deepEqual(parseFileName('01 - Song.flac'), { disc: null, number: 1, title: 'Song' })
  assert.deepEqual(parseFileName('01. Song.mp3'), { disc: null, number: 1, title: 'Song' })
  assert.deepEqual(parseFileName('1-01 Song.flac'), { disc: 1, number: 1, title: 'Song' })
  assert.deepEqual(parseFileName('Song.flac'), { disc: null, number: null, title: 'Song' })
  assert.deepEqual(parseFileName('1999.flac'), { disc: null, number: null, title: '1999' })
})

test('model: names from folders when tags are missing, album artist = ALBUMARTIST || folder || ARTIST', () => {
  const m = buildModel([
    file('Fishmans\\空中キャンプ\\02 ずっと前.flac', 'audio'),
    file('Fishmans\\空中キャンプ\\01 BABY BLUE.flac', 'audio'),
    file('Fishmans\\空中キャンプ\\01 BABY BLUE.lrc', 'lyrics'),
    file('Fishmans\\空中キャンプ\\Cover.JPG', 'image'),
    file('Rosalía\\MOTOMAMI\\01 SAOKO.flac', 'audio', LOCAL, { tags: { title: 'SAOKO', artist: 'ROSALÍA', albumArtist: 'ROSALÍA', album: 'MOTOMAMI', number: 1, year: 2022, genres: ['Pop'], codec: 'FLAC', lossless: true, sampleRate: 48000, bits: 24, durationMs: 137000 } }),
    file('Rosalía\\MOTOMAMI\\02 CANDY.flac', 'audio', LOCAL, { tags: { title: 'CANDY', artist: 'ROSALÍA', album: 'MOTOMAMI', number: 2, year: 2022, genres: ['Latin'], codec: 'FLAC', lossless: true, sampleRate: 44100, bits: 16, durationMs: 193000 } })
  ])
  assert.equal(m.counts.tracks, 4)
  assert.deepEqual(
    m.artists.map((a) => a.name),
    ['Fishmans', 'ROSALÍA']
  )
  const fish = m.albums.find((a) => a.title === '空中キャンプ')
  assert.equal(fish.artist, 'Fishmans')
  assert.ok(fish.cover, 'Cover.JPG is found case-insensitively')
  const tracks = m.albumTracks.get(fish.id).map((id) => m.trackById.get(id))
  assert.deepEqual(
    tracks.map((t) => [t.number, t.title, t.lyrics]),
    [
      [1, 'BABY BLUE', true],
      [2, 'ずっと前', false]
    ]
  )
  const moto = m.albums.find((a) => a.title === 'MOTOMAMI')
  assert.equal(moto.artist, 'ROSALÍA') // a track without ALBUMARTIST stays on the album
  assert.equal(moto.tracks, 2)
  assert.equal(moto.durationMs, 330000)
  assert.deepEqual(moto.quality, { codec: 'FLAC', sampleRate: 48000, bits: 24, lossless: true })
  assert.deepEqual(moto.genres, ['Pop', 'Latin'])
  assert.deepEqual(
    m.genres.map((g) => [g.name, g.albums]),
    [
      ['Latin', 1],
      ['Pop', 1]
    ]
  )
})

test('model: compilations, disc folders, accent-insensitive artists, embedded and cloud-only covers', () => {
  const tags = (title, artist, extra = {}) => ({ tags: { title, artist, album: 'Hits', codec: 'MP3', lossless: false, ...extra } })
  const m = buildModel([
    // Compilation in Root/Album/: different ARTIST tags, no ALBUMARTIST, no artist folder.
    file('Hits\\01 a.mp3', 'audio', LOCAL, tags('A', 'One')),
    file('Hits\\02 b.mp3', 'audio', LOCAL, tags('B', 'Two', { picture: { offset: 10, length: 20, mime: 'image/jpeg' } })),
    // Disc folders belong to one album.
    file('Muse\\Live\\CD1\\01 x.flac', 'audio'),
    file('Muse\\Live\\CD2\\01 y.flac', 'audio'),
    file('Muse\\Live\\folder.jpg', 'image', 0x00400000 | LOCAL), // cloud-only: not a cover
    // Same artist spelled with and without accent.
    file('Rosalía\\A\\01 s.flac', 'audio'),
    file('Rosalia\\B\\01 t.flac', 'audio'),
    file('Rosalía\\artist.jpg', 'image')
  ])
  const hits = m.albums.find((a) => a.title === 'Hits')
  assert.equal(hits.artist, VARIOUS)
  assert.ok(hits.cover, 'embedded picture of a local track')
  assert.equal(m.images.get(hits.cover).type, 'embedded')
  const live = m.albums.find((a) => a.title === 'Live')
  assert.equal(live.tracks, 2)
  assert.deepEqual(
    m.albumTracks.get(live.id).map((id) => m.trackById.get(id).disc),
    [1, 2]
  )
  assert.equal(live.cover, null, 'a cloud-only folder.jpg is never a cover')
  const ros = m.artists.filter((a) => fold(a.name).startsWith('rosalia'))
  assert.equal(ros.length, 1)
  assert.equal(ros[0].albums, 2)
  assert.ok(ros[0].image)
})

test('model: a cloud-only track is indexed from names only and flagged', () => {
  const m = buildModel([file('Bad Bunny\\DeBÍ TiRAR MáS FOToS\\01 NUEVAYoL.flac', 'audio', 0x00400000 | LOCAL)])
  const t = m.tracks[0]
  assert.deepEqual([t.title, t.artist, t.number, t.cloudOnly, t.durationMs], ['NUEVAYoL', 'Bad Bunny', 1, true, null])
  assert.equal(m.albums[0].cloudOnly, true)
  assert.equal(m.counts.cloudOnly, 1)
})

// ---------------------------------------------------------------- search

test('search: accents and case ignored, word prefixes, other scripts anywhere, ranked', () => {
  const idx = createSearchIndex({
    artists: [
      { id: 'r', name: 'ROSALÍA' },
      { id: 't', name: 'Tame Impala' },
      { id: 'f', name: 'Fishmans' }
    ],
    albums: [
      { id: 'c', title: '空中キャンプ', artist: 'Fishmans' },
      { id: 'm', title: 'MOTOMAMI', artist: 'ROSALÍA' }
    ],
    tracks: [
      { id: 'n', title: 'NUEVAYoL', artist: 'Bad Bunny', album: 'DeBÍ TiRAR MáS FOToS' },
      { id: 'x', title: 'Estame', artist: 'X', album: 'Y' },
      { id: 's', title: 'Saoko', artist: 'ROSALÍA', album: 'MOTOMAMI' }
    ]
  })
  assert.deepEqual(idx.search('rosalia').artists, ['r'])
  assert.deepEqual(idx.search('RoSaLíA').albums, ['m'])
  assert.deepEqual(idx.search('tame').artists, ['t'])
  assert.deepEqual(idx.search('tame').tracks, [], '"tame" is not a word start of "Estame"')
  assert.deepEqual(idx.search('空中').albums, ['c'])
  assert.deepEqual(idx.search('キャンプ').albums, ['c'])
  assert.deepEqual(idx.search('nuevayol').tracks, ['n'])
  assert.deepEqual(idx.search('debi tirar').tracks, ['n'])
  assert.deepEqual(idx.search('saoko rosa').tracks, ['s'])
  assert.deepEqual(idx.search('   ').tracks, [])
  assert.equal(fold('Ｆｕｌｌ Øyvind Straße'), 'full oyvind strasse')
})

test('search answers in under 50 ms on 10 000 tracks', () => {
  const words = ['love', 'night', 'dream', 'café', 'sombra', 'luz', 'river', 'star', '夜', '空', 'город', 'heart']
  const pick = (i, k) => words[(i * 7 + k * 13) % words.length]
  const artists = Array.from({ length: 400 }, (_, i) => ({ id: `a${i}`, name: `${pick(i, 1)} Artist ${i}` }))
  const albums = Array.from({ length: 1000 }, (_, i) => ({ id: `l${i}`, title: `${pick(i, 2)} ${pick(i, 3)} ${i}`, artist: artists[i % 400].name }))
  const tracks = Array.from({ length: 10000 }, (_, i) => ({ id: `t${i}`, title: `${pick(i, 4)} ${pick(i, 5)} ${pick(i, 6)}`, artist: artists[i % 400].name, album: albums[i % 1000].title }))
  const idx = createSearchIndex({ artists, albums, tracks })
  const times = []
  for (const q of ['l', 'lo', 'love night', 'cafe', 'artist 12', '空', 'город', 'zzz', 'e', 'star river dream']) {
    const t = performance.now()
    const r = idx.search(q, 20)
    times.push(performance.now() - t)
    assert.ok(r.tracks.length <= 20)
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  assert.ok(median < 50, `median ${median.toFixed(1)} ms`)
  assert.ok(times.at(-1) < 250, `worst ${times.at(-1).toFixed(1)} ms`)
})

// ---------------------------------------------------------------- handlers

/** A fake helper over a list of scan entries; records every call. */
function fakeHelper(entries, { music = 'C:\\Users\\me\\Music' } = {}) {
  const calls = []
  return {
    calls,
    async request(cmd, args = {}) {
      calls.push({ cmd, args })
      if (cmd === 'musicFolder') return music
      if (cmd === 'scan') {
        const root = args.root
        if (root && !entries.some((e) => e.path.startsWith(root + '\\'))) return { missing: true, done: true, entries: [] }
        if (root) return { token: root, done: false, entries: [] }
        return { token: args.token, done: true, entries: entries.filter((e) => e.path.startsWith(args.token + '\\')) }
      }
      if (cmd === 'thumb') return Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 1]).toString('base64')
      throw Object.assign(new Error(`unexpected ${cmd}`), { code: 'invalid' })
    }
  }
}

const ENTRIES = [
  { path: 'C:\\Lib\\Tame Impala\\Currents\\01 Let It Happen.flac', size: 10, mtime: 1, attrs: LOCAL, kind: 'audio' },
  { path: 'C:\\Lib\\Tame Impala\\Currents\\02 Nangs.flac', size: 10, mtime: 1, attrs: LOCAL, kind: 'audio' },
  { path: 'C:\\Lib\\Tame Impala\\Currents\\cover.jpg', size: 10, mtime: 1, attrs: LOCAL, kind: 'image' },
  { path: 'C:\\Lib\\Tame Impala\\Currents\\02 Nangs.lrc', size: 10, mtime: 1, attrs: LOCAL, kind: 'lyrics' },
  { path: 'C:\\Lib\\Bad Bunny\\DeBÍ TiRAR MáS FOToS\\01 NUEVAYoL.flac', size: 10, mtime: 1, attrs: 0x00400000 | LOCAL, kind: 'audio' },
  { path: 'C:\\Lib\\Bad Bunny\\DeBÍ TiRAR MáS FOToS\\cover.jpg', size: 10, mtime: 1, attrs: 0x00400000 | LOCAL, kind: 'image' }
]

function fakeTags(seen) {
  return async (path) => {
    seen.push(path)
    const n = /\\(\d+) ([^\\]+)\.flac$/.exec(path)
    return { title: n[2], artist: 'Tame Impala', album: 'Currents', number: Number(n[1]), year: 2015, genres: ['Psychedelic Rock'], codec: 'FLAC', lossless: true, sampleRate: 44100, bits: 24, durationMs: 1000 }
  }
}

test('library handlers: scan in the background, cloud-only never read, names and ids only', async () => {
  const cacheDir = await tempDir()
  const helper = fakeHelper(ENTRIES)
  const read = []
  const settings = { get: async (k) => (k === 'libraryFolders' ? 'C:\\Lib\nC:\\Gone' : undefined) }
  const lib = createLibrary({ helper, settings, cacheDir, readTags: fakeTags(read) })
  const h = lib.handlers
  const first = await h['library.status']()
  assert.equal(first.state, 'scanning')
  await lib.idle()
  const status = await h['library.status']()
  assert.equal(status.state, 'ready')
  assert.deepEqual(status.folders, ['Lib', 'Gone'])
  assert.deepEqual(status.missingFolders, ['Gone'])
  assert.deepEqual(status.counts, { artists: 2, albums: 2, tracks: 3, cloudOnly: 1 })
  assert.equal(typeof status.scannedAt, 'number')
  assert.ok(!read.some((p) => p.includes('NUEVAYoL')), 'the cloud-only file is never opened')
  assert.equal(read.length, 2)

  const { artists } = await h['library.artists']()
  assert.deepEqual(
    artists.map((a) => [a.name, a.albums, a.tracks]),
    [
      ['Bad Bunny', 1, 1],
      ['Tame Impala', 1, 2]
    ]
  )
  const { albums } = await h['library.albums']()
  const currents = albums.find((a) => a.title === 'Currents')
  const bunny = albums.find((a) => a.artist === 'Bad Bunny')
  assert.equal(bunny.cover, null, 'a cloud-only cover.jpg is not used')
  assert.equal(bunny.cloudOnly, true)
  const album = await h['library.album']({ id: currents.id })
  assert.deepEqual(
    album.tracks.map((t) => [t.number, t.title, t.lyrics, t.cloudOnly]),
    [
      [1, 'Let It Happen', false, false],
      [2, 'Nangs', true, false]
    ]
  )
  assert.deepEqual(Object.keys(album.tracks[0]).sort(), ['albumId', 'artist', 'cloudOnly', 'disc', 'durationMs', 'id', 'lyrics', 'number', 'title'])
  const artist = await h['library.artist']({ id: currents.artistId })
  assert.equal(artist.artist.name, 'Tame Impala')
  assert.deepEqual(
    artist.albums.map((a) => a.id),
    [currents.id]
  )
  assert.deepEqual((await h['library.albums']({ genre: 'psychedelic rock' })).albums.length, 1)
  assert.deepEqual((await h['library.albums']({ artistId: currents.artistId })).albums.length, 1)
  assert.deepEqual(await h['library.genres'](), { genres: [{ name: 'Psychedelic Rock', albums: 1, tracks: 2 }] })
  const page = await h['library.tracks']({ offset: 1, limit: 1 })
  assert.equal(page.total, 3)
  assert.equal(page.tracks.length, 1)
  assert.equal(page.tracks[0].album, 'Currents')
  const found = await h['library.search']({ q: 'nuevayol' })
  assert.equal(found.tracks[0].title, 'NUEVAYoL')
  assert.equal(found.tracks[0].cloudOnly, true)

  // Images: the helper gets the path from the model; the panel only names the id.
  const img = await h['library.image']({ id: currents.cover, size: 'large' })
  assert.match(img.dataUrl, /^data:image\/jpeg;base64,/)
  const thumbCall = helper.calls.find((c) => c.cmd === 'thumb')
  assert.deepEqual(thumbCall.args, { path: 'C:\\Lib\\Tame Impala\\Currents\\cover.jpg', size: 800 })
  assert.deepEqual(await h['library.image']({ id: 'iNotAnImage', size: 'thumb' }), { id: 'iNotAnImage', dataUrl: null })
  const thumbs = helper.calls.filter((c) => c.cmd === 'thumb').length
  await h['library.image']({ id: currents.cover, size: 'large' })
  assert.equal(helper.calls.filter((c) => c.cmd === 'thumb').length, thumbs, 'second ask comes from the disk cache')

  // Privacy: no answer carries a path.
  const everything = JSON.stringify([status, artists, albums, album, artist, page, found, await h['library.tracks']({})])
  assert.ok(!/C:\\|Lib\\|\.flac|\.jpg/.test(everything), everything)

  // Bad input and unknown ids.
  await assert.rejects(h['library.album']({ id: 'lNope' }), (e) => e.code === 'not_found')
  await assert.rejects(h['library.album']({}), (e) => e.code === 'invalid')
  await assert.rejects(h['library.search']({ q: 5 }), (e) => e.code === 'invalid')
  await assert.rejects(h['library.image']({ id: currents.cover, size: 'huge' }), (e) => e.code === 'invalid')

  // Worker-side lookups for playback and player.state.
  assert.deepEqual(lib.idsForPath('C:\\LIB\\Tame Impala\\Currents\\02 Nangs.flac'), { trackId: album.tracks[1].id, albumId: currents.id })
  assert.deepEqual(lib.idsForPath('cloud://x/y'), { trackId: null, albumId: null })
  assert.deepEqual(lib.albumTrackIds(currents.id), [album.tracks[0].id, album.tracks[1].id])
  assert.deepEqual(
    lib.trackPaths([album.tracks[1].id, 'tUnknown']).map((t) => t.path),
    ['C:\\Lib\\Tame Impala\\Currents\\02 Nangs.flac']
  )
})

test('library cache: a new worker answers from disk at once and a rescan reads only changed files', async () => {
  const cacheDir = await tempDir()
  const settings = { get: async () => 'C:\\Lib' }
  const read1 = []
  const lib1 = createLibrary({ helper: fakeHelper(ENTRIES), settings, cacheDir, readTags: fakeTags(read1) })
  await lib1.handlers['library.status']()
  await lib1.idle()
  assert.equal(read1.length, 2)

  const changed = ENTRIES.map((e) => (e.path.endsWith('02 Nangs.flac') ? { ...e, mtime: 2 } : e))
  const helper2 = fakeHelper(changed)
  const read2 = []
  const lib2 = createLibrary({ helper: helper2, settings, cacheDir, readTags: fakeTags(read2) })
  const s = await lib2.handlers['library.status']()
  assert.equal(s.counts.tracks, 3, 'answers from the saved index')
  assert.equal(helper2.calls.filter((c) => c.cmd === 'scan').length, 0, 'fresh and same folders: no rescan')
  const r = await lib2.handlers['library.rescan']()
  assert.deepEqual(r, { started: true })
  assert.equal((await lib2.handlers['library.status']()).state, 'scanning')
  await lib2.idle()
  assert.deepEqual(read2, ['C:\\Lib\\Tame Impala\\Currents\\02 Nangs.flac'])

  // Another folder in the settings: rescanned on the next status.
  const lib3 = createLibrary({ helper: fakeHelper(ENTRIES), settings: { get: async () => 'C:\\Other' }, cacheDir, readTags: fakeTags([]) })
  assert.equal((await lib3.handlers['library.status']()).state, 'scanning')
  await lib3.idle()
  assert.equal((await lib3.handlers['library.status']()).state, 'empty')
})

test('library: no setting means the Music known folder; a failing helper is an error, not a crash', async () => {
  const cacheDir = await tempDir()
  const helper = fakeHelper([{ path: 'C:\\Users\\me\\Music\\A\\B\\01 x.mp3', size: 1, mtime: 1, attrs: 32, kind: 'audio' }])
  const lib = createLibrary({ helper, settings: { get: async () => '' }, cacheDir, readTags: async () => ({}) })
  await lib.handlers['library.status']()
  await lib.idle()
  const s = await lib.handlers['library.status']()
  assert.deepEqual(s.folders, ['Music'])
  assert.equal(s.counts.tracks, 1)

  const broken = { request: async () => Promise.reject(Object.assign(new Error('The AIMP helper stopped'), { code: 'helper_failed' })) }
  // The Music folder cannot be resolved while the helper is down: the saved index stays.
  const lib1 = createLibrary({ helper: broken, settings: { get: async () => '' }, cacheDir, readTags: async () => ({}), staleMs: 0 })
  const kept = await lib1.handlers['library.status']()
  await lib1.idle()
  assert.equal(kept.counts.tracks, 1)
  assert.deepEqual(kept.folders, ['Music'])
  await assert.rejects(lib1.handlers['library.rescan'](), (e) => e.code === 'helper_failed')
  const again = createLibrary({ helper, settings: { get: async () => '' }, cacheDir, readTags: async () => ({}) })
  assert.equal((await again.handlers['library.status']()).counts.tracks, 1)

  const lib2 = createLibrary({ helper: broken, settings: { get: async () => 'C:\\Lib' }, cacheDir: await tempDir(), readTags: async () => ({}) })
  await lib2.handlers['library.status']()
  await lib2.idle()
  const e = await lib2.handlers['library.status']()
  assert.equal(e.state, 'error')
  assert.match(e.error, /helper/)
})

test('player.state carries the library ids of the playing file', async () => {
  const aimp = {
    request: async () => ({
      running: true,
      state: 'playing',
      positionMs: 0,
      durationMs: 1,
      volume: 50,
      mute: false,
      repeat: false,
      shuffle: false,
      track: { active: true, fileName: 'C:\\Lib\\a.flac', title: 'A', artist: '', album: '', sampleRate: 44100, channels: 2 }
    })
  }
  const library = { handlers: {}, idsForPath: (f) => (f === 'C:\\Lib\\a.flac' ? { trackId: 'tA', albumId: 'lA' } : { trackId: null, albumId: null }) }
  const h = createHandlers({ aimp, library, online: { get: () => ({ online: true }) } })
  const s = await h['player.state']()
  assert.equal(s.track.trackId, 'tA')
  assert.equal(s.track.albumId, 'lA')
})

// ---------------------------------------------------------------- choosing folders

test('OneDrive roots come from the environment and the registry, once each', async () => {
  const { oneDriveRoots } = await import('../src/library/index.mjs')
  const roots = await oneDriveRoots({ OneDrive: 'C:\\Users\\me\\OneDrive', OneDriveConsumer: 'c:\\users\\me\\onedrive' }, async () => ['C:\\Users\\me\\OneDrive', 'D:\\Work OneDrive', 'relative'])
  assert.deepEqual(roots, ['c:\\users\\me\\onedrive', 'D:\\Work OneDrive'])
  assert.deepEqual(await oneDriveRoots({}, async () => { throw new Error('no reg') }), [])
})

test('suggestFolders lists the Music folder, OneDrive music and their big subfolders with counts', async () => {
  const root = await tempDir()
  const { mkdir } = await import('node:fs/promises')
  await mkdir(join(root, 'Música'))
  const music = join(root, 'Música')
  const entries = []
  for (let i = 0; i < 25; i++) entries.push({ path: `${music}\\Hi-Fi Collection\\A\\B\\${i}.flac`, size: 1, mtime: 1, attrs: LOCAL, kind: 'audio' })
  for (let i = 0; i < 3; i++) entries.push({ path: `${music}\\Small\\${i}.flac`, size: 1, mtime: 1, attrs: LOCAL, kind: 'audio' })
  const lib = createLibrary({ helper: fakeHelper(entries, { music: 'C:\\Users\\me\\Music' }), settings: { get: async () => '' }, oneDrive: async () => [root], cacheDir: await tempDir(), readTags: async () => ({}) })
  const { folders } = await lib.handlers['library.suggestFolders']()
  assert.deepEqual(folders.map((f) => [f.name, f.tracks, f.parent ?? null]), [['Música', 28, null], ['Hi-Fi Collection', 25, 'Música']])
})

test('setFolders checks each folder, saves the setting and starts a scan', async () => {
  const dir = await tempDir()
  const saved = {}
  const settings = { get: async (k) => saved[k] ?? '', set: async (k, v) => (saved[k] = v) }
  const lib = createLibrary({ helper: fakeHelper(ENTRIES), settings, cacheDir: await tempDir(), readTags: async () => ({}) })
  const h = lib.handlers
  await assert.rejects(h['library.setFolders']({ folders: 'C:\\Lib' }), { code: 'invalid' })
  await assert.rejects(h['library.setFolders']({ folders: ['relative\\path'] }), { code: 'invalid' })
  await assert.rejects(h['library.setFolders']({ folders: [join(dir, 'missing')] }), { code: 'not_found' })
  const r = await h['library.setFolders']({ folders: [dir] })
  assert.equal(r.started, true)
  assert.equal(saved.libraryFolders, dir)
  await assert.rejects(createLibrary({ helper: fakeHelper(ENTRIES), settings: { get: async () => '' }, cacheDir: await tempDir() }).handlers['library.setFolders']({ folders: [dir] }), { code: 'unavailable' })
})
