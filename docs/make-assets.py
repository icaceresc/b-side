"""Regenerates B-Side's plugin-page and README images: docs/icon.png, docs/cover.png,
docs/shot-*.webp (the manifest's screenshots and the README's tour); the animated docs/hero.webp
and docs/tour-skins.webp come from docs/make-media.py.

The screenshots are the real panel (panel/index.html) rendered by headless Chrome or Edge at
2x, with a stand-in for Orca's `orca` object that answers with a synthetic demo track, a
synthetic library (13 artists, 21 albums, about 200 tracks, lyrics) and cover art drawn here.
Nothing comes from AIMP, a real album or anyone's library. Rerun it whenever the panel changes:

    python docs/make-assets.py               (Python 3 with Pillow, and Chrome or Edge installed)
    python docs/make-assets.py --only NAMES  only some of them, e.g. --only cover,shot-album
    python docs/make-assets.py --out DIR     the same images, written to DIR instead of docs/
    python docs/make-assets.py --review DIR  the panel's views at 240x603, 400x800 and 1100x800,
                                             dark and light, as PNG sheets in DIR, to look at
    python docs/make-assets.py --review DIR --skin vinyl   the same in a skin (cd, vinyl, cassette)

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
import time
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'
ACCENT = '#ff6a3d'

# Orca's limits for plugin-page images (references/manifest.md).
LIMITS = {'icon': 256 * 1024, 'cover': 1024 * 1024, 'shot': 1536 * 1024, 'hero': 1024 * 1024}


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
    ('ar13', 'Ríos de Ámbar', ('#3b1d12', '#b5651d', '#f1c9a5', '#22120b')),
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
    ('al21', 'ar13', 'Río Lento', 2022, 'Folk', ('waves', ('#2a120a', '#c8733a', '#e9a56b', '#fbe3c4')), 'hires', 8, 1, False),
]
# The demo tracks of the docs scenes, placed in their albums.
KNOWN_TITLES = {('al01', 3): 'Golden Hour Static', ('al04', 2): 'Low Tide Signals', ('al06', 5): 'Violet Weather'}
# Accented names, so search shows that "rio" finds "Río".
KNOWN_TITLES.update({('al21', n): t for n, t in enumerate(['Orilla del Río', 'Ríos Paralelos', 'Agua Clara', 'Luz de Ámbar',
                                                          'Mañana Lenta', 'Corriente', 'Remanso', 'Río Abajo'], 1)})
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

# The demo tracks, with the values AIMP reports for the files docs/demo/make-demo.py writes (its
# FLACs are original synthetic music: these sample rates, depths, bitrates and lengths are real).
def _track(title, artist, album, year, rate, bits, kbps, position, duration, track_id, album_id):
    return dict(title=title, artist=artist, album=album, year=year,
                quality=dict(cd=rate == 44100 and bits == 16, lossless=True, codec='FLAC', sampleRate=rate,
                             sampleRateLabel=f'{rate / 1000:g} kHz', bits=bits, bitrate=kbps, channels=2),
                positionMs=position, durationMs=duration, trackId=track_id, albumId=album_id)


TRACKS = {
    'sunset': _track('Golden Hour Static', 'Sunset Arcade', 'Afterglow', '2024', 44100, 16, 593, 52000, 150000, 'al01-t03', 'al01'),
    'tide': _track('Low Tide Signals', 'Harbor Lights', 'Blue Hour', '2023', 96000, 24, 842, 64000, 128000, 'al04-t02', 'al04'),
    'violet': _track('Violet Weather', 'Paper Planets', 'Night Bloom', '2025', 44100, 16, 597, 70000, 120000, 'al06-t05', 'al06'),
    'midnight': _track('Midnight Harbours', 'The Quiet Hours', 'After Midnight', '2018', 44100, 16, 507, 48000, 116000, 'al12-t01', 'al12'),
    'parallax': _track('Parallax', 'Lumen Drift', 'Parallax', '2024', 44100, 16, 588, 46000, 112000, 'al09-t01', 'al09'),
    'rio': _track('Orilla del Río', 'Ríos de Ámbar', 'Río Lento', '2022', 96000, 24, 891, 44000, 104000, 'al21-t01', 'al21'),
}
# Original lyrics of the demo tracks (also written as .lrc by docs/demo/make-demo.py).
DEMO_LYRICS = {
    'Golden Hour Static': LYRICS_LINES,
    'Low Tide Signals': ['Salt on the radio', 'A slow blue hum', 'The harbour lights are counting', 'Every boat that comes', 'Low tide, low tide', 'Signals in the sand', 'Hold the lantern steady', 'Hold it in your hand'],
    'Violet Weather': ['Paper planes at midnight', 'Folded out of rain', 'Violet on the windows', 'Writing out your name', 'Every cloud a letter', 'Every street a song', 'Violet weather', 'Carry us along'],
    'Midnight Harbours': ['The last tram is leaving', 'The piano stays', 'Brushes on the snare drum', 'Sweep the night away', 'Midnight in the harbour', 'Coffee going cold', 'One more chorus, darling', 'Before the night is old'],
    'Orilla del Río': ['Bajo la luz de ámbar', 'el río sigue lento', 'guarda en su orilla', 'las voces del viento', 'Agua clara, agua mansa', 'llévate esta canción', 'que la tarde se descansa', 'en tu corazón'],
    'Parallax': ['Colours on the ceiling', 'Shifting when we move', 'Every angle different', 'Every angle true', 'Parallax, parallax', 'Light from every side', 'Step a little closer', 'Watch the colours slide'],
}


def lrc_times(count, seconds, start=8.0):
    """When each lyric line starts, as the demo .lrc files time them."""
    gap = (seconds - start - 10) / max(1, count)
    return [start + i * gap for i in range(count)]


def track_lyrics(key, synced):
    t = TRACKS[key]
    lines = DEMO_LYRICS.get(t['title'], LYRICS_LINES)
    times = lrc_times(len(lines), t['durationMs'] / 1000)
    return {'source': 'lrc' if synced else 'tags', 'synced': synced,
            'lines': [{'ms': round(ms * 1000) if synced else None, 'text': line} for ms, line in zip(times, lines)]}


def cover_of(key):
    """The cover of a demo track's album, as the library (and the demo FLAC folders) have it."""
    spec = next(x for x in LIB_ALBUMS if x[0] == TRACKS[key]['albumId'])[5]
    return cover_art(spec[1]) if spec[0] == 'art' else drawn_cover(spec[0], spec[1], TRACKS[key]['albumId'])


