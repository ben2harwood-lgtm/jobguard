# LP-8b builder receipt — 6 November 2026, repair round 1

RED — permissions, money dependencies and evidence. NOPR. **READY for branch save; held for landing.** This records source inspection and local checks, not acceptance.

## Base and scope

The router completed the predecessor merge at 353a0ad89fc642d6a14c65c96f35ab22a2de0dc3. LP-8a's branch tip is 2fd5439bdf80bb1669d1872fcbabd52b360ce7a0. Git status was clean on entry, with no unmerged index stages. LP-6b, LP-6c, LP-6d, LP-6e, LP-7 and LP-8a implementations are present. The former missing-predecessor and unfinished-merge holds are closed locally; this does not claim those branches have landed on main.

LP-8a retains its latest advance_final_account_draft body (0795), extending LP-6d's binding preamble. LP-8b does not recreate that routine, audit sealing, member administration or any other predecessor routine. The actual LP-6b session-bearing withTenant path replaces LP-8b's temporary pool proxy in integration fixtures. No caller binding work is left to an absent predecessor.

The lane contains exactly the eight non-lane paths changed relative to LP-8a. No scanner, source pin or guard was changed; no old/new protected value is requested. Reserved migration 0800 and its existing source-derived proof are retained, ordered after LP-8a 0795. No Git writes, fetch, package download, database startup, localhost binding, real data, live provider, CI or PR action occurred.

## Built and retained

Migration 0800 checks authorized outbox insertion against the bound actor/tenant and exact immutable approval fields, hashes the actual content, rejects revoked/expired authority, requires pending/unclaimed/uncompleted initial state and enforces one action per authorization. Runtime INSERT is revoked; approved content cannot change on UPDATE.

Owner-only evidence invalidation; extra event/duplicate/order input checks retain 0122 protections and use the latest inherited scoped permission helper. Prevention rows carry an explicit actor, backfilled from immutable receipts and checked against the bound owner for new writes. Initial final-account pointer/proof, supplier order/receipt allocation and synthetic original guards are retained. M4-8-S allocation grants stay closed.

Evidence checks preserve scoped object keys, immutable versions, hashes, measured byte lengths and server metadata. Storage orchestration checks key/version/actual bytes before SQL. Raw runtime SQL still cannot assert that an external storage read occurred. The round-1 checked runtime grant below preserves that adapter trust boundary; SQL verifies the supplied bytes and metadata, not the occurrence of an external read.

Integration fixtures now use genuine session references rather than a pool wrapper or queued-job context. Added unbound forged-GUC refusals, wrong actor/tenant calls to the extra-command helper and an overload-count assertion covering all three LP-8b entry points. Existing outbox field attacks and positive assertions remain. The expected upload identity-mutation error is corrected to the guard's specific 55000; the refusal assertion remains mandatory.

## Named holds for landing

1. **External-original verification: source repair applied; PostgreSQL proof pending.** The first independent pre-check at 2ae799a63 found the runtime EXECUTE refusal broke EvidenceService.finalize. Following its exact recommended path, 0800 now grants only jobguard_runtime EXECUTE on app.verify_evidence_upload(uuid,uuid,text,text,bytea). The routine obtains app.current_actor() before reading the upload and requires active, unexpired, unrevoked membership in the upload job's tenant, including contractor revocation checks. Tenant binding, immutable key/version/type/size/hash checks and direct-write refusals remain. Identity, infrastructure and PUBLIC remain excluded. The adapter remains responsible for reading the exact external object; SQL cannot independently prove a remote read. The former expectation of a broken positive path is withdrawn. CI must execute both evidence.integration and lp8b-outbox-evidence.integration before this hold closes.
2. **PostgreSQL acceptance and compatibility proof.** CI must execute LP-8b's seven integration tests, plus predecessor binding, audit, member-removal and billing suites. Prove forged/positive checked paths, all surviving signatures, scoped references, owner invalidation, prevention attribution, final pointers, supplier allocations, populated actor/length backfills, existing multiple-action approvals versus the unique index, preserved M4-8-S SELECT-only grants and rollback. Run full database/migration/catalogue/upgrade checks; source proof parsing is not catalogue evidence. Routine hashes in the retained proof are null and need real comparison.
3. **Landing gates.** CI must prove pinned install, typecheck/lint/test/build and affected browser journeys after router push. Exact-head independent RED review remains required. NOPR means these gates were not requested here. Migration 0800 remains reserved; router must reconcile the eventual contiguous landing order without silently renumbering this draft.
4. **Downstream worker boundary.** LP-10 still owns worker credential/binding/claim/completion privilege closure. Remaining runtime UPDATE powers are not claimed closed by LP-8b. This is an explicit downstream scope boundary, not an absent-predecessor hold.

