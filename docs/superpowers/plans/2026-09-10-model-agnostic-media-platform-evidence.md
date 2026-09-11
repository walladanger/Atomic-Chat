# Radium Media platform — completion evidence

Task 17, against §12 of
[the plan](2026-09-08-model-agnostic-atomic-media-platform.md).

**Status: NOT COMPLETE.** Two of the twelve items cannot be produced on this
machine, and one is void. They are named below rather than implied passed, which
is what §12 item 2 asks for.

Branch `feature/atomic-code-foundation`, evidence gathered 2026-09-10.

---

## 1. Files changed, grouped by layer

| Layer | Files |
|---|---|
| Contract | `web-app/src/services/media/contract/{tasks,params,models,jobs,index,upcast}.ts` |
| Adapters | `adapters/{types,atomicWorker,comfyui,comfyWorkflows,remoteHttp}.ts`, `adapters/__tests__/conformance.ts` |
| Orchestration | `services/media/{jobManager,assets,library,providerFactory,secrets,rerun}.ts`, `stores/{media-provider-store,media-library-store}.ts` |
| UI | `containers/media/{MediaStudio,MediaGenerationForm,MediaJobStatus,MediaPreview,ProviderList,ModelCatalog,MediaLibrary,AssetDetail}.tsx`, `containers/media/params/*`, `routes/media.tsx`, `routes/media_.library.tsx`, `routes/settings/media/index.tsx` |
| Rust | `src-tauri/src/core/media/{mod,secrets,commands}.rs` |
| Registry | **Not built.** Task 15 deferred by the user on 2026-09-10. |
| Docs | 8 ADRs under `docs/decisions/`, `DEVELOP.md`, `AGENTS.md`, `docs/decisions/INDEX.md` |

## 2. `make verify` output

`MAKE_VERIFY_EXITCODE=0`, read from the command's own exit code, on every task
boundary. Most recent full run, 2026-09-10:

- web: **2649 passed / 16 skipped** (2665) — run from the REPO ROOT
- extensions: **250 passed**, **276 passed**
- Rust: **496 + 12 + 167 + 205 + 28 + 4 = 912 passed, 0 failed**
- `Selective v2.0.32 boundaries verified.`

**Suites that could not run here, and why:**

- **`cargo clippy` is not part of `make verify` at all.** `AGENTS.md` rule 4
  says Rust work uses `cargo check` *and* `cargo clippy`, but the Makefile has no
  clippy target, so the gate never enforces it. Run manually on 2026-09-10:
  `cargo check` clean; `cargo clippy -- -D warnings` reports **53 pre-existing
  findings repo-wide, none in media code**. Gap between the stated rule and the
  actual gate; not closed here.
- **Environment requirement:** the full gate only passes from a VS x64 developer
  shell (`vcvars64.bat`) with GnuWin32 `make` prepended and a directory holding
  `printf.exe` **plus `msys-2.0.dll`, `msys-iconv-2.dll` and `msys-intl-8.dll`**
  appended. With `printf.exe` alone, one Rust test fails in a way that mimics a
  code regression (decision D15).

## 3. Parity test

`contract/__tests__/parity.test.tsx` renders the **live** refitted
`MediaGenerationForm`, drives it through the real downcaster and asserts a
byte-identical v1 body. Mutation-tested: flipping the quantiser tie-break breaks
exactly one parity test, so it is provably not vacuously green.

## 4. Conformance suite, every adapter

`adapters/__tests__/conformance.ts` — 30 tests, imported **unmodified** by each:

| Adapter | Result |
|---|---|
| Radium Media Worker | 30/30 |
| ComfyUI | 30/30 conformance + 28 ComfyUI-specific |
| Remote HTTP | 30/30, after the contract gained `features.synchronous` (D7) |

**Caveat (D4):** the ComfyUI fixtures were transcribed from ComfyUI 0.35.0
source, not captured from a running instance. No ComfyUI on this laptop.

## 5. `make test-selective-v2032`, with re-baseline SHAs

Green. Every re-baseline is an isolated, single-purpose commit (Q1):

| SHA | Accepts |
|---|---|
| `59ee8b7fb` | two `atomicMedia` client hashes (Task 2) |
| `abcc50d48` | the `atomicMedia` client hash (Task 3) |
| `e5ee6f793` | the Task 11 Media Studio refit |
| `213964f52` | the product rename (`chore/rename-radium-chat`) |
| `0e437b531` | `MediaGenerationForm.tsx`, `MediaStudio.tsx`, `routes/media.tsx` (D17) |

