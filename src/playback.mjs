// Plays library tracks in AIMP. AIMP's Remote API cannot load files (its "add" and "open"
// commands only show dialogs), so B-Side does what Explorer does, through AIMP's own file
// associations (BSideShell in native/aimp-helper.ps1). Measured on AIMP 4.60 (Store):
//   openFile (verb "open") on an audio file: AIMP handles it as a file opened from another app.
//     With AIMP's default "Add to empty playlist 'Default'" it empties "Default", adds the file
//     and plays it, about 0.3 s after the request.
//   insertFile (verb "AddToPlaylist", AIMP's /INSERT) on a .m3u8: AIMP appends its tracks, in
//     order, to the end of the playing playlist and keeps playing. UTF-8 without BOM.
// So a queue plays as: open its first track, wait until AIMP plays it, then append the rest.
// One playlist is reused. Opening the queue as a .m3u8 instead would add a new playlist tab on
// every play ("Open playlist files in new tabs", on by default), and AIMP cannot start a playlist
// at an entry or insert after the playing track, so "next" rebuilds the queue from the playing
// track and seeks back to where it was.
// Paths come from the library (resolveTracks/albumTracks), never from the panel.
import { randomBytes } from 'node:crypto'
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const MAX_TRACKS = 5000
const MAX_ID = 200
const LIST_PREFIX = 'B-Side-'
const STALE_MS = 10 * 60 * 1000 // AIMP reads a playlist file after the request returns
const OPEN_TIMEOUT_MS = 20000 // opening also starts AIMP when it is closed
const START_TIMEOUT_MS = 15000 // until AIMP plays the opened file (AIMP starting, a cloud file)
const SETTLE_MS = 600 // AIMP reports "stopped" for a moment while it switches files

function codedError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export function queueDir(env = process.env) {
  return join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'B-Side', 'queue')
}

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID
const isIndex = (v) => Number.isInteger(v) && v >= 0

/** Checks a playback request before anything is read or written; bad input throws `invalid`. */
export function playbackArgs(name, input) {
  const a = input && typeof input === 'object' ? input : {}
  const bad = (what) => codedError('invalid', `${name} needs ${what}`)
  const ids = () => {
    if (!Array.isArray(a.trackIds) || a.trackIds.length === 0 || a.trackIds.length > MAX_TRACKS || !a.trackIds.every(isId)) throw bad(`trackIds, 1 to ${MAX_TRACKS} track ids`)
    return [...a.trackIds]
  }
  switch (name) {
    case 'playAlbum':
      if (!isId(a.albumId)) throw bad('albumId, an album id')
      if (a.trackId !== undefined && a.trackId !== null && !isId(a.trackId)) throw bad('trackId, a track id of that album')
      return { albumId: a.albumId, trackId: a.trackId ?? null }
    case 'playTracks': {
      const trackIds = ids()
      const startIndex = a.startIndex ?? 0
      if (!isIndex(startIndex) || startIndex >= trackIds.length) throw bad('startIndex, an index into trackIds')
      return { trackIds, startIndex }
    }
    case 'enqueue': {
      const trackIds = ids()
      if (a.mode !== 'next' && a.mode !== 'end') throw bad("mode, 'next' or 'end'")
      return { trackIds, mode: a.mode }
    }
    default:
      throw codedError('invalid', `Unknown playback request ${name}`)
  }
}

