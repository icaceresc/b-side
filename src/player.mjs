// What the panel asks for, answered from AIMP (through the helper) and a light connectivity
// check. Every failure carries a `code` the panel turns into a clear message:
//   aimp_closed   AIMP is not running
//   aimp_timeout  AIMP did not answer
//   helper_failed the local helper could not start
//   invalid       the panel sent an unknown command or bad arguments
//   aimp_error    AIMP refused the request
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { connect as netConnect } from 'node:net'
import { join } from 'node:path'
import { findArtistImage } from './artist.mjs'
import { createLibrary } from './library/index.mjs'
import { cloudOnlyFile, listedAttrs } from './library/scan.mjs'
import { decodeTextFile, isStream, lyricsFromText, readLyrics } from './lyrics.mjs'
import { createPlayback } from './playback.mjs'

export const AIMP_STORE_APP = '25018ArtemIzmaylov.AIMP_4hdg3aaevdv22!AIMP'
const LOSSLESS = new Set(['FLAC', 'ALAC', 'WAV', 'AIFF', 'AIF', 'APE', 'WV', 'TAK', 'TTA', 'OFR', 'DSF', 'DFF'])
export const COMMANDS = new Set(['playPause', 'play', 'pause', 'stop', 'next', 'previous', 'seek', 'volume', 'shuffle', 'repeat', 'mute'])
const MAX_POSITION_MS = 2 ** 31 - 1 // the helper passes it to AIMP as a 32-bit int
// AIMP fades out on pause and still reports "playing" meanwhile (about 0.5 s on AIMP 4.60).
const PAUSE_FADE_MS = 1000

export function codedError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/** Codec from the file name AIMP reports (local path or cloud URL); null when unknown. */
export function codecOf(fileName) {
  const clean = String(fileName ?? '').split(/[?#]/)[0]
  const m = /\.([a-z0-9]{2,5})$/i.exec(clean)
  return m ? m[1].toUpperCase() : null
}

/** Honest quality summary: only what AIMP reports (AIMP does not expose bit depth). */
export function describeQuality(track) {
  if (!track?.active) return null
  const codec = codecOf(track.fileName)
  const lossless = codec ? LOSSLESS.has(codec) : null
  const rate = track.sampleRate || null
  return {
    codec,
    lossless,
    sampleRate: rate,
    sampleRateLabel: rate ? `${Number.isInteger(rate / 1000) ? rate / 1000 : (rate / 1000).toFixed(1)} kHz` : null,
    bitrate: track.bitrate || null,
    channels: track.channels || null,
    cd: Boolean(lossless && rate === 44100 && track.channels === 2)
  }
}

const safeDecode = (text) => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text // a literal "%" in a file name
  }
}