## 6. The four pre-existing dirty paths

**VOID.** The premise no longer holds: the user authorised committing those
paths, the working tree is clean, and all eleven are committed. Verified with
`git status` against the real filesystem, not inferred. Step T17-S08 cannot pass
as written and is marked N/A.

## 7. Atomic Code still absent

Green, and **already enforced by the gate**: `scripts/verify-selective-v2032.mjs`
checks forbidden paths, forbidden documents and forbidden text on every run, and
prints `Selective v2.0.32 boundaries verified.`

## 8. Screenshots / recording

**NOT PRODUCED.** Requires the GPU box for the generation shots, and a running
app for the rest. Nothing here should be read as visual confirmation.

## 9. Locales shipped untranslated — named explicitly

**Every media surface is English-only, in all 14 locales.**

No media UI component imports `useTranslation`; all strings are hardcoded
English in `ProviderList.tsx`, `ModelCatalog.tsx`, `MediaLibrary.tsx`,
`AssetDetail.tsx`, and the two new routes. The single key added to
`locales/en/common.json` (`"media": "Media"`, the settings menu label) falls back
to English in: **cs, de-DE, es, fr, id, ja, ko, pl, pt-BR, ru, vn, zh-CN,
zh-TW**.

This is Task 14, which the user **deliberately deferred** on 2026-09-10 in favour
of reaching a usable product sooner. It is a known deferral, not an oversight.

## 10. Manual steps this environment could not perform

1. **GPU generation** — no GPU here. No end-to-end generation has ever run.
2. **A real ComfyUI** — fixtures transcribed from source (D4).
3. **The real credential store** — every credential test runs against an
   in-memory `CredentialStore` by design, so `cargo test` cannot write to the
   machine that runs it. The actual Windows Credential Manager / macOS Keychain /
   Linux Secret Service round trip **has never executed**. Needs doing by hand:
   add a cloud provider with a key, restart, confirm it survives and
   authenticates; delete it and confirm it is gone from the OS store.
4. **The Linux no-Secret-Service path** — needs a box without one.
5. **The Task 8 thumbnailer** — `createBrowserThumbnailer()` uses canvas and
   video decoding, neither of which jsdom implements. Its failure path is
   covered; the canvas path itself has only ever run in theory.
6. **Packaged-build CSP verification** — needs an installed build.

## 11. The ADRs, with index lines

**Eight**, not six: the plan's six, the seventh it mandates because Task 6 ran
(cloud providers), and an eighth for credential storage — scope the original plan
did not contain, found by auditing all 128 steps (D14). All indexed under a new
"Radium Media platform" section in `docs/decisions/INDEX.md`.

The registry ADR is explicitly marked **NOT YET IMPLEMENTED**, because Task 15 is
deferred.

## 12. Final commit SHAs per phase

| Phase | Commits |
|---|---|
| 0 — Unblock | `9e8249046`, `166b5758f` |
| 1 — Contract | `c62b11da8`, `8ca22ff6e`, `59ee8b7fb` |
| 2 — Providers | `eda596d8d`, `abcc50d48`, `f224ce822`, `051aa223e`, `bfc35573f` |
| 3 — Orchestration | `94d164c02`, `a635958f5` |
| 4 — UI | `642223616`, `c184096a2`, `12cc6ca37`, `669ab5c66`, `e5ee6f793`, `2da45c0ae`, `fbd821710`, `f7484e22b`, `513421ab1`, `0e437b531` |
| Rename (merged) | `502bbc5e1`, `213964f52`, `450100bda`, merge `31a4c52a4` |
| 2 — Credentials (Task 18) | `30f724b51` |
| 6 — Close-out | `b22c91bb2` (docs), this report |

---

## What is left

| Item | Why |
|---|---|
| Task 14 — 14 locales | Deferred by the user, 2026-09-10 |
| Task 15 — remote registry | Deferred by the user, 2026-09-10 |
| Task 9 — worker supervision | Parked; D12's answer removed its premise |
| T17-S09 — smoke against a real worker | Needs the GPU box |
| Evidence 8 and 10 | Need a running app and real hardware |
| Q6 — sequencing vs the other selective v2.0.32 plan | Still open |
| D16 — shared `Progress` primitive is inaccessible | Recorded, not fixed |
