// B-Side worker: answers the sidebar panel with AIMP's state and passes the panel's controls to
// AIMP through the local helper: the native one (downloaded from this version's release and
// checked against its pinned SHA-256, see src/native-helper.mjs), or native/aimp-helper.ps1 while
// there is none or when it cannot start. No network port is opened.
import { createAimp } from './src/aimp.mjs'
import { connectNativeHelper } from './src/native-helper.mjs'
import { createHandlers } from './src/player.mjs'

let aimp = null
let native = null

export default function activate(orca, deps = {}) {
  const log = (m) => orca.log?.(m)
  if (deps.aimp) aimp = deps.aimp
  else {
    native = connectNativeHelper({ settings: orca.settings ?? null, log, ...deps.native })
    aimp = native.attach(createAimp({ nativePath: null, ready: native.ready, log }))
  }
  const handlers = createHandlers({ aimp, settings: orca.settings ?? null, log, ...deps.handlers })
  for (const [name, handler] of Object.entries(handlers)) {
    orca.panels.handle(name, async (input) => {
      try {
        return await handler(input ?? {})
      } catch (error) {
        if (error.code !== 'aimp_closed') orca.log?.(`${name}: ${error.code ?? 'error'} ${error.message}`)
        // Orca keeps only its own error codes across plugin.request, so B-Side's codes travel
        // in the answer and the panel turns them back into errors.
        return { error: { code: error.code ?? 'aimp_error', message: error.message } }
      }
    })
  }
}

export function deactivate() {
  native?.dispose()
  aimp?.close()
}
