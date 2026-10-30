# CH5-B builder receipt — DEPENDENCY-BOUND partial boundary

25 October 2026, C268. Synthetic only. **Not complete, independently reviewed,
accepted, committed, pushed, merged or released.** No successful baseline read,
capture/final-account projection or activation mapper is claimed.

## Authority and preflight

Clean entry on `codex/sandbox/ch5-b`, HEAD
`c6c4ec9765877da4793187fe7e3123448db992c1` (CH5-P, in review per dispatch).
Local read-only origin/main: `cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe`.
No fetch/freshness claim. User explicitly authorizes build-ahead and own lane
file, superseding the draft's issue/registration restrictions only. Merge waits
for parent acceptance and merge. No Git-writing command or dependency download.

Read full repository AGENTS.md; BUILD_PLAN §§2.2–2.4 and CH-5; authoritative
planning pack DRAFT CH5-B, shared §§1–3, source/handoff §5, lane row and resource
rules. Read CH5-P code/receipt, CH5-C contracts and saved CODEX_SESSION_POLICY.
No reserved branch inspection, foreign-domain implementation or subagent work.

## Actual dependency facts and implementation

CH5-P's actual repository has a preview and unconditional held adoption/read.
No persisted v3 baseline/lines/terms or successful result exists. Its receipt
explicitly records STOP-PERSISTENCE/STOP-TERMS and missing accepted activation
DTO/trial-plan reference. The proposed `ImportedFinalAccountBaselineV1` is not
installed or acknowledged. A preview schema cannot substitute for immutable
persisted source reconstruction. Parent acceptance is not inferred.

Added only the five authorized new adapter/contract/test files, own exact lane
and this receipt. Core exports a frozen versioned synthetic hold and typed error.
Both pure mapper boundaries return `never` and always refuse unaccepted input.
They do not mint a DTO, inspect/modify input, make captures or create terms.

The DB reader takes an original verified context plus session digest per call,
passes it unchanged to withTenant, reauthenticates persisted current session,
then uses the existing session-owned-job CTE with tenant/job/digest. Authorized
jobs receive `IMPORTED_BASELINE_SOURCE_HANDOFF_HELD`; foreign/unknown/session
denial receives `FORBIDDEN` first. Invalid digest/job has a typed scope error;
non-synthetic mode refuses before SQL. `expectedBaselineRef` stays opaque/unused
until its owners supply the accepted contract; it is never used as a quote ID.
The reader does not cache scope, fall back to current party/plan data, read
baseline content/hidden output, write business records, or call a provider.

No migration: reservation **0230 unused** (draft B prohibits a new migration).
No new SQL routine, table, grant, RLS exemption or controlled write path. Hence
LP-0 including lp-0-authority-paths, tenancy, SERIOUS-B5 and contractor-entitlement
require **zero additive catalogue rows**. Existing freezes/inventories remain
unchanged; a future successful implementation must supply its own exact entries.
No schema/backfill/rollback, provider/data-flow/env, financial or alert change.

## Acceptance and holds

| Acceptance | Actual status |
| --- | --- |
| CH5-B01 exact source sum | DEPENDENCY-BOUND; no persisted v3 source, no replacement arithmetic |
| CH5-B02 stable identity/description/hash/revision | DEPENDENCY-BOUND; no invented source revision |
| CH5-B03 scoped denial | Application scripted tests plus authored CI-only real session/tenant/job/expiry/revocation/pool tests; successful source references remain DEPENDENCY-BOUND |
| CH5-B04 all baseline lines fee-free captures | DEPENDENCY-BOUND; no successful capture mapper or fee output |
| CH5-B05 old party/terms preserved | No writes; positive immutable persisted projection proof remains DEPENDENCY-BOUND |
| CH5-B06 pure mapper has no SQL/write/provider/hidden access | Pure refusal only; no working mapper claim |
| CH5-B07 quoted/v1 unchanged | All existing source/tests untouched; actual local regression results below; DB regression CI-only |
| CH5-B08 no ID reaches baselineQuoteVersionId | No success output/quote consumer wiring exists |
| CH5-B09 owner handoff unaccepted | Explicitly HELD; no final-account/lock compatibility work authorized |

Holds retained: parent P acceptance/merge; C/P source DTO handoff; CH-1/MON-1/SV-2
source acknowledgement; H-IMPORT-BASELINE/H-SV5/H-SV6 and downstream CH5-J;
integrated CI; two actual exact-head independent Claude verdicts; separate
acceptance; all production/real-data/provider/charging/release gates.

Shared coordinator surfaces remain untouched: core/db barrels, activation,
final-account/lock routines, migrations, existing tests/catalogues and central
`config/agent-lane-assignments.json`. If this partial boundary is accepted as
useful, exact optional exports are core `importedBaselineSourceHold`,
`ImportedBaselineSourceError`, `requireImportedBaselineSource`,
`toImportedShadowCaptures`, `toImportedActivationSource`; DB
`readImportedBaselineSources`, type `ImportedBaselineReadScope`. These exports
must not be described as working positive source APIs. No transport registration.

