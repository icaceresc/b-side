<p align="center">
  <b>English</b> &nbsp;·&nbsp; <a href="README.es.md">Español</a> &nbsp;·&nbsp; <a href="README.de.md">Deutsch</a> &nbsp;·&nbsp; <a href="README.ja.md">日本語</a> &nbsp;·&nbsp; <a href="README.zh.md">中文</a> &nbsp;·&nbsp; <a href="README.ru.md">Русский</a>
</p>

<h1 align="center"><img src="docs/icon.png" width="72" height="72" alt=""><br>B-Side</h1>

<p align="center"><b>Your music library, in Orca's sidebar.</b><br>
Browse, search and play the music on your Windows PC or in your OneDrive, with synced lyrics and three skins.<br>Plays through AIMP, a free player.</p>

<p align="center">
  <img src="docs/hero.webp" width="100%" alt="An editor window with B-Side in its sidebar, playing a demo track with synced lyrics: the CD skin takes the colours of two covers, then Vinyl and Cassette, each with its logo turning">
</p>

<p align="center">
  <a href="https://github.com/icaceresc/b-side/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/icaceresc/b-side/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-6e7781?style=flat-square"></a>
</p>

### Your whole collection, a keystroke away

Artists, albums, tracks and genres from your own folders, with covers and the format read from
each file (FLAC · 24-bit · 96&nbsp;kHz). Press `/` or `Ctrl+K` and type: `rio` finds *Río*.

<p align="center"><img src="docs/readme-library.webp" width="100%" alt="The panel dragged wide: a grid of demo albums beside Playing with synced lyrics"></p>

### Lyrics that follow the song

Synced lyrics light up line by line; A− and A+ set their size. They come from your files' tags
or a `.lrc` beside the track.

### Three skins, and a logo that plays along

CD wears the colours of every cover, Vinyl is leather and old gold, Cassette is an 80s tape deck in
pixels. Press the logo to pick one; it turns while the music plays and stops when you pause.

<p align="center"><img src="docs/readme-skins.webp" width="100%" alt="The same panel in the CD, Vinyl and Cassette skins"></p>

### Your OneDrive, without downloading it

Connect your personal OneDrive from the panel with a code you approve on Microsoft's page, from any
device. Its albums join the library with covers, artist pictures and lyrics, searchable at once; only
the track you play is downloaded, by AIMP. Read only.

### Local and private

B-Side only reads your music folders and never changes your files. No account, no tracking: with
music on your PC, its only network use is a one-time 0.5&nbsp;MB download of its own helper from
GitHub, checked by SHA-256, and you can turn that off.
[What it reads, writes and downloads](docs/guide.md#privacy).

## Install

In a terminal inside Orca:

```powershell
orca plugin install icaceresc/b-side
```

Orca lists what B-Side may do and prints the same command with `--approve <code>`: run it. Then open
**B-Side** in the right sidebar and pick your music folders.

**Needs** Windows 10 or 11, [Orca](https://github.com/stablyai/orca) 1.4.248 or later and
[AIMP from the Microsoft Store](https://apps.microsoft.com/detail/9PCLLLH15SMT) (free). New to AIMP? `install.ps1` sets it up for you:
[Install in detail](docs/guide.md#install).

## Learn more

[Choose your folders](docs/guide.md#library-folders) ·
[Everything it does](docs/guide.md#features) ·
[Troubleshooting](docs/guide.md#troubleshooting) ·
[Privacy](docs/guide.md#privacy) ·
[Update](docs/guide.md#update) ·
[Your music in the cloud](docs/guide.md#two-ways-to-use-it) ·
[Connect your OneDrive](docs/guide.md#onedrive) ·
[How it works](docs/guide.md#how-it-works) ·
[Check the helper](docs/guide.md#verify-helper) ·
[Develop](docs/guide.md#develop)

---

<sub>[MIT](LICENSE). An independent project, not affiliated with AIMP or Orca. The images and the
demo music are made for B-Side: invented artists, original synthetic music and generated covers. [Credits](docs/guide.md#credits).</sub>
