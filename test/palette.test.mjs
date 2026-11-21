import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

// panel/palette.js is a classic browser script: run it in a bare context and take its global.
const context = {}
vm.runInNewContext(readFileSync(new URL('../panel/palette.js', import.meta.url), 'utf8'), context)
const P = context.BSidePalette

const SIZE = 64
// An RGBA image from a function of (x, y) -> [r, g, b].
function image(paint, size = SIZE) {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set([...paint(x, y), 255], (y * size + x) * 4)
  return data
}
// Deterministic pseudo-random numbers for noise and generated covers.
function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}
const plain = (value) => JSON.parse(JSON.stringify(value)) // objects from the vm context
const near = (a, b, tolerance) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance)
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

const RED = [220, 30, 40]
const BLUE = [20, 60, 200]
const COVERS = {
  twoColour: image((x) => (x < 32 ? RED : BLUE)),
  gradient: image((x, y) => [x * 4, y * 4, 128]),
  greyscale: image((x) => [x * 4, x * 4, x * 4]),
  spot: image((x, y) => (x >= 40 && x < 44 && y >= 10 && y < 14 ? [230, 20, 60] : [34, 34, 36])),
  black: image(() => [0, 0, 0]),
  white: image(() => [255, 255, 255])
}

test('WCAG luminance and contrast match known values', () => {
  assert.equal(P.luminance([255, 255, 255]), 1)
  assert.equal(P.luminance([0, 0, 0]), 0)
  assert.equal(P.contrast([0, 0, 0], [255, 255, 255]), 21)
  assert.equal(P.contrast([90, 90, 90], [90, 90, 90]), 1)
  assert.equal(P.contrast([255, 255, 255], [0, 0, 0]), P.contrast([0, 0, 0], [255, 255, 255]))
  // #777 on white is the classic near miss (4.48:1); #767676 is the lightest grey that passes.
  assert.ok(Math.abs(P.contrast(P.parseHex('#777'), [255, 255, 255]) - 4.48) < 0.01)
  assert.ok(P.contrast(P.parseHex('#767676'), [255, 255, 255]) >= 4.5)
  assert.ok(Math.abs(P.contrast(P.parseHex('#ff6a3d'), [255, 255, 255]) - 2.85) < 0.01)
  assert.ok(Math.abs(P.luminance(P.parseHex('#808080')) - 0.2159) < 0.0005)
})

test('OKLab round trip and in-gamut OKLCH', () => {
  for (const rgb of [[0, 0, 0], [255, 255, 255], RED, BLUE, [12, 200, 99], [255, 106, 61]]) {
    assert.ok(near(plain(P.oklabToRgb(P.rgbToOklab(rgb))), rgb, 1), String(rgb))
  }
  // A chroma no sRGB colour has is reduced, not clipped channel by channel.
  const vivid = plain(P.oklch(0.9, 0.4, 145))
  assert.ok(vivid.every((v) => v >= 0 && v <= 255))
  assert.ok(Math.abs(P.rgbToOklab(vivid)[0] - 0.9) < 0.01)
})

test('two colours: two swatches, half each, the right colours', () => {
  const p = P.extract(COVERS.twoColour, SIZE, SIZE)
  assert.equal(p.swatches.length, 2)
  assert.ok(Math.abs(p.dominant.population - 0.5) < 0.01)
  assert.equal(p.secondaries.length, 1)
  const found = [p.dominant.rgb, p.secondaries[0].rgb].map(plain)
  assert.ok(found.some((c) => near(c, RED, 2)) && found.some((c) => near(c, BLUE, 2)), JSON.stringify(found))
  assert.ok(p.vibrant)
  assert.equal(p.grey, false)
})

test('gradient: several distinct swatches that cover the whole image', () => {
  const p = P.extract(COVERS.gradient, SIZE, SIZE)
  assert.ok(p.swatches.length >= 4)
  assert.ok(p.secondaries.length >= 2 && p.secondaries.length <= 4)
  const total = p.swatches.reduce((sum, s) => sum + s.population, 0)
  assert.ok(Math.abs(total - 1) < 1e-9)
  for (let i = 1; i < p.swatches.length; i++) assert.ok(p.swatches[i - 1].count >= p.swatches[i].count)
})

