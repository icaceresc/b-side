'use strict'
/* The library: Artists, Albums, Tracks and Genres on the home page, and the album, artist and
 * genre pages, with the first-run, scanning and error states. Everything comes from the worker's
 * `library.*` handlers (ids are opaque; no file path ever reaches the panel) and plays through
 * `player.playAlbum`, `player.playTracks` and `player.enqueue`. Lists are built as HTML strings,
 * images load lazily through core.js, and the Tracks list draws only the rows on screen, so a
 * collection of 10 000 tracks scrolls as smoothly as one of 200. */

const LIB_TIMEOUT = { timeoutMs: 15000 }
const LIB = { status: null, version: undefined, memo: new Map(), section: 'albums', sort: 'artist', timer: 0, home: null, list: null }
// Everything the panel has been told about, by id, for menus and navigation.
const TRACKS = new Map()
const ALBUMS = new Map()

// One request per thing until the library changes (a scan finished): pages and sections opened
// again draw at once. A failed request is forgotten, so the next visit asks again.
function memo(key, make) {
  if (LIB.memo.has(key)) return LIB.memo.get(key)
  const p = make()
  LIB.memo.set(key, p)
  p.catch(() => LIB.memo.get(key) === p && LIB.memo.delete(key))
  return p
}
const keepAlbums = (r) => {
  for (const a of r.albums || []) ALBUMS.set(a.id, a)
  return r
}
const keepTracks = (list) => {
  for (const tr of list || []) TRACKS.set(tr.id, tr)
  return list
}

const api = {
  status: () => ask('library.status', {}, LIB_TIMEOUT),
  rescan: () => ask('library.rescan', {}, LIB_TIMEOUT),
  artists: () => memo('artists', () => ask('library.artists', {}, LIB_TIMEOUT)),
  albums: () => memo('albums', () => ask('library.albums', {}, LIB_TIMEOUT).then(keepAlbums)),
  genres: () => memo('genres', () => ask('library.genres', {}, LIB_TIMEOUT)),
  genreAlbums: (genre) => memo('genre:' + genre, () => ask('library.albums', { genre }, LIB_TIMEOUT).then(keepAlbums)),
  album: (id) =>
    memo('album:' + id, () =>
      ask('library.album', { id }, LIB_TIMEOUT).then((r) => {
        ALBUMS.set(r.album.id, r.album)
        keepTracks(r.tracks)
        return r
      })
    ),
  artist: (id) => memo('artist:' + id, () => ask('library.artist', { id }, LIB_TIMEOUT).then(keepAlbums)),
  tracks: (offset, limit) => ask('library.tracks', { offset, limit }, LIB_TIMEOUT),
  search: (q, limit) => ask('library.search', { q, limit }, { timeoutMs: 8000 }),
  playAlbum: (albumId, trackId) => ask('player.playAlbum', trackId ? { albumId, trackId } : { albumId }, LIB_TIMEOUT),
  playTracks: (trackIds, startIndex = 0) => ask('player.playTracks', { trackIds, startIndex }, LIB_TIMEOUT),
  enqueue: (trackIds, mode) => ask('player.enqueue', { trackIds, mode }, LIB_TIMEOUT),
  // Listing every candidate folder can take a while on a big collection: Orca's longest wait.
  suggestFolders: () => ask('library.suggestFolders', {}, { timeoutMs: 120000 }),
  setFolders: (folders) => ask('library.setFolders', { folders }, { timeoutMs: 30000 })
}

// --- Playing ------------------------------------------------------------------------------------

// AIMP needs a moment to load an album: look again soon, so the mini-player and the marks follow.
const afterPlay = () => [150, 700, 1600, 3200].forEach((ms) => setTimeout(poll, ms))
async function playAlbum(albumId, trackId) {
  try {
    await api.playAlbum(albumId, trackId)
    afterPlay()
  } catch (e) {
    fail(e)
  }
}
async function playTrackList(trackIds, startIndex = 0) {
  try {
    await api.playTracks(trackIds, startIndex)
    afterPlay()
  } catch (e) {
    fail(e)
  }
}
async function enqueueTracks(getIds, mode) {
  try {
    const ids = typeof getIds === 'function' ? await getIds() : getIds
    if (!ids.length) return
    await api.enqueue(ids, mode)
    toast(t(mode === 'next' ? 'queuedNext' : 'queuedEnd'))
    afterPlay()
  } catch (e) {
    fail(e)
  }
}
const albumTrackIds = async (albumId) => (await api.album(albumId)).tracks.map((tr) => tr.id)
async function artistOfAlbum(albumId) {
  const known = ALBUMS.get(albumId)
  if (known && known.artistId) return known.artistId
  return (await api.album(albumId)).album.artistId
}

function trackMenu(tr, { inAlbum = false } = {}) {
  return [
    { label: t('play'), icon: 'play', run: () => playAlbum(tr.albumId, tr.id) },
    { label: t('playNext'), icon: 'playnext', run: () => enqueueTracks([tr.id], 'next') },
    { label: t('addToQueue'), icon: 'queue', run: () => enqueueTracks([tr.id], 'end') },
    ...(inAlbum ? [] : [{ label: t('goAlbum'), icon: 'album', run: () => openAlbum(tr.albumId) }]),
    {
      label: t('goArtist'),
      icon: 'artist',
      run: async () => {
        try {
          openArtist(await artistOfAlbum(tr.albumId))
        } catch (e) {
          fail(e)
        }
      }
    }
  ]
}
function albumMenu(a, { inArtist = false } = {}) {
  return [
    { label: t('play'), icon: 'play', run: () => playAlbum(a.id) },
    { label: t('playNext'), icon: 'playnext', run: () => enqueueTracks(() => albumTrackIds(a.id), 'next') },
    { label: t('addToQueue'), icon: 'queue', run: () => enqueueTracks(() => albumTrackIds(a.id), 'end') },
    ...(inArtist || !a.artistId ? [] : [{ label: t('goArtist'), icon: 'artist', run: () => openArtist(a.artistId) }])
  ]
}

// --- Building blocks ----------------------------------------------------------------------------

const eqHtml = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>'
const cloudPart = () => `<span class="tcloud" title="${esc(t('cloudOnlyHint'))}">${icon('cloud')}${esc(t('cloudOnly'))}</span>`
const htmlNode = (html) => {
  const tpl = document.createElement('template')
  tpl.innerHTML = html.trim()
  return tpl.content.firstElementChild
}

function albumCard(a, { sub } = {}) {
  const title = a.title || t('unknownAlbum')
  const artist = a.artist || t('unknownArtist')
  const line = sub ?? [artist, a.year].filter(Boolean).join(' · ')
  const label = [title, artist, a.year].filter(Boolean).join(', ')
  return (
    `<li><button class="card" data-album-id="${esc(a.id)}" aria-label="${esc(label)}" data-label="${esc(label)}" tabindex="-1">` +
    `<span class="art" style="${artStyle(a.id)}" data-cover="${esc(a.cover || '')}"><span class="ph" aria-hidden="true"></span>` +
    (a.cloudOnly ? `<span class="badge cloudb" title="${esc(t('cloudOnlyHint'))}">${icon('cloud')}</span>` : '') +
    `<span class="badge nowb">${eqHtml}</span></span>` +
    `<span class="cap"><b>${esc(title)}</b><span>${esc(line)}</span></span></button></li>`
  )
}

