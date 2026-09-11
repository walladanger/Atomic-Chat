---
date: 2026-09-10
title: "Cloud media providers are in scope, behind one remote HTTP adapter"
---

# 2026-09-10 — Cloud media providers are in scope, behind one remote HTTP adapter

- **Context:** Whether to support hosted media providers at all was left open
  deliberately (tracker Q2). Answering "local only" would have removed the work
  cleanly and cost nothing structural, since the adapter seam exists either way
  and a remote adapter could be added later. The user was told the consequences
  before answering: the app must then hold an API key, which makes credential
  storage a real security decision, and cloud generations cost him money.

- **Decision:** Cloud providers are in scope, served by one `remoteHttp` adapter
  speaking the OpenAI-compatible images shape, configured per provider rather
  than special-cased per vendor.

- **Consequences:**
  - This is the adapter that broke the contract, which is precisely what the
    plan predicted might happen on adapter three (risk R3). A hosted provider
    can answer in the SUBMIT response rather than creating a pollable job, so
    the contract gained `features.synchronous` and `poll` had to mean two
    different things — for a synchronous provider it reads an already-paid-for
    result and must never reach the network again, because a second request
    would generate, and charge, twice. Recorded as decision D7.
  - The adapter refuses to build a request when no credential resolves, rather
    than sending a blank `Authorization` header — an unconfigured provider says
    so instead of producing an opaque 401.
  - The credential itself is out of scope here and has its own record; see
    `2026-09-10-store-media-provider-credentials-in-the-os-credential-store.md`.
    Between Tasks 6 and 18 this adapter existed but was unusable, which was
    tracked as decision D14 rather than left as a surprise.
  - Cost falls on the user, so `cost` is carried on a model descriptor for
    display and is NEVER used to gate submission.

- **Owner:** `team`

- **Links:** `web-app/src/services/media/adapters/remoteHttp.ts`;
  tracker Task 6, Task 18, decisions Q2, D7, D14.
