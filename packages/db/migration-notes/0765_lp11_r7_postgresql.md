# LP-11 r7 PostgreSQL regression triage

The r6 run at `3552df5a5fa816dad5103edad981e48381279dd4` used PostgreSQL 16.10. All 878 files completed, with 827 passing and 51 failing. Of 8,017 assertions, 7,792 passed, 198 failed, eight were skipped and 19 were marked todo. No failure stack reached the old work-order fixture refusal. The separate setup failures were `test/extra-approval-authority.integration.test.ts` on `app.audit_event` and `test/site-jobs-scope.integration.test.ts` on `app.site_visit`.

The rows are mutually exclusive and count failed assertions. Exact PostgreSQL table-policy refusals are listed first. Wrapped refusals and result mismatches are grouped by the earliest observed path and need independent confirmation of their underlying cause.

| First refusing path or observed boundary | r6 | r7 final |
| --- | ---: | ---: |
| Proposed-row RLS on `app.command_receipt` | 18 | 0 |
| Proposed-row RLS on `app.site_visit` | 11 | 0 |
| Proposed-row RLS on `app.audit_event` | 10 | 0 |
| Proposed-row RLS on `app.job` | 10 | 0 |
| Proposed-row RLS on `app.extra_prompt_rule_settings` | 9 | 0 |
| Proposed-row RLS on `app.enterprise_agreement_version` | 7 | 0 |
| Proposed-row RLS on `app.evidence_invalidation` | 5 | 0 |
| Proposed-row RLS on `app.evidence_object` | 2 | 0 |
| Proposed-row RLS on `app.org_unit` | 1 | 0 |
| Proposed-row RLS on `app.role_grant_revocation` | 1 | 0 |
| Persisted state and catalog assertions in contractor jobs, extras, visits and worker paths | 39 | 0 |
| Guard witness reports success after unbound access | 31 | 0 |
| Delegated customer decision and session authority | 23 | 0 |
| Raw extra receipt, trigger and immutable-history witnesses | 21 | 0 |
| Practice switch, identity marker and retained authority | 10 | 0 |

The proposed-row refusals come from the cutover's bound tenant policy on the named table, or the audit writer's scoped exception on `audit_event`. Shared administrative fixture transactions enter as `jobguard_migration` with a legacy tenant setting and lack a stored binding. The affected factories include `ownerTx`, receipt probes, site-visit seeding, prompt rule setup, agreement seeding and evidence invalidation. Update and delete witnesses can return success with zero visible rows. That prevents the expected row trigger or immutable-data assertion from running. The live-state failures include apparently successful commands after a fixture's attempt to move a job off live.

The delegated customer group covers `identity.extra_customer_approval`, `identity.extra_customer_queue`, `identity.extra_customer_view`, and the private LP-6c binder's extra-approver lookup and race witnesses. The single unhandled `CUSTOMER_REFUSED` rejection was reported from `identity.extra_customer_approval` in the approver-versus-withdraw race. The legacy stage and variation scope already in LP-11 is separate from the extra-approver scope.

The practice group includes `app.contractor_session`, the practice marker and switch audit triggers, and reads after a commercial-track or role change. The extra receipt and history group covers test transactions that seed receipts and exercise exact FK, scope, duplicate identity, immutability, pricing and audit checks. The remaining state and catalogue group includes `app.ent3b_visit_authority`, escalation discovery, retained export eligibility, connector promotion and two-tenant work-order assertions. The first diagnostic alone does not prove a product authority failure in those cases.

The merge at `9bc0a9c53` keeps main's `0762_northside_hosted_agreement.sql` and `0763_member_administration.sql`, leaves 0764 reserved, and moves this branch's cutover and proof to 0765. The r6 commit remains the first parent and its pinned files retain their exact bytes.

## Repairs verified during the first round

Shared extra, site and prompt fixtures reuse their existing tenant owner's credential for owner writes and trigger probes. Practice fixtures resolve the actual contractor practice credential at transaction time so the fixture can follow a switch without adding an identity locator or a sign-in session. Fixtures with a caller-managed transaction bind its real actor before entering the migration role. The predecessor-only catalogue and malformed-setting assertions use a populated pre-0765 database. The current catalogue and each current permissive alternative are checked separately on PostgreSQL.

For delegated extras, the NOLOGIN lookup owner opens a private transaction scope after validating the stored sign-in or session digest and matching the exact link, job and approver. The completed decision and command effects use their own IDs and the same scope. The receipt completion trigger and raised-origin trigger verify the stored facts and audit while that scope is active. The approval transaction leaves unrelated deferred constraints alone.

