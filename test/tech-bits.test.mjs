// The playing track's bit depth comes from the library's index (AIMP does not report it), so the
// panel's format line can say "FLAC | 16 bits | 44.1 kHz | ...". Unknown files get none.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHandlers } from '../src/player.mjs'

const raw = (fileName) => ({
  running: true, state: 'playing', positionMs: 1, durationMs: 2, volume: 50, mute: false, shuffle: false, repeat: false,
  track: { active: true, fileName, title: 'Song', artist: 'A', album: 'B', sampleRate: 44100, bitrate: 738, channels: 2 }
})
const library = {
  idsForPath: (f) => (f.endsWith('known.flac') ? { trackId: 't1', albumId: 'a1' } : { trackId: null, albumId: null }),
  model: { trackById: new Map([['t1', { albumId: 'a1', bits: 16 }]]) },
  handlers: {}
}
const handlers = (fileName) => createHandlers({ aimp: { request: async () => raw(fileName), close() {} }, online: { get: () => ({ online: true }) }, library })

test('a library track gets its bit depth in the playing quality', async () => {
  const s = await handlers('C:\Music\known.flac')['player.state']()
  assert.equal(s.track.quality.bits, 16)
  assert.equal(s.track.quality.codec, 'FLAC')
})

test('a file outside the library has no bit depth rather than a guess', async () => {
  const s = await handlers('C:\Music\other.flac')['player.state']()
  assert.equal('bits' in s.track.quality, false)
})
