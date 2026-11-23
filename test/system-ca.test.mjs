import assert from 'node:assert/strict'
import { createServer } from 'node:https'
import nodeTls from 'node:tls'
import { test } from 'node:test'
import { trustSystemCertificates } from '../src/system-ca.mjs'

// A throwaway self-signed root for 127.0.0.1, made for this test only (it signs nothing else):
// it stands in for the root an antivirus such as Kaspersky puts in the Windows store.
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgtAJlRnkyLsL/j00S
kPKzNMHu0sqZ+wUq4LHRABFVFNmhRANCAARIL3T+6sp0fGQomsgYNXVm26l+uBC7
47UgvmvE80WqfMEhtN+MKLy81Uqh/2yYwfgZUVYd/ySv+Ux1s9GdoPzZ
-----END PRIVATE KEY-----
`
const TEST_ROOT = `-----BEGIN CERTIFICATE-----
MIIBwTCCAWegAwIBAgIUfl5nmRy+H1qgZMzMTb6CRy4/S9AwCgYIKoZIzj0EAwIw
JzElMCMGA1UEAwwcQi1TaWRlIHRlc3Qgcm9vdCAobG9jYWxob3N0KTAgFw0yNjEx
MjMxMzA0MzVaGA8yMTI2MTAzMDEzMDQzNVowJzElMCMGA1UEAwwcQi1TaWRlIHRl
c3Qgcm9vdCAobG9jYWxob3N0KTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABEgv
dP7qynR8ZCiayBg1dWbbqX64ELvjtSC+a8TzRap8wSG034wovLzVSqH/bJjB+BlR
Vh3/JK/5THWz0Z2g/NmjbzBtMB0GA1UdDgQWBBRQWzUJ/KVxQHMFNRsbwZIJPgWu
wzAfBgNVHSMEGDAWgBRQWzUJ/KVxQHMFNRsbwZIJPgWuwzAaBgNVHREEEzARhwR/
AAABgglsb2NhbGhvc3QwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBF
AiA1g7y5ODZxLDuWn7Ai5zJKZM95ZJYOXJm0SIfoNBadvwIhAPpoj6oPS0f1WhWI
5ksNTTF5DBYTRBhigEiB0Gy0d4oI
-----END CERTIFICATE-----
`

/** A tls module whose stores are plain lists, recording what becomes the default. */
function fakeTls({ def = ['A', 'B'], system = ['B', 'C'], fail = null } = {}) {
  const t = {
    set: null,
    getCACertificates(kind) {
      if (fail && kind === 'system') throw Object.assign(new Error(fail), { code: 'ERR_TEST' })
      return kind === 'system' ? system : def
    },
    setDefaultCACertificates(certs) { t.set = certs },
  }
  return t
}

test('adds the system certificates to the default ones, keeping them all', () => {
  const tls = fakeTls()
  const logs = []
  assert.equal(trustSystemCertificates({ tls, log: (m) => logs.push(m) }), 1)
  assert.deepEqual(tls.set, ['A', 'B', 'C'])
  assert.match(logs[0], /trusting 1 certificates from the system store/)
})

test('changes nothing when the system adds no certificate', () => {
  const tls = fakeTls({ system: ['A'] })
  assert.equal(trustSystemCertificates({ tls }), 'none')
  assert.equal(tls.set, null)
})

test('keeps the current behaviour on a Node without system certificates', () => {
  assert.equal(trustSystemCertificates({ tls: {} }), 'unavailable')
  assert.equal(trustSystemCertificates({ tls: { getCACertificates: () => [] } }), 'unavailable')
})

test('keeps the current behaviour when the system store cannot be read', () => {
  const tls = fakeTls({ fail: 'no store' })
  const logs = []
  assert.equal(trustSystemCertificates({ tls, log: (m) => logs.push(m) }), 'failed')
  assert.equal(tls.set, null)
  assert.match(logs[0], /cannot read the system certificates \(ERR_TEST: no store\); using Node's/)
})

test('reads the real system store without failing', { skip: typeof nodeTls.getCACertificates !== 'function' && 'this Node has no tls.getCACertificates' }, () => {
  // Read only: no setDefaultCACertificates on the real module here.
  const system = nodeTls.getCACertificates('system')
  assert.ok(Array.isArray(system))
})

test('fetch trusts a root that is only in the system store once it is added',
  { skip: typeof nodeTls.setDefaultCACertificates !== 'function' && 'this Node has no tls.setDefaultCACertificates' },
  async (t) => {
    const server = createServer({ key: TEST_KEY, cert: TEST_ROOT }, (req, res) => res.end('ok'))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }))
    const url = `https://127.0.0.1:${server.address().port}/`

    // Before: Node's own CAs do not know the root, as with an antivirus that re-signs TLS.
    await assert.rejects(fetch(url), (e) => /certificate/i.test(`${e.cause?.code} ${e.cause?.message}`))

    // The real tls module, with the test root standing in for the Windows store.
    const tls = { getCACertificates: (kind) => (kind === 'system' ? [TEST_ROOT] : nodeTls.getCACertificates(kind)), setDefaultCACertificates: nodeTls.setDefaultCACertificates }
    const bundled = nodeTls.getCACertificates('bundled').length
    assert.equal(trustSystemCertificates({ tls }), 1)
    assert.equal(nodeTls.getCACertificates('default').length >= bundled + 1, true, "Node's CAs are kept")

    const res = await fetch(url)
    assert.equal(await res.text(), 'ok')
  })
