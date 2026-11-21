"""Regenerates B-Side's plugin-page images: docs/icon.png, docs/cover.png, docs/shot-*.webp.

The screenshots are the real panel (panel/index.html) rendered by headless Chrome or Edge at
2x, with a stand-in for Orca's `orca` object that answers with a synthetic demo track, a
synthetic library (12 artists, 20 albums, about 190 tracks, lyrics) and cover art drawn here.
Nothing comes from AIMP, a real album or anyone's library. Rerun it whenever the panel changes:

    python docs/make-assets.py               (Python 3 with Pillow, and Chrome or Edge installed)
    python docs/make-assets.py --out DIR     the same images, written to DIR instead of docs/
    python docs/make-assets.py --review DIR  the panel's views at 240x603, 400x800 and 1100x800,
                                             dark and light, as PNG sheets in DIR, to look at

Set BSIDE_BROWSER to a browser executable to pick one. Work files go to scratch/tmp-assets-*,
which is removed afterwards.
"""

import argparse
import base64
import io
import json
import math
import os
import random
import secrets
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

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


def artist_portrait(size=480, colours=('#2b5876', '#4e4376', '#f2c7a5', '#1f1b2e')):
    """A synthetic artist picture: a soft silhouette on a studio backdrop (nobody real)."""
    top, bottom, face, body = (rgb(c) for c in colours)
    s = size * 2
    img = Image.new('RGB', (s, s))
    d = ImageDraw.Draw(img)
    for y in range(s):
        d.line([(0, y), (s, y)], fill=mix(top, bottom, y / s))
    d.ellipse([s * 0.34, s * 0.18, s * 0.66, s * 0.5], fill=face)
    d.ellipse([s * 0.18, s * 0.52, s * 0.82, s * 1.2], fill=body)
    return img.resize((size, size), Image.LANCZOS)


# Synthetic lyrics (written for these images), timed around each demo track's position.
LYRICS_LINES = ['Neon on the window', 'Static on the line', 'Every chorus brighter', 'Than the one behind',
                'Hold the last note longer', 'Let the tape run slow', 'Golden hour is calling', 'Turn the record over',
                'Play the other side', 'Where the quiet songs are', 'Waiting for the night']


def lyrics(position_ms, synced):
    start = position_ms - 4 * 4500
    lines = [{'ms': start + i * 4500 if synced else None, 'text': t} for i, t in enumerate(LYRICS_LINES)]
    return {'source': 'tag', 'synced': synced, 'lines': lines}


