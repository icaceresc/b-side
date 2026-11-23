// The library: which folders (the `libraryFolders` setting, else the Windows Music folder), a
// background scan through the helper, tags read from local files only, the model, search and
// images, and the `library.*` panel handlers. Handlers answer from the last complete index while a
// scan runs. Paths never leave the worker: the panel gets names and opaque ids.
import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { win32 } from 'node:path'
import { isVirtualPath } from '../cloud/library.mjs'
import { localPath } from '../lyrics.mjs'
import { defaultCacheDir, loadIndex, saveIndex } from './cache.mjs'
import { createImageStore, SIZES } from './images.mjs'
import { buildModel, pathKey } from './model.mjs'
import { folderName, isCloudOnly, listFolder, parseFolders } from './scan.mjs'
import { createSearchIndex } from './search.mjs'
import { readTags as readFileTags } from './tags.mjs'

const STALE_MS = 15 * 60 * 1000 // an index older than this is refreshed in the background
const RETRY_MS = 30 * 1000 // after a failed scan, no automatic retry before this
const MAX_TRACKS_PAGE = 1000 // one library.tracks answer stays well under Orca's ~1 MiB
const MAX_SEARCH = 100

function invalid(message) {
  const error = new Error(message)
  error.code = 'invalid'
  return error
}
function notFound(what) {
  const error = new Error(`Unknown ${what}`)
  error.code = 'not_found'
  return error
}

const idArg = (v, what) => {
  if (typeof v !== 'string' || !v || v.length > 64) throw invalid(`${what} needs an id`)
  return v
}
const intArg = (v, fallback, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback)

/** Runs `work` over `items`, at most `n` at a time. */
async function pool(items, n, work) {
  let next = 0
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  })
  await Promise.all(runners)
}

// Names Windows gives a OneDrive's music folder in the languages B-Side speaks (and a few more).
const MIN_SUGGESTED_TRACKS = 20
const MUSIC_NAMES = new Set(['music', 'música', 'musica', 'musik', 'musique', 'muziek', 'musiikki', 'muzyka', 'hudba', 'zene', '音楽', '音乐', '音樂', '음악', 'музыка', 'музика'])

/**
 * Every OneDrive folder Windows tells about (personal and work): from the environment, and from
 * OneDrive's own registry keys, since Orca may start the worker without those variables.
 */
export async function oneDriveRoots(env = process.env, regQuery = queryOneDriveRegistry) {
  const found = ['OneDriveConsumer', 'OneDrive', 'OneDriveCommercial'].map((k) => env[k])
  try {
    found.push(...(await regQuery(env)))
  } catch {
    /* no registry answer: the environment is enough */
  }
  const seen = new Set()
  return found.filter((p) => typeof p === 'string' && win32.isAbsolute(p) && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()))
}

/** UserFolder of each account under HKCU\Software\Microsoft\OneDrive\Accounts (read-only). */
export function queryOneDriveRegistry(env = process.env) {
  const reg = win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe')
  return new Promise((resolve, reject) => {
    execFile(reg, ['query', 'HKCU\\Software\\Microsoft\\OneDrive\\Accounts', '/s', '/v', 'UserFolder'], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      if (error) return reject(error)
      resolve([...String(stdout).matchAll(/^\s*UserFolder\s+REG_\w+\s+(.+?)\s*$/gm)].map((m) => m[1]))
    })
  })
}

const childNames = async (dir) => {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => pathKey(x) === pathKey(b[i]))

/**
 * `helper`: the AIMP helper client ({ request }). `settings`: Orca's worker settings API
 * ({ get(key) }), or null. `cloud`: the OneDrive library (src/cloud/library.mjs) whose records join
 * the local ones, or null. Returns { handlers, idsForPath, trackPaths, albumTrackIds, ... }.
 */
