"""The README's animated hero and the announcement video, from the real panel (docs/make-assets.py's
stand-in for Orca and its demo library) and the demo library's original music
(docs/demo/make-demo.py).

    python docs/make-media.py hero       docs/hero.webp: B-Side in an editor's sidebar, through its skins
    python docs/make-media.py video OUT  the announcement MP4, with the demo music

The hero has no words, so it serves the README in every language: an editor window with B-Side in
its sidebar, playing with synced lyrics and its logo alive; CD in two covers' colours, then Vinyl,
then Cassette, each fading into the next and the last into the first, so it loops cleanly. The
backdrop takes its glow from the playing cover.

Each frame is one render of the panel at a moment: animations paused where they would be at that
time (t=), playback advanced (pt=). Needs Pillow; `video` also needs numpy, soundfile and
imageio-ffmpeg (an ffmpeg binary), and the demo library (demo-library/).
"""

import argparse
import colorsys
import importlib.util
import secrets
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('assets', ROOT / 'docs' / 'make-assets.py')
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)

NAMES = {'cd': 'CD', 'vinyl': 'Vinyl', 'cassette': 'Cassette'}
# (skin, demo track): CD twice, to show its colours following the cover.
SEGMENTS = [('cd', 'sunset'), ('cd', 'tide'), ('vinyl', 'midnight'), ('cassette', 'parallax')]
# The active chip's colour: CD wears the cover's, Vinyl its gold, Cassette its cyan.
CHIP = {'vinyl': (217, 173, 84), 'cassette': (61, 226, 240)}


class Panels:
    """Renders panel frames (cached by their parameters), a few at a time."""

    def __init__(self, chrome, work, w, h, dpr):
        self.chrome, self.work, self.w, self.h, self.dpr = chrome, work, w, h, dpr
        self.cache = {}

    def key(self, skin, art, t, paused=False, pt=None):
        """t: the animations' clock; pt: how far playback has moved (t when not given)."""
        return (skin, art, round(t, 3), bool(paused), round(t if pt is None else pt, 3))

    def _render(self, k):
        skin, art, t, paused, pt = k
        src = (f'panel.html?scene=playing&art={art}&lang=en&theme=dark&skin={skin}&lyrics=synced&size=1&t={t}'
               f'&pt={pt}{"&paused=1" if paused else ""}')
        html = ('<!doctype html><html><head><style>html,body{margin:0;overflow:hidden}</style></head><body>'
                f'<iframe src="{src}" width="{self.w}" height="{self.h}" style="display:block;border:0"></iframe></body></html>')
        name = 'f-' + secrets.token_hex(5)
        return k, A.render(self.chrome, self.work, name, self.w, self.h, self.dpr, html, motion=True).convert('RGB')

    def fill(self, keys):
        todo = [k for k in dict.fromkeys(keys) if k not in self.cache]
        print(f'rendering {len(todo)} panel frames', flush=True)
        with ThreadPoolExecutor(4) as pool:
            for i, (k, img) in enumerate(pool.map(self._render, todo), 1):
                self.cache[k] = img
                if i % 25 == 0:
                    print(f'  {i}/{len(todo)}', flush=True)

    def __getitem__(self, k):
        return self.cache[k]


def card(chrome, work, w, h, body, extra=''):
    """A static page (backdrop, window, labels) rendered once, at 1x."""
    return A.render(chrome, work, 'card-' + secrets.token_hex(4), w, h, 1, A.page(body, extra)).convert('RGB')


