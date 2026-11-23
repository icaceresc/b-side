// Outbound HTTPS (OneDrive sign-in and Graph, the native helper's download) goes through the
// worker's fetch, which by default trusts only Node's bundled CAs. On a PC whose antivirus or
// proxy re-signs TLS with its own root (Kaspersky, ESET, a corporate proxy...), that root is in
// the Windows certificate store but not in Node's list, so every request ends in "fetch failed".
// trustSystemCertificates() adds the system store to the default CAs once, at activation: the
// bundled CAs (and NODE_EXTRA_CA_CERTS) are kept, nothing is ever removed. On a Node without
// tls.getCACertificates/setDefaultCACertificates (before 22.19 / 24.5) it changes nothing.
import nodeTls from 'node:tls'

/**
 * Trust the operating system's root certificates as well as Node's for every TLS client in this
 * process (fetch included). Returns how many certificates it added, or a reason it did not:
 * 'unavailable' (this Node cannot), 'none' (all already trusted) or 'failed'.
 */
export function trustSystemCertificates({ tls = nodeTls, log = () => {} } = {}) {
  if (typeof tls.getCACertificates !== 'function' || typeof tls.setDefaultCACertificates !== 'function') return 'unavailable'
  try {
    const current = tls.getCACertificates('default')
    const known = new Set(current)
    const added = tls.getCACertificates('system').filter((c) => !known.has(c) && known.add(c))
    if (!added.length) return 'none'
    tls.setDefaultCACertificates([...current, ...added])
    log(`tls: trusting ${added.length} certificates from the system store`)
    return added.length
  } catch (error) {
    log(`tls: cannot read the system certificates (${error.code ?? 'error'}: ${error.message}); using Node's`)
    return 'failed'
  }
}