function artistCard(ar, cover) {
  const label = [ar.name || t('unknownArtist'), tn('albumsN', ar.albums || 0)].join(', ')
  return (
    `<li><button class="card artist" data-artist-id="${esc(ar.id)}" aria-label="${esc(label)}" tabindex="-1">` +
    `<span class="art round" style="${artStyle(ar.id)}" data-cover="${esc(ar.image || cover || '')}"><span class="ini" aria-hidden="true">${esc(initials(ar.name))}</span></span>` +
    `<span class="cap"><b>${esc(ar.name || t('unknownArtist'))}</b><span>${esc(tn('albumsN', ar.albums || 0))}</span></span></button></li>`
  )
}

function genreTile(g) {
  return (
    `<li><button class="gtile" data-genre="${esc(g.name)}" style="${artStyle(g.name)}" tabindex="-1" aria-label="${esc([g.name, tn('albumsN', g.albums || 0)].join(', '))}">` +
    `<b>${esc(g.name)}</b><span>${esc(tn('albumsN', g.albums || 0))} · ${esc(tn('tracksN', g.tracks || 0))}</span>${icon('tag')}</button></li>`
  )
}

// Lyrics and cloud marks: in their own column; on narrow panels, before the second line when the
// row has one (album pages show one line, with room for the column).
const marksHtml = (tr) =>
  (tr.lyrics ? `<span class="mk" title="${esc(t('hasLyrics'))}">${icon('lyrics')}</span>` : '') +
  (tr.cloudOnly ? `<span class="mk" title="${esc(t('cloudOnlyHint'))}">${icon('cloud')}</span>` : '')
const subLine = (tr, line) => {
  if (!line) return ''
  const marks = marksHtml(tr)
  return `<span>${marks ? `<i class="mki">${marks}</i>` : ''}${line}</span>`
}

// A track row: the number (or a small cover), title and artist, lyrics and cloud marks, duration
// and a "more" button. Pressing the row plays from it; the menu enqueues and navigates.
function trackRow(tr, { art = false, sub } = {}) {
  const title = tr.title || t('untitled')
  const line = sub ?? (tr.artist || t('unknownArtist'))
  const label = [title, line, fmt(tr.durationMs), tr.lyrics ? t('hasLyrics') : '', tr.cloudOnly ? t('cloudOnly') : ''].filter(Boolean).join(', ')
  const lead = art ? `<span class="art tart" style="${artStyle(tr.albumId)}" data-cover="${esc(tr.cover || '')}"><span class="ph" aria-hidden="true"></span></span>` : `<span class="tnum">${esc(tr.number ?? '')}</span>`
  return (
    `<li class="trow${art ? ' witharts' : ''}${line ? ' has-sub' : ''}" data-track-id="${esc(tr.id)}" data-album-id="${esc(tr.albumId || '')}">` +
    `<button class="tmain" tabindex="-1" aria-label="${esc(label)}" data-label="${esc(label)}"><span class="lead">${lead}${eqHtml}</span>` +
    `<span class="ttext"><b>${esc(title)}</b>${subLine(tr, esc(line))}</span>` +
    `<span class="tmarks">${marksHtml(tr)}</span>` +
    `<span class="tdur">${fmt(tr.durationMs)}</span></button>` +
    `<button class="ib tmore" tabindex="-1" aria-haspopup="menu" aria-label="${esc(t('more') + ': ' + title)}">${icon('more')}</button></li>`
  )
}
const skeletonRow = () => '<li class="trow skelrow" aria-hidden="true"><span class="lead"><span class="skel" style="width:40px;height:40px;border-radius:8px"></span></span><span class="ttext"><span class="skel" style="width:60%;height:12px"></span><span class="skel" style="width:40%;height:10px;margin-top:6px"></span></span></li>'
const skeletonGrid = (n = 8, round = false) =>
  `<ul class="grid${round ? ' artists' : ''}" aria-hidden="true">${`<li><span class="card"><span class="art skel${round ? ' round' : ''}"></span><span class="cap"><span class="skel" style="width:80%;height:11px"></span><span class="skel" style="width:50%;height:9px;margin-top:6px"></span></span></span></li>`.repeat(n)}</ul>`

// Lazy images for every placeholder in `root`.
function hydrate(root) {
  for (const el of root.querySelectorAll('.art[data-cover]')) lazyArt(el, el.dataset.cover || null)
}

// The playing track and album, marked wherever they show: an animated equaliser instead of the
// track number (still while paused), and on the album's cover.
function markPlaying(root = document) {
  const id = nowTrackId()
  const albumId = nowAlbumId()
  const playing = nowPlaying()
  for (const el of root.querySelectorAll('.trow[data-track-id]')) {
    const on = Boolean(id) && el.dataset.trackId === id
    if (el.classList.contains('now') !== on || el.classList.contains('paused') !== (on && !playing)) {
      el.classList.toggle('now', on)
      el.classList.toggle('paused', on && !playing)
      const main = el.querySelector('.tmain')
      if (main) main.setAttribute('aria-label', on ? `${main.dataset.label}, ${t('nowPlaying')}` : main.dataset.label)
    }
  }
  for (const el of root.querySelectorAll('.card[data-album-id]')) {
    const on = Boolean(albumId) && el.dataset.albumId === albumId
    el.classList.toggle('now', on)
    el.classList.toggle('paused', on && !playing)
  }
}
PLAYING_HOOKS.add(() => markPlaying())

// Arrow keys in a grid of cards: left/right by one, up/down by a row; one card is in the Tab order.
function gridKeys(e, grid) {
  const items = [...grid.querySelectorAll(':scope > li > button')]
  const i = items.indexOf(e.target)
  if (i < 0) return
  // Cards per row, by position on screen (each card's own box is its offset parent).
  const top = items[0].getBoundingClientRect().top
  let cols = 0
  for (const it of items) {
    if (Math.abs(it.getBoundingClientRect().top - top) > 2) break
    cols++
  }
  cols = Math.max(1, cols)
  const go = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: items.length - 1 }[e.key]
  if (go === undefined) return
  e.preventDefault()
  focusItem(items, Math.max(0, Math.min(items.length - 1, go)))
}
function focusItem(items, j) {
  for (const it of items) it.tabIndex = -1
  items[j].tabIndex = 0
  items[j].focus()
  items[j].scrollIntoView({ block: 'nearest' })
}
const firstTabbable = (root, selector) => {
  const items = root.querySelectorAll(selector)
  if (items.length && ![...items].some((b) => b.tabIndex === 0)) items[0].tabIndex = 0
}