def data_url(img, quality=92):
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=quality)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def drawn_cover(style, colours, seed, size=640):
    """Abstract album art in a handful of styles, drawn at 2x and reduced; seeded, so every run
    draws the same pictures. `colours`: background then three accents, as #rrggbb."""
    bg, c1, c2, c3 = (rgb(c) for c in colours)
    s = size * 2
    rnd = random.Random(seed)
    img = Image.new('RGB', (s, s), bg)
    d = ImageDraw.Draw(img)
    if style == 'rings':
        cx, cy = s * rnd.uniform(0.3, 0.7), s * rnd.uniform(0.3, 0.7)
        r, i = s * 0.95, 0
        while r > s * 0.04:
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(c1, c2, c3, bg)[i % 4])
            r -= s * rnd.uniform(0.05, 0.11)
            i += 1
    elif style == 'stripes':
        w = s * 0.11
        for i in range(-12, 24):
            x = i * w
            d.polygon([(x, 0), (x + w * 0.62, 0), (x + w * 0.62 - s, s), (x - s, s)], fill=(c1, c2, c3)[i % 3])
        d.ellipse([s * 0.56, s * 0.56, s * 0.9, s * 0.9], fill=bg)
    elif style == 'blobs':
        for y in range(s):
            d.line([(0, y), (s, y)], fill=mix(bg, mix(bg, c3, 0.25), y / s))
        layer = Image.new('RGB', (s, s), (0, 0, 0))
        mask = Image.new('L', (s, s), 0)
        for c in (c1, c2, c3, c1):
            r = s * rnd.uniform(0.18, 0.34)
            x, y = s * rnd.uniform(0.15, 0.85), s * rnd.uniform(0.15, 0.85)
            ImageDraw.Draw(layer).ellipse([x - r, y - r, x + r, y + r], fill=c)
            ImageDraw.Draw(mask).ellipse([x - r, y - r, x + r, y + r], fill=230)
        blur = ImageFilter.GaussianBlur(s * 0.06)
        img.paste(layer.filter(blur), (0, 0), mask.filter(blur))
    elif style == 'mosaic':
        n = 6
        cell = s / n
        g = cell * 0.06
        for gx in range(n):
            for gy in range(n):
                c = rnd.choice((c1, c2, c3, bg, bg))
                box = [gx * cell + g, gy * cell + g, (gx + 1) * cell - g, (gy + 1) * cell - g]
                (d.ellipse if rnd.random() < 0.3 else d.rectangle)(box, fill=c)
    elif style == 'waves':
        for y in range(s):
            d.line([(0, y), (s, y)], fill=mix(bg, c1, y / s * 0.6))
        for k, c in enumerate((c1, c2, c3)):
            base = s * (0.45 + 0.16 * k)
            amp, freq, ph = s * 0.05, rnd.uniform(1.2, 2.2), rnd.uniform(0, 6.28)
            pts = [(x, base + amp * math.sin(ph + freq * 6.28 * x / s)) for x in range(0, s + 8, 8)]
            d.polygon(pts + [(s, s), (0, s)], fill=c)
    elif style == 'peaks':
        for y in range(s):
            d.line([(0, y), (s, y)], fill=mix(bg, c1, y / s))
        sun = s * 0.13
        d.ellipse([s * 0.62 - sun, s * 0.3 - sun, s * 0.62 + sun, s * 0.3 + sun], fill=c3)
        for k, c in enumerate((mix(c1, c2, 0.5), c2, mix(c2, bg, 0.55))):
            base = s * (0.55 + 0.13 * k)
            pts, x = [(0, base)], 0
            while x < s:
                x += s * rnd.uniform(0.08, 0.18)
                pts.append((x, base - s * rnd.uniform(0.0, 0.16)))
            d.polygon(pts + [(s, s), (0, s)], fill=c)
    elif style == 'eclipse':
        cx, cy, r = s * 0.5, s * 0.46, s * 0.26
        glow = Image.new('L', (s, s), 0)
        ImageDraw.Draw(glow).ellipse([cx - r * 1.25, cy - r * 1.25, cx + r * 1.25, cy + r * 1.25], fill=255)
        img.paste(Image.new('RGB', (s, s), c1), (0, 0), glow.filter(ImageFilter.GaussianBlur(s * 0.05)))
        d.ellipse([cx - r * 1.04, cy - r * 1.04, cx + r * 1.04, cy + r * 1.04], fill=c2)
        d.ellipse([cx - r + s * 0.03, cy - r - s * 0.02, cx + r + s * 0.03, cy + r - s * 0.02], fill=bg)
        d.rectangle([0, s * 0.84, s, s], fill=mix(bg, c3, 0.35))
    elif style == 'sun':
        for y in range(s):
            d.line([(0, y), (s, y)], fill=mix(c1, bg, y / s))
        r = s * 0.3
        d.ellipse([s * 0.5 - r, s * 0.62 - r, s * 0.5 + r, s * 0.62 + r], fill=c2)
        d.ellipse([s * 0.5 - r * 0.62, s * 0.62 - r * 0.62, s * 0.5 + r * 0.62, s * 0.62 + r * 0.62], fill=c3)
        d.rectangle([0, s * 0.62, s, s], fill=c1)
        for k in range(5):
            y = s * (0.68 + 0.06 * k)
            d.rectangle([s * 0.08, y, s * 0.92, y + s * 0.012], fill=bg)
    # Faint grain, as on a printed sleeve.
    px = img.load()
    for _ in range(s * s // 700):
        x, y = rnd.randrange(s), rnd.randrange(s)
        px[x, y] = mix(px[x, y], (255, 255, 255), rnd.uniform(0.05, 0.25))
    return img.resize((size, size), Image.LANCZOS)


# --- Synthetic library ---------------------------------------------------------------------
# Invented artists, albums and titles, for the screenshots only.

LIB_ARTISTS = [
    # id, name, portrait colours (an artist.jpg) or None
    ('ar01', 'Sunset Arcade', ('#2b5876', '#4e4376', '#f2c7a5', '#1f1b2e')),
    ('ar02', 'Harbor Lights', ('#0f3b4a', '#3d8c95', '#e9c6aa', '#10232b')),
    ('ar03', 'Paper Planets', None),
    ('ar04', 'Glass Orchard', None),
    ('ar05', 'Lumen Drift', ('#3a1f5d', '#c33764', '#f5d0b5', '#1c0f2e')),
    ('ar06', 'The Quiet Hours', None),
    ('ar07', 'Ocean Coda', None),
    ('ar08', 'Amber Vale', None),
    ('ar09', 'Nightjar Radio', None),
    ('ar10', 'Éclair Noir', None),
    ('ar11', 'Ferro & Finch', None),
    ('ar12', 'Saudade Club', None),
]
QUALITY = {
    'cd': dict(codec='FLAC', sampleRate=44100, bits=16, lossless=True),
    'hires': dict(codec='FLAC', sampleRate=96000, bits=24, lossless=True),
    '48': dict(codec='FLAC', sampleRate=48000, bits=24, lossless=True),
    'mp3': dict(codec='MP3', sampleRate=44100, bits=None, lossless=False),
}
LIB_ALBUMS = [
    # id, artist, title, year, genre, cover (style, colours) or None, quality, tracks, discs, cloud only
    ('al01', 'ar01', 'Afterglow', 2024, 'Synthwave', ('art', 'sunset'), 'cd', 12, 1, False),
    ('al02', 'ar01', 'Neon Coast', 2021, 'Synthwave', ('rings', ('#1a1033', '#ff4f81', '#ffb36b', '#3df0ff')), 'hires', 9, 1, False),
    ('al03', 'ar01', 'Midnight Drive', 2019, 'Synthwave', ('peaks', ('#0b1030', '#5a2d82', '#ff7aa8', '#ffd27a')), 'cd', 8, 1, False),
    ('al04', 'ar02', 'Blue Hour', 2023, 'Ambient', ('art', 'tide'), 'hires', 8, 1, False),
    ('al05', 'ar02', 'Lighthouse Tapes', 2019, 'Ambient', ('waves', ('#06283d', '#1363df', '#47b5ff', '#dff6ff')), 'cd', 9, 1, False),
    ('al06', 'ar03', 'Night Bloom', 2025, 'Indie Pop', ('art', 'violet'), 'cd', 11, 1, False),
    ('al07', 'ar03', 'Origami Sky', 2022, 'Indie Pop', ('stripes', ('#ffe8d6', '#ff8fab', '#fb6f92', '#3a0ca3')), 'cd', 10, 1, False),
    ('al08', 'ar04', 'Windfall', 2020, 'Folk', None, 'cd', 9, 1, False),
    ('al09', 'ar05', 'Parallax', 2024, 'Electronic', ('blobs', ('#0a0a1f', '#7b2ff7', '#f107a3', '#00e0ff')), 'hires', 8, 1, False),
    ('al10', 'ar05', 'Halation', 2022, 'Electronic', ('eclipse', ('#05060a', '#ff9f1c', '#ffbf69', '#2ec4b6')), '48', 9, 1, False),
    ('al11', 'ar05', 'Monochrome', 2020, 'Electronic', ('mosaic', ('#111111', '#f5f5f5', '#9e9e9e', '#ff3b30')), 'mp3', 8, 1, False),
    ('al12', 'ar06', 'After Midnight', 2018, 'Jazz', ('rings', ('#1b1b1b', '#c9a227', '#7a5c12', '#efe6d0')), 'cd', 14, 2, False),
    ('al13', 'ar06', 'Brushwork', 2021, 'Jazz', ('stripes', ('#123524', '#3e7b27', '#85a947', '#efe3c2')), 'hires', 8, 1, False),
    ('al14', 'ar07', 'Nocturnes for a Small Room', 2023, 'Classical', ('waves', ('#0d1b2a', '#1b263b', '#415a77', '#e0e1dd')), 'hires', 12, 1, False),
    ('al15', 'ar08', 'Hearth', 2019, 'Folk', ('peaks', ('#2d1e17', '#8c4a2f', '#d9a066', '#f6e7c1')), 'cd', 10, 1, True),
    ('al16', 'ar09', 'Field Recordings Vol. 2', 2017, 'Downtempo', None, 'cd', 7, 1, False),
    ('al17', 'ar09', 'Static Bloom', 2022, 'Downtempo', ('blobs', ('#132a13', '#31572c', '#90a955', '#ecf39e')), 'cd', 9, 1, False),
    ('al18', 'ar10', 'Velours', 2023, 'Electronic', ('eclipse', ('#14001f', '#ff2e88', '#b388ff', '#ffe3f1')), 'hires', 8, 1, False),
    ('al19', 'ar11', 'Copper Kites', 2020, 'Indie Pop', ('mosaic', ('#3d2c2e', '#d9822b', '#f2c14e', '#5fad56')), 'cd', 10, 1, False),
    ('al20', 'ar12', 'Maré Alta', 2021, 'Jazz', ('sun', ('#00a6a6', '#efca08', '#f49f0a', '#f6efe0')), 'cd', 9, 1, False),
]
# The demo tracks of the docs scenes, placed in their albums.
KNOWN_TITLES = {('al01', 3): 'Golden Hour Static', ('al04', 2): 'Low Tide Signals', ('al06', 5): 'Violet Weather'}
WORDS_A = ['Golden', 'Paper', 'Silver', 'Quiet', 'Electric', 'Velvet', 'Hollow', 'Northern', 'Slow', 'Distant',
           'Amber', 'Glass', 'Midnight', 'Neon', 'Little', 'Open', 'Wild', 'Lucid', 'Second', 'Blue']
WORDS_B = ['Weather', 'Signals', 'Gardens', 'Rooms', 'Tides', 'Letters', 'Lights', 'Rivers', 'Engines', 'Summers',
           'Static', 'Harbours', 'Kites', 'Mirrors', 'Fields', 'Satellites', 'Windows', 'Echoes', 'Lanterns', 'Hours']


def fold(text):
    """Accents and case dropped, for sorting names as the worker does."""
    return ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c)).lower()


