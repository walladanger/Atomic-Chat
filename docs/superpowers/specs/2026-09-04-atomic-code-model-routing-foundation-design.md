# Atomic Code Model-Routing Foundation

## Scope

This milestone makes Code a native Atomic Chat workspace and introduces the
reusable model-routing foundation that later coding tools will call. It does
not add repository mutation, shell execution, diff application, Git actions,
or an embedded third-party coding engine.

Existing Chat, Agent, Media, provider, and model-loading behavior remains
unchanged. Code extends the workspace selector already present on
`feature/atomic-media-workspace`.

## Architecture

The model router is a pure TypeScript service. Callers provide model
candidates with provider/model identifiers, locality, availability,
capabilities, relative performance, and an optional priority. The router has
no knowledge of GPU brands, counts, or particular model names.

The Code workspace adapts Atomic Chat's existing provider/model store into
router candidates. Local installed models are available even when they are
not currently loaded; active models are preferred because they avoid startup
latency. A generic parameter-count hint parsed from model metadata or its id
lets Auto prefer a smaller local model without naming one. External providers
remain valid fallbacks when no local candidate is available.

The router returns both a primary decision and an escalation decision. An
escalation can be ready, available for a later handoff, or inactive with a
reason. This milestone displays that state but does not execute a handoff.

## Strategies

- **Auto:** prefer the smallest ready or available local candidate that can
  handle coding; fall back to a configured external candidate. Prepare a
  stronger coding/reasoning candidate only when objective task signals request
  escalation.
- **Fast:** choose the lowest-cost available candidate and do not escalate.
- **Best Local:** choose the strongest available local candidate; if none is
  available, fall back to the Auto result and say so.
- **Manual:** choose the exact configured provider/model pair; if it is absent
  or unavailable, fall back to Auto and say so.

Objective escalation signals in this foundation are capability requirements,
multi-file breadth, architecture/review intent, large context, repeated tool
failures, and repeated test failures. Thresholds are inputs with conservative
defaults, so later workers can tune them without changing UI code.

## Configuration and persistence

Provider/model definitions remain owned by Atomic Chat's existing stores and
registries. The new router accepts normalized definitions and exports the
adapter that builds them; it does not create a second provider catalog.

The selected strategy and optional manual provider/model key are persisted in
a dedicated Zustand store under an Atomic-prefixed storage key. No credentials
or hardware details are persisted there.

## UI

The sidebar selector gains a fourth `Code` choice. `/code` renders a compact
workspace shell that preserves the Media visual language: title, model
strategy control, resolved primary model, and escalation/fallback status. The
surface clearly states that repository tools are the next milestone rather
than presenting inactive controls as working features.

## Failure handling

No configured model is a valid startup state. The Code route still renders,
the strategy selector remains usable, and the status explains that a local
model can be downloaded or an external provider configured. Missing larger or
specialist candidates leave escalation inactive without blocking the primary
model.

## Verification

- Unit tests cover deterministic selection, local-first behavior, external
  fallback, unavailable manual choices, and inactive/active escalation.
- Store tests cover persisted strategy/manual selection behavior.
- Workspace tests cover Code navigation, active state, strategy interaction,
  and the no-model laptop path.
- The focused suites, lint, TypeScript build check, web build, and repository
  verification gate are run before commit.
