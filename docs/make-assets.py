"""Regenerates B-Side's plugin-page images: docs/icon.png, docs/cover.png, docs/shot-*.webp.

The screenshots are the real panel (panel/index.html) rendered by headless Chrome or Edge at
2x, with a stand-in for Orca's `orca` object that answers with a synthetic demo track and
cover art drawn here. Nothing comes from AIMP, a real album or anyone's library. Rerun it
whenever the panel changes:

    python docs/make-assets.py            (Python 3 with Pillow, and Chrome or Edge installed)

Set BSIDE_BROWSER to a browser executable to pick one. Work files go to scratch/tmp-assets-*,
which is removed afterwards.
"""

import base64
import io
import json
import os
import random
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'
ACCENT = '#ff6a3d'

# Orca's limits for plugin-page images (references/manifest.md).
LIMITS = {'icon': 256 * 1024, 'cover': 1024 * 1024, 'shot': 1536 * 1024}


def browser():
    """Chrome or Edge, whichever is installed (BSIDE_BROWSER overrides)."""
    candidates = [os.environ.get('BSIDE_BROWSER', '')]
    for base in (os.environ.get('PROGRAMFILES', ''), os.environ.get('PROGRAMFILES(X86)', ''), os.environ.get('LOCALAPPDATA', '')):
        candidates += [os.path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
                       os.path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    sys.exit('Chrome or Edge not found; set BSIDE_BROWSER to its executable.')


# --- Synthetic cover art -------------------------------------------------------------------

PALETTES = {
    # sky top, sky bottom, sun top, sun bottom, ground
    'sunset': ('#ff9a3c', '#c9306e', '#ffe28a', '#ff8a4c', '#1c0f38'),
    'tide': ('#7fe3d4', '#1d6f96', '#f4fff9', '#a9f0e4', '#0b1d3a'),
    'violet': ('#c39bff', '#5b3fd1', '#ffe0f4', '#ff9bd0', '#160f33'),
}


def rgb(hex_color):
    return tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, f):
    return tuple(round(x + (y - x) * f) for x, y in zip(a, b))