C1/C2/C7: this bounded held internal leaf has no new route/page/web workflow;
no browser spec invented. DB/browser suites run in reviewer/GitHub CI under the
dispatch environment constraint; no PostgreSQL/listener was started. No AI,
prompt, extraction/matching change; no live or fixture evaluation claim needed.
No full imported catch/£0-fee journey claimed. Full root test includes DB and
therefore must run in CI, not this sandbox.

## Checks and mutation evidence

Results below are from actual execution. Logs use `/private/tmp/jg-ch5-b-*`.
Tests labelled scripted are unit transport evidence, never PostgreSQL guarantees.
Real PostgreSQL tests are authored in imported-baseline-sources.integration.test.ts
without skip/todo and are NOT RUN locally.

Environment: Node v24.17.0; installed cached pnpm 10.28.1 CLI via the existing
`/private/tmp/jg-ch5-p-bin/pnpm` wrapper; Vitest 4.1.11. Dependencies were supplied,
not reinstalled; no clean-install claim. Root Turbo used `--concurrency=1`; Vitest
used `--maxWorkers=2`, at most three named files per invocation. No concurrent
checks. Waited while observed host load exceeded 20 (peaked around 38). After
that wait, heavy checks used the existing `/Users/benharwood/.local/bin/heavy-slot`
with `HEAVY_SLOTS=1`, approved host-resource inspection, serially. No replacement
scheduler or load-limit bypass. Initial typecheck ran directly below load 20.
Disk preflight 101 GiB free; observed memory 44–53% free. Some Turbo cache logs
replay other worktree paths; these are cache hits, not claims of fresh execution.

| Actual command | Result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Initial exit 2: missing core dist artifacts throughout existing DB modules; no core dist directory at entry |
| `pnpm --filter @jobguard/core build` | Exit 0; prerequisite artifacts generated locally |
| `pnpm typecheck --concurrency=1` rerun | Exit 0, 7 tasks successful, 2 cached, 33.451s |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1; core purity passes (243 files), lane comparison refuses inherited parent changes; package lint not reached by this command |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, same inherited range; **H-LANE-BASE** |
| `pnpm turbo run lint --concurrency=1` | Exit 0, all 7 package tasks, 2 cached |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/imported-baseline-sources.test.ts src/final-account.test.ts src/shadow-domain/capture.test.ts` | Exit 0, 14 tests / 3 files |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/imported-baseline-sources.integration.test.ts test/job-import-v3.integration.test.ts -t source-only` | Exit 0, 20 scripted tests / 2 files; 5 DB tests deselected by name (Vitest displays skipped), no PostgreSQL execution |
| `python3 /private/tmp/jg-ch5-b-mutations.py` | Exit 0; all 10 behavioral controls killed (each mutant Vitest process exits 1 as expected); source restored in finally after each |
| `pnpm build --concurrency=1` | Exit 0, 7 tasks successful, 2 cached, 1m6.931s; existing Next workspace-root/webpack/CSS warnings |
| `pnpm openapi:check` | Exit 0; no generated contract change |
| `node --test --test-concurrency=1 --test-name-pattern='MC-6 migration order' tools/merge-churn.test.mjs` | Exit 0, 1 migration-order unit test, no PostgreSQL and no Git-writing fixture tests selected |
| `node tools/money-arithmetic-lint.mjs` | Exit 0 |
| `node tools/commercial-boundary-lint.mjs` | Exit 0 |
| `LANE_BASE_REF=HEAD pnpm lint:lanes` diagnostic | Exit 1; checker correctly refuses self-comparison. Not a replacement pass |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-ch5-b-tests-tsconfig.json` | Exit 0; authored integration test and imported helpers compile, no DB run |
| `node /private/tmp/jg-ch5-b-scope.mjs` | Exit 0: exactly 7 authorized new files, zero tracked edits, new-file whitespace clean; diagnostic only |
| `git diff --check` | Exit 0; untracked-file whitespace additionally covered above |

`H-LANE-BASE`: the dispatched base is ahead of origin/main. Required lane failures
include inherited apps/api/openapi.json, job-work-state API/web files, workspace
application, CH5-C/P and MON1 lane/source/catalogue paths. These are not CH5-B
edits and were not absorbed into its allowlist. Full logs:
`/private/tmp/jg-ch5-b-lint.log`, `/private/tmp/jg-ch5-b-lanes.log`.
Do not waive the required integrated-main lane check based on the narrow scope
diagnostic. Root lint/full CI remain HOLD until dependencies are integrated.

Every new guard has a recorded executable mutation control. Each temporary
mutation runs the actual named core tests or DB **source-only** tests, one process
at a time, and must fail a behavioral assertion (loader failures do not count):

| Guard / control label | Temporary mutation caught |
| --- | --- |
| `core-hold` | Shared refusal returns undefined instead of throwing |
| `core-freeze` | Availability value is no longer frozen |
| `capture-refusal` | Capture boundary returns an empty array |
| `activation-refusal` | Activation boundary returns an empty object |
| `synthetic-mode` | Mode guard disabled |
| `strict-scope` | Invalid digest/job parse guard disabled |
| `current-session` | Persisted current-session refusal disabled |
| `job-ownership` | Session-owned-job refusal disabled |
| `reader-hold` | Reader returns undefined rather than typed unavailability |
| `verified-context` | Original context replaced with a copied object |

All ten: mutant exit 1, killed=true; aggregate exit 0, log
`/private/tmp/jg-ch5-b-mutations.log`, individual failure logs
`/private/tmp/jg-ch5-b-mutant-<label>.log`. These are application/pure controls,
not SQL/RLS mutation verification. Final build and test compilation ran after
byte-for-byte source restoration. No successful-DTO guard is invented to test.

CI-only, NOT RUN here:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/imported-baseline-sources.integration.test.ts test/job-import.integration.test.ts test/final-account.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-import-v3.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm test
```

