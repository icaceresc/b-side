// Instant search over the library model: every name is folded once (accents and case dropped,
// "Rosalía" = "rosalia") and split into word tokens. A query matches when each of its words is the
// start of a word in the title, artist or album; words in other scripts (Japanese, Chinese...),
// which are not split by spaces, also match anywhere inside the name ("空中" in "空中キャンプ").
// Ranked by where and how well each word matches.

const LIGATURES = { ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ß: 'ss', þ: 'th', ı: 'i' }

/**
 * Folded text for matching: compatibility forms unified (full-width letters, ligatures), accents
 * of Latin, Greek and Cyrillic letters dropped, lower case. Marks of other scripts stay (ガ is not
 * カ).
 */
export function fold(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[øæœłđßþı]/g, (c) => LIGATURES[c])
}

/** Word tokens of a folded string. */
export const tokens = (folded) => folded.split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean)

/** A grouping key: folded, punctuation and spacing ignored ("AC/DC" = "ac dc"). */
export const keyOf = (s) => tokens(fold(s)).join(' ')

const NON_LATIN = /(?![\p{Script=Latin}])\p{L}/u

/** A field prepared once: its folded words and the words joined by single spaces. */
export function prepare(text) {
  const words = tokens(fold(text))
  return { words, joined: words.join(' ') }
}

/** How well one query word matches a prepared field: 3 exact word, 2 word start, 1 inside; 0 none. */
function wordScore(field, q, inside) {
  if (!field.joined.includes(q)) return 0
  let best = inside ? 1 : 0
  for (const w of field.words) {
    if (w === q) return 3
    if (w.startsWith(q)) best = 2
  }
  return best
}

/**
 * Score of a record ({ fields: [{ field, weight }], all }) for the query words; 0 when a word
 * matches nowhere.
 */
function score(rec, words, phrase) {
  let total = 0
  for (const { q, inside } of words) {
    if (!rec.all.includes(q)) return 0
    let best = 0
    for (const { field, weight } of rec.fields) {
      const s = wordScore(field, q, inside)
      if (s * weight > best) best = s * weight
    }
    if (!best) return 0
    total += best
  }
  const main = rec.fields[0].field.joined
  if (main === phrase) total += 6
  else if (main.startsWith(phrase)) total += 3
  return total
}

const record = (id, parts) => {
  const fields = parts.map(([text, weight]) => ({ field: prepare(text), weight }))
  return { id, fields, all: fields.map((f) => f.field.joined).join('\n') }
}

/**
 * Builds the index from the model's public lists (already in display order):
 * { artists: [{ id, name }], albums: [{ id, title, artist }], tracks: [{ id, title, artist, album }] }.
 */
export function createSearchIndex({ artists = [], albums = [], tracks = [] }) {
  const idx = {
    artists: artists.map((a) => record(a.id, [[a.name, 3]])),
    albums: albums.map((a) => record(a.id, [[a.title, 3], [a.artist, 1.5]])),
    tracks: tracks.map((t) => record(t.id, [[t.title, 3], [t.artist, 1.5], [t.album, 1]]))
  }

  const run = (list, words, phrase, limit) => {
    const hits = []
    for (let i = 0; i < list.length; i++) {
      const s = score(list[i], words, phrase)
      if (s) hits.push({ id: list[i].id, s, i })
    }
    hits.sort((a, b) => b.s - a.s || a.i - b.i)
    return hits.slice(0, limit).map((h) => h.id)
  }

  return {
    /** Ids of the best matches: { artists, albums, tracks }, each at most `limit`. */
    search(q, limit = 20) {
      const folded = fold(q).trim()
      const words = tokens(folded).map((w) => ({ q: w, inside: NON_LATIN.test(w) }))
      if (!words.length) return { artists: [], albums: [], tracks: [] }
      const phrase = words.map((w) => w.q).join(' ')
      return { artists: run(idx.artists, words, phrase, limit), albums: run(idx.albums, words, phrase, limit), tracks: run(idx.tracks, words, phrase, limit) }
    }
  }
}
