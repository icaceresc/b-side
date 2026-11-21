// Checks helper builds against the SHA-256 pinned in src/native-helper.mjs, the only builds that
// version of B-Side runs once downloaded from its release:
//
//   node native/pins.mjs <dir> [--warn]
//
// <dir> holds bside-helper-x64.exe and bside-helper-arm64.exe (and their SHA256SUMS, written by
// native/build.mjs, which must agree). A release is cut from a commit whose CI build matches: the
// tag's CI run fails otherwise. --warn only reports a difference (any other commit, where a new
// helper source or a runner's newer compiler means the pins are updated before the next release).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { helperName, PINNED_SHA256, sha256 } from '../src/native-helper.mjs'

const dir = process.argv[2]
const warn = process.argv.includes('--warn')
if (!dir) {
  console.error('usage: node native/pins.mjs <dir> [--warn]')
  process.exit(2)
}
const sumsFile = join(dir, 'SHA256SUMS')
const sums = new Map(
  (existsSync(sumsFile) ? readFileSync(sumsFile, 'utf8') : '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split(/\s+\*?/).reverse())
)
const problems = []
for (const [arch, pin] of Object.entries(PINNED_SHA256)) {
  const name = helperName(arch)
  const file = join(dir, name)
  if (!existsSync(file)) {
    problems.push(`${name}: not in ${dir}`)
    continue
  }
  const digest = sha256(readFileSync(file))
  if (sums.size && sums.get(name) !== digest) problems.push(`${name}: SHA256SUMS says ${sums.get(name)}, the file is ${digest}`)
  if (digest === pin) console.log(`ok   ${name} ${digest}: the pinned build`)
  else problems.push(`${name}: built ${digest}, src/native-helper.mjs pins ${pin}`)
}
for (const p of problems) console.log(warn ? `::warning::${p}` : `FAIL ${p}`)
process.exit(problems.length && !warn ? 1 : 0)
