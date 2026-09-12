/**
 * Radium never auto-updates, and this is the guard that keeps it that way.
 *
 * The updater used to point at `AtomicBot-ai/Atomic-Chat/releases`, which is
 * upstream's repository, not this fork's. Accepting an update therefore
 * installed Atomic Chat OVER Radium - taking the Radium Media platform and
 * every other change in this fork off the user's machine. That is not a
 * hypothetical: the prompt was appearing in the shipped app.
 *
 * The feature was removed rather than repointed, because a fork with no
 * release channel of its own has nothing to point at. If Radium ever gains
 * one, re-enabling is a deliberate act that has to delete these assertions
 * and say why in a decision record - which is exactly the friction intended.
 *
 * See docs/decisions/2026-09-12-radium-never-auto-updates.md.
 */
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8')

test('no updater endpoint is configured anywhere', () => {
  for (const rel of [
    'src-tauri/tauri.conf.json',
    'src-tauri/tauri.windows.conf.json',
    'src-tauri/tauri.macos.conf.json',
    'src-tauri/tauri.linux.conf.json',
  ]) {
    if (!existsSync(path.join(repoRoot, rel))) continue
    const config = JSON.parse(read(rel))
    assert.equal(
      config.plugins?.updater,
      undefined,
      `${rel} declares an updater endpoint; Radium must not auto-update`
    )
  }
})

test('the Tauri updater plugin is not a dependency and is never registered', () => {
  assert.ok(
    !/^tauri-plugin-updater\s*=/m.test(read('src-tauri/Cargo.toml')),
    'src-tauri/Cargo.toml still depends on tauri-plugin-updater'
  )
  assert.ok(
    !read('src-tauri/src/lib.rs').includes('tauri_plugin_updater'),
    'lib.rs still registers the Tauri updater plugin'
  )
})

test('the updater capability is not granted', () => {
  const capabilities = JSON.parse(read('src-tauri/capabilities/default.json'))
  const granted = JSON.stringify(capabilities.permissions ?? [])
  assert.ok(
    !granted.includes('updater:'),
    'default.json still grants an updater permission'
  )
})

test('the Rust updater module is gone', () => {
  assert.ok(
    !existsSync(path.join(repoRoot, 'src-tauri/src/core/updater')),
    'src-tauri/src/core/updater still exists'
  )
})

test('the frontend has no Tauri updater service to swap in', () => {
  assert.ok(
    !existsSync(path.join(repoRoot, 'web-app/src/services/updater/tauri.ts')),
    'web-app/src/services/updater/tauri.ts still exists'
  )
  assert.ok(
    !read('web-app/src/services/index.ts').includes('TauriUpdaterService'),
    'the service hub still swaps in a Tauri updater service'
  )
})

test('AUTO_UPDATER_DISABLED is hardcoded, not read from the environment', () => {
  const config = read('web-app/vite.config.ts')
  assert.ok(
    /AUTO_UPDATER_DISABLED:\s*JSON\.stringify\(true\)/.test(config),
    'AUTO_UPDATER_DISABLED must be hardcoded true, so no build can turn it on'
  )
})
