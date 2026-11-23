# Mission: your OneDrive inside B-Side (Graph sign-in, browse, search, play through AIMP)

status: completed
commits: authorized

Origin: Job Packet JP-BSIDE-ONEDRIVE-LOGIN (task task_e809dab59797), owner GO of 2026-11-23 (item #36).
Gate 1 (design) approved by the coordinator on 2026-11-23 with two notes: the route-B playlist is
single use, lives in B-Side's folder and is deleted once AIMP plays it or at the next start; and the
guide says that in the cloud Previous does not go back to the album's earlier tracks.
Authorized without a new GO: branch, PR, green CI, merge, tag, release, update the owner's plugin.
Credentials are the owner's alone (app registration, device-code approval). Never write, move or
delete in the owner's OneDrive; never open AIMP's `.mycloud` file (it holds AIMP's tokens).
Token handling needs an independent security review by another agent (aiews-cybersecurity).

## Design (closed at Gate 1)

- Sign-in: Microsoft identity platform device code flow, `https://login.microsoftonline.com/consumers`,
  scopes `Files.Read offline_access`, B-Side's own public client id (constant `CLIENT_ID` in
  `src/cloud/auth.mjs`, empty until the owner registers the app).
- Tokens: refresh token in Orca's `secrets:own` (OS keyring; refused when `secrets.protection` is
  `unavailable`); access token only in the worker's memory; never in storage, settings, logs, answers
  or playlists. Disconnect deletes the secret and the cloud index and images.
- Library: chosen OneDrive folders (ids in storage `onedrive`), indexed with Graph `delta` per folder
  (deltaLink kept in `%LOCALAPPDATA%\B-Side\cloud\index.json`, names/ids/sizes/audio facet only),
  merged into the same model as local folders under virtual paths `\\b-side-onedrive\{folderId}\...`
  that no file API ever opens. Covers, `artist.jpg` and `.lrc` are downloaded on demand (size cap)
  into `%LOCALAPPDATA%\B-Side\cloud\files`.
- Playback: a `.m3u8` from the chosen track to the album's end with Graph's pre-authenticated
  download URLs (route B), single use, deleted once AIMP plays it and at the next start. Route A
  (My Clouds `cloud://`) was dropped after the live test (A2, below).

## Steps

- [x] Research and Gate 1: Microsoft requires a directory for new app registrations since June 2024
      (reference-breaking-changes); the coordinator asks the owner to test a free registration
      (option 1) and to choose between an Azure free account with a card (2) or no Graph (3).
- [x] Code: auth (device code, refresh, secrets), Graph client, cloud index (delta), model merge,
      images and lyrics from sidecars, playback routes A/B, panel page "OneDrive", manifest `secrets:own`:
      commit 645ed44 (src/cloud/, panel/views/onedrive.js); `orca plugin validate .` ok.
- [x] Tests with a mock Graph, including that no token reaches logs, storage, answers or files:
      test/onedrive.test.mjs, `node --test` 215 tests, 208 pass, 0 fail, 7 skipped (as before). The
      leak test found the playing track's key carried the download URL to the panel; fixed (fileKey).
- [x] Docs x6 drafted: README template (docs/make-readme.py) and guide section `onedrive`, privacy and
      limitations in six languages (commit 645ed44); revise after the live test.
- [x] Independent security review (another agent, aiews-cybersecurity, read-only on 645ed44) applied:
      no critical or high findings; fixed and tested: (M) sign-out racing an in-flight renewal or
      sign-in wait re-stored the grant (session counter in auth.mjs, cloud.cancel() before sign-out,
      generation guard on sync and downloads); (M) Orca lets the panel read `secrets:own`, so the
      grant is sealed with AES-256-GCM under a worker-only key `%LOCALAPPDATA%\B-Side\onedrive.key`
      (vault.mjs, deleted on sign-out); (L) a stream title from a URL segment could carry the
      credential (opaque segments dropped, library title used); (L) OneDrive thumbnails now live in
      `cloud\thumbs` and go with Disconnect; (L) download addresses must be https and not Graph
      before reaching AIMP; (L) virtual paths are never safe paths for playback or images; (L) item
      ids must start with a letter or digit. `node --test`: 220 tests, 213 pass, 0 fail, 7 skipped.
      Not done (A2, recorded): no CSP meta in the panel (Orca's frame rules unknown; sealing covers
      the grant).
