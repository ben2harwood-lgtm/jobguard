# LP-6b validation command journal

This journal retains completed and pending attempts, including failures later repaired.
The main repair report identifies which run covers the final source and which reds remain.
Commands run from `/workspace/jobguard` with Node 24.15.0 and pnpm 10.28.1.
The scratch wrapper adds the pinned runtime to PATH; final PostgreSQL client PATH is
`/workspace/work/pg-client/root/usr/lib/postgresql/16/bin`. PostgreSQL integration tests use real 16.10 servers and synthetic data.

| Run | Recorded HEAD | Exact command | Exit | Wall seconds | Reported summary |
| --- | --- | --- | ---: | ---: | --- |
| core-db-3 | 2fbb0f52ab30 | `pnpm --filter @jobguard/db test --shard=3/4` | 1 | 2132.435 | 14 failed \| 167 passed (181); 30 failed \| 1528 passed \| 12 skipped \| 4 todo (1574) |
| core-db-2 | 2fbb0f52ab30 | `pnpm --filter @jobguard/db test --shard=2/4` | 1 | 2094.615 | 12 failed \| 170 passed (182); 16 failed \| 1366 passed (1382) |
| core-db-1 | 2fbb0f52ab30 | `pnpm --filter @jobguard/db test --shard=1/4` | 1 | 2098.646 | 9 failed \| 173 passed (182); 8 failed \| 1608 passed \| 42 skipped \| 13 todo (1671) |
| core-db-4 | 2fbb0f52ab30 | `pnpm --filter @jobguard/db test --shard=4/4` | 1 | 1976.399 | 13 failed \| 168 passed (181); 12 failed \| 1611 passed \| 28 skipped (1651) |
| web-full | 2fbb0f52ab30 | `pnpm --filter @jobguard/web test` | 0 | 274.154 | 116 passed (116); 1638 passed (1638) |
| lint | 2fbb0f52ab30 | `pnpm lint` | 1 | 7.112 |  |
| build | 2fbb0f52ab30 | `pnpm build` | 1 | 191.463 |  |
| typecheck | 2fbb0f52ab30 | `pnpm typecheck` | 0 | 470.504 |  |
| browser-install | 2fbb0f52ab30 | `CI=1 pnpm --filter @jobguard/web exec playwright install chromium` | 1 | 4.082 |  |
| tools-tests | 2fbb0f52ab30 | `node --test tools/agent-lane-boundary-lint.test.mjs tools/migration-renumber.test.mjs` | 1 | 0.193 |  |
| non-db-tests | 2fbb0f52ab30 | `pnpm exec turbo run test '--filter=!@jobguard/db'` | 1 | 275.99 |  |
| lint-retry | 2fbb0f52ab30 | `pnpm lint` | 0 | 434.166 |  |
| tools-all | 2fbb0f52ab30 | `node --test tools/*.test.mjs` | 1 | 380.325 | tests 414; pass 410; fail 4; skipped 0; todo 0 |
| build-retry | 2fbb0f52ab30 | `pnpm build` | 0 | 271.315 |  |
| browser-list | 2fbb0f52ab30 | `CI=1 pnpm --filter @jobguard/web exec playwright test --config=/workspace/work/lp6b/playwright-system.config.ts --list` | 0 | 46.991 |  |
| browser-system | 2fbb0f52ab30 | `CI=1 pnpm --filter @jobguard/web exec playwright test --config=/workspace/work/lp6b/playwright-system.config.ts` | 1 | 2.718 |  |
| browser-system-retry | 2fbb0f52ab30 | `CI=1 pnpm --filter @jobguard/web exec playwright test --config=/workspace/work/lp6b/playwright-system.config.ts` | 1 | 8815.379 |   15 failed;   3 skipped;   574 passed (2.4h) |
| watchdog-mock | 2fbb0f52ab30 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/watchdog-registry.test.ts` | 1 | 21.131 | 1 failed (1); 18 failed \| 108 passed (126) |
| repair-unit-2 | 70d6d6580a17 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/tenant-context.test.ts src/money-trail-repository.test.ts src/success-fee-repository.test.ts src/simulation-fee-statement-repository.test.ts src/simulation-fee-collection-repository.test.ts src/stored-receipt-case-allocation-repository.test.ts test/recovery-terms-timing-fixture.test.ts test/lp6b-withtenant.test.ts test/lp6b-deferred-binding.test.ts` | 0 | 12.553 | 9 passed (9); 87 passed (87) |
| old-schema-repair | 70d6d6580a17 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-case-terms-upgrade.integration.test.ts test/recovery-pursuit-terms-upgrade.integration.test.ts test/job-import-v3-admission-upgrade.integration.test.ts test/job-import-v3-original-source-upgrade.integration.test.ts test/ch4-company-read.integration.test.ts test/migfix-8-upgrade.integration.test.ts test/commercial-integrity-v3-upgrade.integration.test.ts test/server-entitlement-upgrade.integration.test.ts test/contractor-retained-read.integration.test.ts` | 1 | 75.951 | 2 failed \| 7 passed (9); 14 passed \| 6 skipped (20) |
| boundary-repair | 70d6d6580a17 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/enterprise-dashboard.authority-race.integration.test.ts test/job-sources-authority.integration.test.ts test/job-work-state.integration.test.ts test/evidence-pack-v3-sources.integration.test.ts test/recovery-attribution-access.integration.test.ts test/receipt-line-allocation-facts-access.integration.test.ts test/commercial-integrity-v3.integration.test.ts test/scim-deactivation-access.integration.test.ts test/evidence-pack-v3-commands.integration.test.ts test/practice-worker-switch-upgrade.integration.test.ts` | 1 | 98.73 | 2 failed \| 8 passed (10); 3 failed \| 76 passed (79) |
| auth-serialization | 70d6d6580a17 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/auth.test.ts src/auth/credential-serialization.test.ts src/auth/context-boundary.test.ts` | 1 | 10.378 | 1 failed \| 2 passed (3); 1 failed \| 161 passed (162) |
| repair-fixtures-3 | 70d6d6580a17 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/commercial-integrity-v3-upgrade.integration.test.ts test/recovery-pursuit-terms-upgrade.integration.test.ts test/northside-demo.integration.test.ts test/contractor-full-demo-package.integration.test.ts test/evidence-pack-v3-commands.integration.test.ts test/lp6a-practice-restore.integration.test.ts test/serious-b5-upgrade.integration.test.ts test/recovery-eligibility-v3.integration.test.ts` | 1 | 549.41 | 1 failed \| 7 passed (8); 1 failed \| 62 passed (63) |
| db-types | 70d6d6580a17 | `pnpm --filter @jobguard/db typecheck` | 0 | 23.768 |  |
| review-expiry-regression | 9488d6be29c3 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-withtenant.test.ts src/tenant-context.test.ts test/lp6b-deferred-binding.test.ts` | 0 | 10.095 | 3 passed (3); 38 passed (38) |
| focused-final-guards | 9488d6be29c3 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/auth.test.ts src/auth/credential-serialization.test.ts src/auth/context-boundary.test.ts` | 0 | 13.045 | 3 passed (3); 162 passed (162) |
| northside-fixed | 9488d6be29c3 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/northside-demo.integration.test.ts` | 0 | 232.652 | 1 passed (1); 7 passed (7) |
| final-db-build | a7fa979aa557 | `pnpm --filter @jobguard/db build` | 0 | 20.139 |  |
| final-core-db-4 | a7fa979aa557 | `pnpm --filter @jobguard/db test --shard=4/4` | 1 | 1950.452 | 3 failed \| 178 passed (181); 3 failed \| 1649 passed (1652) |
| final-core-db-1 | a7fa979aa557 | `pnpm --filter @jobguard/db test --shard=1/4` | 1 | 2048.614 | 2 failed \| 180 passed (182); 3 failed \| 1655 passed \| 13 todo (1671) |
| final-core-db-3 | a7fa979aa557 | `pnpm --filter @jobguard/db test --shard=3/4` | 1 | 2621.927 | 3 failed \| 178 passed (181); 11 failed \| 1545 passed \| 14 skipped \| 4 todo (1574) |
| final-core-db-2 | a7fa979aa557 | `pnpm --filter @jobguard/db test --shard=2/4` | 1 | 2024.971 | 2 failed \| 180 passed (182); 2 failed \| 1380 passed (1382) |
| final-web | a7fa979aa557 | `pnpm --filter @jobguard/web test` | 0 | 136.81 | 116 passed (116); 1638 passed (1638) |
| final-api | a7fa979aa557 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1` | 1 | 1291.512 | 55 failed \| 382 passed (437); 558 failed \| 7265 passed (7823) |
| api-binding-mocks | 12c68e158225 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/practice-transports.test.ts src/proof/proof.application.test.ts src/recovery-message.application.test.ts src/recovery-follow-up.application.test.ts src/material.application.test.ts src/final-account-lock.application.test.ts src/recovery-case.controller.test.ts src/contractor/contractor-practice-session.application.test.ts src/recovery-case.application.test.ts` | 0 | 44.815 | 9 passed (9); 270 passed (270) |
| api-binding-mocks-2 | 12c68e158225 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/contractor/practice-worker-switch.application.test.ts src/final-check.application.test.ts src/value/value.application.test.ts src/proof/proof-adopted-original.test.ts src/variation/variation.application.test.ts src/final-account-lock.isolation.test.ts src/job-parties.application.test.ts` | 1 | 40.069 | 1 failed \| 6 passed (7); 11 failed \| 60 passed (71) |
| api-import-replay-mock | 12c68e158225 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/job-parties.application.test.ts -t 'returns the full public result'` | 0 | 9.297 | 1 passed (1); 1 passed \| 35 skipped (36) |
| api-mock-types | 3787b049ea24 | `pnpm --filter @jobguard/api typecheck` | 0 | 49.635 |  |
| core-timeout-recheck | fbeb41a1b2da | `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/enterprise-baseline.property.test.ts src/receipt-allocation.test.ts` | 0 | 7.386 | 2 passed (2); 98 passed (98) |
| public-refusal-api | fbeb41a1b2da | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/practice-binding-refusal.test.ts src/auth/auth.test.ts src/auth/context-boundary.test.ts` | 1 | 9.007 | 1 failed \| 2 passed (3); 7 failed \| 161 passed (168) |
| public-refusal-web | fbeb41a1b2da | `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1 app/lib/synthetic-server.test.ts` | 1 | 4.812 | 1 failed (1); no tests |
| own-step-fixtures | fbeb41a1b2da | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/migfix-1-upgrade.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/lp6b-withtenant.test.ts src/tenant-context.test.ts` | 0 | 24.526 | 4 passed (4); 55 passed (55) |
| last-db-build | fbeb41a1b2da | `pnpm --filter @jobguard/db build` | 0 | 12.772 |  |
| public-refusal-api-retry | fbeb41a1b2da | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/practice-binding-refusal.test.ts src/auth/auth.test.ts src/auth/context-boundary.test.ts` | 0 | 10.251 | 3 passed (3); 168 passed (168) |
| public-refusal-web-retry | fbeb41a1b2da | `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1 app/lib/synthetic-server.test.ts` | 0 | 5.522 | 1 passed (1); 8 passed (8) |
| latest-core-db-2 | 87330ae1bb0a | `pnpm --filter @jobguard/db test --shard=2/4` | 1 | 2079.767 | 2 failed \| 180 passed (182); 2 failed \| 1380 passed (1382) |
| latest-core-db-3 | 87330ae1bb0a | `pnpm --filter @jobguard/db test --shard=3/4` | 1 | 2833.637 | 2 failed \| 179 passed (181); 12 failed \| 1558 passed \| 4 todo (1574) |
| latest-core-db-4 | 87330ae1bb0a | `pnpm --filter @jobguard/db test --shard=4/4` | 1 | 1982.233 | 3 failed \| 178 passed (181); 3 failed \| 1649 passed (1652) |
| latest-core-db-1 | 87330ae1bb0a | `pnpm --filter @jobguard/db test --shard=1/4` | 1 | 2093.479 | 1 failed \| 181 passed (182); 1 failed \| 1657 passed \| 13 todo (1671); 2 errors |
| last-api-build | 87330ae1bb0a | `pnpm --filter @jobguard/api build` | 0 | 48.381 |  |
| latest-api | 87330ae1bb0a | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1` | 1 | 1382.739 | 26 failed \| 414 passed (440); 241 failed \| 7597 passed (7838) |
| latest-web | 87330ae1bb0a | `pnpm --filter @jobguard/web test` | 0 | 127.295 | 117 passed (117); 1646 passed (1646) |
| next-refusal-adapter-mocks | 87330ae1bb0a | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/recovery-follow-up.controller.test.ts src/recovery-message.controller.test.ts` | 0 | 28.647 | 2 passed (2); 33 passed (33) |
| scoped-practice-refusal | 87330ae1bb0a | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/practice-binding-refusal.test.ts src/watchdog-registry.test.ts` | 1 | 15.892 | 2 failed (2); 20 failed \| 114 passed (134) |
| scoped-api-build | 1d71d76414cf | `pnpm --filter @jobguard/api build` | 0 | 24.558 |  |
| dedicated-binding-filter | 1d71d76414cf | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/practice-binding-refusal.test.ts src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/auth.test.ts` | 1 | 23.922 | 1 failed \| 3 passed (4); 18 failed \| 277 passed (295) |
| binding-http-final | 1d71d76414cf | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/practice-binding-refusal.test.ts` | 0 | 6.166 | 1 passed (1); 9 passed (9) |
| final-build | ca05fd924062 | `pnpm build` | 0 | 71.437 |  |
| final-source-db-1 | ca05fd924062 | `pnpm --filter @jobguard/db test --shard=1/4` | 1 | 2081.575 | 2 failed \| 180 passed (182); 2 failed \| 1656 passed \| 13 todo (1671) |
| final-source-db-2 | ca05fd924062 | `pnpm --filter @jobguard/db test --shard=2/4` | 1 | 2012.328 | 2 failed \| 180 passed (182); 2 failed \| 1380 passed (1382); 1 error |
| final-source-web | ca05fd924062 | `pnpm --filter @jobguard/web test` | 0 | 122.118 | 117 passed (117); 1646 passed (1646) |
| final-source-db-4 | ca05fd924062 | `pnpm --filter @jobguard/db test --shard=4/4` | 1 | 1988.042 | 3 failed \| 178 passed (181); 3 failed \| 1649 passed (1652) |
| final-source-api | ca05fd924062 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1` | 1 | 1243.847 | 24 failed \| 416 passed (440); 233 failed \| 7609 passed (7842) |
| latest-browser-auth | ca05fd924062 | `CI=1 pnpm --filter @jobguard/web exec playwright test --config=/workspace/work/lp6b/playwright-system.config.ts DEMO-A1-scenarios.spec.ts M4-5-S.spec.ts SV-3.spec.ts SBOX-SESSION-1.spec.ts ENT-11a.spec.ts ENT-11b.spec.ts CH-8.spec.ts customer-signin.spec.ts` | 1 | 1751.201 |   19 failed;   3 skipped;   38 passed (29.1m) |
| final-source-db-3 | ca05fd924062 | `pnpm --filter @jobguard/db test --shard=3/4` | 1 | 2752.75 | 2 failed \| 179 passed (181); 11 failed \| 1559 passed \| 4 todo (1574) |
| final-typecheck | ca05fd924062 | `pnpm typecheck` | 0 | 202.278 |  |
| final-lint | ca05fd924062 | `pnpm lint` | 0 | 208.357 |  |
| final-tools | ca05fd924062 | `node --test tools/*.test.mjs` | 1 | 171.091 | tests 414; pass 410; fail 4; skipped 0; todo 0 |
| successor-definition-capture | ca05fd924062 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --config=/workspace/work/lp6b/capture-definitions.config.ts` | 0 | 31.44 | 1 passed (1); 1 passed (1) |
| low-load-db-races | 945c87977f0b | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-case-join.integration.test.ts test/enterprise-dashboard.authority-race.integration.test.ts` | 0 | 20.474 | 2 passed (2); 28 passed (28) |
| low-load-final-check-browser | 945c87977f0b | `CI=1 pnpm --filter @jobguard/web exec playwright test --config=/workspace/work/lp6b/playwright-system.config.ts M4-5-S.spec.ts ENT-11b.spec.ts` | 0 | 439.565 |    2 skipped;   16 passed (7.3m)  |
| s9-authorized-recheck | 945c87977f0b | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/extra-origin.integration.test.ts` | 0 | 12.259 | 1 passed (1); 32 passed (32) |
| security-one-api | b9472432db7c | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/practice-binding-refusal.test.ts src/auth/credential-serialization.test.ts` | 0 | 7.68 | 2 passed (2); 10 passed (10) |
| security-one-db | b9472432db7c | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-withtenant.test.ts src/tenant-context.test.ts` | 0 | 5.301 | 2 passed (2); 37 passed (37) |
| security-two-db | b9472432db7c | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-effective-actor-upgrade.integration.test.ts test/evidence-pack-v3-isolation.integration.test.ts` | 0 | 12.465 | 2 passed (2); 5 passed (5) |
| final-lane | b9472432db7c | `env LANE_BASE_REF=f78c8168449a08b3db6719a3388d9c23d325ac14 node tools/agent-lane-boundary-lint.mjs --lane=lp-6b-withtenant` | 0 | 0.153 |  |

