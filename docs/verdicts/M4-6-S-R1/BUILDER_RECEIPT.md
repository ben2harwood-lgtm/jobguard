# M4-6-S-R1 builder receipt

11 October 2026 · builder: Codex · branch `codex/sandbox/m4-6-s-r1`.
Base and sandbox HEAD: `ff072c70d577c47847de56c8b30e708bee4267dd` (`origin/main`). This is a working-tree handoff: `.git` is read-only, and the dispatcher commits the exact tree after exit. No implementation commit hash, CI result, independent verdict or technical acceptance is claimed.

**Builder receipt only — not independently verified, not accepted.**

## Changed files and scope

- `config/agent-lane-assignments.json`: exactly one new compact `m4-6-s-r1` line, in name order, as the first change; exact issued branch, receipt, note and allowlist.
- `packages/db/migrations/0115_recovery_follow_up_repair.sql`: replaces only 0112's `guard_recovery_follow_up` and `evaluate_recovery_follow_ups`.
- `packages/db/src/migrate.ts`: registers 0115 in numeric order; reserved 0113/0114 left alone.
- `packages/db/src/recovery-follow-up-repository.ts`: matching source rule and duplicate clock-audit suppression; retains historical due-audit catch-up.
- `packages/db/test/recovery-follow-up.integration.test.ts`: seven appended PostgreSQL cases; the entire previous file is an unchanged byte-for-byte prefix.
- `packages/db/test/recovery-follow-up-upgrade.integration.test.ts`: three populated-upgrade cases.
- `packages/db/MIGRATIONS.md`: operational/upgrade/forward-fix notes.
- This receipt.

No table, column, policy, grant, role, trigger or pre-existing row is changed by applying 0115. All earlier migration files, the three M4-5-S guards restated by 0112, SBOX-2 source/routines, BUILD_PLAN, core/API/UI source and existing timeouts are untouched. No new or longer timeout, skip, retry wrapper or package download/install was introduced. Shared migration-runner/registry edits must serialize with CH-7 and ENT-10a. Synthetic only; no live provider or commercial outbound action was exercised.

Read: AGENTS; BUILD_PLAN C4/C5 and M4-6-S/Repairs-first; merged M4-6-S receipt/DW1–DW6; 0112 in full, 0107's three guards, 0021; follow-up repository/core/tests and prior upgrade test; first Opus verdict; issued Sol-check findings 1–3. Findings 4–5 remain outside this repair.

## Tests first

After the lane line, both PostgreSQL test files were written before implementation changes. Tests were **NOT RUN (sandbox cannot start PostgreSQL)**. Red-before-fix is source reasoning, not an execution claim: direct SBOX advance lacks the atomic audit on 0112; the rollback test detects its absence before injecting a later failure; reopened-after-revoke scheduling selects reminder 2 and refuses it; the upgrade registration assertion fails without 0115. The later active-preview refusal case also fails against the old source selector. Self-review corrected newly written fixture details without editing any pre-existing assertion.

## Repair 1 — DONE (implementation and regression tests; PostgreSQL verification pending)

Replaced routine before/after: `evaluate_recovery_follow_ups` previously wrote the pending Decision, due row and event only. Its original tenant/archive checks, per-intent locks, refusal checks, inserts, ordering and return count are retained verbatim; additions are declarations and an audit batch after the complete domain loop. The batch takes the existing catch-up serialization key before the audit head, rechecks missing persisted audit IDs, appends canonical identifier-only records and advances the head. No business lock follows the head.

The due audit uses the due row's unique `audit_event_id`, the existing system actor and the `audit.ts` canonical key order, UTF-8 SHA-256 and UTC millisecond timestamp format. Where an actual persisted SBOX advance caused the transition, the batch records its `time_advanced` fact before `became_due`, preserving the existing audit-order assertion. That clock fact hashes the persisted clock payload under `hashes.clock`, names the system actor and does not claim fresh human consent. The later repository command sees the same command reference and suppresses its duplicate clock audit. `settleDueAudits` stays for historical 0112 due rows and is a no-op when that due audit ID already exists.

Tests in `recovery-follow-up.integration.test.ts`:

- `R1: direct SBOX-2 advance audits the due transition in the Decision/event transaction without a follow-up read`: Decision, due row, event and audit share SBOX's `xmin`; exact persisted audit identity; real `verifyAuditChain`; later reads/signals leave one due audit.
- `R1: a failure after the atomic due audit rolls back the clock, Decision, due row, event and audit together`: injected failure at SBOX's own audit append confirms the due audit is already present, then verifies no transition/audit/clock row survives and the chain still verifies.

