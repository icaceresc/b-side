# Mission: B-Side 2.3.2, listed and beautiful

status: completed
commits: authorized

Owner decision on size (task task_f9042fe42be7, 2026-11-21): meet every criterion to be published
in Orca "without sacrificing beauty"; a much shorter README with more signal; a new hero (the old
one was ugly) and a new announcement MP4; two independent reviews (visual design, README
content). Bar set by the owner: good enough for the Orca team or the community to feature it.
Branch `icaceresc/bside-2.3.2` from `main` at 67bc672. Authorized without a new GO: PR, merge to
`main` with green CI, tag and release `v2.3.2`, `orca plugin update icaceresc.b-side` (approve
when Orca asks), `C:\Dev\Music\b-side` on `main`, design skills already authorized, review agents.
Never: force-push, history rewrites, deleting releases, ending processes this mission did not
start, the owner's music in public material. Gallery copies go to the Companion's
`bside-showcase` folder (replacing the previous ones).

## Decisions (A2, the Worker's)

- Catalog criteria in `project/catalog-checklist.md`. The size threshold is not public; measured
  every repository in `status.json`: listed plugins reach 40 MB of tree and 19.5 MB of images,
  B-Side 2.1.2 was listed at 10.1 MB, 2.3.1 held at 16.0 MB; no plain metric separates them, so
  the budget stays far under B-Side's own listed size: 5 MB tree, 3 MB images, 1.25 MB per file,
  enforced in the CI (`scripts/size-budget.mjs`).
- README: what it is in a line, the hero, four benefits (three with one picture each), a
  one-command install with requirements, links to the guide. Everything else moved as it was
  (already in six languages) to `docs/guide.md` and `docs/guide.{lang}.md`, with the same anchors
  in every language. Sources: README guides agree on title and one-liner, a visual, 3-7
  benefit-led features, a quick start and moving detail to linked docs.
- Hero without words, so it serves every language: a generic editor window (not Orca's interface)
  with B-Side in its sidebar, synced lyrics, the logo alive; CD in two covers' colours, Vinyl,
  Cassette, then back to CD; the backdrop glows in the cover's colour; 1600x1100 for retina at
  GitHub's width. Within a segment only the logo moves (one panel render per segment, the logo's
  corner per frame), with clean cuts between skins as pressing the logo does: that is also what
  keeps an animated WebP small.
- Store images at 1600x1000 (Orca's recommended 16:10), rendered at 2x and reduced, WebP q90: about
  80 KB each instead of about 1 MB. Cover: the three skins fanned out. Icon: a record with depth.
- Panel fix found while making the hero: synced lyrics' padding was a percentage of the width, so
  in a short sidebar the box overflowed onto the controls; now measured in `cqh` of the box.

## Steps

- [x] Catalog criteria gathered and measured; checklist written.
- [x] README x6 rewritten short; guides x6 split out; installer links to the guide.
- [x] Store images regenerated (icon, cover, screenshots, four after the design review); unused images removed.
- [x] Hero final: `docs/hero.webp` 1600x1100, 985 KB, 9.6 s loop, rounded corners on a transparent
      page; announcement MP4 1920x1080, 25.9 s, 3.0 MB, the demo track's audio (peak -1.1 dB),
      paused with the Vinyl logo.
- [x] Two independent reviews by separate agents. Content: AIMP Store link, a "Local and private"
      benefit instead of a memory figure, localized skin names, guide leftovers, two-line tagline,
      CJK line joins. Design: Windows window controls, wider sidebar, crisp covers only, four store
      shots (the lyrics shot repeated the skins layout), README images without their headline and
      with rounded corners, fuller lyrics boxes, the artist line on two lines in a tall panel.
      Not taken: hiding the language flag in captures (it is the real interface).
- [x] GitHub: light and dark at 1280 wide checked; the phone capture overflows because headless
      Chrome does not emulate a phone viewport (the README itself is fluid). Orca's plugin page:
      checked after install (below).
- [x] Checks: `node --test` 189/189, `orca plugin validate` and `check` ok, size budget 3.04 MB of 5
      (images 1.59 of 3). PR #21 CI green (lint with "No binaries in the tree" and "Size budget",
      native with the pinned SHA-256, tests x64 and arm64, attest), merged as ca68609; tag `v2.3.2`
      CI run 44977016899 green; release `v2.3.2` with `bside-helper-x64.exe`, `bside-helper-arm64.exe`
      and `SHA256SUMS` from that run (`sha256sum -c` OK, pins ok, attested at ca686099c044) and
      `b-side-2.3.2-demo.mp4`; tag tree 3.04 MB, no executables.
- [x] `orca plugin update icaceresc.b-side` 2.3.1 -> 2.3.2, approval kept (nothing new asked); the
      helper for 2.3.2 downloaded in 623 ms (SHA-256 as pinned), the 2.3.1 copy removed, the native
      helper running from `%LOCALAPPDATA%\B-Side\helper\2.3.2` (9.1 MB). Orca's own plugin page was
      not opened: the owner's Orca window showed private conversations; the store data was checked in
      the catalog instead.
- [x] Catalog after its run of 2026-11-22T02:51:39Z: `status.json` has `icaceresc/b-side` **listed**
      at `v2.3.2`; `orca-catalog.json` lists `icaceresc.b-side` 2.3.2 (commit ca686099c044) with the
      manifest's description, icon 256x256, cover 1600x1000 and 4 screenshots. The orca.dev page
      still described the v2.3.1 check right after (it is regenerated separately).
- [x] Gallery copies in the Companion's `bside-showcase` folder (hero, MP4, three GitHub captures;
      the old media replaced, its `index.html` left as it was); `C:\Dev\Music\b-side` on `main`;
      branches cleaned; plan completed.
