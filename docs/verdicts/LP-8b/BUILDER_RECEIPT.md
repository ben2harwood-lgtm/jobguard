# LP-8b builder receipt — 4 November 2026

RED — permissions, money dependencies and evidence. NOPR. **READY for branch save; held for landing.** This records source inspection and local checks, not acceptance.

## Base and scope

The router completed the predecessor merge at 353a0ad89fc642d6a14c65c96f35ab22a2de0dc3. LP-8a's branch tip is 2fd5439bdf80bb1669d1872fcbabd52b360ce7a0. Git status was clean on entry, with no unmerged index stages. LP-6b, LP-6c, LP-6d, LP-6e, LP-7 and LP-8a implementations are present. The former missing-predecessor and unfinished-merge holds are closed locally; this does not claim those branches have landed on main.

LP-8a retains its latest advance_final_account_draft body (0795), extending LP-6d's binding preamble. LP-8b does not recreate that routine, audit sealing, member administration or any other predecessor routine. The actual LP-6b session-bearing withTenant path replaces LP-8b's temporary pool proxy in integration fixtures. No caller binding work is left to an absent predecessor.

The lane contains exactly the eight non-lane paths changed relative to LP-8a. No scanner, source pin or guard was changed; no old/new protected value is requested. Reserved migration 0800 and its existing source-derived proof are retained, ordered after LP-8a 0795. No Git writes, fetch, package download, database startup, localhost binding, real data, live provider, CI or PR action occurred.

## Built and retained

Migration 0800 checks authorized outbox insertion against the bound actor/tenant and exact immutable approval fields, hashes the actual content, rejects revoked/expired authority, requires pending/unclaimed/uncompleted initial state and enforces one action per authorization. Runtime INSERT is revoked; approved content cannot change on UPDATE.

Owner-only evidence invalidation; extra event/duplicate/order input checks retain 0122 protections and use the latest inherited scoped permission helper. Prevention rows carry an explicit actor, backfilled from immutable receipts and checked against the bound owner for new writes. Initial final-account pointer/proof, supplier order/receipt allocation and synthetic original guards are retained. M4-8-S allocation grants stay closed.

Evidence checks preserve scoped object keys, immutable versions, hashes, measured byte lengths and server metadata. Storage orchestration checks key/version/actual bytes before SQL. Raw runtime SQL still cannot assert that an external storage read occurred. No grant is added to bypass that boundary.

Integration fixtures now use genuine session references rather than a pool wrapper or queued-job context. Added unbound forged-GUC refusals, wrong actor/tenant calls to the extra-command helper and an overload-count assertion covering all three LP-8b entry points. Existing outbox field attacks and positive assertions remain. The expected upload identity-mutation error is corrected to the guard's specific 55000; the refusal assertion remains mandatory.

## Named holds for landing

1. **External-original verification remains incomplete.** app.verify_evidence_upload(uuid,uuid,text,text,bytea) remains unavailable to runtime, identity and infrastructure. No predecessor supplied a separately authenticated verifier binding actual scoped exact-object storage reads. EvidenceService.finalize's positive database path therefore remains expected to fail with permission denied; that assertion is retained. Resolve the trusted verifier path before claiming this piece complete. Do not grant raw runtime SQL storage authority.
2. **PostgreSQL acceptance and compatibility proof.** CI must execute LP-8b's six integration tests, plus predecessor binding, audit, member-removal and billing suites. Prove forged/positive checked paths, all surviving signatures, scoped references, owner invalidation, prevention attribution, final pointers, supplier allocations, populated actor/length backfills, existing multiple-action approvals versus the unique index, preserved M4-8-S SELECT-only grants and rollback. Run full database/migration/catalogue/upgrade checks; source proof parsing is not catalogue evidence. Routine hashes in the retained proof are null and need real comparison.
3. **Landing gates.** CI must prove pinned install, typecheck/lint/test/build and affected browser journeys after router push. Exact-head independent RED review remains required. NOPR means these gates were not requested here. Migration 0800 remains reserved; router must reconcile the eventual contiguous landing order without silently renumbering this draft.
4. **Downstream worker boundary.** LP-10 still owns worker credential/binding/claim/completion privilege closure. Remaining runtime UPDATE powers are not claimed closed by LP-8b. This is an explicit downstream scope boundary, not an absent-predecessor hold.

## Local evidence for this refresh

- Existing node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit: passed.
- From packages/db, ./node_modules/.bin/vitest run --maxWorkers=1 test/lp8b-storage.test.ts test/migration-proof-loader.test.ts: 84 passed across two files. Fake storage/SQL orchestration and strict proof-loader checks only.
- From packages/db, ./node_modules/.bin/vitest run --maxWorkers=1 src/tenant-context.test.ts: 21 passed. Includes the inherited session-bearing binding boundary.
- From packages/db, ./node_modules/.bin/vitest list --maxWorkers=1 test/lp8b-outbox-evidence.integration.test.ts: successfully collected all six tests through the actual runner; no hooks or database tests executed. A preliminary TypeScript transpile caught a new fixture cast syntax error; corrected, then syntax and runner collection passed.
- LANE_BASE_REF=origin/codex/sandbox/lp-8a-billing-revokes node tools/agent-lane-boundary-lint.mjs --lane=lp-8b-outbox-evidence: passed against 2fd5439b.
- git diff --check: passed. All local test runs used one worker and at most two named files.

LATER / SIMPLICITY (retained from initial self-check): packages/db/src/outbox.ts: appendOutboundAction remains a dense one-line function. A later formatting-only change could split parse/hash/checked-query statements for easier security review; deferred to keep this refresh focused.
