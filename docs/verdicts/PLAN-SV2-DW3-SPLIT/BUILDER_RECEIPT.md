# Builder receipt: PLAN-SV2-DW3-SPLIT

**Role:** builder only. This receipt is not a review and not an acceptance. A plan change needs an independent plan review and Ben's merge (`BUILD_PLAN.md:80`).
**Date:** 7 October 2026
**Branch:** `codex/sandbox/plan-sv2-dw3-split` (from `origin/main` at `e323174`)
**Lane:** `plan-sv2-dw3-split` (added to `config/agent-lane-assignments.json`)

## Founder decision recorded

Command Center card `jobguard-sv2-reveal-lock-split-2026-10-07`. Ben, 7 October 2026, 20:01, exact words: "split the test".

## Why

SV-2's Done-when line asked it to prove that the reveal routine "returns only `revealed` rows for the right tenant and job". That needs a locked job, and the lock table (`final_account_lock`) belongs to SV-4. SV-4 depends on SV-2, so SV-2 cannot prove the locked-job half. The decision splits the test: SV-2 keeps the empty-result half and the EXECUTE grant check; SV-4 proves the locked-job half.

## What changed (plan text and lane only; no code)

1. `BUILD_PLAN.md`, card "SV-2 Shadow persistence and isolation", Done-when: the reveal-routine line is replaced. It now says the routine sits behind a lock check that returns nothing while no lock exists, returns nothing for an unlocked job when real `revealed` rows are present, keeps the specific, catalog-tested EXECUTE grant, and names SV-4 as the place the locked-job half is proved.
2. `BUILD_PLAN.md`, card "SV-4 Final-account lock", Done-when: one line added, right after the "trigger test" line. Once the job is locked, the routine returns only `revealed` rows for that tenant and job, and still nothing for any other job or tenant.
3. `BUILD_PLAN.md` section 14.3 "Discovered later" (the only dated amendment/finding log in the plan): one dated row for 2026-10-07 recording the finding and the ruling. No other amendment log or ruling list fits this change, so nothing else was added.
4. `config/agent-lane-assignments.json`: lane `plan-sv2-dw3-split` added through `~/.local/share/full-steam/lanefmt.py` `dump()`; one line added, nothing else differs from `origin/main`. Allowed paths: `BUILD_PLAN.md`, `config/agent-lane-assignments.json`, `docs/verdicts/PLAN-SV2-DW3-SPLIT/**`.
5. This receipt.

Nothing else in `BUILD_PLAN.md` was changed. The edits were exact single-occurrence string replacements (each asserted to match exactly once).

## Checks run (all in the worktree `.worktrees/plan-sv2-dw3-split`)

| Command | Exit |
|---|---|
| `git fetch -q origin` | 0 |
| `git worktree add -b codex/sandbox/plan-sv2-dw3-split .worktrees/plan-sv2-dw3-split origin/main` | 0 |
| Lane edit in Python (parse with duplicate-key rejection; original re-dumps byte-identical through `lanefmt.dump()`; new file re-parses with no duplicate keys; 89 lanes) | 0 |
| `git diff --stat` before commit: 1 line added in `config/agent-lane-assignments.json` | n/a |
| `pnpm install --frozen-lockfile --ignore-scripts` | 0 |
| `node --test tools/*.test.mjs` (42 tests, 42 pass, 0 fail) | 0 |
| `grep -rl BUILD_PLAN tools .github scripts packages apps config package.json` | no tool or test reads the SV-2 or SV-4 cards or pins `BUILD_PLAN.md` text; the only hits are a comment in `packages/core/src/enterprise-domain/transitions.test.ts` (cites section 9.1.4) and lane `allow` lists in the lane config |

Lane lint with simulated pull-request metadata (event file under `/private/tmp`, then `GITHUB_EVENT_NAME=pull_request GITHUB_EVENT_PATH=<file> node tools/agent-lane-boundary-lint.mjs`) can only run on a committed head, and a file cannot contain the hash of the commit that holds it. Its result and the head SHA are reported in the pull request description and in the builder's hand-back message.

## Known limits and for the reviewer

- Not run: CI on GitHub (no push before this receipt), any database or browser suite. None applies to a docs-only change.
- Wording is the wording Ben's coordinator specified. A reviewer should check one point: SV-2 says its routine "sits behind a lock check", but the lock table is created by SV-4. The plan text does not say how SV-2's guard can refer to a lock that does not exist yet (for example a fail-closed stub that SV-4 later wires to `final_account_lock`). That detail was not invented here.
- Source-inspected: `BUILD_PLAN.md` SV-2, SV-4, section 14.3, section 2.1 (line 80 and the delegation text), the lane lint source, `lanefmt.py`. Test-executed: the commands above. Independently verified: nothing.
