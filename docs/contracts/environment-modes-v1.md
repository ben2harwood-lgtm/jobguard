# Environment modes contract v1

The deployment, from trusted server configuration, selects exactly one mode; API payloads cannot select or mutate it.

- `synthetic_demo`: generated data, test recipients, simulated settlement and journals; isolated credentials/data; visibly labelled.
- `pilot_no_charge`: real data only after G1; supported builder documents may be sent, but no JobGuard fee obligation, collection, or production recovery posting.
- `provider_sandbox`: provider test credentials/events; never production settlement evidence or customer debt.
- `production_billing`: only after G4 and every applicable approved decision; obligations, invoices, settlement and refunds remain separate facts.

Sandbox references are rejected by production execution. Pilot jobs remain no-charge and cannot be retrospectively converted without a new versioned agreement and migration task.

## Pilot G1

G1 starts closed. The server checks the restricted deployment record `JOBGUARD_PILOT_21_APPROVAL` each time a guarded operation runs. The structured `pilot-21-approval.v1` record names the release SHA, topology hash and migration hash and carries dated evidence references for G0, G1, the activation decision and the exact approved D02, D04, D06, D07, D12 and D13 versions. The running deployment supplies the candidate identity through `JOBGUARD_RELEASE_SHA`, `JOBGUARD_PILOT_TOPOLOGY_HASH` and `JOBGUARD_PILOT_MIGRATIONS_HASH`. An active, unexpired record for that exact candidate is required. Operators revoke the record by removing it or replacing it with revoked state and restarting the affected processes with the updated configuration.

Only PILOT-21 installs the approval after acceptance and activation authorization. Request bodies, cookies and queued payloads supply no approval evidence. G1 is an additional check before sign-in, invitations, workspace and portal access, real sends, invoice issue and real Final Check operations. Each operation still needs its own authorization and approved scope. The pilot job-list proof uses a dedicated `PILOT_RUNTIME_DATABASE_URL` with the non-owner runtime credential and the persisted identity connection.

## PILOT-01a practice reference inventory

Paths and line numbers are relative to `apps/web/app/` at base `ee974f0343fee3822f952b0299bc1f4c2ac8ad3d`. The first table covers 243 spaced import lines outside tests and excludes the internal practice composition import at `lib/workspace-server.ts:4`. The second records the additional compact import lines. **Supported** means the listed later piece owns the pilot scope. The practice implementation remains available through its own entry point, and all supported entries except the job-list proof keep their current practice boundary until their assigned piece. **Blocked** entries remain outside pilot.

S refers to `synthetic-server` and W refers to `workspace-server`.

### Baseline references

