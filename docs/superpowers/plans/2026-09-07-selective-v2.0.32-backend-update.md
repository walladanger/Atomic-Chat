# Selective v2.0.32 Backend Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selectively integrate the approved v2.0.32 backend functionality, remove Atomic Code, bundle the four approved Windows runtime choices, and leave Atomic Media and unrelated fork behavior unchanged.

**Architecture:** Execute five independently reviewable phases: scope guards and Atomic Code removal; offline backend packaging and reliability fixes; Agent Mode runtime; composer-only Atomic Audio; and additive providers/connectors followed by release verification. Upstream `codex-upstream/v2.0.32` is a reference tree only; each port is reduced to the smallest dependency-complete patch for this fork.

**Tech Stack:** Tauri 2, Rust 1.77.2, TypeScript 5.9, React 19, Vitest 3, Yarn 4, PowerShell, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-07-selective-v2.0.32-backend-update-design.md`

## Global Constraints

- Never merge or cherry-pick upstream wholesale; transplant named files and hunks from `codex-upstream/v2.0.32`.
- Preserve the four original dirty paths: deleted `downloads/index.html`, modified `extensions/yarn.lock`, modified `src-tauri/icons/icon.png`, and modified `web-app/src/containers/DownloadManegement.tsx`.
- Preserve every Atomic Media file listed in the spec at its recorded SHA-256 value.
- Remove Atomic Code page code only; keep generic code rendering, Launch coding integrations, and Agent Mode indexing/workspace tools.
- Do not adopt upstream Cloud, Connectors, API, Voice Settings, sidebar, or assistant-layout redesigns.
- Do not delete models, conversations, settings, credentials, MCP configuration, application data, or locales.
- No new JavaScript runtime package. Authorized Rust additions are `portable-pty`, `rmcp` auth support, `oauth2`, `tauri-plugin-atomic-audio`/`cpal`, and the local `atomic-code-index` crate.
- New or changed behavior follows red-green-refactor: record the expected failing assertion before production edits.
- Windows bundled runtime limit is 1.90 GiB; fail release staging at or above that size.

---

## Phase 1: Scope guards and Atomic Code removal

### Task 1: Add immutable-surface and scope verification

**Files:**
- Create: `scripts/selective-v2032-protected.json`
- Create: `scripts/verify-selective-v2032.mjs`
- Modify: `Makefile`
- Test: `tests/verify-selective-v2032.test.mjs`

**Interfaces:**
- Consumes: repository root and the protected-file SHA-256 list.
- Produces: `node scripts/verify-selective-v2032.mjs`, exiting zero only when Atomic Media hashes match, Atomic Code paths are absent, and prohibited route/model-router references are absent.

- [ ] **Step 1: Write the failing guard test**

```js
test('rejects a fixture tree while Atomic Code remains registered', async () => {
  const fixture = await makeFixture({ includeAtomicCode: true })
  const result = runGuard(fixture.root, fixture.protectedManifest)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Atomic Code remains/)
})

