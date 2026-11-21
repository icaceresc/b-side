"""Animated README images and the announcement video, from the real panel (docs/make-assets.py's
stand-in for Orca and its demo library) and the demo library's original music
(docs/demo/make-demo.py).

    python docs/make-media.py hero       docs/hero.webp: the three skins playing, pausing, playing
    python docs/make-media.py skins      docs/tour-skins.webp: one panel through the three skins
    python docs/make-media.py video OUT  a 35 s MP4 with the demo music, for the announcement

Each frame is one render of the panel at a moment: animations paused where they would be at that
time (t=), playback advanced (pt=). Needs Pillow; `video` also needs numpy, soundfile and
imageio-ffmpeg (an ffmpeg binary), and the demo library (demo-library/).
"""

import argparse
import importlib.util
import secrets
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('assets', ROOT / 'docs' / 'make-assets.py')
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)

SKINS = [('cd', 'CD', 'Modern, in the colours of the cover'),
         ('vinyl', 'Vinyl', 'Leather, walnut and old gold'),
         ('cassette', 'Cassette', 'An 80s tape deck in pixels')]
BASE_POS = A.TRACKS['sunset']['positionMs'] / 1000


class Panels:
    """Renders panel frames (cached by their parameters), a few at a time."""

    def __init__(self, chrome, work, w, h, dpr):
        self.chrome, self.work, self.w, self.h, self.dpr = chrome, work, w, h, dpr
        self.cache = {}

    def key(self, skin, t, pos, paused, extra=''):
        return (skin, round(t, 3), round(pos, 3), bool(paused), extra)

    def _render(self, k):
        skin, t, pos, paused, extra = k
        src = (f'panel.html?scene=playing&art=sunset&lang=en&theme=dark&skin={skin}&lyrics=synced&t={t}'
               f'&pt={pos - BASE_POS}{"&paused=1" if paused else ""}{extra}')
        html = ('<!doctype html><html><head><style>html,body{margin:0;overflow:hidden}</style></head><body>'
                f'<iframe src="{src}" width="{self.w}" height="{self.h}" style="display:block;border:0"></iframe></body></html>')
        name = 'f-' + secrets.token_hex(5)
        return k, A.render(self.chrome, self.work, name, self.w, self.h, self.dpr, html, motion=True).convert('RGB')

    def fill(self, keys):
        todo = [k for k in dict.fromkeys(keys) if k not in self.cache]
        print(f'rendering {len(todo)} panel frames', flush=True)
        with ThreadPoolExecutor(3) as pool:
            for i, (k, img) in enumerate(pool.map(self._render, todo), 1):
                self.cache[k] = img
                if i % 25 == 0:
                    print(f'  {i}/{len(todo)}', flush=True)

    def __getitem__(self, k):
        return self.cache[k]


def card(chrome, work, w, h, body, extra=''):
    """A static page (title, labels, backdrop) rendered once, at 1x."""
    html = A.page(body, extra)
    return A.render(chrome, work, 'card-' + secrets.token_hex(4), w, h, 1, html).convert('RGB')


def paste_panel(canvas, panel, x, y, radius=18):
    """A panel with rounded corners and a soft shadow, as a window in the store shots."""
    mask = Image.new('L', panel.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, panel.width - 1, panel.height - 1], radius, fill=255)
    shadow = Image.new('L', (panel.width + 80, panel.height + 80), 0)
    ImageDraw.Draw(shadow).rounded_rectangle([40, 52, panel.width + 40, panel.height + 52], radius, fill=150)
    canvas.paste((0, 0, 0), (x - 40, y - 40), shadow.filter(ImageFilter.GaussianBlur(22)))
    canvas.paste(panel, (x, y), mask)


# --- Timelines: (t, position, paused) per frame ------------------------------------------------

def play_pause_play(fps, play1=3.5, pause=1.5, play2=2.5, start=BASE_POS):
    frames, t = [], 0.0
    for _ in range(int(play1 * fps)):
        frames.append((t, start + t, False)); t += 1 / fps
    for _ in range(int(pause * fps)):
        frames.append((t, start + t, True))
    for _ in range(int(play2 * fps)):
        frames.append((t, start + t, False)); t += 1 / fps
    return frames


