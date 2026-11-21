# b-side project context

active_plan: none

- The plugin lives at the repository root (`orca-plugin.json`), so Orca installs it with
  `orca plugin install icaceresc/b-side` and the install key is `icaceresc.b-side`.
- `install.ps1` prepares AIMP (Microsoft Store edition) and is not part of the plugin's runtime.
- The helper is the only code that touches AIMP (Remote API, allow-listed commands): since 2.2 the
  Rust `native/helper`, shipped as `native/bin/bside-helper-{x64,arm64}.exe`, with
  `native/aimp-helper.ps1` as its logged fallback; both speak the same JSON lines (parity tests).
- 2.0: the panel is a music app (Playing / Library / Search). The library index lives in
  `src/library/` and is cached with the compiled helper in `%LOCALAPPDATA%\B-Side\cache`; folders
  come from the `libraryFolders` setting (`settings:own`), chosen in the panel's folder picker.
- Playback goes through AIMP's shell verbs (`BSideShell`, ProgID resolved at run time); AIMP's
  Remote API cannot load files. Orca's `plugin.request` refuses inputs holding `undefined`.
- 2.1: skins (`panel/skins.js` colours, `panel/skins.css` look and logos, `panel/fonts/` OFL),
  chosen from the logo and kept in storage `skin`; CD (cover colours) is the default. The
  worker checks connectivity only while a cloud track plays. `docs/make-assets.py --review DIR
  --skin vinyl` renders review sheets per skin.
- 2.2: binaries in `native/bin` come only from CI artifacts (`native-helper`) of a commit with the
  same `native/helper`, `native/build.mjs` and CI; `native/verify.mjs` (job `binaries`) checks
  them against their attestation, so a change to those files needs the new run's binaries
  committed. `scripts/measure-helper.mjs` measures a helper without controlling AIMP.
