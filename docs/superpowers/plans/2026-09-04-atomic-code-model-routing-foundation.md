# Atomic Code Model-Routing Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a laptop-safe Code workspace and configurable model-routing foundation without changing existing Chat, Agent, or Media behavior.

**Architecture:** A pure router selects from normalized provider/model candidates and returns primary, fallback, and escalation decisions. A small persisted store owns only user strategy/manual preferences, while the Code route adapts existing Atomic Chat provider state into candidates and renders the decision.

**Tech Stack:** React 19, TypeScript, Zustand, TanStack Router, Vitest, Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-04-atomic-code-model-routing-foundation-design.md`

## Global Constraints

- Do not hard-code GPUs, model ids, or vendor-specific model routes.
- Reuse existing provider/model definitions and local-provider classification.
- Auto defaults to the smallest available local coding-capable candidate and falls back externally.
- Missing escalation candidates remain inactive and never block the primary route.
- Do not add runtime dependencies or redesign unrelated UI.

---

### Task 1: Pure model router

**Files:**
- Create: `web-app/src/services/model-router/types.ts`
- Create: `web-app/src/services/model-router/router.ts`
- Test: `web-app/src/services/model-router/router.test.ts`

**Interfaces:**
- Produces: `routeModel(request: ModelRouteRequest): ModelRouteDecision`
- Produces: `modelRouteKey(providerId: string, modelId: string): string`

- [ ] Write tests with literal candidate fixtures for Auto local-first selection,
  external fallback, Best Local fallback, Manual fallback, Fast no-escalation,
  and objective Auto escalation.
- [ ] Run `corepack yarn vitest run web-app/src/services/model-router/router.test.ts`
  and confirm failure because the router does not exist.
- [ ] Implement typed filtering and stable ranking: readiness, locality,
  relative performance/size, priority, then provider/model key.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit the router and tests.

### Task 2: Strategy state and provider adapter

**Files:**
- Create: `web-app/src/hooks/useModelStrategy.ts`
- Create: `web-app/src/hooks/useModelStrategy.test.ts`
- Create: `web-app/src/services/model-router/provider-adapter.ts`
- Create: `web-app/src/services/model-router/provider-adapter.test.ts`
- Modify: `web-app/src/constants/localStorage.ts`

**Interfaces:**
- Consumes: existing `ModelProvider[]`, selected provider/model, active model ids.
- Produces: `buildModelRouteCandidates(input): ModelRouteCandidate[]`
- Produces: persisted `strategy`, `manualModelKey`, `setStrategy`, and
  `setManualModelKey`.

- [ ] Write failing tests that prove the adapter excludes missing/inactive
  models, marks local registered models available, marks active models ready,
  preserves external candidates, and derives optional parameter hints without
  naming models.
- [ ] Write a failing store test proving Auto is the default and strategy/manual
  values update independently.
- [ ] Run both focused files and confirm expected missing-module failures.
- [ ] Implement the adapter and store with no credentials or hardware state.
- [ ] Re-run both focused files and confirm they pass.
- [ ] Commit the adapter and state.

### Task 3: Code workspace route and selector

**Files:**
- Modify: `web-app/src/constants/routes.ts`
- Modify: `web-app/src/containers/ChatAgentModeSwitch.tsx`
- Modify: `web-app/src/containers/ChatAgentModeSwitch.test.tsx`
- Create: `web-app/src/containers/code/CodeWorkspace.tsx`
- Create: `web-app/src/containers/code/CodeWorkspace.test.tsx`
- Create: `web-app/src/routes/code.tsx`
- Generated: `web-app/src/routeTree.gen.ts`

**Interfaces:**
- Consumes: router candidates, model strategy store, existing provider and app
  stores.
- Produces: `/code` workspace with Auto/Fast/Best Local/Manual controls and
  truthful primary/escalation/fallback status.

- [ ] Extend selector tests first to require a Code button, `/code` navigation,
  and active state; run them and confirm failure.
- [ ] Add Code workspace tests for strategy changes and no-model rendering;
  run them and confirm failure because the route/component does not exist.
- [ ] Add the route constant, selector branch, route, and minimal workspace UI.
- [ ] Run the focused selector/workspace/router suites and confirm they pass.
- [ ] Run the route generator through the normal web build so the generated
  route tree includes `/code`.
- [ ] Commit the workspace integration.

### Task 4: Decision record and verification

**Files:**
- Create: `docs/decisions/2026-09-04-route-atomic-code-through-configurable-model-candidates.md`
- Modify: `docs/decisions/INDEX.md`

**Interfaces:**
- Records the candidate-based, hardware-agnostic boundary for future coding
  workers.

- [ ] Add the ADR and index entry describing context, decision, consequences,
  ownership, and code links.
- [ ] Run all new and nearby workspace tests.
- [ ] Run `corepack yarn lint`, `make typecheck`, `corepack yarn build:web`, and
  `make verify`.
- [ ] Inspect `git diff --check`, `git status`, and the branch diff for scope.
- [ ] Commit verified documentation and any generated route update.
