---
date: 2026-09-10
title: "Store media provider credentials in the OS credential store, never in localStorage"
---

# 2026-09-10 — Store media provider credentials in the OS credential store, never in localStorage

- **Context:** The model-agnostic media platform made providers a list rather
  than one bundled local worker, and the user confirmed (tracker decision Q2)
  that cloud providers are in scope. A cloud provider needs an API key, so the
  app has to hold one. The plan contradicted itself on where: Task 4 Step 4 said
  secrets are "stored the same way cloud LLM provider keys already are" AND
  "never in localStorage", which cannot both be true, since that is where the
  existing LLM keys live. Raised as tracker decision D3 rather than resolved by
  picking a side quietly.

  Three alternatives were put to the user and rejected by them: `localStorage`
  (plaintext, readable by anything that can run script in the webview);
  `tauri-plugin-store` (already a dependency, but plaintext on disk); and
  reusing the existing LLM-provider key path (consistent, but propagates the
  weaker storage to a new surface rather than fixing it).

- **Decision:** Media provider credentials live in the operating system's
  credential store — Windows Credential Manager, macOS Keychain, Linux Secret
  Service. A provider descriptor carries only `auth.setting_key`, a POINTER
  naming where the credential is kept; the credential itself never enters the
  provider store, `localStorage`, or the descriptor, and is never rendered into
  the DOM. The frontend reaches it through exactly one seam,
  `web-app/src/services/media/secrets.ts`, so the backing store can change
  without touching any component.

- **Consequences:**
  - Adds runtime crates, named and approved in advance by the user under tracker
    decision Q5 and `AGENTS.md` rule 6. Approval was scoped to credential
    storage only — it is not a blanket yes to new dependencies. Two corrections
    were made against the registry rather than taken on trust:
    - **`keyring-core` 1.0, not `keyring` 4.2.** At 4.2 the `keyring` crate is
      the all-in-one CLI (`pub mod cli; pub use cli::*`); depending on it as a
      library would pull a command-line tool's dependency tree into the app.
      `keyring-core` is the library the platform backends already require, and
      is what Q5's "keyring 4.2 (core)" meant.
    - **`zbus-secret-service-keyring-store`, not the `dbus` one.** Q5 approved
      either. The dbus backend pulls `libdbus-sys`, which links the system C
      library and would have made `libdbus-1-dev` a NEW build requirement for
      Linux. The zbus backend is pure Rust, and this crate already depends on
      `zbus` 5. Net effect on `Cargo.lock`: six pure-Rust packages, no `-sys`
      crate, no new system dependency.
  - **Raises the app crate's MSRV from 1.77.2 to 1.88**, because `keyring-core`
    requires 1.85 and the platform backends require 1.88. The old declaration
    had silently become false; a build on an older toolchain would have failed
    anyway, with a confusing resolver error rather than "requires rustc 1.88".
    CI is unaffected — it installs `dtolnay/rust-toolchain@stable`. The plugin
    crates under `src-tauri/plugins/` keep `rust-version = "1.77.2"`, which
    remains accurate: none of them depend on keyring.
  - A Linux user without a Secret Service provider (a headless box, or a
    minimal desktop) has nowhere to store a key. That must surface as a clear
    "credential storage unavailable" state, not as a silent failure to
    authenticate.
  - Tests must never write to the developer's real credential store. The OS
    call therefore sits behind a small trait with an in-memory implementation
    used by unit tests.
  - Between Task 12 and Task 18 the seam existed with a SESSION-ONLY in-memory
    backing store, and the UI said so plainly rather than implying a key had
    been saved. That was deliberate: persisting a key before this decision was
    implemented would have meant contradicting D3 or inventing a security design
    nobody approved.
  - The gap between "cloud providers are in scope" and "cloud providers can hold
    a key" was not in the original plan at all; it was found by auditing all 128
    steps and added as Task 18 (tracker decision D14).

- **Owner:** `team`

- **Links:**
  - Tracker: `docs/superpowers/plans/2026-09-08-model-agnostic-atomic-media-platform-tracker.xlsx`,
    decisions Q2, Q5, D3, D14.
  - Plan: `docs/superpowers/plans/2026-09-08-model-agnostic-atomic-media-platform.md`.
  - Seam: `web-app/src/services/media/secrets.ts`.
  - Consumer: `web-app/src/services/media/adapters/remoteHttp.ts`, which refuses
    to build a request rather than send a blank `Authorization` header.