export const titleFromFile = (fileName) =>
  safeDecode(String(fileName ?? '').split(/[?#]/)[0].split(/[\\/]/).pop() ?? '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/^\d{1,3}[\s._-]+/, '')

/**
 * What the panel gets to tell tracks apart. A web address stands in as a hash: OneDrive's download
 * links carry a credential in their path and query, and the panel never needs the address itself.
 */
export const fileKey = (fileName) => {
  const f = String(fileName ?? '')
  return /^https?:/i.test(f) ? 'u:' + createHash('sha256').update(f).digest('base64url').slice(0, 22) : f
}

// A web address's last segment can be part of its credential: a long opaque run of letters and
// digits is not offered as a title.
const safeTitleFromFile = (fileName) => {
  const title = titleFromFile(fileName)
  return /^https?:/i.test(String(fileName ?? '')) && (title.length > 120 || /[A-Za-z0-9_-]{32,}/.test(title)) ? '' : title
}

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * The arguments a command may carry, checked before anything reaches the helper. Commands without
 * arguments ignore whatever the panel sent; bad input throws `invalid`.
 */
export function commandArgs(command, args) {
  if (!COMMANDS.has(command)) throw codedError('invalid', `Unknown command ${command}`)
  const a = args && typeof args === 'object' ? args : {}
  const bad = (what) => codedError('invalid', `${command} needs ${what}`)
  switch (command) {
    case 'seek':
      if (!isNumber(a.positionMs) || a.positionMs < 0 || a.positionMs > MAX_POSITION_MS) throw bad('positionMs, a number of milliseconds >= 0')
      return { positionMs: Math.round(a.positionMs) }
    case 'volume':
      if (!isNumber(a.volume) || a.volume < 0 || a.volume > 100) throw bad('volume, a number from 0 to 100')
      return { volume: Math.round(a.volume) }
    case 'shuffle':
    case 'repeat':
    case 'mute':
      if (typeof a.on !== 'boolean') throw bad('on, true or false')
      return { on: a.on }
    default:
      return {}
  }
}

/** Turns the helper's raw state into what the panel draws. */
export function shapeState(raw) {
  if (!raw?.running) return { running: false }
  const t = raw.track
  const active = Boolean(t?.active)
  const title = active ? t.title || safeTitleFromFile(t.fileName) : ''
  return {
    running: true,
    state: raw.state,
    positionMs: raw.positionMs,
    durationMs: raw.durationMs || t?.durationMs || 0,
    volume: raw.volume,
    mute: raw.mute,
    shuffle: raw.shuffle,
    repeat: raw.repeat,
    track: active
      ? {
          // A stream with no file name (a OneDrive link in AIMP 4.60) tells tracks apart by number.
          key: `${fileKey(t.fileName)}|${t.title}|${t.album}${t.fileName ? '' : `|${t.trackNumber ?? ''}|${t.durationMs ?? ''}`}`,
          // No tag and no usable file name: the panel shows "Untitled" in its own language.
          title,
          untitled: !title,
          artist: t.artist || '',
          album: t.album || '',
          year: t.date || '',
          number: t.trackNumber || null,
          cloud: /^[a-z][a-z0-9+.-]*:\/\//i.test(t.fileName ?? '') && !/^file:/i.test(t.fileName ?? ''),
          quality: describeQuality(t)
        }
      : null
  }
}

/**
 * Whether OneDrive's API host is reachable: DNS plus a TCP connection on 443, no request sent.
 * TCP rather than HTTPS because networks with TLS inspection make certificate checks fail even
 * when streaming works.
 */
export function probeOnline({ host = 'graph.microsoft.com', connect = netConnect } = {}) {
  return new Promise((resolve) => {
    let settled = false
    const done = (online, error = null) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ online, error })
    }
    const socket = connect({ host, port: 443 })
    socket.setTimeout(6000, () => done(false, 'timeout'))
    socket.once('connect', () => done(true))
    socket.once('error', (error) => done(false, `${error.code ?? ''} ${error.message}`.trim()))
  })
}

/**
 * Connectivity without slowing the panel: answers the last known value at once and refreshes it
 * in the background, one probe at a time: every 30 s while online, every 5 s after a failure.
 * One failed probe is a blip (Wi-Fi re-authenticating, a resume from sleep): offline takes
 * `failuresToOffline` failures in a row. A value older than `staleMs` (nobody asked for a while)
 * is unknown again rather than an old "offline".
 */
export function createOnlineMonitor({ probe = probeOnline, now = () => Date.now(), maxAgeMs = 30000, retryMs = 5000, failuresToOffline = 2, staleMs = 120000 } = {}) {
  let last = { online: null, error: null, at: 0 }
  let failures = 0
  let running = null
  const refresh = () =>
    (running ??= probe()
      .then((r) => {
        failures = r.online ? 0 : failures + 1
        const online = r.online ? true : failures >= failuresToOffline ? false : last.online
        last = { online, error: r.online ? null : r.error ?? null, at: now() }
        return last
      })
      .catch(() => last)
      .finally(() => {
        running = null
      }))
  return {
    get() {
      const age = now() - last.at
      if (age >= (failures ? retryMs : maxAgeMs)) void refresh()
      return age > staleMs ? { online: null, error: null, at: last.at } : last
    },
    refresh
  }
}

/** Starts AIMP: the Microsoft Store edition first, then a classic install. */
export function launchAimp(env = process.env, run = spawn) {
  const classic = [join(env.ProgramFiles ?? 'C:\\Program Files', 'AIMP', 'AIMP.exe'), join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'AIMP', 'AIMP.exe')].find((p) => existsSync(p))
  const explorer = join(env.SystemRoot ?? 'C:\\Windows', 'explorer.exe')
  const child = classic ? run(classic, [], { detached: true, stdio: 'ignore' }) : run(explorer, [`shell:AppsFolder\\${AIMP_STORE_APP}`], { detached: true, stdio: 'ignore' })
  child.on?.('error', () => {})
  child.unref?.()
  return classic ? 'classic' : 'store'
}

