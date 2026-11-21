'use strict'
/* B-Side's app shell: the layout, the tabs and their page stacks, the language menu, keyboard
 * shortcuts and start-up.
 *
 * Narrow (Orca's sidebar, 240 to ~560 px): one view at a time, like a phone, with a tab bar at the
 * bottom (Now Playing, Library, Search) and a mini-player above it while a track plays. Wide (the
 * sidebar dragged wider): the library or search on the left and Now Playing always on the right.
 * Library and Search each keep their own stack of pages (an album, an artist, a genre), so going
 * back returns to where the person was, scroll position included. */

const WIDE_QUERY = matchMedia('(min-width: 560px)')
const TABS = ['now', 'library', 'search']

class Stack {
  constructor(host, base) {
    this.host = host
    this.pages = [base]
    host.appendChild(base.el)
  }
  get top() {
    return this.pages[this.pages.length - 1]
  }
  push(page, opener, { focus = true } = {}) {
    const below = this.top
    below.scrollY = below.scroll ? below.scroll.scrollTop : 0
    below.el.hidden = true
    page.opener = opener || null
    this.pages.push(page)
    this.host.appendChild(page.el)
    // A long trail of pages costs memory: the oldest ones go (the base page always stays).
    while (this.pages.length > 12) {
      const old = this.pages.splice(1, 1)[0]
      old.dispose()
      old.el.remove()
    }
    if (focus) page.back?.focus({ preventScroll: true })
  }
  pop() {
    if (this.pages.length < 2) return false
    const page = this.pages.pop()
    page.dispose()
    page.el.remove()
    const top = this.top
    top.el.hidden = false
    if (top.scroll) top.scroll.scrollTop = top.scrollY || 0
    markPlaying(top.el)
    if (page.opener && page.opener.isConnected) page.opener.focus({ preventScroll: true })
    else top.back?.focus({ preventScroll: true })
    return true
  }
  reset() {
    while (this.pop());
  }
}
let STACKS = null

// --- Navigation ----------------------------------------------------------------------------------

function go(tab, { focus = false } = {}) {
  if (!TABS.includes(tab)) return
  if (UI.wide && tab === 'now') tab = UI.tab === 'now' ? 'library' : UI.tab
  UI.tab = tab
  layout()
  saveUi()
  if (focus && tab === 'search') focusSearch()
}
// Pages open in the tab the person is in; from Now Playing they open in the Library.
function stackHere() {
  if (UI.tab !== 'search' && UI.tab !== 'library') go('library')
  return STACKS[UI.tab]
}
function pushPage(page, opener, options) {
  const stack = stackHere()
  // The same page again (an album opened twice from the mini-player): just show it.
  if (stack.top.key && stack.top.key === page.key) return page.dispose()
  stack.push(page, opener, options)
}
const openAlbum = (id, opener) => id && pushPage(albumPage(id), opener)
const openArtist = (id, opener) => id && pushPage(artistPage(id), opener)
const openGenre = (name, opener) => name && pushPage(genrePage(name), opener)
const openFolders = (opener) => pushPage(foldersPage(), opener)
function goBack() {
  if (!STACKS) return false
  const stack = STACKS[UI.tab]
  return Boolean(stack && stack.pop())
}

// A page again from its key ("album:<id>"), for a new index or a new language.
function remake(key) {
  const [kind, ...rest] = String(key || '').split(':')
  const make = { album: albumPage, artist: artistPage, genre: genrePage, folders: foldersPage }[kind]
  return make ? make(rest.join(':')) : null
}
// After a new index: the open pages show what they showed, from the new data.
function refreshPages() {
  for (const stack of Object.values(STACKS || {})) {
    for (let i = 1; i < stack.pages.length; i++) {
      const old = stack.pages[i]
      // The folder picker keeps what the person is choosing.
      if (old.kind === 'folders') continue
      const page = remake(old.key)
      if (!page) continue
      page.opener = old.opener
      page.el.hidden = old.el.hidden
      old.el.replaceWith(page.el)
      old.dispose()
      stack.pages[i] = page
    }
  }
}

