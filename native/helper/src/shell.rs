// Hands a file to AIMP the way Explorer does. The Microsoft Store AIMP has no execution alias, so
// it is reached through the file-type classes (ProgIDs) its package registers, read from the
// registry each time: they differ per PC and per package version. A classic AIMP.exe takes the
// same request on its command line.
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};

use windows::core::{HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_SUCCESS, HWND};
use windows::Win32::Storage::FileSystem::{GetFileAttributesW, GetFullPathNameW, FILE_ATTRIBUTE_DIRECTORY, INVALID_FILE_ATTRIBUTES};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
use windows::Win32::System::Registry::{
    RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ, REG_SZ, REG_VALUE_TYPE,
};
use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_CLASSNAME, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowThreadProcessId, SW_SHOWNOACTIVATE};

use crate::json::esc;
use crate::Failure;

const REPOSITORY: &str = r"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages";
const STORE_PREFIX: &str = "25018artemizmaylov.aimp_";
const STORE_PUBLISHER: &str = "__4hdg3aaevdv22";

/// A registry key of the current user, opened for reading, closed when dropped.
struct Key(HKEY);

impl Key {
    fn open(path: &str) -> Option<Key> {
        let mut k = HKEY::default();
        let r = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(path), None, KEY_READ, &mut k) };
        (r == ERROR_SUCCESS).then_some(Key(k))
    }

    fn subkeys(&self) -> Vec<String> {
        let mut names = Vec::new();
        let mut buf = [0u16; 256];
        for i in 0.. {
            let mut len = buf.len() as u32;
            let r = unsafe { RegEnumKeyExW(self.0, i, Some(PWSTR(buf.as_mut_ptr())), &mut len, None, None, None, None) };
            if r != ERROR_SUCCESS {
                break;
            }
            names.push(String::from_utf16_lossy(&buf[..len as usize]));
        }
        names
    }

    fn string(&self, name: &str) -> Option<String> {
        let name = HSTRING::from(name);
        let mut kind = REG_VALUE_TYPE::default();
        let mut size = 0u32;
        unsafe {
            if RegQueryValueExW(self.0, &name, None, Some(&mut kind), None, Some(&mut size)) != ERROR_SUCCESS || kind != REG_SZ || size > 65536 {
                return None;
            }
            let mut buf = vec![0u16; (size as usize).div_ceil(2)];
            if RegQueryValueExW(self.0, &name, None, Some(&mut kind), Some(buf.as_mut_ptr() as *mut u8), Some(&mut size)) != ERROR_SUCCESS {
                return None;
            }
            let units = &buf[..(size as usize / 2).min(buf.len())];
            let end = units.iter().position(|&c| c == 0).unwrap_or(units.len());
            Some(String::from_utf16_lossy(&units[..end]))
        }
    }
}

impl Drop for Key {
    fn drop(&mut self) {
        unsafe {
            let _ = RegCloseKey(self.0);
        }
    }
}

/// A version as .NET's Version.TryParse reads it: 2 to 4 non-negative numbers; a missing part
/// sorts before 0.
fn version(s: &str) -> Option<[i64; 4]> {
    let parts: Vec<&str> = s.split('.').collect();
    if !(2..=4).contains(&parts.len()) {
        return None;
    }
    let mut v = [-1i64; 4];
    for (i, p) in parts.iter().enumerate() {
        let p = p.trim();
        if p.is_empty() || !p.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
        v[i] = p.parse::<i32>().ok()?.into();
    }
    Some(v)
}

/// The newest installed Store AIMP package (its full name), or None.
pub fn store_package() -> Option<String> {
    let packages = Key::open(REPOSITORY)?;
    let mut best: Option<(String, [i64; 4])> = None;
    for name in packages.subkeys() {
        let lower = name.to_lowercase();
        if !lower.starts_with(STORE_PREFIX) || !lower.ends_with(STORE_PUBLISHER) {
            continue;
        }
        let parts: Vec<&str> = name.split('_').collect();
        let Some(v) = parts.get(1).and_then(|p| version(p)) else { continue };
        if best.as_ref().is_none_or(|(_, b)| v > *b) {
            best = Some((name, v));
        }
    }
    best.map(|(name, _)| name)
}

