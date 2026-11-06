# LP-6b router continuation — 4 November 2026

**Not merge-ready: the remaining boundary/scanner/pin decisions below need the router.** No independent Claude verdict or merge approval is claimed. The Codex agents used here performed engineering work, not the independent checks requested by the router.

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

The named definition check passes. The test then exposed a fixture composition issue: its historical setup had already staged 0562, so the strict forward proof tried to add the same routines twice.

Automatic approval review rejected an initial broad exclusion of already-installed migrations; that edit was not executed. The safer correction now uses the existing strict proof checker to invert ONLY the exact six reviewed 0562 routine records, validating every after-value before restoring the logical pre-foundation metadata. It then applies EVERY original successor proof unchanged, including 0562. Nothing is skipped. Six added negative controls flip each staged routine's security-definer flag and require rejection before normalization. All existing definition, table and final owner/ACL comparisons remain exact. The complete real-PG upgrade test passes in the isolated checkout and in the main-checkout recheck. This issue is resolved without broadening a guard or changing a database privilege.

## Final validation

All four complete real-PostgreSQL shards finished at source `5ada4bc6`. The complete API run started at `57e6997d` with the same production code. Root source and runtime outputs stayed fixed while these ran; later commits in that interval changed documentation only. Raw red counts below are retained, including failures subsequently repaired. Source and compiled copies count as actually executed; todo is not pass.