def accent(art):
    """The cover's most vivid colour, for the backdrop's glow and the active skin's chip."""
    img = A.cover_of(art).convert('RGB').resize((40, 40))
    pixels = [img.getpixel((x, y)) for y in range(img.height) for x in range(img.width)]
    px = sorted(pixels, key=lambda c: -(lambda h, s, v: s * v)(*colorsys.rgb_to_hsv(*(x / 255 for x in c))))
    top = px[: len(px) // 6]
    r, g, b = (sum(c[i] for c in top) // len(top) for i in range(3))
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    r, g, b = colorsys.hsv_to_rgb(h, min(1, s * 1.05), max(v, 0.85))
    return round(r * 255), round(g * 255), round(b * 255)


def ease(x):
    return x * x * (3 - 2 * x)


# --- The window: an editor with B-Side in its sidebar ---------------------------------------------

CODE = [  # (indent, [(width, colour)]) per line: a skeleton of code, no words
    (0, [(70, 'k'), (120, 'v'), (40, 'p'), (150, 's')]), (0, [(70, 'k'), (90, 'v'), (40, 'p'), (190, 's')]), (0, []),
    (0, [(90, 'k'), (130, 'f'), (60, 'p')]), (1, [(60, 'k'), (110, 'v'), (30, 'p'), (160, 'f')]), (1, [(90, 'v'), (220, 'f')]),
    (1, [(40, 'k'), (80, 'v'), (30, 'p')]), (2, [(130, 'f'), (90, 's')]), (2, [(60, 'k'), (170, 'v')]), (1, [(20, 'p')]), (0, []),
    (1, [(120, 'c'), (230, 'c')]), (1, [(60, 'k'), (100, 'v'), (30, 'p'), (140, 'f'), (60, 's')]), (1, [(80, 'f'), (190, 'v')]),
    (0, [(20, 'p')]), (0, []), (0, [(90, 'k'), (150, 'f'), (50, 'p')]), (1, [(110, 'v'), (80, 'p'), (140, 's')]),
    (1, [(60, 'k'), (200, 'f')]), (0, [(20, 'p')]),
]
TOKENS = {'k': '#c792ea', 'v': '#e6e1ef', 'f': '#82aaff', 's': '#c3e88d', 'p': '#89ddff', 'c': '#6b6680'}


def window_html(W, H, win, side, chips_y, skin, glow):
    cr, cg, cb = CHIP.get(skin, glow)
    """The backdrop, the window and its editor, and the skin chips; the sidebar is left empty for
    the panel. win = (x, y, w, h); side = (x, y, w, h) inside it."""
    wx, wy, ww, wh = win
    sx, sy, sw, sh = side
    lines = ''.join(
        f'<div class="ln"><i>{n + 1}</i><span style="padding-left:{ind * 28}px">'
        + ''.join(f'<b style="width:{w}px;background:{TOKENS[c]}"></b>' for w, c in toks) + '</span></div>'
        for n, (ind, toks) in enumerate(CODE))
    chips = ''.join(f'<span class="chip{" on" if s == skin else ""}">{NAMES[s]}</span>' for s in ('cd', 'vinyl', 'cassette'))
    r, g, b = glow
    return (
        f'<div class="win" style="left:{wx}px;top:{wy}px;width:{ww}px;height:{wh}px">'
        '<div class="bar"><i></i><i></i><i></i><div class="title"></div></div>'
        f'<div class="rail"></div><div class="tabs"><span class="tab on"></span><span class="tab"></span></div>'
        f'<div class="code">{lines}</div>'
        f'<div class="side" style="left:{sx - wx}px;top:{sy - wy}px;width:{sw}px;height:{sh}px"></div></div>'
        f'<div class="chips" style="top:{chips_y}px;left:{wx}px;width:{ww}px">{chips}</div>',
        f'body {{ --glow: rgba({r},{g},{b},0.30); --glow2: rgba({r},{g},{b},0.12); --gx: {round((sx + sw / 2) / W * 100)}%; --gy: 42%; --hx: 12%; }}'
        f' .win {{ position: absolute; border-radius: 22px; background: #121117; overflow: hidden;'
        f'  box-shadow: 0 50px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.09), 0 0 90px rgba({r},{g},{b},0.10); }}'
        ' .bar { height: 46px; display: flex; align-items: center; gap: 10px; padding: 0 20px; background: #17161d; border-bottom: 1px solid rgba(255,255,255,0.06); }'
        ' .bar i { width: 13px; height: 13px; border-radius: 50%; background: #3a3842; }'
        ' .bar .title { margin: 0 auto; width: 220px; height: 12px; border-radius: 6px; background: #2a2832; }'
        ' .rail { position: absolute; left: 0; top: 46px; bottom: 0; width: 58px; background: #15141a; border-right: 1px solid rgba(255,255,255,0.05); }'
        ' .tabs { position: absolute; left: 58px; top: 46px; right: 0; height: 42px; display: flex; gap: 2px; padding: 0 0 0 8px; align-items: flex-end; }'
        ' .tab { width: 150px; height: 34px; border-radius: 9px 9px 0 0; background: #17161d; }'
        ' .tab.on { background: #1d1c24; box-shadow: inset 0 2px 0 rgba(255,255,255,0.10); }'
        ' .code { position: absolute; left: 58px; top: 88px; padding: 22px 0 0 0; background: #1d1c24; right: 0; bottom: 0; }'
        ' .ln { display: flex; align-items: center; height: 31px; }'
        ' .ln i { width: 62px; text-align: right; padding-right: 26px; font: 15px "Cascadia Mono", Consolas, monospace; color: #4a4756; font-style: normal; }'
        ' .ln span { display: flex; gap: 11px; } .ln b { height: 11px; border-radius: 6px; opacity: 0.42; }'
        ' .side { position: absolute; background: #0f0f12; border-left: 1px solid rgba(255,255,255,0.08); }'
        ' .chips { position: absolute; display: flex; justify-content: center; gap: 14px; }'
        ' .chip { font: 600 21px "Segoe UI Variable Display", "Segoe UI", sans-serif; letter-spacing: 0.02em; color: #9d98aa;'
        '  padding: 9px 24px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10); }'
        f' .chip.on {{ color: #15121a; background: rgb({cr},{cg},{cb}); border-color: transparent; box-shadow: 0 8px 30px rgba({cr},{cg},{cb},0.35); }}')


def layout(W, H):
    """Window and sidebar boxes for a W x H canvas: the window fills it with a margin; the sidebar
    takes 40% of its width, as a sidebar dragged wide enough for lyrics."""
    m = round(W * 0.04)
    chips_h = round(H * 0.085)
    win = (m, m, W - 2 * m, H - 2 * m - chips_h)
    sw = round(win[2] * 0.40)
    side = (win[0] + win[2] - sw, win[1] + 46, sw, win[3] - 46)
    return win, side, win[1] + win[3] + round(chips_h * 0.32)


# Where playback stands in each segment (seconds after the demo track's own position): a line of
# the lyrics a little past its start, so each skin shows another one lit up.
STILL = [0.6, 0.4, 0.5, 0.7]


def sequence(fps, hold, fade):
    """Frames of the loop: [(segment, its clock, next segment or None, its clock, mix)]. Within a
    segment only the logo moves (playback holds still, which also keeps the file small); a skin
    gives way to the next in a few frames, as pressing the logo does, and the last to the first."""
    n_hold, n_fade = round(hold * fps), round(fade * fps)
    frames = []
    for k in range(len(SEGMENTS)):
        nxt = (k + 1) % len(SEGMENTS)
        for i in range(n_hold):
            frames.append((k, fade + i / fps, None, 0, 0))
        for i in range(n_fade):
            frames.append((k, fade + (n_hold + i) / fps, nxt, i / fps, ease((i + 1) / (n_fade + 1))))
    return frames


def still(panels, k, t):
    return panels.key(*SEGMENTS[k], t, False, STILL[k])


# The logo's corner of the panel (CSS px): the only part that moves while a segment holds.
LOGO_BOX = (0, 0, 96, 70)


def compose(frames, panels, backs, side, dpr):
    """Each frame: its backdrop and window, the panel in the sidebar; fades blend both. A segment's
    panel is one render, with the logo's corner taken from the frame's own render: two renders of
    the same moment can differ by a scroll or a colour still settling, which would read as flicker
    (and weigh on the file)."""
    sx, sy, sw, sh = side
    box = tuple(round(v * dpr) for v in LOGO_BOX)
    base = {}
    for k, t, *_ in frames:
        base.setdefault(k, panels[still(panels, k, t)])

    def panel(k, t):
        p = base[k].copy()
        p.paste(panels[still(panels, k, t)].crop(box), box[:2])
        return p

    out = []
    for k, t, nxt, t2, a in frames:
        f = backs[k].copy()
        f.paste(panel(k, t), (sx, sy))
        if nxt is not None:
            g = backs[nxt].copy()
            g.paste(panel(nxt, t2), (sx, sy))
            f = Image.blend(f, g, a)
        out.append(f)
    return out


def hero(chrome, work, out, W=1600, H=1100, fps=15, hold=2.4, fade=0):
    win, side, chips_y = layout(W, H)
    sx, sy, sw, sh = side
    dpr = 1.5
    panels = Panels(chrome, work, round(sw / dpr), round(sh / dpr), dpr)
    frames = sequence(fps, hold, fade)
    keys = []
    for k, t, nxt, t2, _ in frames:
        keys.append(still(panels, k, t))
        if nxt is not None:
            keys.append(still(panels, nxt, t2))
    panels.fill(keys)
    for k in list(panels.cache):  # the browser may round the size by a pixel
        panels.cache[k] = panels.cache[k].resize((sw, sh), Image.LANCZOS) if panels.cache[k].size != (sw, sh) else panels.cache[k]
    backs = [card(chrome, work, W, H, *window_html(W, H, win, side, chips_y, s, accent(a))) for s, a in SEGMENTS]
    save_webp(compose(frames, panels, backs, side, dpr), fps, out)


def save_webp(frames, fps, out, quality=80):
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 / fps), loop=0, quality=quality, method=6, allow_mixed=True)
    print(f'{out}  {frames[0].size[0]}x{frames[0].size[1]}  {len(frames)} frames  {out.stat().st_size // 1024} KB')


