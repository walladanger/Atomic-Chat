/**
 * The credential seam (Task 18 / decision D14).
 *
 * The IPC boundary is stubbed, never the module under test. That is deliberate
 * twice over: it keeps these tests exercising the real key-naming and the real
 * empty/absent handling, and it guarantees the suite can never write to the
 * developer's actual Windows Credential Manager or macOS Keychain.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearMediaProviderSecret,
  getMediaProviderSecret,
  hasMediaProviderSecret,
  mediaSecretKey,
  mediaSecretStorageAvailable,
  readMediaSecret,
  setMediaProviderSecret,
} from '../secrets'

const { calls, store, state } = vi.hoisted(() => ({
  calls: [] as Array<{ command: string; args: Record<string, unknown> }>,
  store: new Map<string, string>(),
  state: { availableThrows: false, available: true },
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: Record<string, unknown> = {}) => {
    calls.push({ command, args })
    const key = args.key as string
    switch (command) {
      case 'media_secret_set':
        store.set(key, args.secret as string)
        return undefined
      case 'media_secret_get':
        return store.get(key) ?? null
      case 'media_secret_delete':
        store.delete(key)
        return undefined
      case 'media_secret_available':
        if (state.availableThrows) throw new Error('no IPC')
        return state.available
      default:
        throw new Error(`unexpected command ${command}`)
    }
  },
}))

beforeEach(() => {
  calls.length = 0
  store.clear()
  state.availableThrows = false
  state.available = true
})

describe('key naming', () => {
  it('files a credential under a stable, provider-qualified name', () => {
    // Load-bearing: changing this shape orphans every key a user has saved,
    // because the old name is what the credential is filed under.
    expect(mediaSecretKey('cloud-images')).toBe('media.cloud-images.api_key')
  })
})

describe('storing a credential', () => {
  it('round-trips through the credential store', async () => {
    await setMediaProviderSecret('cloud', 'sk-secret')

    expect(await getMediaProviderSecret('cloud')).toBe('sk-secret')
    expect(await hasMediaProviderSecret('cloud')).toBe(true)
  })

  it('trims what it stores', async () => {
    await setMediaProviderSecret('cloud', '  sk-secret  ')

    expect(await getMediaProviderSecret('cloud')).toBe('sk-secret')
  })

  it('treats an emptied field as "forget it", not as an empty key', async () => {
    await setMediaProviderSecret('cloud', 'sk-secret')
    await setMediaProviderSecret('cloud', '   ')

    // Asserted here, before the reads below become the most recent call: the
    // blank value must reach the store as a DELETE, not as a set of "".
    expect(calls.at(-1)?.command).toBe('media_secret_delete')

    // Storing "" would satisfy a has-a-key check and then fail every request.
    expect(await getMediaProviderSecret('cloud')).toBeUndefined()
    expect(await hasMediaProviderSecret('cloud')).toBe(false)
  })

  it('reports a provider with no credential as undefined, not an error', async () => {
    expect(await getMediaProviderSecret('never-configured')).toBeUndefined()
  })

  it('forgets a credential on request', async () => {
    await setMediaProviderSecret('cloud', 'sk-secret')
    await clearMediaProviderSecret('cloud')

    expect(await getMediaProviderSecret('cloud')).toBeUndefined()
  })
})

describe('reading by the key a descriptor names', () => {
  it('resolves the credential the adapter asks for', async () => {
    await setMediaProviderSecret('cloud', 'sk-secret')

    // This is the path providerFactory hands to the remote adapter.
    expect(await readMediaSecret('media.cloud.api_key')).toBe('sk-secret')
  })

  it('resolves to undefined for a key that was never written', async () => {
    // The adapter turns this into "no API key configured" rather than sending
    // a blank Authorization header.
    expect(await readMediaSecret('media.absent.api_key')).toBeUndefined()
  })
})

describe('machines without a credential store', () => {
  it('reports availability when the shell answers', async () => {
    state.available = false

    expect(await mediaSecretStorageAvailable()).toBe(false)
  })

  it('answers "no storage" rather than throwing when IPC is unavailable', async () => {
    // An older shell without the command. The caller's question is still
    // answerable, and an exception here would break the settings screen.
    state.availableThrows = true

    expect(await mediaSecretStorageAvailable()).toBe(false)
  })
})
