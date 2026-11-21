# Foundation gates: G0 evidence pack and G1 checklist

M0-13d historical pack · PILOT-11-EVIDENCE-INDEX (RED release evidence) · NOPR=1.

**G0 is not met. G1 is not met. This piece opens no gate (G0–G5).**
The pack is a complete index of requirements, not complete foundation acceptance.
M0-13d acceptance remains open wherever evidence or human approval is missing.
No real personal data, real commercial sends, live providers, payments or releases
are authorized by this document or by successful validation.

The authoritative rows are in [foundation-gates.v1.json](../../config/foundation-gates.v1.json).
Requirements quote [BUILD_PLAN.md](../../BUILD_PLAN.md), lines 163–164;
G0 also includes its separate technical acceptance prerequisite, and the independently
restricted checkpoint required before G1 is from line 306. The task is at lines
2702–2708. The privacy requirement is split by decision (D07/D12), backup/restore
by evidence, and contractor signatures by pilot agreement/DPA so none can disappear
inside a combined status. Each JSON row records its exact plan line.

`evidence_present` means the cited material is present for that requirement only.
It does not mean owner acceptance, a deployed test pass, or professional sign-off.
`blocked` and `needs_owner_approval` always carry a nonempty reason. Evidence linked
on a blocked row is background or partial evidence; it does not satisfy that row.
All `ownerApproval` fields are null. No approval, approver name, approval date or
signature has been supplied or created by this piece.

## Existing authoritative checklist (unchanged by the pilot index)

The evidence paths and reasons below are taken from the JSON pack. An em dash in
the approval column means **no owner approval recorded**.

