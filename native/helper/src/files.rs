// Library files for the worker's index: lists the folders it names (names, sizes, times and
// attributes from directory enumeration only, never opening a file), the Music known folder, and
// JPEG thumbnails. Never writes. A cloud-only file (OneDrive Files On-Demand) is never opened.
use std::collections::{HashMap, VecDeque};
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom};
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::sync::Mutex;
use std::time::Instant;

use windows::core::HSTRING;
use windows::Win32::Foundation::{GetLastError, ERROR_ACCESS_DENIED};
use windows::Win32::Storage::FileSystem::{
    FindClose, FindExInfoBasic, FindExSearchNameMatch, FindFirstFileExW, FindNextFileW, GetFileAttributesW, FIND_FIRST_EX_LARGE_FETCH, INVALID_FILE_ATTRIBUTES,
    WIN32_FIND_DATAW,
};
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::UI::Shell::{FOLDERID_Music, SHGetKnownFolderPath, KF_FLAG_DEFAULT};

use crate::json::{base64, esc, unbase64};
use crate::Failure;

const ATTR_HIDDEN: u32 = 0x2;
const ATTR_SYSTEM: u32 = 0x4;
const ATTR_DIRECTORY: u32 = 0x10;
const ATTR_REPARSE: u32 = 0x400;
const ATTR_OFFLINE: u32 = 0x1000;
const ATTR_RECALL_ON_OPEN: u32 = 0x40000;
const ATTR_RECALL_ON_DATA_ACCESS: u32 = 0x400000;
const CLOUD_ONLY: u32 = ATTR_OFFLINE | ATTR_RECALL_ON_OPEN | ATTR_RECALL_ON_DATA_ACCESS;
const FILE_FLAG_OPEN_NO_RECALL: u32 = 0x0010_0000;
const MAX_DEPTH: u32 = 24;
const MAX_ENTRIES: u32 = 200_000;
const CHUNK_ENTRIES: usize = 3000;
const CHUNK_MS: u128 = 250;
const MAX_JOBS: usize = 4;
const MAX_IMAGE_BYTES: i64 = 64 * 1024 * 1024;
const FILETIME_1970: i64 = 116_444_736_000_000_000;

/// Long paths and UNC shares through the \\?\ prefix.
fn long(path: &str) -> String {
    if path.starts_with(r"\\?\") {
        path.to_string()
    } else if let Some(share) = path.strip_prefix(r"\\") {
        format!(r"\\?\UNC\{share}")
    } else {
        format!(r"\\?\{path}")
    }
}

fn attributes(path: &str) -> u32 {
    unsafe { GetFileAttributesW(&HSTRING::from(long(path))) }
}

fn kind_of(name: &str) -> Option<&'static str> {
    let ext = name.rsplit_once('.')?.1.to_lowercase();
    match ext.as_str() {
        "flac" | "mp3" | "m4a" | "mp4" | "alac" | "ogg" | "oga" | "opus" | "wav" | "aif" | "aiff" | "ape" | "wv" | "dsf" | "dff" | "tak" => Some("audio"),
        "jpg" | "jpeg" | "png" | "webp" => Some("image"),
        "lrc" => Some("lyrics"),
        _ => None,
    }
}

/// A directory link (junction, symbolic link) can loop or leave the library: not followed. Cloud
/// placeholders (OneDrive: IO_REPARSE_TAG_CLOUD_*, 0x9000x01A) are ordinary folders here.
fn is_link(attrs: u32, tag: u32) -> bool {
    (attrs & ATTR_REPARSE) != 0 && (tag & 0xFFFF_0FFF) != 0x9000_001A
}

struct Job {
    dirs: Vec<(String, u32)>,
    pending: VecDeque<String>,
    found: u32,
    folders: u32,
    links: u32,
    denied: u32,
    truncated: bool,
}

struct Jobs {
    by_token: HashMap<String, Job>,
    order: Vec<String>,
    next: u64,
}

static JOBS: Mutex<Option<Jobs>> = Mutex::new(None);

