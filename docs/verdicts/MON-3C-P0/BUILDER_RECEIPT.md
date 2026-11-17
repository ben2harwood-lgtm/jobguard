# MON-3C-P0 builder receipt

```yaml
session_record_version: 1
task_id: MON-3C-P0
coordinator_ruling: C264
date: 2026-10-25
builder_model: gpt-6.1-sol
branch: codex/sandbox/mon-3c-p0
issued_base_sha: 28416d1ea7e154f2353d56e28f30db34e06e36ab
target_main_sha: 28416d1ea7e154f2353d56e28f30db34e06e36ab
scope: documentation_only
review_requirement: "one independent check (JobGuard fast lane)"
independent_verdict: pending_dispatcher_commit
acceptance: pending_separate_actor
delivery: working_tree_only
```

Status: documentation prepared; mandatory gate holds recorded below. No implementation completion,
independent review, acceptance or MON-3 closure is claimed. Dispatcher owns
commit/push; Ben owns merge/release. No git add/commit/checkout was run on the
delivery repository. Tool tests use their own disposable fixture repositories.

## Delivered scope and source inspection

Exactly three permitted delivery files: the lifecycle contract, own lane JSON
and this receipt. No runtime, migration, dependency, provider, schema, prompt,
environment or shared-register change. No migrations/backfill or operational
alerts; no backwards-compatibility behavior change. Historical v1 £79/cap,
preview timing, pilot history and `none_recorded_pre_mon2a` remain untouched.

Read the complete authoritative MON-3C-P0 card at line 1771, DRAFT MON-3C at
883, CAL/ELIG/END/CONV/WIRE, shared ownership/predecessor/hold and verification
sections of the corrected 20 October draft. Read repository `AGENTS.md` and
applicable `BUILD_PLAN.md` trial/task contracts. Reinspected main source at the
SHA above rather than copying candidate signatures from planning prose.

A's actual SQL is `0194_free_first_job_keys.sql` (older contracts still mention
0192). B's named repositories, migration 0206 and disabled mutation are absent
from this main; contract records H-B and no invented B signature. CH-4-C command,
read, source and timing code is present; exact review/CI/acceptance handoff remains
held. Existing subscription and lock declarations were inspected. The contract
separates existing, proposed and absent interfaces and source-inspected from
executed/reviewed evidence.

| P0 assertion | Documentation evidence / builder consistency assessment |
| --- | --- |
| P0-01 | Original Build/Done-when and §10.1.7 requirements map to CAL/ELIG/END/CONV/WIRE acceptance IDs and actual required evidence; WMT-C-01–08 and common security/browser obligations covered. Future test execution outstanding. |
| P0-02 | Every decision slot is an explicit HOLD with blocked leaves: London count/deadline, DST gap/overlap, first-skip identity, company/practice authority, conversion date, stub, anchor, terms and late negative correction. No default money policy. |
| P0-03 | Sole shared-file owners, serial integration windows, no migration allocation or caller tenant/identity/trial authority; exact own lane uses validator's implicit own-file permission. Legacy register untouched. |
| P0-04 | B hard stop must survive every preparatory leaf when merged; absent current B is not claimed executed. Historic v1/pilot compatibility retained and WIRE positive runtime proof BLOCKED under H-ENABLE. |

These are builder documentation consistency findings, not implementation tests or
an independent verdict. The contract's policy holds remain open; later source
leaves retain their two-Claude/exact-CI/separate-acceptance requirements.

## Commands actually run

Installed Node is `v24.17.0`; cached pinned pnpm is `10.28.1`, invoked through
`COREPACK_ENABLE_NETWORK=0 /usr/local/bin/corepack pnpm`. The default shell pnpm
version query stalled in version management and was interrupted; no install or
download was requested. No clean reinstall is claimed; dependencies were supplied.

Before heavy checks: about 70 GiB available (>45 GiB), observed host load 7.22,
memory free 61%, four Node processes. Sandbox resource queries were denied;
read-only host inspection and checks were run with approved escalation. All
heavy commands use the existing `/Users/benharwood/.local/bin/heavy-slot` with
`HEAVY_SLOTS=1`; one command at a time. Each Node test batch has at most three
named files and `--test-concurrency=1`; Vitest batches use one worker and at most
three named files. The scheduler still enforces its load/memory/process gates.
Temporary fixture repositories stay at
`node_modules/.cache/mon-3c-p0/tmp` inside the worktree via `TMPDIR`; evidence is
recorded here, never in `/private/tmp`. Scheduler lock files are infrastructure,
not evidence. The separately requested commit-message file is the sole intended
handoff outside the worktree.

For rows below, the common prefix is `HEAVY_SLOTS=1` plus the existing heavy-slot
path and the stated `jg-mon-3c-p0-*` label. pnpm rows use the cached offline
Corepack invocation above. Tools/unit rows additionally use the TMPDIR above.