| Requirement / plan line | Status | Owner approval | Existing evidence or context | Block |
|---|---|---|---|---|
| `g0-m0` — M0 tasks pass (163) | `blocked` | — | [BUILD_PLAN.md](../../BUILD_PLAN.md) | No complete current-head M0 acceptance evidence; M0-13a/b/c deployed evidence and owner decisions remain outstanding. |
| `g0-contracts` — contracts are versioned (163) | `evidence_present` | — | [docs/contracts/authentication-v1.md](../../docs/contracts/authentication-v1.md)<br>[docs/contracts/environment-modes-v1.md](../../docs/contracts/environment-modes-v1.md)<br>[docs/contracts/provider-data-flow-v1.md](../../docs/contracts/provider-data-flow-v1.md)<br>[docs/contracts/pilot-terms-v1.md](../../docs/contracts/pilot-terms-v1.md) | None for this evidence row; gate remains unmet. |
| `g0-policies` — pending policies fail closed (163) | `blocked` | — | [packages/config/src/policy-gates.ts](../../packages/config/src/policy-gates.ts)<br>[packages/config/src/enterprise-real-data.ts](../../packages/config/src/enterprise-real-data.ts) | Source contains fail-closed controls, but no complete current-head verification of all pending-policy production paths is recorded. |
| `g0-postgres` — critical tests run on real PostgreSQL (163) | `blocked` | — | [packages/db/test/tenancy.integration.test.ts](../../packages/db/test/tenancy.integration.test.ts)<br>[packages/db/test/audit.integration.test.ts](../../packages/db/test/audit.integration.test.ts)<br>[packages/db/test/ledger.integration.test.ts](../../packages/db/test/ledger.integration.test.ts)<br>[docs/operations/synthetic-restore-receipt-2026-09-20.json](../../docs/operations/synthetic-restore-receipt-2026-09-20.json) | Tests and a historical synthetic PostgreSQL rehearsal exist; neither proves the critical suite passed at this commit. |
| `g0-acceptance` — separate technical acceptance (163) | `needs_owner_approval` | — | None supplied | Separate technical acceptance has not been supplied; agent source inspection is not acceptance. |
| `g1-d04` — Approved processor/data-flow register (D04) (164) | `needs_owner_approval` | — | [docs/decisions/d04-providers-residency.md](../../docs/decisions/d04-providers-residency.md)<br>[docs/contracts/provider-data-flow-v1.md](../../docs/contracts/provider-data-flow-v1.md) | D04 remains proposed; route descriptions and the register schema are not approved deployed provider evidence. |
| `g1-invoice` — supported invoice/tax scope (164) | `needs_owner_approval` | — | [docs/decisions/d02-vat-rounding-invoicing.md](../../docs/decisions/d02-vat-rounding-invoicing.md)<br>[docs/decisions/d06-builder-invoices-customer-approval-jurisdiction.md](../../docs/decisions/d06-builder-invoices-customer-approval-jurisdiction.md) | Supported pilot invoice/tax/jurisdiction scope has no supplied owner approval; proposed policies do not grant it. |
| `g1-permissions` — permissions (164) | `blocked` | — | [docs/contracts/authentication-v1.md](../../docs/contracts/authentication-v1.md)<br>[docs/operations/m0-6l-identity.md](../../docs/operations/m0-6l-identity.md) | Identity implementation notes are not deployed permission/revocation acceptance evidence. |
| `g1-d07` — privacy/retention procedure (D07, D12) (164) | `needs_owner_approval` | — | [docs/decisions/d07-retention-recovery-operations.md](../../docs/decisions/d07-retention-recovery-operations.md) | D07 remains proposed; deployed retention/export/deletion rehearsal and approved recovery objectives remain outstanding. |
| `g1-d12` — privacy/retention procedure (D07, D12) (164) | `needs_owner_approval` | — | [docs/decisions/d12-data-protection-role-third-party-transparency.md](../../docs/decisions/d12-data-protection-role-third-party-transparency.md) | D12 remains proposed; approved privacy procedure and controller instructions are outstanding. |
| `g1-secrets` — secret management (164) | `blocked` | — | [BUILD_PLAN.md](../../BUILD_PLAN.md) | No deployed secrets/least-privilege evidence supplied for M0-13a. |
| `g1-alerts` — alerts (164) | `blocked` | — | [BUILD_PLAN.md](../../BUILD_PLAN.md) | No deployed alert delivery, incident ownership or alert rehearsal evidence supplied for M0-13a. |
| `g1-backup` — backup and successful restore evidence (164) | `blocked` | — | [docs/operations/synthetic-restore-rehearsal.md](../../docs/operations/synthetic-restore-rehearsal.md) | Synthetic fixture backup instructions do not establish deployed database/object-version/checkpoint backups. |
| `g1-restore` — backup and successful restore evidence (164) | `blocked` | — | [docs/operations/synthetic-restore-receipt-2026-09-20.json](../../docs/operations/synthetic-restore-receipt-2026-09-20.json) | The historical synthetic receipt is not M0-13b: actual deployed backup restore, recovery/data-loss measurements and disabled-dispatch reconciliation remain outstanding. |
| `g1-outbound` — outbound kill switch (164) | `blocked` | — | [BUILD_PLAN.md](../../BUILD_PLAN.md) | No deployed commercial-outbound disable/recovery evidence supplied; audit/evidence preservation must be demonstrated. |
| `g1-terms` — approved no-charge pilot terms (164) | `needs_owner_approval` | — | [docs/contracts/pilot-terms-v1.md](../../docs/contracts/pilot-terms-v1.md) | Contract text states no platform charge but no owner-approved pilot terms were supplied. |
| `g1-d13` — D13 approval of the Final Check disclosure (164) | `needs_owner_approval` | — | [docs/decisions/d13-shadow-attribution-delayed-disclosure.md](../../docs/decisions/d13-shadow-attribution-delayed-disclosure.md) | D13 remains proposed; Final Check disclosure approval must come from the owner. |
| `g1-contractor-pilot` — a signed pilot agreement (164) | `blocked` | — | [docs/contracts/pilot-terms-v1.md](../../docs/contracts/pilot-terms-v1.md)<br>[packages/config/src/enterprise-real-data.ts](../../packages/config/src/enterprise-real-data.ts) | No ENT-14 signed contractor pilot agreement or solicitor/founder approval evidence supplied; the gate schema is not a signature. |
| `g1-contractor-dpa` — data processing agreement (ENT-14) (164) | `blocked` | — | [docs/decisions/d12-data-protection-role-third-party-transparency.md](../../docs/decisions/d12-data-protection-role-third-party-transparency.md)<br>[packages/config/src/enterprise-real-data.ts](../../packages/config/src/enterprise-real-data.ts) | No ENT-14 signed DPA/contract-set evidence supplied. Real contractor data stays blocked. |
| `g1-contractor-d12` — D12 v4 (164) | `needs_owner_approval` | — | [docs/decisions/d12-data-protection-role-third-party-transparency.md](../../docs/decisions/d12-data-protection-role-third-party-transparency.md) | D12 v4 remains proposed; existing version text does not supply founder approval. |
| `g1-checkpoint` — Keep an independently restricted checkpoint (306) | `blocked` | — | [BUILD_PLAN.md](../../BUILD_PLAN.md)<br>[packages/db/test/audit.integration.test.ts](../../packages/db/test/audit.integration.test.ts) | Audit test source is not evidence of a restricted checkpoint deployed before G1. |

