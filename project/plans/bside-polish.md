# Mission: b-side polish (world-class Orca plugin)

status: completed
commits: authorized

Branch: `icaceresc/bside-polish` (feature branch; never `main`). Push, PR, merge, tags, releases,
GitHub settings and publishing are not authorized: the owner decides them after review.
Owner decisions (2026-11-20, via Punky): install AIMP Microsoft Store edition per user (winget
9PCLLLH15SMT, no admin) and LEAVE IT INSTALLED; test only with synthetic FLAC files in `scratch/`,
no My Clouds and no owner accounts; never change AIMP's settings or library (so `install.ps1` is
not run against AIMP's profile). Dev-loading the plugin from this worktree with `--approve` is
authorized for live testing and screenshots; `orca plugin dev unload` it when done.
Delegation to Orca Claude workers in child worktrees is authorized (up to ~4 in parallel); the
Orchestrator integrates their branches into this branch locally and owns acceptance.

## Objective

B-Side reliably does what it promises (control AIMP from an Orca sidebar panel), installs and
updates the way Orca plugins are distributed, has tests, CI and lint, and presents a consistent
identity (README in 6 languages, plugin icon, cover and screenshots for Orca's plugin page).

## Audit baseline (2026-11-20, Orca 1.4.265)

- `orca plugin validate`, `test` (17/17), `check`: pass.
- `orca plugin install icaceresc/b-side` FAILED: `unreadable orca-plugin.json` (manifest lived in
  `plugin/`; Orca installs Git plugins from the repository root).
- AIMP was NOT installed on this machine (no Store package, no classic install). The helper compiles
  and answers `{"running":false}` (cold start ~1.4 s).
- Gaps: hardcoded Spanish fallback title `Sin título` in `src/player.mjs`; command args not
  validated at the worker boundary; no mute control although the helper reads mute; panel code
  hygiene (shadowed `t` in `paint`, `}const fail`); no CI, no PowerShell lint; README install path
  uses `dev load` (development plugin) instead of `orca plugin install`; manifest has no `icon`,
  `cover`, `screenshots` or `author` for Orca's plugin page; flags duplicated in `docs/flags` and
  `panel/flags`.

## Acceptance criteria

1. `orca plugin validate . --json` exits 0; `orca plugin test . --json` all pass; `orca plugin check .` ok.
2. `orca plugin install <folder>` resolves the manifest at the repository root (approval_required,
   nothing written) and `orca plugin release-entry .` prints an entry for HEAD.
3. Worker validates command args; untitled tracks localized in all 6 languages; mute toggle works
   through the helper allow-list; unit tests cover each.
4. CI workflow (Windows) runs unit tests, a helper integration smoke and PSScriptAnalyzer; the same
   commands pass locally.
5. Manifest carries icon, cover and screenshots that meet Orca's size rules; README (6 languages)
   documents `orca plugin install`, AIMP setup, update, uninstall and development from the root.
6. Real run against AIMP on this machine: state, every control, cover, AIMP closed/open, panel shots.

## Steps

- [x] Audit (A0) and plan: this file.
- [x] Move the plugin to the repository root: commit 9de77bb; validate ok, tests 17/17.
- [x] W1 function: 32e3212 merged in 716b070; command args validated (`invalid`), mute, idempotent play/pause (AIMP's pause toggles and play restarts, verified live), AIMP closing mid-request -> `aimp_closed`, helper restart without backoff after it had worked, localized Untitled and errors.
- [x] W2 technical: 3a1afa9 merged in e30a14e; `.github/workflows/ci.yml` (Windows: tests, helper smoke, parse, PSScriptAnalyzer, manifest), `test/helper.integration.test.mjs`, `install.ps1` installs/updates via `orca plugin install icaceresc/b-side`, never auto-approves, `-Dev`, `-SkipPlugin`.
- [x] W3 aesthetics: 0d649dd merged in 78f3e5d, images regenerated from the integrated panel in 93ac938; icon 256x256, cover 1600x1000, 4 screenshots 2560x1600 (3.9 MB total), README x6, `docs/flags` duplicate removed.
- [x] Integrate, panel fixes found live (f32ce36 fit 240x603 without scrolling and keep volume while muted; 29f2590 narrow header; 4d89ef5 LF endings), version 1.1.0 and CHANGELOG (50c325a). Global checks on 50c325a: `orca plugin validate` exit 0; `orca plugin test` 30/30; `orca plugin check` ok; `node --test "test/*.test.mjs"` 30/30; `release-entry` 1.1.0; `orca plugin install <folder>` exit 3 approval_required, nothing installed; PowerShell parse 0 errors; PSScriptAnalyzer Error/Warning 0 on install.ps1 and native/aimp-helper.ps1.
- [x] Real verification: AIMP 4.60.2175 Store installed (left installed); synthetic FLAC; via Orca's worker: state, tags, CD-quality badge, cover art, playPause, play, pause, stop, next, previous, seek, volume, shuffle, repeat, mute, Open AIMP from closed, AIMP closed state, invalid args refused; panel shots at 240x603 and 219 px; dev plugin unloaded, AIMP closed.
- [x] Close: plan completed, context `active_plan: none`, report to Punky.

Not verified: CI on GitHub (not pushed), Node 22 (Node 24 here), `orca plugin install icaceresc/b-side` from GitHub (works only once this branch is on the default branch or a `v1.1.0` tag exists), light theme shots, `install.ps1` end to end (it would change AIMP's settings, which the owner excluded).

Pending outside this mission (owner's decision): push the branch and open a PR, merge into `main`, tag `v1.1.0`, add the `orca-plugin` topic for onorca.dev. AIMP's playlist still lists the three synthetic test tracks (Ctrl+A, Del in AIMP removes them); keyboard control would have taken the owner's foreground, so it was not done.
