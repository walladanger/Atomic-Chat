# Atomic Media Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved Media workspace and direct Atomic Media Worker integration, then make the main Windows Tauri window frameless while preserving existing Chat/Agent behavior.

**Architecture:** Extend the existing workspace switch and TanStack Router with a dedicated Media route. Keep all worker communication in a focused typed service/hook pair, and render the approved Media Studio UI using existing Atomic Chat primitives and theme tokens. Reuse the existing Tauri `WindowControls` component and apply Windows-only main-window decoration changes rather than replacing platform shell behavior globally.

**Tech Stack:** React 19, TypeScript, TanStack Router, Zustand, Tailwind/shadcn, Vitest, Tauri 2, Rust configuration.

**Spec:** `docs/superpowers/specs/2026-08-24-atomic-media-workspace-and-frameless-window-design.md`

## Global Constraints

- Do only what was asked; no opportunistic refactors.
- Preserve existing Chat, Agent, model-provider, settings, and localhost `:1337/v1` behavior.
- New user-facing and code identifiers use Atomic / Atomic Chat naming.
- Do not rename load-bearing legacy `jan*` or `@janhq/*` identifiers.
- Atomic Media Worker remains an external localhost service at `127.0.0.1:13420`; do not rebuild it in this feature.
- Device selection defaults to `auto`; do not hard-code the user's current GPU topology.
- No new runtime dependency unless separately approved.
- Commits go only to `feature/atomic-media-workspace` until reviewed.

---

### Task 1: Add a first-class Media workspace mode and route

**Files:**
- Modify: `web-app/src/containers/ChatAgentModeSwitch.tsx`
- Modify: `web-app/src/components/left-sidebar/index.tsx`
- Modify: `web-app/src/constants/routes.ts`
- Create: `web-app/src/routes/media.tsx`
- Test: `web-app/src/containers/ChatAgentModeSwitch.test.tsx`

**Interfaces:**
- Produces: a workspace selector supporting `chat | agent | media` while retaining Agent-disabled behavior.
- Produces: `route.media` and `/media` route entry.
- Consumes: existing `useAgentMode` only for Chat/Agent state; Media must not be stored as an Agent thread.

- [ ] **Step 1: Write failing selector tests**

Test that three choices render, Agent can still be disabled independently, and clicking Media emits `media` without reporting Agent mode.

- [ ] **Step 2: Run the focused selector test and verify failure**

Run: `yarn workspace @janhq/web-app vitest run src/containers/ChatAgentModeSwitch.test.tsx`

Expected: FAIL because the current component only supports boolean Chat/Agent selection.

- [ ] **Step 3: Generalize the selector minimally**

Replace the boolean-only callback with an explicit workspace value type local to the component or a narrowly shared type. Keep the existing visual classes intact so the approved Media button looks native to Atomic Chat.

- [ ] **Step 4: Wire Media selection in the left sidebar**

When Media is selected, navigate to `route.media`. When Chat or Agent is selected, preserve the current `setSidebarMode`, `setAgentMode(TEMPORARY_CHAT_ID, ...)`, Agent-provider guard, attention-dot behavior, and home navigation.

- [ ] **Step 5: Add the `/media` route shell**

Create a route component that renders a temporary semantic `Media Studio` heading and no worker calls yet. Do not change Chat/Agent route behavior.

- [ ] **Step 6: Run selector and route-related frontend tests**

Run: `yarn workspace @janhq/web-app vitest run src/containers/ChatAgentModeSwitch.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add Media workspace navigation`

---

### Task 2: Add the typed Atomic Media Worker client

**Files:**
- Create: `web-app/src/services/atomicMedia/types.ts`
- Create: `web-app/src/services/atomicMedia/client.ts`
- Create: `web-app/src/services/atomicMedia/client.test.ts`

**Interfaces:**
- Produces: `AtomicMediaClient` with `health()`, `capabilities()`, `createJob(request)`, and `getJob(jobId)` methods.
- Produces: typed job states including `queued`, `running`, `succeeded`, and `failed`.
- Base URL: `http://127.0.0.1:13420`.

- [ ] **Step 1: Write failing client tests using mocked `fetch`**

Cover health success, offline/network failure, request JSON mapping, non-2xx response handling, and job-status parsing.

- [ ] **Step 2: Run the client tests and verify failure**

Run: `yarn workspace @janhq/web-app vitest run src/services/atomicMedia/client.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the minimal typed client**

Use the browser/Tauri `fetch` path already allowed by the app CSP. Keep URL construction, response validation, and error normalization inside the service.

- [ ] **Step 4: Add validated default request values**

Define the initial Wan baseline as defaults only: `832x480`, `17` frames, `12` fps, `10` steps, guidance `5.0`, device `auto`, preset `wan2.2-ti2v-5b`.

- [ ] **Step 5: Run the focused client tests**

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: add Atomic Media Worker client`

---

### Task 3: Add Media job state and polling hook

**Files:**
- Create: `web-app/src/hooks/useAtomicMediaJob.ts`
- Create: `web-app/src/hooks/useAtomicMediaJob.test.tsx`

**Interfaces:**
- Consumes: `AtomicMediaClient`.
- Produces: `{ workerState, job, submit, cancelPolling, refreshHealth }` for the Media route.
- Polling stops on `succeeded`, `failed`, unmount, or explicit cancellation.

