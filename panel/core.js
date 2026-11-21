'use strict'
/* B-Side panel, shared core: DOM shortcuts, the panel's language, the one bridge to the worker
 * (`ask`), messages, the image cache and lazy loader, cover colours per scope (`Tint`), the
 * context menu and small pure helpers the views share.
 *
 * The panel is classic scripts sharing their top-level names, loaded in this order: palette.js,
 * skins.js, i18n.js, core.js, views/now.js, views/library.js, views/search.js, app.js. Nothing here touches
 * the DOM while loading, so test/panel-core.test.mjs runs it in Node. */

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const icon = (n) => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`
const fmt = (ms) => {
  if (!(ms >= 0)) return '0:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s % 60).padStart(2, '0')}`
}

// --- Language ----------------------------------------------------------------------------------

// The choice is kept in the plugin's storage; the default follows Orca, then the system, then English.
const { LANGS, STRINGS, ERROR_CODES } = BSideI18n
const pickLang = (tag) => {
  const base = String(tag || '').toLowerCase().split(/[-_]/)[0]
  return STRINGS[base] ? base : null
}
const NAVIGATOR = typeof navigator !== 'undefined' ? navigator : {}
let LANG = pickLang(globalThis.orca && orca.locale) || (NAVIGATOR.languages || []).map(pickLang).find(Boolean) || pickLang(NAVIGATOR.language) || 'en'
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m))
function t(key, vars) {
  let s = STRINGS[LANG][key] ?? STRINGS.en[key] ?? key
  if (s && typeof s === 'object') s = s.other
  return vars ? fill(s, vars) : s
}
const num = (n) => {
  try {
    return new Intl.NumberFormat(LANG).format(n)
  } catch {
    return String(n)
  }
}
// A count with the language's plural form: tn('albumsN', 3) is "3 albums", "3 альбома".
function tn(key, n) {
  const forms = STRINGS[LANG][key] ?? STRINGS.en[key]
  let rule = 'other'
  try {
    rule = new Intl.PluralRules(LANG).select(n)
  } catch {}
  return fill(forms[rule] ?? forms.other, { n: num(n) })
}
// An album's length: "48 min", "1 h 12 min".
function fmtLong(ms) {
  const m = Math.round((ms || 0) / 60000)
  return m >= 60 ? t('durHour', { h: Math.floor(m / 60), m: m % 60 }) : t('durMin', { m })
}
const MESSAGES = new Proxy({}, { get: (_, code) => (ERROR_CODES.includes(code) ? t(code) : undefined) })

// --- The worker ---------------------------------------------------------------------------------

// The worker returns B-Side's own errors as { error: { code, message } } (Orca only carries its
// own codes); turn them back into errors with a code.
// Orca's bridge refuses an input that holds `undefined` anywhere (invalid_params), so the input
// always goes as plain JSON: `{ command: 'next', args: undefined }` becomes `{ command: 'next' }`.
const plain = (value) => (value === undefined ? {} : JSON.parse(JSON.stringify(value)))
async function ask(name, input = {}, options) {
  const r = await orca.plugin.request(name, plain(input), options)
  if (r && r.error && r.error.code) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r
}

let toastTimer = 0
function toast(text, bad = false, detail = '') {
  const el = $('toast')
  el.textContent = text
  el.title = detail // the raw message, for diagnosis; the worker also logs it
  el.className = 'toast on' + (bad ? ' bad' : '')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.className = 'toast'), 3600)
}
// Always a message in the person's language; unknown codes get the generic one.
const fail = (e) => toast((e && MESSAGES[e.code]) || t('failed'), true, (e && e.message) || '')

// Where the person is: the tab (`now`, `library`, `search`) and whether the panel is wide enough
// for two panes, where Now Playing is always on the right.
const UI = { tab: 'now', wide: false }

const reducedMotion = globalThis.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false }

// --- Pure helpers -------------------------------------------------------------------------------

function debounce(fn, ms) {
  let timer = 0
  const run = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  run.cancel = () => clearTimeout(timer)
  return run
}