test('greyscale: no accent candidate, flagged grey, a neutral accent from the cover', () => {
  const p = P.extract(COVERS.greyscale, SIZE, SIZE)
  assert.equal(p.vibrant, null)
  assert.equal(p.grey, true)
  for (const s of p.swatches) assert.ok(s.C < 0.01)
  for (const theme of THEMES) {
    const r = P.derive(p, theme)
    const lab = P.rgbToOklab(r.accent)
    assert.ok(Math.hypot(lab[1], lab[2]) < 0.04, 'no colour the cover does not have (2.1 put B-Side orange here)')
    assert.ok(P.contrast(r.accent, theme.bg) >= 4.5)
    assert.ok(P.contrast(r.onAccent, r.accent) >= 4.5)
    assert.ok(r.vars['--accent'])
  }
})

test('a small vivid spot wins the accent while the dark field stays dominant', () => {
  const p = P.extract(COVERS.spot, SIZE, SIZE)
  assert.ok(near(plain(p.dominant.rgb), [34, 34, 36], 2))
  assert.ok(p.dominant.population > 0.98)
  assert.ok(p.vibrant, 'a 4x4 spot is found')
  assert.ok(hueGap(p.vibrant.h, plainHue([230, 20, 60])) < 10)
  // Single stray pixels are not enough.
  const one = image((x, y) => (x === 5 && y === 5 ? [230, 20, 60] : [34, 34, 36]))
  assert.equal(P.extract(one, SIZE, SIZE).vibrant, null)
})
function plainHue(rgb) {
  const lab = P.rgbToOklab(rgb)
  return ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360
}

test('all black and all white: one swatch, no accent', () => {
  for (const [name, rgb] of [['black', [0, 0, 0]], ['white', [255, 255, 255]]]) {
    const p = P.extract(COVERS[name], SIZE, SIZE)
    assert.equal(p.swatches.length, 1, name)
    assert.deepEqual(plain(p.dominant.rgb), rgb)
    assert.equal(p.dominant.population, 1)
    assert.equal(p.secondaries.length, 0)
    assert.equal(p.vibrant, null)
    assert.deepEqual(plain(p.art), { lo: rgb, hi: rgb })
  }
})

test('transparent pixels are ignored; an empty image has no palette', () => {
  const data = image((x) => (x < 32 ? RED : BLUE))
  for (let i = 0; i < data.length; i += 4) if ((i / 4) % SIZE >= 32) data[i + 3] = 0
  const p = P.extract(data, SIZE, SIZE)
  assert.equal(p.swatches.length, 1)
  assert.ok(near(plain(p.dominant.rgb), RED, 2))
  assert.equal(P.extract(new Uint8ClampedArray(SIZE * SIZE * 4), SIZE, SIZE), null)
})

test('deterministic: the same pixels always give the same palette and tokens', () => {
  const random = rng(7)
  const noisy = image(() => [random() * 255, random() * 255, random() * 255].map(Math.round))
  for (const data of [noisy, ...Object.values(COVERS)]) {
    const a = P.extract(data, SIZE, SIZE)
    const b = P.extract(Uint8ClampedArray.from(data), SIZE, SIZE)
    assert.deepEqual(plain(a), plain(b))
    for (const dark of [true, false]) assert.deepEqual(plain(P.derive(a, { dark })), plain(P.derive(b, { dark })))
  }
})

// --- Derived tokens: AA on adversarial palettes, in light and dark ---------------------------

const THEMES = [
  { dark: true, bg: [17, 17, 20], popover: [31, 31, 38] }, // B-Side's own fallbacks
  { dark: true, bg: [10, 10, 10], popover: [23, 23, 23], hover: [38, 38, 38] },
  { dark: true, bg: [30, 30, 46], popover: [49, 50, 68] },
  { dark: false, bg: [255, 255, 255], popover: [255, 255, 255], hover: [245, 245, 245] },
  { dark: false, bg: [245, 245, 244], popover: [255, 255, 255] },
  { dark: false, bg: [239, 241, 245], popover: [230, 233, 239] }
]

