# LP-13 downstream effects, v1

Synthetic construction only. Updated 4 November against inherited LP-12
`e192910b7`. The merge is complete at `766baa9a5`; no unfinished merge entries
or Git writes in this run. Source presence is not predecessor acceptance or
landing. READY means the router may save this NOPR branch; landing remains held.

| Item | Downstream impact and inherited treatment | Regression evidence required in CI |
| --- | --- | --- |
| 0017 invoice-number burning | LP-8a 0795 already revokes runtime/PUBLIC reservation EXECUTE and direct sequence INSERT/UPDATE/DELETE. A checked command does not restore that withdrawn capability. The latest supported practice and lock-bound issuance bodies in LP-6c 0591 allocate internally under their own authorization/replay boundary. Preserve those bodies; no second reservation store, claim column, allocator, owner transfer or number renumbering. | LP13 tries repeated standalone calls, a checked command, ambiguous claims, forged actor, wrong/stale tenant, revoked authorization, direct sequence writes and incomplete commit; verifies sequence rollback and issued records unchanged. Run `lp8a-billing-revokes.integration.test.ts`, `UIWIRE-10.integration.test.ts`, `lp5-commands.integration.test.ts` and supported invoice positive/concurrent/replay/rollback cases. |
| 0053 legacy unknown raiser | NULL membership/command with `legacy_unrecorded` and `legacy_synthetic_capture` remains explicit unknown, never verified person/time/command attribution. No invented backfill. | LP13 exercises the actual legacy origin trigger. Run `shared-money-origin.integration.test.ts`, `small-builder-origin.integration.test.ts` and core `extra-persistence.test.ts`; authority/evidence/fee paths still require their own qualifying proof. |
| 0003 scope progress actor | Latest body is LP-6d 0780, not 0003. Preserve its current_actor check, protected tenant and compatibility tenant checks before lookup, and all three original transition tokens. No persisted actor or commercial update; only operational stage/revision/time changes. | LP13 rejects unbound forged settings, wrong/stale tenant, invalid reason and stale revision; retains start/complete/rework and asserts job, prices, invoices, charges, authorizations and cap unchanged. Run `lp6d-routines.integration.test.ts`, `job.integration.test.ts`, `proof-application-records.integration.test.ts`, `practice-scope.integration.test.ts`. |
| 0120 SSO audit connection | Latest audit body remains 0520: load the connection and its tenant before validating/sealing the event. Unknown connections refuse. Identity bootstrap is narrow; audit creates no commercial authority. No copied routine. | LP13 uses the identity role with stale tenant and unknown connection, then asserts exact connection tenant. Run `enterprise-identity.integration.test.ts`, `sso-required.integration.test.ts`, `lp6a-sso.integration.test.ts` and LP-6e audit tests. |
| 0095 replay branch | The 13-argument adoption overload always raises JOB_PARTIES_REQUIRED and 0356 revoked runtime execution. Keep both. Supported 18-argument adoption and current begin_command replay retain LP-3/5/6 checks before results/effects. | LP13 attacks the retired overload, a forged original actor and another bound actor's replay key; checks exact original replay and unchanged invoice/receipt/approval/audit counts. Run `lp5-parties-import.integration.test.ts` and `lp3-activation-acceptance.integration.test.ts` for supported adoption, concurrency and replay. |

Reserved migration 0820 and its proof are retained. The saved branch-only
implementation has never been treated as an installed migration: this catch-up
replaces it with BEGIN/COMMIT and explanatory comments, with empty lp0/upgrade/
tenancy deltas. No schema, routine, source fingerprint, owner, grant, policy,
column or stored data change remains. No backfill or rollback action is needed.
Do not rewrite an installed migration; if this branch was installed anywhere,
that environment needs a separately reviewed forward fix instead.

The upgrade regression snapshots all overloads of the five paths and checked
issuance/begin_command, their definitions/owners/ACLs/search paths, sequence and
claim table metadata/policies and an existing number 42. It asserts exact
preservation, withdrawn reservation/direct-write privileges and retained checked
issuance EXECUTE. This is a test specification, not observed PostgreSQL proof.
The empty proof now describes a genuinely empty delta; it is not a bypass for a
pending protected source refresh. No scanner, pin, guard or predecessor-owned
file was edited, and no assertion was made optional.

Closed landing holds from the previous save:

- LP-6d/e, LP-7, LP-8a/b, LP-10/11/12 source is present. Removed the absent-predecessor assumption; retain acceptance/landing as a separate gate.
- LP-8a direct sequence closure and supported issuance integration are inherited, no longer delegated as missing implementation. LP13 retests their boundary instead of duplicating their allocator.
- Removed the proposed reserved_invoice_number column, jobguard_command_writer allocator/sequence grants/policy and owner transfer. LP-12 claim custody and grants stay intact. No need to add UPDATE on a private claim column.
- Closed LP13-specific source/privilege-pin and upgrade-body exception holds: reserve_customer_invoice_number body/owner/ACL stay at inherited LP-6c/8a values, and transition_scope_progress stays at inherited LP-6d 0780. Their old -> new value is identical. No LP13 policy or ACL is added. Protected union expectations must still corroborate the predecessor chain in PostgreSQL; none was guessed here.
- Closed obsolete 0534 rename/lane hold. Lane lists exactly six changed non-lane paths relative to actual LP-12 and excludes itself. No checker weakening or obsolete path entry.

Named holds for landing

1. Inherited LP-11/12 credential and LP-10 worker bootstrap compatibility remains held: FORCE-RLS lookups precede request/worker binding. Their owners must prove legitimate sign-in, effective contractor resolution, provisioning/revocation/pool reuse and worker claim/revalidation/lease/retry/completion. No fallback tenant setting, provisional binding or duplicate resolver here. LP-6d customer-message writer remains held for its separate customer sign-in proof after LP-6b lands, as directed.
2. Inherited protected catalogue/source alignment remains held. LP-12 reports LP-6d 0780 helper identity arguments `uuid` -> actual declaration `s uuid`, and predecessor policy/view/ACL registrations needing PostgreSQL corroboration. No LP13-specific old/new source/ACL change remains. Do not edit protected scanner/pin/guard here.
3. Inherited API registry failures remain held with their owner: LP-12's latest recorded result is 251 passed / 20 failed after DB-dist refresh (context-boundary 145 passed; registry 106 passed / 20 failed). This supersedes the historical LP13 95/31 registry result; neither is a current LP13 run. Classification and stranger-session expectations remain owner work; no test was weakened here.
4. CI must run fresh/upgrade PostgreSQL, migration/catalogue/privilege/RLS suites, both LP13 integration files, and the downstream suites in the table. Prove supported invoice approval/commit, concurrent allocation, replay and rollback, and all surviving/retired signatures as actual runtime/identity/worker roles. Keep inherited positive-path gates; fixture collection and source checks prove no database behavior. Required pinned-install typecheck/lint/test/build and affected synthetic browser journeys remain required.
5. Independent exact-head RED review, green CI against current main, accepted predecessors and reserved migration order remain landing gates. The router stages/commits/pushes this NOPR save and validates the candidate-head lane. No review, PR, merge, real-data approval or release was performed here.

Local validation for this catch-up (Node 24.17.0, installed tools, at most two
workers and three named Vitest files per run; no downloads):

- DB `node node_modules/vitest/vitest.mjs run --maxWorkers=2 test/lp13-low-value-batch.test.ts test/migration-proof-loader.test.ts test/lp8a-billing-revokes.test.ts`: 3 files, 90 tests passed.
- Root `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`: passed after final test edits.
- DB `node node_modules/vitest/vitest.mjs list --maxWorkers=2 test/lp13-low-value-batch.integration.test.ts test/lp13-upgrade.integration.test.ts`: collected 9 cases, no hooks/PostgreSQL execution. Two older reservation cases were combined into the stricter inherited revoked-capability test; no positive reservation expectation remains for a capability LP-8a withdrew.
- `git diff --check`: passed; `git ls-files -u`: empty. Read-only exact predecessor-relative lane equality passed for six non-lane paths; protected scanner/pin/guard files unchanged. Candidate-head lane CLI remains router/CI work.
- Initial root Vitest invocation used a nonexistent root module path and ran no tests; corrected to the installed package-local runner above. No package install.

Historical 4 November save evidence (superseded, not current acceptance): the
LP-6c-based implementation passed 86 focused tests and TypeScript, collected 10
database cases, and recorded old API/lane failures. Its pin, body and missing-
predecessor holds are superseded as described above. No live database or browser
suite ran in either sandbox run.

LATER / SIMPLICITY (initial review, nonblocking): this receipt previously repeated
the same landing holds in several save sections. Keep one current named-hold
list with a short historical note so future catch-ups cannot mistake stale base
assumptions for current implementation gaps. This update follows that approach.