def cover_art(name, size=640):
    """A synthwave-style sun over a hill: drawn at 2x and reduced, so the edges are smooth."""
    top, bottom, sun_top, sun_bottom, ground = (rgb(c) for c in PALETTES[name])
    s = size * 2
    img = Image.new('RGB', (s, s))
    d = ImageDraw.Draw(img)
    for y in range(s):
        d.line([(0, y), (s, y)], fill=mix(top, bottom, y / s))
    # Sun with its own gradient, cut by widening bands of sky towards the bottom.
    sun = Image.new('RGB', (s, s))
    sd = ImageDraw.Draw(sun)
    cx, cy, r = s * 0.5, s * 0.45, s * 0.27
    for y in range(int(cy - r), int(cy + r) + 1):
        sd.line([(0, y), (s, y)], fill=mix(sun_top, sun_bottom, (y - cy + r) / (2 * r)))
    mask = Image.new('L', (s, s), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    band_y, gap = cy + r * 0.05, s * 0.006
    while band_y < cy + r:
        md.rectangle([0, band_y, s, band_y + gap], fill=0)
        band_y += gap + s * 0.03
        gap *= 1.35
    img.paste(sun, (0, 0), mask)
    d.polygon([(0, s * 0.8), (s, s * 0.6), (s, s), (0, s)], fill=ground)
    # Faint grain and stars, seeded so every run draws the same picture.
    rnd = random.Random(name)
    px = img.load()
    for _ in range(s * s // 400):
        x, y = rnd.randrange(s), rnd.randrange(s)
        px[x, y] = mix(px[x, y], (255, 255, 255), rnd.uniform(0.25, 0.7))
    return img.resize((size, size), Image.LANCZOS)


def data_url(img):
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=92)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


# --- Stand-in for Orca ---------------------------------------------------------------------

TRACKS = {
    'sunset': dict(title='Golden Hour Static', artist='Sunset Arcade', album='Afterglow', year='2024',
                   quality=dict(cd=True, lossless=True, codec='FLAC', sampleRateLabel='44.1 kHz', bitrate=1011, channels=2),
                   positionMs=102000, durationMs=246000),
    'tide': dict(title='Low Tide Signals', artist='Harbor Lights', album='Blue Hour', year='2023',
                 quality=dict(cd=False, lossless=True, codec='FLAC', sampleRateLabel='96 kHz', bitrate=2846, channels=2),
                 positionMs=64000, durationMs=301000),
    'violet': dict(title='Violet Weather', artist='Paper Planets', album='Night Bloom', year='2025',
                   quality=dict(cd=True, lossless=True, codec='FLAC', sampleRateLabel='44.1 kHz', bitrate=884, channels=2),
                   positionMs=171000, durationMs=219000),
}


def scene_state(scene, art):
    """What `player.state` would answer for each scene, in the worker's own shape."""
    if scene == 'closed':
        return {'running': False}
    base = {'running': True, 'state': 'playing', 'volume': 72, 'mute': False, 'shuffle': False, 'repeat': True, 'online': True}
    if scene == 'idle':
        return {**base, 'state': 'stopped', 'positionMs': 0, 'durationMs': 0, 'track': None}
    t = TRACKS[art]
    track = {k: t[k] for k in ('title', 'artist', 'album', 'year', 'quality')}
    track.update(key='demo|' + art, cloud=True, number=3)
    state = {**base, 'positionMs': t['positionMs'], 'durationMs': t['durationMs'], 'track': track}
    if scene == 'offline':
        state.update(state='paused', online=False)
    return state


# Injected before the panel's own script: the panel reads `orca` exactly as it does in Orca.
# Transitions and animations are switched off so the capture shows the settled picture.
MOCK = """<style>*, *::before, *::after { transition: none !important; animation: none !important; }</style>
<script>
(() => {
  const q = new URLSearchParams(location.search)
  const scene = q.get('scene') || 'playing', art = q.get('art') || 'sunset'
  const data = __DATA__
  const state = data.states[scene + ':' + art]
  window.orca = {
    locale: q.get('lang') || 'en',
    storage: { get: async () => null, set: async () => {} },
    plugin: {
      request: async (name) => {
        if (name === 'player.state') return JSON.parse(JSON.stringify(state))
        if (name === 'player.art') return { key: 'demo|' + art, dataUrl: data.art[art] }
        return {}
      }
    }
  }
})()
</script>
"""


# --- Pages to render -----------------------------------------------------------------------

STYLE = """
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; }
body { font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; color: #f2f0f5;
  background: radial-gradient(900px 700px at var(--gx, 78%) 50%, rgba(255, 106, 61, 0.22), transparent 70%),
              linear-gradient(135deg, #17121f 0%, #0d0c11 60%, #09090b 100%);
  -webkit-font-smoothing: antialiased; }
.frame { border-radius: 18px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 40px 90px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.4); background: #111114; }
.frame iframe { display: block; border: 0; }
.vinyl { border-radius: 50%; flex: none;
  background: radial-gradient(circle closest-side, var(--a, #ff6a3d) 0 18%, #0d0d10 19% 28%, #26262c 29% 32%, #0d0d10 33% 60%, #26262c 61% 63%, #0d0d10 64% 92%, #26262c 93% 96%, #0d0d10 97%);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 0 40px rgba(255, 106, 61, 0.25); }
.brand { display: flex; align-items: center; gap: 12px; font-weight: 800; letter-spacing: 0.2em; font-size: 15px; }
.brand b { color: #ff6a3d; }
h1 { font-size: 46px; line-height: 1.1; letter-spacing: -0.02em; margin: 22px 0 18px; font-weight: 700; }
h1 em { font-style: normal; color: #ff6a3d; }
p.lead { font-size: 19px; line-height: 1.5; color: #b7b3c2; margin: 0; }
ul { margin: 26px 0 0; padding: 0; list-style: none; display: grid; gap: 14px; }
li { font-size: 17px; color: #d9d6e0; position: relative; padding-left: 20px; }
li::before { content: ''; position: absolute; left: 0; top: 0.55em; width: 8px; height: 8px; border-radius: 50%; background: #ff6a3d; }
.label { text-align: center; margin-top: 16px; font-size: 15px; font-weight: 600; color: #cfcbd8; }
.label span { display: block; font-weight: 400; font-size: 13px; color: #8f8a9c; margin-top: 2px; }
"""


def panel(scene='playing', art='sunset', lang='en', w=400, h=720, scale=1.0):
    """The real panel in a frame, `scale` applied as a transform so it stays vector-sharp."""
    src = f'panel.html?scene={scene}&art={art}&lang={lang}'
    return (f'<div style="width:{w * scale}px;height:{h * scale}px"><div class="frame" '
            f'style="width:{w}px;height:{h}px;transform:scale({scale});transform-origin:0 0">'
            f'<iframe src="{src}" width="{w}" height="{h}"></iframe></div></div>')


def brand(size=26):
    return f'<div class="brand"><span class="vinyl" style="width:{size}px;height:{size}px"></span><span>B<b>-SIDE</b></span></div>'


def page(body, extra=''):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{STYLE}{extra}</style></head><body>{body}</body></html>'


PAGES = {
    # name: (css width, css height, device scale, html)
    'icon': (128, 128, 2, page(
        '<div class="tile"><div class="vinyl" style="width:100px;height:100px"></div></div>',
        'body { background: transparent; } .tile { width: 128px; height: 128px; border-radius: 28px; display: grid; place-items: center;'
        ' background: radial-gradient(circle at 50% 50%, rgba(255,106,61,0.35), transparent 62%), linear-gradient(160deg, #241b2e, #0e0d12); }'
        ' .tile .vinyl { box-shadow: 0 0 0 1px rgba(255,255,255,0.14), 0 6px 18px rgba(0,0,0,0.6);'
        '  background: radial-gradient(circle closest-side, #ff6a3d 0 22%, #0d0d10 23% 31%, #3a3a44 32% 34%, #0d0d10 35% 52%,'
        '  #3a3a44 53% 55%, #0d0d10 56% 73%, #3a3a44 74% 76%, #0d0d10 77% 93%, #3a3a44 94% 96%, #0d0d10 97%); }')),
    'cover': (1000, 625, 1.6, page(
        '<div class="wrap"><div class="text">'
        '<div class="logo"><span class="vinyl" style="width:84px;height:84px"></span><div class="word">B<b>-SIDE</b></div></div>'
        '<h1>Your lossless collection,<br>right in Orca\'s sidebar.</h1>'
        '<p class="lead">AIMP streams it from the cloud.<br>B-Side puts the controls where you work.</p></div>'
        + panel(h=760, scale=0.75) + '</div>',
        'body { --gx: 80%; } .wrap { display: flex; align-items: center; justify-content: space-between; height: 100%; padding: 0 84px 0 76px; }'
        ' .logo { display: flex; align-items: center; gap: 22px; } .word { font-size: 64px; font-weight: 800; letter-spacing: 0.01em; }'
        ' .word b { color: #ff6a3d; } h1 { font-size: 34px; margin: 34px 0 14px; } p.lead { font-size: 17px; }')),
    'shot-playing': (1280, 800, 2, page(
        '<div class="wrap"><div class="text">' + brand() +
        '<h1>Control AIMP<br>without leaving <em>Orca</em>.</h1>'
        '<p class="lead">A panel in Orca\'s right sidebar that follows<br>the player as it plays.</p>'
        '<ul><li>Cover, title, artist, album and year</li><li>Play, pause, previous, next and seek</li>'
        '<li>Volume and mute, shuffle and repeat</li><li>Accent color taken from the cover</li></ul></div>'
        + panel(h=740) + '</div>',
        '.wrap { display: flex; align-items: center; justify-content: space-between; height: 100%; padding: 0 110px 0 100px; } .text { max-width: 560px; }')),
    'shot-format': (1280, 800, 2, page(
        '<div class="wrap"><div class="text">' + brand() +
        '<h1>The real format,<br>as <em>AIMP</em> reports it.</h1>'
        '<p class="lead">B-Side never touches the audio: AIMP decodes and plays it.</p>'
        '<ul><li>Codec, sample rate, bitrate and channels</li><li>A <i>Lossless</i> badge, or <i>CD quality</i> for lossless 44.1 kHz stereo</li>'
        '<li>A cloud mark for tracks streamed from My Clouds</li></ul></div>'
        '<div class="crop">' + panel(art='tide', h=740, scale=1.45) + '</div></div>',
        '.wrap { display: flex; align-items: center; justify-content: space-between; height: 100%; padding: 0 0 0 100px; } .text { max-width: 520px; }'
        ' li i { font-style: normal; color: #ff6a3d; }'
        ' .crop { width: 560px; height: 800px; overflow: hidden; position: relative; }'
        ' .crop > div { position: absolute; left: 0; top: -340px; }'
        ' .crop::after { content: ""; position: absolute; inset: 0; pointer-events: none;'
        '  background: linear-gradient(180deg, #0d0c11 0%, transparent 12%, transparent 88%, #0b0b0d 100%); }')),
    'shot-states': (1280, 800, 2, page(
        '<div class="head">' + brand(22) + '<h1>Always clear about what AIMP is doing.</h1></div><div class="row">'
        + ''.join(f'<div>{panel(scene=s, h=720, scale=0.82)}<div class="label">{a}<span>{b}</span></div></div>'
                  for s, a, b in (('idle', 'Waiting', 'AIMP is open, nothing playing'),
                                  ('closed', 'AIMP closed', 'One button opens it'),
                                  ('offline', 'Offline', 'Streaming needs internet')))
        + '</div>',
        'body { --gx: 50%; } .head { text-align: center; padding-top: 34px; } .head .brand { justify-content: center; }'
        ' h1 { font-size: 30px; margin: 14px 0 0; } .row { display: flex; justify-content: center; gap: 44px; margin-top: 26px; }')),
    'shot-languages': (1280, 800, 2, page(
        '<div class="head">' + brand(22) + '<h1>Six languages. Your accent, from your cover.</h1></div><div class="row">'
        + ''.join(f'<div>{panel(art=art, lang=lang, h=720, scale=0.82)}<div class="label">{name}</div></div>'
                  for art, lang, name in (('violet', 'es', 'Español'), ('sunset', 'ja', '日本語'), ('tide', 'de', 'Deutsch')))
        + '</div>',
        'body { --gx: 50%; } .head { text-align: center; padding-top: 34px; } .head .brand { justify-content: center; }'
        ' h1 { font-size: 30px; margin: 14px 0 0; } .row { display: flex; justify-content: center; gap: 44px; margin-top: 26px; }')),
}


def render(chrome, work, name, w, h, dpr, html):
    src = work / f'{name}.html'
    src.write_text(html, encoding='utf-8')
    out = work / f'{name}.raw.png'
    args = [chrome, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
            f'--user-data-dir={work / "profile"}', f'--force-device-scale-factor={dpr}',
            f'--window-size={w},{h}', '--virtual-time-budget=6000', f'--screenshot={out}', src.as_uri()]
    if name == 'icon':
        args.insert(1, '--default-background-color=00000000')
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    return Image.open(out)


def save(img, name):
    """Icon and cover as optimised PNG; screenshots as lossless WEBP, since 2560x1600 PNGs of
    soft gradients run past Orca's 1536 KB limit. Fails loudly if a file is still too big."""
    kind = 'shot' if name.startswith('shot-') else name
    if kind == 'shot':
        path = DOCS / f'{name}.webp'
        img.save(path, 'WEBP', lossless=True, quality=100, method=6)
    else:
        path = DOCS / f'{name}.png'
        img.save(path, optimize=True)
    if path.stat().st_size > LIMITS[kind]:
        sys.exit(f'{path.name} is {path.stat().st_size} bytes, over the {LIMITS[kind]} byte limit')
    return path


def main():
    chrome = browser()
    work = ROOT / 'scratch' / f'tmp-assets-{secrets.token_hex(4)}'
    work.mkdir(parents=True)
    try:
        shutil.copytree(ROOT / 'panel' / 'flags', work / 'flags')
        art = {name: data_url(cover_art(name)) for name in PALETTES}
        states = {f'{s}:{a}': scene_state(s, a) for s in ('playing', 'idle', 'closed', 'offline') for a in PALETTES}
        mock = MOCK.replace('__DATA__', json.dumps({'art': art, 'states': states}))
        html = (ROOT / 'panel' / 'index.html').read_text(encoding='utf-8')
        (work / 'panel.html').write_text(html.replace('<body>', '<body>\n' + mock, 1), encoding='utf-8')
        for name, (w, h, dpr, body) in PAGES.items():
            img = render(chrome, work, name, w, h, dpr, body)
            expected = (round(w * dpr), round(h * dpr))
            if img.size != expected:
                sys.exit(f'{name}: the browser drew {img.size}, expected {expected}')
            if name != 'icon':
                img = img.convert('RGB')
            path = save(img, name)
            print(f'{path.relative_to(ROOT)}  {img.width}x{img.height}  {path.stat().st_size // 1024} KB')
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
