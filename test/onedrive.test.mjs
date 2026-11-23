// "Connect OneDrive" against a fake Microsoft (sign-in and Graph): the device code flow, renewing
// and losing the grant, Graph's guard rails, the OneDrive library (delta, names, covers, lyrics),
// My Clouds addresses, cloud playback through a one-off list, and that no token ever reaches a log,
// the plugin's storage, an answer to the panel or a file on disk.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import activate from '../worker.mjs'
import { AUTHORITY, createAuth, DEFAULT_VERIFY_URI, safeVerifyUri, SECRET_KEY } from '../src/cloud/auth.mjs'
import { createGraph, isDownloadUrl, isGraphUrl } from '../src/cloud/graph.mjs'
import { aimpUriOf, createCloudLibrary, tagsFromAudio, VIRTUAL_ROOT } from '../src/cloud/library.mjs'
import { createOneDrive } from '../src/cloud/onedrive.mjs'
import { redact } from '../src/cloud/redact.mjs'
import { createVault } from '../src/cloud/vault.mjs'
import { createLibrary } from '../src/library/index.mjs'
import { cleanCloudLists, CLOUD_PREFIX, createPlayback } from '../src/playback.mjs'

const SCRATCH = fileURLToPath(new URL('../scratch/', import.meta.url))
const dirs = []
async function tempDir() {
  await mkdir(SCRATCH, { recursive: true })
  const d = await mkdtemp(join(SCRATCH, 'tmp-od-'))
  dirs.push(d)
  return d
}
after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true })
})

const CLIENT = '11111111-2222-3333-4444-555555555555'
const STORAGE_GUID = '{6A8983B7-2720-46B7-A442-42648D27228B}'
// Recognisable fake credentials: none of these strings may appear anywhere B-Side writes.
const SECRETS = {
  device: 'DEVICECODE-secret-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  access1: 'EwBAccessToken-ONE-secret-' + 'x'.repeat(40),
  access2: 'EwBAccessToken-TWO-secret-' + 'y'.repeat(40),
  refresh1: 'M.C5_BAY.Refresh-ONE-secret!' + 'z'.repeat(40),
  refresh2: 'M.C5_BAY.Refresh-TWO-secret!' + 'w'.repeat(40),
  tempauth: 'tempauth-secret-' + 'q'.repeat(40)
}
const leaks = (text) => Object.values(SECRETS).filter((s) => String(text).includes(s) || String(text).includes(s.slice(0, 24)))

const json = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  body: null,
  arrayBuffer: async () => new ArrayBuffer(0)
})
const bytes = (buf) => ({
  status: 200,
  ok: true,
  headers: { get: (k) => (k.toLowerCase() === 'content-length' ? String(buf.length) : null) },
  json: async () => ({}),
  body: null,
  arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})

// ---------------------------------------------------------------- a fake OneDrive

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9])
const LRC = Buffer.from('[00:01.00]Hey, hey\n[00:03.50]Bye bye bye\n')
const folder = (id, name, parent) => ({ id, name, folder: { childCount: 1 }, parentReference: { id: parent } })
const fileItem = (id, name, parent, extra = {}) => ({ id, name, file: { mimeType: 'x' }, size: 1000, lastModifiedDateTime: '2026-11-20T10:00:00Z', parentReference: { id: parent }, ...extra })
const TREE = {
  root: { id: 'R!27487', root: {}, name: 'root' },
  'R!27487': { id: 'R!27487', root: {}, name: 'root' },
  'M!s1': { ...folder('M!s1', 'Música', 'R!27487') },
  'H!s1': { ...folder('H!s1', 'Hi-Fi Collection - DLC', 'M!s1') },
  'X!s1': { ...folder('X!s1', 'Other', 'R!27487') }
}
const DELTA_1 = [
  { ...TREE['H!s1'] },
  folder('A!s1', 'Armando', 'H!s1'),
  folder('N!s1', '_NSYNC', 'A!s1'),
  folder('L!s1', '2000 - No Strings Attached', 'N!s1'),
  fileItem('J!s1', 'artist.jpg', 'N!s1', { size: JPEG.length }),
  fileItem('C!s1', 'cover.jpg', 'L!s1', { size: JPEG.length }),
  fileItem('T!s1', '01 Bye Bye Bye.flac', 'L!s1', { size: 26000000, audio: { title: 'Bye Bye Bye', artist: '*NSYNC', albumArtist: '*NSYNC', album: 'No Strings Attached', year: 2000, track: 1, duration: 200000, genre: 'Pop' } }),
  fileItem('T!s2', "02 It's Gonna Be Me.flac", 'L!s1', { size: 25000000 }),
  fileItem('Y!s1', '01 Bye Bye Bye.lrc', 'L!s1', { size: LRC.length }),
  folder('F!s1', '4 Strings', 'A!s1'),
  folder('G!s1', 'Take Me Away (Into The Night)', 'F!s1'),
  fileItem('T!s3', '01 Take Me Away.flac', 'G!s1')
]
const DELTA_2 = [
  { id: 'T!s2', deleted: { state: 'deleted' }, parentReference: { id: 'L!s1' } },
  fileItem('T!s4', '03 Space Cowboy.flac', 'L!s1')
]