fn list_dir(job: &mut Job, dir: &str, depth: u32) {
    let mut d = WIN32_FIND_DATAW::default();
    let pattern = HSTRING::from(format!(r"{}\*", long(dir)));
    let h = unsafe {
        FindFirstFileExW(
            &pattern,
            FindExInfoBasic,
            &mut d as *mut _ as *mut _,
            FindExSearchNameMatch,
            None,
            FIND_FIRST_EX_LARGE_FETCH,
        )
    };
    let h = match h {
        Ok(h) if !h.is_invalid() => h,
        _ => {
            if unsafe { GetLastError() } == ERROR_ACCESS_DENIED {
                job.denied += 1;
            }
            return;
        }
    };
    job.folders += 1;
    loop {
        let end = d.cFileName.iter().position(|&c| c == 0).unwrap_or(d.cFileName.len());
        let name = String::from_utf16_lossy(&d.cFileName[..end]);
        if name != "." && name != ".." {
            let full = if dir.ends_with('\\') {
                format!("{dir}{name}")
            } else {
                format!(r"{dir}\{name}")
            };
            let attrs = d.dwFileAttributes;
            if (attrs & ATTR_DIRECTORY) != 0 {
                if is_link(attrs, d.dwReserved0) {
                    job.links += 1;
                } else if (attrs & ATTR_HIDDEN) != 0 && (attrs & ATTR_SYSTEM) != 0 {
                    // $RECYCLE.BIN and the like
                } else if depth < MAX_DEPTH {
                    job.dirs.push((full, depth + 1));
                }
            } else if let Some(kind) = kind_of(&name) {
                if job.found >= MAX_ENTRIES {
                    job.truncated = true;
                } else {
                    job.found += 1;
                    let size = (i64::from(d.nFileSizeHigh) << 32) | i64::from(d.nFileSizeLow);
                    let ft = (i64::from(d.ftLastWriteTime.dwHighDateTime) << 32) | i64::from(d.ftLastWriteTime.dwLowDateTime);
                    let mtime = if ft > FILETIME_1970 { (ft - FILETIME_1970) / 10000 } else { 0 };
                    job.pending.push_back(format!(
                        "{{\"path\":{},\"size\":{size},\"mtime\":{mtime},\"attrs\":{attrs},\"kind\":\"{kind}\"}}",
                        esc(Some(&full))
                    ));
                }
            }
        }
        if unsafe { FindNextFileW(h, &mut d) }.is_err() {
            break;
        }
    }
    unsafe {
        let _ = FindClose(h);
    }
}

/// Lists `root` recursively in chunks: a call does at most ~250 ms of work and returns at most
/// CHUNK_ENTRIES entries, so AIMP requests queued behind it still answer quickly. The first call
/// names `root`; later ones pass the `token` it returned until `done`.
pub fn scan(root: &str, token: &str) -> Result<String, Failure> {
    let mut guard = JOBS.lock().map_err(|_| Failure::error("scan state lost"))?;
    let jobs = guard.get_or_insert_with(|| Jobs {
        by_token: HashMap::new(),
        order: Vec::new(),
        next: 1,
    });
    let token = if !token.is_empty() {
        if !jobs.by_token.contains_key(token) {
            return Err(Failure::error("unknown scan token"));
        }
        token.to_string()
    } else {
        let rooted = root.starts_with(['\\', '/']) || (root.len() >= 2 && root.as_bytes()[1] == b':');
        // .NET's Path.IsPathRooted refuses these first, in the PowerShell helper.
        if root.chars().any(|c| (c as u32) < 0x20 || "\"<>|".contains(c)) {
            return Err(Failure::error("Illegal characters in path."));
        }
        if root.is_empty() || !rooted {
            return Err(Failure::error("scan needs an absolute root"));
        }
        let mut root = root.trim_end_matches('\\').to_string();
        if root.len() == 2 && root.as_bytes()[1] == b':' {
            root.push('\\');
        }
        let a = attributes(&root);
        if a == INVALID_FILE_ATTRIBUTES || (a & ATTR_DIRECTORY) == 0 {
            return Ok("{\"missing\":true,\"done\":true,\"entries\":[]}".to_string());
        }
        let token = jobs.next.to_string();
        jobs.next += 1;
        let job = Job {
            dirs: vec![(root, 0)],
            pending: VecDeque::new(),
            found: 0,
            folders: 0,
            links: 0,
            denied: 0,
            truncated: false,
        };
        jobs.by_token.insert(token.clone(), job);
        jobs.order.push(token.clone());
        while jobs.order.len() > MAX_JOBS {
            let old = jobs.order.remove(0);
            jobs.by_token.remove(&old);
        }
        token
    };
    let Some(job) = jobs.by_token.get_mut(&token) else {
        return Err(Failure::error("unknown scan token"));
    };
    let watch = Instant::now();
    while job.pending.len() < CHUNK_ENTRIES && watch.elapsed().as_millis() < CHUNK_MS {
        let Some((dir, depth)) = job.dirs.pop() else { break };
        list_dir(job, &dir, depth);
    }
    let mut j = format!("{{\"token\":{},\"entries\":[", esc(Some(&token)));
    for i in 0..CHUNK_ENTRIES {
        let Some(entry) = job.pending.pop_front() else { break };
        if i > 0 {
            j.push(',');
        }
        j.push_str(&entry);
    }
    let done = job.dirs.is_empty() && job.pending.is_empty();
    j.push_str(&format!(
        "],\"done\":{done},\"folders\":{},\"links\":{},\"denied\":{},\"truncated\":{}}}",
        job.folders, job.links, job.denied, job.truncated
    ));
    if done {
        jobs.by_token.remove(&token);
        jobs.order.retain(|t| t != &token);
    }
    Ok(j)
}

