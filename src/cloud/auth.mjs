// Signing in to the person's OneDrive (Microsoft Graph) with the device code flow: B-Side shows a
// short code, the person approves it at microsoft.com/link on any device, and Microsoft gives
// B-Side a read-only grant (Files.Read) it can renew (offline_access).
//
// What is kept where:
//   refresh token   Orca's encrypted plugin secrets (`secrets:own`, the OS keyring), key SECRET_KEY,
//                   sealed with a key only the worker reads (vault.mjs: the panel can read the
//                   plugin's secrets too). Refused when Orca reports no keyring.
//                   (`secrets.protection` = 'unavailable').
//   access token    this worker's memory only, about an hour, renewed from the refresh token.
//   device code     memory, and sealed in the secrets while the person approves (15 minutes at
//                   most): Orca stops an idle worker, and the next one resumes the wait.
// No token, device code or token-endpoint answer is ever logged, stored elsewhere, sent to the panel
// or put in an error message: errors carry Microsoft's short error name (`authorization_declined`)
// and nothing else from the answer.

import { createVault } from './vault.mjs'

/** B-Side's own Microsoft app (a public client: no secret). Not a secret; empty until registered. */
export const CLIENT_ID = '0594d104-aae2-468b-8bc3-1c3d0d2b6958'
export const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
export const SCOPES = 'Files.Read offline_access'
export const SECRET_KEY = 'onedrive.refreshToken'
// Microsoft's page for personal accounts (/consumers); devicelogin is the work and school one.
export const DEFAULT_VERIFY_URI = 'https://www.microsoft.com/link'
// A sign-in waiting for approval, sealed, so a worker Orca stopped while idle picks it up again.
export const PENDING_KEY = 'onedrive.pending'

const VERIFY_HOSTS = new Set(['microsoft.com', 'www.microsoft.com', 'login.microsoft.com', 'login.microsoftonline.com', 'login.live.com'])
const EARLY_MS = 2 * 60 * 1000 // renew an access token this long before it expires
const FETCH_TIMEOUT_MS = 20000
const MAX_WAIT_MS = 15 * 60 * 1000

export function authError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/** Microsoft's error name from a token-endpoint answer, or null; nothing else is kept. */
const errorName = (body) => (body && typeof body.error === 'string' && /^[a-z_]{1,64}$/.test(body.error) ? body.error : null)

/** The verification page Microsoft named, when it is one of Microsoft's sign-in hosts. */
export function safeVerifyUri(uri) {
  try {
    const u = new URL(String(uri))
    if (u.protocol === 'https:' && VERIFY_HOSTS.has(u.hostname.toLowerCase()) && !u.username && !u.password) return u.href
  } catch {
    /* not a URL */
  }
  return DEFAULT_VERIFY_URI
}

const safeUserCode = (code) => (typeof code === 'string' && /^[A-Za-z0-9-]{4,24}$/.test(code) ? code : null)

async function postForm(fetchImpl, url, fields) {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  let res
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString(), signal, redirect: 'error' })
  } catch (error) {
    throw authError('offline', `Microsoft's sign-in service did not answer (${error?.name === 'TimeoutError' ? 'timeout' : 'network'})`)
  }
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, ok: res.ok, body }
}

/**
 * secrets: Orca's SecretsApi ({ get, set, delete }); protection: async () => 'os-keyring' |
 * 'unavailable' | null (unknown). Returns the sign-in state machine; one per worker.
 */
