# B-Side helper: talks to AIMP through its official Remote API (window messages and the
# "AIMP2_RemoteInfo" shared memory) and hands files to AIMP the way Explorer does (its own file
# association verbs). No network. The only file it writes is its compiled C# in
# %LOCALAPPDATA%\B-Side\cache. One JSON request per line on stdin, one JSON reply per line on
# stdout. Exits when stdin closes.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

# All of the helper's C#, one here-string per class, compiled together by Import-BSideType.
$BSideReferences = @('System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll')
$BSideSources = @(@'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

// AIMP's window went away during a request (AIMP closed): reported as aimp_closed, not a timeout.
public class BSideClosed : Exception { }

public static class BSideAimp
{
    const uint WM_USER = 0x400, WM_COPYDATA = 0x4A;
    const uint WM_AIMP_COMMAND = WM_USER + 0x75, WM_AIMP_PROPERTY = WM_USER + 0x77;
    const int PROP_VERSION = 0x10, PROP_POSITION = 0x20, PROP_DURATION = 0x30, PROP_STATE = 0x40,
              PROP_VOLUME = 0x50, PROP_MUTE = 0x60, PROP_REPEAT = 0x70, PROP_SHUFFLE = 0x80;
    const int GET = 0, SET = 1;
    public const int CMD_PLAY = 13, CMD_PLAYPAUSE = 14, CMD_PAUSE = 15, CMD_STOP = 16, CMD_NEXT = 17, CMD_PREV = 18, CMD_GET_ALBUMART = 29;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);

    [StructLayout(LayoutKind.Sequential)]
    struct COPYDATASTRUCT { public IntPtr dwData; public int cbData; public IntPtr lpData; }

    public static IntPtr Window() { return FindWindow("AIMP2_RemoteInfo", null); }

    static long Send(IntPtr h, uint msg, int w, int l)
    {
        IntPtr result;
        // SMTO_ABORTIFHUNG | SMTO_BLOCK: never hang if AIMP is busy.
        if (SendMessageTimeout(h, msg, (IntPtr)w, (IntPtr)l, 0x0002 | 0x0001, 1000, out result) == IntPtr.Zero)
        {
            if (!IsWindow(h)) throw new BSideClosed();
            throw new TimeoutException("AIMP did not answer");
        }
        return result.ToInt64();
    }

    public static long Get(IntPtr h, int prop) { return Send(h, WM_AIMP_PROPERTY, prop | GET, 0); }
    public static void Set(IntPtr h, int prop, int value) { Send(h, WM_AIMP_PROPERTY, prop | SET, value); }
    public static void Command(IntPtr h, int cmd) { Send(h, WM_AIMP_COMMAND, cmd, 0); }
    public static void Seek(IntPtr h, int ms) { Set(h, PROP_POSITION, ms); }
    public static void Volume(IntPtr h, int v) { Set(h, PROP_VOLUME, Math.Max(0, Math.Min(100, v))); }
    public static void Shuffle(IntPtr h, bool on) { Set(h, PROP_SHUFFLE, on ? 1 : 0); }
    public static void Repeat(IntPtr h, bool on) { Set(h, PROP_REPEAT, on ? 1 : 0); }
    public static void Mute(IntPtr h, bool on) { Set(h, PROP_MUTE, on ? 1 : 0); }

    internal static string Esc(string s)
    {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') b.Append('\\').Append(c);
            else if (c < 0x20) b.AppendFormat("\\u{0:x4}", (int)c);
            else b.Append(c);
        }
        return b.Append('"').ToString();
    }

    public static string State()
    {
        try { return ReadState(); }
        catch (BSideClosed) { return "{\"running\":false}"; }
    }

    // TAIMPRemoteFileInfo: 88-byte header, then UTF-16 strings in this order.
    static string ReadState()
    {
        IntPtr h = Window();
        if (h == IntPtr.Zero) return "{\"running\":false}";
        StringBuilder j = new StringBuilder("{\"running\":true");
        long state = Get(h, PROP_STATE);
        j.Append(",\"state\":").Append(BSideAimp.Esc(state == 2 ? "playing" : state == 1 ? "paused" : "stopped"));
        j.Append(",\"positionMs\":").Append(Get(h, PROP_POSITION));
        j.Append(",\"durationMs\":").Append(Get(h, PROP_DURATION));
        j.Append(",\"volume\":").Append(Get(h, PROP_VOLUME));
        j.Append(",\"mute\":").Append(Get(h, PROP_MUTE) != 0 ? "true" : "false");
        j.Append(",\"repeat\":").Append(Get(h, PROP_REPEAT) != 0 ? "true" : "false");
        j.Append(",\"shuffle\":").Append(Get(h, PROP_SHUFFLE) != 0 ? "true" : "false");
        j.Append(",\"version\":").Append(Get(h, PROP_VERSION));
        try
        {
            using (MemoryMappedFile map = MemoryMappedFile.OpenExisting("AIMP2_RemoteInfo", MemoryMappedFileRights.Read))
            using (MemoryMappedViewAccessor v = map.CreateViewAccessor(0, 2048, MemoryMappedFileAccess.Read))
            {
                int header = v.ReadInt32(0);
                bool active = v.ReadInt32(4) != 0;
                j.Append(",\"track\":{\"active\":").Append(active ? "true" : "false");
                j.Append(",\"headerSize\":").Append(header);
                j.Append(",\"bitrate\":").Append(v.ReadUInt32(8));
                j.Append(",\"channels\":").Append(v.ReadUInt32(12));
                j.Append(",\"durationMs\":").Append(v.ReadUInt32(16));
                j.Append(",\"fileSize\":").Append(v.ReadInt64(20));
                j.Append(",\"sampleRate\":").Append(v.ReadUInt32(32));
                j.Append(",\"trackNumber\":").Append(v.ReadUInt32(36));
                string[] names = { "album", "artist", "date", "fileName", "genre", "title" };
                long offset = header > 0 && header < 512 ? header : 88;
                bool overflow = false;
                for (int i = 0; i < names.Length; i++)
                {
                    int len = v.ReadInt32(40 + i * 4);
                    // Past the 2 KB block the strings that follow cannot be located: stop there.
                    if (overflow || len < 0 || offset + len * 2L > 2048) { overflow = true; len = 0; }
                    char[] chars = new char[len];
                    v.ReadArray(offset, chars, 0, len);
                    offset += len * 2L;
                    j.Append(",\"").Append(names[i]).Append("\":").Append(BSideAimp.Esc(new string(chars)));
                }
                j.Append('}');
            }
        }
        catch (Exception) { j.Append(",\"track\":null"); }
        return j.Append('}').ToString();
    }

    // Album art arrives as WM_COPYDATA to a window of ours, so it needs a message loop.
    // AIMP sends the cover re-encoded, often as a PNG of 0.8-2 MB for a detailed 600 px cover. It is
    // taken up to MaxArtBytes and, when bigger than ArtTarget, re-encoded as JPEG so its data URL
    // fits in one 1 MiB panel answer.
    const int MaxArtBytes = 32 * 1024 * 1024;
    const int ArtTarget = 600 * 1024;
    const int ArtMaxSide = 1000;

    static byte[] Shrink(byte[] data)
    {
        if (data.Length <= ArtTarget) return data;
        try
        {
            using (MemoryStream input = new MemoryStream(data))
            using (Image img = Image.FromStream(input))
            {
                double k = Math.Min(1.0, (double)ArtMaxSide / Math.Max(img.Width, img.Height));
                int w = Math.Max(1, (int)Math.Round(img.Width * k)), h = Math.Max(1, (int)Math.Round(img.Height * k));
                using (Bitmap bmp = new Bitmap(w, h))
                {
                    using (Graphics g = Graphics.FromImage(bmp))
                    {
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        g.DrawImage(img, 0, 0, w, h);
                    }
                    ImageCodecInfo jpeg = null;
                    foreach (ImageCodecInfo c in ImageCodecInfo.GetImageEncoders()) if (c.MimeType == "image/jpeg") jpeg = c;
                    for (long q = 90; q >= 60; q -= 10)
                    {
                        EncoderParameters p = new EncoderParameters(1);
                        p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, q);
                        using (MemoryStream output = new MemoryStream())
                        {
                            bmp.Save(output, jpeg, p);
                            if (output.Length <= ArtTarget || q == 60) return output.Length <= ArtTarget ? output.ToArray() : null;
                        }
                    }
                }
            }
        }
        catch (Exception) { }
        return null;
    }

    class ArtWindow : NativeWindow
    {
        public byte[] Data;
        public volatile bool Waiting;
        public readonly AutoResetEvent Got = new AutoResetEvent(false);
        // Message-only window (HWND_MESSAGE): not visible to other programs' window enumeration.
        public ArtWindow() { CreateParams cp = new CreateParams(); cp.Parent = (IntPtr)(-3); CreateHandle(cp); }
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_COPYDATA && Waiting)
            {
                COPYDATASTRUCT cds = (COPYDATASTRUCT)Marshal.PtrToStructure(m.LParam, typeof(COPYDATASTRUCT));
                byte[] bytes = new byte[0];
                if (cds.cbData > 0 && cds.cbData <= MaxArtBytes)
                {
                    bytes = new byte[cds.cbData];
                    Marshal.Copy(cds.lpData, bytes, 0, cds.cbData);
                }
                Data = bytes;
                Waiting = false;
                Got.Set();
                m.Result = (IntPtr)1;
                return;
            }
            base.WndProc(ref m);
        }
    }

    static ArtWindow art;
    static readonly ManualResetEvent artReady = new ManualResetEvent(false);

    static void EnsureArtWindow()
    {
        if (art != null) return;
        Thread t = new Thread(delegate () { art = new ArtWindow(); artReady.Set(); Application.Run(); });
        t.IsBackground = true;
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        artReady.WaitOne(5000);
    }

    public static string AlbumArt()
    {
        IntPtr h = Window();
        if (h == IntPtr.Zero) return null;
        EnsureArtWindow();
        art.Data = null;
        art.Got.Reset();
        art.Waiting = true;
        IntPtr result;
        SendMessageTimeout(h, WM_AIMP_COMMAND, (IntPtr)CMD_GET_ALBUMART, art.Handle, 0x0002 | 0x0001, 3000, out result);
        bool got = art.Got.WaitOne(1500);
        art.Waiting = false;
        if (!got || art.Data == null || art.Data.Length == 0) return null;
        byte[] small = Shrink(art.Data);
        return small == null ? null : Convert.ToBase64String(small);
    }
}
'@, @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

