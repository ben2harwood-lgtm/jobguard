# LP-6b 5 November 2026 validation journal

This journal retains all completed attempts, including failures later repaired.
The main repair report identifies which run covers the final source and which reds remain. Recorded HEAD is the start commit, not a claim that every focused run had a clean working tree. Full matrix commands started after committed repair checkpoints.
Each row records its actual working directory; Node 24.15.0 and pnpm 10.28.1 are pinned.
The scratch wrapper adds the pinned runtime to PATH; final PostgreSQL client PATH is
`/workspace/work/pg-client/root/usr/lib/postgresql/16/bin`. PostgreSQL integration tests use real 16.10 servers and synthetic data.

| Run | Cwd | Recorded source | Exact command | Exit | Wall seconds | Reported summary |
| --- | --- | --- | --- | ---: | ---: | --- |
| nov5-binding-source | /workspace/jobguard | c5fdb7549b13 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/tenant-context.test.ts test/lp6b-withtenant.test.ts` | 0 | 6.365 | 2 passed (2); 37 passed (37) |
| nov5-approval-proof | /workspace/jobguard | c5fdb7549b13 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-approval-binding.integration.test.ts test/serious-b7.integration.test.ts` | 1 | 13.614 | 1 failed \| 1 passed (2); 1 failed \| 13 passed (14) |
| nov5-four-boundaries | /workspace/jobguard | c5fdb7549b13 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/practice-worker-switch.integration.test.ts test/contractor-practice-session.integration.test.ts test/commercial-integrity-v3-query-isolation.integration.test.ts` | 1 | 47.03 | 1 failed \| 2 passed (3); 1 failed \| 101 passed (102) |
| nov5-four-boundaries-recheck | /workspace/jobguard | c5fdb7549b13 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/practice-worker-switch.integration.test.ts test/contractor-practice-session.integration.test.ts test/commercial-integrity-v3-query-isolation.integration.test.ts` | 0 | 47.777 | 3 passed (3); 102 passed (102) |
| nov5-approval-proof-member-first | /workspace/jobguard | c5fdb7549b13 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-approval-binding.integration.test.ts test/serious-b7.integration.test.ts` | 0 | 12.535 | 2 passed (2); 14 passed (14) |
| nov5-late-helper-unit | /workspace/jobguard | c5fdb7549b13 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-bind-after-locks.test.ts src/tenant-context.test.ts test/lp6b-withtenant.test.ts` | 0 | 5.0 | 3 passed (3); 43 passed (43) |
| nov5-C-deferred-restriction | /workspace/jobguard | c5fdb7549b13 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-deferred-binding.test.ts` | 1 | 5.328 | 1 failed (1); 1 failed (1) |
| nov5-C-deferred-restriction-recheck | /workspace/jobguard | c5fdb7549b13 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-deferred-binding.test.ts` | 0 | 20.038 | 1 passed (1); 1 passed (1) |
| nov5-build | /workspace/jobguard | 3b6821c135b6 | `pnpm build` | 0 | 122.788 |  |
| nov5-preflight-db | /workspace/jobguard | 3b6821c135b6 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/tenant-context.test.ts test/lp6b-withtenant.test.ts test/lp6b-bind-after-locks.test.ts test/lp6b-deferred-binding.test.ts test/lp6b-approval-binding.integration.test.ts test/serious-b7.integration.test.ts test/lp6b-effective-actor-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts` | 0 | 63.836 | 8 passed (8); 60 passed (60) |
| nov5-preflight-api | /workspace/jobguard | 3b6821c135b6 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/context-boundary.test.ts src/contractor/enterprise-dashboard.boundaries.test.ts` | 1 | 7.746 | 1 failed \| 1 passed (2); 3 failed \| 144 passed (147) |
| nov5-tools | /workspace/jobguard | 3b6821c135b6 | `node --test tools/*.test.mjs` | 0 | 73.937 | tests 423; pass 423; fail 0; skipped 0; todo 0 |
| nov5-context-guard-recheck | /workspace/jobguard | 3b6821c135b6 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/context-boundary.test.ts src/contractor/enterprise-dashboard.boundaries.test.ts` | 0 | 4.486 | 2 passed (2); 147 passed (147) |
| nov5-final-helper-proof | /workspace/jobguard | 3b6821c135b6 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-bind-after-locks.test.ts test/lp6b-approval-binding.integration.test.ts test/serious-b7.integration.test.ts` | 0 | 12.385 | 3 passed (3); 20 passed (20) |
| nov5-final-build | /workspace/jobguard | 01b8372a6b38 | `pnpm build` | 0 | 56.86 |  |
| nov5-full-db-1 | /workspace/jobguard | d4ec9a658868 | `pnpm --filter @jobguard/db test --shard=1/4` | 1 | 2141.869 | 198 passed (198); 1779 passed \| 15 todo (1794); 1 error |
| nov5-full-db-2 | /workspace/jobguard | d4ec9a658868 | `pnpm --filter @jobguard/db test --shard=2/4` | 0 | 2091.486 | 198 passed (198); 1436 passed (1436) |
| nov5-full-db-3 | /workspace/jobguard | d4ec9a658868 | `pnpm --filter @jobguard/db test --shard=3/4` | 1 | 2277.64 | 1 failed \| 197 passed (198); 1 failed \| 1725 passed \| 4 todo (1730) |
| nov5-full-db-4 | /workspace/jobguard | d4ec9a658868 | `pnpm --filter @jobguard/db test --shard=4/4` | 1 | 2042.012 | 2 failed \| 196 passed (198); 1 failed \| 1749 passed \| 3 skipped (1753) |
| nov5-full-api | /workspace/jobguard | d4ec9a658868 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1` | 1 | 1560.913 | 9 failed \| 463 passed (472); 36 failed \| 8130 passed (8166) |
| nov5-full-web | /workspace/jobguard | d4ec9a658868 | `pnpm --filter @jobguard/web test` | 1 | 310.84 | 4 failed \| 152 passed (156); 31 failed \| 1879 passed (1910) |
| nov5-full-tools | /workspace/jobguard | d4ec9a658868 | `node --test tools/*.test.mjs` | 0 | 299.857 | tests 423; pass 423; fail 0; skipped 0; todo 0 |
| nov5-full-lint | /workspace/jobguard | d4ec9a658868 | `pnpm lint` | 0 | 358.712 |  |
| nov5-full-typecheck | /workspace/jobguard | d4ec9a658868 | `pnpm typecheck` | 0 | 327.703 |  |
| nov5-full-other-workspaces | /workspace/jobguard | d4ec9a658868 | `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage test` | 1 | 79.084 | packages/storage Test Files 8 passed \| 2 skipped (10); packages/storage Tests 108 passed \| 2 skipped (110); packages/config Test Files 18 passed (18); packages/config Tests 344 passed (344); packages/core Test Files 1 failed \| 211 passed (212); packages/core Tests 1 failed \| 4671 passed (4672) |
| nov5-postfix-build | /workspace/jobguard | f7fc0599f1ec | `pnpm build` | 0 | 69.593 |  |
| nov5-postfix-db-focused | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/subscription-mandate.test.ts test/onsite-diary-admission.integration.test.ts test/serious-b5-upgrade.integration.test.ts test/recovery-case-terms-upgrade.integration.test.ts` | 0 | 97.82 | 4 passed (4); 34 passed (34) |
| nov5-final-api | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1` | 0 | 653.827 | 472 passed (472); 8166 passed (8166) |
| nov5-final-web | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/web test --maxWorkers=1` | 0 | 192.046 | 156 passed (156); 1910 passed (1910) |
| nov5-final-db-1 | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/db test --shard=1/4` | 0 | 1235.167 | 198 passed (198); 1779 passed \| 15 todo (1794) |
| nov5-final-db-4 | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/db test --shard=4/4` | 0 | 1212.554 | 198 passed (198); 1753 passed (1753) |
| nov5-final-lint | /workspace/jobguard | f7fc0599f1ec | `pnpm lint` | 0 | 57.838 |  |
| nov5-final-typecheck | /workspace/jobguard | f7fc0599f1ec | `pnpm typecheck` | 0 | 46.903 |  |
| nov5-final-core | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/core test --maxWorkers=1` | 0 | 84.398 | 212 passed (212); 4672 passed (4672) |
| nov5-final-config | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/config test --maxWorkers=1` | 0 | 5.354 | 18 passed (18); 344 passed (344) |
| nov5-final-ai | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/ai test --maxWorkers=1` | 0 | 17.322 | 20 passed (20); 276 passed (276) |
| nov5-final-storage | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/storage test --maxWorkers=1` | 0 | 5.676 | 8 passed \| 2 skipped (10); 108 passed \| 2 skipped (110) |
| nov5-final-tools | /workspace/jobguard | f7fc0599f1ec | `node --test --test-concurrency=1 tools/*.test.mjs` | 0 | 128.576 | tests 423; pass 423; fail 0; skipped 0; todo 0 |
| nov5-final-db-2 | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/db test --shard=2/4` | 0 | 1161.361 | 198 passed (198); 1440 passed (1440) |
| nov5-final-db-3 | /workspace/jobguard | f7fc0599f1ec | `pnpm --filter @jobguard/db test --shard=3/4` | 1 | 1389.816 | 1 failed \| 197 passed (198); 1 failed \| 1725 passed \| 4 todo (1730) |
| nov5-report-lint | /workspace/jobguard | f7fc0599f1ec | `node tools/lint.mjs` | 0 | 7.385 |  |
| nov5-report-lane-tools | /workspace/jobguard | f7fc0599f1ec | `node --test tools/agent-lane-boundary.test.mjs tools/agent-lane-boundary-train.test.mjs` | 0 | 5.738 | tests 66; pass 66; fail 0; skipped 0; todo 0 |

## Failure inventory by attempt

Titles below are copied from the last complete selected logs. Source and compiled duplicates are retained.
A suite/hook failure is shown separately from failed test counts. This is not a green-suite claim.

### nov5-approval-proof

Recorded HEAD `c5fdb7549b13e427056f7cf8c3a0c77798db4ba1`; exit `1`.

- test/lp6b-approval-binding.integration.test.ts > fails closed for the observed approval-case, generate-session and queued-revocation deadlock

### nov5-four-boundaries

Recorded HEAD `c5fdb7549b13e427056f7cf8c3a0c77798db4ba1`; exit `1`.

- test/contractor-practice-session.integration.test.ts > [PH13] two revokes produce one event; open revoke and home ending read the committed state

### nov5-C-deferred-restriction

Recorded HEAD `c5fdb7549b13e427056f7cf8c3a0c77798db4ba1`; exit `1`.

- test/lp6b-deferred-binding.test.ts > permits only the nine retained and five reviewed boundaries across production workspace aliases

### nov5-preflight-api

Recorded HEAD `3b6821c135b6e0f02e96e43962bf0127ce1848e5`; exit `1`.

- src/auth/context-boundary.test.ts > M0-6L sole-constructor boundary across all application source > holds for the real repository: only the bridge, its definition, the worker queue, the retained synthetic sandbox and the rehearsal construct a tenant context
- src/auth/context-boundary.test.ts > M0-6L sole-constructor boundary across all application source > allows the bridge exactly one verified-membership constructor, the worker exactly one payload constructor, and nothing else
- src/auth/context-boundary.test.ts > M0-6L round 8: exact stamped definition and reviewed practice callers > keeps the merged stamp private and requires both constructors to mint once before returning

### nov5-full-db-1

Recorded HEAD `d4ec9a658868e55423a8a8fa1e053e237a1968e1`; exit `1`.

See the command result above; no Vitest/TAP failure-title block was reported.

### nov5-full-db-3

Recorded HEAD `d4ec9a658868e55423a8a8fa1e053e237a1968e1`; exit `1`.

- test/practice-worker-switch.integration.test.ts > [PW11] concurrent duplicate and different commands serialize

### nov5-full-db-4

Recorded HEAD `d4ec9a658868e55423a8a8fa1e053e237a1968e1`; exit `1`.

- test/recovery-case-terms-upgrade.integration.test.ts [ test/recovery-case-terms-upgrade.integration.test.ts ]
- test/serious-b5-upgrade.integration.test.ts > SERIOUS-B5 upgrades from 0164 without rewriting data, historical PDF hashes or privileges, then replays safely

### nov5-full-api

Recorded HEAD `d4ec9a658868e55423a8a8fa1e053e237a1968e1`; exit `1`.

- dist/interim-draft.application.test.js > binds the session company directly and uses the digest, ignoring untrusted tenant selection
- src/interim-draft.application.test.ts > binds the session company directly and uses the digest, ignoring untrusted tenant selection
- dist/interim-draft.application.test.js > refuses wrong CSRF, revoked membership, expired sessions and URL substitution
- dist/interim-draft.application.test.js > passes strict commands unchanged and preserves repository refusal codes
- dist/notice-fixture.application.test.js > passes context directly and derives the human actor only from the authenticated session
- src/notice-fixture.application.test.ts > passes context directly and derives the human actor only from the authenticated session
- dist/notice-fixture.application.test.js > delegates strict input validation without adding trusted fields to the command
- dist/notice-fixture.application.test.js > hides reads from estimator just as command storage does
- dist/notice-fixture.application.test.js > hides reads from foreman just as command storage does
- dist/notice-fixture.application.test.js > hides reads from operative just as command storage does
- dist/notice-fixture.application.test.js > hides reads from finance just as command storage does
- dist/notice-fixture.application.test.js > hides reads from read_only just as command storage does
- dist/notice-fixture.application.test.js > returns the unchanged server preview, disabled reason and stale approval explanation
- src/notice-fixture.application.test.ts > returns the unchanged server preview, disabled reason and stale approval explanation
- dist/notice-fixture.application.test.js > marks only an exact unexpired approved server preview as usable
- src/notice-fixture.application.test.ts > marks only an exact unexpired approved server preview as usable
- dist/practice-bank.application.test.js > keeps consent server-side, passes verified context and digest, and consumes approval once
- src/practice-bank.application.test.ts > keeps consent server-side, passes verified context and digest, and consumes approval once
- dist/practice-bank.application.test.js > refuses swapped, session-swapped or restart-lost consent and unknown fields
- src/practice-bank.application.test.ts > refuses swapped, session-swapped or restart-lost consent and unknown fields
- dist/practice-bank.application.test.js > token loss records token_revoked, without exchanging a code or pulling
- src/practice-bank.application.test.ts > token loss records token_revoked, without exchanging a code or pulling
- dist/retention-record.application.test.js > binds verified context directly, ignores tenant headers and passes the session digest separately from the strict raw command
- src/retention-record.application.test.ts > binds verified context directly, ignores tenant headers and passes the session digest separately from the strict raw command
- dist/retention-record.application.test.js > rechecks authentication, membership, origin and CSRF before repository access
- src/interim-draft.application.test.ts > refuses wrong CSRF, revoked membership, expired sessions and URL substitution
- src/interim-draft.application.test.ts > passes strict commands unchanged and preserves repository refusal codes
- src/notice-fixture.application.test.ts > delegates strict input validation without adding trusted fields to the command
- src/notice-fixture.application.test.ts > hides reads from estimator just as command storage does
- src/notice-fixture.application.test.ts > hides reads from foreman just as command storage does
- src/notice-fixture.application.test.ts > hides reads from operative just as command storage does
- src/notice-fixture.application.test.ts > hides reads from finance just as command storage does
- src/notice-fixture.application.test.ts > hides reads from read_only just as command storage does
- src/retention-record.application.test.ts > rechecks authentication, membership, origin and CSRF before repository access
- src/shadow-isolation.application.test.ts > SV-3 Test Q: signed-in builder HTTP surfaces > successful Log an extra, retries, mutation errors and current builder counts/inbox responses ignore held signals
- src/shadow-isolation.application.test.ts > Test Q: successful mutations, exports, delivery/retry telemetry and every mutation error surface are identical

### nov5-full-web

Recorded HEAD `d4ec9a658868e55423a8a8fa1e053e237a1968e1`; exit `1`.

- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > reads no authority and binds the exact shown text and server hash
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses an approval whose plan differs from the shown text
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses an approval whose anchorDay differs from the shown text
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses an approval whose recipientRef differs from the shown text
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses an approval whose agreementId differs from the shown text
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses an approval whose expiresAt differs from the shown text
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > does not let another company or session reuse the signed preview
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses smuggled tenantId at each input level
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses smuggled actor at each input level
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses smuggled price at each input level
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses smuggled productionEnabled at each input level
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses smuggled providerSettings at each input level
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses smuggled termsText at each input level
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses smuggled termsHash at each input level
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > refuses untrusted origins, forged host origins and missing or wrong CSRF
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > preserves typed conflict MANDATE_STALE
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > preserves typed conflict MANDATE_COMMAND_CONFLICT
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > preserves typed conflict MANDATE_NOTICE_REAUTHORISATION_REQUIRED
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > never shows current authority after revoked, even with a surviving approval
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > never shows current authority after cancelled, even with a surviving approval
- app/lib/subscription-mandate-server.test.ts > M4-13 session-only practice boundary > does not leak internal failure details
- app/api/practice-bank/route.test.ts > session-only no-store read, rejecting foreign origin and tenant
- app/api/practice-bank/route.test.ts > POST requires actual trusted browser origin, CSRF and normal session
- app/api/practice-bank/route.test.ts > rejects malformed and extra authority inputs, production and secret errors
- app/api/subscription-mandate/route.integration.test.ts > persists exactly the shown terms once, rejects stale sequences, and holds fresh approval without writes
- app/api/subscription-mandate/route.integration.test.ts > revoked removes authority and internal preflight refuses future initiation
- app/api/subscription-mandate/route.integration.test.ts > cancelled removes authority and internal preflight refuses future initiation
- app/api/subscription-mandate/route.integration.test.ts > SQL rejects a session expired after the identity seam without revealing a record
- app/api/jobs/[id]/notice-fixtures/route.test.ts > requires trusted POST origin, CSRF and verified membership on each operation
- app/api/jobs/[id]/notice-fixtures/route.test.ts > binds job and session, sends no-store on success and refusal, and never changes the body
- app/api/jobs/[id]/notice-fixtures/route.test.ts > hides other environments and unexpected details

### nov5-full-other-workspaces

Recorded HEAD `d4ec9a658868e55423a8a8fa1e053e237a1968e1`; exit `1`.

- src/enterprise-domain/boundaries.test.ts > round2 P3-7 core exposes the enterprise domain API without generic helpers

### nov5-final-db-3

Recorded HEAD `f7fc0599f1ec70031599ee81682652a81389a357`; exit `1`.

- test/practice-worker-switch.integration.test.ts > [PW11] concurrent duplicate and different commands serialize


## Second-check repair local validation — 6 November 2026

Used installed package binaries directly after the global pnpm launcher stalled before tests; stopped those launchers. No dependencies downloaded. Vitest invocations named at most three files and used --maxWorkers=2. No PostgreSQL or browser was started.

Passed:
- apps/api: vitest run --maxWorkers=2 src/cis-fixture.application.test.ts src/rate-suggestion.application.test.ts src/vat-fixture.application.test.ts — 25 tests.
- apps/web: vitest run --maxWorkers=2 app/api/jobs/[id]/vat-fixtures/route.test.ts — 10 tests, original 400 assertions retained.
- packages/db: vitest run --maxWorkers=2 test/lp6b-caller-compatibility.test.ts test/upgrade-proof-utils.test.ts test/lp6b-withtenant.test.ts — 24 tests.
- packages/db: vitest run --maxWorkers=2 test/lp6b-deferred-binding.test.ts test/lp6b-bind-after-locks.test.ts test/cis-fixture-repository.test.ts — 17 tests.
- packages/db: vitest run --maxWorkers=2 test/purchase-order-action.test.ts test/retention-record-repository.test.ts test/vat-fixture-repository.test.ts — 58 tests.
- Final packages/db run after narrowing emergency behavior to notices only: vitest run --maxWorkers=2 test/lp6b-caller-compatibility.test.ts test/lp6b-deferred-binding.test.ts — 5 tests passed (/tmp/lp6b-repair-final-db.log).
- node --test --test-concurrency=2 tools/*.test.mjs — 423 passed, zero failed/skipped.
- Installed tsc -p packages/db/tsconfig.json --noEmit; tsc -p apps/api/tsconfig.json --noEmit; tsc -p apps/web/tsconfig.json --noEmit.
- From apps/api: node --import tsx src/generate-openapi.ts --check. The tsx CLI itself cannot create its IPC pipe in this sandbox; using its Node loader runs the same check without a listening pipe.
- LANE_BASE_REF=68b104767b18fad6fc5b9676f95bcd7d68bcc19d node tools/lint.mjs — passes against the reviewed base (core purity prints its existing computed-import notices). Final rerun recorded separately below if the result changes.

Not ready:
- API context-boundary.test.ts plus retention-review-task.test.ts — 152 passed, 2 failed. Both failures are the unchanged constructor allowlist rejecting the new sessionless repository constructor sites. The third requested path enterprise-access.application.test.ts does not exist and was not counted as coverage.
- node tools/lint.mjs with default origin/main base — refuses branch migration 0619 because newer main also uses 0619. No migration renumber was attempted without router reservation/catch-up.

CI still must run all real PostgreSQL integration/migration/privilege suites (including cis-fixture-route, purchase-order-audit and all seven listed upgrade snapshots), full non-DB checks, builds and ENT-10-rest-notices/ENT-10a/M4-20-retention-records browser journeys at both viewports. No local SQL double is PostgreSQL or browser evidence; no independent review was performed by this builder.

Final verification: DB/API/web tsc checks and reviewed-base lint all exited 0 after the notices-only change. Final API boundary run named context-boundary.test.ts, retention-review-task.test.ts and auth/sso/sso-required.test.ts: 161 passed, the same 2 constructor-boundary assertions failed. Lane coverage has no missing non-lane path from reviewed main base 68b10476, lists no config/lanes path, and includes the local restoration of upgrade-proof-utils.ts. git diff --check passed. Migration SQL, lp6b-deferred-binding.test.ts, PW11 and DEMO-A1 have zero new working-tree changes. This handoff remains NOT READY.


## Approved constructor sites and current-main union — 6 November 2026

Prepared base: main 3f4fc1e95a212560ed060a5fcf02d6d73b5af367; uncommitted
worktree, no exact final commit hash yet. Existing installed Node 24.17.0,
TypeScript/Vitest binaries only; no package downloads. Each Vitest invocation
named at most three files and used --maxWorkers=2; tools used concurrency 2.

Final relevant results:
- API context-boundary, retention-review-task, auth/sso/sso-required: 164 passed
  (/tmp/lp6b-final-api-boundary.log). Includes rejection of extra/relocated
  sessionless constructions. The initial union omitted the unchanged SOR pin;
  restoring that exact mainline pin resolved the two initial failures.
- API CIS/rate-suggestion/VAT fixtures: 25 passed (/tmp/lp6b-final-api-fixtures.log).
- DB caller compatibility, snapshot helper, withTenant: 24 passed; deferred guard,
  bind-after-locks, CIS: 17 passed; purchase-order, retention, VAT repositories:
  59 passed. Final caller/snapshot/deferred-guard rerun after batch-42 union:
  9 passed (/tmp/lp6b-final-db-regression.log). These are protocol/unit proofs,
  not real PostgreSQL evidence.
- Web VAT route: 10 passed with original status assertions.
- node --test --test-concurrency=2 tools/*.test.mjs: 423 passed, zero failed or
  skipped (/tmp/lp6b-final-tools.log). An intermediate run had one stale-baseline
  failure while main advanced; the final current-main union run passes unchanged
  test assertions and preserves the two previously approved fingerprints.
- tsc -p packages/core/tsconfig.json and tsc -p packages/db/tsconfig.json: pass
  (local package builds). tsc -p apps/api/tsconfig.json --noEmit: pass. Initial
  union omissions of an export and upgrade-proof tail were restored with exact
  main/branch union before final checks.
- From apps/api, node --import tsx src/generate-openapi.ts --check: pass after
  refreshing built core/db packages (/tmp/lp6b-final-openapi.log).
- Core-purity, money-arithmetic, commercial-boundary, AI-provider-boundary and
  PL/pgSQL lint commands: pass individually. Core prints 11 computed-import
  notices; SQL checks 311 migrations. Exact 159-file main-to-worktree lane
  coverage, migration order and changed-TypeScript syntax checks: pass.
- Eight S9 pins match their files. Migration SQL exactly matches the original
  0619 bytes. Existing deferred scanner and PW11 exactly match HEAD.

Local constraints still requiring CI:
- Web tsc/lint fails only in ENT-3.spec.ts: @axe-core/playwright is absent from
  installed dependencies, with its consequent implicit-any error. Do not download
  packages here; CI must use a clean pinned install and prove full web checks.
- Stock node tools/lint.mjs stops at the lane check because HEAD/index still
  predate the content merge: incoming main paths and old 0619 rename paths appear
  in its historical/uncommitted union. Its policy was not changed or bypassed.
  Router must record merge/stage renames, then stock lane/full lint must pass.
- API credential-serialization and identity tests: 8 passed; the accompanying
  practice-binding-refusal suite could not bind 127.0.0.1 (EPERM), 9 tests skipped.
  No listening server was started; do not treat that suite as passed.

CI must prove the clean pinned full unit/type/lint/build checks, real PostgreSQL
binding/refusal/isolation/privilege and migration suites, including CIS route,
purchase-order audit, effective-actor upgrade, lp6a practice restore (pg_dump),
and the seven snapshot suites: customer-portal-message,
operative-entitlements-upgrade, customer-stage-acknowledgement,
customer-quote-acceptance, plan-entitlement-lifecycle-upgrade,
restore-reconciliation-upgrade and server-entitlement-upgrade. Browser journeys
must include DEMO-A1, ENT-10-rest-notices, ENT-10a and M4-20-retention-records at
phone and desktop widths. No PostgreSQL/browser proof or independent review is
claimed by this builder. READY is for router commit and these checks only.


## Test-only finish and actual main merge — 6 November 2026 10:57 UTC

READY for router staging/commit and CI; not a merge/release or independent RED PASS.
Incoming main is d78e60463 (#595, batch-46), newer than check A's comparison.
Resolved all 12 working-file conflicts; the read-only Git index remains unmerged
until the router stages them. No Git write command was run. Preserve MERGE_HEAD
when recording this real merge. The three named conflict files retain LP-6b's
versions plus the newer main routine-body checks. All main business-table keys
remain; only control_plane.request_binding is excluded as requested.

Applied the supplied lp6b-583-af34badd-fix.diff exactly; reverse dry-run confirms
all five hunks. Main #595's session-digest manual-attestation signature, timer
refusal callback/result and app.retention_timer route are retained. Updated the
existing LP-6b caller-compatibility unit fixture to these main interfaces without
weakening its rollback, no-business-SQL or human-binding assertions. Retained
main's duplicate-loading markup and new accessibility test. No new product policy,
grant or guard change. The migration SQL, tenant context, emergency reader,
two-site constructor guard and deferred-binding scanner are byte-identical to
pre-repair HEAD. Main audit: 454 incoming paths byte-identical to main; 19 paths
have the existing LP-6b changes or necessary conflict unions.

Checks run with installed Node 24.17.0, TypeScript and Vitest only, no downloads:
- node_modules/.bin/tsc -p <workspace>/tsconfig.json --noEmit: all seven workspaces
  pass (core, config, storage, ai, db, api, web). The package lint scripts use these
  same TypeScript commands. Built core/config/storage/ai/db with installed tsc to
  refresh stale local dist before rerunning affected API/web checks; all pass.
- Vitest, at most three named files per invocation, maxWorkers=1 or 2: 343 passed.
  DB snapshot/withTenant/caller compatibility: 24; deferred/bind-after-locks: 7;
  purchase-order/retention/VAT repositories: 72; API boundary/timer/SSO: 166;
  CIS/rate/VAT application fixtures: 26; pay-now application: 36; web VAT route
  and duplicate-candidates accessibility: 12. Final logs: /tmp/lp6b-db-unit-a.log,
  /tmp/lp6b-db-guards.log, /tmp/lp6b-db-repos.log, /tmp/lp6b-api-boundary.log,
  /tmp/lp6b-api-fixtures.log, /tmp/lp6b-api-pay-now.log, /tmp/lp6b-web.log.
- node --test --test-concurrency=1 tools/*.test.mjs: 423 passed, 0 failed/skipped
  (/tmp/lp6b-tools.log).
- Core purity, money arithmetic, commercial boundary, AI provider boundary and
  PL/pgSQL lint pass (315 migrations). Stock node tools/lint.mjs stops at lane
  inspection because HEAD/index still predate this merge; do not treat it as a
  full lint PASS. Exact origin/main-to-working-file lane coverage: 161 non-lane
  paths, no config/lanes path included. Router must rerun stock lint after staging
  and recording the real merge. git diff --check origin/main passes; no conflict
  markers remain in source files.

The initial pnpm wrapper stalled before executing checks; stopped it and used
installed binaries. Initial unit failures were stale compiled output, main's
new interface expectations in the LP-6b compatibility fixture, and a conflict
resolution restoring outdated duplicate-loading markup; final runs above pass.
No database, browser, provider, live money or real customer-data run was attempted.
CI must prove database/migration/browser suites and clean pinned full checks;
the required independent RED checks still bind to the router's final exact head.
