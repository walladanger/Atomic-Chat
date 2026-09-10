---
date: 2026-09-10
title: "Media models and providers come from atomic-chat-conf"
---

# 2026-09-10 — Media models and providers come from `atomic-chat-conf`

- **Context:** The bundled media baseline is a single local worker. Shipping any
  further provider or model list inside the app means a release to change it,
  and the app already solved this once: LLM providers come from a remote
  registry in `atomic-chat-conf`, loaded by `provider-registry.ts`, with a
  bundled fallback.

- **Decision:** Media providers and models come from the same place, by the same
  mechanism — a structural clone of the existing provider registry rather than a
  second, differently-shaped remote-config system. Registry entries arrive with
  `origin: 'registry'` and NEVER overwrite a user's own edits.

- **Consequences:**
  - **NOT YET IMPLEMENTED.** This records the decision, not shipped code. The
    work is tracker Task 15, which the user deliberately DEFERRED on 2026-09-10
    in favour of reaching a usable product sooner. The decision is recorded now
    because it is what the surrounding code was shaped for — `origin` already
    distinguishes `builtin` / `registry` / `user`, and the store's merge already
    lets a persisted entry win outright.
  - Whoever implements it inherits the existing registry's failure discipline:
    the loader must sanitise aggressively and never let a malformed or hostile
    remote document break the Media surface. A remote list that can add a
    provider is a remote list that can add a URL the app will talk to.
  - It needs a companion change in `atomic-chat-conf` — the schema and the
    document — which is a second repository and outside this plan's gate.
  - Until it lands, `BASELINE_MEDIA_PROVIDERS` remains the only source, which is
    exactly one bundled local worker and therefore no behaviour change for
    anyone who has not added a provider by hand.

- **Owner:** `team`

- **Links:** `web-app/src/constants/mediaProviders.ts`,
  `web-app/src/stores/media-provider-store.ts`, `services/provider-registry.ts`
  (the pattern being cloned); tracker Task 15.
