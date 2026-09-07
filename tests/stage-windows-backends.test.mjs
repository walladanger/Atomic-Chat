import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const stageScript = path.join(repoRoot, 'scripts', 'stage-windows-backends.mjs')

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function fixture({ content = 'archive bytes', expectedHash, maxBytes = 1024 } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'atomic-backend-stage-'))
  const cache = path.join(root, 'cache')
  const destination = path.join(root, 'resources')
  const manifest = path.join(root, 'bundle.json')
  const asset = 'fixture-backend.zip'
  await mkdir(cache, { recursive: true })
  await writeFile(path.join(cache, asset), content)
  await writeFile(
    manifest,
    JSON.stringify({
      schema_version: 1,
      max_total_bytes: maxBytes,
      packages: [
        {
          provider: 'llamacpp-upstream',
          version: 'b1',
          backend: 'win-cpu-x64',
          asset,
          url: 'https://invalid.example/fixture-backend.zip',
          size: Buffer.byteLength(content),
          sha256: expectedHash ?? sha256(content),
        },
      ],
    })
  )
  return { root, cache, destination, manifest, asset }
}

function runStage(fixture, ...extraArgs) {
  return spawnSync(
    process.execPath,
    [
      stageScript,
      '--manifest',
      fixture.manifest,
      '--destination',
      fixture.destination,
      '--cache',
      fixture.cache,
      ...extraArgs,
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  )
}

test('stages a cached package only after exact size and SHA-256 verification', async () => {
  const input = await fixture()

  const result = runStage(input)

  assert.equal(result.status, 0, result.stderr)
  const stagedManifest = JSON.parse(
    await readFile(path.join(input.destination, 'manifest.json'), 'utf8')
  )
  assert.deepEqual(
    stagedManifest.packages.map(({ provider, backend }) => `${provider}:${backend}`),
    ['llamacpp-upstream:win-cpu-x64']
  )
  assert.equal(
    await readFile(
      path.join(
        input.destination,
        'llamacpp-upstream',
        'b1',
        input.asset
      ),
      'utf8'
    ),
    'archive bytes'
  )
})

test('rejects a cached package with a mismatched digest', async () => {
  const input = await fixture({ expectedHash: '0'.repeat(64) })

  const result = runStage(input)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /SHA-256 mismatch for fixture-backend\.zip/)
})

test('verify-only rejects a missing staged package without using the network', async () => {
  const input = await fixture()

  const result = runStage(input, '--verify-only')

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing staged backend: fixture-backend\.zip/)
})

test('rejects a manifest whose declared payload reaches the size budget', async () => {
  const input = await fixture({ content: 'four', maxBytes: 4 })

  const result = runStage(input)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /must stay below 4 bytes/)
})
