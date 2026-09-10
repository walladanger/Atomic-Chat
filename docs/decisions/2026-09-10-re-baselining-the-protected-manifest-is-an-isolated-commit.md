---
date: 2026-09-10
title: "Re-baselining the selective-v2.0.32 protected manifest is an isolated, single-purpose commit"
---

# 2026-09-10 — Re-baselining the selective-v2.0.32 protected manifest is an isolated, single-purpose commit

- **Context:** The selective v2.0.32 port froze a set of Media files by hash so
  an upstream merge could not silently redesign them. The tripwire worked — it
  caught commit `a13b71a83` changing 8 of 11 protected files. But the media
  platform work has to change those files DELIBERATELY, so the guard was red by
  design and the question was what to do with it. Options considered: narrow the
  guard, or freeze the files and build around them. Building around was
  unworkable: the couplings to fix (`MODES`, the bespoke controls, the no-op
  cancel) live INSIDE the frozen files.

- **Decision:** Re-baseline, and keep the tripwire. Re-baselining may happen ONLY
  in an isolated, single-purpose commit whose message names the changes it
  accepts. No functional change may share that commit.

- **Consequences:**
  - The guard keeps its meaning. A re-baseline stops being a shrug and becomes a
    reviewable statement: this commit accepts exactly these edits, for this
    reason, authorised by this person.
  - `git log` on the manifest reads as an audit trail of every deliberate change
    to the frozen surface.
  - Practised three times so far — Tasks 2, 5 and 11, then D17 — and each time
    the guard was run FIRST and named exactly the files that changed.
  - Cost: two commits for one piece of work, and the intermediate commit is red
    on the guard by construction. That is accepted; the alternative hides the
    decision inside a feature diff.
  - Known tool gap (decision D11): the re-baseline script cannot express the
    DELETION of a protected file, because it iterates the manifest rather than
    reconciling it. Worked around by hand; it will bite the next deletion.

- **Owner:** `team`

- **Links:** `scripts/verify-selective-v2032.mjs`, `scripts/rebaseline-selective-v2032.mjs`,
  `scripts/selective-v2032-protected.json`; tracker decisions Q1, D11, D17.
