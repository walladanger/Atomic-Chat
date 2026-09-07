import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

function parseArgs(argv) {
  const options = {
    manifest: path.join(scriptDir, 'windows-backend-bundle.json'),
    destination: path.join(repoRoot, 'src-tauri', 'resources', 'backend-packages'),
    cache:
      process.env.ATOMIC_BACKEND_CACHE_DIR ||
      path.join(repoRoot, '.cache', 'windows-backends'),
    verifyOnly: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--verify-only') {
      options.verifyOnly = true
    } else if (['--manifest', '--destination', '--cache'].includes(argument)) {
      const value = argv[++index]
      if (!value) throw new Error(`Missing value for ${argument}`)
      options[argument.slice(2)] = path.resolve(value)
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  return options
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}

async function verifyArchive(filePath, entry) {
  let metadata
  try {
    metadata = await stat(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
  if (!metadata.isFile()) throw new Error(`Backend package is not a file: ${entry.asset}`)
  if (metadata.size !== entry.size) {
    throw new Error(
      `Size mismatch for ${entry.asset}: expected ${entry.size}, got ${metadata.size}`
    )
  }
  const digest = await sha256File(filePath)
  if (digest !== entry.sha256) {
    throw new Error(`SHA-256 mismatch for ${entry.asset}`)
  }
  return true
}

async function downloadToCache(entry, cachePath) {
  const partialPath = `${cachePath}.partial`
  await mkdir(path.dirname(cachePath), { recursive: true })
  await unlink(partialPath).catch((error) => {
    if (error?.code !== 'ENOENT') throw error
  })
  try {
    const response = await fetch(entry.url, { redirect: 'follow' })
    if (!response.ok || !response.body) {
      throw new Error(`Download failed for ${entry.asset}: HTTP ${response.status}`)
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partialPath))
    await verifyArchive(partialPath, entry)
    await unlink(cachePath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error
    })
    await rename(partialPath, cachePath)
  } catch (error) {
    await unlink(partialPath).catch(() => {})
    throw error
  }
}

async function stageEntry(entry, options) {
  const destinationPath = path.join(
    options.destination,
    entry.provider,
    entry.version,
    entry.asset
  )
  if (options.verifyOnly) {
    const present = await verifyArchive(destinationPath, entry)
    if (!present) throw new Error(`Missing staged backend: ${entry.asset}`)
    return destinationPath
  }

  const cachePath = path.join(options.cache, entry.asset)
  const cached = await verifyArchive(cachePath, entry)
  if (!cached) await downloadToCache(entry, cachePath)

  await mkdir(path.dirname(destinationPath), { recursive: true })
  const partialPath = `${destinationPath}.partial`
  await unlink(partialPath).catch((error) => {
    if (error?.code !== 'ENOENT') throw error
  })
  await copyFile(cachePath, partialPath)
  try {
    await verifyArchive(partialPath, entry)
    await unlink(destinationPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error
    })
    await rename(partialPath, destinationPath)
  } catch (error) {
    await unlink(partialPath).catch(() => {})
    throw error
  }
  return destinationPath
}

function validateManifest(manifest) {
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.packages)) {
    throw new Error('Unsupported Windows backend bundle manifest')
  }
  const totalBytes = manifest.packages.reduce((total, entry) => {
    if (
      !entry.provider ||
      !entry.version ||
      !entry.backend ||
      !entry.asset ||
      !entry.url ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      throw new Error(`Invalid backend package entry: ${entry.asset ?? '<unnamed>'}`)
    }
    return total + entry.size
  }, 0)
  if (!Number.isSafeInteger(manifest.max_total_bytes) || totalBytes >= manifest.max_total_bytes) {
    throw new Error(
      `Windows backend payload is ${totalBytes} bytes and must stay below ${manifest.max_total_bytes} bytes`
    )
  }
  return totalBytes
}

export async function stageWindowsBackends(options) {
  const manifest = JSON.parse(await readFile(options.manifest, 'utf8'))
  const totalBytes = validateManifest(manifest)
  for (const entry of manifest.packages) await stageEntry(entry, options)
  if (!options.verifyOnly) {
    await mkdir(options.destination, { recursive: true })
    await writeFile(
      path.join(options.destination, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`
    )
  }
  return { packageCount: manifest.packages.length, totalBytes }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = await stageWindowsBackends(options)
  process.stdout.write(
    `${options.verifyOnly ? 'Verified' : 'Staged'} ${result.packageCount} Windows backend packages (${result.totalBytes} bytes).\n`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
