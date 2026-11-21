import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { decodeTextFile, deunsync, localPath, lyricsFromText, parseLrc, readLyrics } from '../src/lyrics.mjs'

// ------------------------------------------------------------ byte builders

const u32le = (n) => {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}
const u32be = (n) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}
const u24be = (n) => Buffer.from([(n >> 16) & 255, (n >> 8) & 255, n & 255])
const syncsafe = (n) => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127])

function vorbis(comments, vendor = 'test') {
  const parts = [u32le(vendor.length), Buffer.from(vendor), u32le(comments.length)]
  for (const c of comments) {
    const b = Buffer.from(c, 'utf8')
    parts.push(u32le(b.length), b)
  }
  return Buffer.concat(parts)
}
const block = (type, body, last = false) => Buffer.concat([Buffer.from([(last ? 0x80 : 0) | type]), u24be(body.length), body])

/** fLaC + STREAMINFO + the given blocks (last flag on the final one) + fake audio. */
function flac(blocks, audio = Buffer.alloc(64, 0xaa)) {
  const all = [[0, Buffer.alloc(34)], ...blocks]
  return Buffer.concat([Buffer.from('fLaC'), ...all.map(([t, b], i) => block(t, b, i === all.length - 1)), audio])
}

const id3Frame = (major, id, body, flags = 0) => Buffer.concat([Buffer.from(id), major === 4 ? syncsafe(body.length) : u32be(body.length), Buffer.from([0, flags]), body])
const id3 = (major, frames, flags = 0, pad = 32) => {
  const body = Buffer.concat([...frames, Buffer.alloc(pad)])
  return Buffer.concat([Buffer.from('ID3'), Buffer.from([major, 0, flags]), syncsafe(body.length), body])
}
const utf16bom = (s) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')])
const uslt = (enc, text, desc = '') => {
  const t = enc === 1 ? (s) => utf16bom(s) : enc === 3 ? (s) => Buffer.from(s, 'utf8') : (s) => Buffer.from(s, 'latin1')
  const z = Buffer.alloc(enc === 1 || enc === 2 ? 2 : 1)
  return Buffer.concat([Buffer.from([enc]), Buffer.from('eng'), t(desc), z, t(text)])
}
const sylt = (entries, format = 2) =>
  Buffer.concat([Buffer.from([3]), Buffer.from('eng'), Buffer.from([format, 1]), Buffer.from('desc\0'), ...entries.flatMap(([ms, text]) => [Buffer.from(text + '\0', 'utf8'), u32be(ms)])])
/** ID3 unsynchronisation: a 0x00 after every 0xFF. */
const unsync = (b) => {
  const out = []
  for (let i = 0; i < b.length; i++) {
    out.push(b[i])
    if (b[i] === 0xff) out.push(0)
  }
  return Buffer.from(out)
}

// ------------------------------------------------------------ temp folder in the worktree

const ROOT = fileURLToPath(new URL('../scratch/', import.meta.url))
let dir
before(async () => {
  await mkdir(ROOT, { recursive: true })
  dir = await mkdtemp(join(ROOT, 'test-lyrics-'))
})
after(() => rm(dir, { recursive: true, force: true }))
const file = async (name, bytes) => {
  const p = join(dir, name)
  await writeFile(p, bytes)
  return p
}

// ------------------------------------------------------------ LRC

test('LRC: stamps with 0-3 fraction digits, several per line, sorted, metadata dropped', () => {
  const lines = parseLrc('[ar:Someone]\n[ti:Song]\n[00:05]Five\n[00:01.5]One and a half\n[00:02.25][00:10.125]Twice\n[01:00.00]\n[length:03:00]')
  assert.deepEqual(lines, [
    { ms: 1500, text: 'One and a half' },
    { ms: 2250, text: 'Twice' },
    { ms: 5000, text: 'Five' },
    { ms: 10125, text: 'Twice' },
    { ms: 60000, text: '' }
  ])
})

