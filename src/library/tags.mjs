// Tags of one LOCAL audio file, read-only and bounded: FLAC (STREAMINFO, VORBIS_COMMENT, PICTURE),
// ID3v2.3/2.4 (text frames, APIC, USLT/SYLT presence) with an MP3 duration estimate (Xing/Info,
// VBRI or constant bitrate), and MP4/M4A (moov/udta/meta/ilst, mvhd, stsd). Other formats get no
// tags: the model falls back to folder and file names. Only metadata is read, never audio frames
// (an MP3's first frame header excepted), and never a cloud-only file: the caller decides that from
// the scan's attributes before calling here.
import { open } from 'node:fs/promises'
import { extname } from 'node:path'
import { id3Text, parseVorbisComment, walkFlac, walkId3 } from '../lyrics.mjs'

const HEAD = 64 * 1024 // bytes read at once from the start of the file
const MOOV_CAP = 16 * 1024 * 1024 // MP4 movie box read at most
const PICTURE_HEAD = 64 * 1024 // a FLAC PICTURE block header (mime + description) at most
const TEXT_CAP = 4096 // one tag value

export const AUDIO_EXT = new Set(['flac', 'mp3', 'm4a', 'mp4', 'alac', 'ogg', 'oga', 'opus', 'wav', 'aif', 'aiff', 'ape', 'wv', 'dsf', 'dff', 'tak'])
export const LOSSLESS_CODECS = new Set(['FLAC', 'ALAC', 'WAV', 'AIFF', 'APE', 'WV', 'DSF', 'DFF', 'TAK'])

// ID3v1 genres (and Winamp's extensions) for TCON "(17)" or "17" references.
const GENRES = (
  'Blues|Classic Rock|Country|Dance|Disco|Funk|Grunge|Hip-Hop|Jazz|Metal|New Age|Oldies|Other|Pop|R&B|Rap|Reggae|Rock|Techno|' +
  'Industrial|Alternative|Ska|Death Metal|Pranks|Soundtrack|Euro-Techno|Ambient|Trip-Hop|Vocal|Jazz+Funk|Fusion|Trance|Classical|' +
  'Instrumental|Acid|House|Game|Sound Clip|Gospel|Noise|Alternative Rock|Bass|Soul|Punk|Space|Meditative|Instrumental Pop|' +
  'Instrumental Rock|Ethnic|Gothic|Darkwave|Techno-Industrial|Electronic|Pop-Folk|Eurodance|Dream|Southern Rock|Comedy|Cult|' +
  'Gangsta|Top 40|Christian Rap|Pop/Funk|Jungle|Native American|Cabaret|New Wave|Psychedelic|Rave|Showtunes|Trailer|Lo-Fi|' +
  'Tribal|Acid Punk|Acid Jazz|Polka|Retro|Musical|Rock & Roll|Hard Rock|Folk|Folk-Rock|National Folk|Swing|Fast Fusion|Bebop|' +
  'Latin|Revival|Celtic|Bluegrass|Avantgarde|Gothic Rock|Progressive Rock|Psychedelic Rock|Symphonic Rock|Slow Rock|Big Band|' +
  'Chorus|Easy Listening|Acoustic|Humour|Speech|Chanson|Opera|Chamber Music|Sonata|Symphony|Booty Bass|Primus|Porn Groove|' +
  'Satire|Slow Jam|Club|Tango|Samba|Folklore|Ballad|Power Ballad|Rhythmic Soul|Freestyle|Duet|Punk Rock|Drum Solo|A Cappella|' +
  'Euro-House|Dance Hall'
).split('|')

/** Codec name from a file name's extension (FLAC, MP3, M4A...). */
export const codecOfExt = (path) => {
  const e = extname(String(path)).slice(1).toLowerCase()
  return e === 'aif' ? 'AIFF' : e === 'oga' ? 'OGG' : e.toUpperCase()
}

const clipText = (s) => {
  const t = String(s ?? '').replace(/\u0000+$/, '').trim()
  return t.length > TEXT_CAP ? t.slice(0, TEXT_CAP) : t
}

/** "3", "3/12", "03 of 12" to 3; null when there is no number. */
export function parseNumber(v) {
  const m = /^\s*(\d{1,4})/.exec(String(v ?? ''))
  return m ? Number(m[1]) || null : null
}

