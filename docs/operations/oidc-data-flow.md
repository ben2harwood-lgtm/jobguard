# Local OIDC data-flow record — 2026-10-18

Owner: JobGuard identity practice maintainers. Feature: ENT-10-OIDC-A protocol adapter. Status: synthetic-only; D04/G5 and all live-provider/pilot gates remain closed. No approval inferred from a passing test.

| Register field | Local-only value |
| --- | --- |
| Provider/deployment | in-process-test-idp; Node test process, no real provider |
| Purpose / lawful basis | Made-up protocol fixtures; no real personal data authorized |
| Controller / processor roles | Synthetic-only engineering exercise; no live processing appointment |
| Subjects / data categories | Fictional contractor members; fictional email, subject, groups, code, nonce, state, PKCE verifier and signed tokens |
| Origin / processing / storage regions | Local developer or CI test-process location; no remote region or residency approval claimed |
| Log / backup destinations | No adapter logging or backups; redacted test results only |
| Endpoints / direction | In-process dispatch for https://issuer.invalid/.well-known/openid-configuration, /token and /jwks; /authorize is an inert generated URL |
| Fallback / subprocessors | Deny; no network fallback or external subprocessors used by adapter |
| Credentials / encryption | Runtime-generated 2048-bit RSA test keys, RS256 signatures; no secrets configured; HTTPS-shaped URLs are identifiers, not claims of transport encryption |
| Retention / deletion | Ephemeral fixture memory; discard process/fixture after tests; no persisted customer data |
| Training | None |
| Approval evidence | D04 proposed, G5 held; D12 no real-data approval in this task |
| Kill switch | Adapter has no application registration; strict synthetic config and mandatory local handler |
| Review / verification | 2026-10-18; local actual-library signed-token tests, builder receipt; independent checks pending |

Keys are generated at fixture runtime, exported only as public JWKs, rotated in tests and never committed. The adapter never logs requests, tokens, claims or upstream errors. Do not log returned request objects: they include the PKCE verifier. Test helper signing is fixture production, not application token verification.

Limits and redaction are defined in [the contract](../contracts/oidc-signin-v1.md). Each response is bounded including streamed bodies and stalled handlers; endpoint strings and methods are allowlisted and redirects are rejected. No new operational alert is installed because A is not reachable. B must provide durable request lifecycle, safe operational counts without personal claims and unknown-outcome handling before exposure. Local dependency licence checks do not replace an advisory scan or independent RED checks.
