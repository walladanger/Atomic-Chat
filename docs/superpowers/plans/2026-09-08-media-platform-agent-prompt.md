# Agent kickoff prompt — model-agnostic Atomic Media platform

**Date:** 2026-09-08
**Plan:** [`2026-09-08-model-agnostic-atomic-media-platform.md`](2026-09-08-model-agnostic-atomic-media-platform.md)
**Tracker:** [`2026-09-08-model-agnostic-atomic-media-platform-tracker.xlsx`](2026-09-08-model-agnostic-atomic-media-platform-tracker.xlsx)

## What this is

A self-contained prompt to hand to any agent picking up the media platform work,
written so a cold start needs no other context. It exists because the work spans
many sessions and token budgets expire mid-task; the tracker holds the state and
this prompt tells an agent how to re-enter it.

## Two things that are easy to get wrong

1. **This work lives only on `feature/atomic-code-foundation`.** The plan, the
   tracker and `AGENTS.md` rule 9 are not on `main`. An agent that checks out
   `main` sees none of it. The prompt pins the branch for that reason.
2. **The tracker is a binary `.xlsx`** and cannot be read with `cat` or `grep`.
   The prompt carries a tested Python reader. The markdown plan stays the source
   of truth for *what to do*; the workbook records *what is done*.

## The prompt

Copy everything inside the fence.

```text
You are working on Atomic Chat at:
C:\Users\Warwick\.codex\.chatgpt-projects\g-p-6a89e2d97fa08191bee04f4c7a2099a9\Atomic-Chat

Branch: feature/atomic-code-foundation
Do NOT switch branches. The plan and tracker exist only on this branch, not on main.

## Read before writing any code

1. AGENTS.md at the repo root. Rule 9 applies to you directly.
2. docs/superpowers/plans/2026-09-08-model-agnostic-atomic-media-platform.md — the
   full specification. §7 holds the 18 tasks and 128 steps. §2 explains why each
   change is needed. §4 is the contract. Read §0 and §6 before touching anything.
3. The tracker, for current status. It is a binary .xlsx — read it with:

python -c "
import openpyxl
wb = openpyxl.load_workbook('docs/superpowers/plans/2026-09-08-model-agnostic-atomic-media-platform-tracker.xlsx')
for sheet, cols in (('Tasks','ABDE'), ('Steps','ABDE'), ('Decisions','ABF')):
    ws = wb[sheet]; hdr = 2 if sheet == 'Tasks' else 1
    print(f'--- {sheet} ---'); n = 0
    for r in ws.iter_rows(min_row=hdr+1):
        c = {x.column_letter: x.value for x in r}
        st = c.get('F') if sheet == 'Decisions' else c.get('E')
        if st not in ('Done','Skipped') and c.get('A'):
            print('  ', ' | '.join(str(c.get(k) or '')[:70] for k in cols)); n += 1
            if n >= 3: break
"

Work the first Task/Step whose Status is not Done or Skipped. Do not start elsewhere.

## Hard gates — read these as blocking

- Task 0 gates everything. `make verify` is RED right now: commit a13b71a83 changed
  8 of the 11 media files frozen in scripts/selective-v2032-protected.json without
  re-baselining the manifest. Nothing downstream can be verified until Task 0 lands.
- Decision Q1 (Decisions sheet) blocks Task 0 and is the USER'S call, not yours.
  If Q1 is still Open, stop and ask. Do not guess it. Options B and C invalidate
  Tasks 10 and 11 as written, so guessing wrong wastes the whole phase.
- Phase gates are on the Tasks sheet. Do not start a phase until the previous
  phase's gate is green.

## Never commit these six paths

  downloads/index.html
  extensions/yarn.lock
  src-tauri/icons/icon.png
  web-app/src/lib/models.ts
  web-app/src/hooks/useModelSources.ts
  web-app/src/lib/__tests__/models.test.ts

The first three are pre-existing local changes that predate this work. The last
three are Task 5 of the selective v2.0.32 plan, mid-flight and deliberately RED —
models.test.ts imports isNonWeightGgufFile and stripNonWeightQuants, which do not
exist yet. Leave all six dirty. Stage files by explicit path, never `git add -A`.

## How to work

- Test-first, always: write the failing test, run it, confirm it fails for the
  right reason, then implement. Each step in §7 names its command and expected result.
- Run the step's stated command and paste the real output. A step is Done only when
  its command has actually been run and passed. Never mark Done on inference.
- Update the tracker Status in the same commit as the work.
- Never commit unless explicitly asked (AGENTS.md §6.5).
- No new top-level folder, config file, or runtime dependency without the user's
  explicit ok, naming it and the reason first (§6.6).
- Do only what the step says. No opportunistic refactors (§6.1).
- Do not fabricate backend behaviour — a parameter exists because a provider
  declared it, never because you inferred it (§6.2).
- Record non-trivial decisions in docs/decisions/ (§6.8).

## Report back

Which Task/Step you did · the commands you ran and their actual output · what you
changed · tracker rows updated · anything you could not verify and why. If a suite
did not run, say so plainly — do not imply it passed.
```

## Why the prompt refuses to answer Q1

Q1 decides whether `scripts/selective-v2032-protected.json` keeps protecting
anything. An agent that picks Option B to unblock itself would silently delete a
safeguard built on purpose — and the deletion would look like progress. Stopping
to ask is the correct behaviour, not a failure to act. See §6 and §13 of the plan.

## Keeping this current

If the branch name, the repository path, or the six protected paths change, update
this file in the same commit. A stale kickoff prompt is worse than none, because an
agent will trust it over the tree it is looking at.