// --- Layout --------------------------------------------------------------------------------------

function layout() {
  UI.wide = WIDE_QUERY.matches
  if (UI.wide && UI.tab === 'now') UI.tab = 'library'
  const app = $('app')
  app.classList.toggle('wide', UI.wide)
  app.dataset.view = UI.tab
  $('np').hidden = !UI.wide && UI.tab !== 'now'
  $('lib').hidden = UI.tab !== 'library'
  $('srch').hidden = UI.tab !== 'search'
  for (const b of $('tabs').querySelectorAll('[data-tab]')) {
    if (b.dataset.tab === UI.tab) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
  }
  paintMini()
  if (UI.tab === 'now' || UI.wide) followLyrics()
}

// What the panel remembers between visits: the tab, the library section and the album order.
async function saveUi() {
  try {
    await orca.storage.set('ui', { tab: UI.tab, section: LIB.section, sort: LIB.sort })
  } catch {
    /* it still applies to this visit */
  }
}

// --- Language ------------------------------------------------------------------------------------

function applyLanguage() {
  document.documentElement.lang = LANG
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml)
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel))
  const current = LANGS.find((l) => l.code === LANG)
  $('langFlag').src = 'flags/' + current.flag + '.svg'
  $('langBtn').setAttribute('aria-label', t('language') + ': ' + current.name)
  $('langBtn').title = t('language')
  $('langMenu').innerHTML = LANGS.map((l) => '<button role="menuitemradio" aria-checked="' + (l.code === LANG) + '" data-lang="' + l.code + '"><img src="flags/' + l.flag + '.svg" alt="" width="20" height="15">' + l.name + '</button>').join('')
  labelSkin()
  if (S.p) {
    $('sub').dataset.key = ''
    paint()
  }
}
// Views built from strings are rebuilt in the new language, keeping the stacks and the search.
function rebuildViews() {
  if (!STACKS) return
  const q = $('q') ? $('q').value : ''
  const old = STACKS
  for (const stack of Object.values(old)) for (const page of stack.pages) page.dispose()
  $('lib').replaceChildren()
  $('srch').replaceChildren()
  STACKS = { library: new Stack($('lib'), homePage()), search: new Stack($('srch'), searchPage()) }
  for (const name of ['library', 'search']) {
    for (const page of old[name].pages.slice(1)) {
      const again = remake(page.key)
      if (again) STACKS[name].push(again, null, { focus: false })
    }
  }
  renderHome()
  if (q) {
    $('q').value = q
    $('qClear').hidden = false
    runSearch(q)
  }
}
async function setLanguage(code) {
  if (!STRINGS[code]) return
  LANG = code
  applyLanguage()
  rebuildViews()
  try {
    await orca.storage.set('language', code)
  } catch {
    /* the choice still applies to this session */
  }
}
function toggleLangMenu(open) {
  const menu = $('langMenu')
  const show = open ?? menu.hidden
  menu.hidden = !show
  $('langBtn').setAttribute('aria-expanded', String(show))
  if (show) menu.querySelector('[aria-checked="true"]')?.focus()
}

// --- Skin ----------------------------------------------------------------------------------------

