# Mission: B-Side 2.3.1, no executables in the repository

status: active
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
  `https://github.com/icaceresc/b-side/releases/download/v<version>/bside-helper-<arch>.exe`
  (version from the manifest), HTTPS only (a redirect off HTTPS is refused), 8 MB cap, 120 s
  timeout; saved to `%LOCALAPPDATA%\B-Side\helper\<version>` (B-Side's own folder, beside
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
- [ ] PR, CI green, merge; tag `v2.3.1`; release with the tag run's `bside-helper-x64.exe`,
      `bside-helper-arm64.exe`, `SHA256SUMS` (equal to the pins); `git ls-files` at the tag has
      no executable.
- [ ] `orca plugin update icaceresc.b-side` to 2.3.1; confirm the download, the native helper
      running (path, SHA-256, RAM), first-download time, fallback; AIMP as found; music intact.
- [ ] `C:\Dev\Music\b-side` on `main`; branches cleaned; catalog status after its regeneration.
