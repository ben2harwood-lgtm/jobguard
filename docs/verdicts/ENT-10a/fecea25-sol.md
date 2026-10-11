VERDICT: REPAIR
HEAD: fecea2582838094ba0a4649fb83f97952e2dcaba

1. **P1 — BLOCKING: non-bearer subject confirmation is accepted as bearer authentication.** [saml.ts:85](/private/tmp/jg-check-ent-10a-20261011T173503/apps/api/src/auth/sso/saml.ts:85) requires one confirmation and checks its recipient and request ID, but never checks `SubjectConfirmation/@Method`.

   **Failing case:** my runtime-generated, double-signed assertion uses `urn:oasis:names:tc:SAML:2.0:cm:holder-of-key`. The actual library and adapter return accepted identity claims without any subject-key possession proof. This contradicts the documented bearer-only behavior; holder-of-key authentication requires that additional proof. [OASIS profile](https://www.oasis-open.org/standard/saml2-0-holder/)

   **Required fix:** require the verified confirmation’s method to equal `urn:oasis:names:tc:SAML:2.0:cm:bearer`. Reject missing, unknown and holder-of-key methods with `SAML_REFUSED`. Add signed negative tests and database coverage proving refusal creates no session/membership and is audited.

2. **P2 — BLOCKING: the Nest state-cookie path breaks its sign-in callback.** [sso.controller.ts:25](/private/tmp/jg-check-ent-10a-20261011T173503/apps/api/src/auth/sso/sso.controller.ts:25) uses the cookie options from [sso.contracts.ts:54](/private/tmp/jg-check-ent-10a-20261011T173503/apps/api/src/auth/sso/sso.contracts.ts:54), whose path is `/api/auth/sso`. Nest exposes its callback under `/auth/sso/:connectionId/callback`; it has no `/api` global prefix.

   **Failing case:** start through the Nest endpoint, then submit its callback using normal browser cookie-path rules. The state cookie is withheld, and the real callback service returns HTTP 403 `REQUEST_REFUSED`. My controller/cookie-path reproduction fails accordingly; this was not a live HTTP/browser run.

   **Required fix:** use `/auth/sso` for the Nest state cookie and its clearing operation, while retaining `/api/auth/sso` for Next. Add a transport test that carries cookies from start to a successful signed callback.

3. **P3 — LATER: malformed UUID routes still replace the original input refusal.** [enterprise-identity-repository.ts:66](/private/tmp/jg-check-ent-10a-20261011T173503/packages/db/src/enterprise-identity-repository.ts:66) accepts 36 hyphens as a possible UUID before its audit lookup.

   **Failing case:** callback with `"-".repeat(36)` produces `SSO_UNAVAILABLE` instead of `INVALID_SSO_INPUT`. My test reproduces it. This remains explicitly deferred by the repair order.

   **Required later fix:** validate UUID structure before tenant lookup and preserve the original refusal.

Both original blockers are repaired:

- The shared `PersistedAuthProvider` checks the persisted binding during authentication and membership projection. Bound sessions expose only the exact tenant/membership; B context and invitation attempts are refused and audited.
- Ordinary unbound sessions retain ordered memberships, both tenant contexts and permitted invitations. Their code-request, verification and invitation-acceptance implementations are unchanged.
- The three reproducing tests were ported and pass. The PostgreSQL two-tenant regression also passes in CI.
- [0120_enterprise_identity.sql:241](/private/tmp/jg-check-ent-10a-20261011T173503/packages/db/migrations/0120_enterprise_identity.sql:241) correctly groups the JSON extraction before subtraction. Other mixed JSON expressions are explicitly grouped; unknown repository errors retain server-side causes.

I traced the session consumers:

- Nest `/auth/session`, `/auth/invitations`, `ApplicationAuthGuard`, and the provider-neutral `TenantAuthGuard`.
- Next `/api/auth/session` and `/api/auth/invitations` through `identity-server.ts`.
- Both transports’ SSO administration, view and explicit-link start paths.
- Callback linking’s persisted session/membership rechecks.
- `checkWorkerAction` and its SQL connection/session/tenant/membership/permission checks.
- Existing Graphile workers consume queued authorization rather than identity-session tokens. Their tenant and current actor checks remain intact.
- Request/verify/invitation acceptance issue independent entered-code sessions. Practice routes use their separate synthetic session mechanism.

**No remaining session-to-tenant binding bypass was found.**

Source inspection confirmed the 33-file diff stays within the authorized leaf and integrator ledger changes. All four protected M0-6L test files, the scanner and seven pinned files are unchanged. Only ENT-10a’s lane entry was added. Migration 0120 creates new objects and changes no existing object’s DDL or grants. No existing assertion was weakened, skipped or given a longer timeout. No held capability, founder approval, live provider, deployment or release was introduced. Production imports do not reach the test signer’s deep XML import.

DW1’s listed attacks, DW2 linking, DW3 mappings/audit, DW4 bounded sessions/next-sign-in reconciliation, DW5/M2 conformance and M4’s executable gates have coverage. Native M1 and founder D04/G5 evidence remain held. C1/C2 remain blocked by the Nest callback defect.

Executed locally:

| Command/check | Exit and result |
|---|---|
| Prescribed pnpm typecheck, lint, lane lint, auth tests, build and OpenAPI check | **1 each:** launcher signature verification failed before execution |
| Installed TypeScript builds: core/config/storage/AI/DB | **0 each** |
| Installed API/web typechecks, Nest build, Next build, OpenAPI check | **0 each** |
| Installed lint/lane diagnostics with scratch PR context | **0 each**; detached local lane mode correctly refuses |
| API `vitest run src/auth --maxWorkers=1`, final run | **0: 218/218** |
| Three ported reproductions, name-filtered | **0: 3 passed**, 12 excluded |
| Web unit suite, final run | **0: 451/451** |
| Three socket-free DB test files | **0: 17/17** |
| `node --test tools/*.test.mjs` | **0: 42/42** |
| Own [scratch tests](/private/tmp/jg-check-ent-10a-20261011T173503/.tmp-check/independent.test.ts) | **1: 7 passed, 3 failed**, matching the findings above |
| Tracked/index/whitespace checks | **0**; only scratch files are untracked |

Earlier auth attempts timed out at the unchanged scanner’s 5000 ms limit. Extracted-main and candidate scanner controls subsequently passed; the final complete auth run passed. An initial web run lacked API build artifacts; the post-build run passed.

I read the completed [CI run 38155573542](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/38155573542), testing PR merge `8db2a7b` for this exact head: API **996**, DB **914** including ENT-10a **18**, and production browser **306** tests passed. Install, typecheck, lint, build, dependency audit and secrets scan passed. I relied on those logs and CI repair 2’s receipt for database/browser evidence.

I did not execute PostgreSQL or browsers locally, verify live IdP interoperability, test native paths, or verify founder approvals. No tracked file was edited, committed or pushed.