// The logo opens the skin menu. The choice is kept in the plugin's storage (and in localStorage,
// read at start so the panel opens in its skin without a flash of CD).
const SKIN_NAMES = { cd: () => t('skinCd'), vinyl: () => t('skinVinyl'), cassette: () => t('skinCassette') }
const SKIN_HINTS = { cd: () => t('skinCdHint'), vinyl: () => t('skinVinylHint'), cassette: () => t('skinCassetteHint') }
function labelSkin() {
  const logo = $('logo')
  logo.setAttribute('aria-label', `${t('changeSkin')}. ${t('skin')}: ${SKIN_NAMES[SKIN.name]()}`)
  logo.title = `${t('skin')}: ${SKIN_NAMES[SKIN.name]()}`
  $('skinMenu').setAttribute('aria-label', t('skin'))
  $('skinMenu').innerHTML = BSideSkins.SKINS.map(
    (k) =>
      `<button role="menuitemradio" aria-checked="${k === SKIN.name}" data-skin="${k}" tabindex="-1"><span class="sw sw-${k}" aria-hidden="true"><i></i></span><span class="sk-text"><b>${esc(SKIN_NAMES[k]())}</b><span>${esc(SKIN_HINTS[k]())}</span></span></button>`
  ).join('')
}
function setSkin(name, { save = true } = {}) {
  SKIN.name = BSideSkins.normalize(name)
  restyle()
  labelSkin()
  try {
    localStorage.setItem('bside.skin', SKIN.name)
  } catch {}
  if (save) Promise.resolve(orca.storage && orca.storage.set('skin', SKIN.name)).catch(() => {})
}
function toggleSkinMenu(open) {
  const menu = $('skinMenu')
  const show = open ?? menu.hidden
  menu.hidden = !show
  $('logo').setAttribute('aria-expanded', String(show))
  if (show) menu.querySelector('[aria-checked="true"]')?.focus()
}
// Arrow keys, Home and End move through a menu's items (the language and skin menus).
function menuArrows(menu, e, selector) {
  const items = [...menu.querySelectorAll(selector)]
  const i = items.indexOf(document.activeElement)
  const j = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key]
  if (j === undefined) return
  e.preventDefault()
  items[(j + items.length) % items.length].focus()
}

// --- Wiring --------------------------------------------------------------------------------------

{
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]')
    if (!b) return
    // Pressing the tab you are on goes back to its first page, as phone apps do.
    if (b.dataset.tab === UI.tab && STACKS[UI.tab]) STACKS[UI.tab].reset()
    go(b.dataset.tab, { focus: b.dataset.tab === 'search' })
  })
  $('miniOpen').onclick = () => go('now')
  $('hintLibrary').onclick = () => go('library')
  $('sub').addEventListener('click', async (e) => {
    const link = e.target.closest('[data-go]')
    const albumId = nowAlbumId()
    if (!link || !albumId) return
    if (link.dataset.go === 'album') return openAlbum(albumId, link)
    try {
      openArtist(await artistOfAlbum(albumId), link)
    } catch (err) {
      fail(err)
    }
  })

  $('langBtn').onclick = (e) => {
    e.stopPropagation()
    toggleSkinMenu(false)
    toggleLangMenu()
  }
  $('langMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]')
    if (!b) return
    setLanguage(b.dataset.lang)
    toggleLangMenu(false)
    $('langBtn').focus()
  })
  $('langMenu').addEventListener('keydown', (e) => menuArrows($('langMenu'), e, '[data-lang]'))
  $('logo').onclick = (e) => {
    e.stopPropagation()
    toggleLangMenu(false)
    toggleSkinMenu()
  }
  $('skinMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-skin]')
    if (!b) return
    setSkin(b.dataset.skin)
    toggleSkinMenu(false)
    $('logo').focus()
  })
  $('skinMenu').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') return toggleSkinMenu(false)
    menuArrows($('skinMenu'), e, '[data-skin]')
  })
  document.addEventListener('click', (e) => {
    if (!$('langMenu').hidden && !e.target.closest('#langMenu')) toggleLangMenu(false)
    if (!$('skinMenu').hidden && !e.target.closest('#skinMenu')) toggleSkinMenu(false)
    // A click outside closes the menu, except the click that opened it.
    if (!$('menu').hidden && !e.target.closest('#menu') && !(MENU.invoker && MENU.invoker.contains(e.target))) closeMenu(false)
  })
  document.addEventListener('scroll', () => closeMenu(false), { capture: true, passive: true })

  const typing = (el) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el && el.isContentEditable)
  document.addEventListener('keydown', (e) => {
    if (menuKeys(e)) return
    if (e.key === 'Escape' && !$('langMenu').hidden) return toggleLangMenu(false)
    if (e.key === 'Escape' && !$('skinMenu').hidden) {
      toggleSkinMenu(false)
      return $('logo').focus()
    }
    // Search from anywhere in the panel.
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey) {
      e.preventDefault()
      return go('search', { focus: true })
    }
    if (e.key === '/' && !typing(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      return go('search', { focus: true })
    }
    // Back from a page: Escape, Alt+Left or Backspace outside a field.
    if ((e.key === 'Escape' || (e.key === 'ArrowLeft' && e.altKey) || (e.key === 'Backspace' && !typing(e.target))) && UI.tab !== 'now') {
      if (goBack()) e.preventDefault()
      return
    }
    if (e.code === 'Space' && !typing(e.target) && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement) && !(e.target.closest && e.target.closest('[role="option"]')) && S.p?.running) {
      e.preventDefault()
      command('playPause')
    }
  })
  document.addEventListener('visibilitychange', () => {
    // Animations rest while the panel is out of sight.
    $('app').classList.toggle('is-away', document.hidden)
    if (!document.hidden) {
      poll()
      refreshStatus()
    }
  })
  WIDE_QUERY.addEventListener('change', layout)
}

