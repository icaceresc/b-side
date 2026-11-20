// What the panel asks for, answered from AIMP (through the helper) and a light connectivity
// check. Every failure carries a `code` the panel turns into a clear message:
//   aimp_closed   AIMP is not running
//   aimp_timeout  AIMP did not answer
//   helper_failed the local helper could not start
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect as netConnect } from 'node:net'
import { join } from 'node:path'

export const AIMP_STORE_APP = '25018ArtemIzmaylov.AIMP_4hdg3aaevdv22!AIMP'
const LOSSLESS = new Set(['FLAC', 'ALAC', 'WAV', 'AIFF', 'AIF', 'APE', 'WV', 'TAK', 'TTA', 'OFR', 'DSF', 'DFF'])
const COMMANDS = new Set(['playPause', 'play', 'pause', 'stop', 'next', 'previous', 'seek', 'volume', 'shuffle', 'repeat'])

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

/** Turns the helper's raw state into what the panel draws. */
export function shapeState(raw) {
  if (!raw?.running) return { running: false }
  const t = raw.track
  const active = Boolean(t?.active)
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
          key: `${t.fileName}|${t.title}|${t.album}`,
          title: t.title || titleFromFile(t.fileName) || 'Sin título',
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
 * in the background at most every 30 s, one probe at a time.
 */
export function createOnlineMonitor({ probe = probeOnline, now = () => Date.now(), maxAgeMs = 30000 } = {}) {
  let last = { online: null, error: null, at: 0 }
  let running = null
  const refresh = () =>
    (running ??= probe()
      .then((r) => (last = { ...r, at: now() }))
      .catch(() => last)
      .finally(() => {
        running = null
      }))
  return {
    get() {
      if (now() - last.at >= maxAgeMs) void refresh()
      return last
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

export function createHandlers({ aimp, online = createOnlineMonitor(), launch = launchAimp }) {
  let artCache = { key: null, dataUrl: null }
  let stateInFlight = null

  const call = async (cmd, args, options) => {
    try {
      return await aimp.request(cmd, args, options)
    } catch (error) {
      throw codedError(error.code ?? 'aimp_error', error.message)
    }
  }

  return {
    // Several panels (or a slow AIMP) share one state read instead of queueing many.
    'player.state': () =>
      (stateInFlight ??= call('state')
        .then((raw) => {
          const net = online.get()
          const result = { ...shapeState(raw), online: net.online }
          if (net.online === false && net.error) result.onlineError = net.error
          return result
        })
        .finally(() => {
          stateInFlight = null
        })),

    'player.command': async ({ command, args } = {}) => {
      if (!COMMANDS.has(command)) throw codedError('invalid', `Unknown command ${command}`)
      await call(command, args ?? {})
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

    'aimp.open': async () => ({ started: launch() })
  }
}
