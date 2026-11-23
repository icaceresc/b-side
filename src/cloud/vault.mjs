// The refresh token is sealed before it goes into Orca's plugin secrets. Orca also lets the plugin's
// panel read those secrets, so a script injected into the panel could otherwise read the grant;
// sealed, the secret is useless without a key only the worker reads: a random AES-256-GCM key in
// %LOCALAPPDATA%\B-Side\onedrive.key (the panel has no file access). Signing out deletes both.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const PREFIX = 'v1:'

export function defaultKeyFile(env = process.env) {
  return join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'B-Side', 'onedrive.key')
}

export function createVault({ keyFile = defaultKeyFile() } = {}) {
  let key = null

  async function load(create) {
    if (key) return key
    try {
      const k = await readFile(keyFile)
      if (k.length === 32) return (key = k)
    } catch {
      /* no key yet */
    }
    if (!create) return null
    const k = randomBytes(32)
    await mkdir(dirname(keyFile), { recursive: true })
    // 'wx': never overwrite a key another worker just wrote.
    await writeFile(keyFile, k, { flag: 'wx', mode: 0o600 }).catch(async (error) => {
      if (error.code !== 'EEXIST') throw error
    })
    key = null
    return load(false)
  }

  return {
    async seal(text) {
      const k = await load(true)
      if (!k) throw Object.assign(new Error('No key to protect the sign-in'), { code: 'no_keyring' })
      const iv = randomBytes(12)
      const c = createCipheriv('aes-256-gcm', k, iv)
      const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()])
      return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')
    },

    /** The sealed text, or null when it cannot be opened (no key, another key, tampered). */
    async open(sealed) {
      if (typeof sealed !== 'string' || !sealed.startsWith(PREFIX)) return null
      const k = await load(false)
      if (!k) return null
      try {
        const raw = Buffer.from(sealed.slice(PREFIX.length), 'base64')
        const d = createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12))
        d.setAuthTag(raw.subarray(12, 28))
        return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
      } catch {
        return null
      }
    },

    async destroy() {
      key = null
      await rm(keyFile, { force: true }).catch(() => {})
    }
  }
}
