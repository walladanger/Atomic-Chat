import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const guardPath = path.join(repoRoot, 'scripts', 'verify-selective-v2032.mjs')
const rebaselinePath = path.join(repoRoot, 'scripts', 'rebaseline-selective-v2032.mjs')
const protectedHash =
  '64cbe6c7ba5e93d1f43c5542d8b3f6a27901ebbdffb28b89c3a2a920134976c7'

async function makeFixture({ includeAtomicCode = false, corruptProtected = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'atomic-selective-guard-'))
  const manifest = path.join(root, 'protected.json')

  await writeFile(
    path.join(root, 'protected.txt'),
    corruptProtected ? 'changed content\n' : 'protected content\n'
  )
  await writeFile(
    manifest,
    JSON.stringify({ 'protected.txt': protectedHash }, null, 2)
  )

  if (includeAtomicCode) {
    const codeDir = path.join(root, 'web-app', 'src', 'containers', 'code')
    await mkdir(codeDir, { recursive: true })
    await writeFile(
      path.join(codeDir, 'CodeWorkspace.tsx'),
      'export function CodeWorkspace() { return null }\n'
    )
  }

  return { root, manifest }
}

function runGuard(root, manifest) {
  return spawnSync(
    process.execPath,
    [guardPath, '--root', root, '--protected', manifest],
    { cwd: repoRoot, encoding: 'utf8' }
  )
}

function runRebaseline(root, manifest) {
  return spawnSync(
    process.execPath,
    [rebaselinePath, '--root', root, '--protected', manifest],
    { cwd: repoRoot, encoding: 'utf8' }
  )
}

test('rejects a fixture tree while Atomic Code remains registered', async () => {
  const fixture = await makeFixture({ includeAtomicCode: true })

  const result = runGuard(fixture.root, fixture.manifest)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Atomic Code remains/)
})

test('accepts matching protected files when Atomic Code is absent', async () => {
  const fixture = await makeFixture()

  const result = runGuard(fixture.root, fixture.manifest)

  assert.equal(result.status, 0, result.stderr)
})

test('rejects a changed protected file', async () => {
  const fixture = await makeFixture({ corruptProtected: true })

  const result = runGuard(fixture.root, fixture.manifest)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Protected file changed: protected\.txt/)
})

test('re-baselines changed protected files with sorted stable formatting', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atomic-selective-rebaseline-'))
  const manifest = path.join(root, 'protected.json')

  await mkdir(path.join(root, 'nested'), { recursive: true })
  await writeFile(path.join(root, 'nested', 'z.txt'), 'z current content\n')
  await writeFile(path.join(root, 'a.txt'), 'a current content\n')
  await writeFile(
    manifest,
    JSON.stringify(
      {
        'nested/z.txt': protectedHash,
        'a.txt': protectedHash,
      },
      null,
      2
    )
  )

  const rebaseline = runRebaseline(root, manifest)
  assert.equal(rebaseline.status, 0, rebaseline.stderr)

  const verify = runGuard(root, manifest)
  assert.equal(verify.status, 0, verify.stderr)

  const rewritten = await readFile(manifest, 'utf8')
  assert.equal(rewritten.endsWith('\n'), true)
  assert.deepEqual(Object.keys(JSON.parse(rewritten)), ['a.txt', 'nested/z.txt'])
  assert.equal(rewritten, `${JSON.stringify(JSON.parse(rewritten), null, 2)}\n`)
})