## Final-run failure inventory

Titles below are copied from the last complete selected logs. Source and compiled duplicates are retained.
A suite/hook failure is shown separately from failed test counts. This is not a green-suite claim.

### final-source-db-1

Recorded HEAD `ca05fd9240627059cbbd19f4104fa5e8b690b96d`; exit `1`.

- test/extra-origin.integration.test.ts > ENT-4b origin persistence > [S9] scanner and seven pinned bridges stay byte-identical
- test/recovery-case-join.integration.test.ts > [J10] observed case lock contention: same-command

### final-source-db-2

Recorded HEAD `ca05fd9240627059cbbd19f4104fa5e8b690b96d`; exit `1`.

- test/commercial-integrity-v3-query-isolation.integration.test.ts > PostgreSQL zero/many hidden signal query log > concurrent family/source reads hold no writer locks while jobs and sessions change
- test/job-sources-authority.integration.test.ts > SV-7A source storage/read authority > SV7A-07 revoked session cannot read existing records
- Uncaught 57P01: terminating connection due to administrator command; attributed to test/enterprise-dashboard.authority-race.integration.test.ts (additional to the two failed tests).

### final-source-db-3

Recorded HEAD `ca05fd9240627059cbbd19f4104fa5e8b690b96d`; exit `1`.

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

