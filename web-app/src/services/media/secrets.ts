/**
 * Where a media provider's API key lives.
 *
 * The OS credential store: Windows Credential Manager, macOS Keychain, Linux
 * Secret Service. See
 * `docs/decisions/2026-09-10-store-media-provider-credentials-in-the-os-credential-store.md`.
 *
 * NOT `localStorage`, NOT `tauri-plugin-store`, and NOT the provider store. A
 * descriptor carries only `auth.setting_key`, a POINTER naming where the
 * credential is kept; the credential itself never enters the descriptor, the
 * store, or the DOM.
 *
 * Task 12 shipped this file as a seam over an in-memory map, because the OS
 * side did not exist yet and persisting a key would have meant contradicting
 * D3 or inventing a security design nobody approved. Task 18 replaced the
 * backing store, which is exactly the change the seam existed to make: nothing
 * outside this file had to move.
 *
 * Everything here is async now, because the credential store is across the IPC
 * boundary. That is the one visible cost of the move.
 */

import { invoke } from '@tauri-apps/api/core'

/**
 * Names where a provider's credential is kept. Stored on the descriptor as
 * `auth.setting_key`; the credential itself is never written there.
 *
 * The shape is load-bearing: changing it orphans every key a user has already
 * saved, because the old name is what the credential is filed under.
 */
export function mediaSecretKey(providerId: string): string {
  return `media.${providerId}.api_key`
}

/** Read a credential by the key a descriptor names. Used by the adapters. */
export async function readMediaSecret(
  settingKey: string
): Promise<string | undefined> {
  const secret = await invoke<string | null>('media_secret_get', {
    key: settingKey,
  })
  return secret ?? undefined
}

export async function setMediaProviderSecret(
  providerId: string,
  secret: string
): Promise<void> {
  const trimmed = secret.trim()
  const key = mediaSecretKey(providerId)

  // An emptied field means "forget it", not "store an empty string" - which
  // would otherwise satisfy a has-a-key check while failing every request.
  if (!trimmed) {
    await invoke('media_secret_delete', { key })
    return
  }

  await invoke('media_secret_set', { key, secret: trimmed })
}

export async function getMediaProviderSecret(
  providerId: string
): Promise<string | undefined> {
  return readMediaSecret(mediaSecretKey(providerId))
}

export async function hasMediaProviderSecret(
  providerId: string
): Promise<boolean> {
  return (await getMediaProviderSecret(providerId)) !== undefined
}

export async function clearMediaProviderSecret(
  providerId: string
): Promise<void> {
  await invoke('media_secret_delete', { key: mediaSecretKey(providerId) })
}

/**
 * Whether this machine can store a credential at all.
 *
 * The expected false case is Linux without a Secret Service provider - a
 * headless box, or a minimal desktop. The settings UI asks BEFORE offering to
 * save a key, so the user is told up front rather than discovering it when a
 * generation fails to authenticate later.
 */
export async function mediaSecretStorageAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>('media_secret_available')
  } catch {
    // An older shell without the command, or IPC unavailable. Treated as "no
    // storage" rather than throwing: the caller's question is answerable.
    return false
  }
}

/**
 * How durable the backing store is. Kept so callers can explain themselves to
 * the user without knowing the implementation.
 */
export const MEDIA_SECRET_PERSISTENCE: 'session' | 'credential-store' =
  'credential-store'