def image_pair(img):
    return {'thumb': data_url(img.resize((256, 256), Image.LANCZOS), 86), 'large': data_url(img, 88)}


def build_library():
    """The library as the worker's library.* handlers describe it, and its images by id."""
    rnd = random.Random('b-side library')
    names = {a: n for a, n, _ in LIB_ARTISTS}
    images, albums, tracks = {}, [], []
    for aid, artist, title, year, genre, cover, quality, count, discs, cloud in LIB_ALBUMS:
        cover_id = None
        if cover:
            cover_id = 'cv-' + aid
            images[cover_id] = image_pair(cover_art(cover[1]) if cover[0] == 'art' else drawn_cover(cover[0], cover[1], aid))
        first_disc = (count + 1) // 2 if discs == 2 else count
        own = []
        for n in range(1, count + 1):
            by = 'Paper Planets feat. Amber Vale' if (aid, n) == ('al06', 7) else names[artist]
            own.append({'id': f'{aid}-t{n:02d}', 'albumId': aid, 'disc': 1 if n <= first_disc else 2,
                        'number': n if n <= first_disc else n - first_disc,
                        'title': KNOWN_TITLES.get((aid, n)) or f'{rnd.choice(WORDS_A)} {rnd.choice(WORDS_B)}',
                        'artist': by, 'durationMs': rnd.randint(150, 420) * 1000,
                        'lyrics': (aid, n) in KNOWN_TITLES or rnd.random() < 0.45, 'cloudOnly': cloud})
        tracks += own
        albums.append({'id': aid, 'title': title, 'artist': names[artist], 'artistId': artist, 'year': year, 'tracks': count,
                       'durationMs': sum(t['durationMs'] for t in own), 'cover': cover_id, 'genres': [genre],
                       'cloudOnly': cloud, 'quality': QUALITY[quality]})
    artists = []
    for aid, name, portrait in LIB_ARTISTS:
        image = None
        if portrait:
            image = 'ai-' + aid
            images[image] = image_pair(artist_portrait(640, portrait))
        own = [a for a in albums if a['artistId'] == aid]
        artists.append({'id': aid, 'name': name, 'albums': len(own), 'tracks': sum(a['tracks'] for a in own), 'image': image})
    artists.sort(key=lambda a: fold(a['name']))
    genres = {}
    for a in albums:
        for g in a['genres']:
            e = genres.setdefault(g, {'name': g, 'albums': 0, 'tracks': 0})
            e['albums'] += 1
            e['tracks'] += a['tracks']
    by_album = {a['id']: a for a in albums}
    order = {a['id']: i for i, a in enumerate(sorted(albums, key=lambda a: (fold(a['artist']), a['year'])))}
    listed = sorted(tracks, key=lambda t: (order[t['albumId']], t['disc'], t['number']))
    listed = [{**t, 'album': by_album[t['albumId']]['title'], 'cover': by_album[t['albumId']]['cover']} for t in listed]
    counts = {'artists': len(artists), 'albums': len(albums), 'tracks': len(tracks), 'cloudOnly': sum(t['cloudOnly'] for t in tracks)}
    return {'artists': artists, 'albums': albums, 'tracks': tracks, 'listed': listed,
            'genres': sorted(genres.values(), key=lambda g: g['name']), 'counts': counts}, images


