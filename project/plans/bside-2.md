# Mission: B-Side 2.0, a Symfonium inside Orca

status: completed
commits: authorized

Branch `icaceresc/bside-2` from `main` (1.2.0 merged, tagged, released). Owner's widened
authorization (2026-11-21, via Punky): push, PRs, merge to `main` with green CI and live
verification, tags and releases (1.2.1 first, then 2.0); after each release run
`orca plugin update icaceresc.b-side` in the owner's Orca, approve the new fingerprint and check
it works with the owner's collection. Dependencies and tools allowed when justified here
(permissive licence, maintained, no telemetry). Workers, agents and effort at the Orchestrator's
choice. Unchanged: AIMP is the engine; the owner's music is read-only; no accounts or
credentials; no force-push or history rewrite; no deleting releases. A3 (ask Punky first):
another engine, a licence change, anything that exposes the owner's data.

Owner's collection: `C:\Users\isaia\OneDrive\Música\Hi-Fi Collection` (428 FLAC, 260 `.lrc`,
`cover.jpg` per album, one `artist.jpg`; Artist/Album folders). Read-only.

## 1.2.1 hotfix (verified)

- Root cause of "no button works except volume": Orca's `plugin.request` refuses an input with an
  `undefined` property (`invalid_params input: Invalid input`), verified from the panel in Orca
  1.4.265 with three probes; the panel sent `{ command, args: undefined }` for playPause, next,
  previous and stop. Volume/shuffle/repeat/mute carry args and worked. Fix: plain JSON inputs.
- `aimp_timeout` in the owner's log: the helper's 1 s SendMessageTimeout while AIMP loaded 428
  files (transient), and the worker-side timer during helper cold starts under 100 % CPU.
- Covers over 700 KB were dropped (AIMP sends PNGs of 0.8 MB+); re-encoded to JPEG in the helper.
- Lyrics: a labelled button on the cover whenever a track plays.

## Steps

- [x] Hotfix 1.2.1 on the branch: 2fc5ce8; tests 75/75, validate, check, PSScriptAnalyzer 0; live in the owner's Orca (dev panel): Play, Pause, Previous, Next change AIMP's state; real `.lrc` lyrics (55 synced lines) and the Currents cover now shown.
- [x] Publish 1.2.1: PR #2 (CI green on push and pull_request), merged as f468fea, annotated tag `v1.2.1`, release https://github.com/icaceresc/b-side/releases/tag/v1.2.1; `orca plugin update icaceresc.b-side` 1.2.0 -> 1.2.1 (approval kept: no new access); with the INSTALLED plugin in the owner's Orca, Next, Pause, Play and Previous changed AIMP's state (accessibility clicks).
- [x] 2.0 design (contract in the worker specs): the panel becomes a responsive app (phone-like at 240-420 px with Now Playing | Library | Search tabs and a mini-player, two panes when wide; a full-size editor tab via customEditors + newFiles only if Orca supports it cleanly); `library.*` worker handlers with opaque ids (paths stay in the worker); `libraryFolders` setting (`settings:own`), default the Windows Music known folder; index cached in `%LOCALAPPDATA%\B-Side\cache`; cloud-only files (RECALL_ON_DATA_ACCESS / RECALL_ON_OPEN / OFFLINE) indexed from names only and never opened; playback through `.m3u8` + `ShellExecuteEx` with AIMP's ProgID resolved at run time, in the helper; compiled-helper cache for faster starts. No new dependencies planned.
- [x] W7 library index (fb56507, merged a110b95), W8 playback + helper cache (a75d68e/77d7249, merged a0b5478), W9 panel app (0ea2f90, merged): 138/138 tests on the merged tree. Live in the owner's Orca (dev): library 428 tracks / 25 artists / 36 albums from Hi-Fi Collection (tags read in 1.75 s), Albums and Artists views with real covers, library.search, player.playAlbum from track 3 of Currents played "03 The Moment" with the rest queued (Next -> track 4), player.state carries trackId/albumId.
- [x] First-run folders (54e1931): the Windows Music folder was empty on the owner's PC and Orca's worker environment has no OneDrive variables; library.suggestFolders (Music folder + each OneDrive music folder from HKCU OneDrive Accounts + big subfolders, with counts) and library.setFolders (validated, saves libraryFolders, rescans); 141/141 tests.
- [x] W9 follow-up: folder picker in the Library tab (3607667, merged d76f5f5), 143/143 tests, 32 headless CDP checks of the flow.
- [x] W10: README x6 for 2.0 (merged 16135fc); W9 2.0 store and README images (merged 9755ea7, manifest images 6.1 MB); 1.0-era captures removed; CHANGELOG 2.0.0 (ffab71e); version 2.0.0 (cda511b): 143/143 tests, validate, check, PSScriptAnalyzer 0.
- [x] Cleaned the 12 test playlists W8 left in AIMP: closed AIMP through the Remote API (it saves on exit), deleted only PLS/B-Side*.aimppl4 and Marker*.aimppl4, reopened AIMP; it resumed the same track; Default and Hi-Fi Collection untouched.
- [x] 2.0 integrated and verified live (dev, then installed): see the next step.
- [x] Work mode: cloud-only files (RECALL_ON_DATA_ACCESS / RECALL_ON_OPEN / OFFLINE) are listed from names and never opened (W7: real attrib +O files listed but never read, instrumented; helper refuses to thumbnail them); documented in README x6 and CHANGELOG. Real OneDrive placeholders were not created (would touch the owner's account).
- [x] Publish 2.0: PR #3 (CI green on push and pull_request), merged 1951791, annotated tag v2.0.0, release https://github.com/icaceresc/b-side/releases/tag/v2.0.0; orca plugin update icaceresc.b-side 1.2.1 -> 2.0.0 approved (new access: settings:own, as expected). Verified with the INSTALLED 2.0 in the owner's Orca: Now Playing showed the synced .lrc lyrics of the playing Tame Impala track; the first-run picker listed Música 1291, Hi-Fi Collection 428, Hi-Fi Collection - DLC 324, Learn 317, Techno 152, ABLETON 51; choosing Hi-Fi Collection indexed 428 tracks in 680 ms; Albums grid with real covers; opening Discovery and pressing Digital Love made AIMP play it. Dev plugin unloaded.

Not verified live: real OneDrive Files On-Demand placeholders; a classic (non-Store) AIMP; a non-default AIMP action for files opened from other apps; Orca's light theme in the live panel (headless renders and contrast tests only).

## 2.0.1 follow-up (2026-11-21, same authorization)

status: completed
- [x] Play from a track loads the whole album/list and starts there (Previous reaches earlier tracks): AIMP's Remote API has no playlist index, and a stopped AIMP's Next moves through the playlist shown in its window (live: a stop-based attempt landed in "Hi-Fi Collection"), so B-Side opens the first track, appends the rest, and steps with verified Next while playing and muted (shuffle off), then seeks to 0 and restores mute/shuffle; fallback to the 2.0 behaviour if AIMP leaves the list. Live (dev, owner's collection): Discovery from track 7 played "Superheroes" at 0.5 s, Previous -> 6, 5, Next -> 6, ~2.1 s; last track (14) ~2.8 s; 空中キャンプ from track 4 with shuffle on, shuffle restored. Tests 145/145.
- [x] Folder cards: "Name · OneDrive" (or This PC / drive), full path only in the tooltip; live in the owner's Orca: "Hi-Fi Collection · OneDrive, 428 tracks", no paths on screen.
- [x] README x6 and CHANGELOG 2.0.1; version 2.0.1.