test('accepts a fixture tree with matching protected files and no Atomic Code', async () => {
  const fixture = await makeFixture({ includeAtomicCode: false })
  const result = runGuard(fixture.root, fixture.protectedManifest)
  assert.equal(result.status, 0, result.stderr)
})
```

`runGuard` invokes `verify-selective-v2032.mjs --root <fixture> --protected
<fixture-manifest>`. `makeFixture` writes one protected file and a literal
SHA-256 for those bytes; it optionally creates
`web-app/src/containers/code/CodeWorkspace.tsx`.

- [ ] **Step 2: Run the guard test and confirm RED**

Run: `node --test tests/verify-selective-v2032.test.mjs`

Expected: FAIL because `scripts/verify-selective-v2032.mjs` does not exist.

- [ ] **Step 3: Add the guard implementation and protected hashes**

The JSON must contain the eleven exact hashes captured before implementation, including:

```json
{
  "web-app/src/containers/media/MediaPreview.tsx": "4a5708bda2615d72ab5a86894437cdaf10f55d52adb827542f80df78a57197cb",
  "web-app/src/routes/media.tsx": "997102f3082ee9756ddba73339f01c7a3c58bd7151e622481851104bb1f2ea92",
  "web-app/src/services/atomicMedia/client.ts": "b60db81445712f88ad8e17bfdd86c6b34f4231c52d6e9ec34540321fc9484197"
}
```

The script accepts optional `--root` and `--protected` paths for controlled
tests. It must hash every JSON entry and reject these paths or symbols:

```js
const forbiddenPaths = [
  'web-app/src/containers/code',
  'web-app/src/routes/code.tsx',
  'web-app/src/services/model-router',
  'web-app/src/hooks/useModelStrategy.ts',
]
const forbiddenText = [/route\.code\b/, /CodeWorkspace\b/, /atomic-model-strategy/]
```

Add `verify-selective-v2032` to `make verify` without changing other verify targets.

- [ ] **Step 4: Run the guard test again**

Expected: both fixture cases PASS. Then run
`node scripts/verify-selective-v2032.mjs` against the real repository and
confirm it exits non-zero with `Atomic Code remains` before Task 2.

- [ ] **Step 5: Commit the guard**

```text
test: guard selective update boundaries
```

### Task 2: Remove Atomic Code without touching Atomic Media

**Files:**
- Delete: `web-app/src/containers/code/CodeWorkspace.tsx`
- Delete: `web-app/src/containers/code/CodeWorkspace.test.tsx`
- Delete: `web-app/src/routes/code.tsx`
- Delete: `web-app/src/services/model-router/`
- Delete: `web-app/src/hooks/useModelStrategy.ts`
- Delete: `web-app/src/hooks/useModelStrategy.test.ts`
- Delete: Atomic Code foundation plan, spec, and ADR from 2026-09-04
- Modify: `web-app/src/components/left-sidebar/index.tsx`
- Modify: `web-app/src/containers/ChatAgentModeSwitch.tsx`
- Modify: `web-app/src/containers/ChatAgentModeSwitch.test.tsx`
- Modify: `web-app/src/constants/routes.ts`
- Modify: `web-app/src/constants/localStorage.ts`
- Modify: `web-app/src/routeTree.gen.ts`
- Modify: `docs/decisions/INDEX.md`

**Interfaces:**
- Consumes: current four-mode `ChatAgentModeSwitch`.
- Produces: `WorkspaceMode = 'chat' | 'agent' | 'media'`; `/media` navigation remains callback-driven and `/code` no longer compiles or registers.

- [ ] **Step 1: Replace Code-positive tests with the desired three-mode assertion**

```tsx
render(<ChatAgentModeSwitch isAgentMode={false} onChange={vi.fn()} onWorkspaceChange={vi.fn()} chatLabel="Chat" agentLabel="Agent" />)
expect(screen.getByRole('button', { name: 'Chat' })).toBeVisible()
expect(screen.getByRole('button', { name: 'Agent' })).toBeVisible()
expect(screen.getByRole('button', { name: 'Media' })).toBeVisible()
expect(screen.queryByRole('button', { name: 'Code' })).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `yarn workspace @janhq/web-app vitest run src/containers/ChatAgentModeSwitch.test.tsx src/containers/__tests__/ChatAgentWorkspace.test.tsx`

Expected: FAIL because the Code button still renders.

- [ ] **Step 3: Remove the Code-only graph and registrations**

Retain `RoutedWorkspace = 'media'`, route media callbacks, and every current Agent Mode branch. Regenerate `routeTree.gen.ts` using the existing TanStack/Vite build rather than hand-authoring unrelated route changes.

- [ ] **Step 4: Run focused tests and the boundary guard**

Run: `yarn workspace @janhq/web-app vitest run src/containers/ChatAgentModeSwitch.test.tsx src/containers/__tests__/ChatAgentWorkspace.test.tsx`

Run: `node scripts/verify-selective-v2032.mjs`

Expected: PASS; all eleven Atomic Media hashes match and Atomic Code is absent.

- [ ] **Step 5: Commit Atomic Code removal**

```text
feat: remove Atomic Code workspace
```

---

## Phase 2: Offline runtime packaging and focused reliability fixes

### Task 3: Pin and stage the Windows runtime bundle

**Files:**
- Create: `scripts/windows-backend-bundle.json`
- Create: `scripts/stage-windows-backends.mjs`
- Create: `tests/stage-windows-backends.test.mjs`
- Modify: `Makefile`
- Modify: `.github/workflows/release.yml`
- Modify: `src-tauri/tauri.windows.conf.json`