def scene_state(scene, art):
    """What `player.state` would answer for each scene, in the worker's own shape."""
    if scene == 'closed':
        return {'running': False}
    base = {'running': True, 'state': 'playing', 'volume': 72, 'mute': False, 'shuffle': False, 'repeat': True, 'online': True}
    if scene == 'idle':
        return {**base, 'state': 'stopped', 'positionMs': 0, 'durationMs': 0, 'track': None}
    t = TRACKS[art]
    track = {k: t[k] for k in ('title', 'artist', 'album', 'year', 'quality', 'trackId', 'albumId')}
    track.update(key='demo|' + art, cloud=scene == 'offline', number=1)
    state = {**base, 'positionMs': t['positionMs'], 'durationMs': t['durationMs'], 'track': track}
    if scene == 'offline':
        state.update(state='paused', online=False)
    return state


# Folders library.suggestFolders might find on a PC (invented): OneDrive's music folder, its big
# subfolders and the empty Windows Music folder.
SUGGESTED_FOLDERS = [
    {'path': r'C:\Users\you\OneDrive\Music', 'name': 'Music', 'tracks': 1188},
    {'path': r'C:\Users\you\OneDrive\Music\Lossless Library', 'name': 'Lossless Library', 'parent': 'Music', 'tracks': 412},
    {'path': r'C:\Users\you\OneDrive\Music\Vinyl Transfers', 'name': 'Vinyl Transfers', 'parent': 'Music', 'tracks': 286},
    {'path': r'C:\Users\you\OneDrive\Music\Live Sets', 'name': 'Live Sets', 'parent': 'Music', 'tracks': 174},
    {'path': r'C:\Users\you\OneDrive\Music\Field Notes', 'name': 'Field Notes', 'parent': 'Music', 'tracks': 63},
    {'path': r'C:\Users\you\Music', 'name': 'Music', 'tracks': 0},
]

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
MOCK = """<style id="still">*, *::before, *::after { transition: none !important; animation: none !important; }</style>
<script>
(() => {
  const q = new URLSearchParams(location.search)
  // t=<seconds>: one frame of an animation. Animations are paused where they would be after t
  // seconds, playback has advanced pt (default t) seconds, and the clock stands still.
  if (q.has('t')) {
    const t = Number(q.get('t')) || 0
    document.getElementById('still').textContent = '*, *::before, *::after { transition: none !important; animation-play-state: paused !important; animation-delay: -' + t + 's !important; }'
    performance.now = () => 0
  }
  const scene = q.get('scene') || 'playing', art = q.get('art') || 'sunset'
  const data = __DATA__
  const state = data.states[scene + ':' + art]
  // Lyrics and the artist picture exist only for files on the PC, so those scenes are local tracks.
  const inLibrary = ['lib', 'tab', 'section', 'album', 'artist', 'genre', 'q'].some((k) => q.has(k))
  if (state.track && (q.get('lyrics') || q.get('avatar') || inLibrary)) state.track.cloud = false
  if (state.track && q.get('paused')) state.state = 'paused'
  if (state.track && q.get('cloud')) state.track.cloud = true
  if (state.track && q.has('t')) state.positionMs += Math.round((Number(q.get('pt') ?? q.get('t')) || 0) * 1000)
  // size=<0..3>: the lyrics size, as the panel keeps it.
  try {
    if (q.get('size')) localStorage.setItem('bside.lyricsSize', q.get('size'))
    else localStorage.removeItem('bside.lyricsSize')
  } catch {}
  // The skin: the panel reads it from localStorage at start, then from the plugin's storage.
  try {
    if (q.get('skin')) localStorage.setItem('bside.skin', q.get('skin'))
    else localStorage.removeItem('bside.skin')
  } catch {}
  // Lyrics show by default when a track has them; `view` picks lyrics or the cover.
  try {
    if (q.get('view')) sessionStorage.setItem('bside.lyrics', q.get('view') === 'lyrics' ? '1' : '0')
    else sessionStorage.removeItem('bside.lyrics')
  } catch {}
  // logo=1: only the logo in the header (the enlarged logos of shot-decks).
  if (q.get('logo')) document.head.insertAdjacentHTML('beforeend', '<style>.brand .word, .top .right { visibility: hidden; } .top { box-shadow: none !important; }</style>')
  const theme = q.get('theme')
  if (theme) {
    document.documentElement.className = theme
    for (const [k, v] of Object.entries(data.themes[theme])) document.documentElement.style.setProperty(k, v)
  }

  const L = data.library
  const lib = q.get('lib') || 'ready'
  let status = {
    ready: { state: 'ready', folders: ['Lossless Library'], counts: L.counts, scannedAt: 1 },
    many: { state: 'ready', folders: ['Lossless Library'], counts: L.counts, scannedAt: 1 },
    missing: { state: 'ready', folders: ['Lossless Library', 'Old Rips'], counts: L.counts, scannedAt: 1, missingFolders: ['Old Rips'] },
    empty: { state: 'empty', folders: ['Music'], counts: { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 } },
    nofolders: { state: 'empty', folders: [], counts: { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 } },
    scanning: { state: 'scanning', folders: ['Lossless Library'], counts: { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 }, progress: { phase: 'reading', done: 1312, total: 4210 } },
    listing: { state: 'scanning', folders: ['Lossless Library'], counts: { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 }, progress: { phase: 'listing', done: 2876, total: 2876 } },
    error: { state: 'error', folders: ['Lossless Library'], counts: { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 }, error: 'The helper could not list the folders' }
  }[lib]
  // About 10 000 tracks for the virtual list: the library's own, many times over.
  const listed = lib === 'many' ? Array.from({ length: 55 }, (_, k) => L.listed.map((t) => ({ ...t, id: t.id + '~' + k }))).flat() : L.listed
  const fold = (s) => String(s ?? '').normalize('NFKD').replace(/\\p{M}/gu, '').toLowerCase()
  const words = (s) => fold(s).split(/[^\\p{L}\\p{N}]+/u).filter(Boolean)
  const matches = (text, qw) => {
    const w = words(text)
    return qw.every((x) => w.some((y) => y.startsWith(x)))
  }
  const notFound = (what) => ({ error: { code: 'not_found', message: 'Unknown ' + what } })
  // Folder suggestions, as the worker finds them: invented paths in a user folder.
  const firstRun = lib === 'empty' || lib === 'nofolders'
  const suggested = data.folders.map((f) => ({ ...f, current: firstRun ? f.path === data.folders[data.folders.length - 1].path : f.name === 'Lossless Library' }))
  let polls = 0
  const library = {
    'library.status': () => {
      // After library.setFolders: a scan, then the library.
      if (status.state === 'scanning' && status.mock && ++polls > (Number(q.get('scanpolls')) || 4)) status = { state: 'ready', folders: status.folders, counts: L.counts, scannedAt: 2 }
      if (status.state === 'scanning' && status.mock) status.progress = { phase: 'reading', done: Math.min(polls * 90, 412), total: 412 }
      return status
    },
    'library.suggestFolders': () => {
      if (q.get('suggest') === 'fail') return { error: { code: 'helper_failed', message: 'The helper did not start' } }
      if (q.get('suggest') === 'slow') return new Promise(() => {})
      return { folders: q.get('suggest') === 'none' ? [] : suggested }
    },
    'library.setFolders': ({ folders }) => {
      const BS = String.fromCharCode(92)
      if (!Array.isArray(folders) || !folders.length) return { error: { code: 'invalid', message: 'folders needs a list of folder paths' } }
      for (const f of folders) {
        if (!/^[a-z]:/i.test(f) && !f.startsWith(BS + BS)) return { error: { code: 'invalid', message: 'Each folder must be a full path such as C:' + BS + 'Music' } }
        if (!f.toLowerCase().startsWith(['c:', 'users', 'you', ''].join(BS))) return { error: { code: 'not_found', message: 'Not a folder: ' + f } }
      }
      if (q.get('setfail') === 'settings') return { error: { code: 'unavailable', message: 'Orca did not give B-Side its settings' } }
      const names = folders.map((f) => f.split(BS).pop())
      // As the worker does: a rescan keeps answering from the last index until it ends.
      const before = status
      status = { state: 'scanning', mock: true, folders: names, counts: before.scannedAt ? before.counts : { artists: 0, albums: 0, tracks: 0, cloudOnly: 0 }, progress: { phase: 'listing', done: 0, total: 0 } }
      if (before.scannedAt) status.scannedAt = before.scannedAt
      polls = 0
      return { folders: names, started: true }
    },
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
    storage: { get: async (key) => (key === 'skin' ? q.get('skin') : null), set: async () => {} },
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
        if (library[name]) {
          const out = library[name](input || {})
          return out instanceof Promise ? out : JSON.parse(JSON.stringify(out))
        }
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
    if (q.get('folders')) A.openFolders()
    // The folder picker: tick cards (pick=0,2), paste a path, press "Use these folders".
    if (q.get('pick') || q.get('paste') || q.get('use'))
      setTimeout(() => {
        const picker = [...document.querySelectorAll('.picker')].find((el) => el.offsetParent)
        if (!picker) return
        for (const i of (q.get('pick') || '').split(',').filter(Boolean)) picker.querySelectorAll('.pk-card[data-key]')[Number(i)]?.click()
        if (q.get('paste')) {
          picker.querySelector('.pk-input').value = q.get('paste')
          picker.querySelector('[data-add]').click()
        }
        if (q.get('use')) picker.querySelector('[data-use]').click()
      }, 500)
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
  background:
    radial-gradient(760px 560px at var(--gx, 78%) var(--gy, 46%), var(--glow, rgba(255, 106, 61, 0.2)), transparent 70%),
    radial-gradient(640px 520px at var(--hx, 8%) 105%, var(--glow2, rgba(122, 76, 255, 0.14)), transparent 70%),
    linear-gradient(135deg, #17121f 0%, #0e0c13 55%, #09090b 100%);
  -webkit-font-smoothing: antialiased; }
.frame { border-radius: 18px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 40px 90px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.4); background: #0f0f12; }
.frame iframe, .frame img { display: block; border: 0; }
.vinyl { border-radius: 50%; flex: none;
  background: radial-gradient(circle closest-side, var(--a, #ff6a3d) 0 18%, #0d0d10 19% 28%, #26262c 29% 32%, #0d0d10 33% 60%, #26262c 61% 63%, #0d0d10 64% 92%, #26262c 93% 96%, #0d0d10 97%);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 0 40px rgba(255, 106, 61, 0.25); }
.brand { display: flex; align-items: center; gap: 12px; font-weight: 800; letter-spacing: 0.2em; font-size: 15px; }
.brand b { color: #ff6a3d; }
h1 { font-size: 44px; line-height: 1.08; letter-spacing: -0.025em; margin: 22px 0 16px; font-weight: 700; }
h1 em { font-style: normal; color: #ff8a5c; }
p.lead { font-size: 18px; line-height: 1.5; color: #b7b3c2; margin: 0; }
ul { margin: 26px 0 0; padding: 0; list-style: none; display: grid; gap: 13px; }
li { font-size: 16px; line-height: 1.35; color: #d9d6e0; position: relative; padding-left: 20px; }
li::before { content: ''; position: absolute; left: 0; top: 0.5em; width: 8px; height: 8px; border-radius: 50%; background: #ff6a3d; }
kbd { font: 600 13px "Segoe UI", system-ui, sans-serif; padding: 2px 7px; border-radius: 6px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.14); color: #f2f0f5; }
.label { text-align: center; margin-top: 16px; font-size: 15px; font-weight: 600; color: #cfcbd8; }
.label span { display: block; font-weight: 400; font-size: 13px; color: #8f8a9c; margin-top: 2px; }
.split { display: flex; align-items: center; justify-content: space-between; height: 100%; padding: 0 62px 0 84px; gap: 36px; }
.split .text { max-width: 372px; flex: none; }
.duo { display: flex; gap: 26px; align-items: flex-start; flex: none; }
.duo .cap { margin-top: 12px; font-size: 13px; font-weight: 600; color: #a8a3b6; text-align: center; }
.head { text-align: center; padding-top: 34px; }
.head .brand { justify-content: center; }
.head h1 { font-size: 30px; margin: 14px 0 0; }
.head p.lead { font-size: 16px; margin-top: 8px; }
.row { display: flex; justify-content: center; gap: 44px; margin-top: 26px; }
"""


