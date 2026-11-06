# LP-6b router continuation validation journal

This journal retains recorded completed and pending attempts, including failures later repaired. An early mock run hit stale core outputs after the main merge; its wrapper name was reused, so router-api-mocks records the final successful rerun rather than reconstructing missing timing.
The main repair report identifies which run covers the final source and which reds remain. Recorded HEAD is the start commit, not a claim that every focused run had a clean working tree. Full matrix commands started after committed repair checkpoints.
Each row records its actual working directory; Node 24.15.0 and pnpm 10.28.1 are pinned. Isolated privacy runs include the recorded uncommitted patch hash in their source column.
The scratch wrapper adds the pinned runtime to PATH; final PostgreSQL client PATH is
`/workspace/work/pg-client/root/usr/lib/postgresql/16/bin`. PostgreSQL integration tests use real 16.10 servers and synthetic data.

| Run | Cwd | Recorded source | Exact command | Exit | Wall seconds | Reported summary |
| --- | --- | --- | --- | ---: | ---: | --- |
| router-db-locks | /workspace/jobguard | e1c03c91ac30 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/commercial-integrity-v3-query-isolation.integration.test.ts test/serious-b7.integration.test.ts -t 'concurrent family\|S22\|S21 holds\|S21 still'` | 1 | 8.028 | 2 failed (2); 19 skipped (19) |
| router-db-locks-renumbered | /workspace/jobguard | e1c03c91ac30 | `PGOPTIONS='-c statement_timeout=15000' pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/commercial-integrity-v3-query-isolation.integration.test.ts test/serious-b7.integration.test.ts -t 'S21 refuses session revocation/change\|concurrent family\|S22'` | 1 | 37.529 | 2 failed (2); 2 failed \| 3 passed \| 14 skipped (19) |
| router-0596-upgrade | /workspace/jobguard | e1c03c91ac30 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-effective-actor-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts` | 1 | 16.984 | 1 failed \| 1 passed (2); 1 failed \| 1 passed (2) |
| router-session-controls-test | /workspace/jobguard | e1c03c91ac30 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/practice-worker-switch.integration.test.ts test/contractor-practice-session.integration.test.ts -t 'decision 39 grants stay with the member and revocation removes job access\|a holder can end their own session after membership revoke without additional permission'` | 1 | 15.777 | 2 failed (2); 2 failed \| 93 skipped (95) |
| router-api-mocks-typecheck-api | /workspace/jobguard | e1c03c91ac30 | `pnpm --filter @jobguard/api typecheck` | 0 | 27.114 |  |
| router-api-mocks-typecheck-db | /workspace/jobguard | e1c03c91ac30 | `pnpm --filter @jobguard/db typecheck` | 0 | 22.177 |  |
| router-build | /workspace/jobguard | e1c03c91ac30 | `pnpm build` | 0 | 109.547 |  |
| router-api-paths | /workspace/jobguard | e1c03c91ac30 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/commercial-integrity-v3.boundary.test.ts src/extra-escalation-task.test.ts src/final-check.isolation.test.ts src/subscription-boundaries.test.ts src/sv5pre-worker-registration.test.ts src/audit-export/audit-export.context.test.ts src/auth/auth.test.ts src/auth/identity.test.ts src/contractor/work-order.application.test.ts src/auth/sso/action-paths.test.ts dist/commercial-integrity-v3.boundary.test.js dist/extra-escalation-task.test.js dist/final-check.isolation.test.js dist/subscription-boundaries.test.js dist/sv5pre-worker-registration.test.js dist/audit-export/audit-export.context.test.js dist/auth/auth.test.js dist/auth/identity.test.js dist/contractor/work-order.application.test.js dist/auth/sso/action-paths.test.js` | 0 | 43.102 | 20 passed (20); 176 passed (176) |
| router-migration-boundaries | /workspace/jobguard | e1c03c91ac30 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp-0-grant-freeze.integration.test.ts test/lp-0-authority-paths.integration.test.ts test/migration-proof-loader.test.ts test/tenancy.integration.test.ts` | 0 | 48.004 | 4 passed (4); 110 passed (110) |
| router-api-shadow | /workspace/jobguard | e1c03c91ac30 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/shadow-isolation.application.test.ts dist/shadow-isolation.application.test.js` | 1 | 60.336 | 2 failed (2); 2 failed \| 42 passed (44) |
| router-db-race-teardown | /workspace/jobguard | f1cb1f845fe4 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-case-join.integration.test.ts test/enterprise-dashboard.authority-race.integration.test.ts` | 0 | 22.699 | 2 passed (2); 28 passed (28) |
| router-api-shadow-source | /workspace/jobguard | f1cb1f845fe4 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/shadow-isolation.application.test.ts` | 0 | 30.929 | 1 passed (1); 22 passed (22) |
| router-api-mocks | /workspace/jobguard | f1cb1f845fe4 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/practice-session.test.ts src/job-parties.application.test.ts src/watchdog-registry.test.ts src/contractor/site-extra.application.test.ts src/evidence-pack-v3.application.test.ts` | 0 | 14.059 | 5 passed (5); 375 passed (375) |
| router-api-mocks-final-typecheck-db | /workspace/jobguard | f1cb1f845fe4 | `pnpm --filter @jobguard/db typecheck` | 0 | 27.335 |  |
| router-api-mocks-final-typecheck-api | /workspace/jobguard | f1cb1f845fe4 | `pnpm --filter @jobguard/api typecheck` | 2 | 31.143 |  |
| router-api-build | /workspace/jobguard | f1cb1f845fe4 | `pnpm --filter @jobguard/api build` | 1 | 39.635 |  |
| router-api-build-recheck | /workspace/jobguard | 6005e2aa1ff5 | `pnpm --filter @jobguard/api build` | 0 | 31.069 |  |
| router-source-money-boundaries | /workspace/jobguard | 57e6997ddb26 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-sources-authority.integration.test.ts test/money-trail-security.integration.test.ts` | 0 | 18.403 | 2 passed (2); 15 passed (15) |
| router-full-web | /workspace/jobguard | 57e6997ddb26 | `pnpm --filter @jobguard/web test` | 0 | 138.015 | 121 passed (121); 1662 passed (1662) |
| router-lint | /workspace/jobguard | 57e6997ddb26 | `pnpm lint` | 1 | 2.006 |  |
| router-full-api | /workspace/jobguard | 57e6997ddb26 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1` | 1 | 1280.87 | 7 failed \| 447 passed (454); 9 failed \| 7983 passed (7992) |
| router-typecheck | /workspace/jobguard | 57e6997ddb26 | `pnpm typecheck` | 0 | 204.87 |  |
| router-full-db-2 | /workspace/jobguard | 5ada4bc6823f | `pnpm --filter @jobguard/db test --shard=2/4` | 1 | 1828.01 | 1 failed \| 188 passed (189); 1 failed \| 1409 passed (1410) |
| router-full-db-1 | /workspace/jobguard | 5ada4bc6823f | `pnpm --filter @jobguard/db test --shard=1/4` | 0 | 1828.77 | 190 passed (190); 1710 passed \| 15 todo (1725) |
| router-full-db-4 | /workspace/jobguard | 5ada4bc6823f | `pnpm --filter @jobguard/db test --shard=4/4` | 1 | 1803.609 | 3 failed \| 186 passed (189); 3 failed \| 1690 passed (1693) |
| router-full-db-3 | /workspace/jobguard | 5ada4bc6823f | `pnpm --filter @jobguard/db test --shard=3/4` | 1 | 2516.43 | 2 failed \| 187 passed (189); 11 failed \| 1656 passed \| 4 todo (1671) |
| router-lint-recheck | /workspace/jobguard | 50fdba791efa | `pnpm lint` | 0 | 144.13 |  |
| router-privacy-before | /workspace/work/lp6b/privacy-worktree | 50fdba791efa + patch 69b48f9f9851 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/privacy-operations.integration.test.ts -t 'keeps the forbidden public code when genuine request binding refuses a revoked session or member'` | 1 | 11.139 | 1 failed (1); 1 failed \| 5 skipped (6) |
| router-tools | /workspace/jobguard | 50fdba791efa | `node --test tools/*.test.mjs` | 1 | 123.459 | tests 423; pass 419; fail 4; skipped 0; todo 0 |
| router-privacy-after | /workspace/work/lp6b/privacy-worktree | 50fdba791efa + patch 0844b1344200 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/privacy-operations.integration.test.ts` | 0 | 33.289 | 1 passed (1); 6 passed (6) |
| router-newmain-api-before | /workspace/work/lp6b/newmain-api-worktree | 66607034ef0d | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/ai-capture-authority.test.ts src/privacy-operations.application.test.ts src/connectors/conformance-kit.test.ts` | 1 | 14.709 | 2 failed \| 1 passed (3); 3 failed \| 15 passed (18) |
| router-newmain-api-after | /workspace/work/lp6b/newmain-api-worktree | 66607034ef0d | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/ai-capture-authority.test.ts src/privacy-operations.application.test.ts src/connectors/conformance-kit.test.ts` | 0 | 21.083 | 3 passed (3); 18 passed (18) |
| router-newmain-api-isolated-build | /workspace/work/lp6b/newmain-api-worktree | 66607034ef0d | `pnpm --filter @jobguard/api build` | 0 | 51.71 |  |
| router-newmain-api-compiled-proof | /workspace/work/lp6b/newmain-api-worktree | 66607034ef0d | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/ai-capture-authority.test.ts src/privacy-operations.application.test.ts src/connectors/conformance-kit.test.ts dist/ai-capture-authority.test.js dist/privacy-operations.application.test.js dist/connectors/conformance-kit.test.js` | 0 | 16.208 | 6 passed (6); 36 passed (36) |
| router-resumable-before | /workspace/work/lp6b/resumable-worktree | 66607034ef0d | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/native-server-chaos.integration.test.ts` | 1 | 16.494 | 1 failed (1); 1 failed \| 3 passed (4) |
| router-resumable-after | /workspace/work/lp6b/resumable-worktree | 66607034ef0d | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/native-server-chaos.integration.test.ts` | 0 | 9.893 | 1 passed (1); 4 passed (4) |
| router-resumable-complete | /workspace/work/lp6b/resumable-worktree | 66607034ef0d | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/resumable-evidence.test.ts test/native-server-chaos.integration.test.ts` | 0 | 17.567 | 2 passed (2); 23 passed (23) |
| router-resumable-typecheck | /workspace/work/lp6b/resumable-worktree | 66607034ef0d | `pnpm --filter @jobguard/db typecheck` | 0 | 25.089 |  |
| router-proof-normalization | /workspace/work/lp6b/privacy-worktree | 50fdba791efa + patch 64810a1dee24 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/plan-entitlement-lifecycle-upgrade.integration.test.ts` | 0 | 11.465 | 1 passed (1); 1 passed (1) |
| router-proof-normalization-guarded | /workspace/work/lp6b/privacy-worktree | 50fdba791efa + patch e3485ad4b9ab | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/plan-entitlement-lifecycle-upgrade.integration.test.ts` | 0 | 10.803 | 1 passed (1); 1 passed (1) |
| router-postfix-build | /workspace/jobguard | 209a3831a02f | `pnpm build` | 0 | 69.384 |  |
| router-postfix-db | /workspace/jobguard | 209a3831a02f | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/resumable-evidence.test.ts dist/resumable-evidence.test.js test/native-server-chaos.integration.test.ts test/privacy-operations.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp6b-effective-actor-upgrade.integration.test.ts` | 0 | 29.971 | 6 passed (6); 50 passed (50) |
| router-postfix-api | /workspace/jobguard | 209a3831a02f | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/ai-capture-authority.test.ts src/privacy-operations.application.test.ts src/connectors/conformance-kit.test.ts dist/ai-capture-authority.test.js dist/privacy-operations.application.test.js dist/connectors/conformance-kit.test.js src/practice-binding-refusal.test.ts dist/practice-binding-refusal.test.js` | 0 | 19.13 | 8 passed (8); 54 passed (54) |
| router-postfix-typecheck | /workspace/jobguard | 209a3831a02f | `pnpm typecheck` | 0 | 133.143 |  |
| router-postfix-tools | /workspace/jobguard | 209a3831a02f | `node --test tools/*.test.mjs` | 1 | 150.131 | tests 423; pass 419; fail 4; skipped 0; todo 0 |
| router-postfix-lint | /workspace/jobguard | 209a3831a02f | `pnpm lint` | 0 | 148.931 |  |
| router-postfix-web | /workspace/jobguard | 209a3831a02f | `pnpm --filter @jobguard/web test` | 0 | 147.38 | 121 passed (121); 1662 passed (1662) |
| router-final-lane | /workspace/jobguard | 209a3831a02f | `env LANE_BASE_REF=56b74eae node tools/agent-lane-boundary-lint.mjs --lane=lp-6b-withtenant` | 0 | 0.23 |  |

## Final-run failure inventory

Titles below are copied from the last complete selected logs. Source and compiled duplicates are retained.
A suite/hook failure is shown separately from failed test counts. This is not a green-suite claim.

### router-full-db-1

Recorded HEAD `5ada4bc6823fcc6f01979e3cd337e813b5db0ac7`; exit `0`.

No failed test titles reported.

### router-full-db-2

Recorded HEAD `5ada4bc6823fcc6f01979e3cd337e813b5db0ac7`; exit `1`.

- test/commercial-integrity-v3-query-isolation.integration.test.ts > PostgreSQL zero/many hidden signal query log > concurrent family/source reads hold no writer locks while jobs and sessions change

### router-full-db-3

Recorded HEAD `5ada4bc6823fcc6f01979e3cd337e813b5db0ac7`; exit `1`.

- test/serious-b7.integration.test.ts [ test/serious-b7.integration.test.ts ]
- test/practice-worker-switch.integration.test.ts > [PW32] decision 39 grants stay with the member and revocation removes job access
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S21 refuses session revocation/change committed while attachment approval waits for its case lock
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S21 refuses membership revocation/change committed while attachment approval waits for its case lock
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S21 refuses permission revocation/change committed while attachment approval waits for its case lock
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S21 refuses membership_expiry revocation/change committed while attachment approval waits for its case lock
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S21 refuses session_expiry revocation/change committed while attachment approval waits for its case lock
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S21 holds control_plane.practice_session against revocation until the approving transaction ends
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S21 holds app.membership against revocation until the approving transaction ends
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S22 opens and packs supported supplier case merchant_overcharge through the real applications
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S22 opens and packs supported supplier case duplicate_supplier_payment through the real applications
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S22 opens and packs supported supplier case prevention through the real applications

### router-full-db-4

Recorded HEAD `5ada4bc6823fcc6f01979e3cd337e813b5db0ac7`; exit `1`.

- test/contractor-practice-session.integration.test.ts > [PH11] a holder can end their own session after membership revoke without additional permission
- test/native-server-chaos.integration.test.ts > offline membership revocation refuses state, remaining bytes, finalization and command replay without effects
- test/plan-entitlement-lifecycle-upgrade.integration.test.ts > 0556 preserves all populated tables and routine ACLs, installs only the adapter body, and replays harmlessly

### router-full-api

Recorded HEAD `57e6997ddb267902462143d2de372fb44641970b`; exit `1`.

- dist/ai-capture-authority.test.js > stored capture AI authority (fake provider; no live route) > uses persisted bytes, hash, tenant and visibility rather than request labels
- src/ai-capture-authority.test.ts > stored capture AI authority (fake provider; no live route) > uses persisted bytes, hash, tenant and visibility rather than request labels
- dist/privacy-operations.application.test.js > dark privacy route > uses the verified context and persisted session digest
- src/privacy-operations.application.test.ts > dark privacy route > uses the verified context and persisted session digest
- dist/privacy-operations.application.test.js > dark privacy route > returns only a typed error, never database details
- src/privacy-operations.application.test.ts > dark privacy route > returns only a typed error, never database details
- dist/connectors/conformance-kit.test.js > ENT-13b shared synthetic conformance (no provider or release evidence) > passes every named check for the synthetic SFTP connector
- dist/contractor/enterprise-dashboard.boundaries.test.js > [E9-27 E9-34] advisory/read modules import only pure readers and the tenant/session boundary; no writer, provider, outbox or privileged client
- src/contractor/enterprise-dashboard.boundaries.test.ts > [E9-27 E9-34] advisory/read modules import only pure readers and the tenant/session boundary; no writer, provider, outbox or privileged client

### router-full-web

Recorded HEAD `57e6997ddb267902462143d2de372fb44641970b`; exit `0`.

No failed test titles reported.

### router-0596-upgrade

Recorded HEAD `e1c03c91ac305d190843b1530ea602481b052962`; exit `1`.

- test/plan-entitlement-lifecycle-upgrade.integration.test.ts > 0556 preserves all populated tables and routine ACLs, installs only the adapter body, and replays harmlessly

### router-db-locks-renumbered

Recorded HEAD `e1c03c91ac305d190843b1530ea602481b052962`; exit `1`.

- test/commercial-integrity-v3-query-isolation.integration.test.ts > PostgreSQL zero/many hidden signal query log > concurrent family/source reads hold no writer locks while jobs and sessions change
- test/serious-b7.integration.test.ts > SERIOUS-B7 PostgreSQL authority and sources > S21 refuses session revocation/change committed while attachment approval waits for its case lock

### router-session-controls-test

Recorded HEAD `e1c03c91ac305d190843b1530ea602481b052962`; exit `1`.

- test/contractor-practice-session.integration.test.ts > [PH11] a holder can end their own session after membership revoke without additional permission
- test/practice-worker-switch.integration.test.ts > [PW32] decision 39 grants stay with the member and revocation removes job access

### router-postfix-db

Recorded HEAD `209a3831a02f27dce24f0f44c43868f8705fa2d9`; exit `0`.

No failed test titles reported.

### router-postfix-api

Recorded HEAD `209a3831a02f27dce24f0f44c43868f8705fa2d9`; exit `0`.

No failed test titles reported.

### router-postfix-web

Recorded HEAD `209a3831a02f27dce24f0f44c43868f8705fa2d9`; exit `0`.

No failed test titles reported.

### router-proof-normalization-guarded

Recorded HEAD `50fdba791efa5e236d1cb68d92d3c3db6d424285`; exit `0`.

No failed test titles reported.

### router-postfix-tools

Recorded HEAD `209a3831a02f27dce24f0f44c43868f8705fa2d9`; exit `1`.

- CI-B01 exact integrated source has zero violations, unbaselined edges and stale entries
- CLI exits zero for repository and exit status agrees with API
- r1 real-source baseline has exactly one entry per remaining site
- CSG-01 installed repository has real origins and nonempty nested authority roots, and must have zero confirmed, unbaselined or stale diagnostics for PASS