/** A small most-recent-first cache of promises, so concurrent asks for one track share a read. */
function recent(limit = 8) {
  const map = new Map()
  return (key, make) => {
    if (map.has(key)) {
      const hit = map.get(key)
      map.delete(key)
      map.set(key, hit)
      return hit
    }
    const value = make()
    map.set(key, value)
    if (map.size > limit) map.delete(map.keys().next().value)
    value.then((v) => v?.reason === 'unreadable' && map.delete(key), () => map.delete(key))
    return value
  }
}

// Playback gets the files of tracks from the library, worker side only.
function libraryTracks(library) {
  return {
    resolveTracks: async (ids) => {
      await library.ensureLoaded?.()
      return library.trackPaths(ids)
    },
    albumTracks: async (albumId) => {
      await library.ensureLoaded?.()
      const ids = library.albumTrackIds(albumId)
      return ids ? library.trackPaths(ids) : []
    }
  }
}

export function createHandlers({
  aimp,
  online = createOnlineMonitor(),
  launch = launchAimp,
  now = () => Date.now(),
  lyrics = readLyrics,
  artistImage = findArtistImage,
  settings = null,
  log,
  onedrive = null,
  library = createLibrary({ helper: aimp, settings, log, cloud: onedrive?.cloud ?? null }),
  resolveTracks = libraryTracks(library).resolveTracks,
  albumTracks = libraryTracks(library).albumTracks,
  playback: playbackOptions = {}
}) {
  const cloud = onedrive?.cloud ?? null
  if (onedrive) onedrive.onChange = () => library.rebuild()
  let artCache = { key: null, dataUrl: null }
  // Opening a sidecar (.lrc, artist picture) that is only in OneDrive would download it; the
  // helper's folder listing settles the files stat cannot (see cloudOnlyFile).
  const cloudOnly = (path) => cloudOnlyFile(path, { attrsOf: (p) => listedAttrs(aimp, p) })
  const lyricsCache = recent()
  const artistCache = recent()
  let stateInFlight = null
  let pausedAt = -Infinity
  let wasOnline = null

  const call = async (cmd, args, options) => {
    try {
      return await aimp.request(cmd, args, options)
    } catch (error) {
      throw codedError(error.code ?? 'aimp_error', error.message)
    }
  }

  // The playing track as AIMP reports it now. The panel only names a key; the file path always
  // comes from AIMP, so nothing the panel sends can point the worker at another file.
  // Library tracks to AIMP (src/playback.mjs); the library gives the paths.
  const playback = createPlayback({ call, resolveTracks, albumTracks, ...(cloud ? { cloudEntry: (path) => cloud.playEntry(path) } : {}), ...playbackOptions })

  // Lyrics of a OneDrive track B-Side lists: its .lrc, downloaded once (small, capped).
  const cloudLyrics = async (trackId) => {
    const path = library.pathOf(trackId)
    const copy = path ? await cloud.lyricsCopy(path) : null
    const found = copy ? lyricsFromText(decodeTextFile(await readFile(copy))) : null
    return found ? { source: 'lrc', synced: found.synced, lines: found.lines } : { source: null, synced: false, lines: [], reason: 'cloud' }
  }

  const playing = async () => {
    const raw = await call('state')
    const track = shapeState(raw).track
    if (!track) return null
    const fileName = raw.track.fileName ?? ''
    // A OneDrive track of the library: by its address, or (a link AIMP names no file for) by B-Side's queue.
    const cloudId = cloud ? (isStream(fileName) ? library.idsForPath(fileName).trackId : !fileName ? (playback.cloudGuess?.(raw.track) ?? null) : null) : null
    return { key: track.key, fileName, artist: raw.track.artist ?? '', cloudId }
  }

  return {
    // Several panels (or a slow AIMP) share one state read instead of queueing many.
    'player.state': () =>
      (stateInFlight ??= call('state')
        .then((raw) => {
          const result = shapeState(raw)
          // The library's ids of the playing file, when it is in the index (never its path).
          if (result.track) Object.assign(result.track, library.idsForPath(raw.track.fileName))
          // A OneDrive link AIMP plays reports no file name: B-Side's own cloud queue says which.
          if (result.track && !result.track.trackId && !raw.track.fileName) {
            const id = playback.cloudGuess?.(raw.track)
            const t = id ? library.model?.trackById?.get(id) : null
            if (t) Object.assign(result.track, { trackId: id, albumId: t.albumId, cloud: true })
          }
          // A OneDrive track AIMP has not tagged yet: its title from the library.
          const known = result.track?.trackId && !raw.track.title ? library.model?.trackById?.get(result.track.trackId) : null
          if (known?.title) Object.assign(result.track, { title: known.title, untitled: false })
          // AIMP does not report the bit depth; the library read it from the file's header.
          const bits = result.track?.trackId ? library.model?.trackById?.get(result.track.trackId)?.bits : null
          if (bits && result.track.quality) result.track.quality.bits = bits
          // Internet only matters to a stream: a local file plays offline, so no probe and no
          // "Offline" for it (2.0 showed the banner over local FLAC after one failed probe).
          result.online = null
          if (result.track?.cloud) {
            const net = online.get()
            result.online = net.online
            if (net.online === false && net.error) result.onlineError = net.error
            if (net.online === false && wasOnline !== false) log?.(`offline: ${net.error ?? 'no answer'} from the connectivity probe`)
            wasOnline = net.online
          }
          return result
        })
        .finally(() => {
          stateInFlight = null
        })),

    'player.command': async ({ command, args } = {}) => {
      const clean = commandArgs(command, args)
      // AIMP's own "pause" is a toggle and its "play" restarts a playing track, so both go by
      // the current state: pause only pauses, play only starts or resumes.
      if (command === 'play' || command === 'pause') {
        const raw = await call('state')
        if (!raw?.running) throw codedError('aimp_closed', 'AIMP is not running')
        const state = raw.state === 'playing' && now() - pausedAt < PAUSE_FADE_MS ? 'paused' : raw.state
        if (command === 'pause' && state === 'playing') {
          await call('pause', {})
          pausedAt = now()
        }
        if (command === 'play' && state !== 'playing') {
          await call(state === 'paused' ? 'playPause' : 'play', {})
          pausedAt = -Infinity
        }
        return { ok: true }
      }
      await call(command, clean)
      if (command === 'playPause' || command === 'stop') pausedAt = -Infinity
      return { ok: true }
    },

    // Cover of the playing track, as AIMP shows it. Cached per track.
    // Only a found cover is cached: AIMP may fetch a cloud track's cover a moment after it starts.
    'player.art': async ({ key } = {}) => {
      if (key && artCache.key === key && artCache.dataUrl) return artCache
      const b64 = await call('art', {}, { timeout: 8000 }).catch(() => null)
      const dataUrl = b64 && b64.length < 1_000_000 ? `data:${b64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg'};base64,${b64}` : null
      if (dataUrl) artCache = { key: key ?? null, dataUrl }
      return { key: key ?? null, dataUrl }
    },

    // Lyrics of the playing local file (tags, then a sidecar .lrc). Streams get reason 'cloud'.
    'player.lyrics': async () => {
      const track = await playing()
      if (!track) return { key: null, source: null, synced: false, lines: [], reason: 'none' }
      const read = track.cloudId ? () => cloudLyrics(track.cloudId) : () => lyrics(track.fileName, { cloudOnly })
      const found = await lyricsCache(track.key, () => read().catch(() => ({ source: null, synced: false, lines: [], reason: 'unreadable' })))
      return { key: track.key, ...found }
    },

    // The artist's picture from the playing local file's folders, or null.
    'player.artist': async () => {
      const track = await playing()
      if (!track) return { key: null, dataUrl: null }
      const find = track.cloudId ? () => library.artistImage(track.cloudId) : () => artistImage(track.fileName, { artist: track.artist, cloudOnly })
      const dataUrl = await artistCache(track.key, () => find().catch(() => null))
      return { key: track.key, dataUrl }
    },

    'player.playAlbum': (input) => playback.playAlbum(input),
    'player.playTracks': (input) => playback.playTracks(input),
    'player.enqueue': (input) => playback.enqueue(input),

    'aimp.open': async () => ({ started: launch() }),

    ...library.handlers,
    ...(onedrive?.handlers ?? {})
  }
}
