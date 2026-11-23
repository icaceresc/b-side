<p align="center"><b>English</b> &nbsp;·&nbsp; <a href="guide.es.md">Español</a> &nbsp;·&nbsp; <a href="guide.de.md">Deutsch</a> &nbsp;·&nbsp; <a href="guide.ja.md">日本語</a> &nbsp;·&nbsp; <a href="guide.zh.md">中文</a> &nbsp;·&nbsp; <a href="guide.ru.md">Русский</a></p>

# B-Side guide

[← Back to the README](../README.md)

<a id="features"></a>

## What you get

- **Library**: Artists, Albums, Tracks and Genres, from your files' tags, with folder and file
  names standing in when a tag is missing (`Artist\Album\01 Title.flac`). Albums sort by artist,
  title or year; the Tracks list scrolls smoothly through ten thousand tracks.
- **Artist and album pages**: tinted from the album cover or the artist's picture. An album page
  shows the format read from its files (codec, sample rate, bit depth), its
  discs and durations, and marks the tracks that have lyrics or are only in the cloud.
- **Play**: play an album from its page, an artist's albums from the artist page, or press a track
  to play from it to the end of its album. The menu of a track or an album (**⋯**) has
  **Play next**, **Add to queue**, **Go to album** and **Go to artist**. If AIMP is closed,
  playing starts it.
- **Search**: instant, across artists, albums and tracks. It ignores case and accents (`rios`
  finds *Ríos de Ámbar y Sal*) and finds words inside Japanese or Chinese names. `/` or `Ctrl+K` brings you
  there from anywhere in the panel.
- **Playing**: cover, title, artist and album (each opens its library page), the format in one
  line (`FLAC | 16 bits | 44.1 kHz | 738 kbps | Stereo`), and every control: play/pause,
  previous, next, seek (drag the bar or use ←/→), volume, mute, shuffle and repeat. `Space`
  toggles playback.
- **Lyrics**: from the file's tags (FLAC `LYRICS`/`UNSYNCEDLYRICS`, MP3 `USLT`/`SYLT`) or a `.lrc`
  beside the track, shown on Playing whenever the track has them. Synced lyrics follow the song with
  the current line highlighted; press a line to jump there. The round **Lyrics** button beside the
  title shows or hides them in every skin; when a track has none, it says why. A− and A+ in the corner set their size in four steps;
  B-Side remembers it.
- **Made for the sidebar**: narrow, it works like a phone app, with Playing, Library and Search tabs
  and a mini-player; drag the sidebar wider and the library or search sits on the left with
  Playing on the right.
- **Cover colours** (CD skin): on a neutral black base, the playing cover's palette tints every
  surface, from the tab bar to the mini-player, with text kept readable (WCAG AA) in light and dark.
  An album page takes its own cover's colours.
- **Clear states**: choosing your folders, scanning, AIMP closed (with an *Open AIMP* button), AIMP
  not responding, offline.
- **Your language**: English, Español, Deutsch, 日本語, 中文 or Русский, from the flag in the corner.
  It starts in Orca's language and remembers your pick; light and dark themes follow Orca.

<a id="skins"></a>

### Skins

Press the logo in the top-left corner and pick a skin; B-Side remembers it. Each one restyles the whole panel (Playing, Library, Search, lyrics, the mini-player and the format line) in Orca's light and dark themes, with text that keeps WCAG AA contrast.

- **CD** (the default): Manrope type on neutral black; the playing cover's colours tint every surface, and a nearly monochrome cover stays nearly black with a discreet accent.
- **Vinyl**: a listening room in leather, walnut and old gold, after a valve amplifier. Cormorant and EB Garamond, small capitals, a dark tab bar with the tab in use in fine gold, a dark knob with a champagne ring.
- **Cassette**: an 80s tape deck in pixels. VT323 and Press Start 2P type, dark violet with cyan outlines like a Walkman's keys, fuchsia as a small accent, an LED progress meter.

