# b-side project context

active_plan: project/plans/bside-onedrive.md

- The plugin lives at the repository root (`orca-plugin.json`), so Orca installs it with
  `orca plugin install icaceresc/b-side` and the install key is `icaceresc.b-side`.
- `install.ps1` prepares AIMP (Microsoft Store edition) and is not part of the plugin's runtime.
- The helper is the only code that touches AIMP (Remote API, allow-listed commands): since 2.2 the
  Rust `native/helper` (`bside-helper-{x64,arm64}.exe`), with `native/aimp-helper.ps1` as its
  logged fallback; both speak the same JSON lines (parity tests).
- 2.0: the panel is a music app (Playing / Library / Search). The library index lives in
  `src/library/` and is cached with the compiled helper in `%LOCALAPPDATA%\B-Side\cache`; folders
  come from the `libraryFolders` setting (`settings:own`), chosen in the panel's folder picker.
- Playback goes through AIMP's shell verbs (`BSideShell`, ProgID resolved at run time); AIMP's
  Remote API cannot load files. Orca's `plugin.request` refuses inputs holding `undefined`.
- 2.1: skins (`panel/skins.js` colours, `panel/skins.css` look and logos, `panel/fonts/` OFL),
  chosen from the logo and kept in storage `skin`; CD (cover colours) is the default. The
  worker checks connectivity only while a cloud track plays. `docs/make-assets.py --review DIR
  --skin vinyl` renders review sheets per skin.
- 2.2: helper binaries come only from CI artifacts (`native-helper`), attested by the `attest`
  job. `scripts/measure-helper.mjs` measures a helper without controlling AIMP.
- 2.3: lyrics size (A−/A+, storage `lyricsSize`); demo library `docs/demo/make-demo.py` (invented
  names, original synthetic FLAC, generated covers, original lyrics; output in ignored
  `demo-library/`); `docs/make-media.py` makes `docs/hero.webp` and the
  announcement MP4 (needs soundfile and imageio-ffmpeg). Public material never uses the owner's
  music. The Community catalog rejected 2.2.2-2.3.0 for bundled binaries; 2.3.1 has none and is
  held as `under-review: size` (see project/plans/bside-helper-download.md).
- 2.3.1: the repository tracks no binary (`native/bin/` is ignored; CI step "No binaries in the
  tree"). Releases attach `bside-helper-x64.exe`, `bside-helper-arm64.exe` and `SHA256SUMS` from
  the CI run of the tagged commit; `src/native-helper.mjs` pins their SHA-256 (`PINNED_SHA256`)
  and downloads the one for the PC from `releases/download/v{version}/` into
  `%LOCALAPPDATA%\B-Side\helper\{version}`, with backoff state in `helper\download.json`; setting
  `nativeHelper` (boolean) turns it off. A release needs builds equal to the pins: when
  `native/helper`, `native/build.mjs` or the runner's toolchain change the bytes, update
  `PINNED_SHA256` from that CI run's `SHA256SUMS` before tagging (`node native/pins.mjs DIR`;
  the tag's CI fails otherwise). A dev build in `native/bin` is used instead of the download.
- 2.3.2: the README is short (six languages, written by `docs/make-readme.py` from one template); everything detailed lives in
  `docs/guide.md` and `docs/guide.{lang}.md`, with the same `a id` anchors in every language
  (features, install, library-folders, update, privacy, troubleshooting, verify-helper, ...). Store
  images: `docs/icon.png`, `docs/cover.webp`, five `docs/shot-*.webp` at 1600x1000; the README uses
  `docs/readme-*.webp` (the same shots without their headline) and the wordless `docs/hero.webp`.
  `scripts/size-budget.mjs` (CI) keeps the tree under 5 MB, images under 3 MB, files under 1.25 MB:
  Orca's catalog held 2.3.1 (16 MB) as `under-review: size`. Catalog criteria and sources:
  `project/catalog-checklist.md`.
- 2.3.3 (cloud, tested on a 324-track FLAC OneDrive collection; see
  project/plans/onedrive-streaming-test.md): the guide's "Your music in the cloud" (anchor
  `two-ways-to-use-it`, plus `my-clouds`, `work-pc`, `work-account`) compares on-PC, Files
  On-Demand and My Clouds. Sidecars (`.lrc`, artist picture) are opened only after
  `cloudOnlyFile` (src/library/scan.mjs): Windows stat `blocks: 0` on a non-empty file means
  cloud-only or a tiny resident file, settled by the helper's folder listing (`listedAttrs`).
  AIMP's My Clouds plays `cloud://` URIs (also from an external .m3u8) but keeps no list of the
  cloud's files, so B-Side cannot browse it without its own OneDrive (Graph) access: an A3
  decision left to the owner.
- My Clouds as a library (verdict 2026-11-23, project/plans/bside-cloud-library.md): AIMP's
  `...\AIMP\MyClouds\{GUID}.mycloud` (binary XML `BXML`) is a lazy browse cache of only the folders
  opened in AIMP, and it also holds the OneDrive tokens; it cannot give B-Side a whole collection.
  `cloud://` playback from a `.m3u8` through the helper works. Full browsing needs B-Side's own
  OneDrive (Graph) access: an A3 decision left to the owner.
