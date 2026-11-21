// Tag readers of the library index, on synthetic FLAC, MP3 and M4A bytes held in memory.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { id3Genres, mp3Info, parseFlacPictureHead, parseNumber, parseYear, readTags, splitGenres } from '../src/library/tags.mjs'

/** A file handle over a buffer, recording every read (position, length). */
function memoryFile(buf) {
  const reads = []
  const fh = {
    reads,
    async read(target, offset, length, position) {
      reads.push([position, length])
      const n = Math.max(0, Math.min(length, buf.length - position))
      buf.copy(target, offset, position, position + n)
      return { bytesRead: n }
    },
    async stat() {
      return { size: buf.length }
    },
    async close() {}
  }
  return { fh, openFile: async () => fh }
}

const u32be = (n) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

export function flacBytes({ tags = {}, rate = 96000, bits = 24, channels = 2, samples = 96000 * 30, picture = null, padding = 0 } = {}) {
  const si = Buffer.alloc(34)
  si[10] = rate >> 12
  si[11] = (rate >> 4) & 0xff
  si[12] = ((rate & 0xf) << 4) | ((channels - 1) << 1) | ((bits - 1) >> 4)
  si[13] = (((bits - 1) & 0xf) << 4) | Math.floor(samples / 2 ** 32)
  si.writeUInt32BE(samples % 2 ** 32, 14)
  const vendor = Buffer.from('test')
  const items = Object.entries(tags).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => Buffer.from(`${k}=${x}`)))
  const len = (n) => {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(n)
    return b
  }
  const vc = Buffer.concat([len(vendor.length), vendor, len(items.length), ...items.flatMap((i) => [len(i.length), i])])
  const blocks = [[0, si], ...(picture ? [[6, picture]] : []), [4, vc], ...(padding ? [[1, Buffer.alloc(padding)]] : [])]
  const parts = [Buffer.from('fLaC')]
  blocks.forEach(([type, body], i) => {
    parts.push(Buffer.from([(i === blocks.length - 1 ? 0x80 : 0) | type, (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff]), body)
  })
  parts.push(Buffer.alloc(32)) // "audio"
  return Buffer.concat(parts)
}

export function flacPicture(data, type = 3, mime = 'image/jpeg') {
  const m = Buffer.from(mime)
  const d = Buffer.from('front')
  return Buffer.concat([u32be(type), u32be(m.length), m, u32be(d.length), d, u32be(600), u32be(600), u32be(24), u32be(0), u32be(data.length), data])
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])

test('FLAC: STREAMINFO format and duration, VORBIS_COMMENT tags, PICTURE location', async () => {
  const pic = flacPicture(JPEG)
  const buf = flacBytes({
    tags: { TITLE: 'Song', ARTIST: 'Artist', ALBUMARTIST: 'Album Artist', ALBUM: 'Álbum', TRACKNUMBER: '3/12', DISCNUMBER: '2', DATE: '1996-05-01', GENRE: ['Rock', 'Pop; rock'], LYRICS: 'la la' },
    picture: pic
  })
  const { openFile } = memoryFile(buf)
  const t = await readTags('C:\\x\\a.flac', { openFile })
  assert.equal(t.codec, 'FLAC')
  assert.equal(t.lossless, true)
  assert.equal(t.sampleRate, 96000)
  assert.equal(t.bits, 24)
  assert.equal(t.channels, 2)
  assert.equal(t.durationMs, 30000)
  assert.deepEqual([t.title, t.artist, t.albumArtist, t.album, t.number, t.disc, t.year], ['Song', 'Artist', 'Album Artist', 'Álbum', 3, 2, 1996])
  assert.deepEqual(t.genres, ['Rock', 'Pop'])
  assert.equal(t.lyrics, true)
  assert.equal(t.picture.mime, 'image/jpeg')
  assert.equal(t.picture.length, JPEG.length)
  assert.deepEqual(buf.subarray(t.picture.offset, t.picture.offset + t.picture.length), JPEG)
})