def hero(chrome, work, out):
    fps, pw, ph, dpr = 12, 340, 610, 1
    panels = Panels(chrome, work, pw, ph, dpr)
    timeline = play_pause_play(fps)
    panels.fill([panels.key(s, t, p, z) for s, *_ in SKINS for t, p, z in timeline])
    W, H = 1200, 800
    gap = 40
    x0 = (W - 3 * pw - 2 * gap) // 2
    labels = ''.join(f'<div class="lab" style="left:{x0 + i * (pw + gap)}px;width:{pw}px">{name}<span>{sub}</span></div>' for i, (_, name, sub) in enumerate(SKINS))
    bg = card(chrome, work, W, H, '<div class="head">' + A.brand(22) + '<h1>Your music library, inside Orca.</h1></div>' + labels,
              'body { --gx: 50%; --gy: 62%; } .head { text-align: center; padding-top: 26px; } .head .brand { justify-content: center; }'
              ' .head h1 { font-size: 30px; margin: 10px 0 0; } .lab { position: absolute; top: 728px; text-align: center; font-size: 17px; font-weight: 700; }'
              ' .lab span { display: block; font-size: 12.5px; font-weight: 400; color: #a8a3b6; margin-top: 2px; }')
    frames = []
    for t, p, z in timeline:
        f = bg.copy()
        for i, (s, *_) in enumerate(SKINS):
            paste_panel(f, panels[panels.key(s, t, p, z)], x0 + i * (pw + gap), 100)
        frames.append(f)
    save_webp(frames, fps, out)


def tour_skins(chrome, work, out):
    """One panel, playing, switching skin every 2.5 s: what pressing the logo does."""
    fps, pw, ph = 12, 400, 720
    panels = Panels(chrome, work, pw, ph, 1)
    seq = []  # (skin, t, position, menu open)
    t = 0.0
    for i, (s, *_) in enumerate(SKINS):
        for _ in range(int(2.2 * fps)):
            seq.append((s, t, BASE_POS + t, False)); t += 1 / fps
        for _ in range(int(1.0 * fps)):  # the logo pressed: the skin menu, then the next skin
            seq.append((s, t, BASE_POS + t, True)); t += 1 / fps
    key = lambda s, t, p, m: panels.key(s, t, p, False, '&skinmenu=1' if m else '')
    panels.fill([key(*x) for x in seq])
    W, H = 520, 800
    bg = Image.new('RGB', (W, H), (14, 12, 19))
    frames = []
    for s, t, p, z in seq:
        f = bg.copy()
        paste_panel(f, panels[key(s, t, p, z)], (W - pw) // 2, 40)
        frames.append(f)
    save_webp(frames, fps, out)


def save_webp(frames, fps, out, quality=72):
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 / fps), loop=0, quality=quality, method=6)
    print(f'{out}  {frames[0].size[0]}x{frames[0].size[1]}  {len(frames)} frames  {out.stat().st_size // 1024} KB')


# --- The announcement video ----------------------------------------------------------------------