Existing DW3 duplicate/race tests and audit-order assertions remain intact. SBOX-2's merged implementation did not need modification. This is PostgreSQL test code, not executed PostgreSQL evidence.

## Repair 2 — DONE (implementation and regression tests; PostgreSQL verification pending)

Replaced routine before/after: `guard_recovery_follow_up` previously selected the newest message with any approval row. Only that source-selection query/comment changes: select the newest sink-backed, succeeded message, with no later attempt lacking a cancelled outbox action. Every run/session, clock, delivered-source, case/revision, active-intent and owner refusal remains verbatim. The repository uses the same delivered/cancelled predicates and existing typed errors. An unapproved active preview, queued/executing action or unknown outcome refuses; an expired, retryable or failed non-cancelled action also remains ineligible. Cancellation is a definitive outbox state, not inferred from an old authorization or classifier.

Tests:

- `R1 DW6: delivered message 1 remains the source after reminder 2 is approved, revoked, closed and reopened, through exact reminder 3 delivery`: fresh run/intent; old intent stays stopped; new preview sends nothing; changed amount refuses with `RECOVERY_MESSAGE_CHANGED`; exact approval and delivery yield one new simulated message.
- `R1: a later %s attempt still refuses the delivered source in the repository and raw SQL guard`: four cases (`active` preview, `queued`, `executing`, `outcome_unknown`), both boundaries retain `RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED`. The executing state is a labelled admin-injected fixture, not a live execution.

No reopening label, UI wording, M4-5-S source or core error/helper change was needed.

## Repair 3 — DONE (real PostgreSQL upgrade test written; execution pending)

`recovery-follow-up-upgrade.integration.test.ts` installs the actual migration list through `0111_persisted_identity.sql`, creates pre-upgrade previews/approvals/queued actions/unknown outcomes/delivery/revocation and audit history via M4-5-S with its fake adapter, then applies 0112 and 0115 under `jobguard_migration`.

Tests:

- `registers 0111, 0112 and the repair by name in increasing order`: names/order only, no absolute position or "last migration" assumption.
- `applies 0112 and 0115 as migration owner over approvals, queued/unknown/delivered actions and audits without changing one existing row or privilege`: compares exact complete textual row representations plus `xmin`/`ctid` for every pre-existing app/identity/control-plane/infrastructure/audit table, preserves old migration-receipt bytes, compares existing role/membership/table/view/sequence/function ACLs/owners/definer flags/RLS/policies, asserts the complete 0112 catalogue is unchanged by 0115, and runs real audit-hash verification before/after each upgrade.
- `preserves preview/approve/revoke/deliver/reconcile and their refusals on upgraded messages without resending`: exercises those workflows on legacy cases/history, refuses stale previews, outstanding effects, revoked sends, unknown retries and redelivery, proves reconcile adds no sink row or send attempt, and checks repeat migration preserves data.

All comparisons are implemented against PostgreSQL, not ORM mocks. **NOT RUN (sandbox cannot start PostgreSQL)**; these assertions are not yet proven.

## Commands actually run

Dependencies were already installed; no clean-install claim. Runtime: Node `v24.17.0`; cached pinned pnpm `10.28.1`, selected through a task-local `/private/tmp/jg-m4-6-s-r1-bin/pnpm` wrapper and PATH. The default installed pnpm launcher initially failed `pnpm --version` (exit 1: network/signature verification failed while selecting the pinned version); no packages were installed. Subsequent commands used the existing cached pinned CLI. Turbo reported shared-cache permission warnings; cached task logs are not claimed as fresh executions.

| Required command | Exit | Actual result/count |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 successful tasks; 4 cached, 3 executed |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity: 125 TS files; then lane guard refused HEAD equal to origin/main; package lint not reached by this command |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Lane guard: `Missing branch or self-comparison range; refusing a misleading pass.` No changed-file count produced |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-follow-up.test.ts` | 0 | 1 file, 20 tests passed |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-follow-up.application.test.ts` (initial attempt) | 1 | 1 suite failed to load `@jobguard/db`; 0 tests executed because dependency build output was absent |
| Same API command after dependency build | 0 | 1 file, 38 tests passed |
| `pnpm build` | 0 | 7 successful tasks; 4 cached, 3 executed; Next generated 24/24 static pages |
| `pnpm openapi:check` | 1 | `tsx` CLI failed binding its IPC socket with EPERM; 0 snapshot checks completed |

Supplemental checks (do not replace the failed required lane/CLI commands):

