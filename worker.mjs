// B-Side worker: answers the sidebar panel with AIMP's state and passes the panel's controls to
// AIMP through the local helper: the native one (downloaded from this version's release and
// checked against its pinned SHA-256, see src/native-helper.mjs), or native/aimp-helper.ps1 while
// there is none or when it cannot start. No network port is opened. With "Connect OneDrive" the
// worker also talks to Microsoft (sign-in and Graph, read only; see src/cloud/).
import { createAimp } from './src/aimp.mjs'
import { createOneDrive } from './src/cloud/onedrive.mjs'
import { redact } from './src/cloud/redact.mjs'
import { connectNativeHelper } from './src/native-helper.mjs'
import { cleanCloudLists } from './src/playback.mjs'
import { createHandlers } from './src/player.mjs'

let aimp = null
let native = null

// Orca's `secrets.protection`: 'os-keyring', 'unavailable', or null when this Orca cannot say.
const secretsProtection = (orca) => async () => {
  if (!orca.host?.has?.('secrets.protection')) return null
  const r = await orca.host.call('secrets.protection')
  return r?.status ?? null
}

export default function activate(orca, deps = {}) {
  // Everything B-Side logs goes through redact(): no token can reach Orca's plugin log.
  const log = (m) => orca.log?.(redact(m))
  // One-off cloud play lists a previous worker left behind (they may hold download URLs).
  void cleanCloudLists(deps.queueDir).catch(() => {})
  const onedrive = deps.onedrive !== undefined ? deps.onedrive : createOneDrive({ secrets: orca.secrets ?? null, storage: orca.storage ?? null, protection: secretsProtection(orca), log, ...deps.onedriveOptions })
  if (deps.aimp) aimp = deps.aimp
  else {
    native = connectNativeHelper({ settings: orca.settings ?? null, log, ...deps.native })
    aimp = native.attach(createAimp({ nativePath: null, ready: native.ready, log }))
  }
  const handlers = createHandlers({ aimp, settings: orca.settings ?? null, log, onedrive, ...deps.handlers })
  for (const [name, handler] of Object.entries(handlers)) {
    orca.panels.handle(name, async (input) => {
      try {
        return await handler(input ?? {})
      } catch (error) {
        if (error.code !== 'aimp_closed') log(`${name}: ${error.code ?? 'error'} ${error.message}`)
        // Orca keeps only its own error codes across plugin.request, so B-Side's codes travel
        // in the answer and the panel turns them back into errors.
        return { error: { code: error.code ?? 'aimp_error', message: redact(error.message) } }
      }
    })
  }
}

export function deactivate() {
  native?.dispose()
  aimp?.close()
}