| Exact command | Complete run result |
| --- | --- |
| `pnpm --filter @jobguard/db test --shard=1/4` | exit 0; Test Files: 190 passed (190); Tests: 1710 passed \| 15 todo (1725); 1828.77s wall |
| `pnpm --filter @jobguard/db test --shard=2/4` | exit 1; Test Files: 1 failed \| 188 passed (189); Tests: 1 failed \| 1409 passed (1410); 1828.01s wall |
| `pnpm --filter @jobguard/db test --shard=3/4` | exit 1; Test Files: 2 failed \| 187 passed (189); Tests: 11 failed \| 1656 passed \| 4 todo (1671); 2516.43s wall |
| `pnpm --filter @jobguard/db test --shard=4/4` | exit 1; Test Files: 3 failed \| 186 passed (189); Tests: 3 failed \| 1690 passed (1693); 1803.609s wall |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1` | exit 1; Test Files: 7 failed \| 447 passed (454); Tests: 9 failed \| 7983 passed (7992); 1280.87s wall |

Four-shard raw aggregate: **6,465 passed, 15 failed, 0 skipped, 19 todo / 6,499 tests**; 751 passed / 6 failed files. SERIOUS-B7 also reports its teardown-hook failure. No uncaught connection error recurred. Shard 1, including S9 and J10, passed; no deterministic J10 product fix is claimed. A possible PostgreSQL query/wait sampling race was identified, but the old failure did not capture enough lock data to establish that cause.

After those full runs, the verified isolated patches were applied and pushed at `209a3831`:

- Privacy: map only the typed refused bind to existing PRIVACY_FORBIDDEN after rollback. Its prior contextless fixture missed this path; a new genuine real-session/member revocation case fails before the fix and passes after it, including read/command and no-effects checks.
- Resumable evidence: map only the typed refused bind to existing NOT_FOUND across begin, status, append, finalize and proof-storage reads, after rollback. The existing offline rehearsal now retains PERMISSION_REVOKED for command replay and proves no effects. The new unit observes all five refused entry traces and client releases.
- New-main API fixtures: add the missing non-enumerable privacy principal credential, preserve bound-actor answers while AI negative cases explicitly reach capture reads, and resolve actual source bytes for the compiled conformance test. No scanner logic or existing negative control was removed.
- Upgrade fixture: strict inverse/forward composition described above. All successors and every final comparison remain active.

| Recheck after applying the fixes | Result |
| --- | --- |
| Affected database suites, source and compiled unit copies, real-PG privacy/native/upgrade | exit 0; Test Files: 6 passed (6); Tests: 50 passed (50); 29.971s wall |
| Affected API source and compiled fixtures plus actual HTTP binding regressions | exit 0; Test Files: 8 passed (8); Tests: 54 passed (54); 19.13s wall |
| Complete web suite | exit 0; Test Files: 121 passed (121); Tests: 1662 passed (1662); 147.38s wall |
| Root pnpm build | exit 0; 69.384s wall |
| Root pnpm typecheck | exit 0; 133.143s wall |
| Root pnpm lint | exit 0; 148.931s wall |
| node --test tools/*.test.mjs | exit 1; 150.131s wall; 423 tests, 419 pass, 4 fail, 0 skipped, 0 todo |

The focused passes do not rewrite the raw full-run failures. Seven new-main API setup failures, the native offline mapping failure and the 0556 fixture failure were cleared by their complete affected source/compiled/PostgreSQL rechecks. The two API scanner failures remain. The SERIOUS hook and S22 cascades remain tied to the unresolved S21 protocol conflict.

All exact commands, cwd, starting HEAD, isolated patch identities, exits, timings and failed titles are in the [validation journal](LP-6B-ROUTER-REPAIR-2026-11-04-validation.md). Real embedded PostgreSQL is 16.10; test pg_dump/psql clients are 16.15. All data and provider effects are fictional. No real provider, data, release or merge readiness is claimed.

## Remaining decisions under the unchanged limits

1. **Binding protocol versus existing session/read contracts — real product conflicts.** PW32 switch-off, PH11 self-revoke, seven S21 approval races, and the integrity read-lock test cannot all pass under the current generic session SHARE binding and unchanged older contracts. LP-6a explicitly requires revocation to wait for a bound request; S21 requires that revocation to commit while the request awaits a case lock. Integrity forbids the RowExclusive relation lock intrinsically required by the binding INSERT. No timeout was relabelled as authentication failure, and no fake queued context or generic revoked-member binding was introduced.

A bounded compatibility option for Ben to approve is exactly five named calls: PracticeWorkerSwitchRepository.switchOff; ContractorPracticeSessionRepository.revoke; EvidencePackRepository.approveAttachment; CommercialIntegrityV3Repository.readFamily; CommercialIntegrityV3Repository.read. Their existing checked SQL authority/fencing would remain, every other call would still bind first, and no privilege would change. This requires explicit new named binding deferrals and changing the restriction scanner at `packages/db/test/lp6b-deferred-binding.test.ts` (strict call list 9 to 14, with workspace/alias coverage addressed). That scanner change is currently forbidden. A purpose-bound replacement binding protocol is an alternative requiring its own reviewed design and forward migration; it must not broaden ordinary business binding to revoked members. Neither alternative has been implemented.

2. **Pure-reader import scanner — two API failures.** `apps/api/src/contractor/enterprise-dashboard.boundaries.test.ts:11` omits `./request-binding-error.js` from the exact DB import list; line 19 rejects it. That helper only translates a typed refusal. Adding this exact pure dependency needs the router to permit this scanner edit. It was left unchanged; the import was not relocated or obscured to evade the scanner.

3. **Four source-fingerprint tool failures.** The unchanged baselines are `tools/commercial-integrity-boundary.unresolved.json` and `tools/commercial-integrity-current-source-guard.unresolved.json`. The reviewed source site is `packages/db/src/practice-session.ts`, old line 73 / current line 75; recorded fingerprint `ad3ac47cb73083599ccbd5fd355eb9f2f313b9af4ceca2115da91270658d50ca` versus current `a52add41726877212b3d0441a7351647222c7aa760b4e2be0f07d3ea2fd00c04`. These are semantic source fingerprints, distinct from the two S9 hashes Ben approved. No baseline or source pin was refreshed in this continuation.

The earlier browser evidence remains qualified: pinned-browser download was blocked, eight managed-browser data-navigation cases were policy-blocked and the shadow-disclosure scenario needs its own boundary decision. No new full browser pass is claimed here. The earlier Codex agent checks are engineering evidence and do not satisfy Claude’s independent check gate.

## Preserved limits and ownership

S9 is unchanged in this continuation; all eight recorded values still match. No other source scanner definition or source pin was changed. Source-inspection fixture locators inspect the same TypeScript bytes from src and dist. Strict SQL mock traces observe every pool/client call; the necessary bind/actor statements are explicit and their arguments/order are checked. No guard was satisfied by hiding SQL. Only the named routine definition successor expectation and strictly checked fixture composition changed in the approved upgrade test.

0596 SQL bytes remain `fc85804a10686e5d3799e0519ab67c28b43cad98e9d89efebe9eaedff352aa06`. The repair adds no database grant, app-schema usage for identity, function SET app.* clause, fingerprinted-table column, or binding-row cleanup. Snapshot comparison still excludes only control_plane.request_binding. The lane never lists itself; the final lane check passed against main 56b74eae, including the working-tree report paths.

**Database/platform operations should own binding-row retention/removal, with security review. Ben must name the accountable owner before real data.** No cleanup was built. Claude performs the independent checks separately. Only `codex/sandbox/lp-6b-repair-wip` is pushed; the PR branch remains at `6c7ded22c533c7d7660beb640144934d8c7f6e53`.
