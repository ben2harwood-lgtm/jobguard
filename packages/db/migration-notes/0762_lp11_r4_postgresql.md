# LP-11 r4 PostgreSQL verification

The complete PostgreSQL 16.10 run executed all 878 test files. It reported 422 passing files and 456 failing files. Of 8,011 tests, 4,265 passed, 2,954 failed, 773 were skipped, and 19 were marked todo. Vitest also reported one unhandled rejection in the watchdog integration file.

The full run started before the upgrade replay assertion was updated to expect the exact revocation trigger header. That replay test passed on its separate rerun. The totals above are the unaltered full-run result.

The accepted exceptions account for one pg_dump failure and 842 failed assertions that reached the held work-order fixture. Another 21 files stopped during setup at that fixture. The full run also recorded 2,111 other failed assertions and 43 other file-level failures outside test bodies.

## r4 regression triage

The counts below exclude the 842 direct work-order failures and the missing pg_dump. An error is grouped by the first diagnostic in the test result. A shared error can be raised by several routines.

| First diagnostic | Failed assertions | Refusing route or observed boundary |
| --- | ---: | --- |
| error: JOB_PARTIES_REQUIRED | 1081 | app.require_job_parties and app.lp6d_job_parties_maintenance read job_party_current or job_party_snapshot as the migration owner. The unbound policy hides the seeded party records. |
| error: JOB_NOT_FOUND | 304 | The watchdog evidence triggers and app.lp6d_watchdog_live_maintenance account for the dominant stored-receipt fixture stack. The app.job policy hides the live job from the unbound maintenance owner. The same diagnostic also comes from unrelated job lookups. |
| Assertion mismatch | 90 | The reporter groups exact catalogue differences, unexpected refusals, empty results and state mismatches here. These require individual checks. |
| error: NOT_FOUND | 59 | The first frames include commercial-integrity invoice setup, line allocation and evidence pack calls. The error alone does not identify the refusing routine. |
| error: CUSTOMER_REFUSED | 55 | Customer portal authentication and LP-6c delegation check job, grant and session rows before a regular request binding. |
| Error: RECOVERY_REVIEWER_FORBIDDEN | 49 | RecoveryCaseRepository.commandBody cannot see the reviewer membership on the current fixture transaction. |
| error: new row violates row-level security policy for table "fee_reservation_book" | 39 | The proposed-row policy on fee_reservation_book refused the write. |
| error: SSO_REQUIRED_FORBIDDEN | 38 | IdentityApplication.invite enters identity.sso_invite_member before the checked session or invitation establishes tenant scope. |
| error: new row violates row-level security policy for table "evidence_upload" | 37 | The proposed-row policy on evidence_upload refused the write. |
| error: new row violates row-level security policy for table "membership" | 33 | The proposed-row policy on membership refused the write. |
| PracticeFeedRepositoryError: PRACTICE_FEED_FORBIDDEN | 19 | PracticeFeedRepository.authorize refuses the fixture scope at its guarded practice read. |
| TypeError: Cannot read properties of undefined (reading 'id') | 18 | The dominant stack is a contractor entitlement fixture reading an empty assignment result. |
| error: new row violates row-level security policy for table "audit_event" | 17 | The proposed-row policy on audit_event refused the write. |
| error: job not found | 17 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| OidcError: OIDC_REFUSED | 16 | The OIDC application wraps an identity routine refusal. The protocol uses its own request cache before issuing a binding. |
| Error: promise rejected "SsoError: SSO_FORBIDDEN { code: 'SSO…' }" instead of resolving | 13 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: UNAUTHENTICATED | 13 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: new row violates row-level security policy for table "action_outbox" | 12 | The proposed-row policy on action_outbox refused the write. |
| error: new row violates row-level security policy for table "input_event" | 9 | The proposed-row policy on input_event refused the write. |
| SsoError: SSO_FORBIDDEN | 9 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: UNAUTHENTICATED | 9 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: EMERGENCY_REFUSED | 7 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| WormCommandError: WORM_REFUSED | 7 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 6 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: FORBIDDEN | 5 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: new row violates row-level security policy for table "job" | 5 | The proposed-row policy on job refused the write. |
| error: INVALID_TRANSITION | 5 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: ACCESS_REFUSED | 5 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| WatchdogError: JOB_NOT_LIVE | 5 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: Synthetic tenant key registry operation refused | 5 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: NOT_FOUND | 4 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 4 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: new row violates row-level security policy for table "account" | 4 | The proposed-row policy on account refused the write. |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 3 | The proposed-row policy on commercial_track_assignment refused the write. |
| Error: promise rejected "error: SSO_REQUIRED_FORBIDDEN { …(15) }" instead of resolving | 3 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 | The proposed-row policy on job_commercial_track refused the write. |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: new row violates row-level security policy for table "capture_source" | 2 | The proposed-row policy on capture_source refused the write. |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23503' } | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: jobguard_session_lookup does not have the required least-privilege posture | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: cannot execute INSERT in a read-only transaction | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_SOURCE_CONFLICT' but got 'cannot execute INSERT in a read-only …' | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 2 | The proposed-row policy on shadow_commercial_signal refused the write. |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'JOB_NOT_FOUND' | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'RECOVERY_SOURCE_NOT_RECOGNISED' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| TypeError: Cannot read properties of undefined (reading 'revision') | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected Error: RECOVERY_REVIEWER_FORBIDDEN { code: '…' } to match object { Object (code) } | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: invalid reversal | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: FORBIDDEN | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: STALE_SSO_REQUIRED | 2 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: MEMBERSHIP_FORBIDDEN | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| TypeError: Cannot convert undefined or null to object | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'fixture audit failure' but got 'new row violates row-level security p…' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: STALE_REVISION | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| TypeError: Cannot read properties of undefined (reading 'identity_user_id') | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: STACK_TRACE_ERROR | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: new row violates row-level security policy for table "scope_identity" | 1 | The proposed-row policy on scope_identity refused the write. |
| Error: expected [Function] to throw error including 'synthetic migration failure' but got 'jobguard_session_lookup does not have…' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'REQUEST_BINDING_REFUSED' but got 'jobguard_session_lookup does not have…' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| TypeError: Cannot read properties of undefined (reading 'connect') | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { …(2) } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: permission denied for table jobguard_schema_migration | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_DEPENDENCY_HELD' but got 'cannot execute INSERT in a read-only …' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { …(2) } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'NOT_FOUND' but got 'cannot execute INSERT in a read-only …' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'TEST-WORKER-pending' but got 'cannot execute INSERT in a read-only …' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'UNAUTHENTICATED' but got 'cannot execute INSERT in a read-only …' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { Object (code) } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| ExtraPersistenceError: NOT_FOUND | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: query returned no rows { …(15) } to match object { code: '23514' } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'COLLECTION_REFUSED' } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'AGREEMENT_INELIGIBLE' } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'rollback' but got 'new row violates row-level security p…' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: FINAL_CHECK_FORBIDDEN | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'JOB_NOT_LIVE' but got 'JOB_NOT_FOUND' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: promise resolved "undefined" instead of rejecting | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: COMMAND_CONFLICT | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: SMALL_TRIP_FORBIDDEN | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'synthetic rollback' but got 'new row violates row-level security p…' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: new row violates row-level security policy for table "provider_event_inbox" | 1 | The proposed-row policy on provider_event_inbox refused the write. |
| error: new row violates row-level security policy for table "merchant" | 1 | The proposed-row policy on merchant refused the write. |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: promise rejected "Error: UNAUTHENTICATED { code: 'UNAU…' }" instead of resolving | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'RECOVERY_CASE_NOT_FOUND' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'IDEMPOTENCY_PAYLOAD_CONFLICT' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: synthetic live job required | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: cannot alter type of a column used in a policy definition | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: Dispatch did not block behind contractor revocation | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected [Function] to throw error including 'synthetic failure' but got 'new row violates row-level security p…' | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected error: JOB_NOT_FOUND { …(15) } to match object { code: '23505' } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| error: WORM_REFUSED | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 | The diagnostic is secondary or shared across routes. The first refusing SQL operation remains unconfirmed. |

The 43 other failed files without a failed assertion reported 18 JOB_PARTIES_REQUIRED, seven NOT_FOUND, five job RLS violations, one action_outbox RLS violation, one COMMAND_CONFLICT, one FORBIDDEN, one undefined result, and nine without a first diagnostic. The 21 work-order setup failures are listed below. Vitest also recorded one unhandled watchdog rejection.

## r5 first complete PostgreSQL run

The first repair round ran every database test file on embedded PostgreSQL 16.10. It reported 493 passing and 385 failing files out of 878. The 8,011 tests included 4,919 passed, 2,405 failed, 668 skipped and 19 todo. The failed assertions included 842 direct traces through the held work-order fixture and one missing `pg_dump`. The remaining 1,562 assertion failures and 26 setup-only failures require further repair. Vitest also reported an unhandled watchdog transition refusal and two PostgreSQL connection-termination exceptions.

The table follows the original r4 failing assertions by file and test name. A test may expose a different failure after its first blocker is repaired.

| r4 diagnostic | r4 failures | Passed in round one | Failed in round one | Skipped or absent |
| --- | ---: | ---: | ---: | ---: |
| error: JOB_PARTIES_REQUIRED | 1081 | 512 | 568 | 1 |
| error: JOB_NOT_FOUND | 304 | 6 | 298 | 0 |
| Assertion mismatch | 90 | 3 | 87 | 0 |
| error: NOT_FOUND | 59 | 23 | 36 | 0 |
| error: CUSTOMER_REFUSED | 55 | 0 | 55 | 0 |
| Error: RECOVERY_REVIEWER_FORBIDDEN | 49 | 9 | 40 | 0 |
| error: new row violates row-level security policy for table "fee_reservation_book" | 39 | 0 | 39 | 0 |
| error: SSO_REQUIRED_FORBIDDEN | 38 | 32 | 6 | 0 |
| error: new row violates row-level security policy for table "evidence_upload" | 37 | 0 | 37 | 0 |
| error: new row violates row-level security policy for table "membership" | 33 | 0 | 33 | 0 |
| PracticeFeedRepositoryError: PRACTICE_FEED_FORBIDDEN | 19 | 0 | 19 | 0 |
| TypeError: Cannot read properties of undefined (reading 'id') | 18 | 0 | 18 | 0 |
| error: job not found | 17 | 0 | 17 | 0 |
| error: new row violates row-level security policy for table "audit_event" | 17 | 1 | 16 | 0 |
| OidcError: OIDC_REFUSED | 16 | 0 | 16 | 0 |
| Error: UNAUTHENTICATED | 13 | 0 | 13 | 0 |
| Error: promise rejected "SsoError: SSO_FORBIDDEN { code: 'SSO…' }" instead of resolving | 13 | 0 | 13 | 0 |
| error: new row violates row-level security policy for table "action_outbox" | 12 | 0 | 12 | 0 |
| SsoError: SSO_FORBIDDEN | 9 | 0 | 9 | 0 |
| error: UNAUTHENTICATED | 9 | 0 | 9 | 0 |
| error: new row violates row-level security policy for table "input_event" | 9 | 0 | 9 | 0 |
| WormCommandError: WORM_REFUSED | 7 | 0 | 7 | 0 |
| error: EMERGENCY_REFUSED | 7 | 0 | 7 | 0 |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 6 | 0 | 6 | 0 |
| Error: ACCESS_REFUSED | 5 | 0 | 5 | 0 |
| Error: Synthetic tenant key registry operation refused | 5 | 0 | 5 | 0 |
| WatchdogError: JOB_NOT_LIVE | 5 | 5 | 0 | 0 |
| error: FORBIDDEN | 5 | 0 | 5 | 0 |
| error: INVALID_TRANSITION | 5 | 0 | 5 | 0 |
| error: new row violates row-level security policy for table "job" | 5 | 0 | 5 | 0 |
| Error: NOT_FOUND | 4 | 3 | 1 | 0 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 4 | 0 | 4 | 0 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 | 1 | 3 | 0 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 | 0 | 4 | 0 |
| error: new row violates row-level security policy for table "account" | 4 | 1 | 3 | 0 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 | 0 | 3 | 0 |
| Error: promise rejected "error: SSO_REQUIRED_FORBIDDEN { …(15) }" instead of resolving | 3 | 3 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 | 0 | 3 | 0 |
| Error: FORBIDDEN | 2 | 0 | 2 | 0 |
| Error: expected Error: RECOVERY_REVIEWER_FORBIDDEN { code: '…' } to match object { Object (code) } | 2 | 0 | 2 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_SOURCE_CONFLICT' but got 'cannot execute INSERT in a read-only …' | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'JOB_NOT_FOUND' | 2 | 0 | 2 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_SOURCE_NOT_RECOGNISED' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 2 | 0 | 2 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23503' } | 2 | 1 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 | 0 | 2 | 0 |
| Error: jobguard_session_lookup does not have the required least-privilege posture | 2 | 0 | 2 | 0 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 2 | 0 | 2 | 0 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 | 0 | 2 | 0 |
| TypeError: Cannot read properties of undefined (reading 'revision') | 2 | 0 | 2 | 0 |
| error: STALE_SSO_REQUIRED | 2 | 0 | 2 | 0 |
| error: cannot execute INSERT in a read-only transaction | 2 | 1 | 1 | 0 |
| error: invalid reversal | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "capture_source" | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 2 | 0 | 2 | 0 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 | 0 | 1 | 0 |
| Error: Dispatch did not block behind contractor revocation | 1 | 0 | 1 | 0 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: FINAL_CHECK_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: MEMBERSHIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: STACK_TRACE_ERROR | 1 | 0 | 1 | 0 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 | 0 | 1 | 0 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_DEPENDENCY_HELD' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'IDEMPOTENCY_PAYLOAD_CONFLICT' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'JOB_NOT_LIVE' but got 'JOB_NOT_FOUND' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'NOT_FOUND' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_CASE_NOT_FOUND' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'REQUEST_BINDING_REFUSED' but got 'jobguard_session_lookup does not have…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'TEST-WORKER-pending' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'UNAUTHENTICATED' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'fixture audit failure' but got 'new row violates row-level security p…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'rollback' but got 'new row violates row-level security p…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'synthetic failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic migration failure' but got 'jobguard_session_lookup does not have…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'synthetic rollback' but got 'new row violates row-level security p…' | 1 | 0 | 1 | 0 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 1 | 0 | 1 | 0 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 | 0 | 1 | 0 |
| Error: expected error: JOB_NOT_FOUND { …(15) } to match object { code: '23505' } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { Object (code) } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 | 0 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'AGREEMENT_INELIGIBLE' } | 1 | 0 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'COLLECTION_REFUSED' } | 1 | 0 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { …(2) } | 1 | 0 | 1 | 0 |
| Error: expected error: query returned no rows { …(15) } to match object { code: '23514' } | 1 | 0 | 1 | 0 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 | 0 | 1 | 0 |
| Error: promise rejected "Error: UNAUTHENTICATED { code: 'UNAU…' }" instead of resolving | 1 | 0 | 1 | 0 |
| Error: promise resolved "undefined" instead of rejecting | 1 | 0 | 1 | 0 |
| ExtraPersistenceError: NOT_FOUND | 1 | 0 | 1 | 0 |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 1 | 0 | 1 | 0 |
| TypeError: Cannot convert undefined or null to object | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'connect') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'identity_user_id') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 | 0 | 1 | 0 |
| error: COMMAND_CONFLICT | 1 | 0 | 1 | 0 |
| error: SMALL_TRIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| error: STALE_REVISION | 1 | 0 | 1 | 0 |
| error: WORM_REFUSED | 1 | 0 | 1 | 0 |
| error: cannot alter type of a column used in a policy definition | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "merchant" | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "provider_event_inbox" | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "scope_identity" | 1 | 0 | 1 | 0 |
| error: permission denied for table jobguard_schema_migration | 1 | 0 | 1 | 0 |
| error: synthetic live job required | 1 | 0 | 1 | 0 |

The first-round PostgreSQL command was:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=4 --passWithNoTests --exclude '**/lp11-proof-capture.tmp.integration.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-db-results.json
```

## r5 repairs after the first full run

- Administrative job maintenance reads the exact job and its recorded party revisions for the duration of the trigger. Evidence invalidation derives the job from the stored evidence object before checking certification and invoice history.
- Sign-in authorizes invitations, OIDC requests and customer portal grants through stored session or grant identifiers. Customer portal delegation stays on the exact job and command. The credential reader uses the nullable LP-6 tenant accessor and leaves the private LP-6e presence helper's executor list intact.
- Shadow detection, disclosure and emergency reads bind their stored synthetic job through the dedicated worker or support login. Its runtime reader consumes a one-use, job-scoped permit. A later binding to a different tenant closes the earlier read permit in the same transaction. A connection reused after commit has no tenant authority.
- Recovery delivery reads the approved case and its job's immutable sources after the committed outbox signal, worker claim and stored approval agree. The additional visibility applies to `USING` only.
- Test fixtures that only seed data now use their existing administrative connection or the exact persisted fixture member. The held work-order fixture and its pins remain byte-identical.

## r5 focused validation

The latest SQL and fixtures passed 126 PostgreSQL tests across the protected tenant policy, request binding, worker login, customer message and exact migration upgrade suites. Another 32 PostgreSQL tests passed across shadow detection, shadow persistence, trial admission and trial Final Check. The previous focused recovery worker and operative sign-in run passed both selected cases. The latest catalogue recording contains 1,323 LP-0 changes, 719 upgrade changes and 623 policy changes.

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/migration-proof-loader.test.ts test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/lp-10-worker-login.integration.test.ts test/lp6a-binding.integration.test.ts test/customer-portal-message.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/shadow-detection.integration.test.ts test/shadow-persistence.integration.test.ts test/free-first-job-admission.integration.test.ts test/free-first-job-final-check.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp6e-audit.integration.test.ts test/customer-signin.integration.test.ts -t 'commits recovery message outbox success|operative cannot issue'
```

The latest commercial guard CLIs each returned zero diagnostics and all 253 guard tests passed. All 3,618 web unit tests passed across 252 files. The workspace typecheck passed all seven tasks.

```sh
node tools/commercial-integrity-current-source-guard.mjs
node tools/commercial-integrity-boundary.mjs
node --test --test-concurrency=1 tools/commercial-integrity-{current-source-guard,boundary}.test.mjs
pnpm typecheck
pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-main-final-web-results.json
```

The latest complete API run reported 4,507 passed and two failed across 261 files. Both failures point to the inherited LP-10 callback at `packages/db/src/demo-seed.ts:107` in the pinned context scanner. The two previously blocked shadow isolation files passed all 25 tests after their fixtures bound the exact cloned job under the dedicated worker role. Their application and audit trace comparisons remain exact. The API runner now loads the existing worker role fixture by default. The full command used an equivalent temporary config during verification.

```sh
pnpm --filter @jobguard/api exec vitest run src --config /workspace/work/lp11-r5-main-api-vitest.config.mts --maxWorkers=2 --testTimeout=30000 --exclude '**/*.integration.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-main-final-api-results.json
pnpm --filter @jobguard/api exec vitest run src/final-account-lock.isolation.test.ts src/shadow-isolation.application.test.ts --config /workspace/work/lp11-r5-main-api-vitest.config.mts --maxWorkers=1 --testTimeout=30000
pnpm --filter @jobguard/api exec vitest run src/recovery-attribution.http.test.ts --maxWorkers=1
pnpm --filter @jobguard/api openapi:check
```

The first complete database result is the recorded before-and-after checkpoint. Two superseded concurrent snapshots were interrupted to free CPU for the pushed revision's full run.

Some inherited expectations still require the retired setting. The LP-6e tests for generic unbound audit writes supply no protected tenant authority, and the identity and evidence-pack tests expect a malformed unbound setting to raise `22P02`. The protected policy leaves those requests unscoped. These cases count as failures outside the held work-order fixture.

## r5 intermediate full PostgreSQL result

All 878 files completed on PostgreSQL 16.10. 547 files passed and 331 failed. The 8,012 tests included 5,834 passed, 1,627 failed, 532 skipped and 19 todo. Vitest recorded 3 unhandled errors.

The failure count contains 842 direct held-fixture assertions and 1 missing pg_dump assertion. Another 21 files stopped during setup at the held fixture. The other 784 failed assertions and 13 setup-only failures keep LP-11 RED.

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=4 --passWithNoTests --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-main-final-db-results.json
```

The table follows original r4 non-held assertion failures by file and test name. A row still failing can have reached a different failure in the later code.

| r4 diagnostic | r4 failures | Passed in final run | Failed in final run | Skipped or absent |
| --- | ---: | ---: | ---: | ---: |
| error: JOB_PARTIES_REQUIRED | 1081 | 733 | 347 | 1 |
| error: JOB_NOT_FOUND | 304 | 281 | 23 | 0 |
| Assertion mismatch | 90 | 18 | 72 | 0 |
| error: NOT_FOUND | 59 | 32 | 27 | 0 |
| error: CUSTOMER_REFUSED | 55 | 55 | 0 | 0 |
| Error: RECOVERY_REVIEWER_FORBIDDEN | 49 | 49 | 0 | 0 |
| error: new row violates row-level security policy for table "fee_reservation_book" | 39 | 38 | 0 | 1 |
| error: SSO_REQUIRED_FORBIDDEN | 38 | 32 | 6 | 0 |
| error: new row violates row-level security policy for table "evidence_upload" | 37 | 37 | 0 | 0 |
| error: new row violates row-level security policy for table "membership" | 33 | 33 | 0 | 0 |
| PracticeFeedRepositoryError: PRACTICE_FEED_FORBIDDEN | 19 | 19 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'id') | 18 | 0 | 18 | 0 |
| error: job not found | 17 | 0 | 17 | 0 |
| error: new row violates row-level security policy for table "audit_event" | 17 | 1 | 16 | 0 |
| OidcError: OIDC_REFUSED | 16 | 16 | 0 | 0 |
| Error: UNAUTHENTICATED | 13 | 0 | 13 | 0 |
| Error: promise rejected "SsoError: SSO_FORBIDDEN { code: 'SSO…' }" instead of resolving | 13 | 13 | 0 | 0 |
| error: new row violates row-level security policy for table "action_outbox" | 12 | 1 | 11 | 0 |
| SsoError: SSO_FORBIDDEN | 9 | 6 | 3 | 0 |
| error: UNAUTHENTICATED | 9 | 1 | 8 | 0 |
| error: new row violates row-level security policy for table "input_event" | 9 | 0 | 9 | 0 |
| WormCommandError: WORM_REFUSED | 7 | 0 | 7 | 0 |
| error: EMERGENCY_REFUSED | 7 | 0 | 7 | 0 |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 6 | 0 | 6 | 0 |
| Error: ACCESS_REFUSED | 5 | 0 | 5 | 0 |
| Error: Synthetic tenant key registry operation refused | 5 | 0 | 5 | 0 |
| WatchdogError: JOB_NOT_LIVE | 5 | 5 | 0 | 0 |
| error: FORBIDDEN | 5 | 2 | 3 | 0 |
| error: INVALID_TRANSITION | 5 | 0 | 5 | 0 |
| error: new row violates row-level security policy for table "job" | 5 | 0 | 5 | 0 |
| Error: NOT_FOUND | 4 | 3 | 1 | 0 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 4 | 0 | 4 | 0 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 | 1 | 3 | 0 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 | 0 | 4 | 0 |
| error: new row violates row-level security policy for table "account" | 4 | 1 | 3 | 0 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 | 0 | 3 | 0 |
| Error: promise rejected "error: SSO_REQUIRED_FORBIDDEN { …(15) }" instead of resolving | 3 | 3 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 | 0 | 3 | 0 |
| Error: FORBIDDEN | 2 | 0 | 2 | 0 |
| Error: expected Error: RECOVERY_REVIEWER_FORBIDDEN { code: '…' } to match object { Object (code) } | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_SOURCE_CONFLICT' but got 'cannot execute INSERT in a read-only …' | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'JOB_NOT_FOUND' | 2 | 0 | 2 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_SOURCE_NOT_RECOGNISED' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 2 | 2 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23503' } | 2 | 1 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 | 0 | 2 | 0 |
| Error: jobguard_session_lookup does not have the required least-privilege posture | 2 | 2 | 0 | 0 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 2 | 1 | 1 | 0 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 | 0 | 2 | 0 |
| TypeError: Cannot read properties of undefined (reading 'revision') | 2 | 2 | 0 | 0 |
| error: STALE_SSO_REQUIRED | 2 | 0 | 2 | 0 |
| error: cannot execute INSERT in a read-only transaction | 2 | 1 | 1 | 0 |
| error: invalid reversal | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "capture_source" | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 2 | 0 | 2 | 0 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 | 0 | 1 | 0 |
| Error: Dispatch did not block behind contractor revocation | 1 | 0 | 1 | 0 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: FINAL_CHECK_FORBIDDEN | 1 | 1 | 0 | 0 |
| Error: MEMBERSHIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: STACK_TRACE_ERROR | 1 | 0 | 1 | 0 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 | 0 | 1 | 0 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_DEPENDENCY_HELD' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'IDEMPOTENCY_PAYLOAD_CONFLICT' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_NOT_LIVE' but got 'JOB_NOT_FOUND' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'NOT_FOUND' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_CASE_NOT_FOUND' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'REQUEST_BINDING_REFUSED' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'TEST-WORKER-pending' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'UNAUTHENTICATED' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'fixture audit failure' but got 'new row violates row-level security p…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'rollback' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic migration failure' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic rollback' but got 'new row violates row-level security p…' | 1 | 0 | 1 | 0 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 1 | 0 | 1 | 0 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 | 0 | 1 | 0 |
| Error: expected error: JOB_NOT_FOUND { …(15) } to match object { code: '23505' } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { Object (code) } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 | 0 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'AGREEMENT_INELIGIBLE' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'COLLECTION_REFUSED' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: query returned no rows { …(15) } to match object { code: '23514' } | 1 | 1 | 0 | 0 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 | 0 | 1 | 0 |
| Error: promise rejected "Error: UNAUTHENTICATED { code: 'UNAU…' }" instead of resolving | 1 | 0 | 1 | 0 |
| Error: promise resolved "undefined" instead of rejecting | 1 | 0 | 1 | 0 |
| ExtraPersistenceError: NOT_FOUND | 1 | 0 | 1 | 0 |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 1 | 1 | 0 | 0 |
| TypeError: Cannot convert undefined or null to object | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'connect') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'identity_user_id') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 | 0 | 1 | 0 |
| error: COMMAND_CONFLICT | 1 | 0 | 1 | 0 |
| error: SMALL_TRIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| error: STALE_REVISION | 1 | 1 | 0 | 0 |
| error: WORM_REFUSED | 1 | 0 | 1 | 0 |
| error: cannot alter type of a column used in a policy definition | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "merchant" | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "provider_event_inbox" | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "scope_identity" | 1 | 0 | 1 | 0 |
| error: permission denied for table jobguard_schema_migration | 1 | 1 | 0 | 0 |
| error: synthetic live job required | 1 | 0 | 1 | 0 |

### Diagnostics outside the hold in the final full run

| First diagnostic | Failed assertions |
| --- | ---: |
| Assertion mismatch | 129 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 86 |
| error: INVALID_TRANSITION | 66 |
| Error: FINAL_CHECK_PENDING | 52 |
| error: job not found | 46 |
| error: new row violates row-level security policy for table "extra_origin" | 22 |
| error: new row violates row-level security policy for table "recovery_attribution_revision" | 21 |
| error: new row violates row-level security policy for table "audit_event" | 20 |
| TypeError: Cannot read properties of undefined (reading 'id') | 20 |
| error: new row violates row-level security policy for table "trial_admission" | 19 |
| error: new row violates row-level security policy for table "input_event" | 18 |
| error: function app.lp11_bind_shadow_job(unknown, unknown) does not exist | 17 |
| error: new row violates row-level security policy for table "action_outbox" | 14 |
| error: FORBIDDEN | 13 |
| Error: UNAUTHENTICATED | 13 |
| Error: STACK_TRACE_ERROR | 10 |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 9 |
| error: UNAUTHENTICATED | 8 |
| error: EMERGENCY_REFUSED | 7 |
| WormCommandError: WORM_REFUSED | 7 |
| error: new row violates row-level security policy for table "accounting_observation_receipt" | 6 |
| error: new row violates row-level security policy for table "scope_identity" | 6 |
| error: COMMAND_CONFLICT | 6 |
| error: FINAL_CHECK_FORBIDDEN | 6 |
| error: NOT_FOUND | 5 |
| error: new row violates row-level security policy for table "evidence_upload" | 5 |
| TypeError: Cannot read properties of undefined (reading 'hash') | 5 |
| Error: ACCESS_REFUSED | 5 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 5 |
| Error: Synthetic tenant key registry operation refused | 5 |
| Error: MEMBERSHIP_FORBIDDEN | 4 |
| error: JOB_SOURCE_FORBIDDEN | 4 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 3 |
| Error: expected error: FORBIDDEN { length: 144, …(14) } to match object { code: '55000', …(1) } | 3 |
| error: FINAL_ACCOUNT_LOCK_REQUIRED | 3 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 |
| Error: promise resolved "undefined" instead of rejecting | 3 |
| error: new row violates row-level security policy for table "job" | 3 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 |
| MeterLifecyclePersistenceError: METER_FORBIDDEN | 3 |
| error: new row violates row-level security policy for table "job_activation_terms" | 3 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 |
| error: new row violates row-level security policy for table "account" | 3 |
| Error: expected error: test upload not found { …(15) } to match object { code: '42501', …(1) } | 3 |
| error: new row violates row-level security policy for table "capture_source" | 2 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 |
| TypeError: Cannot read properties of undefined (reading 'reviewRequired') | 2 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_NOT_COMPLETE' but got 'FINAL_ACCOUNT_LOCK_REQUIRED' | 2 |
| error: DISCLOSURE_TERMS_NOT_ACCEPTED | 2 |
| error: SMALL_TRIP_FORBIDDEN | 2 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 |
| error: invalid reversal | 2 |
| Error: FORBIDDEN | 2 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 2 |
| error: STALE_SSO_REQUIRED | 2 |
| Error: promise rejected "Error: MEMBERSHIP_FORBIDDEN { …(1) }" instead of resolving | 2 |
| Error: AUDIT_EXPORT_CHECKPOINT_REQUIRED | 1 |
| TypeError: Cannot convert undefined or null to object | 1 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 |
| Error: expected [Function] to throw error including 'CIS_FIXTURE_CONFLICT' but got 'CIS_FIXTURE_NOT_FOUND' | 1 |
| error: canceling statement due to statement timeout | 1 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 1 |
| Error: expected [Function] to throw error including 'fixture audit failure' but got 'new row violates row-level security p…' | 1 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23503' } | 1 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 |
| Error: Command failed: /workspace/.jobguard-runtime/node_modules/node/bin/node --input-type=module -e import pg from 'pg'; const v=JSON.parse(process.env.DD_FIXTURE); const p=new pg.Pool(v.config); try { const c=await p.connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('app.tenant_id',$1,true)",[v.tenant]); await c.query('SELECT app.direct_debit_fixture($1,$2,$3::jsonb,$4::jsonb,$5::uuid)',[v.tenant,'mandate',JSON.stringify(v.binding),JSON.stringify(v.event),null]); await c.query('COMMIT'); } finally { c.release(); } } finally { await p.end(); } | 1 |
| error: DD_NOT_FOUND | 1 |
| Error: promise resolved "'<uuid>'" instead of rejecting | 1 |
| Error: promise resolved "Result{ command: 'INSERT', …(9) }" instead of rejecting | 1 |
| ExtraPersistenceError: NOT_FOUND | 1 |
| TypeError: Cannot read properties of undefined (reading 'current_revision_id') | 1 |
| Error: expected error: DISCLOSURE_TERMS_NOT_ACCEPTED { …(15) } to match object { code: '23503' } | 1 |
| Error: FINAL_CHECK_FORBIDDEN | 1 |
| error: new row violates row-level security policy for table "trial_identity_snapshot" | 1 |
| error: TRIAL_IDENTITY_REQUIRED | 1 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 |
| error: new row violates row-level security policy for table "evidence_link" | 1 |
| error: REQUEST_BINDING_REFUSED | 1 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 |
| Error: promise resolved "{ …(3) }" instead of rejecting | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'FINAL_CHECK_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'Fictional transaction failure' but got 'CAPACITY_ADMISSION_UNAVAILABLE' | 1 |
| Error: expected [Function] to throw error including 'synthetic rollback' but got 'new row violates row-level security p…' | 1 |
| error: new row violates row-level security policy for table "provider_event_inbox" | 1 |
| error: new row violates row-level security policy for table "merchant" | 1 |
| error: new row violates row-level security policy for table "watchdog_command_identity" | 1 |
| EvidencePackSourceError: EVIDENCE_PACK_CASE_NOT_FOUND | 1 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 |
| Error: expected 'failed' to be 'completed' // Object.is equality | 1 |
| Error: expected [Function] to throw error including 'publication fault' but got 'FINAL_CHECK_PENDING' | 1 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_PENDING' | 1 |
| Error: expected [Function] to throw error including 'lost publication response' but got 'FINAL_CHECK_PENDING' | 1 |
| Error: promise rejected "Error: UNAUTHENTICATED { code: 'UNAU…' }" instead of resolving | 1 |
| Error: expected [Function] to throw error matching /resolved/u but got 'expected error: FINAL_ACCOUNT_LOCK_RE…' | 1 |
| Error: expected [Function] to throw error matching /foreign key constraint/u but got 'new row violates row-level security p…' | 1 |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 1 |
| error: synthetic live job required | 1 |
| error: cannot alter type of a column used in a policy definition | 1 |
| error: RETENTION_NOT_FOUND | 1 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 |
| Error: Dispatch did not block behind contractor revocation | 1 |
| error: SSO_REQUIRED_FORBIDDEN | 1 |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 |
| error: FINAL_CHECK_LOCK_BINDING_INVALID | 1 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 |
| Error: expected Error: MEMBERSHIP_FORBIDDEN { …(1) } to match object { code: 'JOB_NOT_FOUND' } | 1 |
| error: WORM_REFUSED | 1 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 |

### Files that failed during setup outside the hold

- `test/UIWIRE-10.integration.test.ts` (INVALID_TRANSITION)
- `test/UIWIRE-11.integration.test.ts` (INVALID_TRANSITION)
- `test/job-sources-authority.integration.test.ts` (<no diagnostic>)
- `test/job-sources-isolation.integration.test.ts` (<no diagnostic>)
- `test/later-recovery-message-attempt.integration.test.ts` (REQUEST_BINDING_REFUSED)
- `test/lp1-membership-account.integration.test.ts` (<no diagnostic>)
- `test/managed-recovery.integration.test.ts` (COMMAND_CONFLICT)
- `test/merchant-ingestion.integration.test.ts` (EVIDENCE_PACK_CASE_NOT_FOUND)
- `test/outbox-discovery.integration.test.ts` (new row violates row-level security policy for table "action_outbox")
- `test/recovery-follow-up.integration.test.ts` (job not found)
- `test/recovery-messages.integration.test.ts` (REQUEST_BINDING_REFUSED)
- `test/recovery-record-immutable.integration.test.ts` (job not found)
- `test/shadow-demo-guide-outside.integration.test.ts` (new row violates row-level security policy for table "shadow_commercial_signal")

### Named exceptions in the final full run

- `test/lp6a-practice-restore.integration.test.ts` — upgrades dark, round-trips a logical binding-table dump into a fresh cluster and rejects carried rows even at a colliding xid8

The held source trace was the customer insert at `packages/db/src/work-order-fixtures.ts:71`.

<details>
<summary>842 failed assertions and 21 setup files with the direct held-fixture trace</summary>

- Setup in `test/contractor-billing-allocation.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/contractor-billing-export.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/contractor-billing-import.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/contractor-billing-replay.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/contractor-full-demo-package.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/duplicate-unlink-reopens-request.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/enterprise-dashboard-plan.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/extra-approval-authority.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/extra-approval-chain.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/extra-approval-timing.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/extra-client-session.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/extra-evidence-pack-timing.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/extra-evidence-pack-writer.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/extra-price-permission-order.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/extra-price-rules.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/extra-proceed.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/site-extra-authority.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/site-extra-evidence-routines.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/site-extra-pricing-basis.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/site-jobs-scope.integration.test.ts` (new row violates row-level security policy for table "customer")
- Setup in `test/site-visit-authority.integration.test.ts` (new row violates row-level security policy for table "customer")

**`test/canonical-revise-duplicate-guard.integration.test.ts`**

- does not treat a duplicate-dismissed pending request as an approved duplicate
- negative control: removing the check in a scratch SQL copy breaks the refusal assertion and reproduces the silent drop
- preserves first pricing, revision and subsequent re-pricing without active links
- refuses canonical revision without changing either approved extra or billing, then permits the same command after unlink

**`test/cloudflare-northside-pool.integration.test.ts`**

- LATER-SAFETY-141: one client times out under the seed lock; the Cloudflare pool stores the complete Northside seed

**`test/command-replay-contract.integration.test.ts`**

- /api/customer-portal/extra-approvals: client decision replays the first result and conflicts across payload, job and kind
- ResolveDuplicateCandidates replays one stored result and refuses changed intent

**`test/connector-billing-status-promotion.integration.test.ts`**

- links a completed human ENT-6 paid import once, including concurrent replay, with no monetary writes
- links billed to a human invoiced fact once without monetary effects
- links reversed to a human credited fact once without monetary effects
- links reversed to a human payment_reversed fact once without monetary effects
- negative control: equality refuses billed -> invoiced and rollback restores the pair
- negative control: equality refuses reversed -> credited and rollback restores the pair
- negative control: equality refuses reversed -> payment_reversed and rollback restores the pair
- negative control: restoring the original refusal makes a valid link fail (transaction rolled back)
- preserves authority, foreign-import and incomplete-import refusals for billed -> invoiced
- preserves authority, foreign-import and incomplete-import refusals for reversed -> credited
- preserves authority, foreign-import and incomplete-import refusals for reversed -> payment_reversed
- rechecks finance authority on new links and replay, and rejects forged result fields
- refuses an incomplete ENT-6 import in the same transaction, before a receipt can complete
- refuses disallowed pair billed -> credited without monetary effects
- refuses disallowed pair billed -> paid without monetary effects
- refuses disallowed pair billed -> payment_reversed without monetary effects
- refuses disallowed pair billed -> rejected without monetary effects
- refuses disallowed pair paid -> credited without monetary effects
- refuses disallowed pair paid -> invoiced without monetary effects
- refuses disallowed pair paid -> payment_reversed without monetary effects
- refuses disallowed pair paid -> rejected without monetary effects
- refuses disallowed pair reversed -> invoiced without monetary effects
- refuses disallowed pair reversed -> paid without monetary effects
- refuses disallowed pair reversed -> rejected without monetary effects
- refuses wrong fact type, source event, foreign import, absent import, and unsupported staged status

**`test/connector-export-delivery-staging.integration.test.ts`**

- ENT-13A-EXPORT-ACK RED staged partner acknowledgements stages once, preserves the first receipt across retries/rotation, conflicts on changed payload and changes no export/billing rows

**`test/connector-promotion.integration.test.ts`**

- connector role cannot execute promotion or reach origin, prices, approvals or statements
- direct SQL cannot substitute a command id or forge an import effect
- does not restore materials visibility for supervisors, unauthorized/revoked members, foreign sessions or mismatched requests
- hides foreign/altered event identities, refuses removed members and unauthorized members without writes
- imports exactly ENT-2 generated baseline prices, replays once, and keeps the connector receipt staged
- imports one materials fact through the existing authority, without confirming a prompt
- keeps owner and finance mixed lists available when materials is closed, without writes or selected/replay authority
- keeps owner and finance mixed lists available when materials is non-ordered, without writes or selected/replay authority
- negative control: reverting only the exact JOB_NOT_LIVE skip breaks the closed-job list; rollback restores it
- omits a materials candidate with no target job, while selected reads and recording retain their refusal
- promotion-record failure rolls back orders, revisions, prices, materials and every import audit
- refuses a tenant-B principal in a tenant-A promotion transaction before importing or writing either tenant
- rethrows unrelated P0001, near-match messages and other SQLSTATEs from materials authority
- unknown fixture labels and billing composition holds write nothing
- uses the existing ENT-2 revision rules and never reimports a prior event after a later revision

**`test/contractor-billing-delivery.integration.test.ts`**

- E6-23 E6-24 outcome_unknown delivery is reconciled, never blindly retried
- E6-23 wrong content hash refuses before creating durable delivery
- E6-24 an interrupted claim is inspected as unknown and reconciliation never sends
- E6-25 download retrieves only persisted authorized bytes after the fake action succeeds
- LATER-SAFETY-81 cancelled allows a fresh command while both command replays retain their results
- LATER-SAFETY-81 dead_letter allows a fresh command while both command replays retain their results
- LATER-SAFETY-81 lapsed pending approval allows fresh delivery but remains unclaimable
- LATER-SAFETY-81 lapsed retryable approval allows fresh delivery but remains unclaimable
- LATER-SAFETY-81 racing delivery approvals queue exactly one outbox action
- LATER-SAFETY-81 refuses another delivery for every sendable or uncertain outbox state without writes
- M0-13a paused contractor delivery keeps its queued artifact and records no attempt or send

**`test/contractor-billing-import-failure.integration.test.ts`**

- LATER-SAFETY-152 real PostgreSQL atomic import failure keeps a genuinely empty first invoice, missing prerequisites, ambiguous and quarantined facts successful
- LATER-SAFETY-152 real PostgreSQL atomic import failure keeps a policy-held payment held while preserving the last valid projection
- LATER-SAFETY-152 real PostgreSQL atomic import failure preserves legitimate credited movement behavior
- LATER-SAFETY-152 real PostgreSQL atomic import failure preserves legitimate payment_reversed movement behavior
- LATER-SAFETY-152 real PostgreSQL atomic import failure preserves legitimate rejected movement behavior
- LATER-SAFETY-152 real PostgreSQL atomic import failure refuses non-finance and foreign tenant/job imports with otherwise valid data and no writes
- LATER-SAFETY-152 real PostgreSQL atomic import failure retains ENT-F2 qualifying principal and the posted 806p fee after a malformed additional movement
- LATER-SAFETY-152 real PostgreSQL atomic import failure rolls back every invoice group, then accepts corrected input with the unconsumed command ID

**`test/contractor-billing-ordering.integration.test.ts`**

- E6-18 E6-20 E6-21 payment before invoice is held then recomputed in a successor run
- E6-19 E6-20 all 24 arrival permutations preserve credits, reversals and exact projections
- r7 E6-16 invalid credited composition remains quarantined in either invoice arrival order
- r7 E6-16 invalid paid composition remains quarantined in either invoice arrival order
- r7 E6-16 invalid payment_reversed composition remains quarantined in either invoice arrival order
- r7 E6-16 invalid rejected composition remains quarantined in either invoice arrival order
- r7 E6-19 E6-20 credited composition preserves exact projection in either invoice arrival order (one import)
- r7 E6-19 E6-20 credited composition preserves exact projection in either invoice arrival order (separate imports)
- r7 E6-19 E6-20 paid composition preserves exact projection in either invoice arrival order (one import)
- r7 E6-19 E6-20 paid composition preserves exact projection in either invoice arrival order (separate imports)
- r7 E6-19 E6-20 payment_reversed composition preserves exact projection in either invoice arrival order (one import)
- r7 E6-19 E6-20 payment_reversed composition preserves exact projection in either invoice arrival order (separate imports)
- r7 E6-19 E6-20 rejected composition preserves exact projection in either invoice arrival order (one import)
- r7 E6-19 E6-20 rejected composition preserves exact projection in either invoice arrival order (separate imports)

**`test/contractor-entitlement-session.integration.test.ts`**

- effective switched member is not replaced by owner

**`test/contractor-job-finish.integration.test.ts`**

- ENT-8a owner contractor job finish rechecks a removed owner's authority before replay
- ENT-8a owner contractor job finish records a finish with disabled agreement without evaluating evidence
- ENT-8a owner contractor job finish records a finish with missing agreement without evaluating evidence
- ENT-8a owner contractor job finish refuses admin for writes and finish-state reads
- ENT-8a owner contractor job finish refuses an open visit and caller-supplied authority/time/check fields
- ENT-8a owner contractor job finish refuses commercial_manager for writes and finish-state reads
- ENT-8a owner contractor job finish refuses finance for writes and finish-state reads
- ENT-8a owner contractor job finish refuses operative for writes and finish-state reads
- ENT-8a owner contractor job finish refuses supervisor for writes and finish-state reads
- ENT-8a owner contractor job finish refuses surveyor for writes and finish-state reads
- ENT-8a owner contractor job finish rejects raw SQL authority fields without creating a finish or receipt
- ENT-8a owner contractor job finish returns the same refusal for foreign, out-of-scope and absent jobs
- ENT-8a owner contractor job finish runs the enabled evaluator, cites stored evidence, immediately surfaces and coalesces without financial or shadow effects
- ENT-8a owner contractor job finish serializes competing finishes and keeps the record private, forced-RLS and immutable
- ENT-8a owner contractor job finish uses the current server agreement and refuses altered ids including on replay

**`test/contractor-party-bind-work-order-only.integration.test.ts`**

- LATER-SAFETY-127 contractor party binding proves mutation sensitivity by removing and restoring the trigger only in this scratch database
- LATER-SAFETY-127 contractor party binding refuses an ordinary draft job at its current revision without changing its parties
- LATER-SAFETY-127 contractor party binding refuses an ordinary quoting job at its current revision without changing its parties

**`test/contractor-retained-read-boundaries.integration.test.ts`**

- reads leave all business rows receipts and audit heads unchanged
- switched operative is never replaced by owner

**`test/contractor-retained-read.integration.test.ts`**

- client and branch scopes remain unchanged
- historical organisation and contracts survive agreement loss
- historical reads survive track change but not revocation
- restricted readers cannot infer administrative activity

**`test/contractor.integration.test.ts`**

- ENT-2 conformance: the work-order import, SoR import, register, batch, revision, assignment, visit, price-list and resident reads agree with the pure role and scope rules, per client in two branches

**`test/customer-signin-lock-order.integration.test.ts`**

- matched extra-approver approval versus xa_withdraw without a barrier: 50 same-job rounds, both winners, one outcome
- matched extra-approver approval versus xa_withdraw: 50 same-job rounds, both lock owners, one outcome

**`test/duplicate-canonical-guard.integration.test.ts`**

- also refuses a logged duplicate into a rejected canonical
- approved-to-approved linking keeps the canonical in the real 0243 billing read
- keeps logged-to-logged linking; active canonical withdrawal rolls back, then succeeds after unlink
- mutation control: removing the link guard admits the refused approved-to-logged command
- mutation control: removing the withdraw guard admits an active canonical withdrawal
- refuses approved duplicate into awaiting_approval canonical without effects
- refuses approved duplicate into logged canonical without effects
- refuses approved duplicate into rejected canonical without effects

**`test/duplicate-unlink-command-binding.integration.test.ts`**

- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL refuses UnlinkDuplicate with a different command in its semantic key
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL refuses UnlinkDuplicate with a different job in its semantic key
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL refuses UnlinkDuplicate with a different link in its semantic key
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL refuses UnlinkDuplicate with a different prefix in its semantic key
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL refuses another processing command by the same actor even with the exact unlink key
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL the same refusal assertion fails with the old unlink branch and the fixed guard is restored
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL the sole unlink writer succeeds end to end and makes the duplicate active again

**`test/enterprise-dashboard-stored.integration.test.ts`**

- catalog enforces FORCE RLS, tenant keys, migration ownership and no raw runtime writes or reads
- stored ENT-6 billed/paid totals conserve full-composition allocation and trace exact run/line facts
- stores immutable history, serializes replay once, reproduces with a new repository instance and requires complete current team coverage

**`test/enterprise-dashboard.authority-race.integration.test.ts`**

- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA1] rechecks an expired stored session despite its previously verified tenant context
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA2 sensitivity] omitting only the dashboard gate makes the lock-order assertion fail
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA2] grant.revoke holds exclusive gate first; waiting dashboard refuses after commit
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA2] membership.revoke holds exclusive gate first; waiting dashboard refuses after commit
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA3] dashboard holds shared gate first; grant.revoke waits until the earlier read completes
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA3] dashboard holds shared gate first; membership.revoke waits until the earlier read completes
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA4] a refused read followed by another tenant on the same backend returns only the second tenant's facts
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA5] reads leave every tenant commercial/audit row unchanged; only the identified revocation writes

**`test/enterprise-dashboard.integration.test.ts`**

- ENT-9B scoped persisted reads [E9-01 E9-03 E9-07] reads command-created captures, current approvals and immutable deadlines; billing stays held
- ENT-9B scoped persisted reads [E9-02] counts command-created active duplicate groups once and restores two captures after an authorized unlink
- ENT-9B scoped persisted reads [E9-08] derives close-out answers from visit commands and does not change job state
- ENT-9B scoped persisted reads [E9-09 E9-10 E9-11 E9-13] applies covering dashboard grants and tenant scope before all output
- ENT-9B scoped persisted reads [E9-10 E9-12] a reassigned operative disappears even while the old job remains in scope; unrelated grants cannot supply scope
- ENT-9B scoped persisted reads [E9-12 E9-15] revocation takes effect on the next request and a session cannot choose a foreign context
- ENT-9B scoped persisted reads [E9-14 E9-26 E9-28 E9-31] reads and observations preserve canonical business rows and give runtime no new privilege
- ENT-9B scoped persisted reads [E9D] close-out observations cite only covered visits, are replay-stable and disappear after reassignment
- ENT-9B scoped persisted reads [LATER-SAFETY-22] dashboard and xa_queue share weekend deadlines (legacy snapshot: false)
- ENT-9B scoped persisted reads [LATER-SAFETY-22] dashboard and xa_queue share weekend deadlines (legacy snapshot: true)
- ENT-9B scoped persisted reads [LATER-SAFETY-58] Friday working-day waits show Tuesday at the same London time, matching the queue deadline
- ENT-9B scoped persisted reads [LATER-SAFETY-58] old snapshots without working-day waits retain their elapsed-minute deadline
- [E9E] a billed variation matched to a JobGuard extra has no missing-extra advisory
- [E9E] original orders stay silent and unrelated credits cannot erase a possible variation
- [E9E] unmatched other invoice lines are advisory, scoped, replay-stable and removed by current credits/rejections

**`test/enterprise-fee-command-fixtures.integration.test.ts`**

- ENT-7: rejected amounts contribute zero through real commands, with a qualifying control
- ENT-7: runtime SQL cannot insert fee contributions or journal headers
- ENT-7: the simulated invoice posts exact approved money once and rechecks revoked authority
- ENT-7: unexported amounts contribute zero through real commands, with a qualifying control
- ENT-7: unpaid amounts contribute zero through real commands, with a qualifying control
- ENT-7: withdrawn amounts contribute zero through real commands, with a qualifying control
- ENT-F10: three 5p extras round cumulatively to 2p; largest-remainder trace is 1p/1p/0p by ID
- ENT-F11: Q=15p half-even cumulative fee=2p
- ENT-F11: Q=25p half-even cumulative fee=2p
- ENT-F11: Q=5p half-even cumulative fee=0p
- ENT-F11: two 5p receipts accumulate to 1p rather than rounding each receipt down
- ENT-F1: £150 approved, billed plus VAT and paid yields a 1500p accrual
- ENT-F2: full blended receipt follows 806p with a 1594p delta, never another 2400p
- ENT-F3 / ENT-F12: credit after an approved month compensates next month, preserving the original statement
- ENT-F4: a reversed £180 payment compensates the entire 1500p fee
- ENT-F5: approved and billed caps survive posting
- ENT-F6: approved and billed caps survive posting
- ENT-F7: two billed-and-paid logs reconcile once, retain artifacts and origins, and compensate to one fee
- ENT-F8: office, client instructions and order lines contribute zero even when billed and paid
- ENT-F9: origins either side of a version boundary keep 10% / 8%; a later X credit stays under v1
- ReconcileExportedDuplicate refuses non-live jobs, wrong tenant/session and direct runtime writes
- ReconcileExportedDuplicate retains the earlier agreement when the later log is chosen as canonical
- Self-check: approved statements reject stale credit inputs without changing the locked bill or posting
- Self-check: cross-tenant replay, reads and cross-job duplicate references disclose no foreign data
- Self-check: cumulative approval/credit caps survive signed partial reversals and replay without rounding
- Self-check: posting command IDs bind the exact statement and authorization, including zero-result replays
- Self-check: wrong locked export revision and oversized amounts cannot create fee contributions
- fractional duplicate credit preserves 250000/31 net pence in storage, replay and the authorized hash

**`test/enterprise-fee-derivation.integration.test.ts`**

- ENT-F2 on PostgreSQL: the site extra contributes Q = 250000/31 pence, the order line nothing; 10% rounds half-even to 806p
- an agreement version only takes extras whose origin time selects it
- only finance may derive or read; an unknown session and a missing agreement are refused
- replays and concurrent derivations record once; the same command with a different request conflicts
- the runtime role cannot read or write fee tables directly, and stored rows are immutable even for the owner
- unexported and unpaid extras contribute zero

**`test/enterprise-fee-posting.integration.test.ts`**

- ENT-11b self-attack: a credit after approval blocks posting without changing the approved statement
- ENT-11b self-attack: another company cannot read a statement, derivation or journals, or post its approval
- a reversal after posting becomes a linked compensation on the next month's statement, netting the fee back to zero
- an unchanged next month subtracts prior posted net: zero delta and no new journal
- direct runtime SQL can neither write the fee book nor call its private helper, and journals are immutable
- fresh-key accrual replays append one bound audit per command; same-key retries and forbidden replays append nothing
- posting is refused when the facts move after approval
- posting is refused without approval, with another authorisation, revoked or expired authority, or non-finance
- posts an approved statement once: one balanced accrual of the exact delta; replays and races add nothing
- refuses posting an approved February after March posts, without writing a fee or receipt
- refuses preparing February after the same agreement has a posted March fee
- splits a compensation across outstanding accruals and never offsets the same pence twice
- still posts February then March in order, replays the latest month and posts a later month
- zero-statement replays preserve receipts and append no audit, including fresh-key races and cross-company attacks

**`test/enterprise-fee-production.integration.test.ts`**

- a reversal invalidates stale derivations and yields linked compensation without erasing the original
- direct runtime writes and oversized or mislinked journal attempts cannot exceed the rebuilt amount
- production derive/accrue refuses supplied approvals, flags, tenant references and replays without writes or leaks
- rebuilds exact liability and source attribution; repeated imports/derives and racing posts retain one journal
- two paid 5p extras on different contracts share one cumulative agreement rounding and posting lock

**`test/enterprise-fee-rejected-line.integration.test.ts`**

- R151-ADJUST: credits and reversals cannot revive rejected principal
- R151-COMPENSATE: rejection after approval refuses stale posting; after posting uses linked later-period compensation
- R151-CONTROL: identical unrejected ENT-F2 retains exact principal and fee; another rejected invoice line does not erase it
- R151-IMMUTABLE: runtime cannot insert contributions, and approved statements/journals resist owner edits
- R151-ISOLATION: another job's rejection leaves this job eligible; tenant and finance/session guards remain closed
- R151-MIXED: only the rejected extra is excluded from a mixed invoice
- R151-MUTATION: removing only the exclusion fails the zero-principal assertion; rollback restores it
- R151-REPLAY: rejection changes input hash, exact command/event replay adds no duplicate history
- R151-ZERO: rejection after payment retains allocated cash but charges zero
- R151-ZERO: rejection before payment retains allocated cash but charges zero

**`test/enterprise-fee-statement.integration.test.ts`**

- a dispute closes the revision; preparing again makes the next revision, and only that one can be approved
- approval is refused for a mismatched hash or total, a bad expiry, non-finance, and changed facts
- direct runtime SQL can neither write statement tables, call the private helpers, nor approve with a wrong total
- exact approval creates one Decision, an approved resolution and one exact expiring authorisation
- prepares one revision per unchanged month from the latest derivation; replays return it

**`test/enterprise-live-prompt-access.integration.test.ts`**

- ENT-8A-P persisted prompt access Possible extras lane is supervisor-only, including a covering supervisor not named on the visit
- ENT-8A-P persisted prompt access a revoked persisted session cannot read or mutate
- ENT-8A-P persisted prompt access an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-8A-P persisted prompt access contractor capability loss preserves read-only prompt history and refuses new work
- ENT-8A-P persisted prompt access direct SQL cannot mutate prompt sources, resolutions or settings, even in a valid tenant context
- ENT-8A-P persisted prompt access fresh reads expose a committed prompt; only scoped resolution roles can read its detail
- ENT-8A-P persisted prompt access only finance and owner import materials; import does not grant resolution or lane authority
- ENT-8A-P persisted prompt access revoked grants are rechecked on successful replay and reads
- ENT-8A-P persisted prompt access revoked memberships and unknown sessions cannot reuse historic authority
- ENT-8A-P persisted prompt access same-tenant wrong-job scope and cross-tenant reads refuse identically

**`test/enterprise-live-prompt-commands.integration.test.ts`**

- ENT-8A-P atomic commands confirm a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-8A-P atomic commands confirm a successful no-op keeps its identity
- ENT-8A-P atomic commands confirm an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-8A-P atomic commands confirm replaying a command id returns the first result, never the job's current state
- ENT-8A-P atomic commands confirm the same command id on another job conflicts
- ENT-8A-P atomic commands confirm the same command id with a changed payload conflicts
- ENT-8A-P atomic commands confirmed extras continue through ENT-5 pricing without rewriting origin
- ENT-8A-P atomic commands dismiss a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-8A-P atomic commands dismiss a successful no-op keeps its identity
- ENT-8A-P atomic commands dismiss an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-8A-P atomic commands dismiss replaying a command id returns the first result, never the job's current state
- ENT-8A-P atomic commands dismiss the same command id on another job conflicts
- ENT-8A-P atomic commands dismiss the same command id with a changed payload conflicts
- ENT-8A-P atomic commands dismissal is immutable and exact prompt hash is required
- ENT-8A-P atomic commands evaluate a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-8A-P atomic commands evaluate a successful no-op keeps its identity
- ENT-8A-P atomic commands evaluate an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-8A-P atomic commands evaluate replaying a command id returns the first result, never the job's current state
- ENT-8A-P atomic commands evaluate the same command id on another job conflicts
- ENT-8A-P atomic commands evaluate the same command id with a changed payload conflicts
- ENT-8A-P atomic commands exactly one new origin, capture note and scope identity; no automatic price or approval
- ENT-8A-P atomic commands failed audit rolls source, origin, resolution and receipt back together
- ENT-8A-P atomic commands importMaterials a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-8A-P atomic commands importMaterials a successful no-op keeps its identity
- ENT-8A-P atomic commands importMaterials an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-8A-P atomic commands importMaterials replaying a command id returns the first result, never the job's current state
- ENT-8A-P atomic commands importMaterials the same command id on another job conflicts
- ENT-8A-P atomic commands importMaterials the same command id with a changed payload conflicts
- ENT-8A-P atomic commands raw confirmation still raises PROMPT_ORIGIN_HELD
- ENT-8A-P atomic commands unsupported returns quarantine the comparison and prevent an earlier prompt confirmation
- ENT-8A-P atomic commands work-order prompt receipts still refuse runtime result and identity rewrites

**`test/enterprise-live-prompt-end-check.integration.test.ts`**

- caller completion event rejection a completed visit cannot substitute for authoritative job completion
- caller completion event rejection disabled agreement cannot authorize an end check
- caller completion event rejection missing agreement cannot authorize an end check
- caller completion event rejection wrong-version agreement cannot authorize an end check
- end-check stored rule (a) recheck creates a checked rule (a) prompt and closes owner projection access before replay
- end-check stored rule (a) recheck does not let an unfinished owner finish authorize another job projection
- end-check stored rule (a) recheck finishes without evaluating a recognised off-order observation when the end check is disabled
- end-check stored rule (a) recheck refuses a stored identity/PNG finding mismatch and rolls back the entire finish

**`test/enterprise-live-prompt-office.integration.test.ts`**

- ENT-8A-P office advisory ambiguous exact matches require an explicit same-job existing extra without merging origins
- ENT-8A-P office advisory confirming an exact office match coalesces and creates no origin or scope identity
- ENT-8A-P office advisory reads an honest empty state, paginates without duplicates and rejects invalid bounds/cursors
- ENT-8A-P office advisory real office creation matching dismissed prompts emits one advisory and preserves zero fee eligibility
- ENT-8A-P office advisory real office creation matching surfaced prompts emits one advisory and preserves zero fee eligibility
- ENT-8A-P office advisory rechecks detail roles, tenant/job scope, and revoked grants even for empty jobs

**`test/enterprise-live-prompt-races.integration.test.ts`**

- ENT-8A-P command races b2: concurrent duplicate completions return one result and one closeout answer
- ENT-8A-P command races b2: first completion holds key 417 before the live lock; replay holds only authority and never locks the baseline
- ENT-8A-P command races baseline change races refuse stale binding or preserve the locked baseline
- ENT-8A-P command races confirm/office capture cannot duplicate a prompt origin or change office origin
- ENT-8A-P command races job-leaves-live race never writes after the live guard loses
- ENT-8A-P command races two-connection confirm/confirm produces one resolution and origin
- ENT-8A-P command races two-connection confirm/dismiss produces one final resolution or typed conflict
- ENT-8A-P command races two-connection source replay keeps one source and original result

**`test/enterprise-live-prompt-repository.integration.test.ts`**

- binds runtime-read photo bytes to the current session, job, evidence, hash, version and length
- lists exactly verified uninvalidated same-job completion sources with a narrow shape
- refuses every role refused by the observation command and rechecks revoked grants
- rejects foreign, unknown and uncovered jobs, including another supervisor's job

**`test/enterprise-live-prompt-rules.integration.test.ts`**

- observation command identity and stored PNG provenance a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- observation command identity and stored PNG provenance a successful no-op keeps its identity
- observation command identity and stored PNG provenance an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- observation command identity and stored PNG provenance ordered explicit synonym stays silent and forged tag/hash/version is refused
- observation command identity and stored PNG provenance replaying a command id returns the first result, never the job's current state
- observation command identity and stored PNG provenance rule a reads tags from command-finalized immutable PNG bytes and cites their native hash/version
- observation command identity and stored PNG provenance the same command id on another job conflicts
- observation command identity and stored PNG provenance the same command id with a changed payload conflicts
- persisted deterministic prompt rules a successful no-op keeps its identity
- persisted deterministic prompt rules an observation without immutable verified bytes refuses and leaves no prompt
- persisted deterministic prompt rules closeout confirmation requires explicit work identity and creates no implicit price
- persisted deterministic prompt rules completed visit yes creates a job-wide closeout prompt before the visit transaction commits
- persisted deterministic prompt rules completed visits compare exact server microseconds to immutable contract factor
- persisted deterministic prompt rules materials equality and unknown mappings or units remain silent
- persisted deterministic prompt rules materials strict excess is immediately visible from command-created issue facts
- persisted deterministic prompt rules no answer suppresses closeout and missing factor suppresses visit duration
- persisted deterministic prompt rules same-time contradictory facts quarantine a previously surfaced materials comparison
- persisted deterministic prompt rules source replay deduplicates and changed source identity content conflicts atomically
- persisted deterministic prompt rules unauthorized admin imports have no source or prompt effects
- persisted deterministic prompt rules unauthorized commercial_manager imports have no source or prompt effects
- persisted deterministic prompt rules unauthorized operative imports have no source or prompt effects
- persisted deterministic prompt rules unauthorized read_only imports have no source or prompt effects
- persisted deterministic prompt rules unauthorized supervisor imports have no source or prompt effects
- persisted deterministic prompt rules unauthorized surveyor imports have no source or prompt effects

**`test/evidence-bundle-screen.integration.test.ts`**

- checks actual approvals read-only, preserves absences, and refuses inaccessible/foreign jobs before reading objects

**`test/evidence-bundle.integration.test.ts`**

- LATER-SAFETY-47 Northside follows exact duplicate-link reversals without changing billing
- LATER-SAFETY-47 bundle follows exact duplicate-link reversals without changing billing
- LATER-SAFETY-89 preserves an intact bundle through real export, billed and paid imports and post-approval lifecycle states
- LATER-SAFETY-89 refuses latest billing_rejected even with immutable approval and export facts
- LATER-SAFETY-89 refuses latest credited even with immutable approval and export facts
- joins actual immutable origin, revision, requirement and approval facts; replays deterministically; refuses stale requests and cross-tenant actors

**`test/extra-approval-rules.integration.test.ts`**

- Q04 first receipt wins a same-person repeat, with no second fact or audit, and revoked grants refuse replay
- Q06 thresholds are frozen per rule version; Q16 pricing alone never submits
- Q08 without a backup the mandatory queue stays waiting and overdue, without an escalation fact
- Q11 covered commercial_manager can withdraw an open request, but cannot change its final outcome
- Q11 covered surveyor can withdraw an open request, but cannot change its final outcome

**`test/extra-client-authority-loss.integration.test.ts`**

- A3 control: approver who keeps authority is not over-cancelled; send delivers once and link works
- A8 legacy runtime decide path refuses an unused link after sender grant loss
- Q14 client grant loss cancels pending and retryable sends, preserves decisions and current-authority reads
- Q14 client session has no export action and stores no refusal
- Q14 contractor bundle check returns only verification, and refuses export input
- Q14 membership loss cancels pending and retryable sends, preserves decisions and current-authority reads
- Q14 negative mutation: removing the SQL cancellation makes the cancel case fail
- Q14 sender grant loss cancels pending and retryable sends, preserves decisions and current-authority reads

**`test/extra-client-send-permission-order.integration.test.ts`**

- a bound current operative gets the same refusal for priced, absent and unpriced requests on one valid job, with no effects
- covered commercial_manager sends the exact fake action once; missing and unpriced remain NOT_FOUND
- covered surveyor sends the exact fake action once; missing and unpriced remain NOT_FOUND
- grant revoked cannot gain effects through replay
- membership expired cannot gain effects through replay
- membership revoked cannot gain effects through replay
- refuses uncovered jobs, foreign tenants, spoofed actors, absent binding and expired credentials without effects

**`test/extra-duplicate-candidates.integration.test.ts`**

- ENT-3 relink opposite direction exports once and preserves replay/history
- ENT-3 relink racing unlink serializes to an active fresh link or unresolved candidates
- ENT-3 relink refuses a forged actor, uncovered grant, wrong role and foreign tenant without effects
- ENT-3 relink same direction exports once and preserves replay/history
- ENT-3 reversal never promotes a duplicate-dismissed pending approval to approved
- ENT-3 unlink restores separate approved extras through the existing command and export paths
- accepts both distinct-work reasons and review-changed reopening through the SQL writer
- begins the registered duplicate command with repository-style input
- completes only the exact fresh disposition fact after a processing receipt
- cross-tenant jobs, uncovered grants and wrong roles fail closed
- dismissal is exact, append-only and reversible; replay is inert and export keeps distinct approved lines
- dismisses one group only; every other group still refuses export and concurrent replays create one fact
- independent surveyors and commercial managers may dismiss with a covering grant
- installed routines agree on the UTC day, visit, code, excess-line and canonical matrix
- refuses disposition/reason mismatches without changing receipts, facts, audit or export eligibility
- refuses reporters, pricers, forged actor, foreign tenant, uncovered and wrong roles, with no facts or receipts
- replays pre-lifecycle receipts with their historical digest and refuses changed payloads
- revision changes and a new extra racing dismissal raise the group again and keep export refused
- stale unlinks and linking racing an export cannot export duplicate captures
- table owner cannot truncate append-only duplicate dispositions and all rows remain
- the checked writer creates a lifecycle claim and one command audit, and replays the stored result
- two operatives remain separate and priced; linking and unlinking agree with the export blocker, including replays

**`test/extra-escalation-worker.integration.test.ts`**

- ENT-5 worker discovery, crash rollback, concurrent restart, tenant confinement and alternate revocation

**`test/extra-evidence-packs.integration.test.ts`**

- E5-18 extra sources and shared verifier — issued sources only
- E5-18 tampered stored sources are detected through persisted hashes
- E5-19 evidence lifecycle and confirmation limits — issued sources only
- E5-19 pending rejected foreign and wrong-version source controls refuse
- foreign step sources cannot replace a bound fact, and missing required facts stay incomplete
- requirement, step actors and outcome are exact persisted versioned sources
- withdrawn and rejected requests remain explicit and cannot acquire a later approval

**`test/extra-links.integration.test.ts`**

- ENT-4b immutable links [DW1] all new table rows refuse mutation as runtime and migration owner
- ENT-4b immutable links [DW4a] composite foreign keys reject cross-tenant and same-tenant wrong-job links/evidence
- ENT-4b immutable links [DW4b] either exported endpoint blocks link and unlink, preserving the origin
- ENT-4b immutable links [DW4b] immutable unlink row guards preserve history and allow relink before export; command surface HELD
- ENT-4b immutable links [DW4b] self, chain, cycle, second active link and concurrent chain are refused
- ENT-4b immutable links [DW4c] an instructed revision older than the origin is refused
- ENT-4b immutable links [DW4c] order-line links preserve origin/hash; same/older revision and duplicate use are refused
- ENT-4b immutable links [DW5a] failed link/order seam and deferred missing audit roll back rows and receipts
- ENT-4b immutable links [DW5a] link, raw unlink and order writes roll back at receipt, fact, audit and commit failures
- ENT-4b immutable links [DW6] link audits contain only allowed IDs and hashes
- ENT-4b immutable links [R2] effective origin is independent of canonical choice and uses lower ID on a time tie
- ENT-4b immutable links [R3] later formal instruction leaves one extra and its immutable site origin intact
- ENT-4b immutable links [S1] foreign tenant link/event reads are NOT_FOUND; writes cannot name foreign extras
- ENT-4b immutable links [S4] both link tables and unlink history share xmin with their audit; missing audit fails commit
- ENT-4b immutable links [S4] missing unlink/order audit fails commit with no partial link history

**`test/extra-origin.integration.test.ts`**

- ENT-4b origin persistence [C3] all fixtures are synthetic_demo and every raised identity is a new scope item
- ENT-4b origin persistence [DW1] runtime cannot mutate immutable rows; owner triggers refuse UPDATE and DELETE
- ENT-4b origin persistence [DW2a] all mismatched raising command/kind pairs are refused
- ENT-4b origin persistence [DW2b] receipt actor, processing status and exact semantic identity are required
- ENT-4b origin persistence [DW2c] origin and client capture uniqueness reject second rows with 23505
- ENT-4b origin persistence [DW2d] neither origin column accepts the other track's kinds
- ENT-4b origin persistence [DW3] missing origin fails at commit; SH-1 deferred constraint remains singular
- ENT-4b origin persistence [DW5a] failures at each write, seam, audit and commit leave no facts or receipt
- ENT-4b origin persistence [DW5b] a successful capture retry durably binds its command ID before any reuse
- ENT-4b origin persistence [DW5b] command/capture replay and two-connection retry have one effect; conflicting payloads fail
- ENT-4b origin persistence [DW6] audit uses closed ID/hash keys; capture metadata never appears in audit or errors
- ENT-4b origin persistence [R1] office, instruction, import, parties, unknown commands cannot write or relabel site origins
- ENT-4b origin persistence [R4] earlier small-builder origins survive a later contractor assignment unchanged
- ENT-4b origin persistence [R4] merged legacy origin trigger reads truthfully while command origins stay strict
- ENT-4b origin persistence [R4] merged small-builder capture reads as versioned legacy with unknown identities preserved
- ENT-4b origin persistence [S1] stamped per-call contexts fail closed; other tenant/job reads are NOT_FOUND
- ENT-4b origin persistence [S4] a different tenant's id in the setting at commit is refused, in either letter case
- ENT-4b origin persistence [S4] a non-uuid tenant setting at commit is refused and nothing is written
- ENT-4b origin persistence [S4] a stamped context with an UPPER-CASE tenant id commits a valid extra
- ENT-4b origin persistence [S4] an absent tenant setting at commit is refused and nothing is written
- ENT-4b origin persistence [S4] an empty tenant setting at commit is refused and nothing is written
- ENT-4b origin persistence [S4] both spellings of one tenant identify one extra for one client capture ID
- ENT-4b origin persistence [S4] clearing tenant context after valid origin/event/audit writes refuses commit
- ENT-4b origin persistence [S4] origin requires exact logged and exact hash/command audit in the same transaction
- ENT-4b origin persistence [S4] origin/event/audit share xmin; absent or mismatched audit/logged fact fails at commit
- ENT-4b origin persistence [S5] evidence and excess references preserve job identity and new scope lineage
- ENT-4b origin persistence [S5] grants cover exactly tenant/team/branch/region; visits bind member/job; inactive members fail
- ENT-4b origin persistence [S5] server overwrites authority fields; grants, scope, visits, membership and prompt are guarded
- ENT-4b origin persistence [S6] every stored contractor hash equals the pure mirror with six-digit timestamp text

**`test/extra-queue-approver-eligibility.integration.test.ts`**

- LATER-SAFETY-49 legacy unknown rejection slots stay ineligible, with every fixture guard enabled
- Q04 keeps the same slot visible and approvable on a new revision, but excludes a prior different slot
- a succeeded rejection reserves its slot across revisions without banning same-slot participation
- hides a covered supervisor's own extra but keeps another eligible supervisor's mandatory item
- hides step 1 from the actor who filled step 0, while preserving the next approver
- mutation probe: removing only REUSED_APPROVER makes its queue regression fail
- mutation probe: removing only SELF_APPROVAL makes its queue regression fail
- preserves London deadlines, overdue state and the listed escalation alternates
- preserves scope, tenant, revoked-grant and revoked-member exclusions

**`test/extra-unlink.integration.test.ts`**

- ENT-4c un-link command [D10] typed refusals for an allowed actor, each writing nothing
- ENT-4c un-link command [D11] replay returns the stored result once; two callers produce one un-link
- ENT-4c un-link command [D12] history is preserved, append-only, and a pair can be linked again
- ENT-4c un-link command [D13] refusal after export on either extra
- ENT-4c un-link command [D14] the audit event commits or rolls back with the command
- ENT-4c un-link command [D15] tenant isolation and spelling
- ENT-4c un-link command [D16] nothing else changes
- ENT-4c un-link command [D17] readDuplicateLinks
- ENT-4c un-link command [D18] errors carry codes only
- ENT-4c un-link command [D1] an owner un-links an active link: one un-link row, one completed command receipt, one domain and one checked terminal audit, nothing else
- ENT-4c un-link command [D2] each of the five roles un-links at each scope that covers the job
- ENT-4c un-link command [D3] every role in the merged list is decided, and the four other roles are refused
- ENT-4c un-link command [D4] one of the five roles without a covering grant is refused
- ENT-4c un-link command [D5] a revoked grant or membership is refused, on a new command and on a replay
- ENT-4c un-link command [D6] mixed and foreign actors are refused
- ENT-4c un-link command [D7] a refused caller gets one answer, whatever they name
- ENT-4c un-link command [D8] the write statement carries the rule itself
- ENT-4c un-link command [D9] authority is read from the database at the moment of the command

**`test/financial-reconciliation-adjustments.integration.test.ts`**

- concurrent distinct approvals create only one approval and never modify financial books
- persists waiting state; serializes duplicate proposals and approvals, with exact hashes and unchanged books
- reads fail closed for foreign and unknown runs, non-finance, revoked and expired sessions
- refuses stale report hash and approval after a newer run, preserving the queue and books

**`test/financial-reconciliation-queue.integration.test.ts`**

- SQL and core agree on supported provider chains, duplicate effects, limits, orphans and late events
- SQL does not let a daily alias persist a forged report
- SQL refuses fabricated, omitted and altered differences and forged balances; an honest direct run is unchanged
- SQL refuses unbacked journal and correction facts rather than treating reviews as posted money
- SQL rejects forged invoice money, revision, unknown invoice and omission of a stored invoice despite fresh hashes
- binds replay payloads, serializes concurrent runs and deduplicates daily scheduling
- denies direct writes, enforces append-only even for owner, and leaks no cross-tenant run
- refuses self-approval including a second session for the same identity; a different finance identity approves exact content
- refuses stale runs, locked invoice revision substitution and new discrepancies
- report reads require current finance access even for a known stored run
- stores missing, duplicate and late observations in an immutable queue; rebuilds identically after restart

**`test/firm-profile.integration.test.ts`**

- refuses a marked practice company's profile and saves

**`test/job-scheduling.integration.test.ts`**

- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative CH-3b DW3 held cases: the operative on the job and that team's supervisor read the resident contact; an operative outside the job's team gets the same 404 as a job that does not exist
- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative agrees with the pure operative rule: only an operative assigned to the job, in the job's team, acts on it
- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative agrees with the pure scope rules for every non-operative role, scope kind, permission and job position
- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative follows the job's current revision: moving an order to another team moves who may read it, and the previous team loses access
- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative keeps the contact out of every list, projection and export the scheduling work adds
- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative lets roles with resident.read read through the scope that covers the job's team, and no role without it
- ENT-2 scheduling facts: a read projection only has no scheduling command: runtime cannot write assignments or visits, and a visit written by the owner (ENT-3's future writer) is projected with server times
- ENT-2 scheduling facts: a read projection only rejects an assignment that is not a real team member of the order's team, and an operative revoked after assignment loses access
- ENT-2 scheduling facts: a read projection only shows the assignment from the import to the people the job's scope covers, and refuses every other id with the same not-found

**`test/lock-order-1.integration.test.ts`**

- [LOCK-ORDER-1(a)] holds the shared tenant administration lock before the origin foreign key can lock the work order
- [LOCK-ORDER-1(c)] 50 same-instant captures and baseline revisions use separate connections and leave consistent committed state
- [LOCK-ORDER-1(d)] M31-S15 same-instant capture, revoke and revise have explicit outcomes

**`test/lp-job-doors-compatibility.integration.test.ts`**

- LP-2 creation caller compatibility groundwork [LP2-A12] ENT-2 import still creates one live work-order job atomically through the product repository

**`test/lp5b-contractor-writers.integration.test.ts`**

- LP-5b approval replay checks the original step's current grant and cannot repeat the effect
- LP-5b primitive capture first/replay/conflict and duplicate client captures keep the same result
- LP-5b unknown types and completion without each contractor effect are refused and rolled back
- LP-5b visits preserve microsecond result DTOs, conflicts and current membership on replay

**`test/m4-23-contractor-acceptance.integration.test.ts`**

- M4-23 client: command approval → fake export → replayed status import → exact monthly posting
- M4-23 credit: next month compensates once and leaves the approved bill and journal immutable
- M4-23 cross-customer authority cannot read, import against or post the other contractor's statement
- M4-23 duplicate log: capture replay and an explicit duplicate resolution leave one billed fee line
- M4-23 office: command approval → fake export → replayed status import → exact monthly posting
- M4-23 original order: paid ordinary work stays in allocation and earns no fee
- M4-23 part payment: only settled principal earns 500p; next month posts only the 1000p balance
- M4-23 rejected extra: the actual rejection prevents export and positive fees
- M4-23 site: command approval → fake export → replayed status import → exact monthly posting

**`test/northside-demo.integration.test.ts`**

- ACTION-ATTRIBUTION durably binds every journey command to the persisted tester, fictional actor and switch, with no delivery attempts
- ENT11A-01 the generated contractor is seeded through commands: 3 clients, 40 operatives, 2,000 orders in the month, all counted back from the rows
- FLAKE-DIAG-1 measures legacy/new reads and preserves allowed AND denied seeded jobs

**`test/offline-risk.integration.test.ts`**

- M31-S09 minimal authorized repository read
- M31-S10 queued intent commits existing facts
- M31-S11 fresh-instance persistence
- M31-S12 current authority on replay
- M31-S13 tenant actor and resource boundaries
- M31-S16 ambiguous response and rollback
- M31-S17 compatibility
- a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- a successful no-op keeps its identity
- an unauthorised caller gets the identical EXTRA_FORBIDDEN for unknown, foreign, not-live and live jobs
- replaying a command id returns the first result, never the job's current state
- the same command id on another job conflicts
- the same command id with a changed payload conflicts

**`test/offline-risk.properties.integration.test.ts`**

- M31-S15 generated authority and baseline changes have explicit outcomes
- M31-S15 real database multi-crew convergence

**`test/operative-entitlements.integration.test.ts`**

- site-origin guard refuses agreement loss, preserves historical rows, and refuses prior command replay without changing stored facts

**`test/operative-offline.integration.test.ts`**

- ENT12 downloads filter assigned jobs without RLS and expose no resident or shadow columns
- ENT12 offline authority loss and cross-tenant selectors write no origin
- ENT12 retains labelled device time while server writes origin, order and current revision

**`test/practice-company-marker.integration.test.ts`**

- [PW15] RC3 P7 generated signed-in refuses routine and table-owner marker without writing either record
- [PW15] V1 P3 locator refuses routine and table-owner marker without writing either record
- [PW15] V2 P2 pending invitation refuses routine and table-owner marker without writing either record
- [PW15] V3 P3 accepted invitation refuses routine and table-owner marker without writing either record
- [PW15] V4 P4 connection refuses routine and table-owner marker without writing either record
- [PW15] V5 P5 verified domain refuses routine and table-owner marker without writing either record
- [PW15] V6 P7 owner address refuses routine and table-owner marker without writing either record
- [PW15] V7 P7 admin address refuses routine and table-owner marker without writing either record
- [PW15] V8 P8 direct session refuses routine and table-owner marker without writing either record
- [PW15] [PW16] address prevents marking and is refused after marking
- [PW15] [PW16] invitation prevents marking and is refused after marking
- [PW15] [PW16] locator prevents marking and is refused after marking
- [PW15] [PW33] a marker cannot be written by hand on other terms
- [PW15] marker history is permanent and timestamp bounds use the database clock
- [PW16] P4 P5 P6 P12 SSO connection attach is refused for a marked company
- [PW16] locator and address repointing cannot attach marked identities
- [PW16] product invitation and SSO connection administration cannot attach a marked company
- [PW23] new control-plane rows and audit never store a session value
- [PW31] P1 signup of another company cannot affect an acting session
- [PW31] P13 operator paths have no root to bypass the unchanged identity refusals
- [PW31] P16 0143 emergency window uses existing locator stops an already-running switch without changing its history
- [PW31] P17 0143 approved emergency rule uses existing locator stops an already-running switch without changing its history
- [PW31] P18 0143 emergency use uses existing locator stops an already-running switch without changing its history
- [PW31] P19 0150 user_email insert stops an already-running switch without changing its history
- [PW31] P2 P14 invitation stops an already-running switch without changing its history
- [PW31] P20 0150 signup locator insert stops an already-running switch without changing its history
- [PW31] P21 0150 replacement locator repoint stops an already-running switch without changing its history
- [PW31] P22 0150 invitation locator insert stops an already-running switch without changing its history
- [PW31] P23 0150 invitation acceptance stops an already-running switch without changing its history
- [PW31] P24 0150 invitation create stops an already-running switch without changing its history
- [PW31] P3 P6 P14 locator stops an already-running switch without changing its history
- [PW31] P7 P11 P12 P14 worker address stops an already-running switch without changing its history
- [PW31] P7 P11 P14 owner address stops an already-running switch without changing its history
- [PW31] P8 P15 owner session stops an already-running switch without changing its history
- [PW31] P8 P15 worker session stops an already-running switch without changing its history
- [PW31] P9 P10 no connection or locator exists to grant emergency or SCIM access
- [PW4] a marked company's second owner-written session cannot acquire its marker

**`test/practice-worker-switch-proof.integration.test.ts`**

- [PW10] a direct table-owner switch insert still requires its event at commit
- [PW10] end without its audit event fails at commit and keeps the current worker
- [PW13] [PW17] direct owner writes cannot select a foreign, office or owner target
- [PW14] lookup refuses every mismatched marker and switch condition
- [PW14] marker environment CHECK survives disabled triggers
- [PW17] foreign-key chain survives disabled user triggers
- [PW17] missing decision answers fail closed with the caller refusal
- [PW20] authority settings cannot select another company or target
- [PW32] wider grants only refused for a currently acted-as member
- [PW4] a session whose identity does not match its owner is refused uniformly
- [PW4] tampered session callers of every non-owner role are uniformly refused
- [PW6] [PW17] runtime has no table authority: DELETE FROM
- [PW6] [PW17] runtime has no table authority: INSERT INTO
- [PW6] [PW17] runtime has no table authority: SELECT * FROM
- [PW6] [PW17] runtime has no table authority: UPDATE
- [PW8] [PW17] immutable switch history, exact environment and window CHECKs
- [PW8] [PW17] table-owner switch and end timestamps must be true database times

**`test/practice-worker-switch-upgrade.integration.test.ts`**

- [PW12] no-active-switch classes remain byte-equal to the hardened lookup at head
- [PW26] rolled-back one-microsecond and full-type controls fail; later additions pass
- [PW27] hardened rollback and separate feature-off preserve end and state
- [PW34] composed lookup at head has all three answers and helper errors return no member
- [PW34] ended cap-expired sessions have no fourth answer for every switch state
- [PW34] ended home-expired sessions have no fourth answer for every switch state
- [PW34] ended home-revoked sessions have no fourth answer for every switch state
- [PW34] ended never-issued sessions have no fourth answer for every switch state
- [PW34] ended revoked sessions have no fourth answer for every switch state

**`test/practice-worker-switch.integration.test.ts`**

- [PW10] injected audit failure rolls back both commands and the first marker
- [PW10] injected commit failure rolls back both commands and the first marker
- [PW10] injected routine failure rolls back both commands and the first marker
- [PW10] missing audit rolls the routine and first marker back at commit
- [PW10] no business lock is acquired after the audit append
- [PW11] [PW32] merged grant.create committed first is seen by a waiting switch
- [PW11] [PW32] merged membership.revoke committed first is seen by a waiting switch
- [PW11] concurrent duplicate and different commands serialize
- [PW11] one command concurrently used across sessions and opposite operations conflicts
- [PW11] session revoke and switch settle without deadlock and no later lookup succeeds
- [PW11] simultaneous start and end leave a consistent current state
- [PW1] [PW3] [PW13] decision 39 switches to client_approver and back without renewing the session
- [PW1] [PW3] [PW13] decision 39 switches to operative and back without renewing the session
- [PW1] [PW3] [PW13] decision 39 switches to supervisor and back without renewing the session
- [PW1] [PW3] [PW13] decision 39 switches to surveyor and back without renewing the session
- [PW1] switch events and rows share a transaction and the audit chain verifies
- [PW20] invalid session values and foreign target cannot select authority
- [PW22] refusal records deduplicate and omit foreign targets
- [PW23] catalogue-wide scan stores neither session values nor extra digests
- [PW23] public state contains no session reference, value or authority
- [PW2] exactly the worker's own merged permissions and unchanged authority rows
- [PW30] a lookup made after a committed end names the owner, also inside a transaction opened before the end
- [PW30] a transaction that is not read committed is never given the worker: REPEATABLE READ
- [PW30] a transaction that is not read committed is never given the worker: SERIALIZABLE
- [PW30] expiry is strict
- [PW30] the lookup reads the actual time, not the transaction's start
- [PW32] a tenant-locked wider grant committed first prevents a waiting switch
- [PW32] decision 39 grants stay with the member and revocation removes job access
- [PW32] team move and grant revocation remain available while acting
- [PW32] the recorded owner alone ends a switch after the worker is revoked, end-only and idempotent (r19)
- [PW32] wider admin grant refused while acting, permitted after end
- [PW32] wider commercial_manager grant refused while acting, permitted after end
- [PW32] wider finance grant refused while acting, permitted after end
- [PW32] wider read_only grant refused while acting, permitted after end
- [PW4] [PW7] a refused command writes no switch and no marker
- [PW4] owner grant caller refusal is identical for every target
- [PW4] owner membership caller refusal is identical for every target
- [PW4] small-builder track caller refusal is identical for every target
- [PW5] a target linked to another company's sign-in locator is not eligible
- [PW5] target admin has the identical not-found refusal
- [PW5] target commercial_manager has the identical not-found refusal
- [PW5] target finance has the identical not-found refusal
- [PW5] target owner has the identical not-found refusal
- [PW5] target read_only has the identical not-found refusal
- [PW5] target revoked has the identical not-found refusal
- [PW5] target wider has the identical not-found refusal
- [PW6] foreign target and context cannot select another company
- [PW6] unstamped or missing contexts are refused before connecting
- [PW7] replaying a command id returns the first result, never the session's current state
- [PW7] the same command id from another session conflicts
- [PW7] the same command id with a changed target conflicts
- [PW8] expiry leaves an unclosed switch until explicitly ended
- [PW9] ended expired session cannot act or revive
- [PW9] ended home-expired session cannot act or revive
- [PW9] ended home-revoked session cannot act or revive
- [PW9] ended revoked session cannot act or revive
- [PW9] home record ending during a current switch leaves both session and switch inert

**`test/seed-transaction-locks.integration.test.ts`**

- PostgreSQL seed serialization nested Northside: acquired failure rolls back, permits retry, and failed rollback destroys the backend
- PostgreSQL seed serialization nested Northside: concurrent requests serialize, retain the stored seed, and release transaction-owned locks on early return
- PostgreSQL seed serialization work order: acquired failure rolls back, permits retry, and failed rollback destroys the backend
- PostgreSQL seed serialization work order: concurrent requests serialize, retain the stored seed, and release transaction-owned locks on early return

**`test/server-entitlements.integration.test.ts`**

- MON-8 track reassignment refuses legacy contractor writers while retaining reads and revocations

**`test/site-extra-evidence.integration.test.ts`**

- ENT-3d v3 command replay properties a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-3d v3 command replay properties a successful no-op keeps its identity
- ENT-3d v3 command replay properties an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job
- ENT-3d v3 command replay properties replaying a command id returns the first result, never the job's current state
- ENT-3d v3 command replay properties the same command id on another job conflicts
- ENT-3d v3 command replay properties the same command id with a changed payload conflicts
- ENT-3d verified photo and resident confirmation [E10] a missing, empty or whitespace-only note is INVALID_COMMAND with a verified photo and without one; nothing written
- ENT-3d verified photo and resident confirmation [E11] a confirmation is recorded with a photo: one document, its rows exactly as defined, linked and covered by the origin hash
- ENT-3d verified photo and resident confirmation [E11] a confirmation is recorded without a photo: one document, its rows exactly as defined, linked and covered by the origin hash
- ENT-3d verified photo and resident confirmation [E12] a hash shown for different content is CONFIRMATION_MISMATCH each time; nothing written, no evidence row either, one refusal event
- ENT-3d verified photo and resident confirmation [E13] the guard alone, binding: a document written for content X cannot serve content Y, serves X once, and not a second extra
- ENT-3d verified photo and resident confirmation [E14] a confirmation whose content the client tried to supply is rejected at the database; routine 4 has no content argument
- ENT-3d verified photo and resident confirmation [E15] the same command and payload twice, and twice at once, have one effect and equal answers; changed payloads conflict
- ENT-3d verified photo and resident confirmation [E16] tenant isolation: another company cannot see or use a photo or a document; an upper-case tenant setting still works; line 2 is the row's own tenant
- ENT-3d verified photo and resident confirmation [E17] every role that may not log gets ENT-3a's EXTRA_FORBIDDEN for a v3 command; not-named and out-of-scope members get NOT_FOUND, identical with a real or unknown photo
- ENT-3d verified photo and resident confirmation [E18] existing evidence rows are byte-identical after a successful v3 command and after a refused one
- ENT-3d verified photo and resident confirmation [E19] the resident's contact values appear in no document, evidence row, audit payload or thrown error
- ENT-3d verified photo and resident confirmation [E26] the stored confirmation document rebuilds from persisted facts: bytes, hash and length
- ENT-3d verified photo and resident confirmation [E7] a verified photo is accepted: the origin links it, copies its hash and covers it in the origin hash
- ENT-3d verified photo and resident confirmation [E8] every cause of a photo that is not accepted gives the identical PHOTO_NOT_ACCEPTED, nothing written, one refusal event
- ENT-3d verified photo and resident confirmation [E9] the guard alone: merged raiseExtra with the seam and an unverified photo is rejected, nothing written

**`test/site-extra-freetext-status.integration.test.ts`**

- free-text statuses replay one immutable server statement, remain unpriced, and reject changed status and hidden targets
- v4 keeps verified-photo enforcement and refuses no note and no verified photo

**`test/site-extra-order-check.integration.test.ts`**

- ENT-3c catalogue (the new tables and routines) [C21] the application login cannot reach a write on either table and the routine refuses it a path round the checks
- ENT-3c order check read [C18] orderCheck gives the outcome the command then acts on, for every case of [C1] built as real orders
- ENT-3c order check read [C7] within the order (equal or below) is ALREADY_ON_ORDER as a result of the read, and nothing is written by it
- ENT-3c search of the job's price list [C17] both reads work on a job that is no longer live
- ENT-3c search of the job's price list [C18] at most 50 items are returned, in code order, with truncated set
- ENT-3c search of the job's price list [C18] sorItems returns only items of THIS job's price list, by code, matching text literally and case-insensitively
- ENT-3c the reads obey the same access rule as the command [C10] orderCheck: every job refusal is one NOT_FOUND, and no refused caller meets SOR_ITEM_NOT_FOUND, ORDER_LINE_NOT_FOUND, ORDER_LINE_AMBIGUOUS, ALREADY_ON_ORDER or JOB_NOT_LIVE
- ENT-3c the reads obey the same access rule as the command [C10] sorItems: every job refusal is one NOT_FOUND, and no refused caller meets SOR_ITEM_NOT_FOUND, ORDER_LINE_NOT_FOUND, ORDER_LINE_AMBIGUOUS, ALREADY_ON_ORDER or JOB_NOT_LIVE
- ENT-3c the reads obey the same access rule as the command [C11] another tenant's context, an unstamped context and a small-builder tenant's latest assignment
- ENT-3c the reads obey the same access rule as the command [C9] orderCheck: every role that may not log gets the identical EXTRA_FORBIDDEN for an in-scope job, another branch's job, another tenant's job and a random job
- ENT-3c the reads obey the same access rule as the command [C9] sorItems: every role that may not log gets the identical EXTRA_FORBIDDEN for an in-scope job, another branch's job, another tenant's job and a random job

**`test/site-extra-priced-evidence.integration.test.ts`**

- a committed priced log survives submission failure; concurrent submit replay makes one request
- priced v2 preserves evidence, origin, replay and cross-customer boundaries
- server proceed comparison uses the bound rules: within, above and unpriced; cancelled logs remain not found
- work statement storage is forced-RLS and runtime EXECUTE only, with tenant-qualified foreign keys
- work statements do not alter price, requirement, origin or timing; finished above the limit survives later approval

**`test/site-extra-priced-submit-recovery.integration.test.ts`**

- rechecks revocation after preflight before capture
- recovers the operative's exact retry after log commit, competing supervisor submit and lost response
- recovery refuses missing requests, superseded prices and rejected requests without writing
- refuses a missing approval feature before new capture, while site capture remains available
- scoped recovery refuses wrong bindings and withdrawn state
- the recovery SELECT itself excludes a raiser revoked after priced submission
- transient submission failure keeps the log and deterministic submit identity, then completes once

**`test/site-extra-pricing.integration.test.ts`**

- ENT-3c access: the same refusals as every command, decided by the database before anything else [C10] direct runtime writer re-checks revoked stored authority and refuses at the call with no revision, basis or audit written
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C10] every job refusal is one NOT_FOUND whatever the cause, and no caller learns of the price list, the order lines or the item
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C11] another tenant: nothing crosses, nothing of tenant B is read, searched, priced or written
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C11] direct runtime writer refuses without a stored origin or open receipt, with no revision, basis or audit written
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C13] two people logging the same item create two candidate duplicates, each priced in full, never merged
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C16] direct runtime writer still enforces INVALID_COMMAND (23514) for an authorized stored origin whose raising receipt is no longer open
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C5] direct runtime writer accepts an authorized stored supervisor origin and open receipt with its basis and raised audit in one committing transaction
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C9] direct runtime writer refuses a structurally valid owner origin through its own authority check, with no revision, basis or audit written
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C9] direct runtime writer refuses a structurally valid unassigned operative origin through its own authority check, with no revision, basis or audit written
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C9] every role that may not log gets EXTRA_FORBIDDEN, identical for an in-scope job, another branch's job, another tenant's job and a random job
- ENT-3c live only, races, atomic audit and the immutable record [C14] a grant revoke holding the tenant lock while a log is in flight: the log waits, and is refused with nothing written when the revoke commits first
- ENT-3c live only, races, atomic audit and the immutable record [C14] races: the same command twice at once is one extra with two equal answers; an order revision between the pre-check and the command ends typed or wholly consistent
- ENT-3c live only, races, atomic audit and the immutable record [C14] the job leaving live on a second connection while a log is in flight: the log commits first (the guard holds to commit) and nothing is half written
- ENT-3c live only, races, atomic audit and the immutable record [C15] a failure forced at each statement leaves nothing written, and the audit event is in the same transaction
- ENT-3c live only, races, atomic audit and the immutable record [C15] matching origin/revision transaction identities and a valid basis still require the raised audit event: PRICING_AUDIT_REQUIRED rolls everything back
- ENT-3c live only, races, atomic audit and the immutable record [C16] a correct owner-inserted revision commits with its basis and raised audit, so tamper refusals are isolated to the revision INSERT
- ENT-3c live only, races, atomic audit and the immutable record [C16] the high/low INSERT-refusal assertions fail if only the exact-price guard is removed (rolled-back mutation control)
- ENT-3c live only, races, atomic audit and the immutable record [C16] the stored record cannot be changed or supplied, and every tampered row is refused by the guard or a foreign key
- ENT-3c live only, races, atomic audit and the immutable record [C17] a replay of a command that succeeded while the job was live still returns its first answer after the job has left live; a caller who may not log never learns the job is not live
- ENT-3c priced log: success, money and the excess only [C5] operative logs a excess schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C5] operative logs a new schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C5] supervisor logs a excess schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C5] supervisor logs a new schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C5] surveyor logs a excess schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C5] surveyor logs a new schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C6] a later price list and a later order revision never reprice a stored row; a log after the revision is priced from the new revision's own price list
- ENT-3c priced log: success, money and the excess only [C6] money: every row M1 to M14 stored exactly, equal to merged priceSorLine and to the merged SQL function; M10 is 676 and not 675
- ENT-3c priced log: success, money and the excess only [C7] within the order (equal or below) is ALREADY_ON_ORDER with nothing written, and the same command id then succeeds with a larger quantity
- ENT-3c priced log: success, money and the excess only [C8] the excess only: the quantity is claimed minus instructed, priced alone, with the BASELINE revision's line
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C12] a successful no-op keeps its identity
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C12] replaying a command id returns the first result, never the job's current state
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C12] the same command id on another job conflicts
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C12] the same command id with a changed payload conflicts
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C17] a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C9] an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job

**`test/site-extra-recent-items.integration.test.ts`**

- empty history is successful; search and recents have identical target refusals
- recents are distinct, newest first, limited to five, personal and restricted to the target price list

**`test/site-extra-replay-after-invoice.integration.test.ts`**

- replays a plain site extra after invoicing while refusing new commands and changed bodies

**`test/site-extra-visit.integration.test.ts`**

- ENT-3b the visit reference on a site extra (version 2) [B16] a completed visit, another member's visit, a visit of another job, another tenant's visit and a random id are each NOT_FOUND with nothing written
- ENT-3b the visit reference on a site extra (version 2) [B16] a completion that commits after the pre-check allowed a version 2 log makes the log fail with nothing written
- ENT-3b the visit reference on a site extra (version 2) [B16] a log that commits first leaves the extra, and the completion that was waiting then succeeds
- ENT-3b the visit reference on a site extra (version 2) [B16] a version 1 log still writes no visit and its call to the repository is still exactly four fields
- ENT-3b the visit reference on a site extra (version 2) [B16] a version 2 log naming the caller's own open visit stores the visit and its origin hash matches the stored row
- ENT-3b the visit reference on a site extra (version 2) [B16] raiseExtra called directly with the seam and a completed visit is refused by the new guard alone
- ENT-3b the visit reference on a site extra (version 2) [B16] the other ENT-3a refusals are unchanged for a version 2 body: an unauthorised caller, a foreign job and a not-named member

**`test/site-extra.integration.test.ts`**

- ENT-3a governed path [A10] tenant mismatch, foreign job, missing/unstamped contexts cannot touch tenant B
- ENT-3a governed path [A11] latest small-builder tenant assignment is TRACK_FORBIDDEN
- ENT-3a governed path [A12] concurrent refusal writers coalesce; audit append failure retains identical typed refusal
- ENT-3a governed path [A12] every refusal reason is durable once, scoped, attributable and contains no free text
- ENT-3a governed path [A2] operative logs only server-derived facts atomically
- ENT-3a governed path [A2] supervisor logs only server-derived facts atomically
- ENT-3a governed path [A2] surveyor logs only server-derived facts atomically
- ENT-3a governed path [A3] an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-3a governed path [A4] every inaccessible job cause has identical NOT_FOUND and no business effect
- ENT-3a governed path [A5] grant revocation refuses new work and earlier replay
- ENT-3a governed path [A5] membership revocation refuses new work and earlier replay
- ENT-3a governed path [A6] seam alone refuses owner, permits supervisor and refuses an unchosen covering grant
- ENT-3a governed path [A7] log commits first under the shared administration lock, without sleeps
- ENT-3a governed path [A7] revoke commits first under the shared administration lock, without sleeps
- ENT-3a governed path [A7] two concurrent commands on independent pooled connections have one effect
- ENT-3a governed path [A9] exact replay, conflicting note/member/grant and equal text with separate IDs
- [R2] a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- [R2] not-live between precheck and raiseExtra refuses and leaves no extra, audit or command row
- [R3] the same command id with a changed payload conflicts
- a successful no-op keeps its identity
- replaying a command id returns the first result, never the job's current state
- the same command id on another job conflicts

**`test/site-supervisor-query.integration.test.ts`**

- immutable query: replay, conflict, tenant/assignment/cancellation refusal, stale revision and zero extra effects

**`test/site-visit-abandoned.integration.test.ts`**

- LATER-SAFETY-79 abandoned site visits closes a revoked operative's visit, replays once, and releases EndCheck
- LATER-SAFETY-79 abandoned site visits closes a unassigned operative's visit, replays once, and releases EndCheck
- LATER-SAFETY-79 abandoned site visits rechecks the administrator's current membership before replay
- LATER-SAFETY-79 abandoned site visits refuses a bound owner without a processing receipt, and an unbound caller
- LATER-SAFETY-79 abandoned site visits refuses a caller naming a different active admin, including terminal replay
- LATER-SAFETY-79 abandoned site visits refuses a fabricated processing receipt without a begin_command lifecycle claim
- LATER-SAFETY-79 abandoned site visits refuses an authoritative operative, non-admins, wrong-job/tenant visits, missing visits and invalid reasons without effects
- LATER-SAFETY-79 abandoned site visits refuses changed visit or reason after begin_command claimed the exact input

**`test/site-visit.integration.test.ts`**

- B-prime replay and live-guard properties: complete [BP-a] complete: replaying a command id returns the first result, never the job's current state
- B-prime replay and live-guard properties: complete [BP-b] complete: the same command id with a changed payload conflicts
- B-prime replay and live-guard properties: complete [BP-c] complete: the same command id on another job conflicts
- B-prime replay and live-guard properties: complete [BP-d] complete: a successful no-op keeps its identity
- B-prime replay and live-guard properties: complete [BP-e] complete: a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- B-prime replay and live-guard properties: complete [BP-f] complete: an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job
- B-prime replay and live-guard properties: start [BP-a] start: replaying a command id returns the first result, never the job's current state
- B-prime replay and live-guard properties: start [BP-b] start: the same command id with a changed payload conflicts
- B-prime replay and live-guard properties: start [BP-c] start: the same command id on another job conflicts
- B-prime replay and live-guard properties: start [BP-d] start: a successful no-op keeps its identity
- B-prime replay and live-guard properties: start [BP-e] start: a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- B-prime replay and live-guard properties: start [BP-f] start: an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job
- ENT-3b live only [B14] a named member on a not-live job gets JOB_NOT_LIVE for both commands; a member who may not visit it never learns that
- ENT-3b races on independent connections [B11] a revoke holding the tenant lock while a start is in flight: the start waits and is refused with nothing written once the revoke commits
- ENT-3b races on independent connections [B11] the same completion sent twice at once is one answer; two different completions at once: exactly one succeeds
- ENT-3b races on independent connections [B11] the same start sent twice at once is one visit and two equal answers
- ENT-3b races on independent connections [B11] two different start commands by the same member at once: exactly one succeeds
- ENT-3b refusals by role and by job [B3] every role that may not visit: VISIT_FORBIDDEN for both commands, identical for four job ids, nothing written
- ENT-3b refusals by role and by job [B4] a named supervisor whose only covering grant is revoked, an operative moved off the team, and a cancelled order are refused as NOT_FOUND
- ENT-3b refusals by role and by job [B4] after membership.revoke both commands answer VISIT_FORBIDDEN
- ENT-3b refusals by role and by job [B4] every job refusal is the same NOT_FOUND for start and for completion; the open visit stays open
- ENT-3b refusals by role and by job [B5] another tenant: tenant A's member with tenant B's job or visit, a mismatched actor, an unstamped context, a small-builder tenant
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete live-guard: job-removal after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete live-guard: membership-revocation after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete replay: job-removal after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete replay: membership-revocation after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete: a live-guard refusal rolls back before rechecking authority and conceals job state if membership is then revoked
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete: replay holds the shared authority lock and rechecks authority and ownership after reading the receipt
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start live-guard: job-removal after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start live-guard: membership-revocation after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start replay: job-removal after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start replay: membership-revocation after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start: a live-guard refusal rolls back before rechecking authority and conceals job state if membership is then revoked
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start: replay holds the shared authority lock and rechecks authority and ownership after reading the receipt
- ENT-3b replay, conflict, one open visit [B10] one open visit per member per job; a new start works after completion; two named members may each hold one
- ENT-3b replay, conflict, one open visit [B9] a replay by a member who has since been revoked or taken off the job is refused before the stored result is read
- ENT-3b replay, conflict, one open visit [B9] complete: the same command id and payload returns one answer and the same result; the other answer conflicts and the stored answer is unchanged
- ENT-3b replay, conflict, one open visit [B9] start: the same command id and payload returns the same result with one visit, one audit event and one receipt; another job or another member conflicts
- ENT-3b success paths [B2] the named operative starts and completes a visit with server times, an answer, two audit events and two receipts
- ENT-3b success paths [B2] the named supervisor starts and completes a visit with server times, an answer, two audit events and two receipts
- ENT-3b the audit event is in the same transaction [B12] an answer row inserted by the owner with no matching audit event fails at commit with CLOSEOUT_AUDIT_REQUIRED, also when another company has an event with the same id
- ENT-3b the audit event is in the same transaction [B12] complete: a failure at claim, the routine call, audit, completion or commit leaves nothing written
- ENT-3b the audit event is in the same transaction [B12] complete: observed with the lock observer, the shared tenant-authority lock is first and no lock is taken after the audit append
- ENT-3b the audit event is in the same transaction [B12] start: a failure at claim, the routine call, audit, completion or commit leaves nothing written
- ENT-3b the audit event is in the same transaction [B12] start: observed with the lock observer, the shared tenant-authority lock is first and no lock is taken after the audit append
- ENT-3b the audit event is in the same transaction [B12] the visit update, the answer row and the completion audit event carry the same transaction id
- ENT-3b the close-out answer [B6] a body with no closeoutAnswer, or a null one, is CLOSEOUT_ANSWER_REQUIRED before anything is read
- ENT-3b the close-out answer [B6] as the table owner, completing an open visit with no answer row fails at commit and leaves the visit open
- ENT-3b the close-out answer [B6] routine 3 called directly as the runtime role with a NULL or an invalid answer raises CLOSEOUT_ANSWER_REQUIRED and writes nothing
- ENT-3b the close-out answer [B7] a second completion with a new command id, with either answer, is VISIT_ALREADY_COMPLETED and changes nothing
- ENT-3b the close-out answer [B8] an answer can be neither changed nor removed: the runtime role has no privilege, the owner meets the immutable trigger, and a completed visit cannot be reopened or moved
- ENT-3b the refusal record [B13] one refusal event of the right shape for each reason; the same refused command sent three times leaves one; the job is named only when it is in this company
- ENT-3b the refusal record [B13] validation errors, conflicts, replays, not-live refusals and the 422 codes write no refusal record
- ENT-3b the refusal record [B13] with the audit append made to fail the caller still receives the same typed refusal
- ENT-3b the site worker's reads [B15] assigned jobs: exactly the jobs the caller is named on, with their own open visit, nothing else
- ENT-3b the site worker's reads [B15] order lines: the current revision's lines in position order, only the new revision's after a revised import, and every refusal applies
- ENT-3b the site worker's reads returns only the latest completed answer for this tenant, job and operative

**`test/sor-pricing.integration.test.ts`**

- ENT-2 DW5 exact pricing imports tie, zero, positive, fractional, overflow and negative-multiplier orders against their own contracts, with typed errors for the last two
- ENT-2 DW5 exact pricing is enforced in the database: a forged net, rate, version, adjustment or origin is refused even if the application is bypassed
- ENT-2 DW5 exact pricing never reprices a stored revision when a later SoR version is imported or a later contract version lists it; new orders do use it
- ENT-2 DW5 exact pricing prices £100.00 at -35/1000, quantity 1, as £96.50 through the whole import
- ENT-2 DW5 exact pricing uses the SoR version in force on the issue date, listed by the order's contract; an unlisted newer version is never used
- ENT-2 SoR version import imports the largest permitted price list (10,000 items) and cannot commit a version without its audit event
- ENT-2 SoR version import stores immutable versions and items, replays the same command, conflicts on a changed payload, and refuses a second version for the same effective date
- ENT-2 SoR version import validates strictly: forged fields, duplicate codes, negative or oversized rates, empty and oversized lists, production environment

**`test/synthetic-original-nullable-scope.integration.test.ts`**

- a job-level Northside photo survives a fresh store and yields an intact approved-extra bundle; other tenants/jobs/versions cannot read it
- keeps the scope FK for non-null rows and the proof original/finalization path unchanged
- rolls back the upload and its bytes together when the original callback fails

**`test/work-order-concurrency.integration.test.ts`**

- ENT-2 DW1 concurrent imports an import, an SoR import and an ENT-1 administration command in one tenant all complete (no lock-order deadlock), in either arrival order
- ENT-2 DW1 concurrent imports the same command and the same file racing is one import; the same command with a different file conflicts
- ENT-2 DW1 concurrent imports two (and three) concurrent imports of one file, on separate connections, produce exactly one set of rows and one verifiable audit chain
- ENT-2 DW1 concurrent imports two different files that both create one order reference: one creates it, the other is told its revision is stale, and only one job and binding exist
- ENT-2 DW1 concurrent imports two files revising one order from the same revision: one wins, the other is stale, and the history is a straight line
- ENT-2 DW1 concurrent imports two tenants import in parallel without touching each other

**`test/work-order-import.integration.test.ts`**

- ENT-2 DW1 idempotent import answers the same file twice in a row as a replay, but processes an earlier file again as rows once later revisions have moved on (A, B, A; verdict P2-1)
- ENT-2 DW1 idempotent import imports a generated 2,000-order file (measured), replays the same file with no new rows, and records exactly 3 revisions with diffs for 3 changed orders
- ENT-2 DW1 idempotent import replays the stored batch only when it was clean: a file with a refused row is processed again under a new command
- ENT-2 DW2 import validation commits no part of a failing order, whichever stage fails (job and parties bound, order inserted, or assignment refused)
- ENT-2 DW2 import validation gives each malformed row its own typed error in its receipt (unknown code, negative quantity, more than 6 decimals, money out of range, missing site) and imports the good rows around them
- ENT-2 DW2 import validation refuses another tenant's contract, client, site and team, committing nothing of those orders
- ENT-2 DW2 import validation refuses malformed files outright: unknown header, unterminated quote, forged tenant, provenance, status, track, origin and price columns
- ENT-2 DW3 immutability, cancellation and stable scope identity denies runtime and owner updates and deletes of revisions and lines, and records a cancellation as a revision
- ENT-2 DW3 immutability, cancellation and stable scope identity keeps the scope identity of unchanged lines: matched by client line reference, else by SoR code and position
- ENT-2 DW3 immutability, cancellation and stable scope identity refuses changes to the parties a job was bound to (CH-3b binds them once) and an incomplete restatement
- ENT-2 DW4 live from import, with no fee setup CH-3b DW1 held clause: the import calls app.bind_contractor_parties in its transaction and the routine refuses each missing party, committing nothing
- ENT-2 DW4 live from import, with no fee setup makes the job live at import, passing watchdogActive, with no quote, acceptance, obligation, journal, cap or fee-policy row
- ENT-2 DW4 live from import, with no fee setup refuses new order and SoR imports after track loss while retaining historical reads (Q5)
- ENT-2 DW6 personal data and origin can write no origin but client_instruction: lines carry it by CHECK, and no import receipt can raise an extra origin of any kind
- ENT-2 DW6 personal data and origin keeps resident name, phone and email out of audit payloads, receipts, projections, the batch results and captured logs
- ENT-2 migration and catalog catalogs FORCE RLS, migration ownership, SELECT-only runtime grants and denial of direct writes for every ENT-2 table
- ENT-2 migration and catalog copies ENT-1's role/permission matrix exactly: app.contractor_role_permits equals app.contractor_allowed for a real member of every role, and the core matrix (bar one documented pre-existing difference)
- ENT-2 migration and catalog refuses foreign-tenant contracts, teams, memberships, scope identities and jobs through qualified composite keys
- ENT-2 office reads lists batches and orders and shows each revision with its diff and stable line identities, for import-capable members and the job's own team
- ENT-2 tenant boundary answers another tenant's batch, order, job and revision ids exactly as it answers unknown ones, and refuses a context that is missing, hand-built or not a tenant's

</details>


## r5 follow-up on final-check and job maintenance

The full-run baseline above still controls the landing decision. The following figures come from real PostgreSQL 16.10 focused reruns. The matching baseline counts use the same assertion names and include only the files in the table.

| Regression and refusing route | Baseline failures in focused files | Focused failures after repair |
| --- | ---: | ---: |
| Final-check readers queried current originals, material documents and purchase orders on a queued runtime transaction without tenant authority. The runtime now consumes the existing one-use shadow permit for the exact synthetic job. | 29 | 0 |
| The final-check worker used an unbound shadow read for persisted optional estimates. It now uses the same checked shadow job transaction as detection and publication. The original text-worker cases are included in the previous row. | included above | 0 |
| Administrative post-lock evidence could pass `ch4_guard_new_site_work` because its owner could no longer see the stored commercial track and final-account lock. The checked maintenance path reads the exact triggering job. The focused recovery allocation tests also cover the private transition path. | 12 | 0 |
| Raw shadow signals and test publication lacked the checked shadow transaction. The positive fixtures now bind the seeded job. `guard_final_account_draft_advance` separately reads the exact next revision during legitimate maintenance. | 7 | 0 |
| The draft-advance trigger could not see the target revision under FORCE RLS in administrative invoice setup. The exact revision scope is cleared after validation. | 25 | 1 |
| The historical practice-facts fixture called the private transition without a protected job scope. It now uses the existing maintenance login gate and exact row checks for the read, write and proposed row. | 10 | 0 |
| The lock fixture performed an unbound draft lookup, synthetic shadow seed and target-tenant terms check. These operations now bind their original actors or exact shadow job. | 3 | 0 |
| The trial fixture installed an admission as the migration role without first binding the seeded company owner. | 3 | 0 |

The one remaining audit setup case in that cohort is `audit-dbsrc-03.integration.test.ts` → **home read survives unrelated workspace revocation**. The imported-job paid-shape fixture reached its deferred import-record witness after the transition and then failed with `IMPORT_RECORD_REQUIRED`. These remain outside the held work-order cases.

The exact focused PostgreSQL commands were:

```sh
pnpm --filter @jobguard/db exec vitest run test/final-check-practice-readers.integration.test.ts test/real-fc-ordinary-words.integration.test.ts src/final-check-typed-text.test.ts test/recovery-line-allocation.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db exec vitest run test/audit-dbsrc-03.integration.test.ts test/commercial-integrity-v3-published.integration.test.ts test/invoice-later.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db exec vitest run test/imported-job-paid-shape.integration.test.ts test/recovery-line-allocation.integration.test.ts test/practice-facts.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/final-account-lock.integration.test.ts test/customer-portal-message.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db exec vitest run test/migration-proof-loader.test.ts test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/lp-10-worker-login.integration.test.ts test/lp6a-binding.integration.test.ts test/free-first-job-conversion.integration.test.ts test/customer-portal-message.integration.test.ts --maxWorkers=1 --reporter=default
```

The source, recovery allocation and unit batch passed 163 of 163. The invoice, publication and audit batch passed 31 of 32. The snapshot and upgrade rerun passed 24 of 24. Free-first-job conversion passed 4 of 4, LP‑11 policy isolation passed 10 of 10, and LP‑6a binding including its exact relation-lock set passed 14 of 14. The populated catalogue capture produced 1,334 effective-privilege changes and 731 upgrade changes, of which 629 were policies. The two new maintenance relations are empty in the exact replay inventory.

## r5 follow-up on connector and linked practice

| Regression and refusing route | Baseline failures in the focused files | Focused failures after repair |
| --- | ---: | ---: |
| `connector.intake` and `connector.machine_stage` validated the stored binding, then `connector.input_event` refused staging. They now hold a transaction scope for that binding, tenant and namespace. Its audit witness is limited to the matching connector subject and actor. | 20 | 0 |
| The credential owner could not see private linked-practice associations. That misclassified leaf credentials as anonymous and stamped the wrong namespace in the protected request. The private digest classification returns only the matching kind, and the checked parent path can read and lock just the effective owner and its revocation. | 21 | 0 |

Connector verification passed 61 of 62. **Stages once, preserves the first receipt across retries/rotation, conflicts on changed payload and changes no export/billing rows** in `test/connector-export-delivery-staging.integration.test.ts` failed at the held customer fixture. Linked practice and the tenant policy tests passed 33 of 33, including both orderings of sign-out, membership removal, revocation and reset races.

The worker now keeps permit issuance in shadow composition and gives the exact runtime transaction to the final-check readers. The API shadow-capability suite passed 8 of 8 on that source. The populated PostgreSQL catalogue capture recorded 1,342 effective-privilege changes, 739 upgrade changes and 632 policy changes.

```sh
pnpm --filter @jobguard/db exec vitest run test/connector-intake.integration.test.ts test/connector-machine.integration.test.ts test/connector-export-delivery-staging.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db exec vitest run test/real-wayin-linked-practice.integration.test.ts test/real-wayin-linked-practice-races.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/api exec vitest run src/shadow-detection.worker.test.ts --maxWorkers=1 --testTimeout=30000
```

## r5 full shadow-fixture round

The fixture-only round completed all 878 PostgreSQL files. It had 558 passing files and 320 failing files. Of 8,012 tests, 5,903 passed, 1,561 failed, 529 were skipped and 19 were todo. The 842 directly held assertions, 21 directly held setup failures and one missing pg_dump were identical by count. Non-held failures moved from 784 assertions and 13 setup files to 718 assertions and 12 setup files. This is the complete run before the subsequent maintenance, linked-practice and connector changes. It remains RED.

Of the 86 previous failures first diagnosed as `shadow_commercial_signal` RLS, 60 passed, 26 still failed and none were skipped. Of the 10 previous `STACK_TRACE_ERROR` failures, seven passed and three still failed. Vitest reported one unhandled `P0002` in `watchdog.integration.test.ts`, from `app.transition_job` during **holds the first business lock until commit; both race orders serialize**.

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=4 --passWithNoTests --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-shadow-fixture-full-results.json
```

The 12 other setup failures reported for this round were:

- `test/UIWIRE-10.integration.test.ts` (INVALID_TRANSITION)
- `test/UIWIRE-11.integration.test.ts` (INVALID_TRANSITION)
- `test/job-sources-authority.integration.test.ts` (<no diagnostic>)
- `test/job-sources-isolation.integration.test.ts` (<no diagnostic>)
- `test/later-recovery-message-attempt.integration.test.ts` (REQUEST_BINDING_REFUSED)
- `test/lp1-membership-account.integration.test.ts` (<no diagnostic>)
- `test/managed-recovery.integration.test.ts` (COMMAND_CONFLICT)
- `test/merchant-ingestion.integration.test.ts` (EVIDENCE_PACK_CASE_NOT_FOUND)
- `test/outbox-discovery.integration.test.ts` (new row violates row-level security policy for table "action_outbox")
- `test/recovery-follow-up.integration.test.ts` (job not found)
- `test/recovery-messages.integration.test.ts` (REQUEST_BINDING_REFUSED)
- `test/recovery-record-immutable.integration.test.ts` (job not found)

The four `lp6e-audit.integration.test.ts` cases below expect a generic unbound invocation to append an audit event with only the caller's tenant setting. These remain outside the held work-order scope.

- **Keeps existing unbound statements lower-trust system work despite caller actor claims**
- **Never attributes an unbound NOINHERIT runtime statement to a human**
- **Owner-side checked writers record system work rather than a supplied person**
- **Cannot reuse an authenticated append's binding in the next pooled transaction**

The latest checked worker and binding command passed 38 of 38, including all 14 LP-6a binding tests and the exact relation lock set. The commercial-integrity guard CLIs returned zero diagnostics and their 253 tests passed on the latest code.

```sh
pnpm --filter @jobguard/db exec vitest run test/lp6a-binding.integration.test.ts test/lp-10-worker-login.integration.test.ts test/real-wayin-linked-practice-races.integration.test.ts --maxWorkers=1 --reporter=default
node tools/commercial-integrity-current-source-guard.mjs
node tools/commercial-integrity-boundary.mjs
node --test --test-concurrency=1 tools/commercial-integrity-{current-source-guard,boundary}.test.mjs
```

## r5 recovery-attribution fixture follow-up

The four focused recovery-attribution files went from 23 failures to zero on PostgreSQL 16.10. Their earlier failures included 21 rejected `recovery_attribution_revision` writes and an unbound shadow fixture. The private persistence fixture binds its seeded owner before assuming its restricted database role. The read controls exercise a bound practice owner, a separately bound foreign tenant, and an unbound request. The same policy mutation still has to fail each negative assertion. The pre-lock shadow control uses the established administrative seed because its draft job is outside the worker's admissible states.

```sh
pnpm --filter @jobguard/db exec vitest run test/recovery-attribution.integration.test.ts test/recovery-attribution-access.integration.test.ts test/recovery-attribution-replay.integration.test.ts test/recovery-attribution-figures.integration.test.ts --maxWorkers=1 --reporter=default
```

All 29 tests passed, including the exact fixture and mutation controls. The full checked-product run began before these fixture-only changes.

## r5 legacy variation-origin and meter fixtures

The maintenance trigger `app.record_legacy_builder_origin` previously selected its tenant through a caller setting. It now uses the exact variation from the administrative INSERT. The private policy can read the matching command key and write just that variation's legacy origin. The usual bound request path retains its original checks. The meter tests supply the fixture owner's binding before entering the private seam and at both sides of its existing lock barrier.

The meter and race files went from 21 failures to zero on PostgreSQL 16.10. The 35 ordinary-text final-check cases also passed against the updated migration. The new table remains empty in the historical upgrade comparisons. The catalogue records 1,346 effective-privilege changes, 744 upgrade changes and 634 policy changes.

```sh
pnpm --filter @jobguard/db exec vitest run test/meter-trip.integration.test.ts test/meter-trip-races.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db exec vitest run test/meter-trip.integration.test.ts test/meter-trip-races.integration.test.ts test/real-fc-ordinary-words.integration.test.ts --maxWorkers=1 --reporter=default
```

## r5 contractor-entitlement fixtures

The fixture read of the current track assignment had entered the migration role with a tenant setting and no binding. The fixture now enters through the already-issued contractor credential and qualifies the assignment by tenant. The superseding-assignment case writes through the same bound owner transaction and retains the exact audit assertion. Across the three focused files, the eight non-held failures went to zero. **Effective switched member is not replaced by owner** in `test/contractor-entitlement-session.integration.test.ts` still reaches the held work-order customer insert.

```sh
pnpm --filter @jobguard/db exec vitest run test/contractor-entitlement-authority.integration.test.ts test/contractor-entitlement-session.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db exec vitest run test/contractor-entitlement-authority.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/migration-proof-loader.test.ts --maxWorkers=1 --reporter=default
```

The first entitlement batch passed 24 of 26. One failure was held and the other passed in the subsequent six-test authority rerun. The catalogue, upgrade and tenant policy batch passed 89 of 89.

## r5 audit hand-off and outbox fixtures

The hand-off shell previously changed to the runtime role and appended with only `app.tenant_id`. Its checked SQL entry point now verifies the original synthetic database owner and the exact locked audit head. The scope permits only the matching hand-off event. The attested prior sequence, prior hash and database actor stay identical to the existing audit contract. Intervening-append fixtures prove a real contractor request before writing on the same test connection.

The outbox tests now bind the seeded business actor when appending and when calling the business-facing executor facade. The executor still switches to the separate worker login and derives authority from the committed signal.

| Focused group | Non-held failures before | Non-held failures after |
| --- | ---: | ---: |
| Audit checkpoint hand-off | 12 | 0 |
| Outbox | 13 | 0 |

The hand-off tests passed 22 of 22, the outbox tests passed 15 of 15, and the catalogue, upgrade and tenant-policy tests passed 89 of 89. The populated proof has 1,350 effective-privilege changes, 748 upgrade changes and 634 policy changes.

```sh
pnpm --filter @jobguard/db exec vitest run test/audit-checkpoint-handoff.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db exec vitest run test/outbox.integration.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/migration-proof-loader.test.ts --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db typecheck
```

## r5 full checked-product round at 23520e9cc

All 878 files completed on PostgreSQL 16.10. 577 files passed and 301 failed. The 8,011 tests included 6,105 passed, 1,440 failed, 447 skipped and 19 todo. Vitest recorded 5 unhandled errors.

The failure count contains 842 direct held-fixture assertions and 1 missing pg_dump assertion. Another 21 files stopped during setup at the held fixture. The other 597 failed assertions and 11 setup-only failures keep LP-11 RED.

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=4 --passWithNoTests --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-checked-full-results.json
```

The table follows original r4 non-held assertion failures by file and test name. A row still failing can have reached a different failure in the later code.

| r4 diagnostic | r4 failures | Passed in this round | Failed in this round | Skipped or absent |
| --- | ---: | ---: | ---: | ---: |
| error: JOB_PARTIES_REQUIRED | 1081 | 923 | 157 | 1 |
| error: JOB_NOT_FOUND | 304 | 281 | 23 | 0 |
| Assertion mismatch | 90 | 18 | 72 | 0 |
| error: NOT_FOUND | 59 | 55 | 4 | 0 |
| error: CUSTOMER_REFUSED | 55 | 55 | 0 | 0 |
| Error: RECOVERY_REVIEWER_FORBIDDEN | 49 | 49 | 0 | 0 |
| error: new row violates row-level security policy for table "fee_reservation_book" | 39 | 38 | 0 | 1 |
| error: SSO_REQUIRED_FORBIDDEN | 38 | 32 | 6 | 0 |
| error: new row violates row-level security policy for table "evidence_upload" | 37 | 37 | 0 | 0 |
| error: new row violates row-level security policy for table "membership" | 33 | 33 | 0 | 0 |
| PracticeFeedRepositoryError: PRACTICE_FEED_FORBIDDEN | 19 | 19 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'id') | 18 | 0 | 18 | 0 |
| error: job not found | 17 | 17 | 0 | 0 |
| error: new row violates row-level security policy for table "audit_event" | 17 | 1 | 16 | 0 |
| OidcError: OIDC_REFUSED | 16 | 16 | 0 | 0 |
| Error: UNAUTHENTICATED | 13 | 13 | 0 | 0 |
| Error: promise rejected "SsoError: SSO_FORBIDDEN { code: 'SSO…' }" instead of resolving | 13 | 13 | 0 | 0 |
| error: new row violates row-level security policy for table "action_outbox" | 12 | 1 | 11 | 0 |
| SsoError: SSO_FORBIDDEN | 9 | 6 | 3 | 0 |
| error: UNAUTHENTICATED | 9 | 9 | 0 | 0 |
| error: new row violates row-level security policy for table "input_event" | 9 | 9 | 0 | 0 |
| WormCommandError: WORM_REFUSED | 7 | 0 | 7 | 0 |
| error: EMERGENCY_REFUSED | 7 | 0 | 7 | 0 |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 6 | 0 | 6 | 0 |
| Error: ACCESS_REFUSED | 5 | 0 | 5 | 0 |
| Error: Synthetic tenant key registry operation refused | 5 | 0 | 5 | 0 |
| WatchdogError: JOB_NOT_LIVE | 5 | 5 | 0 | 0 |
| error: FORBIDDEN | 5 | 2 | 3 | 0 |
| error: INVALID_TRANSITION | 5 | 4 | 1 | 0 |
| error: new row violates row-level security policy for table "job" | 5 | 1 | 4 | 0 |
| Error: NOT_FOUND | 4 | 3 | 1 | 0 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 4 | 0 | 4 | 0 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 | 1 | 3 | 0 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 | 0 | 4 | 0 |
| error: new row violates row-level security policy for table "account" | 4 | 1 | 3 | 0 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 | 0 | 3 | 0 |
| Error: promise rejected "error: SSO_REQUIRED_FORBIDDEN { …(15) }" instead of resolving | 3 | 3 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 | 0 | 3 | 0 |
| Error: FORBIDDEN | 2 | 0 | 2 | 0 |
| Error: expected Error: RECOVERY_REVIEWER_FORBIDDEN { code: '…' } to match object { Object (code) } | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_SOURCE_CONFLICT' but got 'cannot execute INSERT in a read-only …' | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'JOB_NOT_FOUND' | 2 | 0 | 2 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_SOURCE_NOT_RECOGNISED' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 2 | 2 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23503' } | 2 | 1 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 | 0 | 2 | 0 |
| Error: jobguard_session_lookup does not have the required least-privilege posture | 2 | 2 | 0 | 0 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 2 | 1 | 1 | 0 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 | 0 | 2 | 0 |
| TypeError: Cannot read properties of undefined (reading 'revision') | 2 | 2 | 0 | 0 |
| error: STALE_SSO_REQUIRED | 2 | 0 | 2 | 0 |
| error: cannot execute INSERT in a read-only transaction | 2 | 1 | 1 | 0 |
| error: invalid reversal | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "capture_source" | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 2 | 0 | 2 | 0 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 | 0 | 1 | 0 |
| Error: Dispatch did not block behind contractor revocation | 1 | 0 | 1 | 0 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: FINAL_CHECK_FORBIDDEN | 1 | 1 | 0 | 0 |
| Error: MEMBERSHIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: STACK_TRACE_ERROR | 1 | 1 | 0 | 0 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 | 0 | 1 | 0 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_DEPENDENCY_HELD' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'IDEMPOTENCY_PAYLOAD_CONFLICT' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_NOT_LIVE' but got 'JOB_NOT_FOUND' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'NOT_FOUND' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_CASE_NOT_FOUND' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'REQUEST_BINDING_REFUSED' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'TEST-WORKER-pending' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'UNAUTHENTICATED' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'fixture audit failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'rollback' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic migration failure' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic rollback' but got 'new row violates row-level security p…' | 1 | 0 | 1 | 0 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 1 | 0 | 1 | 0 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 | 0 | 1 | 0 |
| Error: expected error: JOB_NOT_FOUND { …(15) } to match object { code: '23505' } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { Object (code) } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 | 0 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'AGREEMENT_INELIGIBLE' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'COLLECTION_REFUSED' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: query returned no rows { …(15) } to match object { code: '23514' } | 1 | 1 | 0 | 0 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 | 0 | 1 | 0 |
| Error: promise rejected "Error: UNAUTHENTICATED { code: 'UNAU…' }" instead of resolving | 1 | 1 | 0 | 0 |
| Error: promise resolved "undefined" instead of rejecting | 1 | 0 | 1 | 0 |
| ExtraPersistenceError: NOT_FOUND | 1 | 0 | 1 | 0 |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 1 | 1 | 0 | 0 |
| TypeError: Cannot convert undefined or null to object | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'connect') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'identity_user_id') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 | 0 | 1 | 0 |
| error: COMMAND_CONFLICT | 1 | 0 | 1 | 0 |
| error: SMALL_TRIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| error: STALE_REVISION | 1 | 1 | 0 | 0 |
| error: WORM_REFUSED | 1 | 0 | 1 | 0 |
| error: cannot alter type of a column used in a policy definition | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "merchant" | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "provider_event_inbox" | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "scope_identity" | 1 | 0 | 1 | 0 |
| error: permission denied for table jobguard_schema_migration | 1 | 1 | 0 | 0 |
| error: synthetic live job required | 1 | 0 | 1 | 0 |

### Diagnostics outside the hold in this round

| First diagnostic | Failed assertions |
| --- | ---: |
| Assertion mismatch | 131 |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 79 |
| error: new row violates row-level security policy for table "audit_event" | 21 |
| error: new row violates row-level security policy for table "recovery_attribution_revision" | 21 |
| TypeError: Cannot read properties of undefined (reading 'id') | 20 |
| error: new row violates row-level security policy for table "extra_origin" | 19 |
| error: function app.lp11_bind_shadow_job(unknown, unknown) does not exist | 17 |
| error: FORBIDDEN | 16 |
| error: new row violates row-level security policy for table "action_outbox" | 14 |
| error: FINAL_CHECK_FORBIDDEN | 13 |
| SyntaxError: Unexpected end of JSON input | 12 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 10 |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 9 |
| error: COMMAND_CONFLICT | 7 |
| error: EMERGENCY_REFUSED | 7 |
| WormCommandError: WORM_REFUSED | 7 |
| error: new row violates row-level security policy for table "accounting_observation_receipt" | 6 |
| error: new row violates row-level security policy for table "scope_identity" | 6 |
| error: NOT_FOUND | 5 |
| error: new row violates row-level security policy for table "evidence_upload" | 5 |
| Error: | 5 |
| error: CUSTOMER_REFUSED | 5 |
| TypeError: Cannot read properties of undefined (reading 'hash') | 5 |
| Error: ACCESS_REFUSED | 5 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 5 |
| Error: Synthetic tenant key registry operation refused | 5 |
| Error: MEMBERSHIP_FORBIDDEN | 4 |
| error: FINAL_ACCOUNT_LOCK_REQUIRED | 4 |
| Error: promise resolved "undefined" instead of rejecting | 4 |
| error: JOB_SOURCE_FORBIDDEN | 4 |
| error: new row violates row-level security policy for table "job_activation_terms" | 4 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 3 |
| error: DISCLOSURE_TERMS_NOT_ACCEPTED | 3 |
| Error: expected error: FORBIDDEN { length: 144, …(14) } to match object { code: '55000', …(1) } | 3 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 |
| error: new row violates row-level security policy for table "job" | 3 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 |
| MeterLifecyclePersistenceError: METER_FORBIDDEN | 3 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 |
| error: new row violates row-level security policy for table "account" | 3 |
| Error: STACK_TRACE_ERROR | 3 |
| Error: expected error: test upload not found { …(15) } to match object { code: '42501', …(1) } | 3 |
| error: new row violates row-level security policy for table "capture_source" | 2 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 |
| TypeError: Cannot read properties of undefined (reading 'reviewRequired') | 2 |
| Error: promise resolved "Result{ command: 'INSERT', …(9) }" instead of rejecting | 2 |
| Error: expected [Function] to throw error including 'TRIAL_COMPLETED_CARD_REQUIRED' but got 'TRIAL_SUBSCRIPTION_TERMS_REQUIRED' | 2 |
| error: SMALL_TRIP_FORBIDDEN | 2 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 |
| error: invalid reversal | 2 |
| Error: FORBIDDEN | 2 |
| Error: Cannot find module 'file:///workspace/jobguard-lp11-r5-connector/apps/api/dist/workspace/application.js' imported from /workspace/jobguard-lp11-r5-connector/packages/db/test/shadow-isolation-query-log.integration.test.ts | 2 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 2 |
| error: STALE_SSO_REQUIRED | 2 |
| Error: promise rejected "Error: MEMBERSHIP_FORBIDDEN { …(1) }" instead of resolving | 2 |
| TypeError: Cannot read properties of undefined (reading 'parties_snapshot') | 1 |
| Error: AUDIT_EXPORT_CHECKPOINT_REQUIRED | 1 |
| TypeError: Cannot convert undefined or null to object | 1 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 |
| Error: expected [Function] to throw error including 'CIS_FIXTURE_CONFLICT' but got 'CIS_FIXTURE_NOT_FOUND' | 1 |
| error: canceling statement due to statement timeout | 1 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 1 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23503' } | 1 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 |
| Error: Command failed: /workspace/.jobguard-runtime/node_modules/node/bin/node --input-type=module -e import pg from 'pg'; const v=JSON.parse(process.env.DD_FIXTURE); const p=new pg.Pool(v.config); try { const c=await p.connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('app.tenant_id',$1,true)",[v.tenant]); await c.query('SELECT app.direct_debit_fixture($1,$2,$3::jsonb,$4::jsonb,$5::uuid)',[v.tenant,'mandate',JSON.stringify(v.binding),JSON.stringify(v.event),null]); await c.query('COMMIT'); } finally { c.release(); } } finally { await p.end(); } | 1 |
| error: DD_NOT_FOUND | 1 |
| Error: promise resolved "'<uuid>'" instead of rejecting | 1 |
| ExtraPersistenceError: NOT_FOUND | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_NOT_COMPLETE' but got 'FINAL_ACCOUNT_LOCK_REQUIRED' | 1 |
| Error: FINAL_CHECK_FORBIDDEN | 1 |
| error: new row violates row-level security policy for table "trial_identity_snapshot" | 1 |
| error: TRIAL_IDENTITY_REQUIRED | 1 |
| error: new row violates row-level security policy for table "trial_end_source" | 1 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 |
| error: IMPORT_RECORD_REQUIRED | 1 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'null value in column "scope_item_id" …' | 1 |
| error: new row violates row-level security policy for table "evidence_link" | 1 |
| error: REQUEST_BINDING_REFUSED | 1 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 |
| Error: promise resolved "{ …(3) }" instead of rejecting | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'FINAL_CHECK_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'Fictional transaction failure' but got 'CAPACITY_ADMISSION_UNAVAILABLE' | 1 |
| Error: expected [Function] to throw error including 'synthetic rollback' but got 'new row violates row-level security p…' | 1 |
| error: new row violates row-level security policy for table "provider_event_inbox" | 1 |
| error: new row violates row-level security policy for table "merchant" | 1 |
| error: new row violates row-level security policy for table "watchdog_command_identity" | 1 |
| EvidencePackSourceError: EVIDENCE_PACK_CASE_NOT_FOUND | 1 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 |
| Error: FINAL_CHECK_PENDING | 1 |
| Error: expected [Function] to throw error matching /resolved/u but got 'expected error: FINAL_ACCOUNT_LOCK_RE…' | 1 |
| Error: expected [Function] to throw error matching /foreign key constraint/u but got 'new row violates row-level security p…' | 1 |
| error: synthetic live job required | 1 |
| error: cannot alter type of a column used in a policy definition | 1 |
| error: RETENTION_NOT_FOUND | 1 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 |
| Error: Dispatch did not block behind contractor revocation | 1 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 |
| Error: Cannot find module 'file:///workspace/jobguard-lp11-r5-connector/packages/ai/dist/shadow-proposal.js' imported from /workspace/jobguard-lp11-r5-connector/packages/db/test/shadow-detection.integration.test.ts | 1 |
| error: SSO_REQUIRED_FORBIDDEN | 1 |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 |
| error: FINAL_CHECK_LOCK_BINDING_INVALID | 1 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 |
| Error: expected Error: MEMBERSHIP_FORBIDDEN { …(1) } to match object { code: 'JOB_NOT_FOUND' } | 1 |
| error: WORM_REFUSED | 1 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 |

### Files that failed during setup outside the hold

- `test/UIWIRE-11.integration.test.ts` (FINAL_CHECK_FORBIDDEN)
- `test/job-sources-authority.integration.test.ts` (<no diagnostic>)
- `test/job-sources-isolation.integration.test.ts` (<no diagnostic>)
- `test/later-recovery-message-attempt.integration.test.ts` (REQUEST_BINDING_REFUSED)
- `test/lp1-membership-account.integration.test.ts` (<no diagnostic>)
- `test/managed-recovery.integration.test.ts` (COMMAND_CONFLICT)
- `test/merchant-ingestion.integration.test.ts` (EVIDENCE_PACK_CASE_NOT_FOUND)
- `test/outbox-discovery.integration.test.ts` (new row violates row-level security policy for table "action_outbox")
- `test/recovery-messages.integration.test.ts` (REQUEST_BINDING_REFUSED)
- `test/recovery-record-immutable.integration.test.ts` (<no diagnostic>)
- `test/sor-suggestion-confirmation.test.ts` (Cannot find package '@jobguard/core' imported from /workspace/jobguard-lp11-r5-connector/packages/ai/src/sor-suggestion.ts)

The 11 setup failures include `test/sor-suggestion-confirmation.test.ts`, which could not resolve `@jobguard/core` from the frozen worktree. The subsequent worktree has the workspace dependency link. The measured setup count includes this tooling failure. The held exceptions were identical by count to the preceding full round.

## r5 recovery worker terms and predecessor fixtures

The recovery-message worker claimed the approved action, but `app.guard_recovery_pursuit_terms` refused the sink insert with `RECOVERY_TERMS_NOT_APPROVED`. Its query could see the case and job but could not see the case's persisted `recovery_case_terms_approval`. The existing committed-signal and worker-binding check now covers that SELECT only for the action's exact job and case. The tenant policy retains its role membership, mode and proposed-row check. The delivery and first follow-up test passed, and the PostgreSQL migration, catalogue and tenant-policy batch passed 89 of 89. The full checked-product round had 79 `RECOVERY_MESSAGE_BLOCKED` assertions across three files. The current recovery batch measures what remains after the terms check passes.

Two predecessor fixture paths were running the post-0762 shadow binder against a schema from before that routine existed. They now seed certificates and manifests with the predecessor's shadow role and original triggers. All four focused upgrade assertions passed, including the cross-job movement attacks and the populated final-check snapshot.

```sh
nice -n 5 pnpm --filter @jobguard/db exec vitest run test/recovery-follow-up.integration.test.ts -t 'is a reviewed act bound' --maxWorkers=1 --reporter=default
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/migration-proof-loader.test.ts --maxWorkers=1 --reporter=default
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/final-check-upgrade.integration.test.ts test/receipt-movement-job-fk-upgrade.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-historical-shadow-fixture-results.json
```

### Bound setup and mutation controls

Fixtures use the owner membership they seeded when seeding recovery messages, source evidence and outbox rows. The recovery activation proxies reuse an existing binding only when both its tenant and actor match the fixture. The outbox-discovery wrong-company case still runs as an independently bound owner of the foreign company. Raw recovery clock and immutability checks likewise bind their exact fixture actor before running the original operations under the original database roles.

- Recovery message attempt isolation passed 2 of 2, job source authority and isolation passed 9 of 9, and outbox discovery passed 5 of 5. These files previously stopped during setup.
- UIWIRE-10 and UIWIRE-11 passed 4 of 4 after their synthetic worker fixture used the synthetic database. Their authority checks and PostgreSQL roles are unchanged.
- Recovery-record immutability passed 34 of 34, including scratch removals that prove the exact refusal assertions reach the immutable triggers. Before the bound owner change, 32 assertions failed after the delivery fixture began working.
- MIGFIX-8 passed 7 of 7. Before the bound runtime fixture change, five race assertions failed when the raw clock writer or scheduler reached tenant RLS with only a caller setting.
- Variation state and cross-tenant isolation passed 6 of 6 using the actual fixture owner for each tenant. The customer-evidence approval fixture passed 9 of 9 using its bound owner for source setup, with all six exact refusal assertions preserved.
- The initial recovery-message fixture rerun completed its setup and exposed 31 failed assertions of 108 before the worker terms patch was loaded. The later run measures the effect of that patch independently.

```sh
nice -n 9 pnpm --filter @jobguard/db exec vitest run test/recovery-messages.integration.test.ts test/later-recovery-message-attempt.integration.test.ts test/outbox-discovery.integration.test.ts test/job-sources-authority.integration.test.ts test/job-sources-isolation.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-fixture-activation-final-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/UIWIRE-10.integration.test.ts test/UIWIRE-11.integration.test.ts test/recovery-record-immutable.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-uiwire-immutable-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/recovery-record-immutable.integration.test.ts --maxWorkers=1 --reporter=default
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/migfix-8.integration.test.ts --maxWorkers=1 --reporter=default
nice -n 9 pnpm --filter @jobguard/db exec vitest run test/variation-state-transition.integration.test.ts test/later-variation-isolation.integration.test.ts test/customer-evidence-approval.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-variation-scope-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/customer-evidence-approval.integration.test.ts --maxWorkers=1 --reporter=default
```

## r5 application and guard verification

At `6c07625f3`, the API unit suite passed 4,507 of 4,509 tests across 261 files. The two failures in `apps/api/src/auth/context-boundary.test.ts` both report the inherited LP-10 predecessor-delivery callback at `packages/db/src/demo-seed.ts:107`, introduced by `7d3938aa3`. The assertions are **holds for the real repository: only the bridge, its definition, the worker queue, the retained synthetic sandbox and the rehearsal construct a tenant context** and **pins the approved list to files that exist and still construct, and it covers every file the real tree constructs in**. The pinned scanner and its hashes are unchanged.

The web unit suite passed 3,618 of 3,618 tests in 252 files. Workspace typecheck passed 7 of 7 tasks. The commercial-integrity guards each returned zero diagnostics, and all 253 guard tests passed.

```sh
nice -n 4 pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --testTimeout=30000 --exclude '**/*.integration.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-final-code-api-results.json
nice -n 4 pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-final-code-web-results.json
pnpm typecheck
node tools/commercial-integrity-current-source-guard.mjs
node tools/commercial-integrity-boundary.mjs
node --test --test-concurrency=1 tools/commercial-integrity-{current-source-guard,boundary}.test.mjs
```

## r5 closed-job check and bound fixture controls

A shadow worker with an authorized job could see its final-check rows but could not see the job's `job_work_state_event`. PostgreSQL therefore allowed `app.begin_final_check` to open a rerun for a closed job. The migration-owned reader now uses the existing exact-job shadow scope for that visibility check. The policy's proposed-row check is unchanged. Direct fixture calls that exercise the invoice gate and locked evidence invalidation now bind the recorded practice owner, and shadow controls use the checked job scope before supplying the deliberately invalid lock or cutoff.

The LP-1 membership and merchant-ingestion setups now use the membership actually seeded for the relevant tenant. The managed-recovery setup establishes the synthetic account and member in the administrative context before using that member's existing session to import a job. Its raw competing transaction binds the same session. The recovery-terms tests keep their negative same-UUID control by binding tenant B separately before seeding its own case. The message race tests bind the existing fixture owner before completing the competing command receipt. All original assertions continue to run.

| Cohort | Before focused repair | After focused repair |
| --- | --- | --- |
| Recovery follow-up | 73 failed assertions in the checked-product run | 79 passed together and the remaining audit-parity case passed on its isolated rerun |
| Recovery messages | 108 skipped due to setup, then 31 failed with setup fixed | 106 passed together and both remaining receipt races passed on their isolated rerun |
| Recovery case terms | 2 failed assertions in the first isolated run | 48 passed |
| Final-check reruns | 7 failed assertions in the checked-product run | 7 passed |
| Final-check invalidation lock | 5 failed assertions in the checked-product run | 5 passed |
| Practice invoice audit | 6 failed assertions in the checked-product run | 6 passed |
| LP-1 membership, merchant ingestion and managed recovery | 3 files stopped during setup in the checked-product run | 5, 7 and 24 passed respectively |

The catalogue, upgrade and tenant-policy rerun passed 89 of 89.

The snapshot used for the 23520e9cc whole run omitted the generated DB CLI build and one AI workspace dependency link. Its measured counts retain those errors. The corrected worktree passed the offline audit CLI's 14 tests and the SOR suggestion confirmation test using the same source and actual build outputs.

```sh
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/lp1-membership-account.integration.test.ts test/merchant-ingestion.integration.test.ts test/managed-recovery.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-admin-seed-results.json
nice -n 9 pnpm --filter @jobguard/db exec vitest run test/final-check-invalidation-lock.integration.test.ts test/final-check-rerun.integration.test.ts test/practice-invoice-audit.integration.test.ts test/managed-recovery.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-invalidation-managed-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/final-check-rerun.integration.test.ts test/recovery-case-terms.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-closed-final-check-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/recovery-follow-up.integration.test.ts -t 'R1 parity \(first entry\)' --maxWorkers=1 --reporter=default
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/recovery-messages.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-recovery-message-terms-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/recovery-messages.integration.test.ts -t 'a recovery command id is claimed tenant-wide' --maxWorkers=1 --reporter=default
pnpm --filter @jobguard/db build
nice -n 9 pnpm --filter @jobguard/db exec vitest run test/verify-audit-export-cli.test.ts --maxWorkers=1 --reporter=default
nice -n 9 pnpm --filter @jobguard/db exec vitest run test/sor-suggestion-confirmation.test.ts --maxWorkers=1 --reporter=default
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/migration-proof-loader.test.ts --maxWorkers=1 --reporter=default
```

## r5 SCIM permission and worker fixture checks

The permission probes now use the actual fixture company member, which makes the before-revocation positives and after-revocation negatives exercise the same bound company. The queued-execution probes invoke the separate LP-10 worker login and preserve the existing no-attempt, no-adapter-call and persisted outbox assertions. The forced-policy and immutability checks bind that company only at the positive control or before the authorized owner's mutation attempt. Missing, malformed and foreign caller settings still carry no binding.

Both PostgreSQL SCIM files passed all 37 tests. The checked-product run had 10 failures in SCIM access and two failures in SCIM deactivation. Both groups now have zero failures in the focused run.

```sh
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/scim-deactivation.integration.test.ts test/scim-deactivation-access.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-scim-bound-results.json
```

## r5 emergency sign-in and SCIM machine authentication

The dual-owner route was trying to read company membership before it could establish a normal request binding during an SSO outage. Its private scope now starts from the locked, live session and exact CSRF credential, then checks the selected company's active owner under the existing advisory lock. The mailbox route likewise derives its company from the proved identity's active membership and rechecks under the lock. The scope is available only inside the existing synthetic identity entry points. The business and audit predicates check the stored scope, and the audit predicates also match the exact event, subject and actor. Scope cleanup leaves the existing emergency business operations insert-only.

SCIM provisioning now selects the one requested binding under a private lookup, proves the token, expiry and enabled state, and rechecks them under the company lock. Writes and replay reads for SCIM resources and receipts are restricted to that binding. Revocation can reach the existing SCIM deactivation routine only for the authenticated binding's connection. The machine login and its system audit attribution stay distinct from human requests.

The PostgreSQL identity batch passed all 55 tests, including every LP-6a binding test and its exact relation-lock assertion. The checked-product run had 34 failures in the five emergency and enterprise files. There were six enterprise-access, seven emergency-token, 11 emergency-window, eight owner-emergency and two concurrency failures. Each group passed in the focused rerun. The exact ownership check now expects `jobguard_session_lookup` for the read-only SSO state projection and `jobguard_migration` for the checked detail routine. The catalogue, migration and all permissive policy checks passed 89 of 89. The proof records 1,366 effective-privilege changes, 752 upgrade changes and 634 policy changes.

```sh
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/enterprise-access.integration.test.ts test/sso-emergency-token.integration.test.ts test/sso-emergency-window.integration.test.ts test/sso-emergency.integration.test.ts test/sso-emergency-concurrency.integration.test.ts test/lp6a-binding.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-identity-emergency-final-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/migration-proof-loader.test.ts --maxWorkers=1 --reporter=default
node tools/commercial-integrity-current-source-guard.mjs
node tools/commercial-integrity-boundary.mjs
```

## r5 synthetic tenant-key registry fixtures

The assurance-only registry tests now bind independently seeded owners for the two companies after checking the empty predecessor. The assurance login gets the existing request-binding functions inside the test cluster and retains its independent role. Its cross-company controls exercise the actual visible and proposed rows with the original exact errors. All eight tests passed on PostgreSQL, up from one passing and seven failing in the checked-product round.

```sh
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/tenant-key-registry.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-tenant-keys-results.json
```

## r5 full PostgreSQL run at 6c07625f3

All 878 files completed on PostgreSQL 16.10. 584 files passed and 294 failed. The 7,994 tests included 6,183 passed, 1,345 failed, 447 skipped and 19 todo. Vitest recorded 0 unhandled errors.

The failure count contains 841 direct held-fixture assertions and 1 missing pg_dump assertion. Another 21 files stopped during setup at the held fixture. The other 503 failed assertions and 15 setup-only failures keep LP-11 RED.

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=4 --passWithNoTests --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-residual-full-results.json
```

The table follows original r4 non-held assertion failures by file and test name. A row still failing can have reached a different failure in the later code.

| r4 diagnostic | r4 failures | Passed in this round | Failed in this round | Skipped or absent |
| --- | ---: | ---: | ---: | ---: |
| error: JOB_PARTIES_REQUIRED | 1081 | 963 | 114 | 4 |
| error: JOB_NOT_FOUND | 304 | 281 | 23 | 0 |
| Assertion mismatch | 90 | 18 | 72 | 0 |
| error: NOT_FOUND | 59 | 55 | 4 | 0 |
| error: CUSTOMER_REFUSED | 55 | 55 | 0 | 0 |
| Error: RECOVERY_REVIEWER_FORBIDDEN | 49 | 49 | 0 | 0 |
| error: new row violates row-level security policy for table "fee_reservation_book" | 39 | 38 | 0 | 1 |
| error: SSO_REQUIRED_FORBIDDEN | 38 | 32 | 6 | 0 |
| error: new row violates row-level security policy for table "evidence_upload" | 37 | 37 | 0 | 0 |
| error: new row violates row-level security policy for table "membership" | 33 | 33 | 0 | 0 |
| PracticeFeedRepositoryError: PRACTICE_FEED_FORBIDDEN | 19 | 19 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'id') | 18 | 13 | 5 | 0 |
| error: job not found | 17 | 17 | 0 | 0 |
| error: new row violates row-level security policy for table "audit_event" | 17 | 1 | 16 | 0 |
| OidcError: OIDC_REFUSED | 16 | 16 | 0 | 0 |
| Error: UNAUTHENTICATED | 13 | 13 | 0 | 0 |
| Error: promise rejected "SsoError: SSO_FORBIDDEN { code: 'SSO…' }" instead of resolving | 13 | 13 | 0 | 0 |
| error: new row violates row-level security policy for table "action_outbox" | 12 | 12 | 0 | 0 |
| SsoError: SSO_FORBIDDEN | 9 | 6 | 3 | 0 |
| error: UNAUTHENTICATED | 9 | 9 | 0 | 0 |
| error: new row violates row-level security policy for table "input_event" | 9 | 9 | 0 | 0 |
| WormCommandError: WORM_REFUSED | 7 | 0 | 7 | 0 |
| error: EMERGENCY_REFUSED | 7 | 0 | 7 | 0 |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 6 | 0 | 6 | 0 |
| Error: ACCESS_REFUSED | 5 | 0 | 5 | 0 |
| Error: Synthetic tenant key registry operation refused | 5 | 0 | 5 | 0 |
| WatchdogError: JOB_NOT_LIVE | 5 | 5 | 0 | 0 |
| error: FORBIDDEN | 5 | 2 | 3 | 0 |
| error: INVALID_TRANSITION | 5 | 4 | 1 | 0 |
| error: new row violates row-level security policy for table "job" | 5 | 1 | 4 | 0 |
| Error: NOT_FOUND | 4 | 3 | 1 | 0 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 4 | 0 | 4 | 0 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 | 1 | 3 | 0 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 | 0 | 4 | 0 |
| error: new row violates row-level security policy for table "account" | 4 | 1 | 3 | 0 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 | 0 | 3 | 0 |
| Error: promise rejected "error: SSO_REQUIRED_FORBIDDEN { …(15) }" instead of resolving | 3 | 3 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 | 0 | 3 | 0 |
| Error: FORBIDDEN | 2 | 0 | 2 | 0 |
| Error: expected Error: RECOVERY_REVIEWER_FORBIDDEN { code: '…' } to match object { Object (code) } | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_SOURCE_CONFLICT' but got 'cannot execute INSERT in a read-only …' | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'JOB_NOT_FOUND' | 2 | 0 | 2 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_SOURCE_NOT_RECOGNISED' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 2 | 2 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23503' } | 2 | 2 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 | 0 | 2 | 0 |
| Error: jobguard_session_lookup does not have the required least-privilege posture | 2 | 2 | 0 | 0 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 2 | 1 | 1 | 0 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 | 0 | 2 | 0 |
| TypeError: Cannot read properties of undefined (reading 'revision') | 2 | 2 | 0 | 0 |
| error: STALE_SSO_REQUIRED | 2 | 0 | 2 | 0 |
| error: cannot execute INSERT in a read-only transaction | 2 | 1 | 1 | 0 |
| error: invalid reversal | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "capture_source" | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 2 | 1 | 1 | 0 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 | 0 | 1 | 0 |
| Error: Dispatch did not block behind contractor revocation | 1 | 0 | 1 | 0 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: FINAL_CHECK_FORBIDDEN | 1 | 1 | 0 | 0 |
| Error: MEMBERSHIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: STACK_TRACE_ERROR | 1 | 1 | 0 | 0 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 | 0 | 1 | 0 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_DEPENDENCY_HELD' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'IDEMPOTENCY_PAYLOAD_CONFLICT' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_NOT_LIVE' but got 'JOB_NOT_FOUND' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'NOT_FOUND' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_CASE_NOT_FOUND' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'REQUEST_BINDING_REFUSED' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'TEST-WORKER-pending' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'UNAUTHENTICATED' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'fixture audit failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'rollback' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic migration failure' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic rollback' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 1 | 0 | 1 | 0 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 | 0 | 1 | 0 |
| Error: expected error: JOB_NOT_FOUND { …(15) } to match object { code: '23505' } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { Object (code) } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 | 0 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'AGREEMENT_INELIGIBLE' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'COLLECTION_REFUSED' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: query returned no rows { …(15) } to match object { code: '23514' } | 1 | 1 | 0 | 0 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 | 0 | 1 | 0 |
| Error: promise rejected "Error: UNAUTHENTICATED { code: 'UNAU…' }" instead of resolving | 1 | 1 | 0 | 0 |
| Error: promise resolved "undefined" instead of rejecting | 1 | 0 | 1 | 0 |
| ExtraPersistenceError: NOT_FOUND | 1 | 0 | 1 | 0 |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 1 | 1 | 0 | 0 |
| TypeError: Cannot convert undefined or null to object | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'connect') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'identity_user_id') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 | 0 | 1 | 0 |
| error: COMMAND_CONFLICT | 1 | 0 | 1 | 0 |
| error: SMALL_TRIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| error: STALE_REVISION | 1 | 1 | 0 | 0 |
| error: WORM_REFUSED | 1 | 0 | 1 | 0 |
| error: cannot alter type of a column used in a policy definition | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "merchant" | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "provider_event_inbox" | 1 | 1 | 0 | 0 |
| error: new row violates row-level security policy for table "scope_identity" | 1 | 0 | 1 | 0 |
| error: permission denied for table jobguard_schema_migration | 1 | 1 | 0 | 0 |
| error: synthetic live job required | 1 | 0 | 1 | 0 |

### Diagnostics outside the hold in this round

| First diagnostic | Failed assertions |
| --- | ---: |
| Assertion mismatch | 122 |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 79 |
| error: new row violates row-level security policy for table "audit_event" | 18 |
| error: function app.lp11_bind_shadow_job(unknown, unknown) does not exist | 17 |
| error: FORBIDDEN | 15 |
| error: FINAL_CHECK_FORBIDDEN | 13 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 9 |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 9 |
| error: COMMAND_CONFLICT | 7 |
| error: EMERGENCY_REFUSED | 7 |
| WormCommandError: WORM_REFUSED | 7 |
| error: new row violates row-level security policy for table "accounting_observation_receipt" | 6 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 6 |
| error: new row violates row-level security policy for table "scope_identity" | 6 |
| error: NOT_FOUND | 5 |
| error: new row violates row-level security policy for table "evidence_upload" | 5 |
| Error: | 5 |
| error: CUSTOMER_REFUSED | 5 |
| TypeError: Cannot read properties of undefined (reading 'hash') | 5 |
| Error: ACCESS_REFUSED | 5 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 5 |
| Error: Synthetic tenant key registry operation refused | 5 |
| Error: MEMBERSHIP_FORBIDDEN | 4 |
| error: FINAL_ACCOUNT_LOCK_REQUIRED | 4 |
| Error: promise resolved "undefined" instead of rejecting | 4 |
| error: JOB_SOURCE_FORBIDDEN | 4 |
| error: new row violates row-level security policy for table "job_activation_terms" | 4 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 |
| Error: STACK_TRACE_ERROR | 4 |
| error: DISCLOSURE_TERMS_NOT_ACCEPTED | 3 |
| Error: expected error: FORBIDDEN { length: 144, …(14) } to match object { code: '55000', …(1) } | 3 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 |
| error: cannot alter type of a column used in a policy definition | 3 |
| error: new row violates row-level security policy for table "job" | 3 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 |
| MeterLifecyclePersistenceError: METER_FORBIDDEN | 3 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 |
| error: new row violates row-level security policy for table "account" | 3 |
| error: new row violates row-level security policy for table "action_outbox" | 3 |
| Error: expected error: test upload not found { …(15) } to match object { code: '42501', …(1) } | 3 |
| TypeError: Cannot convert undefined or null to object | 2 |
| error: new row violates row-level security policy for table "capture_source" | 2 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 |
| TypeError: Cannot read properties of undefined (reading 'reviewRequired') | 2 |
| Error: promise resolved "Result{ command: 'INSERT', …(9) }" instead of rejecting | 2 |
| Error: expected [Function] to throw error including 'TRIAL_COMPLETED_CARD_REQUIRED' but got 'TRIAL_SUBSCRIPTION_TERMS_REQUIRED' | 2 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 |
| TypeError: Cannot read properties of undefined (reading 'id') | 2 |
| error: invalid reversal | 2 |
| Error: FORBIDDEN | 2 |
| Error: Cannot find module 'file:///workspace/jobguard-lp11-r5-residual/apps/api/dist/workspace/application.js' imported from /workspace/jobguard-lp11-r5-residual/packages/db/test/shadow-isolation-query-log.integration.test.ts | 2 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 2 |
| error: STALE_SSO_REQUIRED | 2 |
| Error: promise rejected "Error: MEMBERSHIP_FORBIDDEN { …(1) }" instead of resolving | 2 |
| TypeError: Cannot read properties of undefined (reading 'parties_snapshot') | 1 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 |
| Error: expected [Function] to throw error including 'CIS_FIXTURE_CONFLICT' but got 'CIS_FIXTURE_NOT_FOUND' | 1 |
| error: canceling statement due to statement timeout | 1 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 1 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 |
| Error: Command failed: /workspace/.jobguard-runtime/node_modules/node/bin/node --input-type=module -e import pg from 'pg'; const v=JSON.parse(process.env.DD_FIXTURE); const p=new pg.Pool(v.config); try { const c=await p.connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('app.tenant_id',$1,true)",[v.tenant]); await c.query('SELECT app.direct_debit_fixture($1,$2,$3::jsonb,$4::jsonb,$5::uuid)',[v.tenant,'mandate',JSON.stringify(v.binding),JSON.stringify(v.event),null]); await c.query('COMMIT'); } finally { c.release(); } } finally { await p.end(); } | 1 |
| error: DD_NOT_FOUND | 1 |
| Error: promise resolved "'<uuid>'" instead of rejecting | 1 |
| ExtraPersistenceError: NOT_FOUND | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_NOT_COMPLETE' but got 'FINAL_ACCOUNT_LOCK_REQUIRED' | 1 |
| Error: FINAL_CHECK_FORBIDDEN | 1 |
| error: new row violates row-level security policy for table "trial_identity_snapshot" | 1 |
| error: TRIAL_IDENTITY_REQUIRED | 1 |
| error: new row violates row-level security policy for table "trial_end_source" | 1 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 |
| error: IMPORT_RECORD_REQUIRED | 1 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'null value in column "scope_item_id" …' | 1 |
| error: new row violates row-level security policy for table "evidence_link" | 1 |
| error: REQUEST_BINDING_REFUSED | 1 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 |
| Error: promise resolved "{ …(3) }" instead of rejecting | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'FINAL_CHECK_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'Fictional transaction failure' but got 'CAPACITY_ADMISSION_UNAVAILABLE' | 1 |
| error: SMALL_TRIP_FORBIDDEN | 1 |
| error: new row violates row-level security policy for table "merchant" | 1 |
| error: new row violates row-level security policy for table "watchdog_command_identity" | 1 |
| EvidencePackSourceError: EVIDENCE_PACK_CASE_NOT_FOUND | 1 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 |
| Error: FINAL_CHECK_PENDING | 1 |
| Error: expected [Function] to throw error matching /resolved/u but got 'expected error: FINAL_ACCOUNT_LOCK_RE…' | 1 |
| error: synthetic live job required | 1 |
| error: RETENTION_NOT_FOUND | 1 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 |
| Error: Dispatch did not block behind contractor revocation | 1 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 |
| Error: Cannot find module 'file:///workspace/jobguard-lp11-r5-residual/packages/ai/dist/shadow-proposal.js' imported from /workspace/jobguard-lp11-r5-residual/packages/db/test/shadow-detection.integration.test.ts | 1 |
| error: SSO_REQUIRED_FORBIDDEN | 1 |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 |
| error: FINAL_CHECK_LOCK_BINDING_INVALID | 1 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 |
| Error: expected Error: MEMBERSHIP_FORBIDDEN { …(1) } to match object { code: 'JOB_NOT_FOUND' } | 1 |
| error: WORM_REFUSED | 1 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 |

### Files that failed during setup outside the hold

- `test/UIWIRE-11.integration.test.ts` (FINAL_CHECK_FORBIDDEN)
- `test/cis-fixture-route.integration.test.ts` ([vitest] There was an error when mocking a module. If you are using "vi.mock" factory, make sure there are no top level variables inside, since this call is hoisted to top of the file. Read more: https://vitest.dev/api/vi.html#vi-mock)
- `test/cloudflare-northside-pool.integration.test.ts` (Cannot find package '@jobguard/api/identity' imported from /workspace/jobguard-lp11-r5-residual/apps/web/app/lib/linked-practice-entry.ts)
- `test/inbox-metrics.integration.test.ts` ([vitest] There was an error when mocking a module. If you are using "vi.mock" factory, make sure there are no top level variables inside, since this call is hoisted to top of the file. Read more: https://vitest.dev/api/vi.html#vi-mock)
- `test/job-sources-authority.integration.test.ts` (<no diagnostic>)
- `test/job-sources-isolation.integration.test.ts` (<no diagnostic>)
- `test/later-recovery-message-attempt.integration.test.ts` (REQUEST_BINDING_REFUSED)
- `test/lp1-membership-account.integration.test.ts` (<no diagnostic>)
- `test/managed-recovery.integration.test.ts` (COMMAND_CONFLICT)
- `test/merchant-ingestion.integration.test.ts` (EVIDENCE_PACK_CASE_NOT_FOUND)
- `test/notice-fixture-route.integration.test.ts` (Cannot find package '@jobguard/api/workspace' imported from /workspace/jobguard-lp11-r5-residual/apps/web/app/api/jobs/[id]/notice-fixtures/route.ts)
- `test/outbox-discovery.integration.test.ts` (new row violates row-level security policy for table "action_outbox")
- `test/recovery-messages.integration.test.ts` (REQUEST_BINDING_REFUSED)
- `test/recovery-record-immutable.integration.test.ts` (<no diagnostic>)
- `test/vat-fixture-route.integration.test.ts` (Cannot find package '@jobguard/api/workspace' imported from /workspace/jobguard-lp11-r5-residual/apps/web/app/api/jobs/[id]/vat-fixtures/route.ts)

### Named exceptions in this round

- `test/lp6a-practice-restore.integration.test.ts` — upgrades dark, round-trips a logical binding-table dump into a fresh cluster and rejects carried rows even at a colliding xid8

The 21 setup files directly reaching the held insert at `packages/db/src/work-order-fixtures.ts:71` have the same names as [the original 21 setup files](#tests-skipped-when-a-held-fixture-failed-during-setup). The 841 direct assertion names are [the original list](#tests-that-reached-the-held-work-order-fixture) except `test/cloudflare-northside-pool.integration.test.ts` — LATER-SAFETY-141: one client times out under the seed lock; the Cloudflare pool stores the complete Northside seed. Its API identity import failed before the assertion in this snapshot.

Five of the 15 other setup failures were import failures in the frozen worktree. The CIS and inbox route fixtures could not resolve API build output, and the Northside, notice and VAT route fixtures could not resolve the API identity or workspace exports. The counts above include these five. The next frozen worktree builds the API and uses its own package link, alongside the DB build and AI dependency link.

## r5 customer stage and variation acknowledgements

The earlier full run recorded seven failed customer-stage assertions and five failed customer-variation assertions. The customer portal authenticated the session and then closed its protected scope before `identity.customer_stages` and `identity.customer_variation` read their source rows. Stage tests that attempted an acknowledgement also exposed an audit policy refusal once the stage reads were repaired.

Both routines now retain the checked portal job and session through lock, recheck, write and audit. Stage visibility is read-only for source rows and qualifies indirect invalidations and reviews by the job. Stage acknowledgements require the same job and customer, with their exact session additionally checked at write time. Variation writes are limited to the selected variation, approval command, scope item and first claim on the matching existing catch case. The audit policy admits only the exact event and subject recorded in each protected scope.

The customer stage suite passed 7 of 7 and the variation suite passed 20 of 20 on PostgreSQL 16.10. The two populated upgrade comparisons and ten independent policy, binding, view and pool tests passed. The proof stores 1,385 privilege and routine changes and 765 upgrade changes, including 645 policy changes.

```sh
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/customer-stage-acknowledgement.integration.test.ts test/customer-variation-approval.integration.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-stage-variation-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp-0-authz-record.test.ts test/lp11-bound-tenant-rls.integration.test.ts --maxWorkers=1 --reporter=default
```

The third filename in the second command matched no file. The remaining three files ran all 12 tests. The separate loader initially rejected two comparisons where the new proof used a live routine digest in place of the predecessor's baseline metadata. After matching that metadata, all 77 loader tests passed. Both commercial-integrity guard commands completed with zero diagnostics.

```sh
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/migration-proof-loader.test.ts --maxWorkers=1 --reporter=default
nice -n 6 node tools/commercial-integrity-current-source-guard.mjs
nice -n 6 node tools/commercial-integrity-boundary.mjs
```

## r5 synthetic accounting receipt binding

The shadow login's direct INSERT had no request row, so the receipt policy rejected six of seven integration cases. The migration now opens a private scope for the exact receipt tuple from the synthetic shadow login. The INSERT retains the tenant-qualified job foreign key and compares any existing request tenant to the requested tenant. Within the original atomic batch a later receipt can advance the exact key and job within that tenant. A different tenant is refused, and the scope is invisible to a subsequent transaction on the same connection.

Six assertions failed before the change and none failed afterward. All eight integration tests and four unit tests passed, including a new check for two same-tenant jobs in one batch, a wrong-tenant proposal, commit and rollback reuse. The complete targeted run passed 101 of 101 including both upgrade proofs, 77 proof-loader tests and all ten catalog and pool tests. The populated PostgreSQL proof now records 1,393 LP0 changes and 771 upgrade changes including 647 policies. Both commercial-integrity guards reported zero diagnostics.

```sh
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/accounting-observation-receipt.test.ts test/accounting-observation-receipt.integration.test.ts test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/migration-proof-loader.test.ts test/lp11-bound-tenant-rls.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-accounting-final-results.json
nice -n 7 node tools/commercial-integrity-current-source-guard.mjs
nice -n 7 node tools/commercial-integrity-boundary.mjs
```

## r5 bound operative and job-source fixtures

Seven failures outside the hold in the retained-workspace, operative and server-entitlement suites fell to zero. Six were rejected track setup writes under `jobguard_migration`. The seventh used an unbound INSERT SELECT, which read no membership and therefore never exercised the agreement lock. The fixture now binds its original contractor before taking the same migration role, so inserts reach the target policy and the lock assertions remain exact. One denial query used SQL AND, which could skip the feature guard after the membership read returned false. The test now checks both outcomes separately and still requires the same `42501 REQUEST_BINDING_REFUSED` from the feature guard.

The PostgreSQL run passed 19 of 23. The other four reached the held customer insert and are already [listed by name](#tests-that-reached-the-held-work-order-fixture).

All eight failures in the CH-4 source tests fell to zero. Reads of stored source receipts and writes in the copied database fixture now bind the exact job owner. The original stage and shadow roles, source checks, row comparisons and commitment order are exercised. All 14 assertions passed.

```sh
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/contractor-retained-read-boundaries.integration.test.ts test/operative-entitlements.integration.test.ts test/server-entitlements.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-operative-bound-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/job-work-state-sources.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-work-sources-results.json
```

## r5 application and guard reruns at 5ef7a5b87

The API unit run passed 4,507 of 4,509 tests in 260 of 261 files. Both failing checks in `apps/api/src/auth/context-boundary.test.ts` detect the tenant-context constructor call at `packages/db/src/demo-seed.ts:107` from LP-10 commit `7d3938aa3`. The context scanner, its reviewed file set and the held fixture remain untouched.

- `holds for the real repository: only the bridge, its definition, the worker queue, the retained synthetic sandbox and the rehearsal construct a tenant context`
- `pins the approved list to files that exist and still construct, and it covers every file the real tree constructs in`

The web unit suite passed 3,618 of 3,618 tests in 252 files. Workspace typecheck passed in all seven packages. Both guard CLIs returned zero diagnostics and all 253 guard tests passed.

```sh
nice -n 4 pnpm --filter @jobguard/db build
nice -n 4 pnpm typecheck
nice -n 4 pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --testTimeout=30000 --exclude '**/*.integration.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-identity-api-results.json
nice -n 4 pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-identity-web-results.json
node tools/commercial-integrity-current-source-guard.mjs
node tools/commercial-integrity-boundary.mjs
nice -n 9 node --test --test-concurrency=1 tools/commercial-integrity-{current-source-guard,boundary}.test.mjs
```

## r5 queued outbox compatibility, private shadow reads and exact upgrade snapshots

Eight queued outbox revocation cases failed when `ActionExecutor` tried to read its tenant row through an unbound web transaction. The worker path now checks the expected identity against the committed signal using the existing isolated LP-10 login. The same protected action scope guards claim, and both reconciliation transactions recheck the scope. A bound request still checks visibility through its own transaction before opening a worker connection. The provider result remains fenced by the worker claim token.

The three PostgreSQL suites passed 40 of 40 across the final results. All 15 revocation and 16 worker login tests passed in the grouped run. Its remaining later-outbox test reached a fixture that tried to bind a second credential. The fixture now asserts its original binding and verifies the exact current idempotent track insert, and all nine later-outbox tests passed on rerun. Eight related unit files passed 107 of 107.

Runtime no longer has direct EXECUTE on the two shadow subject helpers. Migration-owned, exact SELECT and INSERT policies grant the original decision and invalidation reads for the protected job. The frozen enterprise live-prompt test passed its callable-shadow check, and 47 real final-check tests and 89 upgrade, proof-loader and tenant policy checks passed. The catalogue proof has 1,393 LP0 changes and 775 upgrade changes including 650 policy changes.

Seven populated upgrade comparisons now expect the exact list of empty LP-11 bookkeeping tables alongside every previous row and ACL. All seven targeted assertions passed. The individual migration step comparisons retain their original expectations.

Workspace typecheck passed all seven packages. Both commercial-integrity guards returned zero diagnostics with the same eleven reviewed unresolved sites. Each commercial baseline refreshed only its existing `ActionExecutor` delegation at `packages/db/src/outbox.ts:44`, from `61b190ba5ae9f0ef247899985aea9adbb07f3017ed64d28657359cb3b4691afa` to `0807fb800a3f657160d684c53c952eebd78255cac565dfc707f430827016c09b`. The change covers the newly checked worker delegation and keeps the previously reviewed commercial data boundary.

```sh
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/serious-b10-outbox-revocation.integration.test.ts test/lp-10-worker-login.integration.test.ts test/later-outbox.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-worker-compat-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/later-outbox.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-later-outbox-final2-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run src/outbox-worker-cutover.test.ts src/serious-b10.test.ts src/worker-action-executor.test.ts src/later-outbox.test.ts src/outbox.test.ts test/ops-alerts.test.ts test/purchase-order-action.test.ts src/audit-fix-dbsrc-08.test.ts --maxWorkers=2 --reporter=default
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/enterprise-live-prompt-access.integration.test.ts -t 'no new callable routine grants access to shadow storage' --maxWorkers=1 --reporter=default
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/final-check-invalidation-lock.integration.test.ts test/final-check-rerun.integration.test.ts test/real-fc-ordinary-words.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-shadow-role-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/migration-proof-loader.test.ts test/lp11-bound-tenant-rls.integration.test.ts --maxWorkers=1 --reporter=default
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/subscription-internal-owner.integration.test.ts test/subscription-pending-downgrade.integration.test.ts test/subscription-attempt-reconciliation.integration.test.ts -t 'populated' --maxWorkers=1 --reporter=default
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/builder-acceptance-sent-head.integration.test.ts test/extra-proceed-raiser-upgrade.integration.test.ts test/extra-proceed-upgrade.integration.test.ts test/lp-10-worker-login-upgrade.integration.test.ts -t 'predecessor defect|populated upgrade|upgrades populated|0761 preserves populated' --maxWorkers=1 --reporter=default
nice -n 4 pnpm typecheck
nice -n 7 node tools/commercial-integrity-current-source-guard.mjs
nice -n 7 node tools/commercial-integrity-boundary.mjs
```

## r5 scheduled readiness, verified uploads and bound fixture writes

| PostgreSQL group | Failures at 6c07625f3 | Failures in the focused rerun |
| --- | ---: | ---: |
| Readiness discovery and task execution | 10 | 0 |
| Readiness immutability through the migration login | 1 | 0 |
| Verified-upload immutability and maintenance | 4 | 0 |
| Work-state storage authority and guard order | 3 | 0 |
| Proposal-total fixtures | 2 | 0 |
| Ordinary safe draft fixture | 1 | 0 |

Readiness discovery runs through the existing synthetic infrastructure entry point. It checks its database and authority, enumerates registered tenants one at a time, and returns only due task identifiers. The isolated worker checks the persisted plan under an exact tenant, job and task scope and checks the plan hash and proposal scope before storing a proposal. The stored plan supplies the legacy audit sealer's scalar tenant input. RLS checks the protected transaction scope with the exact audit event, job and task. The transaction closes the scope on success, and an error rolls it back. Twelve timer cases passed, including the new check for a foreign caller setting, a mismatched task and a wrong-tenant proposed row.

The verified-upload probe still uses a migration-owned definer and expects the exact immutable-upload error from all three product logins. A test-only allowlist exposes only the registered fixture row so those calls reach the trigger. The lock trigger preserves the earlier immutable-upload denial when a privileged caller supplies an existing verified row without a binding. The bound and authorized paths retain their existing lock and invalidation behavior. Four immutability and five final-check lock tests passed.

The historical timezone controls run their predecessor routine and policy in a rolled-back administrative test transaction. The post-lock, proposal-total and safe-draft assertions use their persisted fixture actor. The forged runtime command remains unbound. Eight work-state boundary and 21 proposal-total and job-door cases passed. The focused readiness application tests passed 11 of 11. Workspace typecheck passed all seven packages, and both commercial-integrity guard commands returned zero diagnostics.

```sh
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/readiness-timer.integration.test.ts test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-readiness-final-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/verified-upload-immutable.integration.test.ts test/final-check-invalidation-lock.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-verified-upload-final-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts --maxWorkers=1 --reporter=default
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/job-work-state-commands-boundaries.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-commands-binding-final-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/later-proposal-totals.integration.test.ts test/lp-job-doors.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-draft-proposal-results.json
nice -n 6 pnpm --filter @jobguard/api exec vitest run src/readiness-task.test.ts src/readiness-store.test.ts --maxWorkers=1 --reporter=default
nice -n 6 pnpm typecheck
nice -n 7 node tools/commercial-integrity-current-source-guard.mjs
nice -n 7 node tools/commercial-integrity-boundary.mjs
```

## r5 full PostgreSQL run at 5ef7a5b87

All 878 files completed on PostgreSQL 16.10. 632 files passed and 246 failed. The 8,012 tests included 6,586 passed, 1,156 failed, 251 skipped and 19 todo. Vitest recorded 2 unhandled errors.

The failure count contains 842 direct held-fixture assertions and 1 missing pg_dump assertion. Another 21 files stopped during setup at the held fixture. The other 313 failed assertions and 0 setup-only failures keep LP-11 RED.

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=4 --passWithNoTests --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-identity-full-results.json
```

The table follows original r4 non-held assertion failures by file and test name. A row still failing can have reached a different failure in the later code.

| r4 diagnostic | r4 failures | Passed in this round | Failed in this round | Skipped or absent |
| --- | ---: | ---: | ---: | ---: |
| error: JOB_PARTIES_REQUIRED | 1081 | 985 | 95 | 1 |
| error: JOB_NOT_FOUND | 304 | 295 | 9 | 0 |
| Assertion mismatch | 90 | 38 | 52 | 0 |
| error: NOT_FOUND | 59 | 55 | 4 | 0 |
| error: CUSTOMER_REFUSED | 55 | 55 | 0 | 0 |
| Error: RECOVERY_REVIEWER_FORBIDDEN | 49 | 49 | 0 | 0 |
| error: new row violates row-level security policy for table "fee_reservation_book" | 39 | 38 | 0 | 1 |
| error: SSO_REQUIRED_FORBIDDEN | 38 | 36 | 2 | 0 |
| error: new row violates row-level security policy for table "evidence_upload" | 37 | 37 | 0 | 0 |
| error: new row violates row-level security policy for table "membership" | 33 | 33 | 0 | 0 |
| PracticeFeedRepositoryError: PRACTICE_FEED_FORBIDDEN | 19 | 19 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'id') | 18 | 13 | 5 | 0 |
| error: job not found | 17 | 17 | 0 | 0 |
| error: new row violates row-level security policy for table "audit_event" | 17 | 1 | 16 | 0 |
| OidcError: OIDC_REFUSED | 16 | 16 | 0 | 0 |
| Error: UNAUTHENTICATED | 13 | 13 | 0 | 0 |
| Error: promise rejected "SsoError: SSO_FORBIDDEN { code: 'SSO…' }" instead of resolving | 13 | 13 | 0 | 0 |
| error: new row violates row-level security policy for table "action_outbox" | 12 | 12 | 0 | 0 |
| SsoError: SSO_FORBIDDEN | 9 | 9 | 0 | 0 |
| error: UNAUTHENTICATED | 9 | 9 | 0 | 0 |
| error: new row violates row-level security policy for table "input_event" | 9 | 9 | 0 | 0 |
| WormCommandError: WORM_REFUSED | 7 | 0 | 7 | 0 |
| error: EMERGENCY_REFUSED | 7 | 7 | 0 | 0 |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 6 | 6 | 0 | 0 |
| Error: ACCESS_REFUSED | 5 | 5 | 0 | 0 |
| Error: Synthetic tenant key registry operation refused | 5 | 5 | 0 | 0 |
| WatchdogError: JOB_NOT_LIVE | 5 | 5 | 0 | 0 |
| error: FORBIDDEN | 5 | 2 | 3 | 0 |
| error: INVALID_TRANSITION | 5 | 4 | 1 | 0 |
| error: new row violates row-level security policy for table "job" | 5 | 1 | 4 | 0 |
| Error: NOT_FOUND | 4 | 3 | 1 | 0 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 4 | 0 | 4 | 0 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 | 3 | 1 | 0 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 | 0 | 4 | 0 |
| error: new row violates row-level security policy for table "account" | 4 | 1 | 3 | 0 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 | 0 | 3 | 0 |
| Error: promise rejected "error: SSO_REQUIRED_FORBIDDEN { …(15) }" instead of resolving | 3 | 3 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 | 0 | 3 | 0 |
| Error: FORBIDDEN | 2 | 0 | 2 | 0 |
| Error: expected Error: RECOVERY_REVIEWER_FORBIDDEN { code: '…' } to match object { Object (code) } | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_SOURCE_CONFLICT' but got 'cannot execute INSERT in a read-only …' | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'JOB_NOT_FOUND' | 2 | 0 | 2 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_SOURCE_NOT_RECOGNISED' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 2 | 2 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23503' } | 2 | 2 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 | 2 | 0 | 0 |
| Error: jobguard_session_lookup does not have the required least-privilege posture | 2 | 2 | 0 | 0 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 2 | 1 | 1 | 0 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 | 0 | 2 | 0 |
| TypeError: Cannot read properties of undefined (reading 'revision') | 2 | 2 | 0 | 0 |
| error: STALE_SSO_REQUIRED | 2 | 2 | 0 | 0 |
| error: cannot execute INSERT in a read-only transaction | 2 | 1 | 1 | 0 |
| error: invalid reversal | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "capture_source" | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 2 | 1 | 1 | 0 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 | 0 | 1 | 0 |
| Error: Dispatch did not block behind contractor revocation | 1 | 0 | 1 | 0 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: FINAL_CHECK_FORBIDDEN | 1 | 1 | 0 | 0 |
| Error: MEMBERSHIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: STACK_TRACE_ERROR | 1 | 1 | 0 | 0 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 | 0 | 1 | 0 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_DEPENDENCY_HELD' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'IDEMPOTENCY_PAYLOAD_CONFLICT' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_NOT_LIVE' but got 'JOB_NOT_FOUND' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'NOT_FOUND' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_CASE_NOT_FOUND' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'REQUEST_BINDING_REFUSED' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'TEST-WORKER-pending' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'UNAUTHENTICATED' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'fixture audit failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'rollback' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic migration failure' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic rollback' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 1 | 0 | 1 | 0 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 | 0 | 1 | 0 |
| Error: expected error: JOB_NOT_FOUND { …(15) } to match object { code: '23505' } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { Object (code) } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 | 0 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'AGREEMENT_INELIGIBLE' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'COLLECTION_REFUSED' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: query returned no rows { …(15) } to match object { code: '23514' } | 1 | 1 | 0 | 0 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 | 0 | 1 | 0 |
| Error: promise rejected "Error: UNAUTHENTICATED { code: 'UNAU…' }" instead of resolving | 1 | 1 | 0 | 0 |
| Error: promise resolved "undefined" instead of rejecting | 1 | 0 | 1 | 0 |
| ExtraPersistenceError: NOT_FOUND | 1 | 0 | 1 | 0 |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 1 | 1 | 0 | 0 |
| TypeError: Cannot convert undefined or null to object | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'connect') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'identity_user_id') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 | 0 | 1 | 0 |
| error: COMMAND_CONFLICT | 1 | 1 | 0 | 0 |
| error: SMALL_TRIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| error: STALE_REVISION | 1 | 1 | 0 | 0 |
| error: WORM_REFUSED | 1 | 0 | 1 | 0 |
| error: cannot alter type of a column used in a policy definition | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "merchant" | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "provider_event_inbox" | 1 | 1 | 0 | 0 |
| error: new row violates row-level security policy for table "scope_identity" | 1 | 1 | 0 | 0 |
| error: permission denied for table jobguard_schema_migration | 1 | 1 | 0 | 0 |
| error: synthetic live job required | 1 | 0 | 1 | 0 |

### Diagnostics outside the hold in this round

| First diagnostic | Failed assertions |
| --- | ---: |
| Assertion mismatch | 102 |
| error: new row violates row-level security policy for table "audit_event" | 18 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 11 |
| WormCommandError: WORM_REFUSED | 7 |
| error: new row violates row-level security policy for table "accounting_observation_receipt" | 6 |
| error: FORBIDDEN | 6 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 6 |
| error: FINAL_CHECK_FORBIDDEN | 6 |
| error: NOT_FOUND | 5 |
| Error: | 5 |
| error: CUSTOMER_REFUSED | 5 |
| TypeError: Cannot read properties of undefined (reading 'hash') | 5 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 5 |
| error: COMMAND_CONFLICT | 5 |
| Error: STACK_TRACE_ERROR | 5 |
| Error: MEMBERSHIP_FORBIDDEN | 4 |
| error: FINAL_ACCOUNT_LOCK_REQUIRED | 4 |
| error: new row violates row-level security policy for table "job_activation_terms" | 4 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 |
| error: DISCLOSURE_TERMS_NOT_ACCEPTED | 3 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 |
| Error: promise resolved "undefined" instead of rejecting | 3 |
| error: cannot alter type of a column used in a policy definition | 3 |
| error: new row violates row-level security policy for table "job" | 3 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 |
| MeterLifecyclePersistenceError: METER_FORBIDDEN | 3 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 |
| error: new row violates row-level security policy for table "account" | 3 |
| Error: expected error: test upload not found { …(15) } to match object { code: '42501', …(1) } | 3 |
| TypeError: Cannot convert undefined or null to object | 2 |
| error: new row violates row-level security policy for table "capture_source" | 2 |
| TypeError: Cannot read properties of undefined (reading 'reviewRequired') | 2 |
| Error: promise resolved "Result{ command: 'INSERT', …(9) }" instead of rejecting | 2 |
| Error: expected [Function] to throw error including 'TRIAL_COMPLETED_CARD_REQUIRED' but got 'TRIAL_SUBSCRIPTION_TERMS_REQUIRED' | 2 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 |
| TypeError: Cannot read properties of undefined (reading 'id') | 2 |
| error: invalid reversal | 2 |
| Error: FORBIDDEN | 2 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 2 |
| Error: promise rejected "Error: MEMBERSHIP_FORBIDDEN { …(1) }" instead of resolving | 2 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 |
| Error: expected [Function] to throw error including 'CIS_FIXTURE_CONFLICT' but got 'CIS_FIXTURE_NOT_FOUND' | 1 |
| error: canceling statement due to statement timeout | 1 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 1 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 |
| Error: Command failed: /workspace/.jobguard-runtime/node_modules/node/bin/node --input-type=module -e import pg from 'pg'; const v=JSON.parse(process.env.DD_FIXTURE); const p=new pg.Pool(v.config); try { const c=await p.connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('app.tenant_id',$1,true)",[v.tenant]); await c.query('SELECT app.direct_debit_fixture($1,$2,$3::jsonb,$4::jsonb,$5::uuid)',[v.tenant,'mandate',JSON.stringify(v.binding),JSON.stringify(v.event),null]); await c.query('COMMIT'); } finally { c.release(); } } finally { await p.end(); } | 1 |
| error: DD_NOT_FOUND | 1 |
| Error: promise resolved "'<uuid>'" instead of rejecting | 1 |
| ExtraPersistenceError: NOT_FOUND | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_NOT_COMPLETE' but got 'FINAL_ACCOUNT_LOCK_REQUIRED' | 1 |
| Error: FINAL_CHECK_FORBIDDEN | 1 |
| error: new row violates row-level security policy for table "trial_identity_snapshot" | 1 |
| error: TRIAL_IDENTITY_REQUIRED | 1 |
| error: new row violates row-level security policy for table "trial_end_source" | 1 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 |
| error: IMPORT_RECORD_REQUIRED | 1 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'null value in column "scope_item_id" …' | 1 |
| error: new row violates row-level security policy for table "evidence_link" | 1 |
| error: REQUEST_BINDING_REFUSED | 1 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 |
| Error: promise resolved "{ …(3) }" instead of rejecting | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'FINAL_CHECK_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'Fictional transaction failure' but got 'CAPACITY_ADMISSION_UNAVAILABLE' | 1 |
| error: SMALL_TRIP_FORBIDDEN | 1 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 1 |
| error: new row violates row-level security policy for table "merchant" | 1 |
| error: new row violates row-level security policy for table "watchdog_command_identity" | 1 |
| EvidencePackSourceError: EVIDENCE_PACK_CASE_NOT_FOUND | 1 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 |
| Error: FINAL_CHECK_PENDING | 1 |
| error: function app.lp11_bind_shadow_job(unknown, unknown) does not exist | 1 |
| Error: expected [Function] to throw error matching /resolved/u but got 'expected error: FINAL_ACCOUNT_LOCK_RE…' | 1 |
| error: synthetic live job required | 1 |
| error: RETENTION_NOT_FOUND | 1 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 |
| Error: Dispatch did not block behind contractor revocation | 1 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 |
| Error: Cannot find module 'file:///workspace/jobguard-lp11-r5-connector/packages/ai/dist/shadow-proposal.js' imported from /workspace/jobguard-lp11-r5-connector/packages/db/test/shadow-detection.integration.test.ts | 1 |
| error: FINAL_CHECK_LOCK_BINDING_INVALID | 1 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 |
| Error: expected Error: MEMBERSHIP_FORBIDDEN { …(1) } to match object { code: 'JOB_NOT_FOUND' } | 1 |
| error: WORM_REFUSED | 1 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 |

### Files that failed during setup outside the hold

None. The API, DB and AI package links resolved in this frozen worktree.

### Unhandled PostgreSQL shutdown errors

Vitest attributed a `57P01` connection-termination exception to each of `test/m57-sso-conformance.integration.test.ts` and `test/sso-emergency-token.integration.test.ts`. Both files completed their 10 and 7 assertions successfully. The two shutdown errors are included in the run totals.

### Named exceptions in this round

- `test/lp6a-practice-restore.integration.test.ts` — upgrades dark, round-trips a logical binding-table dump into a fresh cluster and rejects carried rows even at a colliding xid8

The same 842 assertion names and 21 setup files reached the held work-order customer insert as in the original report. See [tests that reached the held work-order fixture](#tests-that-reached-the-held-work-order-fixture) and [tests skipped when a held fixture failed during setup](#tests-skipped-when-a-held-fixture-failed-during-setup).

## r5 customer invoice display, retained-plan fixtures and pool shutdown

| Group | Before | Focused rerun |
| --- | ---: | ---: |
| Customer practice Pay Now failures | 6 | 0 |
| Retained plan-entitlement comparisons | 7 | 0 |
| Identity round `57P01` shutdown errors | 2 | 0 |

The customer display reuses the checked and locked portal session, then reads invoices, credits, payments and reversals for its exact job. Its database entry point keeps the same identity-only EXECUTE grant and returns the same two fields. The four new policies grant SELECT only to the private migration owner. The successful, cross-tenant refusal, byte parity and unchanged storage assertions passed in all seven PostgreSQL cases.

All ten plan-entitlement lifecycle cases passed after the retained-read comparison used the fixture's persisted owner. The comparison still requires rows, a signed retained export, and byte parity. The two identity suites passed 17 of 17 assertions with no unhandled PostgreSQL errors after the fixture waited for its connections to close. The shared upgrade fixture now applies the same connection-close check.

The migration catalogue, tenant policies, proof loader and exact populated upgrades passed 89 of 89 assertions. That run recorded a separate `57P01` on `test/migfix-7-upgrade.integration.test.ts` during fixture shutdown. The subsequent eight customer and upgrade assertions passed with no unhandled errors using the updated teardown. The catalogue proof contains 1,411 effective-privilege changes, 789 upgrade changes and 660 policy changes.

```sh
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/customer-practice-pay-now.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-paynow-disconnect-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/plan-entitlement-lifecycle.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-plan-retained-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/m57-sso-conformance.integration.test.ts test/sso-emergency-token.integration.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-scim-close-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/migration-proof-loader.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-paynow-upgrades-results.json
```

## r5 deferred activation and job-permit checks

| Group | Failed at 5ef7a5b87 | Failed in the focused rerun |
| --- | ---: | ---: |
| Trial lifecycle | 5 | 0 |
| Adoption and job permits | 5 | 0 |
| Meter track review | 5 | 0 |
| LP-4 audit chain fixture | 4 | 0 |

The trial-admission trigger checks the inserted activation against the protected request. An administrative transaction without a request can inspect only the inserted tenant's verification and the matching job and activation. The private permit trigger reads only the permit that passed the original insert check, using its tenant, job, backend and transaction. Both triggers close their scopes before returning. The PostgreSQL regression changes the caller's tenant setting before commit and still requires `TRIAL_CHECKED_ACTIVATION_REQUIRED`. The unused-permit test still requires an exact `JOB_INSERT_PERMIT_UNCONSUMED` at commit.

The populated adoption, meter and audit fixtures use the existing verified actor for writes that require one. The two malformed-card controls still remove one predicate in their rolled-back fixture, and both still require the distinct before and after errors. The meter suite first had three passing cases and two 120-second runner timeouts. The same five assertions passed with a 300-second runner budget, with the two slow cases taking 128 and 140 seconds. The test file keeps its original assertion and timeout definitions.

Fourteen trial and admission checks, 75 adoption, policy and job-door checks, 25 LP-4 audit checks, and 106 strict upgrade, trial, worker and proof-loader checks passed. The PostgreSQL catalogue proof contains 1,418 effective-privilege changes, 794 upgrade changes and 663 policy changes.

```sh
nice -n 5 pnpm --filter @jobguard/db exec vitest run test/free-first-job-lifecycle.integration.test.ts test/free-first-job-admission.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-trial-deferred-results.json
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/lp-adoption-boundary.integration.test.ts test/lp-job-doors.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-lp2-deferred-results.json
pnpm --filter @jobguard/db exec vitest run test/meter-track-review.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-meter-final-results.json
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/lp4-audit.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-lp4-bound-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/migration-proof-loader.test.ts test/free-first-job-lifecycle.integration.test.ts test/lp-10-worker-login.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-deferred-upgrades-results.json
```

## r5 WORM executor, operator and audit hand-off

Nine WORM command failures and one hold-screen failure at `5ef7a5b87` reached executor and operator routines without protected tenant authority. The existing isolated database logins now open a transaction scope after checking the persisted synthetic command. Operator alerts use only the registered tenant scope. The executor locks only the command's author to fence revocation. The policy for that lock has an exact author predicate and a `WITH CHECK (false)` that cannot accept a write. The other policies protect the exact command, attempt and audit subject. The deferred cleanup removes the scope at commit, and rollback removes it with the command changes.

The new PostgreSQL assertion exercises the same physical connection after commit and rollback, checks an explicitly wrong tenant for a persisted command, and confirms a forged tenant setting cannot change the command scope. The populated predecessor proof runs the original 0577 claim and finish before the LP-11 route exists, preserves the stored rows and ACLs, and checks the installed bodies against their exact latest sources. The callable operator catalogue remains an exact list and includes the new checked scope entry point.

All 54 PostgreSQL WORM and repository assertions, and all 92 policy, populated upgrade and proof assertions, passed. All 93 audit hand-off checks passed after the unit fixture mocked the scoped SQL call. Four unit failures at `5ef7a5b87` had used the predecessor call. The real PostgreSQL test still verifies the recorded operator, database session user and server time. The migration proof records 1,446 LP0 changes, 810 upgrade changes and 674 policies. Both commercial-integrity guard commands returned zero diagnostics.

```sh
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/worm-command.integration.test.ts test/worm-hold-screen.integration.test.ts src/worm-command-repository.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-worm-lock-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/migration-proof-loader.test.ts test/worm-migration-proofs.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-worm-upgrades-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts test/audit-checkpoint-handoff.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-handoff-unit-results.json
nice -n 8 node tools/commercial-integrity-current-source-guard.mjs
nice -n 8 node tools/commercial-integrity-boundary.mjs
```

### Application reruns from the main checkout

The frozen `5470e1e60` API run passed 4,485 tests, failed the same two inherited context-scanner checks and skipped 22 tests after Turbopack refused the external Next.js dependency link. The 22 shadow-isolation tests passed from the main checkout, giving 4,507 of 4,509 across those complementary runs. The frozen web run recorded 3,529 of 3,618 with 89 failures. The same web command from the main checkout passed all 3,618 tests in 252 files. The frozen typecheck had cross-worktree type resolution errors. The main checkout typecheck passed all seven packages.

```sh
nice -n 9 pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --testTimeout=30000 --exclude '**/*.integration.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-readiness-api-results.json
nice -n 8 pnpm --filter @jobguard/api exec vitest run src/shadow-isolation.application.test.ts --maxWorkers=1 --testTimeout=30000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-shadow-app-final-results.json
nice -n 9 pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-readiness-web-results.json
nice -n 8 pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-root-web-results.json
nice -n 9 pnpm typecheck
nice -n 8 pnpm typecheck
```

## r5 stored shadow ancestry and bound audit fixtures

The completed 5ef7a5b87 run recorded seven final-check practice-owner failures, six shadow coalescing failures and four audit chain failures. The practice-owner fixture now uses its existing authenticated synthetic session for tenant-scoped fixture changes. That cleared five failures and isolated the two imported-job cases refused by `final_check_job_terms` with `DISCLOSURE_TERMS_NOT_ACCEPTED`. The checked worker scope now permits the latest terms routine to follow the stored import and successful adoption receipt to the accepting practice firm for the exact scoped job. Only the migration owner can open this temporary, read-only policy path. The existing practice-firm and receipt predicates remain enforced. The practice-owner suite passed 24/24 and the ordinary final-check suite passed 35/35.

The coalescing fixture now uses the required synthetic database and opens the protected scope for its existing jobs with the isolated shadow login. For the wrong-tenant case it establishes tenant B's scope, verifies that call completed, then checks the exact refusal for tenant A and the rollback of both writes. All six coalescing failures cleared. Both populated upgrades, the coalescing suite, the tenant policy tests and the proof loader passed 95/95. The 0762 proof records 1,453 LP0 objects, 815 populated upgrade objects and 678 policy changes.

The audit chain fixture seeds its synthetic account and membership administratively and uses a verified tenant context for the runtime cases. All four failures cleared in the 5/5 run. Both commercial guards recorded zero diagnostics on the preceding snapshot and the recorded guard test run passed 253/253.

```sh
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/final-check-practice-owner.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-final-check-owner-bound-results.json
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/final-check-practice-owner.integration.test.ts test/migfix-7.integration.test.ts test/real-fc-ordinary-words.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-shadow-ancestry-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/migfix-7.integration.test.ts test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/migration-proof-loader.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-shadow-ancestry-upgrades-results.json
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/audit.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-audit-chain-results.json
nice -n 10 node --test --test-concurrency=1 tools/commercial-integrity-{current-source-guard,boundary}.test.mjs
```

## r5 full PostgreSQL run at 3e89a0416

All 878 files completed on PostgreSQL 16.10. 634 files passed and 244 failed. The 8,013 tests included 6,612 passed, 1,131 failed, 251 skipped and 19 todo. Vitest recorded one unhandled connection shutdown in `test/company-final-check-authority.integration.test.ts` (PostgreSQL `57P01`). The prior full run recorded 313 assertions outside the hold, zero setup-only failures and two unhandled shutdowns.

The failure count contains 842 direct held-fixture assertions and 1 missing pg_dump assertion. Another 21 files stopped during setup at the held fixture. The other 288 failed assertions and zero setup-only failures keep LP-11 RED.

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=4 --passWithNoTests --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-customer-full-results.json
```

The table follows original r4 non-held assertion failures by file and test name. A row still failing can have reached a different failure in the later code.

| r4 diagnostic | r4 failures | Passed in this round | Failed in this round | Skipped or absent |
| --- | ---: | ---: | ---: | ---: |
| error: JOB_PARTIES_REQUIRED | 1081 | 999 | 81 | 1 |
| error: JOB_NOT_FOUND | 304 | 295 | 9 | 0 |
| Assertion mismatch | 90 | 38 | 52 | 0 |
| error: NOT_FOUND | 59 | 55 | 4 | 0 |
| error: CUSTOMER_REFUSED | 55 | 55 | 0 | 0 |
| Error: RECOVERY_REVIEWER_FORBIDDEN | 49 | 49 | 0 | 0 |
| error: new row violates row-level security policy for table "fee_reservation_book" | 39 | 38 | 0 | 1 |
| error: SSO_REQUIRED_FORBIDDEN | 38 | 36 | 2 | 0 |
| error: new row violates row-level security policy for table "evidence_upload" | 37 | 37 | 0 | 0 |
| error: new row violates row-level security policy for table "membership" | 33 | 33 | 0 | 0 |
| PracticeFeedRepositoryError: PRACTICE_FEED_FORBIDDEN | 19 | 19 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'id') | 18 | 17 | 1 | 0 |
| error: job not found | 17 | 17 | 0 | 0 |
| error: new row violates row-level security policy for table "audit_event" | 17 | 1 | 16 | 0 |
| OidcError: OIDC_REFUSED | 16 | 16 | 0 | 0 |
| Error: UNAUTHENTICATED | 13 | 13 | 0 | 0 |
| Error: promise rejected "SsoError: SSO_FORBIDDEN { code: 'SSO…' }" instead of resolving | 13 | 13 | 0 | 0 |
| error: new row violates row-level security policy for table "action_outbox" | 12 | 12 | 0 | 0 |
| SsoError: SSO_FORBIDDEN | 9 | 9 | 0 | 0 |
| error: UNAUTHENTICATED | 9 | 9 | 0 | 0 |
| error: new row violates row-level security policy for table "input_event" | 9 | 9 | 0 | 0 |
| WormCommandError: WORM_REFUSED | 7 | 0 | 7 | 0 |
| error: EMERGENCY_REFUSED | 7 | 7 | 0 | 0 |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 6 | 6 | 0 | 0 |
| Error: ACCESS_REFUSED | 5 | 5 | 0 | 0 |
| Error: Synthetic tenant key registry operation refused | 5 | 5 | 0 | 0 |
| WatchdogError: JOB_NOT_LIVE | 5 | 5 | 0 | 0 |
| error: FORBIDDEN | 5 | 2 | 3 | 0 |
| error: INVALID_TRANSITION | 5 | 4 | 1 | 0 |
| error: new row violates row-level security policy for table "job" | 5 | 1 | 4 | 0 |
| Error: NOT_FOUND | 4 | 3 | 1 | 0 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 4 | 0 | 4 | 0 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 | 3 | 1 | 0 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 | 0 | 4 | 0 |
| error: new row violates row-level security policy for table "account" | 4 | 1 | 3 | 0 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 | 0 | 3 | 0 |
| Error: promise rejected "error: SSO_REQUIRED_FORBIDDEN { …(15) }" instead of resolving | 3 | 3 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 3 | 3 | 0 | 0 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 | 0 | 3 | 0 |
| Error: FORBIDDEN | 2 | 0 | 2 | 0 |
| Error: expected Error: RECOVERY_REVIEWER_FORBIDDEN { code: '…' } to match object { Object (code) } | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_SOURCE_CONFLICT' but got 'cannot execute INSERT in a read-only …' | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'JOB_NOT_FOUND' | 2 | 0 | 2 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_SOURCE_NOT_RECOGNISED' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 2 | 2 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23503' } | 2 | 2 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 | 2 | 0 | 0 |
| Error: jobguard_session_lookup does not have the required least-privilege posture | 2 | 2 | 0 | 0 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 2 | 1 | 1 | 0 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 | 0 | 2 | 0 |
| TypeError: Cannot read properties of undefined (reading 'revision') | 2 | 2 | 0 | 0 |
| error: STALE_SSO_REQUIRED | 2 | 2 | 0 | 0 |
| error: cannot execute INSERT in a read-only transaction | 2 | 1 | 1 | 0 |
| error: invalid reversal | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "capture_source" | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 2 | 1 | 1 | 0 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 | 0 | 1 | 0 |
| Error: Dispatch did not block behind contractor revocation | 1 | 0 | 1 | 0 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: FINAL_CHECK_FORBIDDEN | 1 | 1 | 0 | 0 |
| Error: MEMBERSHIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: STACK_TRACE_ERROR | 1 | 1 | 0 | 0 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 | 0 | 1 | 0 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_DEPENDENCY_HELD' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'IDEMPOTENCY_PAYLOAD_CONFLICT' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_NOT_LIVE' but got 'JOB_NOT_FOUND' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'NOT_FOUND' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_CASE_NOT_FOUND' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'REQUEST_BINDING_REFUSED' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'TEST-WORKER-pending' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'UNAUTHENTICATED' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'fixture audit failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'rollback' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic migration failure' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic rollback' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 1 | 0 | 1 | 0 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 | 0 | 1 | 0 |
| Error: expected error: JOB_NOT_FOUND { …(15) } to match object { code: '23505' } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { Object (code) } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 | 0 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'AGREEMENT_INELIGIBLE' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'COLLECTION_REFUSED' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: query returned no rows { …(15) } to match object { code: '23514' } | 1 | 1 | 0 | 0 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 | 0 | 1 | 0 |
| Error: promise rejected "Error: UNAUTHENTICATED { code: 'UNAU…' }" instead of resolving | 1 | 1 | 0 | 0 |
| Error: promise resolved "undefined" instead of rejecting | 1 | 0 | 1 | 0 |
| ExtraPersistenceError: NOT_FOUND | 1 | 0 | 1 | 0 |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 1 | 1 | 0 | 0 |
| TypeError: Cannot convert undefined or null to object | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'connect') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'identity_user_id') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 | 0 | 1 | 0 |
| error: COMMAND_CONFLICT | 1 | 1 | 0 | 0 |
| error: SMALL_TRIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| error: STALE_REVISION | 1 | 1 | 0 | 0 |
| error: WORM_REFUSED | 1 | 0 | 1 | 0 |
| error: cannot alter type of a column used in a policy definition | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "merchant" | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "provider_event_inbox" | 1 | 1 | 0 | 0 |
| error: new row violates row-level security policy for table "scope_identity" | 1 | 1 | 0 | 0 |
| error: permission denied for table jobguard_schema_migration | 1 | 1 | 0 | 0 |
| error: synthetic live job required | 1 | 0 | 1 | 0 |

### Diagnostics outside the hold in this round

| First diagnostic | Failed assertions |
| --- | ---: |
| Assertion mismatch | 94 |
| error: new row violates row-level security policy for table "audit_event" | 18 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 10 |
| error: PROOF_NOT_FINAL | 9 |
| WormCommandError: WORM_REFUSED | 7 |
| error: FORBIDDEN | 6 |
| error: FINAL_CHECK_FORBIDDEN | 6 |
| error: NOT_FOUND | 5 |
| Error: | 5 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 5 |
| error: COMMAND_CONFLICT | 5 |
| Error: MEMBERSHIP_FORBIDDEN | 4 |
| error: FINAL_ACCOUNT_LOCK_REQUIRED | 4 |
| error: new row violates row-level security policy for table "job_activation_terms" | 4 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 |
| Error: STACK_TRACE_ERROR | 4 |
| error: DISCLOSURE_TERMS_NOT_ACCEPTED | 3 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 |
| Error: promise resolved "undefined" instead of rejecting | 3 |
| error: cannot alter type of a column used in a policy definition | 3 |
| error: new row violates row-level security policy for table "job" | 3 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 |
| MeterLifecyclePersistenceError: METER_FORBIDDEN | 3 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 |
| error: new row violates row-level security policy for table "account" | 3 |
| Error: expected error: test upload not found { …(15) } to match object { code: '42501', …(1) } | 3 |
| TypeError: Cannot convert undefined or null to object | 2 |
| error: new row violates row-level security policy for table "capture_source" | 2 |
| Error: promise resolved "Result{ command: 'INSERT', …(9) }" instead of rejecting | 2 |
| Error: expected [Function] to throw error including 'TRIAL_COMPLETED_CARD_REQUIRED' but got 'TRIAL_SUBSCRIPTION_TERMS_REQUIRED' | 2 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 |
| TypeError: Cannot read properties of undefined (reading 'id') | 2 |
| error: invalid reversal | 2 |
| Error: FORBIDDEN | 2 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 2 |
| Error: promise rejected "Error: MEMBERSHIP_FORBIDDEN { …(1) }" instead of resolving | 2 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 |
| Error: expected [Function] to throw error including 'CIS_FIXTURE_CONFLICT' but got 'CIS_FIXTURE_NOT_FOUND' | 1 |
| error: canceling statement due to statement timeout | 1 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 1 |
| error: CUSTOMER_REFUSED | 1 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 |
| Error: Command failed: /workspace/.jobguard-runtime/node_modules/node/bin/node --input-type=module -e import pg from 'pg'; const v=JSON.parse(process.env.DD_FIXTURE); const p=new pg.Pool(v.config); try { const c=await p.connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('app.tenant_id',$1,true)",[v.tenant]); await c.query('SELECT app.direct_debit_fixture($1,$2,$3::jsonb,$4::jsonb,$5::uuid)',[v.tenant,'mandate',JSON.stringify(v.binding),JSON.stringify(v.event),null]); await c.query('COMMIT'); } finally { c.release(); } } finally { await p.end(); } | 1 |
| error: DD_NOT_FOUND | 1 |
| Error: promise resolved "'<uuid>'" instead of rejecting | 1 |
| ExtraPersistenceError: NOT_FOUND | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_NOT_COMPLETE' but got 'FINAL_ACCOUNT_LOCK_REQUIRED' | 1 |
| Error: FINAL_CHECK_FORBIDDEN | 1 |
| error: new row violates row-level security policy for table "trial_identity_snapshot" | 1 |
| error: TRIAL_IDENTITY_REQUIRED | 1 |
| error: new row violates row-level security policy for table "trial_end_source" | 1 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 |
| error: IMPORT_RECORD_REQUIRED | 1 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'null value in column "scope_item_id" …' | 1 |
| error: REQUEST_BINDING_REFUSED | 1 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 |
| Error: promise resolved "{ …(3) }" instead of rejecting | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'FINAL_CHECK_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'Fictional transaction failure' but got 'CAPACITY_ADMISSION_UNAVAILABLE' | 1 |
| error: SMALL_TRIP_FORBIDDEN | 1 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 1 |
| error: new row violates row-level security policy for table "merchant" | 1 |
| error: new row violates row-level security policy for table "watchdog_command_identity" | 1 |
| EvidencePackSourceError: EVIDENCE_PACK_CASE_NOT_FOUND | 1 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 |
| Error: FINAL_CHECK_PENDING | 1 |
| error: function app.lp11_bind_shadow_job(unknown, unknown) does not exist | 1 |
| Error: expected [Function] to throw error matching /resolved/u but got 'expected error: FINAL_ACCOUNT_LOCK_RE…' | 1 |
| error: synthetic live job required | 1 |
| error: RETENTION_NOT_FOUND | 1 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 |
| Error: Dispatch did not block behind contractor revocation | 1 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 |
| Error: Cannot find module 'file:///workspace/jobguard-lp11-r5-draft/packages/ai/dist/shadow-proposal.js' imported from /workspace/jobguard-lp11-r5-draft/packages/db/test/shadow-detection.integration.test.ts | 1 |
| error: FINAL_CHECK_LOCK_BINDING_INVALID | 1 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 |
| Error: expected Error: MEMBERSHIP_FORBIDDEN { …(1) } to match object { code: 'JOB_NOT_FOUND' } | 1 |
| error: WORM_REFUSED | 1 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 |

### Named exceptions in this round

- `test/lp6a-practice-restore.integration.test.ts` — upgrades dark, round-trips a logical binding-table dump into a fresh cluster and rejects carried rows even at a colliding xid8

The same 842 assertion names and 21 setup files reached the held work-order customer insert as in the original report. See [tests that reached the held work-order fixture](#tests-that-reached-the-held-work-order-fixture) and [tests skipped when a held fixture failed during setup](#tests-skipped-when-a-held-fixture-failed-during-setup).

## r5 meter source scope and company final-check fixtures

All three counted meter ledger failures in the completed 3e89a0416 run were `METER_FORBIDDEN`. The meter writer now opens a protected scope with the isolated meter login and checks the exact persisted tenant, revision, and source hash. It can read those source computations and append only the matching counted ledger. The retained held result remains readable. An independently bound tenant B saw only its own row and the wrong-tenant proposed row was refused, even with tenant A in the legacy setting. The runtime role remains denied. The two input unit tests and three PostgreSQL cases passed 5/5.

The company final-check fixture now runs its imported-child audit seed and invalidation through the persisted company credential. Two PostgreSQL assertions went from failed to passed with their original exact expectations. The fixture waits until all connections have closed before stopping PostgreSQL, and the targeted run reported zero unhandled shutdown errors. The predecessor quote recorder receives only the tenant UUID that it already used to seed its historical receipt through the administrative test context. The company, predecessor, and seed ownership suites passed 42/42, and the existing S9 scanner passed 146/146 without a source pin change.

Both populated upgrade snapshots, tenant policy checks, and the proof loader passed 89/89. The revised proof records 1,466 LP0 objects, 826 populated upgrade objects and 684 policy changes. The snapshot requires the new meter scope to be empty after upgrade. The commercial baseline fingerprint of the existing synthetic quote-delivery call changed from `ae49bd8fdcac…` to `88a68d0e17be…` in the two guard manifests. The simulated delivery call, call graph and reason are unchanged. The fingerprint includes the preceding fixture callback's now-scalar argument.

```sh
nice -n 6 pnpm --filter @jobguard/db exec vitest run src/meter-day-ledger.test.ts test/meter-day-ledger.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-meter-source-results.json
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/company-final-check-authority.integration.test.ts test/builder-acceptance-sent-head.integration.test.ts src/demo-seed.ownership.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-company-bound-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/migration-proof-loader.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-meter-exact-results.json
nice -n 8 pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-context-final-results.json
```

## r5 proof triggers and checked fixture transactions

Nine stored proof assertions in the 3e89a0416 run returned `PROOF_NOT_FINAL`. The completion, final lock and work-state triggers used the old customer and proof flags to obtain owner-side reads. The latest 0761 trigger bodies now scope those reads to the protected request tenant and exact job. Completion and work-state lookup the exact evidence link. Final lock can check every completion and proof revision for its locked job. The scope closes before the trigger returns and grants no runtime table or routine privileges. Exact upload, version, hash, invalidation and review predicates remain enforced. The trade and finished-work suites passed 35/35.

The fixture transactions for three practice company marker and three small builder origin failures now use checks against their own persisted credentials after administrative seeding. The three focused marker cases and all ten origin cases passed with the original assertions. The value allocator uses the isolated shadow login and binds its exact job before fixture writes. Its five checks passed, including the three 3e89a0416 failures. The final-check access and final-account reveal fixtures use protected job scope or the existing administrative fixture login for signal setup. Their eight and two checks passed, clearing three prior failures.

The Northside fixture now retains the rejected shared seed promise. In the focused run, each of its seven failing assertions reached the held `work-order-fixtures.ts:71` customer insert. Four of those had previously reported an undefined fixture instead. The four cases are listed below.

- CLIENT-ISOLATION permits a second client's own extra and denies cross-client presentation, view and decision
- SWITCH-REFERENCE rejects invented, cross-actor, cross-session and out-of-window references without masking the existing switch TRUNCATE guard
- SETTINGS-SNAPSHOT retains the stored definition, contract references and immutable requirement snapshots
- RESET-HISTORY starts a new run while retaining earlier attribution, settings, evidence, origins and the audit prefix

The proof records 1,472 LP0 objects, 831 populated upgrade objects and 684 policy changes. Both populated upgrade comparisons and the ten tenant policy checks passed. The migration proof loader and value allocator passed 82/82. The added 0762 proof merges from the exact earlier records; its working trigger bodies came from live 0761. The held work-order fixture and the context scanner and source pins remain byte-for-byte unchanged.

```sh
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/real-gap-proof-by-trade.integration.test.ts test/real-proof-keeps-finished.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-proof-trigger-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/practice-company-marker.integration.test.ts -t 'hand-built' --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-hand-built-marker-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/small-builder-origin.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-small-builder-origin-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/northside-demo.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-northside-held-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/final-check-access.integration.test.ts test/shadow-isolation-query-log.integration.test.ts test/j3-landing-allocation.integration.test.ts test/evidence-pack-v3-isolation.integration.test.ts test/final-account-lock-reveal.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-shadow-fixture-bound-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp11-bound-tenant-rls.integration.test.ts test/migration-proof-loader.test.ts test/j3-landing-allocation.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-proof-trigger-final-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/migration-proof-loader.test.ts test/j3-landing-allocation.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-proof-trigger-loader-results.json
```

The combined shadow fixture run recorded 18 passes and three failures. The final-account reveal and final-check access suites passed on that run. The value allocator passed after correcting the proof predecessor record. The application workspace read with a hidden signal and the evidence-pack activation task still have a separate request-binding failure.

## r5 bound workspace projection and strict historical upgrade checks

The workspace service now uses the verified practice context it obtained while authorizing the exact saved job. The job repository binds that context in the projection transaction and reads the confirmed scope identities in the same SQL snapshot as the job. That cleared the two query-log failures in the 3e89a0416 run with the original positive control and exact response and statement comparison. The API service and unchanged S9 scanner passed 152/152. The source-pinned synthetic helper remains unchanged.

The historical upgrade suites retype `command_receipt.semantic_key` and `audit_event.event_type` inside rolled-back comparisons. PostgreSQL previously refused to perform those control statements after the cutover because the new policies depended on individual columns. Migration 0762 now reads the fields through owner-scoped composite-row accessors. All predicates and role restrictions remain enforced. Two upgrade suites passed 3/3 together, and the third passed its full F17 upgrade case after the post-upgrade check used its persisted practice credential in its own disposable synthetic database. The old malformed-setting assertion still expects `22P02` when an unbound query sets a GUC. The converted policy returns zero rows independently of the setting. The exact populated upgrade, policy, audit, readiness and WORM runs passed 123/123. The 0762 proof records 1,476 LP0 objects, 833 populated upgrade objects and 684 policy changes.

The full SERIOUS-B5 historical comparison passes on both replays. It verifies all seven connector policies against their committed before and after records and requires the exact new scope tables to be empty. No existing row, privilege or type comparison was removed. The capture fixture authenticates its synthetic owner, clearing two capture failures. The proposal totals fixture seeds its draft through the administrator and retains every runtime call and assertion about proposals and money. Both proposal checks passed, and the shared company final-check fixture still drains its pool sockets before shutdown. The proposal and company suites passed 12/12.

The complete API run passed 4,508 of 4,509 tests across 261 files. The third real final-account isolation case was skipped when its 60-second fixture setup timed out in the concurrent run. An independent invocation of that exact file passed 3/3 including the skipped case. Together the two commands exercised all 4,509 API tests successfully. The full web command passed 3,618/3,618 in 252 files. The meter snapshot passed workspace typecheck 7/7, both commercial guards reported zero diagnostics, and the 253 guard tests passed. These are complete application results for that run plus focused verification of the new workspace route.

```sh
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/later-decisions-upgrade.integration.test.ts test/recovery-eligibility-v3.integration.test.ts test/site-visit-upgrade.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-policy-types-results.json
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/recovery-eligibility-v3.integration.test.ts -t '0130 upgrade from 0119' --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-policy-recovery-final-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/lp11-bound-tenant-rls.integration.test.ts test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/migration-proof-loader.test.ts test/audit.integration.test.ts test/readiness-timer.integration.test.ts test/worm-command.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-policy-types-exact-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/serious-b5-upgrade.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-serious-b5-rows-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/later-proposal-totals.integration.test.ts test/company-final-check-authority.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-proposal-fixture-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/capture.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-capture-fixture-results.json
nice -n 6 pnpm --filter @jobguard/api exec vitest run src/workspace/workspace.service.test.ts src/auth/context-boundary.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-workspace-scanner-exact-results.json
nice -n 6 pnpm --filter @jobguard/db exec vitest run test/shadow-isolation-query-log.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-workspace-query-log-results.json
nice -n 9 pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --testTimeout=30000 --exclude '**/*.integration.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-meter-api-results.json
nice -n 3 pnpm --filter @jobguard/api exec vitest run src/final-account-lock.isolation.test.ts --maxWorkers=1 --testTimeout=30000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-api-final-account-detail-results.json
nice -n 8 pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts' --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-meter-web-results.json
nice -n 9 pnpm typecheck
nice -n 8 node tools/commercial-integrity-current-source-guard.mjs
nice -n 8 node tools/commercial-integrity-boundary.mjs
nice -n 10 node --test --test-concurrency=1 tools/commercial-integrity-{current-source-guard,boundary}.test.mjs
```

## r5 retention review discovery and execution

All four retention timer cases in the 3e89a0416 run failed because the discovery and execution routines read FORCE-RLS books without protected authority. Discovery now works one registered tenant at a time under its existing infrastructure role and returns the same due tenant identifiers. The isolated 0761 worker login checks the stored job, locks the same book and can append only the exact checked timer review with a null human actor. The protected row authorizes the matching event and audit head. Book, hash, date, immutability and race checks remain enforced. The worker and infrastructure connections continue to deny raw table access.

The runtime login lost the old timer routine grant. The API wiring test now requires the existing isolated worker pool and explicitly denies use of the business pool for this timer. The real PostgreSQL fixture uses separate, non-superuser worker and infrastructure logins. The exact records still belong to the selected book while the legacy setting names another tenant, and the setting is restored after the call. All four PostgreSQL cases passed. The unchanged S9 scanner and retention unit cases passed 157/157. Both populated upgrades, the 0761 upgrade, the tenant policy checks and proof loader passed 90/90. The 0762 proof records 1,490 LP0 objects, 843 populated upgrade objects and 690 policy changes.

The workspace snapshot also passed workspace typecheck 7/7 and both commercial guard commands reported zero diagnostics.

```sh
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/retention-review-timer.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-retention-role-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/lp11-bound-tenant-rls.integration.test.ts test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/migration-proof-loader.test.ts test/lp-10-worker-login-upgrade.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-retention-exact-results.json
nice -n 8 pnpm --filter @jobguard/api exec vitest run src/retention-review-task.test.ts src/auth/context-boundary.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-retention-api-final-results.json
nice -n 8 pnpm typecheck
nice -n 7 node tools/commercial-integrity-current-source-guard.mjs
nice -n 7 node tools/commercial-integrity-boundary.mjs
```

## r5 full PostgreSQL run at aea88fe67

All 878 files completed on PostgreSQL 16.10. 645 files passed and 233 failed. The 8,014 tests included 6,637 passed, 1,107 failed, 251 skipped and 19 todo. Vitest recorded no unhandled errors. The previous completed round had 288 assertions outside the hold and one connection shutdown error.

The failure count contains 842 direct held-fixture assertions and 1 missing pg_dump assertion. Another 21 files stopped during setup at the held fixture. The other 264 failed assertions and zero setup-only failures keep LP-11 RED.

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=4 --passWithNoTests --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-worker-full-results.json
```

The table follows original r4 non-held assertion failures by file and test name. A row still failing can have reached a different failure in the later code.

| r4 diagnostic | r4 failures | Passed in this round | Failed in this round | Skipped or absent |
| --- | ---: | ---: | ---: | ---: |
| error: JOB_PARTIES_REQUIRED | 1081 | 999 | 81 | 1 |
| error: JOB_NOT_FOUND | 304 | 295 | 9 | 0 |
| Assertion mismatch | 90 | 54 | 36 | 0 |
| error: NOT_FOUND | 59 | 56 | 3 | 0 |
| error: CUSTOMER_REFUSED | 55 | 55 | 0 | 0 |
| Error: RECOVERY_REVIEWER_FORBIDDEN | 49 | 49 | 0 | 0 |
| error: new row violates row-level security policy for table "fee_reservation_book" | 39 | 38 | 0 | 1 |
| error: SSO_REQUIRED_FORBIDDEN | 38 | 36 | 2 | 0 |
| error: new row violates row-level security policy for table "evidence_upload" | 37 | 37 | 0 | 0 |
| error: new row violates row-level security policy for table "membership" | 33 | 33 | 0 | 0 |
| PracticeFeedRepositoryError: PRACTICE_FEED_FORBIDDEN | 19 | 19 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'id') | 18 | 17 | 1 | 0 |
| error: job not found | 17 | 17 | 0 | 0 |
| error: new row violates row-level security policy for table "audit_event" | 17 | 1 | 16 | 0 |
| OidcError: OIDC_REFUSED | 16 | 16 | 0 | 0 |
| Error: UNAUTHENTICATED | 13 | 13 | 0 | 0 |
| Error: promise rejected "SsoError: SSO_FORBIDDEN { code: 'SSO…' }" instead of resolving | 13 | 13 | 0 | 0 |
| error: new row violates row-level security policy for table "action_outbox" | 12 | 12 | 0 | 0 |
| SsoError: SSO_FORBIDDEN | 9 | 9 | 0 | 0 |
| error: UNAUTHENTICATED | 9 | 9 | 0 | 0 |
| error: new row violates row-level security policy for table "input_event" | 9 | 9 | 0 | 0 |
| WormCommandError: WORM_REFUSED | 7 | 0 | 7 | 0 |
| error: EMERGENCY_REFUSED | 7 | 7 | 0 | 0 |
| SsoRequiredError: SSO_EMERGENCY_REFUSED | 6 | 6 | 0 | 0 |
| Error: ACCESS_REFUSED | 5 | 5 | 0 | 0 |
| Error: Synthetic tenant key registry operation refused | 5 | 5 | 0 | 0 |
| WatchdogError: JOB_NOT_LIVE | 5 | 5 | 0 | 0 |
| error: FORBIDDEN | 5 | 2 | 3 | 0 |
| error: INVALID_TRANSITION | 5 | 4 | 1 | 0 |
| error: new row violates row-level security policy for table "job" | 5 | 1 | 4 | 0 |
| Error: NOT_FOUND | 4 | 3 | 1 | 0 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 4 | 0 | 4 | 0 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 4 | 3 | 1 | 0 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 | 0 | 4 | 0 |
| error: new row violates row-level security policy for table "account" | 4 | 1 | 3 | 0 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 | 0 | 3 | 0 |
| Error: promise rejected "error: SSO_REQUIRED_FORBIDDEN { …(15) }" instead of resolving | 3 | 3 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 | 0 | 3 | 0 |
| error: new row violates row-level security policy for table "commercial_track_assignment" | 3 | 3 | 0 | 0 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 | 0 | 3 | 0 |
| Error: FORBIDDEN | 2 | 0 | 2 | 0 |
| Error: expected Error: RECOVERY_REVIEWER_FORBIDDEN { code: '…' } to match object { Object (code) } | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_SOURCE_CONFLICT' but got 'cannot execute INSERT in a read-only …' | 2 | 2 | 0 | 0 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'JOB_NOT_FOUND' | 2 | 0 | 2 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_SOURCE_NOT_RECOGNISED' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 2 | 2 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23503' } | 2 | 2 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '42501', …(1) } | 2 | 2 | 0 | 0 |
| Error: jobguard_session_lookup does not have the required least-privilege posture | 2 | 2 | 0 | 0 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 2 | 1 | 1 | 0 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 | 0 | 2 | 0 |
| TypeError: Cannot read properties of undefined (reading 'revision') | 2 | 2 | 0 | 0 |
| error: STALE_SSO_REQUIRED | 2 | 2 | 0 | 0 |
| error: cannot execute INSERT in a read-only transaction | 2 | 1 | 1 | 0 |
| error: invalid reversal | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "capture_source" | 2 | 0 | 2 | 0 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 2 | 1 | 1 | 0 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 | 0 | 1 | 0 |
| Error: Dispatch did not block behind contractor revocation | 1 | 1 | 0 | 0 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: FINAL_CHECK_FORBIDDEN | 1 | 1 | 0 | 0 |
| Error: MEMBERSHIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| Error: STACK_TRACE_ERROR | 1 | 1 | 0 | 0 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 | 0 | 1 | 0 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'EVIDENCE_PACK_V3_DEPENDENCY_HELD' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'IDEMPOTENCY_PAYLOAD_CONFLICT' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_NOT_LIVE' but got 'JOB_NOT_FOUND' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'NOT_FOUND' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'RECOVERY_CASE_NOT_FOUND' but got 'RECOVERY_REVIEWER_FORBIDDEN' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'REQUEST_BINDING_REFUSED' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 | 0 | 1 | 0 |
| Error: expected [Function] to throw error including 'TEST-WORKER-pending' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'UNAUTHENTICATED' but got 'cannot execute INSERT in a read-only …' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'fixture audit failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'rollback' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic failure' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic migration failure' but got 'jobguard_session_lookup does not have…' | 1 | 1 | 0 | 0 |
| Error: expected [Function] to throw error including 'synthetic rollback' but got 'new row violates row-level security p…' | 1 | 1 | 0 | 0 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 1 | 0 | 1 | 0 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 | 0 | 1 | 0 |
| Error: expected error: JOB_NOT_FOUND { …(15) } to match object { code: '23505' } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { Object (code) } | 1 | 1 | 0 | 0 |
| Error: expected error: cannot execute INSERT in a read-on… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 | 0 | 1 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'AGREEMENT_INELIGIBLE' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: 'COLLECTION_REFUSED' } | 1 | 1 | 0 | 0 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { …(2) } | 1 | 1 | 0 | 0 |
| Error: expected error: query returned no rows { …(15) } to match object { code: '23514' } | 1 | 1 | 0 | 0 |
| Error: expected undefined to deeply equal { kind: 'cancelled', …(1) } | 1 | 1 | 0 | 0 |
| Error: promise rejected "Error: UNAUTHENTICATED { code: 'UNAU…' }" instead of resolving | 1 | 1 | 0 | 0 |
| Error: promise resolved "undefined" instead of rejecting | 1 | 0 | 1 | 0 |
| ExtraPersistenceError: NOT_FOUND | 1 | 0 | 1 | 0 |
| RecoveryMessageError: RECOVERY_MESSAGE_BLOCKED | 1 | 1 | 0 | 0 |
| TypeError: Cannot convert undefined or null to object | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'cause_code') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'connect') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'identity_user_id') | 1 | 1 | 0 | 0 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 | 0 | 1 | 0 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 | 0 | 1 | 0 |
| error: COMMAND_CONFLICT | 1 | 1 | 0 | 0 |
| error: SMALL_TRIP_FORBIDDEN | 1 | 0 | 1 | 0 |
| error: STALE_REVISION | 1 | 1 | 0 | 0 |
| error: WORM_REFUSED | 1 | 0 | 1 | 0 |
| error: cannot alter type of a column used in a policy definition | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "merchant" | 1 | 0 | 1 | 0 |
| error: new row violates row-level security policy for table "provider_event_inbox" | 1 | 1 | 0 | 0 |
| error: new row violates row-level security policy for table "scope_identity" | 1 | 1 | 0 | 0 |
| error: permission denied for table jobguard_schema_migration | 1 | 1 | 0 | 0 |
| error: synthetic live job required | 1 | 0 | 1 | 0 |

### Diagnostics outside the hold in this round

| First diagnostic | Failed assertions |
| --- | ---: |
| Assertion mismatch | 74 |
| error: new row violates row-level security policy for table "audit_event" | 18 |
| error: new row violates row-level security policy for table "shadow_commercial_signal" | 10 |
| error: PROOF_NOT_FINAL | 9 |
| WormCommandError: WORM_REFUSED | 7 |
| error: FORBIDDEN | 6 |
| error: FINAL_CHECK_FORBIDDEN | 6 |
| error: NOT_FOUND | 5 |
| Error: | 5 |
| Error: promise resolved "Result{ command: 'SELECT', …(9) }" instead of rejecting | 5 |
| error: COMMAND_CONFLICT | 5 |
| Error: MEMBERSHIP_FORBIDDEN | 4 |
| error: FINAL_ACCOUNT_LOCK_REQUIRED | 4 |
| error: new row violates row-level security policy for table "job_activation_terms" | 4 |
| TypeError: Cannot destructure property 'f' of 'world' as it is undefined. | 4 |
| Error: STACK_TRACE_ERROR | 4 |
| error: DISCLOSURE_TERMS_NOT_ACCEPTED | 3 |
| error: new row violates row-level security policy for table "job_commercial_track" | 3 |
| Error: promise resolved "undefined" instead of rejecting | 3 |
| error: cannot alter type of a column used in a policy definition | 3 |
| error: new row violates row-level security policy for table "job" | 3 |
| Error: expected error: FORBIDDEN { length: 311, …(14) } to match object { code: '22023', …(1) } | 3 |
| MeterLifecyclePersistenceError: METER_FORBIDDEN | 3 |
| TypeError: Cannot read properties of undefined (reading 'status') | 3 |
| error: new row violates row-level security policy for table "account" | 3 |
| Error: expected error: test upload not found { …(15) } to match object { code: '42501', …(1) } | 3 |
| TypeError: Cannot convert undefined or null to object | 2 |
| error: new row violates row-level security policy for table "capture_source" | 2 |
| Error: promise resolved "Result{ command: 'INSERT', …(9) }" instead of rejecting | 2 |
| Error: expected [Function] to throw error including 'TRIAL_COMPLETED_CARD_REQUIRED' but got 'TRIAL_SUBSCRIPTION_TERMS_REQUIRED' | 2 |
| ReadinessSeamError: INVALID_READINESS_PLAN | 2 |
| TypeError: Cannot read properties of undefined (reading 'id') | 2 |
| error: invalid reversal | 2 |
| Error: FORBIDDEN | 2 |
| Error: expected error: FORBIDDEN { length: 139, …(14) } to match object { code: '23514' } | 2 |
| Error: promise rejected "Error: MEMBERSHIP_FORBIDDEN { …(1) }" instead of resolving | 2 |
| TypeError: Cannot read properties of undefined (reading 'practice_session_digest') | 1 |
| Error: ELIGIBILITY_REVIEWER_FORBIDDEN | 1 |
| Error: expected [Function] to throw error including 'CIS_FIXTURE_CONFLICT' but got 'CIS_FIXTURE_NOT_FOUND' | 1 |
| error: canceling statement due to statement timeout | 1 |
| Error: promise rejected "error: new row violates row-level securit… { …(15) }" instead of resolving | 1 |
| error: CUSTOMER_REFUSED | 1 |
| AssertionError [ERR_ASSERTION]: PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED | 1 |
| Error: Command failed: /workspace/.jobguard-runtime/node_modules/node/bin/node --input-type=module -e import pg from 'pg'; const v=JSON.parse(process.env.DD_FIXTURE); const p=new pg.Pool(v.config); try { const c=await p.connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('app.tenant_id',$1,true)",[v.tenant]); await c.query('SELECT app.direct_debit_fixture($1,$2,$3::jsonb,$4::jsonb,$5::uuid)',[v.tenant,'mandate',JSON.stringify(v.binding),JSON.stringify(v.event),null]); await c.query('COMMIT'); } finally { c.release(); } } finally { await p.end(); } | 1 |
| error: DD_NOT_FOUND | 1 |
| Error: promise resolved "'<uuid>'" instead of rejecting | 1 |
| ExtraPersistenceError: NOT_FOUND | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_NOT_COMPLETE' but got 'FINAL_ACCOUNT_LOCK_REQUIRED' | 1 |
| Error: FINAL_CHECK_FORBIDDEN | 1 |
| error: new row violates row-level security policy for table "trial_identity_snapshot" | 1 |
| error: TRIAL_IDENTITY_REQUIRED | 1 |
| error: new row violates row-level security policy for table "trial_end_source" | 1 |
| Error: expected [Function] to throw error including 'PRE_ADOPTION_SOURCE_EXCLUDED' but got 'insert or update on table "shadow_sig…' | 1 |
| error: IMPORT_RECORD_REQUIRED | 1 |
| Error: expected error: INVALID_JOB_LINK { …(15) } to match object { …(2) } | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'JOB_SOURCE_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'JOB_WORK_CLOSED' but got 'FINAL_CHECK_LOCK_BINDING_INVALID' | 1 |
| Error: expected [Function] to throw error including 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' but got 'null value in column "scope_item_id" …' | 1 |
| Error: expected [Function] to throw error including 'LP2 permit rollback' but got 'JOB_INSERT_PERMIT_REQUIRED' | 1 |
| Error: expected error: new row violates row-level securit… { …(15) } to match object { code: '23505' } | 1 |
| Error: promise resolved "{ …(3) }" instead of rejecting | 1 |
| Error: expected [Function] to throw error including 'FINAL_CHECK_SOURCE_CHANGED' but got 'FINAL_CHECK_FORBIDDEN' | 1 |
| Error: expected [Function] to throw error including 'Fictional transaction failure' but got 'CAPACITY_ADMISSION_UNAVAILABLE' | 1 |
| error: SMALL_TRIP_FORBIDDEN | 1 |
| Error: promise resolved "Result{ command: 'UPDATE', …(9) }" instead of rejecting | 1 |
| error: new row violates row-level security policy for table "merchant" | 1 |
| error: new row violates row-level security policy for table "watchdog_command_identity" | 1 |
| EvidencePackSourceError: EVIDENCE_PACK_CASE_NOT_FOUND | 1 |
| TypeError: Cannot read properties of undefined (reading 'payload') | 1 |
| Error: FINAL_CHECK_PENDING | 1 |
| error: function app.lp11_bind_shadow_job(unknown, unknown) does not exist | 1 |
| Error: expected [Function] to throw error matching /resolved/u but got 'expected error: FINAL_ACCOUNT_LOCK_RE…' | 1 |
| error: synthetic live job required | 1 |
| error: RETENTION_NOT_FOUND | 1 |
| Error: before allowance mismatch: ["connector","binding","binding_lookup"] | 1 |
| error: FINAL_CHECK_LOCK_BINDING_INVALID | 1 |
| Error: expected [Function] to throw error including 'SYNC_AUTHORITY_REQUIRED' but got 'SYNC_UNAVAILABLE' | 1 |
| Error: expected Error: MEMBERSHIP_FORBIDDEN { …(1) } to match object { code: 'JOB_NOT_FOUND' } | 1 |
| error: WORM_REFUSED | 1 |
| Error: expected WormCommandError: WORM_REFUSED { …(1) } to match object { code: 'WORM_UNCONFIRMED', …(1) } | 1 |

### Named exceptions in this round

- `test/lp6a-practice-restore.integration.test.ts` — upgrades dark, round-trips a logical binding-table dump into a fresh cluster and rejects carried rows even at a colliding xid8

The same 842 assertion names and 21 setup files reached the held work-order customer insert as in the original report. See [tests that reached the held work-order fixture](#tests-that-reached-the-held-work-order-fixture) and [tests skipped when a held fixture failed during setup](#tests-skipped-when-a-held-fixture-failed-during-setup).

## r5 evidence-pack worker and audited fixture repairs

The committed worker snapshot at aea88fe67 reduced the remaining assertion count from 288 to 264 and cleared the connection shutdown error. All 878 files completed. The figures and the original failure groups are in the preceding section.

Four evidence-pack operations in that run refused the request because the isolated shadow login reached FORCE-RLS tables before it could read the persisted request. The worker now opens the exact committed request and validates the stored practice requester, job and case. It reuses the existing shadow job scope and has limited access to the other named source relations. Preparation uses the same ordinary source inventory as the requester. It preserves the protected original-bytes boundary and only includes the selected case's applicable post-lock dispositions. Completion still verifies source revision, artifact content, replay and approval identity. Its audit records the system actor on the actual shadow login. The runtime and shadow logins cannot query the private request or scope tables.

The two evidence-pack isolation failures, one command failure and two post-lock failures went to zero. The pack cases passed 25/25, including the forged-setting check, wrong-tenant request refusal, exact audit actor, hidden signal independence and approval after the original final. The combined run with LP-1 bootstrap passed 27/27. Both populated upgrade suites, LP-10 upgrade, tenant policy checks and the proof loader passed 90/90. The proof records 1,541 LP0 objects, 891 populated upgrade objects and 732 policy changes.

The audit-export FK fixtures, the read-only contention control and the practice session cases now exercise their original constraints with persisted credentials. They passed 17/17, clearing six failures. The two LP-1 bootstrap cases passed in the combined run, clearing the remaining bootstrap failure. The initial bootstrap still requires exactly four identity writes through the authenticated migration role. A repeat requires zero identity rewrites and byte-for-byte equality of the four rows. Owner-connected job statements remain required on both runs.

```sh
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/evidence-pack-v3-isolation.integration.test.ts test/evidence-pack-v3-commands.integration.test.ts test/evidence-pack-v3-post-lock.integration.test.ts test/evidence-pack-v3-activation-upgrade.integration.test.ts test/lp1-seed.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-pack-shared-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/evidence-pack-v3-commands.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-pack-issued-checks-results.json
nice -n 8 pnpm --filter @jobguard/db exec vitest run test/lp11-bound-tenant-rls.integration.test.ts test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/migration-proof-loader.test.ts test/lp-10-worker-login-upgrade.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-pack-shared-exact-results.json
nice -n 7 pnpm --filter @jobguard/db exec vitest run test/lp1-seed.integration.test.ts test/later-command-contention.integration.test.ts test/practice-session.integration.test.ts test/later-audit-export-membership.integration.test.ts --maxWorkers=1 --testTimeout=300000 --reporter=default --reporter=json --outputFile.json=/workspace/work/lp11-r5-more-bound-fixtures-results.json
```

## r5 protected upload transitions and revoked export refusal

The upload inventory trigger closes its maintenance authority before the later
post-lock upload guard runs. The latter now opens only the trigger row's exact
job for a maintenance login and otherwise requires existing bound or delegated
authority. The lock, cutoff, isolation, status and SQLSTATE checks are unchanged.
The expiry-race fixture injects the change on one specified upload at the original
point before the freeze. Its later write must still fail with
`FINAL_CHECK_UPLOAD_TRANSITION_LOCKED`.

The audit-export refusal path rechecks the held contractor credential in
PostgreSQL. The private lookup owner reads its historical membership and
revocation only for that persisted session's tenant. The audit writer scope
allows only the resolved tenant, member, event ID and list or create action.
Revoked sessions receive no request binding. The original 403, durable refusal,
and unchanged export and foreign audit state are asserted. Foreign tenant and
member arguments fail with `42501` and the runtime cannot read the scope table.

| Group in the last completed whole DB run | Failing before | Failing on focused PostgreSQL rerun |
| --- | ---: | ---: |
| Outbox forward-only scratch controls on the actual runtime login | 3 | 0 |
| Final-check manifest lock and immutable upload inventory | 3 | 0 |
| Final invoice receipt proof and withdrawn-proof negative control | 2 | 0 |
| Historical and current typed final-check recovery | 4 | 0 |
| Revoked contractor session audit export list and create | 2 | 0 |
| Verified invitation issuer-revocation negative controls | 2 | 0 |
| Recurring extra sources and source withdrawal | 2 | 0 |
| Historical reversal controls and invalidation review | 3 | 0 |
| Shadow role exact catalogue and authorized positive read | 2 | 0 |

The four outbox and final-check suites passed 48/48. Both revoked audit actions
and the refusal-only principal test passed 3/3. Identity and recurring extras
passed 36/36, and a separate populated catalogue capture passed. Historical
recovery passed 21/21 and the exact shadow role suite passed 7/7. The identity
mutants still remove the actual issuer check and must break the original refusal
before rollback. The 0731 fixture checks that three later binding statements
did not exist and uses real predecessor PostgreSQL for every business operation.

The populated LP-10, MIGFIX-7, plan-entitlement, proof loader and tenant isolation
suites passed 90/90. The proof has 1,557 LP0 records and 899 upgrade records,
including 734 policy changes. The historical audit-export catalogue comparison
still reports the separate expected-privilege inventory mismatch for 0762 on
older objects. The whole DB counts above are from the last completed frozen
checkout and do not credit these focused repairs.

## r5 bound checkpoint and deferred subscription validation

The sync adapter maps the database's exact request-binding refusal to
`SYNC_AUTHORITY_REQUIRED`. It still checks the current member and tenant before
advancing the checkpoint. The wrong-tenant and rollback tests read their
checkpoints with the persisted fixture credential.

The post-lock new-work trigger checks an unclassified variation before the
later origin trigger infers builder capture from the stored small-builder track.
A skeletal post-lock insert therefore reaches the original lock refusal
before column constraints. The complete catalogue comparison of older CH-4
policies projects the exact recorded 0762 policy changes onto the predecessor
set. Its rolled-back permission mutation retains the original strict result.

The subscription statement benchmark isolated a repeated deferred scan.
At 17 places, a single issuance took 109.4 seconds while the stored source
and rebuild calls each took less than half a second. The deferred binding
trigger now reads the new row's exact immutable source sequence, day, job,
customer and site. Other participating triggers still run the full tenant-wide
accounting and ancestry check. The new rollback control inserts a row with
valid foreign keys and an absent source day, then proves the original
`23514 SUBSCRIPTION_INTEGRITY_FAILURE` at commit and an identical stored history.
The three formerly timed-out cases passed in 9.539, 6.692 and 1.402 seconds
within the existing budgets. The full file passed 13/13.

The original LP-4 and LP-6e system-attribution checks run on the actual
pre-cutover schema. New post-cutover checks assert exact unbound refusal,
unchanged audit history and persisted-member attribution. The pooled test
checks both attempts use the same backend PID. Raw isolation tests now
require exactly zero rows for a malformed obsolete setting and still require
`22P02` at the actual UUID selector. The SSO cross-tenant control binds A and
expects precisely A's connection.

| Group in the last completed whole DB run | Failing before | Failing on focused rerun |
| --- | ---: | ---: |
| Sync snapshot mismatch and rolled-back checkpoint | 2 | 0 |
| Privacy subject deletion and tenant exit | 2 | 0 |
| Historical audit-export catalogue | 1 | 0 |
| Direct debit replay and direct fixture reads | 2 | 0 |
| Recovery demo replay and historical negative control | 2 | 0 |
| Recovery attribution payment and invoice proof | 2 | 0 |
| Recovery timeline import and lower-trust mutation | 2 | 0 |
| Small-builder acceptance, captured or disclosed catches | 2 | 0 |
| Previous-schema command claimant and legacy writer | 2 | 0 |
| Raw post-lock variation refusal and earlier CH-4 upgrade policy catalogue | 2 | 0 |
| LP-1 row locks and their SELECT/UPDATE policy boundaries | 2 | 0 |
| Recovery eligibility and enterprise SSO malformed scope | 2 | 0 |
| LP-4 historical audit upgrade | 2 | 0 |
| LP-6e exact predecessor system attribution and current refusal | 4 | 0 |
| Subscription statement latency | 3 | 0 |

Whole-file focused results included sync/DSAR 38/38, audit export 12/12,
recovery demo/direct debit 14/14, small-builder acceptance 12/12 with four
pre-existing todos, timeline import 4/4, recovery attribution 2/2, historical
audit and lifecycle 13/13, and CH-4 upgrade 1/1. Both legacy waiter cases
passed. Five focused row-lock and malformed-scope tests passed, and nine
focused LP-4/LP-6e cases passed. The context scanner passed 146/146.
Both commercial guards reported zero diagnostics and the serial guard run
passed 253/253. Workspace typecheck passed 7/7 with one package at a time.
The last complete whole-run totals above exclude these focused corrections.

## Missing pg_dump

- upgrades dark, round-trips a logical binding-table dump into a fresh cluster and rejects carried rows even at a colliding xid8 (test/lp6a-practice-restore.integration.test.ts)

## Tests that reached the held work-order fixture

Each test below reached prepareWorkOrderDemo and was refused at its customer insert in packages/db/src/work-order-fixtures.ts:71. The containing transaction starts at line 69 without the verified contractor credential. These traces establish the immediate dependency on the held edit.

### `test/canonical-revise-duplicate-guard.integration.test.ts`

- refuses canonical revision without changing either approved extra or billing, then permits the same command after unlink
- preserves first pricing, revision and subsequent re-pricing without active links
- does not treat a duplicate-dismissed pending request as an approved duplicate
- negative control: removing the check in a scratch SQL copy breaks the refusal assertion and reproduces the silent drop

### `test/cloudflare-northside-pool.integration.test.ts`

- LATER-SAFETY-141: one client times out under the seed lock; the Cloudflare pool stores the complete Northside seed

### `test/command-replay-contract.integration.test.ts`

- /api/customer-portal/extra-approvals: client decision replays the first result and conflicts across payload, job and kind
- ResolveDuplicateCandidates replays one stored result and refuses changed intent

### `test/connector-billing-status-promotion.integration.test.ts`

- links a completed human ENT-6 paid import once, including concurrent replay, with no monetary writes
- links billed to a human invoiced fact once without monetary effects
- links reversed to a human payment_reversed fact once without monetary effects
- links reversed to a human credited fact once without monetary effects
- refuses disallowed pair billed -> paid without monetary effects
- refuses disallowed pair billed -> credited without monetary effects
- refuses disallowed pair billed -> payment_reversed without monetary effects
- refuses disallowed pair billed -> rejected without monetary effects
- refuses disallowed pair reversed -> invoiced without monetary effects
- refuses disallowed pair reversed -> paid without monetary effects
- refuses disallowed pair reversed -> rejected without monetary effects
- refuses disallowed pair paid -> invoiced without monetary effects
- refuses disallowed pair paid -> credited without monetary effects
- refuses disallowed pair paid -> payment_reversed without monetary effects
- refuses disallowed pair paid -> rejected without monetary effects
- preserves authority, foreign-import and incomplete-import refusals for billed -> invoiced
- preserves authority, foreign-import and incomplete-import refusals for reversed -> payment_reversed
- preserves authority, foreign-import and incomplete-import refusals for reversed -> credited
- refuses wrong fact type, source event, foreign import, absent import, and unsupported staged status
- rechecks finance authority on new links and replay, and rejects forged result fields
- refuses an incomplete ENT-6 import in the same transaction, before a receipt can complete
- negative control: restoring the original refusal makes a valid link fail (transaction rolled back)
- negative control: equality refuses billed -> invoiced and rollback restores the pair
- negative control: equality refuses reversed -> payment_reversed and rollback restores the pair
- negative control: equality refuses reversed -> credited and rollback restores the pair

### `test/connector-export-delivery-staging.integration.test.ts`

- ENT-13A-EXPORT-ACK RED staged partner acknowledgements stages once, preserves the first receipt across retries/rotation, conflicts on changed payload and changes no export/billing rows

### `test/connector-promotion.integration.test.ts`

- imports exactly ENT-2 generated baseline prices, replays once, and keeps the connector receipt staged
- uses the existing ENT-2 revision rules and never reimports a prior event after a later revision
- refuses a tenant-B principal in a tenant-A promotion transaction before importing or writing either tenant
- imports one materials fact through the existing authority, without confirming a prompt
- hides foreign/altered event identities, refuses removed members and unauthorized members without writes
- unknown fixture labels and billing composition holds write nothing
- promotion-record failure rolls back orders, revisions, prices, materials and every import audit
- connector role cannot execute promotion or reach origin, prices, approvals or statements
- direct SQL cannot substitute a command id or forge an import effect
- keeps owner and finance mixed lists available when materials is closed, without writes or selected/replay authority
- keeps owner and finance mixed lists available when materials is non-ordered, without writes or selected/replay authority
- omits a materials candidate with no target job, while selected reads and recording retain their refusal
- does not restore materials visibility for supervisors, unauthorized/revoked members, foreign sessions or mismatched requests
- rethrows unrelated P0001, near-match messages and other SQLSTATEs from materials authority
- negative control: reverting only the exact JOB_NOT_LIVE skip breaks the closed-job list; rollback restores it

### `test/contractor-billing-delivery.integration.test.ts`

- E6-23 E6-24 outcome_unknown delivery is reconciled, never blindly retried
- E6-23 wrong content hash refuses before creating durable delivery
- E6-25 download retrieves only persisted authorized bytes after the fake action succeeds
- E6-24 an interrupted claim is inspected as unknown and reconciliation never sends
- M0-13a paused contractor delivery keeps its queued artifact and records no attempt or send
- LATER-SAFETY-81 refuses another delivery for every sendable or uncertain outbox state without writes
- LATER-SAFETY-81 dead_letter allows a fresh command while both command replays retain their results
- LATER-SAFETY-81 cancelled allows a fresh command while both command replays retain their results
- LATER-SAFETY-81 racing delivery approvals queue exactly one outbox action
- LATER-SAFETY-81 lapsed pending approval allows fresh delivery but remains unclaimable
- LATER-SAFETY-81 lapsed retryable approval allows fresh delivery but remains unclaimable

### `test/contractor-billing-import-failure.integration.test.ts`

- LATER-SAFETY-152 real PostgreSQL atomic import failure retains ENT-F2 qualifying principal and the posted 806p fee after a malformed additional movement
- LATER-SAFETY-152 real PostgreSQL atomic import failure rolls back every invoice group, then accepts corrected input with the unconsumed command ID
- LATER-SAFETY-152 real PostgreSQL atomic import failure keeps a policy-held payment held while preserving the last valid projection
- LATER-SAFETY-152 real PostgreSQL atomic import failure keeps a genuinely empty first invoice, missing prerequisites, ambiguous and quarantined facts successful
- LATER-SAFETY-152 real PostgreSQL atomic import failure preserves legitimate credited movement behavior
- LATER-SAFETY-152 real PostgreSQL atomic import failure preserves legitimate rejected movement behavior
- LATER-SAFETY-152 real PostgreSQL atomic import failure preserves legitimate payment_reversed movement behavior
- LATER-SAFETY-152 real PostgreSQL atomic import failure refuses non-finance and foreign tenant/job imports with otherwise valid data and no writes

### `test/contractor-billing-ordering.integration.test.ts`

- E6-18 E6-20 E6-21 payment before invoice is held then recomputed in a successor run
- E6-19 E6-20 all 24 arrival permutations preserve credits, reversals and exact projections
- r7 E6-19 E6-20 paid composition preserves exact projection in either invoice arrival order (one import)
- r7 E6-19 E6-20 paid composition preserves exact projection in either invoice arrival order (separate imports)
- r7 E6-16 invalid paid composition remains quarantined in either invoice arrival order
- r7 E6-19 E6-20 credited composition preserves exact projection in either invoice arrival order (one import)
- r7 E6-19 E6-20 credited composition preserves exact projection in either invoice arrival order (separate imports)
- r7 E6-16 invalid credited composition remains quarantined in either invoice arrival order
- r7 E6-19 E6-20 rejected composition preserves exact projection in either invoice arrival order (one import)
- r7 E6-19 E6-20 rejected composition preserves exact projection in either invoice arrival order (separate imports)
- r7 E6-16 invalid rejected composition remains quarantined in either invoice arrival order
- r7 E6-19 E6-20 payment_reversed composition preserves exact projection in either invoice arrival order (one import)
- r7 E6-19 E6-20 payment_reversed composition preserves exact projection in either invoice arrival order (separate imports)
- r7 E6-16 invalid payment_reversed composition remains quarantined in either invoice arrival order

### `test/contractor-entitlement-session.integration.test.ts`

- effective switched member is not replaced by owner

### `test/contractor-job-finish.integration.test.ts`

- ENT-8a owner contractor job finish runs the enabled evaluator, cites stored evidence, immediately surfaces and coalesces without financial or shadow effects
- ENT-8a owner contractor job finish records a finish with disabled agreement without evaluating evidence
- ENT-8a owner contractor job finish records a finish with missing agreement without evaluating evidence
- ENT-8a owner contractor job finish uses the current server agreement and refuses altered ids including on replay
- ENT-8a owner contractor job finish refuses supervisor for writes and finish-state reads
- ENT-8a owner contractor job finish refuses surveyor for writes and finish-state reads
- ENT-8a owner contractor job finish refuses operative for writes and finish-state reads
- ENT-8a owner contractor job finish refuses finance for writes and finish-state reads
- ENT-8a owner contractor job finish refuses commercial_manager for writes and finish-state reads
- ENT-8a owner contractor job finish refuses admin for writes and finish-state reads
- ENT-8a owner contractor job finish rechecks a removed owner's authority before replay
- ENT-8a owner contractor job finish returns the same refusal for foreign, out-of-scope and absent jobs
- ENT-8a owner contractor job finish refuses an open visit and caller-supplied authority/time/check fields
- ENT-8a owner contractor job finish rejects raw SQL authority fields without creating a finish or receipt
- ENT-8a owner contractor job finish serializes competing finishes and keeps the record private, forced-RLS and immutable

### `test/contractor-party-bind-work-order-only.integration.test.ts`

- LATER-SAFETY-127 contractor party binding refuses an ordinary draft job at its current revision without changing its parties
- LATER-SAFETY-127 contractor party binding refuses an ordinary quoting job at its current revision without changing its parties
- LATER-SAFETY-127 contractor party binding proves mutation sensitivity by removing and restoring the trigger only in this scratch database

### `test/contractor-retained-read-boundaries.integration.test.ts`

- switched operative is never replaced by owner
- reads leave all business rows receipts and audit heads unchanged

### `test/contractor-retained-read.integration.test.ts`

- historical organisation and contracts survive agreement loss
- historical reads survive track change but not revocation
- client and branch scopes remain unchanged
- restricted readers cannot infer administrative activity

### `test/contractor.integration.test.ts`

- ENT-2 conformance: the work-order import, SoR import, register, batch, revision, assignment, visit, price-list and resident reads agree with the pure role and scope rules, per client in two branches

### `test/customer-signin-lock-order.integration.test.ts`

- matched extra-approver approval versus xa_withdraw: 50 same-job rounds, both lock owners, one outcome
- matched extra-approver approval versus xa_withdraw without a barrier: 50 same-job rounds, both winners, one outcome

### `test/duplicate-canonical-guard.integration.test.ts`

- refuses approved duplicate into rejected canonical without effects
- refuses approved duplicate into logged canonical without effects
- refuses approved duplicate into awaiting_approval canonical without effects
- also refuses a logged duplicate into a rejected canonical
- keeps logged-to-logged linking; active canonical withdrawal rolls back, then succeeds after unlink
- approved-to-approved linking keeps the canonical in the real 0243 billing read
- mutation control: removing the link guard admits the refused approved-to-logged command
- mutation control: removing the withdraw guard admits an active canonical withdrawal

### `test/duplicate-unlink-command-binding.integration.test.ts`

- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL the sole unlink writer succeeds end to end and makes the duplicate active again
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL refuses another processing command by the same actor even with the exact unlink key
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL refuses UnlinkDuplicate with a different job in its semantic key
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL refuses UnlinkDuplicate with a different link in its semantic key
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL refuses UnlinkDuplicate with a different command in its semantic key
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL refuses UnlinkDuplicate with a different prefix in its semantic key
- LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL the same refusal assertion fails with the old unlink branch and the fixed guard is restored

### `test/enterprise-dashboard-stored.integration.test.ts`

- stored ENT-6 billed/paid totals conserve full-composition allocation and trace exact run/line facts
- stores immutable history, serializes replay once, reproduces with a new repository instance and requires complete current team coverage
- catalog enforces FORCE RLS, tenant keys, migration ownership and no raw runtime writes or reads

### `test/enterprise-dashboard.authority-race.integration.test.ts`

- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA1] rechecks an expired stored session despite its previously verified tenant context
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA2] grant.revoke holds exclusive gate first; waiting dashboard refuses after commit
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA2] membership.revoke holds exclusive gate first; waiting dashboard refuses after commit
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA3] dashboard holds shared gate first; grant.revoke waits until the earlier read completes
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA3] dashboard holds shared gate first; membership.revoke waits until the earlier read completes
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA4] a refused read followed by another tenant on the same backend returns only the second tenant's facts
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA5] reads leave every tenant commercial/audit row unchanged; only the identified revocation writes
- TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate [DA2 sensitivity] omitting only the dashboard gate makes the lock-order assertion fail

### `test/enterprise-dashboard.integration.test.ts`

- ENT-9B scoped persisted reads [LATER-SAFETY-58] Friday working-day waits show Tuesday at the same London time, matching the queue deadline
- ENT-9B scoped persisted reads [LATER-SAFETY-58] old snapshots without working-day waits retain their elapsed-minute deadline
- ENT-9B scoped persisted reads [LATER-SAFETY-22] dashboard and xa_queue share weekend deadlines (legacy snapshot: false)
- ENT-9B scoped persisted reads [LATER-SAFETY-22] dashboard and xa_queue share weekend deadlines (legacy snapshot: true)
- ENT-9B scoped persisted reads [E9-02] counts command-created active duplicate groups once and restores two captures after an authorized unlink
- ENT-9B scoped persisted reads [E9-01 E9-03 E9-07] reads command-created captures, current approvals and immutable deadlines; billing stays held
- ENT-9B scoped persisted reads [E9-09 E9-10 E9-11 E9-13] applies covering dashboard grants and tenant scope before all output
- ENT-9B scoped persisted reads [E9-12 E9-15] revocation takes effect on the next request and a session cannot choose a foreign context
- ENT-9B scoped persisted reads [E9-10 E9-12] a reassigned operative disappears even while the old job remains in scope; unrelated grants cannot supply scope
- ENT-9B scoped persisted reads [E9-08] derives close-out answers from visit commands and does not change job state
- ENT-9B scoped persisted reads [E9D] close-out observations cite only covered visits, are replay-stable and disappear after reassignment
- ENT-9B scoped persisted reads [E9-14 E9-26 E9-28 E9-31] reads and observations preserve canonical business rows and give runtime no new privilege
- [E9E] a billed variation matched to a JobGuard extra has no missing-extra advisory
- [E9E] original orders stay silent and unrelated credits cannot erase a possible variation
- [E9E] unmatched other invoice lines are advisory, scoped, replay-stable and removed by current credits/rejections

### `test/enterprise-fee-command-fixtures.integration.test.ts`

- ENT-F1: £150 approved, billed plus VAT and paid yields a 1500p accrual
- ENT-F2: full blended receipt follows 806p with a 1594p delta, never another 2400p
- ENT-F3 / ENT-F12: credit after an approved month compensates next month, preserving the original statement
- ENT-F4: a reversed £180 payment compensates the entire 1500p fee
- ENT-F5: approved and billed caps survive posting
- ENT-F6: approved and billed caps survive posting
- ENT-F7: two billed-and-paid logs reconcile once, retain artifacts and origins, and compensate to one fee
- fractional duplicate credit preserves 250000/31 net pence in storage, replay and the authorized hash
- ENT-F8: office, client instructions and order lines contribute zero even when billed and paid
- ENT-7: withdrawn amounts contribute zero through real commands, with a qualifying control
- ENT-7: rejected amounts contribute zero through real commands, with a qualifying control
- ENT-7: unexported amounts contribute zero through real commands, with a qualifying control
- ENT-7: unpaid amounts contribute zero through real commands, with a qualifying control
- ENT-7: runtime SQL cannot insert fee contributions or journal headers
- ENT-F9: origins either side of a version boundary keep 10% / 8%; a later X credit stays under v1
- ReconcileExportedDuplicate retains the earlier agreement when the later log is chosen as canonical
- Self-check: cumulative approval/credit caps survive signed partial reversals and replay without rounding
- Self-check: wrong locked export revision and oversized amounts cannot create fee contributions
- Self-check: posting command IDs bind the exact statement and authorization, including zero-result replays
- Self-check: approved statements reject stale credit inputs without changing the locked bill or posting
- Self-check: cross-tenant replay, reads and cross-job duplicate references disclose no foreign data
- ENT-F10: three 5p extras round cumulatively to 2p; largest-remainder trace is 1p/1p/0p by ID
- ENT-F11: Q=5p half-even cumulative fee=0p
- ENT-F11: Q=15p half-even cumulative fee=2p
- ENT-F11: Q=25p half-even cumulative fee=2p
- ENT-F11: two 5p receipts accumulate to 1p rather than rounding each receipt down
- ReconcileExportedDuplicate refuses non-live jobs, wrong tenant/session and direct runtime writes
- ENT-7: the simulated invoice posts exact approved money once and rechecks revoked authority

### `test/enterprise-fee-derivation.integration.test.ts`

- ENT-F2 on PostgreSQL: the site extra contributes Q = 250000/31 pence, the order line nothing; 10% rounds half-even to 806p
- unexported and unpaid extras contribute zero
- replays and concurrent derivations record once; the same command with a different request conflicts
- only finance may derive or read; an unknown session and a missing agreement are refused
- the runtime role cannot read or write fee tables directly, and stored rows are immutable even for the owner
- an agreement version only takes extras whose origin time selects it

### `test/enterprise-fee-posting.integration.test.ts`

- posts an approved statement once: one balanced accrual of the exact delta; replays and races add nothing
- an unchanged next month subtracts prior posted net: zero delta and no new journal
- posting is refused without approval, with another authorisation, revoked or expired authority, or non-finance
- posting is refused when the facts move after approval
- a reversal after posting becomes a linked compensation on the next month's statement, netting the fee back to zero
- direct runtime SQL can neither write the fee book nor call its private helper, and journals are immutable
- ENT-11b self-attack: a credit after approval blocks posting without changing the approved statement
- ENT-11b self-attack: another company cannot read a statement, derivation or journals, or post its approval
- splits a compensation across outstanding accruals and never offsets the same pence twice
- zero-statement replays preserve receipts and append no audit, including fresh-key races and cross-company attacks
- fresh-key accrual replays append one bound audit per command; same-key retries and forbidden replays append nothing
- refuses preparing February after the same agreement has a posted March fee
- refuses posting an approved February after March posts, without writing a fee or receipt
- still posts February then March in order, replays the latest month and posts a later month

### `test/enterprise-fee-production.integration.test.ts`

- production derive/accrue refuses supplied approvals, flags, tenant references and replays without writes or leaks
- rebuilds exact liability and source attribution; repeated imports/derives and racing posts retain one journal
- a reversal invalidates stale derivations and yields linked compensation without erasing the original
- two paid 5p extras on different contracts share one cumulative agreement rounding and posting lock
- direct runtime writes and oversized or mislinked journal attempts cannot exceed the rebuilt amount

### `test/enterprise-fee-rejected-line.integration.test.ts`

- R151-ZERO: rejection before payment retains allocated cash but charges zero
- R151-ZERO: rejection after payment retains allocated cash but charges zero
- R151-CONTROL: identical unrejected ENT-F2 retains exact principal and fee; another rejected invoice line does not erase it
- R151-REPLAY: rejection changes input hash, exact command/event replay adds no duplicate history
- R151-COMPENSATE: rejection after approval refuses stale posting; after posting uses linked later-period compensation
- R151-ADJUST: credits and reversals cannot revive rejected principal
- R151-MIXED: only the rejected extra is excluded from a mixed invoice
- R151-ISOLATION: another job's rejection leaves this job eligible; tenant and finance/session guards remain closed
- R151-MUTATION: removing only the exclusion fails the zero-principal assertion; rollback restores it
- R151-IMMUTABLE: runtime cannot insert contributions, and approved statements/journals resist owner edits

### `test/enterprise-fee-statement.integration.test.ts`

- prepares one revision per unchanged month from the latest derivation; replays return it
- exact approval creates one Decision, an approved resolution and one exact expiring authorisation
- approval is refused for a mismatched hash or total, a bad expiry, non-finance, and changed facts
- a dispute closes the revision; preparing again makes the next revision, and only that one can be approved
- direct runtime SQL can neither write statement tables, call the private helpers, nor approve with a wrong total

### `test/enterprise-live-prompt-access.integration.test.ts`

- ENT-8A-P persisted prompt access Possible extras lane is supervisor-only, including a covering supervisor not named on the visit
- ENT-8A-P persisted prompt access fresh reads expose a committed prompt; only scoped resolution roles can read its detail
- ENT-8A-P persisted prompt access only finance and owner import materials; import does not grant resolution or lane authority
- ENT-8A-P persisted prompt access an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-8A-P persisted prompt access same-tenant wrong-job scope and cross-tenant reads refuse identically
- ENT-8A-P persisted prompt access revoked grants are rechecked on successful replay and reads
- ENT-8A-P persisted prompt access revoked memberships and unknown sessions cannot reuse historic authority
- ENT-8A-P persisted prompt access a revoked persisted session cannot read or mutate
- ENT-8A-P persisted prompt access contractor capability loss preserves read-only prompt history and refuses new work
- ENT-8A-P persisted prompt access direct SQL cannot mutate prompt sources, resolutions or settings, even in a valid tenant context

### `test/enterprise-live-prompt-commands.integration.test.ts`

- ENT-8A-P atomic commands exactly one new origin, capture note and scope identity; no automatic price or approval
- ENT-8A-P atomic commands confirmed extras continue through ENT-5 pricing without rewriting origin
- ENT-8A-P atomic commands work-order prompt receipts still refuse runtime result and identity rewrites
- ENT-8A-P atomic commands raw confirmation still raises PROMPT_ORIGIN_HELD
- ENT-8A-P atomic commands dismissal is immutable and exact prompt hash is required
- ENT-8A-P atomic commands unsupported returns quarantine the comparison and prevent an earlier prompt confirmation
- ENT-8A-P atomic commands failed audit rolls source, origin, resolution and receipt back together
- ENT-8A-P atomic commands importMaterials replaying a command id returns the first result, never the job's current state
- ENT-8A-P atomic commands importMaterials the same command id with a changed payload conflicts
- ENT-8A-P atomic commands importMaterials the same command id on another job conflicts
- ENT-8A-P atomic commands importMaterials a successful no-op keeps its identity
- ENT-8A-P atomic commands importMaterials a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-8A-P atomic commands importMaterials an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-8A-P atomic commands evaluate replaying a command id returns the first result, never the job's current state
- ENT-8A-P atomic commands evaluate the same command id with a changed payload conflicts
- ENT-8A-P atomic commands evaluate the same command id on another job conflicts
- ENT-8A-P atomic commands evaluate a successful no-op keeps its identity
- ENT-8A-P atomic commands evaluate a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-8A-P atomic commands evaluate an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-8A-P atomic commands confirm replaying a command id returns the first result, never the job's current state
- ENT-8A-P atomic commands confirm the same command id with a changed payload conflicts
- ENT-8A-P atomic commands confirm the same command id on another job conflicts
- ENT-8A-P atomic commands confirm a successful no-op keeps its identity
- ENT-8A-P atomic commands confirm a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-8A-P atomic commands confirm an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-8A-P atomic commands dismiss replaying a command id returns the first result, never the job's current state
- ENT-8A-P atomic commands dismiss the same command id with a changed payload conflicts
- ENT-8A-P atomic commands dismiss the same command id on another job conflicts
- ENT-8A-P atomic commands dismiss a successful no-op keeps its identity
- ENT-8A-P atomic commands dismiss a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-8A-P atomic commands dismiss an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job

### `test/enterprise-live-prompt-end-check.integration.test.ts`

- caller completion event rejection missing agreement cannot authorize an end check
- caller completion event rejection disabled agreement cannot authorize an end check
- caller completion event rejection wrong-version agreement cannot authorize an end check
- caller completion event rejection a completed visit cannot substitute for authoritative job completion
- end-check stored rule (a) recheck finishes without evaluating a recognised off-order observation when the end check is disabled
- end-check stored rule (a) recheck refuses a stored identity/PNG finding mismatch and rolls back the entire finish
- end-check stored rule (a) recheck does not let an unfinished owner finish authorize another job projection
- end-check stored rule (a) recheck creates a checked rule (a) prompt and closes owner projection access before replay

### `test/enterprise-live-prompt-office.integration.test.ts`

- ENT-8A-P office advisory real office creation matching surfaced prompts emits one advisory and preserves zero fee eligibility
- ENT-8A-P office advisory real office creation matching dismissed prompts emits one advisory and preserves zero fee eligibility
- ENT-8A-P office advisory confirming an exact office match coalesces and creates no origin or scope identity
- ENT-8A-P office advisory ambiguous exact matches require an explicit same-job existing extra without merging origins
- ENT-8A-P office advisory reads an honest empty state, paginates without duplicates and rejects invalid bounds/cursors
- ENT-8A-P office advisory rechecks detail roles, tenant/job scope, and revoked grants even for empty jobs

### `test/enterprise-live-prompt-races.integration.test.ts`

- ENT-8A-P command races b2: first completion holds key 417 before the live lock; replay holds only authority and never locks the baseline
- ENT-8A-P command races b2: concurrent duplicate completions return one result and one closeout answer
- ENT-8A-P command races two-connection confirm/confirm produces one resolution and origin
- ENT-8A-P command races two-connection confirm/dismiss produces one final resolution or typed conflict
- ENT-8A-P command races two-connection source replay keeps one source and original result
- ENT-8A-P command races confirm/office capture cannot duplicate a prompt origin or change office origin
- ENT-8A-P command races baseline change races refuse stale binding or preserve the locked baseline
- ENT-8A-P command races job-leaves-live race never writes after the live guard loses

### `test/enterprise-live-prompt-repository.integration.test.ts`

- lists exactly verified uninvalidated same-job completion sources with a narrow shape
- rejects foreign, unknown and uncovered jobs, including another supervisor's job
- refuses every role refused by the observation command and rechecks revoked grants
- binds runtime-read photo bytes to the current session, job, evidence, hash, version and length

### `test/enterprise-live-prompt-rules.integration.test.ts`

- persisted deterministic prompt rules materials strict excess is immediately visible from command-created issue facts
- persisted deterministic prompt rules materials equality and unknown mappings or units remain silent
- persisted deterministic prompt rules same-time contradictory facts quarantine a previously surfaced materials comparison
- persisted deterministic prompt rules source replay deduplicates and changed source identity content conflicts atomically
- persisted deterministic prompt rules unauthorized admin imports have no source or prompt effects
- persisted deterministic prompt rules unauthorized supervisor imports have no source or prompt effects
- persisted deterministic prompt rules unauthorized surveyor imports have no source or prompt effects
- persisted deterministic prompt rules unauthorized commercial_manager imports have no source or prompt effects
- persisted deterministic prompt rules unauthorized operative imports have no source or prompt effects
- persisted deterministic prompt rules unauthorized read_only imports have no source or prompt effects
- persisted deterministic prompt rules completed visit yes creates a job-wide closeout prompt before the visit transaction commits
- persisted deterministic prompt rules closeout confirmation requires explicit work identity and creates no implicit price
- persisted deterministic prompt rules no answer suppresses closeout and missing factor suppresses visit duration
- persisted deterministic prompt rules completed visits compare exact server microseconds to immutable contract factor
- persisted deterministic prompt rules an observation without immutable verified bytes refuses and leaves no prompt
- persisted deterministic prompt rules a successful no-op keeps its identity
- observation command identity and stored PNG provenance rule a reads tags from command-finalized immutable PNG bytes and cites their native hash/version
- observation command identity and stored PNG provenance ordered explicit synonym stays silent and forged tag/hash/version is refused
- observation command identity and stored PNG provenance replaying a command id returns the first result, never the job's current state
- observation command identity and stored PNG provenance the same command id with a changed payload conflicts
- observation command identity and stored PNG provenance the same command id on another job conflicts
- observation command identity and stored PNG provenance a successful no-op keeps its identity
- observation command identity and stored PNG provenance a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- observation command identity and stored PNG provenance an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job

### `test/evidence-bundle-screen.integration.test.ts`

- checks actual approvals read-only, preserves absences, and refuses inaccessible/foreign jobs before reading objects

### `test/evidence-bundle.integration.test.ts`

- joins actual immutable origin, revision, requirement and approval facts; replays deterministically; refuses stale requests and cross-tenant actors
- LATER-SAFETY-47 bundle follows exact duplicate-link reversals without changing billing
- LATER-SAFETY-47 Northside follows exact duplicate-link reversals without changing billing
- LATER-SAFETY-89 preserves an intact bundle through real export, billed and paid imports and post-approval lifecycle states
- LATER-SAFETY-89 refuses latest credited even with immutable approval and export facts
- LATER-SAFETY-89 refuses latest billing_rejected even with immutable approval and export facts

### `test/extra-approval-rules.integration.test.ts`

- Q04 first receipt wins a same-person repeat, with no second fact or audit, and revoked grants refuse replay
- Q11 covered surveyor can withdraw an open request, but cannot change its final outcome
- Q11 covered commercial_manager can withdraw an open request, but cannot change its final outcome
- Q06 thresholds are frozen per rule version; Q16 pricing alone never submits
- Q08 without a backup the mandatory queue stays waiting and overdue, without an escalation fact

### `test/extra-client-authority-loss.integration.test.ts`

- A3 control: approver who keeps authority is not over-cancelled; send delivers once and link works
- A8 legacy runtime decide path refuses an unused link after sender grant loss
- Q14 membership loss cancels pending and retryable sends, preserves decisions and current-authority reads
- Q14 client grant loss cancels pending and retryable sends, preserves decisions and current-authority reads
- Q14 sender grant loss cancels pending and retryable sends, preserves decisions and current-authority reads
- Q14 client session has no export action and stores no refusal
- Q14 contractor bundle check returns only verification, and refuses export input
- Q14 negative mutation: removing the SQL cancellation makes the cancel case fail

### `test/extra-client-send-permission-order.integration.test.ts`

- a bound current operative gets the same refusal for priced, absent and unpriced requests on one valid job, with no effects
- covered surveyor sends the exact fake action once; missing and unpriced remain NOT_FOUND
- covered commercial_manager sends the exact fake action once; missing and unpriced remain NOT_FOUND
- membership revoked cannot gain effects through replay
- membership expired cannot gain effects through replay
- grant revoked cannot gain effects through replay
- refuses uncovered jobs, foreign tenants, spoofed actors, absent binding and expired credentials without effects

### `test/extra-duplicate-candidates.integration.test.ts`

- two operatives remain separate and priced; linking and unlinking agree with the export blocker, including replays
- cross-tenant jobs, uncovered grants and wrong roles fail closed
- stale unlinks and linking racing an export cannot export duplicate captures
- installed routines agree on the UTC day, visit, code, excess-line and canonical matrix
- ENT-3 relink same direction exports once and preserves replay/history
- ENT-3 relink opposite direction exports once and preserves replay/history
- ENT-3 unlink restores separate approved extras through the existing command and export paths
- ENT-3 relink refuses a forged actor, uncovered grant, wrong role and foreign tenant without effects
- ENT-3 relink racing unlink serializes to an active fresh link or unresolved candidates
- ENT-3 reversal never promotes a duplicate-dismissed pending approval to approved
- dismissal is exact, append-only and reversible; replay is inert and export keeps distinct approved lines
- table owner cannot truncate append-only duplicate dispositions and all rows remain
- refuses reporters, pricers, forged actor, foreign tenant, uncovered and wrong roles, with no facts or receipts
- revision changes and a new extra racing dismissal raise the group again and keep export refused
- dismisses one group only; every other group still refuses export and concurrent replays create one fact
- independent surveyors and commercial managers may dismiss with a covering grant
- refuses disposition/reason mismatches without changing receipts, facts, audit or export eligibility
- accepts both distinct-work reasons and review-changed reopening through the SQL writer
- begins the registered duplicate command with repository-style input
- completes only the exact fresh disposition fact after a processing receipt
- the checked writer creates a lifecycle claim and one command audit, and replays the stored result
- replays pre-lifecycle receipts with their historical digest and refuses changed payloads

### `test/extra-escalation-worker.integration.test.ts`

- ENT-5 worker discovery, crash rollback, concurrent restart, tenant confinement and alternate revocation

### `test/extra-evidence-packs.integration.test.ts`

- E5-18 extra sources and shared verifier — issued sources only
- E5-19 pending rejected foreign and wrong-version source controls refuse
- E5-19 evidence lifecycle and confirmation limits — issued sources only
- E5-18 tampered stored sources are detected through persisted hashes
- requirement, step actors and outcome are exact persisted versioned sources
- withdrawn and rejected requests remain explicit and cannot acquire a later approval
- foreign step sources cannot replace a bound fact, and missing required facts stay incomplete

### `test/extra-links.integration.test.ts`

- ENT-4b immutable links [DW1] all new table rows refuse mutation as runtime and migration owner
- ENT-4b immutable links [DW4a] composite foreign keys reject cross-tenant and same-tenant wrong-job links/evidence
- ENT-4b immutable links [DW4b] self, chain, cycle, second active link and concurrent chain are refused
- ENT-4b immutable links [DW4b] immutable unlink row guards preserve history and allow relink before export; command surface HELD
- ENT-4b immutable links [DW4c] order-line links preserve origin/hash; same/older revision and duplicate use are refused
- ENT-4b immutable links [DW4b] either exported endpoint blocks link and unlink, preserving the origin
- ENT-4b immutable links [DW4c] an instructed revision older than the origin is refused
- ENT-4b immutable links [DW5a] failed link/order seam and deferred missing audit roll back rows and receipts
- ENT-4b immutable links [DW5a] link, raw unlink and order writes roll back at receipt, fact, audit and commit failures
- ENT-4b immutable links [S4] missing unlink/order audit fails commit with no partial link history
- ENT-4b immutable links [DW6] link audits contain only allowed IDs and hashes
- ENT-4b immutable links [R2] effective origin is independent of canonical choice and uses lower ID on a time tie
- ENT-4b immutable links [R3] later formal instruction leaves one extra and its immutable site origin intact
- ENT-4b immutable links [S1] foreign tenant link/event reads are NOT_FOUND; writes cannot name foreign extras
- ENT-4b immutable links [S4] both link tables and unlink history share xmin with their audit; missing audit fails commit

### `test/extra-origin.integration.test.ts`

- ENT-4b origin persistence [DW1] runtime cannot mutate immutable rows; owner triggers refuse UPDATE and DELETE
- ENT-4b origin persistence [DW2a] all mismatched raising command/kind pairs are refused
- ENT-4b origin persistence [DW2b] receipt actor, processing status and exact semantic identity are required
- ENT-4b origin persistence [DW2c] origin and client capture uniqueness reject second rows with 23505
- ENT-4b origin persistence [DW2d] neither origin column accepts the other track's kinds
- ENT-4b origin persistence [DW3] missing origin fails at commit; SH-1 deferred constraint remains singular
- ENT-4b origin persistence [DW5a] failures at each write, seam, audit and commit leave no facts or receipt
- ENT-4b origin persistence [DW5b] command/capture replay and two-connection retry have one effect; conflicting payloads fail
- ENT-4b origin persistence [DW5b] a successful capture retry durably binds its command ID before any reuse
- ENT-4b origin persistence [DW6] audit uses closed ID/hash keys; capture metadata never appears in audit or errors
- ENT-4b origin persistence [R1] office, instruction, import, parties, unknown commands cannot write or relabel site origins
- ENT-4b origin persistence [R4] earlier small-builder origins survive a later contractor assignment unchanged
- ENT-4b origin persistence [R4] merged small-builder capture reads as versioned legacy with unknown identities preserved
- ENT-4b origin persistence [R4] merged legacy origin trigger reads truthfully while command origins stay strict
- ENT-4b origin persistence [S4] clearing tenant context after valid origin/event/audit writes refuses commit
- ENT-4b origin persistence [S1] stamped per-call contexts fail closed; other tenant/job reads are NOT_FOUND
- ENT-4b origin persistence [S4] origin/event/audit share xmin; absent or mismatched audit/logged fact fails at commit
- ENT-4b origin persistence [S5] server overwrites authority fields; grants, scope, visits, membership and prompt are guarded
- ENT-4b origin persistence [S4] origin requires exact logged and exact hash/command audit in the same transaction
- ENT-4b origin persistence [S5] evidence and excess references preserve job identity and new scope lineage
- ENT-4b origin persistence [S5] grants cover exactly tenant/team/branch/region; visits bind member/job; inactive members fail
- ENT-4b origin persistence [S6] every stored contractor hash equals the pure mirror with six-digit timestamp text
- ENT-4b origin persistence [C3] all fixtures are synthetic_demo and every raised identity is a new scope item
- ENT-4b origin persistence [S4] a stamped context with an UPPER-CASE tenant id commits a valid extra
- ENT-4b origin persistence [S4] both spellings of one tenant identify one extra for one client capture ID
- ENT-4b origin persistence [S4] an absent tenant setting at commit is refused and nothing is written
- ENT-4b origin persistence [S4] an empty tenant setting at commit is refused and nothing is written
- ENT-4b origin persistence [S4] a different tenant's id in the setting at commit is refused, in either letter case
- ENT-4b origin persistence [S4] a non-uuid tenant setting at commit is refused and nothing is written

### `test/extra-queue-approver-eligibility.integration.test.ts`

- hides a covered supervisor's own extra but keeps another eligible supervisor's mandatory item
- hides step 1 from the actor who filled step 0, while preserving the next approver
- Q04 keeps the same slot visible and approvable on a new revision, but excludes a prior different slot
- a succeeded rejection reserves its slot across revisions without banning same-slot participation
- LATER-SAFETY-49 legacy unknown rejection slots stay ineligible, with every fixture guard enabled
- preserves scope, tenant, revoked-grant and revoked-member exclusions
- preserves London deadlines, overdue state and the listed escalation alternates
- mutation probe: removing only SELF_APPROVAL makes its queue regression fail
- mutation probe: removing only REUSED_APPROVER makes its queue regression fail

### `test/extra-unlink.integration.test.ts`

- ENT-4c un-link command [D1] an owner un-links an active link: one un-link row, one completed command receipt, one domain and one checked terminal audit, nothing else
- ENT-4c un-link command [D2] each of the five roles un-links at each scope that covers the job
- ENT-4c un-link command [D3] every role in the merged list is decided, and the four other roles are refused
- ENT-4c un-link command [D4] one of the five roles without a covering grant is refused
- ENT-4c un-link command [D5] a revoked grant or membership is refused, on a new command and on a replay
- ENT-4c un-link command [D6] mixed and foreign actors are refused
- ENT-4c un-link command [D7] a refused caller gets one answer, whatever they name
- ENT-4c un-link command [D8] the write statement carries the rule itself
- ENT-4c un-link command [D9] authority is read from the database at the moment of the command
- ENT-4c un-link command [D10] typed refusals for an allowed actor, each writing nothing
- ENT-4c un-link command [D11] replay returns the stored result once; two callers produce one un-link
- ENT-4c un-link command [D12] history is preserved, append-only, and a pair can be linked again
- ENT-4c un-link command [D13] refusal after export on either extra
- ENT-4c un-link command [D14] the audit event commits or rolls back with the command
- ENT-4c un-link command [D15] tenant isolation and spelling
- ENT-4c un-link command [D16] nothing else changes
- ENT-4c un-link command [D17] readDuplicateLinks
- ENT-4c un-link command [D18] errors carry codes only

### `test/financial-reconciliation-adjustments.integration.test.ts`

- persists waiting state; serializes duplicate proposals and approvals, with exact hashes and unchanged books
- refuses stale report hash and approval after a newer run, preserving the queue and books
- concurrent distinct approvals create only one approval and never modify financial books
- reads fail closed for foreign and unknown runs, non-finance, revoked and expired sessions

### `test/financial-reconciliation-queue.integration.test.ts`

- stores missing, duplicate and late observations in an immutable queue; rebuilds identically after restart
- binds replay payloads, serializes concurrent runs and deduplicates daily scheduling
- refuses self-approval including a second session for the same identity; a different finance identity approves exact content
- refuses stale runs, locked invoice revision substitution and new discrepancies
- denies direct writes, enforces append-only even for owner, and leaks no cross-tenant run
- report reads require current finance access even for a known stored run
- SQL rejects forged invoice money, revision, unknown invoice and omission of a stored invoice despite fresh hashes
- SQL refuses fabricated, omitted and altered differences and forged balances; an honest direct run is unchanged
- SQL refuses unbacked journal and correction facts rather than treating reviews as posted money
- SQL and core agree on supported provider chains, duplicate effects, limits, orphans and late events
- SQL does not let a daily alias persist a forged report

### `test/firm-profile.integration.test.ts`

- refuses a marked practice company's profile and saves

### `test/job-scheduling.integration.test.ts`

- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative CH-3b DW3 held cases: the operative on the job and that team's supervisor read the resident contact; an operative outside the job's team gets the same 404 as a job that does not exist
- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative lets roles with resident.read read through the scope that covers the job's team, and no role without it
- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative follows the job's current revision: moving an order to another team moves who may read it, and the previous team loses access
- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative keeps the contact out of every list, projection and export the scheduling work adds
- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative agrees with the pure scope rules for every non-operative role, scope kind, permission and job position
- CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative agrees with the pure operative rule: only an operative assigned to the job, in the job's team, acts on it
- ENT-2 scheduling facts: a read projection only shows the assignment from the import to the people the job's scope covers, and refuses every other id with the same not-found
- ENT-2 scheduling facts: a read projection only has no scheduling command: runtime cannot write assignments or visits, and a visit written by the owner (ENT-3's future writer) is projected with server times
- ENT-2 scheduling facts: a read projection only rejects an assignment that is not a real team member of the order's team, and an operative revoked after assignment loses access

### `test/lock-order-1.integration.test.ts`

- [LOCK-ORDER-1(a)] holds the shared tenant administration lock before the origin foreign key can lock the work order
- [LOCK-ORDER-1(c)] 50 same-instant captures and baseline revisions use separate connections and leave consistent committed state
- [LOCK-ORDER-1(d)] M31-S15 same-instant capture, revoke and revise have explicit outcomes

### `test/lp-job-doors-compatibility.integration.test.ts`

- LP-2 creation caller compatibility groundwork [LP2-A12] ENT-2 import still creates one live work-order job atomically through the product repository

### `test/lp5b-contractor-writers.integration.test.ts`

- LP-5b primitive capture first/replay/conflict and duplicate client captures keep the same result
- LP-5b approval replay checks the original step's current grant and cannot repeat the effect
- LP-5b visits preserve microsecond result DTOs, conflicts and current membership on replay
- LP-5b unknown types and completion without each contractor effect are refused and rolled back

### `test/m4-23-contractor-acceptance.integration.test.ts`

- M4-23 site: command approval → fake export → replayed status import → exact monthly posting
- M4-23 office: command approval → fake export → replayed status import → exact monthly posting
- M4-23 client: command approval → fake export → replayed status import → exact monthly posting
- M4-23 original order: paid ordinary work stays in allocation and earns no fee
- M4-23 rejected extra: the actual rejection prevents export and positive fees
- M4-23 part payment: only settled principal earns 500p; next month posts only the 1000p balance
- M4-23 credit: next month compensates once and leaves the approved bill and journal immutable
- M4-23 duplicate log: capture replay and an explicit duplicate resolution leave one billed fee line
- M4-23 cross-customer authority cannot read, import against or post the other contractor's statement

### `test/northside-demo.integration.test.ts`

- ENT11A-01 the generated contractor is seeded through commands: 3 clients, 40 operatives, 2,000 orders in the month, all counted back from the rows
- FLAKE-DIAG-1 measures legacy/new reads and preserves allowed AND denied seeded jobs
- ACTION-ATTRIBUTION durably binds every journey command to the persisted tester, fictional actor and switch, with no delivery attempts

### `test/offline-risk.integration.test.ts`

- M31-S09 minimal authorized repository read
- M31-S10 queued intent commits existing facts
- M31-S11 fresh-instance persistence
- M31-S12 current authority on replay
- M31-S13 tenant actor and resource boundaries
- M31-S16 ambiguous response and rollback
- M31-S17 compatibility
- replaying a command id returns the first result, never the job's current state
- the same command id with a changed payload conflicts
- the same command id on another job conflicts
- a successful no-op keeps its identity
- a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- an unauthorised caller gets the identical EXTRA_FORBIDDEN for unknown, foreign, not-live and live jobs

### `test/offline-risk.properties.integration.test.ts`

- M31-S15 real database multi-crew convergence
- M31-S15 generated authority and baseline changes have explicit outcomes

### `test/operative-entitlements.integration.test.ts`

- site-origin guard refuses agreement loss, preserves historical rows, and refuses prior command replay without changing stored facts

### `test/operative-offline.integration.test.ts`

- ENT12 downloads filter assigned jobs without RLS and expose no resident or shadow columns
- ENT12 retains labelled device time while server writes origin, order and current revision
- ENT12 offline authority loss and cross-tenant selectors write no origin

### `test/practice-company-marker.integration.test.ts`

- [PW31] P3 P6 P14 locator stops an already-running switch without changing its history
- [PW31] P2 P14 invitation stops an already-running switch without changing its history
- [PW31] P7 P11 P14 owner address stops an already-running switch without changing its history
- [PW31] P7 P11 P12 P14 worker address stops an already-running switch without changing its history
- [PW31] P8 P15 owner session stops an already-running switch without changing its history
- [PW31] P8 P15 worker session stops an already-running switch without changing its history
- [PW31] P16 0143 emergency window uses existing locator stops an already-running switch without changing its history
- [PW31] P17 0143 approved emergency rule uses existing locator stops an already-running switch without changing its history
- [PW31] P18 0143 emergency use uses existing locator stops an already-running switch without changing its history
- [PW31] P19 0150 user_email insert stops an already-running switch without changing its history
- [PW31] P20 0150 signup locator insert stops an already-running switch without changing its history
- [PW31] P21 0150 replacement locator repoint stops an already-running switch without changing its history
- [PW31] P22 0150 invitation locator insert stops an already-running switch without changing its history
- [PW31] P23 0150 invitation acceptance stops an already-running switch without changing its history
- [PW31] P24 0150 invitation create stops an already-running switch without changing its history
- [PW15] [PW16] locator prevents marking and is refused after marking
- [PW15] [PW16] invitation prevents marking and is refused after marking
- [PW15] [PW16] address prevents marking and is refused after marking
- [PW16] P4 P5 P6 P12 SSO connection attach is refused for a marked company
- [PW31] P1 signup of another company cannot affect an acting session
- [PW31] P9 P10 no connection or locator exists to grant emergency or SCIM access
- [PW15] [PW33] a marker cannot be written by hand on other terms
- [PW23] new control-plane rows and audit never store a session value
- [PW15] marker history is permanent and timestamp bounds use the database clock
- [PW16] locator and address repointing cannot attach marked identities
- [PW31] P13 operator paths have no root to bypass the unchanged identity refusals
- [PW15] RC3 P7 generated signed-in refuses routine and table-owner marker without writing either record
- [PW15] V1 P3 locator refuses routine and table-owner marker without writing either record
- [PW15] V2 P2 pending invitation refuses routine and table-owner marker without writing either record
- [PW15] V3 P3 accepted invitation refuses routine and table-owner marker without writing either record
- [PW15] V4 P4 connection refuses routine and table-owner marker without writing either record
- [PW15] V5 P5 verified domain refuses routine and table-owner marker without writing either record
- [PW15] V6 P7 owner address refuses routine and table-owner marker without writing either record
- [PW15] V7 P7 admin address refuses routine and table-owner marker without writing either record
- [PW15] V8 P8 direct session refuses routine and table-owner marker without writing either record
- [PW16] product invitation and SSO connection administration cannot attach a marked company
- [PW4] a marked company's second owner-written session cannot acquire its marker

### `test/practice-worker-switch-proof.integration.test.ts`

- [PW6] [PW17] runtime has no table authority: SELECT * FROM
- [PW6] [PW17] runtime has no table authority: INSERT INTO
- [PW6] [PW17] runtime has no table authority: UPDATE
- [PW6] [PW17] runtime has no table authority: DELETE FROM
- [PW14] lookup refuses every mismatched marker and switch condition
- [PW8] [PW17] immutable switch history, exact environment and window CHECKs
- [PW10] end without its audit event fails at commit and keeps the current worker
- [PW32] wider grants only refused for a currently acted-as member
- [PW17] foreign-key chain survives disabled user triggers
- [PW4] tampered session callers of every non-owner role are uniformly refused
- [PW20] authority settings cannot select another company or target
- [PW13] [PW17] direct owner writes cannot select a foreign, office or owner target
- [PW17] missing decision answers fail closed with the caller refusal
- [PW10] a direct table-owner switch insert still requires its event at commit
- [PW8] [PW17] table-owner switch and end timestamps must be true database times
- [PW14] marker environment CHECK survives disabled triggers
- [PW4] a session whose identity does not match its owner is refused uniformly

### `test/practice-worker-switch-upgrade.integration.test.ts`

- [PW26] rolled-back one-microsecond and full-type controls fail; later additions pass
- [PW27] hardened rollback and separate feature-off preserve end and state
- [PW34] composed lookup at head has all three answers and helper errors return no member
- [PW12] no-active-switch classes remain byte-equal to the hardened lookup at head
- [PW34] ended never-issued sessions have no fourth answer for every switch state
- [PW34] ended cap-expired sessions have no fourth answer for every switch state
- [PW34] ended revoked sessions have no fourth answer for every switch state
- [PW34] ended home-expired sessions have no fourth answer for every switch state
- [PW34] ended home-revoked sessions have no fourth answer for every switch state

### `test/practice-worker-switch.integration.test.ts`

- [PW1] [PW3] [PW13] decision 39 switches to operative and back without renewing the session
- [PW1] [PW3] [PW13] decision 39 switches to supervisor and back without renewing the session
- [PW1] [PW3] [PW13] decision 39 switches to surveyor and back without renewing the session
- [PW1] [PW3] [PW13] decision 39 switches to client_approver and back without renewing the session
- [PW2] exactly the worker's own merged permissions and unchanged authority rows
- [PW4] [PW7] a refused command writes no switch and no marker
- [PW5] target owner has the identical not-found refusal
- [PW5] target admin has the identical not-found refusal
- [PW5] target commercial_manager has the identical not-found refusal
- [PW5] target finance has the identical not-found refusal
- [PW5] target read_only has the identical not-found refusal
- [PW5] target revoked has the identical not-found refusal
- [PW5] target wider has the identical not-found refusal
- [PW6] foreign target and context cannot select another company
- [PW7] replaying a command id returns the first result, never the session's current state
- [PW7] the same command id with a changed target conflicts
- [PW7] the same command id from another session conflicts
- [PW8] expiry leaves an unclosed switch until explicitly ended
- [PW9] ended revoked session cannot act or revive
- [PW9] ended expired session cannot act or revive
- [PW9] ended home-revoked session cannot act or revive
- [PW9] ended home-expired session cannot act or revive
- [PW10] missing audit rolls the routine and first marker back at commit
- [PW11] concurrent duplicate and different commands serialize
- [PW22] refusal records deduplicate and omit foreign targets
- [PW30] a lookup made after a committed end names the owner, also inside a transaction opened before the end
- [PW30] a transaction that is not read committed is never given the worker: REPEATABLE READ
- [PW30] a transaction that is not read committed is never given the worker: SERIALIZABLE
- [PW30] the lookup reads the actual time, not the transaction's start
- [PW30] expiry is strict
- [PW32] wider admin grant refused while acting, permitted after end
- [PW32] wider commercial_manager grant refused while acting, permitted after end
- [PW32] wider finance grant refused while acting, permitted after end
- [PW32] wider read_only grant refused while acting, permitted after end
- [PW23] public state contains no session reference, value or authority
- [PW10] injected routine failure rolls back both commands and the first marker
- [PW10] injected audit failure rolls back both commands and the first marker
- [PW10] injected commit failure rolls back both commands and the first marker
- [PW10] no business lock is acquired after the audit append
- [PW20] invalid session values and foreign target cannot select authority
- [PW11] one command concurrently used across sessions and opposite operations conflicts
- [PW32] a tenant-locked wider grant committed first prevents a waiting switch
- [PW9] home record ending during a current switch leaves both session and switch inert
- [PW32] decision 39 grants stay with the member and revocation removes job access
- [PW32] the recorded owner alone ends a switch after the worker is revoked, end-only and idempotent (r19)
- [PW23] catalogue-wide scan stores neither session values nor extra digests
- [PW1] switch events and rows share a transaction and the audit chain verifies
- [PW11] [PW32] merged membership.revoke committed first is seen by a waiting switch
- [PW11] [PW32] merged grant.create committed first is seen by a waiting switch
- [PW11] session revoke and switch settle without deadlock and no later lookup succeeds
- [PW11] simultaneous start and end leave a consistent current state
- [PW4] owner membership caller refusal is identical for every target
- [PW4] owner grant caller refusal is identical for every target
- [PW4] small-builder track caller refusal is identical for every target
- [PW5] a target linked to another company's sign-in locator is not eligible
- [PW6] unstamped or missing contexts are refused before connecting
- [PW32] team move and grant revocation remain available while acting

### `test/seed-transaction-locks.integration.test.ts`

- PostgreSQL seed serialization work order: concurrent requests serialize, retain the stored seed, and release transaction-owned locks on early return
- PostgreSQL seed serialization work order: acquired failure rolls back, permits retry, and failed rollback destroys the backend
- PostgreSQL seed serialization nested Northside: concurrent requests serialize, retain the stored seed, and release transaction-owned locks on early return
- PostgreSQL seed serialization nested Northside: acquired failure rolls back, permits retry, and failed rollback destroys the backend

### `test/server-entitlements.integration.test.ts`

- MON-8 track reassignment refuses legacy contractor writers while retaining reads and revocations

### `test/site-extra-evidence.integration.test.ts`

- ENT-3d verified photo and resident confirmation [E7] a verified photo is accepted: the origin links it, copies its hash and covers it in the origin hash
- ENT-3d verified photo and resident confirmation [E8] every cause of a photo that is not accepted gives the identical PHOTO_NOT_ACCEPTED, nothing written, one refusal event
- ENT-3d verified photo and resident confirmation [E9] the guard alone: merged raiseExtra with the seam and an unverified photo is rejected, nothing written
- ENT-3d verified photo and resident confirmation [E10] a missing, empty or whitespace-only note is INVALID_COMMAND with a verified photo and without one; nothing written
- ENT-3d verified photo and resident confirmation [E11] a confirmation is recorded with a photo: one document, its rows exactly as defined, linked and covered by the origin hash
- ENT-3d verified photo and resident confirmation [E11] a confirmation is recorded without a photo: one document, its rows exactly as defined, linked and covered by the origin hash
- ENT-3d verified photo and resident confirmation [E26] the stored confirmation document rebuilds from persisted facts: bytes, hash and length
- ENT-3d verified photo and resident confirmation [E12] a hash shown for different content is CONFIRMATION_MISMATCH each time; nothing written, no evidence row either, one refusal event
- ENT-3d verified photo and resident confirmation [E13] the guard alone, binding: a document written for content X cannot serve content Y, serves X once, and not a second extra
- ENT-3d verified photo and resident confirmation [E14] a confirmation whose content the client tried to supply is rejected at the database; routine 4 has no content argument
- ENT-3d verified photo and resident confirmation [E15] the same command and payload twice, and twice at once, have one effect and equal answers; changed payloads conflict
- ENT-3d verified photo and resident confirmation [E16] tenant isolation: another company cannot see or use a photo or a document; an upper-case tenant setting still works; line 2 is the row's own tenant
- ENT-3d verified photo and resident confirmation [E17] every role that may not log gets ENT-3a's EXTRA_FORBIDDEN for a v3 command; not-named and out-of-scope members get NOT_FOUND, identical with a real or unknown photo
- ENT-3d verified photo and resident confirmation [E18] existing evidence rows are byte-identical after a successful v3 command and after a refused one
- ENT-3d verified photo and resident confirmation [E19] the resident's contact values appear in no document, evidence row, audit payload or thrown error
- ENT-3d v3 command replay properties replaying a command id returns the first result, never the job's current state
- ENT-3d v3 command replay properties the same command id with a changed payload conflicts
- ENT-3d v3 command replay properties the same command id on another job conflicts
- ENT-3d v3 command replay properties a successful no-op keeps its identity
- ENT-3d v3 command replay properties a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-3d v3 command replay properties an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job

### `test/site-extra-freetext-status.integration.test.ts`

- free-text statuses replay one immutable server statement, remain unpriced, and reject changed status and hidden targets
- v4 keeps verified-photo enforcement and refuses no note and no verified photo

### `test/site-extra-order-check.integration.test.ts`

- ENT-3c order check read [C18] orderCheck gives the outcome the command then acts on, for every case of [C1] built as real orders
- ENT-3c order check read [C7] within the order (equal or below) is ALREADY_ON_ORDER as a result of the read, and nothing is written by it
- ENT-3c search of the job's price list [C18] sorItems returns only items of THIS job's price list, by code, matching text literally and case-insensitively
- ENT-3c search of the job's price list [C18] at most 50 items are returned, in code order, with truncated set
- ENT-3c search of the job's price list [C17] both reads work on a job that is no longer live
- ENT-3c the reads obey the same access rule as the command [C9] sorItems: every role that may not log gets the identical EXTRA_FORBIDDEN for an in-scope job, another branch's job, another tenant's job and a random job
- ENT-3c the reads obey the same access rule as the command [C10] sorItems: every job refusal is one NOT_FOUND, and no refused caller meets SOR_ITEM_NOT_FOUND, ORDER_LINE_NOT_FOUND, ORDER_LINE_AMBIGUOUS, ALREADY_ON_ORDER or JOB_NOT_LIVE
- ENT-3c the reads obey the same access rule as the command [C9] orderCheck: every role that may not log gets the identical EXTRA_FORBIDDEN for an in-scope job, another branch's job, another tenant's job and a random job
- ENT-3c the reads obey the same access rule as the command [C10] orderCheck: every job refusal is one NOT_FOUND, and no refused caller meets SOR_ITEM_NOT_FOUND, ORDER_LINE_NOT_FOUND, ORDER_LINE_AMBIGUOUS, ALREADY_ON_ORDER or JOB_NOT_LIVE
- ENT-3c the reads obey the same access rule as the command [C11] another tenant's context, an unstamped context and a small-builder tenant's latest assignment
- ENT-3c catalogue (the new tables and routines) [C21] the application login cannot reach a write on either table and the routine refuses it a path round the checks

### `test/site-extra-priced-evidence.integration.test.ts`

- priced v2 preserves evidence, origin, replay and cross-customer boundaries
- a committed priced log survives submission failure; concurrent submit replay makes one request
- work statements do not alter price, requirement, origin or timing; finished above the limit survives later approval
- server proceed comparison uses the bound rules: within, above and unpriced; cancelled logs remain not found
- work statement storage is forced-RLS and runtime EXECUTE only, with tenant-qualified foreign keys

### `test/site-extra-priced-submit-recovery.integration.test.ts`

- refuses a missing approval feature before new capture, while site capture remains available
- rechecks revocation after preflight before capture
- recovers the operative's exact retry after log commit, competing supervisor submit and lost response
- transient submission failure keeps the log and deterministic submit identity, then completes once
- the recovery SELECT itself excludes a raiser revoked after priced submission
- scoped recovery refuses wrong bindings and withdrawn state
- recovery refuses missing requests, superseded prices and rejected requests without writing

### `test/site-extra-pricing.integration.test.ts`

- ENT-3c priced log: success, money and the excess only [C5] operative logs a new schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C5] operative logs a excess schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C5] supervisor logs a new schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C5] supervisor logs a excess schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C5] surveyor logs a new schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C5] surveyor logs a excess schedule-item extra: one transaction, server-derived facts only
- ENT-3c priced log: success, money and the excess only [C6] money: every row M1 to M14 stored exactly, equal to merged priceSorLine and to the merged SQL function; M10 is 676 and not 675
- ENT-3c priced log: success, money and the excess only [C6] a later price list and a later order revision never reprice a stored row; a log after the revision is priced from the new revision's own price list
- ENT-3c priced log: success, money and the excess only [C8] the excess only: the quantity is claimed minus instructed, priced alone, with the BASELINE revision's line
- ENT-3c priced log: success, money and the excess only [C7] within the order (equal or below) is ALREADY_ON_ORDER with nothing written, and the same command id then succeeds with a larger quantity
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C9] direct runtime writer refuses a structurally valid owner origin through its own authority check, with no revision, basis or audit written
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C9] direct runtime writer refuses a structurally valid unassigned operative origin through its own authority check, with no revision, basis or audit written
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C10] direct runtime writer re-checks revoked stored authority and refuses at the call with no revision, basis or audit written
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C11] direct runtime writer refuses without a stored origin or open receipt, with no revision, basis or audit written
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C16] direct runtime writer still enforces INVALID_COMMAND (23514) for an authorized stored origin whose raising receipt is no longer open
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C5] direct runtime writer accepts an authorized stored supervisor origin and open receipt with its basis and raised audit in one committing transaction
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C9] every role that may not log gets EXTRA_FORBIDDEN, identical for an in-scope job, another branch's job, another tenant's job and a random job
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C10] every job refusal is one NOT_FOUND whatever the cause, and no caller learns of the price list, the order lines or the item
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C11] another tenant: nothing crosses, nothing of tenant B is read, searched, priced or written
- ENT-3c access: the same refusals as every command, decided by the database before anything else [C13] two people logging the same item create two candidate duplicates, each priced in full, never merged
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C12] replaying a command id returns the first result, never the job's current state
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C12] the same command id with a changed payload conflicts
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C12] the same command id on another job conflicts
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C12] a successful no-op keeps its identity
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C17] a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- ENT-3c replay, conflict and the six properties the coordinator named (B-prime) [C9] an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job
- ENT-3c live only, races, atomic audit and the immutable record [C17] a replay of a command that succeeded while the job was live still returns its first answer after the job has left live; a caller who may not log never learns the job is not live
- ENT-3c live only, races, atomic audit and the immutable record [C14] races: the same command twice at once is one extra with two equal answers; an order revision between the pre-check and the command ends typed or wholly consistent
- ENT-3c live only, races, atomic audit and the immutable record [C14] a grant revoke holding the tenant lock while a log is in flight: the log waits, and is refused with nothing written when the revoke commits first
- ENT-3c live only, races, atomic audit and the immutable record [C14] the job leaving live on a second connection while a log is in flight: the log commits first (the guard holds to commit) and nothing is half written
- ENT-3c live only, races, atomic audit and the immutable record [C15] a failure forced at each statement leaves nothing written, and the audit event is in the same transaction
- ENT-3c live only, races, atomic audit and the immutable record [C15] matching origin/revision transaction identities and a valid basis still require the raised audit event: PRICING_AUDIT_REQUIRED rolls everything back
- ENT-3c live only, races, atomic audit and the immutable record [C16] a correct owner-inserted revision commits with its basis and raised audit, so tamper refusals are isolated to the revision INSERT
- ENT-3c live only, races, atomic audit and the immutable record [C16] the stored record cannot be changed or supplied, and every tampered row is refused by the guard or a foreign key
- ENT-3c live only, races, atomic audit and the immutable record [C16] the high/low INSERT-refusal assertions fail if only the exact-price guard is removed (rolled-back mutation control)

### `test/site-extra-recent-items.integration.test.ts`

- recents are distinct, newest first, limited to five, personal and restricted to the target price list
- empty history is successful; search and recents have identical target refusals

### `test/site-extra-replay-after-invoice.integration.test.ts`

- replays a plain site extra after invoicing while refusing new commands and changed bodies

### `test/site-extra-visit.integration.test.ts`

- ENT-3b the visit reference on a site extra (version 2) [B16] a version 2 log naming the caller's own open visit stores the visit and its origin hash matches the stored row
- ENT-3b the visit reference on a site extra (version 2) [B16] a version 1 log still writes no visit and its call to the repository is still exactly four fields
- ENT-3b the visit reference on a site extra (version 2) [B16] a completed visit, another member's visit, a visit of another job, another tenant's visit and a random id are each NOT_FOUND with nothing written
- ENT-3b the visit reference on a site extra (version 2) [B16] raiseExtra called directly with the seam and a completed visit is refused by the new guard alone
- ENT-3b the visit reference on a site extra (version 2) [B16] a completion that commits after the pre-check allowed a version 2 log makes the log fail with nothing written
- ENT-3b the visit reference on a site extra (version 2) [B16] a log that commits first leaves the extra, and the completion that was waiting then succeeds
- ENT-3b the visit reference on a site extra (version 2) [B16] the other ENT-3a refusals are unchanged for a version 2 body: an unauthorised caller, a foreign job and a not-named member

### `test/site-extra.integration.test.ts`

- ENT-3a governed path [A2] operative logs only server-derived facts atomically
- ENT-3a governed path [A2] supervisor logs only server-derived facts atomically
- ENT-3a governed path [A2] surveyor logs only server-derived facts atomically
- ENT-3a governed path [A3] an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- ENT-3a governed path [A4] every inaccessible job cause has identical NOT_FOUND and no business effect
- ENT-3a governed path [A5] grant revocation refuses new work and earlier replay
- ENT-3a governed path [A5] membership revocation refuses new work and earlier replay
- ENT-3a governed path [A6] seam alone refuses owner, permits supervisor and refuses an unchosen covering grant
- ENT-3a governed path [A7] two concurrent commands on independent pooled connections have one effect
- ENT-3a governed path [A7] revoke commits first under the shared administration lock, without sleeps
- ENT-3a governed path [A7] log commits first under the shared administration lock, without sleeps
- ENT-3a governed path [A9] exact replay, conflicting note/member/grant and equal text with separate IDs
- ENT-3a governed path [A10] tenant mismatch, foreign job, missing/unstamped contexts cannot touch tenant B
- ENT-3a governed path [A11] latest small-builder tenant assignment is TRACK_FORBIDDEN
- ENT-3a governed path [A12] every refusal reason is durable once, scoped, attributable and contains no free text
- ENT-3a governed path [A12] concurrent refusal writers coalesce; audit append failure retains identical typed refusal
- [R2] a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- [R2] not-live between precheck and raiseExtra refuses and leaves no extra, audit or command row
- [R3] the same command id with a changed payload conflicts
- a successful no-op keeps its identity
- replaying a command id returns the first result, never the job's current state
- the same command id on another job conflicts

### `test/site-supervisor-query.integration.test.ts`

- immutable query: replay, conflict, tenant/assignment/cancellation refusal, stale revision and zero extra effects

### `test/site-visit-abandoned.integration.test.ts`

- LATER-SAFETY-79 abandoned site visits closes a revoked operative's visit, replays once, and releases EndCheck
- LATER-SAFETY-79 abandoned site visits closes a unassigned operative's visit, replays once, and releases EndCheck
- LATER-SAFETY-79 abandoned site visits refuses an authoritative operative, non-admins, wrong-job/tenant visits, missing visits and invalid reasons without effects
- LATER-SAFETY-79 abandoned site visits rechecks the administrator's current membership before replay
- LATER-SAFETY-79 abandoned site visits refuses a caller naming a different active admin, including terminal replay
- LATER-SAFETY-79 abandoned site visits refuses a bound owner without a processing receipt, and an unbound caller
- LATER-SAFETY-79 abandoned site visits refuses a fabricated processing receipt without a begin_command lifecycle claim
- LATER-SAFETY-79 abandoned site visits refuses changed visit or reason after begin_command claimed the exact input

### `test/site-visit.integration.test.ts`

- ENT-3b success paths [B2] the named operative starts and completes a visit with server times, an answer, two audit events and two receipts
- ENT-3b success paths [B2] the named supervisor starts and completes a visit with server times, an answer, two audit events and two receipts
- ENT-3b refusals by role and by job [B3] every role that may not visit: VISIT_FORBIDDEN for both commands, identical for four job ids, nothing written
- ENT-3b refusals by role and by job [B4] every job refusal is the same NOT_FOUND for start and for completion; the open visit stays open
- ENT-3b refusals by role and by job [B4] a named supervisor whose only covering grant is revoked, an operative moved off the team, and a cancelled order are refused as NOT_FOUND
- ENT-3b refusals by role and by job [B4] after membership.revoke both commands answer VISIT_FORBIDDEN
- ENT-3b refusals by role and by job [B5] another tenant: tenant A's member with tenant B's job or visit, a mismatched actor, an unstamped context, a small-builder tenant
- ENT-3b the close-out answer [B6] routine 3 called directly as the runtime role with a NULL or an invalid answer raises CLOSEOUT_ANSWER_REQUIRED and writes nothing
- ENT-3b the close-out answer [B6] as the table owner, completing an open visit with no answer row fails at commit and leaves the visit open
- ENT-3b the close-out answer [B6] a body with no closeoutAnswer, or a null one, is CLOSEOUT_ANSWER_REQUIRED before anything is read
- ENT-3b the close-out answer [B7] a second completion with a new command id, with either answer, is VISIT_ALREADY_COMPLETED and changes nothing
- ENT-3b the close-out answer [B8] an answer can be neither changed nor removed: the runtime role has no privilege, the owner meets the immutable trigger, and a completed visit cannot be reopened or moved
- ENT-3b replay, conflict, one open visit [B9] start: the same command id and payload returns the same result with one visit, one audit event and one receipt; another job or another member conflicts
- ENT-3b replay, conflict, one open visit [B9] complete: the same command id and payload returns one answer and the same result; the other answer conflicts and the stored answer is unchanged
- ENT-3b replay, conflict, one open visit [B9] a replay by a member who has since been revoked or taken off the job is refused before the stored result is read
- ENT-3b replay, conflict, one open visit [B10] one open visit per member per job; a new start works after completion; two named members may each hold one
- B-prime replay and live-guard properties: start [BP-a] start: replaying a command id returns the first result, never the job's current state
- B-prime replay and live-guard properties: start [BP-b] start: the same command id with a changed payload conflicts
- B-prime replay and live-guard properties: start [BP-c] start: the same command id on another job conflicts
- B-prime replay and live-guard properties: start [BP-d] start: a successful no-op keeps its identity
- B-prime replay and live-guard properties: start [BP-e] start: a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- B-prime replay and live-guard properties: start [BP-f] start: an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job
- B-prime replay and live-guard properties: complete [BP-a] complete: replaying a command id returns the first result, never the job's current state
- B-prime replay and live-guard properties: complete [BP-b] complete: the same command id with a changed payload conflicts
- B-prime replay and live-guard properties: complete [BP-c] complete: the same command id on another job conflicts
- B-prime replay and live-guard properties: complete [BP-d] complete: a successful no-op keeps its identity
- B-prime replay and live-guard properties: complete [BP-e] complete: a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- B-prime replay and live-guard properties: complete [BP-f] complete: an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start: replay holds the shared authority lock and rechecks authority and ownership after reading the receipt
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete: replay holds the shared authority lock and rechecks authority and ownership after reading the receipt
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start live-guard: membership-revocation after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start live-guard: job-removal after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start replay: membership-revocation after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start replay: job-removal after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete live-guard: membership-revocation after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete live-guard: job-removal after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete replay: membership-revocation after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete replay: job-removal after the pre-check receives the same authority refusal, with no writes or cached result
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] start: a live-guard refusal rolls back before rechecking authority and conceals job state if membership is then revoked
- ENT-3b repair round 2 authority races (real PostgreSQL) [R2] complete: a live-guard refusal rolls back before rechecking authority and conceals job state if membership is then revoked
- ENT-3b live only [B14] a named member on a not-live job gets JOB_NOT_LIVE for both commands; a member who may not visit it never learns that
- ENT-3b races on independent connections [B11] the same start sent twice at once is one visit and two equal answers
- ENT-3b races on independent connections [B11] two different start commands by the same member at once: exactly one succeeds
- ENT-3b races on independent connections [B11] the same completion sent twice at once is one answer; two different completions at once: exactly one succeeds
- ENT-3b races on independent connections [B11] a revoke holding the tenant lock while a start is in flight: the start waits and is refused with nothing written once the revoke commits
- ENT-3b the audit event is in the same transaction [B12] start: a failure at claim, the routine call, audit, completion or commit leaves nothing written
- ENT-3b the audit event is in the same transaction [B12] complete: a failure at claim, the routine call, audit, completion or commit leaves nothing written
- ENT-3b the audit event is in the same transaction [B12] the visit update, the answer row and the completion audit event carry the same transaction id
- ENT-3b the audit event is in the same transaction [B12] an answer row inserted by the owner with no matching audit event fails at commit with CLOSEOUT_AUDIT_REQUIRED, also when another company has an event with the same id
- ENT-3b the audit event is in the same transaction [B12] start: observed with the lock observer, the shared tenant-authority lock is first and no lock is taken after the audit append
- ENT-3b the audit event is in the same transaction [B12] complete: observed with the lock observer, the shared tenant-authority lock is first and no lock is taken after the audit append
- ENT-3b the refusal record [B13] one refusal event of the right shape for each reason; the same refused command sent three times leaves one; the job is named only when it is in this company
- ENT-3b the refusal record [B13] with the audit append made to fail the caller still receives the same typed refusal
- ENT-3b the refusal record [B13] validation errors, conflicts, replays, not-live refusals and the 422 codes write no refusal record
- ENT-3b the site worker's reads [B15] assigned jobs: exactly the jobs the caller is named on, with their own open visit, nothing else
- ENT-3b the site worker's reads returns only the latest completed answer for this tenant, job and operative
- ENT-3b the site worker's reads [B15] order lines: the current revision's lines in position order, only the new revision's after a revised import, and every refusal applies

### `test/sor-pricing.integration.test.ts`

- ENT-2 DW5 exact pricing prices £100.00 at -35/1000, quantity 1, as £96.50 through the whole import
- ENT-2 DW5 exact pricing imports tie, zero, positive, fractional, overflow and negative-multiplier orders against their own contracts, with typed errors for the last two
- ENT-2 DW5 exact pricing uses the SoR version in force on the issue date, listed by the order's contract; an unlisted newer version is never used
- ENT-2 DW5 exact pricing never reprices a stored revision when a later SoR version is imported or a later contract version lists it; new orders do use it
- ENT-2 DW5 exact pricing is enforced in the database: a forged net, rate, version, adjustment or origin is refused even if the application is bypassed
- ENT-2 SoR version import stores immutable versions and items, replays the same command, conflicts on a changed payload, and refuses a second version for the same effective date
- ENT-2 SoR version import validates strictly: forged fields, duplicate codes, negative or oversized rates, empty and oversized lists, production environment
- ENT-2 SoR version import imports the largest permitted price list (10,000 items) and cannot commit a version without its audit event

### `test/synthetic-original-nullable-scope.integration.test.ts`

- a job-level Northside photo survives a fresh store and yields an intact approved-extra bundle; other tenants/jobs/versions cannot read it
- keeps the scope FK for non-null rows and the proof original/finalization path unchanged
- rolls back the upload and its bytes together when the original callback fails

### `test/work-order-concurrency.integration.test.ts`

- ENT-2 DW1 concurrent imports two (and three) concurrent imports of one file, on separate connections, produce exactly one set of rows and one verifiable audit chain
- ENT-2 DW1 concurrent imports the same command and the same file racing is one import; the same command with a different file conflicts
- ENT-2 DW1 concurrent imports two different files that both create one order reference: one creates it, the other is told its revision is stale, and only one job and binding exist
- ENT-2 DW1 concurrent imports two files revising one order from the same revision: one wins, the other is stale, and the history is a straight line
- ENT-2 DW1 concurrent imports an import, an SoR import and an ENT-1 administration command in one tenant all complete (no lock-order deadlock), in either arrival order
- ENT-2 DW1 concurrent imports two tenants import in parallel without touching each other

### `test/work-order-import.integration.test.ts`

- ENT-2 migration and catalog catalogs FORCE RLS, migration ownership, SELECT-only runtime grants and denial of direct writes for every ENT-2 table
- ENT-2 migration and catalog copies ENT-1's role/permission matrix exactly: app.contractor_role_permits equals app.contractor_allowed for a real member of every role, and the core matrix (bar one documented pre-existing difference)
- ENT-2 migration and catalog refuses foreign-tenant contracts, teams, memberships, scope identities and jobs through qualified composite keys
- ENT-2 DW1 idempotent import imports a generated 2,000-order file (measured), replays the same file with no new rows, and records exactly 3 revisions with diffs for 3 changed orders
- ENT-2 DW1 idempotent import replays the stored batch only when it was clean: a file with a refused row is processed again under a new command
- ENT-2 DW1 idempotent import answers the same file twice in a row as a replay, but processes an earlier file again as rows once later revisions have moved on (A, B, A; verdict P2-1)
- ENT-2 DW2 import validation refuses another tenant's contract, client, site and team, committing nothing of those orders
- ENT-2 DW2 import validation commits no part of a failing order, whichever stage fails (job and parties bound, order inserted, or assignment refused)
- ENT-2 DW2 import validation gives each malformed row its own typed error in its receipt (unknown code, negative quantity, more than 6 decimals, money out of range, missing site) and imports the good rows around them
- ENT-2 DW2 import validation refuses malformed files outright: unknown header, unterminated quote, forged tenant, provenance, status, track, origin and price columns
- ENT-2 DW3 immutability, cancellation and stable scope identity denies runtime and owner updates and deletes of revisions and lines, and records a cancellation as a revision
- ENT-2 DW3 immutability, cancellation and stable scope identity keeps the scope identity of unchanged lines: matched by client line reference, else by SoR code and position
- ENT-2 DW3 immutability, cancellation and stable scope identity refuses changes to the parties a job was bound to (CH-3b binds them once) and an incomplete restatement
- ENT-2 DW4 live from import, with no fee setup makes the job live at import, passing watchdogActive, with no quote, acceptance, obligation, journal, cap or fee-policy row
- ENT-2 DW4 live from import, with no fee setup CH-3b DW1 held clause: the import calls app.bind_contractor_parties in its transaction and the routine refuses each missing party, committing nothing
- ENT-2 DW4 live from import, with no fee setup refuses new order and SoR imports after track loss while retaining historical reads (Q5)
- ENT-2 DW6 personal data and origin keeps resident name, phone and email out of audit payloads, receipts, projections, the batch results and captured logs
- ENT-2 DW6 personal data and origin can write no origin but client_instruction: lines carry it by CHECK, and no import receipt can raise an extra origin of any kind
- ENT-2 tenant boundary answers another tenant's batch, order, job and revision ids exactly as it answers unknown ones, and refuses a context that is missing, hand-built or not a tenant's
- ENT-2 office reads lists batches and orders and shows each revision with its diff and stable line identities, for import-capable members and the job's own team

## Tests skipped when a held fixture failed during setup

The 21 files below stopped during setup with the same customer insert refusal at line 71. Vitest marked these test bodies skipped.

### `test/contractor-billing-allocation.integration.test.ts`

- E6-13 E6-14 ENT-F2 PostgreSQL full denominator Q = £80.645161…; ordinary line contributes zero
- E6-17 E6-28 checked persistence refuses tampered allocation fractions even for finance
- E6-15 complete mixed-job invoice keeps both extra lines and ordinary work in the denominator
- E6-18 earlier deposits never spread onto a later-existing extra

### `test/contractor-billing-export.integration.test.ts`

- E6-06 E6-07 E6-08 finalising again adds no lines; two racing batches only one gets the extra
- E6-03 E6-10 export guard refuses wrong tenant or client contract
- E6-09 an extra revised or withdrawn during finalisation is included at locked revision or excluded
- E6-05 E6-27 unresolved candidates block both racing exports, MarkDuplicate then releases one canonical
- LATER-SAFETY-81 SQL export prefixes TAB and CR formulas and preserves existing escaping
- LATER-SAFETY-16 reconciliation restores an approved unlinked extra until its export
- LATER-SAFETY-16 reconciliation and export exclude withdrawn and rejected extras
- LATER-SAFETY-16 the effective-state read routine enforces tenant, session and job authority

### `test/contractor-billing-import.integration.test.ts`

- E6-11 E6-12 source event idempotence and cross-channel payment identity
- E6-16 unknown composition is quarantined and imports never create, price or approve an extra
- E6-12 E6-21 conflicting cross-source payment identities append ambiguity runs for both groups
- E6-22 reconciliation totals equal drill-down sums and alert age comes from the frozen contract
- E6-27 a conflicting later event rolls back earlier events, receipt, run and audit atomically
- E6-31 imports append no platform fee, journal or subscription facts
- E6-19 imported rejection is projected without editing the approved extra or invoice history
- E6-03 E6-28 populated billing rows fail closed without tenant context and stay isolated from another tenant
- r6 one export line cannot match two invoices (one job)
- r6 one export line cannot match two invoices (two jobs)
- r6 replaying the same invoice fact with a new command creates no match or quarantine
- r6 PostgreSQL refuses a second direct match of the same export line

### `test/contractor-billing-replay.integration.test.ts`

- E6-26 replaying a command id returns the first result, never the job's current state
- E6-26 the same command id with a changed payload conflicts
- E6-26 the same command id on another job conflicts
- E6-26 a successful no-op keeps its identity
- E6-26 a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- E6-26 an unauthorised caller gets the identical BILLING_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- E6-26 import: replaying a command id returns the first result, never the job's current state
- E6-26 import: the same command id with a changed payload conflicts
- E6-26 import: the same command id on another job conflicts
- E6-26 import: a successful no-op keeps its identity
- E6-26 import: a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- E6-26 import: an unauthorised caller gets the identical BILLING_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- E6-26 approve-delivery: replaying a command id returns the first result, never the job's current state
- E6-26 approve-delivery: the same command id with a changed payload conflicts
- E6-26 approve-delivery: the same command id on another job conflicts
- E6-26 approve-delivery: a successful no-op keeps its identity
- E6-26 approve-delivery: a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written
- E6-26 approve-delivery: an unauthorised caller gets the identical BILLING_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job
- E6-04 every other active contractor role is refused on export and import
- E6-26 concurrent same-id calls replay once and cross-kind reuse conflicts
- E6-04 grant revocation refuses new commands and replay before any stored result is returned
- E6-26 export: the same command id with a changed payload conflicts

### `test/contractor-full-demo-package.integration.test.ts`

- A12 Northside commands feed captured and approved drill-downs
- A13 fresh application and connection recover committed observations
- A14 foreign tenant client job and revoked-session reads refuse
- A15 reads create no commercial audit outbox or money effects
- A16 reset preserves prior run history and isolates the next run

### `test/duplicate-unlink-reopens-request.integration.test.ts`

- reopens a duplicate-closed request, preserves history and approves the restored extra; replay writes nothing
- leaves an already-approved request intact when its duplicate link is reversed
- restarts a partially approved chain without copying earlier approvals
- scratch mutation: disabling the fix reproduces ALREADY_DECIDED; the trigger is restored in finally

### `test/enterprise-dashboard-plan.integration.test.ts`

- ENT-DASHBOARD-SLOW bounds dashboard plan work on the journey's 2,000 command-seeded orders

### `test/extra-approval-authority.integration.test.ts`

- E5-24 partial catalog RLS and absent business writer boundary
- E5-09 partial source binding preserves the origin-bound SoR row and basis
- E5-24 partial wrong-job revision hash and predecessor specimens refuse
- E5-24 partial migration-owner mutation of immutable foundation rows refuses

### `test/extra-approval-chain.integration.test.ts`

- E5B-01 journey: price, submit, grant-filtered queue, company steps, owner-approved send, client approval as the client
- E5B-02 stale revision, wrong hash/net, unpriced and replay semantics
- LATER-SAFETY-49 reuses a succeeded legacy command-id receipt only for its person, request and step
- LATER-SAFETY-49 refuses another step after a legacy rejection with an unknown step
- E5B-03 thresholds exact at pence equality, SQL snapshot equals the pure evaluator
- E5B-04 refused approvers: self, wrong role, grant not covering the job, revoked member, out of order
- E5B-05 races: approve vs withdraw gives one effect; two approvers on one step give one fact
- E5B-06 client approval refusals: forged, expired, revoked, replaced, other email, other person, other extra, replayed, revoked member
- E5B-07 the send is owner-only and exact
- E5B-08 withdraw (covered supervisory roles), reject, and duplicate
- E5B-09 Standard F: runtime reads only, routines re-check the actor, helpers are not callable
- E5B-10 a later rule version leaves an existing snapshot unchanged (runs last: it changes the contract's rules)
- E5B-11 escalation fires once, only listed alternates gain authority, original approvers keep it
- E5B-11 an unpriced submitted extra can be priced once, by a surveyor, and then approved
- MON-8 a queued approval message is cancelled after agreement loss without an adapter call
- LATER-SAFETY-36 cancels a pending send after its surveyor grant is revoked; restoring the role cannot revive it
- LATER-SAFETY-36 cancels a retryable send after its surveyor grant is revoked; restoring the role cannot revive it
- LATER-SAFETY-36 keeps a surveyor's send executable when another sender loses a grant
- LATER-SAFETY-36 still cancels a client send after sender membership revocation
- LATER-SAFETY-36 ignores another tenant's role revocation and cannot cancel a foreign action

### `test/extra-approval-timing.integration.test.ts`

- ENT-5 shared visit with statement not_started: real client timing and later approval
- ENT-5 shared visit with statement undefined: real client timing and later approval
- ENT-5 shared visit with statement under_way: real client timing and later approval
- ENT-5 shared visit with statement finished: real client timing and later approval

### `test/extra-client-session.integration.test.ts`

- ENT-5 sign-in requires a fresh link and current scoped named grant; replay is one effect
- ENT-5 real identity approve commits while unrelated checks remain deferred
- ENT-5 real identity reject commits while unrelated checks remain deferred
- ENT-5 replaced, expired, foreign-job and revoked grants refuse
- ENT-5 client approve racing withdraw commits exactly one outcome
- LATER-SAFETY-60 customer timing matches contractor timing with proceed=true
- LATER-SAFETY-60 customer timing matches contractor timing with proceed=false
- LP-6c records the customer's own actor and delegated credential in the command claim
- LP-6c delegated extra authority refuses another type without writes
- LP-6c delegated extra authority refuses another job without writes
- LP-6c delegated extra authority refuses another tenant without writes
- LP-6c refuses a rebind and hides delegated identity from general actor access
- LP-6c binder refuses wrong token without writes
- LP-6c binder refuses wrong recipient without writes
- LP-6c binder refuses wrong approver without writes
- LP-6c binder refuses wrong job without writes
- LP-6c binder refuses wrong tenant without writes
- LP-6c binder has no PUBLIC, person-facing or login execute capability
- mutation: removing command-type scope breaks the other-command refusal
- mutation: removing the private binder breaks a real unbound customer decision
- LP-6c catalogue identifies the approved binder; queue/view bind read-only ClientViewExtra and history stays unbound
- ClientViewExtra reads extra work status only for its own job and tenant while live; it never decides

### `test/extra-evidence-pack-timing.integration.test.ts`

- pack seals existing timing projection: finished_breach
- pack seals existing timing projection: uncertain_overlap
- pack seals existing timing projection: no_visit

### `test/extra-evidence-pack-writer.integration.test.ts`

- stores an actor-bound immutable snapshot, replays exactly, and uses the merged verifier
- refuses wrong digests, roles, grants, tenant, subject, unbound context and client content
- refuses revoked membership on new creation and replay
- collapses simultaneous command replay to one stored artifact
- refuses unavailable originals and invalidated persisted evidence without storing a receipt
- SQL refuses duplicate entries hiding an unmatched wrong-job source atomically
- SQL refuses duplicate source pairs, extra/missing sources, wrong job and wrong hash
- SQL accepts permuted arrays and separate versions of one source ID, then replays exactly
- mutation: removing only the new validation breaks the duplicate-entry refusal and rolls back

### `test/extra-price-permission-order.integration.test.ts`

- R183 admission witness: predecessor leaks through the real repository, repaired order closes it, restoring it fails the regression
- R183 checked admission reaches xa_price for the same bound non-pricing actor/job in price and revise
- R183 authorised surveyor still prices, revises, replays and gets NOT_FOUND only for missing targets
- R183 binding, revoked membership, uncovered surveyor and foreign tenant refusals remain closed
- R183 fresh installed metadata and populated rows survive repeat forward migration

### `test/extra-price-rules.integration.test.ts`

- Q01 only a surveyor can price; re-pricing requires ReviseExtra and preserves the first snapshot and source
- Q03 rejects a missing job contract with RULES_NOT_FOUND; no default rules are consulted
- Q03 structurally refuses a second candidate contract for the same job and a contract without rules
- Q03 freezes the bound contract and rules even when newer versions exist before submission

### `test/extra-proceed.integration.test.ts`

- proceed is one immutable fact: replay, no approval/step skip/snapshot/pricing/billing/export effect; later approval preserves it
- refuses wrong tenant/job/extra, unassigned or office actors, revoked members and unpriced/stale requests
- a required-preapproval statement reaches the client breach view without authorizing or skipping steps; later approval cannot erase it
- only the raiser may append/replay; covered colleagues and supervisors retain reads, with no refused-write effects
- expired operative sessions and memberships refuse new statements and replays without effects

### `test/site-extra-authority.integration.test.ts`

- ENT-3a authority [A1] owner / LogSiteExtra
- ENT-3a authority [A1] owner / RecordOfficeExtra
- ENT-3a authority [A1] owner / RecordClientInstruction
- ENT-3a authority [A1] owner / ConfirmPrompt
- ENT-3a authority [A1] admin / LogSiteExtra
- ENT-3a authority [A1] admin / RecordOfficeExtra
- ENT-3a authority [A1] admin / RecordClientInstruction
- ENT-3a authority [A1] admin / ConfirmPrompt
- ENT-3a authority [A1] operative / LogSiteExtra
- ENT-3a authority [A1] operative / RecordOfficeExtra
- ENT-3a authority [A1] operative / RecordClientInstruction
- ENT-3a authority [A1] operative / ConfirmPrompt
- ENT-3a authority [A1] supervisor / LogSiteExtra
- ENT-3a authority [A1] supervisor / RecordOfficeExtra
- ENT-3a authority [A1] supervisor / RecordClientInstruction
- ENT-3a authority [A1] supervisor / ConfirmPrompt
- ENT-3a authority [A1] surveyor / LogSiteExtra
- ENT-3a authority [A1] surveyor / RecordOfficeExtra
- ENT-3a authority [A1] surveyor / RecordClientInstruction
- ENT-3a authority [A1] surveyor / ConfirmPrompt
- ENT-3a authority [A1] commercial_manager / LogSiteExtra
- ENT-3a authority [A1] commercial_manager / RecordOfficeExtra
- ENT-3a authority [A1] commercial_manager / RecordClientInstruction
- ENT-3a authority [A1] commercial_manager / ConfirmPrompt
- ENT-3a authority [A1] finance / LogSiteExtra
- ENT-3a authority [A1] finance / RecordOfficeExtra
- ENT-3a authority [A1] finance / RecordClientInstruction
- ENT-3a authority [A1] finance / ConfirmPrompt
- ENT-3a authority [A1] read_only / LogSiteExtra
- ENT-3a authority [A1] read_only / RecordOfficeExtra
- ENT-3a authority [A1] read_only / RecordClientInstruction
- ENT-3a authority [A1] read_only / ConfirmPrompt
- ENT-3a authority [A1] client_approver / LogSiteExtra
- ENT-3a authority [A1] client_approver / RecordOfficeExtra
- ENT-3a authority [A1] client_approver / RecordClientInstruction
- ENT-3a authority [A1] client_approver / ConfirmPrompt
- ENT-3a authority [A1] rejects unknown command type unknown-command
- ENT-3a authority [A1] rejects unknown command type null
- ENT-3a authority [A4] all job failures have the same decision
- ENT-3a authority [A14] is total and read-only for NULLs, absent, empty, malformed and foreign tenant membership
- ENT-3a authority [A14] guard fails closed for absent, empty, malformed tenant settings and missing stored origins
- ENT-3a authority [A16] tenant covering lookup agrees with the merged trigger
- ENT-3a authority [A16] team covering lookup agrees with the merged trigger
- ENT-3a authority [A16] branch covering lookup agrees with the merged trigger
- ENT-3a authority [A16] region covering lookup agrees with the merged trigger
- ENT-3a authority [A16] tenant non-covering lookup and merged trigger both refuse
- ENT-3a authority [A16] team non-covering lookup and merged trigger both refuse
- ENT-3a authority [A16] branch non-covering lookup and merged trigger both refuse
- ENT-3a authority [A16] region non-covering lookup and merged trigger both refuse
- ENT-3a authority [A13] populated upgrade changes only two routines; ownership, specific grants and idempotent registration

### `test/site-extra-evidence-routines.integration.test.ts`

- ENT-3d routines [E20] routines 1 and 2 return exactly what the two core functions return
- ENT-3d routines [E21] routine 3 is total and read-only: one row for NULLs and for an absent, empty, malformed and foreign tenant setting
- ENT-3d routines [E22] routine 4 refuses by its own authority check, each writing nothing; the same content again is existing, a different one conflicts
- ENT-3d routines [E23] routine 5 fails closed for an absent, empty or malformed tenant setting, a missing origin and a missing variation, and passes for a note-only extra
- ENT-3d routines [E24] the catalogue shows exactly the five routines with the stated signatures, volatility, ownership and grants
- ENT-3d upgrade proof (rule 9) [E25] installs everything before 0141, snapshots, applies 0141 alone, compares, then applies everything after twice

### `test/site-extra-pricing-basis.integration.test.ts`

- ENT-3c pricing basis [C24] beside each version: every revision has exactly one basis row of server_sor, same extra, hash, command, actor, time and transaction; the answer's priceSource is the stored value
- ENT-3c pricing basis [C25] a revision committed with no basis row fails at commit with PRICING_BASIS_REQUIRED
- ENT-3c pricing basis [C25] a basis row with no revision beside it, another value, another revision, hash, command or member is refused; a second row for the same extra fails on the unique rule
- ENT-3c pricing basis [C25] UPDATE, DELETE, TRUNCATE and INSERT fail for the runtime role; UPDATE and DELETE fail for the owner
- ENT-3c pricing basis [C26] no row of app.variation_revision is written by anything in this piece

### `test/site-jobs-scope.integration.test.ts`

- matches the old list for own/other team, branch and region grants, every role, unassigned and foreign members
- evaluates authority once per assigned team scope rather than once per order
- remains equivalent after grant revocation, team removal, reassignment, cancellation and membership revocation

### `test/site-visit-authority.integration.test.ts`

- ENT-3b visit authority: the rule, cell by cell [B1] the named operative is allowed
- ENT-3b visit authority: the rule, cell by cell [B1] the named supervisor is allowed
- ENT-3b visit authority: the rule, cell by cell [B1] owner may not visit (forbidden / role_not_permitted)
- ENT-3b visit authority: the rule, cell by cell [B1] admin may not visit (forbidden / role_not_permitted)
- ENT-3b visit authority: the rule, cell by cell [B1] surveyor may not visit (forbidden / role_not_permitted)
- ENT-3b visit authority: the rule, cell by cell [B1] commercial_manager may not visit (forbidden / role_not_permitted)
- ENT-3b visit authority: the rule, cell by cell [B1] finance may not visit (forbidden / role_not_permitted)
- ENT-3b visit authority: the rule, cell by cell [B1] read_only may not visit (forbidden / role_not_permitted)
- ENT-3b visit authority: the rule, cell by cell [B1] client_approver may not visit (forbidden / role_not_permitted)
- ENT-3b visit authority: the rule, cell by cell [B1] the operative on the team who is not named is refused as a job refusal
- ENT-3b visit authority: the rule, cell by cell [B1] the supervisor whose grant covers the team but who is not named is refused as a job refusal
- ENT-3b visit authority: the rule, cell by cell [B1] the supervisor of another branch is refused as a job refusal
- ENT-3b visit authority: the rule, cell by cell [B1] it runs in a READ ONLY transaction and always returns exactly one row (NULLs, absent, empty and non-uuid tenant setting, another tenant's member)
- ENT-3b visit authority: the rule, cell by cell [B4] every job refusal is one decision: random id, another tenant's job, a small-builder job, a named operative taken off the team, a revoked grant, a cancelled order
- ENT-3b visit authority: the rule, cell by cell [B4] a revoked membership is forbidden for the caller whatever the job
- ENT-3b catalogue [B19] every function: owner, definer flag, pinned search_path, explicit execute grants, nothing for PUBLIC or the infrastructure role
- ENT-3b catalogue [B19] closeout_answer: owner, forced row security, the merged policy form, SELECT only for the runtime role
- ENT-3b catalogue [B19] the triggers: immutable on the answer table, guard before insert, deferred audit check, and exactly one new trigger on the visit table
- ENT-3b catalogue [B19] the closed shape of the new table: columns, keys and the question version rule
- ENT-3b catalogue [F] build standard F: the migration adds exactly one table grant (SELECT to the runtime role) and function grants from an explicit list, and no write grant
- ENT-3b catalogue [A-AUDIT] every owner-run routine and the trigger name the company in each audit read or write
