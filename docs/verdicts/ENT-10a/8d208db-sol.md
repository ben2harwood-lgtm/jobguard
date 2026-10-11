VERDICT: REPAIR
HEAD: 8d208db71cce8e6b5790c0316ed354ff4194c881

1. **P1 — BLOCKING: tenant-bound SSO sessions bypass their boundary through existing identity endpoints.** [application.ts:40](/private/tmp/jg-check-ent-10a-20261011T115611/apps/api/src/workspace/application.ts:40) creates an `SsoAuthProvider` inside the SSO service but leaves the shared `IdentityApplication` using `PersistedAuthProvider`. Consequently, [identity.application.ts:35](/private/tmp/jg-check-ent-10a-20261011T115611/apps/api/src/auth/identity.application.ts:35) lists every membership, and its context/invitation paths ignore `sso_session_binding`.

   **Failing case:** explicitly link an account belonging to tenants A and B to connection A. The resulting A-bound SSO token can resolve tenant B and reach its invitation write if that account owns B. My three targeted tests reproduced these outcomes through real application code with database facts stubbed. The SSO wrapper itself correctly refuses B; the ordinary identity paths bypass it.

   **Required fix:** enforce SSO session tenant/membership binding across session listing, tenant-context resolution and invitation authorization, including the shared Nest/Next identity composition. Add real PostgreSQL and HTTP regression coverage using an explicitly linked two-tenant account. Obtain the necessary lane amendment if those shared files are outside the issued lane.

2. **P1 — BLOCKING: the audit SQL breaks connection creation; required database tests are red.** [0114_enterprise_identity.sql:241](/private/tmp/jg-check-ent-10a-20261011T115611/packages/db/migrations/0114_enterprise_identity.sql:241) contains:
   ```sql
   e->'payload'-ARRAY['references','hashes','classifications']
   ```
   PostgreSQL gives subtraction higher precedence than `->`, so the expression groups incorrectly. Parentheses are required around the extracted JSON value. This is a source diagnosis supported by the [PostgreSQL precedence rules](https://www.postgresql.org/docs/16/sql-syntax-lexical.html#SQL-PRECEDENCE); CI masks the underlying database error as `SSO_UNAVAILABLE`.

   **Failing case:** connection creation at [enterprise-identity.integration.test.ts:65](/private/tmp/jg-check-ent-10a-20261011T115611/packages/db/test/enterprise-identity.integration.test.ts:65) fails in **15 of 16** ENT-10a PostgreSQL cases. [CI run 38133510225](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/38133510225) reports **883 database tests passed, 15 failed**. Build and browser steps were skipped.

   **Required fix:** use `(e->'payload') - ARRAY[...]`, directly exercise the audit routine in PostgreSQL, and resolve any remaining failures without weakening checks. Require all 16 ENT-10a database cases and both browser projects to pass on the repaired commit.

3. **P3 — LATER: malformed routes replace the original input refusal with an availability error.** [enterprise-identity-repository.ts:66](/private/tmp/jg-check-ent-10a-20261011T115611/packages/db/src/enterprise-identity-repository.ts:66) treats any 36-character mixture of hexadecimal characters and hyphens as a UUID.

   **Failing case:** a callback route containing 36 hyphens first produces `INVALID_SSO_INPUT`, then its refusal logger attempts a UUID lookup and replaces that error with `SSO_UNAVAILABLE`. My fourth targeted test reproduced this. It creates no identity/session and records the bootstrap refusal.

   **Required fix:** validate UUID structure before tenant lookup and preserve the original typed input refusal.

I explicitly checked the issued criteria and security rules:

| Requirement | Evidence and result |
|---|---|
| DW1: signed assertions; altered, unsigned, expired, wrong audience/issuer refused | Executed unit coverage passes. Database acceptance remains blocked. |
| Recipient, both Conditions bounds, confirmation InResponseTo, no SHA-1 | Each has executed negative unit coverage, including entity-obscured SHA-1. |
| Unsolicited Responses refused; solicited A Response refused on B | Executed adapter tests pass; database cases are red before reaching these assertions. |
| Assertion ID accepted once inside sign-in transaction | Source contains global uniqueness and transactional insertion; replay/race test authored but blocked. |
| DW2: verified domains and explicit account linking | Source enforces domain verification and authenticated linking; database proof blocked. |
| Connection A cannot confer tenant B access | **Fails finding 1.** |
| DW3: finance/commercial-manager only explicitly mapped; mapping changes audited | Explicit mapping and revision logic present; database proof blocked by finding 2. |
| DW4: next-sign-in reconciliation and bounded sessions | Revocation/reconciliation and 900-second expiry present; database proof blocked. |
| DW5/M2: unchanged permission conformance; exact Decisions preserved | CI passes existing contractor conformance **19/19**; commercial authorization code unchanged. |
| M1 web/background identity, revocation and downgrade coverage | Authored application/worker tests inspected; full acceptance blocked. |
| M4(a)–(c): strict metadata/data flow, synthetic provider only, fail-closed gates | Executed schema/gate/composition tests pass. |
| Typed refusals, no new identity effects, audit | Rollback structure inspected; end-to-end evidence blocked by finding 2. |
| New tenant-qualified keys, FORCE RLS, minimal grants, append-only audit | New catalogue test passes in CI. |
| Migration 0114 adds only new objects | Source-inspected; no existing table, policy, role, grant or auth/session DDL changed. |
| Held/deferred work absent | No OIDC, SCIM, emergency access, audit export or assurance pack built. Native and founder D04/G5 remain held. |
| Library owns XML verification; production has no deep XML import | Confirmed; deep `signXml` import occurs only in the test signer. |
| Boundary scanner and pinned files untouched | Confirmed by diff; scanner passes in isolated local auth run. |

The 32-file diff stays within the task lane, including the integrator’s migration-ledger commit. No founder-reserved capability, weakened existing assertion, skipped test or lengthened existing timeout was introduced.

Executed locally:

- Prescribed `pnpm typecheck`, lint, lane lint, auth tests, build and OpenAPI check: **exit 1 each**, launcher signature verification failed before tasks ran.
- Installed TypeScript builds for core/config/storage/AI/DB, API/web typechecks, Nest build, Next build and OpenAPI check: **exit 0 each**.
- Installed auth suite: **exit 0, 207/207**; SSO subset: **exit 0, 40/40**.
- Socket-free DB unit selection: **exit 0, 46/46**.
- Tool tests: **exit 0, 42/42**.
- Own scratch tests in [.tmp-check/independent-ent10a.test.ts](/private/tmp/jg-check-ent-10a-20261011T115611/.tmp-check/independent-ent10a.test.ts): **exit 1, four failing assertions**, corresponding to findings 1 and 3. These are service tests with database doubles.
- Detached local lane diagnostic failed as expected; read-only PR-context lane/purity/money diagnostic: **exit 0**, all 32 files allowed.
- Broader API run: **978 passed, seven failed** from sandbox socket refusal and timeouts; isolated auth subsequently passed unchanged. Initial DB selection including socket tests: **46 passed, two socket failures**.
- Dependency audit: **exit 2**, lookup unavailable locally. CI dependency audit and secrets scan both pass.
- Tracked/index diffs and whitespace check: clean.

I relied on the fetched GitHub CI logs for PostgreSQL results: existing tenancy **9/9**, bootstrap **4/4**, contractor **19/19**, and the new privilege catalogue pass; ENT-10a’s other **15 cases fail**. Browser execution has no passing evidence because CI skipped it. No local PostgreSQL/browser suite, live IdP, real-data route or founder approval was verified. Tracked files were not edited; nothing was committed or pushed.