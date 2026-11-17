# LANE-FORMAT-1 builder receipt

Builder: Claude Sonnet 5.5 (builder only; no review or acceptance is claimed here).
Date: 2026-10-07. Branch: `codex/sandbox/lane-format-1`. Built from `origin/main` = `f9de3ad6f5be571b02f79b3d3a23a1ae09a8972d` (the commit named in the order; main had not moved).

## What changed

- `config/agent-lane-assignments.json` was one 36 KB line. It is now one lane per line, lanes sorted by name, `{"version":2,"lanes":{` on the first line and `}}` plus one trailing newline at the end (88 lines for 86 lanes).
- Added one lane, `lane-format-1` (branch `codex/sandbox/lane-format-1`, allow `config/agent-lane-assignments.json` and `docs/verdicts/LANE-FORMAT-1/**`). That is the only change in meaning: 85 lanes before, 86 after.
- Added `docs/verdicts/LANE-FORMAT-1/equivalence-check.py` (self-contained) and this receipt.

## Why

With the whole registry on one line, every lane PR edits that same line, so each merge re-conflicts every other open PR. With one lane per line, two PRs that add different lanes only conflict if their lanes are alphabetical neighbours.

## Equivalence result

`python3 docs/verdicts/LANE-FORMAT-1/equivalence-check.py` (defaults `origin/main` vs `HEAD`) exited 0 with 10 PASS lines: no duplicate keys at any level; top-level keys other than `lanes` identical; `lanes` at HEAD equals main's lanes plus exactly `lane-format-1` (compared as dicts, order-insensitive); every pre-existing lane object unchanged; the file is byte-for-byte the canonical `dump()` form; lane keys are in sorted order; line count is lanes + 2. The checker also fails (exit 1) when run as `HEAD HEAD`, which is the expected negative result (the lane is no longer "added").

## Checks run in the worktree (exit codes)

| Command | Exit |
| --- | --- |
| `git fetch -q origin`; `git rev-parse origin/main` = f9de3ad6f5be… | 0 |
| `python3 docs/verdicts/LANE-FORMAT-1/equivalence-check.py` | 0 |
| `pnpm install --frozen-lockfile --ignore-scripts` | 0 |
| `node --test tools/*.test.mjs` (42 tests, 42 pass, 0 fail) | 0 |
| `pnpm typecheck` (first run replayed from the turbo cache) | 0 |
| `pnpm typecheck --force` (7 of 7 tasks, nothing cached) | 0 |
| `GITHUB_EVENT_NAME=pull_request GITHUB_EVENT_PATH=<event> node tools/agent-lane-boundary-lint.mjs` (head `11e0a5cc05e5…`, base `f9de3ad6f5be…`; lane `lane-format-1`; files: the lane file and `equivalence-check.py`) | 0 |

The lane lint above ran on the commit before this receipt was added; the receipt sits under the allowed `docs/verdicts/LANE-FORMAT-1/**`. It was re-run on the final head after the receipt was added (see the PR).

## Deliberately not done

- No `.gitattributes` `merge=union` line. The integrator tested it: two branches that each add a lane sorting last produced invalid JSON (the union driver keeps both lines, and neither carries the comma the other needs). The one-lane-per-line layout is the fix instead.
- No other file touched. Nothing in the repo hashes or pins this file's bytes (`tools/agent-lane-boundary-lint.mjs` and `tools/agent-lane-boundary.test.mjs` read it with `JSON.parse`), and lane selection does not depend on order.
- No deploy or release.