// Arrow keys in a track list: up/down between rows, right to the row's "more" button and back.
function listKeys(e, container) {
  const btn = e.target.closest('.tmain, .tmore')
  if (!btn) return
  const row = btn.closest('.trow')
  if (e.key === 'ArrowRight' && btn.classList.contains('tmain')) {
    e.preventDefault()
    return row.querySelector('.tmore')?.focus()
  }
  if (e.key === 'ArrowLeft' && btn.classList.contains('tmore')) {
    e.preventDefault()
    return row.querySelector('.tmain')?.focus()
  }
  const rows = [...container.querySelectorAll('.trow[data-track-id]')]
  const i = rows.indexOf(row)
  const j = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: rows.length - 1 }[e.key]
  if (j === undefined || !rows[j]) return
  e.preventDefault()
  for (const b of container.querySelectorAll('.tmain[tabindex="0"]')) b.tabIndex = -1
  const main = rows[j].querySelector('.tmain')
  main.tabIndex = 0
  main.focus()
  main.scrollIntoView({ block: 'nearest' })
}

// Clicks, the context menu (right click, the menu key, Shift+F10, a long press on touch) and the
// "more" buttons, for every list and grid in `root`. `resolve(el)` names what an element is.
const LONG = { timer: 0, fired: 0 }
function wireActions(root, { activate, menuFor }) {
  root.addEventListener('click', (e) => {
    if (performance.now() - LONG.fired < 700) {
      e.preventDefault()
      return
    }
    const more = e.target.closest('.tmore, [data-more]')
    if (more && root.contains(more)) {
      const items = menuFor(more)
      if (items) openMenu(items, more, more)
      return
    }
    activate(e.target, e)
  })
  root.addEventListener('contextmenu', (e) => {
    if (performance.now() - LONG.fired < 900) return e.preventDefault()
    const items = menuFor(e.target)
    if (!items) return
    e.preventDefault()
    const host = e.target.closest('button, [tabindex]') || e.target
    const r = host.getBoundingClientRect()
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    openMenu(items, inside ? { x: e.clientX, y: e.clientY } : host, host)
  })
  root.addEventListener('keydown', (e) => {
    if (!(e.shiftKey && e.key === 'F10')) return
    const items = menuFor(e.target)
    if (!items) return
    e.preventDefault()
    openMenu(items, e.target, e.target)
  })
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return
    const x0 = e.clientX
    const y0 = e.clientY
    clearTimeout(LONG.timer)
    const cancel = () => {
      clearTimeout(LONG.timer)
      root.removeEventListener('pointermove', move)
      root.removeEventListener('pointerup', cancel)
      root.removeEventListener('pointercancel', cancel)
    }
    const move = (ev) => Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10 && cancel()
    root.addEventListener('pointermove', move)
    root.addEventListener('pointerup', cancel)
    root.addEventListener('pointercancel', cancel)
    LONG.timer = setTimeout(() => {
      cancel()
      const items = menuFor(e.target)
      if (!items) return
      LONG.fired = performance.now()
      openMenu(items, { x: x0, y: y0 }, e.target.closest('button') || e.target)
    }, 500)
  })
}

// What a press means anywhere in the library, so every page shares one set of handlers.
function libraryActivate(el, ctx = {}) {
  const row = el.closest('.trow[data-track-id]')
  if (row) {
    const tr = TRACKS.get(row.dataset.trackId)
    if (tr) playAlbum(tr.albumId || ctx.albumId, tr.id)
    return true
  }
  const card = el.closest('[data-album-id].card')
  if (card) return openAlbum(card.dataset.albumId, card), true
  const artist = el.closest('[data-artist-id]')
  if (artist) return openArtist(artist.dataset.artistId, artist), true
  const genre = el.closest('[data-genre]')
  if (genre) return openGenre(genre.dataset.genre, genre), true
  return false
}
function libraryMenu(el, ctx = {}) {
  const row = el.closest('.trow[data-track-id]')
  if (row) {
    const tr = TRACKS.get(row.dataset.trackId)
    return tr ? trackMenu(tr, ctx) : null
  }
  const card = el.closest('[data-album-id].card')
  if (card) {
    const a = ALBUMS.get(card.dataset.albumId)
    return a ? albumMenu(a, ctx) : null
  }
  return null
}

// --- Pages --------------------------------------------------------------------------------------

// A page in a tab's stack: a bar with Back and the title (shown once the page's own heading has
// scrolled under it), and a scrolling body. Album and artist pages take their cover's colours.
function makePage(kind, { tinted = false } = {}) {
  const el = document.createElement('div')
  el.className = 'page p-' + kind
  el.innerHTML =
    (tinted ? '<div class="backdrop"><i></i><i></i></div><div class="shade"></div>' : '') +
    `<div class="bar"><button class="ib back" aria-label="${esc(t('back'))}" title="${esc(t('back'))}">${icon('back')}</button><h2 class="bar-title"></h2><span class="bar-end"></span></div><div class="scroll"></div>`
  const page = {
    kind,
    el,
    scroll: el.querySelector('.scroll'),
    titleEl: el.querySelector('.bar-title'),
    back: el.querySelector('.back'),
    barEnd: el.querySelector('.bar-end'),
    tint: tinted ? new Tint(el, el.querySelector('.backdrop')) : null,
    dispose() {
      this.tint?.dispose()
    }
  }
  page.back.onclick = () => goBack()
  page.scroll.addEventListener(
    'scroll',
    () => {
      const head = page.scroll.querySelector('.hero-title, .shead, .pk-title')
      const limit = head ? head.offsetTop + head.offsetHeight - 8 : 80
      el.classList.toggle('scrolled', page.scroll.scrollTop > limit)
    },
    { passive: true }
  )
  wireActions(page.scroll, { activate: (t, e) => page.activate(t, e), menuFor: (t) => page.menuFor(t) })
  page.activate = (target) => libraryActivate(target)
  page.menuFor = (target) => libraryMenu(target)
  page.scroll.addEventListener('keydown', (e) => {
    const grid = e.target.closest('.grid')
    if (grid) return gridKeys(e, grid)
    const list = e.target.closest('.tlist')
    if (list) return listKeys(e, page.scroll)
  })
  return page
}

const errorBlock = (e) =>
  `<div class="state small"><h2>${esc(t('failed'))}</h2><p>${esc((e && MESSAGES[e.code]) || (e && e.message) || '')}</p></div>`
const heroSkeleton = (round) =>
  `<header class="hero" aria-hidden="true"><div class="art hero-art skel${round ? ' round' : ''}"></div><div class="hero-text"><span class="skel" style="width:70%;height:20px"></span><span class="skel" style="width:40%;height:12px;margin-top:10px"></span></div></header>`