| Label / actual command arguments after wrapper | Result |
| --- | --- |
| `lint`: `LANE_BASE_REF=origin/main … pnpm lint` | FAIL: core purity passes (234 files; seven computed-import notices), then lane guard refuses equal HEAD/base with “Missing branch or self-comparison range”; package lint not reached. No base substitution or checker edit. |
| `lanes`: `LANE_BASE_REF=origin/main … pnpm lint:lanes` | FAIL: same equal-base guard. Dispatcher must rerun after creating the real commit. |
| `tools-1`: `node --test --test-concurrency=1 tools/agent-lane-boundary.test.mjs tools/agent-lane-boundary-train.test.mjs tools/merge-churn.test.mjs` | PASS: 81 tests. |
| `tools-2`: `node --test --test-concurrency=1 tools/ci-workflow.test.mjs tools/dependency-audit.test.mjs tools/decision-records.test.mjs` | PASS: 16 tests. This tests audit behavior; no live dependency audit was run. |
| `tools-3`: `node --test --test-concurrency=1 tools/core-purity.test.mjs tools/commercial-boundary.test.mjs tools/decision-check-purity.test.mjs` | PASS: 6 tests. |
| `tools-4`: `node --test --test-concurrency=1 tools/later-commercial-boundary.test.mjs tools/later-core-purity.test.mjs tools/later-money-arithmetic.test.mjs` | PASS: 12 tests. |
| `tools-5`: `node --test --test-concurrency=1 tools/commercial-integrity-current-source-guard.test.mjs tools/shared-money-origin.test.mjs tools/later-shared-money-discovery.test.mjs` | PASS: 179 tests. |
| `tools-6`: `node --test --test-concurrency=1 tools/policy-gate-sites.test.mjs` | PASS: 1 test. All 16 tool files covered, 295 tests total, zero failed/skipped. |
| `typecheck`: `pnpm typecheck --concurrency=1` | PASS via shared Turbo cache: 7/7 tasks cached. Logs replayed from other worktrees; no fresh compiler execution claimed. |
| `unit`: `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/free-first-job.test.ts src/free-first-job-keys.test.ts src/free-first-job-period.test.ts` | PASS freshly executed: 3 files, 19 tests, no skips. Pure regression evidence only. |
| `build`: `pnpm build --concurrency=1` | PASS via shared Turbo cache: 7/7 tasks cached. No fresh production compilation/browser journey claimed. Telemetry disabled for this invocation. |
| `openapi`: `pnpm openapi:check` | FAIL: nested shell `pnpm` resolves global 11.8.0 rather than pinned 10.28.1. No version-check bypass/config edit. |
| `openapi-direct`: `pnpm --filter @jobguard/api openapi:check` | FAIL: `tsx` CLI IPC `listen EINVAL` at the long worktree-local pipe path. No HTTP server started. |
| `openapi-node`: `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, exit 0: same generator/artifact comparison, freshly executed without CLI IPC listener. |
| `package-lint`: `pnpm exec turbo run lint --concurrency=1` | FAIL: 6 cached tasks pass; web task hits the same nested global-pnpm mismatch. Official root lint still held independently by self-comparison. |
| `web-lint`: `pnpm --filter @jobguard/web lint` | PASS, freshly executed pinned-pnpm direct web compiler check. Together with the 6 cached results above, package lint coverage is available; official lint is not claimed green. |
| `money-lint`: `node tools/money-arithmetic-lint.mjs` | PASS: existing money arithmetic boundary check. |
| `commercial-lint`: `node tools/commercial-boundary-lint.mjs` | PASS, exit 0. |
| `doc-consistency`: inline `node --input-type=module` with `node:assert/strict`, source reads, unchanged `loadLanePolicy`/`lanePathAllowed` and read-only git queries | PASS: all 18 TS declaration excerpts match actual source, lane has exact branch and two allow entries plus implicit own file, exactly three permitted untracked delivery files, tracked worktree/index unchanged; three named B files absent on `origin/main`. This is deterministic documentation consistency, not an independent model verdict, official range check or lifecycle implementation test. |
| `git diff --check`; `git status --short`; `git rev-parse HEAD`; `git rev-parse origin/main` | No tracked whitespace diff; exactly three new delivery files. HEAD/base remain the full SHA above. New-file trailing whitespace also checked directly before handoff. |

Database, migrations, catalog/RLS/grants, browser/e2e/regression and deployment/
restore suites: NOT RUN locally, CI-only per dispatch. No DB/listener/browser,
provider, paid AI or outbound action was started. No new feature/prompt exists
to evaluate. Full mandatory CI remains due on the dispatcher-created exact head.
Root `pnpm test` is held locally by the draft's broad-suite/nested-unbounded-Node
rule; targeted tools and pure unit evidence cannot replace that mandatory gate.
No mandatory CI check was removed or reclassified. Cached task results do not
prove a fresh clean install or fresh execution in this worktree.

## Remaining handoff

Run the required CI checks after commit/push; official lint/lane checks require
a non-self comparison to `origin/main`. Bind one independent check (JobGuard
fast lane) to the exact dispatcher-created commit, then obtain separate
acceptance. No builder self-acceptance. All B/predecessor/CH-4/clock/identity/
practice/HTTP/conversion/external/enablement and live commercial/release holds
listed in the contract survive. No permission to issue later leaves is implied.

Intended conventional commit message is written, as dispatched, to
`/private/tmp/jg-msg-mon-3c-p0.txt` (subject plus body). No evidence logs are stored
there. Review must bind the actual future commit, never this uncommitted receipt
or a placeholder SHA.
