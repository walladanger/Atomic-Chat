# Selective v2.0.32 Backend Update Design

## Goal

Update the Atomic Chat fork from its `v2.0.23` base toward upstream
`AtomicBot-ai/Atomic-Chat` tag `v2.0.32` by selecting backend and narrowly
related configuration changes, while preserving the fork's Code workspace,
Atomic Media workspace, branding, layout, user data, language support, and
unrelated dirty-worktree changes.

## Repository state and recovery

The working branch is `feature/atomic-code-foundation` at `d0b721443`. Its
common ancestor with upstream `v2.0.32` is `9097a05f3` (`v2.0.23`). The fork is
22 commits ahead of that base and upstream is 37 commits ahead on a separate
line. A wholesale merge is prohibited because upstream deletes the fork's Code
and Atomic Media files.

Two recovery refs exist before tracked content is edited:

- `backup/pre-v2.0.32-selective-20260907` preserves the clean branch tip.
- `backup/pre-v2.0.32-selective-dirty-20260907` preserves the initial dirty
  worktree, including the binary icon change.

The initial dirty files are `downloads/index.html`, `extensions/yarn.lock`,
`src-tauri/icons/icon.png`, and
`web-app/src/containers/DownloadManegement.tsx`. Work in this update must not
overwrite their existing changes. If a generated dependency lockfile overlaps
`extensions/yarn.lock`, only additions required by this update may be retained;
the original dirty delta must remain present.

## Integration strategy

Use upstream `v2.0.32` as a reference tree, not as a merge target. Port each
subsystem independently into the fork and preserve local behavior at every
boundary. Tests are written first for new or changed behavior, then the minimum
production change is made. Each subsystem is verified before the next is
started.

No upstream visual redesign, route reorganization, broad settings rewrite, or
navigation rewrite is included. Existing services and stores remain the source
of truth unless a named feature requires a compatible extension.

## Protected surfaces

The following files are immutable for this update and will be checked by
SHA-256 before the final commit:

- `web-app/src/containers/code/CodeWorkspace.test.tsx`
- `web-app/src/containers/code/CodeWorkspace.tsx`
- `web-app/src/routes/code.tsx`
- `web-app/src/services/model-router/provider-adapter.test.ts`
- `web-app/src/services/model-router/provider-adapter.ts`
- `web-app/src/services/model-router/router.test.ts`
- `web-app/src/services/model-router/router.ts`
- `web-app/src/services/model-router/types.ts`
- `web-app/src/containers/media/MediaGenerationForm.tsx`
- `web-app/src/containers/media/MediaJobStatus.tsx`
- `web-app/src/containers/media/MediaPreview.tsx`
- `web-app/src/containers/media/MediaStudio.test.tsx`
- `web-app/src/containers/media/MediaStudio.tsx`
- `web-app/src/routes/media.tsx`
- `web-app/src/hooks/useAtomicMediaJob.test.tsx`
- `web-app/src/hooks/useAtomicMediaJob.ts`
- `web-app/src/services/atomicMedia/client.test.ts`
- `web-app/src/services/atomicMedia/client.ts`
- `web-app/src/services/atomicMedia/types.ts`

Shared registration files may be edited only when required to register a new
backend command or plugin. Their existing Code and Atomic Media registrations
must remain byte-for-byte equivalent at the relevant declarations. No Code or
Atomic Media component, route, layout, generation request, model-routing rule,
or visual behavior may change.

## Backend updater and integrity

The fork already contains the manifest-driven backend updater, backend archive
SHA-256 metadata, size checks, incomplete-download cleanup, and safe fallback
logic introduced before `v2.0.23`. Preserve that implementation instead of
replacing it with a `v2.0.32` file wholesale.

Add focused regression coverage proving that a manifest archive with an
incorrect size or digest is rejected before installation and that a verified
archive is accepted. Port only later upstream updater adjustments that change
runtime behavior; formatting-only changes are excluded. A failed update keeps
the currently installed backend and application data intact.

## GGUF non-weight filtering

Port the `v2.0.32` pure filename classifier for non-weight GGUF artifacts and
apply it at every catalog and local-scan entry point. Projectors, MTP heads,
imatrix files, vocabulary-only GGUFs, DFlash/EAGLE draft artifacts, and audio
companions must not appear as runnable model weights. Existing shard grouping,
MLX detection, and supported weight filenames remain unchanged.

## MCP working-directory safety

Before spawning a stdio MCP server, normalize and validate its configured
working directory. On Windows, an empty, missing, non-directory, or otherwise
unusable path falls back to Atomic Chat's existing per-user MCP filesystem
sandbox. If that sandbox cannot be created, fall back to the application's data
directory. Emit a warning that identifies the invalid configured directory and
the chosen fallback without exposing secrets.

Valid configured directories continue to work exactly as before. HTTP and SSE
MCP transports are unaffected.

## Cloud-model deletion

Separate local model deletion from cloud-provider model removal. Deleting a
cloud model removes that model from the selected provider's persisted model
list and associated favorite/selection state, but never calls a local engine
and never deletes files. Local model deletion keeps the current engine-backed
flow and only updates caches after the engine confirms deletion.

## Attachment reliability

