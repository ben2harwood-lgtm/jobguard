# FIXLATER-2 builder receipt

11 October 2026. Builder: Codex GPT-6.1 Sol. Issued routine test/record repair batch; check lane AMBER, one fresh Claude Opus verdict required after the dispatcher commits.

**Builder receipt only — not independently verified, not accepted.**

## Base and scope

- Branch: `codex/sandbox/fixlater-2`.
- Base and unchanged HEAD: `bbca5ca5ee55a6a4d7fcdf89de426195d28c3e27`, also `origin/main` when inspected. Initial working tree was clean.
- Read repository `AGENTS.md`, BUILD_PLAN §§2.1–2.4, CH-7 and M4-6-S cards, the recovery eligibility v3 contract, relevant merged repositories/SQL, and `~/.local/share/full-steam/jg-orders/FIX-LATER.md`.
- First change: exactly one compact `fixlater-2` lane line, immediately after `fixlater-1`, with the issued branch, verbatim note and exact eight allowed paths. Every other line is byte-identical to the base.
- Eight repository paths changed: the lane registry, four test files, two record documents and this receipt. No product code, migrations, dependencies, assertions or timeouts were replaced or weakened. No Git write, push, merge, PR, provider action or acceptance performed. Dispatcher owns the commit and subsequent push.
- Shared record files are serialized within this single batch: items 2/3 share the follow-up test; item 4 shares its eligibility test; the lane registry and migration record remain integration-owned shared files outside this issued edit. No parallel editing agents were used.

## Item results

DONE means implemented and source-inspected; database/socket execution remains NOT RUN here.

### 1 — DONE: populated-upgrade port selection

`packages/db/test/recovery-follow-up-upgrade.integration.test.ts`, base/current line 84:

- Before: `const port = 61400 + Math.floor(Math.random() * 200);`
- After: `const port = await freePort(61400, 200);`
- Added only the existing helper import at line 13. Same base/span; every other byte unchanged.
- Affected setup covers `registers 0111, 0112 and the repair by name in increasing order`, `applies 0112 and 0115 as migration owner over approvals, queued/unknown/delivered actions and audits without changing one existing row or privilege`, and `preserves preview/approve/revoke/deliver/reconcile and their refusals on upgraded messages without resending`.

### 2 — DONE: lock-wait polling pause

`packages/db/test/recovery-follow-up.integration.test.ts`, base loop lines 1026–1032/current 1033–1040:

- Before: consecutive PostgreSQL lock-view polls without a pause.
- After: `await new Promise<void>(resolve => setTimeout(resolve, 25));` inside the loop, before each poll. Adjacent comment now describes the pause accurately.
- Test: `Round 1 B: an interrupted 0112 advance retry waits for due-signal audit serialization before checking the clock fact`.
- Existing lock observations, failure handling, expectations and timeout budgets unchanged.

### 3 — DONE: three later-approved outbox states

Same file, base/current table declaration line 922; new setup lines 931–937:

- Before table: `active`, `queued`, `executing`, `outcome_unknown`.
- After: those unchanged rows plus `succeeded`, `retryable`, `dead_letter`.
- Tests: `R1: a later succeeded attempt still refuses the delivered source in the repository and raw SQL guard`, and the corresponding `retryable` and `dead_letter` rows.
- Each new row approves the later reminder through the real repository, then sets its outbox state through the neighbouring migration-owner fixture path. Added assertions check one approval, zero sink/delivery records, and the exact outbox state.
- The existing repository and raw SQL expectations run unchanged for every row: `RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED` for all three additions. This does not claim live worker/provider execution.
- Verified against `RecoveryFollowUpRepository.sourceMessage` and the 0115 guard: any later approved non-cancelled action excludes the earlier source; a succeeded outbox without a sink row is not recorded delivery. No added case was omitted for a merged-code mismatch.

### 4 — DONE: eligibility boundary and deterministic refusal codes

`packages/db/test/recovery-eligibility-v3.integration.test.ts`:

- (a) Added `settlement at exactly the case opening instant is excluded with zero Q`, current lines 208–215, beside the base lines 187–198 microsecond timing tests. Uses the existing migration-owner `stampTimes` fixture path with both timestamps `2026-10-11T12:00:00.000900Z`; SQL also asserts exact timestamp equality. Expects excluded, GBP 0p, reason exactly `Paid before you opened this case`. Both repository SQL and 0119 use `<=`.
- (b) Extended `catalogs and runtime enforce FORCE RLS, ownership, append-only and job/case-qualified links`, base lines 90–95/current 91–101. Adds a second actual case under the same tenant/job through owner setup, then pairs it with the original case's review. Expected FK code `23503`. A savepoint rolls back the existing wrong-job failure before the new probe, so it cannot accidentally assert an aborted-transaction error. The existing disabled-guard FK fixture is restored by the original final rollback.
- (c) Added exact PostgreSQL code assertions after original refusals: catalog raw insert `42501` (0119 environment/digest guard); duplicate-payment v1 raw `reviewed`/`approved` rows `23514`; forged qualifying total and component pence `23514`; all three missing-reason result/claim-line rows `23514` (immediate result guard or deferred component guard). Original expectations remain verbatim. Repeated failed writes use fresh rolled-back transactions, retaining the original post-refusal no-effect assertions. Application-only validation/membership errors are not falsely labelled PostgreSQL errors.
- Exact-code additions extend these existing test names: `catalogs and runtime enforce FORCE RLS, ownership, append-only and job/case-qualified links`; `runtime cannot put compensation into Q or alter a generated component's exact pence`; `a duplicate-payment case is refused any new v1 review or approval, by the app and by raw runtime SQL; other categories are unchanged`; `%s: a runtime-role review whose stored %s omits the reason key cannot commit`. The base bare catalog refusal at line 96 remains at current line 103, followed by its code assertion at 104; the base missing-reason refusal at 212 remains at current 238, followed by its repeated transaction/code assertion at 239–244.
- (d) Base line 1: `// Written before migration/repository implementation. NOT RUN in the builder sandbox.` Current line 1: `// Real PostgreSQL integration coverage, run in CI with the merged migrations and repositories.` This describes CI coverage, not a local test result.
- Four additional test instances across the batch: three outbox table rows plus one timestamp test. The wrong-case probe and exact-code expectations extend existing cases.

### 5 — DONE: keep the system-assigned busy listener open

`packages/db/test/free-port.test.ts`, base/current helper line 7 and setup line 12:

- Before: `anyFree()` closed a temporary port-0 listener, then `occupy(taken, ...)` tried to bind its released port again.
- After: `occupy` returns its bound port; the affected test uses `const taken = await occupy(0, "127.0.0.1");`. The registered listener remains open until the existing `afterEach` cleanup, including all 20 helper calls.
- Test: `skips a port another process is listening on (other tools sit inside the test port ranges)`.
- Existing expectation remains byte-identical: `for (let i = 0; i < 20; i++) expect(await freePort(taken, 2)).toBe(taken + 1);`. Same two-port range and expected neighbour. The second test's setup/assertion remains unchanged.
- This removes the setup's release/rebind race. No test socket was opened in this sandbox.

### 6 — DONE: two record documents

- `packages/db/MIGRATIONS.md`, 0119 section only, base lines 738–740/current 740–742: added one sentence naming `practice_feed_event_job_identity`, unique on `(tenant_id,job_id,id)` of `app.practice_feed_event`, and one naming `recovery_eligibility_v1_duplicate_payment_refusal` and `app.refuse_v1_eligibility_for_duplicate_payment()` and its v1 refusal. The existing Round 1 paragraph already mentioned the trigger; it is preserved verbatim. No other section changed.
- `docs/contracts/recovery-eligibility-v3.md`, `Migration and recovery`, current line 23: added one sentence naming that trigger/function on `app.recovery_eligibility_revision`, refusing new v1 review/approval rows for `duplicate_supplier_payment` cases.
- Names, tables, key columns and behavior checked directly against unchanged `0119_recovery_eligibility_v3.sql`, lines 7 and 165–172.

## Commands and actual results

Supplied dependencies reused. Node `v24.17.0` (supplied runtime; `.nvmrc` is `24.15.0`, unchanged), cached pinned pnpm `10.28.1`, Vitest `4.1.11`, Turbo `2.10.12`, Next `15.5.27`. PATH was prefixed with `/private/tmp/jg-fixlater-2-bin`, whose `pnpm` symlink points to the already-cached 10.28.1 CLI. The default launcher stalled during three version probes and was interrupted (exit 130); no installation command or dependency edit was made.

| Command | Exit | Actual result/count |
| --- | --- | --- |
| `pnpm build` | 0 | 7/7 tasks successful, 4 cache hits; Next generated 25/25 static pages. |
| `pnpm openapi:check` | 1 | tsx CLI IPC `listen EPERM`; generator did not run. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same OpenAPI generator/comparison ran without the CLI IPC socket; no OpenAPI edit. |
| `pnpm typecheck` (once) | 0 | 7/7 tasks successful, 4 cache hits. Existing DB tsconfig covers `src`, not these tests; this is not a claim of test-file typechecking. |
| `LANE_BASE_REF=origin/main pnpm lint` (once) | 1 | Core purity passed (127 TypeScript files); lane check refused `HEAD == origin/main`. Remaining boundary/package lint did not execute. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (once) | 1 | `Missing branch or self-comparison range; refusing a misleading pass.` No lane pass claimed. |
| `node /private/tmp/jg-fixlater-2-source-check.cjs` | 0 | TypeScript AST/source inspection: four changed test files parse, all 365 existing expectation expressions preserved byte-for-byte and in order; 13 added; timeout call arguments unchanged. Exact lane allowlist, one-line lane insertion, scope and 0119-only document change verified. No tests executed. |
| Read-only Python assertion-line/receipt inspection | 0 | All 358 existing assertion-bearing source lines preserved byte-for-byte and in order; six DONE sections, no pending command placeholders, dispatcher message present. |
| `git diff --check` | 0 | No whitespace errors. |