## Earlier local evidence (4 November, before this repair)

- Existing node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit: passed.
- From packages/db, ./node_modules/.bin/vitest run --maxWorkers=1 test/lp8b-storage.test.ts test/migration-proof-loader.test.ts: 84 passed across two files. Fake storage/SQL orchestration and strict proof-loader checks only.
- From packages/db, ./node_modules/.bin/vitest run --maxWorkers=1 src/tenant-context.test.ts: 21 passed. Includes the inherited session-bearing binding boundary.
- From packages/db, ./node_modules/.bin/vitest list --maxWorkers=1 test/lp8b-outbox-evidence.integration.test.ts: successfully collected all six tests through the actual runner; no hooks or database tests executed. A preliminary TypeScript transpile caught a new fixture cast syntax error; corrected, then syntax and runner collection passed.
- LANE_BASE_REF=origin/codex/sandbox/lp-8a-billing-revokes node tools/agent-lane-boundary-lint.mjs --lane=lp-8b-outbox-evidence: passed against 2fd5439b.
- git diff --check: passed. All local test runs used one worker and at most two named files.

LATER / SIMPLICITY (retained from initial self-check): packages/db/src/outbox.ts: appendOutboundAction remains a dense one-line function. A later formatting-only change could split parse/hash/checked-query statements for easier security review; deferred to keep this refresh focused.

## Repair round 1 — 6 November 2026

Scope is the single blocking finding in ~/.local/share/full-steam/coordinator/prechecks/lp-8b-outbox-evidence.md. Only migration 0800, its proof, the existing integration test, this receipt and the lane note change in this round. No other migration, scanner, source pin, skip or opt-out changes. No extra grant beyond the named routine's EXECUTE to jobguard_runtime.

The former bound correct-byte refusal contradicted the approved fix; its refusal assertion remains with a wrong tenant, and the new regression also refuses the identical correct-byte request without a binding despite forged tenant/actor settings. Existing direct verification/identity mutation/reference/invalidation/outbox refusals remain. The new regression asserts successful SQL verification and measured byte length for a bound active member; rejects wrong upload/version/type/bytes, empty or oversized bytes and cross-tenant callers; and checks revoked/expired membership after successful request binding. The existing service.finalize positive path remains mandatory. Catalogue assertions now require runtime EXECUTE on the three existing checked entries and preserve identity/infrastructure denials. Proof rows are sorted by section and identity, with only the verifier's grant/reachability/calls/ACL expectations changed; there are no policy rows in this proof (any policy roles must use the string "{jobguard_runtime}"). Null routine hashes remain unproved, as above.

No new abstraction or substantial complexity was introduced. The existing initial-review LATER / SIMPLICITY note stands. This repair is source-inspected and locally checked only; the first independent check failed and a new exact-head independent RED review is still required after router commit.

### Local checks for repair round 1

- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`: PASS. This is also the database package's lint/typecheck implementation.
- From packages/db, `./node_modules/.bin/vitest run --maxWorkers=1 test/lp8b-storage.test.ts test/migration-proof-loader.test.ts src/tenant-context.test.ts`: PASS, 105 tests in three files. Fake storage orchestration, strict proof loading and inherited request-binding unit coverage; not PostgreSQL evidence.
- `LANE_BASE_REF=origin/codex/sandbox/lp-8a-billing-revokes node tools/lint.mjs`: PASS (purity, lane, money, commercial, AI-provider and PL/pgSQL checks). Existing computed-import notices are informational.
- From packages/db, `./node_modules/.bin/vitest list --maxWorkers=1 test/lp8b-outbox-evidence.integration.test.ts test/evidence.integration.test.ts`: PASS, 7 + 16 tests collected, including the new regression. No database hooks or assertions executed.
- `git diff --check`: PASS. Lane allow-list independently compared with the complete non-lane diff from LP-8a; exactly eight paths, and no self-entry.

CI after router push must run the two named integration suites on real PostgreSQL, full database/catalogue/migration/upgrade checks and the predecessor compatibility cases in hold 2, then the required pinned-install/typecheck/lint/test/build and affected browser journeys in hold 3. No PostgreSQL server, browser, localhost binding, package download or Git write was attempted here. No proof of CI, merge, deployment or independent approval is claimed.

**READY** for router commit and NOPR branch save on codex/sandbox/lp-8b-outbox-evidence only; serial LP landing and exact-head RED review gates remain.
