import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultRoot = path.resolve(scriptDir, '..')
const defaultProtected = path.join(scriptDir, 'selective-v2032-protected.json')

const forbiddenPaths = [
  'web-app/src/containers/code',
  'web-app/src/routes/code.tsx',
  'web-app/src/services/model-router',
  'web-app/src/hooks/useModelStrategy.ts',
  'web-app/src/hooks/useModelStrategy.test.ts',
]

const forbiddenDocuments = [
  'docs/decisions/2026-09-04-route-atomic-code-through-configurable-model-candidates.md',
  'docs/superpowers/plans/2026-09-04-atomic-code-model-routing-foundation.md',
  'docs/superpowers/specs/2026-09-04-atomic-code-model-routing-foundation-design.md',
]

const searchableRoots = [
  'web-app/src/components',
  'web-app/src/constants',
  'web-app/src/containers',
  'web-app/src/hooks',
  'web-app/src/routes',
  'web-app/src/services',
]

const forbiddenText = [
  { expression: /route\.code\b/, label: 'route.code' },
  { expression: /CodeWorkspace\b/, label: 'CodeWorkspace' },
  { expression: /atomic-model-strategy/, label: 'atomic-model-strategy' },
]

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

export async function hashFile(filePath) {
  const contents = await readFile(filePath)
  return createHash('sha256').update(contents).digest('hex')
}

async function sourceFiles(directory) {
  if (!existsSync(directory)) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath]
    })
  )
  return nested.flat()
}

export async function verifyTree({ root, protectedManifest }) {
  const errors = []
  const protectedFiles = JSON.parse(await readFile(protectedManifest, 'utf8'))

  for (const [relativePath, expectedHash] of Object.entries(protectedFiles)) {
    const absolutePath = path.join(root, relativePath)
    if (!existsSync(absolutePath)) {
      errors.push(`Protected file missing: ${relativePath}`)
      continue
    }
    const actualHash = await hashFile(absolutePath)
    if (actualHash !== expectedHash) {
      errors.push(`Protected file changed: ${relativePath}`)
    }
  }

  for (const relativePath of [...forbiddenPaths, ...forbiddenDocuments]) {
    if (existsSync(path.join(root, relativePath))) {
      errors.push(`Atomic Code remains: ${relativePath}`)
    }
  }

  const files = (
    await Promise.all(searchableRoots.map((entry) => sourceFiles(path.join(root, entry))))
  ).flat()
  for (const filePath of files) {
    if (!/\.(?:ts|tsx|js|jsx)$/.test(filePath)) continue
    const source = await readFile(filePath, 'utf8')
    for (const forbidden of forbiddenText) {
      if (forbidden.expression.test(source)) {
        errors.push(
          `Atomic Code remains: ${path.relative(root, filePath)} contains ${forbidden.label}`
        )
      }
    }
  }

  return errors
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const errors = await verifyTree(options)
  if (errors.length > 0) {
    process.stderr.write(`${errors.join('\n')}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write('Selective v2.0.32 boundaries verified.\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
