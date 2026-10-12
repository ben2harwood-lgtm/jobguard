# CH-7-TERMS builder receipt — continuation round 2

Builder: Codex. Issued 12 October 2026; Q1–Q5 and the active-owner amendment remain in force. Round 2 implements only the coordinator's amended T8 ruling of 12 October 22:40, issued about 22:45. T1–T7 and T9–T13 are unchanged.

**Status: amended T8 test written; PostgreSQL/browser execution and independent acceptance remain owed.** Round 1 was committed by the dispatcher as `ba6e30f8617df84f1dda12c6bcfbe46d1af138ba` (`feat(recovery): record synthetic case fee terms and guard pursuit`), the starting HEAD of this continuation on `codex/sandbox/ch-7-terms`. Round 2 changes only the existing T8 integration test and this receipt. No commit, add, checkout, fetch, push, package install/download, PostgreSQL or browser was performed by this builder. The intended commit message is `/private/tmp/jg-msg-ch-7-terms.txt`.

The fixed merged-main base remains `96c0cb8a5b5562c65b79f5f601ba9d60f8fcf05a`; the locally available `origin/main` is `ad1bad244e1712f3af4cbd4c30e784184da33d14`. No branch/ref was changed. Migration 0134 and every production file remain byte-for-byte as committed in round 1. Lane checks use the merge base; dispatcher integration of newer main remains owed. The following implementation inventory and round-1 command history are retained as historical evidence, distinct from the round-2 run below.

## Round-1 preflight finding (credited)

The previous builder round found the genuine conflict between T2's forged direct-call refusal and the prohibition on carrying an SQL membership predicate. Credit that builder for identifying the concrete counterexample and refusing to weaken T2; that was the correct finding. The coordinator's 12 October ruling amends the order: the new routine carries its OWN active-owner predicate while continuing to use the merged dispatcher receipt and audit paths. This is a tightening inside the new routine; no existing predicate or grant is altered.

Mirrored `packages/db/migrations/0109_job_activation_terms.sql:58` exactly in shape: `role='owner'`, `revoked_at IS NULL`, `(expires_at IS NULL OR expires_at>clock_timestamp())`. The new query joins membership on tenant and receipt actor at `0134_recovery_case_terms.sql:56`, with the predicate at line 61, alongside the exact-authorization joins modelled on 0109:59–65. **0109:58 contains no contractor-membership revocation check at this base; none was invented or omitted.** The new direct-runtime tests insert a processing receipt, case Decision, approved resolution and exact unexpired authorization for a non-owner, revoked owner and expired owner, then invoke the routine in the same transaction and compare all approval/authorization/chase/audit counts after rollback. The active-owner construction is the positive control. T2 remains unchanged as an acceptance requirement.

## Why exact equality was never achievable (T8)

The merged audit path takes a fresh `clock_timestamp()` per event (`packages/db/src/audit.ts:59–60`), while the approval requires the transaction's start time, `transaction_timestamp()` (`0134_recovery_case_terms.sql:31`). These are different clocks by design. The order forbids changing or restating the audit path, so an exact-equality assertion can never pass as the required guarantee. **Nobody should re-add exact equality between approval and audit timestamps.**

The coordinator's 12 October 22:40 ruling replaces that assertion. T8 now proves what it was for: one transaction and ordered times. A test-local connection proxy follows the merged `lock-observer.ts` technique and forwards every real runtime statement unchanged. Immediately after BEGIN it reads `pg_current_xact_id()` and `transaction_timestamp()` on that same connection; immediately after COMMIT it reads `clock_timestamp()` in a second statement as the allowed upper bound, not an exact commit timestamp. The test requires exactly one observed, committed transaction; reads the approval and both audit rows' `xmin`; compares all three with the captured transaction ID; compares approval time exactly with the captured start; and asserts `start <= occurred_at <= post-commit bound` for each of the two named audit events. Timestamp reads use PostgreSQL text and comparisons run in SQL to preserve microsecond precision.

The existing chain-verification assertion is exactly unchanged. The independent private-database audit-failure rollback/retry test is exactly unchanged. No new test file, timeout, skip, merged audit-path edit/restatement, migration or production-code change was needed. This is source-inspected coverage, not a PostgreSQL test result.

## Round-1 changed files and design choices

- New core command/view schemas and canonical identifier hash; one core barrel export.
- Migration 0134, registry entry and appended migration note: one forced-RLS side table; two callable functions, two trigger functions, timestamp pin/immutable trigger and three pursuit triggers. No prior row is backfilled or revised; no case event/revision is added.
- New dispatcher-backed repository and one DB barrel export. IDs are lower-cased, receipt precedes case lock, expiry is the merged fixed 2099 constant, and one domain audit event accompanies `command.succeeded`. Replays also check the stored job against the request path.
- Additive application method, schema exports/error statuses, Nest route, generated OpenAPI and thin Next transport. The Next transport directly constructs the already-exported `RecoveryCaseApplication` with the existing synthetic pool/session: the workspace facade does not expose this new method, and its file is outside this lane. This is the same service and authenticated principal, with no context constructor or alternate authority path.
- Additive pursuit refusal mappings in message/follow-up repositories and API message errors. The reminder approval's raw insertion at `recovery-follow-up-repository.ts:292` needs its typed guard mapping; adding the domain error to its existing domain code array allows the existing follow-up HTTP mapper to return 409 without changing that mapper.
- New core/application/database/upgrade tests. Two expressly permitted tenancy catalogue rows; UIWIRE-12 and demo-bootstrap require no catalogue edit.
- Exactly one setup POST in each existing M4-5-S/M4-6-S shared journey helper, after case opening and before preview. No expectation, selector, expected value or timeout changed. The canonical identifier text is reproduced inline because Playwright cannot load this repo's ESM-only core package.
- The eligibility contract has only its one issued hold sentence replaced, explicitly recording pending acceptance/T8. No screen changed. The lane line was already present in the issued head from the prior round and was not edited again.

The guarded happy-path job uses the merged CH-1 fixture and `PracticeActivationRepository.start`/`switch_job_live_v3`. Proof rows contain generated original bytes and server hashes before invoice issue. Upgrade setup uses real quote send/acceptance, activation, final-account, invoice, case, pack and message repositories. Its delivered message remains delivered: a real due follow-up permits the NEW reminder preview on that same case, avoiding any relaxation of the merged existing-effect guard. The no-policy control deliberately clears the baseline/policy fields in privileged negative-fixture setup; the same-UUID tenant-B case is also an adversarial SQL fixture, not a product activation. None of these privileged fixture edits is used as production evidence or a bypass in application code. Raw pursuit guard tests remove only their test approval through privileged replica setup after otherwise-valid product records exist; every tested write still runs through the actual runtime role and all guards.

## T1–T13 implementation and evidence

BUILT means code/tests written, not PostgreSQL/browser execution or independent verification.