## PILOT-11 evidence production map — 21 November 2026

This is only the immediately startable **PILOT-11-EVIDENCE-INDEX** slice.
PILOT-11 remains **part complete** until its dependent fixtures and exact-head
receipts exist. The adopted plan was inspected with
`git show eefbdcd7dfdd13e0f81598c3e905ae65b07ed738:docs/plans/PILOT-G1-PLAN.md`;
that plan is not on this base and is not imported here. Source inventory base:
`ee974f0343fee3822f952b0299bc1f4c2ac8ad3d`. No artifact listed below is a new
successful run. The JSON linked above remains the sole row/status authority.
**G0 and G1 remain unmet; every approval remains missing.**

PILOT-01a owns the server gate and pilot workspace implementation; PILOT-01b owns
resource isolation. This index changes neither. Producing-piece assignments below
are future responsibilities from the adopted plan, not claims of delivery. No new
status store, runner or validator is introduced. Contractor access, platform
charging and gates G2–G5 stay closed.

### Required receipt binding for every applicable row

Every future row receipt must identify the full candidate SHA, dated run and
producer/operator, command or operator procedure actually used, result (including
failures/skips), artifact reference/hash, exact topology/resource and role bindings,
and ordered migration names/hashes. For a document-only row, identify the candidate's
same topology/migration manifest and the exact contract version/hash; do not imply
the document ran a database test. Record exact policy versions and, wherever approval
is required, named approver, date and evidence reference/hash. Missing fields remain
missing; a proposed policy or blank operator slot is not an approval. No secret or
participant details belong in Git.

Synthetic CI receipts, authorized deployed fictional rehearsals, independent RED
review at the exact head, **separate G0 technical acceptance**, and **Ben's G1
activation decision** are distinct evidence. None substitutes for another. PILOT-21
must bind them to the same candidate, topology, migrations and policies; a changed
candidate needs affected evidence rebound. Its technical acceptor must be separate
from builder and checker. Activation is recorded only after Ben authorizes the named
candidate with all applicable rows satisfied; passing this index cannot activate it.

### Five G0 rows

Runner references below point to the inventory and matrix in this document.
All row receipts additionally require the binding above.

| Gate row | Producing PILOT pieces | Existing artifact / runner | Required future receipt and remaining block |
| --- | --- | --- | --- |
| `g0-m0` | 01a/b, 02–09 (including 04a/b), 11, 17–21 | [BUILD_PLAN M0 exit](../../BUILD_PLAN.md); existing CI commands in runner inventory | Complete M0 exit matrix with current-head foundation, deployed M0-13a/b/c evidence and all failures accounted for. Integrated pilot receipts and separate acceptance are absent. |
| `g0-contracts` | 01a/b, 02–09, 11, 14–16, 21 | Existing authentication, environment, provider and pilot-terms links in the authoritative checklist; foundation pack check | Bind versioned command/event/auth/environment contracts and exact document hashes to candidate and caller checks. Existing `evidence_present` only records files; pilot contract reconciliation and runtime proof are pending. |
| `g0-policies` | 01a/b, 02–09, 11, 14–16, 21 | [policy gate source](../../packages/config/src/policy-gates.ts), policy tests and foundation check below | Refusals for absent/proposed/pending, wrong-version and superseded policies, plus each server entry point/executor with either G0 or G1 pending. Unit controls exist; integrated pilot refusal runner/receipt is pending 01a/b and 02–09. |
| `g0-postgres` | 01a/b, 02–09, 11, 20 | Critical DB tests and fresh/upgrade matrix below; historical synthetic restore receipt in checklist | Current-head real-PostgreSQL pass/fail matrix, installed catalogs/grants/RLS, concurrency and rollback results on the candidate migration set. No current pilot matrix receipt; historical results cannot satisfy it. |
| `g0-acceptance` | 21, consuming 11 and 17–20 | No acceptance artifact or automated acceptance runner supplied | Ben's named separate technical acceptor must record dated acceptance of exact candidate and evidence pack, separately from builder/checker. Actor and acceptance are missing; CI cannot create them. |

### Thirteen applicable small-builder G1 rows

