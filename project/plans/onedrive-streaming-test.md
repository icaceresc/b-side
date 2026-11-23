# Mission: B-Side with the collection in the cloud (OneDrive), 2.3.3

status: active
commits: authorized

Origin: roadmap item 23; Job Packet JP-BSIDE-CLOUD (task task_6d3f9b093066, GO of 2026-11-23).
Goal: the owner listens to their OneDrive collection from B-Side on their work PC without copying it
to disk. Test collection: `OneDrive\Música\Hi-Fi Collection - DLC` (1045 files: 324 FLAC tracks,
covers, .lrc; 8.1 GB). Branch `icaceresc/bside-cloud` from `main` at 644d396.

Owner decisions: My Clouds (path B) is the main path for the work PC; path A (Files On-Demand) is
only checked for indexing without downloads. Authorized: set the DLC folder *only in the cloud*
(`attrib +U -P`, that folder only) and leave it so; change My Clouds settings to test and leave
them as `install.ps1` sets them; use AIMP silently (muted), then leave it paused with its original
volume and unmuted; small fixes with the usual authority (branch, PR, green CI, merge, tag,
release, update the owner's plugin), keeping the size budget and a tree without binaries. The
owner signs in in person; never touch their account or credentials. Not in scope: moving, editing or
deleting music; third-party catalogs.

## Findings (verified, 2026-11-23)

- DLC: all 1398 items in sync (cfapi InSyncState) before; `attrib +U -P` freed 8.1 GB in about
  15 s; B-Side indexed it in 90 ms (324 tracks, 195 albums, 154 artists), 0 files read, 0
  downloaded; search and albums work, no covers (cloud-only images are never opened).
- My Clouds sign-in works with email, **password** and an authenticator code; a passkey or a phone
  approval does not work in AIMP's old browser window.
- My Clouds playback: 10.4 s to sound the first time, 6.4 s for another track; B-Side shows
  cover, title, artist, album, year, FLAC/44.1 kHz/kbps and the Cloud tag; play, pause, seek and
  previous work from the panel; no lyrics or artist picture (by design). AIMP caches each played
  track whole in `%TEMP%\MyCloudsCache` (46 and 23.6 MB) even with streaming access on.
- AIMP reports `cloud://{storage}/Root/<id>/Música/<id>/.../<fileId>.flac`, and plays such a URI
  from an external `.m3u8` (1.2 s). AIMP keeps no local list of the cloud's files (My Clouds lists
  one folder at a time; "Add to playlist" and smart playlists on a folder are not recursive), so
  B-Side cannot browse My Clouds without its own OneDrive access (Microsoft Graph sign-in, an app
  registration, token storage): an A3 decision for the owner, not taken.
- Bug fixed in 2.3.3: while a track played, B-Side read a sidecar `.lrc` and the artist picture
  without checking that they were cloud-only, so OneDrive downloaded them (the guide said such
  files are never opened). Node's stat on Windows reports `blocks: 0` for a placeholder without
  downloading it; small local files (under ~700 B) too, so then the helper's folder listing gives
  the attributes.
- Not ours, noted for the owner: AIMP's own "Hi-Fi Collection" playlist holds paths from before the
  album folders got their year prefix (`< not found >` entries).

## Steps

- [x] Repository and AIMP state recorded (paused, volume 64, unmuted, "Default" playlist with
      Gorillaz' The Now Now at 0:42); DLC verified in sync.
- [x] Path A: DLC set only in the cloud and indexed by B-Side without downloads (figures above).
- [x] Path B: the owner signed in (storage "OneDrive" added); live tests muted (figures above);
      browsing My Clouds from B-Side investigated (A3, above).
- [x] Fix: cloud-only sidecars are never opened (`src/library/scan.mjs` `cloudOnlyFile`,
      `listedAttrs`; `src/lyrics.mjs`, `src/artist.mjs`, `src/player.mjs`); tests added; checked
      live on the DLC (artist.jpg and .lrc skipped, a local .lrc still read, 0 files downloaded).
- [x] Docs: guide x6 "Your music in the cloud" (table, figures, My Clouds sign-in, cache, work PC
      recipe), limitations x6, README x6 link label without "beta", `install.ps1` comment,
      CHANGELOG 2.3.3, version 2.3.3. `node --test` 187 pass (7 skipped without a native build),
      helper tests with the installed native helper 10/10, size budget 3.06 MB of 5.
- [ ] PR to `main`, CI green, merge; tag `v2.3.3`; release with the CI's helper builds and
      `SHA256SUMS`; `orca plugin update icaceresc.b-side` on the owner's Orca.
- [ ] Clean up: AIMP test playlists removed, "Default" back to The Now Now paused at 0:42, volume 64,
      unmuted; My Clouds settings as `install.ps1` sets them; B-Side panel back where it was; only
      `main` in the repository; local clone on `main`.
- [ ] Plan completed, context `active_plan: none`, report to the coordinator.
