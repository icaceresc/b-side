# b-side project context

active_plan: none

- The plugin lives at the repository root (`orca-plugin.json`), so Orca installs it with
  `orca plugin install icaceresc/b-side` and the install key is `icaceresc.b-side`.
- `install.ps1` prepares AIMP (Microsoft Store edition) and is not part of the plugin's runtime.
- `native/aimp-helper.ps1` is the only code that touches AIMP (Remote API, allow-listed commands).
