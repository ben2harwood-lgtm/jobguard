# LATER-SAFETY-33: suppress proposals for already-exported sources

READY for router commit as a NOPR branch; independent check and CI remain pending.

The latest checked-in routine at HEAD/origin/main 1c2d1f2f75944ee31c7fec22e12e8b12860d2b83 is 0617. Its old_route follows the latest confirmed change, so after codat -> xero it offers an incorrect xero -> codat proposal for an already-exported codat source. Source inspection confirms the defect; no local PostgreSQL reproduction is claimed.

0802 starts from 0617 verbatim, using CREATE OR REPLACE and adding only a tenant/source ledger NOT EXISTS predicate to the proposal condition. Signature, owner, synthetic-database refusal, both actor checks, advisory lock, input/consent/stale-scope checks, history, confirmed output and REVOKE/GRANT remain identical. No table, column, policy, grant, write path, provider call or stored artifact changes. Any ledger row for the tenant/source suppresses the proposal, regardless of route or outcome. Not-yet-exported sources retain the existing preview path.

The explicit lp0, upgrade and tenancy proof sections are empty because catalog posture, routine metadata, static calls/writes, rows and tenancy do not change. The prior LP-0 definitionSha256 is null; no database-derived allowance is introduced.

Added integration cases preserve every existing case: exported-source suppression with confirmed/history and no-write assertions; differing-route proposals for an unexported source before and after a confirmed switch; and populated upgrade proving the predecessor's backwards proposal before applying 0802, then suppression and unchanged stored facts, routine identity, ownership, ACL, security attributes and every other body byte. These are real-PostgreSQL tests awaiting CI, not locally executed failing-first evidence.

## Forward fix and landing

Use a later forward migration if correction is required; preserve ledger and route history. Renumber the migration stem, proof, note, lane paths and test references together at landing. No rollback deletes records. No production activation or release is authorized.

## Named holds for landing

- CI must run the entire accounting-export-route-change.integration.test.ts file on real PostgreSQL, including the predecessor/upgrade witness and all existing cases, plus mandatory fresh/upgrade migration, catalog, tenancy and plan-entitlement-lifecycle-upgrade suites.
- If a fingerprint/scanner requires a named exception for this exact routine body replacement, the router must arrange that separately; no scanner or pin is changed here.
- Independent review at the exact landing head is required because this recreates a SECURITY DEFINER routine. The piece is a read-only synthetic preview fix, not RED product behavior; the commit handoff carries the requested RED review marker.
- Green required CI against current main remains necessary. Database/browser execution is unavailable in this sandbox; no provider, customer data, deployment or launch was used.

Local verification results are recorded below after execution.

## Local verification

- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`: PASS.
- Built existing core/storage dependencies using their installed TypeScript compiler and existing tsconfig files; both PASS. Generated ignored outputs only. Initial Vitest attempts could not resolve the absent core build; reruns below passed after that prerequisite.
- From packages/db: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/migration-proof-loader.test.ts test/accounting-export-repository.test.ts`: PASS, 83 tests across two named files.
- From packages/db: `node node_modules/vitest/vitest.mjs list --maxWorkers=1 test/accounting-export-route-change.integration.test.ts`: PASS, all 13 cases collected, including all three additions. Collection does not execute PostgreSQL assertions. The installed pnpm wrapper stalled before test startup and was interrupted; direct installed Vitest completed normally.
- `node tools/plpgsql-case-in-if-lint.mjs`: PASS, 285 migrations.
- Deterministic source comparison: PASS, new SQL equals 0617 after reversing only CREATE OR REPLACE and the new predicate. Existing integration cases remain untouched.
- Exact changed-file lane coverage and migration order checked with repository loadLanePolicy/lanePathAllowed/migrationOrderViolations helpers: PASS. Standard `node tools/agent-lane-boundary-lint.mjs` refuses the uncommitted branch because HEAD equals origin/main (self-comparison); router must rerun after committing. This is not a standard CLI PASS.
- `git diff --check`: PASS. Only the five authorized files changed.
- Source-inspected plan-entitlement-lifecycle-upgrade: its predecessor snapshot predates this routine's creation in 0617, so no new named body exception is identified there. Its actual PostgreSQL run remains required.

No local database or browser run, independent check, commit, push or PR occurred. NOPR handoff only.
