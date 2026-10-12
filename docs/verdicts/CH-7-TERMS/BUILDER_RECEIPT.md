# CH-7-TERMS builder receipt — continuation round 1

Builder: Codex GPT-6.1 Sol. Issued 12 October 2026; Q1–Q5 adopted, plus the coordinator's active-owner amendment supplied in this round.

**Status: implementation written; acceptance HOLD on T8's conflicting timestamp requirement.** This is a builder receipt, not a database verdict. No commit, add, checkout, fetch, push, package install/download, database or browser was performed. All changes remain in the working tree. The intended message is `/private/tmp/jg-msg-ch-7-terms.txt`.

Issued branch/head: `codex/sandbox/ch-7-terms`, `3fa7e7edfa08dd44a3f58d9288f94fc7050e6008`. Its merged main base is `96c0cb8a5b5562c65b79f5f601ba9d60f8fcf05a`. That main snapshot ended at 0130; 0134 remains the issued number. `origin/main` advanced externally during this round to `ad1bad244e1712f3af4cbd4c30e784184da33d14` (including PRACTICE-FACTS-1/0131). The worktree/head was not changed to follow it. Lane checks use the merge base; preservation evidence below distinguishes fixed-base changes from newer main. Dispatcher integration of newer main is owed before reviewing the final commit.

## Preflight finding (credited)

The previous builder round found the genuine conflict between T2's forged direct-call refusal and the prohibition on carrying an SQL membership predicate. Credit that builder for identifying the concrete counterexample and refusing to weaken T2; that was the correct finding. The coordinator's 12 October ruling amends the order: the new routine carries its OWN active-owner predicate while continuing to use the merged dispatcher receipt and audit paths. This is a tightening inside the new routine; no existing predicate or grant is altered.

Mirrored `packages/db/migrations/0109_job_activation_terms.sql:58` exactly in shape: `role='owner'`, `revoked_at IS NULL`, `(expires_at IS NULL OR expires_at>clock_timestamp())`. The new query joins membership on tenant and receipt actor at `0134_recovery_case_terms.sql:56`, with the predicate at line 61, alongside the exact-authorization joins modelled on 0109:59–65. **0109:58 contains no contractor-membership revocation check at this base; none was invented or omitted.** The new direct-runtime tests insert a processing receipt, case Decision, approved resolution and exact unexpired authorization for a non-owner, revoked owner and expired owner, then invoke the routine in the same transaction and compare all approval/authorization/chase/audit counts after rollback. The active-owner construction is the positive control. T2 remains unchanged as an acceptance requirement.

## New acceptance conflict — T8 remains unsatisfied

T8 requires the two audit events to “carry the same transaction time as the approval row”. Its exact equality assertion remains in `[T8] two approval audit events share transaction time and the chain verifies`; it has NOT been skipped, relaxed or represented as passing.

The mandatory merged path at `packages/db/src/audit.ts:59–60` obtains a fresh `clock_timestamp()` for each event and persists the driver Date. The new approval is required to use `transaction_timestamp()` (0134:31); the order also forbids altering/replacing the merged audit path or restating it. These clocks are not equal. This is a source-inspected conflict, not an executed PostgreSQL result. The test's timestamp assertion is expected to fail under the mandated semantics.

An explicit coordinator ruling was requested during this round: either amend T8 to prove the same PostgreSQL transaction identity while retaining both timestamp semantics, or issue the separately owned audit-path change. **No answer/approval has been received or assumed.** No audit code was changed. The independent private-database rollback/retry test and chain-verification assertions are written, but T8 cannot be marked satisfied. AGENTS §1's contract-conflict rule holds technical acceptance until a ruling replaces the incompatible assertion. The helper must not skip/weaken it or report all T1–T13 green.

## Changed files and design choices

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
| T8 | **NOT BUILT to full acceptance** | Private audit-failure rollback/retry test written; chain/equality test written. Exact timestamp equality conflicts with the merged clock path and remains unsatisfied. Coordinator ruling outstanding. DB NOT RUN. |
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

## Commands actually run and results

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

- New `recovery-case-terms.integration.test.ts` and `recovery-case-terms-upgrade.integration.test.ts`; T8's exact equality remains an explicit HOLD before any all-green claim.
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
- Coordinator ruling on T8, real helper/CI execution, two independent RED reviews bound to the exact eventual commit and separate acceptance/merge/release.

