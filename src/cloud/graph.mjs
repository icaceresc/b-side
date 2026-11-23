// Microsoft Graph, read only: B-Side's only door to the person's OneDrive. Every request is a GET to
// graph.microsoft.com with the access token from auth.mjs, or a GET without any token to a
// pre-authenticated download URL Graph handed out (small sidecar files: covers, artist pictures,
// .lrc). Nothing here writes, moves or deletes in OneDrive. Errors carry a short code and the HTTP
// status, never a URL with a token or an answer's body.
export const GRAPH = 'https://graph.microsoft.com/v1.0'
const GRAPH_ORIGIN = 'https://graph.microsoft.com'
const TIMEOUT_MS = 30000
const MAX_RETRIES = 3
const MAX_JSON_BYTES = 16 * 1024 * 1024

export function graphError(code, message, status = null) {
  const error = new Error(message)
  error.code = code
  if (status) error.status = status
  return error
}

/** A Graph URL B-Side may send its token to: https on graph.microsoft.com, v1.0 only. */
export function isGraphUrl(url) {
  try {
    const u = new URL(url)
    return u.origin === GRAPH_ORIGIN && u.pathname.startsWith('/v1.0/') && !u.username && !u.password
  } catch {
    return false
  }
}

/** A download URL Graph handed out: https, no credentials in it, never a Graph API URL. */
export function isDownloadUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !u.username && !u.password && u.origin !== GRAPH_ORIGIN
  } catch {
    return false
  }
}

const retryAfterMs = (res, attempt) => {
  const s = Number(res.headers?.get?.('retry-after'))
  return Number.isFinite(s) && s > 0 ? Math.min(s, 60) * 1000 : 1000 * 2 ** attempt
}

/**
 * auth: { token(), invalidate() } from auth.mjs. Returns { get(pathOrUrl), pages(pathOrUrl),
 * download(url, { maxBytes }) }.
 */
export function createGraph({ auth, fetch: fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  async function get(pathOrUrl) {
    const url = pathOrUrl.startsWith('https://') ? pathOrUrl : GRAPH + pathOrUrl
    if (!isGraphUrl(url)) throw graphError('invalid', 'Not a Microsoft Graph address')
    let renewed = false
    for (let attempt = 0; ; attempt++) {
      const token = await auth.token()
      let res
      try {
        res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' })
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * 2 ** attempt)
          continue
        }
        throw graphError('offline', `OneDrive did not answer (${error?.name === 'TimeoutError' ? 'timeout' : 'network'})`)
      }
      if (res.status === 401 && !renewed) {
        renewed = true
        auth.invalidate()
        continue
      }
      if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < MAX_RETRIES) {
        await sleep(retryAfterMs(res, attempt))
        continue
      }
      if (!res.ok) {
        const code = res.status === 401 ? 'signed_out' : res.status === 403 ? 'forbidden' : res.status === 404 ? 'not_found' : res.status === 410 ? 'gone' : res.status === 429 ? 'busy' : 'graph_error'
        throw graphError(code, `OneDrive refused the request (HTTP ${res.status})`, res.status)
      }
      const length = Number(res.headers?.get?.('content-length'))
      if (length > MAX_JSON_BYTES) throw graphError('graph_error', 'OneDrive answered too much')
      try {
        return await res.json()
      } catch {
        throw graphError('graph_error', 'OneDrive answered something B-Side cannot read')
      }
    }
  }

  return {
    get,

    /** Every item of a paged Graph list; `onPage(page)` sees each page (for deltaLink). */
    async *pages(pathOrUrl) {
      let next = pathOrUrl
      let guard = 0
      while (next) {
        if (++guard > 10000) throw graphError('graph_error', 'Too many pages')
        const page = await get(next)
        yield page
        next = typeof page['@odata.nextLink'] === 'string' ? page['@odata.nextLink'] : null
        if (next && !isGraphUrl(next)) throw graphError('graph_error', 'OneDrive pointed outside Graph')
      }
    },

    /**
     * The bytes behind a pre-authenticated download URL, without B-Side's token; null when bigger
     * than maxBytes (it stops reading there).
     */
    async download(url, { maxBytes = 0 } = {}) {
      if (!isDownloadUrl(url)) throw graphError('invalid', 'Not a download address')
      let res
      try {
        res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
      } catch {
        throw graphError('offline', 'OneDrive did not send the file')
      }
      if (!res.ok) throw graphError('graph_error', `OneDrive did not send the file (HTTP ${res.status})`, res.status)
      const length = Number(res.headers?.get?.('content-length'))
      if (length > maxBytes) {
        await res.body?.cancel?.().catch(() => {})
        return null
      }
      const chunks = []
      let total = 0
      if (res.body?.getReader) {
        const reader = res.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.length
          if (total > maxBytes) {
            await reader.cancel().catch(() => {})
            return null
          }
          chunks.push(Buffer.from(value))
        }
        return Buffer.concat(chunks)
      }
      const buf = Buffer.from(await res.arrayBuffer())
      return buf.length > maxBytes ? null : buf
    }
  }
}