// --- Start ---------------------------------------------------------------------------------------

STACKS = { library: new Stack($('lib'), homePage()), search: new Stack($('srch'), searchPage()) }
applyLanguage()
let cachedSkin = null
try {
  cachedSkin = localStorage.getItem('bside.skin')
} catch {}
SKIN.name = BSideSkins.normalize(cachedSkin)
paintSkin()
labelSkin()
ROOT_TINT.apply(null) // AA accent for the theme before any cover arrives
$('app').classList.toggle('is-away', document.hidden)
// Transitions from the second frame on, once the skin and the first colours are in place.
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.removeAttribute('data-boot')))
layout()
showNp('loading')
renderHome()
Promise.resolve(orca.storage && orca.storage.get('language'))
  .then((saved) => {
    if (saved && STRINGS[saved] && saved !== LANG) {
      LANG = saved
      applyLanguage()
      rebuildViews()
    }
  })
  .catch(() => {})
paintLyricSize()
Promise.resolve(orca.storage && orca.storage.get('lyricsSize'))
  .then((saved) => {
    if (Number.isInteger(saved) && saved !== LYR.size) setLyricSize(saved, { save: false })
  })
  .catch(() => {})
// The skin kept in the plugin's storage wins (localStorage may be empty or another profile's).
Promise.resolve(orca.storage && orca.storage.get('skin'))
  .then((saved) => {
    if (saved && BSideSkins.normalize(saved) !== SKIN.name) setSkin(saved, { save: false })
  })
  .catch(() => {})
Promise.resolve(orca.storage && orca.storage.get('ui'))
  .then((ui) => {
    if (!ui || typeof ui !== 'object') return
    if (ui.sort in SORTS) LIB.sort = ui.sort
    if (SECTIONS.includes(ui.section) && ui.section !== LIB.section) {
      LIB.section = ui.section
      renderHome()
    }
    if (TABS.includes(ui.tab)) go(ui.tab)
  })
  .catch(() => {})
poll()
setInterval(poll, 1000)
refreshStatus()
requestAnimationFrame(tick)

// For the screenshots in docs/ (docs/make-assets.py): open a view without clicking.
const quietly = { focus: false }
globalThis.BSideApp = {
  go,
  openAlbum: (id) => pushPage(albumPage(id), null, quietly),
  openArtist: (id) => pushPage(artistPage(id), null, quietly),
  openGenre: (name) => pushPage(genrePage(name), null, quietly),
  openFolders: () => pushPage(foldersPage(), null, quietly),
  section: setSection,
  skin: (name) => setSkin(name, { save: false }),
  search(q) {
    go('search')
    $('q').value = q
    $('qClear').hidden = !q
    return runSearch(q)
  }
}
