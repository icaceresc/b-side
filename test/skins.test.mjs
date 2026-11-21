// The skins (panel/skins.js): every text colour passes WCAG AA on what it sits on, in Orca's dark
// and light themes; the tokens cover what the CSS reads; unknown names fall back to CD.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const PANEL = new URL('../panel/', import.meta.url)
const context = {}
vm.runInNewContext(readFileSync(new URL('palette.js', PANEL), 'utf8'), context)
vm.runInNewContext(readFileSync(new URL('skins.js', PANEL), 'utf8'), context)
const { BSideSkins: K, BSidePalette: P } = context

test('three skins, CD by default and for anything unknown', () => {
  assert.deepEqual([...K.SKINS], ['cd', 'vinyl', 'cassette'])
  assert.equal(K.DEFAULT, 'cd')
  for (const bad of [undefined, null, '', 'tape', 42, {}]) assert.equal(K.normalize(bad), 'cd')
  assert.equal(K.normalize('vinyl'), 'vinyl')
  assert.equal(K.adaptive('cd'), true)
  assert.equal(K.adaptive('cassette'), false)
  // CD lays only neutral surfaces under the cover's colours: no text or accent of its own.
  assert.deepEqual(Object.keys(K.tokens('cd', true)), ['--bg', '--card', '--line', '--popover', '--popover-fg', '--theme-fg', '--theme-muted', '--theme-hover'])
  for (const dark of [true, false]) {
    const t = K.tokens('cd', dark)
    for (const k of ['--bg', '--card', '--popover', '--line']) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(t[k].slice(i, i + 2), 16))
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 3, `CD ${k} is a neutral grey, not a tint (${t[k]})`)
    }
  }
})

test('every skin passes WCAG AA for text in the dark and the light theme', () => {
  for (const skin of ['cd', 'vinyl', 'cassette']) {
    for (const dark of [true, false]) {
      for (const [label, text, surface, fill, min = P.AA] of K.pairs(skin, dark)) {
        let under = P.parseHex(surface)
        if (fill) under = P.over(under, P.parseHex(fill.fill), fill.alpha)
        const ratio = P.contrast(P.parseHex(text), under)
        assert.ok(ratio >= min, `${skin} ${dark ? 'dark' : 'light'}: ${label} is ${ratio.toFixed(2)}:1, needs ${min}:1`)
      }
    }
  }
})

test('the tokens set every colour the stylesheets read from a skin', () => {
  const css = readFileSync(new URL('styles.css', PANEL), 'utf8') + readFileSync(new URL('skins.css', PANEL), 'utf8')
  for (const name of K.VARS) assert.ok(css.includes(`var(${name}`), `${name} is used`)
  for (const skin of ['vinyl', 'cassette']) for (const dark of [true, false]) assert.deepEqual(Object.keys(K.tokens(skin, dark)), [...K.VARS])
})

test('the skin styles exist for each skin, with the reduced-motion fallback', () => {
  const css = readFileSync(new URL('skins.css', PANEL), 'utf8')
  for (const skin of K.SKINS) assert.ok(css.includes(`[data-skin='${skin}']`), skin)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  // Animations only run while AIMP plays and the panel is visible.
  assert.match(css, /animation-play-state: paused/)
})

test('the skin fonts are embedded, each family with its OFL licence, and nothing loads from the network', () => {
  const css = readFileSync(new URL('fonts.css', PANEL), 'utf8')
  const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1])
  assert.ok(urls.length >= 10)
  for (const u of urls) {
    assert.match(u, /^fonts\/[\w-]+\.woff2$/, u)
    assert.ok(existsSync(new URL(u, PANEL)), u)
  }
  for (const family of ['Manrope', 'EBGaramond', 'CormorantGaramond', 'PixelifySans', 'PressStart2P', 'VT323']) {
    const licence = readFileSync(new URL(`fonts/${family}-OFL.txt`, PANEL), 'utf8')
    assert.match(licence, /SIL Open Font License, Version 1\.1/, family)
  }
  for (const f of ['fonts.css', 'styles.css', 'skins.css']) assert.doesNotMatch(readFileSync(new URL(f, PANEL), 'utf8'), /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, f)
})

test("the logos stop while paused: the paused rule outranks each logo's animation shorthand", () => {
  const css = readFileSync(new URL('skins.css', PANEL), 'utf8')
  // A rule with `animation:` resets animation-play-state, so the paused rule must be more specific
  // than the logo's own rule (one class) wherever the two appear in the file.
  const paused = /(^|\n)([^{}\n]+)\{ animation-play-state: paused; \}/g
  const rules = [...css.matchAll(paused)].map((m) => m[2])
  for (const part of ['cd-disc', 'v-rec', 'c-hub']) {
    const own = new RegExp(`\\n\\.${part} \\{[^}]*animation:`)
    assert.ok(own.test(css), `${part} has its own animation`)
    const sel = rules.flatMap((r) => r.split(',')).map((x) => x.trim()).find((x) => x.endsWith('.' + part))
    assert.ok(sel, `${part} has a paused rule`)
    assert.ok((sel.match(/\./g) || []).length >= 2, `${part}'s paused rule (${sel}) outranks .${part} { animation: … }`)
  }
})