function albumPage(id) {
  const page = makePage('album', { tinted: true })
  page.key = 'album:' + id
  page.scroll.innerHTML = heroSkeleton(false) + `<ul class="tlist" aria-hidden="true">${skeletonRow().repeat(6)}</ul>`
  page.menuFor = (target) => {
    if (target.closest('[data-more="album"]')) return page.album ? albumMenu(page.album) : null
    return libraryMenu(target, { inAlbum: true })
  }
  page.activate = (target) => {
    if (target.closest('[data-act="play"]')) return page.album && playAlbum(page.album.id)
    const link = target.closest('[data-artist]')
    if (link) return openArtist(link.dataset.artist, link)
    libraryActivate(target, { albumId: id })
  }
  api
    .album(id)
    .then(({ album, tracks }) => {
      if (!page.el.isConnected) return
      page.album = album
      page.titleEl.textContent = album.title || t('unknownAlbum')
      const facts = [album.year, tn('tracksN', tracks.length || album.tracks || 0), album.durationMs ? fmtLong(album.durationMs) : ''].filter(Boolean)
      const discs = groupDiscs(tracks)
      const lists = discs
        .map(({ disc, tracks: list }) => (discs.length > 1 ? `<h3 class="disc-head">${icon('disc')}${esc(t('disc', { n: disc }))}</h3>` : '') + `<ol class="tlist" aria-label="${esc(discs.length > 1 ? t('disc', { n: disc }) : t('tracks'))}">${list.map((tr, i) => trackRow(tr.number == null ? { ...tr, number: i + 1 } : tr, { sub: tr.artist && tr.artist !== album.artist ? tr.artist : '' })).join('')}</ol>`)
        .join('')
      page.scroll.innerHTML =
        `<header class="hero">` +
        `<div class="art hero-art" style="${artStyle(album.id)}"><span class="ph" aria-hidden="true"></span></div>` +
        `<div class="hero-text"><h1 class="hero-title">${esc(album.title || t('unknownAlbum'))}</h1>` +
        (album.artistId ? `<button class="link hero-sub" data-artist="${esc(album.artistId)}">${esc(album.artist || t('unknownArtist'))}</button>` : `<p class="hero-sub">${esc(album.artist || t('unknownArtist'))}</p>`) +
        `<p class="hero-meta">${esc(facts.join(' · '))}</p>` +
        `<div class="tech">${techHtml(techParts(album.quality), album.cloudOnly ? cloudPart() : '')}</div>` +
        `<div class="actions"><button class="btn" data-act="play">${icon('play')}<span>${esc(t('play'))}</span></button>` +
        `<button class="ib round" data-more="album" aria-haspopup="menu" aria-label="${esc(t('more'))}" title="${esc(t('more'))}">${icon('more')}</button></div></div></header>` +
        lists
      firstTabbable(page.scroll, '.tmain')
      markPlaying(page.el)
      const art = page.scroll.querySelector('.hero-art')
      if (album.cover) {
        const thumb = IMG.cache.get('thumb:' + album.cover)
        if (thumb) {
          showArt(art, thumb, false)
          page.tint.set(thumb)
        }
        loadImage(album.cover, 'large').then((url) => {
          if (!url) return
          showArt(art, url, !thumb)
          if (!thumb) page.tint.set(url)
        })
      }
    })
    .catch((e) => (page.scroll.innerHTML = errorBlock(e)))
  return page
}

function artistPage(id) {
  const page = makePage('artist', { tinted: true })
  page.key = 'artist:' + id
  page.scroll.innerHTML = heroSkeleton(true) + skeletonGrid(4)
  page.menuFor = (target) => libraryMenu(target, { inArtist: true })
  page.activate = async (target) => {
    if (target.closest('[data-act="play"]')) {
      // Every album, oldest first, as one list.
      try {
        const ids = []
        for (const a of sortAlbums(page.albums || [], 'year').reverse()) ids.push(...(await albumTrackIds(a.id)))
        if (ids.length) playTrackList(ids, 0)
      } catch (e) {
        fail(e)
      }
      return
    }
    libraryActivate(target)
  }
  api
    .artist(id)
    .then(({ artist, albums }) => {
      page.albums = albums
      page.titleEl.textContent = artist.name || t('unknownArtist')
      const sorted = sortAlbums(albums, 'year')
      const tracks = albums.reduce((n, a) => n + (a.tracks || 0), 0)
      const picture = artist.image || (sorted.slice().reverse().find((a) => a.cover) || {}).cover || null
      page.scroll.innerHTML =
        `<header class="hero artist">` +
        `<div class="art hero-art round" style="${artStyle(artist.id)}"><span class="ini" aria-hidden="true">${esc(initials(artist.name))}</span></div>` +
        `<div class="hero-text"><h1 class="hero-title">${esc(artist.name || t('unknownArtist'))}</h1>` +
        `<p class="hero-meta">${esc([tn('albumsN', albums.length), tn('tracksN', tracks)].join(' · '))}</p>` +
        `<div class="actions"><button class="btn" data-act="play">${icon('play')}<span>${esc(t('play'))}</span></button></div></div></header>` +
        `<h3 class="shead">${esc(t('albums'))}</h3><ul class="grid">${sorted.map((a) => albumCard(a, { sub: a.year ? String(a.year) : tn('tracksN', a.tracks || 0) })).join('')}</ul>`
      hydrate(page.scroll)
      firstTabbable(page.scroll, '.grid > li > button')
      markPlaying(page.el)
      const art = page.scroll.querySelector('.hero-art')
      if (picture) {
        const thumb = IMG.cache.get('thumb:' + picture)
        if (thumb) {
          showArt(art, thumb, false)
          page.tint.set(thumb)
        }
        loadImage(picture, 'large').then((url) => {
          if (!url) return
          showArt(art, url, !thumb)
          if (!thumb) page.tint.set(url)
        })
      }
    })
    .catch((e) => (page.scroll.innerHTML = errorBlock(e)))
  return page
}

function genrePage(name) {
  const page = makePage('genre')
  page.key = 'genre:' + name
  page.titleEl.textContent = name
  page.scroll.innerHTML = skeletonGrid(6)
  api
    .genreAlbums(name)
    .then(({ albums }) => {
      const tracks = albums.reduce((n, a) => n + (a.tracks || 0), 0)
      page.scroll.innerHTML =
        `<header class="ghead" style="${artStyle(name)}"><span class="gicon">${icon('tag')}</span><div><h1 class="hero-title">${esc(name)}</h1><p class="hero-meta">${esc([tn('albumsN', albums.length), tn('tracksN', tracks)].join(' · '))}</p></div></header>` +
        `<ul class="grid">${sortAlbums(albums, 'artist').map((a) => albumCard(a)).join('')}</ul>`
      hydrate(page.scroll)
      firstTabbable(page.scroll, '.grid > li > button')
      markPlaying(page.el)
    })
    .catch((e) => (page.scroll.innerHTML = errorBlock(e)))
  return page
}

// --- Home: sections and library states ----------------------------------------------------------

