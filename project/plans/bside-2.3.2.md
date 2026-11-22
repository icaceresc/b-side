# Mission: B-Side 2.3.2, listed and beautiful

status: active
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
  (already in six languages) to `docs/guide.md` and `docs/guide.<lang>.md`, with the same anchors
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
- [x] Store images regenerated (icon, cover, five screenshots); unused images removed.
- [ ] Hero final; announcement MP4 with the demo track's audio.
- [ ] Two independent reviews (visual design; README content and signal) and their fixes.
- [ ] How it looks on GitHub (light, dark, desktop, phone) and in Orca's plugin page.
- [ ] Checks, PR, CI, merge, tag, release `v2.3.2` with helper assets and MP4; install; catalog status.
- [ ] Gallery copies; clone on `main`; branches cleaned; plan completed.
