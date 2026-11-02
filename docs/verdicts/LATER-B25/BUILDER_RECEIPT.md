Built by Claude Sonnet (Codex stand-in), dispatcher 14

# LATER-B25 — Variation lifecycle integrity (built 17 Oct 2026)

Status: **BUILT, NOT ACCEPTED; PostgreSQL files NOT RUN here; Decision 74 PARK (check, then park; never merge/enable/deploy).** The 16 Oct stop at the old 45 GB gate is kept below as history; Decision 82 lowered the gate to 33 GB and `df -g` showed 47 GB free, so the build proceeded on top of commit ba34d8ae. No migration. **New GRANTs: none** (standard F: no direct protected-table write grant added; the existing runtime INSERT on `app.scope_progress` is reused). Base: local `origin/main` 1bcd8db8 (order cited ca435eeb); both touched source files are identical on main and this branch.

## What changed
- `packages/db/src/variation-repository.ts`
  - `VariationRevisionConflict` carries a settable `code`; a reused command id with a different payload throws `new VariationRevisionConflict("VARIATION_COMMAND_CONFLICT")` (no subclass), so the existing controller maps it to HTTP 409 unchanged.
  - L145: `insertPricedVariation` appends one `variation.priced` audit event atomically; `reject` appends one `variation.rejected`. Capture commands (`logBuilderExtra`, `addFinalReviewExtra`) use the internal `writePricedRevision` and keep their single capture event (no double audit).
  - L149: pricing, approval and rejection look up their own command id with a sub-select inside the row-lock statement; an exact committed command returns without effect (no second row, observation or audit), a reused id with a different payload throws `VariationRevisionConflict("VARIATION_COMMAND_CONFLICT")`; replay is decided before the stale-pointer check. A separate fresh-snapshot look-up runs only when the sub-select found nothing but the locked row shows the same command's own write (concurrent identical twin), so a stale writer still costs one query and the merged scripted test holds.
  - L150: approval and, for new scope only (`existing_scope_item_id IS NULL`), one `app.scope_progress` row are written in one data-modifying statement; pending/rejected proposals never reach it.
  - L151: `approvePricedVariation` returns the stored approval row (`storedApproval`), not `{...caller}`.
  - L153: `read()` accepts status `live`, `invoiced`, `paid`. New writes on a non-live job are refused in the three write paths with the existing `ACTIVATION_REQUIRED` error (the guard was previously the read's side effect).
- `apps/api/src/variation/variation.application.ts`: revise replays/conflicts from the stored history before the stale check; approve accepts an already-approved earlier revision so its committed command can replay; changed payload throws `VariationRevisionConflict("VARIATION_COMMAND_CONFLICT")`.
- New tests (tests first; all PostgreSQL, all NOT RUN here): `later-variation-isolation.integration.test.ts` (L144, ports 58200+), `later-variation-history.integration.test.ts` (L145, L150, L151, L153; 58400+), `later-variation-replay.integration.test.ts` (L149 incl. concurrent twin; 58600+). Titles carry the item id.

## Commands actually run
- `pnpm --filter @jobguard/db... build` (plain): exit 0 (an attempt with `--concurrency=2` passed to tsc failed with TS5023; harmless, re-run plain).
- First failing run of the three new files: **NOT RUN as a real red**: vitest transforms the files, then every file fails at `Postgres init script exited with code null` (embedded PostgreSQL cannot start in this sandbox; the existing `audit-api-variation.integration.test.ts` fails identically). 11 tests skipped.
- `vitest run test/audit-api-variation.test.ts` (db, scripted merged test, unedited): 7 passed. `vitest run src/variation` (api): 5 passed. Both re-run after the final edit.
- `pnpm exec turbo run typecheck --force --concurrency=2`: exit 0 (7/7, 0 cached). `... lint --force ...`: exit 0 (7/7). `pnpm build --force --concurrency=2`: exit 0 (7/7). `--force` used, no cache hits.
- `git diff --check`: exit 0.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: **fails by design**: "must match exactly one registered lane; found 0" because `config/lanes/later-b25.json` is not in the repo (dispatcher registers it to the changed files).

## NOT RUN
- The three new PostgreSQL files and every other `*.integration.test.ts` (embedded PostgreSQL cannot start here; CI/dispatcher Mac run them). The SQL (row-lock statement with scalar sub-selects, the approval/progress CTE) is therefore unproven against a real server.
- `pnpm test`, `test:db`, `test:migrations`, `test:e2e`, browsers, `pnpm eval`.

## Stops / notes
- No STOP: no merged assertion needed editing. `watchdogCommandGuards`, the command harness and the replay contract test untouched.
- Replay is derived from stored rows (revision/approval/rejection ids), not `app.command_receipt`, to avoid touching the pinned receipt family.
- Reviewer attention: (1) the three scalar sub-selects in the `FOR UPDATE` statements and the `job_closed` flag (undefined in the scripted mock = treated as live); (2) approve on an old approved revision with a NEW approval id still returns `EXACT_CURRENT_PRICED_REVISION_REQUIRED`; (3) existing-scope variation approvals add no progress row.
- LATER (UI): none added.


## History: 16 Oct 2026 stop (superseded by the build below)

Status: **BLOCKED / PARKED; no acceptance claimed**. No source files, existing tests, migrations, grants, pins or policies changed. No customer data, external actions or Git writes were used.

The dispatch addendum requires free disk to remain above 45 GB and says to stop otherwise. The actual preflight reported:

```text
System-wide memory free percentage: 81%
Filesystem   1G-blocks Used Available Capacity
/dev/disk3s5       926  848        44
```

Stop: `df -g /System/Volumes/Data` reported **44 GB available**. Implementation and all heavy checks were stopped. No deletion or cleanup attempted. Resume requires the dispatcher to restore disk headroom; then repeat preflight before writing tests or code.

## Base and scope

- Initial worktree status was clean.
- Initial and final source HEAD: `31682762c903d716657c573e1b5deae63588aad7`.
- Local `origin/main`: `31682762c903d716657c573e1b5deae63588aad7`, differing from header base `ca435eeb5791638c787c830d6ba717146f694539` and draft base `0bbb5ddb`. No fetch attempted. Current local main governs any resumed implementation.
- Read AGENTS.md, the standing handoff, BUILD_PLAN.md variation/C5/CH-2 passages, repository/application source, existing variation test/configuration and lane-tool source. This was source inspection only, not verification of acceptance criteria.
- The initial grouped inspection ended with exit 1 while reading `config/lanes/later-b25.json`; lane availability still needs diagnosis when work resumes. No lane file created or changed.
- No migration; **new GRANTs: none**. Standard F: no direct protected-table write grant added.
- L144, L145, L149, L150, L151, L153: **NOT IMPLEMENTED / NOT TESTED**. Tests-first red run: **NOT RUN**, stopped before adding tests.

## Commands executed before stop

Commands were grouped into read-only shell invocations. No test counts exist (zero tests executed).

1. `pwd; git status --short; git rev-parse HEAD origin/main; cat AGENTS.md; cat config/lanes/later-b25.json` — grouped exit **1**; clean status and the SHAs above observed.
2. `cat ~/.local/share/full-steam/handoffs/jobguard-task.md; cat package.json; rg -n 'M1-9|C5|CH-2|variation|Discovered later' BUILD_PLAN.md` — output returned; grouped exit code not retained in the truncated transcript.
3. `cat packages/db/src/variation-repository.ts; cat apps/api/src/variation/variation.application.ts` — exit **0**.
4. `cat packages/db/test/variation.integration.test.ts; cat packages/db/package.json; cat packages/db/vitest.config.ts; cat tools/agent-lane-boundary-lint.mjs` — output returned; grouped exit code not retained in the truncated transcript.
5. `rg --files -g AGENTS.md -g '*later-b25*' -g '*variation*' -g '*progress*' -g '*command-receipt*'; sed -n '212,238p' BUILD_PLAN.md; sed -n '455,478p' BUILD_PLAN.md; cat ~/.local/share/full-steam/handoffs/jobguard-task.md; memory_pressure | tail -1; df -g /System/Volumes/Data; node --version; export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version` — exit **0**. Node `v24.17.0`; pnpm printed a warning that package.json overrides are ignored; version was not present in the captured output. Memory 81%; disk 44 GB. The disk result requires this stop.

The grouped command exit status does not prove every constituent read succeeded.

## Checks not run

- All three requested new PostgreSQL files (`later-variation-history.integration.test.ts`, `later-variation-replay.integration.test.ts`, `later-variation-isolation.integration.test.ts`): not created; **NOT RUN** because disk preflight stopped implementation. PostgreSQL cannot start in this sandbox per the dispatcher.
- `pnpm exec turbo run typecheck --force --concurrency=2`: **NOT RUN**, disk minimum not met.
- `pnpm exec turbo run lint --force --concurrency=2`: **NOT RUN**, disk minimum not met.
- `pnpm build --force --concurrency=2`: **NOT RUN**, disk minimum not met. No cache-hit result claimed.
- Lane lint / `pnpm lint:lanes`, OpenAPI check: **NOT RUN**, stopped at preflight.
- Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: **NOT RUN**, dispatcher-owned full suites and sandbox restrictions.
- `pnpm test:e2e`, browser/Playwright: **NOT RUN**, explicitly prohibited locally; CI only.
- `pnpm eval`: **NOT RUN**, no AI change.

## Self-inspection and release state

No implementation verdict is possible. No merged test/assertion, fingerprint, runtime grant, approval provenance, origin or lifecycle behavior was altered. All acceptance lines remain outstanding. No new alert, data migration or compatibility impact. Independent RED reviews and separate acceptance remain outstanding; this is a builder receipt only. Decision 74 PARK remains binding: no merge, enablement or deployment.

The requested first-line attribution to Claude Sonnet was not used because it would misidentify the actual builder. Intended commit message is in `/private/tmp/jg-msg-later-b25.txt`; no commit or push performed. Closeout diff and hashes are recorded below.

## Closeout evidence

Documentation creation with `apply_patch` succeeded. Closeout command:

```sh
git diff --check; git diff --stat; git status --short; git rev-parse HEAD; shasum -a 256 packages/db/src/variation-repository.ts apps/api/src/variation/variation.application.ts docs/ledger/LATER-B25.md /private/tmp/jg-msg-later-b25.txt
```

Grouped exit **0**; diff check passed. `git diff --stat` was empty (no tracked modifications). Status listed only these untracked paths:

```text
?? docs/ledger/LATER-B25.md
?? docs/verdicts/LATER-B25/
```

SHA-256 at closeout:

```text
0ed814d70f2af26d3b30628d25c0994fa8182180ecf1e0e34d11141b1a96914a  packages/db/src/variation-repository.ts
50b44ab552ec13c4696e44de3a783f6e33c345f8bbc4445f7ddae3326e67645d  apps/api/src/variation/variation.application.ts
09d1e1309ae1eb028951be9f9b6e9e7fd643e999e1ffa8d121e43cdf9a15f794  docs/ledger/LATER-B25.md
b434b444dd3b44891455f84b22128e81937202afc0fd671a99d78a9097de9429  /private/tmp/jg-msg-later-b25.txt
```

This final receipt-only `apply_patch` succeeded. Final HEAD remains `31682762c903d716657c573e1b5deae63588aad7`; no Git mutation was performed. Source hashes are documentary evidence, not a permanent test pin.

## r1 repair (review eed47072)

Repaired by Claude Sonnet (Codex stand-in), dispatcher 14

Changes:
- S1: removed `class VariationCommandConflict extends VariationRevisionConflict` from `packages/db/src/variation-repository.ts`; the three repository sites (priced revision write, approve, reject) and the one site in `apps/api/src/variation/variation.application.ts` now throw `new VariationRevisionConflict("VARIATION_COMMAND_CONFLICT")`; the import was dropped. The controller still maps `VariationRevisionConflict` to 409 with the code; no test edited.
- S2: in `writePricedRevision`, `approvePricedVariation` and `reject` the variation row is locked in its own `SELECT ... FOR UPDATE` statement; the prior revision / approval / rejection look-up by command id (and the job-closed flag) is a separate following statement, then compare/return, then the live and stale checks. Replay still writes nothing and appends no audit; a new write appends audit once. The misleading comment was corrected.

Commands run:
- `pnpm --filter @jobguard/db... build`: exit 0.
- `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts src/variation --maxWorkers=2`: 2 files, 126 tests passed.
- `pnpm --filter @jobguard/db typecheck` and `pnpm --filter @jobguard/api typecheck`: exit 0. `pnpm --filter <pkg> lint` (tsc): exit 0.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: passed, same 8-file lane.

NOT RUN: `packages/db/test/later-variation-*.integration.test.ts` (embedded PostgreSQL does not start here; an attempt at the replay file reported 5 skipped, file failed). The S2 concurrent test is unproven until CI. No `--force` turbo runs or full build were done for this repair.

## r2 repair (delta check aad5dfe6)

Repaired by Claude Sonnet (Codex stand-in), dispatcher 14

- `packages/db/src/variation-repository.ts`: the r1 split lookup broke the merged scripted `test/audit-api-variation.test.ts` (5/7). The prior-command sub-select is back inside the locked `FOR UPDATE` statement (as before r1). A separate fresh-snapshot lookup runs only when `prior` is NULL and the locked row already shows the twin's own write: revise `current_revision_id = r.id`; approve `state='approved'` and `current_revision_id = a.revisionId`; reject `state='rejected'` and `current_revision_id = input.revisionId`. S1 unchanged. Receipt lines 9, 11, 15 corrected.
- Run: db `vitest run test/audit-api-variation.test.ts --maxWorkers=2`: 7/7 pass. api `src/watchdog-registry.test.ts src/variation`: 126/126 pass. db and api typecheck exit 0. `LANE_BASE_REF=origin/main pnpm lint:lanes` passed.
- NOT RUN: `later-variation-*.integration.test.ts` (embedded PostgreSQL does not start here); the concurrent-twin test is unproven until CI.