Centralize browser file-to-data-URL reading so load, error, and abort outcomes
all settle explicitly. Reject read failures with the filename instead of
silently dropping the attachment. Check declared file size before reading large
image or audio files into memory.

For path-based documents, preserve a valid zero-byte size rather than treating
it as unknown, reject invalid or non-finite metadata, and surface metadata/read
failures to the user. Agent-side staging continues to enforce the per-file,
aggregate-size, regular-file, and trusted-root limits before copying bytes.

## Agent Mode runtime

Port runtime Agent Mode functionality that is independent of the Code and
Atomic Media pages:

- target abstraction for llama.cpp, MLX, OpenAI-compatible cloud providers,
  and the ChatGPT subscription;
- structured reasoning controls and reasoning-aware turn requests;
- MCP tool discovery/calling, approval metadata, and connector integration;
- native document indexing and retrieval through the vector database;
- bounded process, shell, PTY, output-buffer, and workspace tools;
- streaming replies, durable sessions, prompt/tool schemas, and oversized
  observation spill files;
- general agent file inspection, document, archive, web, and media-description
  tools where they operate on chat attachments or workspace files.

The local `atomic-code-index` crate is included only as an Agent Mode workspace
tool. It does not import, call, register, or alter the Code page or the fork's
frontend model router.

Exclude GAIA evaluation additions, benchmark-only behavior, Code-page UI and
routes, Atomic Media generation integration, Launch-page additions, API-page
redesigns, sidebar redesigns, and unrelated assistant-layout changes.

Minimal frontend glue is limited to the chat composer and existing thread
execution path: provider targeting, reasoning values, tool approvals, and agent
status needed to invoke the new backend contract.

## Atomic Audio voice input

Port the `tauri-plugin-atomic-audio` microphone capture and local transcription
pipeline, its llama.cpp upstream transcription registry, and the chat-composer
hooks/services needed to record, stop, cancel, and insert a transcript.

The composer receives a microphone control, recording status, level/timer
feedback, and a setup dialog for the local transcription model. Transcribed
text is merged into the current draft without automatically sending it. The
chat model remains loaded while the transcription model is used where memory
allows, with upstream's explicit low-memory fallback.

Do not add the upstream Voice settings route or page. Do not change unrelated
composer styling, icons, typography, colors, spacing, or layout. Existing audio
file attachments remain separate from voice dictation.

## Cloud providers

Preserve the remote provider registry, its cache behavior, current Settings →
Providers pages, existing provider objects, API keys, base URLs, and model
lists. Append only the upstream providers that cannot live solely in the remote
registry or need local runtime support:

- ChatGPT subscription through backend OAuth and token storage;
- a user-managed `llama-server` OpenAI-compatible endpoint with optional API
  key;
- DeepSeek display-name/logo recognition while its catalog definition remains
  registry-driven.

Do not adopt the upstream Cloud page or redirect existing provider routes.
Existing providers retain their connection, model-refresh, enable/disable, and
proxy-registration behavior.

## MCP connectors

Port the upstream connector catalog, connector metadata, secret collection,
HTTP/OAuth configuration, tool selection, and Linear endpoint migration into
the existing MCP configuration experience. The existing raw JSON/custom-server
flow remains available and existing `mcp_config.json` entries are preserved.

Do not add the upstream Connectors navigation redesign. Connector presets are
an additional configuration path inside the current MCP settings surface.

## Dependencies

The following runtime dependencies are authorized because the approved features
cannot be implemented by the existing dependency graph alone:

- `portable-pty` for bounded cross-platform Agent Mode PTY sessions;
- the `rmcp` `auth` feature plus direct `oauth2` access for MCP OAuth token
  refresh and storage;
- local `tauri-plugin-atomic-audio`, whose desktop capture backend uses `cpal`;
- local `atomic-code-index`, with pinned Tree-sitter core and JavaScript,
  TypeScript, Python, and Rust grammars for Agent Mode symbol navigation.

No new JavaScript runtime dependency is planned. Lockfile changes must be
limited to the resolved dependency graph above.

## Data preservation and migration

No command or migration may remove model directories, conversations, settings,
provider credentials, MCP configuration, or application data. New persisted
fields must have defaults compatible with old state. Provider and MCP migrations
are additive and idempotent. Existing language namespaces remain registered;
new strings may fall back to English where an upstream translation does not
exist, but no locale file or translation key may be removed.

## Verification

Focused red/green tests cover every new classifier, resolver, deletion branch,
attachment-read branch, provider addition, connector transform, Agent Mode
contract, and voice-input state transition that can be exercised in isolation.

The final verification gate includes:

- focused frontend Vitest suites and extension tests;
- frontend lint and TypeScript build/typecheck;
- Rust tests for updater/download integrity, MCP, Agent Mode, auth, audio, and
  affected plugins;
- `cargo check` and `cargo clippy` for the Windows desktop feature set;
- the repository's `make verify` equivalent available on Windows;
- a Windows release/build check as far as local signing credentials permit;
- a final protected-file hash comparison;
- a final dirty-delta comparison confirming the user's four original changes
  are still present.

Only after fresh verification succeeds will implementation files be committed
and pushed to `origin/feature/atomic-code-foundation`.
