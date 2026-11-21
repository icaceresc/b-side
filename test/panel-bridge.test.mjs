// The panel talks to its worker through Orca's plugin.request, which refuses an input holding
// `undefined` anywhere (invalid_params, verified in Orca 1.4.265) before the worker sees it. That
// is how play/pause, previous and next failed silently in 1.2.0 while volume worked.
// The panel is several classic scripts (panel/index.html loads them in order); these checks read
// all of them.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const PANEL = new URL('../panel/', import.meta.url)
const html = readFileSync(new URL('index.html', PANEL), 'utf8')
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])
const sources = Object.fromEntries(scripts.map((src) => [src, readFileSync(new URL(src, PANEL), 'utf8')]))
const all = Object.values(sources).join('\n') + '\n' + html

// Orca's rule, as observed: any own property whose value is undefined, at any depth, is refused.
function orcaAccepts(value) {
  if (value === undefined) return false
  if (value === null || typeof value !== 'object') return true
  return Object.values(value).every(orcaAccepts)
}

test('the page loads every panel script, in dependency order, and nothing else', () => {
  assert.deepEqual(scripts, ['palette.js', 'i18n.js', 'core.js', 'views/now.js', 'views/library.js', 'views/search.js', 'app.js'])
  const onDisk = [...readdirSync(PANEL).filter((f) => f.endsWith('.js')), ...readdirSync(new URL('views/', PANEL)).map((f) => 'views/' + f)]
  assert.deepEqual(onDisk.sort(), [...scripts].sort(), 'a script on disk is not loaded, or the reverse')
  assert.match(html, /<link rel="stylesheet" href="styles\.css" \/>/)
  assert.ok(existsSync(new URL('styles.css', PANEL)))
})

test('every plugin.request in the panel goes through plain()', () => {
  const calls = all.match(/orca\.plugin\.request\(.*$/gm) ?? []
  assert.equal(calls.length, 1, `expected one call site, found: ${calls.join(' | ')}`)
  assert.match(calls[0], /orca\.plugin\.request\(name, plain\(input\), options\)/)
  assert.match(sources['core.js'], /async function ask\(name, input = \{\}, options\) \{\n {2}const r = await orca\.plugin\.request\(name, plain\(input\), options\)/)
})

test('plain() turns any input into one Orca accepts, dropping undefined', () => {
  const src = /const plain = (\(value\) => [^\n]+)\n/.exec(sources['core.js'])[1]
  const plain = Function(`return ${src}`)()
  const cases = [
    [{ command: 'next', args: undefined }, { command: 'next' }],
    [{ command: 'playPause' }, { command: 'playPause' }],
    [{ command: 'seek', args: { positionMs: 1000, extra: undefined } }, { command: 'seek', args: { positionMs: 1000 } }],
    [{ albumId: 'a1', trackId: undefined }, { albumId: 'a1' }],
    [{ trackIds: ['t1', 't2'], mode: 'next' }, { trackIds: ['t1', 't2'], mode: 'next' }],
    [undefined, {}],
    [{ key: null }, { key: null }]
  ]
  for (const [input, expected] of cases) {
    const out = plain(input)
    assert.deepEqual(out, expected)
    assert.ok(orcaAccepts(out), `Orca would refuse ${JSON.stringify(out)}`)
  }
})

test('commands without arguments are sent without an args key', () => {
  const now = sources['views/now.js']
  assert.match(now, /ask\('player\.command', args === undefined \? \{ command: cmd \} : \{ command: cmd, args \}\)/)
  assert.doesNotMatch(all, /ask\('player\.command', \{ command: cmd, args \}\)/)
})

test('a play request names a track only when there is one', () => {
  assert.match(sources['views/library.js'], /ask\('player\.playAlbum', trackId \? \{ albumId, trackId \} : \{ albumId \}, LIB_TIMEOUT\)/)
})

test('the panel asks only for handlers of the shared contract', () => {
  const CONTRACT = new Set([
    'player.state', 'player.command', 'player.art', 'player.lyrics', 'player.artist', 'aimp.open',
    'player.playAlbum', 'player.playTracks', 'player.enqueue',
    'library.status', 'library.rescan', 'library.artists', 'library.albums', 'library.album', 'library.artist',
    'library.genres', 'library.tracks', 'library.search', 'library.image', 'library.suggestFolders', 'library.setFolders'
  ])
  // Lyrics and the artist picture go through loadExtra(name, ...), which asks with that name.
  const asked = new Set([...all.matchAll(/\b(?:ask|loadExtra)\('([a-zA-Z]+\.[a-zA-Z]+)'/g)].map((m) => m[1]))
  for (const name of asked) assert.ok(CONTRACT.has(name), `${name} is not in the contract`)
  for (const name of CONTRACT) assert.ok(asked.has(name), `${name} is never asked for`)
})

test('the panel never reaches the network or another window', () => {
  for (const [src, code] of Object.entries(sources)) {
    assert.doesNotMatch(code, /\bfetch\(|XMLHttpRequest|WebSocket|EventSource|postMessage|importScripts|https?:\/\//, src)
  }
  assert.doesNotMatch(html, /(src|href)="https?:/)
})

test('core.js loads without a DOM, so its helpers can be tested in Node', () => {
  const context = vm.createContext({})
  for (const src of ['i18n.js', 'core.js']) vm.runInContext(sources[src], context, { filename: src })
  assert.equal(vm.runInContext('typeof ask', context), 'function')
})
