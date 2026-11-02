# Foundation gates: G0 evidence pack and G1 checklist

M0-13d · AMBER · offline evidence index · NOPR=1.

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

## Checklist at this change

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

Local validation results: 77 tests passed across the foundation, release-inventory
and enterprise-real-data Vitest files with `--maxWorkers=2`; both root inventory
checks passed. Package typecheck and TypeScript build passed. Core purity, money,
commercial, AI-provider and PL/pgSQL boundary checks passed. Lane policy loads and
permits all six changed paths (its own lane file is implicitly allowed). The full
`node tools/lint.mjs` command stopped at the lane checker because uncommitted HEAD
equals the comparison base; no committed-change lane result is claimed.

Focused local checks:

```sh
./packages/config/node_modules/.bin/vitest run --root packages/config --maxWorkers=2 src/foundation-gates.test.ts
node --test tools/foundation-gates.test.mjs tools/release-inventory.test.mjs
./packages/config/node_modules/.bin/tsc -p packages/config/tsconfig.json --noEmit
```

PostgreSQL and browser suites did not run: this sandbox cannot start PostgreSQL or
bind localhost. They must run through the router's normal CI path when this NOPR
branch is admitted; no CI run or deployed acceptance is claimed here. There is no
migration, provider call, model/prompt change, web workflow or new external action.

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