| ID | Status | Test title/evidence |
| --- | --- | --- |
| T1 | BUILT | `[T1] stores exact owner approval, one dispatcher authorization and two audit events; fresh connection reads it`; core closed hash/view and application principal tests. DB NOT RUN. |
| T2 | BUILT | `[T2] dispatcher refuses non-owner %s with zero writes`; revoked/expired owner tests; `[T2] direct runtime forged exact inputs refuse %s/%s and roll back everything`; `[T2] direct active-owner positive control accepts the same hand-made inputs; runtime cannot INSERT`; foreign-tenant actor test under T7. DB NOT RUN. See open role domain below. |
| T3 | BUILT | Wrong job/unknown case/policies/types, inexact direct authorization, tenant mismatch, migration-owner non-reference CHECK refusals; strict schema/400 unit tests. DB NOT RUN. |
| T4 | BUILT | `[T4] identical, semantic and uppercase replays return the same approval; changed body and owner conflict`; `[T4] two different active owners racing leave one approval and a typed conflict`; direct other-command refusal and wrong-job replay. DB NOT RUN. |
| T5 | BUILT | `[T5] preview refusal writes nothing; [T6] approval then preview/approve/deliver succeeds unchanged`; `[T5] raw runtime writes on all three chase tables hit their added terms triggers`; HTTP 409 unit test. DB NOT RUN. |
| T6 | BUILT | Positive preview/approve/deliver path above; `[T6] controls: non-withheld and no-policy cases require no terms` includes real pack/preview calls. DB NOT RUN. |
| T7 | BUILT | `[T7] tenant B cannot read or approve A, and A approval cannot satisfy B's same-UUID case guard`; `[T7] even the migration owner cannot mislink tenant/job/case identity`; missing-context SELECT. DB NOT RUN. |
| T8 | BUILT (amended ruling; execution owed) | `[T8] approval and both audit events share one writing transaction, ordered times and a verified chain`: real transaction ID/start read inside BEGIN–COMMIT; approval/both audit `xmin` match; approval equals start; each audit time is within start/post-commit bound. Private audit-failure rollback/retry and original chain assertions unchanged. **NOT RUN (sandbox cannot start PostgreSQL / a browser).** |
| T9 | BUILT | `[T9] actual catalog financial counts stay unchanged and terms authorization cannot execute another action`; `[T9] terms authorization cannot approve a recovery message`; proposed D01/mode unit controls; preservation evidence below. DB NOT RUN. |
| T10 | BUILT | `[T10] pinned time, immutable rows and narrow table grants`; `[T10] routine timestamps are pinned inside PostgreSQL, never a supplied date`. Raw owner past/future times, runtime/migration mutation refusals and infra/identity grants. DB NOT RUN. |
| T11 | BUILT | `[T11] fresh catalog has only the new forced-RLS table, controlled functions and additive ordinary triggers`; `[T11] populated before N, apply N alone, compare canonical named columns, then later migrations succeed twice`. All rule-9 controls use the same comparator. DB NOT RUN. |
| T12 | BUILT | `[T12] new contract and appended migration record state the lock and Q1 limit` (unit passed); new contract, one eligibility sentence and appended migration section source-inspected. |
| T13 | NOT RUN | Merged regression suites and browser engines are owed to the helper/CI. Only the expressly permitted catalogue/setup additions described above differ. |

The `[T5]` raw tests name the refusing triggers in source/receipt: `recovery_message_terms_guard`, `recovery_message_approval_terms_guard`, `recovery_message_sink_terms_guard`. Each uses otherwise-valid values; its merged guard executes first and the terms trigger refuses 23514. No retry-wrap, skipped test or timeout was added.

Rule 9 is implemented on a second database in the same cluster: pre-N product population with at least one row in each of `recovery_case`, `recovery_message`, `recovery_message_event`, `recovery_message_approval`, `recovery_message_sink`, `action_authorization`, `command_receipt`, `audit_event`; snapshot; N alone; compare; record N; migrate twice; compare named pre-existing columns/types by PK identity. Comparator reads PostgreSQL `row_to_json(...)::text`, not parsed Date/JSON values. Rolled-back microsecond and retype controls must fail; nullable column, replaced function and later insert controls must pass. There are no later migrations after N in this worktree; the test consumes any later registry entries when integration adds them. No count/“last migration” pin is used.

## Roles and scope

`app.membership.role` is **unconstrained `varchar(40) NOT NULL`**, `0000_tenancy.sql:47`. Its permitted domain is arbitrary strings within that length, not a finite enum; no finite list of all permitted role values can truthfully be supplied. The exact SQL/dispatcher owner equality is universal over that domain. Tests cover all known other product roles: admin, estimator, foreman, operative, finance, read_only (0111:23), plus supervisor, surveyor, commercial_manager, client_approver (0054:45); also member and an arbitrary schema-valid role. Both owner failure states and a foreign-tenant owner are covered. This is not a claim that every possible Unicode string was individually executed.

The product opening path checks only job existence at `recovery-case-repository.ts:136`, resolves sources at 139 and inserts at 141. It has no v3-binding requirement. Therefore a product call can open a withheld-payment case on a job not bound to v3 when its other membership/source requirements hold. This is source inspection, not a browser demonstration. Q1's unguarded remainder is named and remains the separate follow-up RED order.

Chasing a withheld payment on a job that is not bound to the v3 fee policy is NOT guarded by this order.

A builder's agreement to the proposed fee terms for a case is not approval of the fee policy and authorises no charge.

UI list entry: **agree-terms button missing: chasing a withheld payment is refused in the practice app until it exists**. CH-7 is not fully accepted; DW3, the screen/wording and the later live M4-5 call to the same helper remain owed.

Pre-edit browser grep (`rg -l 'Preview factual message|/messages|Preview supplier message' apps/web/e2e/*.spec.ts`) returned:

```text
apps/web/e2e/M4-6-S.spec.ts
apps/web/e2e/M4-5-S.spec.ts
```

The broader withheld/preview grep also found quote/order previews and case/eligibility-only specs; they do not create chase messages and require no terms setup change.

## Check lane — four questions