/// The person's Music folder (FOLDERID_Music), wherever it was moved (OneDrive included).
pub fn music_folder() -> Option<String> {
    unsafe {
        let p = SHGetKnownFolderPath(&FOLDERID_Music, KF_FLAG_DEFAULT, None).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s
    }
}

/// A JPEG of at most `size` px on its longest side (never enlarged) as base64, from an image file,
/// from `length` bytes at `offset` in a file (a picture embedded in an audio file's tags) or from
/// bytes; None when it cannot be decoded or stay under the byte budget. The file's attributes are
/// checked right before it is opened: a cloud-only file is refused.
pub fn thumb(path: &str, bytes_b64: &str, size: i32, offset: i64, length: i32) -> Result<Option<String>, Failure> {
    let size = size.clamp(32, 1600) as u32;
    let data = if !path.is_empty() {
        let a = attributes(path);
        if a == INVALID_FILE_ATTRIBUTES || (a & ATTR_DIRECTORY) != 0 {
            return Ok(None);
        }
        if (a & CLOUD_ONLY) != 0 {
            return Err(Failure::error("cloud-only file: not read"));
        }
        if offset < 0 || length < 0 || i64::from(length) > MAX_IMAGE_BYTES {
            return Ok(None);
        }
        // FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE: never in the way of other programs.
        // FILE_FLAG_OPEN_NO_RECALL: the data stays where it is, even when `path` is a link to a
        // cloud-only file, which the check above (the link's own attributes) cannot see.
        let mut f = OpenOptions::new()
            .read(true)
            .share_mode(0x7)
            .custom_flags(FILE_FLAG_OPEN_NO_RECALL)
            .open(path)
            .map_err(|e| Failure::error(e.to_string()))?;
        let meta = f.metadata().map_err(|e| Failure::error(e.to_string()))?;
        if (meta.file_attributes() & CLOUD_ONLY) != 0 {
            return Err(Failure::error("cloud-only file: not read"));
        }
        let file_len = meta.len() as i64;
        let n = if length > 0 { i64::from(length) } else { file_len };
        if n > MAX_IMAGE_BYTES || offset + n > file_len {
            return Ok(None);
        }
        let mut data = vec![0u8; n as usize];
        f.seek(SeekFrom::Start(offset as u64)).map_err(|e| Failure::error(e.to_string()))?;
        if f.read_exact(&mut data).is_err() {
            return Ok(None);
        }
        data
    } else if !bytes_b64.is_empty() {
        unbase64(bytes_b64)?
    } else {
        return Ok(None);
    };
    let budget = if size <= 300 { 200 * 1024 } else { 700 * 1024 };
    Ok(crate::image::jpeg(&data, size, &[88, 78, 68, 58], budget).ok().flatten().map(|b| base64(&b)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_and_links() {
        assert_eq!(kind_of("01 Song.FLAC"), Some("audio"));
        assert_eq!(kind_of("cover.webp"), Some("image"));
        assert_eq!(kind_of("01 Song.lrc"), Some("lyrics"));
        assert_eq!(kind_of("notes.txt"), None);
        assert_eq!(kind_of("flac"), None);
        assert!(is_link(ATTR_DIRECTORY | ATTR_REPARSE, 0xA000_0003)); // junction
        assert!(!is_link(ATTR_DIRECTORY | ATTR_REPARSE, 0x9000_601A)); // OneDrive placeholder
        assert!(!is_link(ATTR_DIRECTORY, 0));
    }

    #[test]
    fn long_paths() {
        assert_eq!(long(r"C:\Music"), r"\\?\C:\Music");
        assert_eq!(long(r"\\nas\music"), r"\\?\UNC\nas\music");
        assert_eq!(long(r"\\?\C:\x"), r"\\?\C:\x");
    }

    #[test]
    fn scan_refuses_relative_roots_and_unknown_tokens() {
        assert!(matches!(scan("Music", ""), Err(Failure::Error(m)) if m == "scan needs an absolute root"));
        assert!(matches!(scan("", "999"), Err(Failure::Error(m)) if m == "unknown scan token"));
        assert_eq!(
            scan(r"C:\no-such-dir-b-side", "").ok().unwrap(),
            "{\"missing\":true,\"done\":true,\"entries\":[]}"
        );
    }
}