// A stable hue from any id (FNV-1a), for placeholder art that differs from album to album.
function hashHue(s) {
  let h = 0x811c9dc5
  for (const c of String(s ?? '')) h = Math.imul(h ^ c.codePointAt(0), 0x01000193) >>> 0
  return h % 360
}
const artStyle = (seed) => {
  const h = hashHue(seed)
  return `--h1:${h};--h2:${(h + 48 + (h % 60)) % 360}`
}
// Up to two letters for an avatar: "Sunset Arcade" -> "SA", "The Quiet Hours" -> "QH", "久石" -> "久".
function initials(name) {
  const words = String(name ?? '')
    .replace(/^the\s+/i, '')
    .split(/[\s\-_/&.,]+/u)
    .map((w) => [...w].find((c) => /[\p{L}\p{N}]/u.test(c)))
    .filter(Boolean)
  if (!words.length) return '♪'
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(words[0])) return words[0]
  return words
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase()
}

// The format in one sober line, as the panel shows it: "FLAC | 16 bits | 44.1 kHz | 738 kbps |
// Stereo". From the library ({ codec, sampleRate, bits }) or from AIMP ({ codec, sampleRate,
// bitrate, channels } plus the library's bits); whatever is unknown is left out, no gap.
function techParts(q) {
  if (!q) return []
  const parts = []
  const rate = Number(q.sampleRate) || 0
  const bits = Number(q.bits) || 0
  const channels = Number(q.channels) || 0
  if (q.codec) parts.push(String(q.codec).toUpperCase())
  if (bits) parts.push(t('bits', { n: bits }))
  if (rate) parts.push(`${Number.isInteger(rate / 1000) ? rate / 1000 : (rate / 1000).toFixed(1)} kHz`)
  if (Number(q.bitrate) > 0) parts.push(`${Math.round(q.bitrate)} kbps`)
  if (channels) parts.push(channels === 2 ? t('stereo') : channels === 1 ? t('mono') : `${channels} ${t('channels')}`)
  return parts
}
// Its markup: one span per part; the thin separators are drawn by the stylesheet, not read aloud.
const techHtml = (parts, extra = '') => parts.map((part) => `<span>${esc(part)}</span>`).join('') + extra

// Locale-aware, accent- and case-insensitive, numbers in order ("Track 2" before "Track 10").
const COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
const collate = (a, b) => COLLATOR.compare(String(a ?? ''), String(b ?? ''))
const yearOf = (a) => Number(a.year) || 0
const SORTS = {
  artist: (a, b) => collate(a.artist, b.artist) || yearOf(a) - yearOf(b) || collate(a.title, b.title),
  title: (a, b) => collate(a.title, b.title) || collate(a.artist, b.artist),
  year: (a, b) => yearOf(b) - yearOf(a) || collate(a.artist, b.artist) || collate(a.title, b.title)
}
const sortAlbums = (albums, by) => albums.slice().sort(SORTS[by] || SORTS.artist)

// The rows of a virtual list to draw: [first, last) with `overscan` rows either side.
function visibleRange(scrollTop, height, rowHeight, total, overscan = 6) {
  if (!total || !(rowHeight > 0)) return [0, 0]
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const last = Math.min(total, Math.ceil((scrollTop + Math.max(0, height)) / rowHeight) + overscan)
  return [Math.min(first, last), last]
}

// Album tracks by disc, in disc order; a single disc gives one group.
function groupDiscs(tracks) {
  const groups = new Map()
  for (const tr of tracks) {
    const d = Number(tr.disc) || 1
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d).push(tr)
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([disc, list]) => ({ disc, tracks: list }))
}