test('LRC: offset shifts every stamp (positive = earlier), never below 0', () => {
  assert.deepEqual(parseLrc('[offset:+500]\n[00:01.00]a\n[00:00.20]b'), [
    { ms: 0, text: 'b' },
    { ms: 500, text: 'a' }
  ])
  assert.deepEqual(parseLrc('[offset:-250]\n[00:01.00]a'), [{ ms: 1250, text: 'a' }])
})

test('LRC: blank lines stay as breaks after their line; enhanced word stamps are stripped', () => {
  const lines = parseLrc('\n[00:01.00]<00:01.00>Hello <00:01.50>world\n\n\n[00:03.00]Next\nCredits line\n\n')
  assert.deepEqual(lines, [
    { ms: 1000, text: 'Hello world' },
    { ms: null, text: '' },
    { ms: 3000, text: 'Next' },
    { ms: null, text: 'Credits line' }
  ])
  assert.equal(parseLrc('just\nplain [00:01] text'), null)
  assert.equal(parseLrc('[Chorus]\nla la'), null)
})

test('lyrics text: LRC counts as synced, plain keeps its lines, empty is nothing', () => {
  assert.equal(lyricsFromText('[00:01.00]x').synced, true)
  assert.deepEqual(lyricsFromText('\uFEFFLine 1\r\n\r\nLine 2\n\n'), { synced: false, lines: [{ ms: null, text: 'Line 1' }, { ms: null, text: '' }, { ms: null, text: 'Line 2' }] })
  assert.equal(lyricsFromText('  \n '), null)
  assert.equal(lyricsFromText('[ar:x]\n[00:01.00]'), null) // stamps but no words
})

test('text files: UTF-8 with or without BOM, UTF-16 LE and BE with BOM', () => {
  assert.equal(decodeTextFile(Buffer.from('\uFEFFñandú', 'utf8')), 'ñandú')
  assert.equal(decodeTextFile(Buffer.from('ñandú', 'utf8')), 'ñandú')
  assert.equal(decodeTextFile(utf16bom('日本語')), '日本語')
  assert.equal(decodeTextFile(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('日本語', 'utf16le').swap16()])), '日本語')
  assert.deepEqual(deunsync(Buffer.from([0xff, 0x00, 0xe0, 0xff, 0x00, 0x00])), Buffer.from([0xff, 0xe0, 0xff, 0x00]))
})

// ------------------------------------------------------------ FLAC

test('FLAC: plain LYRICS, PICTURE and PADDING skipped by length, audio never parsed', async () => {
  const picture = Buffer.alloc(5000, 0x7a)
  const p = await file('plain.flac', flac([[6, picture], [4, vorbis(['TITLE=x', 'lyrics=First line\nSecond line'])], [1, Buffer.alloc(100)]], Buffer.from('LYRICS=not a tag')))
  assert.deepEqual(await readLyrics(p), { source: 'tag', synced: false, lines: [{ ms: null, text: 'First line' }, { ms: null, text: 'Second line' }] })
})

test('FLAC: an LRC in LYRICS is synced; SYNCEDLYRICS beats UNSYNCEDLYRICS', async () => {
  const lrc = await file('lrc.flac', flac([[4, vorbis(['LYRICS=[00:01.00]One\n[00:02.50]Two'])]]))
  assert.deepEqual(await readLyrics(lrc), { source: 'tag', synced: true, lines: [{ ms: 1000, text: 'One' }, { ms: 2500, text: 'Two' }] })
  const both = await file('both.flac', flac([[4, vorbis(['UNSYNCEDLYRICS=plain words', 'SyncedLyrics=[00:03.00]timed'])]]))
  assert.deepEqual((await readLyrics(both)).lines, [{ ms: 3000, text: 'timed' }])
})

