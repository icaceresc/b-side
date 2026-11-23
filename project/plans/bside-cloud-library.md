# Mission: can B-Side show a My Clouds folder as a local collection? (verdict: no, not without A3)

status: completed
commits: authorized

Origin: Job Packet JP-BSIDE-CLOUD-LIBRARY (task task_22433c734327, owner GO of 2026-11-23, item #36).
Goal: browse, search and play a My Clouds folder (AIMP) inside B-Side without downloading the tracks and
without a B-Side sign-in to OneDrive. Test collection: `Hi-Fi Collection - DLC` (324 FLAC, 154 artists).
Read-only on AIMP's data; AIMP muted during tests and left paused, volume 64, unmuted. No code shipped.

## Verdict

No for the owner's goal, and only a thin "yes with limits" otherwise: AIMP's own index of My Clouds is a
lazy browse cache, so it holds only the folders someone has opened in AIMP. Reading it cannot give
B-Side the DLC library. Complete browsing needs B-Side's own OneDrive (Microsoft Graph) access, an A3
decision that stays with the owner (not taken).

## Evidence (verified 2026-11-23, AIMP 4.60 Store)

1. **AIMP's My Clouds index exists and is readable.** `...\LocalCache\Roaming\AIMP\MyClouds\{storage GUID}.mycloud`
   (140 KB), read while AIMP ran, no lock. Format: AIMP's binary XML, magic `BXML` + u32 1; a node is
   `u16 nameLen, name, u8 flags, u32 attrCount, attrs, [u32 childCount, children if flags & 2]`; an
   attribute is `u16 nameLen, name, u16 charCount, UTF-16LE value`. My parser consumed all 139951 bytes
   exactly. Nodes: `storage` (n, p, pcs), `auth`, `root`, then `d` folders (n, uri, dc, dm, `l=1` when
   listed) and `f` files (n, uri, dc, dm, mt, s = size in bytes). A track's address is
   `cloud://{storage GUID}` + `uri`; the file name is the real one (`02 It's Gonna Be Me.flac`), the
   folder names are real, the `uri` ids are OneDrive item ids. No tags, no duration, no cover bytes.
   **Same file holds the OneDrive access and refresh tokens (`auth` attributes `ta`, `tr`)**: a reader must
   skip them and never log them. (While exploring, a fragment of the access-token blob reached a session
   log by mistake; it is AIMP's own stored value, not one B-Side ever handled, and whether it is encrypted was not checked.)
   It is a cache, not an index: 224 folders and 18 files, but only 12 folders have `l=1`
   (listed). `Armando` lists its 150 artist folders, yet only 3 artists (the ones played or added during
   the earlier cloud tests) have their albums and files; 147 artists are bare names. The packet's
   structure (Artist > Year - Album > NN Title) would parse, but there are 6 tracks in 3 albums to
   parse. Playing three cloud tracks did not change the file (mtime stayed 06:24:27), and AIMP exposes
   no command to make it list folders (Remote API has none; Add to playlist / smart playlists on a
   folder are not recursive, see project/plans/onedrive-streaming-test.md). Filling it means opening
   each of about 350 artist and album folders by hand in AIMP's My Clouds window, or automating that
   window; neither is a product feature. Not tested: handing AIMP a folder `cloud://` URI in a
   playlist. If AIMP expanded it, it would also read every track's tags, which downloads each file whole
   into `%TEMP%\MyCloudsCache`, the opposite of the goal.
2. **AIMP's saved lists (`PLS\*.aimppl4`, UTF-16 text).** Entries for played or added cloud tracks carry
   full tags: `cloud://...|title|artist|album|albumArtist|genre|date|track|disc|composer||bitrate|channels|sampleRate|durationMs|size|...`.
   Only for tracks AIMP already opened (here, 1 in the "My Clouds" list), so it is not a library either.
3. **Playing.** A `.m3u8` with `cloud://` lines opened through the helper's `openFile` (shell verb "open")
   plays at once: 1.8 s to sound (the three tracks were already in AIMP's cache, so this is not the first-play
   time of 6 to 10 s). `insertFile` appended three more to the playing list and Next / Previous moved
   between cloud tracks. B-Side's panel showed the cloud track with cover, title, album, year, FLAC /
   44.1 kHz / 868 kbps and the Cloud tag. Limits found by reading the code (`src/playback.mjs`): `isSafePath`
   accepts only local and UNC paths; a cloud URI cannot be opened as a file, so a cloud queue would open
   a `.m3u8` (a new AIMP tab each time); and "start at the chosen track" steps through the earlier
   tracks with Next, which for cloud tracks would start downloading each skipped one.
4. **Covers.** `cover.jpg`, `artist.jpg` and `.lrc` appear in the cache as names and sizes, but only AIMP can
   fetch them, and only while it plays the track (that is how the panel got the 4 Strings cover). Without
   Graph, B-Side cannot show covers for tracks that are not playing.
5. **`%TEMP%\MyCloudsCache`**: 95,445,599 bytes (the 3 tracks played earlier: 46.2 + 23.6 + 25.6 MB) before
   and after; playing them again added nothing (AIMP reuses its copy). Growth by a new track was not
   measured: no other track is known to the cache, which is point 1 again.

## Options for the owner (A3, not taken)

- B-Side signs in to OneDrive itself (Microsoft Graph, an app registration, token storage): complete
  library, covers and tags by path without downloading audio, but it is its own account access.
- Keep what exists: Files On-Demand on the DLC (B-Side indexed 324 tracks in 90 ms, no downloads) for a
  PC where OneDrive's client can run, and My Clouds only to play. Documented in the guide.

## Steps

- [x] Hypothesis 1, AIMP's My Clouds file: found, parsed exactly, read-only, partial by design (above).
- [x] Hypothesis 2, saved lists: only tracks already opened (above).
- [x] Hypothesis 3, playing `cloud://` from `.m3u8` through the helper and moving through them: works; limits above.
- [x] Hypothesis 4, covers: only while the track plays (above).
- [x] AIMP left paused on Humility at 0:42, volume 64, unmuted (it was playing it when the mission began).
      Left behind in AIMP, not removable without its window (hidden in the tray, would not show): one
      extra playlist tab holding the three test cloud tracks.
- [x] No code, version or docs shipped: the guide's "Your music in the cloud" already says B-Side cannot
      browse My Clouds without its own OneDrive access, and that stays true for a whole collection.