# --- Stand-in for Orca ---------------------------------------------------------------------

TRACKS = {
    'sunset': dict(title='Golden Hour Static', artist='Sunset Arcade', album='Afterglow', year='2024',
                   quality=dict(cd=True, lossless=True, codec='FLAC', sampleRateLabel='44.1 kHz', bitrate=1011, channels=2),
                   positionMs=102000, durationMs=246000, trackId='al01-t03', albumId='al01'),
    'tide': dict(title='Low Tide Signals', artist='Harbor Lights', album='Blue Hour', year='2023',
                 quality=dict(cd=False, lossless=True, codec='FLAC', sampleRateLabel='96 kHz', bitrate=2846, channels=2),
                 positionMs=64000, durationMs=301000, trackId='al04-t02', albumId='al04'),
    'violet': dict(title='Violet Weather', artist='Paper Planets', album='Night Bloom', year='2025',
                   quality=dict(cd=True, lossless=True, codec='FLAC', sampleRateLabel='44.1 kHz', bitrate=884, channels=2),
                   positionMs=171000, durationMs=219000, trackId='al06-t05', albumId='al06'),
}


def scene_state(scene, art):
    """What `player.state` would answer for each scene, in the worker's own shape."""
    if scene == 'closed':
        return {'running': False}
    base = {'running': True, 'state': 'playing', 'volume': 72, 'mute': False, 'shuffle': False, 'repeat': True, 'online': True}
    if scene == 'idle':
        return {**base, 'state': 'stopped', 'positionMs': 0, 'durationMs': 0, 'track': None}
    t = TRACKS[art]
    track = {k: t[k] for k in ('title', 'artist', 'album', 'year', 'quality', 'trackId', 'albumId')}
    track.update(key='demo|' + art, cloud=True, number=3)
    state = {**base, 'positionMs': t['positionMs'], 'durationMs': t['durationMs'], 'track': track}
    if scene == 'offline':
        state.update(state='paused', online=False)
    return state