test('FLAC: truncated, corrupt or lyric-free files answer without throwing', async () => {
  const good = flac([[4, vorbis(['LYRICS=words'])]])
  const cut = await file('cut.flac', good.subarray(0, 50))
  assert.deepEqual(await readLyrics(cut), { source: null, synced: false, lines: [], reason: 'none' })
  const bad = Buffer.from(good)
  bad.writeUInt32LE(0xfffffff0, 42 + 4) // vendor length far beyond the block
  assert.equal((await readLyrics(await file('bad.flac', bad))).reason, 'none')
  assert.equal((await readLyrics(await file('none.flac', flac([[4, vorbis(['TITLE=x'])]])))).reason, 'none')
  assert.equal((await readLyrics(await file('junk.flac', Buffer.from('not audio at all')))).reason, 'none')
  assert.equal((await readLyrics(await file('zero.flac', Buffer.alloc(0)))).reason, 'none')
})

test('FLAC behind an ID3v2 tag is still read', async () => {
  const p = await file('id3flac.flac', Buffer.concat([id3(3, [id3Frame(3, 'TIT2', Buffer.from('\0x'))]), flac([[4, vorbis(['LYRICS=behind id3'])]])]))
  assert.deepEqual((await readLyrics(p)).lines, [{ ms: null, text: 'behind id3' }])
})

// ------------------------------------------------------------ ID3v2

test('ID3v2.3 USLT in UTF-16 with BOM, after a big APIC frame', async () => {
  const p = await file('v23.mp3', Buffer.concat([id3(3, [id3Frame(3, 'APIC', Buffer.alloc(20000, 1)), id3Frame(3, 'USLT', uslt(1, 'Línea uno\nLínea dos', 'desc'))]), Buffer.alloc(200, 0xff)]))
  assert.deepEqual(await readLyrics(p), { source: 'tag', synced: false, lines: [{ ms: null, text: 'Línea uno' }, { ms: null, text: 'Línea dos' }] })
})

test('ID3v2.3 USLT in Latin-1 and in an extended-header tag', async () => {
  const ext = Buffer.concat([u32be(6), Buffer.alloc(6)])
  const body = Buffer.concat([ext, id3Frame(3, 'USLT', uslt(0, 'café'))])
  const tag = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0x40]), syncsafe(body.length), body])
  assert.deepEqual((await readLyrics(await file('ext.mp3', tag))).lines, [{ ms: null, text: 'café' }])
})

test('ID3v2.4 SYLT in milliseconds beats USLT; syncsafe sizes over 127 bytes', async () => {
  const long = 'x'.repeat(300)
  const frames = [id3Frame(4, 'USLT', uslt(3, long)), id3Frame(4, 'SYLT', sylt([[2000, '\nSecond'], [500, 'First'], [4000, 'Third']]))]
  const r = await readLyrics(await file('v24.mp3', id3(4, frames)))
  assert.deepEqual(r, { source: 'tag', synced: true, lines: [{ ms: 500, text: 'First' }, { ms: 2000, text: 'Second' }, { ms: 4000, text: 'Third' }] })
})

test('ID3 SYLT in MPEG frames is skipped for the USLT', async () => {
  const frames = [id3Frame(4, 'SYLT', sylt([[20, 'frames']], 1)), id3Frame(4, 'USLT', uslt(3, 'plain one'))]
  assert.deepEqual((await readLyrics(await file('fmt1.mp3', id3(4, frames)))).lines, [{ ms: null, text: 'plain one' }])
})

test('ID3 unsynchronisation: v2.3 whole tag and v2.4 per frame', async () => {
  // 0xFF bytes in the frame force real unsynchronisation (ÿ is 0xFF in Latin-1).
  const body23 = id3Frame(3, 'USLT', uslt(0, 'ÿÿ v23 ÿ'))
  const tag23 = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0x80]), syncsafe(unsync(body23).length), unsync(body23)])
  assert.deepEqual((await readLyrics(await file('u23.mp3', tag23))).lines, [{ ms: null, text: 'ÿÿ v23 ÿ' }])
  const frame = unsync(uslt(0, 'ÿ v24 ÿ'))
  const tag24 = id3(4, [id3Frame(4, 'USLT', Buffer.concat([syncsafe(uslt(0, 'ÿ v24 ÿ').length), frame]), 0x03)])
  assert.deepEqual((await readLyrics(await file('u24.mp3', tag24))).lines, [{ ms: null, text: 'ÿ v24 ÿ' }])
})

