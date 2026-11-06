# LP-6b repair WIP — final report, 4 November 2026

**Not merge-ready. All four final PostgreSQL shards and the full web/API runs completed. S9 was then updated under Ben’s explicit authorization and the entire extra-origin file was rerun. Remaining guards and policy decisions stay with Ben.**

Only `codex/sandbox/lp-6b-repair-wip` was pushed. The original PR branch `codex/sandbox/lp-6b-withtenant` remains at `6c7ded22c533c7d7660beb640144934d8c7f6e53`. Main `f78c8168449a08b3db6719a3388d9c23d325ac14` was merged cleanly first as `4497621853cdccde351c8997d10af3b30667eeb4` (122 commits); that merge introduced no repair behavior. Checkpoints were pushed as work progressed. Final production source is `ca05fd9240627059cbbd19f4104fa5e8b690b96d`; subsequent commits only record evidence, lane paths and the authorized S9 values.

## Implemented repair

- `withTenant` binds immediately after BEGIN, verifies bound tenant/actor, and rolls back/releases before a refused callback. A private WeakMap holds authenticated credentials and actor stamps; forged contexts fail. Both authentication providers keep principal credentials non-enumerable and out of JSON/spreads.
- Explicit named deferrals cover only EnterpriseIdentityRepository admin/view/allowed, OidcRepository.create, SsoRequiredRepository view/detail/command, ShadowDetectionRepository.persist, and AuditExportRepository.refuse. Each is listed with LP-6c/LP-6d closure work in `docs/contracts/lp-command-binding-design-v1.md`. Existing SQL authorization remains. Customer-portal-message and job-sources-isolation require no additional deferral. No app-schema usage or bind_request execution was granted to jobguard_identity.
- Forward migration `0584_lp6b_effective_session_actor.sql` retains base-member revocation/expiry checks, derives the effective contractor actor through the existing trusted contractor_session routine, and validates that actor. Other mismatches still refuse. Its proof records the existing-routine call; an own-step populated real-PG upgrade test checks data/types/owner/ACL preservation, switched actor, stale/foreign refusal, switch back, and double replay. No new routine, privilege, fingerprinted-table column or function SET app.* clause was added.
- Evidence snapshots begin repeatable-read writable, bind, then SET TRANSACTION READ ONLY before tenant setup. SB-02 worker coverage uses the existing queued context used by production. Practice fixtures reauthenticate at request boundaries after actor switches; the material digest stays after binding/actor verification and immediately before tenant setup.
- Initial-bind and authority-lookup 42501 refusals become a sanitized typed error after rollback; repository boundaries preserve their existing public codes. PracticeAccess wraps only that typed error. A dedicated Nest filter handles it without widening the existing practice filter. Nine actual HTTP regressions exercise AppModule filters, rollback before callback, expected public codes, and unmasked unrelated SQL errors/forged names.
- Snapshot comparison excludes exactly control_plane.request_binding; every other table remains exact. Historical-schema tests use the approved outbound-pause foundation approach or contextless synthetic seed. Web principals and narrow mock-pool answers include binding requirements. No guard/allow-list was weakened.

## Final commands and results

Cwd `/workspace/jobguard`; Node 24.15.0, pnpm 10.28.1; real embedded PostgreSQL 16.10, made-up data only. Extracted pg_dump/psql 16.15 are test clients in scratch. Runtime/client PATH and every exact wrapped command, exit, source HEAD, timing and failure title are in the [validation journal](LP-6B-REPAIR-WIP-2026-11-04-validation.md). Source and compiled duplicates are counted as executed; skips and hook failures are not passes.

All four commands below started at final source ca05fd92 and ran to completion before S9 changed. Their raw red counts are retained; the subsequent S9 pass does not rewrite a shard result.

| Exact command | Result |
| --- | --- |
| `pnpm --filter @jobguard/db test --shard=1/4` | Exit 1; 2 failed \| 180 passed (182); 2 failed \| 1656 passed \| 13 todo (1671); 2081.575s wall |
| `pnpm --filter @jobguard/db test --shard=2/4` | Exit 1; 2 failed \| 180 passed (182); 2 failed \| 1380 passed (1382); 1 error; 2012.328s wall |
| `pnpm --filter @jobguard/db test --shard=3/4` | Exit 1; 2 failed \| 179 passed (181); 11 failed \| 1559 passed \| 4 todo (1574); 2752.75s wall |
| `pnpm --filter @jobguard/db test --shard=4/4` | Exit 1; 3 failed \| 178 passed (181); 3 failed \| 1649 passed (1652); 1988.042s wall |
| `pnpm --filter @jobguard/web test` | Exit 0; 117 passed (117); 1646 passed (1646); 122.118s wall |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1` | Exit 1; 24 failed \| 416 passed (440); 233 failed \| 7609 passed (7842); 1243.847s wall |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/extra-origin.integration.test.ts` | Exit 0; 1 passed (1); 32 passed (32); 12.259s wall |
| `pnpm typecheck` | Exit 0; 202.278s wall |
| `pnpm lint` | Exit 0; 208.357s wall |
| `pnpm build` | Exit 0; 71.437s wall |
| `node --test tools/*.test.mjs` | Exit 1; 171.091s wall; 410 passed / 4 failed, unchanged fingerprint guards |

