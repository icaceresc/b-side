// B-Side worker: answers the sidebar panel with AIMP's state and passes the panel's controls to
// AIMP through the local helper (native/aimp-helper.ps1). No network port is opened.
import { createAimp } from './src/aimp.mjs'
import { createHandlers } from './src/player.mjs'

let aimp = null

export default function activate(orca, deps = {}) {
  aimp = deps.aimp ?? createAimp()
  const handlers = createHandlers({ aimp, ...deps.handlers })
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
  aimp?.close()
}
