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

## Phase 2: lyrics, artist image, cover palette, two usage modes (owner A3, 2026-11-20)

Authorized by the owner through Punky: show lyrics (embedded FLAC LYRICS/UNSYNCEDLYRICS, ID3
USLT/SYLT, or a sibling .lrc; highlight the current line when synced); use the artist image
(artist.jpg in the artist folder) where it helps; a cover palette background at the level of
Symfonium / USB Audio Player Pro (dominant + secondary colors, adaptive gradient, smooth
transitions, WCAG AA text contrast in light and dark); document two usage modes (personal:
local disk + cloud; work: My Clouds streaming only, My Clouds signed in with the personal
OneDrive account). No new dependencies (palette by hand). Test with synthetic FLAC only.
Delegation to Orca Claude workers in child worktrees, integration and AIMP/dev-load testing as in
phase 1.

Feasibility (verified 2026-11-20 on AIMP 4.60.2175):
- AIMP's Remote API (`AIMP2_RemoteInfo` shared memory, TAIMPRemoteFileInfo) exposes album,
  artist, date, fileName, genre, title and technical fields only: no lyrics, no artist image.
- Local tracks report a real file path (an absolute Windows path to the .flac), so the worker can read
  the playing file's tags, a sibling .lrc and the artist folder, read-only.
- My Clouds tracks are `cloud://` URIs (string in `aimp_myClouds.dll`); the plugin reads tags and
  lyrics inside AIMP (`apiLyrics`, `MyClouds\AllowToGetFileTags`) but nothing reaches the Remote
  API. Streaming tracks therefore get cover (AIMP's album-art command) but no lyrics or artist
  image; reported to the owner with alternatives.

Acceptance:
7. Lyrics for local FLAC (tag plain and LRC), MP3 ID3 (USLT, SYLT; unit-tested) and sidecar .lrc;
   synced lines highlighted live in the panel against real AIMP; clear absence for cloud tracks.
8. Artist image from the artist folder for local tracks, used in the panel; absent gracefully.
9. Palette: hand-written extraction, gradient background, smooth transitions, computed contrast
   >= 4.5:1 for body text in light and dark (unit-tested).
10. README x6 documents both modes and the work-account warning; installer warns when Windows is
   signed in with a work or school account.

- [x] W4 lyrics and artist image: 8956b85 merged in fb64c95; `src/lyrics.mjs` (FLAC Vorbis comments, ID3v2.3/2.4 USLT/SYLT, sidecar .lrc, LRC parser), `src/artist.mjs`, handlers `player.lyrics`/`player.artist` (path only from AIMP, read-only, size caps), lyrics view and artist avatar/fallback in the panel; 28 new tests.
- [x] W5 cover palette: 6d55bbc + 31247c7 merged; `panel/palette.js` (median cut in OKLab + k-means, WCAG contrast fitting in light and dark), gradient backdrop with crossfading layers, `@property` transitions, reduced motion; 13 tests.
- [x] W6 usage modes: 416458c merged in 6ed51ef; "Two ways to use it" and the work-account note in README x6 (AIMP's own My Clouds menu strings), `install.ps1` read-only work/school account warning (8 isolated tests, PSScriptAnalyzer 0).
- [x] Integrate W4-W6, regenerate images, version 1.2.0 (85734fe): 415588e colours from the artist image when it replaces the cover; 31a70a1 lyrics screenshot (5 plugin-page screenshots, 4.8 MB) and README galleries. Global checks on 85734fe: `orca plugin test` 71/71, `node --test` 71/71, validate exit 0, check ok, release-entry 1.2.0, PowerShell parse 0 errors. Live in Orca against AIMP 4.60 with synthetic FLAC: `player.lyrics` gave sidecar .lrc (synced, 6 lines), tag LRC (synced, 12) and tag plain (6); `player.artist` returned artist.jpg; the lyrics view highlighted the line timed [00:16.00] at 0:16; artist image as cover fallback with its own palette; no panel errors in the logs. Dev plugin unloaded, AIMP closed.
- [x] Close phase 2: plan completed, context `active_plan: none`, report to Punky.

Phase 2 not verified: click-to-seek on a lyric line and smooth scrolling in live Orca (Orca's window cannot be driven in the background; covered by code and headless renders), light-theme rendering in live Orca (headless renders and tests only), ID3/MP3 lyrics against AIMP (unit tests only), real My Clouds tracks (no account). AIMP's playlist lists the deleted synthetic test files (Ctrl+A, Del in AIMP clears them). Option B (a native AIMP plugin to export lyrics for streamed tracks) is a separate project run by the coordinator.