Final four-shard aggregate: **6,244 passed, 18 failed, 0 skipped, 17 todo / 6,279 tests**; 717 passed / 9 failed files. In addition to failed-test counts, SERIOUS-B7 has a hook failure and shard2 reports one uncaught 57P01 connection error. S9 and the two lower-load race rechecks are reported separately; the raw aggregate is not adjusted.

The focused requested repair run passed 97 / failed 2 of 99 tests: evidence-pack-v3-isolation 4/4 (including SB-02), practice-worker-switch 55/56, contractor-practice-session 38/39. The two remaining session-control cases are listed below. PW11 also failed intermittently in an earlier full run; final-run results remain authoritative, not a claim that the race is resolved.

## Browser results and limits

The complete original 592-case browser run finished: **574 passed, 15 failed, 3 skipped**, 8,815.379s wall. It started at 2fbb0f52 and used the earlier production build; it is historical evidence, not final-source coverage. No tests were removed. The final-source selected 60-case rerun completed: **38 passed, 19 failed, 3 skipped**, 1,751.201s wall. At lower load, the unchanged M4-5-S and ENT-11b files then passed: **16 passed, 2 skipped**, 439.565s wall, including all fourteen message cases and both Northside widths. The earlier eight message timeouts and one Northside finding timeout were not reproduced; they remain in the raw full-source selection result. The eight managed-browser policy blocks and two shadow-disclosure guard failures remain unresolved. Both exact commands and failed titles are in the journal.

Pinned Playwright Chromium 140 download was denied with 403 Domain forbidden. The supplemental runs use installed Chromium 154.0.8037.57 through an external config, preserving original assertions, viewports and CI single-worker settings. This is not equivalent to pinned-browser CI. Eight SV-3 data: navigations fail with managed-browser ERR_BLOCKED_BY_ADMINISTRATOR before assertions; no browser-policy bypass or fixture rewrite was attempted. The shadow-disclosure case first stops at its unchanged raw-42501 assertion: binding now gives typed FORBIDDEN. Its subsequent emergency-access supportDisclosure path would also need a new named exception/guard or privilege decision; that later path was not reached in this test. Both remain with Ben. The message cases hit the existing 30-second budget while awaiting delivery status/API responses; Northside missed one finding within its 10-second assertion. Those files passed the subsequent lower-load recheck without changes to guards or timeouts.

## S9 — explicitly authorized after the full run

Ben’s 4 Nov 2026 answer was **‘Yes, update S9’**. Only the two recorded values below and one authorization comment were changed in `packages/db/test/extra-origin.integration.test.ts`. The other six hashes and all assertions remain byte-identical. The file was not edited until the final full matrix finished; the whole 32-test file was then run on real PostgreSQL.

