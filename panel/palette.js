/* B-Side cover palette: colours from the album cover, a background built from them and text
 * colours that keep WCAG 2.x contrast on it, in Orca's light and dark themes.
 *
 * Everything but `fromImage` and `readTheme` is a pure function over plain arrays, so Node tests
 * run it without a DOM (test/palette.test.mjs). Colours are [r, g, b] bytes (sRGB).
 *
 * Quantization is median cut in OKLab refined by a few k-means passes. OKLab is close to
 * perceptually uniform, so a box split along its widest axis separates colours a person sees as
 * different (in RGB, greens and dark tones get too many boxes and reds too few), and Euclidean
 * distance in it is a fair "how different" for the k-means step and for merging near-duplicates.
 * Median cut gives a deterministic, well spread start; k-means then moves each centre onto its
 * cluster's mean, which median cut's box averages only approximate. No randomness anywhere: the
 * same pixels always give the same palette.
 *
 * The accent ("vibrant") is chosen separately from the clusters: a chroma-weighted hue histogram
 * of the vivid pixels, so a small vivid spot on a dark or grey cover still wins, while near-grey,
 * near-black and near-white pixels never qualify.
 */
;(function (root) {
  'use strict'

  // --- Colour spaces ---------------------------------------------------------------------------

  const LIN = new Float64Array(256)
  for (let i = 0; i < 256; i++) {
    const c = i / 255
    LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)))
  const linOf = (v) => LIN[clampByte(v)]

  function rgbToOklab(rgb) {
    const r = linOf(rgb[0]), g = linOf(rgb[1]), b = linOf(rgb[2])
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ]
  }
  // OKLab to linear sRGB, unclamped (values outside 0..1 are out of gamut).
  function oklabToLinear(lab) {
    const l = (lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2]) ** 3
    const m = (lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2]) ** 3
    const s = (lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2]) ** 3
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    ]
  }
  const toByte = (l) => clampByte(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.max(0, l) ** (1 / 2.4) - 0.055))
  const oklabToRgb = (lab) => oklabToLinear(lab).map(toByte)
  const chroma = (lab) => Math.hypot(lab[1], lab[2])
  const hueOf = (lab) => ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360

  // OKLCH to sRGB bytes, keeping lightness and hue and lowering chroma until it fits the gamut.
  function oklch(L, C, h) {
    L = Math.max(0, Math.min(1, L))
    const rad = (h * Math.PI) / 180
    const lin = (c) => oklabToLinear([L, c * Math.cos(rad), c * Math.sin(rad)])
    const fits = (v) => v.every((x) => x >= -1e-4 && x <= 1 + 1e-4)
    if (fits(lin(C))) return lin(C).map(toByte)
    let lo = 0, hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (fits(lin(mid))) lo = mid
      else hi = mid
    }
    return lin(lo).map(toByte)
  }

  // --- WCAG 2.x ------------------------------------------------------------------------------

  // Relative luminance as WCAG 2.x defines it (sRGB with the 0.03928 threshold).
  function luminance(rgb) {
    const ch = (v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2])
  }
  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
  }
  // Source-over of `top` at `alpha` on `base`, per sRGB channel, as browsers composite.
  const over = (base, top, alpha) => base.map((v, i) => v + (top[i] - v) * alpha)

  // --- Parsing and printing ------------------------------------------------------------------

  function parseHex(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim())
    if (!m) return null
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  const css = (rgb, alpha) => {
    const [r, g, b] = rgb.map(clampByte)
    return alpha == null || alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${+alpha.toFixed(3)})`
  }
  const hex = (rgb) => '#' + rgb.map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')

  // --- Quantization --------------------------------------------------------------------------

  const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2

  // OKLab of every pixel with alpha 128 or more.
  function samples(data) {
    const labs = []
    for (let i = 0; i + 3 < data.length; i += 4) if (data[i + 3] >= 128) labs.push(rgbToOklab([data[i], data[i + 1], data[i + 2]]))
    return labs
  }

  function medianCut(labs, boxes) {
    const all = labs.map((_, i) => i)
    const stats = (idx) => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
      for (const i of idx) for (let k = 0; k < 3; k++) {
        const v = labs[i][k]
        if (v < lo[k]) lo[k] = v
        if (v > hi[k]) hi[k] = v
      }
      // Lightness spans 0..1 while a and b span about -0.4..0.4: weight them so a change in hue
      // counts about as much as a similar-looking change in lightness.
      const range = [hi[0] - lo[0], (hi[1] - lo[1]) * 1.6, (hi[2] - lo[2]) * 1.6]
      const axis = range[0] >= range[1] && range[0] >= range[2] ? 0 : range[1] >= range[2] ? 1 : 2
      return { idx, axis, score: idx.length * range[axis] ** 2, range: range[axis] }
    }
    const list = [stats(all)]
    while (list.length < boxes) {
      let best = -1
      for (let i = 0; i < list.length; i++) {
        if (list[i].idx.length > 1 && list[i].range > 0.004 && (best < 0 || list[i].score > list[best].score)) best = i
      }
      if (best < 0) break
      const { idx, axis } = list[best]
      const sorted = idx.slice().sort((p, q) => labs[p][axis] - labs[q][axis] || p - q)
      const half = sorted.length >> 1
      list.splice(best, 1, stats(sorted.slice(0, half)), stats(sorted.slice(half)))
    }
    return list.map((b) => mean(labs, b.idx))
  }
  function mean(labs, idx) {
    const m = [0, 0, 0]
    for (const i of idx) for (let k = 0; k < 3; k++) m[k] += labs[i][k]
    return m.map((v) => v / (idx.length || 1))
  }

  function kmeans(labs, centres, passes) {
    let assign = new Int32Array(labs.length)
    for (let pass = 0; pass <= passes; pass++) {
      for (let i = 0; i < labs.length; i++) {
        let best = 0, bd = Infinity
        for (let c = 0; c < centres.length; c++) {
          const d = dist2(labs[i], centres[c])
          if (d < bd) (bd = d), (best = c)
        }
        assign[i] = best
      }
      if (pass === passes) break
      const sum = centres.map(() => [0, 0, 0, 0])
      for (let i = 0; i < labs.length; i++) {
        const s = sum[assign[i]]
        s[0] += labs[i][0], s[1] += labs[i][1], s[2] += labs[i][2], s[3]++
      }
      centres = centres.map((c, k) => (sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c))
    }
    return { centres, assign }
  }

  const swatch = (lab, count, total) => ({
    rgb: oklabToRgb(lab),
    lab,
    L: lab[0],
    C: chroma(lab),
    h: hueOf(lab),
    count,
    population: total ? count / total : 0
  })

  // Is this colour vivid enough to be an accent? Rejects near-grey, near-black and near-white,
  // and dull mid tones; light pastels with some colour still count.
  const VIVID = { minC: 0.06, pastelC: 0.04, pastelL: 0.72, minL: 0.28, maxL: 0.94 }
  const isVivid = (lab) => chroma(lab) >= (lab[0] >= VIVID.pastelL ? VIVID.pastelC : VIVID.minC) && lab[0] >= VIVID.minL && lab[0] <= VIVID.maxL

  // Accent candidates: peaks of a chroma-weighted hue histogram of the vivid pixels, strongest
  // first, at least 45 degrees apart. Each is the chroma-weighted mean of its peak's pixels, with
  // `score` (its weight) so callers can compare them.
  function vibrantsOf(labs) {
    const BINS = 24
    const w = new Float64Array(BINS), n = new Int32Array(BINS)
    const bins = new Int16Array(labs.length).fill(-1)
    for (let i = 0; i < labs.length; i++) {
      if (!isVivid(labs[i])) continue
      const b = Math.floor(hueOf(labs[i]) / (360 / BINS)) % BINS
      bins[i] = b
      w[b] += chroma(labs[i])
      n[b]++
    }
    // A spot of a few pixels in a 64x64 sample is enough, but single stray pixels are not.
    const minPixels = Math.max(4, Math.round(labs.length * 0.0015))
    const around = (b, k) => (b + k + BINS) % BINS
    const peaks = []
    for (let b = 0; b < BINS; b++) {
      const score = w[b] + 0.5 * (w[around(b, -1)] + w[around(b, 1)])
      const count = n[b] + n[around(b, -1)] + n[around(b, 1)]
      if (n[b] && count >= minPixels) peaks.push({ b, score })
    }
    peaks.sort((p, q) => q.score - p.score || p.b - q.b)
    const gap = (a, b) => Math.min((a - b + BINS) % BINS, (b - a + BINS) % BINS)
    const chosen = []
    for (const p of peaks) if (chosen.length < 3 && chosen.every((c) => gap(c.b, p.b) >= 3)) chosen.push(p)
    return chosen.map(({ b: peak, score }) => {
      const m = [0, 0, 0]
      let total = 0, count = 0
      for (let i = 0; i < labs.length; i++) {
        if (bins[i] < 0 || gap(bins[i], peak) > 1) continue
        const c = chroma(labs[i])
        for (let k = 0; k < 3; k++) m[k] += labs[i][k] * c
        total += c
        count++
      }
      return Object.assign(swatch(m.map((v) => v / total), count, labs.length), { score: score / labs.length })
    })
  }

  // Channel-wise extremes of the cover once blurred, as the backdrop shows it. Blurs both in
  // sRGB and in linear light (browsers differ) with a smaller radius than the real one, and takes
  // the widest result: a conservative bound for the contrast estimate.
  function blurBounds(data, width, height, radius) {
    const lo = [255, 255, 255], hi = [0, 0, 0]
    if (!width || !height) return { lo, hi }
    for (const linear of [false, true]) {
      const planes = [0, 1, 2].map((k) => {
        const p = new Float64Array(width * height)
        for (let i = 0; i < width * height; i++) p[i] = linear ? LIN[data[i * 4 + k]] : data[i * 4 + k]
        return p
      })
      for (const p of planes) for (let pass = 0; pass < 3; pass++) boxBlur(p, width, height, radius)
      for (let i = 0; i < width * height; i++) {
        if (data[i * 4 + 3] < 128) continue
        for (let k = 0; k < 3; k++) {
          const v = linear ? toByte(planes[k][i]) : planes[k][i]
          if (v < lo[k]) lo[k] = v
          if (v > hi[k]) hi[k] = v
        }
      }
    }
    return { lo: lo.map(Math.floor), hi: hi.map(Math.ceil) }
  }
  function boxBlur(p, w, h, r) {
    const tmp = new Float64Array(p.length)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0
      for (let d = -r; d <= r; d++) {
        const xx = x + d
        if (xx >= 0 && xx < w) (s += p[y * w + xx]), n++
      }
      tmp[y * w + x] = s / n
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0
      for (let d = -r; d <= r; d++) {
        const yy = y + d
        if (yy >= 0 && yy < h) (s += tmp[yy * w + x]), n++
      }
      p[y * w + x] = s / n
    }
  }

  /**
   * Palette of an RGBA pixel array (e.g. ImageData.data of a 64x64 downscale).
   * Returns { dominant, secondaries (up to 4), swatches, vibrant | null, vibrants, grey,
   * art: { lo, hi } } or null when no pixel is opaque. Each swatch: { rgb, lab, L, C, h, count,
   * population }; `vibrants` are the accent candidates (vibrant is the strongest), `art` the
   * channel-wise range of the blurred cover.
   */
  function extract(data, width, height) {
    const labs = samples(data)
    if (!labs.length) return null
    if (!width) width = height = Math.round(Math.sqrt(data.length / 4))
    const { centres, assign } = kmeans(labs, medianCut(labs, 8), 4)
    const counts = new Int32Array(centres.length)
    for (const a of assign) counts[a]++
    let list = centres.map((c, k) => ({ lab: c, count: counts[k] })).filter((s) => s.count > 0)
    // Merge clusters a person would not tell apart, the larger absorbing the smaller.
    list.sort((p, q) => q.count - p.count || q.lab[0] - p.lab[0])
    const merged = []
    for (const s of list) {
      const twin = merged.find((m) => dist2(m.lab, s.lab) < 0.035 ** 2)
      if (twin) {
        const n = twin.count + s.count
        twin.lab = twin.lab.map((v, k) => (v * twin.count + s.lab[k] * s.count) / n)
        twin.count = n
      } else merged.push({ lab: s.lab.slice(), count: s.count })
    }
    merged.sort((p, q) => q.count - p.count || q.lab[0] - p.lab[0])
    const swatches = merged.map((s) => swatch(s.lab, s.count, labs.length))
    const dominant = swatches[0]
    // Secondaries: clearly different from the dominant and from each other, not specks.
    const secondaries = []
    for (const s of swatches.slice(1)) {
      if (secondaries.length >= 4) break
      if (s.population < 0.01) continue
      if ([dominant, ...secondaries].every((o) => dist2(o.lab, s.lab) >= 0.08 ** 2)) secondaries.push(s)
    }
    const vibrants = vibrantsOf(labs)
    const vibrant = vibrants[0] || null
    const grey = swatches.every((s) => s.C < 0.03 || s.population < 0.01) && !vibrant
    return { dominant, secondaries, swatches, vibrant, vibrants, grey, art: blurBounds(data, width, height, 2) }
  }

  // --- Derived colours -----------------------------------------------------------------------

  const DEFAULT_ACCENT = [255, 106, 61] // #ff6a3d, B-Side's own
  const AA = 4.5
  // Layer strengths, matched by the CSS in panel/index.html.
  const HOVER = 0.1 // --hover: --fg at this alpha (chips, pills, hover fills)
  const SOFT = 0.16 // --accent-soft: --accent at this alpha (CD-quality chip)
  const SAT = 1.35 // backdrop's saturate()
  const ART_MAX = { dark: 0.42, light: 0.34 } // blurred cover's opacity, at most
  const ART_ROOM = { dark: 0.008, light: 0.12 } // how far it may move the luminance bound
  // Brightest (dark theme) or darkest (light theme) the background may get anywhere, as relative
  // luminance: keeps room for a muted text tone that still passes AA.
  const BUDGET = { dark: 0.05, light: 0.66 }

  // Search lightness from `L` towards more contrast (up on dark, down on light) for the first
  // colour of this hue and chroma that passes `ok`. Falls back to white or black.
  function fit(L, C, h, up, ok) {
    for (let i = 0; i <= 200; i++) {
      const l = up ? L + i * 0.005 : L - i * 0.005
      if (l < 0 || l > 1) break
      const rgb = oklch(l, C, h)
      if (ok(rgb)) return rgb
    }
    return up ? [255, 255, 255] : [0, 0, 0]
  }

  // Channel-wise bounds of what the backdrop can show behind any text, given its colours and the
  // blurred cover's opacity: every gradient stop, the theme background (during fades) and the
  // cover composited at its strongest, saturate() included.
  function bounds(colours, art, opacity) {
    const lo = [255, 255, 255], hi = [0, 0, 0]
    for (const c of colours) for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k], c[k])), (hi[k] = Math.max(hi[k], c[k]))
    if (!art || !opacity) return { lo, hi }
    const s = saturated(art.lo, art.hi)
    const blo = lo.slice(), bhi = hi.slice()
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], blo[k] + (s.lo[k] - blo[k]) * opacity)
      hi[k] = Math.max(hi[k], bhi[k] + (s.hi[k] - bhi[k]) * opacity)
    }
    return { lo, hi }
  }
  // saturate(SAT) is a linear map; over a box of colours its extremes are at the box's corners.
  // Taken both on sRGB values and in linear light, whichever the browser uses.
  function saturated(lo, hi) {
    const m = [
      [0.213 + 0.787 * SAT, 0.715 - 0.715 * SAT, 0.072 - 0.072 * SAT],
      [0.213 - 0.213 * SAT, 0.715 + 0.285 * SAT, 0.072 - 0.072 * SAT],
      [0.213 - 0.213 * SAT, 0.715 - 0.715 * SAT, 0.072 + 0.928 * SAT]
    ]
    const out = { lo: [255, 255, 255], hi: [0, 0, 0] }
    for (const linear of [false, true]) {
      const f = linear ? linOf : (v) => v
      for (let k = 0; k < 3; k++) {
        let a = 0, b = 0
        for (let j = 0; j < 3; j++) {
          const w = m[k][j]
          a += w * (w >= 0 ? f(lo[j]) : f(hi[j]))
          b += w * (w >= 0 ? f(hi[j]) : f(lo[j]))
        }
        const toB = (v) => (linear ? toByte(Math.max(0, Math.min(1, v))) : clampByte(v))
        out.lo[k] = Math.min(out.lo[k], toB(a))
        out.hi[k] = Math.max(out.hi[k], toB(b))
      }
    }
    return out
  }

  // The background's colours: lightness set by the theme (rich and dark, or light and pastel),
  // hue and some chroma from the cover, so it never turns to mid-grey mud.
  function backgroundColours(pal, dark, shift) {
    const d = pal.dominant
    const tone = (s, role) => {
      // Colour that is there gets at least some body (a pastel pink becomes a plum glow, not a
      // dusty rose); near-neutral colour stays neutral and a little darker.
      const neutral = s.C < 0.03
      if (dark) {
        const L = Math.max(0.16, Math.min(neutral ? 0.27 : 0.34, 0.2 + 0.12 * s.L) - shift - (role === 'deep' ? 0.07 : 0))
        const C = neutral ? s.C : Math.min(Math.max(s.C * 1.1, role === 'deep' ? 0.04 : 0.07), role === 'deep' ? 0.06 : 0.12)
        return oklch(L, C, s.h)
      }
      const L = Math.min(0.985, Math.max(0.86, 0.9 + 0.05 * s.L) + shift + (role === 'deep' ? 0.04 : 0))
      const C = neutral ? s.C * 0.5 : Math.min(Math.max(s.C * 0.5, role === 'deep' ? 0.012 : 0.03), role === 'deep' ? 0.02 : 0.055)
      return oklch(L, C, s.h)
    }
    const second = pal.secondaries[0] || pal.vibrant || d
    const third = pal.vibrant || pal.secondaries[1] || second
    return { c0: tone(d, 'wash'), c1: tone(second, 'blob'), c2: tone(third, 'blob'), c3: tone(d, 'deep') }
  }

  /**
   * CSS custom properties for a palette (or null: B-Side's default look) in a theme
   * { dark, bg, fg?, popover?, hover? }, plus the estimate behind them.
   * vars: name -> CSS value, or null for "remove the override" (the stylesheet's own value).
   */
  function derive(pal, theme) {
    const dark = Boolean(theme.dark)
    const bg = theme.bg || (dark ? [17, 17, 20] : [255, 255, 255])
    const popover = theme.popover || bg
    const up = dark // more contrast: lighter text on dark, darker on light
    const vars = { '--bs-c0': null, '--bs-c1': null, '--bs-c2': null, '--bs-c3': null, '--bs-art': null, '--fg': null, '--muted': null, '--hover': null }

    let surfaces, hi, lo, fg, muted, art = 0
    if (pal) {
      let colours
      for (let shift = 0; shift <= 0.2 + 1e-9; shift += 0.02) {
        colours = backgroundColours(pal, dark, shift)
        const list = [bg, colours.c0, colours.c1, colours.c2, colours.c3]
        const fitsBudget = (b) => (dark ? luminance(b.hi) <= BUDGET.dark : luminance(b.lo) >= BUDGET.light)
        if (!fitsBudget(bounds(list, null, 0)) && shift < 0.2) continue
        // The strongest blurred cover that stays within the budget and moves the background's
        // extreme only a little, so the room is left to the accent and the muted text.
        const plain = luminance(dark ? bounds(list, null, 0).hi : bounds(list, null, 0).lo)
        const allowed = (b) => fitsBudget(b) && (dark ? luminance(b.hi) <= plain + ART_ROOM.dark : luminance(b.lo) >= plain - ART_ROOM.light)
        art = 0
        for (let o = ART_MAX[dark ? 'dark' : 'light']; o > 0.001; o -= 0.02) {
          if (allowed(bounds(list, pal.art, o))) {
            art = Math.round(o * 100) / 100
            break
          }
        }
        ;({ lo, hi } = bounds(list, pal.art, art))
        break
      }
      const worst = dark ? hi : lo
      surfaces = [worst, bg]
      const d = pal.dominant
      const tintC = Math.min(d.C, 0.025)
      fg = fit(dark ? 0.96 : 0.24, tintC, d.h, up, (c) => surfaces.every((s) => contrast(c, s) >= 7) && contrast(c, over(worst, c, HOVER)) >= AA)
      if (!surfaces.every((s) => contrast(fg, s) >= AA)) fg = fit(dark ? 0.96 : 0.24, 0, 0, up, (c) => surfaces.every((s) => contrast(c, s) >= AA))
      // Muted text also sits on chips and pills (--hover over the background).
      const chip = over(worst, fg, HOVER)
      muted = fit(dark ? 0.74 : 0.5, Math.min(d.C, 0.04), d.h, up, (c) => [worst, bg, chip].every((s) => contrast(c, s) >= AA))
      for (const [k, c] of Object.entries(colours)) vars['--bs-' + k] = css(c)
      vars['--bs-art'] = String(art)
      vars['--fg'] = css(fg)
      vars['--muted'] = css(muted)
      vars['--hover'] = css(fg, HOVER)
    } else {
      surfaces = [bg]
      if (theme.hover) surfaces.push(theme.hover)
      fg = theme.fg || (dark ? [236, 236, 241] : [24, 24, 27])
      hi = lo = bg
    }

    // Accent: the cover's vibrant colour, else B-Side's orange; text-safe on every surface it
    // is used on (background, its own soft chip, the language menu).
    // Among the cover's candidates, the one that stays most vivid once text-safe (on dark, a
    // yellow beats a deep purple; on light, the reverse), unless it is much weaker on the cover.
    const worst = dark ? hi : lo
    // The language menu's hovered item: --hover over the popover (Orca's own hover without a cover).
    const menuHover = pal ? over(popover, fg, HOVER) : theme.hover || over(popover, fg, 0.06)
    const accentOk = (c) => [...surfaces, popover, menuHover, over(worst, c, SOFT)].every((s) => contrast(c, s) >= AA)
    const safe = (s) => fit(dark ? Math.max(s.L, 0.72) : Math.min(s.L, 0.56), Math.min(0.2, Math.max(0.1, s.C * 1.15)), s.h, up, accentOk)
    let accent = null, base = swatch(rgbToOklab(DEFAULT_ACCENT), 0, 0)
    const candidates = pal ? (pal.vibrants || (pal.vibrant ? [pal.vibrant] : [])) : []
    if (candidates.length) {
      const top = candidates[0].score || 1
      let best = -1
      for (const s of candidates) {
        const rgb = safe(s)
        const value = chroma(rgbToOklab(rgb)) * Math.sqrt((s.score || top) / top)
        if (value > best + 1e-9) (best = value), (accent = rgb), (base = s)
      }
    } else accent = accentOk(DEFAULT_ACCENT) ? DEFAULT_ACCENT : safe(base)
    // Text on accent-filled buttons: white when it passes, else a deep tone of the accent's hue.
    const light = oklch(0.99, Math.min(base.C, 0.015), base.h)
    const deep = fit(0.25, Math.min(base.C, 0.06), base.h, false, (c) => contrast(c, accent) >= AA)
    const onAccent = contrast(light, accent) >= AA ? light : contrast(deep, accent) >= contrast(light, accent) ? deep : light
    vars['--accent'] = pal || accent !== DEFAULT_ACCENT ? css(accent) : null
    vars['--accent-soft'] = css(accent, SOFT)
    vars['--on-accent'] = css(onAccent)

    return { vars, fg, muted, accent, onAccent, art, worst: dark ? hi : lo, bounds: { lo, hi }, surfaces }
  }

  // --- Browser helpers -----------------------------------------------------------------------

  let probe = null
  const context = () => {
    if (!probe) {
      const c = document.createElement('canvas')
      c.width = c.height = 64
      probe = c.getContext('2d', { willReadFrequently: true })
    }
    return probe
  }
  // Any CSS colour string to bytes, composited over `under` when translucent; null if invalid.
  function cssToRgb(value, under) {
    const g = context()
    const s = String(value || '').trim()
    if (!s) return null
    g.fillStyle = '#010203'
    g.fillStyle = s
    if (g.fillStyle === '#010203' && !/^#010203$/i.test(s)) return null
    g.clearRect(0, 0, 1, 1)
    if (under) {
      g.fillStyle = css(under)
      g.fillRect(0, 0, 1, 1)
      g.fillStyle = s
    }
    g.fillRect(0, 0, 1, 1)
    const d = g.getImageData(0, 0, 1, 1).data
    return d[3] ? [d[0], d[1], d[2]] : null
  }
  // The theme as Orca set it: the `light` class and the tokens behind --bg, --fg and friends.
  function readTheme(doc) {
    const html = doc.documentElement
    const cs = getComputedStyle(html)
    const dark = !html.classList.contains('light')
    const get = (name) => cs.getPropertyValue(name)
    const bg = cssToRgb(get('--bg')) || (dark ? [17, 17, 20] : [255, 255, 255])
    return {
      dark,
      bg,
      fg: cssToRgb(get('--theme-fg'), bg),
      popover: cssToRgb(get('--orca-popover'), bg) || (dark ? [31, 31, 38] : [255, 255, 255]),
      hover: cssToRgb(get('--theme-hover'), bg)
    }
  }
  // The palette of a loaded <img>, from a 64x64 downscale.
  function fromImage(img) {
    const g = context()
    g.clearRect(0, 0, 64, 64)
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, 0, 0, 64, 64)
    return extract(g.getImageData(0, 0, 64, 64).data, 64, 64)
  }

  root.BSidePalette = {
    rgbToOklab, oklabToRgb, oklch, luminance, contrast, over, parseHex, css, hex,
    extract, blurBounds, derive, cssToRgb, readTheme, fromImage,
    DEFAULT_ACCENT, AA, VARS: ['--bs-c0', '--bs-c1', '--bs-c2', '--bs-c3', '--bs-art', '--fg', '--muted', '--hover', '--accent', '--accent-soft', '--on-accent']
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
