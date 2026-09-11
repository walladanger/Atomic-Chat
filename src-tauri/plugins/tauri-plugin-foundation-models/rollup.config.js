import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cwd } from 'node:process'
import typescript from '@rollup/plugin-typescript'

const pkg = JSON.parse(readFileSync(join(cwd(), 'package.json'), 'utf8'))

export default [
{
  input: 'guest-js/index.ts',
  // ONE output per config, and declarations emitted by the FIRST only.
  //
  // These used to be two outputs on a single config with `declaration: true`
  // at the root. @rollup/plugin-typescript emits declarations from
  // generateBundle, which rollup runs ONCE PER OUTPUT - so both passes wrote
  // the same index.d.ts. POSIX tolerates that; Windows returns EBUSY and the
  // build dies, leaving a 0-byte .d.ts behind. Splitting the outputs makes the
  // emit happen exactly once and the build deterministic on every platform.
  output: [
    {
      file: pkg.exports.import,
      format: 'esm'
    }
  ],
  plugins: [
    typescript({
      declaration: true,
      declarationDir: dirname(pkg.exports.import)
    })
  ],
  external: [
    /^@tauri-apps\/api/,
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {})
  ]
},
{
  input: 'guest-js/index.ts',
  output: [
    {
      file: pkg.exports.require,
      format: 'cjs'
    }
  ],
  plugins: [typescript({ declaration: false })],
  external: [
    /^@tauri-apps\/api/,
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {})
  ]
}
]
