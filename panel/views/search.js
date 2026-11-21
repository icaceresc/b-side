'use strict'
/* Search: one field, results as you type (80 ms after the last key), in three groups (Artists,
 * Albums, Tracks) from the worker's `library.search`, which matches word prefixes ignoring case
 * and accents. The field is a combobox over the results: Up and Down move, Enter opens an artist
 * or an album or plays a track, Escape clears. `/` or Ctrl+K anywhere in the panel comes here. */

const SR = { seq: 0, q: '', items: [], active: -1, page: null, timer: 0 }
const SEARCH_LIMIT = 24

// Text folded as the worker's search folds it (src/library/search.mjs): compatibility forms
// unified, accents of Latin, Greek and Cyrillic letters dropped, lower case, ligatures spelled out.
const LIGATURES = { ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ß: 'ss', þ: 'th', ı: 'i' }
const fold = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[øæœłđßþı]/g, (c) => LIGATURES[c])
const NON_LATIN = /(?![\p{Script=Latin}])\p{L}/u
// The text with each query word in <mark> where the worker matched it: at the start of a word, or
// anywhere for scripts written without spaces (Japanese, Chinese...).
function markMatches(text, q) {
  const words = fold(q).split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean)
  const chars = [...String(text ?? '')]
  if (!words.length || !chars.length) return esc(text)
  let s = ''
  const map = []
  chars.forEach((c, i) => {
    const f = fold(c)
    for (let u = 0; u < f.length; u++) map.push(i)
    s += f
  })
  const marked = new Array(chars.length).fill(false)
  for (const w of words) {
    const inside = NON_LATIN.test(w)
    let k = -1
    for (let from = 0; ; from = k + 1) {
      k = s.indexOf(w, from)
      if (k < 0 || inside || k === 0 || !/[\p{L}\p{N}]/u.test(s[k - 1])) break
    }
    if (k < 0) continue
    for (let j = k; j < k + w.length && j < map.length; j++) marked[map[j]] = true
  }
  let out = ''
  let open = false
  chars.forEach((c, i) => {
    if (marked[i] !== open) {
      out += open ? '</mark>' : '<mark>'
      open = marked[i]
    }
    out += esc(c)
  })
  return out + (open ? '</mark>' : '')
}

function searchPage() {
  const el = document.createElement('div')
  el.className = 'page search'
  el.innerHTML =
    `<div class="bar searchbar"><label class="field">${icon('search')}` +
    `<input id="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sresults" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="${esc(t('searchLabel'))}" placeholder="${esc(t('searchPlaceholder'))}">` +
    `<button class="ib clear" id="qClear" aria-label="${esc(t('clear'))}" title="${esc(t('clear'))}" hidden>${icon('close')}</button></label></div>` +
    `<div class="scroll"><p class="vh" id="sstatus" role="status" aria-live="polite"></p><div id="sresults" role="listbox" aria-label="${esc(t('searchLabel'))}"></div>` +
    `<div class="state small" id="shint"><div class="sicon" aria-hidden="true">${icon('search')}</div><p>${esc(t('searchHint'))}</p></div></div>`
  const page = { kind: 'search', el, scroll: el.querySelector('.scroll'), dispose() {} }
  SR.page = page
  const input = el.querySelector('#q')
  const run = debounce(() => runSearch(input.value), 80)
  input.addEventListener('input', () => {
    el.querySelector('#qClear').hidden = !input.value
    run()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!SR.items.length) return
      const n = SR.items.length
      setActive(SR.active < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (SR.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run.cancel()
      if (fold(input.value).trim() !== fold(SR.q).trim()) return runSearch(input.value).then(() => SR.items.length && activateItem(0))
      if (SR.items.length) activateItem(Math.max(0, SR.active))
    } else if (e.key === 'Escape' && input.value) {
      e.preventDefault()
      e.stopPropagation()
      input.value = ''
      el.querySelector('#qClear').hidden = true
      runSearch('')
    } else if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      const items = SR.active >= 0 && searchMenu(SR.items[SR.active])
      if (!items) return
      e.preventDefault()
      openMenu(items, $(`so-${SR.active}`) || input, input)
    }
  })
  el.querySelector('#qClear').onclick = () => {
    input.value = ''
    el.querySelector('#qClear').hidden = true
    runSearch('')
    input.focus()
  }
  const results = el.querySelector('#sresults')
  results.addEventListener('click', (e) => {
    const opt = e.target.closest('[role="option"]')
    if (opt) activateItem(Number(opt.dataset.i))
  })
  results.addEventListener('mousemove', (e) => {
    const opt = e.target.closest('[role="option"]')
    if (opt && Number(opt.dataset.i) !== SR.active) setActive(Number(opt.dataset.i), false)
  })
  results.addEventListener('contextmenu', (e) => {
    const opt = e.target.closest('[role="option"]')
    const items = opt && searchMenu(SR.items[Number(opt.dataset.i)])
    if (!items) return
    e.preventDefault()
    setActive(Number(opt.dataset.i), false)
    openMenu(items, { x: e.clientX, y: e.clientY }, input)
  })
  return page
}