const SECTIONS = ['artists', 'albums', 'tracks', 'genres']
function homePage() {
  const el = document.createElement('div')
  el.className = 'page home'
  el.innerHTML =
    `<div class="bar homebar"><div class="seg" role="tablist" aria-label="${esc(t('sections'))}">` +
    SECTIONS.map((s) => `<button role="tab" id="sec-${s}" data-section="${s}" aria-controls="secPanel" aria-selected="false" tabindex="-1">${esc(t(s))}</button>`).join('') +
    `</div><button class="ib libmenu" id="libMenuBtn" aria-haspopup="menu" aria-label="${esc(t('libMenu'))}" title="${esc(t('libMenu'))}">${icon('more')}</button></div>` +
    `<div class="scanbar" id="scanbar" hidden><span id="scanText"></span><div class="meter"><i id="scanFill"></i></div></div>` +
    `<div class="notice" id="missbar" hidden>${icon('folder')}<span><span id="missText"></span> <button class="link" data-act="folders">${esc(t('changeFolders'))}</button></span></div>` +
    `<div class="scroll" id="secPanel" role="tabpanel"></div>`
  const page = { kind: 'home', el, scroll: el.querySelector('.scroll'), dispose() {} }
  const seg = el.querySelector('.seg')
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-section]')
    if (b) setSection(b.dataset.section)
  })
  seg.addEventListener('keydown', (e) => {
    const i = SECTIONS.indexOf(LIB.section)
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: SECTIONS.length - 1 }[e.key]
    if (j === undefined) return
    e.preventDefault()
    const s = SECTIONS[(j + SECTIONS.length) % SECTIONS.length]
    setSection(s)
    $('sec-' + s).focus()
  })
  // The chips scroll sideways when the panel is too narrow for all four: their edges fade then.
  const edges = () => {
    seg.classList.toggle('more-left', seg.scrollLeft > 2)
    seg.classList.toggle('more-right', seg.scrollLeft + seg.clientWidth < seg.scrollWidth - 2)
  }
  seg.addEventListener('scroll', edges, { passive: true })
  new ResizeObserver(edges).observe(seg)
  el.querySelector('#libMenuBtn').onclick = (e) => openMenu(libraryMenuItems(e.currentTarget), e.currentTarget, e.currentTarget)
  el.querySelector('#missbar [data-act="folders"]').onclick = (e) => openFolders(e.currentTarget)
  page.sortMenu = (btn) => {
    openMenu(
      ['artist', 'title', 'year'].map((by) => ({
        label: t('sort' + by[0].toUpperCase() + by.slice(1)),
        checked: LIB.sort === by,
        run: () => {
          LIB.sort = by
          saveUi()
          renderSection()
        }
      })),
      btn,
      btn
    )
  }
  page.activate = (target) => {
    if (target.closest('[data-act="rescan"]')) return rescan()
    const folders = target.closest('[data-act="folders"]')
    if (folders) return openFolders(folders)
    const od = target.closest('[data-act="onedrive"]')
    if (od) return openOneDrive(od)
    const sort = target.closest('[data-act="sort"]')
    if (sort) return page.sortMenu(sort)
    libraryActivate(target)
  }
  page.menuFor = (target) => libraryMenu(target)
  LIB.home = page
  return page
}

function setSection(s) {
  if (!SECTIONS.includes(s)) return
  if (LIB.section === s && LIB.home.scroll.childElementCount) return
  LIB.section = s
  saveUi()
  renderSection()
}

// A fresh scrolling body for each section, so a section's listeners never outlive it.
function freshScroll() {
  const page = LIB.home
  const old = page.scroll
  const next = old.cloneNode(false)
  old.replaceWith(next)
  page.scroll = next
  wireActions(next, { activate: (t) => page.activate(t), menuFor: (t) => page.menuFor(t) })
  next.addEventListener('keydown', (e) => {
    const grid = e.target.closest('.grid')
    if (grid) gridKeys(e, grid)
  })
  LIB.list = null
  return next
}

const ready = (st) => st && (st.state === 'ready' || (st.state === 'scanning' && st.counts && st.counts.tracks > 0 && st.scannedAt))

function renderHome() {
  const page = LIB.home
  if (!page) return
  const st = LIB.status
  const bar = page.el.querySelector('.homebar')
  bar.hidden = !ready(st)
  paintScanbar()
  if (ready(st)) return renderSection()
  showState(freshScroll(), st)
}
// A library state screen; the first-run one holds the folder picker.
function showState(scroll, st) {
  scroll.innerHTML = stateScreen(st)
  const host = scroll.querySelector('[data-picker]')
  if (host) mountPicker(host)
}

function stateScreen(st) {
  if (!st) return `<div class="state" role="status"><p>${esc(t('libLoading'))}</p></div>` + skeletonGrid(6)
  const folders = (st.folders || []).filter(Boolean)
  const missing = (st.missingFolders || []).filter(Boolean)
  const where =
    (missing.length ? `<p class="where">${icon('folder')}<span>${esc(t('libMissing', { folders: missing.join(', ') }))}</span></p>` : `<p class="where">${icon('folder')}<span>${esc(t('libWhere'))}</span></p>`) +
    `<p class="aimpnote">${esc(t('libAimp'))}</p>`
  const changeBtn = `<button class="btn ghost" data-act="folders">${icon('folder')}<span>${esc(t('changeFolders'))}</span></button>`
  if (st.state === 'scanning') {
    const p = st.progress || {}
    const pct = p.phase === 'listing' ? 4 : p.total ? Math.round((100 * (p.done || 0)) / p.total) : 0
    const found = st.counts && st.counts.tracks ? t('scanFound', { what: [tn('albumsN', st.counts.albums || 0), tn('tracksN', st.counts.tracks)].join(' · ') }) : ''
    return (
      `<div class="state" data-scan><div class="disc spin" aria-hidden="true"></div><h2>${esc(t('scanning'))}</h2>` +
      `<div class="meter big" role="progressbar" aria-label="${esc(t('scanning'))}" aria-valuemin="0" aria-valuemax="${p.total || 0}" aria-valuenow="${p.done || 0}" aria-valuetext="${esc(scanLine(p))}"><i style="width:${pct}%"></i></div>` +
      `<p class="muted" data-line>${esc(scanLine(p))}</p><p class="muted" data-found>${esc(found)}</p>` +
      `</div>`
    )
  }
  if (st.state === 'error') {
    const unavailable = st.code === 'unknown_method'
    return (
      `<div class="state"><div class="disc" aria-hidden="true"></div><h2>${esc(t('libErrorTitle'))}</h2><p>${esc(unavailable ? t('libUnavailable') : st.error || t('failed'))}</p>` +
      (unavailable ? '' : `${where}<div class="state-actions"><button class="btn" data-act="rescan">${icon('refresh')}<span>${esc(t('rescan'))}</span></button>${changeBtn}</div>`) +
      `</div>`
    )
  }
  // Empty: nothing found in the folders, or no folders at all. The picker says where to look.
  const names = folders.map((f) => `<b>${esc(f)}</b>`).join(', ')
  return (
    `<div class="state firstrun"><div class="sicon" aria-hidden="true">${icon('folder')}</div><h2>${esc(t('libEmptyTitle'))}</h2>` +
    `<p>${folders.length ? esc(t('libEmptyText', { folders: '\u0000' })).replace('\u0000', names) : esc(t('libNoFolders'))}</p>` +
    (missing.length ? `<p class="where">${icon('folder')}<span>${esc(t('libMissing', { folders: missing.join(', ') }))}</span></p>` : '') +
    `<button class="btn ghost od-start" data-act="onedrive">${icon('cloud')}<span>${esc(t('libConnectOd'))}</span></button>` +
    `</div><div data-picker></div>`
  )
}

