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
