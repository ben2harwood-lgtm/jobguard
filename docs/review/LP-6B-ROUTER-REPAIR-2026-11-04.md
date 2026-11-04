# LP-6b router continuation — 4 November 2026

Status: WIP; no independent Claude verdict or merge approval is claimed. The Codex agents used here performed engineering work, not the independent checks requested by the router.

## Cause grouping before repair

The previous complete API run had 233 failed tests, including source/compiled duplicates:

| Cause | Previous failures | Classification | Repair |
| --- | ---: | --- | --- |
| Practice-session, job-parties, watchdog and site-extra doubles omit binding/actor replies | 206 | Test setup | Supply real boundary-shaped answers; retain observation of every pool/client SQL statement and strict business-query exclusions. Assert exact bind arguments and ordering. |
| Evidence snapshot SQL expectations still begin READ ONLY before binding | 8 | Test setup expectation for the approved transaction sequence | Expect writable REPEATABLE READ, then SET TRANSACTION READ ONLY before tenant/source reads; keep the rest of each exact trace. |
| Shadow zero/many replays use cloned database names that practice binding deliberately refuses | 6 | Test placement | Owner-only fixture temporarily gives each clone the canonical trusted database name; preserve every response, row and SQL comparison and restore names in finally. |
| Compiled source-inspection tests resolve nonexistent dist/*.ts | 11 | Test locator setup | Resolve the same actual src bytes from source and emitted test modules; retain every scanner/assertion and execute both copies. |
| Enterprise dashboard pure-reader import scanner rejects the new refusal helper | 2 | Existing scanner versus new dependency | Scanner remains unchanged; its new pure dependency needs review. No alternate import was used to bypass it. |

Real product defects found separately:

- Site-extra binding refusal after entitlement lookup was mapped to SITE_EXTRA_UNAVAILABLE (503). Map only the sanitized typed refusal to existing EXTRA_FORBIDDEN (403), after rollback. A regression observes the complete two refused transaction traces and no business SQL.
- PW32/PH11: generic binding rejects revoked membership before existing credential-holder switch-off/self-revoke SQL can run. Broadening generic business binding to accept revoked members is unsafe. A narrowly purpose-bound operation or named deferral requires an additional reviewed boundary/scanner decision.
- S21 attachment approval: binding holds session SHARE before waiting for the case lock; the existing domain contract permits revocation to commit during that wait and fences authority after the case lock. These lock orders conflict.
- Integrity read isolation: the unchanged guard permits only AccessShare relation locks and no tuple/transaction locks. Binding INSERT necessarily holds RowExclusive on request_binding, independently of its session SHARE lock. Changing a mock cannot fix this real protocol conflict.

Other DB failures:

- S9 was already repaired under Ben's explicit two-value authorization; its six other pins remain frozen.
- J10 observed a membership lock rather than the expected advisory lock once under full load; the unchanged full recovery-case-join file passes on the lower-load recheck. It is not reported as a proven deterministic product repair.
- Three S22 failures and the SERIOUS teardown hook were cascades after the blocked S21 operations. All three S22 cases pass in isolation without a hook failure.
- The dashboard race fixture's uncaught 57P01 came from stopping PostgreSQL before final client socket-end events drained. The fixture now waits for actual Client end events before stopping PostgreSQL, without swallowing errors or increasing test timeouts.
- Money-trail's strict six-query trace predated two mandatory binding/actor statements. The updated exact eight-query proof retains every observed statement, asserts BEGIN/bind/actor ordering and preserves all business-query restrictions. Job-source revocation now checks the repository public error and separately retains the direct SQL JOB_SOURCE_FORBIDDEN/42501 assertion. Both full files pass (15 tests).

## Main merge and migration

Merged origin/main `56b74eae` first as `e1c03c91`, resolving only additive AppModule registration and the exact request_binding snapshot exclusion alongside main's new tables. Main contains migrations through 0589. Reservations 0590–0595 remain untouched.

Renamed `0584_lp6b_effective_session_actor.sql` and its proof stem to `0596_lp6b_effective_session_actor.sql`; updated the proof's migration name and references. SQL SHA-256 before and after is exactly `fc85804a10686e5d3799e0519ab67c28b43cad98e9d89efebe9eaedff352aa06`.

The authorized named successor exception matches exactly `app.lp6_session_authority(text,text,uuid)`, names original 0584 / renamed 0596, and compares its entire definition using the reviewed successor body with the predecessor header/suffix unchanged. Every other definition and the final owner/ACL comparison remain strict.

The named definition check passes. The test subsequently reaches a pre-existing fixture/proof-chain problem: 0562 was installed early by the historical fixture and is already in its baseline catalogue, but successor proof application tries to add its routines again. Automatic approval review rejected a proposed broad dynamic exclusion of already-installed migrations: it would weaken the strict proof comparison beyond the named successor exception. That edit was not executed. No workaround or proof-loader relaxation was applied; this remaining scope question needs Ben.

## Validation

Current completed checks: web 121 files / 1,662 tests passed (138.015s); typecheck passed (204.870s); lint recheck passed (144.130s); migration boundaries 110 tests passed (48.004s); recovery/dashboard races 28 passed (22.699s); job-source/money-trail 15 passed (18.403s). The fresh build passed all seven tasks (109.547s); the final API-only rebuild passed (31.069s). Four full DB shards are still running. The complete API suite finished with 7,983 passed / 9 failed, 447 passed / 7 failed files, 1,280.870s wall. Two failures are the unchanged pure-import scanner; seven belong to newly merged AI/privacy/conformance test setup. In an isolated checkout their three repaired source files and three compiled counterparts pass all 36 tests after an isolated API build; root runtime/source remains unchanged until the DB matrix closes. No green full-suite claim is made.

The new main privacy repository has a real typed-binding-refusal mapping gap, hidden by its old unbound fixture contexts. In an isolated checkout, a genuine-session regression fails with PRIVACY_UNAVAILABLE before the two-line typed-error fix, then the whole six-test privacy file passes. The tested patch remains isolated until the main matrix closes; it has not changed the active run's source. The fresh DB run also exposes the new native-server-chaos case: resumable evidence binding refusal must retain NOT_FOUND for status/append/finalize. That bounded domain mapping is being tested in a separate isolated checkout with all original assertions intact.

Tools: 419 passed / 4 failed (423 total; 123.459s), the same practice-session source-fingerprint guards. Those pins remain unchanged. Exact commands, working directories, patch identities, results and remaining failed titles are in the [current validation journal](LP-6B-ROUTER-REPAIR-2026-11-04-validation.md). Earlier reports remain historical evidence; their 0584 references describe the then-current migration stem.
