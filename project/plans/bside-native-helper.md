# Mission: B-Side 2.2, a native helper instead of PowerShell

status: completed
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
  arm64). Every helper first answers a `ping` (new in both helpers, does nothing); requests wait
  unsent until then, so a fallback can never repeat a control AIMP already ran. A native helper
  that fails before the ping answer (spawn error, exit, or silent past a waiting request's time
  plus 4 s) is stopped and replaced by the PowerShell helper for the rest of the worker's life;
  the waiting requests move to it and the switch is logged once. After the ping, a helper that
  stops fails the requests sent to it. A helper is treated as gone on `close` (stdout drained), or
  250 ms after `exit` when a program it started still holds its pipes.
- Trust: the CI builds both binaries from `native/helper` with `native/build.mjs` (crt-static,
  `/Brepro`, paths remapped, so a build is deterministic for a given compiler, linker and
  libraries), runs every test against the fresh build (x64 on windows-latest, arm64 on
  windows-11-arm), and only then attests each build (GitHub build provenance, job `attest`, the
  only one with `id-token`). The binaries committed in `native/bin` are downloaded from the CI
  run, and `native/verify.mjs` (CI job `binaries`) checks: exactly x64 and arm64, their PE
  machine, `SHA256SUMS`, an attestation whose certificate (not the statement) names a commit of
  this repository built by that same commit's workflow, and that commit having the same
  `native/helper`, `native/build.mjs` and `ci.yml` as the checkout. So a change to any of those
  needs binaries from the new commit's CI run. No code-signing certificate (it would need the
  owner's accounts or payment: A3).
- Independent review (Codex `gpt-6.2-sol`, effort high, read-only, 16 findings). Fixed: control
  replay on fallback (ping), shared memory read by volatile copy (no Rust reference to memory
  AIMP writes), provenance from the certificate plus ci.yml compared and signing after tests,
  answers read before an exit counts, PowerShell-like argument reading (keys and command names
  ignoring case, hex strings, exact 64-bit integers, one-element arrays), no waiting for a cover
  AIMP did not take, the cover window re-created when gone or late, a classic AIMP started only
  when the window's process is `AIMP.exe`, thumbnails opened with FILE_FLAG_OPEN_NO_RECALL and
  the opened file's attributes checked, `Illegal characters in path.` for scan roots, both
  architectures and PE machines required, the missing-build log, an absolute cargo target dir,
  tests with 4 100 scan entries and raw JSON lines. Not changed, recorded: a directory is listed
  whole before the 250 ms check (as in the PowerShell helper; music folders are small), and a
  pointer `SHGetKnownFolderPath` may allocate on failure is not freed (one string, failure path
  only); the cover cannot be matched to its request because AIMP's WM_COPYDATA carries no request
  id and its wParam is not the Remote API window (tested), the same as the PowerShell helper.
- Second review (same reviewer, on the fixes): 1, 2, 10, 12, 13, 14 resolved. Then fixed: the
  ping must answer `ok: true` with `true` (else the helper counts as not started and the
  fallback runs); a broken stdin waits 250 ms for the last answers like `exit`; a request queued
  on a helper that stopped during its own start hands over instead of hanging; integers in
  strings convert exactly (decimal, and 0x as PowerShell's 32/64-bit two's complement); each
  cover request gets its own receiver window and thread, destroyed afterwards, so a late cover
  can never land in another request (30 covers in a row live: 30 answers, 4 threads after); the
  CI also runs the helper tests on the committed binaries when they differ from the fresh build,
  and `native/verify.mjs` also compares `.cargo` folders above the crate. Remaining, recorded:
  the classic-AIMP check is by file name only (`AIMP.exe`; portable installs stay supported);
  the PowerShell fallback keeps its older behaviour for cloud links and classic AIMP; messages of
  invalid numbers and base64 differ in wording (same code); no AIMP double in the tests.
- Measurement (`scripts/measure-helper.mjs`) never controls AIMP: it measures AIMP as the owner
  left it and records whether it was playing.

## Steps

