# LP-8b builder receipt — 4 November 2026

RED — permissions, money dependencies and evidence. NOPR. **READY for branch save only; held for landing.** Router ruling, 4 November 2026: preserve this built-ahead draft while predecessors land. This is not completion or acceptance.

## Base and scope

Working content was reconciled against origin/codex/sandbox/lp-6c-money-routines at cebbbe2a86c0cb1203b80238419aa771ec8f0c6e. That ref contains the locally available origin/main f78c8168449a08b3db6719a3388d9c23d325ac14. No fetch, Git mutation, provider call, real data, database startup, browser run or PR was performed. The evidence.ts content conflict is resolved as a union: the predecessor's synthetic WAV handling survives along with LP-8b's key/version/length checks. The read-only Git index still records the conflict; only the router can stage/finalize it.

LP-6d, LP-6e, LP-7 and LP-8a sibling implementations are absent. Assumptions: LP-6d binds remaining routine actors, LP-6e owns audit attribution, LP-7 owns identity-side removal/demotion and queued-work disposition, and LP-8a closes customer billing writes and advance_final_account_draft. None of those routine bodies was recreated. LP-10 owns the separate worker login and claim/completion privileges; this draft does not pretend those remaining runtime UPDATE grants are closed. LP-6b's separately repaired foundation and LP-6c must land before this piece.

## Built and retained

Migration 0800 replaces this branch's unlanded 0530 draft. Checked outbox insertion binds current actor/tenant and exact immutable approval fields, hashes actual content, rejects revoked/expired authority, requires pending/unclaimed/uncompleted initial state, and enforces one action per authorization. Runtime INSERT is revoked. Updates cannot change approved content.

Owner-only evidence invalidation; extra event/duplicate/order input checks retain 0122 protections and add the processing command's scoped permission. Prevention rows retain an explicit actor derived for history from the immutable command receipt and checked against the bound owner for new writes. Final initial-pointer/proof, supplier order/receipt allocation and synthetic original guards are included. M4-8-S allocation grants are untouched.

Evidence references require exact tenant/job/scope/object version/hash, measured length and server metadata. Finalization checks the returned storage key, version, actual byte length, hash and complete media structure before SQL. Preview reads reject other-tenant prefixes. SQL verification stays unavailable to runtime; the service cannot silently turn caller-supplied bytes into storage authority. The pre-existing evidence_upload tenant_isolation policy already includes jobguard_migration; a redundant new policy was removed. No fingerprinted table gains columns. No scanner definitions, source pins or guards were edited.

A source-derived migration proof records expected function/grant/trigger/index changes. Proof parsing is verified; actual PostgreSQL catalogue matching is NOT verified. Recorded routine hashes are null, following the existing LP-6c source-proof convention; this is not independent database evidence.

## Named holds for landing

1. **External-original verification remains incomplete.** app.verify_evidence_upload is intentionally revoked from jobguard_runtime, identity and infrastructure. There is no separately authenticated storage-verifier execution path. Granting it to runtime would let raw SQL manufacture storage verification from supplied bytes. A real implementation must bind trusted exact-object reads without granting that capability. Until then EvidenceService.finalize fails with permission denied and the positive evidence integration journey remains unsatisfied. Its adversarial and positive assertions are retained, not skipped or weakened.
2. Run the full PostgreSQL acceptance/upgrade/catalogue suites after that path and missing predecessors are integrated. In particular prove runtime forgery refusals paired with positive checked paths, revoked grants, wrong-tenant/job/version references, owner invalidation, prevention attribution, final pointers, supplier allocations, populated backfill, existing multiple-action approvals versus the new unique index, and M4-8-S SELECT-only grants. The source proof must be compared with real catalogues and corrected if necessary. Existing ordinary integration fixtures may also need their approved LP-6b request binding; do not weaken them.
3. Finish the Git merge/index and rerun the actual lane checker on the reconciled branch. Its current failure includes inherited LP-6c files because HEAD/index still describe the unfinished merge. The lane is intentionally limited to the worktree delta from LP-6c; it is not broadened to absorb inherited files.
4. CI must prove pinned install, typecheck/lint/test/build, migration proof/catalogue/upgrade and affected database/browser gates. NOPR means no CI or independent review was requested here. Independent RED review at the final exact head remains required before merge; nothing is released.