### final-source-db-4

Recorded HEAD `ca05fd9240627059cbbd19f4104fa5e8b690b96d`; exit `1`.

- test/contractor-practice-session.integration.test.ts > [PH11] a holder can end their own session after membership revoke without additional permission
- test/money-trail-security.integration.test.ts > [MT-04/07/14] existing customer/allocator sources use one runtime snapshot, remain explicitly incomplete and write nothing
- test/plan-entitlement-lifecycle-upgrade.integration.test.ts > 0556 preserves all populated tables and routine ACLs, installs only the adapter body, and replays harmlessly

### s9-authorized-recheck

Recorded HEAD `945c87977f0b0d98aa0487b30645546fe43e2fa5`; exit `0`.

No failed test titles reported.

### final-source-api

Recorded HEAD `ca05fd9240627059cbbd19f4104fa5e8b690b96d`; exit `1`.

- src/evidence-pack-v3.application.test.ts > r1 snapshot transaction lifecycle (unit SQL doubles, not PostgreSQL proof) > preserves tenant setup and cleanup when work fails=false
- src/evidence-pack-v3.application.test.ts > r1 snapshot transaction lifecycle (unit SQL doubles, not PostgreSQL proof) > preserves tenant setup and cleanup when work fails=true
- dist/evidence-pack-v3.application.test.js > r1 snapshot transaction lifecycle (unit SQL doubles, not PostgreSQL proof) > preserves tenant setup and cleanup when work fails=false
- dist/evidence-pack-v3.application.test.js > r1 snapshot transaction lifecycle (unit SQL doubles, not PostgreSQL proof) > preserves tenant setup and cleanup when work fails=true
- src/evidence-pack-v3.application.test.ts > snapshot mode precedes tenant/source queries and releases its client (failure=false)
- src/evidence-pack-v3.application.test.ts > snapshot mode precedes tenant/source queries and releases its client (failure=true)
- dist/evidence-pack-v3.application.test.js > snapshot mode precedes tenant/source queries and releases its client (failure=false)
- dist/evidence-pack-v3.application.test.js > snapshot mode precedes tenant/source queries and releases its client (failure=true)
- src/job-parties.application.test.ts > CH-3a application boundary > rejects an address line containing CR/LF with INVALID_PARTIES before persistence: "Second\nThird"
- src/job-parties.application.test.ts > CH-3a application boundary > rejects an address line containing CR/LF with INVALID_PARTIES before persistence: "Second\rThird"
- src/job-parties.application.test.ts > CH-3a application boundary > rejects an address line containing CR/LF with INVALID_PARTIES before persistence: "Second\r\nThird"
- src/job-parties.application.test.ts > CH-3a application boundary > rejects unauthenticated, non-member and production callers before business persistence
- src/job-parties.application.test.ts > CH-3a per-session ownership > application view: stranger session refuses before party reads, validation, replay or writes
- src/job-parties.application.test.ts > CH-3a per-session ownership > application command: stranger session refuses before party reads, validation, replay or writes
- src/job-parties.application.test.ts > CH-3a per-session ownership > application adopt: stranger session refuses before party reads, validation, replay or writes
- src/job-parties.application.test.ts > CH-3a per-session ownership > Nest view: stranger session refuses before party reads, validation, replay or writes
- src/job-parties.application.test.ts > CH-3a per-session ownership > Nest command: stranger session refuses before party reads, validation, replay or writes
- src/job-parties.application.test.ts > CH-3a per-session ownership > Nest adopt: stranger session refuses before party reads, validation, replay or writes
- dist/job-parties.application.test.js > CH-3a per-session ownership > application view: stranger session refuses before party reads, validation, replay or writes
- dist/job-parties.application.test.js > CH-3a per-session ownership > application command: stranger session refuses before party reads, validation, replay or writes
- dist/job-parties.application.test.js > CH-3a per-session ownership > application adopt: stranger session refuses before party reads, validation, replay or writes
- dist/job-parties.application.test.js > CH-3a per-session ownership > Nest view: stranger session refuses before party reads, validation, replay or writes
- dist/job-parties.application.test.js > CH-3a per-session ownership > Nest command: stranger session refuses before party reads, validation, replay or writes
- dist/job-parties.application.test.js > CH-3a per-session ownership > Nest adopt: stranger session refuses before party reads, validation, replay or writes
- src/practice-session.test.ts > 'CaptureApplication.view' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CaptureApplication.save' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CaptureApplication.confirm' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CommercialIntegrityApplication.view' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CommercialIntegrityApplication.review' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CustomerInvoiceApplication.get' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CustomerInvoiceApplication.issue' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CustomerInvoiceApplication.pdf' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CustomerInvoiceApplication.creditView' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CustomerInvoiceApplication.previewCre…' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CustomerInvoiceApplication.issueCredit' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CustomerInvoiceApplication.receiptView' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CustomerInvoiceApplication.recordRece…' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'CustomerInvoiceApplication.reverseRec…' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'DecisionsApplication.list' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'DecisionsApplication.evaluate' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'DecisionsApplication.dismiss' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'EvidencePackApplication.list' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'EvidencePackApplication.generate' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'EvidencePackApplication.approveAttach…' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'EvidencePackApplication.inspect' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'EvidencePackApplication.download' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'FinalAccountApplication.get' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'FinalAccountApplication.build' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'InboxRelevanceApplication.view' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'InboxRelevanceApplication.seed' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'InboxRelevanceApplication.budget' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'InboxRelevanceApplication.dismiss' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'MaterialApplication.addRequirement' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'MaterialApplication.view' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'ProofApplication.get' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'ProofApplication.command' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'PurchaseOrderApplication.view' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'PurchaseOrderApplication.revise' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'PurchaseOrderApplication.place' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.get' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.save' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.preview' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.issue' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.deliveryView' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.execute' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.pdf' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.acceptanceView' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.accept' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.disposition' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.activationView' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'QuoteApplication.activate' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'ReadinessApplication.view' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'ReadinessApplication.record' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'ReadinessApplication.advance' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'RecoveryCaseApplication.list' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'RecoveryCaseApplication.command' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'RecoveryCaseApplication.eligibility' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'SupplierDocumentApplication.view' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'SupplierDocumentApplication.intake' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'SupplierDocumentApplication.receipt' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'SupplierDocumentApplication.confirm' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'SupplierMatchApplication.view' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'SupplierMatchApplication.create' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'SupplierMatchApplication.correct' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'ThingsToCheckApplication.view' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'ThingsToCheckApplication.evaluate' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'ThingsToCheckApplication.review' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'ThingsToCheckApplication.supersede' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'ValueApplication.read' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'VariationApplication.get' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'VariationApplication.command' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'FeeIllustrationApplication.read' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'FeeIllustrationApplication.create' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'RecoveryApplication.read' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'RecoveryApplication.select' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > 'RecoveryApplication.approve' refuses missing, invented and stranger sessions before business access
- src/practice-session.test.ts > material calls install only the authenticated digest inside each repository transaction
- dist/practice-session.test.js > material calls install only the authenticated digest inside each repository transaction
- src/shadow-isolation.application.test.ts > SV-3 Test Q: signed-in builder HTTP surfaces > replays every OpenAPI builder GET and Next job GET with byte-identical status, headers and body (named limit: retrievedAt and its etag on the two prevention-checks GETs, asserted separately)
- src/shadow-isolation.application.test.ts > SV-3 Test Q: signed-in builder HTTP surfaces > successful Log an extra, retries, mutation errors and current builder counts/inbox responses ignore held signals
- dist/shadow-isolation.application.test.js > SV-3 Test Q: signed-in builder HTTP surfaces > successful Log an extra, retries, mutation errors and current builder counts/inbox responses ignore held signals
- src/shadow-isolation.application.test.ts > Test Q: successful mutations, exports, delivery/retry telemetry and every mutation error surface are identical
- dist/shadow-isolation.application.test.js > Test Q: successful mutations, exports, delivery/retry telemetry and every mutation error surface are identical
- src/watchdog-registry.test.ts > round 12: 'proof' 'get' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'proof' 'command' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'purchase-orders/revisions' 'revise' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'purchase-orders/placement' 'place' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'supplier-documents/intake' 'intake' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'supplier-documents/receipts' 'receipt' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'supplier-documents/facts/confirm' 'confirm' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'supplier-matches' 'view' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'supplier-matches' 'create' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'supplier-matches/corrections' 'correct' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'things-to-check/[action]' 'evaluate' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'things-to-check/[action]' 'review' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'things-to-check/[action]' 'supersede' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'readiness/[action]' 'record' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'readiness/[action]' 'advance' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'relevance-inbox/[action]' 'seed' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'relevance-inbox/[action]' 'budget' maps stranger and missing sessions to 404/401 in Nest and Next
- src/watchdog-registry.test.ts > round 12: 'relevance-inbox/decisions/[decisionId]' 'dismiss' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'proof' 'get' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'proof' 'command' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'purchase-orders/revisions' 'revise' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'purchase-orders/placement' 'place' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'supplier-documents/intake' 'intake' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'supplier-documents/receipts' 'receipt' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'supplier-documents/facts/confirm' 'confirm' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'supplier-matches' 'view' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'supplier-matches' 'create' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'supplier-matches/corrections' 'correct' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'things-to-check/[action]' 'evaluate' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'things-to-check/[action]' 'review' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'things-to-check/[action]' 'supersede' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'readiness/[action]' 'record' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'readiness/[action]' 'advance' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'relevance-inbox/[action]' 'seed' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'relevance-inbox/[action]' 'budget' maps stranger and missing sessions to 404/401 in Nest and Next
- dist/watchdog-registry.test.js > round 12: 'relevance-inbox/decisions/[decisionId]' 'dismiss' maps stranger and missing sessions to 404/401 in Nest and Next
- src/contractor/enterprise-dashboard.boundaries.test.ts > [E9-27 E9-34] advisory/read modules import only pure readers and the tenant/session boundary; no writer, provider, outbox or privileged client
- dist/contractor/enterprise-dashboard.boundaries.test.js > [E9-27 E9-34] advisory/read modules import only pure readers and the tenant/session boundary; no writer, provider, outbox or privileged client
- src/contractor/site-extra.application.test.ts > ENT-3a service and Nest boundary > [A17] a persisted session with revoked membership reaches the shared bridge but is refused with 403
- src/contractor/site-extra.application.test.ts > ENT-3a service and Nest boundary > [A17] a persisted session with expired membership reaches the shared bridge but is refused with 403
- dist/contractor/site-extra.application.test.js > ENT-3a service and Nest boundary > [A17] a persisted session with revoked membership reaches the shared bridge but is refused with 403
- dist/contractor/site-extra.application.test.js > ENT-3a service and Nest boundary > [A17] a persisted session with expired membership reaches the shared bridge but is refused with 403
- dist/commercial-integrity-v3.boundary.test.js > builder boundary has no hidden reads, money/meter/command/provider consumer or evaluator
- dist/extra-escalation-task.test.js > ENT-5 synthetic escalation scheduling > registers both tasks and only schedules discovery in synthetic practice
- dist/final-check.isolation.test.js > SV5-24 own builder application and controller contain no detector or shadow query
- dist/job-parties.application.test.js > CH-3a application boundary > rejects an address line containing CR/LF with INVALID_PARTIES before persistence: "Second\nThird"
- dist/job-parties.application.test.js > CH-3a application boundary > rejects an address line containing CR/LF with INVALID_PARTIES before persistence: "Second\rThird"
- dist/job-parties.application.test.js > CH-3a application boundary > rejects an address line containing CR/LF with INVALID_PARTIES before persistence: "Second\r\nThird"
- dist/job-parties.application.test.js > CH-3a application boundary > rejects unauthenticated, non-member and production callers before business persistence
- dist/practice-session.test.js > 'CaptureApplication.view' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CaptureApplication.save' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CaptureApplication.confirm' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CommercialIntegrityApplication.view' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CommercialIntegrityApplication.review' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CustomerInvoiceApplication.get' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CustomerInvoiceApplication.issue' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CustomerInvoiceApplication.pdf' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CustomerInvoiceApplication.creditView' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CustomerInvoiceApplication.previewCre…' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CustomerInvoiceApplication.issueCredit' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CustomerInvoiceApplication.receiptView' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CustomerInvoiceApplication.recordRece…' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'CustomerInvoiceApplication.reverseRec…' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'DecisionsApplication.list' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'DecisionsApplication.evaluate' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'DecisionsApplication.dismiss' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'EvidencePackApplication.list' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'EvidencePackApplication.generate' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'EvidencePackApplication.approveAttach…' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'EvidencePackApplication.inspect' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'EvidencePackApplication.download' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'FinalAccountApplication.get' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'FinalAccountApplication.build' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'InboxRelevanceApplication.view' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'InboxRelevanceApplication.seed' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'InboxRelevanceApplication.budget' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'InboxRelevanceApplication.dismiss' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'MaterialApplication.addRequirement' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'MaterialApplication.view' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'ProofApplication.get' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'ProofApplication.command' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'PurchaseOrderApplication.view' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'PurchaseOrderApplication.revise' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'PurchaseOrderApplication.place' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.get' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.save' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.preview' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.issue' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.deliveryView' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.execute' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.pdf' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.acceptanceView' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.accept' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.disposition' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.activationView' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'QuoteApplication.activate' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'ReadinessApplication.view' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'ReadinessApplication.record' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'ReadinessApplication.advance' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'RecoveryCaseApplication.list' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'RecoveryCaseApplication.command' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'RecoveryCaseApplication.eligibility' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'SupplierDocumentApplication.view' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'SupplierDocumentApplication.intake' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'SupplierDocumentApplication.receipt' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'SupplierDocumentApplication.confirm' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'SupplierMatchApplication.view' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'SupplierMatchApplication.create' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'SupplierMatchApplication.correct' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'ThingsToCheckApplication.view' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'ThingsToCheckApplication.evaluate' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'ThingsToCheckApplication.review' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'ThingsToCheckApplication.supersede' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'ValueApplication.read' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'VariationApplication.get' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'VariationApplication.command' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'FeeIllustrationApplication.read' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'FeeIllustrationApplication.create' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'RecoveryApplication.read' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'RecoveryApplication.select' refuses missing, invented and stranger sessions before business access
- dist/practice-session.test.js > 'RecoveryApplication.approve' refuses missing, invented and stranger sessions before business access
- dist/shadow-isolation.application.test.js > SV-3 Test Q: signed-in builder HTTP surfaces > replays every OpenAPI builder GET and Next job GET with byte-identical status, headers and body (named limit: retrievedAt and its etag on the two prevention-checks GETs, asserted separately)
- dist/subscription-boundaries.test.js > MON-2A held-route contracts > M2A-30 M2A-34 this module exposes schemas only, with no route or context constructor
- dist/sv5pre-worker-registration.test.js > SV5PRE final-check registration > PRE-Q6-02 registration preserves the sole queued constructor
- dist/audit-export/audit-export.context.test.js > audit-export shared context boundary tests > [X4] removes the hand-made adapter and calls the shared bridge once in the typed method
- dist/auth/auth.test.js > principal to tenant bridge > keeps the db context constructor call confined to the principal bridge
- dist/auth/identity.test.js > M0-6L route, cookie and server composition boundaries > registers the Nest guard and refuses synthetic cookies in every other mode
- dist/auth/identity.test.js > M0-6L route, cookie and server composition boundaries > confines real identity context construction to the authenticated principal bridge
- dist/contractor/work-order.application.test.js > ENT-2 transport (adapter tests, not PostgreSQL proof) > exposes the scheduling projections for GET only: no scheduling write route exists at the transport
- dist/auth/sso/action-paths.test.js > Round 1 / shared Nest and Next factory composition > both server compositions use the binding-aware persisted provider even before the SSO service is constructed