- `pnpm exec turbo run lint`: exit 0, 7 successful package tasks; 4 cached, 3 executed. This excludes the root lane guard and does not turn the required lint command green.
- `node tools/money-arithmetic-lint.mjs`: exit 0, money boundary check passed.
- `node tools/commercial-boundary-lint.mjs`: exit 0, no diagnostic output.
- `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`: exit 0, same snapshot generator/check via Node without the CLI IPC server; no diagnostic output; repository snapshot has 83 paths.
- `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop test/recovery-follow-up.integration.test.ts test/recovery-follow-up-upgrade.integration.test.ts`: exit 0, both test files statically typechecked (initial and final runs); this does not execute them.
- `git diff origin/main --check`: exit 0; read-only diff inspection and explicit Python comparisons: exit 0 (details below).

Logs are the actual command captures at `/private/tmp/jg-m4-6-s-r1-*.log`. Required lint/lane failures are caused by the uncommitted dispatcher checkout; no fake event, different base, weakened gate or Git write was used to turn them green. CI must run them after the dispatcher commit. Required OpenAPI CLI remains unexecuted past its prohibited IPC bind despite the equivalent direct generator succeeding.

## NOT RUN

Every database integration test and every Playwright test is **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. No socket, PostgreSQL or browser startup was attempted for these suites.

- `pnpm test:db`, including the 7 appended follow-up cases, 3 new populated-upgrade cases and the unchanged `recovery-message-upgrade.integration.test.ts`, M4-5-S recovery-message, SBOX-2, tenancy, isolation, authorization, audit, idempotency and earlier DB regressions.
- `pnpm test:migrations` (tenancy and Neon-style demo-bootstrap fresh/upgrade/catalog suites).
- All `pnpm test:e2e` Playwright tests, including M4-6-S, M4-5-S and SBOX-2 in both `mobile-360` and `desktop`.
- Full `pnpm test` was not run because it includes the prohibited database suites. No test skip or timeout modification substitutes for it.
- Fresh pinned install, live provider/model evaluations, real customer data, professional approvals and release gates were not exercised. This repair changes no AI prompt/model/parser, so no new AI evaluation gate is introduced.

## Self-review

Re-read the entire `git diff origin/main` and each new untracked file against the exact order. Source-inspected only; this is the builder's self-review, not an independent model verdict.