## Self-review

Read the whole local diff against HEAD and the moving-origin diff, and re-read the new SQL, schemas, repository and tests. The migration has exactly one CREATE TABLE and the prescribed callable/trigger functions; no CREATE OR REPLACE, existing-table ALTER, existing grant/policy edit, DML backfill, ENABLE ALWAYS or financial action. The new table alone has owner/RLS ALTER statements. Its SELECT grant and two callable EXECUTE grants are the only added grants. Timestamp pin is the first ordinary approval insert trigger; immutable mutation delegates to the merged rejecting function. Membership owner predicate is the coordinator-authorized tightening; receipt/audit remain dispatcher-owned. All stored terms/time fields are server-derived; IDs are the only routine parameters. Every normal business lock precedes the dispatcher audit append.

Merged source files gained lines only, except the expressly replaced eligibility sentence; OpenAPI has only an additive route; E2E files each gain one setup call; tenancy gains only two allowed catalogue rows. No unowned permanent file pin, credential-shaped long literal, security list/hash/count edit, held feature, context mint or package/lock/CI change was introduced. The 0134 registry assertion is by name/ascending order, never last/count. Privilege limits and synthetic fixtures are labelled accurately. Generated dist, Next, Turbo and tsbuildinfo outputs were removed after the final checks; no build output, test-results or .pnpm-store remains in the worktree. Dependencies were retained.

The review does **not** turn T8's known source conflict into a pass or imply that any PostgreSQL/browser assertion was observed. This round has made the whole implementation reviewable, but has not completed all task acceptance assertions. Do not accept/release while the T8 ruling and mandatory helper/RED evidence are missing.

Tracked-file diff at receipt-writing time (untracked new source/test/contract files are separately in status; this stat is not a total diff):

```text
 apps/api/openapi.json                            | 15 +++++++++++++++
 apps/api/src/recovery-case.application.ts        |  9 +++++++++
 apps/api/src/recovery-case.contracts.ts          |  8 ++++++++
 apps/api/src/recovery-case.controller.ts         |  6 ++++++
 apps/api/src/recovery-message.errors.ts          |  1 +
 apps/web/e2e/M4-5-S.spec.ts                      |  1 +
 apps/web/e2e/M4-6-S.spec.ts                      |  1 +
 docs/contracts/recovery-eligibility-v3.md        |  2 +-
 packages/core/src/index.ts                       |  1 +
 packages/core/src/watchdog.ts                    |  1 +
 packages/db/MIGRATIONS.md                        | 12 ++++++++++++
 packages/db/src/index.ts                         |  1 +
 packages/db/src/migrate.ts                       |  1 +
 packages/db/src/recovery-follow-up-repository.ts |  2 ++
 packages/db/src/recovery-message-repository.ts   |  2 ++
 packages/db/test/tenancy.integration.test.ts     |  2 ++
 16 files changed, 64 insertions(+), 1 deletion(-)
```

Working-tree file list at receipt-writing time:

```text
 M apps/api/openapi.json
 M apps/api/src/recovery-case.application.ts
 M apps/api/src/recovery-case.contracts.ts
 M apps/api/src/recovery-case.controller.ts
 M apps/api/src/recovery-message.errors.ts
 M apps/web/e2e/M4-5-S.spec.ts
 M apps/web/e2e/M4-6-S.spec.ts
 M docs/contracts/recovery-eligibility-v3.md
 M packages/core/src/index.ts
 M packages/core/src/watchdog.ts
 M packages/db/MIGRATIONS.md
 M packages/db/src/index.ts
 M packages/db/src/migrate.ts
 M packages/db/src/recovery-follow-up-repository.ts
 M packages/db/src/recovery-message-repository.ts
 M packages/db/test/tenancy.integration.test.ts
?? apps/api/src/recovery-case-terms.application.test.ts
?? apps/web/app/api/jobs/[id]/recovery-cases/terms/
?? docs/contracts/recovery-case-terms-v1.md
?? packages/core/src/recovery-case-terms.test.ts
?? packages/core/src/recovery-case-terms.ts
?? packages/db/migrations/0134_recovery_case_terms.sql
?? packages/db/src/recovery-case-terms-repository.ts
?? packages/db/test/recovery-case-terms-upgrade.integration.test.ts
?? packages/db/test/recovery-case-terms.integration.test.ts
```

Builder receipt only — not independently verified, not accepted.