test('FLAC reads stay in the metadata: a big picture block is skipped by its length, never read', async () => {
  const big = flacPicture(Buffer.alloc(3 * 1024 * 1024, 7))
  const buf = flacBytes({ tags: { TITLE: 'After the picture' }, picture: big })
  const { fh, openFile } = memoryFile(buf)
  const t = await readTags('a.flac', { openFile })
  assert.equal(t.title, 'After the picture')
  const bytes = fh.reads.reduce((s, [, len]) => s + len, 0)
  assert.ok(bytes < 200 * 1024, `read ${bytes} bytes`)
})

function id3Frame(id, body) {
  const h = Buffer.alloc(10)
  h.write(id, 0, 'latin1')
  // v2.4 sizes are syncsafe
  const n = body.length
  h[4] = (n >> 21) & 0x7f
  h[5] = (n >> 14) & 0x7f
  h[6] = (n >> 7) & 0x7f
  h[7] = n & 0x7f
  return Buffer.concat([h, body])
}
const id3TextFrame = (id, text) => id3Frame(id, Buffer.concat([Buffer.from([3]), Buffer.from(text, 'utf8')]))
function id3Tag(frames) {
  const body = Buffer.concat(frames)
  const h = Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1')
  const n = body.length
  h[6] = (n >> 21) & 0x7f
  h[7] = (n >> 14) & 0x7f
  h[8] = (n >> 7) & 0x7f
  h[9] = n & 0x7f
  return Buffer.concat([h, body])
}

test('MP3: ID3v2.4 text frames, genre references, APIC, USLT presence and a Xing duration', async () => {
  const apic = id3Frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/jpeg\0', 'latin1'), Buffer.from([3]), Buffer.from('cover\0', 'latin1'), JPEG]))
  const tag = id3Tag([
    id3TextFrame('TIT2', 'Título'),
    id3TextFrame('TPE1', 'Artista'),
    id3TextFrame('TPE2', 'Varios'),
    id3TextFrame('TALB', 'Disco'),
    id3TextFrame('TRCK', '7/10'),
    id3TextFrame('TPOS', '1/2'),
    id3TextFrame('TDRC', '2001-02'),
    id3TextFrame('TCON', '(17)(13)Indie'),
    id3Frame('USLT', Buffer.concat([Buffer.from([3]), Buffer.from('eng'), Buffer.from([0]), Buffer.from('words')])),
    apic
  ])
  // MPEG-1 Layer III, 128 kbps, 44.1 kHz, joint stereo; Xing with 100 frames.
  const frame = Buffer.alloc(417)
  Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(frame, 0)
  frame.write('Xing', 4 + 32, 'latin1')
  frame.writeUInt32BE(1, 4 + 32 + 4)
  frame.writeUInt32BE(100, 4 + 32 + 8)
  const buf = Buffer.concat([tag, frame, Buffer.alloc(4000)])
  const { openFile } = memoryFile(buf)
  const t = await readTags('song.mp3', { openFile })
  assert.deepEqual([t.title, t.artist, t.albumArtist, t.album, t.number, t.disc, t.year], ['Título', 'Artista', 'Varios', 'Disco', 7, 1, 2001])
  assert.deepEqual(t.genres, ['Rock', 'Pop', 'Indie'])
  assert.equal(t.lyrics, true)
  assert.equal(t.codec, 'MP3')
  assert.equal(t.lossless, false)
  assert.equal(t.sampleRate, 44100)
  assert.equal(t.durationMs, Math.round((100 * 1152 * 1000) / 44100))
  assert.deepEqual(buf.subarray(t.picture.offset, t.picture.offset + t.picture.length), JPEG)
})

test('MP3 without a Xing header: constant bitrate estimate from the size', () => {
  const b = Buffer.alloc(2000)
  Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(b, 10)
  const info = mp3Info(b, 0, 16000 + 10)
  assert.equal(info.bitrate, 128)
  assert.equal(info.durationMs, 1000) // 16000 bytes at 128 kbps
})

const box = (type, ...parts) => {
  const body = Buffer.concat(parts)
  return Buffer.concat([u32be(body.length + 8), Buffer.from(type, 'latin1'), body])
}
const dataBox = (kind, payload) => box('data', u32be(kind), u32be(0), payload)

