# M5-1 accounting export — dark synthetic contract v1

This is the small-builder M5-1 slice under BUILD_PLAN.md §11.6, not a live Codat integration or a claim that M5-1 is released. M4-23, D02, D04 and G5 remain release dependencies. Base inspected: local origin/main and HEAD both `32411c4e45a094cbe65ae90ee1d5debd1f266e2a`; no accounting-export implementation existed there. No remote fetch was performed.

The contract and executable fake live in `apps/api/src/accounting-export.contracts.ts` and `accounting-export.sandbox.ts`. They are deliberately not registered in any HTTP controller, module, worker or provider registry. The sandbox defaults disabled; explicit fixture construction enables only the deterministic in-process fake. Identifiers must be fictional `demo-` labels; source objects must be synthetic, builder-visible, and strict-schema validated. No customer names, descriptions, credentials, URLs, network operations or arbitrary metadata are accepted. This is a fixture convention, not a PII detection guarantee. Production construction, membership resolution and persistence are not implemented.

## Capability matrix

| Operation or field | Fake Codat target | Evidence and limitation |
| --- | --- | --- |
| Direction | Push only | No external-domain importer or two-way sync |
| Customer invoice | `invoice` | Issued immutable source revision; exact positive GBP pence |
| Credit | `credit_note` | Posted source, exact same-tenant/job invoice ID and revision; positive credit magnitude, not negative invoice |
| Receipt | `payment` | Posted source, exact same-tenant/job invoice ID and revision; does not establish settlement or recovery proof |
| Account/customer mapping | Fictional reference IDs | Exact mapping revision bound to preview; `synthetic_reference_only`, not D02 approval |
| Tax codes/VAT | Unsupported | Literal `unsupported` required; any mapped value fails `unsupported_mapping` |
| Retention | Unsupported | Same refusal; no amount silently dropped |
| CIS | Unsupported | Same refusal |
| DRC | Unsupported | Same refusal |
| Final account | Locked snapshot only | Source final revision must equal immutable locked revision; superseded/cancelled source refused |
| Update, delete, cancellation or reversal delivery | Unsupported | No automatic corrections/deletes; cancelled source stops new pushes, old ledger remains inspectable/reconcilable |
| Accounting systems | Fake Codat only | No claim of support for Xero, QuickBooks or any actual accounting system |
| Regional data path | Process memory only | No external destination, logs, credentials, telemetry or live/sandbox-provider evidence |
| Real Codat sandbox/live | Not built | Codat SDK is not installed; no dependencies added |

The bounded document contract carries source totals, IDs and revisions. It does not fabricate tax calculations, item lines, settlement evidence or missing provider capabilities. There is no rounding: validated integer pennies are preserved. Credits and receipts share one conservative per-invoice allocation ceiling across all target companies, computed with bigint from immutable export reservations (including failed/unknown attempts). Only the exact company/source entry being retried is excluded from the sum before adding its amount. Reservations cannot be silently released by source edits or cancellation. This is not an accounting balance or fee calculation.

## Authorization and reconciliation

A trusted synthetic context supplies tenant/actor and export permission. Preview resolves the source from the fixture repository rather than accepting a command-supplied amount. Its SHA-256 binds the strict parsed scope, target company, exact source and mapping revisions, unsupported fields, target object and consent revision. `confirmPreview` records a human confirmation of those exact bytes; push requires that stored approved Decision, its exact actor/action/hash and an unexpired consent/Decision. An approved-shaped object alone does not authorize push. Every attempt revalidates source availability, authority and consent. Changing target/mapping/source/consent requires a new preview and confirmation. Reusing a Decision ID for different content conflicts. Revoking confirmation prevents execution and prevents silently reapproving that Decision ID.

The process-local external-ID/mapping ledger preserves the original source and mapping artifact, target reference, result ID, attempts and status. Tenant + company + source ID is the stable business effect across revisions and future routes; a different source revision cannot create a second object. A reused command ID or idempotency key with different input conflicts. Returned objects are defensive copies. Minimal audit events contain only tenant/reference/status, without source contents or personal data.

Push checks the deterministic external reference before any create. Definite failure and unknown outcome both block direct retry. Reconciliation classifies exact match, confirmed absence, external edit, duplicate import and conflicting ID/reference. Only confirmed absence permits another create; an existing matching object is linked without another push. External edits/duplicates/conflicts require target-side correction and another reconciliation; the sandbox cannot overwrite or delete them. Consent expiry/revocation blocks reconciliation as well as push; no new post-revocation authority is invented. Cancellation leaves the historic export visible for manual resolution and never sends a blind reversal. External `paid` is ignored; every result has `qualifyingRecoveryProof: false` and no ledger/settlement write path exists.

## Remaining work and verification boundary

In-memory records are not durable idempotency, transactional outbox, database uniqueness, RLS or restart-safety evidence. No schema/migration is introduced (reserved 0462 unused). Production adapters must reuse the approved command/outbox/audit and verified source repositories, persist stable business-effect keys across routes and restarts, and apply actual provider capability/consent/data-flow approvals. HTTP authentication, a browser preview screen, D02 tax/account policy, durable reversal/correction workflows, real Codat onboarding and provider conformance remain unbuilt. Do not wire this fixture model into a live runtime.

The named Vitest file `apps/api/src/accounting-export.sandbox.test.ts` exercises these contracts and failure paths with made-up data. It proves only the synthetic model, not PostgreSQL, browser journeys, regional provider processing or a release. CI and one independent Claude RED review remain required.
