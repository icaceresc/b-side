# B-Side helper: talks to AIMP through its official Remote API (window messages and the
# "AIMP2_RemoteInfo" shared memory). No network, no files written. One JSON request per line on
# stdin, one JSON reply per line on stdout. Exits when stdin closes.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
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

    static string Esc(string s)
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
        j.Append(",\"state\":").Append(Esc(state == 2 ? "playing" : state == 1 ? "paused" : "stopped"));
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
                    j.Append(",\"").Append(names[i]).Append("\":").Append(Esc(new string(chars)));
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
'@

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

while ($null -ne ($line = [Console]::In.ReadLine())) {
  if (-not $line.Trim()) { continue }
  $id = $null
  try {
    $req = $line | ConvertFrom-Json
    $id = [int]$req.id
    $a = $req.args
    # State is already JSON built in C#: pass it through untouched.
    if ($req.cmd -eq 'state') { Send-Line ('{"id":' + $id + ',"ok":true,"result":' + [BSideAimp]::State() + '}'); continue }
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