// A folder path the person pasted, cleaned as the worker reads the libraryFolders setting
// (src/library/scan.mjs parseFolders): quotes dropped, a drive (C:\) or network (\\server\share)
// path, backslashes, no trailing backslash. Null when it is not a full Windows path.
function cleanFolderPath(text) {
  let f = String(text ?? '').trim().replace(/^"(.*)"$/, '$1').trim()
  if (!/^([a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i.test(f)) return null
  const unc = f.startsWith('\\\\')
  f = f.replace(/\//g, '\\').replace(/\\{2,}/g, '\\')
  if (unc) f = '\\' + f
  if (f.length > 3) f = f.replace(/\\+$/, '')
  return f
}
const folderKey = (path) => String(path ?? '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
// Whether folder `a` is inside folder `b` (or is `b`), ignoring case: C:\Music\Rock is in C:\Music.
const folderInside = (a, b) => {
  const x = folderKey(a)
  const y = folderKey(b)
  return x === y || x.startsWith(y.endsWith('\\') ? y : y + '\\')
}
// The last name of a folder path, as the worker names folders: "C:\Music\Rock" -> "Rock".
const folderLeaf = (path) => String(path ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(path ?? '')

// Where a menu of size w x h goes for a point (x, y) in a viewport vw x vh: below-right of the
// point, flipped when it would leave the viewport, and always 8 px inside it.
function placeMenu(x, y, w, h, vw, vh) {
  const m = 8
  let left = x + w + m > vw ? x - w : x
  let top = y + h + m > vh ? y - h : y
  left = Math.max(m, Math.min(left, vw - w - m))
  top = Math.max(m, Math.min(top, vh - h - m))
  return { left, top }
}

// --- Images -------------------------------------------------------------------------------------

// Most recently used images, capped by count and by the size of their data URLs (the panel can
// browse thousands of covers; memory stays bounded). `null` (no image) is cached too.
class ImageCache {
  constructor(maxBytes = 40 * 2 ** 20, maxItems = 1200) {
    this.maxBytes = maxBytes
    this.maxItems = maxItems
    this.map = new Map()
    this.bytes = 0
  }
  static size(v) {
    return v ? v.length : 16
  }
  has(key) {
    return this.map.has(key)
  }
  get(key) {
    if (!this.map.has(key)) return undefined
    const v = this.map.get(key)
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }
  set(key, value) {
    if (this.map.has(key)) {
      this.bytes -= ImageCache.size(this.map.get(key))
      this.map.delete(key)
    }
    this.map.set(key, value)
    this.bytes += ImageCache.size(value)
    while ((this.bytes > this.maxBytes || this.map.size > this.maxItems) && this.map.size > 1) {
      const [k, v] = this.map.entries().next().value
      this.map.delete(k)
      this.bytes -= ImageCache.size(v)
    }
  }
}

// Images come from the worker (`library.image`), a few at a time, newest request first, so the
// covers on screen arrive before the ones scrolled past. A lazy image (`lazyArt`) asks only once
// it is near the viewport, and its request is dropped if it has scrolled away before its turn.
const IMG = { cache: new ImageCache(), pending: new Map(), queue: [], active: 0, max: 4, wait: 0, io: null, near: new WeakSet() }

function loadImage(id, size = 'thumb', el = null) {
  const key = size + ':' + id
  const hit = IMG.cache.get(key)
  if (hit !== undefined) return Promise.resolve(hit)
  let d = IMG.pending.get(key)
  if (!d) {
    d = { key, id, size, els: new Set(), eager: false }
    d.promise = new Promise((resolve) => (d.resolve = resolve))
    IMG.pending.set(key, d)
    IMG.queue.push(key)
  } else {
    // Asked again: move it to the front of the line.
    const i = IMG.queue.indexOf(key)
    if (i >= 0) IMG.queue.splice(i, 1)
    IMG.queue.push(key)
  }
  if (el) d.els.add(el)
  else d.eager = true
  pumpImages()
  return d.promise
}

function pumpImages() {
  if (IMG.wait) return
  while (IMG.active < IMG.max && IMG.queue.length) {
    const key = IMG.queue.pop()
    const d = IMG.pending.get(key)
    if (!d) continue
    // Only lazy requests whose elements all left the screen: forget them; they ask again later.
    if (!d.eager && d.els.size && ![...d.els].some((el) => el.isConnected && IMG.near.has(el))) {
      IMG.pending.delete(key)
      d.resolve(undefined)
      continue
    }
    IMG.active++
    ask('library.image', { id: d.id, size: d.size }, { timeoutMs: 20000 })
      .then((r) => {
        const url = r && typeof r.dataUrl === 'string' && r.dataUrl.startsWith('data:image/') ? r.dataUrl : null
        IMG.cache.set(key, url)
        IMG.pending.delete(key)
        d.resolve(url)
      })
      .catch((e) => {
        if (e && e.code === 'rate_limited') {
          // Orca's budget: try this one again first, once it allows.
          IMG.queue.push(key)
          IMG.wait = setTimeout(() => {
            IMG.wait = 0
            pumpImages()
          }, Math.max(250, Number(e.retryAfterMs) || 1000))
          return
        }
        // Not cached: a timeout or a restarting worker may answer next time.
        IMG.pending.delete(key)
        d.resolve(null)
      })
      .finally(() => {
        IMG.active--
        pumpImages()
      })
  }
}

// Shows `url` in a placeholder element (an .art box): an <img> fading in over the placeholder.
function showArt(el, url, fade = true) {
  if (!url) return
  let img = el.querySelector('img')
  if (!img) {
    img = document.createElement('img')
    img.alt = ''
    img.decoding = 'async'
    el.appendChild(img)
  }
  if (img.getAttribute('src') === url) return
  img.classList.toggle('in', !fade)
  if (fade) img.onload = () => img.classList.add('in')
  img.src = url
  el.classList.add('has')
}

// Lazy cover or artist image for a placeholder element; safe to call again on a reused element.
function lazyArt(el, id, size = 'thumb') {
  const was = el.dataset.img || ''
  if (was !== (id || '')) {
    el.querySelector('img')?.remove()
    el.classList.remove('has')
  }
  el.dataset.img = id || ''
  el.dataset.size = size
  if (!id) return
  const hit = IMG.cache.get(size + ':' + id)
  if (hit !== undefined) return showArt(el, hit, false)
  if (!IMG.io && 'IntersectionObserver' in globalThis) {
    IMG.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) {
            IMG.near.delete(e.target)
            continue
          }
          IMG.near.add(e.target)
          requestArt(e.target)
        }
      },
      // scrollMargin reaches into the panel's own scrolling lists (rootMargin only grows the
      // viewport): covers a screen ahead start loading before they show.
      { rootMargin: '300px 0px', scrollMargin: '400px 0px' }
    )
  }
  if (IMG.io) IMG.io.observe(el)
  else requestArt(el)
}
function requestArt(el) {
  const id = el.dataset.img
  const size = el.dataset.size || 'thumb'
  if (!id) return
  loadImage(id, size, el).then((url) => {
    if (url === undefined || el.dataset.img !== id) return
    IMG.io?.unobserve(el)
    showArt(el, url)
  })
}

// --- Skins --------------------------------------------------------------------------------------

// The skin on <html data-skin>: CD (the default, colours from the cover), Vinyl or Cassette (their
// own colours, panel/skins.js, in Orca's dark or light theme). panel/skins.css does the rest.
const SKIN = { name: globalThis.BSideSkins ? BSideSkins.DEFAULT : 'cd' }
const skinAdaptive = () => !globalThis.BSideSkins || BSideSkins.adaptive(SKIN.name)
function paintSkin() {
  const K = globalThis.BSideSkins
  const html = document.documentElement
  if (!K) return
  html.dataset.skin = SKIN.name
  const st = html.style
  for (const name of K.VARS) st.removeProperty(name)
  const vars = K.tokens(SKIN.name, !html.classList.contains('light'))
  if (!vars) return
  // A skin with its own colours replaces the cover's (the root Tint leaves them alone meanwhile);
  // CD only lays its neutral surfaces under them.
  if (!K.adaptive(SKIN.name)) for (const name of globalThis.BSidePalette ? BSidePalette.VARS : []) st.removeProperty(name)
  for (const [name, value] of Object.entries(vars)) st.setProperty(name, value)
}
// Skin and theme together: the skin's tokens, then every cover tint on top (CD only).
function restyle() {
  paintSkin()
  TINTS.forEach((tint) => tint.apply(tint.palette))
}

// --- Cover colours ------------------------------------------------------------------------------

// Colours from a cover (panel/palette.js) for a scope: the root (the whole panel, from the playing
// track) or a page (an album or artist page, from its own cover). Each scope has its own backdrop:
// the palette's gradient and the blurred cover in two layers that crossfade, at the opacity
// palette.js allows, and gets text, accent and on-accent colours with WCAG AA contrast on it in
// the current theme. Theme changes re-derive every live scope: Orca switches the `light`/`dark`
// class and the --orca-* variables in place. A page without a palette inherits the root's look.
const TINTS = new Set()
let themeWatched = false
function watchTheme() {
  if (themeWatched) return
  themeWatched = true
  const again = () => requestAnimationFrame(restyle)
  try {
    orca.on('theme', again)
  } catch {
    /* the class observer below still catches light and dark */
  }
  new MutationObserver(again).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

class Tint {
  constructor(scope, backdrop, { root = false } = {}) {
    Object.assign(this, { scope, backdrop, root, n: 0, palette: null, layer: 0, timer: 0, url: null })
    TINTS.add(this)
    watchTheme()
  }
  // A cover's data URL, or null to go back to the default look after `delay` ms.
  set(url, { delay = 0 } = {}) {
    const n = ++this.n
    this.url = url || null
    clearTimeout(this.timer)
    if (!url) {
      if (!this.palette) return this.apply(null)
      this.timer = setTimeout(() => {
        for (const layer of this.backdrop.children) layer.classList.remove('show')
        this.apply(null)
      }, delay)
      return
    }
    const img = new Image()
    img.onload = () => {
      if (n !== this.n) return
      let palette = null
      try {
        palette = BSidePalette.fromImage(img)
      } catch {
        /* keep the default look */
      }
      const layers = this.backdrop.children
      this.layer ^= 1
      layers[this.layer].style.backgroundImage = `url("${url}")`
      layers[this.layer].classList.toggle('show', Boolean(palette))
      layers[this.layer ^ 1].classList.remove('show')
      this.apply(palette)
    }
    img.onerror = () => n === this.n && this.apply(null)
    img.src = url
  }
  apply(palette) {
    this.palette = palette
    const P = globalThis.BSidePalette
    if (!P) return
    const st = this.scope.style
    // Vinyl and Cassette keep their own colours: no cover tint, no cover backdrop. The palette
    // stays known, so going back to CD shows it again.
    if (!skinAdaptive()) {
      if (!this.root) {
        for (const name of P.VARS) st.removeProperty(name)
        this.scope.classList.remove('tinted')
      }
      this.backdrop.classList.remove('on')
      return
    }
    if (!palette && !this.root) {
      for (const name of P.VARS) st.removeProperty(name)
    } else {
      const { vars } = P.derive(palette, P.readTheme(document))
      for (const name of P.VARS) vars[name] == null ? st.removeProperty(name) : st.setProperty(name, vars[name])
    }
    this.backdrop.classList.toggle('on', Boolean(palette))
    if (!this.root) this.scope.classList.toggle('tinted', Boolean(palette))
  }
  dispose() {
    this.n++
    clearTimeout(this.timer)
    TINTS.delete(this)
  }
}

// --- Context menu -------------------------------------------------------------------------------

// One menu at a time, for a track, an album or the sort order: arrow keys move, Enter runs,
// Escape and Tab close it and focus goes back to what opened it.
const MENU = { el: null, invoker: null }
// items: [{ label, icon, run, checked? }]; at: an element (the menu opens under it) or { x, y }.
function openMenu(items, at, invoker) {
  closeMenu(false)
  const el = $('menu')
  MENU.el = el
  MENU.invoker = invoker || (at instanceof Element ? at : document.activeElement)
  const radio = items.some((it) => 'checked' in it)
  el.innerHTML = items
    .map(
      (it, i) =>
        `<button role="${radio ? 'menuitemradio' : 'menuitem'}" data-i="${i}"${radio ? ` aria-checked="${Boolean(it.checked)}"` : ''} tabindex="-1">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`
    )
    .join('')
  el.hidden = false
  const w = el.offsetWidth
  const h = el.offsetHeight
  let x, y
  if (at instanceof Element) {
    const r = at.getBoundingClientRect()
    x = r.right - w
    y = r.bottom + 4
    if (y + h + 8 > innerHeight) y = r.top - h - 4
  } else ({ x, y } = at)
  const pos = placeMenu(x, y, w, h, innerWidth, innerHeight)
  el.style.left = pos.left + 'px'
  el.style.top = pos.top + 'px'
  el.onclick = (e) => {
    const b = e.target.closest('[data-i]')
    if (!b) return
    const item = items[Number(b.dataset.i)]
    closeMenu()
    item.run()
  }
  ;(el.querySelector('[aria-checked="true"]') || el.firstElementChild)?.focus()
}
function closeMenu(refocus = true) {
  if (!MENU.el || MENU.el.hidden) return
  MENU.el.hidden = true
  if (refocus && MENU.invoker && MENU.invoker.isConnected) MENU.invoker.focus()
  MENU.invoker = null
}
function menuKeys(e) {
  if (!MENU.el || MENU.el.hidden) return false
  const items = [...MENU.el.querySelectorAll('[data-i]')]
  const i = items.indexOf(document.activeElement)
  if (e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault()
    closeMenu()
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = items.length
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n]?.focus()
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    items[e.key === 'Home' ? 0 : items.length - 1]?.focus()
  } else return false
  return true
}