// Hands a file to AIMP the way Explorer does. The Microsoft Store AIMP has no execution alias, so
// it is reached through the file-type classes (ProgIDs) its package registers, read from the
// registry each time: they differ per PC and per package version. A classic AIMP.exe takes the
// same request on its command line.
public static class BSideShell
{
    const string Repository = @"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages";
    const string StorePrefix = "25018ArtemIzmaylov.AIMP_";
    const string StorePublisher = "__4hdg3aaevdv22";

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct SHELLEXECUTEINFO
    {
        public int cbSize;
        public uint fMask;
        public IntPtr hwnd;
        public string lpVerb, lpFile, lpParameters, lpDirectory;
        public int nShow;
        public IntPtr hInstApp, lpIDList;
        public string lpClass;
        public IntPtr hkeyClass;
        public uint dwHotKey;
        public IntPtr hIcon, hProcess;
    }
    const uint SEE_MASK_CLASSNAME = 0x1, SEE_MASK_NOASYNC = 0x100, SEE_MASK_FLAG_NO_UI = 0x400;
    const int SW_SHOWNOACTIVATE = 4;

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ShellExecuteEx(ref SHELLEXECUTEINFO info);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder name, ref int size);

    // The newest installed Store AIMP package (its full name), or null.
    public static string StorePackage()
    {
        string best = null;
        Version bestVersion = null;
        using (RegistryKey packages = Registry.CurrentUser.OpenSubKey(Repository))
        {
            if (packages == null) return null;
            foreach (string name in packages.GetSubKeyNames())
            {
                if (!name.StartsWith(StorePrefix, StringComparison.OrdinalIgnoreCase) || !name.EndsWith(StorePublisher, StringComparison.OrdinalIgnoreCase)) continue;
                string[] parts = name.Split('_');
                Version v;
                if (parts.Length < 2 || !Version.TryParse(parts[1], out v)) continue;
                if (bestVersion == null || v > bestVersion) { best = name; bestVersion = v; }
            }
        }
        return best;
    }

    // The ProgID the Store package registered for this extension (".m3u8", ".flac", ...), or null.
    public static string StoreProgId(string package, string extension)
    {
        if (package == null) return null;
        using (RegistryKey fa = Registry.CurrentUser.OpenSubKey(Repository + "\\" + package + @"\AIMP\Capabilities\FileAssociations"))
        {
            string id = fa == null ? null : fa.GetValue(extension) as string;
            return string.IsNullOrEmpty(id) ? null : id;
        }
    }

    static bool HasVerb(string progId, string verb)
    {
        using (RegistryKey k = Registry.CurrentUser.OpenSubKey(@"Software\Classes\" + progId + @"\Shell\" + verb)) return k != null;
    }

    // The image of the running AIMP (the window of its Remote API), or null.
    public static string RunningExe()
    {
        IntPtr h = FindWindow("AIMP2_RemoteInfo", null);
        if (h == IntPtr.Zero) return null;
        uint pid;
        GetWindowThreadProcessId(h, out pid);
        IntPtr p = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
        if (p == IntPtr.Zero) return null;
        try
        {
            StringBuilder b = new StringBuilder(1024);
            int size = b.Capacity;
            return QueryFullProcessImageName(p, 0, b, ref size) ? b.ToString(0, size) : null;
        }
        finally { CloseHandle(p); }
    }

    static bool IsPackaged(string exe) { return exe.IndexOf(@"\WindowsApps\", StringComparison.OrdinalIgnoreCase) >= 0; }

    // A classic AIMP: the one running, else one in Program Files; null for the Store edition.
    public static string ClassicExe()
    {
        string running = RunningExe();
        if (running != null) return IsPackaged(running) ? null : running;
        foreach (string root in new string[] { Environment.GetEnvironmentVariable("ProgramFiles"), Environment.GetEnvironmentVariable("ProgramFiles(x86)") })
        {
            if (string.IsNullOrEmpty(root)) continue;
            string exe = Path.Combine(root, @"AIMP\AIMP.exe");
            if (File.Exists(exe)) return exe;
        }
        return null;
    }

    // What Open would use, for diagnostics: {"edition":..., "package":..., "playlist":..., "audio":...}.
    public static string Info()
    {
        string classic = ClassicExe();
        string package = StorePackage();
        StringBuilder j = new StringBuilder("{\"edition\":");
        j.Append(BSideAimp.Esc(classic != null ? "classic" : package != null ? "store" : null));
        j.Append(",\"classicExe\":").Append(BSideAimp.Esc(classic));
        j.Append(",\"package\":").Append(BSideAimp.Esc(package));
        j.Append(",\"playlistProgId\":").Append(BSideAimp.Esc(StoreProgId(package, ".m3u8")));
        j.Append(",\"audioProgId\":").Append(BSideAimp.Esc(StoreProgId(package, ".flac")));
        return j.Append('}').ToString();
    }

    // Opens `path` in AIMP. verb "open": what a double click does (AIMP 4.60 opens a playlist file
    // in a playlist tab and plays it); "AddToPlaylist": AIMP's /INSERT, which appends the file, or
    // a playlist file's tracks in order, to the end of the playing playlist without interrupting
    // it. The caller vouches for the path.
    // Returns "classic" or "store"; throws BSideShellError when AIMP cannot be reached.
    public static string Open(string path, string verb)
    {
        if (verb != "open" && verb != "AddToPlaylist") throw new BSideShellError("unsupported", "Unknown verb " + verb);
        if (string.IsNullOrEmpty(path) || !Path.IsPathRooted(path) || path.IndexOf('"') >= 0) throw new BSideShellError("not_found", "No such file");
        path = Path.GetFullPath(path); // the shell refuses forward slashes
        if (!File.Exists(path)) throw new BSideShellError("not_found", "No such file");
        string classic = ClassicExe();
        if (classic != null)
        {
            ProcessStartInfo psi = new ProcessStartInfo(classic, (verb == "open" ? "" : "/INSERT ") + "\"" + path + "\"");
            psi.UseShellExecute = false;
            using (Process.Start(psi)) { }
            return "classic";
        }
        string package = StorePackage();
        if (package == null) throw new BSideShellError("not_installed", "AIMP is not installed");
        string progId = StoreProgId(package, Path.GetExtension(path).ToLowerInvariant());
        // A playlist file has only "open"; AIMP's audio class adds a playlist's tracks with /INSERT.
        if (verb == "AddToPlaylist" && (progId == null || !HasVerb(progId, verb))) progId = StoreProgId(package, ".flac");
        if (progId == null || !HasVerb(progId, verb)) throw new BSideShellError("unsupported", "AIMP does not open " + Path.GetExtension(path) + " files with " + verb);
        SHELLEXECUTEINFO info = new SHELLEXECUTEINFO();
        info.cbSize = Marshal.SizeOf(typeof(SHELLEXECUTEINFO));
        info.fMask = SEE_MASK_CLASSNAME | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI;
        info.lpVerb = verb;
        info.lpFile = path;
        info.lpClass = progId;
        info.nShow = SW_SHOWNOACTIVATE;
        if (!ShellExecuteEx(ref info)) throw new BSideShellError("shell_failed", "Windows could not open the file in AIMP (error " + Marshal.GetLastWin32Error() + ")");
        return "store";
    }
}

public class BSideShellError : Exception
{
    public readonly string Code;
    public BSideShellError(string code, string message) : base(message) { Code = code; }
}
'@)

# Compiling the C# takes 1.5 s on an idle PC and up to 10 s on a busy one, on every start. The
# compiled assembly is kept in %LOCALAPPDATA%\B-Side\cache, named by the SHA-256 of everything
# that shapes it (sources, references, runtime), so a changed helper never loads an old build.
# Any problem with the cache falls back to compiling in memory, as before.
function Invoke-BSideCompiler([string]$OutputAssembly) {
  $options = [CodeDom.Compiler.CompilerParameters]::new([string[]]$BSideReferences)
  if ($OutputAssembly) { $options.OutputAssembly = $OutputAssembly } else { $options.GenerateInMemory = $true }
  $provider = [Microsoft.CSharp.CSharpCodeProvider]::new()
  try { $built = $provider.CompileAssemblyFromSource($options, [string[]]$BSideSources) }
  finally { $provider.Dispose() }
  if ($built.Errors.HasErrors) { throw "C# does not compile: $(@($built.Errors | Where-Object { -not $_.IsWarning })[0])" }
  if (-not $OutputAssembly) { $null = $built.CompiledAssembly }
}

function Import-BSideType {
  $identity = "$($BSideReferences -join ',')|$([Environment]::Version)|$($BSideSources.Count)|$($BSideSources -join "`n|`n")"
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity)) | ForEach-Object { $_.ToString('x2') }) }
  finally { $sha.Dispose() }
  try {
    $dir = [IO.Path]::Combine([Environment]::GetFolderPath('LocalApplicationData'), 'B-Side', 'cache')
    $dll = [IO.Path]::Combine($dir, "helper-$hash.dll")
    if (-not [IO.File]::Exists($dll)) {
      # Built in a folder of its own and moved into place: a crash or a second helper starting at
      # the same time never leaves a half-written DLL under the final name.
      $work = [IO.Path]::Combine($dir, "tmp-$PID-$([Guid]::NewGuid().ToString('n'))")
      [void][IO.Directory]::CreateDirectory($work)
      try {
        $built = [IO.Path]::Combine($work, "helper-$hash.dll")
        Invoke-BSideCompiler $built
        try { [IO.File]::Move($built, $dll) } catch { if (-not [IO.File]::Exists($dll)) { throw } }
      } finally {
        try { [IO.Directory]::Delete($work, $true) } catch { [Console]::Error.WriteLine("cache: $($_.Exception.Message)") }
      }
      # Older builds are no longer needed; one still loaded by another helper stays until next time.
      foreach ($old in [IO.Directory]::GetFiles($dir, 'helper-*.dll')) {
        if ($old -ne $dll) { try { [IO.File]::Delete($old) } catch { [Console]::Error.WriteLine("cache: $($_.Exception.Message)") } }
      }
    }
    # Assembly.LoadFrom, not Add-Type -Path: the cmdlet alone costs over a second to start.
    [void][Reflection.Assembly]::LoadFrom($dll)
  } catch {
    [Console]::Error.WriteLine("cache: $($_.Exception.Message); compiling in memory")
  }
  if (-not ('BSideAimp' -as [type])) { Invoke-BSideCompiler }
}
Import-BSideType

