//! Media provider credentials, kept in the operating system's credential store.
//!
//! See `docs/decisions/2026-09-10-store-media-provider-credentials-in-the-os-credential-store.md`.
//!
//! Windows Credential Manager, macOS Keychain, Linux Secret Service. Never
//! `localStorage`, never `tauri-plugin-store`, never the provider descriptor -
//! the descriptor carries only `auth.setting_key`, a POINTER naming where the
//! credential lives.
//!
//! ## Why a trait sits in front of `keyring`
//!
//! Two reasons, both practical rather than architectural taste:
//!
//! 1. `cargo test` must never write to the developer's REAL credential store.
//!    A unit test that called the OS directly would leave entries behind on the
//!    machine that ran it, and would fail on any box without a Secret Service.
//! 2. A Linux user can genuinely have no credential store at all - a headless
//!    box, or a minimal desktop. That has to surface as a nameable state, not
//!    as a mysterious authentication failure.
//!
//! So the OS call is one thin implementation of `CredentialStore`, and every
//! rule about key shape, absence and idempotency is tested against an in-memory
//! one.

use std::collections::HashMap;
use std::sync::Mutex;

/// What a media credential store must be able to do.
///
/// Deliberately tiny. Anything richer would be a store this app does not need
/// and cannot test against three different platform backends.
pub trait CredentialStore: Send + Sync {
    fn set(&self, key: &str, secret: &str) -> Result<(), CredentialError>;
    fn get(&self, key: &str) -> Result<Option<String>, CredentialError>;
    fn delete(&self, key: &str) -> Result<(), CredentialError>;
}

#[derive(Debug, PartialEq, Eq)]
pub enum CredentialError {
    /// The key was empty or malformed. Never reaches the OS.
    InvalidKey(String),
    /// There is no credential store on this machine. Expected on Linux without
    /// a Secret Service provider, and on headless installs.
    Unavailable(String),
    /// The store exists but refused. Carries the backend's own words.
    Backend(String),
}

impl std::fmt::Display for CredentialError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidKey(detail) => write!(f, "invalid credential key: {detail}"),
            Self::Unavailable(detail) => {
                write!(f, "no credential store is available: {detail}")
            }
            Self::Backend(detail) => write!(f, "credential store error: {detail}"),
        }
    }
}

/// Keys are app-generated (`media.<provider-id>.api_key`), never user text, so
/// this rejects rather than sanitises: a key that does not look right means a
/// caller bug, and quietly repairing it would store the credential somewhere
/// the next read would not look.
pub fn validate_key(key: &str) -> Result<(), CredentialError> {
    if key.is_empty() {
        return Err(CredentialError::InvalidKey("the key is empty".into()));
    }
    if key.len() > 256 {
        return Err(CredentialError::InvalidKey("the key is too long".into()));
    }
    if key.chars().any(|c| c.is_control()) {
        return Err(CredentialError::InvalidKey(
            "the key contains a control character".into(),
        ));
    }
    Ok(())
}

/// An in-memory store. Tests only - it is not exported to the app.
#[derive(Default)]
pub struct MemoryCredentialStore {
    entries: Mutex<HashMap<String, String>>,
}

impl CredentialStore for MemoryCredentialStore {
    fn set(&self, key: &str, secret: &str) -> Result<(), CredentialError> {
        validate_key(key)?;
        self.entries
            .lock()
            .map_err(|e| CredentialError::Backend(e.to_string()))?
            .insert(key.to_string(), secret.to_string());
        Ok(())
    }

    fn get(&self, key: &str) -> Result<Option<String>, CredentialError> {
        validate_key(key)?;
        Ok(self
            .entries
            .lock()
            .map_err(|e| CredentialError::Backend(e.to_string()))?
            .get(key)
            .cloned())
    }

    fn delete(&self, key: &str) -> Result<(), CredentialError> {
        validate_key(key)?;
        self.entries
            .lock()
            .map_err(|e| CredentialError::Backend(e.to_string()))?
            .remove(key);
        Ok(())
    }
}

// --- the real thing ----------------------------------------------------------

