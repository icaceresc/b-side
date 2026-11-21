# Changelog

## 1.1.0

Installs the way Orca plugins do, and holds up better against a real AIMP.

### Added

- `orca plugin install icaceresc/b-side` works: the plugin now lives at the repository root, so
  Orca installs it from GitHub and `orca plugin update icaceresc.b-side` keeps it current.
- Mute: press the speaker icon; moving the volume slider unmutes. While muted the panel keeps
  showing the volume AIMP will return to.
- Orca plugin page: icon, cover and four screenshots (`docs/`), regenerated from the real panel
  with `python docs/make-assets.py`.
- CI on Windows: unit tests, a smoke test of the real helper, PowerShell parse check,
  PSScriptAnalyzer and a manifest check.
- `install.ps1 -SkipPlugin` (only prepare AIMP) and `-Dev` (load the local folder for
  development).

### Changed

- `install.ps1` installs or updates the plugin from GitHub instead of loading the clone as a
  development plugin, and prints Orca's approve command instead of approving for you.
- The panel fits Orca's default sidebar (240 x 600) without scrolling: the cover gives way to the
  controls, long titles clamp to two lines, and a narrow header keeps the AIMP status readable.

### Fixed

- `play` no longer restarts a playing track and `pause` no longer resumes a paused one (AIMP's own
  commands do both); the worker now goes by AIMP's state.
- AIMP closing during a request reports "AIMP is closed" instead of "AIMP did not answer".
- A helper that had worked and then stopped restarts on the next request instead of waiting 10 s.
- Bad command arguments (a volume that is not a number, a negative position) are refused by the
  worker with a clear message instead of reaching AIMP.
- An untitled track shows "Untitled" in the panel's language instead of always in Spanish, and
  every error message is localized.

## 1.0.0

First release: AIMP's now playing, real format, controls and states in Orca's sidebar, in six
languages.
