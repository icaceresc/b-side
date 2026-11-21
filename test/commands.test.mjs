import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { COMMANDS, commandArgs, createHandlers } from '../src/player.mjs'

function recordingAimp() {
  const calls = []
  return { calls, request: async (cmd, args) => (calls.push([cmd, args]), true), close() {} }
}
const handlers = (aimp) => createHandlers({ aimp, online: { get: () => ({ online: true, error: null }) } })

test('seek takes a whole number of milliseconds >= 0', () => {
  assert.deepEqual(commandArgs('seek', { positionMs: 0 }), { positionMs: 0 })
  assert.deepEqual(commandArgs('seek', { positionMs: 1234.6 }), { positionMs: 1235 })
  for (const positionMs of [-1, NaN, Infinity, '5000', null, undefined, 2 ** 31]) {
    assert.throws(() => commandArgs('seek', { positionMs }), { code: 'invalid' }, String(positionMs))
  }
  assert.throws(() => commandArgs('seek'), { code: 'invalid' })
})

test('volume takes a number from 0 to 100, rounded', () => {
  assert.deepEqual(commandArgs('volume', { volume: 0 }), { volume: 0 })
  assert.deepEqual(commandArgs('volume', { volume: 100 }), { volume: 100 })
  assert.deepEqual(commandArgs('volume', { volume: 42.4 }), { volume: 42 })
  for (const volume of [-1, 101, NaN, Infinity, '50', true, null]) {
    assert.throws(() => commandArgs('volume', { volume }), { code: 'invalid' }, String(volume))
  }
})

test('shuffle, repeat and mute take a boolean on', () => {
  for (const command of ['shuffle', 'repeat', 'mute']) {
    assert.deepEqual(commandArgs(command, { on: true }), { on: true })
    assert.deepEqual(commandArgs(command, { on: false }), { on: false })
    for (const on of ['true', 'false', 1, 0, null, undefined]) {
      assert.throws(() => commandArgs(command, { on }), { code: 'invalid' }, `${command} ${on}`)
    }
  }
})

test('commands without arguments ignore what they are sent', () => {
  for (const command of ['playPause', 'play', 'pause', 'stop', 'next', 'previous']) {
    assert.deepEqual(commandArgs(command, { volume: 'x', evil: true }), {})
    assert.deepEqual(commandArgs(command, 'junk'), {})
  }
  assert.throws(() => commandArgs('quit', {}), { code: 'invalid' })
  assert.throws(() => commandArgs(undefined), { code: 'invalid' })
})

test('invalid input never reaches the helper; valid input arrives cleaned', async () => {
  const aimp = recordingAimp()
  const h = handlers(aimp)
  await assert.rejects(h['player.command']({ command: 'volume', args: { volume: 'loud' } }), { code: 'invalid' })
  await assert.rejects(h['player.command']({ command: 'seek', args: { positionMs: -5 } }), { code: 'invalid' })
  await assert.rejects(h['player.command']({ command: 'mute', args: { on: 'yes' } }), { code: 'invalid' })
  assert.deepEqual(aimp.calls, [])
  await h['player.command']({ command: 'volume', args: { volume: 33.7 } })
  await h['player.command']({ command: 'mute', args: { on: true } })
  await h['player.command']({ command: 'next', args: { positionMs: 9 } })
  assert.deepEqual(aimp.calls, [['volume', { volume: 34 }], ['mute', { on: true }], ['next', {}]])
})

test('every worker command is on the helper allow-list', () => {
  const helper = readFileSync(new URL('../native/aimp-helper.ps1', import.meta.url), 'utf8')
  assert.ok(COMMANDS.has('mute'))
  for (const command of COMMANDS) assert.ok(helper.includes(`'${command}' { [BSideAimp]::`), `helper has no case for ${command}`)
  assert.match(helper, /public static void Mute\(IntPtr h, bool on\) \{ Set\(h, PROP_MUTE, on \? 1 : 0\); \}/)
})

// The panel's strings are checked in test/panel-i18n.test.mjs.

// A fake AIMP with a player state, where "pause" toggles and "play" restarts, as AIMP 4.60 does.
function statefulAimp(state, { fade = false } = {}) {
  const calls = []
  const aimp = {
    calls,
    state,
    request: async (cmd) => {
      if (cmd === 'state') return aimp.state === 'closed' ? { running: false } : { running: true, state: aimp.state }
      calls.push(cmd)
      // During the pause fade AIMP keeps reporting "playing": model that by not changing state.
      if (cmd === 'pause' && !fade) aimp.state = aimp.state === 'playing' ? 'paused' : aimp.state === 'paused' ? 'playing' : aimp.state
      if (cmd === 'playPause') aimp.state = aimp.state === 'playing' ? 'paused' : 'playing'
      if (cmd === 'play') aimp.state = 'playing'
      return true
    },
    close() {}
  }
  return aimp
}

test('pause only pauses and play only starts or resumes', async () => {
  const cases = [
    ['pause', 'playing', ['pause'], 'paused'],
    ['pause', 'paused', [], 'paused'],
    ['pause', 'stopped', [], 'stopped'],
    ['play', 'playing', [], 'playing'],
    ['play', 'paused', ['playPause'], 'playing'],
    ['play', 'stopped', ['play'], 'playing']
  ]
  for (const [command, from, sent, to] of cases) {
    const aimp = statefulAimp(from)
    await handlers(aimp)['player.command']({ command })
    assert.deepEqual(aimp.calls, sent, `${command} from ${from}`)
    assert.equal(aimp.state, to, `${command} from ${from}`)
  }
})

test('a second pause during the fade-out does not resume playback', async () => {
  let clock = 0
  const aimp = statefulAimp('playing', { fade: true })
  const h = createHandlers({ aimp, online: { get: () => ({ online: true }) }, now: () => clock })
  await h['player.command']({ command: 'pause' })
  clock = 300 // AIMP still reads "playing" while it fades out
  await h['player.command']({ command: 'pause' })
  assert.deepEqual(aimp.calls, ['pause'])
  clock = 400 // play during the fade resumes, the toggle way
  await h['player.command']({ command: 'play' })
  assert.deepEqual(aimp.calls, ['pause', 'playPause'])
  aimp.state = 'playing' // resumed
  clock = 5000 // long after: the fade memory is gone, a real "playing" is paused again
  await h['player.command']({ command: 'pause' })
  assert.deepEqual(aimp.calls, ['pause', 'playPause', 'pause'])
})

test('play and pause report AIMP closed', async () => {
  for (const command of ['play', 'pause']) {
    const aimp = statefulAimp('closed')
    await assert.rejects(handlers(aimp)['player.command']({ command }), { code: 'aimp_closed' })
    assert.deepEqual(aimp.calls, [])
  }
})
