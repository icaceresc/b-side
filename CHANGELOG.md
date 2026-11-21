# Changelog

## 2.2.0

### Changed

- **A native helper.** B-Side now talks to AIMP through a small native program
  (`native/bin/bside-helper-x64.exe`, or `-arm64.exe` on ARM PCs; about 0.5 MB, written in Rust)
  instead of Windows PowerShell. On the PC it was measured on, the helper uses about 9 MB of
  memory instead of about 90 (and no console host beside it), starts in under 30 ms instead of
  over a second, and uses a tenth of the CPU. It needs nothing installed. Everything else works
  as before.
- If the native helper cannot start, for example because an antivirus or a work PC's policy
  blocks it, B-Side uses the PowerShell helper as before and says so in its log
  (`orca plugin logs icaceresc.b-side`).
- Covers in WebP now get thumbnails in the library (Windows' own image codecs replace GDI+).

### Trust

- The helper is built from the code in `native/helper` by GitHub Actions, tested there on x64 and
  ARM64, and only then given a signed build provenance attestation. Each release lists the
  binaries' SHA-256 in `SHA256SUMS`. [Check the helper](README.md#verify-helper) explains how to
  compare the checksum, check the attestation with `gh attestation verify`, or build it yourself.

## 2.1.2

### Changed

- The format is one sober line instead of badges: `FLAC | 16 bits | 44.1 kHz | 738 kbps | Stereo`
  (or MP3, Mono…), with thin separators in each skin's type; what is unknown is left out. The bit
  depth of the playing track now comes from the library (AIMP does not report it). No more
  "CD quality" label.
- Bigger logos in the three skins; the Vinyl tonearm is easy to see on and off the record.
- Vinyl leans into the valve amplifier: black tolex, cream piping, a brushed gold control panel for
  the tabs, the sleeve in a walnut frame, a knurled gold play knob whose pointer turns up when it
  plays, lyrics on stitched leather.
- CD takes its accent from the cover, like its background: play button, progress, volume, the tab
  in use, focus and the current lyric. A cover without vivid colour (black and white, greys) gets a
  neutral accent of its own tone, never the old fixed orange; checked for WCAG AA on 41 real covers
  in Orca's light and dark themes.
- Lyrics have one control in every skin, at the end of the volume row, filled while they show.

### Fixed

- The play/pause icon sat 9 to 11 px above the middle of its button (a style meant for album pages
  reached it); it is centred both ways now.
- The CD lyrics box went from grey to violet; it takes the cover's tint now.
- Vinyl's small capitals no longer change what screen readers say ("Playing", not "playing").
- Long genre names no longer break mid-word in Vinyl and Cassette; Cassette's empty-state titles
  are easier to read; the genre icon and the notices take each skin's colours; loading
  placeholders take each skin's shape; a wrapped format line never starts with a separator.
- Opening the panel no longer flashes coral while the colours settle: nothing animates on the
  first paint, and the stylesheet's own accent is neutral.

## 2.1.1

### Fixed

- While the library loads, its placeholder grid no longer prints stray `">` characters between
  the placeholder cards (a markup slip from 2.0, visible on slow starts).

## 2.1.0

### Added

- **Skins.** Press the logo in the top-left corner and pick one; B-Side remembers it.
  - **CD** (the default): today's B-Side, refined. Manrope type, glass bars, the colours of the
    playing cover. The logo is a disc showing its reflective side, iridescence turning while
    AIMP plays.
  - **Vinyl**: a listening room in brass, walnut and ivory. Cormorant and EB Garamond, small
    capitals, gold hairlines, the cover framed like a print. The logo is a turntable: the record
    turns at 33⅓ and the tonearm lowers onto it when you press play, and lifts off on pause.
  - **Cassette**: 8-bit vaporwave. Pixel type (Pixelify Sans, Press Start 2P), neon on violet,
    hard pixel shadows, an LED progress meter. The logo is a pixel tape whose reels turn.
- Each skin restyles the whole panel (Playing, Library, Search, lyrics, the mini-player and the
  quality badges) in Orca's light and dark themes, with text that keeps WCAG AA contrast.
- The fonts are embedded (SIL Open Font License, licences in `panel/fonts/`); nothing is loaded
  from the network.

### Fixed

- The play icon is centred optically in its button.
- The *Offline* banner no longer shows while a file from your PC plays: it is only for tracks
  streamed from the cloud. B-Side now checks the connection only while a stream plays, and a single
  failed check (a Wi-Fi blip) no longer counts as offline; two in a row do.

### Notes

- Animations run only while AIMP plays and the panel is visible, and stop with *Reduce motion*
  (the logo still shows playing with a halo, a light or the tonearm on the record).

## 2.0.1

### Changed

- Playing from a track loads the whole album or list and starts at that track, as Symfonium does,
  so Previous reaches the tracks before it. AIMP cannot open a playlist at an entry, so B-Side
  opens the first track, adds the rest and moves AIMP to your track with Next while AIMP is muted
  (shuffle off for that moment), then puts mute and shuffle back; about two seconds. **Play next**
  keeps the tracks before the playing one too.
- Folder cards show a short name such as "Hi-Fi Collection · OneDrive"; the full path is only in
  the tooltip, so folder paths do not show on screen or in screenshots.

## 2.0.0

Your music library, inside Orca: browse, search and play your collection from the panel, with AIMP
playing in the background.

### Added

- Library: Artists, Albums, Tracks and Genres, with covers and artist pictures; artist and album
  pages take their colours from the cover. Instant search, accent- and case-insensitive (it finds
  "Rosalía" when you type "rosalia"), including Japanese and Chinese titles.
- Play an album, play from any track, or add tracks to play next or at the end; AIMP plays them.
- The panel is a small music app: **Playing** (cover, lyrics shown when the track has them,
  controls), **Library** and **Search**, with a mini-player; two panes when the sidebar is wide.
- Library folders: pick them in the panel the first time (B-Side suggests your Music folder and
  your OneDrive's music folders with how many tracks each holds) or set them in Orca's Settings ›
  Plugins › B-Side › Library folders. This uses Orca's plugin settings, a new permission, so the
  update from 1.2 asks for approval once.
- Files On-Demand: files that are only in OneDrive's cloud are listed from their folder and file
  names and never opened by B-Side, so nothing is downloaded just by browsing.

### Changed

- The index (tags, covers, lyrics markers) is read once and kept in `%LOCALAPPDATA%\B-Side\cache`;
  later starts are instant and rescans only read changed files. On a 428-FLAC collection the first
  scan takes about 2 s.
- The helper's compiled code is cached there too, so B-Side starts faster after Orca has put its
  worker to sleep.

### Notes

- Playing from B-Side opens the first track in AIMP (AIMP clears its *Default* playlist and plays
  it) and adds the rest after it. This follows AIMP's default action for files opened from other
  apps; see the README if you changed it.
- B-Side reads your music folders and never writes to them.

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
