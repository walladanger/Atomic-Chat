# Radium Media Workspace and Frameless Window Design

## Goal

Add a first-class Media workspace to Radium Chat and make the Windows desktop shell visually self-contained, while preserving all existing Chat, Agent, model, settings, and backend behavior.

## Approved Product Direction

The approved UI is the dark Radium Chat Media Studio mockup already reviewed in this project. The implementation should reproduce that direction rather than redesign it.

### Media workspace

- Extend the existing Chat / Agent segmented control with a third `Media` choice.
- Media is a separate workspace, not a modified chat thread.
- The page uses Radium Chat's existing colors, spacing, typography, buttons, borders, sidebar, and dark/light theme tokens.
- Primary layout:
  - left-side generation settings;
  - large media preview / output canvas;
  - job / queue / worker status;
  - prompt composer at the bottom or lower-left depending on available width.
- Initial generation modes:
  - Text to Video;
  - Image to Video;
  - Text to Image when supported by the worker.
- Initial controls exposed by the UI:
  - model / preset;
  - resolution;
  - frame count / duration;
  - FPS;
  - inference steps;
  - guidance scale;
  - seed;
  - device selection with `auto` as the default;
  - negative prompt;
  - optional low-VRAM / CPU-fallback / keep-loaded controls only when the worker capability response says they are supported.
- The first usable loop is: worker health → enter prompt/settings → submit job → poll job → show progress/state → display completed image/video.
- The Media page must not change the existing LLM provider selection, Agent-mode state, or Chat behavior.

## Media Worker Architecture

Radium Chat talks directly to the existing localhost Radium Media Worker. MCP remains optional and is not part of the primary runtime path for this feature.

Primary topology:

`Radium Chat UI -> Radium Media Worker -> local image/video models`

Initial endpoint base URL:

`http://127.0.0.1:13420`

The frontend integration should live behind a small typed client so worker request/response handling does not leak throughout UI components.

The client must support at minimum:

- worker health;
- capabilities / available models or presets when exposed;
- create generation job;
- job status polling;
- output path / URL handling;
- clear, user-visible handling when the worker is offline.

The UI must not fabricate model capabilities. Controls should derive from worker capabilities or from narrowly defined, validated preset metadata.

## Initial Model Target

The validated video baseline is:

- `Wan-AI/Wan2.2-TI2V-5B-Diffusers`
- preset id: `wan2.2-ti2v-5b`
- Diffusers / Wan pipeline

The existing successful local baseline settings are suitable defaults for the first implementation:

- 832 × 480
- 17 frames
- 12 fps
- 10 steps
- guidance 5.0
- device `auto`

These are defaults only, not hard-coded hardware assumptions.

## Windows Frameless Shell

Radium Chat is already a Tauri application and already contains `web-app/src/components/WindowControls.tsx` with minimize, maximize/restore, and close behavior. Reuse that component rather than implementing a second set of window actions.

Windows should use custom application chrome so the Radium Chat UI becomes the visible outer window:

- remove the normal Windows title bar / decoration from the main window;
- keep standard window resizing behavior;
- provide draggable regions in Radium Chat's own top chrome;
- retain working minimize, maximize/restore, and close controls;
- preserve native maximize behavior and sensible edge snapping;
- avoid affecting macOS traffic-light behavior or mobile builds;
- keep auxiliary log/system-monitor windows unchanged unless they inherit the main-window change automatically and safely.

Rounded corners / shadows should be achieved only where Tauri/Windows behavior permits without breaking resize, maximize, or snap behavior. Functionality takes priority over decorative corner treatment.

## Scope Boundaries

Do not:

- refactor unrelated Radium Chat code;
- rename legacy `jan*` / `@janhq/*` identifiers;
- change the local OpenAI-compatible API on port 1337;
- change model-provider logic;
- replace the existing Chat or Agent mode state model unless the Media workspace absolutely requires an extension point;
- rebuild the Radium Media Worker;
- make MCP mandatory;
- add unrelated features or redesign other screens.

## State and Routing

Media should be represented as an explicit workspace mode and route, rather than pretending it is an Agent thread. Selecting Media should navigate to the Media route. Selecting Chat or Agent should continue to navigate to the existing home route and preserve their current behavior.

The existing `ChatAgentModeSwitch` may be generalized carefully into a three-choice workspace switch, but the existing Chat/Agent behavior and disabled-Agent rules must remain unchanged.

## Testing Requirements

Frontend tests must cover:

- workspace switch renders Chat / Agent / Media;
- existing Agent-disabled rules still work;
- Media selection navigates to the Media route without mutating Agent state unexpectedly;
- worker offline state;
- job submission payload mapping;
- job polling transitions;
- completed output rendering;
- failed job rendering.

Windows/Tauri checks must cover:

- main window starts without native decorations;
- custom controls still minimize, maximize/restore, and close;
- drag region works without swallowing button clicks;
- maximize/restore layout remains correct.

Before completion, run the repository's focused frontend checks while iterating and `make verify` for the final branch state when the execution environment supports it.

## Success Criteria

A Windows user can open Radium Chat, click `Media` beside `Chat / Agent`, enter a prompt, choose supported generation settings, submit a local generation job, watch its state, and view the completed image/video inside Radium Chat. The application itself is visually the window, with no separate generic Windows title-bar frame around the main Radium Chat UI, and existing Chat/Agent behavior remains unchanged.
