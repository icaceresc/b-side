// AIMP's Remote API: properties and commands as window messages to the "AIMP2_RemoteInfo" window,
// the playing track from the shared memory of the same name, and the cover as WM_COPYDATA to a
// message-only window of ours.
use std::sync::{Condvar, Mutex};
use std::time::Duration;

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::DataExchange::COPYDATASTRUCT;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Memory::{MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, FILE_MAP_READ};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, FindWindowW, GetMessageW, IsWindow, PeekMessageW, RegisterClassExW, SendMessageTimeoutW,
    HWND_MESSAGE, MSG, PM_NOREMOVE, SMTO_ABORTIFHUNG, SMTO_BLOCK, WINDOW_EX_STYLE, WINDOW_STYLE, WNDCLASSEXW,
};

use crate::json::{base64, esc};
use crate::Failure;

const WM_USER: u32 = 0x400;
const WM_COPYDATA: u32 = 0x4A;
const WM_AIMP_COMMAND: u32 = WM_USER + 0x75;
const WM_AIMP_PROPERTY: u32 = WM_USER + 0x77;
const PROP_VERSION: i32 = 0x10;
const PROP_POSITION: i32 = 0x20;
const PROP_DURATION: i32 = 0x30;
const PROP_STATE: i32 = 0x40;
const PROP_VOLUME: i32 = 0x50;
const PROP_MUTE: i32 = 0x60;
const PROP_REPEAT: i32 = 0x70;
const PROP_SHUFFLE: i32 = 0x80;
const GET: i32 = 0;
const SET: i32 = 1;
pub const CMD_PLAY: i32 = 13;
pub const CMD_PLAYPAUSE: i32 = 14;
pub const CMD_PAUSE: i32 = 15;
pub const CMD_STOP: i32 = 16;
pub const CMD_NEXT: i32 = 17;
pub const CMD_PREV: i32 = 18;
const CMD_GET_ALBUMART: i32 = 29;
const INFO_BYTES: usize = 2048;

/// Marks this thread as ready for input, so Windows drops the "working in background" cursor it
/// shows while a newly started Windows-subsystem program has not yet looked at its messages.
pub fn ready_for_input() {
    let mut msg = MSG::default();
    unsafe {
        let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
    }
}

pub fn window() -> Option<HWND> {
    unsafe { FindWindowW(w!("AIMP2_RemoteInfo"), PCWSTR::null()) }.ok().filter(|h| !h.is_invalid())
}

fn send(h: HWND, msg: u32, w: i32, l: isize) -> Result<i64, Failure> {
    let mut result = 0usize;
    // SMTO_ABORTIFHUNG | SMTO_BLOCK: never hang if AIMP is busy.
    let ok = unsafe {
        SendMessageTimeoutW(
            h,
            msg,
            WPARAM(w as isize as usize),
            LPARAM(l),
            SMTO_ABORTIFHUNG | SMTO_BLOCK,
            1000,
            Some(&mut result),
        )
    };
    if ok.0 == 0 {
        if !unsafe { IsWindow(Some(h)) }.as_bool() {
            return Err(Failure::Closed);
        }
        return Err(Failure::Timeout("AIMP did not answer".to_string()));
    }
    Ok(result as isize as i64)
}

fn get(h: HWND, prop: i32) -> Result<i64, Failure> {
    send(h, WM_AIMP_PROPERTY, prop | GET, 0)
}
fn set(h: HWND, prop: i32, value: i32) -> Result<(), Failure> {
    send(h, WM_AIMP_PROPERTY, prop | SET, value as isize).map(|_| ())
}
pub fn command(h: HWND, cmd: i32) -> Result<(), Failure> {
    send(h, WM_AIMP_COMMAND, cmd, 0).map(|_| ())
}
pub fn seek(h: HWND, ms: i32) -> Result<(), Failure> {
    set(h, PROP_POSITION, ms)
}
pub fn volume(h: HWND, v: i32) -> Result<(), Failure> {
    set(h, PROP_VOLUME, v.clamp(0, 100))
}
pub fn shuffle(h: HWND, on: bool) -> Result<(), Failure> {
    set(h, PROP_SHUFFLE, i32::from(on))
}
pub fn repeat(h: HWND, on: bool) -> Result<(), Failure> {
    set(h, PROP_REPEAT, i32::from(on))
}
pub fn mute(h: HWND, on: bool) -> Result<(), Failure> {
    set(h, PROP_MUTE, i32::from(on))
}