The unchanged lane checker rejects the self-comparison before examining the working tree. `.git` is read-only here, so the dispatcher must commit and rerun both gates. Manual allowlist inspection is not a lint/lane pass. No second lint or typecheck run was attempted.

Logs are temporary local evidence at `/private/tmp/jg-fixlater-2-{build,typecheck,openapi,openapi-direct,lint,lanes}.log`. Build/typecheck reported Turbo cache IO permission warnings; build also reported unchanged Next workspace-root and CSS/autoprefixer warnings. Cache hits are not described as freshly executed tasks.

## NOT RUN

- `recovery-follow-up-upgrade.integration.test.ts`, `recovery-follow-up.integration.test.ts`, `recovery-eligibility-v3.integration.test.ts`, and every other database/fresh-install/upgrade/catalog test: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- Every Playwright spec, including M4-6-S and CH-7 in both viewport projects: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. No browser, screenshot or trace claimed.
- `packages/db/test/free-port.test.ts` (both tests): **NOT RUN (sandbox cannot bind sockets)**. No socket mock substituted for the real helper.
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, browser/regression/deploy suites: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**; whole package/repository suites are also forbidden by this order's machine memory limits.
- Zero Vitest/Node test files executed, zero test passes claimed. All four changed files require actual CI execution after dispatch. Local runs, if later authorized in a capable environment, must select only changed files, at most three per run, one run at a time, Vitest `--maxWorkers=2` or Node `--test-concurrency=2`.

No PostgreSQL startup or browser execution was attempted. The mandatory OpenAPI CLI attempted its IPC socket and was denied as recorded; the direct generator check did not use that socket.

## Self-review

Re-read the entire `git diff origin/main` against the issued six-item order as a strict builder review, including the lane, record additions, test fixtures, and this receipt. This is self-review, not an independent model verdict.

- Confirmed all changes lie in the eight allowed paths; no `src/`, migration, provider, configuration policy, package or CI edit.
- Confirmed all existing `expect(...)` expressions (including expected values) are byte-identical and in order. Read-only diff inspection also checked assertion-bearing lines, existing table rows and timeouts. The only setup deltas are the issued port/pause fixes and additive fixture setup.
- Reviewed wrong-case failure ordering: unused interest kind avoids a uniqueness refusal; savepoint clears the first FK error; matching tenant/job and different case isolate the `23503` case-key backstop.
- Reviewed SQL code assertions against guard ordering: absent environment/digest fails before revision checks (`42501`); result/component/v1 mismatch guards raise `23514`. Each repeated failed transaction rolls back rather than committing partial history.
- Reviewed exact-opening fixture: PostgreSQL equality is asserted directly, then both independent merged comparisons enforce `<=` and the existing F20 evaluator/guard agree on zero and exact wording.
- Reviewed the three new source rows: real repository approval first, owner-only outbox setup matching the adjacent executing fixture, no sink entry, exact-state/approval checks, both original refusal routes retained.
- Reviewed port listener lifecycle: port 0 is assigned while listening; the same listener stays registered/open across every `freePort` call and closes in existing cleanup. No product helper change.
- Verified both SQL names and key columns from 0119; verified all other migration record sections and every other lane line remain byte-identical.
- Corrected the loop's obsolete “No sleeps” comment to reflect its new pause. Preserved the original documentation's existing trigger paragraph rather than rewriting it, and appended the requested explicit sentences only.
- No item left undone for a product-code mismatch. Source inspection supplies no PostgreSQL/browser execution evidence.

## Remaining gates and handoff

No migrations, backfill, rollback, compatibility behavior, provider/data-flow change, operational alert or production release in this batch. Existing invariants reinforced by tests: exact delivered-source authorization, tenant/job/case-qualified links, before-opening money exclusion, immutable v3/v1 records and fail-closed SQL guards. No product policy changed.

Dispatcher must commit the working tree, rerun the required root lint/lane gates on a non-self-comparison commit, and push for real PostgreSQL/socket/browser CI evidence. One fresh Claude Opus verdict must bind to that exact commit in this AMBER lane; a separate actor must record acceptance. Neither occurred here. Founder/dispatcher owns push, merge and release.

Intended conventional commit subject/body written to `/private/tmp/jg-msg-fixlater-2.txt`.

**Builder receipt only — not independently verified, not accepted.**
