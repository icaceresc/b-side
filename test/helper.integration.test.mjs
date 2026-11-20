// Integration smoke test: starts the REAL native/aimp-helper.ps1 through createAimp() and checks
// its replies. Windows only. It never sends a control command to a running AIMP: the control
// assertion runs only when AIMP is closed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAimp } from '../src/aimp.mjs'

const skip = process.platform === 'win32' ? false : 'the AIMP helper runs only on Windows (PowerShell + AIMP Remote API)'
// First request: PowerShell start plus compiling the helper's C# (15 s grace) plus the 6 s timeout.
const TIMEOUT_MS = 30000

const PLAYER_NUMBERS = ['positionMs', 'durationMs', 'volume', 'version']
const PLAYER_BOOLEANS = ['mute', 'repeat', 'shuffle']
const TRACK_NUMBERS = ['headerSize', 'bitrate', 'channels', 'durationMs', 'fileSize', 'sampleRate', 'trackNumber']
const TRACK_STRINGS = ['album', 'artist', 'date', 'fileName', 'genre', 'title']

function assertState(s) {
  assert.equal(typeof s, 'object')
  assert.notEqual(s, null)
  assert.equal(typeof s.running, 'boolean')
  if (!s.running) return
  assert.ok(['playing', 'paused', 'stopped'].includes(s.state), `state: ${s.state}`)
  for (const k of PLAYER_NUMBERS) assert.equal(typeof s[k], 'number', k)
  for (const k of PLAYER_BOOLEANS) assert.equal(typeof s[k], 'boolean', k)
  // The track block is null when AIMP's shared memory cannot be read.
  if (s.track === null) return
  assert.equal(typeof s.track.active, 'boolean', 'track.active')
  for (const k of TRACK_NUMBERS) assert.equal(typeof s.track[k], 'number', `track.${k}`)
  for (const k of TRACK_STRINGS) assert.equal(typeof s.track[k], 'string', `track.${k}`)
}

test('the real helper answers state, and a control command with AIMP closed is aimp_closed', { skip, timeout: TIMEOUT_MS + 5000 }, async (t) => {
  const aimp = createAimp()
  try {
    const state = await aimp.request('state')
    assertState(state)
    if (state.running) {
      t.diagnostic('AIMP is running: control command not sent')
      return
    }
    // `pause` is the least disruptive control command, should AIMP open in between.
    await assert.rejects(aimp.request('pause'), (error) => error.code === 'aimp_closed')
  } finally {
    aimp.close()
  }
})
