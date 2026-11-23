// Signing in to the person's OneDrive (Microsoft Graph) with the device code flow: B-Side shows a
// short code, the person approves it at microsoft.com/devicelogin on any device, and Microsoft gives
// B-Side a read-only grant (Files.Read) it can renew (offline_access).
//
// What is kept where:
//   refresh token   Orca's encrypted plugin secrets (`secrets:own`, the OS keyring), key SECRET_KEY.
//                   Refused when Orca reports no keyring (`secrets.protection` = 'unavailable').
//   access token    this worker's memory only, about an hour, renewed from the refresh token.
//   device code     memory only, while the person approves (15 minutes at most).
// No token, device code or token-endpoint answer is ever logged, stored elsewhere, sent to the panel
// or put in an error message: errors carry Microsoft's short error name (`authorization_declined`)
// and nothing else from the answer.

/** B-Side's own Microsoft app (a public client: no secret). Not a secret; empty until registered. */
export const CLIENT_ID = ''
export const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
export const SCOPES = 'Files.Read offline_access'
export const SECRET_KEY = 'onedrive.refreshToken'
export const DEFAULT_VERIFY_URI = 'https://microsoft.com/devicelogin'

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
export function createAuth({ secrets, protection = async () => null, clientId = CLIENT_ID, fetch: fetchImpl = globalThis.fetch, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  let access = null // { token, expiresAt }
  let pending = null // { deviceCode, userCode, verifyUri, expiresAt, interval, cancelled }
  let lastError = null // a short code for the panel: 'declined', 'expired', ...
  let refreshing = null
  let signedIn = null // cached: whether a refresh token is stored

  const configured = () => typeof clientId === 'string' && /^[0-9a-f-]{36}$/i.test(clientId)

  async function storedRefresh() {
    if (!secrets?.get) return null
    const v = await secrets.get(SECRET_KEY)
    signedIn = typeof v === 'string' && v.length > 0
    return signedIn ? v : null
  }

  async function keep(refreshToken) {
    if (typeof refreshToken !== 'string' || !refreshToken) return
    await secrets.set(SECRET_KEY, refreshToken)
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

  async function accept(body, { needRefresh = false } = {}) {
    if (typeof body?.access_token !== 'string' || !body.access_token) throw authError('auth_failed', 'Microsoft answered without a token')
    if (needRefresh && (typeof body.refresh_token !== 'string' || !body.refresh_token)) throw authError('auth_failed', 'Microsoft answered without a renewable grant')
    const seconds = Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600
    // The renewable grant is stored first: an access token B-Side cannot renew is not a sign-in.
    await keep(body.refresh_token)
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
        await accept(r.body, { needRefresh: true })
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

  return {
    configured,

    /** { state: 'unconfigured'|'signed-out'|'pending'|'signed-in', code?, error? } for the panel. */
    async status() {
      if (!configured()) return { state: 'unconfigured' }
      if (pending && !pending.cancelled && now() < pending.expiresAt) return { state: 'pending', code: { userCode: pending.userCode, verifyUri: pending.verifyUri, expiresAt: pending.expiresAt } }
      if (signedIn === null) await storedRefresh().catch(() => null)
      return signedIn ? { state: 'signed-in' } : lastError ? { state: 'signed-out', error: lastError } : { state: 'signed-out' }
    },

    /** Starts a sign-in: asks Microsoft for a code and waits for its approval in the background. */
    async start() {
      if (!configured()) throw authError('unconfigured', 'This version of B-Side has no Microsoft app id yet')
      await checkKeyring()
      if (pending) pending.cancelled = true
      const r = await postForm(fetchImpl, `${AUTHORITY}/devicecode`, { client_id: clientId, scope: SCOPES })
      const userCode = safeUserCode(r.body?.user_code)
      if (!r.ok || typeof r.body?.device_code !== 'string' || !userCode) {
        log(`onedrive: no sign-in code (${errorName(r.body) ?? `HTTP ${r.status}`})`)
        throw authError('auth_failed', 'Microsoft did not give a sign-in code')
      }
      const expiresIn = Math.min(Number(r.body.expires_in) > 0 ? Number(r.body.expires_in) * 1000 : MAX_WAIT_MS, MAX_WAIT_MS)
      const p = { deviceCode: r.body.device_code, userCode, verifyUri: safeVerifyUri(r.body.verification_uri), expiresAt: now() + expiresIn, interval: Math.max(1, Math.min(30, Number(r.body.interval) || 5)), cancelled: false }
      pending = p
      lastError = null
      p.done = wait(p)
        .catch((error) => {
          lastError = error.code === 'no_keyring' ? 'no_keyring' : 'auth_failed'
          log(`onedrive: sign-in failed (${error.code ?? 'error'})`)
        })
        .finally(() => {
          p.deviceCode = null
          if (pending === p) pending = null
        })
      return { userCode, verifyUri: p.verifyUri, expiresAt: p.expiresAt }
    },

    cancel() {
      if (pending) pending.cancelled = true
      pending = null
      lastError = null
    },

    /** A valid access token for Graph; renews it when needed. Throws `signed_out` when there is none. */
    async token() {
      if (access && now() < access.expiresAt - EARLY_MS) return access.token
      refreshing ??= (async () => {
        const refresh = await storedRefresh()
        if (!refresh) throw authError('signed_out', 'Not signed in to OneDrive')
        const r = await postForm(fetchImpl, `${AUTHORITY}/token`, { grant_type: 'refresh_token', client_id: clientId, refresh_token: refresh, scope: SCOPES })
        if (r.ok) return accept(r.body)
        const name = errorName(r.body)
        log(`onedrive: renewing the sign-in failed (${name ?? `HTTP ${r.status}`})`)
        // Revoked, expired or changed password: the stored grant is useless; sign in again.
        if (name === 'invalid_grant' || name === 'interaction_required' || name === 'invalid_client' || name === 'unauthorized_client') {
          await forget()
          lastError = 'revoked'
          throw authError('signed_out', 'The OneDrive sign-in is no longer valid: connect again')
        }
        throw authError(r.status >= 500 ? 'offline' : 'auth_failed', 'Microsoft did not renew the sign-in')
      })().finally(() => {
        refreshing = null
      })
      await refreshing
      return access.token
    },

    /** Graph refused the access token (401): drop it so the next call renews it. */
    invalidate() {
      access = null
    },

    /** Signs out: forgets every token. Revoking B-Side's access is at account.live.com/consent/Manage. */
    async signOut() {
      if (pending) pending.cancelled = true
      pending = null
      lastError = null
      await forget()
    },

    /** For tests: resolves when a running sign-in wait ends. */
    settled: () => pending?.done ?? Promise.resolve()
  }
}
