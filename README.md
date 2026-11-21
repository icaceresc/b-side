<p align="center">
  <a href="README.md"><img src="panel/flags/gb.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.md"><b>English</b></a> &nbsp;·&nbsp;
  <a href="README.es.md"><img src="panel/flags/py.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.es.md">Español</a> &nbsp;·&nbsp;
  <a href="README.de.md"><img src="panel/flags/de.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.de.md">Deutsch</a> &nbsp;·&nbsp;
  <a href="README.ja.md"><img src="panel/flags/jp.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ja.md">日本語</a> &nbsp;·&nbsp;
  <a href="README.zh.md"><img src="panel/flags/cn.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.zh.md">中文</a> &nbsp;·&nbsp;
  <a href="README.ru.md"><img src="panel/flags/ru.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="docs/hero.png" alt="B-Side: your lossless collection, right in Orca's sidebar" width="100%">
</p>

<p align="center">
  <a href="https://github.com/icaceresc/b-side/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/icaceresc/b-side/actions/workflows/ci.yml/badge.svg"></a>
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
    <td align="center"><img src="docs/panel-playing.png" width="180" alt="Playing: cover, title, artist, album, CD quality badge, progress and controls"></td>
    <td align="center"><img src="docs/panel-idle.png" width="180" alt="AIMP open and waiting, with a hint to pick an album in My Clouds"></td>
    <td align="center"><img src="docs/panel-closed.png" width="180" alt="AIMP closed, with an Open AIMP button"></td>
    <td align="center"><img src="docs/panel-offline.png" width="180" alt="Offline banner while a track is paused"></td>
  </tr>
  <tr>
    <td align="center"><sub>Playing</sub></td>
    <td align="center"><sub>Waiting</sub></td>
    <td align="center"><sub>AIMP closed</sub></td>
    <td align="center"><sub>Offline</sub></td>
  </tr>
</table>

- **Now playing**: cover art, title, artist, album and year.
- **Cover colors**: the panel builds its background and accent from the cover's palette and keeps the text readable in light and dark.
- **Lyrics**: for files on your disk, from the file's tags (FLAC `LYRICS`/`UNSYNCEDLYRICS`, MP3 `USLT`/`SYLT`) or a `.lrc` file beside the track. Synced lyrics highlight the current line.
- **Artist image**: `artist.jpg` from the artist's folder, for files on your disk.
- **Real format**: codec, sample rate, bitrate and channels as AIMP reports them, plus a *CD quality* badge for lossless 44.1 kHz stereo.
- **Controls**: play/pause, previous, next, seek (drag the bar or use ←/→), volume, mute (press the speaker icon; moving the slider unmutes), shuffle and repeat. `Space` toggles playback.
- **Clear states**: AIMP closed (with an *Open AIMP* button), nothing playing, AIMP not responding, offline.
- **Your language**: English, Español, Deutsch, 日本語, 中文 or Русский, from the flag in the corner. It starts in Orca's language and remembers your pick; light and dark themes follow Orca.

*Screenshots use a synthetic demo track and cover.*

## Requirements

