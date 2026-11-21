// Integration: the REAL helper's library commands (BSideFiles) on files made in scratch/. Windows
// only. Checks scan entries and attributes, the Music folder, thumbnails, and that a file marked
// offline (attrib +O, which counts as cloud-only) is refused by the thumbnailer.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { createAimp } from '../src/aimp.mjs'
import { isCloudOnly, listFolder } from '../src/library/scan.mjs'

const skip = process.platform === 'win32' ? false : 'the helper runs only on Windows'
const TIMEOUT_MS = 30000

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (b) => {
  let c = 0xffffffff
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
/** A w x h RGB PNG of one colour. */
function png(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const rows = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows.set([200, 80, 30], y * (w * 3 + 1) + 1 + x * 3)
  return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

test('the real helper lists a library folder, finds the Music folder and makes thumbnails', { skip, timeout: TIMEOUT_MS * 2 }, async (t) => {
  const scratch = fileURLToPath(new URL('../scratch/', import.meta.url))
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(join(scratch, 'tmp-helper-'))
  const aimp = createAimp()
  try {
    const album = join(root, 'Artist', 'Álbum 空中')
    await mkdir(album, { recursive: true })
    await writeFile(join(album, '01 Song.flac'), Buffer.from('fLaC'))
    await writeFile(join(album, '01 Song.lrc'), '[00:01.00]la')
    await writeFile(join(album, 'notes.txt'), 'not listed')
    const cover = join(album, 'cover.png')
    await writeFile(cover, png(1200, 900))
    const offline = join(album, '02 Cloud.flac')
    await writeFile(offline, Buffer.from('fLaC'))
    let marked = true
    try {
      execFileSync('attrib', ['+O', offline])
    } catch {
      marked = false
    }

    const music = await aimp.request('musicFolder', {}, { timeout: TIMEOUT_MS })
    assert.equal(typeof music, 'string')
    assert.ok(music.length > 3)

    const r = await listFolder(aimp, root)
    const byName = Object.fromEntries(r.entries.map((e) => [e.path.slice(album.length + 1), e]))
    assert.deepEqual(Object.keys(byName).sort(), ['01 Song.flac', '01 Song.lrc', '02 Cloud.flac', 'cover.png'])
    assert.equal(byName['01 Song.flac'].kind, 'audio')
    assert.equal(byName['01 Song.lrc'].kind, 'lyrics')
    assert.equal(byName['cover.png'].kind, 'image')
    assert.equal(byName['01 Song.flac'].size, 4)
    assert.ok(Math.abs(byName['01 Song.flac'].mtime - Date.now()) < 10 * 60 * 1000, 'mtime in ms since 1970')
    assert.equal(isCloudOnly(byName['01 Song.flac'].attrs), false)
    assert.deepEqual(await listFolder(aimp, join(root, 'nope')), { entries: [], missing: true, truncated: false })

    for (const [size, max] of [
      [256, 256],
      [800, 800]
    ]) {
      const b64 = await aimp.request('thumb', { path: cover, size }, { timeout: TIMEOUT_MS })
      const jpeg = Buffer.from(b64, 'base64')
      assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff])
      // Width and height from the SOF0 marker.
      const sof = jpeg.indexOf(Buffer.from([0xff, 0xc0]))
      const [h, w] = [jpeg.readUInt16BE(sof + 5), jpeg.readUInt16BE(sof + 7)]
      assert.equal(Math.max(w, h), max)
    }

    if (!marked) t.diagnostic('attrib +O failed here: offline check skipped')
    else {
      assert.equal(isCloudOnly(byName['02 Cloud.flac'].attrs), true)
      await assert.rejects(aimp.request('thumb', { path: offline, size: 256, offset: 0, length: 4 }, { timeout: TIMEOUT_MS }), /cloud-only/)
      execFileSync('attrib', ['-O', offline])
    }
  } finally {
    aimp.close()
    await rm(root, { recursive: true, force: true })
  }
})