| Route or helper | Base import lines | Pilot disposition |
| --- | --- | --- |
| `api/auth/oidc/[connectionId]/callback/route.ts` | 4 S | Blocked · practice or fixture-only operation |
| `api/auth/oidc/[connectionId]/start/route.ts` | 4 S | Blocked · practice or fixture-only operation |
| `api/auth/practice/route.ts` | 7 S | Blocked · practice or fixture-only operation |
| `api/auth/scim/[connectionId]/deactivations/route.ts` | 4 S | Blocked · practice or fixture-only operation |
| `api/auth/sso-required/detail/route.ts` | 4 S | Blocked · practice or fixture-only operation |
| `api/auth/sso-required/emergency-notices/route.ts` | 4 S | Blocked · practice or fixture-only operation |
| `api/auth/sso-required/route.ts` | 4 S | Blocked · practice or fixture-only operation |
| `api/auth/sso/[connectionId]/callback/route.ts` | 5 S | Blocked · practice or fixture-only operation |
| `api/auth/sso/[connectionId]/start/route.ts` | 4 S | Blocked · practice or fixture-only operation |
| `api/contractor/audit-exports/route.ts` | 4 W | Blocked · contractor work |
| `api/contractor/baseline/compare/route.ts` | 4 S | Blocked · contractor work |
| `api/contractor/baseline/route.ts` | 4 S | Blocked · contractor work |
| `api/contractor/clients/[clientId]/customer-link/route.ts` | 5 S | Blocked · contractor work |
| `api/contractor/dashboard/route.ts` | 6 S | Blocked · contractor work |
| `api/contractor/jobs/[id]/assignments/route.ts` | 4 W | Blocked · contractor work |
| `api/contractor/jobs/[id]/billing/[action]/route.ts` | 6 S | Blocked · contractor work |
| `api/contractor/jobs/[id]/billing/route.ts` | 5 S | Blocked · contractor work |
| `api/contractor/jobs/[id]/duplicate-candidates/transport.ts` | 7 S | Blocked · contractor work |
| `api/contractor/jobs/[id]/finish/route.ts` | 8 S | Blocked · contractor work |
| `api/contractor/jobs/[id]/office-signals/route.ts` | 7 S | Blocked · contractor work |
| `api/contractor/jobs/[id]/order-check/route.ts` | 5 W | Blocked · contractor work |
| `api/contractor/jobs/[id]/order-lines/route.ts` | 4 W | Blocked · contractor work |
| `api/contractor/jobs/[id]/resident-contact/route.ts` | 5 S | Blocked · contractor work |
| `api/contractor/jobs/[id]/site-extras/[extraId]/proceed/route.ts` | 6 S | Blocked · contractor work |
| `api/contractor/jobs/[id]/site-extras/route.ts` | 5 W | Blocked · contractor work |
| `api/contractor/jobs/[id]/site-extras/sor/route.ts` | 5 W | Blocked · contractor work |
| `api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.ts` | 5 W | Blocked · contractor work |
| `api/contractor/jobs/[id]/site-visits/route.ts` | 4 W | Blocked · contractor work |
| `api/contractor/jobs/[id]/site-visits/start/route.ts` | 5 W | Blocked · contractor work |
| `api/contractor/jobs/[id]/sor-items/recent/route.ts` | 5 W | Blocked · contractor work |
| `api/contractor/jobs/[id]/sor-items/route.ts` | 5 W | Blocked · contractor work |
| `api/contractor/jobs/[id]/supervisor-queries/route.ts` | 6 S | Blocked · contractor work |
| `api/contractor/practice/acting-as/end/route.ts` | 6 S | Blocked · contractor work |
| `api/contractor/practice/acting-as/route.ts` | 6 S | Blocked · contractor work |
| `api/contractor/practice/session/revoke/route.ts` | 6 S | Blocked · contractor work |
| `api/contractor/practice/workers/[workerId]/acting-as/route.ts` | 6 S | Blocked · contractor work |
| `api/contractor/route.ts` | 5 S | Blocked · contractor work |
| `api/contractor/site/jobs/route.ts` | 4 W | Blocked · contractor work |
| `api/contractor/sor-versions/route.ts` | 4 W | Blocked · contractor work |
| `api/contractor/statements/[action]/route.ts` | 7 S | Blocked · contractor work |
| `api/contractor/work-order-imports/[batchId]/route.ts` | 4 W | Blocked · contractor work |
| `api/contractor/work-order-imports/connector-promotions/route.ts` | 5 S | Blocked · contractor work |
| `api/contractor/work-order-imports/route.ts` | 4 W | Blocked · contractor work |
| `api/contractor/work-orders/[workOrderId]/revisions/route.ts` | 4 W | Blocked · contractor work |
| `api/decisions/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/firm-profile/route.ts` | 11 S | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/commercial-integrity/family/route.ts` | 4 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/commercial-integrity/reviews/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/commercial-integrity/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/commercial-integrity/v3/reviews/route.ts` | 4 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/commercial-integrity/v3/route.ts` | 4 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/confirm/route.ts` | 1 S, 2 S/W | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/preview/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/customer-invoices/[invoiceId]/receipts/reversals/route.ts` | 1 S | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/customer-invoices/[invoiceId]/receipts/route.ts` | 1 S | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/customer-invoices/[invoiceId]/route.ts` | 2 S | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/customer-invoices/route.ts` | 5 S, 6 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/customer-messages/route.ts` | 6 S, 7 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/diary/route.ts` | 6 S, 7 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/discard/route.ts` | 4 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/exposure-schedule/route.ts` | 4 W, 5 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/fee-illustration/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/fee-illustration/what-if/route.ts` | 2 S, 3 S | Blocked · practice or fixture-only operation |
| `api/jobs/[id]/final-account/dispositions/route.ts` | 4 S, 5 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/final-account/lock/route.ts` | 4 S, 5 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/final-account/review-extras/route.ts` | 4 S, 5 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/final-account/route.ts` | 2 S | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/final-account/terms/route.ts` | 4 S, 5 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/final-check/catches/route.ts` | 3 S, 4 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/final-check/dispositions/route.ts` | 3 S, 4 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/final-check/disputes/route.ts` | 3 S, 4 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/final-check/route.ts` | 3 S, 4 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/final-check/runs/route.ts` | 3 S, 4 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/historical-evidence/route.ts` | 6 S, 7 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/inbox-metrics/route.ts` | 4 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/materials/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/parties/import-v3/catch/route.ts` | 2 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/parties/import-v3/preview/route.ts` | 2 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/parties/import-v3/route.ts` | 2 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/parties/import-v3/source/route.ts` | 2 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/parties/import/route.ts` | 4 S, 5 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/parties/route.ts` | 4 S, 5 W | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/payment-fees/route.ts` | 3 W | Blocked · platform billing, payments or collections |
| `api/jobs/[id]/practice-facts/route.ts` | 3 W | Blocked · practice or fixture-only operation |
| `api/jobs/[id]/practice-feed/route.ts` | 3 W | Blocked · practice or fixture-only operation |
| `api/jobs/[id]/prevention-checks/[action]/route.ts` | 4 W, 5 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/prevention-checks/route.ts` | 4 W, 5 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/proof/route.ts` | 2 S | Supported · PILOT-04b scoped activation, extras and proof |
| `api/jobs/[id]/proposal/route.ts` | 1 S, 2 S/W | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/purchase-orders/placement/route.ts` | 3 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/purchase-orders/revisions/route.ts` | 3 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/purchase-orders/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/quotes/acceptance/disposition/route.ts` | 2 S | Supported · PILOT-04b scoped activation, extras and proof |
| `api/jobs/[id]/quotes/acceptance/route.ts` | 2 S | Supported · PILOT-04b scoped activation, extras and proof |
| `api/jobs/[id]/quotes/activation/route.ts` | 3 S | Supported · PILOT-04b scoped activation, extras and proof |
| `api/jobs/[id]/quotes/artifacts/[artifactId]/route.ts` | 1 S | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/quotes/delivery/[action]/route.ts` | 2 S | Blocked · manual practice dispatch |
| `api/jobs/[id]/quotes/delivery/route.ts` | 2 S | Supported · PILOT-07 exact approved delivery only |
| `api/jobs/[id]/quotes/preview/route.ts` | 2 S | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/quotes/route.ts` | 1 S | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/readiness/[action]/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/readiness/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/receipt-case-allocations/route.ts` | 4 S | Blocked · platform billing, payments or collections |
| `api/jobs/[id]/reconciliation/[runId]/route.ts` | 6 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/recovery-allocations/reversals/route.ts` | 3 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/recovery-allocations/route.ts` | 3 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/recovery-cases/eligibility/route.ts` | 4 S, 5 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/recovery-cases/route.ts` | 4 S, 5 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/recovery-cases/terms/route.ts` | 4 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/recovery/[action]/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/recovery/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/relevance-inbox/[action]/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/relevance-inbox/decisions/[decisionId]/route.ts` | 5 S, 6 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/relevance-inbox/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/review/route.ts` | 1 S, 2 S/W | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/route.ts` | 1 S, 5 S, 6 W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/shadow-demo/customer-link/route.ts` | 5 S | Blocked · practice or fixture-only operation |
| `api/jobs/[id]/shadow-demo/review-inputs/route.ts` | 4 S | Blocked · practice or fixture-only operation |
| `api/jobs/[id]/shadow-demo/route.ts` | 4 S | Blocked · practice or fixture-only operation |
| `api/jobs/[id]/shadow-demo/source-hold/route.ts` | 4 S | Blocked · practice or fixture-only operation |
| `api/jobs/[id]/success-fee-attribution/route.ts` | 3 W | Blocked · platform billing, payments or collections |
| `api/jobs/[id]/success-fees/collection/demo-settle/route.ts` | 3 W | Blocked · platform billing, payments or collections |
| `api/jobs/[id]/success-fees/collection/route.ts` | 3 W | Blocked · platform billing, payments or collections |
| `api/jobs/[id]/success-fees/money-check/route.ts` | 3 W | Blocked · platform billing, payments or collections |
| `api/jobs/[id]/success-fees/route.ts` | 3 W | Blocked · platform billing, payments or collections |
| `api/jobs/[id]/success-fees/statements/[statementId]/route.ts` | 3 W | Blocked · platform billing, payments or collections |
| `api/jobs/[id]/success-fees/statements/route.ts` | 3 W | Blocked · platform billing, payments or collections |
| `api/jobs/[id]/supplier-documents/facts/confirm/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-documents/intake/route.ts` | 3 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-documents/receipts/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-documents/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-lines/route.ts` | 6 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-matches/corrections/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-matches/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/things-to-check/[action]/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/things-to-check/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/trial-final-check/route.ts` | 6 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/value/route.ts` | 2 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/value/v3/route.ts` | 3 W, 7 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/variations/route.ts` | 3 S | Supported · PILOT-04b scoped activation, extras and proof |
| `api/jobs/[id]/work-state/route.ts` | 3 S, 4 W | Supported · PILOT-04b scoped activation, extras and proof |
| `api/jobs/capture/route.ts` | 1 S, 6 S, 7 W | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/route.ts` | 4 S, 7 W, 9 S | Supported · PILOT-01a job-list proof, PILOT-04a job list |
| `api/material-rates/route.ts` | 4 S, 5 W | Blocked · out of scope for current pilot migrations |
| `api/meter/jobs/[id]/import-v3/[action]/route.ts` | 6 S | Blocked · out of scope for current pilot migrations |
| `api/practice-company/route.ts` | 6 S | Blocked · practice or fixture-only operation |
| `api/quotes/preview/route.ts` | 5 S | Supported · PILOT-04a scoped capture and quote |
| `api/recovery-cases/[id]/evidence-packs/[packId]/attachment-approval/route.ts` | 1 S, 4 W | Blocked · out of scope for current pilot migrations |
| `api/recovery-cases/[id]/evidence-packs/[packId]/download/route.ts` | 1 S, 4 W | Blocked · out of scope for current pilot migrations |
| `api/recovery-cases/[id]/evidence-packs/[packId]/inspect/route.ts` | 1 S, 4 W | Blocked · out of scope for current pilot migrations |
| `api/recovery-cases/[id]/evidence-packs/route.ts` | 1 S, 4 W | Blocked · out of scope for current pilot migrations |
| `api/recovery-cases/[id]/follow-ups/[followUpId]/commands/route.ts` | 1 S, 4 W | Blocked · out of scope for current pilot migrations |
| `api/recovery-cases/[id]/follow-ups/route.ts` | 1 S, 4 W | Blocked · out of scope for current pilot migrations |
| `api/recovery-cases/[id]/messages/[messageId]/commands/route.ts` | 1 S, 4 W | Blocked · out of scope for current pilot migrations |
| `api/recovery-cases/[id]/messages/route.ts` | 1 S, 4 W | Blocked · out of scope for current pilot migrations |
| `api/sandbox/runs/[id]/[action]/route.ts` | 1 S, 2 W | Blocked · practice or fixture-only operation |
| `api/sandbox/runs/[id]/route.ts` | 1 S, 2 W | Blocked · practice or fixture-only operation |
| `api/sandbox/runs/route.ts` | 1 S, 2 W | Blocked · practice or fixture-only operation |
| `api/session/route.ts` | 2 S, 6 S | Blocked · practice or fixture-only operation |
| `api/test-support/drain/route.ts` | 3 S | Blocked · practice or fixture-only operation |
| `api/value/route.ts` | 3 W, 7 S | Blocked · out of scope for current pilot migrations |
| `contractor/jobs/[id]/possible-extras/page.tsx` | 3 S | Blocked · contractor work |
| `jobs/[id]/page.tsx` | 9 S | Blocked · out of scope for current pilot migrations |
| `jobs/[id]/signal-to-noise/page.tsx` | 5 S | Blocked · out of scope for current pilot migrations |
| `lib/accounting-export-server.ts` | 5 S | Blocked · out of scope for current pilot migrations |
| `lib/cis-fixture-server.ts` | 7 S | Blocked · practice or fixture-only operation |
| `lib/direct-debit-practice-server.ts` | 5 S | Blocked · platform billing, payments or collections |
| `lib/dunning-server.ts` | 6 S | Blocked · platform billing, payments or collections |
| `lib/evidence-bundle-server.ts` | 7 S | Blocked · out of scope for current pilot migrations |
| `lib/evidence-hold-server.ts` | 7 S | Blocked · out of scope for current pilot migrations |
| `lib/financial-reconciliation-adjustments-server.ts` | 7 S | Blocked · out of scope for current pilot migrations |
| `lib/interim-draft-server.ts` | 5 S | Blocked · out of scope for current pilot migrations |
| `lib/job-import-v3-error.ts` | 5 S | Blocked · out of scope for current pilot migrations |
| `lib/managed-recovery-server.ts` | 8 S | Blocked · out of scope for current pilot migrations |
| `lib/merchant-order-server.ts` | 5 S | Blocked · out of scope for current pilot migrations |
| `lib/merchant-reliability-server.ts` | 5 S | Blocked · out of scope for current pilot migrations |
| `lib/meter-server.ts` | 5 S | Blocked · platform billing, payments or collections |
| `lib/northside-server.ts` | 10 S | Blocked · contractor work |
| `lib/notice-fixture-server.ts` | 5 S | Blocked · practice or fixture-only operation |
| `lib/observation-evidence-server.ts` | 6 S | Blocked · out of scope for current pilot migrations |
| `lib/pay-now-attempt-server.ts` | 4 S | Blocked · platform billing, payments or collections |
| `lib/platform-documents-server.ts` | 8 S | Blocked · platform billing, payments or collections |
| `lib/possible-extras-server.ts` | 5 S | Blocked · contractor work |
| `lib/practice-bank-server.ts` | 5 S | Blocked · platform billing, payments or collections |
| `lib/prompt-sources-server.ts` | 7 S | Blocked · out of scope for current pilot migrations |
| `lib/rate-suggestion-server.ts` | 8 S | Blocked · out of scope for current pilot migrations |
| `lib/recovery-billability-server.ts` | 8 S | Blocked · platform billing, payments or collections |
| `lib/recurring-extras-server.ts` | 8 S | Blocked · out of scope for current pilot migrations |
| `lib/retention-record-server.ts` | 5 S | Blocked · out of scope for current pilot migrations |
| `lib/small-builder-demo-server.ts` | 5 S | Blocked · out of scope for current pilot migrations |
| `lib/subscription-mandate-server.ts` | 9 S | Blocked · platform billing, payments or collections |
| `lib/subscription-server.ts` | 5 S | Blocked · platform billing, payments or collections |
| `lib/trial-server.ts` | 7 S | Blocked · out of scope for current pilot migrations |
| `lib/vat-fixture-server.ts` | 5 S | Blocked · practice or fixture-only operation |
| `practice-company/page.tsx` | 6 S | Blocked · out of scope for current pilot migrations |

