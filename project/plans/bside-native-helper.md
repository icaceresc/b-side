# Mission: B-Side 2.2, a native helper instead of PowerShell

status: active
commits: authorized

Job Packet JP-BSIDE-NATIVE-HELPER (owner GO, item #17, 2026-11-21). Branch
`icaceresc/bside-native-helper` from `main` at v2.1.1 (`5225538`). Authorized without a new GO:
branch, commits, push, PR, merge with green CI and live verification, tag and release `v2.2.0`
with the binaries and their checksums, `orca plugin update icaceresc.b-side` in the owner's Orca
(approving a new fingerprint if it asks), dev mode, using AIMP for tests, development toolchains
and permissively licensed build dependencies, Workers routed by AIEWS Smart Routing with an
independent review of the native code by an agent other than the author. A3 (ask the Companion):
the engine or the licence, code signing that needs the owner's accounts, payments or data,
anything exposing the owner's data, removing the PowerShell fallback. Never: force-push, history
rewrites, deleting releases, turning off Defender or SmartScreen. The owner's music: read only.
AIMP: leave it exactly as found after every test (volume, mute, shuffle, track, position).

## Objective

Replace the PowerShell helper that talks to AIMP with a small native executable speaking the same
protocol, so B-Side uses less memory and starts faster, with no other change the user notices; keep
the PowerShell helper as a logged fallback when the binary cannot start.

## Audit (2026-11-21)

- Protocol (`native/aimp-helper.ps1`, `src/aimp.mjs`): JSON lines on stdin/stdout, requests
  `{id, cmd, args}`, answers `{id, ok, result}` or `{id, ok: false, code, error}`; codes
  `aimp_closed`, `aimp_timeout`, `invalid`, else `aimp_error` with the .NET message. Commands:
  `state`, `art`, controls (`play`, `pause`, `playPause`, `stop`, `next`, `previous`, `seek`,
  `volume`, `shuffle`, `repeat`, `mute`), `shellInfo`, `openFile`, `insertFile`, `scan`,
  `musicFolder`, `thumb`. Arguments are PowerShell casts (`[int]`, `[long]`, `[bool]`, `[string]`).
- In the owner's Orca the 2.1.1 helper is `powershell.exe -EncodedCommand` under Orca's plugin
  host, about 92 MB of working set (the Companion measured 91 MB and 1.4 s cold start).
- A console program started without a console gets a `conhost.exe` beside it; the measurement
  counts it.

## Decisions (A2, the Worker's)

- **Rust** (1.100.0, pinned in `native/helper/rust-toolchain.toml`) with Microsoft's `windows`
  crate (MIT/Apache-2.0) for the Win32 and WIC bindings and `serde_json` (MIT/Apache-2.0) to read
  requests. Why: memory safety where the helper reads data from another process (AIMP's shared
  memory and WM_COPYDATA) and from files; a ~0.5 MB static binary with no runtime to install
  (the C runtime is linked in); a few MB of RAM; Rust and the MSVC build tools are already on this
  PC and on GitHub's Windows runners, and the arm64 build is a second target of the same code.
  C++ would match size and RAM without the memory safety; C# Native AOT would reuse the C# but
  cannot use System.Drawing or WinForms trimmed, needs its interop rewritten anyway, and carries a
  GC and a larger binary and working set.
- Images: Windows Imaging Component (WIC) replaces GDI+: decode, high-quality cubic scaling,
  composite over black (premultiplied BGRA), JPEG at the same quality ladder and byte budgets.
  WIC also decodes WebP covers, which GDI+ could not (they had no thumbnail before).
- Windows-subsystem binary: started with pipes it needs no console, so no `conhost.exe` runs
  beside it, and no window can flash. It peeks its message queue once at start so Windows drops
  the "working in background" cursor.
- COM is free-threaded on the main thread (WIC); ShellExecuteEx runs on a short-lived thread in a
  single-threaded apartment, as the shell asks; the cover window keeps its own thread and loop.
- A classic AIMP started by the helper gets null stdin/stdout/stderr, so it never holds the
  worker's pipes (the .NET Process.Start in the PowerShell helper let it inherit them).
- Fallback (`src/aimp.mjs`): `kind: 'auto'` starts `native/bin/bside-helper-<arch>.exe` (x64,
  arm64); a native helper that fails before its first answer (spawn error, exit, or silent past
  its first request's time plus 4 s) is stopped and replaced by the PowerShell helper for the rest
  of the worker's life; waiting requests move to it, and the worker logs the switch once.
- Trust: the CI builds both binaries from `native/helper` with `native/build.mjs` (crt-static,
  `/Brepro`, paths remapped, so a build is deterministic for a given compiler and linker), runs
  every test against the fresh build, and attests each build (GitHub build provenance). The
  binaries committed in `native/bin` are downloaded from the CI run, and `native/verify.mjs`
  (CI job `binaries`) checks them against `SHA256SUMS`, their attestation, and that the attested
  commit has the same helper source as the checkout. No code-signing certificate (it would need
  the owner's accounts or payment: A3).
- Measurement (`scripts/measure-helper.mjs`) never controls AIMP: it measures AIMP as the owner
  left it and records whether it was playing.

## Steps

- [x] Protocol audit and baseline measurement method (`scripts/measure-helper.mjs`)
- [x] Language choice (Rust), recorded above
- [x] Native helper in `native/helper`, Rust unit tests, parity test against the PowerShell
      helper (`test/helper-parity.test.mjs`), fallback in `src/aimp.mjs` with unit tests
- [ ] Baseline measurement of the PowerShell helper on this PC
- [ ] CI: build, attest, test x64 and arm64, verify `native/bin`; commit the CI's binaries
- [ ] Independent review of the native code by another agent; fixes
- [ ] Live verification in the owner's Orca (dev mode) against AIMP; forced fallback; final
      measurement; the owner's music unchanged (mtime and size)
- [ ] README in 6 languages and CHANGELOG 2.2.0
- [ ] Publish: PR, merge with green CI, tag and release v2.2.0 with binaries and SHA256SUMS,
      `orca plugin update icaceresc.b-side`
- [ ] Cleanup: work branch and Worker workspaces gone, repo with only `main`, this plan completed