The proposed versions named here are identifiers to reconcile and approve, never
approvals: D02 `reference_tax_invoice_policy_v1`, D04
`provider_residency_policy_v1`, D06 `customer_approval_jurisdiction_policy_v2`,
D07 `pilot_data_operations_policy_v1`, D12
`third_party_data_protection_policy_v4`, D13 `shadow_attribution_policy_v3`.
PILOT-15 must reconcile MON-5's D12 v3 reference with the current v4 and bind the
exact approved small-builder scope. A reviewed successor must be explicitly bound;
never substitute a version silently.

| Gate row | Producing PILOT pieces | Existing artifact / runner | Required future receipt and remaining block |
| --- | --- | --- | --- |
| `g1-d04` | 08, 12, 13, 17 | [Provider register](provider-register.md), [identity email flow](identity-email-data-flow.md), D04/checklist; register checker | Dated D04 approval of exact accounts/routes, regions, subprocessors, logs/backups, retention and fallback refusal, including email/domain. Actual destination verification and approval are missing; generated register is source inventory only. |
| `g1-invoice` | 04a/b, 05, 06, 14 | D02/D06/checklist; [invoice fixture](../../apps/web/e2e/customer-invoice.spec.ts) | Legal/tax review and dated exact D02/D06 scope/template/notice approval, supported GBP/VAT positive cases and unsupported-case refusals at issue. Approved scope and integrated pilot invoice receipt are absent. |
| `g1-permissions` | 01a/b, 02–07 (including 04a/b), 17, 20 | [Identity notes](m0-6l-identity.md); identity, tenancy, portal and LP tests below | Verified builder/customer authority, job/document scope, current membership/revocation, edge provenance, least-privileged pooled-role checks and independent human LP-9 review. Deployed proof and integrated pilot coverage remain missing. |
| `g1-d07` | 09, 15, 18, 19 | D07/checklist; [privacy procedure](privacy-operations.md), [restore runbook](restore-runbook.md), privacy fixture | Dated D07 approval of retention/expiry/exceptions, measured recovery objectives and tombstone/restore rules; deployed privacy/restore receipts. Proposed targets and synthetic inventory are insufficient; approval and rehearsal are missing. |
| `g1-d12` | 06, 09, 15, 18 | D12/checklist; privacy procedure and portal fixture | Dated exact small-builder D12 approval with reconciled v3/v4 gate, controller scope, DPIA, notices/Article 14 and customer-message purposes, then deployed access/export/delete/revoke receipt. Approval, reconciliation and full-data-class rehearsal are missing. |
| `g1-secrets` | 01b, 08, 17, 20 | [Incident/deployment notes](incident-ownership.md); local-only preflight below | Deployed secret separation/rotation, artifact/log redaction, no owner credential in services and exact non-owner grants with authorized/refused cases. Deployment access and operator proof are absent; local preflight cannot stand in. |
| `g1-alerts` | 08, 17 | Incident ownership; [outbox fixture](../../packages/db/test/outbox.integration.test.ts) is only partial background | Dated operator proof of host-supervised worker kill/restart, heartbeat/backlog recovery, failed backup/unknown-send/storage alerts delivered to named responders while Ben's Mac is disconnected. No complete pilot alert runner or deployed delivery/ownership receipt supplied. |
| `g1-backup` | 08, 17, 19 | [Synthetic restore instructions](synthetic-restore-rehearsal.md), restore runbook; `pnpm test:restore` | Scheduled deployed database, object-version and independent-checkpoint backups, encryption/access/expiry and exact backup identifiers. Real topology backup proof and approved D07 are absent; synthetic runner is not a deployed backup job. |
| `g1-restore` | 15, 17–20 | Historical [synthetic receipt](synthetic-restore-receipt-2026-09-20.json), restore runbook; restore/LP fixtures | Actual isolated restore from deployed fictional backups; measured RPO/RTO against approved D07, hashes/versions, catalog/RLS, checkpoint verification, reapplied tombstones/revocations and paused reconciliation before resume without replay. Deployed receipt and approvals missing. |
| `g1-outbound` | 03, 07, 08, 13, 17, 20 | [Pause runbook](commercial-outbound-pause.md); outbox/pause fixtures | Exact-artifact authorization, stop/drain/paused claims preserving queued work/audit/evidence, unknown-outcome reconciliation and two independent operator logins authorizing exact resume. Fake fixture exists; integrated pilot and deployed operator receipts are missing. |
| `g1-terms` | 05, 15, 16 | [Pilot terms](../contracts/pilot-terms-v1.md); no pilot onboarding acceptance runner supplied | Legal review and dated approval of exact `pilot_no_charge_v1` or reviewed successor, recorded before first job, with zero charges and historic no-charge entitlement preserved. Reconcile old `reference_fee_policy_v1` hypothetical text with approved disclosure. Approval/onboarding receipt missing. |
| `g1-d13` | 05, 09, 15, 16 | D13/checklist; [lock/reveal fixture](../../packages/db/test/final-account-lock-reveal.integration.test.ts) | Dated exact D13 small-builder disclosure/wording approval, threshold/exceptions/disputes, permanent pre-lock disclosure ineligibility and measurement arm off unless expressly approved. Integrated pre-lock isolation/post-lock reveal proof and legal/owner approval are missing. |
| `g1-checkpoint` | 08, 17, 19, 20 | Audit/checkpoint fixtures below; `pnpm handoff:audit-checkpoint` | Restricted destination independent of business runtime and primary DB; tenant/sequence/hash/recorded time; runtime write denial, mismatch and tail-loss detection, backup/restore verification. Fixture handoff does not prove an independently deployed checkpoint; deployed receipt is absent. |

