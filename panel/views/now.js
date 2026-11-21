'use strict'
/* Now Playing: AIMP's state, polled every second, with the cover and its colours, every control,
 * lyrics (shown by default when the track has them, synced lines highlighted) and the mini-player
 * above the tabs. The controls and their fixes are 1.2.1's: plain JSON inputs, a play button whose
 * icon changes only when the state does, toggles that flip at once, mute kept apart from volume.
 * The artist and album under the title open their library pages when the track is in the library. */

const S = { p: null, at: 0, seeking: false, artKey: undefined, polling: false, failures: 0, volBusy: false, lastVol: null, art: null, trackId: undefined, playing: undefined }
// Views that mark the playing track (library rows, album cards); called when it changes.
const PLAYING_HOOKS = new Set()
const nowTrackId = () => (S.p && S.p.running && S.p.track && S.p.track.trackId) || null
const nowAlbumId = () => (S.p && S.p.running && S.p.track && S.p.track.albumId) || null
const nowPlaying = () => Boolean(S.p && S.p.running && S.p.state === 'playing')

function showNp(view) {
  for (const id of ['loading', 'closed', 'player']) $(id).hidden = id !== view
}

async function poll() {
  if (document.hidden || S.polling) return
  S.polling = true
  try {
    const p = await ask('player.state', {}, { timeoutMs: 25000 })
    S.failures = 0
    S.p = p
    S.at = performance.now()
    paint()
  } catch (e) {
    // A slow or restarting AIMP keeps the last picture; only the status pill says so.
    S.failures++
    if (!S.p || S.failures >= 5) {
      S.p = { running: false, error: e }
      paint()
    } else pill(e)
  } finally {
    S.polling = false
  }
}

function pill(error) {
  const p = S.p
  $('pill').className = 'pill ' + (error ? 'bad' : p?.running ? 'ok' : 'bad')
  $('pill').querySelector('span').textContent = error ? (error.code === 'helper_failed' ? t('pillNoAccess') : t('pillSlow')) : p?.running ? t('pillOk') : t('pillClosed')
  $('pill').title = error?.message || ''
}

function paint() {
  const p = S.p
  if (!p) return
  const playing = p.running && p.state === 'playing'
  const song = p.running ? p.track : null

  pill(p.error)
  // Only a stream needs internet: a local file plays offline, so no banner over it.
  $('offline').hidden = !(song && song.cloud && p.online === false)
  // The skin's logo (and the record standing in for a cover) play and pause with AIMP.
  $('app').classList.toggle('is-playing', Boolean(playing))
  $('disc').classList.toggle('spin', Boolean(playing))
  extras(song)
  paintMini()
  const id = nowTrackId()
  if (id !== S.trackId || playing !== S.playing) {
    S.trackId = id
    S.playing = playing
    for (const hook of PLAYING_HOOKS) hook()
  }

  if (!p.running) {
    showNp('closed')
    S.artKey = undefined
    setArt(null)
    return
  }
  showNp('player')
  $('hint').hidden = Boolean(song)
  $('title').textContent = song ? (song.untitled ? t('untitled') : song.title) : t('nothing')
  $('title').title = $('title').textContent // the full title when two lines cut it short
  paintSub(song)
  const q = song && song.quality
  const chips = []
  if (q) {
    if (q.cd) chips.push(`<span class="chip hq">${t('cd')}</span>`)
    else if (q.lossless) chips.push(`<span class="chip hq">${t('lossless')}</span>`)
    if (q.codec) chips.push(`<span class="chip">${esc(q.codec)}</span>`)
    if (q.sampleRateLabel) chips.push(`<span class="chip">${esc(q.sampleRateLabel)}</span>`)
    if (q.bitrate) chips.push(`<span class="chip">${esc(q.bitrate)} kbps</span>`)
    if (q.channels) chips.push(`<span class="chip">${q.channels === 2 ? t('stereo') : q.channels === 1 ? t('mono') : esc(q.channels) + ' ' + t('channels')}</span>`)
  }
  if (song && song.cloud) chips.push(`<span class="chip">${icon('cloud')}${t('cloud')}</span>`)
  const html = chips.join('')
  if ($('chips').innerHTML !== html) $('chips').innerHTML = html

  const playBtn = $('play')
  // Only when it changes: replacing the icon every poll loses a click that spans the repaint.
  if (playBtn.dataset.icon !== (playing ? 'pause' : 'play')) {
    playBtn.dataset.icon = playing ? 'pause' : 'play'
    playBtn.innerHTML = icon(playBtn.dataset.icon)
  }
  playBtn.setAttribute('aria-label', playing ? t('pause') : t('play'))
  for (const id of ['prev', 'next']) $(id).disabled = !song
  $('shuffle').classList.toggle('on', Boolean(p.shuffle))
  $('shuffle').setAttribute('aria-pressed', String(Boolean(p.shuffle)))
  $('repeat').classList.toggle('on', Boolean(p.repeat))
  $('repeat').setAttribute('aria-pressed', String(Boolean(p.repeat)))
  $('prog').classList.toggle('off', !song)
  // AIMP reports volume 0 while muted and restores it on unmute: keep showing the real level, dimmed.
  if (!p.mute && p.volume != null) S.lastVol = p.volume
  if (!S.volBusy) setVol(p.mute && !p.volume ? S.lastVol ?? 0 : p.volume ?? 0)
  paintMute()

  const key = song ? song.key : null
  if (key !== S.artKey) {
    S.artKey = key
    setArt(null)
    if (key) loadArt(key)
  }
}

