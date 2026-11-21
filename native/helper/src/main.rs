// B-Side helper, native build of native/aimp-helper.ps1 with the same protocol: one JSON request
// per line on stdin ({"id", "cmd", "args"}), one JSON reply per line on stdout
// ({"id", "ok": true, "result"} or {"id", "ok": false, "code", "error"}). Exits when stdin closes.
//
// It talks to AIMP through its official Remote API (window messages and the "AIMP2_RemoteInfo"
// shared memory) and hands files to AIMP the way Explorer does (its file association verbs). For
// the library it lists the folders the worker names and makes JPEG thumbnails, reading only. No
// network, and it writes no file.
//
// A Windows-subsystem program: started with pipes it needs no console, so no console host
// process runs beside it.
#![windows_subsystem = "windows"]

mod aimp;
mod files;
mod image;
mod json;
mod shell;

use std::io::{BufRead, Write};
use std::panic::{catch_unwind, AssertUnwindSafe};

use json::{esc, field, ps_bool, ps_int, ps_long, ps_string};
use serde_json::Value;

/// A failed request: its code on the wire and its message.
pub enum Failure {
    /// AIMP's window went away during a request (AIMP closed).
    Closed,
    Timeout(String),
    Invalid(String),
    Error(String),
}

impl Failure {
    pub fn error(message: impl Into<String>) -> Self {
        Failure::Error(message.into())
    }
}

/// What a request answers: JSON already built (state, scan, shellInfo) or a plain value.
enum Answer {
    Raw(String),
    Null,
    Bool(bool),
    Text(String),
}

impl From<Option<String>> for Answer {
    fn from(v: Option<String>) -> Self {
        v.map_or(Answer::Null, Answer::Text)
    }
}

fn reply(out: &mut impl Write, id: Option<i32>, result: Result<Answer, Failure>) {
    let id = id.map_or("null".to_string(), |n| n.to_string());
    let line = match result {
        Ok(answer) => {
            let result = match answer {
                Answer::Raw(json) => json,
                Answer::Null => "null".to_string(),
                Answer::Bool(b) => b.to_string(),
                Answer::Text(s) => esc(Some(&s)),
            };
            format!("{{\"id\":{id},\"ok\":true,\"result\":{result}}}")
        }
        Err(failure) => {
            let (code, message) = match failure {
                Failure::Closed => ("aimp_closed", "AIMP is not running".to_string()),
                Failure::Timeout(m) => ("aimp_timeout", m),
                Failure::Invalid(m) => ("invalid", m),
                Failure::Error(m) => ("aimp_error", m),
            };
            format!("{{\"id\":{id},\"ok\":false,\"code\":\"{code}\",\"error\":{}}}", esc(Some(&message)))
        }
    };
    // A closed stdout means the worker is gone: nothing left to do.
    if out
        .write_all(line.as_bytes())
        .and_then(|_| out.write_all(b"\n"))
        .and_then(|_| out.flush())
        .is_err()
    {
        std::process::exit(0);
    }
}

/// The command's canonical name: PowerShell's switch matches names ignoring case.
fn canonical(cmd: &str) -> Option<&'static str> {
    const NAMES: [&str; 21] = [
        "ping",
        "state",
        "shellInfo",
        "openFile",
        "insertFile",
        "scan",
        "musicFolder",
        "thumb",
        "art",
        "playPause",
        "play",
        "pause",
        "stop",
        "next",
        "previous",
        "seek",
        "volume",
        "shuffle",
        "repeat",
        "mute",
        "",
    ];
    NAMES.into_iter().find(|n| !n.is_empty() && n.eq_ignore_ascii_case(cmd))
}