**Interfaces:**
- Consumes: `scripts/windows-backend-bundle.json` and an optional `ATOMIC_BACKEND_CACHE_DIR`.
- Produces: `src-tauri/resources/backend-packages/<provider>/<tag>/<asset>` and `manifest.json`; `node scripts/stage-windows-backends.mjs --verify-only`; non-zero exit at 1.90 GiB.

- [ ] **Step 1: Write fixture-based failing staging tests**

Cover exact-size/SHA success, digest mismatch, missing archive, cache reuse, and total-size rejection. The success fixture asserts all package IDs:

```js
assert.deepEqual(manifest.packages.map(({ provider, backend }) => `${provider}:${backend}`), [
  'llamacpp-upstream:win-cpu-x64',
  'llamacpp-upstream:win-cuda-12.4-x64',
  'llamacpp-upstream:cudart-win-cuda-12.4-x64',
  'llamacpp:windows-x64-cpu',
  'llamacpp:windows-x64-cuda-12.4',
])
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test tests/stage-windows-backends.test.mjs`

Expected: FAIL because the staging module does not exist.

- [ ] **Step 3: Add the exact pinned manifest**

Use these immutable values:

```json
[
  ["llama-b10431-bin-win-cpu-x64.zip",18853706,"631c8f7b237ca901e2b7b07680791a27c4fc23104f1640409e6c0e7c55f57fcf"],
  ["llama-b10431-bin-win-cuda-12.4-x64.zip",250659321,"394e12e9151080efe588ba2e6f3609cdfefd5f2f28b7382d784bbceaf32382c9"],
  ["cudart-llama-bin-win-cuda-12.4-x64.zip",391443627,"8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6"],
  ["llama-turboquant-windows-x64-cpu.zip",12135314,"6c99dda78bd7cd774a35a2dc5ae02fcf78e6d5a2730f40cadd8e1108523957a6"],
  ["llama-turboquant-windows-x64-cuda-12.4.zip",646134779,"9f641d36280fc9f5b2a76cd187b0cf1b649ebfcaa8899dc255971dd59c107aea"]
]
```

Standard URLs use `AtomicBot-ai/atomic-chat-conf/releases/download/b10431`, cudart uses `ggml-org/llama.cpp/releases/download/b10431`, and TurboQuant uses `AtomicBot-ai/atomic-llama-cpp-turboquant/releases/download/b10269-1.5.1`.

- [ ] **Step 4: Implement streaming download/hash verification and release wiring**

