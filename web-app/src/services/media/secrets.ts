/**
 * Where a media provider's API key lives.
 *
 * THIS IS A SEAM, NOT A SECRET STORE. It exists so the settings UI has exactly
 * one place to hand a credential to, and so that replacing the backing store is
 * a one-file change rather than a hunt through components.
 *
 * Today the backing store is an in-memory Map, which means:
 *  - the key survives navigation within a session, and
 *  - it is GONE on relaunch, and the user is told so by the UI.
 *
 * It is deliberately NOT localStorage and NOT the provider store. Decision D3
 * settled that provider secrets belong in the OS credential store (Windows
 * Credential Manager, macOS Keychain, Linux Secret Service) and explicitly
 * rejected both localStorage and "the same way cloud LLM provider keys already
 * are". Q5 approved the four crates needed to build that.
 *
 * That Rust work is not scheduled anywhere in the media platform plan - see
 * decision D14, which is open. Until it lands, persisting a key would mean
 * either contradicting D3 or inventing a security design nobody agreed to, so
 * this module does neither: it holds the key for the session, in memory, and
 * says as much.
 *
 * When the credential store lands, replace the three functions below with calls
 * into it. Nothing else in the app should need to change.
 */

const sessionSecrets = new Map<string, string>()

/**
 * Names where a provider's credential is kept. Stored on the descriptor as
 * `auth.setting_key`; the credential itself is never written there.
 */
export function mediaSecretKey(providerId: string): string {
  return `media.${providerId}.api_key`
}

export function setMediaProviderSecret(providerId: string, secret: string) {
  const trimmed = secret.trim()
  if (!trimmed) {
    sessionSecrets.delete(providerId)
    return
  }
  sessionSecrets.set(providerId, trimmed)
}

export function getMediaProviderSecret(providerId: string): string | undefined {
  return sessionSecrets.get(providerId)
}

export function hasMediaProviderSecret(providerId: string): boolean {
  return sessionSecrets.has(providerId)
}

export function clearMediaProviderSecret(providerId: string) {
  sessionSecrets.delete(providerId)
}

/**
 * How durable the current backing store is. The UI reads this to tell the user
 * the truth rather than implying a key was saved permanently. Flip this to
 * 'credential-store' in the same change that wires the OS keychain.
 */
export const MEDIA_SECRET_PERSISTENCE: 'session' | 'credential-store' =
  'session'