- Extracted both replaced routines and diffed against 0112: guard changes only its source query/comment; evaluator preserves its entire original body except added declarations and an appended audit batch. All original `RAISE EXCEPTION` checks/error codes remain in their original order. The three message guards and every earlier migration compare byte-identically to origin/main.
- Confirmed business/intent locks precede the audit serialization key and head; evaluator's final block has no business lock acquisition. SBOX-2 follows the trigger with only its own audit append and read; the head is reacquired, not followed by another business lock. Legacy catch-up shares the same serialization key and rechecks persisted audit IDs; primary/unique keys provide duplicate failure protection. New clock facts are suppressed in the later repository command by exact command reference.
- Confirmed SQL/repository parity: delivered requires sink plus succeeded action; each later attempt requires a cancelled action. No other existing refusal is loosened. Exact content, revision, Decision, membership and execution guards remain untouched.
- Found and corrected potential PL/pgSQL alias ambiguity (`d` record versus 0112's existing `d` table alias) by naming the added record `audit_due`. Corrected the new changed-amount test to expect the existing message error. Consolidated upgrade fixtures onto one job/tenant and corrected reconciliation counts to scope the exact case/action; snapshots include tuple transaction/identity to detect rewrites of identical values. Batched row snapshots and deduplicated chain reads keep coverage within existing default timeouts; no timeout increased.
- Byte comparison confirms the original integration test is an exact unchanged prefix. No existing assertion changed; no skip/retry/timeout added. Position assertions use names and increasing order only.
- Independent deterministic allowlist check covers exactly 8 changed/untracked files; registry differs by exactly the issued one line and preserves name order. No change to BUILD_PLAN, the later label/timeout findings, broader read locks, UI, payments or provider policy. This check is explicitly not a successful run of `pnpm lint:lanes`.
- Intended conventional commit subject/body written to `/private/tmp/jg-msg-m4-6-s-r1.txt`. Generated build/cache outputs removed before handoff; nothing is staged, committed or pushed.

## Remaining evidence and release gates

Dispatcher commit and push; exact-head CI including required lint, PostgreSQL/migrations and both browser projects; fresh Claude Opus review and a separate Sol check after CI; separate acceptance. 0115 applies no data backfill/rewrite. Forward fix is another reviewed routine-only migration preserving immutable history; application rollback is schema-compatible but the older application can append an extra clock audit, so it does not restore this repair's duplicate-clock suppression. No production activation or release approval is implied.

**Builder receipt only — not independently verified, not accepted.**


## Round 1 — 11 October 2026

Re-read the original issued order before changing code. This is the in-place repair of PR #130 on `codex/sandbox/m4-6-s-r1`, starting at `c88c5548b377f030639d0a98f15079db923d9c36` (reviewed `fae8695` plus the integrator's merge of `origin/main` `530681c`). The integrator's ruling defines an attempt as a later message **with an approval**. Round-0 prose above describing unapproved previews as refusing was incorrect and is superseded by this section. No Git write, package installation, provider call or database/browser startup was performed.

Round-1 files: `packages/db/migrations/0115_recovery_follow_up_repair.sql`, `packages/db/src/recovery-follow-up-repository.ts`, `packages/db/test/recovery-follow-up.integration.test.ts`, `packages/db/MIGRATIONS.md`, and this receipt. The migration is edited in place; no second migration, new operational alert, data backfill or compatibility change. The inherited lane entry, migration registration, upgrade proof and integrator's BUILD_PLAN ledger line are unchanged by this round.

### Fix A — DONE (source and regression tests; PostgreSQL execution pending)

Both boundaries retain sink + succeeded outbox as the delivered-source condition and newest delivered ordering. Before, each later message was tested with `NOT EXISTS (approval JOIN outbox WHERE status='cancelled')`, so a preview without approval incorrectly blocked. After, a later message blocks only with `EXISTS (approval JOIN outbox WHERE status<>'cancelled')`. The surrounding `NOT EXISTS (later blocking message)` is retained. No approval means no blocking attempt. Approved queued, executing, unknown, retryable, failed and succeeded-without-recorded-delivery actions still block. A newer delivered message becomes the source itself.

Corrected only this leaf's round-0 `active` table row to expect `RECOVERY_FOLLOW_UP_ALREADY_ACTIVE` in both repository and raw SQL. Queued/executing/outcome_unknown rows still expect `RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED`. Corrected the 0115 MIGRATIONS sentence about unapproved previews.

Appended PostgreSQL test names:

- `Round 1 A: cancelling a follow-up with an unapproved reminder permits scheduling from delivered message 1`.
- `Round 1 A: an unapproved reminder survives close and reopen without blocking a fresh run through exact reminder delivery` (preview sends nothing; exact approval and delivery succeed; delivered reminder becomes the next scheduling source).
- `Round 1 A: a live follow-up with an unapproved preview retains ALREADY_ACTIVE and its delivered scheduling source`.

### Fix B — DONE (source and deterministic regression test; PostgreSQL execution pending)

Before, retry finalization read `clockAudited` and constructed its optional clock event before `settleDueAudits` took the shared key. After, finalization takes `recovery-follow-up-audit` **after its command/business locks and domain writes**, then reads `clockAudited` and constructs the optional event under the lock. `settleDueAudits` reacquires that same transaction lock before the audit head; no new business lock follows it. The 0115 atomic audit block and populated upgrade test are byte-identical to the round-0 base.

Appended PostgreSQL test: `Round 1 B: an interrupted 0112 advance retry waits for due-signal audit serialization before checking the clock fact`.

Fixture construction uses the existing upgrade test's migration-owner path (`SET ROLE jobguard_migration`) to install the actual 0112 evaluator body, then runs real SBOX-2 `sandbox.advance` through the runtime role and restores 0115. This creates committed clock/due/Decision/event records with no follow-up finalization or clock/due audit, without hand-writing a business row or modifying SBOX-2. Connection A holds the intent business key before the shared audit key; connection B retries the interrupted command. A separate admin observer queries `pg_stat_activity` / `pg_blocking_pids` until B is actually waiting on A's audit key. A then calls the repaired evaluator to append clock/due entries and commits; B completes. Assertions require exactly one `time_advanced` entry naming the command, one due audit entry and a chain verified by `verifyAuditChain`. No sleep, timing guess, test retry, skip or new/longer timeout was added.

The four new PostgreSQL cases were written before the implementation repairs. They are **NOT RUN**, including red-before-fix: failure on `fae8695` is source reasoning, not executed evidence. At that head the A fixtures lose their eligible source, while B reads the missing clock fact before waiting and appends a second clock entry after A commits.

### Round-1 commands actually run

Existing installed dependencies; Node `v24.17.0`, pinned cached pnpm `10.28.1` through the same task-local `/private/tmp/jg-m4-6-s-r1-bin/pnpm` wrapper. No download or clean-install claim. Turbo's shared-cache permission warnings and replayed cached logs are not fresh execution evidence.

| Command | Exit | Actual result/count |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 successful tasks; 4 cached, 3 executed |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Core purity 125 TS files; lane and money guards passed; 7 successful package tasks, 4 cached, 3 executed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Lane `m4-6-s-r1`; base `530681c`, head `c88c554`; 9 inherited comparison paths including the integrator's ledger line |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-follow-up.test.ts` | 0 | 1 file, 20 tests passed |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-follow-up.application.test.ts` | 0 | 1 file, 38 tests passed |
| `pnpm build` | 0 | 7 successful tasks; 4 cached, 3 executed; Next generated 24/24 static pages |
| `pnpm openapi:check` | 1 | `tsx` CLI failed binding its IPC socket with EPERM; 0 snapshot checks completed |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same OpenAPI snapshot check through direct Node entrypoint; no diff/diagnostic output |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop test/recovery-follow-up.integration.test.ts test/recovery-follow-up-upgrade.integration.test.ts` | 0 | Both database test files statically checked, initial and final runs; no database test execution |
| `git diff --check`; `git diff origin/main --check` | 0 | Read-only whitespace checks |
| Explicit Python routine/predicate/assertion/allowlist comparisons | 0 | Source checks described below; not a model verdict or PostgreSQL proof |

Actual logs: `/private/tmp/jg-m4-6-s-r1-round1-*.log`. Root lint/lane commands now pass with the dispatcher's non-self comparison range. The OpenAPI CLI failure remains recorded separately from its successful direct generator check.

### Round-1 NOT RUN

- `pnpm test:db`: **NOT RUN (sandbox cannot start PostgreSQL)**, including every existing database integration suite, the four new cases, round-0 regressions and populated upgrade proof.
- `pnpm test:migrations`: **NOT RUN (sandbox cannot start PostgreSQL)**, including tenancy and demo-bootstrap fresh/upgrade/catalog checks.
- `pnpm test:e2e` and every Playwright test: **NOT RUN (sandbox cannot start a browser)**, including M4-6-S/M4-5-S/SBOX-2 in both projects.
- Full `pnpm test`: **NOT RUN (includes the prohibited PostgreSQL suites)**. No fixture or mock pass substitutes for them.
- Fresh install, live provider/model evaluation, real data, professional approval and release checks were not exercised; no AI/model change in this round.

### Round-1 self-review

Builder source inspection only. Re-read the full working-tree diff, the inherited diff against `origin/main`, and both replaced routines against 0112.

- SQL guard equals 0112 except its stated source query/comment and `CREATE OR REPLACE` declaration; every other refusal/body segment is byte-identical, and all `RAISE EXCEPTION` codes retain order.
- Evaluator preserves 0112's complete domain loop and return unchanged; only round-0 audit declarations/block are added. It is byte-identical to the base `c88c554` evaluator. Repair 1 and repair 3 are unchanged.
- Delivered and later-blocking predicates in SQL/repository match after whitespace normalization. Unapproved previews are ignored; only approval + non-cancelled outbox blocks. Other scheduling and exact authorization checks remain intact.
- Clock existence check and optional event construction follow the shared key, which follows all finalization domain writes. Due signal's original intent locks precede its shared key/head. Under either winner, the waiting path reads audit state only after acquiring the key. Reentrant acquisition in catch-up introduces no later business lock.
- The pre-leaf main integration test remains a byte-identical prefix after normalizing the extended `readFile` import. Only the explicitly authorized round-0 active row expectation changed. Four cases are appended; no existing main assertion, timeout, skip or retry changed.
- The test uses the actual 0112 evaluator restored by its owner and real SBOX-2 runtime writes. Backend PID/blocker observation controls the interleaving. Self-review fixed the extraction to recognize 0112's `CREATE FUNCTION` spelling and added prompt failure if B exits instead of waiting; no handwritten immutable history.
- Working-tree delta is confined to these five lane files. No earlier migration, BUILD_PLAN, lane registry, migration runner, SBOX-2, upgrade test, UI, core or API source changed this round. No second migration or table/policy/grant/role/trigger mutation in 0115.
- Intended conventional commit subject/body written to `/private/tmp/jg-msg-m4-6-s-r1.txt`; dispatcher owns commit/push. Generated dist, Next, Turbo and TypeScript build-info artifacts removed after successful build; no staging, commit or push.

Remaining evidence: dispatcher exact commit, CI database/migration/browser runs, the same independent Opus and Sol re-checks and separate acceptance. No task acceptance, merge or release is asserted.

**Builder receipt only — not independently verified, not accepted.**
