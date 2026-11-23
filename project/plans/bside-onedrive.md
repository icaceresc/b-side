# Mission: your OneDrive inside B-Side (Graph sign-in, browse, search, play through AIMP)

status: active
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
  merged into the same model as local folders under virtual paths `\\b-side-onedrive\<folder id>\...`
  that no file API ever opens. Covers, `artist.jpg` and `.lrc` are downloaded on demand (size cap)
  into `%LOCALAPPDATA%\B-Side\cloud\files`.
- Playback: a `.m3u8` from the chosen track to the album's end. Route A: My Clouds `cloud://` URIs
  (`cloud://{storage}/Root/<rootId>/<name>/<id>/.../<fileId>.<ext>`, format read from AIMP's saved
  lists on 2026-11-23), once the storage GUID is learnt from a `cloud://` track AIMP reports and its
  root id matches the Graph drive root. Route B otherwise: Graph's pre-authenticated download URLs,
  in a single-use list deleted once AIMP plays it and at the next start.

## Steps

- [x] Research and Gate 1: Microsoft requires a directory for new app registrations since June 2024
      (reference-breaking-changes); the coordinator asks the owner to test a free registration
      (option 1) and to choose between an Azure free account with a card (2) or no Graph (3).
- [ ] Code: auth (device code, refresh, secrets), Graph client, cloud index (delta), model merge,
      images and lyrics from sidecars, playback routes A/B, panel page "OneDrive", manifest `secrets:own`.
- [ ] Tests with a mock Graph, including that no token reaches logs, storage, answers or files.
- [ ] Independent security review (another agent, aiews-cybersecurity) applied.
- [ ] Docs: README x6 (template), guide x6 (OneDrive section, privacy, revoke), catalog checklist.
- [ ] Owner registers the app; `CLIENT_ID` set; owner signs in with the code on his Orca.
- [ ] Live test: DLC browsable and searchable with covers and artist photo; an album plays in AIMP
      from the chosen track; disk growth measured (only the played track plus small images).
- [ ] Release: PR, green CI, merge, tag, release, owner's plugin updated; repo only `main`.