| File | Exact old SHA-256 | Exact new SHA-256 |
| --- | --- | --- |
| packages/db/src/practice-session.ts | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` | `4650b0963482827f605ec499e0b34a4b21d19d4fde6d639ffdba6182ffacec23` |
| apps/api/src/auth/context-boundary.test.ts | `b77c7b63985dc66d359af04285e099463335085aa47e64100af9473dc9f58bc0` | `7b7e45af15db8b567b13ebda9014ac084e221564a53b98e6cb0d8c49792926bd` |

The old values predate LP-6b. The practice bridge now privately carries the authenticated credential and installs its compatibility digest after binding/authority verification, before tenant setup. The boundary test contains the original PR’s approved principal/practice/contractor bridge contracts and the repair’s approved practice-source pin refresh. Those byte changes explain the new hashes; no additional scanner or source pin was changed.

## Exact successor-definition guard — unchanged for Ben

**`packages/db/test/plan-entitlement-lifecycle-upgrade.integration.test.ts:44`**, in “0556 preserves all populated tables and routine ACLs, installs only the adapter body, and replays harmlessly”, compares `current?.definition` to `prior.definition`. The differing routine is **app.lp6_session_authority(text,text,uuid)**.

Old expected value: the complete 0562 pg_get_functiondef string, SHA-256 `4c3b0401c8083b41dc76744dc99abf5a812da25794031b424bc29097b407f1fc`. New observed value: the complete 0584 string, SHA-256 `27cd0f5a1c70f7fa4e1438f444bb47a8a0e5c432d6cdd07854fffb6cc54d9227`. **Both exact literal strings are recorded in [successor definitions](LP-6B-0584-SUCCESSOR-DEFINITIONS-2026-11-04.md)**, captured from real PostgreSQL before/after 0584 alone. These hashes identify captured strings; they are not recorded values in that test.

It changes from selecting the contractor session’s base membership to retaining the base eligibility check and selecting/validating the effective switched membership through app.contractor_session. Without that change, operative contexts disagree with the bound owner. This guard is a dynamic whole-routine preservation assertion, not an approved-file recorded hash like S9. **It was not changed by the repair and remains Ben’s decision.** Main’s catalogue/comment changes arrived in the required merge.

## Remaining reds and decisions for Ben

- Final shard2 additionally reported one uncaught PostgreSQL 57P01 connection termination attributed to enterprise-dashboard.authority-race.integration.test.ts; it is separate from its two failed tests. The two unchanged files passed together on a lower-load recheck (28 tests, 20.474s wall; see journal), with no unhandled error. This does not erase the full-run J10 failure or uncaught-error observation.
- PW32: switch-off after effective-worker revocation; PH11: holder revocation after base-member revocation. Reaching these callbacks needs additional named binding deferrals and guard updates; neither was added. PW11’s intermittent concurrent-command refusal derives from an actor change between authenticated context creation and binding, not a demonstrated deadlock; no automatic rebasing/retry was added.
- SERIOUS-B7: seven S21 lock/revocation races time out at their existing 120s budget, followed by three S22 cascading failures and the hook failure. Binding’s required session SHARE lock conflicts with the fixture’s lock/revocation order. No lock or timeout was weakened.
- job-sources-authority SV7A-07 expects the later direct-SQL domain error; binding must refuse before its callback. The actual JobSourceRepository boundary maps its typed refusal. money-trail-security MT-04/07/14 expects the old six-query trace/index; bind plus authority lookup adds two queries. commercial-integrity-v3-query-isolation expects no blocking while a session changes; binding intentionally holds the session lock. All remain unchanged.
- API guard families: watchdog Round12 18 cases per source/compiled copy; practice-session 73 each; job-parties 10 each; evidence-pack transaction trace 4 each; site-extra trace 2 each; enterprise-dashboard import allow-list 1 each; shadow-isolation 3 each. The shadow-isolation guarded harness replays practice sessions in sv3_isolation_many / sv3_effect_zero / sv3_effect_many; 0562 lines65/73 only bind these synthetic session kinds in jobguard_synthetic_demo. Fixing that harness or widening the database-name binding gate is another guard decision for Ben. Compiled source-file checks also report ENOENT for .ts paths under dist. Exact titles and paths are retained in the journal; no suite was excluded, allow-list edited, SQL hidden, or source files emitted into dist to bypass those guards.
- Four tools source-fingerprint guards retain their prior baselines. The practice proxy changed; the new fingerprint is a52add41726877212b3d0441a7351647222c7aa760b4e2be0f07d3ea2fd00c04, while the recorded value is ad3ac47cb73083599ccbd5fd355eb9f2f313b9af4ceca2115da91270658d50ca. Refresh requires Ben; the S9 authorization does not cover them.
- The new opt-out restriction test scans direct names in db/src; durable workspace/alias/re-export coverage remains incomplete. Source review found no unauthorized production opt-out. Expanding that scanner is another guard edit and stays with Ben. Existing contractor policy returns the owner outside READ COMMITTED (contract line239, PW30); worker-stamped contexts refuse there, while a retained owner context can match that existing policy. No new HTTP path using that combination was identified; universal stale-owner refusal across isolation levels is not claimed.

## Independent checks and real-data ownership

Two independent agents completed their final source checks **after all four real-PG shards**, at `b9472432db7c6409697617caf863375fa7aa2f04` (production source ca05fd92). Both found no newly confirmed security defect in their reviewed scope and made no repository edits. Their independently executed targeted results are:

| Check | Exact command | Result |
| --- | --- | --- |
| security_check_one — public boundary/credentials | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/practice-binding-refusal.test.ts src/auth/credential-serialization.test.ts` | Exit 0; 2 files / 10 tests passed |
| security_check_one — binding/rollback | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-withtenant.test.ts src/tenant-context.test.ts` | Exit 0; 2 files / 37 tests passed |
| security_check_two — real-PG upgrade/isolation | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-effective-actor-upgrade.integration.test.ts test/evidence-pack-v3-isolation.integration.test.ts` | Exit 0; 2 files / 5 tests passed |

The first independently verified binding order, rollback/release, no callback on refusal, sanitized typed errors, unchanged unrelated error handling, credential serialization and the nine named deferrals. The second verified effective/base actor eligibility, stale/foreign mismatch refusal, migration replay, unchanged owner/ACL/search-path and identity privileges, evidence transaction sequencing, and the exact S9/successor-guard scope. The earlier lookup-time 42501 defect is fixed and covered.

Both retain the incomplete workspace/alias deferral scanner as a hold. Binding locks the credential row; it does not continuously refresh or cancel authority after binding, nor lock membership/switch state. The existing non-READ-COMMITTED owner policy and concurrent stale-context qualification above remain. These are source inspection plus focused tests, not professional sign-off, full-suite success, or the repository’s formal fresh Opus/Sol RED merge gate. No merge, deployment or real-data readiness approval is claimed.

**Database/platform operations should own retention and removal of control_plane.request_binding rows, with security review. Ben must name the accountable owner and approve that work before real data.** This repair builds no cleanup and claims no real-data readiness. The lane lists the authorized paths and WIP branch and never lists itself. Final lane validation passed against f78c8168, including working-tree report changes. Delivery command: `git push origin HEAD:refs/heads/codex/sandbox/lp-6b-repair-wip`.
