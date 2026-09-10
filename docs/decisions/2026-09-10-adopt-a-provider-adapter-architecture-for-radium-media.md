---
date: 2026-09-10
title: "Adopt a provider-adapter architecture for Radium Media"
---

# 2026-09-10 — Adopt a provider-adapter architecture for Radium Media

- **Context:** Media generation spoke to exactly one thing: a local worker, at a
  hardcoded address, with its request shape spread across the UI. `atomicMedia`
  was not a provider, it was the only truth the feature had. Adding a second
  backend meant editing the form, the hook and the client together, and the
  form's `MODES` list decided which tasks existed at all — a model offering
  `image_to_image` was unreachable however it was configured (coupling C3).

  The seam could have gone inside the worker: teach it to proxy other backends
  and keep one client. That was rejected. It would make every new provider a
  change to a separate binary the app does not ship, and would put the app's
  compatibility story inside something it cannot version together.

- **Decision:** The seam is an ADAPTER in the app. `MediaProviderAdapter` is the
  interface; each backend is one implementation, built from a descriptor by
  `providerFactory`. Nothing above the adapter knows which provider it holds.
  Every adapter must pass one shared conformance suite, imported unmodified.

- **Consequences:**
  - The conformance suite is the lasting artefact: 30 tests any future adapter
    must pass without editing them. It is what stops "adapter" degrading into
    "whatever this backend happens to do".
  - Proven, not asserted: the ComfyUI adapter was written against the contract
    without changing it. The THIRD adapter broke it — a synchronous provider
    that answers in the submit response — which is exactly the risk the plan
    named (R3) and is recorded as decision D7.
  - One provider being down, slow or malformed cannot affect another: health,
    capabilities and errors are all keyed per provider, and refresh uses
    `allSettled` with a per-provider timeout.
  - Cost: a request now crosses one more boundary, and a provider's own
    vocabulary must be translated at its adapter rather than leaking upward.

- **Owner:** `team`

- **Links:** `web-app/src/services/media/adapters/`, `providerFactory.ts`,
  `adapters/__tests__/conformance.ts`; tracker Tasks 3–6, decision D7.
