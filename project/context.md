# b-side project context

active_plan: project/plans/bside-helper-download.md

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
  `demo-library/`); `docs/make-media.py` makes `docs/hero.webp`, `docs/tour-skins.webp` and the
  announcement MP4 (needs soundfile and imageio-ffmpeg). Public material never uses the owner's
  music. The Community catalog rejects the repo since 2.2.2 for bundled binaries (see the plan).
- 2.3.1: the repository tracks no binary (`native/bin/` is ignored; CI step "No binaries in the
  tree"). Releases attach `bside-helper-x64.exe`, `bside-helper-arm64.exe` and `SHA256SUMS` from
  the CI run of the tagged commit; `src/native-helper.mjs` pins their SHA-256 (`PINNED_SHA256`)
  and downloads the one for the PC from `releases/download/v{version}/` into
  `%LOCALAPPDATA%\B-Side\helper\{version}`, with backoff state in `helper\download.json`; setting
  `nativeHelper` (boolean) turns it off. A release needs builds equal to the pins: when
  `native/helper`, `native/build.mjs` or the runner's toolchain change the bytes, update
  `PINNED_SHA256` from that CI run's `SHA256SUMS` before tagging (`node native/pins.mjs DIR`;
  the tag's CI fails otherwise). A dev build in `native/bin` is used instead of the download.
