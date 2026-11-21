// Parity: the native helper answers every request the way the PowerShell helper does. Both REAL
// helpers get the same requests, one after the other, and their answers are compared: exactly where
// the answer does not depend on the encoder or the clock, by shape and size where it does (JPEG
// bytes, AIMP's playing position). Windows only, with a native build; nothing here controls AIMP.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { createAimp, helperProcess, helperSpec } from '../src/aimp.mjs'
import { KINDS } from './helper-kinds.mjs'

const [native, powershell] = KINDS
const skip = native.skip || powershell.skip
const TIMEOUT_MS = 30000

/** A w x h RGBA PNG: a colour gradient whose alpha falls to 0 on the right. */
function png(w, h) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (b) => {
    let c = 0xffffffff
    for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(td))
    return Buffer.concat([head, td, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const rows = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows.set([(x * 255) / w, (y * 255) / h, 120, 255 - (x * 255) / w], y * (w * 4 + 1) + 1 + x * 4)
  return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

function jpegSize(b64) {
  const jpeg = Buffer.from(b64, 'base64')
  assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff], 'a JPEG')
  const sof = jpeg.indexOf(Buffer.from([0xff, 0xc0]))
  return { w: jpeg.readUInt16BE(sof + 7), h: jpeg.readUInt16BE(sof + 5), bytes: jpeg.length }
}

/** The answer or the error of a request, as data: { ok, result } or { ok: false, code, message }. */
const outcome = (aimp, cmd, args) =>
  aimp.request(cmd, args, { timeout: TIMEOUT_MS }).then(
    (result) => ({ ok: true, result }),
    (e) => ({ ok: false, code: e.code, message: e.message })
  )

