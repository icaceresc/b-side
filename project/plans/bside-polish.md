# Mission: b-side polish (world-class Orca plugin)

status: active
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
- [ ] W1 function: worker/helper/panel fixes and tests.
- [ ] W2 technical: CI workflow, helper integration test, install.ps1 on `orca plugin install`, PSScriptAnalyzer.
- [ ] W3 aesthetics: icon, cover, screenshots, manifest images/author, README x6.
- [ ] Integrate W1-W3, version 1.1.0, CHANGELOG, global verification.
- [ ] Real verification: install AIMP, synthetic FLAC, dev load, drive every control, panel shots, dev unload.
- [ ] Close: plan completed, context `active_plan: none`, report to Punky.