test('M4A (ALAC): ilst atoms, mvhd duration, rate and depth from the ALAC config, covr location', async () => {
  const mvhd = Buffer.alloc(100)
  mvhd.writeUInt32BE(1000, 12) // timescale
  mvhd.writeUInt32BE(245500, 16) // duration
  const entryFields = Buffer.alloc(28)
  entryFields.writeUInt16BE(1, 6) // data reference index
  entryFields.writeUInt16BE(2, 16) // channels
  entryFields.writeUInt16BE(16, 18) // sample size (the config says 24)
  entryFields.writeUInt32BE(0, 24) // 96000 does not fit 16.16
  const cfg = Buffer.alloc(28)
  cfg[9] = 24
  cfg[13] = 2
  cfg.writeUInt32BE(96000, 24)
  const entry = box('alac', entryFields, box('alac', cfg))
  const stsd = box('stsd', u32be(0), u32be(1), entry)
  const trak = box('trak', box('mdia', box('minf', box('stbl', stsd))))
  const trkn = Buffer.from([0, 0, 0, 4, 0, 12, 0, 0])
  const ilst = box('ilst', box('\xa9nam', dataBox(1, Buffer.from('Canción'))), box('\xa9ART', dataBox(1, Buffer.from('Artista'))), box('aART', dataBox(1, Buffer.from('Album Artist'))), box('\xa9alb', dataBox(1, Buffer.from('Álbum'))), box('trkn', dataBox(0, trkn)), box('disk', dataBox(0, Buffer.from([0, 0, 0, 2, 0, 2]))), box('\xa9day', dataBox(1, Buffer.from('2019-01-01T00:00:00Z'))), box('\xa9gen', dataBox(1, Buffer.from('Jazz'))), box('covr', dataBox(13, JPEG)))
  const moov = box('moov', box('mvhd', mvhd), trak, box('udta', box('meta', u32be(0), ilst)))
  // mdat first: the reader walks past it by its size.
  const buf = Buffer.concat([box('ftyp', Buffer.from('M4A \0\0\0\0', 'latin1')), box('mdat', Buffer.alloc(70000)), moov])
  const { fh, openFile } = memoryFile(buf)
  const t = await readTags('a.m4a', { openFile })
  assert.deepEqual([t.title, t.artist, t.albumArtist, t.album, t.number, t.disc, t.year], ['Canción', 'Artista', 'Album Artist', 'Álbum', 4, 2, 2019])
  assert.deepEqual(t.genres, ['Jazz'])
  assert.equal(t.codec, 'ALAC')
  assert.equal(t.lossless, true)
  assert.equal(t.sampleRate, 96000)
  assert.equal(t.bits, 24)
  assert.equal(t.durationMs, 245500)
  assert.deepEqual(buf.subarray(t.picture.offset, t.picture.offset + t.picture.length), JPEG)
  assert.ok(!fh.reads.some(([pos, len]) => pos < 70000 && pos + len > 70000 && len > 64 * 1024), 'mdat is not read')
})

test('formats without a reader give the codec only, without opening the file', async () => {
  let opened = false
  const t = await readTags('C:\\m\\x.opus', { openFile: async () => ((opened = true), null) })
  assert.equal(t.codec, 'OPUS')
  assert.equal(opened, false)
  assert.equal((await readTags('x.dsf', { openFile: async () => null })).lossless, true)
})

test('value helpers: numbers, years, genres', () => {
  assert.equal(parseNumber('03/12'), 3)
  assert.equal(parseNumber(''), null)
  assert.equal(parseYear('2003-05-01'), 2003)
  assert.equal(parseYear('n/a'), null)
  assert.deepEqual(id3Genres(['(17)', '13', '(RX)(CR)', 'Shoegaze']), ['Rock', 'Pop', 'Remix', 'Cover', 'Shoegaze'])
  assert.deepEqual(splitGenres(['Rock; rock', 'Hip-Hop/Rap']), ['Rock', 'Hip-Hop/Rap'])
  assert.equal(parseFlacPictureHead(Buffer.alloc(3)), null)
})