def panel(scene='playing', art='sunset', lang='en', w=400, h=720, scale=1.0, extra='', theme='dark'):
    """The real panel in a frame, `scale` applied as a transform so it stays vector-sharp. It is
    drawn with Orca's dark theme variables, as a frame in Orca gets them."""
    src = f'panel.html?scene={scene}&art={art}&lang={lang}&theme={theme}{extra}'
    return (f'<div style="width:{w * scale}px;height:{h * scale}px;flex:none"><div class="frame" '
            f'style="width:{w}px;height:{h}px;transform:scale({scale});transform-origin:0 0">'
            f'<iframe src="{src}" width="{w}" height="{h}"></iframe></div></div>')


def captioned(html, caption):
    return f'<div>{html}<div class="cap">{caption}</div></div>'


def brand(size=26):
    return f'<div class="brand"><span class="vinyl" style="width:{size}px;height:{size}px"></span><span>B<b>-SIDE</b></span></div>'


def page(body, extra=''):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{STYLE}{extra}</style></head><body>{body}</body></html>'


def split(text, right, extra=''):
    """A store shot: the words on the left, panels on the right."""
    return page(f'<div class="split"><div class="text">{brand()}{text}</div>{right}</div>', extra)


def triptych(title, lead, frames, extra=''):
    """A store shot with a headline over three labelled panels."""
    return page('<div class="head">' + brand(22) + f'<h1>{title}</h1><p class="lead">{lead}</p></div><div class="row">'
                + ''.join(f'<div>{panel(h=700, scale=0.8, **kw)}<div class="label">{a}<span>{b}</span></div></div>' for kw, a, b in frames)
                + '</div>', 'body { --gx: 50%; --gy: 60%; }' + extra)