### Contractor scope blocks — all three rows preserved

| Gate row | Producer / existing context | Small-builder scope block and future requirement |
| --- | --- | --- |
| `g1-contractor-pilot` | No small-builder PILOT producer; future ENT-14. Pilot terms and enterprise gate source remain linked above. | Out of this cohort; **contractor access blocked**. No signed agreement, solicitor/founder approval or signature-verifying runner supplied. Future separately reviewed contractor evidence must bind signed version, dated signatories/approvers and candidate/topology/migrations; small-builder acceptance cannot satisfy it. |
| `g1-contractor-dpa` | No small-builder PILOT producer; future ENT-14. D12 and enterprise gate source remain linked above. | Out of this cohort; **contractor access blocked**. Signed DPA/contract-set and solicitor/founder approvals missing; no signature-verifying runner supplied. Require exact signed versions, dated parties/approvers and release binding in a separate contractor slice. |
| `g1-contractor-d12` | No contractor approval produced by PILOT-15; future contractor approval owner. D12 v4 remains proposed. | Out of this cohort; **contractor access blocked**. Exact contractor D12 v4 dated founder approval missing; small-builder approval confers none. Retain existing `needs_owner_approval` status and future release-bound approval evidence. |

### Existing runner inventory and limits

These commands/paths exist at the inspected base. They were **not run for pilot
acceptance** by this slice. Run database/browser work later in CI or an authorized
isolated environment, never against real participants under this index.

| Existing runner | What it can provide; limit |
| --- | --- |
| Root [package scripts](../../package.json): `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` | Normal candidate checks; [CI](../../.github/workflows/ci.yml) separates Node/non-DB and sharded DB work. Required green CI still belongs to the eventual landing head. |
| `node --test tools/foundation-gates.test.mjs` | Offline committed JSON/plan/file validation; asserts G0/G1 `not_met`, null approvals and no contractor evidence. No runtime gate or prose-completeness check. |
| `node tools/agent-lane-boundary-lint.mjs` | Existing lane/path check, not release review; local CLI refuses a self-comparison when HEAD equals base. |
| `node tools/provider-register.mjs` | Read-only generated-register consistency check; neither destination verification nor D04 approval. |
| `pnpm test:db` | Existing DB suite; [DB script](../../packages/db/package.json) uses Vitest 4.1.12 with `--maxWorkers=1`. Actual PostgreSQL/catalog results needed, not test-file presence. |
| `pnpm test:migrations` | Currently names only tenancy and demo-bootstrap tests. Does not alone cover every upgrade path; include affected named upgrade tests and migration proofs in integrated matrix. |
| `pnpm test:restore` | [Synthetic restore tool](../../packages/db/tools/synthetic-restore.mjs), fictional backup/restore only; not PILOT-19 deployed recovery. |
| `pnpm handoff:audit-checkpoint` | [Handoff CLI](../../packages/db/src/audit-checkpoint-handoff-cli.ts), not proof of independently provisioned checkpoint storage. |
| `pnpm test:e2e --workers=1 --project=mobile-360 --project=desktop m1-15-complete-journey.spec.ts` | Existing synthetic practice journey at phone/desktop sizes; includes fake delivery/acceptance and illustrative fee UI. Not isolated pilot sign-in, full Final Check or zero-platform-effects proof. |
| [Local deployment preflight](../../tools/deployment-preflight.mjs) | Requires build output and two fixture tenants; explicitly refuses non-loopback databases. No existing deploy-validation command may be repurposed to claim deployed pilot acceptance. |

