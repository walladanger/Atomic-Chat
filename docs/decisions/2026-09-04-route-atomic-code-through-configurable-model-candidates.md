---
date: 2026-09-04
title: "Route Atomic Code through configurable model candidates"
---

# 2026-09-04 — Route Atomic Code through configurable model candidates

- **Context:** Atomic Code needs a fast laptop-safe default and optional
  escalation without assuming a particular GPU, model, or provider. Atomic
  Chat already owns the provider catalog and model lifecycle.
- **Decision:** Keep routing as a pure service over normalized, configurable
  provider/model candidates. Prefer small available local candidates in Auto,
  allow external fallback, and represent unavailable escalation explicitly
  rather than coupling Code startup to a large model.
- **Consequences:** The Code workspace can start with no large local model and
  future workers can reuse the same route decision. Actual model handoff and
  coding tools remain separate later milestones; candidate metadata quality
  determines route quality.
- **Owner:** team.
- **Links:** [`web-app/src/services/model-router/`](../../web-app/src/services/model-router/),
  [`web-app/src/containers/code/CodeWorkspace.tsx`](../../web-app/src/containers/code/CodeWorkspace.tsx).
