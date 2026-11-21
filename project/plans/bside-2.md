# Mission: B-Side 2.0, a Symfonium inside Orca

status: active
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
- [ ] W7 library index, W8 playback + helper cache, W9 interface (workers bside-w7/w8/w9).
- [ ] 2.0 build (workers), integrate, live verification with the owner's collection.
- [ ] Work mode: cloud-only OneDrive files (RECALL_ON_DATA_ACCESS / OFFLINE) never read; documented.
- [ ] Publish 2.0 and update the owner's install; close the mission.
