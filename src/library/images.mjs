// Album covers and artist pictures for the panel, as JPEG data URLs of two sizes (thumb ~256 px,
// large ~800 px), made by the helper (BSideFiles.Thumb, which refuses cloud-only files) and kept on
// disk under the cache folder, keyed by the source's path, size and time. The source of an image id
// comes from the model, never from the panel.
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { imageType } from '../artist.mjs'
import { isVirtualPath } from '../cloud/library.mjs'

export const SIZES = { thumb: 256, large: 800 }
const MAX_DATA_URL = 1_000_000 // one panel answer stays under Orca's ~1 MiB
const RAW_CAP = 700 * 1024 // an image passed on as is when the helper cannot shrink it

const cacheName = (source, px) =>
  createHash('sha1')
    .update(`${source.type}|${source.path.toLowerCase()}|${source.offset ?? ''}|${source.length ?? ''}|${source.size}|${source.mtime}|${px}`)
    .digest('hex')
    .slice(0, 32) + '.jpg'

async function readRaw(path) {
  const fh = await open(path, 'r')
  try {
    const len = (await fh.stat()).size
    if (!len || len > RAW_CAP) return null
    const buf = Buffer.alloc(len)
    const { bytesRead } = await fh.read(buf, 0, len, 0)
    return bytesRead === len ? buf : null
  } finally {
    await fh.close()
  }
}

/**
 * Image store: `get(source, size)` resolves with a data URL or null; never throws. `helper` is the
 * AIMP helper client ({ request }).
 */
export function createImageStore({ helper, cacheDir, timeout = 20000, localCopy = async () => null, cloudDir = null }) {
  const dir = join(cacheDir, 'images')
  // OneDrive pictures (src/cloud) are kept apart, so disconnecting OneDrive removes them.
  const dirFor = (source) => (source.type === 'cloud' && cloudDir ? cloudDir : dir)
  const inflight = new Map()

  async function make(source, px) {
    const file = join(dirFor(source), cacheName(source, px))
    try {
      const cached = await readFile(file)
      if (imageType(cached) === 'image/jpeg') return `data:image/jpeg;base64,${cached.toString('base64')}`
    } catch {
      /* not cached yet */
    }
    // A OneDrive picture listed through Graph: its downloaded copy (src/cloud/library.mjs).
    // A virtual OneDrive path is never opened (it reads as a network share).
    if (source.type !== 'cloud' && isVirtualPath(source.path)) return null
    const path = source.type === 'cloud' ? await localCopy(source.path).catch(() => null) : source.path
    if (!path || isVirtualPath(path)) return null
    const args = { path, size: px }
    if (source.type === 'embedded') Object.assign(args, { offset: source.offset, length: source.length })
    // Only the helper opens image files: it checks the cloud-only attributes right before. When it
    // fails (or refuses a cloud-only file) there is no image.
    let b64
    try {
      b64 = await helper.request('thumb', args, { timeout })
    } catch {
      return null
    }
    if (typeof b64 === 'string' && b64) {
      const bytes = Buffer.from(b64, 'base64')
      if (imageType(bytes) !== 'image/jpeg') return null
      try {
        await mkdir(dirFor(source), { recursive: true })
        const tmp = `${file}.${process.pid}.tmp`
        await writeFile(tmp, bytes)
        await rename(tmp, file)
      } catch {
        /* the cache is a convenience */
      }
      return `data:image/jpeg;base64,${b64}`
    }
    // GDI+ cannot decode WEBP: the helper, having just checked the file is local, answered null;
    // a small one goes as it is.
    if (!/\.webp$/i.test(source.path) || source.type === 'embedded') return null
    const raw = await readRaw(path).catch(() => null)
    const type = raw && imageType(raw)
    return type ? `data:${type};base64,${raw.toString('base64')}` : null
  }

  return {
    async get(source, size = 'thumb') {
      const px = SIZES[size] ?? SIZES.thumb
      const key = `${source.type}|${source.path}|${source.offset ?? ''}|${px}`
      if (!inflight.has(key)) {
        inflight.set(
          key,
          make(source, px)
            .catch(() => null)
            .then((url) => (url && url.length < MAX_DATA_URL ? url : null))
            .finally(() => inflight.delete(key))
        )
      }
      return inflight.get(key)
    }
  }
}