The logo plays along with AIMP: the CD turns, iridescent, under a fixed glint; the record turns at 33⅓ and the tonearm lowers onto it, then lifts off when you pause; the cassette's reels run. Animations run only while music plays and the panel is visible, and stop when Windows' *Animation effects* are off (the logo still shows playing with a glow, a light or the tonearm on the record).


<a id="requirements"></a>

## Requirements

- Windows 10 or 11
- [Git](https://git-scm.com/download/win), only to run `install.ps1` (step 2)
- [Orca](https://github.com/stablyai/orca) 1.4.248 or later
- AIMP from the Microsoft Store (the installer gets it for you, per user, no admin)

<a id="install"></a>

## Install

In a terminal inside Orca (it provides the `orca` command). With AIMP already installed, step 1 is all you need; new to AIMP,
or on a new PC, step 2 alone does both.

**1. Install the plugin.**

```powershell
orca plugin install icaceresc/b-side
```

B-Side runs code on your PC: a small worker that Orca starts to read your library and talk to AIMP
(a *trusted worker*). So the first time, Orca stops and shows what the plugin would get (its own
storage and its own settings, nothing else) and prints the same command with `--approve <code>` at
the end. Run that command to approve and install it.

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

Then open **B-Side** from Orca's right sidebar and choose your music folders.

<a id="library-folders"></a>

## Choose your music folders

The first time, the panel asks where your music is. It suggests the folders that hold music on
this PC: the Windows Music folder and the music folder of each OneDrive (*Music*, *Música*,
*Musik*, *音楽*…), each with its big subfolders and how many tracks they hold. Pick one or more, or
paste the path of another folder, and press **Use these folders**. B-Side reads up to 16 folders.

You can change them at any time, from the panel (**Change folders** in the library's options), or
in Orca's **Settings › Plugins › B-Side › Library folders**, one folder per line. With the setting
left empty, B-Side uses the Windows Music folder.

Indexing happens in the background and you can browse while it runs. On a collection of 428 FLAC
files the first scan took about 2 seconds; after that the panel opens with the saved index at once,
and later scans read again only the files that changed.

<a id="update"></a>

## Update

```powershell
orca plugin update icaceresc.b-side
```

Orca asks for approval again only when a new version asks for more access (2.0 did, for its
settings; 2.3.1 did, for the **Native helper** setting). Orca then lists the change and prints the
same command with `--approve <code>`; run it. Until you approve, the version you have keeps
working. If you use `install.ps1`, run `git pull` in its clone for the newest one; running the
script again also updates the plugin.

<a id="aimp-setting"></a>

## How B-Side plays in AIMP

AIMP's Remote API can control playback but cannot load files, so B-Side hands tracks to AIMP the way
Explorer does. When you play an album or a track, B-Side asks AIMP to open the first track; AIMP
clears its playlist **Default**, adds the track and plays it. B-Side then adds the rest of the album
after it. **Add to queue** adds tracks at the end of the playlist AIMP is playing, and **Play next**
puts them right after the playing track (at the end, when AIMP plays a playlist of its own). With
nothing playing, both play the tracks.

This relies on one AIMP setting, which B-Side never changes: **Preferences › Playlist ›
File adding › Open files from external applications › Default action**, left at AIMP's default,
**Add to empty playlist "Default"**. With another choice, AIMP still plays the track, but in a new
playlist tab each time (*Create new playlist*) or added to the playlist already open (*Add to
current playlist*), and the rest of the album goes to the end of that playlist.

To start at a track, B-Side loads the whole album or list and moves AIMP to your track with Next
while AIMP is muted (with shuffle off for that moment), so Previous reaches the tracks before it.
It takes about two seconds; then mute and shuffle are as you had them.

<a id="two-ways-to-use-it"></a>

## Your music in the cloud

Tested with a OneDrive collection of 324 FLAC tracks (8.1 GB) in November 2026. There are three
ways to keep your music, and B-Side works with all of them:

**On this PC: everything.** Keep your music in folders on this PC (or in OneDrive, set to
*Always keep on this device*). Files on your disk get everything: tags, covers, lyrics and artist
pictures. This layout gives B-Side what it looks for:

```text
Music\
  Artist\
    artist.jpg            the artist's picture
    Album\
      cover.jpg           the album cover, if it is not in the files' tags
      01 Title.flac
      01 Title.lrc        lyrics, only if they are not in the file's tags
```

**OneDrive with Files On-Demand.** Point B-Side at your OneDrive music folder and leave it *only in
the cloud*. B-Side lists those files from their folder and file names and never opens one that is
only in the cloud, since that would download it: the 324 tracks were in the library in under a
second, and nothing was downloaded. Their covers, lyrics and artist pictures show only for the
files you keep on this PC. When you play a track, AIMP opens it and OneDrive downloads it whole and
keeps it until you choose **Free up space** on it in Explorer. The panel marks the tracks and
albums that are only in OneDrive.

**My Clouds: streaming, nothing to sync.** AIMP plays straight from OneDrive (or Google Drive,
Dropbox and more) through its built-in **My Clouds**, with no OneDrive app. B-Side's Playing tab
shows and controls those tracks; you pick them in AIMP. This is the way for a work PC: see
[On a work PC](#work-pc).

| | On this PC | Files On-Demand | My Clouds |
|---|---|---|---|
| Browse and search in B-Side | ✓ | ✓ from folder and file names | in AIMP's My Clouds tab |
| Play, pause, next, seek, volume | ✓ | ✓ | ✓ |
| Cover and its colours | ✓ | covers kept on this PC | ✓ AIMP's |
| Format (codec, kHz, kbps) | ✓ with bit depth | ✓ once played | ✓ without bit depth |
| Lyrics and artist picture | ✓ | files kept on this PC | — |
| Until it plays | at once | OneDrive downloads the track | 6 to 10 s (measured) |
| Disk | your files | each played track stays until you free it | AIMP's cache, emptied when it closes |

<a id="onedrive"></a>

## Connect your OneDrive in B-Side

New in 2.4. B-Side can sign in to your personal OneDrive itself, read only, and add the folders you
choose to the library: browse and search every album without downloading it, with covers, artist
pictures and lyrics, and play it in AIMP from the track you pick.

1. **Library › ⋯ › OneDrive › Connect OneDrive** (on the first-run screen: **Or connect your OneDrive**).
2. B-Side shows a code. On this PC, your phone or any other device, open **microsoft.com/link**,
   enter the code and sign in with your personal Microsoft account. Microsoft asks whether B-Side may
   *read your files* and *keep that access*: accept. B-Side never sees your password.
3. Back in B-Side, **Choose folders**: open your OneDrive down to your music folder, tick it and press
   **Use this folder**. B-Side lists it (seconds for a few hundred tracks) and its albums join the
   library, marked as cloud. It looks for changes every 15 minutes, or when you press **Sync now**.

**Playing.** B-Side hands AIMP the album from the track you chose to its end, through OneDrive's
download links: AIMP streams each track as it plays and writes nothing of it to disk, and My Clouds
is not needed (measured in November 2026 on a 324-track FLAC collection: sound in 2 to 8 s, Next in
about 2 s, disk unchanged but for B-Side's small images and lyrics). AIMP never loads the tracks
before the one you chose, so Previous does not go back past it. A link works for about an hour: if a
long list stops, play it again from B-Side. If you also play these files from AIMP's My Clouds,
B-Side recognises them and shows their lyrics and artist picture.

**What B-Side keeps, and where.**

- The sign-in: a refresh token in Orca's encrypted plugin secrets (protected by Windows for your
  account), sealed with a key only B-Side's worker reads (`%LOCALAPPDATA%\B-Side\onedrive.key`). The
  access token, valid about an hour, stays in memory. Neither goes to a file, a log or the panel.
- Your chosen folders (names and ids) in B-Side's Orca storage; the list of their files (names,
  sizes, dates and OneDrive's music tags) in `%LOCALAPPDATA%\B-Side\cloud\index.json`; the covers,
  artist pictures and lyrics it downloaded in `%LOCALAPPDATA%\B-Side\cloud\files`.
- The playlist it hands AIMP, in `%LOCALAPPDATA%\B-Side\queue`, deleted once AIMP plays it (or at
  the next start). AIMP saves the addresses in its own playlists; a download link stops working after
  about an hour.

**Permissions and how to revoke them.** *Files.Read* (read your files: B-Side never writes, moves or
deletes anything in your OneDrive) and *offline_access* (keep that access without asking you every
hour). **Disconnect**, on the OneDrive page, signs out and deletes everything above from this PC. To
remove B-Side's access from your Microsoft account too, open **account.live.com/consent/Manage**.
Only personal Microsoft accounts.

<a id="my-clouds"></a>

## Stream from My Clouds

1. In the B-Side panel, press **Open AIMP**.
2. In AIMP, open the **My Clouds** tab, right-click **All** in the left column and choose
   **Add Storage...**.
3. Service: **OneDrive** (or another) › **Get Token**. AIMP's sign-in window is an old browser:
   type your email, choose **Use your password** (a passkey or approving on your phone does not work
   there), then enter the code from your authenticator app or a text message. Allow access › **OK**.
   On a PC with a work or school account, read [Work or school PC](#work-account) first.
4. In the tree, open your music folder down to an album: My Clouds lists the tracks of the folder
   you select, not of its subfolders. Double-click a track.

The installer turns on streaming access, so a track plays while it downloads. AIMP keeps each
track it plays in its cache (`%TEMP%\MyCloudsCache`, 23 to 46 MB per track in the test) and empties
it when AIMP closes. If Microsoft answers *Too Many Requests*, wait half an hour and press
**Get Token** again.

<a id="work-pc"></a>

### On a work PC

1. Install AIMP from the Microsoft Store and B-Side (`orca plugin install icaceresc/b-side`).
2. Optional: run `install.ps1` ([Install](#install)); it turns on My Clouds' streaming access.
3. Add your personal OneDrive in My Clouds as above, with your **personal** account.
4. Play from AIMP's My Clouds tab; control and follow it in B-Side.

If the company blocks AIMP's sign-in or personal OneDrive, copy the albums you want to a folder
on that PC (or a USB drive) and add it in B-Side: everything works there, lyrics included. If
B-Side's helper download is blocked, turn off **Settings › Plugins › B-Side › Native helper**.
B-Side plays through AIMP: where AIMP is not allowed, it cannot play.

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

<a id="sound-quality"></a>

## Sound quality

B-Side never touches the audio: AIMP decodes and plays it. The installer switches off AIMP's
effects (fades, normalizer, anti-clipping, dither); check AIMP's own sound effects window
for its enhancer, which AIMP keeps by itself. For CD-quality files to reach your
headphones without resampling, set the device's Windows format to the same rate:
**Settings › System › Sound › your device › Output settings › Format: 16 bit, 44100 Hz**. Other
sounds keep playing alongside the music.

Want the device all to yourself? In AIMP, **Preferences › Playback › Device**: pick the
*WASAPI Exclusive* entry. Notifications and calls on that device go silent while AIMP plays.

<a id="how-it-works"></a>

## How it works

```text
Orca sidebar panel ──plugin.request──▶ B-Side worker (Node) ──stdin/stdout──▶ helper (native, Rust) ──▶ AIMP
Playing · Library · Search             library index, tags,                   Remote API: state, controls, cover
                                       search, play queue                     shell verbs: open, add to playlist
                                             │                                folder listing, thumbnails
                                             ▼
                                %LOCALAPPDATA%\B-Side\cache
                                library.json · thumbnails · play queue
```

- **Library**: the helper lists your folders from the directory alone (names, sizes, dates and
  Windows attributes), so listing opens no file. The worker reads the tags of local files,
  read-only, builds artists, albums, tracks and genres, and saves the index in
  `%LOCALAPPDATA%\B-Side\cache\library.json`; covers and artist pictures become small thumbnails
  next to it. A restarted Orca answers from the saved index at once and refreshes it in the
  background. The panel gets names and opaque ids, never file paths.
- **Playback**: the helper opens a track with AIMP's own file associations, as Explorer does
  (*open*, and AIMP's *Add to playlist* for the rest of the album, from a short `.m3u8` list in
  `%LOCALAPPDATA%\B-Side\queue` that B-Side deletes after 10 minutes). Everything else (state,
  play/pause, seek, volume, the cover) goes through AIMP's official Remote API: window messages
  and the `AIMP2_RemoteInfo` shared memory. Every command is on an allow-list.
- **The helper** is a small native program (`bside-helper-x64.exe`, or `-arm64.exe`, about
  0.5 MB) built from the Rust code in `native/helper`: it needs nothing installed, uses a few MB of
  memory and answers in a fraction of a second. The repository carries no program: on first use,
  B-Side downloads the one for your PC from its own version's GitHub release and runs it only if
  its SHA-256 is the one pinned in that version's code ([Check the helper](#verify-helper)). Until
  then (downloading, offline, a failed download or check), or if it cannot start, for example
  because an antivirus or a work PC's policy blocks it, B-Side uses the same helper written in
  PowerShell (`native/aimp-helper.ps1`) instead and says so in its log
  (`orca plugin logs icaceresc.b-side`); that one compiles its C# part once into the cache folder.
- Orca runs the worker as a *trusted worker*: a Node process with your user account's access
  to this PC, which is why Orca asks you to approve it. Of Orca's own permissions it asks only
  for its own storage (your language and where you left the panel) and its own settings (the library
  folders): no terminal, workspace or secrets access.

<a id="privacy"></a>

## Privacy

- Reads, read-only, the folders you choose: their listing, and the tags, embedded covers, lyrics
  and images of the files that are on the PC. Files that are only in the cloud are never opened.
  It also reads what AIMP reports about the playing track: title, artist, album, year, format and
  cover.
- Never writes to, moves or deletes your music files. It writes only in `%LOCALAPPDATA%\B-Side`
  (the index, thumbnails and play queue, the downloaded native helper in `helper\<version>`, plus
  the PowerShell helper's build if it ever runs) and in its own Orca storage and settings.
  Folder paths stay on this PC and are never sent.
- Never touches your cloud account or its sign-in unless you connect OneDrive in B-Side: then
  it signs in on Microsoft's own page and only reads the folders you choose ([Connect your
  OneDrive](#onedrive)). The OneDrive app and My Clouds sign in on their own.
- Uses the network for two things only. Once per version, it downloads its native helper
  (about 0.5 MB) over HTTPS from
  `https://github.com/icaceresc/b-side/releases/download/v<version>/bside-helper-<x64|arm64>.exe`
  (GitHub serves it from its own download servers), sending nothing but that request; after a
  failed download it tries again on a later start, waiting 10 minutes, then 1 hour, 6 hours and a
  day. To turn that off, set **Settings › Plugins › B-Side › Native helper** off: B-Side then always
  uses the PowerShell helper and never downloads it. And while a track streamed from the cloud is
  playing, it checks the connection by opening (and closing) a TCP connection to
  `graph.microsoft.com:443`, sending nothing, every 30 s (every 5 s after a failed check). Files
  on your PC need nothing else. It listens on no port.
- With OneDrive connected in B-Side, and only then, it also talks to Microsoft: `login.microsoftonline.com` to sign in, `graph.microsoft.com` to list the chosen folders (read only), and OneDrive's download servers for small covers, artist pictures and lyrics (and the track AIMP plays through a link). What it keeps and how to revoke it: [Connect your OneDrive](#onedrive).

<a id="limitations"></a>

## Limitations

- Built and tested for AIMP 4.60 from the Microsoft Store. AIMP 5 installs machine-wide (admin).
- Playing relies on AIMP's **Default action** for files from other apps being left at its default
  ([How B-Side plays in AIMP](#aimp-setting)).
- **Play next** restarts the
  playing track at the same point, with a short gap, because AIMP can only add tracks at the end.
- B-Side does not show AIMP's playlist. On Playing, the format is what AIMP reports, plus the bit
  depth when the file is in your library; album pages show the format read from the files.
- Tracks streamed from My Clouds are not in the library (AIMP does not share its list of cloud
  files), and show no lyrics or artist picture.
- Up to 16 library folders. Local Orca host only.
- On a PC with a work or school account, My Clouds may sign in with that account: see [Work or school PC](#work-account).
- Connect OneDrive: personal Microsoft accounts only. In the cloud, Previous does not go back before the track you chose.

<a id="troubleshooting"></a>

## Recover and uninstall

- **The library is empty or out of date**: check the folders (**Change folders**, or Orca's
  **Settings › Plugins › B-Side › Library folders**) and press **Scan again**.
- **Playing a track adds a new playlist tab in AIMP each time**: set AIMP's **Default action** back to
  **Add to empty playlist "Default"** ([How B-Side plays in AIMP](#aimp-setting)).
- **AIMP forgets its settings after closing**: in a clone of the repository ([Install](#install), step 2), run `powershell -ExecutionPolicy Bypass -File .\install.ps1 -SkipSettings -SkipPlugin`.
- **Panel says AIMP is closed while it is open**: restart AIMP; the panel reconnects by itself.
- **An antivirus blocks `bside-helper-x64.exe`**: B-Side keeps working through the PowerShell
  helper (the log says `using the powershell helper`). You can [check that the file is
  B-Side's](#verify-helper) and allow it in the antivirus; B-Side picks it up the next time Orca
  starts (it downloads it again if the antivirus deleted it). On a PC where downloaded programs are
  not welcome, turn **Native helper** off in Orca's **Settings › Plugins › B-Side**.
- **OneDrive says `Microsoft's sign-in service did not answer (network)`, or the helper download
  says `fetch failed`, while the browser reaches both**: an antivirus or proxy that inspects HTTPS
  (Kaspersky, ESET, a company proxy) re-signs every site with its own root certificate. Since 2.4.1
  B-Side trusts the Windows certificate store, where that root is installed, as well as Node's own
  list (the log says `tls: trusting N certificates from the system store`). If it still fails,
  check that the root is in Windows' **Trusted Root Certification Authorities** (`certmgr.msc`), or
  allow `login.microsoftonline.com`, `graph.microsoft.com` and GitHub's downloads in the antivirus.
- **Undo the installer's AIMP changes**: AIMP's original settings are saved next to them as
  `AIMP.ini.b-side.bak`.
- **Uninstall**: `orca plugin uninstall icaceresc.b-side` (or `orca plugin dev unload <path-to>\b-side`
  if you loaded it with `-Dev`), then uninstall AIMP from Windows Settings › Apps if you no
  longer want it, and delete the clone if you made one. To drop the index too, delete `%LOCALAPPDATA%\B-Side`.

<a id="verify-helper"></a>

## Check the helper

The native helper is not built on your PC, and it is not in the repository: GitHub Actions builds
it from the code in this repository (`native/helper`, with `native/build.mjs`), runs every test
against it, and signs a
[build provenance attestation](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations)
for it. Each release attaches those builds, `bside-helper-x64.exe` and `bside-helper-arm64.exe`,
with their SHA-256 in `SHA256SUMS`, and the same SHA-256 are pinned in that version's code
(`src/native-helper.mjs`). On first use B-Side downloads only the build for your PC from its own
version's release, saves it in `%LOCALAPPDATA%\B-Side\helper\<version>`, and runs it only when
its SHA-256 is the pinned one; a file that differs is deleted, never run, and the log says why. A
new version of B-Side downloads its own build and removes the old one. It is not signed with a
code-signing certificate, so Windows shows no publisher for it.

- **Compare the checksum** with the one in the release's `SHA256SUMS`:

  ```powershell
  Get-ChildItem "$env:LOCALAPPDATA\B-Side\helper" -Recurse -Filter bside-helper-*.exe | Get-FileHash
  ```

- **Check where it was built**, with the [GitHub CLI](https://cli.github.com), on that file or on
  the one from the release:

  ```powershell
  gh attestation verify "$env:LOCALAPPDATA\B-Side\helper\<version>\bside-helper-x64.exe" --repo icaceresc/b-side
  ```

  It names the workflow and the commit that built the file. In a clone, `node native/verify.mjs`
  does the same for the downloaded helper (or `--dir <folder>` with the release's files), checks
  the pinned SHA-256 and that the commit has the same helper code as your copy.
- **Build it yourself**: install [Rust](https://rustup.rs) and the Visual Studio C++ build tools
  (with the ARM64 tools for arm64), then `node native/build.mjs x64`. rustup fetches the Rust
  version the releases use (`native/helper/rust-toolchain.toml`). The build is deterministic: with
  the same compiler and linker versions as GitHub's runner you get the same bytes; with others,
  the same program. A clone with a build in `native/bin` (ignored by Git) uses it and downloads
  nothing.
- **Never download it**: turn **Native helper** off in **Settings › Plugins › B-Side**; B-Side
  uses the PowerShell helper, which is plain text in `native/aimp-helper.ps1`.

<a id="develop"></a>

## Develop

Everything runs from the repository root:

```powershell
orca plugin test .        # unit tests (node:test)
orca plugin validate .
orca plugin dev watch . --check --shot .orca/shots
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dev    # load this folder instead of the GitHub version
```

The helper is the only code that touches AIMP: `native/helper` (Rust), built into `native/bin`
(ignored by Git; a build there is used instead of the download) with `node native/build.mjs`, and
its PowerShell twin `native/aimp-helper.ps1`, which the worker
starts with a small loader passed to `powershell.exe -EncodedCommand` when the native one cannot
start. Both speak the same JSON lines over stdin/stdout, and `test/helper-parity.test.mjs` checks
that they answer alike; `cargo test` in `native/helper` runs the Rust tests and
`node scripts/measure-helper.mjs --helper native` measures memory, start time and CPU. The
library lives in `src/library/`, playback in `src/playback.mjs` and the panel in
`panel/`. GitHub Actions runs the CI workflow ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) on Windows.

The icon, cover and screenshots for Orca's plugin page come from `python docs/make-assets.py`
(Pillow, plus Chrome or Edge): it renders the real panel with a synthetic demo library, so rerun
it when the panel changes.

<a id="credits"></a>

## Credits and license

- B-Side: [MIT License](../LICENSE).
- [AIMP](https://www.aimp.ru) by Artem Izmaylov and My Clouds are separate products, not
  included. This is an independent project, not an official AIMP or Orca project.
- Flag icons: [lipis/flag-icons](https://github.com/lipis/flag-icons), [MIT License](../panel/flags/LICENSE).
- Fonts of the skins: [Manrope](https://github.com/sharanda/manrope), [EB Garamond](https://github.com/octaviopardo/EBGaramond12), [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant), [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans), [Press Start 2P](https://github.com/codeman38/PressStart2P) and [VT323](https://github.com/phoikoi/VT323), [SIL Open Font License 1.1](../panel/fonts/), embedded in the plugin.
