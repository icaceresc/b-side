# Mission: B-Side 2.3, lyrics size and a README that sells

status: completed
commits: authorized

Job Packet JP-BSIDE-SHOWCASE (owner GO, item #15, 2026-11-21). Branch `icaceresc/bside-2.3` from
`main` at v2.2.2. Authorized without a new GO: PRs, merge to `main` with green CI, tag and release
`v2.3.0`, `orca plugin update icaceresc.b-side` in the owner's Orca, the local clone
`C:\Dev\Music\b-side` brought to `main`. Never: force-push, history rewrites, deleting releases,
ending processes this mission did not start, the owner's music in public material.

## Decisions (A2, the Worker's)

- Lyrics size: A− and A+ in the lyrics box's lower-right corner (over the faded edge, so they
  never cover the current line), four steps of each skin's own size (`--ls` scales every lyric
  font size), kept in the plugin's storage and localStorage, re-centring the current line.
- Demo library (`docs/demo/make-demo.py`): invented artists and albums, original synthetic music
  written by the script (pads, bass, arpeggios, drums; numpy) into FLAC with libsndfile, covers
  drawn by `docs/make-assets.py`, original lyrics as `.lrc`. Generated, not committed (about
  110 MB, in a minute): `demo-library/` is ignored by git. The screenshot harness uses the same
  names, lyrics and the files' real format (e.g. 593 kbps, 96 kHz/24 bits).
- Names: an independent review found that several first-draft demo names were real artists or
  releases (Sunset Arcade, Harbor Lights, Paper Planets, Lumen Drift, Amber Vale, The Quiet
  Hours; albums such as Afterglow, Parallax). Every demo artist and album was renamed to a
  distinctive invented name before any public material was published.
- Animations (`docs/make-media.py`): frames of the real panel in the harness with time scrubbed
  per frame (animations paused at t, playback advanced, the clock frozen), composed with Pillow:
  `docs/hero.webp` (three skins playing, pausing, playing), `docs/tour-skins.webp` (the logo
  menu and the skin changing), and the announcement MP4 (1920x1080, about 33 s, the demo track's
  original audio, paused where the video pauses), encoded with the ffmpeg of `imageio-ffmpeg` in
  a temporary venv (a development tool only, never shipped).
- Cloud streaming is presented as beta, in testing, in the README x6, the plugin page and the
  video; its setup guide is unchanged. Hero and video show only the local demo library.
- Tooling: soundfile, imageio-ffmpeg, numpy and Pillow in a venv under `scratch/`.

## Evidence so far

- Live in the owner's Orca (dev plugin `local.b-side`, its own library setting pointed at the
  demo folder; the installed plugin's setting untouched): AIMP played the demo FLACs and the
  panel showed `FLAC | 16 bits | 44.1 kHz | 593 kbps | Stereo` and `24 bits | 96 kHz | 842 kbps`,
  with synced lyrics from the `.lrc`. Then the dev library was pointed back at the Hi-Fi
  Collection (the shared index cache holds the owner's library again: 725 files), AIMP was put
  back as found (I Luv U, paused at 2:59, volume 100, not muted) and the dev plugin unloaded.
- Independent README review: a Codex worker (read-only) on the six READMEs, the plugin page and
  every image; its findings applied (names, cloud framing, install text, format and bit depth,
  skin menu in the tour, helper labels, privacy network paragraph, plugin description).

## Steps

- [x] Lyrics size control, three skins, persistence, tests (`test/panel-core.test.mjs`,
      `test/skins.test.mjs`).
- [x] Demo library generator; harness on its real values; live check in Orca.
- [x] Hero, skins tour, tour stills, announcement video; README x6 with the tour; cloud as beta.
- [x] Independent README review and its fixes.
- [x] Regenerate the media with the renamed demo library (no exact match found for the main new
      names in a web search); checks: `node --test` 179/179, `orca plugin validate`, `check` and
      `test` ok; store images 6.9 MB of 8; PR #16 (CI green: x64, arm64, native) merged as
      0d5787d, `main` CI green.
- [x] Release `v2.3.0` with `bside-helper-x64.exe`, `bside-helper-arm64.exe`, `SHA256SUMS`
      (`sha256sum -c` OK) and `b-side-2.3.0-demo.mp4` (1920x1080, 33 s, 2.0 MB, AAC audio of the
      demo track). Hero `docs/hero.webp` 1.3 MB, `docs/tour-skins.webp` 0.6 MB.
- [x] `orca plugin update icaceresc.b-side` 2.2.2 -> 2.3.0, approval kept; the installed panel
      shows the owner's collection (I Luv U, FLAC | 16 bits | 44.1 kHz | 994 kbps | Stereo); the
      native helper runs from the 2.3.0 install (hash equal to `SHA256SUMS`, 9 MB, no PowerShell
      helper); music untouched (725 files, none changed); `C:\Dev\Music-side` fast-forwarded
      to `main`.
- [x] Catalog status recorded below; gallery copies in the Companion's `bside-showcase` folder;
      branches cleaned; plan completed.

Outside this mission and pending (owner or Companion): the Community catalog
(stablyai/orca-community-plugins `status.json`) marks `icaceresc/b-side` as **rejected** since
`v2.2.2` for "bundles binary files" (`native/bin/bside-helper-*.exe`, from 2.2.0), so B-Side is not
in `orca-catalog.json` and 2.3.0 will likely be rejected for the same reason. Fixing it means
deciding how the native helper is distributed (for example built or downloaded at install, or
the catalog's own policy for binaries): an A3 decision, not taken here. Bardo's announcement and
the owner's OK on it are also pending; the MP4 is attached to the release.