function adversarial() {
  const covers = {
    ...COVERS,
    midGrey: image(() => [128, 128, 128]),
    neonOnBlack: image((x, y) => ((x + y) % 9 < 2 ? [57, 255, 20] : [0, 0, 0])),
    yellowWhite: image((x) => (x < 40 ? [255, 236, 0] : [255, 255, 255])),
    blackWhiteStripes: image((x) => (x % 8 < 4 ? [0, 0, 0] : [255, 255, 255])),
    redBlueCheck: image((x, y) => ((x >> 3) + (y >> 3)) % 2 ? [255, 0, 0] : [0, 0, 255]),
    pastel: image((x, y) => ((x - 20) ** 2 + (y - 24) ** 2 < 200 ? [248, 205, 214] : (x - 44) ** 2 + (y - 40) ** 2 < 260 ? [200, 226, 240] : [246, 243, 238])),
    darkNavy: image((x, y) => (Math.round(Math.hypot(x - 32, y - 36)) % 6 === 0 ? [40, 32, 70] : [10, 12, 22])),
    magentaGreen: image((x) => (x < 32 ? [255, 0, 255] : [0, 255, 0])),
    deepPurple: image(() => [40, 0, 90]),
    cyanSpotOnWhite: image((x, y) => (x >= 50 && y >= 50 && x < 54 && y < 54 ? [0, 220, 255] : [250, 250, 250]))
  }
  const random = rng(2026)
  for (let n = 0; n < 24; n++) {
    const colours = Array.from({ length: 2 + (n % 4) }, () => [random() * 255, random() * 255, random() * 255].map(Math.round))
    const cut = colours.map(() => random())
    covers['random' + n] = image((x, y) => colours[Math.floor(((x * cut[0] + y * (1 - cut[0])) / SIZE) * colours.length) % colours.length])
  }
  return covers
}

// Every colour the backdrop can show, sampled independently of palette.js's own estimate: each
// gradient stop and the theme background, with the blurred cover's darkest and brightest corners
// composited over them at the opacity palette.js chose.
function backdropSamples(vars, palette, theme) {
  const parse = (value) => value.match(/\d+/g).slice(0, 3).map(Number)
  const stops = ['--bs-c0', '--bs-c1', '--bs-c2', '--bs-c3'].map((k) => parse(vars[k]))
  const base = [theme.bg, ...stops]
  const art = Number(vars['--bs-art'])
  const corners = []
  for (let m = 0; m < 8; m++) corners.push([0, 1, 2].map((k) => (m >> k) & 1 ? palette.art.hi[k] : palette.art.lo[k]))
  const out = [...base]
  for (const b of base) for (const c of corners) out.push(P.over(b, c, art))
  return out
}

test('derived text tokens meet AA on every adversarial cover, in light and dark', () => {
  let checked = 0
  for (const [name, data] of Object.entries(adversarial())) {
    const palette = P.extract(data, SIZE, SIZE)
    for (const theme of THEMES) {
      const where = `${name} ${theme.dark ? 'dark' : 'light'} ${theme.bg}`
      const r = P.derive(palette, theme)
      const surfaces = backdropSamples(r.vars, palette, theme)
      const worst = r.worst
      for (const s of [...surfaces, worst]) {
        assert.ok(P.contrast(r.fg, s) >= 4.5, `fg ${where}`)
        assert.ok(P.contrast(r.muted, s) >= 4.5, `muted ${where}`)
        assert.ok(P.contrast(r.accent, s) >= 4.5, `accent ${where}`)
      }
      // Chips: muted on --hover (fg at 10%), the accent on its own soft fill (16%).
      assert.ok(P.contrast(r.muted, P.over(worst, r.fg, 0.1)) >= 4.5, `muted on chip ${where}`)
      assert.ok(P.contrast(r.accent, P.over(worst, r.accent, 0.16)) >= 4.5, `accent chip ${where}`)
      assert.ok(P.contrast(r.accent, theme.popover) >= 4.5, `accent in menu ${where}`)
      assert.ok(P.contrast(r.onAccent, r.accent) >= 4.5, `on-accent ${where}`)
      // The play button: theme background on --fg.
      assert.ok(P.contrast(theme.bg, r.fg) >= 4.5, `play button ${where}`)
      // The muted tone stays quieter than the body text.
      assert.ok(P.contrast(r.fg, worst) > P.contrast(r.muted, worst), `hierarchy ${where}`)
      checked++
    }
  }
  assert.ok(checked >= 200)
})

