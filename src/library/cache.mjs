// The library index on disk, so a restarted worker answers at once:
// %LOCALAPPDATA%\B-Side\cache\library.json, versioned. Rescans reuse the tags of files whose size
// and time did not change. It holds paths, so it stays on this PC and never goes to the panel.
import { homedir } from 'node:os'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const CACHE_VERSION = 1
const MAX_CACHE_BYTES = 256 * 1024 * 1024

export function defaultCacheDir(env = process.env) {
  const local = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  return join(local, 'B-Side', 'cache')
}

/** The saved index ({ version, folders, scannedAt, files }) or null when missing, old or broken. */
export async function loadIndex(dir) {
  try {
    const text = await readFile(join(dir, 'library.json'), 'utf8')
    if (text.length > MAX_CACHE_BYTES) return null
    const data = JSON.parse(text)
    if (data?.version !== CACHE_VERSION || !Array.isArray(data.files) || !Array.isArray(data.folders)) return null
    return data
  } catch {
    return null
  }
}

/** Writes the index atomically (a temporary file, then a rename). */
export async function saveIndex(dir, { folders, scannedAt, files, missing = [] }) {
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'library.json')
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify({ version: CACHE_VERSION, folders, scannedAt, missing, files }))
  await rename(tmp, file)
}
