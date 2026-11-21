"""Builds B-Side's demo library: invented artists, albums and tracks with original synthetic music
(FLAC), procedural covers and original lyrics (.lrc). Everything here is made by this script; no
samples, recordings, images or texts from anyone else.

It is what the README, the store images and the announcement video show, and what AIMP plays when
B-Side is tested on it, so the format line shows real values. It is never mixed with anyone's music.

    python docs/demo/make-demo.py [--out DIR]     (default: demo-library/, ignored by git)

Needs numpy, Pillow and soundfile (libsndfile writes FLAC).
"""

import argparse
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('assets', ROOT / 'docs' / 'make-assets.py')
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)

NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def freq(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def chord(root, quality, octave=4):
    base = 12 * (octave + 1) + NOTE[root]
    steps = {'maj7': (0, 4, 7, 11), 'min7': (0, 3, 7, 10), 'maj': (0, 4, 7, 12), 'min': (0, 3, 7, 12), 'sus2': (0, 2, 7, 12), 'dom7': (0, 4, 7, 10)}[quality]
    return [base + s for s in steps]


def env(n, sr, attack, release):
    e = np.ones(n)
    a, r = max(1, min(n // 2, int(attack * sr))), max(1, min(n // 2, int(release * sr)))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def voice(f, n, sr, timbre, rng):
    t = np.arange(n) / sr
    if timbre == 'saw':  # warm detuned saw pad (a few harmonics, band-limited by hand)
        out = sum(np.sin(2 * np.pi * f * k * (1 + d) * t) / k for k in range(1, 9) for d in (-0.003, 0.003)) / 6
    elif timbre == 'rhodes':  # FM electric piano
        out = np.sin(2 * np.pi * f * t + 1.3 * np.exp(-t * 3) * np.sin(2 * np.pi * f * 2 * t)) * np.exp(-t * 1.2)
    elif timbre == 'pluck':  # plucked string: bright harmonics that die away faster than the body
        out = sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (2.5 + 1.6 * k)) / k for k in range(1, 7))
    else:  # soft sine with a little second harmonic
        out = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return out


def track_audio(spec, sr, seconds, seed):
    """One original piece from a recipe: tempo, chords, lead scale and texture."""
    rng = np.random.default_rng(seed)
    n = int(seconds * sr)
    mix = np.zeros((n, 2))
    beat = 60 / spec['bpm']
    bar = 4 * beat
    prog = spec['chords']
    bars = int(seconds / bar) + 1
    for b in range(bars):
        start = int(b * bar * sr)
        if start >= n:
            break
        length = min(int(bar * sr), n - start)
        root, quality = prog[b % len(prog)]
        notes = chord(root, quality, spec.get('octave', 3))
        pad = sum(voice(freq(m), length, sr, spec['pad'], rng) for m in notes) / len(notes)
        pad *= env(length, sr, 0.25 if spec['pad'] != 'rhodes' else 0.01, 0.3) * spec.get('pad_gain', 0.22)
        mix[start:start + length, 0] += pad * 0.9
        mix[start:start + length, 1] += pad
        # bass on the root, on the beat
        for q in range(4):
            s = start + int(q * beat * sr)
            if s >= n:
                break
            m = int(min(beat * sr * 0.9, n - s))
            bass = voice(freq(notes[0] - 12), m, sr, 'sine', rng) * env(m, sr, 0.005, 0.15) * 0.28
            mix[s:s + m] += bass[:, None]
        # lead: an arpeggio or a slow melody over the chord tones
        steps = spec.get('lead_steps', 8)
        for k in range(steps):
            s = start + int(k * bar / steps * sr)
            if s >= n or rng.random() < spec.get('rest', 0.15):
                continue
            m = int(min(bar / steps * sr * 1.6, n - s))
            note = notes[(k * spec.get('arp_step', 1)) % len(notes)] + 12 * spec.get('lead_up', 1)
            lead = voice(freq(note), m, sr, spec['lead'], rng) * env(m, sr, 0.005, min(0.25, m / sr / 2)) * spec.get('lead_gain', 0.14)
            pan = 0.5 + 0.35 * math.sin(k)
            mix[s:s + m, 0] += lead * (1 - pan)
            mix[s:s + m, 1] += lead * pan
        # drums
        if spec.get('drums'):
            for q in range(8):
                s = start + int(q * beat / 2 * sr)
                if s >= n:
                    continue
                if q % 4 == 0:  # kick
                    m = min(int(0.25 * sr), n - s)
                    t = np.arange(m) / sr
                    kick = np.sin(2 * np.pi * (50 + 90 * np.exp(-t * 30)) * t) * np.exp(-t * 9) * 0.5
                    mix[s:s + m] += kick[:, None]
                if q % 4 == 2:  # snare
                    m = min(int(0.18 * sr), n - s)
                    snare = rng.uniform(-1, 1, m) * np.exp(-np.arange(m) / sr * 22) * 0.16
                    mix[s:s + m] += snare[:, None]
                m = min(int(0.05 * sr), n - s)  # hat
                hat = np.diff(rng.uniform(-1, 1, m + 1)) * np.exp(-np.arange(m) / sr * 60) * 0.05
                mix[s:s + m] += hat[:, None]
    # gentle room: a short stereo echo, then fades and a safe level
    d = int(0.19 * sr)
    mix[d:, 0] += mix[:-d, 1] * 0.18
    mix[d:, 1] += mix[:-d, 0] * 0.18
    fade = int(2.5 * sr)
    mix[:int(0.05 * sr)] *= np.linspace(0, 1, int(0.05 * sr))[:, None]
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return mix / max(1e-9, np.abs(mix).max()) * 0.89


SYNTH = dict(bpm=104, pad='saw', lead='pluck', drums=True, chords=[('A', 'min7'), ('F', 'maj7'), ('C', 'maj7'), ('G', 'maj')])
AMBIENT = dict(bpm=72, pad='saw', lead='sine', drums=False, lead_steps=4, rest=0.35, chords=[('D', 'maj7'), ('B', 'min7'), ('G', 'maj7'), ('A', 'sus2')])
POP = dict(bpm=112, pad='rhodes', lead='pluck', drums=True, chords=[('E', 'maj'), ('C#', 'min7'), ('A', 'maj7'), ('B', 'maj')], pad_gain=0.3)
JAZZ = dict(bpm=88, pad='rhodes', lead='sine', drums=True, lead_steps=6, rest=0.3, chords=[('D', 'min7'), ('G', 'dom7'), ('C', 'maj7'), ('A', 'dom7')], pad_gain=0.32)
FOLK = dict(bpm=96, pad='pluck', lead='pluck', drums=False, lead_steps=8, arp_step=3, chords=[('G', 'maj'), ('D', 'maj'), ('E', 'min'), ('C', 'maj')], pad_gain=0.3)
ELECTRO = dict(bpm=122, pad='saw', lead='sine', drums=True, lead_steps=16, arp_step=2, chords=[('F', 'min7'), ('C#', 'maj7'), ('G#', 'maj7'), ('D#', 'sus2')])

# The demo library: the same invented names as the screenshots (docs/make-assets.py), each album with
# a recipe. (artist, album, year, genre, cover key in make-assets, sample rate, bits, tracks)
ALBUMS = [
    ('Sunset Arcade', 'Afterglow', 2024, 'Synthwave', 'al01', 44100, 16, SYNTH,
     [('Golden Hour Static', 150, True), ('Neon on the Window', 104, False), ('Coastline Drive', 96, False)]),
    ('Harbor Lights', 'Blue Hour', 2023, 'Ambient', 'al04', 96000, 24, AMBIENT,
     [('Low Tide Signals', 128, True), ('Lighthouse Hum', 96, False)]),
    ('Paper Planets', 'Night Bloom', 2025, 'Indie Pop', 'al06', 44100, 16, POP,
     [('Violet Weather', 120, True), ('Paper Moons', 92, False)]),
    ('The Quiet Hours', 'After Midnight', 2018, 'Jazz', 'al12', 44100, 16, JAZZ,
     [('Midnight Harbours', 116, True), ('Brushwork Waltz', 90, False)]),
    ('Ríos de Ámbar', 'Río Lento', 2022, 'Folk', 'al21', 96000, 24, FOLK,
     [('Orilla del Río', 104, True), ('Luz de Ámbar', 88, False)]),
    ('Lumen Drift', 'Parallax', 2024, 'Electronic', 'al09', 44100, 16, ELECTRO,
     [('Parallax', 112, True), ('Prism Run', 90, False)]),
]

LYRICS = assets.DEMO_LYRICS  # the same original lines the screenshots show


def lrc(lines, seconds):
    times = assets.lrc_times(len(lines), seconds)
    return ''.join(f'[{int(t // 60):02d}:{t % 60:05.2f}]{line}\n' for t, line in zip(times, lines))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', type=Path, default=ROOT / 'demo-library')
    args = ap.parse_args()
    summary = []
    for i, (artist, album, year, genre, key, sr, bits, recipe, tracks) in enumerate(ALBUMS):
        folder = args.out / artist / album
        folder.mkdir(parents=True, exist_ok=True)
        _, _, _, _, _, cover_spec, *_ = next(x for x in assets.LIB_ALBUMS if x[0] == key)
        img = assets.cover_art(cover_spec[1], 800) if cover_spec[0] == 'art' else assets.drawn_cover(cover_spec[0], cover_spec[1], key, 800)
        img.convert('RGB').save(folder / 'cover.jpg', quality=90)
        for n, (title, seconds, with_lyrics) in enumerate(tracks, 1):
            audio = track_audio(recipe, sr, seconds, seed=i * 10 + n)
            path = folder / f'{n:02d} {title}.flac'
            with sf.SoundFile(path, 'w', sr, 2, subtype='PCM_24' if bits == 24 else 'PCM_16', format='FLAC') as f:
                f.title, f.artist, f.album, f.date, f.genre, f.tracknumber = title, artist, album, str(year), genre, str(n)
                f.comment = 'B-Side demo library: original synthetic music'
                f.write(audio)
            if with_lyrics and title in LYRICS:
                path.with_suffix('.lrc').write_text(lrc(LYRICS[title], seconds), encoding='utf-8')
            size = path.stat().st_size
            summary.append({'artist': artist, 'album': album, 'title': title, 'seconds': seconds, 'sampleRate': sr, 'bits': bits,
                            'kbps': round(size * 8 / seconds / 1000), 'bytes': size, 'lyrics': with_lyrics})
            print(f'{path.relative_to(args.out)}  {sr / 1000:g} kHz / {bits} bits  {size // 1024} KB  {summary[-1]["kbps"]} kbps')
    (args.out / 'demo.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