def video(chrome, work, out):
    import numpy as np
    import soundfile as sf
    import imageio_ffmpeg

    flac = ROOT / 'demo-library' / 'Halcyon Tapedeck' / 'Chrome Coastline' / '01 Golden Hour Static.flac'
    if not flac.exists():
        sys.exit('Run docs/demo/make-demo.py first: the video plays the demo library.')
    fps, W, H = 15, 1920, 1080
    big = Panels(chrome, work, 440, 800, 1.2)
    small = Panels(chrome, work, 380, 690, 1)
    TITLE, SOLO, TRIO_PLAY, PAUSE, TRIO_END, END = 2.5, 7.0, 3.0, 1.5, 2.0, 3.5
    plan = []  # (kind, skin, t, position, paused)
    clock = 0.0  # where the music is
    for _ in range(int(TITLE * fps)):
        plan.append(('title', None, clock, clock, False)); clock += 1 / fps
    for s, *_ in SKINS:
        for _ in range(int(SOLO * fps)):
            plan.append(('solo', s, clock, clock, False)); clock += 1 / fps
    for _ in range(int(TRIO_PLAY * fps)):
        plan.append(('trio', None, clock, clock, False)); clock += 1 / fps
    pause_at = clock
    for _ in range(int(PAUSE * fps)):
        plan.append(('trio', None, clock, clock, True))
    for _ in range(int(TRIO_END * fps)):
        plan.append(('trio', None, clock, clock, False)); clock += 1 / fps
    for _ in range(int(END * fps)):
        plan.append(('end', None, clock, clock, False)); clock += 1 / fps
    big.fill([big.key(s, t, p, z) for k, s, t, p, z in plan if k == 'solo'])
    small.fill([small.key(sk, t, p, z) for k, s, t, p, z in plan if k == 'trio' for sk, *_ in SKINS])

    style = 'body { --gx: 70%; --gy: 50%; } h1 { font-size: 64px; } p.lead { font-size: 26px; }'
    title = card(chrome, work, W, H, '<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">'
                 + A.brand(40).replace('font-size: 15px', '') + '<h1>Your music library,<br><em>inside Orca.</em></h1>'
                 '<p class="lead">Three skins. A logo that plays along. Your files, in AIMP.</p></div>',
                 style + ' .brand { font-size: 26px; gap: 18px; }')
    solos = {}
    for s, name, sub in SKINS:
        solos[s] = card(chrome, work, W, H, f'<div style="position:absolute;left:960px;top:400px;width:820px"><h1 style="font-size:72px;margin:0">{name}</h1>'
                        f'<p class="lead" style="font-size:30px;margin-top:14px">{sub}.</p>'
                        '<p class="lead" style="font-size:22px;margin-top:28px;color:#8f8a9c">Press the logo to change skin.</p></div>'
                        '<div style="position:absolute;left:120px;top:60px">' + A.brand(30) + '</div>', 'body { --gx: 30%; --gy: 50%; }')
    trio = card(chrome, work, W, H, '<div style="position:absolute;top:56px;width:100%;text-align:center"><h1 style="font-size:46px;margin:0">'
                'Pause, and the logo stops.</h1></div>', 'body { --gx: 50%; --gy: 60%; }')
    end = card(chrome, work, W, H, '<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">'
               + A.brand(40) + '<h1 style="font-size:58px">B-Side for Orca</h1>'
               '<p class="lead" style="font-size:28px"><kbd style="font-size:26px;padding:8px 16px">orca plugin install icaceresc/b-side</kbd></p>'
               '<p class="lead" style="font-size:20px;margin-top:26px;color:#8f8a9c">Demo library and music: original, made for B-Side.</p></div>', style)

    frames_dir = work / 'video'
    frames_dir.mkdir()
    n_title, n_end = int(TITLE * fps), int(END * fps)
    for i, (k, s, t, p, z) in enumerate(plan):
        if k == 'title':
            f = Image.blend(Image.new('RGB', (W, H)), title, min(1, (i + 1) / (fps * 0.8)))
        elif k == 'solo':
            f = solos[s].copy()
            paste_panel(f, big[big.key(s, t, p, z)], 300, (H - round(800 * 1.2)) // 2, 22)
        elif k == 'trio':
            f = trio.copy()
            for j, (sk, *_) in enumerate(SKINS):
                paste_panel(f, small[small.key(sk, t, p, z)], 330 + j * 440, 210)
        else:
            j = i - (len(plan) - n_end)
            f = Image.blend(end, Image.new('RGB', (W, H)), max(0, (j - (n_end - fps * 0.8)) / (fps * 0.8)))
        f.save(frames_dir / f'{i:05d}.png')

    # The music, paused where the video pauses, faded in and out.
    audio, sr = sf.read(flac)
    cut = int(pause_at * sr)
    total = len(plan) / fps
    track = np.concatenate([audio[:cut], np.zeros((int(PAUSE * sr), 2)), audio[cut:]])[: int(total * sr)]
    fade = int(1.5 * sr)
    track[:int(0.5 * sr)] *= np.linspace(0, 1, int(0.5 * sr))[:, None]
    track[-fade:] *= np.linspace(1, 0, fade)[:, None]
    wav = work / 'video.wav'
    sf.write(wav, track, sr, subtype='PCM_16')
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', str(frames_dir / '%05d.png'), '-i', str(wav),
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart',
                    '-c:a', 'aac', '-b:a', '192k', '-shortest', str(out)], check=True)
    print(f'{out}  {W}x{H}  {total:.1f} s  {out.stat().st_size // 1024} KB')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('what', choices=('hero', 'skins', 'video'))
    ap.add_argument('out', nargs='?', type=Path)
    args = ap.parse_args()
    chrome = A.browser()
    work = ROOT / 'scratch' / f'tmp-media-{secrets.token_hex(4)}'
    work.mkdir(parents=True)
    try:
        A.prepare(work)
        if args.what == 'hero':
            hero(chrome, work, args.out or A.DOCS / 'hero.webp')
        elif args.what == 'skins':
            tour_skins(chrome, work, args.out or A.DOCS / 'tour-skins.webp')
        else:
            video(chrome, work, args.out or ROOT / 'scratch' / 'b-side-2.3.mp4')
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