test('ID3 compressed frames are inflated; encrypted ones skipped', async () => {
  const raw = uslt(3, 'squeezed')
  const v23 = id3(3, [id3Frame(3, 'USLT', Buffer.concat([u32be(raw.length), deflateSync(raw)]), 0x80)])
  assert.deepEqual((await readLyrics(await file('z23.mp3', v23))).lines, [{ ms: null, text: 'squeezed' }])
  const enc = id3(4, [id3Frame(4, 'USLT', Buffer.concat([Buffer.from([1]), raw]), 0x04)])
  assert.equal((await readLyrics(await file('enc.mp3', enc))).reason, 'none')
})

test('ID3 truncated or with a frame size past the tag answers without throwing', async () => {
  const tag = id3(3, [id3Frame(3, 'USLT', uslt(3, 'words'))])
  assert.equal((await readLyrics(await file('cut.mp3', tag.subarray(0, 18)))).reason, 'none')
  const lying = Buffer.from(tag)
  lying.writeUInt32BE(0x7fffffff, 14) // the USLT frame claims 2 GB
  assert.equal((await readLyrics(await file('lie.mp3', lying))).reason, 'none')
})

// ------------------------------------------------------------ sidecar .lrc and sources

test('sidecar .lrc: UTF-8 BOM synced, UTF-16 plain; a synced sidecar beats a plain tag', async () => {
  const song = await file('Song.mp3', Buffer.alloc(100))
  await file('Song.lrc', Buffer.from('\uFEFF[ti:x]\n[00:01.00]Side', 'utf8'))
  assert.deepEqual(await readLyrics(song), { source: 'lrc', synced: true, lines: [{ ms: 1000, text: 'Side' }] })
  const other = await file('Other.flac', flac([[4, vorbis(['LYRICS=tag words'])]]))
  await file('Other.lrc', utf16bom('[00:02.00]sidecar'))
  assert.deepEqual(await readLyrics(other), { source: 'lrc', synced: true, lines: [{ ms: 2000, text: 'sidecar' }] })
  const plainTagSide = await file('Third.flac', flac([[4, vorbis(['TITLE=x'])]]))
  await file('Third.lrc', utf16bom('plain\nwords'))
  assert.deepEqual(await readLyrics(plainTagSide), { source: 'lrc', synced: false, lines: [{ ms: null, text: 'plain' }, { ms: null, text: 'words' }] })
  const tagFirst = await file('Fourth.flac', flac([[4, vorbis(['LYRICS=tag plain'])]]))
  await file('Fourth.lrc', 'side plain')
  assert.equal((await readLyrics(tagFirst)).source, 'tag')
})

test('a sidecar over 512 KB is ignored', async () => {
  const song = await file('Big.mp3', Buffer.alloc(10))
  await file('Big.lrc', Buffer.from('[00:01.00]x\n'.repeat(50000)))
  assert.equal((await readLyrics(song)).reason, 'none')
})

test('streams, missing files and relative paths give a reason, never an error', async () => {
  assert.deepEqual(await readLyrics('cloud://onedrive/Music/a.flac'), { source: null, synced: false, lines: [], reason: 'cloud' })
  assert.equal((await readLyrics('https://host/a.flac')).reason, 'cloud')
  assert.equal((await readLyrics(join(dir, 'missing.flac'))).reason, 'unreadable')
  assert.equal((await readLyrics(dir)).reason, 'unreadable') // a folder, not a file
  assert.equal((await readLyrics('relative\\a.flac')).reason, 'unreadable')
  assert.equal((await readLyrics('')).reason, 'unreadable')
  assert.equal(localPath('file:///C:/Music/a%20b.flac'), 'C:\\Music\\a b.flac')
})