# Orca's theme variables as a frame gets them, for the light and dark review renders.
THEMES = {
    'dark': {'--orca-background': '#0f0f12', '--orca-foreground': '#ececf1', '--orca-card': '#18181c', '--orca-popover': '#1c1c21',
             '--orca-popover-foreground': '#ececf1', '--orca-muted-foreground': '#9a9aa6', '--orca-accent': '#232329',
             '--orca-border': '#2a2a31', '--orca-ring': '#8b8bf5'},
    'light': {'--orca-background': '#ffffff', '--orca-foreground': '#18181b', '--orca-card': '#f5f5f7', '--orca-popover': '#ffffff',
              '--orca-popover-foreground': '#18181b', '--orca-muted-foreground': '#62626d', '--orca-accent': '#f0f0f3',
              '--orca-border': '#e3e3e8', '--orca-ring': '#5b5bd6'},
}

# Injected before the panel's own scripts: the panel reads `orca` exactly as it does in Orca.
# Transitions and animations are switched off so the capture shows the settled picture.
# Query parameters pick the scene: scene, art, lang, lyrics, view, avatar, noart (the player);
# theme (light/dark); lib (ready, empty, nofolders, scanning, listing, error, missing, many);
# tab, section, album, artist, genre, q (where the panel opens); menu=1 opens a track's menu.
MOCK = """<style>*, *::before, *::after { transition: none !important; animation: none !important; }</style>
<script>
(() => {
  const q = new URLSearchParams(location.search)
  const scene = q.get('scene') || 'playing', art = q.get('art') || 'sunset'
  const data = __DATA__
  const state = data.states[scene + ':' + art]
  // Lyrics and the artist picture exist only for files on the PC, so those scenes are local tracks.
  const inLibrary = ['lib', 'tab', 'section', 'album', 'artist', 'genre', 'q'].some((k) => q.has(k))
  if (state.track && (q.get('lyrics') || q.get('avatar') || inLibrary)) state.track.cloud = false
  if (state.track && q.get('paused')) state.state = 'paused'
  // Lyrics show by default when a track has them; `view` picks lyrics or the cover.
  try {
    if (q.get('view')) sessionStorage.setItem('bside.lyrics', q.get('view') === 'lyrics' ? '1' : '0')
    else sessionStorage.removeItem('bside.lyrics')
  } catch {}
  const theme = q.get('theme')
  if (theme) {
    document.documentElement.className = theme
    for (const [k, v] of Object.entries(data.themes[theme])) document.documentElement.style.setProperty(k, v)
  }

  const L = data.library
  const lib = q.get('lib') || 'ready'
  const status = {
    ready: { state: 'ready', folders: ['Hi-Fi Collection'], counts: L.counts, scannedAt: 1 },
    many: { state: 'ready', folders: ['Hi-Fi Collection'], counts: L.counts, scannedAt: 1 },
    missing: { state: 'ready', folders: ['Hi-Fi Collection', 'Old Rips'], counts: L.counts, scannedAt: 1, missingFolders: ['Old Rips'] },
    empty: { state: 'empty', folders: ['Music'], counts: { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 } },
    nofolders: { state: 'empty', folders: [], counts: { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 } },
    scanning: { state: 'scanning', folders: ['Hi-Fi Collection'], counts: { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 }, progress: { phase: 'reading', done: 1312, total: 4210 } },
    listing: { state: 'scanning', folders: ['Hi-Fi Collection'], counts: { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 }, progress: { phase: 'listing', done: 2876, total: 2876 } },
    error: { state: 'error', folders: ['Hi-Fi Collection'], counts: { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 }, error: 'The helper could not list the folders' }
  }[lib]
  // 10 340 tracks for the virtual list: the library's own, many times over.
  const listed = lib === 'many' ? Array.from({ length: 55 }, (_, k) => L.listed.map((t) => ({ ...t, id: t.id + '~' + k }))).flat() : L.listed
  const fold = (s) => String(s ?? '').normalize('NFKD').replace(/\\p{M}/gu, '').toLowerCase()
  const words = (s) => fold(s).split(/[^\\p{L}\\p{N}]+/u).filter(Boolean)
  const matches = (text, qw) => {
    const w = words(text)
    return qw.every((x) => w.some((y) => y.startsWith(x)))
  }
  const notFound = (what) => ({ error: { code: 'not_found', message: 'Unknown ' + what } })
  const library = {
    'library.status': () => status,
    'library.rescan': () => ({ started: true }),
    'library.artists': () => ({ artists: L.artists }),
    'library.albums': ({ artistId, genre }) => ({ albums: L.albums.filter((a) => (!artistId || a.artistId === artistId) && (!genre || a.genres.includes(genre))) }),
    'library.album': ({ id }) => {
      const album = L.albums.find((a) => a.id === id)
      return album ? { album, tracks: L.tracks.filter((t) => t.albumId === id) } : notFound('album')
    },
    'library.artist': ({ id }) => {
      const a = L.artists.find((x) => x.id === id)
      return a ? { artist: { id: a.id, name: a.name, image: a.image }, albums: L.albums.filter((x) => x.artistId === id) } : notFound('artist')
    },
    'library.genres': () => ({ genres: L.genres }),
    'library.tracks': ({ offset = 0, limit = 500 }) => ({ tracks: listed.slice(offset, offset + limit), total: listed.length }),
    'library.search': ({ q: text, limit = 20 }) => {
      const qw = words(text)
      if (!qw.length) return { artists: [], albums: [], tracks: [] }
      return {
        artists: L.artists.filter((a) => matches(a.name, qw)).slice(0, limit),
        albums: L.albums.filter((a) => matches(a.title + ' ' + a.artist, qw)).slice(0, limit),
        tracks: L.listed.filter((t) => matches([t.title, t.artist, t.album].join(' '), qw)).slice(0, limit)
      }
    },
    'library.image': ({ id, size }) => ({ id, dataUrl: (data.images[id] || {})[size || 'thumb'] || null }),
    'player.playAlbum': () => ({ ok: true }),
    'player.playTracks': () => ({ ok: true }),
    'player.enqueue': () => ({ ok: true })
  }
  window.orca = {
    locale: q.get('lang') || 'en',
    storage: { get: async () => null, set: async () => {} },
    on() {},
    plugin: {
      request: async (name, input) => {
        if (name === 'player.state') return JSON.parse(JSON.stringify(state))
        if (name === 'player.art') return { key: 'demo|' + art, dataUrl: q.get('noart') ? null : data.art[art] }
        if (name === 'player.lyrics') {
          const found = data.lyrics[q.get('lyrics') + ':' + art]
          return { key: 'demo|' + art, ...(found || { source: null, synced: false, lines: [], reason: 'none' }) }
        }
        if (name === 'player.artist') return { key: 'demo|' + art, dataUrl: q.get('avatar') ? data.artist : null }
        if (library[name]) return JSON.parse(JSON.stringify(library[name](input || {})))
        return {}
      }
    }
  }
  // Where the panel opens, once it has started.
  addEventListener('load', () => {
    const A = window.BSideApp
    if (!A) return
    if (q.get('tab')) A.go(q.get('tab'))
    if (q.get('section')) A.section(q.get('section'))
    if (q.get('album')) A.openAlbum(q.get('album'))
    if (q.get('artist')) A.openArtist(q.get('artist'))
    if (q.get('genre')) A.openGenre(q.get('genre'))
    if (q.get('q')) A.search(q.get('q'))
    if (q.get('menu'))
      setTimeout(() => {
        const row = [...document.querySelectorAll('.view:not([hidden]) .page:not([hidden]) .trow[data-track-id]')][Number(q.get('menu')) || 0]
        if (!row) return
        const r = row.getBoundingClientRect()
        row.querySelector('.tmain').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width * 0.6, clientY: r.top + r.height / 2 }))
      }, 600)
  })
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


def panel(scene='playing', art='sunset', lang='en', w=400, h=720, scale=1.0, extra=''):
    """The real panel in a frame, `scale` applied as a transform so it stays vector-sharp."""
    src = f'panel.html?scene={scene}&art={art}&lang={lang}{extra}'
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
        '<li>Volume and mute, shuffle and repeat</li><li>Colors taken from the cover</li></ul></div>'
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
    'shot-lyrics': (1280, 800, 2, page(
        '<div class="head">' + brand(22) + '<h1>Lyrics that follow the song.</h1></div><div class="row">'
        + ''.join(f'<div>{panel(art=art, h=720, scale=0.82, extra=extra)}<div class="label">{a}<span>{b}</span></div></div>'
                  for art, extra, a, b in (('sunset', '&lyrics=synced&view=lyrics&avatar=1', 'Synced lyrics', 'The current line lights up'),
                                           ('violet', '&lyrics=plain&view=lyrics&avatar=1', 'Plain lyrics', 'From the tags or a .lrc file'),
                                           ('tide', '&avatar=1&noart=1', 'Artist image', 'artist.jpg when a track has no cover')))
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
            f'--window-size={w},{h}', '--virtual-time-budget=8000', '--force-prefers-reduced-motion',
            f'--screenshot={out}', src.as_uri()]
    if name == 'icon':
        args.insert(1, '--default-background-color=00000000')
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    return Image.open(out)


def save(img, name, folder=DOCS):
    """Icon and cover as optimised PNG; screenshots as lossless WEBP, since 2560x1600 PNGs of
    soft gradients run past Orca's 1536 KB limit. Fails loudly if a file is still too big."""
    kind = 'shot' if name.startswith('shot-') else name
    if kind == 'shot':
        path = folder / f'{name}.webp'
        img.save(path, 'WEBP', lossless=True, quality=100, method=6)
    else:
        path = folder / f'{name}.png'
        img.save(path, optimize=True)
    if path.stat().st_size > LIMITS[kind]:
        sys.exit(f'{path.name} is {path.stat().st_size} bytes, over the {LIMITS[kind]} byte limit')
    return path


