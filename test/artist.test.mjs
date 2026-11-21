import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { findArtistImage, imageType, MAX_IMAGE_BYTES, sameArtist } from '../src/artist.mjs'
import { createHandlers } from '../src/player.mjs'

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)])
const PNG = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(60, 2)])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(60, 3)])
const url = (type, bytes) => `data:${type};base64,${bytes.toString('base64')}`

const ROOT = fileURLToPath(new URL('../scratch/', import.meta.url))
let dir
before(async () => {
  await mkdir(ROOT, { recursive: true })
  dir = await mkdtemp(join(ROOT, 'test-artist-'))
})
after(() => rm(dir, { recursive: true, force: true }))

/** Writes files ({ 'A/B/c.flac': bytes }) under a fresh library folder; returns its path. */
async function library(name, files) {
  const base = join(dir, name)
  for (const [rel, bytes] of Object.entries(files)) {
    const p = join(base, rel)
    await mkdir(join(p, '..'), { recursive: true })
    await writeFile(p, bytes)
  }
  return base
}

test('magic bytes: JPEG, PNG, WEBP; anything else is not an image', () => {
  assert.equal(imageType(JPEG), 'image/jpeg')
  assert.equal(imageType(PNG), 'image/png')
  assert.equal(imageType(WEBP), 'image/webp')
  assert.equal(imageType(Buffer.from('GIF89a......')), null)
  assert.equal(imageType(Buffer.alloc(0)), null)
})

test('artist folder names match the artist tag loosely', () => {
  assert.ok(sameArtist('AC-DC', 'AC/DC'))
  assert.ok(sameArtist('Beatles', 'The Beatles'))
  assert.ok(sameArtist('Björk', 'bjork'))
  assert.ok(sameArtist('Artist', 'Artist feat. Guest'))
  assert.ok(!sameArtist('Music', 'Artist'))
  assert.ok(!sameArtist('', 'Artist'))
})

test('artist.* in the artist folder comes first (case-insensitive, jpg before png)', async () => {
  const lib = await library('lib1', { 'Artist/ARTIST.PNG': PNG, 'Artist/artist.jpg': JPEG, 'Artist/Album/artist.webp': WEBP, 'Artist/Album/01.flac': Buffer.alloc(8) })
  assert.equal(await findArtistImage(join(lib, 'Artist/Album/01.flac')), url('image/jpeg', JPEG))
})

test('folder.jpg in the artist folder only when it looks like that artist', async () => {
  const lib = await library('lib2', { 'Artist/folder.png': PNG, 'Artist/Album/01.flac': Buffer.alloc(8) })
  const song = join(lib, 'Artist/Album/01.flac')
  assert.equal(await findArtistImage(song, { artist: 'Artist' }), url('image/png', PNG))
  assert.equal(await findArtistImage(song, { artist: 'Someone Else' }), null)
  // A folder that holds audio itself is an album folder: its folder.jpg is an album cover.
  const flat = await library('lib3', { 'Artist/folder.jpg': JPEG, 'Artist/single.mp3': Buffer.alloc(8), 'Artist/Album/01.flac': Buffer.alloc(8) })
  assert.equal(await findArtistImage(join(flat, 'Artist/Album/01.flac'), { artist: 'Artist' }), null)
})

test('artist.* in the album folder is the last resort', async () => {
  const lib = await library('lib4', { 'Music/Album/Artist.webp': WEBP, 'Music/Album/01.flac': Buffer.alloc(8), 'Music/folder.jpg': JPEG })
  assert.equal(await findArtistImage(join(lib, 'Music/Album/01.flac'), { artist: 'Someone' }), url('image/webp', WEBP))
})

test('too big or not an image: the next candidate, else null', async () => {
  const big = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES)])
  const lib = await library('lib5', { 'Artist/artist.jpg': big, 'Artist/artist.png': Buffer.from('this is text, not a png'), 'Artist/Album/artist.png': PNG, 'Artist/Album/01.flac': Buffer.alloc(8) })
  assert.equal(await findArtistImage(join(lib, 'Artist/Album/01.flac')), url('image/png', PNG))
  const none = await library('lib6', { 'Artist/artist.jpg': big, 'Artist/Album/01.flac': Buffer.alloc(8) })
  assert.equal(await findArtistImage(join(none, 'Artist/Album/01.flac')), null)
})

test('streams and missing folders give null', async () => {
  assert.equal(await findArtistImage('cloud://onedrive/Music/Artist/Album/01.flac'), null)
  assert.equal(await findArtistImage(join(dir, 'nowhere/Album/01.flac')), null)
  assert.equal(await findArtistImage('relative/01.flac'), null)
})

// ------------------------------------------------------------ handlers

const state = (fileName, artist = 'Artist') => ({ running: true, state: 'playing', positionMs: 0, durationMs: 1000, track: { active: true, fileName, title: 'T', album: 'A', artist } })
function fakeAimp(raw) {
  const aimp = { raw, request: async (cmd) => (cmd === 'state' ? aimp.raw : null), close() {} }
  return aimp
}

test('lyrics and artist handlers read the path from AIMP, never from the panel, and cache per track', async () => {
  const seen = []
  const aimp = fakeAimp(state('C:\\Music\\Artist\\Album\\01.flac'))
  const h = createHandlers({
    aimp,
    online: { get: () => ({ online: true }) },
    lyrics: async (f) => (seen.push(['lyrics', f]), { source: 'tag', synced: false, lines: [{ ms: null, text: 'la' }] }),
    artistImage: async (f, o) => (seen.push(['artist', f, o.artist]), 'data:image/png;base64,AA==')
  })
  const key = 'C:\\Music\\Artist\\Album\\01.flac|T|A'
  assert.deepEqual(await h['player.lyrics']({ key: 'D:\\evil.flac', fileName: 'D:\\evil.flac' }), { key, source: 'tag', synced: false, lines: [{ ms: null, text: 'la' }] })
  await h['player.lyrics']({ key })
  assert.deepEqual(await h['player.artist']({ key }), { key, dataUrl: 'data:image/png;base64,AA==' })
  await h['player.artist']({ key })
  assert.deepEqual(seen, [
    ['lyrics', 'C:\\Music\\Artist\\Album\\01.flac'],
    ['artist', 'C:\\Music\\Artist\\Album\\01.flac', 'Artist']
  ])
})

test('handlers: a cloud track, nothing playing, and a reader that throws', async () => {
  const aimp = fakeAimp(state('cloud://onedrive/x.flac'))
  const h = createHandlers({ aimp, online: { get: () => ({ online: true }) } })
  const r = await h['player.lyrics']()
  assert.equal(r.reason, 'cloud')
  assert.deepEqual(r.lines, [])
  assert.equal((await h['player.artist']()).dataUrl, null)
  aimp.raw = { running: true, state: 'stopped', track: { active: false } }
  assert.deepEqual(await h['player.lyrics'](), { key: null, source: null, synced: false, lines: [], reason: 'none' })
  assert.deepEqual(await h['player.artist'](), { key: null, dataUrl: null })
  aimp.raw = state('C:\\x.flac')
  let calls = 0
  const broken = createHandlers({ aimp, online: { get: () => ({ online: true }) }, lyrics: async () => (calls++, Promise.reject(new Error('disk'))), artistImage: async () => Promise.reject(new Error('disk')) })
  assert.equal((await broken['player.lyrics']()).reason, 'unreadable')
  await broken['player.lyrics']()
  assert.equal(calls, 2, 'an unreadable answer is not cached')
  assert.equal((await broken['player.artist']()).dataUrl, null)
})
