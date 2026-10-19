# ENT-10-OIDC-A — local OIDC adapter

Issued 2026-10-18; RED; branch `codex/sandbox/ent-10-oidc-a`; dispatcher head `7c8665248cd5abbd991d66480df08e064873d9ff`.

Implements strict synthetic protocol contracts, actual-library code/PKCE/signature validation and a local generated-key fixture. No reachable route, session, grant, export or database write path. **No schema or data change.** No migration or migration note. Dependency pin supplied by dispatcher; no builder dependency changes.

Affected invariants: AGENTS §§5.1, 5.3, 5.4, 5.9, 5.11, 5.13 (tenant-qualified proposals, no authority creation, no retries, bounded untrusted data, synthetic-only destinations, independent verdict required). Existing SAML and identity authority are unchanged. No new production alert; no backwards-compatible schema work needed.

Acceptance/evidence: [builder receipt](../verdicts/ENT-10-OIDC-A/BUILDER_RECEIPT.md), [contract](../contracts/oidc-signin-v1.md), [data flow](../operations/oidc-data-flow.md), [library review](../security/oidc-library-review.md). Scanner/current security evidence is an item-specific STOP; it does not halt other A work. No unanswered money/access policy introduced, so no BUILD-DON'T-MERGE label is inferred.

Remaining: two independent Claude checks bound to the eventual commit, separate acceptance, B persistence/routes/PostgreSQL/browser assertions, C emergency review, native/live-provider and assurance gates. Builder does not commit, push or accept. Parent ENT-10 remains open.
