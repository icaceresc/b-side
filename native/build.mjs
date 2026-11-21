// Builds the native AIMP helper from native/helper into native/bin, the same way the CI does:
//
//   node native/build.mjs [x64] [arm64]     (both when none is named)
//
// Needs Rust (rustup installs the version pinned in native/helper/rust-toolchain.toml) and the
// Visual Studio C++ build tools (with the ARM64 tools for arm64). The build is deterministic: the
// C runtime is linked in (no Visual C++ redistributable needed), the linker writes no time stamp
// (/Brepro) and the paths of this PC are replaced, so the same compiler and linker give the same
// bytes (the Windows SDK and MSVC libraries are part of the linker's input too). It prints each binary's SHA-256 and writes native/bin/SHA256SUMS.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const crate = join(here, 'helper')
const bin = join(here, 'bin')
const TARGETS = { x64: 'x86_64-pc-windows-msvc', arm64: 'aarch64-pc-windows-msvc' }
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const archs = wanted.length ? wanted : Object.keys(TARGETS)
for (const a of archs) if (!TARGETS[a]) throw new Error(`unknown architecture ${a} (x64 or arm64)`)

// Absolute, so cargo (run in native/helper) and the copy below mean the same folder.
const targetDir = resolve(process.env.CARGO_TARGET_DIR || join(crate, 'target'))
const cargoHome = process.env.CARGO_HOME || join(homedir(), '.cargo')
const flags = ['-Ctarget-feature=+crt-static', '-Clink-arg=/Brepro', `--remap-path-prefix=${cargoHome}=C:\\cargo`, `--remap-path-prefix=${crate}=C:\\b-side\\native\\helper`]
const env = { ...process.env, CARGO_ENCODED_RUSTFLAGS: flags.join('\x1f'), CARGO_TARGET_DIR: targetDir, SOURCE_DATE_EPOCH: '0' }

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

mkdirSync(bin, { recursive: true })
for (const arch of archs) {
  const triple = TARGETS[arch]
  execFileSync('cargo', ['build', '--release', '--locked', '--target', triple], { cwd: crate, env, stdio: 'inherit' })
  const out = join(bin, `bside-helper-${arch}.exe`)
  copyFileSync(join(targetDir, triple, 'release', 'bside-helper.exe'), out)
  console.log(`${sha256(out)}  ${out}`)
}

const sums = readdirSync(bin)
  .filter((n) => /^bside-helper-[a-z0-9]+\.exe$/.test(n))
  .sort()
  .map((n) => `${sha256(join(bin, n))}  ${n}\n`)
  .join('')
writeFileSync(join(bin, 'SHA256SUMS'), sums)
