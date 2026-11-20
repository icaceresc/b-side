<p align="center">
  <a href="README.md"><img src="docs/flags/gb.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.md"><b>English</b></a> &nbsp;·&nbsp;
  <a href="README.es.md"><img src="docs/flags/py.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.es.md">Español</a> &nbsp;·&nbsp;
  <a href="README.de.md"><img src="docs/flags/de.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.de.md">Deutsch</a> &nbsp;·&nbsp;
  <a href="README.ja.md"><img src="docs/flags/jp.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ja.md">日本語</a> &nbsp;·&nbsp;
  <a href="README.zh.md"><img src="docs/flags/cn.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.zh.md">中文</a> &nbsp;·&nbsp;
  <a href="README.ru.md"><img src="docs/flags/ru.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="docs/hero.png" alt="B-Side: your lossless collection, right in Orca's sidebar" width="100%">
</p>

<p align="center">
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows&logoColor=white">
  <img alt="Orca 1.4.248+" src="https://img.shields.io/badge/Orca-1.4.248%2B-7C5CFF?style=flat-square">
  <img alt="AIMP 4.60 Microsoft Store" src="https://img.shields.io/badge/AIMP-4.60%20Store-FF6A3D?style=flat-square">
  <img alt="No admin" src="https://img.shields.io/badge/admin-not%20needed-3DDC84?style=flat-square">
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square">
</p>

# B-Side