function Send-Line([string]$json) {
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}
function Reply($id, $result) {
  Send-Line (([ordered]@{ id = $id; ok = $true; result = $result }) | ConvertTo-Json -Compress -Depth 4)
}
function Fail($id, [string]$code, [string]$message) {
  Send-Line (([ordered]@{ id = $id; ok = $false; code = $code; error = $message }) | ConvertTo-Json -Compress)
}

:requests while ($null -ne ($line = [Console]::In.ReadLine())) {
  if (-not $line.Trim()) { continue }
  $id = $null
  try {
    $req = $line | ConvertFrom-Json
    $id = [int]$req.id
    $a = $req.args
    # State is already JSON built in C#: pass it through untouched.
    if ($req.cmd -eq 'state') { Send-Line ('{"id":' + $id + ',"ok":true,"result":' + [BSideAimp]::State() + '}'); continue }
    # Handing a file to AIMP (BSideShell) also starts AIMP when it is closed. The worker vouches for
    # the path: it writes the queue playlist itself or takes the file from its library.
    switch ($req.cmd) {
      'shellInfo' { Send-Line ('{"id":' + $id + ',"ok":true,"result":' + [BSideShell]::Info() + '}'); continue requests }
      'openFile' { Reply $id ([BSideShell]::Open([string]$a.path, 'open')); continue requests }
      'insertFile' { Reply $id ([BSideShell]::Open([string]$a.path, 'AddToPlaylist')); continue requests }
    }
    $h = [BSideAimp]::Window()
    if ($h -eq [IntPtr]::Zero) { Fail $id 'aimp_closed' 'AIMP is not running'; continue }
    switch ($req.cmd) {
      'art' { Reply $id ([BSideAimp]::AlbumArt()) }
      'playPause' { [BSideAimp]::Command($h, [BSideAimp]::CMD_PLAYPAUSE); Reply $id $true }
      'play' { [BSideAimp]::Command($h, [BSideAimp]::CMD_PLAY); Reply $id $true }
      'pause' { [BSideAimp]::Command($h, [BSideAimp]::CMD_PAUSE); Reply $id $true }
      'stop' { [BSideAimp]::Command($h, [BSideAimp]::CMD_STOP); Reply $id $true }
      'next' { [BSideAimp]::Command($h, [BSideAimp]::CMD_NEXT); Reply $id $true }
      'previous' { [BSideAimp]::Command($h, [BSideAimp]::CMD_PREV); Reply $id $true }
      'seek' { [BSideAimp]::Seek($h, [int]$a.positionMs); Reply $id $true }
      'volume' { [BSideAimp]::Volume($h, [int]$a.volume); Reply $id $true }
      'shuffle' { [BSideAimp]::Shuffle($h, [bool]$a.on); Reply $id $true }
      'repeat' { [BSideAimp]::Repeat($h, [bool]$a.on); Reply $id $true }
      'mute' { [BSideAimp]::Mute($h, [bool]$a.on); Reply $id $true }
      default { Fail $id 'invalid' "unknown command: $($req.cmd)" }
    }
  } catch {
    $e = $_.Exception
    while ($e.InnerException) { $e = $e.InnerException }
    $code = if ($e -is [BSideClosed]) { 'aimp_closed' } elseif ($e -is [TimeoutException]) { 'aimp_timeout' } else { 'aimp_error' }
    Fail $id $code $e.Message
  }
}