# --- The announcement video ----------------------------------------------------------------------

def video(chrome, work, out):
    """1920x1080: a title, the hero's loop at length with a pause in Vinyl (the logo stops, so does
    the music), and the install command; the demo track's original audio throughout."""
    import numpy as np
    import soundfile as sf
    import imageio_ffmpeg

    flac = ROOT / 'demo-library' / 'Halcyon Tapedeck' / 'Chrome Coastline' / '01 Golden Hour Static.flac'
    if not flac.exists():
        sys.exit('Run docs/demo/make-demo.py first: the video plays the demo library.')
    fps, W, H = 30, 1920, 1080
    win, side, chips_y = layout(W, H)
    sx, sy, sw, sh = side
    dpr = 1.5
    panels = Panels(chrome, work, round(sw / dpr), round(sh / dpr), dpr)
    TITLE, HOLD, FADE, PAUSE_AT, PAUSE, END = 3.0, 4.2, 0.7, 2.0, 1.6, 4.0
    # (segment, local time, paused) per frame, with fades as (k, t, nxt, t2, a); the pause holds
    # the Vinyl panel still for PAUSE seconds after PAUSE_AT seconds of it.
    frames, music = [], []  # music: is the track advancing at this frame
    n_fade = round(FADE * fps)
    for k in range(len(SEGMENTS)):
        nxt = k + 1 if k + 1 < len(SEGMENTS) else None
        t = FADE
        for i in range(round(HOLD * fps)):
            paused = SEGMENTS[k][0] == 'vinyl' and PAUSE_AT * fps <= i < (PAUSE_AT + PAUSE) * fps
            frames.append((k, t, paused, None, 0, 0))
            music.append(not paused)
            if not paused:
                t += 1 / fps
        if nxt is not None:
            for i in range(n_fade):
                frames.append((k, t, False, nxt, i / fps, ease((i + 1) / (n_fade + 1))))
                music.append(True)
                t += 1 / fps
    keys = []
    for k, t, z, nxt, t2, _ in frames:
        keys.append(panels.key(*SEGMENTS[k], t, z))
        if nxt is not None:
            keys.append(panels.key(*SEGMENTS[nxt], t2))
    panels.fill(keys)
    for k in list(panels.cache):
        if panels.cache[k].size != (sw, sh):
            panels.cache[k] = panels.cache[k].resize((sw, sh), Image.LANCZOS)
    backs = [card(chrome, work, W, H, *window_html(W, H, win, side, chips_y, s, accent(a))) for s, a in SEGMENTS]
    glow = accent('sunset')
    words = ('body { --glow: rgba(%d,%d,%d,0.26); --gx: 50%%; --gy: 48%%; } h1 { font-size: 92px; margin: 34px 0 18px; } p.lead { font-size: 34px; }'
             ' .brand { font-size: 30px; gap: 20px; justify-content: center; } .c { height: 100%%; display: flex; flex-direction: column; align-items: center;'
             ' justify-content: center; text-align: center; } kbd { font-size: 34px; padding: 12px 26px; border-radius: 14px; }') % glow
    title = card(chrome, work, W, H, '<div class="c">' + A.brand(48) + '<h1>Your music library,<br><em>in Orca\'s sidebar.</em></h1>'
                 '<p class="lead">Three skins. A logo that plays along. Your files, played by AIMP.</p></div>', words)
    end = card(chrome, work, W, H, '<div class="c">' + A.brand(48) + '<h1>B-Side for Orca</h1>'
               '<p class="lead"><kbd>orca plugin install icaceresc/b-side</kbd></p>'
               '<p class="lead" style="font-size:24px;margin-top:34px;color:#8f8a9c">Free and open source. Demo library and music made for B-Side.</p></div>', words)

    frames_dir = work / 'video'
    frames_dir.mkdir()
    n_title, n_end, xf = round(TITLE * fps), round(END * fps), round(0.6 * fps)
    first = None
    idx = 0

    def put(img):
        nonlocal idx
        img.save(frames_dir / f'{idx:05d}.png')
        idx += 1

    body = []
    for k, t, z, nxt, t2, a in frames:
        f = backs[k].copy()
        f.paste(panels[panels.key(*SEGMENTS[k], t, z)], (sx, sy))
        if nxt is not None:
            g = backs[nxt].copy()
            g.paste(panels[panels.key(*SEGMENTS[nxt], t2)], (sx, sy))
            f = Image.blend(f, g, a)
        body.append(f)
    first = body[0]
    black = Image.new('RGB', (W, H))
    for i in range(n_title):  # in from black, hold, then into the window
        a = min(1, (i + 1) / (fps * 0.8))
        f = Image.blend(black, title, ease(a))
        if i >= n_title - xf:
            f = Image.blend(f, first, ease((i - (n_title - xf) + 1) / (xf + 1)))
        put(f)
    for i, f in enumerate(body):
        if i >= len(body) - xf:
            f = Image.blend(f, end, ease((i - (len(body) - xf) + 1) / (xf + 1)))
        put(f)
    for i in range(n_end):
        put(Image.blend(end, black, ease(max(0, (i - (n_end - fps)) / fps))))

    # The music runs under the title, stops for the pause, and fades out over the end card.
    audio, sr = sf.read(flac)
    pieces, pos = [], 0
    step = sr / fps
    for advancing in [True] * n_title + music + [True] * n_end:
        n = round(step)
        if advancing:
            pieces.append(audio[pos:pos + n])
            pos += n
        else:
            pieces.append(np.zeros((n, 2)))
    track = np.concatenate(pieces)
    fade_in, fade_out = int(0.6 * sr), int(2.5 * sr)
    track[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    track[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    wav = work / 'video.wav'
    sf.write(wav, track, sr, subtype='PCM_16')
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', str(frames_dir / '%05d.png'), '-i', str(wav),
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                    '-c:a', 'aac', '-b:a', '192k', '-shortest', str(out)], check=True)
    print(f'{out}  {W}x{H}  {idx / fps:.1f} s  {out.stat().st_size // 1024} KB')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('what', choices=('hero', 'video'))
    ap.add_argument('out', nargs='?', type=Path)
    args = ap.parse_args()
    chrome = A.browser()
    work = ROOT / 'scratch' / f'tmp-media-{secrets.token_hex(4)}'
    work.mkdir(parents=True)
    try:
        A.prepare(work)
        if args.what == 'hero':
            hero(chrome, work, args.out or A.DOCS / 'hero.webp')
        else:
            video(chrome, work, args.out or ROOT / 'scratch' / 'b-side-demo.mp4')
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