Never load an archive into a single buffer. Download to `<asset>.partial`, stream SHA-256, verify exact byte count, then atomically rename. The Windows release job runs staging before `yarn tauri build`; `tauri.windows.conf.json` includes only `resources/backend-packages/**/*` in addition to existing resources.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/stage-windows-backends.test.mjs`

Expected: PASS without live network access.

```text
build: bundle verified Windows backends
```

### Task 4: Resolve bundled archives before optional downloads

**Files:**
- Create: `extensions/llamacpp-upstream-extension/src/bundledPackages.ts`
- Create: `extensions/llamacpp-upstream-extension/src/test/bundledPackages.test.ts`
- Create: `extensions/llamacpp-extension/src/bundledPackages.ts`
- Create: `extensions/llamacpp-extension/src/test/bundledPackages.test.ts`
- Modify: both extensions' `src/backend.ts` and `src/index.ts`
- Modify: both llama.cpp Tauri plugins' `src/backend.rs`

**Interfaces:**
- Produces: `resolveBundledPackage(providerId, version, backend): Promise<BundledBackendPackage | null>` and Rust `install_bundled_archive(archive_path, expected_size, expected_sha256, output_dir)`.
- Preserves: existing remote `BackendArchiveSource` and progress events for non-bundled variants.

- [ ] **Step 1: Write failing local-first resolver tests**

```ts
expect(await resolveBackendPackage('llamacpp-upstream', 'b10431', 'win-cpu-x64', localManifest, fetchRemote)).toMatchObject({ kind: 'bundled' })
expect(fetchRemote).not.toHaveBeenCalled()
expect(await resolveBackendPackage('llamacpp-upstream', 'b10431', 'win-vulkan-x64', localManifest, fetchRemote)).toMatchObject({ kind: 'remote' })
```

Rust tests must corrupt a temporary ZIP after computing its expected digest and assert the destination remains absent.

- [ ] **Step 2: Run focused extension and Rust tests; confirm RED**

Run: `yarn workspace @janhq/llamacpp-upstream-extension test:run src/test/bundledPackages.test.ts`

Run: `yarn workspace @janhq/llamacpp-extension test:run src/test/bundledPackages.test.ts`

Run: `cargo test --manifest-path src-tauri/Cargo.toml bundled_archive`

- [ ] **Step 3: Implement one shared resolution contract in each provider adapter**

Bundled lookup requires an exact provider/tag/backend match. SHA and size are rechecked before extraction. Standard CUDA installs the backend and matching cudart companion into one temporary directory, verifies `llama-server.exe`, then atomically promotes the directory. Failed extraction removes only the temporary directory.

- [ ] **Step 4: Run both provider suites and commit**

Expected: the four approved user-visible choices install with a fetch stub that throws; Vulkan still calls the remote source.

```text
feat: install bundled backends offline
```

### Task 5: Lock down updater integrity and GGUF filtering

**Files:**
- Modify: both extensions' backend tests and archive install paths
- Modify: `web-app/src/lib/models.ts`
- Modify: `web-app/src/lib/__tests__/models.test.ts`
- Modify: `web-app/src/hooks/useModelSources.ts`
- Modify: `web-app/src/services/models/default.ts`
- Modify: `web-app/src/services/models/localScan.ts`

**Interfaces:**
- Produces: `isNonWeightGguf(filename: string): boolean` used by remote catalog, default service, and local scan.

- [ ] **Step 1: Port the v2.0.32 classifier tests before code**

The table must reject `mmproj-*.gguf`, `*imatrix*.gguf`, `*vocab*.gguf`, MTP heads, DFlash/EAGLE drafts, and audio companions while accepting normal weights and numbered shards.

- [ ] **Step 2: Confirm RED**

Run: `yarn workspace @janhq/web-app vitest run src/lib/__tests__/models.test.ts`

- [ ] **Step 3: Port only commit `1043a1014` classifier logic and add archive regression cases**

Do not replace fork shard grouping, MLX recognition, or updater catalog behavior. Add exact-length mismatch, SHA mismatch, partial-file cleanup, and verified-archive acceptance cases to both extension suites.

- [ ] **Step 4: Run and commit**

Run both llama.cpp extension suites and the focused web model test.

```text
fix: validate backend archives and filter non-weight GGUF files
```

### Task 6: Fix Windows MCP cwd, cloud deletion, and attachments

**Files:**
- Modify: `src-tauri/src/core/mcp/helpers.rs`
- Modify: `src-tauri/src/core/mcp/commands.rs`
- Modify: `src-tauri/src/core/mcp/tests.rs`
- Modify: `web-app/src/containers/hub/DeleteModelAction.tsx`
- Modify: `web-app/src/containers/hub/__tests__/DeleteModelAction.test.tsx`
- Modify: `web-app/src/hooks/useModelProvider.ts`
- Create: `web-app/src/lib/readFileAsDataUrl.ts`
- Create: `web-app/src/lib/__tests__/readFileAsDataUrl.test.ts`
- Modify: `web-app/src/containers/ChatInput.tsx`
- Modify: `web-app/src/containers/chatInput/imageFromPath.ts`
- Modify: `web-app/src/containers/chatInput/audioFromPath.ts`

**Interfaces:**
- Produces: Rust `resolve_stdio_working_dir(configured: Option<&Path>, mcp_root: &Path, app_data: &Path) -> Result<PathBuf, String>`.
- Produces: `readFileAsDataUrl(file: File, maxBytes: number): Promise<string>`.
- Cloud deletion removes persisted provider/favorite/selection state and never calls the local engine.

- [ ] **Step 1: Write three independent failing test groups**

MCP cases: valid directory retained; missing/file/unusable Windows path falls back to MCP root; failed MCP-root creation falls back to app data.

Cloud case:

```tsx
expect(localDeleteModel).not.toHaveBeenCalled()
expect(providerModels()).not.toContainEqual(expect.objectContaining({ id: 'cloud-model' }))
expect(favorites()).not.toContain('cloud-model')
```

File reader cases: pre-read size rejection, `onerror`, `onabort`, non-string result, and successful data URL.

- [ ] **Step 2: Run each focused suite and confirm RED for the missing behavior**

Run: `cargo test --manifest-path src-tauri/Cargo.toml core::mcp`

Run: `yarn workspace @janhq/web-app vitest run src/containers/hub/__tests__/DeleteModelAction.test.tsx src/lib/__tests__/readFileAsDataUrl.test.ts`

- [ ] **Step 3: Implement minimal branches**

Use `tokio::fs::metadata` plus directory creation for MCP validation and log only paths, never environment variables or secrets. Treat `size === 0` as valid; reject non-finite or negative sizes. Set all FileReader terminal handlers before calling `readAsDataURL`.

- [ ] **Step 4: Run focused suites and commit**

```text
fix: harden MCP paths model deletion and attachments
```

---

## Phase 3: Agent Mode backend, without page redesigns

### Task 7: Port target abstraction, reasoning, streaming, and durable sessions

**Files:**
- Create/modify only the `src-tauri/src/core/agent/` target, OpenAI client, reply stream, session, grammar, prompt, runner, and test-support files named in the upstream diff.
- Modify: `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/core/state.rs`, `src-tauri/src/lib.rs`
- Modify narrowly: `web-app/src/types/agent.ts`, `web-app/src/services/agent/tauri.ts`, `web-app/src/hooks/useAgentProvider.ts`, `web-app/src/lib/reasoning-effort.ts`, `web-app/src/hooks/useAgentRun.ts`

**Interfaces:**
- Produces: backend `AgentTarget` variants for llama.cpp, MLX, OpenAI-compatible, and ChatGPT subscription; reasoning effort on every turn; streamed reply events; resumable session records.

- [ ] **Step 1: Port upstream unit tests from commits `d4b53f328`, `b0f1d460a`, and `2065e8463` first**

Retain cases for target serialization, reasoning omission when unsupported, reasoning propagation when supported, stream completion, and session resume after interruption. Exclude GAIA/eval tests.

- [ ] **Step 2: Run Rust tests and confirm RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml core::agent`

