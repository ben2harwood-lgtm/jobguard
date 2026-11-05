# LATER-SAFETY-25 — RED emergency capability repair

Both reported faults are present at base 11411c4b8 (after 41cfa65b4). The latest body of identity.dark_emergency is still migration 0612; no item was skipped. This forward migration replaces that body only. Signatures, owner, ACL, search path, tables, RLS and existing audit event types remain unchanged. Consequently lp0, upgrade and tenancy proof sections are explicitly empty: their recorded catalogue facts do not change. No new grants or extensions are needed.

Opening now requires at least two distinct current owner identities other than the requester. Requester, current membership, session/CSRF, request expiry, duplicate-opening and synthetic-only guards remain. Open accepts no supplied credential. PostgreSQL mints a token from two independent UUIDv4 values (244 random bits), stores SHA-256 only, and returns the raw 64-character hexadecimal token on the first successful open. Inspect/revoke_member require that raw token, hash it server-side and compare against the stored hash. tokenHash is an invalid field on every operation. One-hour session expiry and all existing audit events remain; neither the raw token nor response is persisted in audit payloads.

Compatibility: emergency.v1 open must omit tokenHash; inspect/revoke_member must replace tokenHash with token. SCIM credentials are unrelated and must retain their existing contract. Previously caller-chosen session hashes cannot be retroactively made server-minted; existing sessions retain the one-hour expiry. No table/row rewrite. Forward-fix only: do not roll back to caller-selected emergency credentials.

## Verification

New real-PostgreSQL regressions: sso-emergency-token.integration.test.ts covers 0/1/2/3 approvals, requester and duplicate approvals, revoked/expired/non-owner approvers, requester-only opening/use, invalid session and CSRF, caller-supplied hash/token refusal at open, successful returned-token inspect/revoke, wrong raw token and hash-as-token refusal, one-hour duration, expired requests/sessions and audit event/token secrecy. These cases are expected to fail on 0612; failing-first PostgreSQL execution is unavailable in this sandbox, so CI must demonstrate it and the fixed run.

CI must run all sso-emergency*.integration.test.ts, enterprise-access.integration.test.ts (the actual existing dual-owner regression), enterprise-access-upgrade.integration.test.ts, migration/LP-0/tenancy/upgrade suites, all sso-emergency*.test.ts, and the unchanged headless ENT-10-rest-notices.spec.ts browser journey with at most two workers. The browser fixture inserts a reason hash, not a token hash; it needs no token setup change. The web emergency route is the separate sso-emergency.v2 route and needs no change. emergency-notice.tsx sends no token hash.

## Scope extension and local handoff — READY

The router granted exactly two additional paths on 5 November: apps/api/src/auth/sso/enterprise-access.contracts.ts and packages/db/test/enterprise-access.integration.test.ts. Applied the saved scope-extension patch to both and added them to the lane. The API now accepts server-minted raw tokens; the existing integration regression uses the token returned by open and retains every refusal assertion. SCIM tokenHash is unchanged. No other scope extension was used.

Local results after applying the patch (installed binaries, no downloads; each Vitest invocation at most two workers and three named files):
- apps/api: node_modules/.bin/vitest run --maxWorkers=2 src/auth/sso/sso-emergency-token.test.ts src/auth/sso/enterprise-access.test.ts — 26 PASS, including all seven new boundary cases (the six previous failures now pass).
- apps/api: node_modules/.bin/vitest run --maxWorkers=2 src/auth/sso/sso-emergency.test.ts src/auth/sso/sso-emergency-owner.test.ts — 24 PASS.
- packages/db: node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts — 77 PASS.
- apps/api and packages/db: node_modules/.bin/tsc -p tsconfig.json --noEmit — both PASS.
- git diff --check — PASS.
- Exported mergeLanePolicy/lanePathAllowed with exact path-set assertion — PASS for all eight changed/untracked paths, with seven non-lane paths listed and no lane self-listing. The branch has no committed changes beyond the origin/main merge base. origin/main advanced during this handoff; changes made on main are not this lane's changes. The router must run the committed-range lane gate after committing/catching up.

Earlier execution before this scope grant recorded 1 PASS / 6 FAIL in the new boundary suite against the old API schema. The passing run above supersedes those failures. No tests were weakened. PostgreSQL and browser suites were not run: this sandbox cannot start PostgreSQL or bind localhost. CI must supply the real database, migration/upgrade/tenancy/LP-0 and browser evidence specified above; local API tests use a mocked repository and do not prove SQL execution.

LP-6b #548 identity-pool bind_request grant interaction remains a named hold, unchanged. No grant change was made. Buyer security pack, register, scanner and pins are untouched. Renumber the migration filename stem at landing. Independent exact-head RED review and green CI remain required. READY means ready for router commit/push as NOPR and subsequent checks, not merge or release acceptance. No Git writes were performed. No simplification item recorded: this is a repair, not an initial independent review.