Escalation discovery reads only the four approval scheduling tables for each registered tenant. The sweep authenticates the dedicated LP-10 worker login, verifies the stored step and its deadline under the existing job lock, and scopes fact writes and audit to an exact request and step. All job locks precede the audit head lock. The retention worker reuses the same dedicated worker pool after the main merge.

The focused practice-worker proof passed 20 of 20, including the raw table-owner and switch audit witnesses. The filled ENT-5 approval authority suite passed 4 of 4. Northside passed 7 of 7. The upgrade suites and strict proof loader passed 79 of 79 on PostgreSQL. These counts come from the focused runs and will be supplemented by the full-suite counts.

The next round addressed a second worker path. LP-10's locked outbox action now opens the same private extra-link reader for that action's committed signal. The reader derives the issuer, approver, work order and current grant scope from the persisted link. The ordinary request credential and the worker credential remain distinct. Two tests also needed their original named actors restored at the fixture boundary. The relink witness uses the forged actor's genuine test credential so the receipt guard exercises the original mismatch. The priced-submit race seeds suspension with the fixture owner's existing context.

The two commercial-integrity baselines still admit one exact existing generic-call edge in the extra approval repository. The guard fingerprints the entire class, so routing escalation through the worker pool changed that edge's fingerprint. All nine callers still pass literal `SELECT app.xa_*` statements. Each baseline updates only the line and fingerprint for that edge. The S9 hash entries and their source files match r6.

A separate table-owner probe now binds the finance session for fee authority, the supervisor session for site-extra authority, and the contractor owner for the switch test. The direct evidence calls bind their existing fixture actor for the uppercase and same-tenant positives, and keep malformed settings unbound. The closeout assertion still compares the exact predecessor policy shapes, while current privileges and full policy inventories remain covered by the same journey and the upgrade proof.

Second-round focused evidence on PostgreSQL 16.10 includes the three sibling cancellation assertions, the relink and priced-submit assertions, the three evidence and closeout catalogue assertions, and the server entitlement assertion. All passed. The latest upgrade proof run passed 79 assertions. Web passed 3,620 of 3,620 across 252 files. The guards each reported zero diagnostics, all 253 guard tests passed, and all seven typecheck tasks succeeded.

Ten site-visit assertions reached their business refusal but lost the associated audit event. The old unbound `app.lp6d_record_visit_refusal` could neither identify the actor and job nor seal the event under tenant RLS. The replacement checks the original request credential and permits only the exact lower-trust refusal. The historical association of a revoked member can authorize that event without creating a business request binding. The database derives the deduplication identifier, and the scope exposes only the named actor, the same-tenant job and the resulting event. All 11 focused refusal and revocation-race assertions passed with this route.

The first full rerun exposed a refusal-order regression in `app.lp6d_escalate_overdue_worker`. The original entry point reports `MODE_FORBIDDEN` outside the synthetic database. The new dedicated-login check was running before that mode check and returned `WORKER_LOGIN_UNSAFE` instead. The migration checks the request binding, then database mode, then worker login. The fresh-install test continues to assert the original refusal exactly.

The F17 historical upgrade proof also caught direct `event_type` dependencies in the new extra audit policies. PostgreSQL blocked the test's rolled-back column-type control before the byte-and-type comparator could read it. The new policies use the same whole-row `app.lp11_audit_event_type` accessor as the existing policies, preserving the event checks and the exact upgrade assertion. The visit refusal reader uses the same accessor.

The first full run timed out in the 2,000-order dashboard fixture's `beforeAll` while other large fixtures were active. The original test passed on the second-round snapshot with its original setup deadline and plan assertions. No dashboard timeout or plan assertion changed.

Main's Northside hosted-agreement test reached its successful finance derivation and exact replay, then hit `RequestBindingRefusedError: FORBIDDEN` seeding a suspension with the stale pre-switch owner context. The administrative fixture now uses the already-resolved post-switch credential for that same tenant. The test still asserts that replay is refused once the agreement is suspended.