# Two phones, one over the other: the cover and the README hero.
def stacked(back, front, scale, dx, dy):
    w, h = 380, 720
    return (f'<div style="position:relative;width:{w * scale + dx}px;height:{h * scale + dy}px;flex:none">'
            f'<div style="position:absolute;left:0;top:0;opacity:0.96">{panel(w=w, h=h, scale=scale, extra=back)}</div>'
            f'<div style="position:absolute;left:{dx}px;top:{dy}px">{panel(w=w, h=h, scale=scale, extra=front)}</div></div>')


LIBRARY = '&tab=library&section=albums'
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
        '<div class="logo"><span class="vinyl" style="width:72px;height:72px"></span><div class="word">B<b>-SIDE</b></div></div>'
        '<h1>Your music library,<br><em>inside Orca.</em></h1>'
        '<p class="lead">Browse, search and play your own collection<br>from the sidebar. AIMP is the engine.</p></div>'
        + stacked(LIBRARY + '&lyrics=synced', '&lyrics=synced', 0.68, 196, 48) + '</div>',
        'body { --gx: 74%; --gy: 52%; } .wrap { display: flex; align-items: center; justify-content: space-between; height: 100%; padding: 0 70px 0 72px; }'
        ' .logo { display: flex; align-items: center; gap: 20px; } .word { font-size: 56px; font-weight: 800; letter-spacing: 0.01em; }'
        ' .word b { color: #ff6a3d; } h1 { font-size: 40px; margin: 30px 0 16px; } p.lead { font-size: 17px; }')),
    'shot-library': (1280, 800, 2, page(
        '<div class="head">' + brand(22) + '<h1>Browse your whole collection, right in Orca.</h1>'
        '<p class="lead">Artists, albums, tracks and genres from your own folders, beside what is playing.</p></div>'
        '<div class="row" style="margin-top:28px">' + panel(w=1120, h=600, extra=LIBRARY + '&lyrics=synced') + '</div>',
        'body { --gx: 50%; --gy: 70%; }')),
    'shot-album': (1280, 800, 2, split(
        '<h1>Every album in<br><em>its own colours.</em></h1>'
        '<p class="lead">Album and artist pages take their palette from the cover.</p>'
        '<ul><li>The real format: Hi-Res, CD quality, codec, bit depth</li><li>Play, play next or add to the queue</li>'
        '<li>Lyrics and cloud-only marks on every track</li><li>The playing track, marked as it plays</li></ul>',
        '<div class="duo">' + captioned(panel(w=400, h=740, scale=0.86, extra='&tab=library&album=al02'), 'An album')
        + captioned(panel(w=400, h=740, scale=0.86, extra='&tab=library&artist=ar01'), 'Its artist') + '</div>',
        'body { --gx: 70%; --gy: 40%; --glow: rgba(167, 64, 255, 0.2); }')),
    'shot-search': (1280, 800, 2, split(
        '<h1>Find anything<br><em>as you type.</em></h1>'
        '<p class="lead">Accents and case do not matter: type <b>rio</b>, find <b>Río</b>.</p>'
        '<ul><li>Artists, albums and tracks, best matches first</li><li><kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> from anywhere in the panel</li>'
        '<li><kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> to open or play</li></ul>',
        '<div class="duo">' + captioned(panel(w=400, h=740, scale=0.86, extra='&q=rio'), 'Search')
        + captioned(panel(w=400, h=740, scale=0.86, extra='&tab=library&album=al21'), 'An album from the results') + '</div>',
        'body { --gx: 72%; --gy: 44%; --glow: rgba(214, 120, 54, 0.2); }')),
    'shot-playing': (1280, 800, 2, split(
        '<h1>Now Playing,<br><em>lyrics in view.</em></h1>'
        '<p class="lead">Synced lyrics light up line by line while AIMP plays.</p>'
        '<ul><li>Cover, title, artist and album, with the real format</li><li>Play, pause, seek, volume, shuffle and repeat</li>'
        '<li>Colours taken from the cover</li><li>A mini-player wherever you browse</li></ul>',
        '<div class="duo">' + captioned(panel(w=400, h=740, scale=0.86, extra='&lyrics=synced&avatar=1'), 'Now Playing')
        + captioned(panel(w=400, h=740, scale=0.86, extra='&tab=library&section=artists&lyrics=synced'), 'The mini-player, while you browse') + '</div>')),
    'shot-states': (1280, 800, 2, triptych(
        'Always clear about what AIMP is doing.', 'B-Side controls AIMP; it says so when AIMP is closed or the network is gone.',
        [(dict(scene='idle'), 'Waiting', 'AIMP is open, nothing playing'),
         (dict(scene='closed'), 'AIMP closed', 'One button opens it'),
         (dict(scene='offline'), 'Offline', 'Streaming needs internet')])),
    'shot-lyrics': (1280, 800, 2, triptych(
        'Lyrics that follow the song.', 'From the tags or a .lrc file beside the track, for files on your PC.',
        [(dict(art='sunset', extra='&lyrics=synced&avatar=1'), 'Synced lyrics', 'The current line lights up'),
         (dict(art='violet', extra='&lyrics=plain&avatar=1'), 'Plain lyrics', 'From the tags or a .lrc file'),
         (dict(art='tide', extra='&avatar=1&noart=1&view=cover'), 'Artist image', 'artist.jpg when a track has no cover')])),
}
# The skins: the same panel in CD, Vinyl and Cassette.
PAGES['shot-skins'] = (1280, 800, 2, triptych(
    'Three skins. Press the logo.', 'The whole panel changes: type, colours, controls and the logo, in light and dark.',
    [(dict(art='sunset', extra='&skin=cd&view=cover'), 'CD', 'Modern, in the colours of the cover'),
     (dict(art='violet', extra='&skin=vinyl&lyrics=synced'), 'Vinyl', 'Brass, serif type, a record on the platter'),
     (dict(art='tide', extra='&skin=cassette&lyrics=synced'), 'Cassette', '8-bit, neon, the tape turning')],
    'body { --glow: rgba(214, 160, 84, 0.16); --glow2: rgba(255, 98, 212, 0.14); }'))