# --- Review sheets ---------------------------------------------------------------------------
# The panel's views side by side at Orca's default sidebar (240x603), a wider sidebar (400x800)
# and a sidebar dragged wide (1100x800), in both themes: `python docs/make-assets.py --review DIR`.

N240 = [
    ('Now Playing, lyrics', '&lyrics=synced&avatar=1'),
    ('Albums', '&tab=library&section=albums'),
    ('Album', '&tab=library&album=al01'),
    ('Search', '&q=night'),
]
N240B = [
    ('Artists', '&tab=library&section=artists'),
    ('Tracks', '&tab=library&section=tracks&lyrics=synced'),
    ('Genres', '&tab=library&section=genres'),
    ('No folders', '&tab=library&lib=nofolders'),
]
N400 = [
    ('Now Playing, cover', '&view=cover'),
    ('Albums', '&tab=library&section=albums'),
    ('Album, two discs', '&tab=library&album=al12&art=violet'),
    ('Artist', '&tab=library&artist=ar01'),
]
N400B = [
    ('Search', '&q=lu'),
    ('Genre', '&tab=library&genre=Jazz'),
    ('Scanning', '&tab=library&lib=scanning'),
    ('Track menu', '&tab=library&album=al06&art=violet&menu=2'),
]
N400C = [
    ('Nothing found', '&tab=library&lib=empty'),
    ('Folder missing', '&tab=library&lib=missing'),
    ('10 340 tracks', '&tab=library&section=tracks&lib=many'),
    ('AIMP closed', '&scene=closed'),
]
WIDE = [
    ('wide-albums', 'Albums beside Now Playing', '&tab=library&section=albums&lyrics=synced'),
    ('wide-album', 'Album page', '&tab=library&album=al04&art=tide&lyrics=plain'),
    ('wide-search', 'Search', '&q=lumen&lyrics=synced'),
    ('wide-artist', 'Artist page', '&tab=library&artist=ar05&view=cover'),
]