## Local evidence

- Node v24.17.0. Global pnpm resolves to 11.8.0 rather than the declared 10.28.1; its two initial invocations stalled before running checks and were interrupted. No packages were downloaded or installed. Checks subsequently used the existing repository node_modules binaries directly.
- Existing TypeScript binary: tsc -p packages/core/tsconfig.json passed, rebuilding stale ignored core output after the first Vitest import failed on missing subscriptionAgreementRecordV1. That initial attempt ran no tests.
- Existing TypeScript binary: tsc -p packages/db/tsconfig.json --noEmit passed.
- From packages/db: ./node_modules/.bin/vitest run --maxWorkers=1 test/lp8b-storage.test.ts test/migration-proof-loader.test.ts — **84 tests passed across 2 files** (8 storage/outbox orchestration tests, 76 proof-loader tests), one worker. Tests exercise actual service orchestration with fake storage/SQL and strict migration-proof parsing; they do not prove PostgreSQL privileges or a live integration.
- node tools/agent-lane-boundary-lint.mjs --lane=lp-8b-outbox-evidence — FAILED on inherited merge files (diagnostic /tmp/lp8b-lane-check.log). No boundary definition was weakened.
- git diff --check passed. Content conflict markers removed; read-only index still needs router action.

LATER / SIMPLICITY (initial self-check): packages/db/src/outbox.ts: appendOutboundAction remains a dense one-line function. A later formatting-only change could split parse/hash/checked-query statements for easier security review; deferred to keep this repair focused.

## Branch-save continuation — 4 November 2026, 21:24:46Z order

The router explicitly authorized saving the partial branch with named holds. No scanner, protected pin, guard, migration or implementation was changed in this continuation. No exact old/new protected-pin values were identified in the previous handoff; any required scanner/source-pin reconciliation remains coordinator-only and held pending its explicit authority. The known unlanded migration rename is 0530 to 0800, already present before this continuation; 0800 still needs reservation confirmation and contiguous landing reconciliation.

The existing evidence.ts content resolution retains both LP-6c synthetic WAV validation and LP-8b exact storage key/length validation. No conflict markers remain in that file. Git still records three unmerged index stages and MERGE_HEAD cebbbe2a86c0cb1203b80238419aa771ec8f0c6e; read-only .git prevents staging or finalizing here. The router must finish that merge before saving, then validate the exact resulting head and scope. Inherited files, including guards, appear in the merge index; this continuation has not edited them and does not authorize their changes.

The storage-verifier design remains unresolved: a separately authenticated verifier must bind actual exact-object storage reads without allowing ordinary runtime SQL to manufacture verification. No new credential/role design is invented here. The unchanged positive database test still exercises EvidenceService.finalize and is expected to fail at the revoked verification routine until that path exists. This is a named landing hold, not a passing integration. LP-6b/6c landing and absent LP-6d/6e/7/8a predecessors, LP-10 worker privilege closure, populated backfill/duplicate-approval compatibility, migration catalogue proof, CI, independent exact-head RED review and all release gates remain open as described above.

Continuation validation: existing node_modules TypeScript binary `tsc -p packages/db/tsconfig.json --noEmit` passed. From packages/db, `./node_modules/.bin/vitest run --maxWorkers=1 test/lp8b-storage.test.ts test/migration-proof-loader.test.ts` passed 84 tests across two files. `git diff --check` passed. The actual lane checker was rerun and still reports inherited merge files (diagnostic `/tmp/lp8b-lane-check-20261104T212446Z.log`). Database/browser suites were not started under this sandbox restriction; they remain for CI after router push. No Git writes, package downloads, live provider calls or PR actions occurred.