- [ ] **Step 3: Port the minimum dependency-complete backend implementation**

Use `portable-pty` only in the next task; this task adds no UI routes. Frontend changes expose existing composer/run controls only and must not import upstream layout components.

- [ ] **Step 4: Run Rust and focused frontend tests; commit**

```text
feat: update Agent Mode targets and sessions
```

### Task 8: Port bounded workspace, PTY, process, MCP, and retrieval tools

**Files:**
- Add: `src-tauri/code-index/`
- Add/modify: `src-tauri/src/core/agent/{mcp_tools,output_buffer,pty,rag_bridge,spill,tool_schema}.rs`
- Add/modify: `src-tauri/src/core/agent/tools/{code,docs,mcp_call,media,proc,shell,fs,http,web}.rs`
- Modify: `src-tauri/plugins/tauri-plugin-vector-db/{Cargo.toml,src/api.rs,src/lib.rs}`
- Modify: MCP and agent tests only; do not add API/Cloud/Connectors routes.

**Interfaces:**
- Produces bounded PTY sessions, process lifecycle tools, tool-schema loading, MCP calls with approval metadata, native vector retrieval, and spill-file references for oversized observations.

- [ ] **Step 1: Port contract tests from `82801d06f`, `b0f1d460a`, and `2065e8463`**

Tests must prove trusted-root containment, PTY output cap, process termination, spill threshold, MCP approval propagation, vector collection isolation, and that `atomic-code-index` is callable only as an Agent tool.

- [ ] **Step 2: Confirm RED with focused Cargo tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml core::agent::tools core::agent::pty core::agent::spill`

- [ ] **Step 3: Port implementations and authorized dependencies**

Add the local crate to the workspace/dependency graph and pin upstream Tree-sitter versions exactly. Do not add the deleted frontend Code route or model router. Exclude GAIA answer/scoring/report changes, API-page server inspector UI, and Launch-page additions.

- [ ] **Step 4: Run tests, boundary guard, and commit**

```text
feat: add bounded Agent Mode runtime tools
```

---

## Phase 4: Composer-only Atomic Audio

### Task 9: Port microphone capture and local transcription backend

**Files:**
- Add: `src-tauri/plugins/tauri-plugin-atomic-audio/`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`
- Modify: `extensions/llamacpp-upstream-extension/src/transcriptionRegistry.ts`, `src/index.ts`, `src/util.ts`, and tests
- Modify Windows/macOS microphone entitlements only where the current platform requires them.