### Additional compact imports

| Route or helper | Base import lines | Pilot disposition |
| --- | --- | --- |
| `api/decisions/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/commercial-integrity/reviews/route.ts` | 3 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/commercial-integrity/route.ts` | 3 S | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/preview/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/customer-invoices/[invoiceId]/receipts/reversals/route.ts` | 3 S, 4 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/customer-invoices/[invoiceId]/receipts/route.ts` | 3 S, 4 W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/customer-invoices/[invoiceId]/route.ts` | 3 S/W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/fee-illustration/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/fee-illustration/what-if/route.ts` | 4 S/W | Blocked · practice or fixture-only operation |
| `api/jobs/[id]/final-account/route.ts` | 3 S/W | Supported · PILOT-05 approved scope only |
| `api/jobs/[id]/materials/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/proof/route.ts` | 3 S/W | Supported · PILOT-04b scoped activation, extras and proof |
| `api/jobs/[id]/purchase-orders/placement/route.ts` | 4 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/purchase-orders/revisions/route.ts` | 4 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/purchase-orders/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/quotes/acceptance/disposition/route.ts` | 3 S/W | Supported · PILOT-04b scoped activation, extras and proof |
| `api/jobs/[id]/quotes/acceptance/route.ts` | 3 S/W | Supported · PILOT-04b scoped activation, extras and proof |
| `api/jobs/[id]/quotes/activation/route.ts` | 4 S/W | Supported · PILOT-04b scoped activation, extras and proof |
| `api/jobs/[id]/quotes/artifacts/[artifactId]/route.ts` | 2 S/W | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/quotes/delivery/[action]/route.ts` | 3 S/W | Blocked · manual practice dispatch |
| `api/jobs/[id]/quotes/delivery/route.ts` | 3 S/W | Supported · PILOT-07 exact approved delivery only |
| `api/jobs/[id]/quotes/preview/route.ts` | 3 S/W | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/quotes/route.ts` | 2 S/W | Supported · PILOT-04a scoped capture and quote |
| `api/jobs/[id]/readiness/[action]/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/readiness/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/recovery/[action]/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/recovery/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/relevance-inbox/[action]/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/relevance-inbox/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-documents/facts/confirm/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-documents/intake/route.ts` | 4 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-documents/receipts/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-documents/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-matches/corrections/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/supplier-matches/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/things-to-check/[action]/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/things-to-check/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/value/route.ts` | 3 S/W | Blocked · out of scope for current pilot migrations |
| `api/jobs/[id]/variations/route.ts` | 4 S/W | Supported · PILOT-04b scoped activation, extras and proof |