For targeted existing Vitest files, use the package's installed runner, at most
three named files per invocation, with explicit `--maxWorkers=1` (or 2 where
permitted). Paths below are **inventory**, not commands claimed executed. Missing
pilot fixtures have no runnable name yet. Operator-only deployed procedures use
approved access and the existing runbooks; PILOT-08/17–20 must supply the actual
reviewed tooling and dated receipts rather than inventing a command here.

### Integrated fixture matrix — pending parent PILOT-11

Every matrix row needs the receipt binding above and actual pass/fail output.
All integrated pilot runs remain pending **PILOT-01a/b and PILOT-02–09**, including
PILOT-04a/b. Existing tests are reusable partial coverage, not proof the new pilot
composition works. PILOT-11 assembles the receipts; the named feature pieces
produce missing fixtures. Deployed and approval work remains with PILOT-12–21.

| Required check | Existing source / runner coverage | Missing pilot evidence and producing pieces |
| --- | --- | --- |
| Fresh install and upgrade | [Tenancy](../../packages/db/test/tenancy.integration.test.ts), [identity upgrade](../../packages/db/test/identity.integration.test.ts), [outbound upgrade](../../packages/db/test/commercial-outbound-pause-upgrade.integration.test.ts); `pnpm test:migrations` plus affected upgrades via DB runner | 01a/b, 02–09: candidate migrations fresh and from previous supported schema, unchanged predecessor facts and reviewed recovery strategy; full integrated receipts missing. |
| Catalogs, grants and RLS | [LP-0 comparator tests](../../packages/db/test/lp-0-catalog.test.ts), [preflight integration](../../packages/db/test/deployment-preflight.integration.test.ts), tenancy; DB runner | 01a/b, 02–09, 20: installed actual roles/owners/grants/policies/FORCE RLS/tenant-qualified FKs, pooled least-privilege positive/refusal and committed-state cases; comparator unit tests alone insufficient. |
| Identity and tenancy | [API identity](../../apps/api/src/auth/identity.test.ts), DB identity/tenancy, [portal journey](../../apps/web/e2e/MON-5-customer-journey.spec.ts); package Vitest/E2E runners | 01a/b, 02, 04a/b, 06, 09: fake-delivered builder/customer sign-in, verified membership/job scope, revocation, pool reuse, wrong-tenant/job/role and excluded practice resources; isolated pilot runner/receipt missing. |
| Concurrency and rollback | [Audit](../../packages/db/test/audit.integration.test.ts), identity, outbox; DB runner | 01a/b, 02–07, 09: concurrent single-use challenges, duplicate/replayed commands, expected revisions, domain/audit/work rollback and lock ordering in pilot composition; receipt missing. |
| Outbox / fake delivery | [Outbox](../../packages/db/test/outbox.integration.test.ts), outbound upgrade; DB runner | 03, 07, 08: after-commit exact artifact/recipient dispatch, duplicate/restart/revoked approval, rejected/retryable/unknown outcomes without blind retry, pause/drain/reconcile/two-person resume. Integrated fake adapter fixtures/receipts pending. |
| Audit / ledger / checkpoint | Audit, [ledger](../../packages/db/test/ledger.integration.test.ts), [checkpoint handoff](../../packages/db/test/audit-checkpoint-handoff.integration.test.ts), [LP-9 restore](../../packages/db/test/lp9-restore.integration.test.ts); DB runner | 01a/b, 04a/b, 05, 07–09: append-only chain, balanced immutable entries, tenant isolation, rollback and checkpoint mismatch/tail-loss. 17/19/20 separately prove deployed independence and restore; no such receipt here. |
| Versioned contracts and policy refusals | [Foundation tests](../../packages/config/src/foundation-gates.test.ts), [decision identity](../../packages/config/src/policy-gates.decision-identity.test.ts), [superseded replay](../../packages/config/src/policy-gates.superseded-replay.test.ts), [call-site guard](../../tools/policy-gate-sites.test.mjs) | 01a/b, 02–09: absent, pending/proposed, wrong-version and superseded policy refusals, invalid contract versions, G0 pending/G1 pending independently at server entry/execution; fixtures explicitly approved only inside isolated harness, never production approvals. Full pilot runner pending. |
| Phone / desktop full pilot journey | Existing M1-15 and MON-5 E2E above, [Final Check invoice fixture](../../packages/db/test/final-check-invoice.integration.test.ts); existing E2E/DB runners | 01a/b, 02–07: fictional builder sign-in → capture/quote → fake customer invitation/sign-in/portal approval → same-job switch-live → extras/private versioned proof → final-account lock/Final Check reveal/dispute/confirmation → supported builder invoice → authorized off-platform receipt. Isolated pilot-mode harness and complete journey spec do not yet exist at this base. |
| Zero platform money effects throughout | [Stored financial negative controls](../../packages/db/test/shadow-pilot-financial.integration.test.ts), [financial read procedure](m1-15s-read-records.md); DB runner | 01a/b, 04a/b, 05, 07 and parent 11: assert zero JobGuard obligations, gross accruals, platform invoices, platform journals and collection attempts, including subscriptions/activation, payment events/credentials, mandates and pay-now routes disabled. Check persisted state after every journey boundary and replay; seeded negative controls must detect violations. Builder/customer invoices/receipts are distinct. Existing restricted reader alone does not cover this complete pilot assertion; runner/receipt pending. |
| Privacy and isolated recovery | [Privacy fixture](../../packages/db/test/privacy-operations.integration.test.ts), [restore rehearsal](../../packages/db/test/restore-rehearsal.integration.test.ts); DB/restore runners | 08/09 prepare full data-class/revocation/tombstone fixtures; 15/18/19 approve and rehearse deployed access/export/deletion, backup expiry and paused restore reconciliation. Current synthetic inventory is not actual job/object/session erasure; deployed checks operator-only and pending. |

