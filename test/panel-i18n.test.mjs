// The panel's six languages (panel/i18n.js): the same keys everywhere, plural forms each language
// needs, the same placeholders, a message for every error code, and every key the panel uses.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const PANEL = new URL('../panel/', import.meta.url)
const context = {}
vm.runInNewContext(readFileSync(new URL('i18n.js', PANEL), 'utf8'), context)
const { STRINGS, ERROR_CODES, LANGS } = JSON.parse(JSON.stringify(context.BSideI18n))
const files = ['index.html', ...readdirSync(PANEL).filter((f) => f.endsWith('.js')), ...readdirSync(new URL('views/', PANEL)).map((f) => 'views/' + f)]
const code = files.map((f) => readFileSync(new URL(f, PANEL), 'utf8')).join('\n')
const placeholders = (v) => [...new Set([...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()

test('the panel speaks all six languages with the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS).sort(), ['de', 'en', 'es', 'ja', 'ru', 'zh'])
  assert.deepEqual(LANGS.map((l) => l.code).sort(), Object.keys(STRINGS).sort())
  const keys = Object.keys(STRINGS.en).sort()
  for (const [lang, table] of Object.entries(STRINGS)) {
    assert.deepEqual(Object.keys(table).sort(), keys, lang)
    for (const [key, value] of Object.entries(table)) {
      if (typeof value === 'string') assert.ok(value.trim(), `${lang}.${key} is empty`)
      else assert.ok(value && typeof value.other === 'string' && value.other.trim(), `${lang}.${key} needs an "other" form`)
      assert.equal(typeof value, typeof STRINGS.en[key], `${lang}.${key}: a string in one language, plural forms in another`)
      assert.deepEqual(placeholders(value), placeholders(STRINGS.en[key]), `${lang}.${key} placeholders`)
    }
  }
  for (const key of ['untitled', 'mute', 'unmute', 'invalid', 'aimp_error', 'unknownArtist', 'unknownAlbum']) for (const lang of Object.keys(STRINGS)) assert.ok(STRINGS[lang][key]?.trim(), `${lang}.${key}`)
})

test('every error code has a message', () => {
  for (const c of ['invalid', 'aimp_error', 'aimp_closed', 'aimp_timeout', 'helper_failed', 'not_found']) assert.ok(ERROR_CODES.includes(c), c)
  for (const c of ERROR_CODES) assert.ok(STRINGS.en[c], `message for ${c}`)
})

test('plural forms cover what each language uses', () => {
  for (const [lang, table] of Object.entries(STRINGS)) {
    const rules = new Intl.PluralRules(lang)
    for (const [key, value] of Object.entries(table)) {
      if (typeof value !== 'object') continue
      for (const n of [0, 1, 2, 3, 5, 11, 21, 22, 25, 101, 1000]) {
        const form = rules.select(n)
        if (form !== 'other') assert.ok(value[form], `${lang}.${key} has no "${form}" form (for ${n})`)
      }
    }
  }
})

test('every key the panel uses exists', () => {
  const used = new Set([
    ...[...code.matchAll(/\bt\('(\w+)'/g)].map((m) => m[1]),
    ...[...code.matchAll(/\btn\('(\w+)'/g)].map((m) => m[1]),
    ...[...code.matchAll(/data-i18n(?:-html|-label)?="(\w+)"/g)].map((m) => m[1])
  ])
  // Keys built at run time: the section names and the sort orders.
  for (const k of ['artists', 'albums', 'tracks', 'genres', 'sortArtist', 'sortTitle', 'sortYear']) used.add(k)
  for (const key of used) assert.ok(key in STRINGS.en, `the panel uses "${key}", which has no string`)
})

test('the panel says exactly where the library folders are set, in every language', () => {
  const manifest = JSON.parse(readFileSync(new URL('../orca-plugin.json', import.meta.url), 'utf8'))
  const setting = (manifest.contributes?.settings ?? []).find((s) => s.key === 'libraryFolders')
  const path = `Settings › Plugins › ${manifest.name} › ${setting ? setting.title : 'Library folders'}`
  for (const [lang, table] of Object.entries(STRINGS)) {
    for (const key of ['libWhere', 'libMissing']) assert.ok(table[key].includes(path), `${lang}.${key} names ${path}`)
    assert.match(table.libAimp, /AIMP/, `${lang}.libAimp`)
  }
})
