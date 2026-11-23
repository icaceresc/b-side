// The library model: artists, albums, tracks and genres built from the scanned files and their
// tags, with folder and file names standing in for missing tags (Artist/Album/NN Title.ext).
// Everything the panel receives is names and opaque ids; paths stay in `paths` and `images`.
import { createHash } from 'node:crypto'
import { win32 } from 'node:path'
import { sameArtist } from '../artist.mjs'
import { isCloudOnly } from './scan.mjs'
import { keyOf } from './search.mjs'
import { codecOfExt, LOSSLESS_CODECS } from './tags.mjs'

export const VARIOUS = 'Various Artists'
const COVER = /^(cover|folder|front|album)\.(jpe?g|png|webp)$/i
const ARTIST_IMG = /^artist\.(jpe?g|png|webp)$/i
const FOLDER_IMG = /^folder\.(jpe?g|png)$/i
const DISC_DIR = /^(?:cd|disc|disk)\s*(\d{1,2})$/i
const COVER_RANK = ['cover', 'folder', 'front', 'album']
const EXT_RANK = ['jpg', 'jpeg', 'png', 'webp']

/** Opaque, stable id: a prefix and 12 characters of a SHA-1. */
export const shortId = (prefix, text) => prefix + createHash('sha1').update(text).digest('base64url').slice(0, 12)

/** A path as a case-insensitive key (Windows file names ignore case). */
export const pathKey = (p) => win32.normalize(String(p)).normalize('NFC').toLowerCase()

export const trackIdOf = (path) => shortId('t', pathKey(path))

/**
 * A file name without its extension, split into disc, number and title: "1-01 Song", "01 - Song",
 * "01. Song" and "01 Song" all give the title "Song".
 */
export function parseFileName(name) {
  const stem = String(name).replace(/\.[a-z0-9]{2,5}$/i, '')
  const m = /^(?:(\d{1,2})[-.](?=\d))?(\d{1,3})(?:\s*[-._]\s*|\s+)(?=\S)/.exec(stem)
  if (!m) return { disc: null, number: null, title: stem.trim() }
  return { disc: m[1] ? Number(m[1]) : null, number: Number(m[2]) || null, title: stem.slice(m[0].length).trim() || stem.trim() }
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
export const byName = (a, b) => collator.compare(a, b)

/** The most common value of a list (first seen wins a tie). */
function mostCommon(values) {
  const counts = new Map()
  let best = null
  let n = 0
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1
    counts.set(v, c)
    if (c > n) (best = v), (n = c)
  }
  return best
}

const rank = (name, order) => {
  const i = order.indexOf(name.toLowerCase())
  return i < 0 ? order.length : i
}
const imageRank = (name) => {
  const [stem, ext] = name.toLowerCase().split('.')
  return rank(stem, COVER_RANK) * 10 + rank(ext, EXT_RANK)
}

/** Album quality: the codec most tracks use, the highest rate and depth; lossless if all are. */
function qualityOf(tracks) {
  if (!tracks.length) return null
  const codec = mostCommon(tracks.map((t) => t.codec))
  const rates = tracks.map((t) => t.sampleRate).filter(Boolean)
  const bits = tracks.map((t) => t.bits).filter(Boolean)
  return {
    codec,
    sampleRate: rates.length ? Math.max(...rates) : null,
    bits: bits.length ? Math.max(...bits) : null,
    lossless: tracks.every((t) => t.lossless)
  }
}

/**
 * Builds the model from file records { path, size, mtime, attrs, kind, root, tags? } (tags only for
 * local audio files that were read). Returns public lists, lookups and the private path maps.
 */
