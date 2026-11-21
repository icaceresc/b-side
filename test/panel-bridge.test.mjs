// The panel talks to its worker through Orca's plugin.request, which refuses an input holding
// `undefined` anywhere (invalid_params, verified in Orca 1.4.265) before the worker sees it. That
// is how play/pause, previous and next failed silently in 1.2.0 while volume worked.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const html = readFileSync(new URL('../panel/index.html', import.meta.url), 'utf8')

// Orca's rule, as observed: any own property whose value is undefined, at any depth, is refused.
function orcaAccepts(value) {
  if (value === undefined) return false
  if (value === null || typeof value !== 'object') return true
  return Object.values(value).every(orcaAccepts)
}

test('every plugin.request in the panel goes through plain()', () => {
  const calls = html.match(/orca\.plugin\.request\(.*$/gm) ?? []
  assert.equal(calls.length, 1, `expected one call site, found: ${calls.join(' | ')}`)
  assert.match(calls[0], /orca\.plugin\.request\(name, plain\(input\), options\)/)
})

test('plain() turns any input into one Orca accepts, dropping undefined', () => {
  const src = /const plain = (\(value\) => [^\n]+)\n/.exec(html)[1]
  const plain = Function(`return ${src}`)()
  const cases = [
    [{ command: 'next', args: undefined }, { command: 'next' }],
    [{ command: 'playPause' }, { command: 'playPause' }],
    [{ command: 'seek', args: { positionMs: 1000, extra: undefined } }, { command: 'seek', args: { positionMs: 1000 } }],
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
  assert.match(html, /ask\('player\.command', args === undefined \? \{ command: cmd \} : \{ command: cmd, args \}\)/)
  assert.doesNotMatch(html, /ask\('player\.command', \{ command: cmd, args \}\)/)
})
