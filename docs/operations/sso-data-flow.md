# SSO synthetic route register — provider-data-flow-v1

Status: in-process test identity provider only. D04 remains proposed; D12/G5 live evidence absent. Review date **2026-10-11**: builder source inspection and synthetic unit execution only. This approves no real route.

| Required field | Synthetic boundary |
| --- | --- |
| Provider / feature | `in-process-test-idp` / SAML 2.0 sign-in; approved verifier library `@node-saml/node-saml` 5.1.0 |
| Accountable owner | Synthetic fixture operator; real security/data owner must be assigned before live work |
| Environment | `synthetic_demo` only; all other modes refused |
| Categories / subjects | Fictional `.invalid` email, opaque subject, group claims, signed assertion, request/session references; generated fictional contractor members only |
| Purpose / lawful basis | Synthetic sign-in tests; no real personal-data processing or live lawful-basis claim |
| Controller / processor roles | Synthetic-only placeholders; live D12 agreement/roles remain unapproved |
| Origin / processing regions | Test harness and application process; no external identity-provider destination |
| Storage / log / backup regions | Configured synthetic PostgreSQL identity store; application logs contain no raw SAML, email, bearer tokens or keys; database deployment/log/backup destinations require their own approvals before real data |
| Endpoint / deployment identifiers | Server-computed local `/api/auth/sso/:connectionId/start` and `/callback`; immutable `urn:jobguard:test-idp:<id>` and `urn:jobguard:sp:<id>`; configured origin only |
| Subprocessors | None for the test IdP; deployment/storage services need separately verified live registers |
| Retention | Disposable synthetic fixtures; ten-minute request validity and fifteen-minute session limit are validity limits, not a real-data deletion policy |
| Training | None |
| Deletion | Dispose synthetic database; live retention/export/deletion implementation and approvals remain outstanding |
| Encryption | Test assertions are plaintext; double SHA-256 XML signatures provide integrity. Secure HttpOnly cookies and keyed session/browser-state digests protect session handling. Synthetic local fixtures have no production transport/storage encryption approval; TLS and approved encrypted storage are required before real data |
| Credentials class | Runtime-generated test public key in connection metadata; private signer key exists only in test harness memory; restricted identity DB credential and existing configured HMAC secret outside repository |
| Direction | Local inbound synthetic callback; no provider/commercial outbound attempts |
| Fallback | `deny`; no global/live endpoint fallback, no in-memory request cache |
| D04 / D12 evidence references | `proposedDecisionRecords.D04` / no live D12 approval; no real route evidence |
| Review date | 2026-10-11; source inspection, no live provider or professional verification |
| Gate status | Synthetic-only; existing D04 gate plus unconditional denial of non-test providers and non-synthetic modes; G5 founder evidence held |
| Kill switch | Missing identity config prevents initialization; mode/provider/metadata refusals occur server-side regardless of feature flags |
| Verification evidence | ENT-10a SAML unit tests; authored PostgreSQL integration and browser tests NOT RUN in builder sandbox |
| Authorization / execution | Database-backed issued request, initiating-browser state, signed Assertion+Response, fixed issuer/audience/callback, unique assertion consumption; verified domain before JIT/link; explicit authenticated linking |
| Idempotency / retries | Issued request and assertion IDs consumed once; session/membership/grant/audit transaction; no provider network retry and no exactly-once external-delivery claim |

Each connection stores every required field in strict versioned `sso-data-flow.v1` metadata, validated through `sso-metadata.v1`. Completeness of that record is not founder approval. The test signer is never imported by production routes. Existing identity credentials/authentication remain a trust boundary; RLS does not protect against their compromise or a privileged database rewrite.

## ENT-10d — SSO-required switch and held emergency access (11 October 2026)

Synthetic-only additions: append-only tenant switch reasons/revisions, actor membership references, unlinked-member projection, emergency reason text in a separate protected log, reason hashes in the audit chain, and rule/approval/use references. The rule table is structurally empty under `sso_emergency_approver_rule_held CHECK(false)`; no rule configuration or approval writer ships. Every emergency use is refused with an identical public code; only a proven mailbox administrator in a required tenant may append its tenant emergency log/chain event. Other causes remain global hashed-route/classification records. No raw email/code/session token enters audit. No real route is approved. Processing/storage/log/backup boundaries remain those above: local application and configured synthetic PostgreSQL, no provider/commercial outbound attempt, no training or fallback, disposable fixtures. Validity limits are not a real-data retention policy. D04/G5 and founder approver/reviewer decisions remain held. OFF-only emergency effect and strict unlinked-member guard are INTERIM pending Ben's confirmation. Migration 0129 adds objects only; identity SELECT/explicit routine EXECUTE, no business or infrastructure privileges. See `docs/contracts/sso-required-v1.md`; source-inspected construction is not live-provider verification or professional sign-off.
