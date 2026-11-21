# Mission: B-Side 2.3.1, no executables in the repository

status: completed
commits: authorized

Owner decision (item #22, task task_1f2420f1d2a1, 2026-11-21): the repository carries no `.exe`;
the Rust helper is downloaded from the release on first use. Branch `icaceresc/bside-2.3.1` from
`main` at da5c98a. Authorized without a new GO: PR, merge to `main` with green CI, tag and
release `v2.3.1`, `orca plugin update icaceresc.b-side` in the owner's Orca (with `--approve`
when Orca asks), the local clone `C:\Dev\Music\b-side` brought to `main`. Never: force-push,
history rewrites, deleting releases, ending processes this mission did not start, the owner's
music in public material.

## Catalog rules checked first

- `stablyai/orca-community-plugins` `status.json`: `icaceresc/b-side` rejected at `v2.2.2`,
  category `binary-files`, files `native/bin/bside-helper-{arm64,x64}.exe`.
- orca.dev/plugins/add lists binary files (executables, native modules, archives, symlinks) as
  excluded content; the release entry (`plugin-catalog-release-entry.ts`) hashes only the tree of
  the pinned commit (`materializePluginGitTree({ commit })`, `hashPluginTree`), not the history.
- The listing policy (free, publisher is the owner, no impersonation, safe code: no malware, no
  obfuscation, no tracking; no explicit content) has no rule against downloading at run time.

## Decisions (A2, the Worker's)

- `src/native-helper.mjs`: fixed URL
  `https://github.com/icaceresc/b-side/releases/download/v{version}/bside-helper-{arch}.exe`
  (version from the manifest), HTTPS only (a redirect off HTTPS is refused), 8 MB cap, 120 s
  timeout; saved to `%LOCALAPPDATA%\B-Side\helper\{version}` (B-Side's own folder, beside
  `cache` and `queue`) through a `.part` file; runs only with the SHA-256 in `PINNED_SHA256`; a
  mismatch is deleted and logged. A cached file is re-hashed at every start. Backoff across
  starts in `helper\download.json`: 10 min, 1 h, 6 h, 24 h. A new version removes the old
  version's helper files.
- `src/aimp.mjs`: `ready` (requests wait until it is known whether a native helper is here, at
  most 3 s) and `useNative(path)` (an idle helper of the other kind gives way).
- Setting `nativeHelper` (boolean, default on) turns the download off. Capabilities unchanged.
- Chicken and egg: the build is deterministic and the helper source is unchanged since v2.3.0, so
  the pins are the v2.3.0 assets' SHA-256; the CI step "Pinned SHA-256" fails on a release tag
  when its build differs (warns on other commits); the release attaches the tag run's artifact.

## Steps

- [x] Catalog rules verified (above).
- [x] Downloader, pins, fallback, backoff, setting; `native/bin` untracked and ignored; CI without
      the committed-binary jobs, with "Pinned SHA-256" and "No binaries in the tree";
      `native/verify.mjs` checks the downloaded helper; README x6, CHANGELOG, context. Checks:
      `node --test` 189/189 (10 new in `test/native-download.test.mjs`), `orca plugin validate`,
      `check`, `test` ok.
- [x] Live in the owner's Orca with a dev copy of the tree (no `native/bin`): as 2.3.0, downloaded
      `bside-helper-x64.exe` from the v2.3.0 release in 1440 ms, SHA-256 as pinned, native helper
      running from `%LOCALAPPDATA%\B-Side\helper\2.3.0` (8.5 MB); after a restart, "native,
      cached", no download; as 2.3.1 (no release yet), HTTP 404, PowerShell answered (first
      state 1483 ms), next try +10 min; a tampered cached file was deleted, never started, and
      downloaded again (526 ms); the PowerShell helper handed over to the native one. Dev plugin
      unloaded, the test's `download.json` removed.
- [x] PR #18 (CI green on push and PR: lint, native, test x64/arm64, attest; "Pinned SHA-256" ok,
      "no binaries tracked") merged as 80efea0; tag `v2.3.1` CI run 44962915747 green; release
      `v2.3.1` with that run's `bside-helper-x64.exe` (536576 B), `bside-helper-arm64.exe`
      (509440 B), `SHA256SUMS` (`sha256sum -c` OK, `native/pins.mjs` ok, `native/verify.mjs`
      attested at 80efea035ae4); the fixed URL serves the pinned x64 hash; `git ls-tree` at
      `v2.3.1`: no executable (132 files).
- [x] `orca plugin update icaceresc.b-side` 2.3.0 -> 2.3.1: Orca asked approval for the new
      setting, approved; the installed tree has no `.exe`; on opening the panel it downloaded the
      x64 helper in 564 ms (SHA-256 as pinned), removed the 2.3.0 test copy, and the PowerShell
      helper handed over to the native one, running from `%LOCALAPPDATA%\B-Side\helper\2.3.1`
      (8.5 MB working set, 1.4 MB private). Fallback verified live with the dev copy (HTTP 404,
      tampered file) and in tests. AIMP only read (paused, unchanged); music intact (725 files,
      11734286388 bytes, newest write 2026-10-28).
- [x] `C:\Dev\Music\b-side` fast-forwarded to `main` (80efea0), clean.
- [x] README x6: updating to 2.3.1 asks once for approval: PR #19 (CI green) merged as a7bd34a;
      work branches deleted, the repository has only `main`.
- [x] Catalog status after its regeneration of 2026-11-21T23:52:54Z: `status.json` has
      `icaceresc/b-side` at ref `v2.3.1`, state `rejected`, reason `under-review: size` (the
      `binary-files` reason is gone). The orca.dev page still showed the v2.3.0 check ("Not
      listed yet", binary files) right after.

Outside this mission and pending (owner or Companion): the catalog holds v2.3.1 for a size review.
The threshold is not public (the indexer's code is not published; one other repository has the same
reason). The v2.3.1 tree is 16.8 MB, almost all README and store images in `docs/` (16 webp/png of
0.5-1.3 MB; `docs/shot-playing.webp`, 1.1 MB, is referenced by nothing). Shrinking it (fewer or
lighter README images, or moving them out of the tree) changes the showcase the owner approved, so
it is the owner's decision; otherwise wait for the catalog's review.