## Validation and evidence limits

[Validator](../../packages/config/src/foundation-gates.ts) uses a strict versioned
Zod schema. It rejects omitted, duplicate, extra or rewritten requirements, stale
plan excerpts, absent files, unsafe repository paths, empty blocking reasons and
completion without evidence. A row's status cannot be `approved`; owner approval
is a separate optional record. Such a record must cite an existing decision record
whose approved status, exact policy version and dated approver evidence match the
reference, plus an existing approval evidence file. Proposed D04/D07/D12/D13 files
are not approvals. File existence and format validation cannot establish whether a
human signature is authentic; independent human/legal review is still required.

Version 1 accepts no contractor pilot evidence (`contractorPilotEvidence: null`)
and requires both ENT-14 signature rows to stay blocked. The existing enterprise
schema and a pilot-terms document are not signed ENT-14 evidence. When actual signed
agreements, DPA and solicitor/founder approvals exist, a separate reviewed evidence
update must admit and bind them; this change supplies no contractor activation path.

The root `pnpm test` discovers [the committed-pack check](../../tools/foundation-gates.test.mjs)
through its existing `tools/*.test.mjs` command. That check reads files from this
checkout, rejects paths resolving outside it, checks the plan excerpts, and asserts
that both gates remain unmet and every owner approval remains blank. A missing file
therefore fails at the commit checked by CI, rather than being accepted as a link to
future work. The validator is offline only and is not imported by a runtime gate.
No server authorization or deployment configuration is changed.

### PILOT-11-EVIDENCE-INDEX local validation — 21 November 2026

Documentation-only slice, inspected base
`ee974f0343fee3822f952b0299bc1f4c2ac8ad3d`; no migration or runtime change.
Checks actually run in this worktree:

- `git diff --check` passed.
- `node --test tools/foundation-gates.test.mjs` passed (1 test): committed JSON
  still has G0/G1 `not_met`, null owner approvals and no contractor evidence.
- Repository-relative Markdown targets were checked with Python path resolution:
  79 links exist. The added production map has 21 unique gate row IDs (5 G0,
  13 applicable G1, 3 contractor scope blocks). Named scripts and test paths were
  inspected against package scripts, tools and source; existence is not execution.
- `node tools/agent-lane-boundary-lint.mjs` was attempted and **refused**:
  `Missing branch or self-comparison range; refusing a misleading pass.` HEAD
  equals origin/main at this uncommitted preparation base. No alternative base or
  Git write was used to force a pass. A read-only invocation of the existing
  `loadLanePolicy`, `selectLane` and `lanePathAllowed` exports confirmed this
  branch selects its own manifest and permits only the document plus its own lane
  file. That helper check is not a successful CLI range check; the coordinator must
  rerun lane lint after committing the delta.

