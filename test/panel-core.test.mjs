// The panel's pure helpers (panel/core.js and the search highlighter in panel/views/search.js),
// run in Node: they touch no DOM while loading. Classic scripts share their top-level names, so
// they run in one context, as the page runs them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const PANEL = new URL('../panel/', import.meta.url)
function load(locale = 'en') {
  const context = vm.createContext({ orca: { locale } })
  for (const src of ['i18n.js', 'core.js', 'views/search.js']) vm.runInContext(readFileSync(new URL(src, PANEL), 'utf8'), context, { filename: src })
  const get = (expr) => vm.runInContext(expr, context)
  return { get, json: (expr) => JSON.parse(JSON.stringify(get(expr))) }
}
const en = load('en')

test('times and album lengths', () => {
  const fmt = en.get('fmt')
  assert.equal(fmt(0), '0:00')
  assert.equal(fmt(61500), '1:01')
  assert.equal(fmt(3723000), '1:02:03')
  assert.equal(fmt(-5), '0:00')
  assert.equal(en.get('fmtLong')(53 * 60000), '53 min')
  assert.equal(en.get('fmtLong')(72 * 60000), '1 h 12 min')
  assert.equal(load('de').get('fmtLong')(72 * 60000), '1 Std. 12 Min.')
})

test('counts use each language\'s plural forms', () => {
  assert.equal(en.get('tn')('albumsN', 1), '1 album')
  assert.equal(en.get('tn')('tracksN', 10340), '10,340 tracks')
  const ru = load('ru').get('tn')
  assert.equal(ru('albumsN', 1), '1 альбом')
  assert.equal(ru('albumsN', 3), '3 альбома')
  assert.equal(ru('albumsN', 5), '5 альбомов')
  assert.equal(ru('albumsN', 21), '21 альбом')
  assert.equal(load('ja').get('tn')('tracksN', 3), '3 曲')
})

test('the format in one line: codec, bits, rate, bitrate, channels, gaps left out', () => {
  const parts = (q) => JSON.parse(JSON.stringify(en.get('techParts')(q)))
  assert.deepEqual(parts({ codec: 'FLAC', sampleRate: 44100, bits: 16, bitrate: 738, channels: 2 }), ['FLAC', '16 bits', '44.1 kHz', '738 kbps', 'Stereo'])
  assert.deepEqual(parts({ codec: 'flac', sampleRate: 96000, bits: 24, lossless: true }), ['FLAC', '24 bits', '96 kHz'])
  // An MP3 has no bit depth: no gap, no empty separator.
  assert.deepEqual(parts({ codec: 'MP3', sampleRate: 44100, bits: null, bitrate: 320, channels: 1 }), ['MP3', '44.1 kHz', '320 kbps', 'Mono'])
  assert.deepEqual(parts({ codec: null, sampleRate: 0, channels: 6 }), ['6 channels'])
  assert.deepEqual(parts(null), [])
  // No quality label any more ("CD quality", "Hi-Res", "Lossless"): only the facts.
  assert.ok(!parts({ codec: 'FLAC', sampleRate: 44100, bits: 16, lossless: true, cd: true }).some((p) => /quality|hi-res|lossless/i.test(p)))
  assert.deepEqual(load('es').json(`techParts({ codec: 'FLAC', sampleRate: 48000, bits: 24, channels: 2 })`), ['FLAC', '24 bits', '48 kHz', 'Estéreo'])
  assert.equal(en.get('techHtml')(['FLAC', '<b>'], ''), '<span>FLAC</span><span>&lt;b&gt;</span>')
})

test('albums sort by artist (accents and case ignored), title or newest first', () => {
  const albums = [
    { id: 1, title: 'B', artist: 'ferro', year: 2020 },
    { id: 2, title: 'a', artist: 'Éclair', year: 2023 },
    { id: 3, title: 'C', artist: 'Amber', year: 2019 },
    { id: 4, title: 'Track 10', artist: 'Amber', year: 2021 },
    { id: 5, title: 'Track 2', artist: 'Amber', year: 2021 }
  ]
  const ids = (by) => en.json(`sortAlbums(${JSON.stringify(albums)}, '${by}')`).map((a) => a.id)
  assert.deepEqual(ids('artist'), [3, 5, 4, 2, 1])
  assert.deepEqual(ids('title'), [2, 1, 3, 5, 4])
  assert.deepEqual(ids('year'), [2, 5, 4, 1, 3])
})

test('the virtual list draws the rows on screen and a few around them', () => {
  const range = en.get('visibleRange')
  assert.deepEqual([...range(0, 560, 56, 10340, 8)], [0, 18])
  assert.deepEqual([...range(56 * 5000, 560, 56, 10340, 8)], [4992, 5018])
  assert.deepEqual([...range(56 * 10340, 560, 56, 10340, 8)], [10332, 10340])
  assert.deepEqual([...range(0, 560, 56, 0, 8)], [0, 0])
  assert.deepEqual([...range(-200, 560, 56, 3, 8)], [0, 3])
})

