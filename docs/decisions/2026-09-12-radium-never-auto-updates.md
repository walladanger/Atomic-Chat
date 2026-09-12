---
date: 2026-09-12
title: "Radium never auto-updates: remove the updater rather than repoint it"
---

# 2026-09-12 — Radium never auto-updates: remove the updater rather than repoint it

- **Context:** The shipped app was offering an update, and the user asked what
  it was. The Tauri updater endpoint in `tauri.conf.json` was
  `https://github.com/AtomicBot-ai/Atomic-Chat/releases/latest/download/latest.json`
  — **upstream's** repository, not this fork's. Radium is a fork of Atomic
  Chat, so accepting that update did not update Radium: it installed Atomic
  Chat over the top of it, removing the Radium Media platform and every other
  change this fork carries from the user's machine. The v2.0.35 sync quiets
  the prompt only until upstream tags 2.0.36.

  Repointing was considered first and rejected: a fork with no release channel
  of its own has nothing to point at, and inventing one — signing keys,
  a `latest.json`, a publishing pipeline — is a much larger commitment than
  the problem requires today. Leaving the feature present but pointed at
  nothing was also rejected, because a dormant endpoint is one config edit
  away from shipping the same bug again.

  The user's instruction was explicit: never auto-update, and take the feature
  offline if possible.

- **Decision:** Remove the update capability outright rather than disable it
  by configuration. Gone: the `plugins.updater` block and its endpoint, the
  `tauri-plugin-updater` dependency and its registration in `lib.rs`, the
  `updater:default` / `updater:allow-check` capabilities, the whole
  `src-tauri/src/core/updater` module (custom HMAC updater, session, client),
  the two desktop-only IPC commands, the Tauri updater service on the frontend,
  and the periodic check in `DataProvider`. `AUTO_UPDATER_DISABLED` is now
  hardcoded `true` in `vite.config.ts` rather than read from the environment,
  so no build can switch it back on.

  The `updater()` seam on the service hub stays, permanently bound to the
  existing no-op `DefaultUpdaterService`. That is deliberate: it keeps the
  remaining callers compiling without a sprawling refactor, and the no-op
  never touches the network.

  `useReleaseNotes` was deleted in the same change. It fetched
  `api.github.com/repos/AtomicBot-ai/Atomic-Chat/releases` and had no callers
  at all — dead code that phoned upstream.

- **Consequences:** Radium cannot silently become Atomic Chat, and the app
  makes no update-related network call. The cost is that updates are now
  entirely manual: a new build has to be installed by hand, and there is no
  mechanism to tell users a build exists. That is the right trade only while
  this fork has no release channel; if it gains one, this record should be
  superseded rather than quietly reversed.

  `tests/no-auto-update.test.mjs` locks all six properties and runs in
  `make test-hardening-contracts`, so re-adding an updater fails the build
  until someone deletes the guard deliberately and writes a record saying why.

  Watch for: the wider dependency on upstream's infrastructure is unchanged.
  The backend manifest, provider registry, media registry, model catalog and
  staff picks are all still served from `AtomicBot-ai/atomic-chat-conf`. That
  is tracked separately as Task 20.

- **Owner:** @walladanger
- **Links:** `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`,
  `web-app/src/services/index.ts`, `web-app/vite.config.ts`,
  `tests/no-auto-update.test.mjs`, tracker Task 20.