// Updates the scan screen in place (or draws it, the first time).
function paintScanScreen(st) {
  const box = LIB.home.scroll.querySelector('[data-scan]')
  if (!box) return showState(LIB.home.scroll, st)
  const p = st.progress || {}
  const bar = box.querySelector('[role="progressbar"]')
  bar.setAttribute('aria-valuemax', String(p.total || 0))
  bar.setAttribute('aria-valuenow', String(p.done || 0))
  bar.setAttribute('aria-valuetext', scanLine(p))
  bar.firstElementChild.style.width = (p.phase === 'listing' ? 4 : p.total ? Math.round((100 * (p.done || 0)) / p.total) : 0) + '%'
  box.querySelector('[data-line]').textContent = scanLine(p)
  box.querySelector('[data-found]').textContent = st.counts && st.counts.tracks ? t('scanFound', { what: [tn('albumsN', st.counts.albums || 0), tn('tracksN', st.counts.tracks)].join(' · ') }) : ''
}

// The scan's progress: first B-Side lists the folders (only a count so far), then reads each file.
function scanLine(p = {}) {
  if (p.phase === 'listing') return t('scanListing', { n: num(p.total || p.done || 0) })
  return p.total ? t('scanProgress', { done: num(p.done || 0), total: num(p.total) }) : ''
}

// Over a library that shows: a slim bar while a new scan runs, and folders that were not found.
function paintScanbar() {
  const st = LIB.status
  const show = Boolean(st && st.state === 'scanning' && ready(st))
  $('scanbar').hidden = !show
  const missing = (st && ready(st) && st.missingFolders) || []
  $('missbar').hidden = !missing.length
  if (missing.length) $('missText').textContent = t('libMissing', { folders: missing.join(', ') })
  if (!show) return
  const p = st.progress || {}
  $('scanText').textContent = [t('scanning'), scanLine(p)].filter(Boolean).join(' ')
  $('scanFill').style.width = (p.phase !== 'listing' && p.total ? Math.round((100 * (p.done || 0)) / p.total) : 4) + '%'
}