def deck(skin, paused, scale=5, theme='dark'):
    """The real panel's logo, enlarged: the top-left corner of the panel in a window."""
    w, h = 64, 54
    x = {'cd': 0, 'vinyl': 6, 'cassette': 11}[skin]  # the deck in the middle of the window
    src = f'panel.html?scene=playing&art=sunset&lang=en&theme={theme}&skin={skin}&logo=1' + ('&paused=1' if paused else '')
    return (f'<div class="deckbox" style="width:{w * scale}px;height:{h * scale}px">'
            f'<iframe data-clip="{x},0" src="{src}" width="{w}" height="{h}" style="width:{w * scale}px;height:{h * scale}px"></iframe></div>')


PAGES['shot-decks'] = (1280, 800, 2, page(
    '<div class="head">' + brand(22) + '<h1>A logo that plays along.</h1>'
    '<p class="lead">Press play: the disc turns, the tonearm lowers onto the record, the reels run. Pause, and they stop.</p></div>'
    '<div class="decks">'
    + ''.join(f'<div class="col"><div class="name">{name}</div>'
              f'{deck(skin, True)}<div class="state">Paused</div>{deck(skin, False)}<div class="state on">Playing</div></div>'
              for skin, name in (('cd', 'CD'), ('vinyl', 'Vinyl'), ('cassette', 'Cassette')))
    + '</div>',
    'body { --gx: 50%; --gy: 64%; } .decks { display: flex; justify-content: center; gap: 46px; margin-top: 22px; }'
    ' .col { display: flex; flex-direction: column; align-items: center; } .name { font-size: 17px; font-weight: 700; margin-bottom: 10px; }'
    ' .deckbox { position: relative; overflow: hidden; border-radius: 16px; box-shadow: 0 24px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1); }'
    ' .deckbox .frame { border: 0; border-radius: 0; box-shadow: none; }'
    ' .state { font-size: 13px; color: #a8a3b6; margin: 8px 0 14px; } .state.on { color: #ffb08f; }'))

# --- 2.3 tour of the README -----------------------------------------------------------------------

