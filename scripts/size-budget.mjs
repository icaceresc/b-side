// The repository's size budget: what Orca's Community catalog downloads and checks for each release
// is the tracked tree, and it holds a release that grew too large for review ("under-review: size").
// B-Side 2.1.2 was listed at 10.1 MB and 2.3.1 was held at 16.0 MB; the threshold is not public, so
// the budget keeps well under the smaller one.
//
//   node scripts/size-budget.mjs
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'

const MB = 1024 * 1024
const BUDGET = { total: 5 * MB, images: 3 * MB, file: 1.25 * MB }
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const sized = files.map((f) => ({ f, size: statSync(f).size }))
const total = sized.reduce((s, x) => s + x.size, 0)
const images = sized.filter((x) => /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(x.f)).reduce((s, x) => s + x.size, 0)
const big = sized.filter((x) => x.size > BUDGET.file)
const mb = (n) => `${(n / MB).toFixed(2)} MB`
console.log(`tree ${mb(total)} of ${mb(BUDGET.total)}; images ${mb(images)} of ${mb(BUDGET.images)}; ${files.length} files`)
for (const x of sized.sort((a, b) => b.size - a.size).slice(0, 5)) console.log(`  ${mb(x.size).padStart(8)}  ${x.f}`)
const over = [
  total > BUDGET.total && `the tree is ${mb(total)}, over ${mb(BUDGET.total)}`,
  images > BUDGET.images && `images are ${mb(images)}, over ${mb(BUDGET.images)}`,
  ...big.map((x) => `${x.f} is ${mb(x.size)}, over ${mb(BUDGET.file)}`)
].filter(Boolean)
for (const o of over) console.log(`FAIL ${o}`)
process.exit(over.length ? 1 : 0)