test('backgrounds stay dark in dark themes and light in light ones (never mid-grey mud)', () => {
  for (const [name, data] of Object.entries(adversarial())) {
    const palette = P.extract(data, SIZE, SIZE)
    for (const theme of THEMES) {
      const r = P.derive(palette, theme)
      const L = P.luminance(r.worst)
      assert.ok(theme.dark ? L <= 0.05 : L >= 0.6, `${name} ${theme.dark ? 'dark' : 'light'}: ${L}`)
    }
  }
})

test('no cover: the theme with a neutral accent, AA everywhere, no fixed orange', () => {
  const dark = P.derive(null, THEMES[0])
  assert.ok(dark.vars['--accent'], 'the accent is always set, so no stylesheet colour shows through')
  for (const k of ['--bs-c0', '--bs-c1', '--bs-c2', '--bs-c3', '--bs-art', '--fg', '--muted', '--hover']) assert.equal(dark.vars[k], null, k)
  for (const theme of THEMES) {
    const r = P.derive(null, theme)
    const lab = P.rgbToOklab(r.accent)
    assert.ok(Math.hypot(lab[1], lab[2]) < 0.02, 'neutral')
    assert.ok(P.contrast(r.accent, theme.bg) >= 4.5)
    assert.ok(P.contrast(r.accent, P.over(theme.bg, r.accent, 0.16)) >= 4.5)
    assert.ok(P.contrast(r.onAccent, r.accent) >= 4.5)
  }
})

test('a vivid cover gives a vivid accent of its own hue', () => {
  const orange = image((x, y) => (y < 40 ? [255, 140, 40] : [28, 15, 56]))
  const p = P.extract(orange, SIZE, SIZE)
  for (const theme of [THEMES[0], THEMES[3]]) {
    const r = P.derive(p, theme)
    const lab = P.rgbToOklab(r.accent)
    assert.ok(Math.hypot(lab[1], lab[2]) > 0.1, 'still saturated')
    assert.ok(hueGap(plainHue(r.accent), plainHue([255, 140, 40])) < 15)
  }
})

test('a quiet cover (black with a few coloured highlights) stays near black with a discreet accent', () => {
  // Black and chrome, like Discovery: 3% of the pixels are a vivid lilac.
  const quiet = image((x, y) => (x < 2 && y < 64 ? [150, 110, 230] : (x + y) % 7 ? [12, 12, 14] : [190, 190, 196]))
  const p = P.extract(quiet, SIZE, SIZE)
  assert.ok(P.isQuiet(p), `vivid share ${P.vividShare(p)}`)
  for (const theme of THEMES) {
    const r = P.derive(p, theme)
    for (const k of ['--bs-c0', '--bs-c1', '--bs-c2', '--bs-c3']) {
      const lab = P.rgbToOklab(r.vars[k].match(/\d+/g).slice(0, 3).map(Number))
      assert.ok(Math.hypot(lab[1], lab[2]) <= 0.02, `${k} is nearly neutral, not a made-up lilac`)
    }
    const a = P.rgbToOklab(r.accent)
    assert.ok(Math.hypot(a[1], a[2]) <= 0.05, 'a discreet accent')
    assert.ok(P.contrast(r.accent, theme.bg) >= 4.5 && P.contrast(r.onAccent, r.accent) >= 4.5)
  }
  // A colourful cover is not quiet.
  assert.equal(P.isQuiet(P.extract(image((x, y) => (y < 32 ? [255, 140, 40] : [40, 90, 220])), SIZE, SIZE)), false)
})