def sheet(frames, w, h, theme):
    """A row of panels, each labelled, on a neutral backdrop; returns (width, height, html)."""
    gap, pad, label = 28, 24, 30
    width = pad * 2 + len(frames) * w + (len(frames) - 1) * gap
    height = pad * 2 + h + label
    bg = '#3a3a40' if theme == 'dark' else '#c9c9d1'
    fg = '#f2f2f5' if theme == 'dark' else '#1c1c22'
    cells = ''.join(f'<div><div class="cap">{name}</div><iframe src="panel.html?theme={theme}{extra}" width="{w}" height="{h}"></iframe></div>'
                    for name, extra in frames)
    css = (f'html, body {{ margin: 0; background: {bg}; font: 600 13px "Segoe UI", system-ui, sans-serif; color: {fg}; }}'
           f' .row {{ display: flex; gap: {gap}px; padding: {pad}px; }} .cap {{ height: {label}px; }}'
           ' iframe { display: block; border: 0; border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }')
    return width, height, f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body><div class="row">{cells}</div></body></html>'


def review(chrome, work, out):
    out.mkdir(parents=True, exist_ok=True)
    jobs = []
    for theme in ('dark', 'light'):
        jobs += [(f'{theme}-240a', N240, 240, 603, 2, theme), (f'{theme}-240b', N240B, 240, 603, 2, theme),
                 (f'{theme}-400a', N400, 400, 800, 1, theme), (f'{theme}-400b', N400B, 400, 800, 1, theme),
                 (f'{theme}-400c', N400C, 400, 800, 1, theme)]
        jobs += [(f'{theme}-{name}', [(label, extra)], 1100, 800, 1, theme) for name, label, extra in WIDE]
    for name, frames, w, h, dpr, theme in jobs:
        width, height, html = sheet(frames, w, h, theme)
        for attempt in range(3):
            try:
                img = render(chrome, work, name, width, height, dpr, html)
                break
            except (OSError, subprocess.SubprocessError):
                if attempt == 2:
                    raise
        path = out / f'{name}.png'
        img.convert('RGB').save(path, optimize=True)
        print(f'{path}  {img.width}x{img.height}')