async function renderSection() {
  const page = LIB.home
  const s = LIB.section
  for (const b of page.el.querySelectorAll('[data-section]')) {
    const on = b.dataset.section === s
    b.setAttribute('aria-selected', String(on))
    b.tabIndex = on ? 0 : -1
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  const scroll = freshScroll()
  scroll.setAttribute('aria-labelledby', 'sec-' + s)
  if (s === 'tracks') return tracksSection(scroll)
  scroll.innerHTML = skeletonGrid(8, s === 'artists')
  try {
    if (s === 'albums') {
      const { albums } = await api.albums()
      if (page.scroll !== scroll) return
      const by = t('sort' + LIB.sort[0].toUpperCase() + LIB.sort.slice(1))
      scroll.innerHTML =
        `<div class="countrow"><p class="count">${esc(tn('albumsN', albums.length))}</p>` +
        `<button class="sortbtn" data-act="sort" aria-haspopup="menu" aria-label="${esc(t('sort') + ': ' + by)}" title="${esc(t('sort'))}">${icon('sort')}<span>${esc(by)}</span></button></div><ul class="grid">${sortAlbums(albums, LIB.sort).map((a) => albumCard(a)).join('')}</ul>`
    } else if (s === 'artists') {
      const [{ artists }, { albums }] = await Promise.all([api.artists(), api.albums().catch(() => ({ albums: [] }))])
      if (page.scroll !== scroll) return
      // An artist without a picture shows their first album's cover, else their initials.
      const covers = new Map()
      for (const a of sortAlbums(albums, 'year').reverse()) if (a.cover && !covers.has(a.artistId)) covers.set(a.artistId, a.cover)
      scroll.innerHTML = `<p class="count">${esc(tn('artistsN', artists.length))}</p><ul class="grid artists">${artists.map((ar) => artistCard(ar, covers.get(ar.id))).join('')}</ul>`
    } else if (s === 'genres') {
      const { genres } = await api.genres()
      if (page.scroll !== scroll) return
      scroll.innerHTML = `<p class="count">${esc(t('genres'))} · ${esc(num(genres.length))}</p><ul class="grid genres">${genres.map(genreTile).join('')}</ul>`
    }
    hydrate(scroll)
    firstTabbable(scroll, '.grid > li > button')
    markPlaying(scroll)
  } catch (e) {
    if (page.scroll === scroll) scroll.innerHTML = errorBlock(e)
  }
}

// All tracks, artist by artist, drawn as a virtual list: only the rows on screen (and a few around
// them) exist; pages of rows are fetched as they come into view.
const ROW_H = 56
function tracksSection(scroll) {
  const st = LIB.status || {}
  const cloud = st.counts && st.counts.cloudOnly
  scroll.innerHTML = `<p class="count" id="trackCount"></p><ul class="vlist" role="list" aria-label="${esc(t('tracks'))}"></ul>`
  const ul = scroll.querySelector('.vlist')
  const V = { total: 0, size: 100, pages: new Map(), loading: new Set(), rows: new Map(), focus: 0, frame: 0, done: false }
  LIB.list = V
  const at = (i) => V.pages.get(Math.floor(i / V.size))?.[i % V.size]
  const load = async (pi) => {
    if (V.pages.has(pi) || V.loading.has(pi)) return
    V.loading.add(pi)
    try {
      const r = await api.tracks(pi * V.size, V.size)
      V.total = Number(r.total) || 0
      V.pages.set(pi, keepTracks(r.tracks || []))
      ul.style.height = V.total * ROW_H + 'px'
      $('trackCount') && ($('trackCount').textContent = tn('tracksN', V.total) + (cloud ? ' · ' + tn('cloudN', cloud) : ''))
    } catch (e) {
      if (!V.pages.size) scroll.innerHTML = errorBlock(e)
      return
    } finally {
      V.loading.delete(pi)
    }
    draw()
  }
  function draw() {
    V.frame = 0
    if (!ul.isConnected) return
    const top = ul.offsetTop
    const [a, b] = visibleRange(scroll.scrollTop - top, scroll.clientHeight, ROW_H, V.total, 8)
    for (const [i, li] of V.rows) {
      if ((i < a || i >= b) && !li.contains(document.activeElement)) {
        li.remove()
        V.rows.delete(i)
      }
    }
    for (let i = a; i < b; i++) {
      const tr = at(i)
      const key = tr ? tr.id : 'skel'
      const old = V.rows.get(i)
      if (old && old.dataset.key === key) continue
      const li = htmlNode(tr ? trackRow(tr, { art: true, sub: [tr.artist || t('unknownArtist'), tr.album || t('unknownAlbum')].join(' · ') }) : skeletonRow())
      li.dataset.key = key
      li.dataset.index = i
      li.style.transform = `translateY(${i * ROW_H}px)`
      li.setAttribute('aria-setsize', V.total)
      li.setAttribute('aria-posinset', i + 1)
      if (old) old.replaceWith(li)
      else ul.appendChild(li)
      V.rows.set(i, li)
      if (tr) hydrate(li)
      else load(Math.floor(i / V.size))
    }
    // A row the keys moved to arrives with its page: focus it then.
    const wanted = V.wantFocus != null && V.rows.get(V.wantFocus)?.querySelector('.tmain')
    if (wanted) {
      V.wantFocus = null
      wanted.tabIndex = 0
      wanted.focus({ preventScroll: true })
    }
    const focusRow = V.rows.get(V.focus)
    for (const li of V.rows.values()) {
      const main = li.querySelector('.tmain')
      if (main) main.tabIndex = li === focusRow ? 0 : -1
    }
    markPlaying(ul)
  }
  const schedule = () => V.frame || (V.frame = requestAnimationFrame(draw))
  scroll.addEventListener('scroll', schedule, { passive: true })
  new ResizeObserver(schedule).observe(scroll)
  // Arrow keys move through every track, not only the drawn ones.
  scroll.addEventListener('keydown', (e) => {
    const btn = e.target.closest('.tmain, .tmore')
    if (!btn) return
    const li = btn.closest('.trow')
    if (e.key === 'ArrowRight' && btn.classList.contains('tmain')) return e.preventDefault(), li.querySelector('.tmore').focus()
    if (e.key === 'ArrowLeft' && btn.classList.contains('tmore')) return e.preventDefault(), li.querySelector('.tmain').focus()
    const i = Number(li.dataset.index)
    const page = Math.max(1, Math.floor(scroll.clientHeight / ROW_H) - 1)
    const j = { ArrowDown: i + 1, ArrowUp: i - 1, PageDown: i + page, PageUp: i - page, Home: 0, End: V.total - 1 }[e.key]
    if (j === undefined) return
    e.preventDefault()
    V.focus = Math.max(0, Math.min(V.total - 1, j))
    const y = ul.offsetTop + V.focus * ROW_H
    if (y < scroll.scrollTop + ROW_H) scroll.scrollTop = Math.max(0, y - ROW_H)
    else if (y + ROW_H > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = y + 2 * ROW_H - scroll.clientHeight
    V.wantFocus = V.focus
    draw()
  })
  scroll.addEventListener('focusin', (e) => {
    const li = e.target.closest('.trow[data-index]')
    if (li) V.focus = Number(li.dataset.index)
  })
  load(0)
}

// --- Library status ------------------------------------------------------------------------------

// Asked at start, every 1.2 s while a scan runs (for its progress) and every 30 s otherwise (a scan
// started elsewhere, folders changed in Settings). A new index (scannedAt) redraws what shows.
async function refreshStatus() {
  clearTimeout(LIB.timer)
  let st
  try {
    st = await api.status()
  } catch (e) {
    st = { state: 'error', code: e.code, error: (e && MESSAGES[e.code]) || e.message, folders: [], counts: {} }
  }
  const old = LIB.status
  LIB.status = st
  // `version` changes with every new index (a scan, a OneDrive sync); older workers sent scannedAt.
  const stamp = st.version !== undefined ? st.version : st.scannedAt
  const changed = stamp !== LIB.version
  if (changed) {
    LIB.version = stamp
    LIB.memo.clear()
  }
  const shape = (s) => (s ? [s.state, ready(s), s.code].join('|') : '')
  if (!old || shape(old) !== shape(st) || (changed && ready(st))) {
    renderHome()
    if (changed && old) refreshPages()
  } else if (st.state === 'scanning') {
    if (ready(st)) paintScanbar()
    else if (LIB.home) paintScanScreen(st)
  }
  if (st.code === 'unknown_method') return
  LIB.timer = setTimeout(refreshStatus, st.state === 'scanning' ? 1200 : 30000)
}

// --- Music folders --------------------------------------------------------------------------------

// The folder picker: where the library's music is. The worker suggests the Windows Music folder and
// each OneDrive's music folder with their big subfolders (with track counts); the person picks one
// or more, or pastes a full path, and "Use these folders" saves them as Orca's libraryFolders
// setting and starts a scan (library.setFolders). It shows on the first run, when nothing was
// found, and from the library's menu ("Change folders"). Paths are the person's own and show here.
const MAX_LIB_FOLDERS = 16 // as the worker reads them (src/library/scan.mjs)
const SUGGEST = { at: 0, promise: null }
// Looking for music lists every candidate folder: kept for a minute, so reopening is instant.
function suggestions() {
  if (!SUGGEST.promise || performance.now() - SUGGEST.at > 60000) {
    SUGGEST.at = performance.now()
    SUGGEST.promise = api.suggestFolders()
    SUGGEST.promise.catch(() => (SUGGEST.promise = null))
  }
  return SUGGEST.promise
}

// A localized message for what library.setFolders refused.
function pickError(e, count) {
  const code = e && e.code
  if (code === 'not_found') {
    const m = /Not a folder: (.+)$/.exec((e && e.message) || '')
    return m ? t('pickNotFound', { path: m[1] }) : t('pickNotFoundAny')
  }
  if (code === 'invalid') return count > MAX_LIB_FOLDERS ? t('pickTooMany', { n: MAX_LIB_FOLDERS }) : t('pickBadPath')
  // The worker's "unavailable" is about Orca's settings; Orca's own means the worker is restarting.
  if (code === 'unavailable' && /setting/i.test((e && e.message) || '')) return t('pickNoSettings')
  return MESSAGES[code] || t('failed')
}

let pickerSeq = 0
function mountPicker(host, { onDone } = {}) {
  const n = ++pickerSeq
  const P = { items: [], selected: new Set(), busy: false, loaded: false }
  const names = (LIB.status && LIB.status.state !== 'empty' && LIB.status.folders) || []
  host.innerHTML =
    `<section class="picker" aria-labelledby="pk-title-${n}">` +
    `<h2 class="pk-title" id="pk-title-${n}">${esc(t('pickTitle'))}</h2>` +
    `<p class="pk-intro" data-intro role="status">${esc(t('pickLooking'))}</p>` +
    (names.length ? `<p class="pk-now">${esc(t('pickNow', { folders: names.join(', ') }))}</p>` : '') +
    `<div class="pk-list" role="group" aria-labelledby="pk-title-${n}" data-list>${'<span class="pk-card pk-skel" aria-hidden="true"><span class="skel" style="width:22px;height:22px;border-radius:50%"></span><span class="pk-text"><span class="skel" style="width:55%;height:12px"></span><span class="skel" style="width:35%;height:10px;margin-top:6px"></span></span></span>'.repeat(3)}</div>` +
    `<label class="pk-label" for="pk-in-${n}">${esc(t('pickPaste'))}</label>` +
    `<div class="pk-paste"><input class="pk-input" id="pk-in-${n}" type="text" spellcheck="false" autocomplete="off" placeholder="${esc(t('pickPlaceholder'))}"><button class="btn ghost" data-add>${esc(t('pickAdd'))}</button></div>` +
    `<p class="pk-error" data-error role="alert" hidden>${icon('warn')}<span></span></p>` +
    `<button class="btn pk-use" data-use disabled></button>` +
    `<p class="pk-also">${icon('folder')}<span>${esc(t('pickAlso'))}</span></p>` +
    `<p class="pk-aimp">${esc(t('libAimp'))}</p>` +
    `</section>`
  const q = (sel) => host.querySelector(sel)
  const input = q('.pk-input')

  // A short name on the card ("Hi-Fi Collection · OneDrive"); the full path only in the tooltip, so
  // a person's folder paths do not show on screen or in screenshots.
  const placeOf = (it) => {
    if (it.place && it.place !== 'pc') return it.place
    if (it.place === 'pc') return t('pickThisPC')
    const drive = /^[A-Za-z]:/.exec(it.path)
    return drive ? drive[0].toUpperCase() : t('pickNetwork')
  }
  const card = (it) => {
    const title = `${it.name} · ${placeOf(it)}`
    const sub = typeof it.tracks === 'number' ? tn('tracksN', it.tracks) : ''
    const label = [title, sub, it.current ? t('pickInUse') : ''].filter(Boolean).join(', ')
    return (
      `<button class="pk-card" role="checkbox" aria-checked="${P.selected.has(it.key)}" data-key="${esc(it.key)}" aria-label="${esc(label)}" title="${esc(it.path)}">` +
      `<span class="pk-check" aria-hidden="true">${icon('check')}</span>` +
      `<span class="pk-text"><b>${esc(title)}</b>${sub || it.current ? `<span>${it.current ? `<i class="pk-inuse">${esc(t('pickInUse'))} · </i>` : ''}${esc(sub)}</span>` : ''}</span>` +
      (it.current ? `<span class="pk-badge">${esc(t('pickInUse'))}</span>` : '') +
      `</button>`
    )
  }
  // The list is drawn again only when it changes; a toggle updates the cards in place, so focus
  // stays on the card the person pressed.
  function drawList() {
    const focused = document.activeElement && host.contains(document.activeElement) && document.activeElement.dataset.key
    q('[data-list]').innerHTML = P.items.map(card).join('')
    if (focused) host.querySelector(`[data-key="${CSS.escape(focused)}"]`)?.focus()
    paintState()
  }
  function paintState() {
    for (const el of host.querySelectorAll('[data-key]')) el.setAttribute('aria-checked', String(P.selected.has(el.dataset.key)))
    // A path typed in the field counts: Use adds it first.
    const count = P.selected.size + (input.value.trim() ? 1 : 0)
    const use = q('[data-use]')
    use.disabled = !count || P.busy
    use.setAttribute('aria-busy', String(P.busy))
    use.innerHTML = P.busy ? `<span>${esc(t('pickSaving'))}</span>` : `${icon('check')}<span>${esc(count ? tn('pickUseN', count) : t('pickUse'))}</span>`
  }
  const showError = (text) => {
    const box = q('[data-error]')
    box.hidden = !text
    box.querySelector('span').textContent = text || ''
  }
  // Said where it is always seen, whatever part of the list is on screen.
  const note = (text) => text && toast(text)

  function toggle(key) {
    const it = P.items.find((i) => i.key === key)
    if (!it || P.busy) return
    showError('')
    note('')
    if (P.selected.has(key)) {
      P.selected.delete(key)
      // A pasted folder that is no longer chosen leaves the list.
      if (it.custom) {
        P.items = P.items.filter((i) => i !== it)
        return drawList()
      }
      return paintState()
    }
    // A folder and a folder inside it would be read twice: choosing one drops the other.
    for (const k of [...P.selected]) {
      const other = P.items.find((i) => i.key === k)
      if (!other) continue
      if (folderInside(other.path, it.path)) note(t('pickNested', { outer: it.name, inner: other.name }))
      else if (folderInside(it.path, other.path)) note(t('pickNested', { outer: other.name, inner: it.name }))
      else continue
      P.selected.delete(k)
    }
    if (P.selected.size >= MAX_LIB_FOLDERS) return showError(t('pickTooMany', { n: MAX_LIB_FOLDERS }))
    P.selected.add(key)
    paintState()
  }

  // A pasted path joins the list, chosen. Returns false when it is not a full folder path.
  function addPasted() {
    const raw = input.value
    if (!raw.trim()) return true
    const path = cleanFolderPath(raw)
    if (!path) {
      showError(t('pickBadPath'))
      input.focus()
      return false
    }
    const key = folderKey(path)
    if (!P.items.some((i) => i.key === key)) P.items.unshift({ key, path, name: folderLeaf(path), custom: true })
    input.value = ''
    drawList()
    if (!P.selected.has(key)) toggle(key)
    return P.selected.has(key)
  }

  async function use() {
    if (!addPasted() || P.busy) return
    const folders = P.items.filter((i) => P.selected.has(i.key)).map((i) => i.path)
    if (!folders.length) return
    P.busy = true
    showError('')
    paintState()
    try {
      await api.setFolders(folders)
      SUGGEST.promise = null
      LIB.memo.clear()
      if (onDone) onDone()
      refreshStatus()
    } catch (e) {
      P.busy = false
      paintState()
      showError(pickError(e, folders.length))
    }
  }

  host.addEventListener('click', (e) => {
    const cardEl = e.target.closest('[data-key]')
    if (cardEl) return toggle(cardEl.dataset.key)
    if (e.target.closest('[data-add]')) return addPasted() && input.focus()
    if (e.target.closest('[data-use]')) use()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    addPasted()
  })
  input.addEventListener('input', () => {
    showError('')
    paintState()
  })
  paintState()

  suggestions()
    .then((r) => {
      const found = Array.isArray(r && r.folders) ? r.folders : []
      const overlaps = (path) =>
        [...P.selected].some((k) => {
          const o = P.items.find((i) => i.key === k)
          return o && (folderInside(path, o.path) || folderInside(o.path, path))
        })
      for (const f of found) {
        if (!f || typeof f.path !== 'string') continue
        const key = folderKey(f.path)
        if (P.items.some((i) => i.key === key)) continue
        P.items.push({ key, path: f.path, name: f.name || folderLeaf(f.path), parent: f.parent || '', place: typeof f.place === 'string' ? f.place : '', tracks: Number(f.tracks) || 0, current: Boolean(f.current) })
        // What the library reads now stays chosen, unless it holds no music.
        if (f.current && Number(f.tracks) > 0 && !overlaps(f.path)) P.selected.add(key)
      }
      q('[data-intro]').textContent = found.length ? t('pickIntro') : t('pickNone')
      drawList()
    })
    .catch(() => {
      q('[data-intro]').textContent = t('pickFailed')
      drawList()
    })
}

function foldersPage() {
  const page = makePage('folders')
  page.key = 'folders:'
  page.titleEl.textContent = t('changeFolders')
  page.scroll.innerHTML = '<div class="pk-host"></div>'
  mountPicker(page.scroll.firstElementChild, { onDone: () => page.el.isConnected && goBack() })
  return page
}

// The library's own menu, beside the section chips.
function libraryMenuItems(opener) {
  return [
    { label: t('changeFolders'), icon: 'folder', run: () => openFolders(opener) },
    { label: t('libOneDrive'), icon: 'cloud', run: () => openOneDrive(opener) },
    { label: t('rescan'), icon: 'refresh', run: () => rescan() }
  ]
}

async function rescan() {
  try {
    await api.rescan()
  } catch (e) {
    fail(e)
  }
  setTimeout(refreshStatus, 300)
}
