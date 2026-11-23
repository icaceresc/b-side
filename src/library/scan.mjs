// Which folders make up the library and what is in them. Listing goes through the helper
// (BSideFiles.Scan): names, sizes, times and Windows attributes from directory enumeration only, so
// no file is opened, and a cloud-only file stays in the cloud.
import { stat } from 'node:fs/promises'
import { win32 } from 'node:path'

// OneDrive Files On-Demand and other cloud providers: reading such a file downloads it.
export const FILE_ATTRIBUTE_OFFLINE = 0x00001000
export const FILE_ATTRIBUTE_RECALL_ON_OPEN = 0x00040000
export const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x00400000
export const CLOUD_ONLY_MASK = FILE_ATTRIBUTE_OFFLINE | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS

/** True when B-Side must never open the file: its data lives only in the cloud. */
export const isCloudOnly = (attrs) => ((Number(attrs) >>> 0) & CLOUD_ONLY_MASK) !== 0

// Outside a library scan B-Side has only stat. Windows reports no allocated blocks for a cloud
// placeholder whose data is not on this PC, and stat never downloads it; but NTFS also keeps small
// files (under about 700 bytes, more on volumes with 4 KB file records) inside their file record
// with no blocks. So blocks prove a file is local, and no blocks needs its attributes.

/** True when a stat proves the file's data is on this PC (or there is nothing to read). */
export const statIsLocal = (st, platform = process.platform) => platform !== 'win32' || !st || !(st.size > 0) || !(st.blocks === 0)

/**
 * Windows attributes of one file from the helper's listing of its folder (directory enumeration:
 * nothing is opened), or undefined when it is not in the first few chunks.
 */
export async function listedAttrs(helper, path, { timeout = 10000, chunks = 3 } = {}) {
  const keyOf = (p) => win32.normalize(p).normalize('NFC').toLowerCase()
  const key = keyOf(path)
  let r = await helper.request('scan', { root: win32.dirname(path) }, { timeout })
  for (let i = 0; r && !r.missing && i < chunks; i++) {
    const hit = (r.entries ?? []).find((e) => typeof e?.path === 'string' && keyOf(e.path) === key)
    if (hit) return Number(hit.attrs) >>> 0
    if (r.done || !r.token) return undefined
    r = await helper.request('scan', { token: r.token }, { timeout })
  }
  return undefined
}

/**
 * True when opening `path` would download it from the cloud. `attrsOf(path)` gives its Windows
 * attributes when stat cannot tell; without an answer the file counts as cloud, so the worst case
 * is a missing picture or lyrics, never a download. A missing file is false: its reader fails on
 * its own.
 */
export async function cloudOnlyFile(path, { attrsOf = async () => undefined, statFile = stat, platform = process.platform } = {}) {
  let st
  try {
    st = await statFile(path)
  } catch {
    return false
  }
  if (statIsLocal(st, platform)) return false
  const attrs = await Promise.resolve()
    .then(() => attrsOf(path))
    .catch(() => undefined)
  return attrs === undefined || attrs === null ? true : isCloudOnly(attrs)
}

const MAX_FOLDERS = 16
const MAX_CHUNKS = 1000 // 3000 entries each: far past the helper's own cap

/** The `libraryFolders` setting (one folder per line) to absolute Windows paths, de-duplicated. */
export function parseFolders(text) {
  const seen = new Set()
  const out = []
  for (const line of String(text ?? '').split(/\r?\n/)) {
    let f = line.trim().replace(/^"(.*)"$/, '$1').trim()
    if (!f || !win32.isAbsolute(f) || !/^([a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i.test(f)) continue
    f = win32.normalize(f)
    if (f.length > 3) f = f.replace(/[\\]+$/, '')
    const key = f.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
    if (out.length >= MAX_FOLDERS) break
  }
  return out
}

/** What the panel may see of a folder: its last name ("Hi-Fi Collection"), never the path. */
export const folderName = (folder) => win32.basename(folder) || folder.replace(/[\\:]+$/, '')

/**
 * Lists one folder through the helper, in chunks: { entries, missing, truncated }. Entries are
 * { path, size, mtime, attrs, kind: 'audio'|'image'|'lyrics' }.
 */
export async function listFolder(helper, root, { timeout = 30000 } = {}) {
  const entries = []
  let r = await helper.request('scan', { root }, { timeout })
  if (r?.missing) return { entries, missing: true, truncated: false }
  for (let i = 0; r && i < MAX_CHUNKS; i++) {
    for (const e of r.entries ?? []) {
      if (typeof e?.path === 'string' && ['audio', 'image', 'lyrics'].includes(e.kind)) {
        entries.push({ path: e.path, size: Number(e.size) || 0, mtime: Number(e.mtime) || 0, attrs: Number(e.attrs) >>> 0, kind: e.kind })
      }
    }
    if (r.done) return { entries, missing: false, truncated: Boolean(r.truncated) }
    r = await helper.request('scan', { token: r.token }, { timeout })
  }
  return { entries, missing: false, truncated: true }
}