def main():
    parser = argparse.ArgumentParser(description='Render B-Side\'s plugin-page images, or review sheets of the panel.')
    parser.add_argument('--out', type=Path, default=DOCS, help='where the plugin-page images go (default: docs/)')
    parser.add_argument('--review', type=Path, help='render review sheets of every view to this folder instead')
    args = parser.parse_args()
    chrome = browser()
    work = ROOT / 'scratch' / f'tmp-assets-{secrets.token_hex(4)}'
    work.mkdir(parents=True)
    try:
        # The whole panel (scripts, styles, flags) beside the page, as Orca serves it.
        shutil.copytree(ROOT / 'panel', work, dirs_exist_ok=True)
        art = {name: data_url(cover_art(name)) for name in PALETTES}
        states = {f'{s}:{a}': scene_state(s, a) for s in ('playing', 'idle', 'closed', 'offline') for a in PALETTES}
        lyr = {f'{kind}:{a}': lyrics(TRACKS[a]['positionMs'], kind == 'synced') for kind in ('synced', 'plain') for a in PALETTES}
        library, images = build_library()
        data = {'art': art, 'states': states, 'lyrics': lyr, 'artist': data_url(artist_portrait()), 'themes': THEMES, 'library': library, 'images': images}
        mock = MOCK.replace('__DATA__', json.dumps(data))
        html = (ROOT / 'panel' / 'index.html').read_text(encoding='utf-8')
        (work / 'panel.html').write_text(html.replace('<body>', '<body>\n' + mock, 1), encoding='utf-8')
        if args.review:
            return review(chrome, work, args.review.resolve())
        args.out.mkdir(parents=True, exist_ok=True)
        for name, (w, h, dpr, body) in PAGES.items():
            img = render(chrome, work, name, w, h, dpr, body)
            expected = (round(w * dpr), round(h * dpr))
            if img.size != expected:
                sys.exit(f'{name}: the browser drew {img.size}, expected {expected}')
            if name != 'icon':
                img = img.convert('RGB')
            path = save(img, name, args.out)
            print(f'{path}  {img.width}x{img.height}  {path.stat().st_size // 1024} KB')
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
