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
