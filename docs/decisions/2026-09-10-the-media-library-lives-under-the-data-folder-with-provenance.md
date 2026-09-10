---
date: 2026-09-10
title: "The media library lives at <data_folder>/media/ with provenance records"
---

# 2026-09-10 — The media library lives at `<data_folder>/media/` with provenance records

- **Context:** Generated images and video need somewhere to live, and the app
  needs to answer "how did I make this?" afterwards. A new top-level folder was
  considered and rejected: `AGENTS.md` rule 6 forbids one without explicit
  approval, and it would sit outside everything factory reset and the
  uninstaller already understand.

- **Decision:** Media lives under the existing `<data_folder>/media/`, with an
  `index.json` and one provenance record per asset — provider, model, task, the
  full parameter set, the resolved seed, device, app version and contract
  version.

- **Consequences:**
  - Factory reset and the uninstaller already remove `<data_folder>`, so media is
    covered with no new deletion path to write or get wrong.
  - `index.json` is the only durable record that a generation happened, so its
    failure modes matter more than its happy path: a corrupt file must not take
    the Media surface down, and an index written by a NEWER build is treated as
    read-only rather than silently overwritten by an older one.
  - Provenance is only as honest as what the app knows. `resolved_seed` is
    written ONLY when the seed was actually known; a fabricated 0 would make
    "re-run identically" quietly produce a different image. Assets generated
    before decision D8 therefore show "not recorded", and the library refuses to
    offer an exact re-run for them rather than lying.
  - Deleting an asset deletes the FILE as well as the index entry, tolerantly: a
    locked or already-missing file still removes the row, because an entry the
    user cannot delete is worse than a file that outlives its record. This also
    deletes adopted files — outputs a provider wrote in its own folder.

- **Owner:** `team`

- **Links:** `web-app/src/services/media/library.ts`, `assets.ts`,
  `stores/media-library-store.ts`, `containers/media/MediaLibrary.tsx`;
  tracker Tasks 8, 13, decisions D8, D17.
