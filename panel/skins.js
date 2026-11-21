/* B-Side skins: CD (the default), Vinyl and Cassette. Each skin is a whole theme of the panel:
 * panel/skins.css gives it its fonts, shapes, textures and animated logo under
 * html[data-skin="…"], and this file gives it its colours.
 *
 * CD keeps the cover's colours (panel/palette.js) over Orca's theme. Vinyl and Cassette have their
 * own palettes, one for Orca's dark theme and one for its light theme: the skin decides the
 * colours, the theme decides light or dark. Every pair of colours the panel draws text with is
 * checked for WCAG AA in test/skins.test.mjs (`pairs` below says which ones).
 *
 * Classic script: sets globalThis.BSideSkins; pure data and functions, so Node tests read it. */
;(function (root) {
  'use strict'

  const SKINS = ['cd', 'vinyl', 'cassette']
  const DEFAULT = 'cd'

  // Colours as #rrggbb. `hover` and `soft` are alphas of `fg` and `accent` over the background,
  // as palette.js uses them for the CD skin. `accent2` is the skin's second colour (decoration and
  // large marks; text only where `pairs` checks it).
  const PALETTES = {
    vinyl: {
      // A listening room after dark: walnut, leather, brass and ivory.
      dark: { bg: '#15100b', card: '#1d1610', popover: '#231a12', fg: '#f1e7d4', muted: '#b9a785', accent: '#d8b46c', onAccent: '#1b1309', accent2: '#c0583f', line: '#3a2c1d', ring: '#d8b46c', hover: 0.07, soft: 0.14 },
      // The same room by day: ivory paper, ink and burnished brass.
      light: { bg: '#f4ecdc', card: '#ece1cb', popover: '#fbf6ec', fg: '#2a1c10', muted: '#6a5640', accent: '#735216', onAccent: '#fffaf0', accent2: '#7a2a20', line: '#d9c9a8', ring: '#735216', hover: 0.06, soft: 0.12 }
    },
    cassette: {
      // Vaporwave night: deep violet, hot pink, cyan.
      dark: { bg: '#170a2c', card: '#211042', popover: '#26134b', fg: '#fdf4ff', muted: '#c8aef0', accent: '#ff62d4', onAccent: '#1d0630', accent2: '#3ef2ff', line: '#3d2370', ring: '#3ef2ff', hover: 0.08, soft: 0.16 },
      // Pastel day: lavender paper, magenta and teal ink.
      light: { bg: '#fbf0ff', card: '#f2e2fb', popover: '#ffffff', fg: '#2a0f46', muted: '#6a4790', accent: '#b3168a', onAccent: '#ffffff', accent2: '#00788a', line: '#e2c8f2', ring: '#00788a', hover: 0.06, soft: 0.12 }
    }
  }

  const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const rgba = (hex, a) => `rgb(${hexRgb(hex).join(' ')} / ${a})`

  /** The CSS variables a skin sets on <html> in a theme, or null for CD (palette.js decides). */
  function tokens(skin, dark) {
    const p = PALETTES[skin] && PALETTES[skin][dark ? 'dark' : 'light']
    if (!p) return null
    return {
      '--bg': p.bg,
      '--card': p.card,
      '--line': p.line,
      '--ring': p.ring,
      '--popover': p.popover,
      '--popover-fg': p.fg,
      '--theme-fg': p.fg,
      '--theme-muted': p.muted,
      '--theme-hover': rgba(p.fg, p.hover),
      '--fg': p.fg,
      '--muted': p.muted,
      '--hover': rgba(p.fg, p.hover),
      '--accent': p.accent,
      '--accent-soft': rgba(p.accent, p.soft),
      '--on-accent': p.onAccent,
      '--accent-2': p.accent2
    }
  }
  // Every name `tokens` may set, so a change of skin removes them all.
  const VARS = Object.keys(tokens('vinyl', true))

  /** Text colour on surface, for the contrast test: [label, text, surface, alpha of a fill]. */
  function pairs(skin, dark) {
    const p = PALETTES[skin][dark ? 'dark' : 'light']
    return [
      ['fg on bg', p.fg, p.bg],
      ['fg on card', p.fg, p.card],
      ['fg on popover', p.fg, p.popover],
      ['fg on hover', p.fg, p.bg, { fill: p.fg, alpha: p.hover }],
      ['muted on bg', p.muted, p.bg],
      ['muted on card', p.muted, p.card],
      ['muted on hover', p.muted, p.bg, { fill: p.fg, alpha: p.hover }],
      ['accent on bg', p.accent, p.bg],
      ['accent on popover', p.accent, p.popover],
      ['accent on its soft chip', p.accent, p.bg, { fill: p.accent, alpha: p.soft }],
      ['on-accent on accent', p.onAccent, p.accent],
      ['accent2 on bg', p.accent2, p.bg, null, 3] // large marks only (the skin's second colour)
    ]
  }

  const normalize = (name) => (SKINS.includes(name) ? name : DEFAULT)

  root.BSideSkins = { SKINS, DEFAULT, PALETTES, VARS, tokens, pairs, normalize, adaptive: (skin) => normalize(skin) === 'cd' }
})(typeof globalThis !== 'undefined' ? globalThis : this)