The real restricted demo bootstrap found an unexpected owner-table exception for the new extra customer scope. The following runtime test failed because its pool is initialized by the first test. The scope stays migration-owned under the exact existing posture, with only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` granted to the private NOLOGIN lookup role. Application roles receive no direct scope access. The bootstrap keeps its exact table-owner assertion.

## Whole-suite results

Round one ran all 883 files on PostgreSQL 16.10. It finished with 870 passing files, 13 failing files, 8,020 passing assertions, 28 failing assertions, two skipped and 19 todo. The two r6 RLS setup failures and the unhandled rejection were gone. The sole setup failure was the dashboard hook timeout, which passed on the second-round snapshot. The 28 assertions split into the following mutually exclusive groups.

| Round-one refusing path or diagnostic | Failed assertions |
| --- | ---: |
| `lp6d_record_visit_refusal` returned the typed refusal without its audit event | 10 |
| Extra outbox issuer/link validation and sibling cancellation rejected or missed checked sends | 7 |
| `bind_request` refused stale or missing administrative fixture credentials in relink, entitlements, priced submit, direct evidence and Northside | 6 |
| Closeout predecessor policy comparison and the F17 upgrade's audit column-type control | 2 |
| Restricted demo bootstrap exact ownership inventory and dependent runtime test | 2 |
| `lp6d_escalate_overdue_worker` reported `WORKER_LOGIN_UNSAFE` before `MODE_FORBIDDEN` | 1 |

Round two began after round one finished. It uses two parallel workers to reduce fixture contention and keeps the same runner options otherwise. The explicit test and hook deadlines remain unchanged.

Round two passed all 13 files that failed in round one. It also exposed an intermittent failure in `TermsReviewConcurrency: shared case lock blocks review until rollback`. The original fixture rapidly polled for any advisory wait under the login. Under concurrent test load the poll could finish before the review reached the held lock. Three isolated repeats passed without changing product code. The fixture now waits for PostgreSQL to report that the review is blocked by the exact backend holding the lock, using the same bounded poll with a short interval. The original lock, rollback and outcome assertions are unchanged. All 20 recovery-terms timing tests passed on that revision, which is the third full run's input.

Round two finished all 883 files, with 879 passing, 8,045 passing assertions, four failing assertions, one existing skip and 19 todo. It recorded no setup failures or unhandled errors. Every r6 assertion and setup failure passed. The other three round-two failures and their repairs were:

- `tenant-context.test.ts` rejected the extra `writeVisitRefusal` export. Round three first moved the writer behind a transaction callback. The exact export assertion stays in place.
- `lp6d-routines.test.ts` found 26 of the previous 28 authority-inventory entries after the legacy refusal routine lost its runtime grant. The installed routine keeps its exact owner and ACL and now always returns `REQUEST_BINDING_REFUSED`. `app.lp11_record_visit_refusal` is the credential-checked writer. The exact inventory assertion stays in place.
- The unjoined stale recovery-command case sampled a lock event while `pg_stat_activity` still showed `set_config`. Its lock witness waits for the exact case-lock holder and the advisory statement's activity text to be visible together. The expected query, stale refusal, transaction and audit assertions are unchanged.

The round-three snapshot passed 132 focused checks across the two exact compatibility tests and three upgrade-proof files, all 40 recovery lock and timing tests, and 15 selected site-visit refusal and race cases before its full run.

Round three finished all 883 files, with 882 passing, 8,048 passing assertions, one failing assertion, one existing skip and 19 todo. It recorded no setup failures or unhandled errors. The transaction callback introduced an unapproved deferred `withTenant` mode, which `lp6b-deferred-binding.test.ts` caught. The site-visit repository now opens its dedicated refusal transaction and calls the one fixed SQL writer through the existing issued-credential function's refusal operation. The credential remains in the module-private store. The exact set of `withTenant` modes and callers, the exact module export set, and each scanner and hash stay intact.

The integration fixture's wrapper for the issued-credential function forwards the refusal operation to the production module. It still uses the actual issued credential and actual PostgreSQL writer, including in the failure-injection test. The updated snapshot passed 64 focused boundary checks, 146 context-scanner checks, 15 selected visit checks, all 2,100 database unit tests and all 79 upgrade proofs before the fourth full run.

Round four passed all 883 files and 8,049 assertions, with one existing skip and 19 todo. Vitest still exited with an uncaught PostgreSQL `57P01` after `receipt-line-allocation-facts-races.integration.test.ts`. All three assertions in that file passed. The shared attribution fixture now waits for every client `end` event before stopping the embedded server. This fixes a teardown race without changing test assertions, SQL authority, or how the fixture exercises the application.

Round five exited successfully on PostgreSQL 16.10. All 883 files passed, with 8,049 passing assertions, zero failed assertions, zero setup failures and zero unhandled errors. One existing skip and 19 todo remain. The `pg_dump` restore test passed. Each of the 198 original failed assertion names matched a passing assertion in the final report. The two original RLS setup failures and the original extra-client unhandled rejection also cleared.

The full API unit suite passed 4,518 tests across 262 files, and web passed 3,620 tests across 252 files. After the test-only teardown change, the four affected PostgreSQL test files passed 28 tests and the three API files that import the fixture passed 63 tests. The three upgrade-proof suites passed all 79 checks. Both commercial-integrity guards reported zero diagnostics, all 253 guard tests passed, and all seven typecheck tasks succeeded.