## Pilot resource binding

The web server validates the pilot deployment at its pilot composition boundary. API and worker processes validate at startup. The deployment sets `JOBGUARD_ENV=pilot_no_charge` and provides `JOBGUARD_PILOT_RESOURCES`, a restricted `pilot-resources.v1` JSON record with a `sha256` map of setting names to digests of the exact injected values. Generate the record from the approved inventory and keep it in deployment configuration. Use high-entropy independent credentials, store the record separately from application inputs, and update the record with the corresponding credentials when rotating them. Configuration failures emit stable refusal codes. Keep values and credential fingerprints out of logs.

- Use different HTTPS hosts whose names start with `pilot.` or `pilot-` for browser and API traffic. The browser workspace checks its bound origin. The Nest pilot entry point checks its exact Host and permits its listed health and identity routes. It refuses practice cookies, sandbox routes and callbacks, and payment routes and events. The pilot builder cookie is `__Host-jobguard_pilot_session` with Secure, HttpOnly and a root path. The distinct customer cookie name is reserved until the pilot portal is connected. Legacy Next identity routes stay in practice.
- Use a dedicated `jobguard_pilot` business database or a suffixed pilot business database and separate runtime and identity logins with unique passwords. Identity tables are co-located for the current verified business session binding. Validate the server's actual database and login and refuse superuser, database-owner membership, role creation, database creation, replication and RLS bypass. Provision grants and network access only for the respective resource.
- Bind the storage endpoint, region, access ID, secret and dedicated `jobguard-pilot-` bucket. Object keys start with `pilot_no_charge/`. A private storage operation checks bucket versioning and uses explicit object versions for reads and deletes. The pilot storage adapter is available for its later proof route. The current pilot job-list composition does not handle objects.
- Use a dedicated worker login and separate `jobguard_pilot_queue` database and schema with a unique queue login secret. In this slice the pilot worker only registers refusal handlers for legacy effect tasks. No legacy fixture ports, discovery schedules or money handlers run there. The later pilot execution slices own their effect ports and producers. Existing execution checks still apply at each effect.
- The synthetic bootstrap refuses pilot database names and connection options that could redirect its target. The synthetic restore rehearsal uses only the cluster it creates. The pilot restore preflight (`node tools/pilot-restore-target.mjs`) checks a separately bound restore database host, login, storage endpoint, bucket and credentials, and requires `JOBGUARD_COMMERCIAL_OUTBOUND=paused`. Applying a backup and reconciling before resume are later restore work.

Provisioning, deployed credential checks, and a real restore remain G1 release evidence. The resource manifest grants no G1 approval and cannot enable billing.