/// AIMP closed (before or during the read) is a state; AIMP not answering is an error.
pub fn state() -> Result<String, Failure> {
    match read_state() {
        Err(Failure::Closed) => Ok("{\"running\":false}".to_string()),
        other => other,
    }
}

/// AIMP's shared memory, mapped read-only for one read.
struct View(windows::Win32::System::Memory::MEMORY_MAPPED_VIEW_ADDRESS, windows::Win32::Foundation::HANDLE);

impl View {
    fn open() -> Option<View> {
        unsafe {
            let map = OpenFileMappingW(FILE_MAP_READ.0, false, w!("AIMP2_RemoteInfo")).ok()?;
            let view = MapViewOfFile(map, FILE_MAP_READ, 0, 0, INFO_BYTES);
            if view.Value.is_null() {
                let _ = CloseHandle(map);
                return None;
            }
            Some(View(view, map))
        }
    }
    /// A copy of the block. AIMP writes it from its own process at any time, so it is read with
    /// volatile byte reads into memory of ours and never borrowed; a copy taken while AIMP changes
    /// track can mix the two, and every length is checked against the block on the copy.
    fn copy(&self) -> [u8; INFO_BYTES] {
        let mut out = [0u8; INFO_BYTES];
        let base = self.0.Value as *const u8;
        for (i, b) in out.iter_mut().enumerate() {
            *b = unsafe { std::ptr::read_volatile(base.add(i)) };
        }
        out
    }
}

impl Drop for View {
    fn drop(&mut self) {
        unsafe {
            let _ = UnmapViewOfFile(self.0);
            let _ = CloseHandle(self.1);
        }
    }
}

fn u32_at(b: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}

/// TAIMPRemoteFileInfo: 88-byte header, then UTF-16 strings in this order.
fn track_json(b: &[u8]) -> String {
    let header = u32_at(b, 0) as i32;
    let active = u32_at(b, 4) != 0;
    let mut j = String::from("{\"active\":");
    j.push_str(if active { "true" } else { "false" });
    j.push_str(&format!(",\"headerSize\":{header}"));
    j.push_str(&format!(",\"bitrate\":{}", u32_at(b, 8)));
    j.push_str(&format!(",\"channels\":{}", u32_at(b, 12)));
    j.push_str(&format!(",\"durationMs\":{}", u32_at(b, 16)));
    let file_size = i64::from_le_bytes(b[20..28].try_into().unwrap_or([0; 8]));
    j.push_str(&format!(",\"fileSize\":{file_size}"));
    j.push_str(&format!(",\"sampleRate\":{}", u32_at(b, 32)));
    j.push_str(&format!(",\"trackNumber\":{}", u32_at(b, 36)));
    let names = ["album", "artist", "date", "fileName", "genre", "title"];
    let mut offset: i64 = if header > 0 && header < 512 { i64::from(header) } else { 88 };
    let mut overflow = false;
    for (i, name) in names.iter().enumerate() {
        let mut len = i64::from(u32_at(b, 40 + i * 4) as i32);
        // Past the 2 KB block the strings that follow cannot be located: stop there.
        if overflow || len < 0 || offset + len * 2 > INFO_BYTES as i64 {
            overflow = true;
            len = 0;
        }
        let start = offset as usize;
        let units: Vec<u16> = (0..len as usize)
            .map(|k| u16::from_le_bytes([b[start + 2 * k], b[start + 2 * k + 1]]))
            .collect();
        offset += len * 2;
        j.push_str(&format!(",\"{name}\":{}", esc(Some(&String::from_utf16_lossy(&units)))));
    }
    j.push('}');
    j
}