export function createAuth({ secrets, vault = createVault(), protection = async () => null, clientId = CLIENT_ID, fetch: fetchImpl = globalThis.fetch, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  let access = null // { token, expiresAt }
  let pending = null // { deviceCode, userCode, verifyUri, expiresAt, interval, cancelled }
  let lastError = null // a short code for the panel: 'declined', 'expired', ...
  let refreshing = null
  let signedIn = null // cached: whether a refresh token is stored
  // Rises on every sign-out and new sign-in: an answer that arrives for an older session is dropped,
  // so a renewal in flight cannot store a grant again after the person disconnected.
  let session = 0

  const configured = () => typeof clientId === 'string' && /^[0-9a-f-]{36}$/i.test(clientId)

  async function storedRefresh() {
    if (!secrets?.get) return null
    const sealed = await secrets.get(SECRET_KEY)
    const v = typeof sealed === 'string' && sealed ? await vault.open(sealed) : null
    signedIn = typeof v === 'string' && v.length > 0
    return signedIn ? v : null
  }

  async function keep(refreshToken, at) {
    if (typeof refreshToken !== 'string' || !refreshToken) return
    const sealed = await vault.seal(refreshToken)
    if (at !== session) throw authError('signed_out', 'Signed out meanwhile')
    await secrets.set(SECRET_KEY, sealed)
    if (at !== session) {
      // A sign-out ran while the secret was being written: undo the write.
      await Promise.resolve(secrets.delete?.(SECRET_KEY)).catch(() => {})
      throw authError('signed_out', 'Signed out meanwhile')
    }
    signedIn = true
  }

  async function forget() {
    access = null
    signedIn = false
    try {
      await secrets?.delete?.(SECRET_KEY)
    } catch {
      /* nothing stored */
    }
    await vault.destroy()
  }

  async function checkKeyring() {
    let p = null
    try {
      p = await protection()
    } catch {
      p = null
    }
    if (p === 'unavailable') throw authError('no_keyring', 'This PC gives Orca no protected place for secrets, so B-Side does not sign in')
    if (!secrets?.get || !secrets?.set) throw authError('no_keyring', 'Orca did not give B-Side its secrets')
  }

  async function accept(body, at, { needRefresh = false } = {}) {
    if (at !== session) throw authError('signed_out', 'Signed out meanwhile')
    if (typeof body?.access_token !== 'string' || !body.access_token) throw authError('auth_failed', 'Microsoft answered without a token')
    if (needRefresh && (typeof body.refresh_token !== 'string' || !body.refresh_token)) throw authError('auth_failed', 'Microsoft answered without a renewable grant')
    const seconds = Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600
    // The renewable grant is stored first: an access token B-Side cannot renew is not a sign-in.
    await keep(body.refresh_token, at)
    if (at !== session) throw authError('signed_out', 'Signed out meanwhile')
    access = { token: body.access_token, expiresAt: now() + seconds * 1000 }
  }

  // Waits for the person to approve the code, as often as Microsoft allows.
  async function wait(p) {
    let interval = p.interval
    while (!p.cancelled && now() < p.expiresAt) {
      await sleep(interval * 1000)
      if (p.cancelled) return
      let r
      try {
        r = await postForm(fetchImpl, `${AUTHORITY}/token`, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: p.deviceCode })
      } catch {
        continue // a network blip: try again at the next interval
      }
      if (p.cancelled) return
      if (r.ok) {
        await accept(r.body, p.session, { needRefresh: true })
        lastError = null
        log('onedrive: signed in')
        return
      }
      const name = errorName(r.body)
      if (name === 'authorization_pending') continue
      if (name === 'slow_down') {
        interval += 5
        continue
      }
      lastError = name === 'authorization_declined' ? 'declined' : name === 'expired_token' ? 'expired' : 'auth_failed'
      log(`onedrive: sign-in ended (${name ?? `HTTP ${r.status}`})`)
      return
    }
    if (!p.cancelled) lastError = 'expired'
  }

  const dropPending = () => Promise.resolve(secrets?.delete?.(PENDING_KEY)).catch(() => {})

  // Waits for approval in the background; the stored wait goes when it ends.
  function run(p) {
    pending = p
    p.done = wait(p)
      .catch((error) => {
        if (p.session !== session) return // signed out or restarted meanwhile
        lastError = error.code === 'no_keyring' ? 'no_keyring' : 'auth_failed'
        log(`onedrive: sign-in failed (${error.code ?? 'error'})`)
      })
      .finally(async () => {
        p.deviceCode = null
        if (pending === p) pending = null
        if (p.session === session) await dropPending()
      })
  }

  // A wait a previous worker started (Orca stops idle workers): picked up while it is still valid.
  async function resume() {
    if (!configured() || !secrets?.get) return
    const sealed = await secrets.get(PENDING_KEY)
    if (typeof sealed !== 'string' || !sealed) return
    let w = null
    try {
      w = JSON.parse((await vault.open(sealed)) ?? 'null')
    } catch {
      w = null
    }
    const userCode = safeUserCode(w?.u)
    if (!w || typeof w.d !== 'string' || !userCode || !(Number(w.e) > now()) || pending) {
      if (!pending) await dropPending()
      return
    }
    run({ deviceCode: w.d, userCode, verifyUri: safeVerifyUri(w.v), expiresAt: Number(w.e), interval: Math.max(1, Math.min(30, Number(w.i) || 5)), cancelled: false, session })
    log('onedrive: still waiting for the sign-in approval')
  }

  return {
    configured,

    /** { state: 'unconfigured'|'signed-out'|'pending'|'signed-in', code?, error? } for the panel. */
    async status() {
      if (!configured()) return { state: 'unconfigured' }
      if (!pending) await resume().catch(() => {})
      if (pending && !pending.cancelled && now() < pending.expiresAt) return { state: 'pending', code: { userCode: pending.userCode, verifyUri: pending.verifyUri, expiresAt: pending.expiresAt } }
      if (signedIn === null) await storedRefresh().catch(() => null)
      return signedIn ? { state: 'signed-in' } : lastError ? { state: 'signed-out', error: lastError } : { state: 'signed-out' }
    },

    /** Starts a sign-in: asks Microsoft for a code and waits for its approval in the background. */
    async start() {
      if (!configured()) throw authError('unconfigured', 'This version of B-Side has no Microsoft app id yet')
      await checkKeyring()
      if (pending) pending.cancelled = true
      const at = ++session
      access = null
      const r = await postForm(fetchImpl, `${AUTHORITY}/devicecode`, { client_id: clientId, scope: SCOPES })
      const userCode = safeUserCode(r.body?.user_code)
      if (!r.ok || typeof r.body?.device_code !== 'string' || !userCode) {
        log(`onedrive: no sign-in code (${errorName(r.body) ?? `HTTP ${r.status}`})`)
        throw authError('auth_failed', 'Microsoft did not give a sign-in code')
      }
      const expiresIn = Math.min(Number(r.body.expires_in) > 0 ? Number(r.body.expires_in) * 1000 : MAX_WAIT_MS, MAX_WAIT_MS)
      const p = { deviceCode: r.body.device_code, userCode, verifyUri: safeVerifyUri(r.body.verification_uri), expiresAt: now() + expiresIn, interval: Math.max(1, Math.min(30, Number(r.body.interval) || 5)), cancelled: false, session: at }
      if (at !== session) throw authError('auth_failed', 'Another sign-in started')
      await secrets.set(PENDING_KEY, await vault.seal(JSON.stringify({ d: p.deviceCode, u: p.userCode, v: p.verifyUri, e: p.expiresAt, i: p.interval })))
      lastError = null
      run(p)
      return { userCode, verifyUri: p.verifyUri, expiresAt: p.expiresAt }
    },

    cancel() {
      session++
      if (pending) pending.cancelled = true
      pending = null
      lastError = null
      void dropPending()
    },

    /** A valid access token for Graph; renews it when needed. Throws `signed_out` when there is none. */
    async token() {
      if (access && now() < access.expiresAt - EARLY_MS) return access.token
      refreshing ??= (async () => {
        const at = session
        const refresh = await storedRefresh()
        if (!refresh) throw authError('signed_out', 'Not signed in to OneDrive')
        const r = await postForm(fetchImpl, `${AUTHORITY}/token`, { grant_type: 'refresh_token', client_id: clientId, refresh_token: refresh, scope: SCOPES })
        if (r.ok) return accept(r.body, at)
        const name = errorName(r.body)
        log(`onedrive: renewing the sign-in failed (${name ?? `HTTP ${r.status}`})`)
        // Revoked, expired or changed password: the stored grant is useless; sign in again.
        if (name === 'invalid_grant' || name === 'interaction_required' || name === 'invalid_client' || name === 'unauthorized_client') {
          if (at !== session) throw authError('signed_out', 'Signed out meanwhile')
          await forget()
          lastError = 'revoked'
          throw authError('signed_out', 'The OneDrive sign-in is no longer valid: connect again')
        }
        throw authError(r.status >= 500 ? 'offline' : 'auth_failed', 'Microsoft did not renew the sign-in')
      })().finally(() => {
        refreshing = null
      })
      await refreshing
      if (!access) throw authError('signed_out', 'Not signed in to OneDrive')
      return access.token
    },

    /** Graph refused the access token (401): drop it so the next call renews it. */
    invalidate() {
      access = null
    },

    /** Signs out: forgets every token. Revoking B-Side's access is at account.live.com/consent/Manage. */
    async signOut() {
      session++
      if (pending) pending.cancelled = true
      pending = null
      lastError = null
      await dropPending()
      await forget()
      // A renewal that was already running drops its answer (session), then this clears again.
      await refreshing?.catch(() => {})
      await forget()
    },

    /** For tests: resolves when a running sign-in wait ends. */
    settled: () => pending?.done ?? Promise.resolve()
  }
}
