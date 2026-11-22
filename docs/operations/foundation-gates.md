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

## PILOT-11 evidence index · 22 November 2026

Source base `6cf0a9a6b31297d3f57c96fd5f2c3a03142efc4a`.
The [PILOT-11 contract][pilot-plan] assigns the matrix and the evidence index.
The [local verification receipt](pilot-11-verification-2026-11-22.md) records
the tested commit, commands, counts and gaps. G0 and G1 remain unmet.
Every owner approval is pending, and contractor access remains blocked.

[pilot-plan]: https://github.com/ben2harwood-lgtm/jobguard/blob/eefbdcd7dfdd13e0f81598c3e905ae65b07ed738/docs/plans/PILOT-G1-PLAN.md#pilot-11--prepare-the-evidence-index-and-current-head-test-matrix

### Merged evidence

Merge and review SHAs are abbreviated. A reporting PR records the verdict
where an independent verdict has no accessible standalone receipt. Automated
review results apply to the listed review SHA. PILOT-21 needs independently
reviewed evidence for the eventual release candidate.

| Piece | Merge on base | Recorded verdict and scope |
|---|---|---|
| PILOT-01a | `64fc0ebb9` | PASS at `51819674`, reported in [#874][pr874]. Automated code review completed at `5f5715b5` with no findings. [#872][pr872] · [automated review][review872] |
| PILOT-01b | `f15856a3c` | PASS reported in [#875][pr875], which gives no verdict SHA. Automated code review completed at `a1a15ed8` with no findings. [#874][pr874] · [automated review][review874] |
| PILOT-08 | `402414f1d` | Automated code review completed at `1f106872` with no findings. Independent verdict receipt pending. [#875][pr875] · [automated review][review875] |
| PILOT-02 | `79d946fc4` | Check PASS reported in [#877][pr877] while CI repair was in progress. No verdict SHA supplied. Automated security review completed at `ff014e94`. [#876][pr876] · [automated review][review876] |
| PILOT-04a | `896763757` | PASS reported in [#879][pr879] while CI repair was in progress. No verdict SHA supplied. Automated code review at `0f69f85e` recorded an open P2 on replay of a completed quote after a draft revision. Exact-merge disposition unverified. [#877][pr877] · [automated review][review877] |
| PILOT-03 | `29663aba9` | Automated code review completed at `5e8d0892` with no findings. Independent verdict receipt pending. [#878][pr878] · [automated review][review878] |
| PILOT-04b | `cd905628a` | Automated code review completed at `cd8cbad9` with no findings. Independent verdict receipt pending. [#879][pr879] · [automated review][review879] |
| PILOT-06 | `6cf0a9a6b` | Automated code review completed at `2d29f1ca` with no findings. Independent verdict receipt pending. [#880][pr880] · [automated review][review880] |

[pr872]: https://github.com/ben2harwood-lgtm/jobguard/pull/872
[pr874]: https://github.com/ben2harwood-lgtm/jobguard/pull/874
[pr875]: https://github.com/ben2harwood-lgtm/jobguard/pull/875
[pr876]: https://github.com/ben2harwood-lgtm/jobguard/pull/876
[pr877]: https://github.com/ben2harwood-lgtm/jobguard/pull/877
[pr878]: https://github.com/ben2harwood-lgtm/jobguard/pull/878
[pr879]: https://github.com/ben2harwood-lgtm/jobguard/pull/879
[pr880]: https://github.com/ben2harwood-lgtm/jobguard/pull/880
[review872]: https://github.com/ben2harwood-lgtm/jobguard/pull/872#issuecomment-7060038627
[review874]: https://github.com/ben2harwood-lgtm/jobguard/pull/874#issuecomment-7061007278
[review875]: https://github.com/ben2harwood-lgtm/jobguard/pull/875#issuecomment-7061707709
[review876]: https://github.com/ben2harwood-lgtm/jobguard/pull/876#issuecomment-7070244742
[review877]: https://github.com/ben2harwood-lgtm/jobguard/pull/877#pullrequestreview-6008884475
[review878]: https://github.com/ben2harwood-lgtm/jobguard/pull/878#issuecomment-7072152192
[review879]: https://github.com/ben2harwood-lgtm/jobguard/pull/879#issuecomment-7072627171
[review880]: https://github.com/ben2harwood-lgtm/jobguard/pull/880#issuecomment-7074026627

### Pending pieces

| Piece | Evidence still due |
|---|---|
| PILOT-05 | Final account, Final Check, builder invoice and off-platform receipt fixture. |
| PILOT-07 | Authorized fake delivery, stop/drain, unknown-outcome reconciliation and controlled resume. |
| PILOT-09 | Pilot privacy, retention and revocation fixture. |
| PILOT-10 | Measurement instrumentation and fixture report. |
| PILOT-12 | D04 provider and residency approvals. |
| PILOT-13 | Approved regional adapter and deployment wiring. |
| PILOT-14 | Approved D02/D06 tax, invoice and customer approval scope. |
| PILOT-15 | Approved D07/D12 retention and privacy scope. |
| PILOT-16 | Approved no-charge terms and D13 Final Check disclosure. |
| PILOT-17 | Locked UK deployment and deployed operational receipts. |
| PILOT-18 | Deployed fictional privacy rehearsal. |
| PILOT-19 | Deployed backup and measured isolated restore. |
| PILOT-20 | Deployment-representative LP-9 evidence and independent human review. |
| PILOT-21 | Separate G0 technical acceptance, G1 evidence and candidate-bound activation decision. |
| PILOT-22 | Authorized controlled smoke and cohort onboarding after G1. |
| PILOT-23 | Authorized measurement period and reviewed report after G1. |

### Gate evidence and runners

The checklist above carries the fail-closed status and current artifacts for each
row. The table below names the additional artifact and who runs or records it.
PILOT-21 binds each receipt to the full candidate SHA, date, outcome, topology,
roles, ordered migration names and hashes, and exact policy versions. Approval
references also need dated approver evidence. Publish scrubbed references only.

| Row | Artifact and runner or owner |
|---|---|
| `g0-m0` | M0 exit matrix, using the local receipt and required CI. PILOT-11 assembles fixtures. PILOT-17–21 supply deployed operations and acceptance. |
| `g0-contracts` | Versioned contracts in the checklist and the foundation pack check, run by PILOT-11 and CI. PILOT-21 binds the versions used by the candidate. |
| `g0-policies` | Config, API and web refusal results in the local matrix. PILOT-21 repeats candidate-specific checks with either gate pending. |
| `g0-postgres` | Fresh, upgrade, installed catalog and runtime-role checks in the local matrix. CI and the PILOT-20 operator run against the pinned candidate and representative topology. |
| `g0-acceptance` | Dated technical acceptance from the PILOT-21 acceptor, separate from the builder and checker. |
| `g1-d04` | [Provider register](provider-register.md) and exact D04 approval, recorded by the PILOT-12 owner with PILOT-13/17 operational verification. |
| `g1-invoice` | D02/D06 scope and notice approvals from PILOT-14 legal/tax reviewers and owner, plus PILOT-05 invoice and receipt fixture. |
| `g1-permissions` | Identity, portal, tenancy and catalog receipts in the local matrix, plus deployed permission/revocation evidence from PILOT-17 and LP-9 review from PILOT-20. |
| `g1-d07` | D07 retention and recovery approval from PILOT-15, with [privacy rehearsal](privacy-operations.md) and restore receipts from PILOT-18/19 operators. |
| `g1-d12` | Small-builder D12 scope, DPIA and notices from PILOT-15, with PILOT-18 operator proving access, export, deletion and revocation. Reconcile the MON-5 v3 reference with proposed D12 v4 before recording approval. |
| `g1-secrets` | [Pilot topology](pilot-infrastructure.md), deployed binding/rotation and catalog receipts from PILOT-17/20 operators. |
| `g1-alerts` | [Pilot infrastructure](pilot-infrastructure.md) fixture and deployed supervised restart, heartbeat and alert-delivery receipt from PILOT-17 operations. |
| `g1-backup` | Deployed backup schedule and database/object/checkpoint backup references from PILOT-17/19 operations. |
| `g1-restore` | [Restore runbook](restore-runbook.md) and measured isolated restore receipt from PILOT-19, with PILOT-20 refusal rerun. |
| `g1-outbound` | [Outbound pause runbook](commercial-outbound-pause.md), PILOT-07 fake receipt and PILOT-17 operator stop, drain, reconcile and resume receipt. |
| `g1-terms` | [Pilot terms](../contracts/pilot-terms-v1.md) and dated PILOT-16 owner/legal approval of `pilot_no_charge_v1` or reviewed successor, with onboarding receipt. |
| `g1-d13` | PILOT-05 lock/reveal fixture and dated PILOT-16 D13 approval of disclosure, exceptions and disputes. |
| `g1-checkpoint` | Audit/checkpoint fixture plus PILOT-17/19/20 operator proof of independent storage, runtime write denial, mismatch and tail-loss verification. |
| `g1-contractor-pilot` | Contractor access blocked and outside this cohort. A future ENT-14 owner must record the signed agreement and solicitor/founder approvals. |
| `g1-contractor-dpa` | Contractor access blocked and outside this cohort. A future ENT-14 owner must record the signed DPA and solicitor/founder approvals. |
| `g1-contractor-d12` | Contractor access blocked and outside this cohort. A future contractor approval owner must record the exact D12 v4 approval. |

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

### Historical M0-13d validation · 4 November 2026

Catch-up validation: the launcher merged `origin/main`
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