def row(frames, h=700, scale=0.78, gap=34):
    """Panels side by side, each with a label and a sub-label under it."""
    return (f'<div class="row" style="gap:{gap}px">' + ''.join(
        f'<div>{panel(h=h, scale=scale, **kw)}<div class="label">{a}<span>{b}</span></div></div>' for kw, a, b in frames) + '</div>')


PAGES['shot-lyrics-size'] = (1280, 800, 2, page(
    '<div class="head">' + brand(22) + '<h1>Lyrics, at the size you read best.</h1>'
    '<p class="lead">A− and A+ in the corner of the lyrics, in every skin. The current line stays in view.</p></div>'
    + row([(dict(art='midnight', extra='&skin=vinyl&lyrics=synced&size=0'), 'Vinyl', 'Smaller'),
           (dict(art='sunset', extra='&skin=cd&lyrics=synced&size=1'), 'CD', 'The skin\'s own size'),
           (dict(art='violet', extra='&skin=cassette&lyrics=synced&size=3'), 'Cassette', 'Largest')]),
    'body { --gx: 50%; --gy: 64%; } .row { margin-top: 24px; }'))

PAGES['shot-palette'] = (1280, 800, 2, page(
    '<div class="head">' + brand(22) + '<h1>CD takes its colours from every cover.</h1>'
    '<p class="lead">On a neutral black, the playing cover tints everything, from the tab bar to the mini-player.</p></div>'
    + row([(dict(art='sunset', w=380, extra='&skin=cd&view=cover'), 'FLAC | 16 bits | 44.1 kHz', 'Golden Hour Static'),
           (dict(art='tide', w=380, extra='&skin=cd&view=cover'), 'FLAC | 24 bits | 96 kHz', 'Low Tide Signals'),
           (dict(art='parallax', w=380, extra='&skin=cd&view=cover'), 'FLAC | 16 bits | 44.1 kHz', 'Parallax')], scale=0.8, gap=30),
    'body { --gx: 50%; --gy: 64%; --glow: rgba(255, 140, 90, 0.16); } .row { margin-top: 22px; }'))

PAGES['shot-modes'] = (1280, 800, 2, split(
    '<h1>Your files first.<br><em>The cloud, in beta.</em></h1>'
    '<p class="lead">B-Side is made for the music on your PC: your folders, your tags, your lyrics.</p>'
    '<ul><li><b>Personal:</b> a local library, lossless, with lyrics and covers</li>'
    '<li><b>Work:</b> streaming from OneDrive with AIMP\'s My Clouds, <b>beta, in testing</b></li>'
    '<li>B-Side only reads your folders; it never writes to them</li></ul>',
    '<div class="duo">' + captioned(panel(w=400, h=740, scale=0.86, extra='&tab=library&section=albums&skin=cd'), 'A library on your PC')
    + captioned(panel(w=400, h=740, scale=0.86, art='tide', extra='&skin=cd&cloud=1&view=cover'), 'A stream, marked Cloud (beta)') + '</div>',
    'body { --gx: 70%; --gy: 46%; }'))

PAGES['shot-install'] = (1280, 640, 2, page(
    '<div class="wrap"><div class="text">' + brand(26) +
    '<h1>Install it from Orca.</h1>'
    '<p class="lead">In a terminal where Orca\'s command line works:</p>'
    '<div class="term"><span class="p">&gt;</span> orca plugin install icaceresc/b-side</div>'
    '<p class="lead small">Orca shows what B-Side may do and asks you once. Updates: <code>orca plugin update icaceresc.b-side</code>.</p>'
    '<p class="lead small">On a new PC, <code>install.ps1</code> does it all in one step: AIMP (free, Microsoft Store), its settings and the plugin.</p>'
    '<p class="lead small">Then choose your music folders in the panel.</p></div></div>',
    '.wrap { display: flex; align-items: center; height: 100%; padding: 0 110px; } .text { max-width: 980px; }'
    ' h1 { font-size: 46px; } .term { margin: 22px 0 26px; padding: 22px 26px; border-radius: 14px; background: #0b0a10;'
    ' border: 1px solid rgba(255,255,255,0.12); font: 500 26px Consolas, "Cascadia Mono", monospace; color: #f2f0f5; }'
    ' .term .p { color: #ff8a5c; margin-right: 12px; } p.lead.small { font-size: 16px; margin-top: 10px; }'
    ' code { font: 15px Consolas, monospace; padding: 2px 7px; border-radius: 6px; background: rgba(255,255,255,0.08); }'))


def bars(label, unit, native, ps, worse_is_more=True):
    top = max(native, ps)
    pct = lambda v: max(2.5, v / top * 100)
    return (f'<div class="metric"><div class="mlabel">{label}</div>'
            f'<div class="bar"><i class="n" style="width:{pct(native)}%"></i><b>{native} {unit}</b><span>native helper (Rust)</span></div>'
            f'<div class="bar"><i class="p" style="width:{pct(ps)}%"></i><b>{ps} {unit}</b><span>PowerShell helper (before 2.2)</span></div></div>')


PAGES['shot-helper'] = (1280, 640, 2, page(
    '<div class="wrap">' + brand(24) + '<h1>Light enough to forget it is there.</h1>'
    '<p class="lead">Since 2.2, a small native helper written in Rust talks to AIMP. Measured on one PC:</p>'
    + bars('Memory', 'MB', 9, 97) + bars('First answer', 'ms', 20, 1100) + bars('CPU in ten minutes of use', 's', 0.16, 2.8)
    + '<p class="note">PowerShell: about 90 MB plus the console host beside it (7 MB). Built and tested by GitHub Actions, with a signed build provenance attestation.</p></div>',
    '.wrap { padding: 46px 90px; } h1 { font-size: 38px; margin: 18px 0 8px; } .metric { margin-top: 26px; }'
    ' .mlabel { font-size: 15px; font-weight: 700; color: #cfcbd8; margin-bottom: 8px; }'
    ' .bar { position: relative; height: 30px; margin: 6px 0; display: flex; align-items: center; gap: 12px; }'
    ' .bar i { display: block; height: 22px; border-radius: 6px; flex: none; max-width: 70%; }'
    ' .bar i.n { background: linear-gradient(90deg, #ff6a3d, #ffb36b); } .bar i.p { background: #4a4556; }'
    ' .bar b { font-size: 15px; } .bar span { font-size: 13.5px; color: #a8a3b6; }'
    ' .note { margin-top: 26px; font-size: 13.5px; color: #8f8a9c; max-width: 900px; }'))