- [x] Catalog checklist and CHANGELOG 2.4.0, version 2.4.0: Orca's listing policy (gh api, stablyai/orca
      docs/reference/plugin-listing-policy.md, 2026-11-23) allows connecting to the user's own account
      and has no rule against network or OAuth; commit fdedd7e.
- [x] Owner registered the app (personal accounts, public client flows Yes); `CLIENT_ID`
      0594d104-aae2-468b-8bc3-1c3d0d2b6958 in src/cloud/auth.mjs. First sign-in failed twice and
      was fixed (commit 6c93f26): personal accounts approve at www.microsoft.com/link (devicelogin
      is for work and school), and Orca reaps an idle worker, which dropped the in-memory wait (now
      sealed in the secrets for 15 minutes and resumed). The owner approved code FFZNJ4E7 from his
      phone; `onedrive: signed in` 2026-11-23 08:35 (dev plugin `local.b-side` 2.4.0).
- [x] Live test on LaCreatura (dev plugin): DLC chosen, delta listing of 324 tracks in about 40 s;
      library 195 cloud albums (all with covers), 164 of 179 artists with a picture, search "nsync"
      finds artist, album and track; cover 36 KB JPEG and artist picture served. Fixes found live
      (commit 3d8964e): Graph leaves `@microsoft.graph.downloadUrl` out of a `$select`; OneDrive has
      no audio facet for these FLAC files, so "2000 - No Strings Attached" folders give year and
      album; My Clouds addresses put each folder's id before its name. Playback (commit 4cfdc64):
      Future Nostalgia from track 2 "Levitating": sound and B-Side's answer in 7.0 to 7.9 s, Next
      to "Pretty Please" in 1.9 s, Previous back to "Levitating"; Playing shows title (from B-Side's
      queue by track number: AIMP 4.60 reports no file name or title for a link), synced lyrics (76
      lines from the .lrc) and the artist picture. Disk: MyCloudsCache 95,445,599 B before and
      after, TEMP +0.2 MB (noise), AIMP package +47 KB (its playlists), B-Side +1.6 MB under
      `cloud\` (index 249 KB, sidecars and thumbnails): the played FLAC is never written to disk.
      Panel page "OneDrive" checked in Orca (shot): connected, folder with 324 tracks, Up to date.
- [x] A2 decision: no My Clouds route. A list of `cloud://` addresses in the exact AIMP format
      played a 50 Cent track AIMP had listed before and not a Dua Lipa album it had not: My Clouds
      resolves only folders opened in AIMP. Links need no My Clouds and keep nothing on disk; a
      link lasts about an hour (documented: play a long list again). Addresses AIMP reports from
      its My Clouds tab are still mapped to the library (lyrics, artist picture).
- [x] Guide figures x6 (2 to 8 s, Next about 2 s, nothing on disk), CHANGELOG (commit 4cfdc64).
- [x] AIMP left as found: Humility paused at 0:42.58, volume 64, unmuted, shuffle and repeat off.
      Left behind: playlist tabs AIMP opened for the test lists (B-Side's cloud lists and one test
      list from My Clouds); the test list file under scratch/ was removed.
- [x] Owner's installed plugin: dev plugin disconnected (token, key and `cloud\` removed) and
      unloaded; `orca plugin update icaceresc.b-side` 2.3.3 -> 2.4.0 approved (new access
      `secrets:own`); in its panel (driven by computer use) Library › ⋯ › OneDrive › Connect showed
      code F6NHMLFD and the link www.microsoft.com/link; the owner approved it; the chooser opened,
      Música › Hi-Fi Collection › Use this folder: 642 tracks, "Up to date" in 14 s (shot).
- [x] Release: PR #26 CI green (lint, native, tests x64 and arm64, attest), merged as 311ea5c; tag
      `v2.4.0` CI run 45170063682 green; release https://github.com/icaceresc/b-side/releases/tag/v2.4.0
      with `bside-helper-x64.exe`, `bside-helper-arm64.exe` and `SHA256SUMS` from that run
      (`sha256sum -c` OK, `native/pins.mjs` ok: the same bytes as 2.3.3). Branch deleted after this
      closing PR.

Pending outside this mission's DONE: the owner sets up the work PC (checklist sent to the
coordinator: install or update B-Side 2.4.0 and AIMP from the Store, Connect OneDrive with a code
at microsoft.com/link, choose only Música/Hi-Fi Collection; no My Clouds needed). On LaCreatura the
Hi-Fi Collection now shows twice (the local OneDrive folder and the cloud one) until the owner drops
one. AIMP keeps the playlist tabs the test lists opened.