export function buildModel(files) {
  const images = new Map() // imageId -> source { type: 'file'|'embedded', path, size, mtime, offset?, length? }
  const dirImages = new Map() // dir key -> [{ name, file }]
  const lrc = new Set()
  const audioDirs = new Set()
  for (const f of files) {
    const dir = pathKey(win32.dirname(f.path))
    if (f.kind === 'image') {
      if (!dirImages.has(dir)) dirImages.set(dir, [])
      dirImages.get(dir).push({ name: win32.basename(f.path), file: f })
    } else if (f.kind === 'lyrics') lrc.add(pathKey(f.path).replace(/\.lrc$/, ''))
    else if (f.kind === 'audio') audioDirs.add(dir)
  }

  const imageId = (source) => {
    const id = shortId('i', `${source.type}|${pathKey(source.path)}|${source.offset ?? ''}`)
    images.set(id, source)
    return id
  }
  const fileImage = (dir, re, sort = imageRank) => {
    const list = (dirImages.get(pathKey(dir)) ?? []).filter((x) => re.test(x.name) && !isCloudOnly(x.file.attrs))
    list.sort((a, b) => sort(a.name) - sort(b.name) || byName(a.name, b.name))
    const hit = list[0]?.file
    // A OneDrive file B-Side lists through Graph (src/cloud) is fetched by the cloud library.
    return hit ? imageId({ type: hit.cloud ? 'cloud' : 'file', path: hit.path, size: hit.size, mtime: hit.mtime }) : null
  }

  // 1. Tracks, grouped by album folder and album title.
  const groups = new Map()
  for (const f of files) {
    if (f.kind !== 'audio') continue
    const t = f.tags ?? {}
    // OneDrive tracks listed through Graph are never on this PC either.
    const cloudOnly = isCloudOnly(f.attrs) || Boolean(f.cloud)
    let dir = win32.dirname(f.path)
    let folderDisc = null
    const discDir = DISC_DIR.exec(win32.basename(dir))
    const root = f.root ?? win32.parse(f.path).root
    if (discDir && pathKey(win32.dirname(dir)) !== pathKey(root)) {
      folderDisc = Number(discDir[1])
      dir = win32.dirname(dir)
    }
    const rel = win32.relative(root, dir)
    const segs = rel && !rel.startsWith('..') ? rel.split('\\').filter(Boolean) : []
    const folderAlbum = segs.at(-1) ?? ''
    const folderArtist = segs.length >= 2 ? segs.at(-2) : ''
    const fromName = parseFileName(win32.basename(f.path))
    // "2000 - No Strings Attached": a year before the folder's album name, when tags say nothing.
    const dated = /^((?:19|20)\d\d)\s*[-–—.]\s*(\S.*)$/.exec(folderAlbum)
    const album = t.album || (dated ? dated[2] : folderAlbum)
    const track = {
      id: trackIdOf(f.path),
      path: f.path,
      dir,
      root,
      artistDir: segs.length >= 2 ? win32.dirname(dir) : null,
      disc: t.disc || folderDisc || fromName.disc || 1,
      number: t.number || fromName.number || null,
      title: t.title || fromName.title,
      tagArtist: t.artist || '',
      tagAlbumArtist: t.albumArtist || '',
      folderArtist,
      compilation: Boolean(t.compilation),
      album,
      year: t.year || (dated ? Number(dated[1]) : null),
      genres: t.genres ?? [],
      durationMs: t.durationMs || null,
      lyrics: Boolean(t.lyrics) || lrc.has(pathKey(f.path).replace(/\.[^.\\]+$/, '')),
      cloudOnly,
      codec: t.codec || codecOfExt(f.path),
      lossless: t.lossless ?? LOSSLESS_CODECS.has(codecOfExt(f.path)),
      sampleRate: t.sampleRate || null,
      bits: t.bits || null,
      picture: !cloudOnly && t.picture ? { ...t.picture, size: f.size, mtime: f.mtime } : null,
      fileName: win32.basename(f.path)
    }
    const gk = `${pathKey(dir)}|${keyOf(album)}`
    if (!groups.has(gk)) groups.set(gk, [])
    groups.get(gk).push(track)
  }

  // 2. Albums: one album artist per group (ALBUMARTIST || folder artist || ARTIST; mixed artists
  //    with neither is a compilation).
  const albums = new Map()
  const artists = new Map()
  const tracks = new Map()
  const paths = new Map()
  const byPath = new Map()
  const albumTracks = new Map()
  for (const list of groups.values()) {
    list.sort((a, b) => a.disc - b.disc || (a.number ?? 1e9) - (b.number ?? 1e9) || byName(a.fileName, b.fileName))
    const tagged = list.map((t) => t.tagAlbumArtist).filter(Boolean)
    let albumArtist
    if (tagged.length) albumArtist = mostCommon(tagged)
    else if (list[0].folderArtist) albumArtist = list[0].folderArtist
    else if (list.some((t) => t.compilation)) albumArtist = VARIOUS
    else {
      const names = new Set(list.map((t) => keyOf(t.tagArtist)))
      albumArtist = names.size > 1 ? VARIOUS : list[0].tagArtist
    }
    const artistKey = keyOf(albumArtist) || ''
    const artistId = shortId('a', artistKey)
    const head = list[0]
    const albumId = shortId('l', `${artistKey}|${keyOf(head.album)}|${pathKey(head.dir)}`)
    // Cover: an image file in the album folder (or a disc folder), else the first local track's
    // embedded picture. Cloud-only images are never candidates.
    let cover = fileImage(head.dir, COVER)
    for (const sub of new Set(list.map((t) => win32.dirname(t.path)))) cover ??= fileImage(sub, COVER)
    if (!cover) {
      const withPic = list.find((t) => t.picture)
      if (withPic) cover = imageId({ type: 'embedded', path: withPic.path, size: withPic.picture.size, mtime: withPic.picture.mtime, offset: withPic.picture.offset, length: withPic.picture.length })
    }
    const genreCounts = list.flatMap((t) => t.genres)
    const genres = [...new Set(genreCounts.map((g) => g.toLowerCase()))].map((k) => genreCounts.find((g) => g.toLowerCase() === k))
    const years = list.map((t) => t.year).filter(Boolean)
    const album = {
      id: albumId,
      title: head.album,
      artist: albumArtist,
      artistId,
      year: years.length ? mostCommon(years) : null,
      tracks: list.length,
      durationMs: list.reduce((s, t) => s + (t.durationMs || 0), 0),
      cover,
      genres,
      cloudOnly: list.every((t) => t.cloudOnly),
      quality: qualityOf(list)
    }
    albums.set(albumId, album)
    albumTracks.set(
      albumId,
      list.map((t) => t.id)
    )
    for (const t of list) {
      tracks.set(t.id, { id: t.id, albumId, disc: t.disc, number: t.number, title: t.title, artist: t.tagArtist || albumArtist, durationMs: t.durationMs, lyrics: t.lyrics, cloudOnly: t.cloudOnly, bits: t.bits || null })
      paths.set(t.id, t.path)
      byPath.set(pathKey(t.path), t.id)
    }
    if (!artists.has(artistId)) artists.set(artistId, { id: artistId, names: [], albums: [], tracks: 0, dirs: new Set(), albumDirs: [] })
    const a = artists.get(artistId)
    a.names.push(albumArtist)
    a.albums.push(albumId)
    a.tracks += list.length
    if (head.artistDir) a.dirs.add(head.artistDir)
    a.albumDirs.push(head.dir)
  }

  // 3. Artists: the most common spelling; the image from artist.* in the artist folder, folder.*
  //    there when it holds no audio and is named after the artist, then artist.* in an album folder.
  const artistList = []
  for (const a of artists.values()) {
    const name = mostCommon(a.names)
    let image = null
    for (const d of a.dirs) image ??= fileImage(d, ARTIST_IMG)
    for (const d of a.dirs) {
      if (!image && !audioDirs.has(pathKey(d)) && sameArtist(win32.basename(d), name)) image = fileImage(d, FOLDER_IMG)
    }
    for (const d of a.albumDirs) image ??= fileImage(d, ARTIST_IMG)
    artistList.push({ id: a.id, name, albums: a.albums.length, tracks: a.tracks, image, albumIds: a.albums })
  }
  artistList.sort((x, y) => byName(x.name, y.name))

  const albumOrder = (x, y) => (x.year ?? 9999) - (y.year ?? 9999) || byName(x.title, y.title)
  const albumList = [...albums.values()].sort((x, y) => byName(x.artist, y.artist) || albumOrder(x, y))
  const artistAlbums = new Map(artistList.map((a) => [a.id, a.albumIds.map((id) => albums.get(id)).sort(albumOrder)]))

  // 4. Genres.
  const genres = new Map()
  for (const al of albumList) {
    for (const g of al.genres) {
      const k = g.toLowerCase()
      if (!genres.has(k)) genres.set(k, { name: g, albums: 0, tracks: 0 })
      const e = genres.get(k)
      e.albums++
      e.tracks += al.tracks
    }
  }

  // All tracks in artist / album / disc / number order.
  const trackList = albumList.flatMap((al) => albumTracks.get(al.id).map((id) => tracks.get(id)))

  return {
    artists: artistList.map(({ albumIds, ...a }) => a),
    albums: albumList,
    tracks: trackList,
    genres: [...genres.values()].sort((x, y) => byName(x.name, y.name)),
    artistById: new Map(artistList.map(({ albumIds, ...a }) => [a.id, a])),
    albumById: albums,
    trackById: tracks,
    albumTracks,
    artistAlbums,
    images,
    paths,
    byPath,
    counts: { artists: artistList.length, albums: albums.size, tracks: tracks.size, cloudOnly: trackList.filter((t) => t.cloudOnly).length }
  }
}