test('album tracks group by disc, in order', () => {
  const groups = en.json(`groupDiscs([{ id: 'a', disc: 2 }, { id: 'b', disc: 1 }, { id: 'c' }, { id: 'd', disc: 2 }])`)
  assert.deepEqual(groups.map((g) => [g.disc, g.tracks.map((t) => t.id)]), [[1, ['b', 'c']], [2, ['a', 'd']]])
})

test('menus stay inside the panel', () => {
  const place = en.get('placeMenu')
  assert.deepEqual({ ...place(10, 10, 180, 200, 240, 603) }, { left: 10, top: 10 })
  assert.deepEqual({ ...place(200, 500, 180, 200, 240, 603) }, { left: 20, top: 300 })
  assert.deepEqual({ ...place(5, 5, 300, 900, 240, 603) }, { left: 8, top: 8 })
})

test('the image cache keeps the most recent images within its limits, misses included', () => {
  const cache = en.get('new ImageCache(100, 3)')
  cache.set('a', 'x'.repeat(40))
  cache.set('b', 'x'.repeat(40))
  cache.get('a') // a is now the most recent
  cache.set('c', 'x'.repeat(40)) // over 100 bytes: the least recent (b) goes
  assert.equal(cache.has('b'), false)
  assert.ok(cache.has('a') && cache.has('c'))
  cache.set('d', null)
  cache.set('e', null) // over 3 items: a goes
  assert.equal(cache.has('a'), false)
  assert.equal(cache.get('d'), null)
  assert.equal(cache.get('zz'), undefined)
  assert.ok(cache.bytes <= 100)
})

test('initials and placeholder hues', () => {
  const initials = en.get('initials')
  assert.equal(initials('Sunset Arcade'), 'SA')
  assert.equal(initials('The Quiet Hours'), 'QH')
  assert.equal(initials('Ferro & Finch'), 'FF')
  assert.equal(initials('éclair noir'), 'ÉN')
  assert.equal(initials('久石 譲'), '久')
  assert.equal(initials(''), '♪')
  const hue = en.get('hashHue')
  assert.equal(hue('al01'), hue('al01'))
  assert.notEqual(hue('al01'), hue('al02'))
  for (const id of ['', 'x', 'al01', '日本']) assert.ok(hue(id) >= 0 && hue(id) < 360)
})

test('search results mark the words that matched, as the worker matches them', () => {
  const mark = en.get('markMatches')
  assert.equal(mark('Night Bloom', 'night'), '<mark>Night</mark> Bloom')
  assert.equal(mark('Nightjar Radio', 'ra ni'), '<mark>Ni</mark>ghtjar <mark>Ra</mark>dio')
  assert.equal(mark('Éclair Noir', 'ecl'), '<mark>Écl</mark>air Noir')
  assert.equal(mark('Midnight Drive', 'night'), 'Midnight Drive') // only at the start of a word
  assert.equal(mark('空中キャンプ', 'キャン'), '空中<mark>キャン</mark>プ') // scripts without spaces: anywhere
  assert.equal(mark('<b>Rock</b> & Roll', 'roll'), '&lt;b&gt;Rock&lt;/b&gt; &amp; <mark>Roll</mark>')
  assert.equal(mark('Straße', 'strass'), '<mark>Straß</mark>e') // ß folds to ss
  assert.equal(mark('Anything', ''), 'Anything')
})

// Windows paths, written with | for each backslash so they read plainly here.
const win = (s) => s.replaceAll('|', String.fromCharCode(92))

test('pasted folder paths are read as the worker reads the libraryFolders setting', () => {
  const clean = en.get('cleanFolderPath')
  assert.equal(clean(win('  "C:|Users|you|Music|"  ')), win('C:|Users|you|Music'))
  assert.equal(clean('D:/Rips//Live'), win('D:|Rips|Live'))
  assert.equal(clean(win('C:|')), win('C:|'))
  assert.equal(clean(win('||nas|music|flac')), win('||nas|music|flac'))
  for (const bad of ['', 'Music', 'my music', 'C:Music', win('|Music'), win('||nas'), 'https://example.com/music']) assert.equal(clean(bad), null, bad)
})

test('folders inside folders, ignoring case and slashes', () => {
  const inside = en.get('folderInside')
  assert.ok(inside(win('C:|Music|Rock'), win('C:|Music')))
  assert.ok(inside('c:/music/rock/', win('C:|MUSIC|')))
  assert.ok(inside(win('C:|Music'), win('C:|Music')))
  assert.ok(inside(win('C:|Music'), win('C:|')))
  assert.ok(!inside(win('C:|Musical'), win('C:|Music')))
  assert.ok(!inside(win('C:|Music'), win('C:|Music|Rock')))
  assert.equal(en.get('folderLeaf')(win('C:|Users|you|OneDrive|Música|')), 'Música')
  assert.equal(en.get('folderLeaf')(win('D:|')), 'D:')
})
