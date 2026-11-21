// Checks that the native helpers in native/bin are the CI's builds of the source in this checkout:
//
//   node native/verify.mjs [--repo owner/name] [--fresh <dir>]
//
// 1. native/bin holds exactly bside-helper-x64.exe and bside-helper-arm64.exe, each a Windows
//    program for its architecture (the PE header's machine), each matching native/bin/SHA256SUMS.
// 2. Each has a build provenance attestation signed for this repository's CI workflow on a
//    GitHub-hosted runner (`gh attestation verify`). The commit comes from the signing certificate,
//    which GitHub vouches for, not from the attestation's own statement; the workflow that signed
//    must be the one of that same commit, and that commit must have the same helper source and the
//    same CI workflow as this checkout (native/helper, native/build.mjs and
//    .github/workflows/ci.yml, compared as Git objects). The workflow signs a build only after
//    every test passed on it.
// 3. With --fresh, it also says whether the binaries just built from this source (in <dir>) are
//    byte for byte the same: they are when the compiler, the linker and the libraries are the same
//    versions.
// Needs Git with the history, and the GitHub CLI signed in (in the CI, GH_TOKEN).
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
const MACHINES = { 'bside-helper-x64.exe': 0x8664, 'bside-helper-arm64.exe': 0xaa64 }
const SOURCE = ['native/helper', 'native/build.mjs', '.github/workflows/ci.yml']
const source = (commit) => SOURCE.map((p) => run('git', ['rev-parse', `${commit}:${p}`])).join(' ')

let failed = false
const fail = (message) => {
  failed = true
  console.log(`FAIL ${message}`)
}

/** The machine field of a PE file, or null when it is not one. */
function machine(file) {
  const b = readFileSync(file)
  if (b.length < 0x40 || b.toString('latin1', 0, 2) !== 'MZ') return null
  const pe = b.readUInt32LE(0x3c)
  if (pe + 6 > b.length || b.toString('latin1', pe, pe + 4) !== 'PE\0\0') return null
  return b.readUInt16LE(pe + 4)
}

const sums = new Map(
  (existsSync(join(bin, 'SHA256SUMS')) ? readFileSync(join(bin, 'SHA256SUMS'), 'utf8') : '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split(/\s+\*?/).reverse())
)
const files = existsSync(bin) ? readdirSync(bin).filter((n) => n.endsWith('.exe')) : []
for (const name of Object.keys(MACHINES)) if (!files.includes(name)) fail(`native/bin has no ${name}`)
for (const name of files) if (!MACHINES[name]) fail(`native/bin has an unexpected ${name}`)
for (const name of sums.keys()) if (!MACHINES[name]) fail(`SHA256SUMS lists an unexpected ${name}`)
const checkout = source('HEAD')

for (const name of files.filter((n) => MACHINES[n])) {
  const file = join(bin, name)
  const digest = sha256(file)
  if (sums.get(name) !== digest) fail(`${name}: SHA-256 ${digest} is not the one in SHA256SUMS`)
  const m = machine(file)
  if (m !== MACHINES[name]) fail(`${name}: PE machine ${m === null ? 'none' : `0x${m.toString(16)}`}, expected 0x${MACHINES[name].toString(16)}`)
  let attestations
  try {
    attestations = JSON.parse(run('gh', ['attestation', 'verify', file, '--repo', repo, '--signer-workflow', `${repo}/.github/workflows/ci.yml`, '--format', 'json']))
  } catch (error) {
    fail(`${name}: no build attestation from ${repo}'s CI (${String(error.stderr || error.message).trim().split(/\r?\n/).at(-1)})`)
    continue
  }
  const signed = attestations
    .map((a) => a.verificationResult?.signature?.certificate)
    .filter((c) => c && c.githubWorkflowRepository === repo && c.runnerEnvironment === 'github-hosted' && c.sourceRepositoryDigest && c.sourceRepositoryDigest === c.buildSignerDigest)
    .map((c) => c.sourceRepositoryDigest)
  const commits = [...new Set(signed)]
  const same = commits.filter((c) => {
    try {
      return source(c) === checkout
    } catch {
      return false // a commit this checkout does not have
    }
  })
  if (same.length) console.log(`ok   ${name} ${digest}: built and tested by ${repo}'s CI at ${same[0].slice(0, 12)}, with the same helper source and CI as this checkout`)
  else fail(`${name}: signed builds come from ${commits.map((c) => c.slice(0, 12)).join(', ') || 'no usable commit'}, whose helper source or CI differs from this checkout; take the binaries from this commit's CI run`)
}

if (fresh) {
  for (const name of Object.keys(MACHINES)) {
    const ours = join(bin, name)
    const other = join(fresh, name)
    if (!existsSync(other) || !existsSync(ours)) console.log(`note ${name}: nothing to compare`)
    else if (sha256(other) === sha256(ours)) console.log(`ok   ${name}: the fresh build from this source is byte for byte the same`)
    else console.log(`note ${name}: the fresh build differs (${sha256(other).slice(0, 12)}): another compiler, linker or library version`)
  }
}
process.exit(failed ? 1 : 0)
