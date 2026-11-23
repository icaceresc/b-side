// The OneDrive folders the person chose, as library records: listed through Graph (`delta`, so a
// later sync only fetches what changed), never downloaded. Each file gets a virtual path under
// VIRTUAL_ROOT (`\\b-side-onedrive\<folder id>\Artist\Album\01 Title.flac`) so the library model
// builds artists, albums and tracks from folder and file names exactly as for local folders; no file
// API ever opens such a path. Tags come from the files themselves: after a sync, the first bytes of
// each new track (where FLAC, MP3 and M4A keep their tags) are read with HTTP Range requests, capped
// per file, never the audio, and kept in the index; OneDrive's own `audio` facet (which its delta
// leaves out for most files) fills what they lack. Covers, artist pictures and .lrc files are
// downloaded on demand (small, capped) into the cache.
//
// On disk, under %LOCALAPPDATA%\B-Side\cloud (never a token):
//   index.json  names, ids, sizes, times, audio facets and tags of the chosen folders, delta links
//   files\      the downloaded covers, artist pictures and lyrics
// In Orca's plugin storage, key `onedrive`: the chosen folders (id and name).
//
// Playing goes through Graph's short-lived download addresses, which AIMP streams without writing
// the track to disk (measured 2026-11-23). Not through My Clouds' `cloud://` addresses: My Clouds
// resolves only the folders someone opened in AIMP, so a whole library cannot play that way.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, win32 } from 'node:path'
import { pathKey } from '../library/model.mjs'
import { AUDIO_EXT, codecOfExt, LOSSLESS_CODECS, readTags } from '../library/tags.mjs'
import { graphError, isDownloadUrl } from './graph.mjs'

export const VIRTUAL_ROOT = '\\\\b-side-onedrive\\'
export const INDEX_VERSION = 1
export const MAX_FOLDERS = 8
export const MAX_SIDECAR_BYTES = { image: 8 * 1024 * 1024, lyrics: 512 * 1024 }
const STORAGE_KEY = 'onedrive'
const STALE_MS = 15 * 60 * 1000
const RETRY_MS = 60 * 1000
const MAX_ITEMS = 200000
const SELECT = 'id,name,size,lastModifiedDateTime,parentReference,folder,file,audio,deleted,root'
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp'])
const MY_CLOUDS = /^cloud:\/\//i
// OneDrive item ids: "B4EDA7E33536282D!27487", "B4EDA7E33536282D!s736346ae...". Anything else is refused.
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9!._-]{0,127}$/
// Reading a cloud track's tags: the formats readTags understands, the bytes one file may cost, how
// many files at once, how often the library is rebuilt meanwhile, and how many failures make a file
// skipped (a later TAG_VERSION reads every file again).
const TAG_EXT = new Set(['flac', 'mp3', 'm4a', 'mp4', 'alac'])
export const MAX_TAG_BYTES = 4 * 1024 * 1024
const TAG_CHUNK = 64 * 1024
const TAG_CONCURRENCY = 3
const TAG_FLUSH = 50
const MAX_TAG_TRIES = 3
export const TAG_VERSION = 1
const TAG_FIELDS = ['title', 'artist', 'albumArtist', 'album', 'number', 'disc', 'year', 'genres', 'compilation', 'codec', 'lossless', 'sampleRate', 'bits', 'channels', 'durationMs']
// A failure that is not the file's: the pass stops and the next sync tries again.
const PASS_ERRORS = new Set(['cancelled', 'offline', 'signed_out', 'busy', 'forbidden'])

export function cloudDir(env = process.env) {
  return join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'B-Side', 'cloud')
}

export const isItemId = (v) => typeof v === 'string' && ITEM_ID.test(v)
export const isVirtualPath = (p) => typeof p === 'string' && p.toLowerCase().startsWith(VIRTUAL_ROOT)
const extOf = (name) => (/\.([a-z0-9]{2,5})$/i.exec(name)?.[1] ?? '').toLowerCase()
export const kindOf = (name) => {
  const ext = extOf(name)
  if (AUDIO_EXT.has(ext)) return 'audio'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (ext === 'lrc') return 'lyrics'
  return null
}

