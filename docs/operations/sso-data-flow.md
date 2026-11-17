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

## ENT-10a2 synthetic inbound deactivation

Local inbound only: the in-process test provider submits an opaque subject and UUID message id at the connection's route. The restricted identity service hashes the unchanged subject and canonical message; the new immutable company-scoped record holds hashes, identifiers, outcome, counts and server time. No address, raw subject, bearer or seed is stored, audited or logged. Revocation and the identifier/hash-only company audit append share one transaction. Caller proof derives from JOBGUARD_SCIM_SYNTHETIC_SEED (no default, no persisted value); every unavailable/unapproved route falls back to deny. Processing is in the application process; storage is configured synthetic PostgreSQL; logs are redacted; fixtures are disposable; no training, live backup approval or outbound provider flow. Gate status synthetic-only: only JOBGUARD_ENV synthetic_demo and database jobguard_synthetic_demo; D04/G5 live provider evidence remains HELD. See [scim-deactivation-v1.md](../contracts/scim-deactivation-v1.md) for refusal, replay, owner protection and invitation limits.


## ENT-10e synthetic owner emergency windows and member list

Ben's 12 October 2026 answers replace ENT-10d's held rule and interim OFF/strict guard status above. New local synthetic records: command id, owner membership and approver reference, approval time, immutable opened/closing times and configured minutes (default 60, bounded 15–240). No email or mailbox code reaches emergency SQL; reason hash remains in the chain. One owner's command creates/consumes its approval, with company log/chain in the same transaction. No session, identity provider or outbound action is created. Every gate uses the database clock; expiry writes no row and needs no worker. Invalid settings refuse; no global fallback.

Administrator detail discloses only that company's active unlinked membership ids, own member addresses, roles, kinds and separate pending invitations, capped at 200 each with the true unlinked total. The same scoped list may accompany the one strict ON refusal after rollback/audit; a failed read keeps the refusal code only. Credentials, current membership, organisation.manage, synthetic database/mode, origin and CSRF are rechecked. Reads are no-store. Processing/storage/log/backup/training/deletion boundaries remain those in the existing synthetic register, with no live-route approval or real-data retention claim. D04/G5, independent RED verdicts, post-use sign-off and all screens remain outstanding. The stale identity-page held-rule message is FIX-LATER because UI is parked.
