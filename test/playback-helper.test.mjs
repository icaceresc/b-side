// Integration test of the REAL native/aimp-helper.ps1 for playback and its compiled-assembly cache.
// Windows only. Nothing here reaches AIMP: shellInfo only reads the registry, and the files asked
// for do not exist, so the helper refuses them before calling the shell.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createAimp } from '../src/aimp.mjs'

const skip = process.platform === 'win32' ? false : 'the AIMP helper runs only on Windows'
const TIMEOUT_MS = 60000

test('the real helper caches its build, describes AIMP and refuses files that are not there', { skip, timeout: TIMEOUT_MS }, async (t) => {
  for (let run = 0; run < 2; run++) {
    const aimp = createAimp()
    try {
      const info = await aimp.request('shellInfo', {}, { timeout: 20000 })
      assert.ok(info.edition === null || ['store', 'classic'].includes(info.edition), `edition ${info.edition}`)
      if (info.edition === 'store') {
        assert.match(info.package, /^25018ArtemIzmaylov\.AIMP_[\d.]+_[a-z0-9]+__4hdg3aaevdv22$/)
        assert.match(info.playlistProgId ?? '', /^AppX[a-z0-9]+$/)
        assert.match(info.audioProgId ?? '', /^AppX[a-z0-9]+$/)
      }
      t.diagnostic(`run ${run}: ${JSON.stringify(info)}`)
      const missing = join(process.cwd(), 'no-such-dir', 'B-Side-missing.m3u8')
      await assert.rejects(aimp.request('openFile', { path: missing }), (e) => e.code === 'aimp_error' && /No such file/.test(e.message))
      await assert.rejects(aimp.request('insertFile', { path: missing }), (e) => e.code === 'aimp_error')
      await assert.rejects(aimp.request('openFile', { path: 'relative\\x.flac' }), (e) => e.code === 'aimp_error')
      await assert.rejects(aimp.request('openFile', { path: 'C:\\a\\"b".flac' }), (e) => e.code === 'aimp_error')
    } finally {
      aimp.close()
    }
  }
  // Built once into the cache, named by the SHA-256 of its C#.
  const dir = join(process.env.LOCALAPPDATA, 'B-Side', 'cache')
  const dlls = readdirSync(dir).filter((n) => /^helper-[0-9a-f]{64}\.dll$/.test(n))
  assert.ok(dlls.length >= 1, `cache: ${readdirSync(dir).join(', ')}`)
})