/// The ProgID the Store package registered for this extension (".m3u8", ".flac", ...), or None.
pub fn store_prog_id(package: Option<&str>, extension: &str) -> Option<String> {
    let package = package?;
    let fa = Key::open(&format!(r"{REPOSITORY}\{package}\AIMP\Capabilities\FileAssociations"))?;
    fa.string(extension).filter(|id| !id.is_empty())
}

fn has_verb(prog_id: &str, verb: &str) -> bool {
    Key::open(&format!(r"Software\Classes\{prog_id}\Shell\{verb}")).is_some()
}

/// The image of the running AIMP (the window of its Remote API), or None.
fn running_exe() -> Option<String> {
    let h = crate::aimp::window()?;
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(h, Some(&mut pid)) };
    let p = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut buf = [0u16; 1024];
    let mut size = buf.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(p, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut size) }.is_ok();
    unsafe {
        let _ = CloseHandle(p);
    }
    ok.then(|| String::from_utf16_lossy(&buf[..size as usize]))
}

fn is_packaged(exe: &str) -> bool {
    exe.to_lowercase().contains(r"\windowsapps\")
}

fn exists(path: &str, directory: bool) -> bool {
    let a = unsafe { GetFileAttributesW(&HSTRING::from(path)) };
    a != INVALID_FILE_ATTRIBUTES && ((a & FILE_ATTRIBUTE_DIRECTORY.0) != 0) == directory
}

/// A classic AIMP: the one running, else one in Program Files; None for the Store edition.
fn classic_exe() -> Option<String> {
    if let Some(running) = running_exe() {
        if is_packaged(&running) {
            return None;
        }
        // Any program can name a window AIMP2_RemoteInfo: only one called AIMP.exe is started.
        if running.rsplit('\\').next().is_some_and(|name| name.eq_ignore_ascii_case("AIMP.exe")) {
            return Some(running);
        }
    }
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        let Ok(root) = std::env::var(var) else { continue };
        if root.is_empty() {
            continue;
        }
        let exe = format!(r"{}\AIMP\AIMP.exe", root.trim_end_matches('\\'));
        if exists(&exe, false) {
            return Some(exe);
        }
    }
    None
}

/// What open would use, for diagnostics: {"edition", "classicExe", "package", "playlistProgId",
/// "audioProgId"}.
pub fn info() -> String {
    let classic = classic_exe();
    let package = store_package();
    let edition = if classic.is_some() {
        Some("classic")
    } else if package.is_some() {
        Some("store")
    } else {
        None
    };
    format!(
        "{{\"edition\":{},\"classicExe\":{},\"package\":{},\"playlistProgId\":{},\"audioProgId\":{}}}",
        esc(edition),
        esc(classic.as_deref()),
        esc(package.as_deref()),
        esc(store_prog_id(package.as_deref(), ".m3u8").as_deref()),
        esc(store_prog_id(package.as_deref(), ".flac").as_deref())
    )
}

/// Path.IsPathRooted of .NET: a leading separator or a drive letter.
fn is_rooted(path: &str) -> bool {
    let b = path.as_bytes();
    matches!(b.first(), Some(b'\\' | b'/')) || (b.len() >= 2 && b[1] == b':')
}

fn full_path(path: &str) -> Option<String> {
    let p = HSTRING::from(path);
    let mut buf = vec![0u16; 1024];
    loop {
        let n = unsafe { GetFullPathNameW(&p, Some(&mut buf), None) } as usize;
        if n == 0 {
            return None;
        }
        if n < buf.len() {
            return Some(String::from_utf16_lossy(&buf[..n]));
        }
        buf.resize(n + 1, 0);
    }
}

/// Path.GetExtension: from the last dot of the file name, "" when there is none.
fn extension(path: &str) -> &str {
    let name = path.rsplit(['\\', '/']).next().unwrap_or(path);
    match name.rfind('.') {
        Some(i) if i + 1 < name.len() => &name[i..],
        _ => "",
    }
}