/** OneDrive's audio facet as library tags (only what it has). */
export function tagsFromAudio(audio, name) {
  if (!audio || typeof audio !== 'object') return null
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : '')
  const int = (v) => (Number.isInteger(v) && v > 0 && v < 100000 ? v : null)
  const codec = codecOfExt(name)
  const tags = {
    title: str(audio.title),
    artist: str(audio.artist),
    albumArtist: str(audio.albumArtist),
    album: str(audio.album),
    year: int(audio.year),
    number: int(audio.track),
    disc: int(audio.disc),
    genres: str(audio.genre) ? [str(audio.genre)] : [],
    durationMs: Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : null,
    codec,
    lossless: LOSSLESS_CODECS.has(codec)
  }
  return tags
}

/**
 * OneDrive fills its audio facet for some files and not others. A track without the album's tags
 * takes them from the tagged tracks in its folder, so one album does not split in two.
 */
export function fillAlbumTags(records) {
  const byDir = new Map()
  for (const r of records) {
    if (r.kind !== 'audio') continue
    const dir = r.path.slice(0, r.path.lastIndexOf('\\'))
    if (!byDir.has(dir)) byDir.set(dir, [])
    byDir.get(dir).push(r)
  }
  const common = (list) => {
    const counts = new Map()
    for (const v of list) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  for (const list of byDir.values()) {
    const tagged = list.filter((r) => r.tags?.album)
    if (!tagged.length || tagged.length === list.length) continue
    const album = common(tagged.map((r) => r.tags.album))
    const albumArtist = common(tagged.map((r) => r.tags.albumArtist || r.tags.artist))
    const year = common(tagged.map((r) => r.tags.year))
    for (const r of list) {
      if (r.tags?.album) continue
      r.tags = { ...(r.tags ?? {}), album, albumArtist: albumArtist ?? '', ...(year ? { year } : {}) }
    }
  }
  return records
}

/**
 * What the index keeps of a cloud track's tags (readTags' answer): the values that say something,
 * without the embedded picture's place or the lyrics flag (a cloud track's lyrics are its .lrc).
 */
export function cloudTags(tags) {
  const out = {}
  for (const k of TAG_FIELDS) {
    const v = tags?.[k]
    if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue
    out[k] = typeof v === 'string' ? v.slice(0, 300) : Array.isArray(v) ? v.slice(0, 8).map((g) => String(g).slice(0, 300)) : v
  }
  return out
}

/**
 * A read-only file handle over a download address, for readTags: each read is an HTTP Range request
 * of at least TAG_CHUNK bytes (the last one is kept), and the whole file may cost `budget` bytes.
 */
export function remoteFile(graph, url, size = 0, budget = MAX_TAG_BYTES) {
  let used = 0
  let last = { start: 0, buf: Buffer.alloc(0) }
  async function fetchAt(pos, len) {
    const want = size ? Math.min(Math.max(len, TAG_CHUNK), size - pos) : Math.max(len, TAG_CHUNK)
    if (want <= 0) return Buffer.alloc(0)
    if (used + want > budget) throw graphError('too_big', 'The tags of that file are bigger than B-Side reads')
    used += want
    last = { start: pos, buf: await graph.range(url, pos, want) }
    return last.buf
  }
  return {
    async read(target, offset, len, pos) {
      const inLast = pos >= last.start && pos + len <= last.start + last.buf.length
      const src = inLast ? last.buf.subarray(pos - last.start, pos - last.start + len) : (await fetchAt(pos, len)).subarray(0, len)
      src.copy(target, offset)
      return { bytesRead: src.length, buffer: target }
    },
    async stat() {
      return { size }
    },
    async close() {}
  }
}

const needsTags = (it) => !it.d && TAG_EXT.has(extOf(it.n)) && !(it.t && it.tv === TAG_VERSION) && (it.tx ?? 0) < MAX_TAG_TRIES

const emptyIndex = () => ({ version: INDEX_VERSION, rootId: null, folders: {} })

/**
 * graph: graph.mjs client; storage: Orca's StorageApi or null. onChange(): called after the records
 * changed (a sync, new folders, a disconnect).
 */
export function createCloudLibrary({ graph, storage = null, dir = cloudDir(), now = () => Date.now(), log = () => {}, onChange = () => {}, canSync = async () => true }) {
  let index = emptyIndex()
  let loaded = null
  let config = { folders: [] }
  let records = []
  let byPath = new Map() // pathKey(virtual) -> { id, kind, folderId }
  let byItem = new Map() // item id -> virtual path (audio only)
  let syncing = null
  let tagging = null
  let lastSync = { at: null, error: null, failedAt: -Infinity }
  let progress = null
  const urlPaths = new Map() // a download URL handed to AIMP -> virtual path (for "what is playing")
  // Rises on Disconnect: a sync or download still running then writes nothing back.
  let generation = 0
  const stale = (gen) => {
    if (gen !== generation) throw graphError('cancelled', 'OneDrive was disconnected')
  }

  const indexFile = () => join(dir, 'index.json')
  const filesDir = () => join(dir, 'files')
  // Thumbnails of OneDrive pictures live here too, so Disconnect removes them with the rest.

  async function readConfig() {
    try {
      const v = await storage?.get?.(STORAGE_KEY)
      if (v && typeof v === 'object') {
        config = {
          folders: Array.isArray(v.folders) ? v.folders.filter((f) => f && isItemId(f.id) && typeof f.name === 'string').slice(0, MAX_FOLDERS) : []
        }
      }
    } catch {
      /* no storage: nothing chosen */
    }
  }
  const saveConfig = () => storage?.set?.(STORAGE_KEY, { folders: config.folders })

  async function loadIndex() {
    try {
      const data = JSON.parse(await readFile(indexFile(), 'utf8'))
      if (data?.version === INDEX_VERSION && data.folders && typeof data.folders === 'object') index = data
    } catch {
      index = emptyIndex()
    }
  }
  async function saveIndex() {
    await mkdir(dir, { recursive: true })
    const tmp = `${indexFile()}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(index))
    await rename(tmp, indexFile())
  }

  const ensureLoaded = () =>
    (loaded ??= (async () => {
      await readConfig()
      await loadIndex()
      // Folders no longer chosen are dropped from the index.
      for (const id of Object.keys(index.folders)) if (!config.folders.some((f) => f.id === id)) delete index.folders[id]
      rebuild()
    })())

  // The records the library model reads, and the lookups behind them.
  function rebuild() {
    const out = []
    const paths = new Map()
    const items = new Map()
    for (const f of config.folders) {
      const entry = index.folders[f.id]
      if (!entry?.items) continue
      const root = `${VIRTUAL_ROOT}${f.id}\\`
      const all = entry.items
      // Folder path inside the chosen folder, by id (memoized walk up the parents).
      const rel = new Map([[f.id, []]])
      const relOf = (id, depth = 0) => {
        if (rel.has(id)) return rel.get(id)
        const it = all[id]
        if (!it || !it.d || depth > 64) return null
        const up = relOf(it.p, depth + 1)
        const r = up ? [...up, it.n] : null
        rel.set(id, r)
        return r
      }
      for (const [id, it] of Object.entries(all)) {
        if (it.d) continue
        const kind = kindOf(it.n)
        if (!kind) continue
        const segs = relOf(it.p)
        if (!segs) continue // orphan: its folder was removed or is outside
        const path = root + [...segs, it.n].join('\\')
        const rec = { path, size: it.s ?? 0, mtime: it.m ?? 0, attrs: 0, kind, root, cloud: true }
        if (kind === 'audio') {
          // The file's own tags (read after a sync) over OneDrive's audio facet.
          const facet = tagsFromAudio(it.a, it.n)
          rec.tags = it.t ? { ...(facet ?? { codec: codecOfExt(it.n), lossless: LOSSLESS_CODECS.has(codecOfExt(it.n)) }), ...it.t } : facet
          items.set(id, path)
        }
        paths.set(pathKey(path), { id, kind, folderId: f.id, mtime: it.m ?? 0, size: it.s ?? 0, parent: it.p })
        out.push(rec)
      }
    }
    fillAlbumTags(out)
    records = out
    byPath = paths
    byItem = items
  }

  // Applies one delta page to a folder's items. `before`: the items as they were (a full listing
  // starts from none), so an unchanged file keeps the tags read from it.
  function apply(entry, folderId, list, before = entry.items) {
    for (const it of list) {
      if (!it || !isItemId(it.id)) continue
      if (it.deleted) {
        delete entry.items[it.id]
        continue
      }
      if (it.id === folderId) {
        entry.name = typeof it.name === 'string' ? it.name : entry.name
        continue
      }
      if (typeof it.name !== 'string' || !isItemId(it.parentReference?.id)) continue
      const next = {
        n: it.name,
        p: it.parentReference.id,
        d: Boolean(it.folder),
        s: Number(it.size) || 0,
        m: Date.parse(it.lastModifiedDateTime) || 0,
        ...(it.audio && kindOf(it.name) === 'audio' ? { a: it.audio } : {})
      }
      const old = entry.items[it.id] ?? before?.[it.id]
      if (old && !next.d && old.n === next.n && old.s === next.s && old.m === next.m) {
        if (old.t) Object.assign(next, { t: old.t, tv: old.tv })
        if (old.tx) next.tx = old.tx
      }
      entry.items[it.id] = next
    }
    if (Object.keys(entry.items).length > MAX_ITEMS) throw graphError('too_big', 'That OneDrive folder holds more files than B-Side lists')
  }

  async function syncFolder(f, gen) {
    let entry = index.folders[f.id]
    if (!entry) entry = index.folders[f.id] = { name: f.name, chain: [], deltaLink: null, items: {} }
    // The folders above it (for My Clouds addresses), when the index lost them.
    if (!entry.chain?.length) entry.chain = await chainOf(await graph.get(`/me/drive/items/${encodeURIComponent(f.id)}?$select=id,name,parentReference,root`))
    if (!index.rootId) {
      const rootId = (await graph.get('/me/drive/root?$select=id'))?.id ?? null
      stale(gen)
      index.rootId = rootId
    }
    const fresh = !entry.deltaLink
    const work = fresh ? { ...entry, items: {} } : entry
    let url = fresh ? `/me/drive/items/${encodeURIComponent(f.id)}/delta?$select=${SELECT}` : entry.deltaLink
    try {
      for await (const page of graph.pages(url)) {
        stale(gen)
        apply(work, f.id, Array.isArray(page.value) ? page.value : [], entry.items)
        if (progress) progress.items = Object.keys(work.items).length
        if (typeof page['@odata.deltaLink'] === 'string') work.deltaLink = page['@odata.deltaLink']
      }
    } catch (error) {
      // 410: Graph forgot where B-Side was; list everything again.
      if (error.code === 'gone' && !fresh) {
        entry.deltaLink = null
        return syncFolder(f, gen)
      }
      throw error
    }
    stale(gen)
    index.folders[f.id] = work
  }

  async function sync() {
    await ensureLoaded()
    if (syncing) return syncing
    const gen = generation
    syncing = (async () => {
      progress = { items: 0 }
      try {
        for (const f of config.folders) await syncFolder(f, gen)
        stale(gen)
        lastSync = { at: now(), error: null, failedAt: -Infinity }
        await saveIndex().catch((error) => log(`onedrive: cannot save the index (${error.code ?? error.message})`))
        startTagging(gen)
      } catch (error) {
        if (error.code === 'cancelled' || gen !== generation) return
        lastSync = { ...lastSync, error: error.code ?? 'graph_error', failedAt: now() }
        log(`onedrive: sync failed (${error.code ?? 'error'}${error.status ? ` ${error.status}` : ''})`)
      } finally {
        progress = null
        syncing = null
        rebuild()
        onChange()
      }
    })()
    return syncing
  }

  // Reads the tags of the tracks that have none yet (new or changed files), a few at a time; the
  // library is rebuilt every TAG_FLUSH files so genres, numbers and durations show as they come.
  async function readCloudTags(gen) {
    const todo = []
    for (const f of config.folders) {
      for (const [id, it] of Object.entries(index.folders[f.id]?.items ?? {})) if (needsTags(it)) todo.push({ folderId: f.id, id, it })
    }
    if (!todo.length) return
    let next = 0
    let done = 0
    let failed = 0
    const flush = async () => {
      stale(gen)
      await saveIndex().catch((error) => log(`onedrive: cannot save the index (${error.code ?? error.message})`))
      rebuild()
      onChange()
    }
    const worker = async () => {
      while (next < todo.length) {
        const { folderId, id, it } = todo[next++]
        let tags = null
        try {
          const url = await downloadUrlOf(id)
          stale(gen)
          tags = cloudTags(await readTags(it.n, { size: it.s, openFile: async () => remoteFile(graph, url, it.s) }))
        } catch (error) {
          if (PASS_ERRORS.has(error.code)) throw error
          failed++
        }
        stale(gen)
        // The file may have changed (or gone) while it was read: only the same file takes them.
        const cur = index.folders[folderId]?.items?.[id]
        if (cur && cur.s === it.s && cur.m === it.m) {
          if (tags) {
            Object.assign(cur, { t: tags, tv: TAG_VERSION })
            delete cur.tx
          } else cur.tx = (cur.tx ?? 0) + 1
        }
        if (++done % TAG_FLUSH === 0) await flush()
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(TAG_CONCURRENCY, todo.length) }, worker))
    } finally {
      if (gen === generation) await flush()
      if (failed) log(`onedrive: the tags of ${failed} of ${todo.length} tracks could not be read`)
    }
  }

  function startTagging(gen) {
    tagging ??= readCloudTags(gen)
      .catch((error) => {
        if (error.code !== 'cancelled' && gen === generation) log(`onedrive: reading tags stopped (${error.code ?? 'error'}${error.status ? ` ${error.status}` : ''})`)
      })
      .finally(() => {
        tagging = null
      })
    return tagging
  }

  // id and name of each folder from the drive's root down to `item` (the root itself left out).
  async function chainOf(item) {
    const chain = [{ id: item.id, name: item.name }]
    let parent = item.parentReference?.id
    for (let depth = 0; parent && depth < 64; depth++) {
      const p = await graph.get(`/me/drive/items/${encodeURIComponent(parent)}?$select=id,name,parentReference,root`)
      if (p.root) break
      chain.unshift({ id: p.id, name: p.name })
      parent = p.parentReference?.id
    }
    return chain
  }

  async function itemOfPath(path) {
    await ensureLoaded()
    return byPath.get(pathKey(path)) ?? null
  }

  // A pre-authenticated download address for one of the indexed files (short-lived).
  async function downloadUrlOf(id) {
    const item = await graph.get(`/me/drive/items/${encodeURIComponent(id)}`) // no $select: OneDrive personal leaves the download address out of a selection (seen 2026-11-23)
    const url = item?.['@microsoft.graph.downloadUrl']
    // Only an https address (never a share, a file or Graph itself) goes to AIMP or a download.
    if (typeof url !== 'string' || !isDownloadUrl(url)) throw graphError('graph_error', 'OneDrive gave no download address')
    return url
  }

  return {
    ensureLoaded,
    sync,
    /** Records for the library model (see the header). */
    records: () => records,
    /** Where the library keeps the thumbnails of OneDrive pictures (removed by clear()). */
    thumbDir: join(dir, 'thumbs'),
    isCloudPath: isVirtualPath,

    status: () => ({
      folders: config.folders.map((f) => ({ id: f.id, name: f.name, tracks: [...byPath.values()].filter((x) => x.kind === 'audio' && x.folderId === f.id).length })),
      syncing: Boolean(syncing),
      readingTags: Boolean(tagging),
      progress: progress ? { ...progress } : null,
      syncedAt: lastSync.at,
      error: lastSync.error
    }),

    /** Syncs in the background when the index is older than STALE_MS (and not right after a failure). */
    async touch() {
      await ensureLoaded()
      if (!config.folders.length || syncing || now() - lastSync.failedAt < RETRY_MS) return
      if (lastSync.at !== null && now() - lastSync.at <= STALE_MS) return
      if (await canSync().catch(() => false)) void sync()
    },

    /** Child folders of a OneDrive folder (the root when id is null), for the folder chooser. */
    async browse(id) {
      if (id !== null && !isItemId(id)) throw graphError('invalid', 'Not a OneDrive folder id')
      const base = id ? `/me/drive/items/${encodeURIComponent(id)}` : '/me/drive/root'
      const self = await graph.get(`${base}?$select=id,name,folder,parentReference,root`)
      if (!self.folder && !self.root) throw graphError('invalid', 'That is not a folder')
      const folders = []
      for await (const page of graph.pages(`${base}/children?$select=id,name,folder,file&$top=200`)) {
        for (const it of page.value ?? []) if (it.folder && isItemId(it.id) && typeof it.name === 'string') folders.push({ id: it.id, name: it.name, children: Number(it.folder.childCount) || 0 })
        if (folders.length > 2000) break
      }
      folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
      return {
        folder: { id: self.root ? null : self.id, name: self.root ? null : self.name, parentId: self.root ? null : self.parentReference?.id && !String(self.parentReference.path ?? '').match(/^\/drive\/root:?$/) ? self.parentReference.id : null, chosen: config.folders.some((f) => f.id === self.id) },
        folders: folders.map((f) => ({ ...f, chosen: config.folders.some((c) => c.id === f.id) }))
      }
    },

    /** Chooses the folders to index (ids from browse) and syncs them. */
    async setFolders(ids) {
      await ensureLoaded()
      if (!Array.isArray(ids) || ids.length > MAX_FOLDERS || !ids.every(isItemId)) throw graphError('invalid', `folders needs up to ${MAX_FOLDERS} OneDrive folder ids`)
      const root = await graph.get('/me/drive/root?$select=id')
      if (!isItemId(root?.id)) throw graphError('graph_error', 'OneDrive gave no root folder')
      if (index.rootId && index.rootId !== root.id) index = emptyIndex() // another account
      index.rootId = root.id
      const chosen = []
      for (const id of [...new Set(ids)]) {
        const item = await graph.get(`/me/drive/items/${encodeURIComponent(id)}?$select=id,name,folder,parentReference,root`)
        if (!item.folder || item.root) throw graphError('invalid', 'Choose folders inside your OneDrive')
        chosen.push({ id: item.id, name: item.name, chain: await chainOf(item) })
      }
      config.folders = chosen.map(({ id, name }) => ({ id, name }))
      for (const id of Object.keys(index.folders)) if (!chosen.some((f) => f.id === id)) delete index.folders[id]
      for (const f of chosen) {
        if (index.folders[f.id]) index.folders[f.id].chain = f.chain
        else index.folders[f.id] = { name: f.name, chain: f.chain, deltaLink: null, items: {} }
      }
      await saveConfig()
      rebuild()
      onChange()
      void sync()
      return { folders: config.folders.map((f) => f.name) }
    },

    /** Forgets everything about OneDrive on this PC: chosen folders, index, downloaded sidecars. */
    /** Stops what runs (a sync, a download) from writing anything back; clear() then deletes. */
    cancel() {
      generation++
    },

    /** Resolves once a sync and the tag reading after it are over. */
    async idle() {
      while (syncing || tagging) {
        await syncing
        await tagging
      }
    },

    async clear() {
      await ensureLoaded()
      generation++
      await syncing?.catch(() => {})
      await tagging?.catch(() => {})
      config = { folders: [] }
      index = emptyIndex()
      urlPaths.clear()
      await storage?.delete?.(STORAGE_KEY)?.catch?.(() => {})
      await rm(dir, { recursive: true, force: true }).catch(() => {})
      rebuild()
      onChange()
    },

    /**
     * A small sidecar (cover, artist picture, .lrc) of the index as a local file, downloaded once
     * into the cache; null when it is not one, too big, or unreachable.
     */
    async localCopy(path) {
      const it = await itemOfPath(path)
      if (!it || it.kind === 'audio') return null
      const cap = MAX_SIDECAR_BYTES[it.kind] ?? 0
      if (!cap || it.size > cap) return null
      const name = createHash('sha1').update(`${it.id}|${it.mtime}|${it.size}`).digest('hex').slice(0, 32) + '.' + (extOf(path) || 'bin')
      const file = join(filesDir(), name)
      try {
        await readFile(file, { flag: 'r' }).then((b) => {
          if (b.length !== it.size && it.size) throw new Error('changed')
        })
        return file
      } catch {
        /* not downloaded yet */
      }
      const gen = generation
      try {
        const bytes = await graph.download(await downloadUrlOf(it.id), { maxBytes: cap })
        if (!bytes || gen !== generation) return null
        await mkdir(filesDir(), { recursive: true })
        const tmp = `${file}.${process.pid}.tmp`
        await writeFile(tmp, bytes)
        await rename(tmp, file)
        return file
      } catch (error) {
        log(`onedrive: cannot fetch a ${it.kind} (${error.code ?? 'error'}${error.status ? ` ${error.status}` : ''}: ${error.message})`)
        return null
      }
    },

    /** The .lrc beside a cloud track, as a local copy, or null. */
    async lyricsCopy(trackPath) {
      const lrc = trackPath.replace(/\.[^.\\]+$/, '.lrc')
      return (await itemOfPath(lrc)) ? this.localCopy(lrc) : null
    },

    /** What AIMP gets to play a cloud track: a short-lived download address (it holds a credential). */
    async playEntry(path) {
      const it = await itemOfPath(path)
      if (!it || it.kind !== 'audio') throw graphError('not_found', 'That track is no longer in OneDrive')
      const url = await downloadUrlOf(it.id)
      urlPaths.set(url, path)
      if (urlPaths.size > 500) urlPaths.delete(urlPaths.keys().next().value)
      return { kind: 'url', entry: url }
    },

    /**
     * The virtual path of what AIMP reports as playing, when it is one of these tracks: a download
     * address B-Side handed out, or the same file played from AIMP's My Clouds (its address ends
     * with the OneDrive item id).
     */
    pathOf(fileName) {
      const f = String(fileName ?? '')
      if (MY_CLOUDS.test(f)) {
        const id = /\/([^/]+)\.[a-z0-9]{2,5}$/i.exec(f)?.[1]
        return (id && byItem.get(id)) ?? null
      }
      return urlPaths.get(f) ?? null
    }
  }
}
