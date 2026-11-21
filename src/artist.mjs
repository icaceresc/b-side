// The artist's picture for a local track, read-only, from the folders around the playing file
// (Music/Artist/Album/01.flac: the artist folder is Music/Artist). In this order:
//   1. artist.jpg|jpeg|png|webp in the artist folder;
//   2. folder.jpg|jpeg|png in the artist folder, only when that folder looks like an artist's:
//      it holds no audio files itself (an album folder does, and its folder.jpg is that album's
//      cover) and its name matches the track's artist tag (so the root of a Music/Album/ library
//      never lends its folder.jpg to every album);
//   3. artist.jpg|jpeg|png|webp in the album folder.
// A candidate counts only if its first bytes are JPEG, PNG or WEBP and it is at most 700 KB (a
// panel answer stays well under Orca's ~1 MiB as a data URL); otherwise the next one is tried.
import { open, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse } from 'node:path'
import { localPath } from './lyrics.mjs'

export const MAX_IMAGE_BYTES = 700 * 1024
const MAX_ENTRIES = 5000 // names looked at per folder
const ARTIST = /^artist\.(jpe?g|png|webp)$/i
const FOLDER = /^folder\.(jpe?g|png)$/i
const AUDIO = /\.(flac|mp3|m4a|mp4|aac|ogg|oga|opus|wav|wv|ape|aif|aiff|alac|wma|dsf|dff|tak|tta|ofr|mpc)$/i
const RANK = ['jpg', 'jpeg', 'png', 'webp']

/** Image type from the first bytes, or null. */
export function imageType(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b.toString('latin1', 0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png'
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Letters and digits only, lower-cased: "AC/DC" and "ac-dc" are the same artist. */
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '')

export function sameArtist(folderName, artist) {
  const a = norm(folderName)
  const b = norm(artist)
  if (!a || !b) return false
  const strip = (s) => s.replace(/^the/, '')
  // "Artist feat. Guest" still belongs in the Artist folder.
  return a === b || strip(a) === strip(b) || (a.length >= 3 && b.startsWith(a))
}

async function names(dir) {
  try {
    return (await readdir(dir)).slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

const ranked = (list, re) =>
  list.filter((n) => re.test(n)).sort((x, y) => RANK.indexOf(x.split('.').pop().toLowerCase()) - RANK.indexOf(y.split('.').pop().toLowerCase()))

/** The image as a data URL, or null when it is missing, too big or not an image. */
export async function imageDataUrl(path) {
  let fh
  try {
    fh = await open(path, 'r')
    const st = await fh.stat()
    if (!st.isFile() || st.size > MAX_IMAGE_BYTES || st.size < 12) return null
    const buf = Buffer.alloc(st.size)
    const { bytesRead } = await fh.read(buf, 0, st.size, 0)
    const type = imageType(buf.subarray(0, bytesRead))
    return type && bytesRead === st.size ? `data:${type};base64,${buf.toString('base64')}` : null
  } catch {
    return null
  } finally {
    await fh?.close().catch(() => {})
  }
}

/** Candidate image paths for a local track, best first. */
export async function artistCandidates(path, artist = '') {
  const album = dirname(path)
  const artistDir = dirname(album)
  const out = []
  if (artistDir !== album && parse(album).root !== album) {
    const list = await names(artistDir)
    out.push(...ranked(list, ARTIST).map((n) => join(artistDir, n)))
    const isRoot = parse(artistDir).root === artistDir
    if (!isRoot && !list.some((n) => AUDIO.test(n)) && sameArtist(parse(artistDir).base, artist)) out.push(...ranked(list, FOLDER).map((n) => join(artistDir, n)))
  }
  out.push(...ranked(await names(album), ARTIST).map((n) => join(album, n)))
  return out
}

/** Data URL of the artist's picture for what AIMP reports as the playing file; never throws. */
export async function findArtistImage(fileName, { artist = '' } = {}) {
  const path = localPath(fileName)
  if (!path || !isAbsolute(path)) return null
  try {
    for (const candidate of await artistCandidates(path, artist)) {
      const url = await imageDataUrl(candidate)
      if (url) return url
    }
  } catch {
    /* no picture */
  }
  return null
}
