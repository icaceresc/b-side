// "Connect OneDrive": the panel's `onedrive.*` requests, answered from the sign-in (auth.mjs), Graph
// (graph.mjs) and the OneDrive library (library.mjs). The panel only ever gets the sign-in code to
// show, folder names and ids, counts and short error codes: never a token.
import { dirname, join } from 'node:path'
import { createAuth } from './auth.mjs'
import { createGraph } from './graph.mjs'
import { createCloudLibrary } from './library.mjs'
import { createVault } from './vault.mjs'

/**
 * secrets / storage: Orca's worker APIs; protection(): Orca's `secrets.protection` status.
 * onChange(): the OneDrive records changed (rebuild the library model).
 */
export function createOneDrive({ secrets = null, storage = null, protection, fetch, clientId, log = () => {}, onChange = () => {}, dir, now, sleep, keyFile }) {
  const api = { onChange: null }
  const changed = () => (api.onChange ?? onChange)()
  // The key that seals the grant sits beside the cloud folder (not in it: clear() removes that).
  const vault = createVault(keyFile ? { keyFile } : dir ? { keyFile: join(dirname(dir), 'onedrive.key') } : {})
  const auth = createAuth({ secrets, vault, protection, fetch, log, now, sleep, ...(clientId !== undefined ? { clientId } : {}) })
  const graph = createGraph({ auth, fetch, sleep })
  const signedIn = async () => (await auth.status()).state === 'signed-in'
  const cloud = createCloudLibrary({ graph, storage, log, onChange: changed, canSync: signedIn, ...(dir ? { dir } : {}), ...(now ? { now } : {}) })

  const status = async () => {
    await cloud.ensureLoaded()
    const a = await auth.status()
    if (a.state === 'signed-in') void cloud.touch().catch(() => {})
    return { ...a, ...cloud.status() }
  }

  const handlers = {
    'onedrive.status': status,

    'onedrive.connect': async () => {
      await auth.start()
      return status()
    },

    'onedrive.cancel': async () => {
      auth.cancel()
      return status()
    },

    // Signs out and forgets the folders, the index and the downloaded pictures and lyrics on this PC.
    'onedrive.disconnect': async () => {
      cloud.cancel()
      await auth.signOut()
      await cloud.clear()
      return status()
    },

    'onedrive.browse': async ({ id } = {}) => cloud.browse(id ?? null),

    'onedrive.setFolders': async ({ ids } = {}) => {
      const r = await cloud.setFolders(ids)
      return { ...r, ...(await status()) }
    },

    'onedrive.sync': async () => {
      if (!(await signedIn())) {
        const error = new Error('Not signed in to OneDrive')
        error.code = 'signed_out'
        throw error
      }
      void cloud.sync()
      return status()
    }
  }

  return Object.assign(api, { auth, graph, cloud, handlers })
}