/// ShellExecuteEx on a thread of its own in a single-threaded apartment, as the shell asks: AIMP's
/// file association may be served by shell extensions that need one.
fn shell_execute(verb: &str, path: &str, prog_id: &str) -> Result<(), u32> {
    let (verb, path, prog_id) = (HSTRING::from(verb), HSTRING::from(path), HSTRING::from(prog_id));
    std::thread::spawn(move || unsafe {
        let com = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE).is_ok();
        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_CLASSNAME | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
            hwnd: HWND::default(),
            lpVerb: PCWSTR(verb.as_ptr()),
            lpFile: PCWSTR(path.as_ptr()),
            lpClass: PCWSTR(prog_id.as_ptr()),
            nShow: SW_SHOWNOACTIVATE.0,
            ..Default::default()
        };
        let r = ShellExecuteExW(&mut info).map_err(|_| GetLastError().0);
        if com {
            CoUninitialize();
        }
        r
    })
    .join()
    .unwrap_or(Err(0))
}

/// Opens `path` in AIMP. verb "open": what a double click does (AIMP 4.60 opens a playlist file in a
/// playlist tab and plays it); "AddToPlaylist": AIMP's /INSERT, which appends the file, or a
/// playlist file's tracks in order, to the end of the playing playlist without interrupting it.
/// The caller vouches for the path. Answers "classic" or "store".
pub fn open(path: &str, verb: &str) -> Result<&'static str, Failure> {
    if verb != "open" && verb != "AddToPlaylist" {
        return Err(Failure::error(format!("Unknown verb {verb}")));
    }
    let not_found = || Failure::error("No such file");
    if path.is_empty() {
        return Err(not_found());
    }
    // .NET's path checks, in the PowerShell helper's order.
    if path.chars().any(|c| (c as u32) < 0x20 || "\"<>|".contains(c)) {
        return Err(Failure::error("Illegal characters in path."));
    }
    if !is_rooted(path) {
        return Err(not_found());
    }
    let path = full_path(path).ok_or_else(not_found)?; // the shell refuses forward slashes
    if !exists(&path, false) {
        return Err(not_found());
    }
    if let Some(classic) = classic_exe() {
        let args = format!("{}\"{path}\"", if verb == "open" { "" } else { "/INSERT " });
        Command::new(&classic)
            .raw_arg(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| Failure::error(e.to_string()))?;
        return Ok("classic");
    }
    let package = store_package().ok_or_else(|| Failure::error("AIMP is not installed"))?;
    let ext = extension(&path).to_lowercase();
    let mut prog_id = store_prog_id(Some(&package), &ext);
    // A playlist file has only "open"; AIMP's audio class adds a playlist's tracks with /INSERT.
    if verb == "AddToPlaylist" && prog_id.as_deref().is_none_or(|p| !has_verb(p, verb)) {
        prog_id = store_prog_id(Some(&package), ".flac");
    }
    let prog_id = prog_id
        .filter(|p| has_verb(p, verb))
        .ok_or_else(|| Failure::error(format!("AIMP does not open {} files with {verb}", extension(&path))))?;
    shell_execute(verb, &path, &prog_id).map_err(|e| Failure::error(format!("Windows could not open the file in AIMP (error {e})")))?;
    Ok("store")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare_like_dotnet() {
        assert!(version("4.60.2186.0").unwrap() > version("4.60.2185.0").unwrap());
        assert!(version("4.60").unwrap() < version("4.60.0").unwrap());
        assert!(version("4").is_none() && version("4.x").is_none() && version("1.2.3.4.5").is_none() && version("-1.2").is_none());
    }

    #[test]
    fn paths_like_dotnet() {
        assert!(is_rooted(r"C:\a") && is_rooted(r"\\nas\m") && is_rooted("C:a") && !is_rooted(r"relative\x.flac"));
        assert_eq!(extension(r"C:\a.b\song.FLAC"), ".FLAC");
        assert_eq!(extension(r"C:\a.b\song"), "");
        assert_eq!(extension(r"C:\a\song."), "");
    }

    #[test]
    fn refuses_bad_paths_before_the_shell() {
        for p in ["", r"relative\x.flac", r"C:\no-such-dir\B-Side-missing.m3u8"] {
            assert!(matches!(open(p, "open"), Err(Failure::Error(m)) if m == "No such file"), "{p}");
        }
        for p in [r#"C:\a\"b".flac"#, "C:\\a\\b\n.flac", r"C:\a|b.flac", r"relative<x"] {
            assert!(matches!(open(p, "open"), Err(Failure::Error(m)) if m == "Illegal characters in path."), "{p}");
        }
        assert!(matches!(open(r"C:\x.flac", "delete"), Err(Failure::Error(_))));
    }
}