- [x] Protocol audit and baseline measurement method (`scripts/measure-helper.mjs`)
- [x] Language choice (Rust), recorded above
- [x] Native helper in `native/helper`, Rust unit tests, parity test against the PowerShell
      helper (`test/helper-parity.test.mjs`), fallback in `src/aimp.mjs` with unit tests
- [x] Baseline measurement of the PowerShell helper on this PC: `scratch` run of
      `scripts/measure-helper.mjs --helper powershell`, AIMP paused (the owner's state): cold start
      1108 ms (median of 5), 83.6 MB working set idle (+7.1 MB conhost), 96.7 MB in use, 2828 ms
      CPU after 10 min (80 ms/min of traffic)
- [x] CI: build, test x64 (windows-latest) and arm64 (windows-11-arm), attest after the tests,
      verify `native/bin`, test the committed binaries: run 44935350272 on 9db0364 all green;
      binaries from run 44934944923 (x64 `32d62ea1cf99…`, arm64 `aa466243eabb…`), the x64 one
      byte for byte the same in two CI runs
- [x] Independent review of the native code by another agent (Codex), fixes recorded above;
      171 Node tests and 12 Rust tests pass locally
- [x] Live verification in the owner's Orca (dev `local.b-side`, native helper `32d62ea1cf99`,
      AIMP muted while playing, then restored): state, cover, lyrics, library (428 tracks scanned
      by the native helper), search, thumbnail, mute, volume, seek, shuffle, repeat, play, pause,
      next, previous, play an album from its 2nd track, enqueue; AIMP closed with its own Exit
      command: state `running: false`, a control answers `aimp_closed`, *Open AIMP* starts the
      Store AIMP. Restored after each run: Default list (45 entries in order, cursor 3, checked in
      the file AIMP saves on exit), track, position, pause, volume, mute, shuffle, repeat; no new
      playlist tabs; Hi-Fi Collection playlist file hash unchanged since 14:41. Forced fallback:
      a non-program in place of the exe gave the log line "the native helper could not start
      (spawn UNKNOWN); using the powershell helper instead" and answers through PowerShell (1.7 s).
      Final measurement, same method as the baseline, AIMP paused: cold start 21 ms, 8.5 MB idle
      (1.4 MB private), 9.5 MB in use, no conhost, 156 ms CPU after 10 min (16 ms/min); playing
      (muted, both helpers side by side): native 9.5 MB, PowerShell 95.6 MB + 7.1 MB conhost.
      The owner's music: 725 files, none changed since the session began, all with the size and
      mtime of the last scan. Not verified live: offline (worker code unchanged; no network cut),
      a classic AIMP, real OneDrive placeholders, an ARM64 PC (CI only)
- [x] README in 6 languages (section "Check the helper", anchor `verify-helper`; translations by
      a Claude Sonnet worker) and CHANGELOG 2.2.0; `main` (2.1.2) merged in, no overlap with the
      helper, its CI or its build
- [x] Publish: PR #11 (CI green on push and pull_request), merged as b5552dd with `main`'s CI
      green (run 44937474658, every job including `binaries` and `committed`); tag `v2.2.0`;
      release "B-Side 2.2.0" with both binaries and `SHA256SUMS` (downloaded assets pass
      `sha256sum -c` and `gh attestation verify`); `orca plugin update icaceresc.b-side`: 2.1.2 ->
      2.2.0, approval kept (no new access). Installed copy: both exes pass `SHA256SUMS`; Orca's
      plugin host runs the installed `bside-helper-x64.exe` (8.9 MB) and no PowerShell helper; the
      installed panel shows AIMP's state, cover and track
- [x] Cleanup: dev plugin `local.b-side` unloaded; the Codex reviewer and the Sonnet translator
      worked in this mission's workspace and have finished (no workspaces of their own); the work
      branches `icaceresc/bside-native-helper` and `icaceresc/bside-native-helper-done` are
      deleted on GitHub after their merges, leaving `main`; this plan completed and
      `active_plan: none`

Outside this mission and still pending: the owner's acceptance of 2.2.0, and the community
catalog at orca.dev picking up the `v2.2.0` tag on its own crawl.
