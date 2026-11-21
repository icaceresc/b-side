// Measures the AIMP helper the way the worker uses it, so the native helper and the PowerShell one
// are compared by the same method. Windows only. It only reads AIMP (state and cover requests,
// never a control command): AIMP is measured as the person left it, and the report says whether it
// was playing.
//
//   node scripts/measure-helper.mjs --helper native|powershell [--starts 5] [--minutes 10]
//
// Cold start: a fresh helper process, from spawn to its first `state` answer (median of --starts).
// Idle: one `state`, then 10 s without requests. In use: after 1 min of the panel's traffic (state
// every second, the cover every minute). CPU: total processor time after --minutes of that traffic.
// Memory is the helper's own working set and private bytes, plus the console host (conhost.exe)
// Windows starts beside a console program that has no console.
import { execFileSync } from 'node:child_process'
import { createAimp, helperProcess } from '../src/aimp.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const kind = arg('helper', 'native')
const starts = Number(arg('starts', 5))
const minutes = Number(arg('minutes', 10))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const MB = (n) => +(n / 2 ** 20).toFixed(1)
function stats(pid) {
  const script = [
    `$p = Get-Process -Id ${Number(pid)}`,
    `$c = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=${Number(pid)} AND Name='conhost.exe'" | ForEach-Object { Get-Process -Id $_.ProcessId })`,
    `'{0} {1} {2} {3}' -f $p.WorkingSet64, $p.PrivateMemorySize64, $p.TotalProcessorTime.TotalMilliseconds, ($c | Measure-Object WorkingSet64 -Sum).Sum`
  ].join('; ')
  const [ws, priv, cpu, conhost] = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim().split(' ').map(Number)
  return { workingSetMB: MB(ws), privateMB: MB(priv), cpuMs: Math.round(cpu), conhostMB: MB(conhost || 0) }
}

function start() {
  let child = null
  const aimp = createAimp({
    kind,
    spawnHelper: (spec) => (child = helperProcess(spec)),
    log: (m) => console.error(m)
  })
  return { aimp, pid: () => child?.pid }
}

const coldMs = []
for (let i = 0; i < starts; i++) {
  const { aimp } = start()
  const t0 = performance.now()
  await aimp.request('state', {}, { timeout: 30000 })
  coldMs.push(Math.round(performance.now() - t0))
  aimp.close()
  await sleep(1500)
}
const sorted = [...coldMs].sort((a, b) => a - b)

const { aimp, pid } = start()
const first = await aimp.request('state', {}, { timeout: 30000 })
await sleep(10000)
const idle = stats(pid())

let requests = 0
let errors = 0
let playing = 0
const until = Date.now() + minutes * 60000
let nextArt = 0
let sampled = null
while (Date.now() < until) {
  let s = null
  try {
    s = await aimp.request('state')
    requests++
    if (s.running && s.state === 'playing') playing++
    if (Date.now() >= nextArt) {
      nextArt = Date.now() + 60000
      await aimp.request('art', {}, { timeout: 10000 }).catch(() => errors++)
      requests++
    }
  } catch {
    errors++
  }
  if (!sampled && Date.now() > until - (minutes - 1) * 60000) sampled = { ...stats(pid()), aimp: s?.running ? s.state : 'closed' }
  await sleep(1000)
}
const end = stats(pid())
aimp.close()

console.log(
  JSON.stringify(
    {
      helper: kind,
      aimp: first.running ? { state: first.state, version: first.version } : 'closed',
      coldStartMs: { median: sorted[Math.floor(sorted.length / 2)], runs: coldMs },
      idle,
      inUseAfter1Min: sampled,
      after: { minutes, ...end, cpuMsPerMinute: Math.round((end.cpuMs - idle.cpuMs) / minutes) },
      traffic: { requests, errors, secondsPlaying: playing }
    },
    null,
    2
  )
)
