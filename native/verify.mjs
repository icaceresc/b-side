// Checks that the native helpers in native/bin are the CI's builds of the source in this checkout:
//
//   node native/verify.mjs [--repo owner/name] [--fresh <dir>]
//
// 1. Each binary matches its line in native/bin/SHA256SUMS.
// 2. Each binary has a build provenance attestation from this repository's CI workflow (GitHub CLI,
//    `gh attestation verify`), and the commit that workflow built it from has the same helper
//    source as this checkout (native/helper and native/build.mjs, compared as Git trees).
// 3. With --fresh, it also says whether the binaries just built from this source (in <dir>) are
//    byte for byte the same: they are when the compiler and the linker are the same versions.
// Needs Git, and the GitHub CLI signed in (in the CI, GH_TOKEN).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bin = join(here, 'bin')
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const repo = arg('repo') ?? process.env.GITHUB_REPOSITORY ?? 'icaceresc/b-side'
const fresh = arg('fresh')
const run = (cmd, args) => execFileSync(cmd, args, { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const SOURCE = ['native/helper', 'native/build.mjs']
const source = (commit) => SOURCE.map((p) => run('git', ['rev-parse', `${commit}:${p}`])).join(' ')

let failed = false
const fail = (message) => {
  failed = true
  console.log(`FAIL ${message}`)
}

const sums = new Map(
  readFileSync(join(bin, 'SHA256SUMS'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split(/\s+\*?/).reverse())
)
const files = readdirSync(bin).filter((n) => n.endsWith('.exe'))
if (!files.length) fail('no binaries in native/bin')
for (const n of sums.keys()) if (!files.includes(n)) fail(`${n} is in SHA256SUMS but not in native/bin`)
const checkout = source('HEAD')

for (const name of files) {
  const file = join(bin, name)
  const digest = sha256(file)
  if (sums.get(name) !== digest) fail(`${name}: SHA-256 ${digest} is not the one in SHA256SUMS`)
  let attestations
  try {
    attestations = JSON.parse(run('gh', ['attestation', 'verify', file, '--repo', repo, '--signer-workflow', `${repo}/.github/workflows/ci.yml`, '--format', 'json']))
  } catch (error) {
    fail(
      `${name}: no build attestation from ${repo}'s CI (${String(error.stderr || error.message)
        .trim()
        .split(/\r?\n/)
        .at(-1)})`
    )
    continue
  }
  const commits = [...new Set(attestations.map((a) => a.verificationResult?.statement?.predicate?.buildDefinition?.resolvedDependencies?.[0]?.digest?.gitCommit).filter(Boolean))]
  const same = commits.filter((c) => {
    try {
      return source(c) === checkout
    } catch {
      return false // a commit this checkout does not have
    }
  })
  if (same.length) console.log(`ok   ${name} ${digest}: built by ${repo}'s CI from ${same[0].slice(0, 12)}, the same helper source as this checkout`)
  else fail(`${name}: attested builds come from ${commits.map((c) => c.slice(0, 12)).join(', ') || 'no commit'}, whose helper source differs from this checkout; rebuild it`)
}

if (fresh) {
  for (const name of files) {
    const other = join(fresh, name)
    if (!existsSync(other)) console.log(`note ${name}: no fresh build to compare`)
    else if (sha256(other) === sha256(join(bin, name))) console.log(`ok   ${name}: the fresh build from this source is byte for byte the same`)
    else console.log(`note ${name}: the fresh build differs (${sha256(other).slice(0, 12)}): another compiler or linker version`)
  }
}
process.exit(failed ? 1 : 0)