### final-source-web

Recorded HEAD `ca05fd9240627059cbbd19f4104fa5e8b690b96d`; exit `0`.

No failed test titles reported.

### final-tools

Recorded HEAD `ca05fd9240627059cbbd19f4104fa5e8b690b96d`; exit `1`.

- CI-B01 exact integrated source has zero violations, unbaselined edges and stale entries
- CLI exits zero for repository and exit status agrees with API
- r1 real-source baseline has exactly one entry per remaining site
- CSG-01 installed repository has real origins and nonempty nested authority roots, and must have zero confirmed, unbaselined or stale diagnostics for PASS

### browser-system-retry

Recorded HEAD `2fbb0f52ab30388189806e7ab8a9aa2c6808a636`; exit `1`.

- [mobile-360] › e2e/DEMO-A1-scenarios.spec.ts:108:5 › DEMO-S disclosure before lock: real detection and support disclosure remain ineligible after lock
- [mobile-360] › e2e/SV-3.spec.ts:35:5 › SV-3-BARRIER-1: departure waits for the outstanding drain
- [mobile-360] › e2e/SV-3.spec.ts:43:5 › SV-3-BARRIER-2: the departure boundary clears timers and blocks late registrations
- [mobile-360] › e2e/SV-3.spec.ts:53:5 › SV-3-BARRIER-3: each destination starts a fresh interval registry
- [mobile-360] › e2e/SV-3.spec.ts:60:5 › SV-3-BARRIER-4: drain failures retain the original route and error
- [desktop] › e2e/DEMO-A1-scenarios.spec.ts:108:5 › DEMO-S disclosure before lock: real detection and support disclosure remain ineligible after lock
- [desktop] › e2e/M4-5-S.spec.ts:82:5 › previews, approves and simulates one factual customer message that is delivered exactly once
- [desktop] › e2e/M4-5-S.spec.ts:180:5 › uses supplier wording and recipient, shows an unknown outcome as unknown, and checks rather than resends
- [desktop] › e2e/M4-5-S.spec.ts:268:5 › revocation and changed evidence both block execution and nothing is sent
- [desktop] › e2e/M4-5-S.spec.ts:316:5 › two browser contexts approving the same revision yield one approval and a typed stale conflict
- [desktop] › e2e/M4-5-S.spec.ts:343:5 › an interrupted claim becomes uncertain after its lease and can be checked without resending
- [desktop] › e2e/SV-3.spec.ts:35:5 › SV-3-BARRIER-1: departure waits for the outstanding drain
- [desktop] › e2e/SV-3.spec.ts:43:5 › SV-3-BARRIER-2: the departure boundary clears timers and blocks late registrations
- [desktop] › e2e/SV-3.spec.ts:53:5 › SV-3-BARRIER-3: each destination starts a fresh interval registry
- [desktop] › e2e/SV-3.spec.ts:60:5 › SV-3-BARRIER-4: drain failures retain the original route and error