**Interfaces:**
- Produces Tauri commands `start_dictation`, `stop_dictation`, `cancel_dictation`, `get_dictation_status`, `list_input_devices`, `get_microphone_permission`, `request_microphone_permission`, `set_transcription_target`, and `transcribe_wav`.

- [ ] **Step 1: Port DSP, WAV, VAD, registry, and command-state tests before registration**

Include mono resampling, finite sample handling, valid WAV headers, cancel idempotence, one active recording, and low-memory transcription fallback.

- [ ] **Step 2: Run plugin and extension tests; confirm RED**

Run: `cargo test --manifest-path src-tauri/plugins/tauri-plugin-atomic-audio/Cargo.toml`

Run: `yarn workspace @janhq/llamacpp-upstream-extension test:run src/util.test.ts`

- [ ] **Step 3: Port commits `9bd2cc44e` and `3c5893f37` backend-only audio hunks**

Do not port Agent media/eval tools, Voice Settings route, or Settings menu entry from those commits.

- [ ] **Step 4: Run tests and commit**

```text
feat: add local Atomic Audio backend
```

### Task 10: Add voice input to the existing chat composer

**Files:**
- Add: `web-app/src/services/voice/{types,default,tauri}.ts`
- Add: `web-app/src/hooks/useVoiceInput.ts`, `useVoiceModel.ts`, `useVoiceSetting.ts`
- Add: `web-app/src/lib/voice/{engine,errors,language,promptMerge}.ts`
- Add: `web-app/src/containers/VoiceInputToggle.tsx`
- Add: `web-app/src/containers/chatInput/{VoiceElapsedTimer,VoiceLevelMeter,VoiceRecordingBar}.tsx`
- Add: `web-app/src/containers/dialogs/VoiceSetupDialog.tsx`
- Modify narrowly: `web-app/src/containers/ChatInput.tsx`, `web-app/src/services/index.ts`, `web-app/src/test/service-hub.ts`, English locale plus existing translated strings available upstream.

**Interfaces:**
- Voice transcript merges into the current draft and never submits it.
- No `/settings/voice` route, `VoiceSettingsPanel`, `VoiceModelCard`, or Settings navigation entry.

- [ ] **Step 1: Port voice hook, prompt merge, language, toggle, and dialog tests first**

Add the composer assertion:

```tsx
await user.click(screen.getByRole('button', { name: /stop recording/i }))
expect(textbox).toHaveValue('existing draft transcribed words')
expect(onSubmit).not.toHaveBeenCalled()
```

- [ ] **Step 2: Confirm RED with focused Vitest files**

- [ ] **Step 3: Port composer-only UI and service glue**

Reuse existing icons, tokens, typography, spacing, and dialog components. Do not copy upstream page layouts or unrelated ChatInput restructuring.

- [ ] **Step 4: Run focused tests, build, boundary guard, and commit**

```text
feat: add local voice input to chat composer
```

---

## Phase 5: Additive providers, MCP connectors, and release proof

### Task 11: Add providers without changing current provider behavior

**Files:**
- Add: `src-tauri/src/core/auth/`
- Add: relevant backend ChatGPT route/shim files from `b0f1d460a` and `2065e8463`
- Add: `web-app/src/services/auth/`, `web-app/src/hooks/useChatGptAuth.ts`
- Add/modify: `web-app/src/lib/cloud-providers.ts`, `model-display-name.ts`, provider tests
- Modify narrowly: current provider constants, add/edit provider dialogs, provider service, and model logo recognition.

**Interfaces:**
- Adds ChatGPT subscription auth and a user-managed `llama-server` OpenAI-compatible provider; recognizes DeepSeek display metadata.
- Existing registry providers retain IDs, keys, URLs, enabled state, model lists, ordering, and refresh behavior.

- [ ] **Step 1: Write/port failing additive-registry and auth storage tests**

