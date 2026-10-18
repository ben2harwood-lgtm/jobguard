# ENT-10-OIDC-B — persisted practice OIDC

RED, sub-order A only. **Builder receipt only — not independently verified, not accepted.**

Issued 18 October 2026. Branch `codex/sandbox/ent-10-oidc-b`; inherited HEAD/A adapter `a2ae1c01ad52f9a3c46b4b4cf9c1a5826bf274d1`, parent `27ed904d`. Dispatcher expressly authorized build-ahead on unmerged #295. No builder commit/push; candidate commit remains for the dispatcher. `origin/main` inspected locally resolves `765f0f369e22a601c3e29686bd3436c82f600e0b`. A's accepted commit is **not established by this receipt**; its checked status is dispatcher-supplied and merge/acceptance remain separate prerequisites.

A compatibility: unchanged `OidcAdapter(config, localIssuer)` / `start(browserBinding)` / `validate(callback, storedRequest, browserBinding)` and strict config/request/claims exports. Real adapter exchange runs in the new unit and authored integration tests, using A's unchanged `TestOidcIssuer`. No package/library changes or fresh library-security review are claimed.

| Issued requirement | Implementation and evidence |
|---|---|
| 1–2: versioned boundary, immutable synthetic configuration, current admin | Separate persistence contracts; strict fixed fictional registration; `oidc_create` current persisted admin/session checks; immutable existing connection storage with OIDC CHECK branch. Contract tests executed; DB tests authored, NOT RUN. |
| 3: private state/nonce/browser/PKCE/link/expiry | Forced-RLS `oidc_request`, no direct runtime/identity reads; owner-only helper, narrow identity routine execution; returned start payload omits secrets. Unit handler assertions executed; catalogue/upgrade checks NOT RUN. |
| 4–5: one durable claim; no transaction during exchange; unknown/crash | Claim transaction/audit commits before adapter invocation. Claimed/unknown requests cannot be reclaimed. Application tests executed; separate-pool race, pool-release, audit-rollback and fresh-instance tests NOT RUN. |
| 6–8: completion authority, bounded sessions, revocation, collision prevention | Database rechecks expiry/configuration/link/session/membership; existing grant/session authority retained; OIDC replay namespace distinct from unchanged SAML raw assertion storage; immutable connection qualifies protocol/issuer/subject. Database-clock sessions and committed verified-no-group revocation. Application orchestration executed; real DB collision/downgrade/expiry/SCIM/SSO-required tests NOT RUN. |
| 9: both transports | Actual Nest controller and Next handler tests execute in process, with secure cookie paths/units, no-store, redacted parse errors and hidden session token. CI browser specification covers both real routes; NOT RUN locally. No new screens. |
| 10: existing permissions | Existing SAML schemas, adapter, SCIM hashing and business command checks retained. An additional restrictive policy excludes OIDC metadata from the existing SAML view; SAML visibility is unchanged. Focused identity/scanner regression results in receipt; full DB acceptance pending. |

Migration `0193_oidc_signin.sql` (next free above inherited 0192; dispatcher renumbers) and its note inventory new tables/routines, restricted grants, bootstrap exception, lock order, history preservation and forward-fix. The only existing routine extension is protocol-specific replay storage in `sso_complete`; SAML's original lookup/insertion and all old rows/indexes remain. New policy prevents OIDC metadata from being emitted as malformed SAML view entries. New LP-0 ownership/execute rows and additive SERIOUS-B5 expectations are limited to B's new objects under standing ruling 113; no scanner/assertion weakened. The tenancy catalogue test inventories `app` tables; these new `identity` objects have explicit new catalogue/RLS tests instead of unrelated tenancy-list edits.

Shared composition, exports and OpenAPI serialize with C, as ordered. C's emergency notifications/reviews, UI, roadmap closure and external actions are not part of B. No money rules, broader grants, owner mapping, refresh/offline tokens, SCIM reactivation or live issuer.

Operational diagnostics: issued/claimed/completed/refused/unknown status and redacted tenant/bootstrap audit events. No outward alert delivery. Local issuer codes/keys are process-local; a process change can require a fresh sign-in. No distributed/live-provider claim. The existing identity validator credential remains trusted; RLS does not protect against its compromise or the migration owner.

## Holds / STOP items

- **A acceptance/merge:** construction authorized ahead; B acceptance/merge cannot treat A as accepted merely from its inherited receipt.
- **Lane against origin/main:** inherited A files remain outside B's exact lane; root lint/lane check fails. Do not broaden B to absorb A. Dispatcher must merge/rebase A and rerun the official comparison. A supplemental working-tree-only boundary check is not that gate.
- **Execution:** no local PostgreSQL/browser; full DB/migration/e2e and clean-install evidence remain NOT RUN. Existing API listener tests cannot bind in this sandbox. Standard `tsx` CLI OpenAPI check cannot create its IPC socket; identical generator checked using Node's tsx loader.
- **Failing-first evidence:** the initial pre-implementation contract-test command failed in the global package-manager launcher, before Vitest. Later direct/pinned test runs are green evidence, not a fabricated failing-first run. Requested failing-first evidence is incomplete and remains a review hold.
- **Existing test-runner discovery:** `pnpm --filter @jobguard/core test` also discovers emitted `dist` tests whose source-relative fixture files do not exist. Do not modify that out-of-lane runner; the source-only suite result is reported separately.
- Fresh independent Claude and separate Codex RED checks require the dispatcher's eventual exact candidate commit, followed by separate acceptance. No checker verdict or acceptance supplied by the builder.

D01/D02/D03/D08/D09/D16, applicable D04/G5, residency and assurance gates remain closed. Neither B nor a green local check closes ENT-10.