# Rendered at 2x and reduced, for smooth edges at the size the README shows.
OUT_SIZE = {}


def render(chrome, work, name, w, h, dpr, html, motion=False):
    src = work / f'{name}.html'
    src.write_text(html, encoding='utf-8')
    out = work / f'{name}.raw.png'
    args = [chrome, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
            # A fresh profile installs Chrome's default web apps and waits for the network to quit.
            '--disable-default-apps', '--disable-component-update', '--disable-sync',
            f'--user-data-dir={work / ("profile-" + name)}', f'--force-device-scale-factor={dpr}',
            f'--window-size={w},{h}', '--virtual-time-budget=8000', *([] if motion else ['--force-prefers-reduced-motion']),
            f'--screenshot={out}', src.as_uri()]
    if name == 'icon':
        args.insert(1, '--default-background-color=00000000')
    # The picture is done once the file is written and stops growing; a browser that is slow to
    # quit after that (seen with Chrome 157) is closed rather than waited for.
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        last, deadline = -1, time.monotonic() + 120
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                break
            size = out.stat().st_size if out.exists() else -1
            if size > 0 and size == last:
                break
            last = size
            time.sleep(0.5)
        else:
            raise subprocess.TimeoutExpired(args, 120)
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
    if not out.exists():
        raise OSError(f'{name}: the browser wrote no picture')
    return Image.open(out)


def prerender(chrome, work, html, dpr):
    """Each panel frame drawn on its own, then placed as an image: headless Chrome can stall on
    one large picture holding several frames of the panel (seen with Chrome 157), never on one.
    A frame with data-clip="x,y" is the panel's top-left corner (the logo), drawn enlarged."""
    import re
    cache = {}

    def one(m):
        attrs = m.group(1)
        src = re.search(r'src="([^"]+)"', attrs).group(1)
        w, h = int(re.search(r'width="(\d+)"', attrs).group(1)), int(re.search(r'height="(\d+)"', attrs).group(1))
        clip = re.search(r'data-clip="(-?\d+),(-?\d+)"', attrs)
        style = re.search(r'style="([^"]*)"', attrs)
        zoom = dpr * (float(re.search(r'width:([\d.]+)px', style.group(1)).group(1)) / w if style else 1)
        key = (src, w, h, clip and clip.group(0))
        if key not in cache:
            fname = f'pre-{secrets.token_hex(4)}'
            if clip:
                # The corner of the panel, enlarged by a transform (vector-sharp), then cut out:
                # headless windows do not get narrower than a few hundred pixels.
                x, y = int(clip.group(1)), int(clip.group(2))
                z = zoom / dpr
                page_html = (f'<!doctype html><html><head><style>html,body{{margin:0;overflow:hidden}}</style></head><body>'
                             f'<div style="position:absolute;left:0;top:0;transform:scale({z});transform-origin:0 0">'
                             f'<iframe src="{src}" width="400" height="720" style="position:absolute;left:{-x}px;top:{-y}px;border:0"></iframe></div></body></html>')
                cw, ch = round(w * z), round(h * z)
                img = render(chrome, work, fname, max(cw, 520), max(ch, 320), dpr, page_html)
                img.crop((0, 0, round(cw * dpr), round(ch * dpr))).save(work / (fname + '.png'))
            else:
                page_html = (f'<!doctype html><html><head><style>html,body{{margin:0;overflow:hidden}}</style></head><body>'
                             f'<iframe src="{src}" width="{w}" height="{h}" style="display:block;border:0"></iframe></body></html>')
                render(chrome, work, fname, w, h, max(dpr, round(zoom, 2)), page_html).save(work / (fname + '.png'))
            cache[key] = fname + '.png'
        css = f' style="{style.group(1)}"' if style else ''
        return f'<img src="{cache[key]}" width="{w}" height="{h}"{css} alt="">'

    return re.sub(r'<iframe ([^>]*)></iframe>', one, html)


def save(img, name, folder=DOCS):
    """Icon, cover and hero as optimised PNG; screenshots as WEBP, since 2560x1600 PNGs of soft
    gradients run past Orca's 1536 KB limit: lossless when it fits, else lossy at high quality.
    Fails loudly if a file is still too big."""
    kind = 'shot' if name.startswith('shot-') else name
    if kind == 'shot':
        path = folder / f'{name}.webp'
        img.save(path, 'WEBP', lossless=True, quality=100, method=6)
        if path.stat().st_size > LIMITS[kind]:
            img.save(path, 'WEBP', quality=92, method=6)
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
    ('10 000+ tracks', '&tab=library&section=tracks&lib=many'),
    ('AIMP closed', '&scene=closed'),
]
N240P = [
    ('First run: pick folders', '&tab=library&lib=empty'),
    ('Change folders', '&tab=library&folders=1'),
    ('A path that is not one', '&tab=library&lib=empty&paste=my%20music'),
    ('After "Use": the scan', '&tab=library&lib=empty&pick=1,2&use=1&scanpolls=99'),
]
N400P = [
    ('Parent chosen over its folder', '&tab=library&folders=1&pick=0'),
    ('Pasted folder not found', '&tab=library&folders=1&paste=D:%5COld%20Rips&use=1'),
    ('Looking for folders', '&tab=library&lib=nofolders&suggest=slow'),
    ('Nothing suggested, settings refused', '&tab=library&lib=empty&suggest=none&paste=C:%5CUsers%5Cyou%5CMusic&use=1&setfail=settings'),
]
WIDE = [
    ('wide-albums', 'Albums beside Now Playing', '&tab=library&section=albums&lyrics=synced'),
    ('wide-album', 'Album page', '&tab=library&album=al04&art=tide&lyrics=plain'),
    ('wide-search', 'Search', '&q=lumen&lyrics=synced'),
    ('wide-artist', 'Artist page', '&tab=library&artist=ar05&view=cover'),
]


