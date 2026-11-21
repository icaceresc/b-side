# Mission: B-Side 2.3, lyrics size and a README that sells

status: active
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
- [ ] Regenerate the media with the renamed demo library; checks; PR; CI; merge.
- [ ] Tag and release `v2.3.0` with the helper binaries, `SHA256SUMS` and the MP4.
- [ ] `orca plugin update` and live check with the owner's collection; local clone on `main`.
- [ ] Catalog status; gallery copies; cleanup (branches, scratch); plan completed.
