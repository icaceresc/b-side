// The real helpers the integration tests run against: the native one (native/bin, or the build
// named by BSIDE_NATIVE_HELPER, which the CI sets to the binary it has just compiled) and the
// PowerShell one. Without a native build here the native runs are skipped, unless
// BSIDE_REQUIRE_NATIVE=1 (the CI), where a missing build fails.
import { existsSync } from 'node:fs'
import { nativeHelperPath } from '../src/aimp.mjs'

export const windows = process.platform === 'win32'
export const nativePath = process.env.BSIDE_NATIVE_HELPER || nativeHelperPath()
const required = process.env.BSIDE_REQUIRE_NATIVE === '1'

export const KINDS = [
  {
    kind: 'native',
    options: { kind: 'native', nativePath },
    skip: !windows ? 'the helper runs only on Windows' : nativePath && existsSync(nativePath) ? false : required ? false : 'no native helper build here (node native/build.mjs)'
  },
  { kind: 'powershell', options: { kind: 'powershell' }, skip: windows ? false : 'the helper runs only on Windows' }
]