1. **Can this diff make a real charge possible or sooner? No.** No fee/ledger/outbox creation path, policy gate, provider or mode was enabled. Proposed identifiers remain proposed; app mode refusal is the same as eligibility's.
2. **Can anyone but an active owner create, change or remove an approval?** Runtime creation through the callable routine requires active owner membership even for direct SQL. Runtime cannot INSERT/UPDATE/DELETE the table. The trusted migration owner retains raw administrative INSERT (required for the order's raw-owner CHECK/time tests); it cannot UPDATE/DELETE with ordinary triggers enabled. Privileged DDL/replica/superuser control is outside the ordinary runtime guarantee. DB execution is still owed.
3. **Can a chase row for a guarded case commit without an approval?** The new ordinary insert trigger checks each of the three tables; the runtime cannot disable it. Raw negative tests are written, not executed. Q1 deliberately leaves non-v3 jobs unguarded.
4. **Is anything previously refused now allowed?** No old pursuit or financial guard is relaxed/replaced. The new authorized synthetic terms record is added; it supplies no charge or message-send authority. Existing unrelated case/policy controls stay as merged.

Two fresh independent RED verdicts bound to the final commit, helper execution and separate acceptance remain outstanding. This builder does not accept its own work.

## Financial table inventory and preservation

T9(b)'s test discovers actual `app` table catalogs and compares every matching tenant row count. **No catalog or count was executed here.** Source-derived inventory at the fixed base (note `fee` also matches `feed`): `action_outbox`, `fee_illustration_source`, `journal`, `journal_line`, `landing_allocation`, `landing_reversal`, `ledger_account`, `ledger_book`, `practice_feed_account`, `practice_feed_command`, `practice_feed_event`, `practice_feed_job_owner`, `practice_feed_receipt_match`, `recovery_fee_derivation`, `recovery_fee_journal`, `recovery_message_sink`, `simulated_settlement_event`, `synthetic_obligation`. This list is inspection evidence, not an inferred database result. The catalog-driven test will catch any additional matching tables after integration.

SHA-256 at fixed base, moving origin/main and working tree (identical):

| File | SHA-256 |
| --- | --- |
| `packages/config/src/policy-gates.ts` | `fc84712246163ae958dccf03503ff6267df9213554c47d8be214e012c65c1875` |
| `docs/decisions/d01-commercial-fees-cap.md` | `47f7c68e5be4de0a31f037c0f2a47570e5bbc8fe376bcdc9ab68829ec36381a5` |

`git diff --stat HEAD -- docs/decisions packages/config BUILD_PLAN.md AGENTS.md` and the same command against `96c0cb8` both exited 0 with **no output**. The prescribed moving-`origin/main` comparison did NOT print nothing after that ref advanced: it printed `BUILD_PLAN.md | 3 ---` / `1 file changed, 3 deletions(-)`, because this worktree does not contain newer main's unrelated plan lines. No plan was edited in this round. The full origin/main diff likewise displays newer PRACTICE-FACTS files as absent; those are not local deletions. Compare this round to HEAD, or this lane to its fixed merge base, until the dispatcher integrates newer main. No permanent test pins any of these unowned file hashes.

“Seen, not changed”: `proposedDecisionRecords.D01` still names v1 while D01's record names proposed v3; the known old value remains untouched. Every original migration, eligibility guard, fingerprinted table, security test/pinned value and UI page remains untouched.

## Privilege derivation (source-inspected; catalog execution owed)

All migrations at the fixed base were searched for default/global business grants and role memberships; none grants default privileges on this new table/functions to infrastructure or identity. 0134 explicitly revokes PUBLIC/runtime table authority and grants runtime SELECT only. It explicitly revokes PUBLIC EXECUTE on both callable functions, and grants runtime EXECUTE; the two trigger-only functions revoke PUBLIC/runtime EXECUTE. FORCE RLS names runtime and migration owner in the new table policy. Existing role DDL makes runtime/infrastructure non-owner, non-superuser, non-BYPASSRLS; no privileged-role membership is added.

| Role | Approval table | Two callable functions | Guard/refusal |
| --- | --- | --- | --- |
| `jobguard_runtime` | SELECT; no INSERT/UPDATE/DELETE/TRUNCATE | EXECUTE | Tenant RLS; active-owner exact authorization/case/policy gate. Table writes refuse 42501. Trigger-only functions have no direct EXECUTE. |
| `jobguard_migration` | Owner INSERT/SELECT; ordinary UPDATE/DELETE refuse | Owner EXECUTE | FORCE tenant RLS; pin overwrites supplied time; immutable trigger refuses 55000. Raw owner INSERT must satisfy CHECKs and FKs. |
| `jobguard_infrastructure` | No read/write grants | No EXECUTE | Privilege refusal; no business role inheritance introduced. |
| `jobguard_identity` | No read/write grants | No EXECUTE | Privilege refusal; no business role inheritance introduced. |
| PUBLIC | None | None | Explicit revocation. |

This is least-privilege source derivation, not observed catalog proof. Trusted schema-owner/superuser control can alter triggers/privileges and is not described as protected by RLS or these ordinary triggers.

## Round-1 commands actually run and results (historical)

All pnpm calls used `PATH=/private/tmp/ent3a-bin:$PATH`, the existing wrapper inspected before use. It directly executes the cached pinned pnpm 10.28.1; `pnpm --version` returned **10.28.1** (exit 0), Node **v24.17.0**. No signature fetch/install was attempted this round. Vitest used `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, `--maxWorkers=2`, one file/run and one run at a time.

- Prerequisite `pnpm turbo run build --concurrency=2 --filter=@jobguard/core...` was launched twice: the first yielded without a retained completion result; the observed repeat exited 2 because this core tsconfig has no Node crypto types for the new test import. The test was changed to use global Web Crypto UUIDs (no platform dependency). The initial DB prerequisite build also exited 2 on that same core test import.
- Repaired prerequisite `pnpm turbo run build --concurrency=2 --filter=@jobguard/db...`: **exit 0**, 3 successful tasks (core, storage, DB; one cached). Cache I/O permission warnings did not fail it.
- `pnpm --filter @jobguard/config build`: **exit 0**, required for the API test's config import.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-case-terms.test.ts`: initial and final **exit 0**, **16 tests passed**, 1 file. The final run follows the core test-import correction.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-case-terms.application.test.ts`: first **exit 1**, 0 tests, unbuilt config entry; after its prerequisite build **exit 0**, **18 tests passed**, 1 file. The unchanged `recovery-message.errors.test.ts` was not run under the “only added/changed test files” limit; the new test covers the new refusal.
- `pnpm typecheck`: first **exit 2**, 6/7 tasks, because the new Next route called a facade without `terms`; fixed solely in the owned thin route by using the same exported service. Final **exit 0**, 7/7 tasks (2 cached).
- `LANE_BASE_REF=origin/main pnpm lint`: first **exit 2**, same facade type failure; final **exit 0**, 7/7 tasks (2 cached), including purity, lane, money and commercial boundary checks. Cache I/O warnings remain environmental.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: **exit 0**. Its merge-base lane includes only allowed files even after origin/main advanced. No other lane line changed.
- `pnpm build`: **exit 0**, 7/7 tasks (2 cached). Next compiled and generated 29 static pages. Existing CSS/autoprefixer warnings and workspace-root inference warnings were not edited away. This is a build, not a browser test or deployment.
- `pnpm --filter @jobguard/api openapi:generate`: **exit 1**, tsx CLI IPC socket `listen EPERM`. `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts`: first **exit 1**, unbuilt AI dependency; after the build **exit 0**, generated exactly the new route's 15 lines.
- `pnpm openapi:check`: **exit 1**, same tsx IPC socket refusal. Socket-free equivalent `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`: **exit 0**. The ordinary script is still owed in an environment that permits its IPC socket.
- `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/recovery-case-terms.integration.test.ts test/recovery-case-terms-upgrade.integration.test.ts`: **exit 0** on both files; repeated after added coverage with exit 0. This checks test source types, not PostgreSQL behavior.
- Read-only Git status/diff/rev-parse, source grep, JSON/schema inspection and `shasum` were run. `git diff --check`: **exit 0**. Final scope/added-line credential scan: **exit 0**, 26 owned changed/new files; final lane check **exit 0**. Fixed-base protected-file diff: **exit 0**, empty. No git write occurred.

No full `pnpm test`, database command or Playwright invocation was attempted; no suite was made optional, wrapped, skipped or given a new/longer timeout. No eval is applicable: no model/prompt/extraction/gateway changed. A clean new install was not performed because packages were preinstalled and downloads are prohibited.

## NOT RUN — helper / CI obligations

**Every database integration test and browser test: NOT RUN (sandbox cannot start PostgreSQL / a browser).** In particular:

- `recovery-case-terms.integration.test.ts` (including amended T8) and `recovery-case-terms-upgrade.integration.test.ts`; mandatory PostgreSQL execution remains owed before any all-green claim.
- `recovery-messages`, `recovery-follow-up`, `recovery-follow-up-upgrade`, `recovery-cases`, `recovery-cases.workbench`, `recovery-eligibility-v3`, `recovery-timing-pin`, `job-activation-terms`, `evidence-packs`, `fingerprinted-row-shape`, `extra-origin-upgrade`, `audit-export`, `tenancy`, `UIWIRE-12`, `demo-bootstrap` (`packages/db/test/*.integration.test.ts`), at most three per run, --maxWorkers=2.
- `pnpm test:migrations` under the helper's allowed environment; not invoked here.
- Playwright M4-5-S, M4-6-S, CH-7, CH-1 in Chromium and WebKit.
- CI's mandatory existing security/context-boundary and mutation-registry tests; their source/list/hash/count remains untouched. They were not individually run here because only changed tests may be run.

## HELD and owed

- All real charging: fee derivation/posting/journals/statements/collection/refunds/standing authority; every provider/adapter; production/pilot modes, config and G4-S.
- Formal D01/D03 approval (still proposed).
- Every screen, agree control, refused-state wording and terms wording/rates.
- DW3: earlier receipts cannot be made qualifying by later agreement.
- Revocation, withdrawal and re-agreement/new terms version.
- Live M4-5's later call to the shared helper.
- Insurer wording and PRACTICE-FACTS-1b/other lanes.
- Real helper/CI execution, two independent RED reviews bound to the exact eventual commit and separate acceptance/merge/release. The T8 ruling is supplied and implemented; database verification is still owed.

## Round-1 self-review (historical)

Read the whole local diff against HEAD and the moving-origin diff, and re-read the new SQL, schemas, repository and tests. The migration has exactly one CREATE TABLE and the prescribed callable/trigger functions; no CREATE OR REPLACE, existing-table ALTER, existing grant/policy edit, DML backfill, ENABLE ALWAYS or financial action. The new table alone has owner/RLS ALTER statements. Its SELECT grant and two callable EXECUTE grants are the only added grants. Timestamp pin is the first ordinary approval insert trigger; immutable mutation delegates to the merged rejecting function. Membership owner predicate is the coordinator-authorized tightening; receipt/audit remain dispatcher-owned. All stored terms/time fields are server-derived; IDs are the only routine parameters. Every normal business lock precedes the dispatcher audit append.

Merged source files gained lines only, except the expressly replaced eligibility sentence; OpenAPI has only an additive route; E2E files each gain one setup call; tenancy gains only two allowed catalogue rows. No unowned permanent file pin, credential-shaped long literal, security list/hash/count edit, held feature, context mint or package/lock/CI change was introduced. The 0134 registry assertion is by name/ascending order, never last/count. Privilege limits and synthetic fixtures are labelled accurately. Generated dist, Next, Turbo and tsbuildinfo outputs were removed after the final checks; no build output, test-results or .pnpm-store remains in the worktree. Dependencies were retained.

Round 1 correctly held the incompatible T8 assertion for a coordinator ruling. That ruling has now been supplied and implemented. No PostgreSQL/browser assertion was observed in either round.

## Round-2 commands actually run and results

Node `v24.17.0`, cached pinned pnpm `10.28.1` (version commands exit 0). Every pnpm command used the inspected existing `PATH=/private/tmp/ent3a-bin:$PATH` wrapper. Dependencies were preinstalled; no clean install or package download was attempted. Vitest ran one file per invocation, one invocation at a time, with `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` and `--maxWorkers=2`. No full `pnpm test` was invoked under the lane's test-file limits.

| Command | Observed result | Log |
| --- | --- | --- |
| `pnpm build` | **exit 0**; 7/7 tasks successful, 2 cached; Next generated 29 static pages | `/private/tmp/ch7-terms-r2-build.log` |
| `pnpm typecheck` | **exit 0**; 7/7 tasks successful, 2 cached | `/private/tmp/ch7-terms-r2-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | **exit 0**; boundary checks and 7/7 package tasks pass, 2 cached | `/private/tmp/ch7-terms-r2-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **exit 0**; only permitted ch-7-terms paths | `/private/tmp/ch7-terms-r2-lanes.log` |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-case-terms.test.ts` | **exit 0**; 16 tests pass, 1 file | `/private/tmp/ch7-terms-r2-core-unit.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-case-terms.application.test.ts` | **exit 0**; 18 tests pass, 1 file; mocked application boundaries, not a DB guarantee | `/private/tmp/ch7-terms-r2-api-unit.log` |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/recovery-case-terms.integration.test.ts test/recovery-case-terms-upgrade.integration.test.ts` | **exit 0**; both integration files typecheck; no PostgreSQL execution | `/private/tmp/ch7-terms-r2-test-types.log` |
| `pnpm openapi:check` | **exit 1**; tsx IPC socket `listen EPERM` in this sandbox | `/private/tmp/ch7-terms-r2-openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | **exit 0**; same source OpenAPI check, without the CLI IPC socket | `/private/tmp/ch7-terms-r2-openapi-socket-free.log` |
| `git diff --check` and deterministic source-preservation self-review | **exit 0**; scope and unchanged assertions verified | Source inspection, not an independent model verdict |

Build output retained the existing workspace-root/autoprefixer warnings; shared Turbo cache writes reported sandbox I/O warnings but all tasks completed successfully. No configuration/check was weakened. The ordinary OpenAPI script is still owed in CI where its IPC socket is allowed.

**PostgreSQL and browser suites: NOT RUN (sandbox cannot start PostgreSQL / a browser).** The amended T8, private rollback/retry, full migration/DB regressions and browser journeys remain for dispatcher/CI after push. No eval applies: no prompt/model/schema/parser/gateway changed in this continuation.

## Round-2 self-review

**PASS — builder source self-review only.** Reviewed the full round-2 diff against `ba6e30f`. A deterministic comparison removes the T8 block and verifies the rest of the integration file is byte-for-byte unchanged. The original `verifyAuditChain(rows)` assertion is verbatim. The entire private-database audit-failure rollback/retry test file, `packages/db/src/audit.ts`, migration 0134, `apps/api/src/auth/context-boundary.test.ts` and the lane registry are byte-for-byte unchanged against HEAD. Only the existing integration test and this receipt differ; no new test file or production file was introduced, and no security list changed.

T8's observer forwards real statements and never mocks a database result. Its captured transaction count/commit bound are asserted; approval and each named audit event are matched to the same captured ID via their actual writing `xmin`; all time comparisons happen in SQL. Exactly two approval events are required. The old equality assertion was explicitly replaced under the issued ruling, never skipped. No extra timeout or retry was added.

Generated workspace build/cache outputs were removed after the checks; installed dependencies were retained. No migration, operational alert, compatibility change, external action or policy approval belongs to this continuation. AGENTS §§5.3, 5.4 and 5.7 are exercised by the amended test; its runtime evidence and the earlier release gates remain owed. The requested intended commit subject/body is written to `/private/tmp/jg-msg-ch-7-terms.txt`; the dispatcher owns the commit. No Git write was performed.

Builder receipt only — not independently verified, not accepted. Mandatory CI, two independent RED verdicts bound to the final commit, separate acceptance, and dispatcher integration remain outstanding.

## Mac verification (12 Oct)

Run by the Mac helper (Claude Sonnet 5.5), 12 October 2026, evening. The helper reviewed nothing, gave no verdict and changed no product code. **Result: RED. Nothing was pushed.** Logs: `~/.local/share/full-steam/jg-runs/ch-7-terms-mac/`.

**Head tested:** `b1b352d7651498a51da1e3c3d31b7ecf5ca02750` ("Merge main (ad1bad2) into CH-7-TERMS") plus the regenerated `apps/api/openapi.json` (15 added lines, the new `/jobs/{id}/recovery-cases/terms` route), which the merge commit does not yet hold. The commit that records this section adds exactly that file and this text. Parents of the merge: `e5c438d` (Codex round 2) and `ad1bad2` (main, PR #139). Conflicts: three append-only files (`packages/core/src/index.ts` export list, `packages/db/src/migrate.ts` migration list, `packages/db/MIGRATIONS.md`); both sides kept, main first; `migrate.ts` now lists ... 0129, 0130, 0131, 0134 (last). `apps/api/openapi.json` was taken from main and regenerated (`pnpm openapi:generate`, then `pnpm openapi:check`), never hand-merged. `git diff origin/main --stat` showed only this piece's 26 files.

**First failing assertion (the only red).** Both new database files fail in their own `beforeAll`, so all 49 tests (46 + 3) are skipped and none ran. Error `STALE_OR_BLOCKED_FINAL_ACCOUNT` (raised by `app.issue_practice_customer_invoice`, `0095_job_parties.sql:360`) at `PracticeInvoiceRepository.issue`, called from `packages/db/test/recovery-case-terms.integration.test.ts:69` (and the same chain in `recovery-case-terms-upgrade.integration.test.ts:42` via `seed`, called at `:61`). **Owner: the builder's test fixture (this piece's new test files), not the migration, not the product code, not merged main.** Reading (not executed to confirm): the fixture's `proofFixture` inserts only an `evidence_object` of type `site_photo`; `FinalAccountCommandService.assemble` takes proof only from a `stage_completion` joined to an `evidence_link` and requires an `electrical_certificate` per confirmed scope (`packages/db/src/final-account-repository.ts` line 6; `packages/core/src/final-account.ts:28`, `issueBlocked: missing.length>0`), so the assembled revision is `issue_blocked` and the invoice issue is refused. Every database test of this piece is therefore still unproven by execution, including T2 (direct-runtime counterexamples), the amended T8, and the rule-9 upgrade proof.

| Check | Command (short) | Exit | Result |
| --- | --- | --- | --- |
| Builds, each alone | `pnpm --filter @jobguard/{core,db,storage,config,ai,api} build` | 0 each | built |
| OpenAPI | `pnpm openapi:generate` in apps/api, then `pnpm openapi:check` | 0, 0 | +15 lines; check passes |
| New DB tests (attempt 1) | vitest, 2 new files, `--maxWorkers=1` | 1 | embedded PostgreSQL would not start: "Postgres init script exited with code null" (missing dylib symlinks); fixed by running `scripts/hydrate-symlinks.js` inside the `@embedded-postgres/darwin-arm64` package folder |
| New DB tests (attempt 2) | same | 1 | 2 files failed, 49 tests skipped, `STALE_OR_BLOCKED_FINAL_ACCOUNT` as above |
| Core unit | `src/recovery-case-terms.test.ts` | 0 | 16 passed |
| API units | `recovery-case-terms.application`, `recovery-message.errors`, `watchdog-registry` | 0 | 173 passed, 3 files (watchdog registry GREEN) |
| Boundary scanner | `src/auth/context-boundary.test.ts` (untouched) | 0 | 145 passed |
| Merged DB group 1 | recovery-cases, recovery-cases.workbench, recovery-eligibility-v3 | 0 | 84 passed |
| Merged DB group 2 | recovery-timing-pin, recovery.integration, recovery-follow-up | 0 | 103 passed |
| Merged DB group 3 | recovery-follow-up-upgrade, recovery-messages, job-activation-terms | 0 | 112 passed |
| Merged DB group 4 | evidence-packs, fingerprinted-row-shape, extra-origin-upgrade | 0 | 27 passed |
| Merged DB group 5 | audit-export, UIWIRE-12, command-replay-contract | 0 | 86 passed (command-replay-contract GREEN) |
| `pnpm test:migrations` | tenancy + demo-bootstrap | 0 | 13 passed |
| `pnpm typecheck` | | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | | 0 | purity 133 files, lane boundary, money boundary, 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | | 0 | 27 files, all allowed |
| `pnpm --filter @jobguard/web build` | production build for the browser run | 0 | built |
| Browser, M4-5-S + M4-6-S | Playwright, channel chromium, `CI=1`, `--workers=1`, projects mobile-360 and desktop | 0 | 18 passed (these two specs now make the one set-up call through the new route) |
| Browser, CH-7 + CH-1 | same | 0 | 26 passed |

Vitest ran with `--maxWorkers=1` for database files and `--maxWorkers=2` otherwise, at most three files per run, one heavy step at a time through `heavy-slot`. The Playwright config has two projects only (`mobile-360`, `desktop`, both Chrome-based); there is no WebKit project, so no WebKit run exists to report. Wrapper config: `~/.local/share/full-steam/jg-runs/ch-7-terms-mac/pw-ch-7-terms-mac.config.ts`. The known Mac-only `[mobile-360] ENT-2.spec.ts:19` failure was not in scope and did not appear.

**NOT run / not proven:** T1 to T11 database tests of this piece (46 + 3 tests, blocked by the fixture above); therefore also T2's direct-runtime refusal of a non-owner, a revoked owner and an expired owner, the active-owner positive control, the amended T8 (one transaction identity, ordered times), and the rule-9 upgrade proof for 0134. No fresh Opus or Sol review exists. Not pushed; no pull request opened.

**GRANT statements in `0134_recovery_case_terms.sql`** (helper's reading, reported only; the reviewers own the verdict): three, no other. (1) line 29: `GRANT SELECT ON app.recovery_case_terms_approval TO jobguard_runtime` after `REVOKE ALL ... FROM PUBLIC,jobguard_runtime` (line 28): read-only, no new direct write grant on a money or authorization table. (2) line 71: `GRANT EXECUTE ON FUNCTION app.approve_recovery_case_terms(...) TO jobguard_runtime`: a SECURITY DEFINER routine owned by `jobguard_migration` that carries its own tenant check, active-owner predicate (0109:58 shape) and exact-authorization join; this is the "checked routine" shape the new build standard asks for. It still trusts hand-made receipt, decision and authorization rows that `jobguard_runtime` can already forge (audit findings F1 and F2, `audit-definer-trusts-authorization-20261012.md`); that is the existing least-privilege problem, not a new grant, but the receipt should name it. (3) line 81: `GRANT EXECUTE ON FUNCTION app.recovery_case_terms_approved(uuid,uuid,uuid) TO jobguard_runtime`: SECURITY INVOKER, STABLE, read-only. The pin function and the guard function revoke from PUBLIC and runtime. Conclusion: no new INSERT, UPDATE or DELETE grant for `jobguard_runtime` on any money, membership, authorization, receipt or audit table.

**Seen, not changed:** (a) the 0134 section of `packages/db/MIGRATIONS.md` still says "T8's audit clock semantics need a coordinator ruling before acceptance", which round 2 settled; stale wording, left for the next builder round. (b) The helper added no commit other than the merge and this record.

Mac helper record only. Not independently verified, not accepted.


## Repair round 3 (fixtures, 12 Oct)

Issued by the dispatcher about 23:10 on 12 October 2026, starting at clean HEAD `741fa76fe6a08cd34d7c85abc6bb26fd5136139d` on `codex/sandbox/ch-7-terms`, after the plain merge of main `ad1bad2`, regenerated OpenAPI and the Mac receipt above. This round changes only the two new database fixture helpers, the one issued sentence in `packages/db/MIGRATIONS.md:891`, and this receipt. Product code, SQL, assertions, merged tests, security lists, lane registry and UI remain unchanged. Earlier orders, including the active-owner predicate and amended T8, remain in force.

**Cause (source-confirmed; repair execution owed):** the original `proofFixture` registered only an unlinked `site_photo`. `FinalAccountCommandService.assemble` reads proof through `stage_completion -> evidence_link -> evidence_object`, requires a verified original and excludes invalidated evidence (`packages/db/src/final-account-repository.ts:6`); the required type is `electrical_certificate`. Missing mandatory proof sets `issueBlocked` (`packages/core/src/final-account.ts:28`), and `app.issue_practice_customer_invoice` refuses the blocked revision (`packages/db/migrations/0095_job_parties.sql:360`). Thus the Mac's two `beforeAll` failures occurred before any of the 49 database tests executed. The repair must be rerun on real PostgreSQL before claiming those assertions pass.

**Merged fixture paths reused as the setup model (source-inspected):** `apps/web/e2e/helpers/recovery-sources.ts:11` finalizes verified proof and completes the scope; its invoice journey at `:52` completes proof, assembles an unblocked account, then issues through the practice-invoice endpoint at `:55` (used by M4-5-S/M4-6-S recovery journeys). `apps/web/e2e/helpers/customer-invoice-journey.ts:61` selects/finalizes/completes generated proof before rebuilding and issuing the account (also used by CH-1); CH-7 starts from the merged capture journey. The merged database proof setup at `packages/db/test/proof-application-records.integration.test.ts:27` uses `electrical_certificate`, then `:28` completes `electrical-stage`; the underlying merged command creates the evidence link and stage completion at `packages/db/src/proof-repository.ts:23`. Inspection also covered `job-activation-terms.integration.test.ts`, `recovery-follow-up.integration.test.ts:58` and `final-account.integration.test.ts`; the latter invoice fixtures seed an already-issuable account and do not provide a compatible proof-only helper for these existing jobs. No reusable shared database test-support helper accepts these already-created jobs; the browser helpers require Playwright and the watchdog harness owns a different tenant/job lifecycle. Neither shared helpers nor merged fixtures were edited or copied. These two narrow, privileged synthetic setup helpers seed the same verified certificate/link/completed-stage row shape with foreign keys and ordinary triggers enabled; account assembly and invoice issue still use their real runtime repositories, with no fabricated unblocked final-account revision.

| New test file | Before (HEAD 741fa76) | After (working tree) |
| --- | --- | --- |
| `packages/db/test/recovery-case-terms.integration.test.ts` | `:42–50` helper; `:43` chose one arbitrary scope, `:47–49` used fixed object key `terms/proof`, and `:49` stored only `site_photo` | `:42–56` helper; `:44–46` iterates all confirmed scopes and makes a job/scope-specific object key; `:49–51` binds that key to upload/original/object and stores `electrical_certificate`; `:52–53` adds its evidence link and completed `electrical-stage` |
| `packages/db/test/recovery-case-terms-upgrade.integration.test.ts` | `:47–55` helper; `:48` chose one arbitrary scope, `:52–54` used fixed object key `terms/proof`, and `:54` stored only `site_photo` | `:47–61` helper; `:49–51` iterates all confirmed scopes and makes a job/scope-specific object key; `:54–56` binds that key to upload/original/object and stores `electrical_certificate`; `:57–58` adds its evidence link and completed `electrical-stage` |

The distinct object key also avoids the existing tenant/object-key uniqueness constraint (`0002_evidence.sql:22`) when the integration setup reaches its second, no-policy control job; without this repair its second proof upload would collide. All existing T1–T13 assertions remain verbatim, including T2's non-owner/revoked-owner/expired-owner refusals with nothing committed and active-owner positive control, and T8's one transaction identity, ordered times, chain and private rollback/retry assertions. No skips, new timeout, weaker assertions or production capability were added.

The stale 0134 documentation sentence now records the coordinator's 12 October ruling: ONE transaction identity with ordered times, never approval/audit clock equality. The separate historical receipt and contract statements are preserved; this round's authority changes exactly the issued migration-note sentence.

**0134 GRANT list (source-inspected again; unchanged):**

1. `packages/db/migrations/0134_recovery_case_terms.sql:29`: `GRANT SELECT ON app.recovery_case_terms_approval TO jobguard_runtime`, after line 28 revokes ALL from PUBLIC and runtime; approval-table read only.
2. `:71`: `GRANT EXECUTE ON FUNCTION app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO jobguard_runtime`; SECURITY DEFINER, owned by `jobguard_migration`, with its own tenant check, active-owner predicate at `:61` and exact-authorization joins at `:55–63`.
3. `:81`: `GRANT EXECUTE ON FUNCTION app.recovery_case_terms_approved(uuid,uuid,uuid) TO jobguard_runtime`; SECURITY INVOKER, STABLE and read-only, declared at `:73`.

**NEW BUILD STANDARD — existing authorization-row trust weakness (F1/F2):** No new direct INSERT, UPDATE or DELETE grant for the application login was added; the approval routine still trusts hand-made receipt, decision and authorization rows that the runtime login can already forge (audit findings F1 and F2, `audit-definer-trusts-authorization-20261012.md`), an existing weakness rather than a new grant, tracked by the least-privilege proposal.

**Migration bytes:** SHA-256 of `packages/db/migrations/0134_recovery_case_terms.sql` before repair: `0f981e24c45f1e7decd69d7c872d49056b6c27d11512eebac774925cb5b88d5a`; after repair: `0f981e24c45f1e7decd69d7c872d49056b6c27d11512eebac774925cb5b88d5a`. A direct HEAD-versus-working-tree byte comparison also passes. This is builder source evidence, not an independent verdict or a database catalog check.


### Round-3 run receipt

Node `v24.17.0`, pinned cached pnpm `10.28.1`; all pnpm commands use the existing inspected `PATH=/private/tmp/ent3a-bin:$PATH` wrapper. Dependencies were already installed; no package install/download or clean-install claim. Only this task branch's two unit files were run, each separately with `--maxWorkers=2`; neither unit file was edited in this fixture repair. No full `pnpm test`, merged unit suite, database startup or browser launch was attempted.

| Command actually run | Observed result | Log |
| --- | --- | --- |
| `pnpm typecheck` | exit 0; 7/7 tasks pass, 4 cached | `/private/tmp/ch7-terms-r3-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | exit 0; boundary checks and 7/7 tasks pass, 4 cached | `/private/tmp/ch7-terms-r3-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | exit 0; ch-7-terms lane only | `/private/tmp/ch7-terms-r3-lanes.log` |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/recovery-case-terms.integration.test.ts test/recovery-case-terms-upgrade.integration.test.ts` | exit 0; both changed test files compile, no database execution | `/private/tmp/ch7-terms-r3-test-types.log` |
| `pnpm build` | exit 0; 7/7 tasks pass, 2 cached; 29 Next static pages | `/private/tmp/ch7-terms-r3-build.log` |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-case-terms.test.ts` | exit 0; 16 tests pass, one task-owned file | `/private/tmp/ch7-terms-r3-core-unit.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-case-terms.application.test.ts` | exit 0; 18 tests pass, one task-owned file; mocked application boundaries, not PostgreSQL proof | `/private/tmp/ch7-terms-r3-api-unit.log` |
| `pnpm openapi:check` | exit 1; `tsx` CLI IPC socket fails with `listen EPERM` in sandbox | `/private/tmp/ch7-terms-r3-openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | exit 0; same generator/source check without the CLI IPC listener; no generated OpenAPI edit | `/private/tmp/ch7-terms-r3-openapi-socket-free.log` |
| `git diff --check`; deterministic HEAD/source-preservation comparison | exit 0; fixture-only test edits and unchanged protected sources | `/private/tmp/ch7-terms-r3-self-review.log` |

Build/lint/typecheck logs retain sandbox Turbo cache-write I/O warnings; the existing build warnings remain. The standard OpenAPI script needs its normal CI run where sockets are permitted. No script/configuration was weakened. Vitest invocations ran serially; typecheck and lint overlapped briefly, both passed, and subsequent compilation/build/test steps ran individually.

**PostgreSQL and browser suites: NOT RUN (sandbox cannot start PostgreSQL / a browser).** The Mac helper/CI must rerun both new database files, including T2, amended T8 and the rule-9 populated upgrade proof; all 49 database tests remain unproven in this round. The earlier Mac GREEN merged/database/browser results remain reported helper evidence, not a new run or verdict. No eval applies to this test-fixture/documentation repair.

### Round-3 self-review

**PASS — builder source self-review only.** A deterministic comparison against `741fa76` replaces only each `proofFixture` block before comparing the entire remaining test file byte-for-byte: every test declaration and assertion is unchanged, including T1–T13, both T8 tests and T2's raw-runtime owner controls. Both repaired helpers are identical, bind verified originals to evidence links and stage completions on the same tenant/job/scope, retain exact hashes/version IDs/bytes, and use distinct per-job/per-scope object keys. Inspection checked applicable original constraints and later live-job/idempotency triggers; no trigger or constraint was disabled by this repair. Both setup callers activate their jobs before proof setup and still assemble and issue through the real runtime repositories. This is source inspection and test compilation, not successful invoice execution.

Migration 0134, the audit implementation, auth/context-boundary test, tenancy/UIWIRE-12/demo-bootstrap security assertions and the lane registry compare byte-for-byte equal to HEAD. Exactly four authorized tracked files differ. Generated workspace build/cache outputs were removed after checks; dependencies were retained. No migration, compatibility change, operational alert, external action, policy approval or release belongs to this repair. AGENTS §§5.3, 5.4, 5.7 and 5.8 remain exercised by the unchanged tests; runtime proof is owed.

The intended conventional-commit subject/body is written to `/private/tmp/jg-msg-ch-7-terms.txt`. No Git write, commit or push was performed. The dispatcher owns the commit; independent recorded verdicts bound to that exact commit and separate technical acceptance remain owed. This receipt is neither independent verification nor acceptance.


## Mac verification (12 Oct, round 3)

Run by the Mac helper (Claude Sonnet 5.5), 12 October 2026, about 23:10 to 23:30. The helper reviewed nothing, gave no verdict and changed no product or test code. **Result: RED. Nothing was pushed.** Logs: `~/.local/share/full-steam/jg-runs/ch-7-terms-mac2/`.

**Head tested:** merge commit `3491777` ("Merge main (96f051f) into CH-7-TERMS"; parents `cdd8dab` Codex round 3 and `96f051f` main, PR #160). No conflicts. `migrate.ts` ends ... 0129, 0130, 0131, 0134 (last). `apps/api/openapi.json` was not touched by the merge (`pnpm openapi:check` exit 0). `git diff origin/main --stat` shows only this piece's 27 files (lane boundary lint lists the same 27).

**The round-3 fixture repair worked.** Both new database files now get past the old `STALE_OR_BLOCKED_FINAL_ACCOUNT` failure: the main file's `beforeAll` completes and the upgrade file's `seed` issues its invoice (`recovery-case-terms-upgrade.integration.test.ts:41-42`). **A second, separate fixture defect is now the first red.**

**First failing assertion.** `ZodError` from `RecoveryCaseRepository.command` (`packages/db/src/recovery-case-repository.ts:95`, `recoveryCaseCommandV1.parse(raw)`): `expectedRevision` is `undefined`, expected the literal `0` (`packages/core/src/recovery-case.ts:203`, the `open` action). Raised by the `newCase` helper at `packages/db/test/recovery-case-terms.integration.test.ts:21` (first reached by `[T1]` at line 83) and by `seed` at `packages/db/test/recovery-case-terms-upgrade.integration.test.ts:43` (called from the file's `beforeAll`, line 67). Both new files build the `open` command without `expectedRevision:0`. **Owner: the builder's test fixtures (this piece's two new test files), not the migration, not product code, not merged main.** The `expectedRevision:z.literal(0)` rule has been in `recovery-case.ts` since `64398d8` (#84), and every merged test that opens a case passes `expectedRevision:0` (for example `practice-facts.integration.test.ts:395`, `recovery-eligibility-v3.integration.test.ts:95`, `recovery-cases.integration.test.ts:11`). Not fixed by the helper.

**Result of the two new database files** (`vitest --maxWorkers=1`, exit 1): `recovery-case-terms.integration.test.ts` 46 tests: 6 passed, 40 failed, all 40 with the same `ZodError` in `newCase`. `recovery-case-terms-upgrade.integration.test.ts`: suite failed in `beforeAll` (same error via `seed`), 3 tests skipped. Total 49 = 6 passed + 40 failed + 3 skipped. The 6 passes are the tests that do not open a case through the repository (three T3 refusals for non-withheld case types, T3 direct tenant mismatch 42501, T3 v1-bound job refusal, T6 controls for non-withheld and no-policy cases).

**What therefore remains UNPROVEN by execution** (no assertion in these ran, because every one calls `newCase`/`seed` first): T2 non-owner (12 roles), revoked-owner and expired-owner refusals with nothing committed, the three direct-runtime forged-input refusals and the active-owner positive control (all 18 T2 tests failed at `newCase` before any assertion); the amended T8 (one transaction identity, `approved_at` = transaction start, each audit event time between start and commit, chain verifies; the main-file T8 failed at `newCase`, the private audit-failure rollback/retry T8 in the upgrade file was skipped); the rule-9 populated upgrade proof for 0134 (both T11 tests skipped). No result for any of these can be quoted. Nothing about 0134 was shown wrong either; the migration applied cleanly on the fresh embedded database in the main file.

| Check | Command (short) | Exit | Result |
| --- | --- | --- | --- |
| Builds, each alone | `pnpm --filter @jobguard/{core,db,storage,config,ai,api} build` | 0 each | built |
| OpenAPI | `pnpm openapi:check` (apps/api) | 0 | passes, file unchanged |
| New DB tests | vitest, 2 new files, `--maxWorkers=1` | 1 | 6 passed, 40 failed, 3 skipped (see above) |
| Core unit | `src/recovery-case-terms.test.ts` | 0 | 16 passed |
| API units | `recovery-case-terms.application` + `watchdog-registry` | 0 | 139 passed (18 + 121) |
| Boundary scanner | `src/auth/context-boundary.test.ts` (untouched) | 0 | 145 passed |
| Replay contract | `command-replay-contract.integration.test.ts` | 0 | 53 passed |
| Merged DB group 1 | recovery-cases, recovery-cases.workbench, recovery-eligibility-v3 | 0 | 84 passed |
| Merged DB group 2 | recovery-timing-pin, recovery.integration, recovery-follow-up | 0 | 103 passed |
| Merged DB group 3 | recovery-follow-up-upgrade, recovery-messages, job-activation-terms | 0 | 112 passed |
| Merged DB group 4 | evidence-packs, fingerprinted-row-shape, extra-origin-upgrade | 0 | 27 passed |
| Merged DB group 5 | audit-export | 0 | 11 passed |
| `pnpm test:migrations` | tenancy + demo-bootstrap | 0 | 13 passed |
| `pnpm typecheck` | | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | | 0 | purity 134 files, lane boundary (27 files), money boundary, 7/7 tasks |
| `pnpm --filter @jobguard/web build` | production build for the browser run | 0 | built |
| Browser, M4-5-S + M4-6-S + CH-7 + CH-1 | Playwright, channel chromium, `CI=1`, `--workers=1`, projects mobile-360 and desktop | 0 | 44 passed (18 + 26, same as the earlier Mac run) |

Vitest ran with `--maxWorkers=1` for database files and `--maxWorkers=2` otherwise, at most three files per run, one heavy step at a time through `heavy-slot`. Wrapper config: `~/.local/share/full-steam/jg-runs/ch-7-terms-mac2/pw-ch-7-terms-mac2.config.ts`. The first two browser attempts were refused with "port 3000 already used" because another lane's Playwright run (the sv-3 worktree) held the fixed ports 3000 and 55432; the helper waited for 30 seconds of free ports and ran all four specs in one go. Nothing of the other lane was touched. There is no WebKit project in the Playwright config. The known Mac-only `[mobile-360] ENT-2.spec.ts:19` failure was not in scope and did not appear.

**Not pushed; no pull request opened.** Mac helper record only. Not independently verified, not accepted. No fresh Opus or Sol review exists.

## Repair round 4 (two fixture defects, 12 Oct)

Issued by the dispatcher about 23:55 on 12 October 2026, starting at clean HEAD `b165088` on `codex/sandbox/ch-7-terms`, including the merge of main `96f051f` and the Mac round-3 receipt. Earlier orders and rounds remain in force. This repair changes only the two new database test files and this receipt; migration 0134 and all product code, merged tests, security assertions/lists and other files remain unchanged.

Read and understood the Mac helper's scratch diff at `~/.local/share/full-steam/jg-runs/ch-7-terms-mac2/probe-diffs/ch-7-terms-scratch-all.diff`, checked it against the two helpers, the versioned open-command schema, the terms repository and the merged dispatcher, then applied it after `patch -p1 --dry-run` passed. No assertion was removed or weakened: T7 retains its exact nothing-committed assertion and gains the fresh-case foreign-actor refusal.

**Defect 1:** `packages/db/test/recovery-case-terms.integration.test.ts:21` (`newCase`) and `packages/db/test/recovery-case-terms-upgrade.integration.test.ts:43` (`seed`) omitted `expectedRevision:0` from the case `open` command. `packages/core/src/recovery-case.ts:203` requires literal 0; `RecoveryCaseRepository.command` parses the command at `packages/db/src/recovery-case-repository.ts:95`. The omission caused the reported Zod failure before the substantive assertions.

Before/after in both helpers (all other command fields unchanged):

```diff
-action:"open",commandId:randomUUID(),
+action:"open",expectedRevision:0,commandId:randomUUID(),
```

**Defect 2:** the foreign actor expectation at `packages/db/test/recovery-case-terms.integration.test.ts:154` used `RECOVERY_TERMS_FORBIDDEN` for tenant A's already-approved case (approval at line 142). The merged dispatcher at `packages/db/src/commands.ts:68–77` finds its occupied command-type/semantic key and returns `COMMAND_CONFLICT` before the owner or tenant-qualified foreign-key check. The repository maps that to `RECOVERY_TERMS_COMMAND_CONFLICT`. On a fresh unapproved case the foreign actor reaches the tenant-qualified receipt foreign-key refusal and receives `RECOVERY_TERMS_FORBIDDEN`.

Before/after for T7 (original line 150 and assertion at 154; the added assertion is now line 155):

```diff
- });const before=await counts();
+ });const fresh=await newCase();const before=await counts();
- await expect(repo.approve(context,job,command(id),{membershipId:bm,identityUserId:bu})).rejects.toMatchObject({code:"RECOVERY_TERMS_FORBIDDEN"});
+ await expect(repo.approve(context,job,command(id),{membershipId:bm,identityUserId:bu})).rejects.toMatchObject({code:"RECOVERY_TERMS_COMMAND_CONFLICT"});
+ await expect(repo.approve(context,job,command(fresh),{membershipId:bm,identityUserId:bu})).rejects.toMatchObject({code:"RECOVERY_TERMS_FORBIDDEN"});
```

The existing `expect(await counts()).toEqual(before);` remains exactly unchanged and covers both refusals; the fresh case is created before the snapshot. Every other assertion remains exactly unchanged, including T2, amended T8 and rule-9 T11.

**Open question for the coordinator:** should a foreign actor receive FORBIDDEN even on an already-approved case? That is a product choice requiring a merged-dispatcher change, outside this tests-only repair.

The Mac probe showed all 49 database tests green with these two fixes. This is dispatcher-reported scratch-probe evidence, not a database run by this builder: 46 tests in the main file plus 3 in the upgrade file, including all 18 T2 tests, both amended T8 tests and both rule-9 T11 tests. The dispatcher reports migration 0134 applied cleanly. A Mac helper rerun of this repaired working tree remains owed; the probe is neither an independent verdict nor technical acceptance.

### Round-4 run receipt

Dependencies were already installed; no install/download or clean-install claim. Node `v24.17.0`, cached pinned pnpm `10.28.1` through the inspected existing `PATH=/private/tmp/ent3a-bin:$PATH` wrapper. An initial default-launcher `pnpm --version` stalled and was interrupted; the existing wrapper returned the pinned version without a package download.

Only typechecking is run under the round's tighter memory limit. No unit test applies to the two touched files: both are PostgreSQL integration tests. Full tests, lint, lint:lanes, build and OpenAPI execution are NOT RUN in this round under that limit, despite the generic environment checklist; previous round/helper results above remain historical evidence.

| Command actually run | Observed result | Log |
| --- | --- | --- |
| `patch -p1 --dry-run`, then `patch -p1`, using the inspected scratch diff | Both exit 0; only the two issued test files patched | Tool output |
| `PATH=/private/tmp/ent3a-bin:$PATH pnpm typecheck` | exit 0; 7/7 tasks passed, 4 cached; existing Turbo cache-write I/O warnings | `/private/tmp/ch7-terms-r4-typecheck.log` |
| `PATH=/private/tmp/ent3a-bin:$PATH pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/recovery-case-terms.integration.test.ts test/recovery-case-terms-upgrade.integration.test.ts` | exit 0; both touched tests compile, no database execution | `/private/tmp/ch7-terms-r4-test-types.log` |
| `git diff --check`; deterministic HEAD/source comparison | exit 0; each test equals HEAD plus exactly the issued replacements/addition; 0134 byte-for-byte unchanged; exactly three authorized tracked files differ | Tool output |

**PASS — builder source self-review only.** Exact whole-file comparisons preserve every other byte of both tests, including the original nothing-committed assertion. No migration, product behavior, compatibility impact, operational alert, external action or release is introduced by this repair. Rules 11 and 12 remain in force; no credential fixture, permanent source/hash pin or security-list change was introduced.

**PostgreSQL database tests: NOT RUN in this sandbox (cannot bind localhost or start PostgreSQL).** Database, migration and browser suites remain for the Mac helper/CI; no database or browser startup was attempted. No model/prompt/schema implementation changed, so no evaluation applies.

The intended conventional-commit subject and body are written to `/private/tmp/jg-msg-ch-7-terms.txt`. No Git write, commit or push was performed. The dispatcher owns committing and pushing; independent recorded verdicts bound to that exact commit and separate acceptance remain owed. This receipt is builder evidence only.
