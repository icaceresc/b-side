// Lyrics of the playing file, read-only and bounded. AIMP's Remote API carries no lyrics, so the
// worker reads them from the local file AIMP reports:
//   1. tags: FLAC VORBIS_COMMENT (SYNCEDLYRICS, LYRICS, UNSYNCEDLYRICS) and ID3v2.3/2.4 (SYLT, USLT),
//      also an ID3v2 tag in front of a FLAC stream;
//   2. a sidecar .lrc with the same base name.
// Synced beats plain: a synced tag, then a synced .lrc, then plain tag text, then a plain .lrc.
// Only metadata is read (never audio frames), every read has a byte cap, nothing is written.
import { open, readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const FLAC_META_CAP = 8 * 1024 * 1024 // metadata blocks scanned at most
const ID3_CAP = 8 * 1024 * 1024 // bytes of an ID3v2 tag considered at most
const FRAME_CAP = 1024 * 1024 // one lyrics frame or comment block
const LRC_CAP = 512 * 1024
const MAX_LINES = 3000
const MAX_LINE = 400

const empty = (reason) => ({ source: null, synced: false, lines: [], reason })

// ---------------------------------------------------------------- LRC and plain text

const STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/
const META = /^\[([a-z#][a-z0-9_#-]*):([^\]]*)\]\s*$/i
const WORD_STAMP = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g
const clip = (s) => (s.length > MAX_LINE ? s.slice(0, MAX_LINE) : s)

const stampMs = (m) => {
  const frac = m[3] ?? ''
  const ms = frac ? Number(frac.padEnd(3, '0')) : 0
  return (Number(m[1]) * 60 + Number(m[2])) * 1000 + ms
}

/** Trims leading and trailing breaks and collapses runs of untimed blank lines. */
function tidy(lines) {
  const out = []
  for (const l of lines) {
    if (l.ms === null && !l.text && (!out.length || (out.at(-1).ms === null && !out.at(-1).text))) continue
    out.push(l)
  }
  while (out.length && out.at(-1).ms === null && !out.at(-1).text) out.pop()
  return out.slice(0, MAX_LINES)
}

/**
 * LRC text to time-sorted lines, or null when no line carries a timestamp. Several stamps per
 * line, [offset:+/-ms], mm:ss with 0-3 fraction digits; metadata tags are dropped and enhanced
 * word stamps (<mm:ss.xx>) stripped. Untimed lines (blank breaks, credits) keep their place after
 * the timed line before them, with ms null.
 */
export function parseLrc(text) {
  const entries = []
  let offset = 0
  let anyTimed = false
  let anchor = -1
  let seq = 0
  for (const raw of String(text ?? '').split(/\r\n|\n|\r/)) {
    let rest = raw.trim()
    const meta = META.exec(rest)
    if (meta && !/^\d+$/.test(meta[1])) {
      if (meta[1].toLowerCase() === 'offset' && /^[+-]?\d+$/.test(meta[2].trim())) offset = Number(meta[2].trim())
      continue
    }
    const stamps = []
    let m
    while ((m = STAMP.exec(rest))) {
      stamps.push(stampMs(m))
      rest = rest.slice(m[0].length).trimStart()
    }
    const line = clip(rest.replace(WORD_STAMP, '').replace(/\s+/g, ' ').trim())
    if (stamps.length) {
      anyTimed = true
      for (const ms of stamps) entries.push({ ms, text: line, sort: ms, seq: seq++ })
      anchor = stamps[0]
    } else entries.push({ ms: null, text: line, sort: anchor, seq: seq++ })
  }
  if (!anyTimed) return null
  entries.sort((a, b) => a.sort - b.sort || a.seq - b.seq)
  return tidy(entries.map((e) => ({ ms: e.ms === null ? null : Math.max(0, e.ms - offset), text: e.text })))
}

/** Lyrics text (LRC or plain) to { synced, lines }; null when there is nothing to show. */
export function lyricsFromText(text) {
  const s = String(text ?? '').replace(/^﻿/, '')
  if (!s.trim()) return null
  const lrc = parseLrc(s)
  if (lrc) return lrc.some((l) => l.text) ? { synced: true, lines: lrc } : null
  const lines = tidy(s.split(/\r\n|\n|\r/).map((l) => ({ ms: null, text: clip(l.trim()) })))
  return lines.length ? { synced: false, lines } : null
}

// ---------------------------------------------------------------- text decoding

const swap16 = (buf) => {
  const b = Buffer.from(buf.subarray(0, buf.length & ~1))
  return b.swap16()
}

/** Bytes of a text file: UTF-8 (BOM optional) or UTF-16 LE/BE with a BOM. */
export function decodeTextFile(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  if (buf[0] === 0xfe && buf[1] === 0xff) return swap16(buf.subarray(2)).toString('utf16le')
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8')
  return buf.toString('utf8')
}

// ID3 text encodings: 0 ISO-8859-1, 1 UTF-16 with BOM, 2 UTF-16BE, 3 UTF-8.
function decodeId3(buf, enc, state = {}) {
  let s
  if (enc === 0) s = buf.toString('latin1')
  else if (enc === 3) s = buf.toString('utf8')
  else {
    let be = enc === 2 || state.be === true
    let body = buf
    if (enc === 1 && body[0] === 0xff && body[1] === 0xfe) (be = false), (body = body.subarray(2))
    else if (enc === 1 && body[0] === 0xfe && body[1] === 0xff) (be = true), (body = body.subarray(2))
    if (enc === 1) state.be = be // later strings without a BOM follow the first one
    s = (be ? swap16(body) : body.subarray(0, body.length & ~1)).toString('utf16le')
  }
  return s.replace(/\u0000+$/, '').replace(/^﻿/, '')
}

/** End of a terminated string from `start` (index of the terminator), or -1. */
function terminator(buf, start, enc) {
  if (enc === 1 || enc === 2) {
    for (let i = start; i + 1 < buf.length; i += 2) if (buf[i] === 0 && buf[i + 1] === 0) return i
    return -1
  }
  return buf.indexOf(0, start)
}
const termSize = (enc) => (enc === 1 || enc === 2 ? 2 : 1)

// ---------------------------------------------------------------- ID3v2

const syncsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3]
const isSyncsafe = (b, o) => !((b[o] | b[o + 1] | b[o + 2] | b[o + 3]) & 0x80)

/** Undoes ID3 unsynchronisation: every 0xFF 0x00 becomes 0xFF. */
export function deunsync(buf) {
  const out = Buffer.alloc(buf.length)
  let n = 0
  for (let i = 0; i < buf.length; i++) {
    out[n++] = buf[i]
    if (buf[i] === 0xff && buf[i + 1] === 0x00) i++
  }
  return out.subarray(0, n)
}

/** USLT body (after flags are undone) to lyrics text. */
export function parseUslt(b) {
  if (b.length < 5) return null
  const enc = b[0]
  if (enc > 3) return null
  const end = terminator(b, 4, enc)
  if (end < 0) return null
  const state = {}
  decodeId3(b.subarray(4, end), enc, state)
  return decodeId3(b.subarray(end + termSize(enc)), enc, state)
}

/** SYLT body to synced lines; null unless the timestamps are milliseconds (format 2). */
export function parseSylt(b) {
  if (b.length < 7) return null
  const enc = b[0]
  if (enc > 3 || b[4] !== 2) return null
  const state = {}
  let p = terminator(b, 6, enc)
  if (p < 0) return null
  decodeId3(b.subarray(6, p), enc, state)
  p += termSize(enc)
  const lines = []
  while (p < b.length && lines.length < MAX_LINES) {
    const end = terminator(b, p, enc)
    if (end < 0 || end + termSize(enc) + 4 > b.length) break
    const text = decodeId3(b.subarray(p, end), enc, state)
    const at = end + termSize(enc)
    lines.push({ ms: b.readUInt32BE(at), text: clip(text.replace(/^[\r\n]+|[\r\n]+$/g, '').replace(/\s*[\r\n]+\s*/g, ' ').trim()) })
    p = at + 4
  }
  lines.sort((x, y) => x.ms - y.ms)
  return lines.some((l) => l.text) ? lines : null
}

/** A frame's body with its v2.3/v2.4 flags undone; null when it cannot be read (encrypted, bad). */
function frameBody(body, major, flags, tagUnsync) {
  let b = body
  try {
    if (major === 4) {
      if (flags & 0x04) return null // encrypted
      if (flags & 0x40) b = b.subarray(1) // group id
      if (flags & 0x01) b = b.subarray(4) // data length indicator
      if (flags & 0x02 || tagUnsync) b = deunsync(b)
      if (flags & 0x08) b = inflateSync(b, { maxOutputLength: FRAME_CAP })
    } else {
      if (flags & 0x40) return null // encrypted
      const compressed = flags & 0x80
      if (compressed) b = b.subarray(4) // decompressed size
      if (flags & 0x20) b = b.subarray(1) // group id
      if (compressed) b = inflateSync(b, { maxOutputLength: FRAME_CAP })
    }
  } catch {
    return null
  }
  return b
}

/**
 * Walks the frames of an ID3v2.3/2.4 tag at the start of `read(pos, len)`. For each frame calls
 * `visit({ id, size, flags, offset, body })`: `body()` resolves with the frame's bytes, flags undone
 * (null when it cannot be read: encrypted, bad compression, over FRAME_CAP); `offset` is where those
 * bytes sit in the file when they are stored as is, else null. A visitor returning 'stop' ends the
 * walk. Resolves with { total, major } (total: the tag's size, so a stream behind it can be found),
 * or null when there is no ID3v2 tag.
 */
export async function walkId3(read, visit) {
  const h = await read(0, 10)
  if (h.length < 10 || h.toString('latin1', 0, 3) !== 'ID3' || !isSyncsafe(h, 6)) return null
  const major = h[3]
  const flags = h[5]
  const size = syncsafe(h, 6)
  const total = 10 + size + (major === 4 && flags & 0x10 ? 10 : 0)
  const found = { total, major }
  if (major !== 3 && major !== 4) return found
  const tagUnsync = Boolean(flags & 0x80)
  let limit = Math.min(size, ID3_CAP)
  let at = (pos, len) => read(10 + pos, Math.max(0, Math.min(len, limit - pos)))
  let mapped = true // positions in `at` are file positions minus 10
  // In v2.3 the whole tag is unsynchronised, frame headers included: undo it first.
  if (major === 3 && tagUnsync) {
    const whole = deunsync(await read(10, limit))
    limit = whole.length
    at = async (pos, len) => whole.subarray(pos, Math.min(pos + len, limit))
    mapped = false
  }
  let p = 0
  if (flags & 0x40) {
    const ext = await at(0, 4)
    if (ext.length < 4) return found
    p = major === 4 ? syncsafe(ext, 0) : 4 + ext.readUInt32BE(0)
  }
  while (p + 10 <= limit) {
    const fh = await at(p, 10)
    if (fh.length < 10) break
    const id = fh.toString('latin1', 0, 4)
    if (!/^[A-Z0-9]{4}$/.test(id)) break // padding or garbage
    // Some v2.4 writers store plain sizes; a byte with the high bit set gives that away.
    const fsize = major === 4 && isSyncsafe(fh, 4) ? syncsafe(fh, 4) : fh.readUInt32BE(4)
    p += 10
    if (fsize > limit - p) break
    const fflags = fh[9]
    const asIs = mapped && !tagUnsync && (major === 4 ? !(fflags & 0x4f) : !(fflags & 0xe0))
    const start = p
    const body = async () => (fsize <= FRAME_CAP ? frameBody(await at(start, fsize), major, fflags, tagUnsync) : null)
    if ((await visit({ id, size: fsize, flags: fflags, offset: asIs ? 10 + start : null, body })) === 'stop') break
    p += fsize
  }
  return found
}

/** The values of an ID3 text frame (T***) body: v2.4 separates several with NUL. */
export function id3Text(b) {
  if (!b || b.length < 1 || b[0] > 3) return []
  return decodeId3(b.subarray(1), b[0])
    .split('\u0000')
    .map((v) => v.trim())
    .filter(Boolean)
}

/**
 * Reads an ID3v2 tag at the start of `src` ({ read(pos, len) }). Returns its total size (so a FLAC
 * stream behind it can be found) and the lyrics candidates it holds: SYLT first, then USLT.
 */
export async function readId3(read) {
  const synced = []
  const plain = []
  const found = await walkId3(read, async ({ id, body }) => {
    if (id !== 'USLT' && id !== 'SYLT') return
    const b = await body()
    if (b && id === 'SYLT') {
      const lines = parseSylt(b)
      if (lines) synced.push({ synced: true, lines: tidy(lines) })
    } else if (b) {
      const lyr = lyricsFromText(parseUslt(b))
      if (lyr) plain.push(lyr)
    }
  })
  if (!found) return null
  return { total: found.total, candidates: [...synced, ...plain] }
}

// ---------------------------------------------------------------- FLAC

/** VORBIS_COMMENT block body to { KEY: [values] } (keys upper-cased); stops at corruption. */
export function parseVorbisComment(b) {
  const out = {}
  try {
    let p = 4 + b.readUInt32LE(0)
    const n = b.readUInt32LE(p)
    p += 4
    for (let i = 0; i < n && p + 4 <= b.length; i++) {
      const len = b.readUInt32LE(p)
      p += 4
      if (len > b.length - p) break
      const s = b.toString('utf8', p, p + len)
      p += len
      const eq = s.indexOf('=')
      if (eq <= 0) continue
      const key = s.slice(0, eq).toUpperCase()
      ;(out[key] ??= []).push(s.slice(eq + 1))
    }
  } catch {
    /* truncated: keep what was read */
  }
  return out
}

/**
 * Walks the metadata block headers of a FLAC stream at `start`, skipping each block by its length,
 * up to the last-block flag or the byte cap. Calls `visit({ type, pos, len, last })` (pos: where
 * the block's body starts); a visitor returning 'stop' ends the walk. Resolves false when the
 * stream is not FLAC, else true.
 */
export async function walkFlac(read, start, visit) {
  if ((await read(start, 4)).toString('latin1') !== 'fLaC') return false
  let pos = start + 4
  const end = start + FLAC_META_CAP
  while (pos + 4 <= end) {
    const h = await read(pos, 4)
    if (h.length < 4) break
    const last = Boolean(h[0] & 0x80)
    const type = h[0] & 0x7f
    const len = h.readUIntBE(1, 3)
    pos += 4
    if (type === 127) break // invalid block type
    if ((await visit({ type, pos, len, last, end })) === 'stop') break
    pos += len
    if (last) break
  }
  return true
}

/** FLAC's lyrics tags, synced first. */
export function vorbisLyrics(tags) {
  const cands = ['SYNCEDLYRICS', 'LYRICS', 'UNSYNCEDLYRICS'].flatMap((k) => tags[k] ?? []).map(lyricsFromText).filter(Boolean)
  return [...cands.filter((c) => c.synced), ...cands.filter((c) => !c.synced)]
}

/**
 * Lyrics candidates of a FLAC stream at `start`: walks the metadata block headers, skips every
 * block but VORBIS_COMMENT by its length, stops at the last-block flag or the byte cap.
 */
export async function readFlac(read, start = 0) {
  let found = []
  const isFlac = await walkFlac(read, start, async ({ type, pos, len, end }) => {
    if (type !== 4) return
    if (len > FRAME_CAP || pos + len > end) return 'stop'
    const body = await read(pos, len)
    if (body.length < len) return 'stop' // truncated file
    found = vorbisLyrics(parseVorbisComment(body))
    return 'stop'
  })
  return isFlac ? found : null
}

// ---------------------------------------------------------------- the playing file

/** The local path behind what AIMP reports, or null for a stream (cloud://, http://...). */
export function localPath(fileName) {
  const f = String(fileName ?? '')
  if (/^file:/i.test(f)) {
    try {
      return fileURLToPath(f)
    } catch {
      return null
    }
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(f)) return null
  return f
}
export const isStream = (fileName) => localPath(fileName) === null && Boolean(String(fileName ?? ''))

async function tagCandidates(path) {
  const fh = await open(path, 'r')
  try {
    const read = async (pos, len) => {
      const buf = Buffer.alloc(len)
      const { bytesRead } = await fh.read(buf, 0, len, pos)
      return buf.subarray(0, bytesRead)
    }
    const id3 = await readId3(read).catch(() => null)
    const flac = await readFlac(read, id3?.total ?? 0).catch(() => null)
    return [...(id3?.candidates ?? []), ...(flac ?? [])]
  } finally {
    await fh.close()
  }
}

async function sidecar(path) {
  const lrc = join(dirname(path), basename(path, extname(path)) + '.lrc')
  const st = await stat(lrc)
  if (!st.isFile() || st.size > LRC_CAP) return null
  return lyricsFromText(decodeTextFile(await readFile(lrc)))
}

/**
 * Lyrics of a playing track: { source: 'tag'|'lrc'|null, synced, lines: [{ ms|null, text }],
 * reason?: 'cloud'|'none'|'unreadable' }. Never throws.
 */
export async function readLyrics(fileName) {
  const path = localPath(fileName)
  if (path === null) return empty('cloud')
  if (!path || !isAbsolute(path)) return empty('unreadable')
  try {
    if (!(await stat(path)).isFile()) return empty('unreadable')
  } catch {
    return empty('unreadable')
  }
  let readable = true
  const tags = await tagCandidates(path).catch(() => ((readable = false), []))
  const pick = (c, source) => ({ source, synced: c.synced, lines: c.lines })
  const tagSynced = tags.find((c) => c.synced)
  if (tagSynced) return pick(tagSynced, 'tag')
  const lrc = await sidecar(path).catch(() => null)
  if (lrc?.synced) return pick(lrc, 'lrc')
  if (tags.length) return pick(tags[0], 'tag')
  if (lrc) return pick(lrc, 'lrc')
  return empty(readable ? 'none' : 'unreadable')
}
