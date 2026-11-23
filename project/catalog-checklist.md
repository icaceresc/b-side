# Orca catalog checklist

Every criterion found for listing B-Side in Orca's Community catalog and passing a person's review,
its source, and how B-Side meets it. Checked on 2026-11-21 for 2.3.2; recheck sources on a new
release (the catalog's indexer is not public, so some rules are inferred, and say so).

Sources:

- **[add]** orca.dev/plugins/add ("Add your plugin": steps, labels, "What gets a plugin left out").
- **[policy]** `docs/reference/plugin-listing-policy.md` in stablyai/orca.
- **[manifest]** the manifest reference (`orca skills get orca-plugin-authoring --reference
  references/manifest.md`, generated from Orca's schema).
- **[catalog]** `docs/reference/plugin-catalog.md` in stablyai/orca (catalog format, images).
- **[entry]** `src/main/plugins/catalog/plugin-catalog-release-entry.ts` in stablyai/orca.
- **[status]** stablyai/orca-community-plugins `status.json` and the plugin's page on orca.dev.
- **[measured]** tree sizes of every repository in `status.json`, at the ref it checked (listed
  plugins through `stablyai/orca-community-mirror`), measured with the GitHub API.

## Listing (automatic)

| Criterion | Source | B-Side |
|---|---|---|
| Public GitHub repository, not a fork, not archived | [add] | `icaceresc/b-side`: public, not a fork, not archived |
| Topic `orca-plugin` | [add] | set |
| A `vX.Y.Z` tag; the newest one is listed, pinned to its commit and file hash | [add], [entry] | every release is tagged `v` plus the manifest version |
| Only the tagged commit's tree is checked, not the history | [entry] (`materializePluginGitTree({ commit })`, `hashPluginTree`) | history keeps old binaries; the tree has none |
| Manifest format 2, valid for Orca's validator (`pnpm validate:plugin`) | [add], [manifest] | `orca plugin validate .` ok |
| A license in the manifest or a LICENSE GitHub detects | [add] | `"license": "MIT"` and `LICENSE` (GitHub: MIT) |
| No binary files: executables, native modules, archives, symlinks; images and WOFF/WOFF2 are fine, TTF/OTF are not | [add], [status] (2.2.2–2.3.0 rejected as `binary-files`) | none since 2.3.1; the CI fails on tracked binaries ("No binaries in the tree"); fonts are WOFF2; the native helper is downloaded at run time from the release and checked against a pinned SHA-256 |
| Publisher is the repository owner; no reserved or imitated names; no id an official plugin uses | [add], [policy] | no `publisher` (deprecated; Orca derives `icaceresc`); id `b-side` |
| Not on the takedown list | [add] | not listed there |
| Not too large for automatic listing: "If the category is size, making the plugin smaller and pushing a new version tag also clears it" | [status] (2.3.1 held as `under-review: size`) | threshold not public. Inferred from [measured]: B-Side 2.1.2 was listed at 10.1 MB and 2.3.1 held at 16.0 MB, while other plugins with larger trees were listed, so the rule is not a plain total; 2.3.2 keeps far under both B-Side figures: budget 5 MB tree, 3 MB images, 1.25 MB per file (`scripts/size-budget.mjs`, CI step "Size budget") |

## Review (a person, when a version is held)

| Criterion | Source | B-Side |
|---|---|---|
| Free: no paywalls, keys, trials or locked features; "a plugin may connect to a paid service the user already has, such as their own API account" | [policy] (rechecked 2026-11-23 for 2.4: no rule against network or OAuth) | free and MIT; "Connect OneDrive" signs in to the user's own Microsoft account, read only (`Files.Read`), with B-Side's own public client id |
| No impersonation of a person, company or product | [policy] | "not affiliated with AIMP or Orca" in the README; AIMP named only as the player it controls; the hero shows a generic editor, not Orca's interface |
| Safe code: no malware, nothing that harms files or accounts | [policy] | reads the chosen folders only, writes only in `%LOCALAPPDATA%\B-Side` and its own storage; never writes music files; OneDrive access is read only and nothing is written, moved or deleted there; the sign-in is sealed in `secrets:own` and Disconnect removes it (independent security review, project/plans/bside-onedrive.md) |
| No obfuscated or minified-to-hide code | [policy] | plain source, no bundles; the helper's Rust source is in `native/helper`; its builds are CI-built, attested, and pinned by SHA-256 |
| No tracking, analytics or data collection | [policy] | none; network only for the helper download (once per version, can be turned off), while a cloud track plays a TCP connect to `graph.microsoft.com:443` that sends nothing, and, only with OneDrive connected by the user, Microsoft's sign-in, Graph (read only) and OneDrive's download servers; nothing goes anywhere else (guide, Privacy and `onedrive`) |
| No explicit content in names, descriptions, icon, cover, screenshots | [policy] | demo library: invented artists, original synthetic music, generated covers |
| A plugin that runs code says so, and asks only for what it needs | [add] ("Full access"), [manifest] | `trusted-worker` (it must start the helper); capabilities `storage:own`, `settings:own` and, since 2.4, `secrets:own` (the OneDrive sign-in) |

## Store page (manifest)

| Criterion | Source | B-Side |
|---|---|---|
| `name`, `version` (semver), `description` of one or two sentences | [manifest] | "B-Side"; 2.3.2; two sentences, saying Windows only and AIMP |
| `author`, `repository`, `homepage` (https) | [manifest] | set |
| `icon`: PNG or WEBP, static, square, at least 128×128, at most 256 KB | [manifest] | `docs/icon.png` 256×256, 61 KB |
| `cover`: PNG, JPEG or WEBP, static, at least 800×500, 16:10 recommended (1600×1000), at most 1024 KB, with `alt` | [manifest], [add] | `docs/cover.webp` 1600×1000, 94 KB, alt set |
| `screenshots`: at most 6, PNG, JPEG or WEBP, static, at least 1280×800, 16:10 recommended, at most 1536 KB each, 8 MB together, each with `alt` (and an optional caption) | [manifest], [add] | four at 1600×1000 (library, search, skins, palette), 71–88 KB each, alt and caption set |
| Images must not imitate Orca's trust badges | [catalog] | none do |
| `engines.orca` covers every field used | [manifest] | `>=1.4.248` |

## Before tagging a release

1. `node --test`, `orca plugin validate .`, `orca plugin check .`, `node scripts/size-budget.mjs`.
2. `git ls-files` has no binary (the CI checks it).
3. After the tag's CI run: release assets (`bside-helper-*.exe`, `SHA256SUMS`) equal the pins.
4. After the catalog's next run (about every 30 minutes): `status.json` and the orca.dev page.