fn read_state() -> Result<String, Failure> {
    let Some(h) = window() else { return Ok("{\"running\":false}".to_string()) };
    let mut j = String::from("{\"running\":true");
    let state = get(h, PROP_STATE)?;
    j.push_str(&format!(
        ",\"state\":\"{}\"",
        if state == 2 {
            "playing"
        } else if state == 1 {
            "paused"
        } else {
            "stopped"
        }
    ));
    j.push_str(&format!(",\"positionMs\":{}", get(h, PROP_POSITION)?));
    j.push_str(&format!(",\"durationMs\":{}", get(h, PROP_DURATION)?));
    j.push_str(&format!(",\"volume\":{}", get(h, PROP_VOLUME)?));
    j.push_str(&format!(",\"mute\":{}", get(h, PROP_MUTE)? != 0));
    j.push_str(&format!(",\"repeat\":{}", get(h, PROP_REPEAT)? != 0));
    j.push_str(&format!(",\"shuffle\":{}", get(h, PROP_SHUFFLE)? != 0));
    j.push_str(&format!(",\"version\":{}", get(h, PROP_VERSION)?));
    match View::open() {
        Some(view) => {
            j.push_str(",\"track\":");
            j.push_str(&track_json(&view.copy()));
        }
        None => j.push_str(",\"track\":null"),
    }
    j.push('}');
    Ok(j)
}

// Album art arrives as WM_COPYDATA to a window of ours, so it needs a message loop. AIMP sends the
// cover re-encoded, often as a PNG of 0.8-2 MB for a detailed 600 px cover. It is taken up to
// MAX_ART_BYTES and, when bigger than ART_TARGET, re-encoded as JPEG so its data URL fits in one
// 1 MiB panel answer.
const MAX_ART_BYTES: usize = 32 * 1024 * 1024;
const ART_TARGET: usize = 600 * 1024;
const ART_MAX_SIDE: u32 = 1000;

struct ArtSlot {
    waiting: bool,
    data: Option<Vec<u8>>,
}

static SLOT: Mutex<ArtSlot> = Mutex::new(ArtSlot { waiting: false, data: None });
static GOT: Condvar = Condvar::new();
static ART_WINDOW: Mutex<Option<isize>> = Mutex::new(None);

extern "system" fn art_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if msg == WM_COPYDATA && lparam.0 != 0 {
        if let Ok(mut s) = SLOT.lock() {
            // AIMP's wParam is not its Remote API window, so the sender cannot be told apart; a cover
            // is taken only while a request waits for one.
            if s.waiting {
                let cds = unsafe { &*(lparam.0 as *const COPYDATASTRUCT) };
                let n = cds.cbData as usize;
                let bytes = if n > 0 && n <= MAX_ART_BYTES && !cds.lpData.is_null() {
                    unsafe { std::slice::from_raw_parts(cds.lpData as *const u8, n) }.to_vec()
                } else {
                    Vec::new()
                };
                s.data = Some(bytes);
                s.waiting = false;
                GOT.notify_all();
                return LRESULT(1);
            }
        }
    }
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

/// The message-only window (HWND_MESSAGE: not visible to other programs' window enumeration) on a
/// thread of its own, created on the first cover request, and again if it is gone or was slow to
/// start.
fn art_window() -> Option<isize> {
    let mut current = ART_WINDOW.lock().ok()?;
    if let Some(h) = *current {
        if unsafe { IsWindow(Some(HWND(h as *mut _))) }.as_bool() {
            return Some(h);
        }
    }
    *current = {
        let (tx, rx) = std::sync::mpsc::channel::<isize>();
        std::thread::spawn(move || unsafe {
            let instance = GetModuleHandleW(PCWSTR::null()).unwrap_or_default();
            let class = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                lpfnWndProc: Some(art_proc),
                hInstance: instance.into(),
                lpszClassName: w!("BSideArtWindow"),
                ..Default::default()
            };
            RegisterClassExW(&class);
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("BSideArtWindow"),
                PCWSTR::null(),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(instance.into()),
                None,
            );
            let Ok(hwnd) = hwnd else {
                let _ = tx.send(0);
                return;
            };
            // Nobody waits for a window that came too late: it goes away again.
            if tx.send(hwnd.0 as isize).is_err() {
                let _ = DestroyWindow(hwnd);
                return;
            }
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
                DispatchMessageW(&msg);
            }
        });
        rx.recv_timeout(Duration::from_secs(5)).ok().filter(|&h| h != 0)
    };
    *current
}