fn handle(cmd: &str, a: &Value) -> Result<Answer, Failure> {
    let arg = |k: &str| field(a, k);
    let Some(name) = canonical(cmd) else {
        // An unknown command still needs AIMP's window first, as in the PowerShell helper.
        aimp::window().ok_or(Failure::Closed)?;
        return Err(Failure::Invalid(format!("unknown command: {cmd}")));
    };
    match name {
        // The worker's first request: the helper is up and answering. It does nothing else.
        "ping" => return Ok(Answer::Bool(true)),
        "state" => return aimp::state().map(Answer::Raw),
        // Handing a file to AIMP also starts AIMP when it is closed. The worker vouches for the
        // path: it writes the queue playlist itself or takes the file from its library.
        "shellInfo" => return Ok(Answer::Raw(shell::info())),
        "openFile" => return shell::open(&ps_string(arg("path")), "open").map(|s| Answer::Text(s.into())),
        "insertFile" => return shell::open(&ps_string(arg("path")), "AddToPlaylist").map(|s| Answer::Text(s.into())),
        // Library files: need no AIMP. Paths come from the worker, never from the panel.
        "scan" => return files::scan(&ps_string(arg("root")), &ps_string(arg("token"))).map(Answer::Raw),
        "musicFolder" => return Ok(files::music_folder().into()),
        "thumb" => {
            let path = ps_string(arg("path"));
            let b64 = ps_string(arg("bytesB64"));
            let size = ps_int(arg("size"))?;
            let offset = ps_long(arg("offset"))?;
            let length = ps_int(arg("length"))?;
            return files::thumb(&path, &b64, size, offset, length).map(Answer::from);
        }
        _ => {}
    }
    let h = aimp::window().ok_or(Failure::Closed)?;
    match name {
        "art" => aimp::album_art().map(Answer::from),
        "playPause" => aimp::command(h, aimp::CMD_PLAYPAUSE).map(|_| Answer::Bool(true)),
        "play" => aimp::command(h, aimp::CMD_PLAY).map(|_| Answer::Bool(true)),
        "pause" => aimp::command(h, aimp::CMD_PAUSE).map(|_| Answer::Bool(true)),
        "stop" => aimp::command(h, aimp::CMD_STOP).map(|_| Answer::Bool(true)),
        "next" => aimp::command(h, aimp::CMD_NEXT).map(|_| Answer::Bool(true)),
        "previous" => aimp::command(h, aimp::CMD_PREV).map(|_| Answer::Bool(true)),
        "seek" => aimp::seek(h, ps_int(arg("positionMs"))?).map(|_| Answer::Bool(true)),
        "volume" => aimp::volume(h, ps_int(arg("volume"))?).map(|_| Answer::Bool(true)),
        "shuffle" => aimp::shuffle(h, ps_bool(arg("on"))).map(|_| Answer::Bool(true)),
        "repeat" => aimp::repeat(h, ps_bool(arg("on"))).map(|_| Answer::Bool(true)),
        "mute" => aimp::mute(h, ps_bool(arg("on"))).map(|_| Answer::Bool(true)),
        _ => Err(Failure::Invalid(format!("unknown command: {cmd}"))),
    }
}

fn main() {
    // Free-threaded COM for the image codecs (WIC). The shell call that needs a single-threaded
    // apartment runs on a thread of its own (shell::open).
    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_MULTITHREADED);
    }
    aimp::ready_for_input();
    // A panic in one request answers that request with an error instead of ending the helper.
    std::panic::set_hook(Box::new(|_| {}));

    let stdin = std::io::stdin();
    let mut input = stdin.lock();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match input.read_until(b'\n', &mut buf) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let line = String::from_utf8_lossy(&buf);
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let req: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(e) => {
                reply(&mut out, None, Err(Failure::error(format!("Invalid JSON primitive: {e}"))));
                continue;
            }
        };
        let id = match ps_int(field(&req, "id")) {
            Ok(id) => id,
            Err(f) => {
                reply(&mut out, None, Err(f));
                continue;
            }
        };
        let cmd = ps_string(field(&req, "cmd"));
        let args = field(&req, "args").clone();
        let result = catch_unwind(AssertUnwindSafe(|| handle(&cmd, &args))).unwrap_or_else(|_| Err(Failure::error("internal error")));
        reply(&mut out, Some(id), result);
    }
}