### latest-browser-auth

Recorded HEAD `ca05fd9240627059cbbd19f4104fa5e8b690b96d`; exit `1`.

- [mobile-360] › e2e/DEMO-A1-scenarios.spec.ts:108:5 › DEMO-S disclosure before lock: real detection and support disclosure remain ineligible after lock
- [mobile-360] › e2e/M4-5-S.spec.ts:82:5 › previews, approves and simulates one factual customer message that is delivered exactly once
- [mobile-360] › e2e/M4-5-S.spec.ts:180:5 › uses supplier wording and recipient, shows an unknown outcome as unknown, and checks rather than resends
- [mobile-360] › e2e/M4-5-S.spec.ts:268:5 › revocation and changed evidence both block execution and nothing is sent
- [mobile-360] › e2e/M4-5-S.spec.ts:343:5 › an interrupted claim becomes uncertain after its lease and can be checked without resending
- [mobile-360] › e2e/SV-3.spec.ts:35:5 › SV-3-BARRIER-1: departure waits for the outstanding drain
- [mobile-360] › e2e/SV-3.spec.ts:43:5 › SV-3-BARRIER-2: the departure boundary clears timers and blocks late registrations
- [mobile-360] › e2e/SV-3.spec.ts:53:5 › SV-3-BARRIER-3: each destination starts a fresh interval registry
- [mobile-360] › e2e/SV-3.spec.ts:60:5 › SV-3-BARRIER-4: drain failures retain the original route and error
- [desktop] › e2e/DEMO-A1-scenarios.spec.ts:108:5 › DEMO-S disclosure before lock: real detection and support disclosure remain ineligible after lock
- [desktop] › e2e/ENT-11b.spec.ts:20:38 › ENT-11b full Northside through billing, statement and dashboard at 360px under ten minutes
- [desktop] › e2e/M4-5-S.spec.ts:82:5 › previews, approves and simulates one factual customer message that is delivered exactly once
- [desktop] › e2e/M4-5-S.spec.ts:180:5 › uses supplier wording and recipient, shows an unknown outcome as unknown, and checks rather than resends
- [desktop] › e2e/M4-5-S.spec.ts:268:5 › revocation and changed evidence both block execution and nothing is sent
- [desktop] › e2e/M4-5-S.spec.ts:343:5 › an interrupted claim becomes uncertain after its lease and can be checked without resending
- [desktop] › e2e/SV-3.spec.ts:35:5 › SV-3-BARRIER-1: departure waits for the outstanding drain
- [desktop] › e2e/SV-3.spec.ts:43:5 › SV-3-BARRIER-2: the departure boundary clears timers and blocks late registrations
- [desktop] › e2e/SV-3.spec.ts:53:5 › SV-3-BARRIER-3: each destination starts a fresh interval registry
- [desktop] › e2e/SV-3.spec.ts:60:5 › SV-3-BARRIER-4: drain failures retain the original route and error

### low-load-final-check-browser

Recorded HEAD `945c87977f0b0d98aa0487b30645546fe43e2fa5`; exit `0`.

No failed test titles reported.
