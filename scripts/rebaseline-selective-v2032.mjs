import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { hashFile } from './verify-selective-v2032.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultRoot = path.resolve(scriptDir, '..')
const defaultProtected = path.join(scriptDir, 'selective-v2032-protected.json')

function parseArgs(argv) {
  let root = defaultRoot
  let protectedManifest = defaultProtected
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root' && argv[index + 1]) {
      root = path.resolve(argv[++index])
    } else if (argv[index] === '--protected' && argv[index + 1]) {
      protectedManifest = path.resolve(argv[++index])
    } else {
      throw new Error(`Unknown or incomplete argument: ${argv[index]}`)
    }
  }
  return { root, protectedManifest }
}

export async function rebaselineTree({ root, protectedManifest }) {
  const protectedFiles = JSON.parse(await readFile(protectedManifest, 'utf8'))
  const nextProtectedFiles = {}

  for (const relativePath of Object.keys(protectedFiles).sort()) {
    const absolutePath = path.join(root, relativePath)
    if (!existsSync(absolutePath)) {
      throw new Error(`Protected file missing: ${relativePath}`)
    }
    nextProtectedFiles[relativePath] = await hashFile(absolutePath)
  }

  await writeFile(protectedManifest, `${JSON.stringify(nextProtectedFiles, null, 2)}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  await rebaselineTree(options)
  process.stdout.write('Selective v2.0.32 protected hashes re-baselined.\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