/** A year (first four-digit run) from DATE/TDRC/©day values like "2003-05-01"; null otherwise. */
export function parseYear(v) {
  const m = /(\d{4})/.exec(String(v ?? ''))
  return m ? Number(m[1]) : null
}

/** TCON values to genre names: "(17)", "17", "(17)Indie", "(RX)", "Rock;Pop". */
export function id3Genres(values) {
  const out = []
  for (const v of values) {
    let rest = String(v)
    let m
    while ((m = /^\((\d{1,3}|RX|CR)\)/.exec(rest))) {
      const ref = m[1]
      if (ref === 'RX') out.push('Remix')
      else if (ref === 'CR') out.push('Cover')
      else if (GENRES[Number(ref)]) out.push(GENRES[Number(ref)])
      rest = rest.slice(m[0].length)
    }
    rest = rest.replace(/^\(\(/, '(').trim()
    if (/^\d{1,3}$/.test(rest)) {
      if (GENRES[Number(rest)]) out.push(GENRES[Number(rest)])
    } else if (rest) out.push(rest)
  }
  return out
}

/** Several genre values, each possibly "A; B", to a clean, de-duplicated list. */
export function splitGenres(values) {
  const seen = new Set()
  const out = []
  for (const v of values) {
    for (const g of String(v).split(/[;\u0000]|\s\/\s/)) {
      const name = clipText(g)
      const key = name.toLowerCase()
      if (!name || seen.has(key)) continue
      seen.add(key)
      out.push(name)
    }
  }
  return out.slice(0, 8)
}

/** A reader over an open file that serves the first HEAD bytes from memory. */
async function bufferedReader(fh) {
  const head = Buffer.alloc(HEAD)
  const { bytesRead } = await fh.read(head, 0, HEAD, 0)
  const cached = head.subarray(0, bytesRead)
  return async (pos, len) => {
    if (len <= 0) return Buffer.alloc(0)
    if (pos + len <= cached.length) return cached.subarray(pos, pos + len)
    const buf = Buffer.alloc(len)
    const r = await fh.read(buf, 0, len, pos)
    return buf.subarray(0, r.bytesRead)
  }
}

// ---------------------------------------------------------------- FLAC

/** STREAMINFO body to { sampleRate, channels, bits, durationMs }. */
export function parseStreamInfo(b) {
  if (b.length < 18) return {}
  const sampleRate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4)
  const channels = ((b[12] >> 1) & 7) + 1
  const bits = (((b[12] & 1) << 4) | (b[13] >> 4)) + 1
  const samples = (b[13] & 0x0f) * 2 ** 32 + b.readUInt32BE(14)
  return { sampleRate: sampleRate || null, channels, bits, durationMs: sampleRate && samples ? Math.round((samples * 1000) / sampleRate) : null }
}

/** Copies the values that say something (not '' / null / [] / false) onto `out`. */
export function merge(out, tags) {
  for (const [k, v] of Object.entries(tags)) {
    if (v === '' || v === null || v === undefined || v === false || (Array.isArray(v) && !v.length)) continue
    out[k] = v
  }
  return out
}

const first = (tags, ...keys) => {
  for (const k of keys) if (tags[k]?.length) return clipText(tags[k][0])
  return ''
}

export function fromVorbis(tags) {
  return {
    title: first(tags, 'TITLE'),
    artist: first(tags, 'ARTIST'),
    albumArtist: first(tags, 'ALBUMARTIST', 'ALBUM ARTIST', 'ALBUM_ARTIST'),
    album: first(tags, 'ALBUM'),
    number: parseNumber(first(tags, 'TRACKNUMBER', 'TRACK')),
    disc: parseNumber(first(tags, 'DISCNUMBER', 'DISC')),
    year: parseYear(first(tags, 'DATE', 'YEAR', 'ORIGINALDATE')),
    genres: splitGenres(tags.GENRE ?? []),
    compilation: first(tags, 'COMPILATION') === '1',
    lyrics: ['LYRICS', 'UNSYNCEDLYRICS', 'SYNCEDLYRICS'].some((k) => (tags[k] ?? []).some((v) => v.trim()))
  }
}

async function readFlacTags(read, start, out) {
  const pictures = []
  const ok = await walkFlac(read, start, async ({ type, pos, len, end }) => {
    if (type === 0) Object.assign(out, parseStreamInfo(await read(pos, Math.min(len, 34))))
    else if (type === 4) {
      if (len > 1024 * 1024 || pos + len > end) return
      const body = await read(pos, len)
      if (body.length === len) merge(out, fromVorbis(parseVorbisComment(body)))
    } else if (type === 6) {
      const pic = parseFlacPictureHead(await read(pos, Math.min(len, PICTURE_HEAD)))
      if (pic && pic.offset + pic.length <= len) pictures.push({ ...pic, offset: pos + pic.offset })
    }
  })
  if (!ok) return false
  out.codec = 'FLAC'
  out.lossless = true
  const front = pictures.find((p) => p.type === 3) ?? pictures[0]
  if (front) out.picture = { offset: front.offset, length: front.length, mime: front.mime }
  return true
}

/** The header of a FLAC PICTURE block: { type, mime, offset (of the data in the block), length }. */
export function parseFlacPictureHead(b) {
  try {
    const type = b.readUInt32BE(0)
    const mimeLen = b.readUInt32BE(4)
    if (mimeLen > 256) return null
    const mime = b.toString('latin1', 8, 8 + mimeLen).toLowerCase()
    const descLen = b.readUInt32BE(8 + mimeLen)
    const at = 12 + mimeLen + descLen + 16
    if (at + 4 > b.length) return null
    const length = b.readUInt32BE(at)
    if (mime === '-->' || !length) return null // a link, not a picture
    return { type, mime, offset: at + 4, length }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- ID3v2 and MP3

/** APIC body to { type, mime, start (of the data in the body) }; null when malformed. */
export function parseApicHead(b) {
  if (b.length < 4 || b[0] > 3) return null
  const enc = b[0]
  const mimeEnd = b.indexOf(0, 1)
  if (mimeEnd < 0) return null
  let mime = b.toString('latin1', 1, mimeEnd).toLowerCase()
  if (mime === 'jpg') mime = 'image/jpeg'
  if (mime === 'png') mime = 'image/png'
  const type = b[mimeEnd + 1]
  let p = mimeEnd + 2
  if (enc === 1 || enc === 2) {
    while (p + 1 < b.length && !(b[p] === 0 && b[p + 1] === 0)) p += 2
    p += 2
  } else {
    while (p < b.length && b[p] !== 0) p++
    p += 1
  }
  if (p >= b.length || mime === '-->') return null
  return { type, mime, start: p }
}

async function readId3Tags(read, out) {
  const text = {}
  const pictures = []
  const found = await walkId3(read, async ({ id, size, offset, body }) => {
    if (/^T[A-Z0-9]{3}$/.test(id) && id !== 'TXXX') {
      if (size > TEXT_CAP * 4) return
      const values = id3Text(await body())
      if (values.length) text[id] = values
    } else if (id === 'USLT' || id === 'SYLT') {
      if (size > 4) out.lyrics = true
    } else if (id === 'APIC' && offset !== null && size > 16) {
      // Only pictures stored as is can be cut from the file later; read just their header.
      const head = await read(offset, Math.min(size, 1024))
      const pic = parseApicHead(head)
      if (pic && pic.start < size) pictures.push({ type: pic.type, mime: pic.mime, offset: offset + pic.start, length: size - pic.start })
    }
  })
  if (!found) return null
  const t = (k) => clipText(text[k]?.[0] ?? '')
  merge(out, {
    title: t('TIT2'),
    artist: t('TPE1'),
    albumArtist: t('TPE2'),
    album: t('TALB'),
    number: parseNumber(t('TRCK')),
    disc: parseNumber(t('TPOS')),
    year: parseYear(t('TDRC') || t('TYER') || t('TDOR') || t('TORY')),
    genres: splitGenres(id3Genres(text.TCON ?? [])),
    compilation: t('TCMP') === '1'
  })
  const front = pictures.find((p) => p.type === 3) ?? pictures[0]
  if (front) out.picture = { offset: front.offset, length: front.length, mime: front.mime }
  return found
}

const MP3_BITRATES = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
}
const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

/** An MPEG audio frame header at `p`: { sampleRate, channels, bitrate (kbps), spf, mpeg1 } or null. */
export function mp3Header(b, p) {
  if (p + 4 > b.length || b[p] !== 0xff || (b[p + 1] & 0xe0) !== 0xe0) return null
  const version = (b[p + 1] >> 3) & 3 // 0 MPEG2.5, 2 MPEG2, 3 MPEG1
  const layer = 4 - ((b[p + 1] >> 1) & 3) // 1, 2, 3
  const bi = b[p + 2] >> 4
  const si = (b[p + 2] >> 2) & 3
  if (version === 1 || layer === 4 || bi === 0 || bi === 15 || si === 3) return null
  const mpeg1 = version === 3
  const table = mpeg1 ? MP3_BITRATES[`1-${layer}`] : MP3_BITRATES[layer === 1 ? '2-1' : '2-2']
  const sampleRate = MP3_RATES[version][si]
  const channels = b[p + 3] >> 6 === 3 ? 1 : 2
  const spf = layer === 1 ? 384 : layer === 3 && !mpeg1 ? 576 : 1152
  return { sampleRate, channels, bitrate: table[bi], spf, mpeg1, layer }
}

/** Duration and format of an MP3 stream starting at `start`, from its first frame. */
export function mp3Info(b, start, fileSize) {
  const limit = Math.min(b.length - 4, start + 16 * 1024)
  for (let p = start; p < limit; p++) {
    const h = mp3Header(b, p)
    if (!h) continue
    const side = h.mpeg1 ? (h.channels === 1 ? 17 : 32) : h.channels === 1 ? 9 : 17
    const x = p + 4 + side
    const tag = b.toString('latin1', x, x + 4)
    let frames = null
    if ((tag === 'Xing' || tag === 'Info') && x + 12 <= b.length && b.readUInt32BE(x + 4) & 1) frames = b.readUInt32BE(x + 8)
    else if (b.toString('latin1', p + 36, p + 40) === 'VBRI' && p + 54 <= b.length) frames = b.readUInt32BE(p + 50)
    const durationMs = frames ? Math.round((frames * h.spf * 1000) / h.sampleRate) : fileSize > p ? Math.round(((fileSize - p) * 8) / h.bitrate) : null
    return { sampleRate: h.sampleRate, channels: h.channels, bitrate: h.bitrate, durationMs }
  }
  return null
}

// ---------------------------------------------------------------- MP4

/** Child boxes of `b` from `from` to `to`: [{ type, start (of the body), end }]. */
function boxes(b, from = 0, to = b.length) {
  const out = []
  let p = from
  while (p + 8 <= to) {
    let size = b.readUInt32BE(p)
    const type = b.toString('latin1', p + 4, p + 8)
    let head = 8
    if (size === 1) {
      if (p + 16 > to) break
      size = Number(b.readBigUInt64BE(p + 8))
      head = 16
    } else if (size === 0) size = to - p
    if (size < head || p + size > to) break
    out.push({ type, start: p + head, end: p + size })
    p += size
  }
  return out
}
const child = (b, box, type, skip = 0) => box && boxes(b, box.start + skip, box.end).find((c) => c.type === type)

/** Finds the top-level moov box by walking box headers (skipping mdat by its size). */
async function findMoov(read, fileSize) {
  let p = 0
  for (let i = 0; i < 64 && p + 8 <= fileSize; i++) {
    const h = await read(p, 16)
    if (h.length < 8) return null
    let size = h.readUInt32BE(0)
    const type = h.toString('latin1', 4, 8)
    if (!/^[\x20-\x7e]{4}$/.test(type)) return null
    if (size === 1 && h.length >= 16) size = Number(h.readBigUInt64BE(8))
    else if (size === 0) size = fileSize - p
    if (size < 8) return null
    if (type === 'moov') return size <= MOOV_CAP ? { at: p, buf: await read(p, size) } : null
    p += size
  }
  return null
}

export function parseMoov(b, at = 0) {
  const out = {}
  const moov = boxes(b)[0]
  if (!moov || moov.type !== 'moov') return out
  const mvhd = child(b, moov, 'mvhd')
  if (mvhd) {
    const v = b[mvhd.start]
    const scale = v === 1 ? b.readUInt32BE(mvhd.start + 20) : b.readUInt32BE(mvhd.start + 12)
    const dur = v === 1 ? Number(b.readBigUInt64BE(mvhd.start + 24)) : b.readUInt32BE(mvhd.start + 16)
    if (scale) out.durationMs = Math.round((dur * 1000) / scale)
  }
  for (const trak of boxes(b, moov.start, moov.end).filter((c) => c.type === 'trak')) {
    const stbl = child(b, child(b, child(b, trak, 'mdia'), 'minf'), 'stbl')
    const stsd = child(b, stbl, 'stsd')
    if (!stsd || stsd.end - stsd.start < 8 + 36) continue
    const e = stsd.start + 8 // version/flags and entry count
    const fmt = b.toString('latin1', e + 4, e + 8)
    if (fmt !== 'mp4a' && fmt !== 'alac') continue
    out.codec = fmt === 'alac' ? 'ALAC' : 'AAC'
    out.lossless = fmt === 'alac'
    out.channels = b.readUInt16BE(e + 8 + 16) || null
    const bits = b.readUInt16BE(e + 8 + 18)
    if (fmt === 'alac') out.bits = bits || null
    out.sampleRate = b.readUInt32BE(e + 8 + 24) >>> 16 || null
    // ALAC's own config holds the real rate (the entry's 16.16 field cannot say 96000) and depth.
    const cfg = fmt === 'alac' && boxes(b, e + 36, Math.min(stsd.end, e + b.readUInt32BE(e))).find((c) => c.type === 'alac')
    if (cfg && cfg.end - cfg.start >= 28) {
      out.bits = b[cfg.start + 9] || out.bits
      out.channels = b[cfg.start + 13] || out.channels
      out.sampleRate = b.readUInt32BE(cfg.start + 24) || out.sampleRate
    }
    break
  }
  const meta = child(b, child(b, moov, 'udta'), 'meta')
  const ilst = meta && (child(b, meta, 'ilst', 4) ?? child(b, meta, 'ilst'))
  if (!ilst) return out
  const tags = {}
  for (const item of boxes(b, ilst.start, ilst.end)) {
    const data = child(b, item, 'data')
    if (!data || data.end - data.start < 8) continue
    tags[item.type] = { kind: b.readUInt32BE(data.start) & 0xffffff, start: data.start + 8, end: data.end }
  }
  const str = (k) => (tags[k] ? clipText(b.toString('utf8', tags[k].start, Math.min(tags[k].end, tags[k].start + TEXT_CAP))) : '')
  const pair = (k) => (tags[k] && tags[k].end - tags[k].start >= 4 ? b.readUInt16BE(tags[k].start + 2) || null : null)
  merge(out, {
    title: str('\xa9nam'),
    artist: str('\xa9ART'),
    albumArtist: str('aART'),
    album: str('\xa9alb'),
    number: pair('trkn'),
    disc: pair('disk'),
    year: parseYear(str('\xa9day')),
    genres: splitGenres(str('\xa9gen') ? [str('\xa9gen')] : tags.gnre && tags.gnre.end - tags.gnre.start >= 2 ? [GENRES[b.readUInt16BE(tags.gnre.start) - 1] ?? ''] : []),
    compilation: Boolean(tags.cpil && b[tags.cpil.start]),
    lyrics: Boolean(str('\xa9lyr'))
  })
  const covr = tags.covr
  if (covr && covr.end > covr.start) out.picture = { offset: at + covr.start, length: covr.end - covr.start, mime: covr.kind === 14 ? 'image/png' : 'image/jpeg' }
  return out
}

// ---------------------------------------------------------------- one file

/**
 * Tags and format of a local audio file: { title, artist, albumArtist, album, number, disc, year,
 * genres, compilation, lyrics, codec, lossless, sampleRate, bits, channels, durationMs,
 * picture: { offset, length, mime } | undefined }. Missing values are '' / null. Never writes.
 */
export async function readTags(path, { size = 0, openFile = open } = {}) {
  const ext = extname(path).slice(1).toLowerCase()
  const codec = codecOfExt(path)
  const out = { codec, lossless: LOSSLESS_CODECS.has(codec) || ext === 'alac' }
  if (!['flac', 'mp3', 'm4a', 'mp4', 'alac'].includes(ext)) return out
  const fh = await openFile(path, 'r')
  try {
    const read = await bufferedReader(fh)
    const fileSize = size || (await fh.stat()).size
    if (ext === 'flac' || ext === 'mp3') {
      const id3 = await readId3Tags(read, out).catch(() => null)
      const start = id3?.total ?? 0
      const isFlac = await readFlacTags(read, start, out).catch(() => false)
      if (!isFlac && ext === 'mp3') {
        const info = mp3Info(await read(start, 16 * 1024 + 256), 0, fileSize - start)
        if (info) Object.assign(out, { sampleRate: info.sampleRate, channels: info.channels, durationMs: info.durationMs, bits: null })
      }
    } else {
      const moov = await findMoov(read, fileSize)
      if (moov) Object.assign(out, parseMoov(moov.buf, moov.at))
    }
  } finally {
    await fh.close()
  }
  return out
}