test('the native helper answers like the PowerShell helper', { skip, timeout: TIMEOUT_MS * 4 }, async (t) => {
  const scratch = fileURLToPath(new URL('../scratch/', import.meta.url))
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(join(scratch, 'tmp-parity-'))
  const a = createAimp(native.options)
  const b = createAimp(powershell.options)
  const both = async (cmd, args = {}) => [await outcome(a, cmd, args), await outcome(b, cmd, args)]
  try {
    const album = join(root, 'Ärtist', "Álbum 空中 it's")
    await mkdir(join(album, 'CD 2'), { recursive: true })
    for (const name of ['01 Song.flac', '02 Song.MP3', '03 ずっと.m4a', 'CD 2\\01 Deep.wav', 'cover.jpg', 'folder.webp', 'lyrics.lrc', 'notes.txt', 'x.cue'])
      await writeFile(join(album, name), Buffer.from(name))
    const cover = join(album, 'cover.png')
    await writeFile(cover, png(1200, 900))
    const tagged = join(album, '04 Tagged.flac')
    const picture = png(640, 640)
    await writeFile(tagged, Buffer.concat([Buffer.from('fLaC-and-some-tag-bytes'), picture, Buffer.from('audio')]))
    const offline = join(album, '05 Cloud.flac')
    await writeFile(offline, Buffer.from('fLaC'))
    let marked = true
    try {
      execFileSync('attrib', ['+O', offline])
    } catch {
      marked = false
    }

    // Exact answers.
    const exact = [
      ['shellInfo'],
      ['musicFolder'],
      ['scan', { root: join(root, 'missing') }],
      ['scan', { root: 'relative\\music' }],
      ['scan', { token: '999999' }],
      ['openFile', { path: join(root, 'no-such.m3u8') }],
      ['insertFile', { path: join(root, 'no-such.flac') }],
      ['openFile', { path: 'relative\\x.flac' }],
      ['openFile', { path: 'C:\\a\\"b".flac' }],
      ['openFile', { path: '' }],
      ['openFile', {}],
      ['thumb', {}],
      ['thumb', { path: join(root, 'no-such.png'), size: 256 }],
      ['thumb', { path: join(album, 'notes.txt'), size: 256 }],
      ['thumb', { path: cover, size: 256, offset: -1 }],
      ['thumb', { path: cover, size: 256, length: 999999999 }],
      ['thumb', { bytesB64: Buffer.from('not an image').toString('base64'), size: 256 }],
      ['dance']
    ]
    if (marked) exact.push(['thumb', { path: offline, size: 256, offset: 0, length: 4 }])
    for (const [cmd, args] of exact) {
      const [n, p] = await both(cmd, args)
      assert.deepEqual(n, p, `${cmd} ${JSON.stringify(args ?? {})}`)
    }

    // A whole library folder, in chunks, entry by entry.
    const scanAll = async (aimp) => {
      const entries = []
      let r = await aimp.request('scan', { root }, { timeout: TIMEOUT_MS })
      const counts = []
      for (;;) {
        entries.push(...r.entries)
        counts.push({ done: r.done, folders: r.folders, links: r.links, denied: r.denied, truncated: r.truncated })
        if (r.done) break
        r = await aimp.request('scan', { token: r.token }, { timeout: TIMEOUT_MS })
      }
      return { entries: entries.sort((x, y) => (x.path < y.path ? -1 : 1)), last: counts.at(-1) }
    }
    const [sn, sp] = [await scanAll(a), await scanAll(b)]
    assert.equal(sn.entries.length, 10)
    assert.deepEqual(sn, sp)

    // Thumbnails: same size, both JPEG within the budget. The encoders differ, so the bytes do too.
    for (const args of [
      { path: cover, size: 256 },
      { path: cover, size: 800 },
      { path: cover, size: 5000 },
      { path: cover, size: 1 },
      { path: tagged, size: 300, offset: 23, length: picture.length },
      { bytesB64: picture.toString('base64'), size: 128 }
    ]) {
      const [n, p] = await both('thumb', args)
      assert.ok(n.ok && p.ok && n.result && p.result, JSON.stringify({ args: { ...args, bytesB64: undefined }, n: n.message, p: p.message }))
      const [jn, jp] = [jpegSize(n.result), jpegSize(p.result)]
      assert.deepEqual([jn.w, jn.h], [jp.w, jp.h], JSON.stringify(args.size))
      assert.ok(jn.bytes <= (Math.max(32, Math.min(1600, args.size)) <= 300 ? 200 : 700) * 1024)
      t.diagnostic(`thumb ${args.size}: ${jn.w}x${jn.h}, native ${jn.bytes} B, PowerShell ${jp.bytes} B`)
    }

    // AIMP: the same state (but the playing position) and the same cover.
    const [stn, stp] = await both('state')
    assert.ok(stn.ok && stp.ok)
    const still = (s) => ({ ...s, positionMs: typeof s.positionMs })
    if (stn.result.state !== 'playing') assert.deepEqual(still(stn.result), still(stp.result))
    else assert.deepEqual(Object.keys(stn.result), Object.keys(stp.result))
    t.diagnostic(`AIMP: ${stn.result.running ? stn.result.state : 'closed'}`)
    if (stn.result.running) {
      const [an, ap] = await both('art')
      assert.equal(an.ok, ap.ok)
      // A cover of up to 600 KB is passed through as AIMP sent it; a bigger one is re-encoded.
      if (an.ok && an.result !== ap.result) {
        const [jn, jp] = [jpegSize(an.result), jpegSize(ap.result)]
        assert.deepEqual([jn.w, jn.h], [jp.w, jp.h])
        t.diagnostic(`cover re-encoded: ${jn.w}x${jn.h}, native ${jn.bytes} B, PowerShell ${jp.bytes} B`)
      }
    } else {
      assert.deepEqual(...(await both('pause')))
    }
    if (marked) execFileSync('attrib', ['-O', offline])
  } finally {
    a.close()
    b.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('a large folder scans in the same chunks, entry by entry', { skip, timeout: TIMEOUT_MS * 4 }, async () => {
  const scratch = fileURLToPath(new URL('../scratch/', import.meta.url))
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(join(scratch, 'tmp-parity-big-'))
  const a = createAimp(native.options)
  const b = createAimp(powershell.options)
  try {
    await mkdir(join(root, 'A', 'B'), { recursive: true })
    const names = []
    for (let i = 0; i < 3400; i++) names.push(join(root, 'A', `${String(i).padStart(4, '0')} track.flac`))
    for (let i = 0; i < 700; i++) names.push(join(root, 'A', 'B', `${i}.lrc`))
    await Promise.all(names.map((n) => writeFile(n, '')))
    const batches = async (aimp) => {
      const out = []
      let r = await aimp.request('scan', { root }, { timeout: TIMEOUT_MS })
      for (;;) {
        out.push(r)
        if (r.done) return out
        r = await aimp.request('scan', { token: r.token }, { timeout: TIMEOUT_MS })
      }
    }
    const [n, p] = [await batches(a), await batches(b)]
    assert.ok(n.length >= 2, `${n.length} chunks`)
    assert.equal(n.flatMap((r) => r.entries).length, 4100)
    // Chunk boundaries depend on time (250 ms per chunk), so compare the sequence and the totals.
    assert.deepEqual(
      n.flatMap((r) => r.entries),
      p.flatMap((r) => r.entries)
    )
    const last = (rs) => ({ ...rs.at(-1), entries: undefined, token: undefined })
    assert.deepEqual(last(n), last(p))
    assert.ok(n.every((r) => r.entries.length <= 3000))
  } finally {
    a.close()
    b.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('raw JSON lines get the same answers, without the client in between', { skip, timeout: TIMEOUT_MS * 2 }, async () => {
  const lines = [
    ['{"ID":5,"CMD":"PING"}', 'exact'],
    ['{"id":6,"cmd":"Shellinfo"}', 'exact'],
    ['{"id":7,"cmd":"thumb","args":{"size":"0x100"}}', 'exact'],
    ['{"id":8,"cmd":"thumb","args":{"size":"abc"}}', 'code'],
    [String.raw`{"id":9,"cmd":"scan","args":{"root":"C:\\<bad"}}`, 'exact'],
    [String.raw`{"id":10,"cmd":"openFile","args":{"path":"C:\\a|b.flac"}}`, 'exact'],
    ['{"id":11,"cmd":"openFile","Args":{"Path":"relative.flac"}}', 'exact'],
    [String.raw`{"id":12,"cmd":"thumb","args":{"path":"C:\\no-such-b-side.png","offset":9007199254740994}}`, 'exact'],
    ['not json', 'code'],
    ['{"id":13,"cmd":"musicFolder","args":null}', 'exact']
  ]
  const talk = (spec) =>
    new Promise((resolve, reject) => {
      const child = helperProcess(spec)
      let out = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (c) => (out += c))
      child.on('error', reject)
      child.on('close', () =>
        resolve(
          out
            .split(/\r?\n/)
            .filter((l) => l.startsWith('{'))
            .map((l) => JSON.parse(l))
        )
      )
      child.stdin.end(lines.map(([l]) => l).join('\n') + '\n')
    })
  const [n, p] = await Promise.all([talk(helperSpec('native', { nativePath: native.options.nativePath })), talk(helperSpec('powershell'))])
  assert.equal(n.length, lines.length)
  assert.equal(p.length, lines.length)
  lines.forEach(([line, how], i) => {
    if (how === 'exact') assert.deepEqual(n[i], p[i], line)
    else assert.deepEqual([n[i].id, n[i].ok, n[i].code], [p[i].id, p[i].ok, p[i].code], line)
  })
})