async function runSearch(raw) {
  const q = String(raw ?? '').trim()
  const seq = ++SR.seq
  const el = SR.page.el
  el.querySelector('#shint').hidden = Boolean(q)
  if (!q) {
    SR.q = ''
    SR.items = []
    SR.active = -1
    el.querySelector('#sresults').innerHTML = ''
    el.querySelector('#sstatus').textContent = ''
    paintCombo()
    return
  }
  let r
  try {
    r = await api.search(q, SEARCH_LIMIT)
  } catch (e) {
    if (seq === SR.seq) fail(e)
    return
  }
  if (seq !== SR.seq) return // a newer search is on its way
  SR.q = q
  for (const a of r.albums || []) ALBUMS.set(a.id, a)
  keepTracks(r.tracks)
  SR.items = [...(r.artists || []).map((x) => ({ kind: 'artist', x })), ...(r.albums || []).map((x) => ({ kind: 'album', x })), ...(r.tracks || []).map((x) => ({ kind: 'track', x }))]
  SR.active = SR.items.length ? 0 : -1
  renderResults(r, q)
}

function renderResults(r, q) {
  const el = SR.page.el
  let i = 0
  const option = (inner, cls, attrs = '') => `<div class="opt ${cls}" role="option" id="so-${i}" data-i="${i++}" aria-selected="false"${attrs}>${inner}</div>`
  const group = (key, html) => (html ? `<div class="sgroup" role="group" aria-labelledby="sg-${key}"><h3 class="shead" id="sg-${key}" role="presentation">${esc(t(key))}</h3>${html}</div>` : '')
  const artists = (r.artists || [])
    .map((ar) => option(`<span class="art round" style="${artStyle(ar.id)}" data-cover="${esc(ar.image || '')}"><span class="ini" aria-hidden="true">${esc(initials(ar.name))}</span></span><span class="otext"><b>${markMatches(ar.name || t('unknownArtist'), q)}</b><span>${esc(tn('albumsN', ar.albums || 0))}</span></span>`, 'oartist', ` data-artist-id="${esc(ar.id)}"`))
    .join('')
  const albums = (r.albums || [])
    .map((a) => option(`<span class="art" style="${artStyle(a.id)}" data-cover="${esc(a.cover || '')}"><span class="ph" aria-hidden="true"></span></span><span class="otext"><b>${markMatches(a.title || t('unknownAlbum'), q)}</b><span>${markMatches([a.artist || t('unknownArtist'), a.year].filter(Boolean).join(' · '), q)}</span></span>`, 'oalbum', ` data-album-id="${esc(a.id)}"`))
    .join('')
  const tracks = (r.tracks || [])
    .map((tr) =>
      option(
        `<span class="lead"><span class="art" style="${artStyle(tr.albumId)}" data-cover="${esc(tr.cover || '')}"><span class="ph" aria-hidden="true"></span></span>${eqHtml}</span><span class="otext"><b>${markMatches(tr.title || t('untitled'), q)}</b>${subLine(tr, markMatches([tr.artist || t('unknownArtist'), tr.album || t('unknownAlbum')].join(' · '), q))}</span>` +
          `<span class="tmarks">${marksHtml(tr)}</span><span class="tdur">${fmt(tr.durationMs)}</span>`,
        'otrack trow has-sub',
        ` data-track-id="${esc(tr.id)}" data-album-id="${esc(tr.albumId || '')}"`
      )
    )
    .join('')
  const box = el.querySelector('#sresults')
  box.innerHTML = group('artists', artists) + group('albums', albums) + group('tracks', tracks) || `<div class="state small"><p>${esc(t('noResults', { q }))}</p></div>`
  el.querySelector('#sstatus').textContent = SR.items.length ? tn('resultsN', SR.items.length) : t('noResults', { q })
  hydrate(box)
  markPlaying(box)
  paintCombo()
}

function setActive(i, scroll = true) {
  SR.active = i
  paintCombo()
  if (scroll) $(`so-${i}`)?.scrollIntoView({ block: 'nearest' })
}
function paintCombo() {
  const input = $('q')
  if (!input) return
  input.setAttribute('aria-expanded', String(SR.items.length > 0))
  if (SR.active >= 0 && SR.items.length) input.setAttribute('aria-activedescendant', `so-${SR.active}`)
  else input.removeAttribute('aria-activedescendant')
  for (const opt of SR.page.el.querySelectorAll('[role="option"]')) {
    const on = Number(opt.dataset.i) === SR.active
    opt.setAttribute('aria-selected', String(on))
    opt.classList.toggle('active', on)
  }
}

function activateItem(i) {
  const item = SR.items[i]
  if (!item) return
  SR.active = i
  paintCombo()
  const opener = $(`so-${i}`)
  if (item.kind === 'artist') openArtist(item.x.id, opener)
  else if (item.kind === 'album') openAlbum(item.x.id, opener)
  else playAlbum(item.x.albumId, item.x.id)
}
function searchMenu(item) {
  if (!item) return null
  if (item.kind === 'track') return trackMenu(item.x)
  if (item.kind === 'album') return albumMenu(item.x)
  return null
}

function focusSearch() {
  const input = $('q')
  if (!input) return
  input.focus()
  input.select()
}
