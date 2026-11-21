# Changelog

## 1.2.1

Fixes the panel's buttons, which did nothing in 1.2.0.

### Fixed

- Play/pause, previous and next did nothing. Orca's `plugin.request` refuses an input that holds
  `undefined` (`invalid_params`) before the worker sees it, and the panel sent
  `{ command, args: undefined }` for every command without arguments. Inputs now go as plain
  JSON; volume, shuffle, repeat and mute, which carry arguments, were never affected.
- The play/pause button no longer redraws its icon every second, which could swallow a click.
- Covers bigger than 700 KB were dropped: AIMP sends the cover re-encoded, often as a PNG of
  0.8 MB or more for a detailed cover. The helper now re-encodes those as JPEG (at most 1000 px).
- The helper starts from a small loader that reads `native/aimp-helper.ps1`, so it is no longer
  bound by Windows' command-line length.

### Changed

- Lyrics are easy to find: a labelled **Lyrics** button on the cover whenever a track plays,
  highlighted when the track has lyrics and dimmed, with the reason, when it has none.

## 1.2.0

Lyrics, the artist's picture and colours that come from the cover.

### Added

- Lyrics for files on your PC: from the tags (FLAC `LYRICS`/`UNSYNCEDLYRICS`, ID3 `USLT`/`SYLT`)
  or a `.lrc` beside the track. Synced lyrics light up the current line and follow the song;
  press a line to jump there. Press the lyrics button on the cover to switch views.
- The artist's picture (`artist.jpg` in the artist folder) beside the artist's name, and in
  place of the cover when a track has none; its colours then tint the panel.
- Colours from the cover: a palette (dominant and secondary colours) builds the background
  gradient and the accent, crossfading between tracks, with text contrast checked against WCAG
  AA in Orca's light and dark themes.
- Two ways to use it, in the README: a personal PC (local disk plus My Clouds) and a work PC
  (streaming only). `install.ps1` warns when Windows is signed in to a work or school account,
  so My Clouds is signed in with your personal Microsoft account.

### Notes

- Lyrics and the artist picture need files on this PC: AIMP's Remote API passes neither on, and
  streamed My Clouds tracks reach B-Side only as `cloud://` addresses. Streamed tracks keep their
  cover, details and colours.
- B-Side now reads, never writes, the playing local file's tags, a `.lrc` beside it and the
  pictures in its album and artist folders.

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