export function createLibrary({ helper, settings = null, env = process.env, oneDrive = () => oneDriveRoots(env), cacheDir = defaultCacheDir(), readTags = readFileTags, now = () => Date.now(), log = () => {}, concurrency = 6, staleMs = STALE_MS, cloud = null }) {
  let model = buildModel([])
  let index = createSearchIndex(model)
  let files = []
  let indexFolders = []
  let scannedAt = null
  let missing = []
  let lastError = null
  let failedAt = -Infinity
  let progress = null
  let scanning = null
  let again = false
  let loading = null
  let musicFolder // resolved once per worker: undefined until asked
  let version = 0 // changes with every new model (a scan, a OneDrive sync), for the panel
  const images = createImageStore({ helper, cacheDir, localCopy: (path) => cloud?.localCopy(path) ?? null, cloudDir: cloud?.thumbDir ?? null })

  const build = () => {
    model = buildModel(cloud ? [...files, ...cloud.records()] : files)
    index = createSearchIndex(model)
    version = Math.max(version + 1, now())
  }
  const setIndex = (records, folders, at) => {
    files = records
    indexFolders = folders
    scannedAt = at
    build()
  }

  const ensureLoaded = () =>
    (loading ??= (async () => {
      await cloud?.ensureLoaded().catch(() => {})
      const saved = await loadIndex(cacheDir)
      if (saved && scannedAt === null) {
        setIndex(saved.files, saved.folders, saved.scannedAt ?? null)
        missing = Array.isArray(saved.missing) ? saved.missing : []
      } else if (cloud?.records().length) build()
    })().catch(() => {}))

  /** The folders to index, or null while they cannot be known (the helper is not answering). */
  async function wantedFolders() {
    let text = ''
    try {
      const v = await settings?.get?.('libraryFolders')
      if (typeof v === 'string') text = v
    } catch {
      /* no settings: the Music folder */
    }
    const list = parseFolders(text)
    if (list.length) return list
    if (musicFolder === undefined) {
      try {
        const m = await helper.request('musicFolder', {}, { timeout: 20000 })
        musicFolder = typeof m === 'string' && m ? m : null
      } catch {
        return null // try again on the next call; never index "no folders" over a saved index
      }
    }
    return musicFolder ? parseFolders(musicFolder) : []
  }

  async function scan(folders) {
    const started = now()
    progress = { phase: 'listing', done: 0, total: 0 }
    const found = []
    const miss = []
    let failure = null
    let failures = 0
    for (const root of folders) {
      try {
        const r = await listFolder(helper, root)
        if (r.missing) miss.push(folderName(root))
        if (r.truncated) log(`library: ${folderName(root)} has more files than B-Side lists`)
        for (const e of r.entries) found.push({ ...e, root })
      } catch (error) {
        // Listing failed (not "missing"): keep what the last index had there.
        failures++
        failure = error
        for (const f of files) if (f.root && pathKey(f.root) === pathKey(root)) found.push(f)
        log(`library: cannot list ${folderName(root)} (${error.message})`)
      }
      progress.done = progress.total = found.length
    }
    // The helper failed on every folder: keep the index there is.
    if (failures && failures === folders.length) throw failure
    const before = new Map(files.map((f) => [pathKey(f.path), f]))
    const audio = found.filter((f) => f.kind === 'audio')
    progress = { phase: 'reading', done: 0, total: audio.length }
    let read = 0
    await pool(audio, concurrency, async (f) => {
      // Cloud-only: names only, never opened. Unchanged local files keep the tags read before.
      if (!isCloudOnly(f.attrs)) {
        const old = before.get(pathKey(f.path))
        if (old?.tags && old.size === f.size && old.mtime === f.mtime && !isCloudOnly(old.attrs)) f.tags = old.tags
        else {
          read++
          f.tags = await readTags(f.path, { size: f.size }).catch(() => null)
        }
      }
      progress.done++
    })
    const at = now()
    setIndex(found, folders, at)
    missing = miss
    lastError = null
    await saveIndex(cacheDir, { folders, scannedAt: at, files: found, missing: miss }).catch((error) => log(`library: cannot save the index (${error.message})`))
    log(`library: ${model.counts.tracks} tracks, ${read} read, in ${now() - started} ms`)
  }

  function startScan(folders) {
    if (scanning) {
      again = true
      return
    }
    scanning = (async () => {
      try {
        const list = folders ?? (await wantedFolders())
        if (!list) throw new Error('The library folders are not known yet: the helper did not answer')
        await scan(list)
      } catch (error) {
        lastError = error?.message ?? String(error)
        failedAt = now()
        log(`library: scan failed (${lastError})`)
      } finally {
        progress = null
        scanning = null
        if (again) {
          again = false
          startScan()
        }
      }
    })()
  }

  /** Loads the saved index and starts a background scan when it is missing, stale or elsewhere. */
  async function touch(folders) {
    await ensureLoaded()
    if (scanning || now() - failedAt < RETRY_MS) return
    const want = folders ?? (scannedAt === null ? await wantedFolders() : indexFolders)
    if (!want) return
    if (scannedAt === null || !sameList(want, indexFolders) || now() - scannedAt > staleMs) startScan(want)
  }

  const state = () => (scanning ? 'scanning' : model.counts.tracks ? 'ready' : lastError ? 'error' : 'empty')
  const withAlbum = (t) => {
    const al = model.albumById.get(t.albumId)
    return { ...t, album: al?.title ?? '', cover: al?.cover ?? null }
  }

  const handlers = {
    'library.status': async () => {
      await ensureLoaded()
      const folders = await wantedFolders()
      await touch(folders ?? undefined)
      void cloud?.touch().catch(() => {})
      const out = { state: state(), folders: (folders ?? indexFolders).map(folderName), counts: { ...model.counts }, version }
      const online = cloud?.status().folders.map((f) => f.name) ?? []
      if (online.length) out.cloudFolders = online
      if (progress) out.progress = { ...progress }
      if (scannedAt !== null) out.scannedAt = scannedAt
      if (lastError) out.error = lastError
      if (missing.length) out.missingFolders = [...missing]
      return out
    },

    'library.rescan': async () => {
      await ensureLoaded()
      const folders = await wantedFolders()
      if (!folders) throw Object.assign(new Error('The library folders are not known yet: the helper did not answer'), { code: 'helper_failed' })
      startScan(folders)
      return { started: true }
    },

    // Where music may be, for the first-run screen: the Windows Music folder and the music folder
    // of each OneDrive (its name is localized: Music, Música, Musik, 音楽…), each with the number of
    // audio files it holds. These are the person's own folders, shown to them in their panel.
    'library.suggestFolders': async () => {
      const candidates = []
      if (musicFolder === undefined) {
        try {
          const m = await helper.request('musicFolder', {}, { timeout: 20000 })
          musicFolder = typeof m === 'string' && m ? m : null
        } catch {
          /* no Music folder: OneDrive's may still be there */
        }
      }
      if (musicFolder) candidates.push(musicFolder)
      const roots = await oneDrive()
      // A short place for each card ("OneDrive", or "pc" for the panel to word): full paths stay in tooltips.
      const placeOf = (p) => {
        const root = roots.find((r) => pathKey(p).startsWith(pathKey(r) + String.fromCharCode(92)) || pathKey(p) === pathKey(r))
        return root ? folderName(root) : 'pc'
      }
      for (const root of roots) {
        for (const name of await childNames(root)) if (MUSIC_NAMES.has(name.toLowerCase())) candidates.push(win32.join(root, name))
      }
      const current = (await wantedFolders()) ?? []
      const seen = new Set()
      const out = []
      for (const path of candidates) {
        const key = pathKey(path)
        if (seen.has(key)) continue
        seen.add(key)
        let audio
        try {
          const r = await listFolder(helper, path)
          if (r.missing) continue
          audio = r.entries.filter((e) => e.kind === 'audio')
        } catch {
          continue
        }
        const isCurrent = (p) => current.some((c) => pathKey(c) === pathKey(p))
        out.push({ path, name: folderName(path), place: placeOf(path), tracks: audio.length, current: isCurrent(path) })
        // Its first-level folders with music too, e.g. "Música\Hi-Fi Collection" beside the rest.
        const children = new Map()
        for (const e of audio) {
          const rel = win32.relative(path, e.path).split(/[\\/]/)
          if (rel.length < 2) continue
          const child = win32.join(path, rel[0])
          children.set(child, (children.get(child) ?? 0) + 1)
        }
        if (children.size > 1) {
          for (const [child, n] of children) {
            if (n < MIN_SUGGESTED_TRACKS || seen.has(pathKey(child))) continue
            seen.add(pathKey(child))
            out.push({ path: child, name: folderName(child), parent: folderName(path), place: placeOf(child), tracks: n, current: isCurrent(child) })
          }
        }
      }
      return { folders: out.sort((a, b) => b.tracks - a.tracks) }
    },

    // Saves the library folders (Orca's `libraryFolders` setting) and indexes them. Each must be
    // an existing folder; the panel offers the suggestions above or a path the person pastes.
    'library.setFolders': async ({ folders } = {}) => {
      if (!Array.isArray(folders) || !folders.length || folders.some((f) => typeof f !== 'string')) throw Object.assign(new Error('folders needs a list of folder paths'), { code: 'invalid' })
      const list = parseFolders(folders.join('\n'))
      if (list.length !== folders.length) throw Object.assign(new Error('Each folder must be a full path such as C:\\Music'), { code: 'invalid' })
      for (const f of list) {
        const st = await stat(f).catch(() => null)
        if (!st?.isDirectory()) throw Object.assign(new Error(`Not a folder: ${f}`), { code: 'not_found' })
      }
      if (!settings?.set) throw Object.assign(new Error('Orca did not give B-Side its settings'), { code: 'unavailable' })
      await settings.set('libraryFolders', list.join('\n'))
      await ensureLoaded()
      startScan(list)
      return { folders: list.map(folderName), started: true }
    },

    'library.artists': async () => {
      await touch()
      return { artists: model.artists }
    },

    'library.albums': async ({ artistId, genre } = {}) => {
      await touch()
      let list = model.albums
      if (artistId !== undefined && artistId !== null) list = model.artistAlbums.get(idArg(artistId, 'library.albums artistId')) ?? []
      if (typeof genre === 'string' && genre) {
        const g = genre.toLowerCase()
        list = list.filter((a) => a.genres.some((x) => x.toLowerCase() === g))
      }
      return { albums: list }
    },

    'library.album': async ({ id } = {}) => {
      await touch()
      const album = model.albumById.get(idArg(id, 'library.album'))
      if (!album) throw notFound('album')
      return { album, tracks: model.albumTracks.get(album.id).map((t) => model.trackById.get(t)) }
    },

    'library.artist': async ({ id } = {}) => {
      await touch()
      const artist = model.artistById.get(idArg(id, 'library.artist'))
      if (!artist) throw notFound('artist')
      return { artist: { id: artist.id, name: artist.name, image: artist.image }, albums: model.artistAlbums.get(artist.id) ?? [] }
    },

    'library.genres': async () => {
      await touch()
      return { genres: model.genres }
    },

    'library.tracks': async ({ offset, limit } = {}) => {
      await touch()
      const from = intArg(offset, 0, 0, model.tracks.length)
      const n = intArg(limit, 500, 1, MAX_TRACKS_PAGE)
      return { tracks: model.tracks.slice(from, from + n).map(withAlbum), total: model.tracks.length }
    },

    'library.search': async ({ q, limit } = {}) => {
      await touch()
      if (typeof q !== 'string' || q.length > 200) throw invalid('library.search needs q, a text of at most 200 characters')
      const n = intArg(limit, 20, 1, MAX_SEARCH)
      const hits = index.search(q, n)
      return {
        artists: hits.artists.map((id) => model.artistById.get(id)),
        albums: hits.albums.map((id) => model.albumById.get(id)),
        tracks: hits.tracks.map((id) => withAlbum(model.trackById.get(id)))
      }
    },

    'library.image': async ({ id, size } = {}) => {
      await ensureLoaded()
      idArg(id, 'library.image')
      if (size !== undefined && !(size in SIZES)) throw invalid('library.image size is thumb or large')
      const source = model.images.get(id)
      return { id, dataUrl: source ? await images.get(source, size ?? 'thumb') : null }
    }
  }

  return {
    handlers,
    /** Library ids of what AIMP reports as the playing file, or nulls. Never starts work. */
    idsForPath(fileName) {
      const p = localPath(fileName) ?? cloud?.pathOf(fileName) ?? null
      const trackId = p ? (model.byPath.get(pathKey(p)) ?? null) : null
      return { trackId, albumId: trackId ? model.trackById.get(trackId).albumId : null }
    },
    /** For playback (worker side only): the files of tracks, in order; unknown ids are left out. */
    trackPaths(ids) {
      return ids.filter((id) => model.paths.has(id)).map((id) => {
        const path = model.paths.get(id)
        return { id, path, cloudOnly: model.trackById.get(id).cloudOnly, ...(isVirtualPath(path) ? { cloud: true } : {}) }
      })
    },
    /** The album's track ids in play order, or null for an unknown album. */
    albumTrackIds(albumId) {
      return model.albumTracks.get(albumId) ?? null
    },
    ensureLoaded,
    /** A new model from the same local files and the OneDrive library's current records. */
    rebuild: () => build(),
    /** The library's picture of an artist ('large'), for the playing cloud track; null when none. */
    async artistImage(trackId) {
      const albumId = model.trackById.get(trackId)?.albumId
      const artistId = albumId ? model.albumById.get(albumId)?.artistId : null
      const image = artistId ? model.artistById.get(artistId)?.image : null
      const source = image ? model.images.get(image) : null
      return source ? images.get(source, 'large') : null
    },
    /** The file path of a library track (worker side only). */
    pathOf: (trackId) => model.paths.get(trackId) ?? null,
    rescan: (folders) => startScan(folders),
    /** Resolves once the running scan (if any) is over. */
    idle: async () => {
      while (scanning) await scanning
    },
    get model() {
      return model
    }
  }
}