The new real PostgreSQL cases cover current authorized job refusal/no effects,
another session in the shared tenant, same-tenant other job, unknown job, foreign
tenant, expired/revoked session and pooled context reset. They cannot verify a
nonexistent positive imported source. No browser suite is applicable to this
internal held boundary; existing mandatory browser regressions remain CI duties.

Final disk sample: 97 GiB free (above the 45 GiB floor); host load 9.63. Final
scope/whitespace rerun after receipt edits passes; exactly seven new files and
zero tracked edits. B's own positive source work needs the accepted source DTO
and persisted reader handoff; downstream final-account/lock implementation is
a separate coordinator/CH5-J gate, not a new prerequisite imposed on B.

Final files remain unstaged/uncommitted. Dispatcher owns commit and push; intended
conventional subject/body is `/private/tmp/jg-msg-ch5-b.txt`. Exact-head reviews
must bind the dispatcher-created commit. This receipt supplies no independent
verdict, technical acceptance, dependency clearance or merge authorization.

## Session record

Saved policy: `/Users/benharwood/.local/share/full-steam/jg-runs/approved-saved-resumes-20261021T173036Z/CODEX_SESSION_POLICY.md`.
Current thread ID comes from CODEX_THREAD_ID; runtime model/effort not exposed.
This is the issued new leaf, not a claimed resume of a parent builder.

```yaml
session_record_version: 1
task_id: CH5-B
project: JobGuard
role: builder
thread_id: 01a172ad-a1f5-7102-8d93-ea130b39a6b0
surface: unknown
host: local macOS sandbox
authorised_route_ref: user CH5-B order C268, 2026-10-25
repository: /Users/benharwood/Claude/Projects/my-new-project
integration_target: origin/main
integration_target_revision: cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe
worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch5-b
branch: codex/sandbox/ch5-b
starting_base_revision: c6c4ec9765877da4793187fe7e3123448db992c1
source_pin: c6c4ec9765877da4793187fe7e3123448db992c1
candidate_revision: uncommitted working tree on c6c4ec97
last_validated_revision: see actual results below; no exact commit yet
allowed_files_ref: config/lanes/ch5-b.json; C268 own-lane/receipt exception
governing_contract_ref: AGENTS.md; BUILD_PLAN.md CH-5; planning pack DRAFT CH5-B
model_requested: unknown
effort_requested: unknown
model_runtime_confirmed: unknown
effort_runtime_confirmed: unknown
runtime_confirmation_ref: unknown
last_completed_turn: CH5-B bounded build, 2026-10-25
last_receipt_ref: docs/verdicts/CH5-B/BUILDER_RECEIPT.md
state: DEPENDENCY-BOUND partial working-tree handoff
resumed_from_thread_id: unknown
successor_reason: new issued CH5-B leaf
preflight_ref: clean status; HEAD c6c4ec97; C268 scope
result_id: unknown
acknowledgement_ref: unknown
ci_evidence_ref: unknown
reviewer: unknown
review_evidence_ref: unknown
accepting_actor: unknown
acceptance_evidence_ref: unknown
outstanding_holds: P acceptance/merge; immutable baseline/terms DTO and reader; final-account/lock owner bridge; CI; independent review and acceptance; all release gates
builder_finished_at: 2026-10-25T11:08:33Z # shell UTC clock at receipt finalization
coordinator_acknowledged_at: unknown
integrated_at: unknown
merged_revision: unknown
```
