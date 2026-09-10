---
date: 2026-09-10
title: "Media contract v2 uses declarative parameter schemas with an open task vocabulary"
---

# 2026-09-10 — Media contract v2 uses declarative parameter schemas with an open task vocabulary

- **Context:** v1 hand-wrote its controls. Roughly 180 lines of bespoke inputs
  lived in `MediaGenerationForm.tsx`, which was also frozen by the protected
  surface — so adding one parameter meant editing a file the guard defended
  (coupling C5). Tasks came from a hardcoded `MODES` array, so the set of things
  the product could do was a literal in the UI.

- **Decision:** A model declares its parameters as data — `MediaParamSpec`, with
  type, bounds, grouping, `depends_on` and modulus rules — and the UI renders
  whatever it is given. Task ids are an OPEN vocabulary: unknown tasks are
  rendered with their own id rather than dropped.

- **Consequences:**
  - Adding a parameter, or a whole task, becomes a provider-side change with no
    UI edit at all.
  - `visibleParams()` was extracted from `validateParams()` and exported, so the
    renderer decides what to DRAW using the same function that decides what to
    SUBMIT. A second `depends_on` implementation in the UI would have drifted
    from the first the moment either changed.
  - What is given up: exhaustiveness. The compiler can no longer tell us every
    task has a branch, because the set is not closed. That is the deliberate
    trade — an unknown task shown plainly beats a known-good model with no way
    to reach it.
  - A blank seed is resolved by the CALLER, not the provider, so the app always
    knows what it sent and provenance can be truthful (decision D8).

- **Owner:** `team`

- **Links:** `web-app/src/services/media/contract/params.ts`, `tasks.ts`;
  `containers/media/params/`; tracker Tasks 1, 10, decisions D8, D10.