// An absolute local or UNC path that cannot break a playlist line or the helper's quoting.
const isSafePath = (p) => typeof p === 'string' && /^(?:[a-zA-Z]:\\|\\\\[^\\])/.test(p) && !/["\u0000-\u001f]/.test(p)

/** The playlist AIMP reads: extended M3U, UTF-8 without BOM, one absolute path per line. */
export function playlistText(paths) {
  return `#EXTM3U\n${paths.join('\n')}\n`
}

const byDiscAndNumber = (a, b) => (a.disc ?? 0) - (b.disc ?? 0) || (a.number ?? 0) - (b.number ?? 0)
const samePath = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const defaultFs = { mkdir, readdir, rename, stat, unlink, writeFile }

/**
 * call(cmd, args, options): the helper request (createHandlers' `call`).
 * resolveTracks(ids) -> [{ id, path, albumId, disc, number }] for the ids it knows.
 * albumTracks(albumId) -> the same shape for every track of the album, or [] when unknown.
 */
export function createPlayback({ call, resolveTracks, albumTracks, dir = queueDir(), fs = defaultFs, now = () => Date.now(), sleep = delay, random = () => randomBytes(6).toString('hex') }) {
  // The tracks of the B-Side playlist AIMP last opened, in order, to place "next" after the playing one.
  let queue = []
  let chain = Promise.resolve()
  // One request at a time: the queue file and `queue` belong to the last one.
  const serial = (work) => {
    const run = chain.then(work, work)
    chain = run.catch(() => {})
    return run
  }

  async function tracksFor(ids) {
    const found = await resolveTracks(ids)
    const byId = new Map((found ?? []).filter((t) => t && isSafePath(t.path)).map((t) => [t.id, t]))
    // Ids the library no longer knows (a rescan in between) are skipped.
    const tracks = ids.map((id) => byId.get(id)).filter(Boolean)
    if (tracks.length === 0) throw codedError('invalid', 'Those tracks are not in the library')
    return tracks
  }

  async function writeList(name, paths) {
    await fs.mkdir(dir, { recursive: true })
    const file = join(dir, name)
    const tmp = join(dir, `${name}.${random()}.tmp`)
    await fs.writeFile(tmp, playlistText(paths), 'utf8')
    // Written aside and renamed: AIMP never reads half a playlist. AIMP may still be reading the
    // previous one for a moment, which Windows reports as busy.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, file)
        return file
      } catch (error) {
        if (attempt >= 4 || !['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
          await fs.unlink(tmp).catch(() => {})
          throw codedError('aimp_error', `Cannot write the play queue (${error.code ?? error.message})`)
        }
        await sleep(100)
      }
    }
  }

  async function clean() {
    const names = await fs.readdir(dir).catch(() => [])
    await Promise.all(
      names
        .filter((n) => n.startsWith(LIST_PREFIX))
        .map(async (n) => {
          const p = join(dir, n)
          const s = await fs.stat(p).catch(() => null)
          if (s && now() - s.mtimeMs > STALE_MS) await fs.unlink(p).catch(() => {})
        })
    )
  }

  async function state() {
    const raw = await call('state').catch(() => null)
    return raw?.running ? { file: raw.track?.active ? (raw.track.fileName ?? '') : '', state: raw.state, positionMs: raw.positionMs ?? 0 } : null
  }

  // What AIMP is playing or has paused, or null when it is closed or idle. AIMP reads "stopped"
  // for a moment between files, so a stop is checked twice.
  async function playing() {
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = await state()
      if (s?.file && s.state !== 'stopped') return s
      if (!s) return null
      await sleep(SETTLE_MS)
    }
    return null
  }

  // Until AIMP plays `file` after it was asked to open it. When it was already playing that
  // file, AIMP restarts it: wait for the position to go back.
  async function started(file, before) {
    const since = now()
    const again = before && samePath(before.file, file)
    while (now() - since < START_TIMEOUT_MS) {
      const s = await state()
      if (s && samePath(s.file, file) && s.state !== 'stopped' && (!again || s.positionMs + 500 < before.positionMs || (before.positionMs < 1500 && now() - since >= SETTLE_MS))) return
      await sleep(50)
    }
    throw codedError('aimp_timeout', 'AIMP did not start the track')
  }

  async function append(tracks) {
    const file = await writeList(`${LIST_PREFIX}${now()}-${random()}.m3u8`, tracks.map((t) => t.path))
    await call('insertFile', { path: file }, { timeout: OPEN_TIMEOUT_MS })
    await clean()
  }

  // Plays `tracks` as B-Side's queue. resumeMs/paused bring the first track back to where it was.
  async function play(tracks, { resumeMs = 0, paused = false } = {}) {
    const before = await state()
    const first = tracks[0].path
    await call('openFile', { path: first }, { timeout: OPEN_TIMEOUT_MS })
    queue = [tracks[0]]
    // The rest is appended only once AIMP plays the first track: earlier, it would land in the
    // playlist that was playing before.
    const since = now()
    await started(first, before)
    if (resumeMs > 1000) await call('seek', { positionMs: resumeMs + (now() - since) })
    if (paused) await call('pause', {})
    if (tracks.length > 1) await append(tracks.slice(1))
    queue = tracks
    return { ok: true }
  }

  return {
    playAlbum: async (input) => {
      const { albumId, trackId } = playbackArgs('playAlbum', input)
      return serial(async () => {
        const tracks = ((await albumTracks(albumId)) ?? []).filter((t) => t && isSafePath(t.path)).sort(byDiscAndNumber)
        if (tracks.length === 0) throw codedError('invalid', 'That album is not in the library')
        const start = trackId === null ? 0 : tracks.findIndex((t) => t.id === trackId)
        if (start < 0) throw codedError('invalid', 'That track is not on the album')
        return play(tracks.slice(start))
      })
    },

    playTracks: async (input) => {
      const { trackIds, startIndex } = playbackArgs('playTracks', input)
      return serial(async () => play(await tracksFor(trackIds.slice(startIndex))))
    },

    enqueue: async (input) => {
      const { trackIds, mode } = playbackArgs('enqueue', input)
      return serial(async () => {
        const tracks = await tracksFor(trackIds)
        const current = await playing()
        // Nothing playing: there is no queue to add to, so the tracks play.
        if (!current) return play(tracks)
        const at = queue.findIndex((t) => samePath(t.path, current.file))
        if (mode === 'next' && at >= 0) {
          // AIMP's /INSERT only appends, so "next" rebuilds B-Side's queue from the playing track
          // and returns to the same point of it.
          return play([queue[at], ...tracks, ...queue.slice(at + 1)], { resumeMs: current.positionMs, paused: current.state === 'paused' })
        }
        // "end", or "next" while AIMP plays a playlist that is not B-Side's: appended to it.
        await append(tracks)
        if (at >= 0) queue = [...queue, ...tracks]
        return { ok: true }
      })
    }
  }
}
