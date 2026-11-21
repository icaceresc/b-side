# Mission: B-Side 2.1, skins Vinyl / Cassette / CD with a live logo

status: active
commits: authorized

Job Packet JP-BSIDE-SKINS (owner GO, item #15, 2026-11-21). Branch `icaceresc/bside-skins` from
`main` at v2.0.1 (`ee48500`). Authorized without a new GO: branch, commits, push, PR, merge with
green CI and live verification, tag and release `v2.1.0`, `orca plugin update icaceresc.b-side`
in the owner's Orca (approving a new fingerprint if it asks), dev-loading the plugin and using
AIMP for tests. No Gate 1: design decisions are the Worker's, recorded here. Never: force-push,
history rewrites, deleting releases, AIMP settings beyond testing, the owner's music (read only).

## Objective

Three skins picked from the top-left logo (Vinyl "old money", Cassette 8-bit vaporwave, CD modern
and cover-adaptive, the default), each a complete theme of the whole panel, with a live logo
that plays and pauses with AIMP; plus the play icon's optical centring and the false "Offline".

## Audit (2026-11-21)

- Play icon: `#i-play`'s triangle spans x 8 to 20.5 in a 24 box, so its box centre sits 2.25
  units right of the button's centre (verified in `panel/index.html` and the owner's capture).
  Optical centring puts the box about 1/12 of the triangle's width right of centre, not 2.25.
- "Offline": `panel/views/now.js` showed the banner whenever `player.state.online === false`,
  whatever the track; the owner's capture plays a local FLAC (lyrics, no Cloud chip). The worker
  reported offline after a single failed TCP probe to graph.microsoft.com and kept it for 30 s,
  and probed every 30 s even with no stream playing. Windows' WLAN log shows the Wi-Fi
  re-authenticating about 40 times between 11:17:54 and 11:19:00 that morning: real, short drops
  that one failed probe turns into an "Offline" banner over local music.

## Design decisions (A2, the Worker's)

- Skins are a token layer: `panel/skins.js` holds each skin's colours for Orca's dark and light
  themes (tested for WCAG AA in Node), `panel/skins.css` its fonts, shapes, textures and the
  animated logos. CD keeps the cover palette (`panel/palette.js`); Vinyl and Cassette use their
  own palettes (the skin decides the colours, in both Orca themes) and drop the cover backdrop.
- The logo is a button that opens a menu of the three skins (radio items, keyboard, accessible
  name with the current skin). The choice is stored in the plugin's own storage (`skin`); new
  and existing users start in CD.
- Animations: `transform`/`opacity` only, paused (`animation-play-state`) while AIMP is paused or
  stopped and while the panel is hidden; none of the continuous ones under reduced motion.
- Fonts (SIL OFL 1.1, embedded as woff2 with their licences in `panel/fonts/`): Manrope (CD),
  Cormorant Garamond and EB Garamond (Vinyl), Pixelify Sans and Press Start 2P (Cassette).
- Offline: the banner shows only for a cloud track; the worker probes only while a cloud track
  plays and reports offline after two failed probes in a row.

- Screenshots: headless Chrome 157 here writes the picture and then waits on installing its
  default web apps before quitting, and stalls on one large picture of several panel frames.
  `docs/make-assets.py` now closes the browser once the picture is written, uses a profile per
  render, and draws each frame on its own before composing the page.

## Steps

- [x] Audit and plan (this file): evidence above.
- [x] Play icon optically centred; offline fix with tests: 8f8c346 (`test/player.test.mjs`).
- [x] Skin system: tokens (`panel/skins.js`), fonts (`panel/fonts/`, OFL), logo menu, storage
      `skin`, Tint integration (`panel/core.js`): 8f8c346; `test/skins.test.mjs` (AA per skin
      and theme, fonts embedded, no network).
- [x] Vinyl, Cassette and CD styling of every view; animated logos: review sheets at 240, 400
      and 1100 px, dark and light, read and fixed.
- [x] Checks on d8dae31: `node --test` 152/152; `orca plugin validate` ok; `orca plugin check`
      ok; `orca plugin test` 152/152.
- [x] Live check in Orca with AIMP (dev load `local.b-side`, AIMP muted): `player.state` for the
      owner's local FLAC answers `cloud: false, online: null` (no banner); each skin shot paused
      and playing from `orca plugin shot`: pause/play icon, tonearm on and off the record,
      cassette reels on the other frame with the light on, CD halo and turn.
- [x] README x6, CHANGELOG, version 2.1.0, store images (`shot-skins`, `shot-decks`): d8dae31.
- [x] Skin menu driven in headless Chrome on the real panel (mock Orca): 18/18 checks pass
      (accessible name with the skin, menu radio items, focus, ArrowDown, Escape, Vinyl and
      Cassette applied, `skin` saved in storage and localStorage, back to CD restores the cover
      colours). Orca's accessibility tree exposes the panel frame only intermittently, so the
      click in the owner's Orca was not repeatable; the skins themselves were checked live.
- [ ] PR, CI green, merge, tag `v2.1.0`, release, `orca plugin update` and live check with the
      owner's collection (music mtime and size unchanged).
- [ ] Cleanup: branches, plan completed, `active_plan: none`.