No database/browser suite, full typecheck/build, provider call or deployed check
was run for this prose-only slice. No test was added or weakened. Required CI and
independent RED review at the eventual exact head remain the coordinator's landing
gates. The checker must confirm this document cannot be mistaken for acceptance or
activation. NOPR preparation only: this session makes no Git writes. PILOT-11's
integrated matrix, deployed receipts, separate G0 acceptance and all missing policy
approvals/Ben's G1 activation remain open.

### Historical M0-13d validation — 4 November 2026

The following receipts describe that earlier branch, not PILOT-11 or the pilot
release candidate. They are retained as history, not current-head passes.

Catch-up validation (4 November 2026): the launcher merged `origin/main`
`155a3eb0680e1e270bdf2ecfe1e381374b62c889` into this branch at
`86fb99d991272dd060a842943d37f4646e6086ca`. The merge is complete, with no
unresolved conflicts. Local `main` is stale; comparisons use the merged
`origin/main` without fetching. The diff contains only this piece's five
evidence/validator files and its own lane file. No other piece's lane file,
migration, runtime code or database routine is added by this branch. The ten
catch-up rules were inspected against that diff; none requires a code change.
All evidence paths exist and the plan excerpts still match. No row status,
approval, implementation or test expectation was changed.

Local validation results: 431 Vitest tests passed: 77 foundation/release-inventory/
enterprise-real-data tests, 145 context-boundary tests, 7 identity tests, 126
watchdog-registry tests and 76 migration-proof-loader tests. The root committed-pack
check also passed: G0/G1 are `not_met`, all owner approvals are null and ENT-14
signature rows remain blocked. Vitest is installed at 4.1.12; each run explicitly
used `--maxWorkers=2` and at most three named files.

TypeScript checks passed across all seven workspace packages. The pnpm/Turbo
wrapper stalled before running compilers and was interrupted; the installed
TypeScript binaries completed directly. Initial API/database guard attempts
could not resolve unbuilt workspace exports; compiling core, storage, db and AI
locally resolved these setup failures, and the affected guards then passed.
No packages were downloaded and no provider calls were made.

Commands run (package-relative commands use the named package's working directory):

```sh
# packages/config:
./node_modules/.bin/vitest run --maxWorkers=2 src/foundation-gates.test.ts src/release-inventory.test.ts src/enterprise-real-data.test.ts
./node_modules/.bin/tsc -p tsconfig.json --noEmit
# packages/core, packages/storage, packages/db and packages/ai, each:
./node_modules/.bin/tsc -p tsconfig.json
# apps/api and apps/web, each:
./node_modules/.bin/tsc -p tsconfig.json --noEmit
# apps/api (watchdog-registry re-run after compiling AI):
./node_modules/.bin/vitest run --maxWorkers=2 src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts
./node_modules/.bin/vitest run --maxWorkers=2 src/watchdog-registry.test.ts
# packages/db:
./node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts
# repository root:
node --test tools/foundation-gates.test.mjs
node tools/agent-lane-boundary-lint.mjs
node tools/lint.mjs
git diff --check origin/main
```

The source lint passed, including lane, core purity, money, commercial, AI-provider
and PL/pgSQL checks. Core purity reported ten existing computed-import warnings
outside this piece. These are deterministic checks, not independent acceptance.

PostgreSQL and browser suites did not run: this sandbox cannot start PostgreSQL or
bind localhost. CI must prove the full required typecheck, lint, test, build,
PostgreSQL/migration and browser checks against the eventual landing head. No CI
run or deployed acceptance is claimed here. NOPR=1 remains in force; the router
commits and pushes, then opens a PR when the landing group's turn comes. There is
no migration, model/prompt change, web workflow or new external action.

LATER / SIMPLICITY — `docs/operations/foundation-gates.md`, checklist table: consider
generating the display table from `config/foundation-gates.v1.json` in a separate
change. This would avoid maintaining evidence paths and blocking reasons twice;
keep the independent normative plan checks. This does not block landing.

## Still open for people

All owner approvals and separate technical acceptance remain open. This includes
approved no-charge pilot terms; D04, D07, D12 and D13; deployed alert delivery and
ownership; backup/restore evidence from a deployed environment with measurements
against approved recovery objectives; privacy/export/deletion and revocation
rehearsals; and ENT-14 signed pilot agreement and DPA with solicitor and founder
approval. The contractor additionally needs D12 v4 and the ENT-14 terms approvals
specified by the plan. Source inspection and synthetic fixtures cannot close or
imitate any of these steps. The router must keep these blocks visible and arrange
the human work. No person is recorded as having approved, observed or signed it.