- [ ] **Step 1: Write failing hook tests**

Cover offline state, successful submission, queued→running→succeeded progression, failed job, and polling cleanup on unmount.

- [ ] **Step 2: Run focused hook tests and verify failure**

Run: `yarn workspace @janhq/web-app vitest run src/hooks/useAtomicMediaJob.test.tsx`

- [ ] **Step 3: Implement bounded polling**

Use an interval/backoff appropriate for a localhost worker, prevent overlapping status requests, and surface normalized errors to the UI.

- [ ] **Step 4: Run focused hook tests**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add Media job polling state`

---

### Task 4: Build the approved Media Studio page

**Files:**
- Modify: `web-app/src/routes/media.tsx`
- Create: `web-app/src/containers/media/MediaStudio.tsx`
- Create: `web-app/src/containers/media/MediaGenerationForm.tsx`
- Create: `web-app/src/containers/media/MediaPreview.tsx`
- Create: `web-app/src/containers/media/MediaJobStatus.tsx`
- Test: `web-app/src/containers/media/MediaStudio.test.tsx`

**Interfaces:**
- Consumes: `useAtomicMediaJob`.
- Produces: the approved Media Studio UI using Atomic Chat's existing design tokens and controls.

- [ ] **Step 1: Write failing UI tests**

Verify prompt entry, model/preset, resolution, frames/duration, FPS, steps, guidance, seed, device, negative prompt, Generate action, worker-offline state, progress state, success output, and failure output.

- [ ] **Step 2: Run the Media Studio test and verify failure**

Run: `yarn workspace @janhq/web-app vitest run src/containers/media/MediaStudio.test.tsx`

- [ ] **Step 3: Implement the page shell from the approved mockup**

Use the existing application background, panel borders, radius, typography, buttons, and spacing. Do not introduce a new visual system.

- [ ] **Step 4: Implement capability-aware controls**

Show only controls that are known to be supported. Keep `auto` as the default device. Do not infer GPU count or VRAM from the user's current machine.

- [ ] **Step 5: Implement generation submission and output rendering**

Map form state through `AtomicMediaClient`, render image output with existing asset-safe mechanisms, and render video with a native `<video controls>` element when the completed job is a video.

- [ ] **Step 6: Run focused Media UI tests**

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: build Atomic Media Studio`

---

### Task 5: Make the main Windows window frameless using existing controls

**Files:**
- Modify: `src-tauri/tauri.conf.json` or the existing Windows-specific Tauri override if one is present and already owns window decoration settings.
- Modify: `web-app/src/routes/__root.tsx`
- Modify: `web-app/src/components/WindowControls.tsx` only if needed for placement/restore visuals; do not rewrite its Tauri actions.
- Test: `web-app/src/components/__tests__/WindowControls.test.tsx` if an existing test location is available; otherwise create `web-app/src/components/WindowControls.test.tsx`.

**Interfaces:**
- Consumes: existing `WindowControls` minimize/maximize/close implementation.
- Produces: a Windows-only undecorated main window with an app-owned drag region and usable custom controls.

- [ ] **Step 1: Inspect existing platform-specific Tauri config before editing**

Confirm whether `tauri.windows.conf.json` or equivalent already controls the main window. Change the narrowest existing platform-specific configuration surface.

- [ ] **Step 2: Add/adjust tests around WindowControls behavior**

Mock the Tauri window API and verify minimize, toggleMaximize, close, and maximized-state refresh behavior still work.

- [ ] **Step 3: Disable native decorations for the Windows main window only**

Do not change macOS title-bar overlay behavior or auxiliary log/system-monitor windows unnecessarily.

- [ ] **Step 4: Add a top-level draggable region in the existing app shell**

Place `data-tauri-drag-region` only on non-interactive chrome. Buttons, sidebar triggers, inputs, Media controls, and window buttons must remain clickable.

- [ ] **Step 5: Verify maximized layout classes**

Ensure the custom controls sit flush when maximized and retain current inset styling when restored.

- [ ] **Step 6: Run frontend tests and Rust/Tauri checks available in the environment**

Run: `yarn workspace @janhq/web-app vitest run`

Run from `src-tauri/`: `cargo check`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: use frameless Windows app chrome`

---

### Task 6: Regression and final verification

**Files:**
- Modify only files required by failures directly caused by Tasks 1–5.

**Interfaces:**
- Produces: verified feature branch ready for review.

- [ ] **Step 1: Run frontend lint**

Run: `yarn lint`

Expected: PASS.

- [ ] **Step 2: Run release typecheck**

Run: `make typecheck`

Expected: PASS.

- [ ] **Step 3: Run focused and full Vitest suites**

Run: `yarn test`

Expected: PASS.

- [ ] **Step 4: Run repository verification gate**

Run: `make verify`

Expected: PASS on a supported local build environment. If this remote execution environment cannot run the Windows/Tauri toolchain, report that limitation explicitly and do not claim the Windows shell is physically validated.

- [ ] **Step 5: Review diff for unrelated changes**

Confirm no unrelated UI, provider, backend, settings, naming, or route behavior changed.

- [ ] **Step 6: Commit any verification-only fixes**

Commit message: `test: verify Atomic Media workspace`

- [ ] **Step 7: Open a draft pull request**

Target `main`, summarize implementation and tests, and leave it unmerged for user review.