// "Artist — Album · Year": the artist and the album are links to their pages when AIMP plays a
// file from the library (the worker names its album); otherwise plain text, as in 1.2.1.
function paintSub(song) {
  const sub = $('sub')
  const text = song ? [song.artist, [song.album, song.year].filter(Boolean).join(' · ')].filter(Boolean).join(' — ') || t('unknownArtist') : t('waiting')
  const albumId = song && song.albumId
  const key = (albumId || '') + '|' + text
  if (sub.dataset.key === key) return
  sub.dataset.key = key
  sub.title = text
  if (!albumId) {
    sub.textContent = text
    return
  }
  const album = [song.album, song.year].filter(Boolean).join(' · ')
  const parts = []
  if (song.artist) parts.push(`<button class="link" data-go="artist">${esc(song.artist)}</button>`)
  if (album) parts.push(`<button class="link" data-go="album">${esc(album)}</button>`)
  sub.innerHTML = parts.join(' — ') || esc(t('unknownArtist'))
}

// AIMP can get a cloud track's cover a moment after it starts: ask again a few times.
async function loadArt(key) {
  for (const wait of [0, 1500, 4000, 9000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    if (S.artKey !== key) return
    try {
      const r = await ask('player.art', { key }, { timeoutMs: 15000 })
      if (S.artKey !== key) return
      if (r.dataUrl) return setArt(r.dataUrl)
    } catch {
      /* the cover is optional */
    }
  }
}

function setArt(url) {
  const cover = $('cover')
  cover.querySelector('img')?.remove()
  $('disc').hidden = Boolean(url)
  S.art = url || null
  paintMiniArt()
  if (!url) {
    tint(null)
    return
  }
  const img = new Image()
  img.alt = ''
  img.onload = () => img.classList.add('in')
  img.src = url
  cover.appendChild(img)
  tint(url)
}

// The whole panel takes its colours from the playing cover. Between tracks the old colours stay
// until the next cover is ready, then everything crossfades; with no cover for a while (or AIMP
// closed) the panel goes back to B-Side's default look.
const ROOT_TINT = new Tint(document.documentElement, $('backdrop'), { root: true })
const tint = (url) => ROOT_TINT.set(url, { delay: S.p && S.p.running ? 1800 : 300 })

// Muted shows the mute icon and a dimmed slider; the button's label stays "Mute" and aria-pressed
// carries the state, while the tooltip says what a click will do.
function paintMute() {
  const p = S.p
  const muted = Boolean(p.mute)
  $('volIcon').innerHTML = `<use href="#i-${muted || !Number($('vol').value) ? 'mute' : 'vol'}"/>`
  $('volBox').classList.toggle('muted', muted)
  $('mute').setAttribute('aria-pressed', String(muted))
  $('mute').title = t(muted ? 'unmute' : 'mute')
}

function setVol(v) {
  $('vol').value = v
  $('vol').style.setProperty('--v', v + '%')
  $('volOut').textContent = v
}

// The mini-player above the tabs: shown in the narrow layout whenever a track plays and the
// person is not on Now Playing. Pressing it opens Now Playing.
function paintMini() {
  const p = S.p
  const song = p && p.running ? p.track : null
  const show = Boolean(song) && !UI.wide && UI.tab !== 'now'
  $('mini').hidden = !show
  if (!song) return
  const title = song.untitled ? t('untitled') : song.title
  const sub = song.artist || t('unknownArtist')
  if ($('miniTitle').textContent !== title) $('miniTitle').textContent = title
  if ($('miniSub').textContent !== sub) $('miniSub').textContent = sub
  $('miniOpen').setAttribute('aria-label', `${t('openNow')}: ${title} — ${sub}`)
  const playing = p.state === 'playing'
  const btn = $('miniPlay')
  if (btn.dataset.icon !== (playing ? 'pause' : 'play')) {
    btn.dataset.icon = playing ? 'pause' : 'play'
    btn.innerHTML = icon(btn.dataset.icon)
  }
  btn.setAttribute('aria-label', playing ? t('pause') : t('play'))
}
function paintMiniArt() {
  const box = $('miniArt')
  box.querySelector('img')?.remove()
  box.classList.remove('has')
  if (S.art) showArt(box, S.art, false)
}

// Lyrics and the artist's picture, for files on this PC only: AIMP shares neither, so the worker
// reads them next to the file AIMP is playing (tags, a .lrc beside it, artist.jpg one folder up).
// Lyrics show by default whenever the track has them: a small cover beside the title, the lyrics
// in the middle, the controls below. The Lyrics button switches to the big cover and back; that
// choice is kept for the session. Cloud tracks get a dimmed button with the reason.
// The artist picture becomes the cover when AIMP has none (after a moment, so AIMP's own cover
// wins), and otherwise a small avatar beside the artist; never both.
const L = { key: undefined, data: null, artist: null, ready: false, readyTimer: 0, on: true, idx: -1, userScroll: -Infinity, shown: null }
try {
  L.on = sessionStorage.getItem('bside.lyrics') !== '0'
} catch {}

function extras(song) {
  const key = song ? song.key : null
  if (key !== L.key) {
    L.key = key
    L.data = null
    L.artist = null
    L.ready = false
    L.idx = -1
    clearTimeout(L.readyTimer)
    if (key) {
      L.readyTimer = setTimeout(() => {
        L.ready = true
        paintArtist()
      }, 1500)
      loadExtra('player.lyrics', key, (r) => (L.data = r))
      loadExtra('player.artist', key, (r) => (L.artist = r.dataUrl || null))
    }
  }
  paintLyrics()
  paintArtist()
}
// Both are optional: a failure leaves the cover as it is, without a message.
async function loadExtra(name, key, keep) {
  try {
    const r = await ask(name, { key }, { timeoutMs: 15000 })
    if (L.key !== key || r.key !== key) return
    keep(r)
  } catch {
    return
  }
  paintLyrics()
  paintArtist()
}

function paintLyrics() {
  const d = L.data
  const has = Boolean(d && d.lines && d.lines.length)
  const cloud = Boolean(d && d.reason === 'cloud')
  const showing = has && L.on
  const btn = $('lyricsBtn')
  // Always there while a track plays, so the lyrics are easy to find; dimmed with the reason when
  // this track has none. It sits on the cover, or beside the volume while the lyrics show.
  btn.hidden = !L.key || !d
  btn.classList.toggle('has', has)
  btn.classList.toggle('dim', !has)
  btn.setAttribute('aria-disabled', String(!has))
  btn.setAttribute('aria-pressed', String(showing))
  btn.title = has ? t('lyrics') : cloud ? t('lyricsCloud') : t('lyricsNone')
  const host = showing ? $('volBox') : $('stage')
  if (btn.parentNode !== host) {
    const focused = document.activeElement === btn
    host.appendChild(btn)
    if (focused) btn.focus()
  }
  $('player').classList.toggle('lyr', showing)
  const box = $('lyricsBox')
  box.hidden = !showing
  if (!showing || L.shown === d) return
  const view = $('lyrics')
  L.shown = d
  L.idx = -1
  view.className = 'lyrics' + (d.synced ? ' synced' : '')
  view.innerHTML = d.lines.map((l, i) => `<p data-i="${i}"${l.text ? '' : ' class="gap"'}${d.synced && l.ms != null ? ` data-ms="${l.ms}"` : ''}>${esc(l.text)}</p>`).join('')
  view.scrollTop = 0
  followLyrics()
}

// The current synced line, from the panel's own position estimate; it scrolls to about a third
// from the top unless the person scrolled the lyrics in the last few seconds.
function followLyrics() {
  const d = L.data
  const view = $('lyrics')
  if ($('lyricsBox').hidden || !d || !d.synced || document.hidden || (!UI.wide && UI.tab !== 'now')) return
  const { pos } = position()
  let idx = -1
  for (let i = 0; i < d.lines.length; i++) {
    const ms = d.lines[i].ms
    if (ms == null) continue
    if (ms > pos + 150) break
    idx = i
  }
  if (idx === L.idx) return
  L.idx = idx
  for (const el of view.children) {
    const i = Number(el.dataset.i)
    el.classList.toggle('past', i < idx)
    el.classList.toggle('now', i === idx)
  }
  if (performance.now() - L.userScroll < 4000) return
  const el = view.children[idx]
  const top = el ? el.offsetTop + el.offsetHeight / 2 - view.clientHeight / 3 : 0
  view.scrollTo({ top: Math.max(0, top), behavior: reducedMotion.matches ? 'auto' : 'smooth' })
}

function paintArtist() {
  const url = L.key ? L.artist : null
  const fill = $('artistFill')
  const asCover = Boolean(url && L.ready && !$('cover').querySelector('img'))
  if (asCover && fill.dataset.url !== url) {
    fill.style.backgroundImage = `url("${url}")`
    fill.dataset.url = url
  }
  fill.classList.toggle('in', asCover)
  // The artist's picture standing in for the cover also gives the panel its colours.
  if (asCover && ROOT_TINT.url !== url) tint(url)
  const avatar = $('avatar')
  const withAvatar = Boolean(url && L.ready && !asCover)
  if (withAvatar && avatar.getAttribute('src') !== url) avatar.src = url
  avatar.hidden = !withAvatar
}

function position() {
  const p = S.p
  if (!p?.running || !p.track) return { pos: 0, dur: 0 }
  let pos = p.positionMs ?? 0
  if (p.state === 'playing') pos += performance.now() - S.at
  const dur = p.durationMs || 0
  return { pos: dur ? Math.min(pos, dur) : pos, dur }
}
function tick() {
  if (!S.seeking) {
    const { pos, dur } = position()
    const pct = dur ? (pos / dur) * 100 : 0
    $('fill').style.width = pct + '%'
    $('knob').style.left = pct + '%'
    $('pos').textContent = fmt(pos)
    $('dur').textContent = fmt(dur)
    $('seek').setAttribute('aria-valuenow', String(Math.round(pct)))
    $('seek').setAttribute('aria-valuetext', `${fmt(pos)} ${t('of')} ${fmt(dur)}`)
    $('miniFill').style.width = pct + '%'
  }
  requestAnimationFrame(tick)
}

async function command(cmd, args) {
  try {
    await ask('player.command', args === undefined ? { command: cmd } : { command: cmd, args })
  } catch (e) {
    fail(e)
  }
  setTimeout(poll, 120)
  setTimeout(poll, 700)
}

// Toggles flip at once, so a second quick click undoes the first instead of repeating it.
function toggle(name) {
  if (!S.p?.running) return
  const on = !S.p[name]
  S.p[name] = on
  paint()
  command(name, { on })
}

{
  $('lyricsBtn').onclick = () => {
    if (L.data && L.data.reason === 'cloud') return toast(t('lyricsCloud'))
    if (!(L.data && L.data.lines && L.data.lines.length)) return toast(t('lyricsNone'))
    L.on = !L.on
    try {
      sessionStorage.setItem('bside.lyrics', L.on ? '1' : '0')
    } catch {}
    L.userScroll = -Infinity
    L.idx = -1
    paintLyrics()
    paintArtist()
    followLyrics()
  }
  for (const ev of ['wheel', 'touchmove', 'keydown']) $('lyrics').addEventListener(ev, () => (L.userScroll = performance.now()), { passive: true })
  $('lyrics').addEventListener('click', (e) => {
    const el = e.target.closest('p[data-ms]')
    if (!el || !S.p?.running) return
    const ms = Number(el.dataset.ms)
    S.p.positionMs = ms
    S.at = performance.now()
    L.userScroll = -Infinity
    command('seek', { positionMs: ms })
    followLyrics()
  })
  setInterval(followLyrics, 200)

  $('play').onclick = () => command('playPause')
  $('prev').onclick = () => command('previous')
  $('next').onclick = () => command('next')
  $('shuffle').onclick = () => toggle('shuffle')
  $('repeat').onclick = () => toggle('repeat')
  $('mute').onclick = () => toggle('mute')
  $('miniPlay').onclick = () => command('playPause')
  $('miniNext').onclick = () => command('next')

  $('openAimp').onclick = async () => {
    toast(t('opening'))
    try {
      await ask('aimp.open')
    } catch (e) {
      fail(e)
    }
    for (const ms of [1500, 3000, 5000, 8000]) setTimeout(poll, ms)
  }

  let volTimer = 0
  let volRelease = 0
  let volUnmute = false
  $('vol').addEventListener('input', () => {
    const v = Number($('vol').value)
    S.volBusy = true
    setVol(v)
    // Moving the slider while muted unmutes, so the new volume is actually heard.
    if (S.p?.mute) {
      S.p.mute = false
      volUnmute = true
      paintMute()
    }
    clearTimeout(volTimer)
    clearTimeout(volRelease)
    volTimer = setTimeout(async () => {
      if (volUnmute) {
        volUnmute = false
        await command('mute', { on: false })
      }
      command('volume', { volume: v })
    }, 120)
    // Follow AIMP's volume again once the person stops moving the slider.
    volRelease = setTimeout(() => (S.volBusy = false), 1500)
  })

  const bar = $('seek')
  const frac = (x) => {
    const r = bar.getBoundingClientRect()
    return Math.min(1, Math.max(0, (x - r.left) / r.width))
  }
  bar.addEventListener('pointerdown', (e) => {
    const { dur } = position()
    if (!dur) return
    S.seeking = true
    $('prog').classList.add('drag')
    bar.setPointerCapture(e.pointerId)
    const draw = (x) => {
      const f = frac(x)
      $('fill').style.width = f * 100 + '%'
      $('knob').style.left = f * 100 + '%'
      $('pos').textContent = fmt(f * dur)
    }
    draw(e.clientX)
    const move = (ev) => draw(ev.clientX)
    const finish = () => {
      bar.removeEventListener('pointermove', move)
      bar.removeEventListener('pointerup', up)
      bar.removeEventListener('pointercancel', finish)
      bar.removeEventListener('lostpointercapture', finish)
      $('prog').classList.remove('drag')
      S.seeking = false
    }
    const up = (ev) => {
      const ms = Math.round(frac(ev.clientX) * dur)
      finish()
      if (S.p) {
        S.p.positionMs = ms
        S.at = performance.now()
      }
      command('seek', { positionMs: ms })
    }
    bar.addEventListener('pointermove', move)
    bar.addEventListener('pointerup', up)
    bar.addEventListener('pointercancel', finish)
    bar.addEventListener('lostpointercapture', finish)
  })
  bar.addEventListener('keydown', (e) => {
    const { pos, dur } = position()
    if (!dur || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    e.preventDefault()
    const ms = Math.max(0, Math.min(dur - 1000, pos + (e.key === 'ArrowRight' ? 10000 : -10000)))
    // Move the bar now, so quick presses add up instead of all starting from the last poll.
    S.p.positionMs = ms
    S.at = performance.now()
    command('seek', { positionMs: ms })
  })
}