- Windows 10 or 11
- [Git](https://git-scm.com/download/win)
- [Orca](https://github.com/stablyai/orca) 1.4.248 or later
- AIMP from the Microsoft Store (the installer gets it for you, per user, no admin)

## Install

Two steps, both in a terminal inside Orca (it provides the `orca` command).

**1. Install the plugin.**

```powershell
orca plugin install icaceresc/b-side
```

B-Side runs code on your PC: a small worker that Orca starts to talk to AIMP (a *trusted
worker*). So the first time, Orca stops and shows what the plugin would get (its own storage,
nothing else) and prints the same command with `--approve <code>` at the end. Run that command
to approve and install it.

**2. Prepare AIMP.**

```powershell
git clone https://github.com/icaceresc/b-side.git
cd b-side
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

`-ExecutionPolicy Bypass` only applies to this one run, since Windows blocks scripts by default.
`install.ps1` installs AIMP if it is missing, fixes a settings bug of AIMP's Store edition and
turns on streaming in My Clouds. It also does step 1 for you: it installs or updates the plugin
from GitHub and prints the approve command when Orca asks for it, so on a new PC this one script
is enough. Running it again is safe. Options:

- `-SkipSettings`: install AIMP and fix the settings bug, but leave AIMP's settings untouched.
- `-SkipPlugin`: only prepare AIMP; do not install the plugin.

Then open **B-Side** from Orca's right sidebar.

## Update

```powershell
orca plugin update icaceresc.b-side
```

Orca asks for approval again only if a new version asks for more access. For the newest
`install.ps1` too, run `git pull` in the clone; running the script again also updates the plugin.

## Connect your cloud (once)

1. In the B-Side panel, press **Open AIMP**.
2. In AIMP, open the **My Clouds** tab, right-click **All** in the left column and choose
   **Add Storage...**.
3. Service: **OneDrive** (or another) › **Get Token** › sign in › allow access › **OK**.
   On a PC with a work or school account, read [Work or school PC](#work-account) first.
4. Pick an album and press play. From now on, control it from Orca.


Streaming access is on, so tracks are not downloaded whole: AIMP only buffers what it plays and
clears its cache when it closes.

## Two ways to use it

**Personal PC: your disk plus the cloud.** Keep music on the local disk, in any folder AIMP
plays (for example `Music\Artist\Album\`), and stream the rest from My Clouds. Files on your
disk get everything: lyrics (in the tags or a `.lrc`), the artist image and the cover colors.
This layout gives B-Side what it looks for:

```text
Music\
  Artist\
    artist.jpg            the artist image
    Album\
      01 Title.flac
      01 Title.lrc        lyrics, only if they are not in the file's tags
```

**Work PC: streaming only.** Play everything from My Clouds (OneDrive), so your collection is
not copied to this PC: the installer turns on streaming access, and AIMP buffers only what it
plays and clears its cache when it closes. Cover art, title, artist, album, format and cover
colors work; lyrics and the artist image do not, because AIMP gives B-Side only a `cloud://`
address for a streamed track, which B-Side cannot open, and AIMP's Remote API does not pass on
lyrics.

<a id="work-account"></a>

> **⚠ Work or school PC: sign My Clouds in with your personal account.**
>
> When Windows is signed in to a work or school account, the Microsoft sign-in page that
> **Get Token** opens may pick that account by itself, and My Clouds would then stream from your
> work OneDrive. In AIMP › **My Clouds** › **Add Storage...** › **OneDrive** › **Get Token**,
> choose **Use another account** and sign in with your personal Microsoft account; if Microsoft
> asks which kind of account, pick **Personal account**. The installer warns you when Windows has
> a work or school account.
>
> - **Check**: open the storage in My Clouds. You should see your personal OneDrive's folders
>   (your music). Work files, or an empty OneDrive you do not recognize, mean the work account.
> - **Fix**: right-click the storage › **Edit Storage...** › **Get Token** and sign in again with
>   your personal account. Or right-click › **Remove Storage...** (tick **Delete local cache** to
>   drop its cached files too) and add it again.

## Sound quality

B-Side never touches the audio: AIMP decodes and plays it. The installer switches off AIMP's
effects (fades, normalizer, anti-clipping, dither); check AIMP's own sound effects window
for its enhancer, which AIMP keeps by itself. For CD-quality files to reach your
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
- Orca runs the worker as a *trusted worker*: a Node process with your user account's access
  to this PC, which is why Orca asks you to approve it. Of Orca's own permissions it asks only
  for its own storage, to remember your language: no terminal, workspace or secrets access.

## Privacy

- Reads what AIMP reports about the current track: title, artist, album, year, format and
  cover. When that track is a file on your disk, B-Side also reads, read-only, the file's tags,
  a `.lrc` file beside it and image files in its album and artist folders, to show lyrics and
  the artist image. For a cloud track it reads nothing beyond what AIMP reports.
- Never writes to, moves or deletes your music files. Only your language choice is stored, in
  the plugin's own Orca storage; nothing is sent anywhere.
- Never touches your cloud account or its sign-in. My Clouds signs in inside AIMP.
- Listens on no network port. While the panel is visible, it checks connectivity every 30 s by
  opening (and closing) a TCP connection to `graph.microsoft.com:443`, sending nothing.
- Windows PowerShell compiles the helper's small C# part in `%TEMP%` each time it starts.

## Limitations

- AIMP's Remote API exposes neither the playlist nor the bit depth, so B-Side shows neither.
- Built and tested for AIMP 4.60 from the Microsoft Store. AIMP 5 installs machine-wide (admin).
- Local Orca host only.
- Lyrics and the artist image work only for files on your disk; streamed tracks show cover, details and cover colors ([Two ways to use it](#two-ways-to-use-it)).
- On a PC with a work or school account, My Clouds may sign in with that account: see [Work or school PC](#work-account).

## Recover and uninstall

- **AIMP forgets its settings after closing**: in the clone, run `powershell -ExecutionPolicy Bypass -File .\install.ps1 -SkipSettings -SkipPlugin`.
- **Panel says AIMP is closed while it is open**: restart AIMP; the panel reconnects by itself.
- **Undo the installer's AIMP changes**: AIMP's original settings are saved next to them as
  `AIMP.ini.b-side.bak`.
- **Uninstall**: `orca plugin uninstall icaceresc.b-side` (or `orca plugin dev unload <path-to>\b-side`
  if you loaded it with `-Dev`), then uninstall AIMP from Windows Settings › Apps if you no
  longer want it, and delete the clone.

## Develop

Everything runs from the repository root:

```powershell
orca plugin test .        # unit tests (node:test)
orca plugin validate .
orca plugin dev watch . --check --shot .orca/shots
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dev    # load this folder instead of the GitHub version
```

`native/aimp-helper.ps1` is the only code that touches AIMP; the worker starts it with
`powershell.exe -EncodedCommand` and talks to it over stdin/stdout. GitHub Actions runs the
CI workflow (badge above) on Windows.

The icon, cover and screenshots for Orca's plugin page come from `python docs/make-assets.py`
(Pillow, plus Chrome or Edge): it renders the real panel with a synthetic demo track, so rerun
it when the panel changes.

## Credits and license

- B-Side: [MIT License](LICENSE).
- [AIMP](https://www.aimp.ru) by Artem Izmaylov and My Clouds are separate products, not
  included. This is an independent project, not an official AIMP or Orca project.
- Flag icons: [lipis/flag-icons](https://github.com/lipis/flag-icons), [MIT License](panel/flags/LICENSE).