/// Desktop only. Mobile has its own credential story and no media providers.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod os {
    use super::{validate_key, CredentialError, CredentialStore};
    use std::sync::OnceLock;

    /// The service name every Radium Media credential is filed under. Changing
    /// it orphans every key a user has already saved, so it is a constant, not
    /// a setting.
    const SERVICE: &str = "Radium Chat — Media";

    /// Registering the platform store is a process-wide, one-time act. The
    /// result is cached because a machine that has no credential store will not
    /// grow one while the app is running, and retrying per call would mean a
    /// failed DBus round trip on every keystroke.
    fn ensure_store() -> Result<(), CredentialError> {
        static READY: OnceLock<Result<(), String>> = OnceLock::new();

        READY
            .get_or_init(|| {
                if keyring_core::get_default_store().is_some() {
                    return Ok(());
                }

                #[cfg(target_os = "windows")]
                let store = windows_native_keyring_store::Store::new()
                    .map(|s| s as std::sync::Arc<keyring_core::api::CredentialStore>);

                #[cfg(target_os = "macos")]
                let store = apple_native_keyring_store::keychain::Store::new()
                    .map(|s| s as std::sync::Arc<keyring_core::api::CredentialStore>);

                #[cfg(target_os = "linux")]
                let store = zbus_secret_service_keyring_store::Store::new()
                    .map(|s| s as std::sync::Arc<keyring_core::api::CredentialStore>);

                match store {
                    Ok(store) => {
                        keyring_core::set_default_store(store);
                        Ok(())
                    }
                    // The expected Linux case: no Secret Service provider, on a
                    // headless box or a minimal desktop. Named, so the UI can
                    // say "credential storage unavailable" rather than leaving
                    // the user with an authentication failure they cannot act
                    // on.
                    Err(cause) => Err(cause.to_string()),
                }
            })
            .clone()
            .map_err(CredentialError::Unavailable)
    }

    fn entry(key: &str) -> Result<keyring_core::Entry, CredentialError> {
        validate_key(key)?;
        ensure_store()?;
        keyring_core::Entry::new(SERVICE, key)
            .map_err(|cause| CredentialError::Backend(cause.to_string()))
    }

    /// The OS credential store: Windows Credential Manager, macOS Keychain,
    /// Linux Secret Service.
    pub struct OsCredentialStore;

    impl CredentialStore for OsCredentialStore {
        fn set(&self, key: &str, secret: &str) -> Result<(), CredentialError> {
            entry(key)?
                .set_password(secret)
                // The backend's own words only. `secret` is never interpolated
                // into an error - an error object is the most likely thing to
                // reach a log line or a crash report.
                .map_err(|cause| CredentialError::Backend(cause.to_string()))
        }

        fn get(&self, key: &str) -> Result<Option<String>, CredentialError> {
            match entry(key)?.get_password() {
                Ok(secret) => Ok(Some(secret)),
                // Absence is the normal state for a provider with no key yet.
                Err(keyring_core::Error::NoEntry) => Ok(None),
                Err(cause) => Err(CredentialError::Backend(cause.to_string())),
            }
        }

        fn delete(&self, key: &str) -> Result<(), CredentialError> {
            match entry(key)?.delete_credential() {
                Ok(()) => Ok(()),
                // Deleting a provider that never had a key must not fail.
                Err(keyring_core::Error::NoEntry) => Ok(()),
                Err(cause) => Err(CredentialError::Backend(cause.to_string())),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> MemoryCredentialStore {
        MemoryCredentialStore::default()
    }

    #[test]
    fn stores_and_returns_a_secret() {
        let store = store();
        store.set("media.cloud.api_key", "sk-secret").unwrap();

        assert_eq!(
            store.get("media.cloud.api_key").unwrap(),
            Some("sk-secret".to_string())
        );
    }

    #[test]
    fn a_missing_key_is_none_rather_than_an_error() {
        // Absence is the normal state for a provider the user has not
        // configured. Treating it as an error would make every caller
        // distinguish "no key yet" from "the store is broken".
        assert_eq!(store().get("media.nothing.api_key").unwrap(), None);
    }

    #[test]
    fn overwrites_rather_than_duplicating() {
        let store = store();
        store.set("media.cloud.api_key", "old").unwrap();
        store.set("media.cloud.api_key", "new").unwrap();

        assert_eq!(
            store.get("media.cloud.api_key").unwrap(),
            Some("new".to_string())
        );
    }

    #[test]
    fn delete_removes_the_secret() {
        let store = store();
        store.set("media.cloud.api_key", "sk-secret").unwrap();
        store.delete("media.cloud.api_key").unwrap();

        assert_eq!(store.get("media.cloud.api_key").unwrap(), None);
    }

    #[test]
    fn deleting_something_absent_is_not_an_error() {
        // The user removing a provider that never had a key must not produce a
        // failure they cannot act on.
        assert!(store().delete("media.never.api_key").is_ok());
    }

    #[test]
    fn keys_are_isolated_from_each_other() {
        let store = store();
        store.set("media.a.api_key", "a-secret").unwrap();
        store.set("media.b.api_key", "b-secret").unwrap();
        store.delete("media.a.api_key").unwrap();

        assert_eq!(store.get("media.a.api_key").unwrap(), None);
        assert_eq!(
            store.get("media.b.api_key").unwrap(),
            Some("b-secret".to_string())
        );
    }

    #[test]
    fn rejects_an_empty_key_before_reaching_the_os() {
        assert!(matches!(
            store().set("", "sk-secret"),
            Err(CredentialError::InvalidKey(_))
        ));
    }

    #[test]
    fn rejects_a_key_containing_a_control_character() {
        // A newline in a key can split a request or a config line in some
        // backends. Rejected rather than sanitised: a mangled key would store
        // the credential where the next read will not look for it.
        assert!(matches!(
            store().set("media.cloud\n.api_key", "sk-secret"),
            Err(CredentialError::InvalidKey(_))
        ));
    }

    #[test]
    fn an_error_never_contains_the_secret() {
        // An error is the single most likely thing to reach a log line or a
        // crash report, so it must not carry the credential.
        let error = store().set("", "sk-super-secret-value").unwrap_err();

        assert!(!format!("{error}").contains("sk-super-secret-value"));
        assert!(!format!("{error:?}").contains("sk-super-secret-value"));
    }
}