REVIEW_SKIN = ''


def sheet(frames, w, h, theme):
    """A row of panels, each labelled, on a neutral backdrop; returns (width, height, html)."""
    gap, pad, label = 28, 24, 30
    width = pad * 2 + len(frames) * w + (len(frames) - 1) * gap
    height = pad * 2 + h + label
    bg = '#3a3a40' if theme == 'dark' else '#c9c9d1'
    fg = '#f2f2f5' if theme == 'dark' else '#1c1c22'
    cells = ''.join(f'<div><div class="cap">{name}</div><iframe src="panel.html?theme={theme}{extra}{REVIEW_SKIN}" width="{w}" height="{h}"></iframe></div>'
                    for name, extra in frames)
    css = (f'html, body {{ margin: 0; background: {bg}; font: 600 13px "Segoe UI", system-ui, sans-serif; color: {fg}; }}'
           f' .row {{ display: flex; gap: {gap}px; padding: {pad}px; }} .cap {{ height: {label}px; }}'
           ' iframe { display: block; border: 0; border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }')
    return width, height, f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body><div class="row">{cells}</div></body></html>'


def review(chrome, work, out, only=None):
    out.mkdir(parents=True, exist_ok=True)
    jobs = []
    for theme in ('dark', 'light'):
        jobs += [(f'{theme}-240a', N240, 240, 603, 2, theme), (f'{theme}-240b', N240B, 240, 603, 2, theme),
                 (f'{theme}-400a', N400, 400, 800, 1, theme), (f'{theme}-400b', N400B, 400, 800, 1, theme),
                 (f'{theme}-400c', N400C, 400, 800, 1, theme), (f'{theme}-240p', N240P, 240, 603, 2, theme),
                 (f'{theme}-400p', N400P, 400, 800, 1, theme)]
        jobs += [(f'{theme}-{name}', [(label, extra)], 1100, 800, 1, theme) for name, label, extra in WIDE]
    for name, frames, w, h, dpr, theme in jobs:
        if only and name not in only:
            continue
        width, height, html = sheet(frames, w, h, theme)
        for attempt in range(3):
            try:
                img = render(chrome, work, name, width, height, dpr, prerender(chrome, work, html, dpr))
                break
            except (OSError, subprocess.SubprocessError):
                if attempt == 2:
                    raise
        path = out / f'{name}.png'
        img.convert('RGB').save(path, optimize=True)
        print(f'{path}  {img.width}x{img.height}')


def prepare(work):
    """The whole panel (scripts, styles, flags) in `work`, as Orca serves it, and panel.html: the
    real panel with the stand-in for Orca and the demo data."""
    shutil.copytree(ROOT / 'panel', work, dirs_exist_ok=True)
    art = {key: data_url(cover_of(key)) for key in TRACKS}
    states = {f'{s}:{a}': scene_state(s, a) for s in ('playing', 'idle', 'closed', 'offline') for a in TRACKS}
    lyr = {f'{kind}:{a}': track_lyrics(a, kind == 'synced') for kind in ('synced', 'plain') for a in TRACKS}
    library, images = build_library()
    data = {'art': art, 'states': states, 'lyrics': lyr, 'artist': data_url(artist_portrait()), 'themes': THEMES, 'library': library, 'images': images,
            'folders': SUGGESTED_FOLDERS}
    mock = MOCK.replace('__DATA__', json.dumps(data))
    html = (ROOT / 'panel' / 'index.html').read_text(encoding='utf-8')
    (work / 'panel.html').write_text(html.replace('<body>', '<body>\n' + mock, 1), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description='Render B-Side\'s plugin-page images, or review sheets of the panel.')
    parser.add_argument('--out', type=Path, default=DOCS, help='where the plugin-page images go (default: docs/)')
    parser.add_argument('--review', type=Path, help='render review sheets of every view to this folder instead')
    parser.add_argument('--skin', choices=('cd', 'vinyl', 'cassette'), help='with --review: render the sheets in this skin')
    parser.add_argument('--only', help='render only these plugin-page images, by name (comma-separated, e.g. cover,shot-album)')
    args = parser.parse_args()
    chrome = browser()
    work = ROOT / 'scratch' / f'tmp-assets-{secrets.token_hex(4)}'
    work.mkdir(parents=True)
    try:
        prepare(work)
        if args.review:
            global REVIEW_SKIN
            REVIEW_SKIN = f'&skin={args.skin}' if args.skin else ''
            return review(chrome, work, args.review.resolve(), set(args.only.split(',')) if args.only else None)
        args.out.mkdir(parents=True, exist_ok=True)
        wanted = set(args.only.split(',')) if args.only else set(PAGES)
        for name, (w, h, dpr, body) in PAGES.items():
            if name not in wanted:
                continue
            img = render(chrome, work, name, w, h, dpr, prerender(chrome, work, body, dpr))
            expected = (round(w * dpr), round(h * dpr))
            if img.size != expected:
                sys.exit(f'{name}: the browser drew {img.size}, expected {expected}')
            if name != 'icon':
                img = img.convert('RGB')
            if name in OUT_SIZE:
                img = img.resize(OUT_SIZE[name], Image.LANCZOS)
            path = save(img, name, args.out)
            print(f'{path}  {img.width}x{img.height}  {path.stat().st_size // 1024} KB')
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