Snapshot all existing provider records before additions and assert deep equality afterward. Add tests for ChatGPT token persistence/refresh and local llama-server optional API key.

- [ ] **Step 2: Confirm RED**

Run provider, model-factory, provider-api-key, and Rust auth suites.

- [ ] **Step 3: Port backend auth and narrow existing Settings → Providers integration**

Do not add `/cloud`, Cloud cards, Cloud navigation, or upstream logos that replace current assets. DeepSeek stays registry-driven.

- [ ] **Step 4: Run and commit**

```text
feat: add compatible cloud provider targets
```

### Task 12: Add connector presets and MCP OAuth inside current settings

**Files:**
- Add: `web-app/src/constants/mcp-connectors.ts` and tests
- Add: connector icon assets from upstream only
- Add: `web-app/src/containers/connectors/{ConnectorCard,ConnectorIcon,ServerIcon}.tsx`
- Add: `web-app/src/containers/dialogs/{ConnectorSecretDialog,ConnectorToolsDialog}.tsx`
- Modify narrowly: `web-app/src/routes/settings/mcp-servers.tsx`, MCP services/types/tests, English MCP locale plus upstream translations that exist.
- Add: `src-tauri/src/core/mcp/oauth/`
- Modify: `src-tauri/src/core/mcp/{commands,helpers,models,mod,tests}.rs`, `src-tauri/Cargo.toml`, `Cargo.lock`, `src-tauri/src/lib.rs`.

**Interfaces:**
- Presets convert to the existing `mcp_config.json` schema; custom/raw JSON remains available.
- OAuth tokens are stored outside connector JSON; Linear legacy endpoint migration is additive and idempotent.

- [ ] **Step 1: Port connector transform, secret masking, tool selection, OAuth refresh, and Linear migration tests first**

Add a preservation fixture containing an unknown custom server and assert it is byte-equivalent after preset creation and migration.

- [ ] **Step 2: Confirm RED with MCP frontend and Rust tests**

- [ ] **Step 3: Port commits `b0f1d460a` and `2065e8463` into the existing MCP settings surface**

Enable `rmcp` auth and direct `oauth2`. Do not add `/connectors`, `DropdownPlugins`, sidebar changes, or unrelated Skills-page changes.

- [ ] **Step 4: Run and commit**

```text
feat: add MCP connector presets and OAuth
```

### Task 13: Full verification, release build, handover, and push

**Files:**
- Modify: `docs/testing-critical-flows.md`
- Create: `docs/decisions/2026-09-07-bundle-cpu-and-cuda-12-4-backends.md`
- Modify: `docs/decisions/INDEX.md`
- Update external deliverable: `outputs/Atomic-Chat-handover.md`

**Interfaces:**
- Produces a release candidate commit and GitHub branch containing only approved changes plus the preserved dirty worktree.

- [ ] **Step 1: Run focused and aggregate frontend tests**

Run: `yarn test`

Run: `yarn lint`

Run: `yarn build:web`

- [ ] **Step 2: Run extension and Rust verification**

Run both llama.cpp extension suites, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`.

- [ ] **Step 3: Run repository guards and Windows staging/build**

Run: `make verify`

Run: `node scripts/stage-windows-backends.mjs --verify-only`

Run the Windows release build as far as unsigned local credentials permit. Record artifact bytes and fail if at or above 1.90 GiB.

- [ ] **Step 4: Prove boundaries and preserved dirt**

Run `node scripts/verify-selective-v2032.mjs`. Compare each original dirty path against `backup/pre-v2.0.32-selective-dirty-20260907`; exclude those deltas from the implementation commit while retaining them in the worktree. Confirm no protected Atomic Media hash changed.

- [ ] **Step 5: Record ADR, test evidence, and handover**

Document the local-first compressed-archive decision, exact package versions, actual installer size, exclusions, and any signing-only manual follow-up.

- [ ] **Step 6: Commit implementation and push**

Review `git diff --cached` before committing. Push only `feature/atomic-code-foundation` to `origin`. Do not force-push.

```text
feat: complete selective v2.0.32 backend update
```

- [ ] **Step 7: Report completion**

Report changed files grouped by subsystem, Atomic Media hashes, excluded upstream UI/routes, commit SHA, GitHub commit link, tests/builds, artifact size, and manual follow-up.