pub fn album_art() -> Result<Option<String>, Failure> {
    let Some(h) = window() else { return Ok(None) };
    let art = art_window().ok_or_else(|| Failure::error("The cover window did not start"))?;
    let lock = || SLOT.lock().map_err(|_| Failure::error("The cover window failed"));
    {
        let mut s = lock()?;
        s.data = None;
        s.waiting = true;
    }
    let mut result = 0usize;
    let sent = unsafe {
        SendMessageTimeoutW(
            h,
            WM_AIMP_COMMAND,
            WPARAM(CMD_GET_ALBUMART as usize),
            LPARAM(art),
            SMTO_ABORTIFHUNG | SMTO_BLOCK,
            3000,
            Some(&mut result),
        )
    };
    // AIMP did not take the request (busy, or gone): no cover now, and none taken later for it.
    if sent.0 == 0 {
        lock()?.waiting = false;
        return Ok(None);
    }
    let (mut s, _) = GOT
        .wait_timeout_while(lock()?, Duration::from_millis(1500), |s| s.data.is_none())
        .map_err(|_| Failure::error("The cover window failed"))?;
    s.waiting = false;
    let data = s.data.take();
    drop(s);
    match data {
        Some(d) if !d.is_empty() => Ok(shrink(d).map(|b| base64(&b))),
        _ => Ok(None),
    }
}

fn shrink(data: Vec<u8>) -> Option<Vec<u8>> {
    if data.len() <= ART_TARGET {
        return Some(data);
    }
    crate::image::jpeg(&data, ART_MAX_SIDE, &[90, 80, 70, 60], ART_TARGET).ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info(header: u32, strings: &[&str]) -> Vec<u8> {
        let mut b = vec![0u8; INFO_BYTES];
        b[0..4].copy_from_slice(&header.to_le_bytes());
        b[4..8].copy_from_slice(&1u32.to_le_bytes());
        b[8..12].copy_from_slice(&1011u32.to_le_bytes());
        b[12..16].copy_from_slice(&2u32.to_le_bytes());
        b[16..20].copy_from_slice(&320357u32.to_le_bytes());
        b[20..28].copy_from_slice(&40586744i64.to_le_bytes());
        b[32..36].copy_from_slice(&44100u32.to_le_bytes());
        b[36..40].copy_from_slice(&7u32.to_le_bytes());
        let mut at = header as usize;
        for (i, s) in strings.iter().enumerate() {
            let units: Vec<u16> = s.encode_utf16().collect();
            b[40 + i * 4..44 + i * 4].copy_from_slice(&(units.len() as u32).to_le_bytes());
            for u in units {
                b[at..at + 2].copy_from_slice(&u.to_le_bytes());
                at += 2;
            }
        }
        b
    }

    #[test]
    fn reads_the_track_block() {
        let b = info(88, &["Álbum", "Artist", "2001", "C:\\m\\01 \"Song\".flac", "", "空中"]);
        assert_eq!(
            track_json(&b),
            "{\"active\":true,\"headerSize\":88,\"bitrate\":1011,\"channels\":2,\"durationMs\":320357,\"fileSize\":40586744,\"sampleRate\":44100,\"trackNumber\":7,\
             \"album\":\"Álbum\",\"artist\":\"Artist\",\"date\":\"2001\",\"fileName\":\"C:\\\\m\\\\01 \\\"Song\\\".flac\",\"genre\":\"\",\"title\":\"空中\"}"
        );
    }

    #[test]
    fn stops_at_strings_past_the_block() {
        let mut b = info(88, &["a", "b"]);
        b[48..52].copy_from_slice(&5000u32.to_le_bytes()); // "date" claims 10 KB
        b[52..56].copy_from_slice(&1u32.to_le_bytes());
        let j = track_json(&b);
        assert!(
            j.contains("\"album\":\"a\",\"artist\":\"b\",\"date\":\"\",\"fileName\":\"\",\"genre\":\"\",\"title\":\"\""),
            "{j}"
        );
        let mut b = info(88, &[]);
        b[40..44].copy_from_slice(&(-1i32).to_le_bytes());
        assert!(track_json(&b).contains("\"album\":\"\""));
        // A header outside 1..511 falls back to 88.
        let b = info(88, &["x"]);
        let mut c = b.clone();
        c[0..4].copy_from_slice(&4096u32.to_le_bytes());
        assert!(track_json(&c).contains("\"headerSize\":4096") && track_json(&c).contains("\"album\":\"x\""));
    }
}