function fakeMicrosoft({ approveAfter = 1, deviceError = null, refreshError = null, downloadBase = 'https://download.example/' } = {}) {
  const calls = []
  let polls = 0
  let deltaRound = 0
  const state = { gone: false }
  const fetch = async (url, init = {}) => {
    const auth = init.headers?.authorization ?? null
    calls.push({ url, auth, method: init.method ?? 'GET', body: init.body ?? null })
    if (url === `${AUTHORITY}/devicecode`) {
      const form = new URLSearchParams(init.body)
      assert.equal(form.get('client_id'), CLIENT)
      assert.equal(form.get('scope'), 'Files.Read offline_access')
      return json(200, { device_code: SECRETS.device, user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 5, message: 'ignored' })
    }
    if (url === `${AUTHORITY}/token`) {
      const form = new URLSearchParams(init.body)
      if (form.get('grant_type') === 'refresh_token') {
        if (refreshError) return json(400, { error: refreshError, error_description: `AADSTS70000: bad grant ${SECRETS.refresh1}` })
        assert.ok([SECRETS.refresh1, SECRETS.refresh2].includes(form.get('refresh_token')))
        return json(200, { access_token: SECRETS.access2, refresh_token: SECRETS.refresh2, expires_in: 3600 })
      }
      assert.equal(form.get('device_code'), SECRETS.device)
      if (deviceError) return json(400, { error: deviceError })
      if (++polls <= approveAfter) return json(400, { error: 'authorization_pending', error_description: 'pending' })
      return json(200, { access_token: SECRETS.access1, refresh_token: SECRETS.refresh1, expires_in: 3600, token_type: 'Bearer' })
    }
    if (url.startsWith('https://download.example/')) {
      assert.equal(auth, null, 'a download URL never gets the token')
      if (url.includes('Y!s1')) return bytes(LRC)
      return bytes(JPEG)
    }
    assert.ok(url.startsWith('https://graph.microsoft.com/v1.0/'), url)
    assert.match(auth ?? '', /^Bearer EwBAccessToken/)
    const path = decodeURIComponent(new URL(url).pathname.replace('/v1.0', ''))
    if (path === '/me/drive/root') return json(200, TREE.root)
    if (path === '/me/drive/root/children') return json(200, { value: [TREE['M!s1'], TREE['X!s1'], fileItem('Z!s1', 'notes.txt', 'R!27487')] })
    if (path === '/me/drive/items/M!s1/children') return json(200, { value: [TREE['H!s1']] })
    if (path === '/me/drive/items/H!s1/delta') {
      if (url.includes('token=round2')) {
        if (state.gone) return json(410, { error: { code: 'resyncRequired' } })
        deltaRound = 2
        return json(200, { value: DELTA_2, '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/drive/items/H!s1/delta?token=round3' })
      }
      if (url.includes('token=round3')) return json(200, { value: [], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/drive/items/H!s1/delta?token=round3' })
      // The first listing, in two pages.
      if (url.includes('page=2')) return json(200, { value: DELTA_1.slice(6), '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/drive/items/H!s1/delta?token=round2' })
      return json(200, { value: DELTA_1.slice(0, 6), '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive/items/H!s1/delta?page=2' })
    }
    const item = /^\/me\/drive\/items\/([^/]+)$/.exec(path)
    if (item) {
      const id = item[1]
      if (new URL(url).searchParams.get('$select')?.includes('downloadUrl')) return json(200, { id, '@microsoft.graph.downloadUrl': `${downloadBase}${id}/${SECRETS.tempauth}?tempauth=${SECRETS.tempauth}` })
      if (TREE[id]) return json(200, TREE[id])
      return json(404, { error: { code: 'itemNotFound' } })
    }
    return json(404, { error: { code: 'itemNotFound' } })
  }
  return { fetch, calls, state, get deltaRound() { return deltaRound } }
}

function memoryStore() {
  const data = new Map()
  return {
    data,
    get: async (k) => (data.has(k) ? data.get(k) : null),
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
    keys: async () => [...data.keys()]
  }
}

const noSleep = async () => {}

// A vault with its key in a scratch folder, and a secret store holding a sealed grant.
async function sealedStore(token) {
  const vault = createVault({ keyFile: join(await tempDir(), 'onedrive.key') })
  const secrets = memoryStore()
  if (token) secrets.data.set(SECRET_KEY, await vault.seal(token))
  return { vault, secrets }
}

// ---------------------------------------------------------------- sign-in

test('device code: the code to show, the grant kept only in secrets, the access token only in memory', async () => {
  const ms = fakeMicrosoft({ approveAfter: 2 })
  const { vault, secrets } = await sealedStore()
  const logs = []
  const auth = createAuth({ secrets, vault, protection: async () => 'os-keyring', clientId: CLIENT, fetch: ms.fetch, sleep: noSleep, log: (m) => logs.push(m) })
  assert.deepEqual(await auth.status(), { state: 'signed-out' })
  const shown = await auth.start()
  assert.deepEqual(Object.keys(shown).sort(), ['expiresAt', 'userCode', 'verifyUri'])
  assert.equal(shown.userCode, 'ABCD-EFGH')
  assert.equal(shown.verifyUri, 'https://microsoft.com/devicelogin')
  await auth.settled()
  assert.deepEqual(await auth.status(), { state: 'signed-in' })
  assert.deepEqual([...secrets.data.keys()], [SECRET_KEY])
  // Sealed: what Orca stores (and the panel could read) is useless without the worker's key.
  assert.deepEqual(leaks(secrets.data.get(SECRET_KEY)), [])
  assert.equal(await vault.open(secrets.data.get(SECRET_KEY)), SECRETS.refresh1)
  assert.equal(await auth.token(), SECRETS.access1)
  // Three polls: two "pending", then the grant.
  assert.equal(ms.calls.filter((c) => c.url.endsWith('/token')).length, 3)
  assert.deepEqual(leaks(logs.join('\n')), [])
})

test('device code: declined, expired and slow_down end or pace the wait; nothing is stored', async () => {
  for (const [error, code] of [['authorization_declined', 'declined'], ['expired_token', 'expired'], ['bad_verification_code', 'auth_failed']]) {
    const ms = fakeMicrosoft({ deviceError: error })
    const { vault, secrets } = await sealedStore()
    const auth = createAuth({ secrets, vault, clientId: CLIENT, fetch: ms.fetch, sleep: noSleep })
    await auth.start()
    await auth.settled()
    assert.deepEqual(await auth.status(), { state: 'signed-out', error: code })
    assert.equal(secrets.data.size, 0)
  }
  const waits = []
  let n = 0
  const fetch = async (url, init) => {
    if (url.endsWith('/devicecode')) return json(200, { device_code: SECRETS.device, user_code: 'WXYZ-1234', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 5 })
    return ++n === 1 ? json(400, { error: 'slow_down' }) : json(200, { access_token: SECRETS.access1, refresh_token: SECRETS.refresh1, expires_in: 3600 })
  }
  const auth = createAuth({ ...(await sealedStore()), clientId: CLIENT, fetch, sleep: async (ms) => void waits.push(ms) })
  await auth.start()
  await auth.settled()
  assert.deepEqual(waits, [5000, 10000])
})

test('sign-in refuses without a client id or a protected secret store', async () => {
  const ms = fakeMicrosoft()
  const none = createAuth({ secrets: memoryStore(), clientId: '', fetch: ms.fetch })
  assert.deepEqual(await none.status(), { state: 'unconfigured' })
  await assert.rejects(none.start(), { code: 'unconfigured' })
  const bare = createAuth({ secrets: memoryStore(), protection: async () => 'unavailable', clientId: CLIENT, fetch: ms.fetch })
  await assert.rejects(bare.start(), { code: 'no_keyring' })
  const noSecrets = createAuth({ secrets: null, clientId: CLIENT, fetch: ms.fetch })
  await assert.rejects(noSecrets.start(), { code: 'no_keyring' })
  assert.equal(ms.calls.length, 0, 'nothing reached Microsoft')
})

test('only Microsoft sign-in pages are offered; a code is letters, digits and dashes', () => {
  assert.equal(safeVerifyUri('https://microsoft.com/devicelogin'), 'https://microsoft.com/devicelogin')
  assert.equal(safeVerifyUri('https://www.microsoft.com/link'), 'https://www.microsoft.com/link')
  for (const bad of ['http://microsoft.com/devicelogin', 'https://evil.example/devicelogin', 'https://microsoft.com.evil.example/', 'https://user:pw@microsoft.com/', 'javascript:alert(1)', null]) assert.equal(safeVerifyUri(bad), DEFAULT_VERIFY_URI, String(bad))
})

test('renewing: a new grant replaces the old; a revoked one is forgotten and signs out', async () => {
  let t = 0
  const ms = fakeMicrosoft()
  const { vault, secrets } = await sealedStore(SECRETS.refresh1)
  const auth = createAuth({ secrets, vault, clientId: CLIENT, fetch: ms.fetch, now: () => t })
  assert.equal(await auth.token(), SECRETS.access2)
  assert.equal(await vault.open(secrets.data.get(SECRET_KEY)), SECRETS.refresh2, 'the rotated grant is kept')
  assert.equal(await auth.token(), SECRETS.access2, 'cached while valid')
  t += 3600 * 1000
  assert.equal(await auth.token(), SECRETS.access2)
  assert.equal(ms.calls.length, 2)

  const logs = []
  const revoked = fakeMicrosoft({ refreshError: 'invalid_grant' })
  const { vault: v2, secrets: s2 } = await sealedStore(SECRETS.refresh1)
  const a2 = createAuth({ secrets: s2, vault: v2, clientId: CLIENT, fetch: revoked.fetch, log: (m) => logs.push(m) })
  await assert.rejects(a2.token(), (e) => e.code === 'signed_out' && leaks(e.message).length === 0)
  assert.equal(s2.data.size, 0)
  assert.deepEqual(await a2.status(), { state: 'signed-out', error: 'revoked' })
  assert.deepEqual(leaks(logs.join('\n')), [], 'the error description holding a token is never logged')
})

test('sign out forgets the grant', async () => {
  const { vault, secrets } = await sealedStore(SECRETS.refresh1)
  const auth = createAuth({ secrets, vault, clientId: CLIENT, fetch: fakeMicrosoft().fetch })
  await auth.token()
  await auth.signOut()
  assert.equal(secrets.data.size, 0)
  await assert.rejects(auth.token(), { code: 'signed_out' })
})

test('a grant stored without the worker key opens as nothing, and a tampered one too', async () => {
  const { vault } = await sealedStore()
  assert.equal(await vault.open(SECRETS.refresh1), null, 'plain text is not a sealed grant')
  const sealed = await vault.seal(SECRETS.refresh1)
  assert.equal(await vault.open(sealed.slice(0, -4) + 'AAAA'), null)
  const other = (await sealedStore()).vault
  assert.equal(await other.open(sealed), null, 'another key')
})

test('signing out while a renewal is in flight stores nothing again', async () => {
  let release
  const gate = new Promise((r) => (release = r))
  const { vault, secrets } = await sealedStore(SECRETS.refresh1)
  const fetch = async (url, init) => {
    await gate
    return json(200, { access_token: SECRETS.access2, refresh_token: SECRETS.refresh2, expires_in: 3600 })
  }
  const auth = createAuth({ secrets, vault, clientId: CLIENT, fetch })
  const renewing = auth.token()
  await new Promise((r) => setImmediate(r))
  const out = auth.signOut()
  release()
  await assert.rejects(renewing, { code: 'signed_out' })
  await out
  assert.equal(secrets.data.size, 0, 'the rotated grant was not written back')
  assert.deepEqual(await auth.status(), { state: 'signed-out' })
  await assert.rejects(auth.token(), { code: 'signed_out' })
})

test('signing out while the sign-in wait is answered stores nothing', async () => {
  let release
  const gate = new Promise((r) => (release = r))
  const { vault, secrets } = await sealedStore()
  const fetch = async (url) => {
    if (url.endsWith('/devicecode')) return json(200, { device_code: SECRETS.device, user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 1 })
    await gate
    return json(200, { access_token: SECRETS.access1, refresh_token: SECRETS.refresh1, expires_in: 3600 })
  }
  const auth = createAuth({ secrets, vault, clientId: CLIENT, fetch, sleep: noSleep })
  await auth.start()
  const done = auth.settled()
  await new Promise((r) => setImmediate(r))
  await auth.signOut()
  release()
  await done
  assert.equal(secrets.data.size, 0)
  assert.deepEqual(await auth.status(), { state: 'signed-out' })
})

// ---------------------------------------------------------------- Graph

test('Graph: the token goes only to graph.microsoft.com v1.0; downloads go without it', async () => {
  assert.equal(isGraphUrl('https://graph.microsoft.com/v1.0/me/drive'), true)
  for (const u of ['http://graph.microsoft.com/v1.0/x', 'https://graph.microsoft.com/beta/x', 'https://graph.microsoft.com.evil/v1.0/x', 'https://evil.example/v1.0/x', 'https://u:p@graph.microsoft.com/v1.0/x']) assert.equal(isGraphUrl(u), false, u)
  assert.equal(isDownloadUrl('https://public.bn.files.1drv.com/x?tempauth=1'), true)
  assert.equal(isDownloadUrl('http://public.bn.files.1drv.com/x'), false)
  assert.equal(isDownloadUrl('https://graph.microsoft.com/v1.0/x'), false)
  const sent = []
  const graph = createGraph({ auth: { token: async () => SECRETS.access1, invalidate() {} }, fetch: async (url, init) => (sent.push({ url, init }), json(200, {})) })
  await assert.rejects(graph.get('https://evil.example/v1.0/me'), { code: 'invalid' })
  await assert.rejects(graph.download('https://graph.microsoft.com/v1.0/me'), { code: 'invalid' })
  assert.equal(sent.length, 0)
})

test('Graph: a refused token is renewed once; throttling waits as asked; errors carry no URL', async () => {
  let n = 0
  let invalidated = 0
  const waits = []
  const graph = createGraph({
    auth: { token: async () => SECRETS.access1, invalidate: () => invalidated++ },
    sleep: async (ms) => void waits.push(ms),
    fetch: async () => {
      n++
      if (n === 1) return json(401, {})
      if (n === 2) return json(429, {}, { 'retry-after': '3' })
      return json(200, { ok: 1 })
    }
  })
  assert.deepEqual(await graph.get('/me/drive'), { ok: 1 })
  assert.equal(invalidated, 1)
  assert.deepEqual(waits, [3000])
  const failing = createGraph({ auth: { token: async () => SECRETS.access1, invalidate() {} }, fetch: async () => json(403, {}) })
  await assert.rejects(failing.get('/me/drive/items/x?tempauth=zz'), (e) => e.code === 'forbidden' && !/tempauth|graph\.microsoft/.test(e.message))
})

test('Graph: a download stops at its size cap', async () => {
  const big = Buffer.alloc(5000, 1)
  const graph = createGraph({ auth: { token: async () => '', invalidate() {} }, fetch: async () => bytes(big) })
  assert.equal(await graph.download('https://download.example/x', { maxBytes: 1000 }), null)
  assert.equal((await graph.download('https://download.example/x', { maxBytes: 10000 })).length, 5000)
})

// ---------------------------------------------------------------- the OneDrive library

async function connected({ ms = fakeMicrosoft(), storage = memoryStore() } = {}) {
  const dir = await tempDir()
  const secrets = memoryStore()
  secrets.data.set(SECRET_KEY, await createVault({ keyFile: join(dir, 'onedrive.key') }).seal(SECRETS.refresh1))
  const logs = []
  const od = createOneDrive({ secrets, storage, protection: async () => 'os-keyring', clientId: CLIENT, fetch: ms.fetch, sleep: noSleep, dir: join(dir, 'cloud'), log: (m) => logs.push(m) })
  return { od, ms, dir, secrets, storage, logs }
}

test('choosing folders: browse shows folders only; the chosen one is listed with delta, in pages', async () => {
  const { od, storage } = await connected()
  const top = await od.handlers['onedrive.browse']({})
  assert.deepEqual(top.folders.map((f) => f.name), ['Música', 'Other'])
  assert.equal(top.folder.id, null)
  const inside = await od.handlers['onedrive.browse']({ id: 'M!s1' })
  assert.deepEqual(inside.folders.map((f) => [f.id, f.name]), [['H!s1', 'Hi-Fi Collection - DLC']])
  for (const id of ['../../me', '..', '.', '!x']) await assert.rejects(od.handlers['onedrive.browse']({ id }), { code: 'invalid' }, id)
  await od.handlers['onedrive.setFolders']({ ids: ['H!s1'] })
  await od.cloud.sync()
  const st = await od.handlers['onedrive.status']()
  assert.equal(st.state, 'signed-in')
  assert.deepEqual(st.folders, [{ id: 'H!s1', name: 'Hi-Fi Collection - DLC', tracks: 3 }])
  assert.deepEqual(storage.data.get('onedrive'), { folders: [{ id: 'H!s1', name: 'Hi-Fi Collection - DLC' }], aimpStorage: null, aimpRoot: null })
  const paths = od.cloud.records().map((r) => r.path)
  assert.ok(paths.includes(`${VIRTUAL_ROOT}H!s1\\Armando\\_NSYNC\\2000 - No Strings Attached\\01 Bye Bye Bye.flac`))
  assert.ok(paths.every((p) => p.startsWith(VIRTUAL_ROOT)))
})

test('the library model: artist and album from the folders, tags from OneDrive, cover and artist picture', async () => {
  const { od, dir } = await connected()
  await od.handlers['onedrive.setFolders']({ ids: ['H!s1'] })
  await od.cloud.sync()
  const thumbs = []
  const helper = { request: async (cmd, args) => (cmd === 'musicFolder' ? null : cmd === 'thumb' ? (thumbs.push(args.path), JPEG.toString('base64')) : null) }
  const library = createLibrary({ helper, cacheDir: join(dir, 'cache'), cloud: od.cloud })
  await library.ensureLoaded()
  const { albums } = await library.handlers['library.albums']()
  assert.deepEqual(albums.map((a) => [a.artist, a.title, a.tracks, a.cloudOnly]), [
    ['*NSYNC', 'No Strings Attached', 2, true],
    ['4 Strings', 'Take Me Away (Into The Night)', 1, true]
  ])
  const nsync = albums[0]
  const { tracks } = await library.handlers['library.album']({ id: nsync.id })
  assert.deepEqual(tracks.map((t) => [t.number, t.title, t.lyrics]), [[1, 'Bye Bye Bye', true], [2, "It's Gonna Be Me", false]])
  // The cover is cloud.jpg, downloaded once (without the token) and shrunk by the helper.
  const img = await library.handlers['library.image']({ id: nsync.cover })
  assert.match(img.dataUrl, /^data:image\/jpeg;base64,/)
  assert.equal(thumbs.length, 1)
  assert.ok(thumbs[0].startsWith(join(dir, 'cloud', 'files')), 'the helper reads the downloaded copy')
  assert.equal((await readdir(join(dir, 'cloud', 'thumbs'))).length, 1, 'its thumbnail is kept with the OneDrive files')
  assert.equal((await readdir(join(dir, 'cache')).catch(() => [])).includes('images'), false, 'not among the local thumbnails')
  const { artists } = await library.handlers['library.artists']()
  assert.ok(artists.find((a) => a.name === '*NSYNC').image, 'artist.jpg in the artist folder')
  // Search, without any download.
  const hits = await library.handlers['library.search']({ q: 'bye' })
  assert.deepEqual(hits.tracks.map((t) => t.title), ['Bye Bye Bye'])
  // Nothing the panel gets holds a path or an item id.
  const answer = JSON.stringify([albums, tracks, artists, hits])
  assert.doesNotMatch(answer, /b-side-onedrive|T!s1|H!s1/)
})

test('a later sync fetches only what changed; a forgotten delta lists everything again', async () => {
  const { od } = await connected()
  await od.handlers['onedrive.setFolders']({ ids: ['H!s1'] })
  await od.cloud.sync()
  await od.cloud.sync() // round 2: one deleted, one new
  const names = od.cloud.records().filter((r) => r.kind === 'audio').map((r) => r.path.split('\\').pop()).sort()
  assert.deepEqual(names, ['01 Bye Bye Bye.flac', '01 Take Me Away.flac', '03 Space Cowboy.flac'])

  const again = await connected()
  await again.od.handlers['onedrive.setFolders']({ ids: ['H!s1'] })
  await again.od.cloud.sync()
  again.ms.state.gone = true
  await again.od.cloud.sync() // 410 on round 2: the first listing again
  assert.equal(again.od.cloud.records().filter((r) => r.kind === 'audio').length, 3)
  assert.equal(again.od.cloud.status().error, null)
})

test("tags from OneDrive's audio facet, only what it has", () => {
  assert.deepEqual(tagsFromAudio({ title: ' Song ', track: 3, year: 1999, duration: 61234.4, genre: 'Pop', bitrate: 900 }, 'x.flac'), {
    title: 'Song', artist: '', albumArtist: '', album: '', year: 1999, number: 3, disc: null, genres: ['Pop'], durationMs: 61234, codec: 'FLAC', lossless: true
  })
  assert.equal(tagsFromAudio(null, 'x.flac'), null)
})

test("My Clouds addresses match AIMP's own (read from its saved lists)", () => {
  // AIMP 4.60's address of a DLC track, ids shortened: every folder is name/id but the file's own.
  const uri = aimpUriOf({
    storage: STORAGE_GUID,
    root: 'B4EDA7E33536282D!27487',
    chain: [{ name: 'Música', id: 'M!s1' }, { name: 'Hi-Fi Collection - DLC', id: 'H!s1' }],
    items: { 'A!s1': { p: 'H!s1' }, 'N!s1': { p: 'A!s1' }, 'L!s1': { p: 'N!s1' } },
    folderId: 'H!s1',
    fileId: 'T!s1',
    parentId: 'L!s1',
    relFolders: ['Armando', '_NSYNC', '2000 - No Strings Attached'],
    ext: 'flac'
  })
  assert.equal(uri, `cloud://${STORAGE_GUID}/Root/B4EDA7E33536282D!27487/Música/M!s1/Hi-Fi Collection - DLC/H!s1/Armando/A!s1/_NSYNC/N!s1/2000 - No Strings Attached/T!s1.flac`)
  assert.equal(aimpUriOf({ storage: STORAGE_GUID, root: 'R', chain: [{ name: 'a/b', id: 'X' }], items: {}, folderId: 'X', fileId: 'F', parentId: 'X', relFolders: [], ext: 'flac' }), null, 'a slash in a name would bend the address')
})

test('playing: a download link until AIMP shows My Clouds has this OneDrive, then cloud://', async () => {
  const { od, storage } = await connected()
  await od.handlers['onedrive.setFolders']({ ids: ['H!s1'] })
  await od.cloud.sync()
  const path = `${VIRTUAL_ROOT}H!s1\\Armando\\_NSYNC\\2000 - No Strings Attached\\01 Bye Bye Bye.flac`
  const first = await od.cloud.playEntry(path)
  assert.equal(first.kind, 'url')
  assert.equal(od.cloud.pathOf(first.entry), path, 'the playing link maps back to the track')
  // A My Clouds address of another OneDrive teaches nothing; one through the chosen folder does.
  assert.equal(await od.cloud.learnAimp(`cloud://${STORAGE_GUID}/Root/OTHER!1/Stuff/S!1/x/F!9.flac`), false)
  assert.equal(await od.cloud.learnAimp(`cloud://${STORAGE_GUID}/Root/B4EDA7E33536282D!27487/Música/M!s1/Hi-Fi Collection - DLC/H!s1/Armando/A!s1/4 Strings/F!s1/Take Me Away (Into The Night)/T!s3.flac`), true)
  assert.deepEqual(storage.data.get('onedrive').aimpStorage, STORAGE_GUID)
  const second = await od.cloud.playEntry(path)
  assert.deepEqual(second, { kind: 'cloud', entry: `cloud://${STORAGE_GUID}/Root/B4EDA7E33536282D!27487/Música/M!s1/Hi-Fi Collection - DLC/H!s1/Armando/A!s1/_NSYNC/N!s1/2000 - No Strings Attached/T!s1.flac` })
  assert.equal(od.cloud.pathOf(second.entry), path)
  assert.equal((await od.handlers['onedrive.status']()).aimp, true)
})

test('only an https download address goes to AIMP', async () => {
  for (const base of ['file:///C:/Users/x/', '\\\\host\\share\\', 'http://download.example/', 'https://graph.microsoft.com/v1.0/']) {
    const { od } = await connected({ ms: fakeMicrosoft({ downloadBase: base }) })
    await od.handlers['onedrive.setFolders']({ ids: ['H!s1'] })
    await od.cloud.sync()
    await assert.rejects(od.cloud.playEntry(`${VIRTUAL_ROOT}H!s1\\Armando\\_NSYNC\\2000 - No Strings Attached\\01 Bye Bye Bye.flac`), { code: 'graph_error' }, base)
  }
})

test('disconnect forgets the grant, the folders, the index and the downloaded files', async () => {
  const { od, secrets, storage, dir } = await connected()
  await od.handlers['onedrive.setFolders']({ ids: ['H!s1'] })
  await od.cloud.sync()
  assert.ok(await od.cloud.localCopy(`${VIRTUAL_ROOT}H!s1\\Armando\\_NSYNC\\2000 - No Strings Attached\\cover.jpg`))
  const st = await od.handlers['onedrive.disconnect']()
  assert.equal(st.state, 'signed-out')
  assert.equal(secrets.data.size, 0)
  assert.equal(storage.data.has('onedrive'), false)
  assert.deepEqual(await readdir(dir), [], 'the cloud folder (index, pictures, thumbnails) and the key are gone')
  assert.equal(od.cloud.records().length, 0)
})

// ---------------------------------------------------------------- playing cloud tracks

function fakeAimp() {
  const s = { file: '', state: 'stopped', lists: [], opened: [], inserted: [] }
  return {
    s,
    call: async (cmd, args) => {
      if (cmd === 'state') return { running: true, state: s.state, positionMs: 0, track: { active: Boolean(s.file), fileName: s.file } }
      if (cmd === 'openFile' || cmd === 'insertFile') {
        const text = await readFile(args.path, 'utf8')
        s.lists.push(text)
        ;(cmd === 'openFile' ? s.opened : s.inserted).push(args.path)
        if (cmd === 'openFile') {
          s.file = /\.m3u8$/i.test(args.path) ? text.split('\n')[1] : args.path
          s.state = 'playing'
        }
        return 'store'
      }
      return null
    }
  }
}

test('a cloud album plays from the chosen track as a one-off list, deleted once AIMP plays it', async () => {
  const dir = await tempDir()
  const aimp = fakeAimp()
  const album = ['01 A.flac', '02 B.flac', '03 C.flac'].map((n, i) => ({ id: `t${i}`, path: `${VIRTUAL_ROOT}F!1\\Art\\Alb\\${n}`, cloud: true }))
  const playback = createPlayback({
    call: aimp.call,
    resolveTracks: async () => album,
    albumTracks: async () => album,
    cloudEntry: async (path) => ({ kind: 'url', entry: `https://download.example/${path.split('\\').pop()}?tempauth=${SECRETS.tempauth}` }),
    dir,
    sleep: noSleep
  })
  await playback.playAlbum({ albumId: 'l1', trackId: 't1' })
  assert.equal(aimp.s.opened.length, 1)
  assert.match(aimp.s.opened[0], new RegExp(`${CLOUD_PREFIX}.*\\.m3u8$`))
  assert.deepEqual(aimp.s.lists[0].trim().split('\n').slice(1).map((l) => l.split('?')[0]), ['https://download.example/02 B.flac', 'https://download.example/03 C.flac'], 'from the chosen track: AIMP never fetches the first')
  assert.deepEqual(await readdir(dir), [], 'the list (with its short-lived links) is gone once AIMP plays it')
  // "Add to queue" appends through a list too, removed later.
  const timers = []
  const p2 = createPlayback({ call: aimp.call, resolveTracks: async () => album, albumTracks: async () => album, cloudEntry: async () => ({ kind: 'cloud', entry: 'cloud://{X}/Root/R/a/b.flac' }), dir, sleep: noSleep, later: (ms, fn) => timers.push(fn) })
  await p2.enqueue({ trackIds: ['t2'], mode: 'end' })
  assert.equal(aimp.s.inserted.length, 1)
  await Promise.all(timers.map((fn) => fn()))
  assert.deepEqual(await readdir(dir), [])
})

test('cloud lists a previous worker left are removed at start; other files stay', async () => {
  const dir = await tempDir()
  await writeFile(join(dir, `${CLOUD_PREFIX}1-a.m3u8`), 'x')
  await writeFile(join(dir, 'B-Side-2-b.m3u8'), 'x')
  await cleanCloudLists(dir)
  assert.deepEqual(await readdir(dir), ['B-Side-2-b.m3u8'])
})

// ---------------------------------------------------------------- no token leaves the worker

test('redact() hides tokens, JWTs, query strings and long opaque strings', () => {
  const out = redact(`Bearer ${SECRETS.access1} https://x.example/f?tempauth=${SECRETS.tempauth} refresh_token=${SECRETS.refresh1} eyJhbGciOiJ.eyJzdWIiOiJ.c2ln ${'A'.repeat(64)} C:\\Music\\a.flac`)
  assert.deepEqual(leaks(out), [])
  assert.doesNotMatch(out, /eyJ|AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/)
  assert.match(out, /C:\\Music\\a\.flac/, 'paths stay readable')
})

test('the whole flow through the worker: no token in logs, storage, answers or files', async () => {
  const dir = await tempDir()
  const ms = fakeMicrosoft({ approveAfter: 1 })
  const storage = memoryStore()
  const secrets = memoryStore()
  const settings = { get: async () => '' }
  const logs = []
  const handlers = new Map()
  const orca = {
    log: (m) => logs.push(m),
    panels: { handle: (name, fn) => handlers.set(name, fn) },
    storage,
    secrets,
    settings,
    host: { has: (m) => m === 'secrets.protection', call: async () => ({ status: 'os-keyring' }) }
  }
  const aimp = fakeAimp()
  const helper = { request: (cmd, args) => (cmd === 'musicFolder' ? Promise.resolve(null) : cmd === 'thumb' ? Promise.resolve(JPEG.toString('base64')) : aimp.call(cmd, args)), close() {} }
  const od = createOneDrive({ secrets, storage, protection: async () => 'os-keyring', clientId: CLIENT, fetch: ms.fetch, sleep: noSleep, dir: join(dir, 'cloud'), log: (m) => orca.log(redact(m)) })
  const library = createLibrary({ helper, settings, cacheDir: join(dir, 'cache'), cloud: od.cloud, log: (m) => orca.log(redact(m)) })
  activate(orca, { aimp: helper, onedrive: od, queueDir: join(dir, 'queue'), handlers: { library, playback: { dir: join(dir, 'queue'), sleep: noSleep } } })
  const ask = async (name, input) => handlers.get(name)(input)
  const answers = []
  const keep = async (p) => {
    const r = await p
    answers.push(r)
    return r
  }

  await keep(ask('onedrive.status', {}))
  const started = await keep(ask('onedrive.connect', {}))
  assert.equal(started.state, 'pending')
  assert.equal(started.code.userCode, 'ABCD-EFGH')
  await od.auth.settled()
  await keep(ask('onedrive.browse', {}))
  await keep(ask('onedrive.setFolders', { ids: ['H!s1'] }))
  await od.cloud.sync()
  await keep(ask('library.status', {}))
  const { albums } = await keep(ask('library.albums', {}))
  await keep(ask('library.image', { id: albums[0].cover }))
  const { tracks } = await keep(ask('library.album', { id: albums[0].id }))
  // Plays through a download link (no My Clouds yet): the link holds a credential.
  await keep(ask('player.playAlbum', { albumId: albums[0].id, trackId: tracks[0].id }))
  const playing = await keep(ask('player.state', {}))
  assert.equal(playing.track.trackId, tracks[0].id, 'B-Side knows the playing link is this track')
  assert.equal(playing.track.title, 'Bye Bye Bye', 'the title comes from the library, never from the link')
  const lyrics = await keep(ask('player.lyrics', {}))
  assert.equal(lyrics.source, 'lrc')
  assert.equal(lyrics.lines[1].text, 'Bye bye bye')
  const artist = await keep(ask('player.artist', {}))
  assert.match(artist.dataUrl ?? '', /^data:image\/jpeg/)
  // Errors too: a bad id, then a revoked grant while syncing.
  await keep(ask('onedrive.browse', { id: 'no such/id' }))
  await keep(ask('onedrive.sync', {}))
  await keep(ask('onedrive.disconnect', {}))

  const everything = [logs.join('\n'), JSON.stringify(answers), JSON.stringify([...storage.data]), JSON.stringify([...secrets.data])]
  for (const f of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (f.isFile()) everything.push(await readFile(join(f.parentPath ?? f.path, f.name), 'latin1'))
  }
  assert.deepEqual(leaks(everything.join('\n')), [], 'a token leaked')
  // The download link reached AIMP (in memory, as the test's fake keeps it) and nothing else.
  assert.ok(aimp.s.lists.some((l) => l.includes(SECRETS.tempauth)))
})

test('disconnecting during a sync writes nothing back', async () => {
  const ms = fakeMicrosoft()
  let release
  const gate = new Promise((r) => (release = r))
  const slow = { fetch: async (url, init) => (url.includes('/delta') ? gate.then(() => ms.fetch(url, init)) : ms.fetch(url, init)), calls: ms.calls, state: ms.state }
  const { od, dir } = await connected({ ms: slow })
  await od.handlers['onedrive.setFolders']({ ids: ['H!s1'] })
  const syncing = od.cloud.sync()
  await new Promise((r) => setImmediate(r))
  const out = od.handlers['onedrive.disconnect']()
  release()
  await Promise.all([syncing, out])
  assert.deepEqual(await readdir(dir), [], 'no index.json written after the disconnect')
  assert.equal(od.cloud.records().length, 0)
  assert.equal(od.cloud.status().error, null)
})