Control AIMP from Orca: your lossless collection while you work. [AIMP](https://www.aimp.ru)
streams your music from the cloud (OneDrive, Google Drive, Dropbox and more through its
built-in **My Clouds**) and plays it; B-Side puts the player in Orca's sidebar, so you never
leave your editor to skip a track.

## What you get

<table>
  <tr>
    <td align="center"><img src="docs/panel-playing.png" width="200" alt="Playing: cover, title, artist, album, CD quality badge, progress and controls"></td>
    <td align="center"><img src="docs/panel-idle.png" width="200" alt="AIMP open and waiting, with a hint to pick an album in My Clouds"></td>
    <td align="center"><img src="docs/panel-closed.png" width="200" alt="AIMP closed, with an Open AIMP button"></td>
    <td align="center"><img src="docs/panel-offline.png" width="200" alt="Offline banner while a track is paused"></td>
  </tr>
  <tr>
    <td align="center"><sub>Playing</sub></td>
    <td align="center"><sub>Waiting</sub></td>
    <td align="center"><sub>AIMP closed</sub></td>
    <td align="center"><sub>Offline</sub></td>
  </tr>
</table>

- **Now playing**: cover art (the panel takes its accent color from it), title, artist, album and year.
- **Real format**: codec, sample rate, bitrate and channels as AIMP reports them, plus a *CD quality* badge for lossless 44.1 kHz stereo.
- **Controls**: play/pause, previous, next, seek (drag the bar or use ←/→), volume, shuffle and repeat. `Space` toggles playback.
- **Clear states**: AIMP closed (with an *Open AIMP* button), nothing playing, AIMP not responding, offline.
- **Your language**: English, Español, Deutsch, 日本語, 中文 or Русский, from the flag in the corner. It starts in Orca's language and remembers your pick; light and dark themes follow Orca.

*Screenshots use a synthetic demo track and cover.*

## Requirements

- Windows 10 or 11
- [Orca](https://github.com/stablyai/orca) 1.4.248 or later
- AIMP from the Microsoft Store (the installer gets it for you, per user, no admin)

## Quick install

```powershell
git clone https://github.com/icaceresc/b-side.git
cd b-side
.\install.ps1
```

`install.ps1` installs AIMP if it is missing, fixes a settings bug of AIMP's Store edition,
turns on streaming in My Clouds and loads the panel into Orca. The first time, Orca asks you to
approve the plugin: run the `orca plugin dev load … --approve …` command the script prints.
Then open **B-Side** from Orca's right sidebar. Running the script again is safe.

## Connect your cloud (once)

1. In the B-Side panel, press **Open AIMP**.
2. In AIMP, open the **My Clouds** tab, right-click **All** in the left column and choose
   **Add Storage...**.
3. Service: **OneDrive** (or another) › **Get Token** › sign in › allow access › **OK**.
4. Pick an album and press play. From now on, control it from Orca.

> **Work PC signing you in with your work account?** *(Experimental: not confirmed yet.)* Windows can pass your work account to AIMP
> automatically. To use a personal Microsoft account instead, open **Get Token**, then drag this
> link and drop it inside AIMP's *Authorization Master* window (its address bar cannot be edited):
> **[Sign in with a personal Microsoft account](https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=a527d046-6111-4b9a-9855-f6a26b81b245&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%2F&scope=Files.Read%20offline_access&prompt=select_account)**. It only accepts personal accounts.

Streaming access is on, so tracks are not downloaded whole: AIMP only buffers what it plays and
clears its cache when it closes.

## Sound quality

B-Side never touches the audio: AIMP decodes and plays it. The installer switches off AIMP's
effects (enhancer, fades, normalizer, anti-clipping, dither). For CD-quality files to reach your
headphones without resampling, set the device's Windows format to the same rate:
**Settings › System › Sound › your device › Output settings › Format: 16 bit, 44100 Hz**. Other
sounds keep playing alongside the music.

Want the device all to yourself? In AIMP, **Preferences › Playback › Device**: pick the
*WASAPI Exclusive* entry. Notifications and calls on that device go silent while AIMP plays.

## How it works

```text
Orca sidebar panel  ──plugin.request──▶  B-Side worker (Node)  ──stdin/stdout──▶  helper (PowerShell + C#)  ──AIMP Remote API──▶  AIMP
```

- The helper talks to AIMP only through AIMP's official Remote API: window messages and the
  `AIMP2_RemoteInfo` shared memory. Every command is on an allow-list.
- The plugin asks Orca only for its own storage, to remember your language: no network,
  terminal, workspace or secrets access.

## Privacy

- Reads only what AIMP shows: title, artist, album, year, format and cover of the current
  track. Only your language choice is stored, in the plugin's own Orca storage; nothing is sent
  anywhere.
- Never touches your music files, your cloud account or its sign-in. My Clouds signs in inside
  AIMP.
- Listens on no network port. While the panel is visible, it checks connectivity every 30 s by
  opening (and closing) a TCP connection to `graph.microsoft.com:443`, sending nothing.
- Windows PowerShell compiles the helper's small C# part in `%TEMP%` each time it starts.

## Limitations

- AIMP's Remote API exposes neither the playlist nor the bit depth, so B-Side shows neither.
- Built and tested for AIMP 4.60 from the Microsoft Store. AIMP 5 installs machine-wide (admin).
- Local Orca host only.

## Recover and uninstall

- **AIMP forgets its settings after closing**: run `.\install.ps1 -SkipSettings`.
- **Panel says AIMP is closed while it is open**: restart AIMP; the panel reconnects by itself.
- **Undo the installer's AIMP changes**: AIMP's original settings are saved next to them as
  `AIMP.ini.b-side.bak`.
- **Uninstall**: `orca plugin dev unload <path-to>\b-side\plugin`, then uninstall AIMP from
  Windows Settings › Apps if you no longer want it, and delete the clone.

## Develop

```powershell
orca plugin test plugin        # unit tests (node:test)
orca plugin validate plugin
orca plugin dev watch plugin --check --shot plugin\.orca\shots
```

`plugin/native/aimp-helper.ps1` is the only code that touches AIMP; the worker starts it with
`powershell.exe -EncodedCommand` and talks to it over stdin/stdout.

## Credits and license

- B-Side: [MIT License](LICENSE).
- [AIMP](https://www.aimp.ru) by Artem Izmaylov and My Clouds are separate products, not
  included. This is an independent project, not an official AIMP or Orca project.
- Flag icons: [lipis/flag-icons](https://github.com/lipis/flag-icons), [MIT License](docs/flags/LICENSE).
