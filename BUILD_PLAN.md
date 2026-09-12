# BUILD_PLAN.md — JobGuard, for Codex

**Revision:** 2.2 · 11 September 2026 (independent-check fixes; see change log below)  
**Companion:** `AGENTS.md`, revision 2.2  
**Status:** full replacement implementation plan; repository and provider accounts have not been inspected. Requirements below describe work to perform, not completed or verified implementation.

> **Rev 2.2 change log** — applied after an independent seven-lens check (2026-09-11). The fee model, the M0 dependency graph, the gate coherence, the security architecture and the regulatory deferrals all passed adversarial refutation; these are the surviving fixes. Rev 2.1 is preserved at `docs/archive/BUILD_PLAN.rev2.1.md`.
> 1. **New decision D12** (data protection of the builder's customers / third parties) added to §2 as `proposed`; G1 now requires it. The bank feed (M4-7) and pursuit (M4-5) ingest third-party personal data with no named lawful basis / UK GDPR Article 14 notice.
> 2. **M0-2 DoD** now enumerates **D01–D12** (D11 was dropped in 2.1) and adds a **fitness test**: in `production` mode any fee-posting, tax-invoice or provider-dispatch site fails unless the matching D01/D02/D04 record is `approved` — a static check that these sites import the gate, plus a `proposed`-record denial test — mirroring M0-8's boundary test.
> 3. **G4 evidence** now reads **D01–D12** approvals.
> 4. **M0-1 DoD** clarified: `/healthz` is a DB-independent liveness probe (a separate `/readyz` opens the datasource), so M0-1 completes with no container runtime; a container runtime (or native Postgres 16 + MinIO) is an explicit precondition of **M0-4 / M0-11 / M0-12(MinIO)** before dispatch; M0-1 also ships the **agent lane-boundary lint** (adapted from OWN MIND `tools/agent-lane-boundary-lint.mjs`, run in CI, not only as a bypassable hook) before any parallel wave, plus a `packages/core` import-boundary/purity test.
> 5. **Runtime pin**: Node 24 recorded as an approved deviation from the pinned Node 22 (Node 24 is Active LTS and supports the whole M0/M1 stack; revisit at M3 for Expo). `engines`/`.nvmrc`/CI matrix pin 24; the deviation is recorded in `docs/repo-baseline.md`, not silent.
> 6. **M2 start**: the execution model's "once the M1 spine is stable" is corrected to "once the M1 exit journey and its critical controls pass (§6)", removing the contradiction with §1/§6.
> 7. **Lock order**: the §5.4 "no business lock after the audit append" invariant gets a command-layer deadlock/fitness test owner in **M0-8/M0-9** (rev 2.1 tested only the audit-only case in M0-5).
> 8. **Money purity**: M0-3 adds a static ban on binary-float money arithmetic in `packages/core` money/fee modules (a `Money` API exposing no float operators), not only fixture/property tests.
> 9. **Oversized tasks**: M0-12 pre-splits into (a) Claude gateway + validation + provenance + eval fixtures and (b) Deepgram STT adapter; M0-13 pre-splits into deploy / DR-restore / privacy-ops / gate-evidence. Aggregate acceptance preserved.
> 10. **Half-even tie**: add one §3.5 fixture whose cap or fee lands on an exact half-penny tie, so the golden gate distinguishes half-even from half-up.
>
> Items 2, 4, 7, 8 introduce new tests; per AGENTS §1 they land **with** their tests when the owning task (M0-1/M0-2/M0-3/M0-8) is built. The rest are plan-text corrections, applied in place.

Read `AGENTS.md` first. Build milestones in order; within each milestone, follow numeric task order. “Depends on” records minimum technical prerequisites, not permission to bypass a previous milestone’s exit gate. Parallel work requires an explicit dependency-preserving split in the plan. One task = one reviewable PR; every “Done when” assertion is part of its definition of done.

The core product and pinned stack are retained. This revision corrects sequencing and state definitions, specifies the command/financial/evidence contracts before their consumers, and gives every milestone executable acceptance criteria. Appendix B maps the principal changes. Appendix C identifies external technical constraints; proposed product policies and acceptance targets are not claims from those sources.

## Execution model — build in parallel, ordered only by real dependencies

Task numbers are identifiers, **not** a running order. Build every task whose dependencies are all merged; any two tasks with no dependency path between them run **at the same time, on different agents**. Each task's "Depends on" lists only true prerequisites — a contract, table, module, or artifact the task actually consumes — never the task that merely precedes it in this document. Milestone gates (G0–G5) still hold: a gate blocks the *production* features behind it, not parallel construction of foundation or synthetic work.

Rules for the fleet:
- A task is **ready** when every task in its "Depends on" is merged. Start all ready tasks concurrently.
- Two tasks that write the same files/modules serialize (one agent, or sequence them) even if logically independent — declare it in the PR.
- One task = one reviewable PR, no matter how many run at once. A task's own "Done when" is still its definition of done.

**M0 dependency waves** — up to four tasks run at once; ~7 levels instead of 13 in series:

| Wave | Run in parallel | Why they can start |
|---|---|---|
| 0 | **M0-1** scaffold/CI | root |
| 1 | **M0-2** contracts/gates · **M0-3** money/tax · **M0-4** db+tenancy+RLS · **M0-12** AI gateway | each needs only the repo (M0-1) |
| 2 | **M0-5** audit · **M0-6** auth · **M0-11** evidence storage | all need tenancy (M0-4); M0-11 also M0-1 |
| 3 | **M0-7** job spine · **M0-10** ledger | spine ← M0-3/4/6 · ledger ← M0-3/4/5 |
| 4 | **M0-8** commands/authorization | ← M0-5/6/7 |
| 5 | **M0-9** outbox/worker/inbox | ← M0-8 |
| 6 | **M0-13** pilot deploy + G0 gate | convergence ← M0-9/10/11/12 |

**M1 tracks** — the capture chain is genuinely serial; after switch-live, three tracks plus the UI run in parallel:

- **Capture chain (serial, real):** M1-2 → M1-3 → M1-4 → M1-5 → M1-6 → M1-7. Each consumes the prior's output.
- **UI track (parallel from M0-7):** M1-1 shell/jobs list, evolving through the milestone.
- **After M1-7 (switch-live), in parallel:**
  - **Track A — execution & customer billing:** M1-8 → (M1-9 ∥ M1-10) → M1-11 → M1-12.
  - **Track B — platform fee:** M1-13 → M1-14.
  - **Track C — commercial integrity:** M1-16.  **Import track:** M1-17.
- **M1-15** (two-builder synthetic trial) is the convergence: it waits on M1-1, Track A (through M1-12) and Track B (through M1-14). M1-16/M1-17 run alongside and do not gate the trial.

**Across milestones:** M2 (materials/readiness) and M3 (native/offline) are largely independent of each other and can be built in parallel once the M1 exit journey and its critical controls pass (do not start M2 before the M1 exit gate; see §1 and §6); M4 needs M1-13 plus M3-7. Within M2–M5 the intra-track chains (e.g. materials: model → intake → extract → match → checks) are real and stay serial; parallelism there is *between* tracks, not inside them. Each task below lists its true prerequisites; the same "start when ready, run independents together" rule applies throughout.

## 1. Milestones and release modes

| Milestone | Goal | Exit evidence |
|---|---|---|
| **M0 — Foundations** | Repository, exact money, tenancy, audit, auth, spine, authorized commands, durable work, ledger, evidence, approved AI route, pilot operations. | Foundation integration suite passes; deployment and governance prerequisites are demonstrable. No builder feature is presented as complete. |
| **M1 — The core loop** | Walk → confirm → free quote → accepted baseline → live job → decisions/proof/variations → final account → payment record. | Two builders complete the loop unscripted in an explicitly no-charge pilot; fee examples are demonstrated separately. **Ship and test this before M2.** |
| **M2 — Watchdog depth** | Materials intake and deterministic matching, site readiness, better decision relevance. | Held-out discrepancy/readiness tests and a reviewed pilot show evidence-linked actionable findings. No automatic ordering or fees. |
| **M3 — Field app + offline** | Expo, encrypted local storage, scoped PowerSync, resilient capture, validated offline commands. | Multi-device conflict/security tests and physical-device offline journeys pass. |
| **M4 — Recovery + billing** | Qualifying outcomes, evidence packs, approved pursuit, bank reconciliation, production fee engine and separate payment rails. | Sandbox end-to-end acceptance, commercial/tax/regulatory approvals, reconciliation and live-release gates. Passing a sandbox journey alone is not production approval. |
| **M5 — Integrations, hardening, enterprise** | Accounting/merchant integrations, rate learning, enterprise identity/isolation, expanded assurance. | Connector-specific and enterprise-specific acceptance; audited operational capabilities rather than certification claims based only on code. |

### Environment and accounting separation

- **`synthetic_demo`:** generated source material, mail sink/test recipients, fake settlements, and simulated journals. Separate deployment/database/bucket/credentials from production. Every screen, export, and provider event identifies the simulation.
- **`pilot_no_charge`:** real builder data only after gate G1. Real builder-approved quotes/customer invoices are permitted within the supported tax/jurisdiction scope. No JobGuard fee obligation, payment collection, or production recovery-fee posting is permitted. Fee illustrations remain non-posting projections.
- **`provider_sandbox`:** provider test credentials and test events; never a source of production settlement evidence or customer debt.
- **`production_billing`:** available only after gate G4 and relevant decision records. Fee obligations, issued invoices, settlement, and refunds remain distinct facts.

The deployment selects the mode; it is not a user-editable flag. A production worker must reject a demo/sandbox reference even if a client sends it. Pilot jobs retain their no-charge entitlement: no retrospective conversion to paid jobs without a new explicit, versioned agreement and migration task.

### Release gates

| Gate | Required before | Evidence required |
|---|---|---|
| **G0 — foundation acceptance** | M1 feature rollout | M0 tasks pass, contracts are versioned, pending policies fail closed, critical tests run on real PostgreSQL. |
| **G1 — real-data/no-charge pilot** | Any real personal data or real commercial document send | Approved processor/data-flow register; supported invoice/tax scope; permissions; privacy/retention procedure; secret management; alerts; backup and successful restore evidence; outbound kill switch; approved pilot terms stating no platform charge. |
| **G2 — watchdog pilot expansion** | Operational reliance on M2 findings | Fixed labelled evaluation sets, published error metrics, confirmed input provenance, human review and false-positive feedback. |
| **G3 — native release** | Real-data native distribution | Encrypted storage/device tests, download and upload authorization tests, revocation/cleanup behavior, supported build/OS matrix, tested sync migration. |
| **G4 — production outcome billing** | Real recovery-fee invoicing or collection, paid activation/subscriptions | Relevant D01–D12 approvals; tested bank/fee/payment reconciliation, reversals, cap/credit cases, external-action authorization, penetration review of the money surface, operational runbooks, and controlled live smoke checks. Each rail can remain disabled independently. |
| **G5 — enterprise/connector release** | Each connector or enterprise capability | Its task acceptance, updated data-flow approval, migration/restore evidence, and explicit customer-specific requirements. |

Pending gates must block the affected production feature in configuration and server-side execution. They do not block unrelated synthetic development.

## 2. Decision register — do not silently invent these answers

M0-2 creates the actual records in `docs/decisions/`. Every record has owner, status (`proposed|approved|superseded`), exact policy/version, dated approver evidence, applicable environment/jurisdiction, source/supporting review, and executable feature gates. This document proposes choices but does not supply the owner’s or a professional adviser’s approval.

| Record | Proposed implementation basis | Required approval / deadline |
|---|---|---|
| **D01 — commercial fees and cap** | Section 3.5’s candidate: £79 base plan principal; 10% of eligible landed principal; 1.5% accepted-net-value cap on the recovery-fee calculation; settled plan principal credited once within the same job. Base plan fee is not reduced merely because the cap is below £79. | Product/commercial owner before production fee disclosure, obligation, or collection. Must approve small-job wording, cancellation/refund terms, and whether this proposed cap interpretation is acceptable. |
| **D02 — VAT, rounding, invoicing** | Candidate fee figures are VAT-exclusive; accepted job value and eligible recovery principal exclude VAT. M1 customer invoicing supports only explicitly confirmed standard-rated 20% GBP cases in the approved pilot scope. Tax rounding is separate from commercial half-even. | Qualified tax/accounting review and product approval before real tax invoices/fee collection. Decide platform VAT registration/treatment, invoice presentation, and jurisdiction. Do not label £79 as VAT-inclusive by inference. |
| **D03 — eligible recovery and reversals** | Initial eligible outcome is evidenced settled cash principal attributable to an approved recovery case. Pending cash, prevented spending, unapplied credit notes, invoice reductions, and unverified manual receipts are non-billable. Applied credits remain excluded until an approved extension. | Product owner plus appropriate legal/accounting review before M4 billability or production fees. Define attribution, partial outcomes, duplicates, refunds, disputes, and evidentiary sufficiency. |
| **D04 — providers and residency** | EU/UK-only personal-data service boundary; UK primary hosting; no unapproved global fallback. Verify each actual deployment, not just vendor brand. | Data/security owner before any real data reaches a provider. Include AI, speech, auth email, commercial email, telemetry, OCR, sync, storage/backups, banking, payments, and accounting. |
| **D05 — authority and standing consent** | Exact action approval by an authorized tenant member; each recovery-fee statement requires approval by default. A separately accepted, bounded subscription mandate may authorize defined renewals. | Product/legal/security owners before standing-authority execution. Define frequency, amounts, notices, expiry, cancellation, revocation, revalidation, and provider-managed retries/messages. |
| **D06 — builder invoices, customer approval, jurisdiction** | M1 supports a reviewed simple-invoice pilot only, with no automated construction notices, CIS, DRC, retention, or unsupported VAT categories. Builder attestations remain visibly distinct from authenticated customer approvals. | Product/legal/tax review before G1 real invoice issue; expanded contract/jurisdiction templates before their M4 tasks. UK-wide product intent is not one universal construction-notice regime. |
| **D07 — retention, recovery, and operations** | Private versioned evidence, explicit retention classes, deletion/export workflow, independent audit checkpoints, backup/restore. Proposed pilot recovery objectives: no more than 24 hours’ data loss and recovery within one working day. | Data/operations owner before G1; approve actual objectives and retention periods. Review WORM/legal holds before M4 retention is enabled. Proposed recovery objectives are targets, not measured service promises. |
| **D08 — offline security and conflicts** | Encrypted per-user/tenant local storage, sensitive-field minimization, append-only commands for commercial actions, bounded offline access lease, last-writer-wins only for allowlisted non-commercial fields. | Security/product owner before G3. State lost-device and offline-revocation limitations honestly. |
| **D09 — plan tiers and metering** | No assumed tier prices or included job counts. Define billable concurrency intervals, billing periods, inclusions, credits, and upgrade approval before implementation of paid tiers. | Commercial/accounting owners before M4 subscription/metering release. Subscription credit must not silently duplicate the per-job £79 credit. |
| **D10 — pursuit and banking route** | Builder sends approved factual communications; no autonomous debt collection or representation. Use an approved TrueLayer consent/licensing route and do not hold customer funds. | Appropriate legal/regulatory review and provider onboarding before real recovery pursuit/banking. Tone filters are not the review. |
| **D11 — commercial integrity / anti-gaming** | Candidate: freeze `accepted_net_value` at switch-live and store the quoted and eventual final values beside it; detect and **flag, never auto-penalize** — a job won but never switched live, an accepted value materially below its quoted or final value, a live job whose activity is inconsistent with being run in JobGuard, and a recovery marked settled outside the app. All outputs are review signals, not proof. Option: bind the recovery-fee cap to the greater of accepted and quoted value. | Product/commercial owner. Reconcile with the owner’s own anti-gaming design; approve the cap basis, the thresholds, and what — if anything — a confirmed evasion changes. Detection is a signal, never a basis for an automatic charge, suspension, or account action. |
| **D12 — data protection role and third-party transparency** | Candidate: JobGuard is a data **controller** for the builder-facing account and processing, and processes the builder's customers' and counterparties' personal data (esp. the TrueLayer bank feed at M4-7 and recovery pursuit at M4-5, plus merchant intake at M2-2) — none of whom is party to the builder–JobGuard contract. Name the lawful basis for that third-party processing and the UK GDPR **Article 14** ("personal data not obtained from the data subject") transparency mechanism: who serves the notice (builder-as-controller vs JobGuard) and how. This is distinct from D04 (residency/where-data-goes) and D07 (retention). | Data/legal owner before G1 (first real personal data) and hard before M4-7. Determine controller/processor status per data category; state the lawful basis; define the Article 14 notice route. A subprocessor register is not a controllership analysis. |

Until D01/D02/D03 are approved, implement their candidate as `reference_fee_policy_v1` for pure calculations and synthetic tests only. The UI must describe it as an illustration, not agreed pricing. A changed policy gets a new version; it does not rewrite accepted terms or historic postings.

## 3. Canonical domain contracts

These are the design basis for the tasks. Material changes require a decision record, test updates, and corresponding changes to `AGENTS.md`.

### 3.1 Job, documents, and acceptance

The authoritative job status is:

```text
draft -> quoting -> accepted -> live -> invoiced -> paid
              \-> lost
accepted -> quoting  only after an explicit pre-live acceptance cancellation/supersession
paid -> invoiced     only for a recorded payment reversal or additional valid amount due
```

A draft may be discarded/archived without becoming a “lost quote”. `lost` records a declined/abandoned quotation; reopening is an explicit audited `ReopenQuote` command to `quoting`. A live job is never reset to quoting to evade its baseline or fee cap. Cancellation after activation is an explicit closure/financial-adjustment workflow, not deletion or baseline mutation.

“Quoted” means an immutable quote revision has an outbound send record; it is not an extra job status. “Won” is the UI label for accepted quote terms; it is not another status. Quote status (`draft|issued|accepted|declined|superseded`) and send status (`queued|provider_accepted|delivered|failed|outcome_unknown`) are separate. Provider acceptance is not proof a customer read the document.

An acceptance binds the exact quote revision/hash, accepting actor or attesting builder, method, and timestamp. `accepted_quote_version_id` points to the accepted document. At switch-live, `baseline_quote_version_id`, `accepted_net_value_pence`, fee-policy version, and `recovery_cap_pence` are fixed atomically. Approved variations do not increase that cap under the candidate policy.

Operational progress uses a separate scope-stage state machine: `not_started -> in_progress -> complete`; explicitly audited rework can move `complete -> in_progress`. A required proof gate must pass before completion. Quote acceptance freezes commercial snapshot records, not scope progress or evidence attachments.

Customer invoice status and receipt allocations are separate from job status. M1 “mark paid” records a dated amount and builder attestation, not a boolean pretending a bank verified it. A zero outstanding balance can project the job to `paid`, with payment provenance visible. A manual payment record does not qualify as recovery landing evidence. Credit notes and payment reversals preserve historic issued documents.

### 3.2 Scope identity, proposals, and document revisions

Mint `scope_item_id` into a lightweight identity registry at capture. A `proposal_line` references that reserved ID and an immutable source. Before confirmation there is no authoritative priced `scope_revision` for that proposal. Accept promotes the reserved identity and creates a human-confirmed commercial revision in one transaction; retrying cannot create another canonical line.

Working commercial revisions are append-only. A draft pointer may move; accepted/sent document snapshots never change. Quote lines and final-account lines have their own row IDs but retain `scope_item_id` and source revision. Model-output IDs are never trusted: the server assigns or verifies them.

Dismissals preserve the proposal/source and reason. A split retires the original proposed identity and creates child identities with lineage; a merge creates a new identity linked to all inputs. Never transfer existing invoices/evidence silently onto an unrelated item. New variation items have their own identity; changes to an existing item reference its identity and record a commercial delta rather than rewriting the baseline.

A variation’s state is `draft -> priced -> approved|rejected`; changes to approved terms create a new revision and fresh approval. “Priced” requires confirmed arithmetic inputs, not merely an AI estimate. Customer approval evidence and the builder’s attestation of customer approval have different methods and actor fields. M1 does not claim an e-signature was collected when a builder clicked “Got customer’s OK”.

### 3.3 Command, Decision, outbox, and event envelope

Define and version these contracts in M0, before quote sending:

```text
UserCommand:
  command_id, command_type, schema_version, requested_tenant_id,
  aggregate_type/id, expected_revision, payload, payload_hash,
  decision_id or explicit_inline_approval, client_created_at?

Trusted server context (never accepted from the payload):
  authenticated_subject, verified_membership, permission_version,
  effective_tenant_id, environment, correlation_id, server_received_at

Approved action:
  action_id, decision_resolution_id or standing_authorization_id,
  action_type, immutable_subject_revision, content_hash,
  exact_recipient_set, amount/currency where applicable,
  fee/tax/template_policy_versions, valid_until, revocation_reference

ProviderEvent:
  provider/account/environment, provider_event_id, schema_version,
  authenticated_raw_payload_reference/hash, received_at,
  linked_business_effect_id, processing_status
```

Not every internal edit needs a Decision screen. Every consequential commercial action needs an explicit approved resolution or permitted standing authorization. `decision_resolution` is an immutable fact with outcome `approved|dismissed|rejected`; expiry, supersession, and revocation are explicit records/projections. An open question resolved by dismissal cannot authorize a send.

The command transaction checks idempotency and expected revisions, locks required aggregates in a consistent order, validates permissions and the exact action, records domain changes and durable work, and appends an audit batch atomically. Cache only safe command results under tenant/principal scope. Same key + different payload yields a typed conflict. Semantic uniqueness also prevents the same business event using two different command IDs.

Outbox work references immutable content, never “whatever the latest PDF is”. Execution rechecks action validity, revocation, environment, and any required current permission. A document/content/recipient/amount change requires reapproval. A send’s `outcome_unknown` cannot be relabelled failed just to permit a duplicate retry.

The Graphile dispatcher can enumerate outbox references through a narrow control-plane mechanism; each business execution establishes verified tenant/action scope with the non-owner business role. No worker uses Graphile’s infrastructure-owner connection for business queries. Verified webhooks record facts and replay safely; they cannot originate unrelated charges or authorize new commercial sends.

### 3.4 Exact arithmetic and supported tax scope

- **Money boundary:** GBP only. `pence` must be a finite safe integer with absolute value at most `1_000_000_000_000` (an application validation limit, not a business offer). PostgreSQL stores `bigint`; serialize to the public number type only after range validation. Use checked `bigint` intermediates and reject overflow rather than truncate.
- **Quantity:** signed decimal input with up to six fractional places; ordinary quantities are nonnegative, while negative commercial adjustments require an explicit adjustment type. Parse to scaled integers. Units and allowed conversions are enumerated; do not interpret a pack as a single unit by guessing.
- **Net line calculation:** exact quantity × unit-rate × exact discount ratio, rounded once at the defined line boundary with half-even. Store input factors, calculation version, and rounded result. Document-level discounts are allocated with a deterministic largest-remainder method, stable tie-break IDs, and penny conservation.
- **Fees/cap:** exact rational percentages and half-even as in section 3.5; never `Math.round(0.015 * amount)`.
- **Tax:** store a tax-treatment code and policy version, not just a percentage. Candidate M1 policy totals taxable net by tax code, calculates VAT once per code group with half-up for positive invoices, and uses a sign-symmetric inverse for credit corrections; allocate display tax to lines deterministically. D02 must approve the actual policy before real invoice issue. Other valid tax methods require a versioned decision, not incidental UI rounding.
- **M1 support restriction:** only explicitly confirmed standard-rated 20% GBP customer invoices within D06’s approved pilot scope. Reject unsupported zero/reduced-rated, exempt, non-VAT-registered, DRC, CIS, retention, foreign-currency, or mixed-regime cases from real issue; retain their draft data and explain the limitation. M4 extends support after review. Do not infer tax treatment from job category.
- **Document identity:** issued customer/platform invoices have separate issuer namespaces, immutable numbers/dates/tax details, versioned PDFs, and credit-note correction paths. A draft final account is not automatically a legally issued invoice.

The ECMAScript safe-integer boundary and HMRC guidance motivating explicit numerical/tax policies are recorded in Appendix C [R03, R12–R14]. The choices above are implementation requirements, not an assertion that every UK construction transaction uses the same treatment.

### 3.5 Candidate fee contract and required fixtures

**This is a proposed reference policy, not an approved customer agreement.** It deliberately makes the previously ambiguous cap/credit interpretation visible for D01–D03 approval. All following amounts are **principal/ex-VAT**; a tax-correct gross cash statement is additional work, not a relabelling of these examples.

Let:

```text
A = frozen accepted net job value, in pence
L = cumulative qualifying landed net principal allocated to this job,
    less approved landing reversals; never negative
B = 7,900 pence candidate base plan principal
P = qualifying settled base-plan principal for this job after refunds,
    limited to [0, B]; never an owed invoice or simulated payment

C = roundHalfEven(A * 15 / 1000)          // fixed recovery cap
F = min(roundHalfEven(L / 10), C)         // cumulative capped recovery fee
K = min(P, F)                            // cumulative plan credit used
R = F - K                               // cumulative additional recovery-fee liability
J = prior net posted recovery-fee principal, including compensations
posting_delta = R - J                    // not R on every landing event
```

All multiplication/division is exact integer/rational arithmetic. The credit pool is per job and used cumulatively once, not deducted again from every case/event. Calculate over cumulative `L` so splitting a receipt cannot increase the fee through rounding. Multiple cases share `C` and `P`.

A zero delta retains its derivation/audit record but creates no recovery-fee journal. Credit use `K` is cumulative; any allocation record posts only its change, not the full credit again. A positive delta requires qualifying landing proof and exact approved fee-statement authority. A negative delta creates a linked compensating journal/credit-note candidate and, if needed, a separately authorized refund; it never edits prior postings. Distinguish liability, issued/invoiced amounts, settled principal, tax, and cash due. `R` is not automatically today’s collectible balance.

Under the candidate interpretation the base fee is separate from the recovery-fee cap. When the £79 base has been fully paid and not refunded, total platform principal attributable to the job is `B + R = max(B, F)`. Therefore a £15 cap does **not** promise total platform charges below £79. This must be unmistakable in the proposed commercial terms. If the owner wants the cap to cover all platform charges, replace D01 and the fixtures; do not silently keep this formula.

Credit is earned by settled plan principal, not switch-live or invoice creation. With an unpaid plan, `P = 0`; a later settlement causes a fresh derivation and any required compensation. Collection should settle the base component and recompute the recovery balance before collecting an additional fee, rather than collect an obsolete uncredited statement. A base refund/dispute blocks automatic new collection and requires the approved cancellation/credit policy plus renewed authority; it is not permission to increase fees unexpectedly.

For the principal-only example `L = £2,820`, `F = £282`, `P = £79`, `R = £203`:

- **Additional recovery-fee liability:** £203, before its VAT and earlier recovery-fee settlements.
- **Incremental retained principal:** £2,820 − £203 = **£2,617**, ignoring the already paid base and VAT.
- **Net benefit after total platform principal:** £2,820 − (£79 + £203) = **£2,538**.

Do not label either figure “cash in your bank” when input recoveries exclude VAT. The production statement also shows gross receipts, invoice VAT, amounts already paid/refunded, and current gross cash due. On small jobs, “net benefit” subtracts the full base fee, not just `F`.

Mandatory reference fixtures, with `P = £79` unless stated otherwise:

| Accepted net A | Eligible net L | Fixed cap C | Capped fee F | Credit K | Additional liability R | Total base + additional | Net benefit after total principal |
|---:|---:|---:|---:|---:|---:|---:|---:|
| £18,800 | £2,820 | £282 | £282 | £79 | £203 | £282 | £2,538 |
| £188,000 | £2,820 | £2,820 | £282 | £79 | £203 | £282 | £2,538 |
| £10,000 | £2,820 | £150 | £150 | £79 | £71 | £150 | £2,670 |
| £1,000 | £500 | £15 | £15 | £15 | £0 | £79 | £421 |
| £10,000 | £0 | £150 | £0 | £0 | £0 | £79 | −£79 |

Additional fixtures: £320 then £2,500 on the £18,800 job produces cumulative additional liabilities £0 then £203; splitting/combining those settlements yields the same total. A reversal from £2,820 to £320 recomputes `R` from £203 to £0 and produces a −£203 principal compensation if £203 was previously posted. With `P = 0`, `F = £282` gives `R = £282`; later qualifying plan settlement reduces it to £203, without pretending the base was paid earlier. At the exact £18,800 boundary the cap equals £282; the original £188,000 figure did not exercise a binding cap.

Include zero, negative-adjustment, half-penny ties, near-limit/overflow, duplicate/partial receipts, cross-case allocation, cap exhaustion, plan refunds, tax credit notes, and concurrent posting tests. No AI participates in fee arithmetic or eligibility authorization.

### 3.6 Landing, eligibility, accounting, and reversal

A recovery case records the claimed issue and approved claim principal separately from settled amounts. Its lifecycle supports:

```text
identified -> prevented (terminal, non-billable)
identified -> evidence_assembled -> pursuing <-> negotiating
active evidenced case -> partially_landed -> landed -> closed_recovered
active case with no remaining outcome -> closed_no_recovery
```

Direct receipt before pursuit is permitted from an evidenced active case, but requires the same attribution and landing approval. Partial receipts accumulate through append-only allocations. A case closes recovered only with confirmed disposition of the full claim; an explicitly recorded write-off can close the unresolved remainder without making it recovered. Reversal/dispute events reopen the outstanding portion into the appropriate active state; history is never erased. M4-1 implements the complete transition table, including rejected transitions and amendments to a claim.

A `landing_candidate` from a bank matcher is not a qualifying landing. Confirmation creates an immutable `landing_allocation` referencing a settled transaction, finalized evidence, tenant/job/case, gross amount, eligible net principal, tax allocation, policy version, approving command, and attribution evidence. The candidate policy excludes pending transactions and non-cash credits. Use server/provider timestamps and separately labelled user observations.

One bank receipt may be explicitly split between cases, but allocated gross value cannot exceed its available settled value, and eligible principal cannot exceed its evidenced amount/claim remainder. Do not count the same receipt again because a statement image and an API feed both describe it. Use provider/source identities plus an explicit reconciliation identity for alternate evidence of the same underlying movement. Ambiguity is held for review, not forced into a unique match.

The positive fee posting routine verifies same-tenant/same-job references, valid evidence, approved eligibility, cumulative remaining cap/credit, policy/environment, current authorization, and unique derivation identity while holding the appropriate job/settlement locks. Fee corrections can reference reversal events without requiring a new positive landing. Invalidated evidence suspends disputed fee collection and creates reviewed compensation work according to D03.

Use distinct journal books for platform accounting and builder-customer records. A posted journal has one immutable header, balanced positive debit/credit lines, currency, policy version, source event, business-effect key, and links to its approval/derivation. Same-currency debit and credit totals must balance at transaction commit. No generic fee insertion path or runtime journal edits/deletes are available. Chart-of-accounts and revenue-recognition mappings require the D02 accounting decision; the model must not imply that every obligation is immediately recognized revenue.

### 3.7 Audit, evidence, and minimal security contracts

Audit sequence allocation and head updates are serialized per tenant. Hash canonical event metadata and payload; prohibit a payload that omits actor/type/subject from integrity coverage. Define a single lock order and batch audit appends at the end of domain mutation, with no later domain lock acquisition. Keep an independently restricted checkpoint `(tenant, sequence, hash, recorded_at)` before G1; external anchoring arrives in M4. A verifier needs a trusted checkpoint to substantiate detection of tail deletion or complete-chain replacement.

Evidence registration is two-phase: request an authorized private upload, then finalize only after the server verifies bytes, type, size, SHA-256, and object version. An S3 key alone is not a permanent reference [R09]. Store original and derived object versions separately. A required proof gate tests type, scope/job/tenant binding, finalized status, and accessibility/integrity, not just row existence. Revoking a now-invalid proof does not rewrite prior completion history; it raises an audited review/rework state.

Auth uses entered email codes explicitly implemented behind `AuthProvider`. Initial security defaults: cryptographically random 8-digit codes; 10-minute expiry; maximum 5 failed attempts per challenge; one active challenge per destination/purpose; request throttling per destination/IP and at least 60 seconds between resend requests; store keyed hashes, not raw codes; atomically consume once. Tune stricter limits from abuse tests through a security decision, not by removing controls. Responses do not disclose whether an address is registered. Bind invitations to intended email, tenant, role, and expiry; a caller cannot choose their own role.

M1 web sessions use secure, HttpOnly, appropriate SameSite cookies and CSRF/origin checks. NestJS verifies the session through a provider-neutral server contract; a Next.js page guard is not API authorization. M3 introduces the provider-neutral mobile exchange/refresh path with secure token storage. Never ship a second, undocumented authentication system simply to make mobile work.

## 4. Data model reference — create incrementally

Do not create the entire roadmap schema in M0. Add each family with the task that consumes it, preserving these contracts.

**Common tenant-owned convention:** UUID primary key, non-null `tenant_id`, `created_at`, schema-appropriate unique keys, tenant-qualified relationships, and RLS. Mutable projections have `updated_at` and an optimistic `revision`; append-only facts do not pretend to have editable `updated_at` fields. Use `environment` on provider/evidence/accounting identities as defense in depth in addition to physically separate deployments.

**Documented exceptions:** global identity users/credentials/challenges/sessions and the tenant bootstrap registry live in a restricted identity/control-plane schema; migration/Graphile metadata live in restricted infrastructure schemas. They are not arbitrary business-table exceptions. The tenant account profile remains tenant-scoped. Global identity references from memberships are explicit reviewed foreign keys; routine business queries cannot enumerate identity users or credentials.

| Family | Required entities / important distinctions |
|---|---|
| Identity/tenancy | `identity_user`, `auth_challenge`, `auth_session`, tenant registry; tenant `account`, `membership`, invitation and role-policy version; `crew` when consumed. |
| Job/spine | `job` (title, client reference, job type, `provenance: quoted\|imported`, lifecycle), `scope_identity` (its ID is `scope_item_id`), `scope_lineage`, `scope_revision`, `scope_progress`; accepted/baseline quote pointers, immutable accepted-net-value and cap snapshot. |
| Capture | Immutable `capture_source`, `job_record_proposal`, `proposal_line`, `proposal_field_citation`, `flagged_question`, confirmation/dismissal records. |
| Quotes/approval | `quote_version`, `quote_line`, `acceptance`, `approval`, `approval_evidence`; exact subject revision/hash, actual actor vs attested customer, method/time. |
| Decisions/commands | `finding`, `decision`, immutable `decision_resolution`, `action_authorization`, authorization revocations, `command_receipt`, event envelope/version. |
| Reliable execution | `outbox_action`, `action_attempt`, `provider_event_inbox`, provider/object/business-effect identity mapping; unknown-outcome reconciliation. |
| Evidence/audit | `evidence_upload`, immutable `evidence_object`, `evidence_link`, supersession/review events; `audit_event`, restricted `audit_head`, checkpoint manifest; WORM/anchor records in M4. |
| Variations | `variation`, immutable `variation_revision`, `variation_line`, approval/rejection facts, progress link, and lineage for new scope. |
| Customer billing | `final_account`, `fa_line`, immutable `customer_invoice`/lines, customer credit notes, `customer_receipt`, `customer_receipt_allocation`; taxes/proof appendix snapshot. |
| Fee policy | Versioned `fee_policy`, `tax_policy`, `job_activation_terms`, `plan_fee_obligation`, `fee_derivation`, fee invoices/credits and qualifying credit allocation. Pilot terms explicitly exempt platform fees. |
| Recovery | `recovery_case`, immutable `recovery_event`, `landing_candidate`, immutable `landing_allocation`, `landing_reversal`, evidence/attribution references. |
| Banking | `bank_connection`/consent metadata, provider account mapping, immutable transaction observations, reconciled transaction identity, cash allocation and reversal events. Secrets/tokens live in encrypted secret storage, not synced rows. |
| Accounting | `ledger_account`, immutable `journal` + `journal_line`, `platform_invoice`, `platform_credit_note`, settlement/clearing/refund events, `billing_allocation`; derived balances are not mutable financial truth. |
| Plans | `subscription_terms`, `standing_authorization`, authorization events, `concurrency_event`, period/meter derivations, upgrade Decisions; prices and included counts require D09. |
| Materials | `purchase_order`/`po_line`, `agreed_rate`, `merchant`, SKU/alias and unit/pack conversion, `merchant_invoice`/lines, credits, `delivery_note`/GRN lines, `match_result` and human corrections. |
| Readiness | `planned_work`, typed `dependency` (`access\|materials_landed\|predecessor_complete\|cure\|weather\|crew`), source-fact snapshot, `readiness_snapshot`. |
| Learning | Immutable `rate_book_observation` from M1 human-confirmed rates, with source/policy/unit/tax/region provenance; tenant-scoped suggestions/models only enabled in M5. |
| Operations | Retention class/policy, legal hold, deletion/export request and execution receipts, incident/reconciliation records, versioned provider/data-flow register. |

`plan_fee_paid_pence`, landed totals, ledger balances, live-job counts, and inbox counts are read models derived from facts. An indexed projection may exist for performance but is rebuildable and never bypasses the source-of-truth checks.

---

## 5. M0 — Foundations

### M0-1 Repository inspection, scaffold, and executable CI

**Depends on:** none.

**Build:** inspect the repository when available and record existing capabilities before editing. Establish pnpm/Turborepo, `apps/api`, `apps/web`, `packages/core|db|ai|config`, strict TypeScript, root scripts, pinned compatible dependencies, `.env.example`, Docker Compose PostgreSQL/MinIO/worker services, and a local mail sink. Add a test harness, generated OpenAPI, dependency/import-boundary checks, and CI.

**Done when:**
- A clean checkout installs from the lockfile; `pnpm dev` starts API and web; `GET /healthz` returns 200 **without opening a database connection** (a separate `/readyz` probes the datasource), so M0-1 completes with no container runtime; production `pnpm build` succeeds. The Docker Compose file is authored here; its Postgres/MinIO/worker stack is smoke-tested once a container runtime is installed (a precondition of M0-4 / M0-11 / M0-12-MinIO, not of M0-1).
- CI runs real typecheck/lint/unit/build checks, secret scanning, and dependency review. **The agent lane-boundary lint** (adapted from OWN MIND `tools/agent-lane-boundary-lint.mjs` + a `config/agent-lane-assignments.json`) runs in CI — not only as a bypassable pre-commit hook — and is in place before the first parallel wave (M0-2 onward), since M0-2/M0-3/M0-4/M0-12 dispatch to separate agents. A `packages/core` import-boundary/purity test fails on a core file importing `pg`/`fetch`/a vendor SDK; generated OpenAPI runs and matches routes. Add subsystem suites as introduced rather than misleading empty checks. Where the repo has no remote yet (push is founder-reserved), "runs in CI" is recorded as deferred-until-push against local `pnpm typecheck/lint/test/build` evidence, not treated as passed or failed.
- `docs/repo-baseline.md` records what was reused, created, and not verified, **and records Node 24 as an approved deviation from the pinned Node 22** (`engines`/`.nvmrc`/CI matrix pin 24; revisit at M3 for Expo). No existing data or implementation is overwritten merely because the plan expected a blank repo.
- Runtime/package versions are recorded with a supported-version/security-update policy; major stack deviations are not made silently.

### M0-2 Versioned contracts, decision register, and feature gates

**Depends on:** M0-1.

**Build:** materialize sections 2–3 into versioned decision/contract records; define environment modes, provider/data-flow schema, pilot terms, and feature gate evaluation. Add the task/contract ownership map and document dependency checks.

**Done when:**
- D01–D12 have exact proposed content, owner roles, approval requirements, and affected gates; none is marked approved without actual evidence. (D11 commercial-integrity and D12 data-protection records are authored here as `proposed`; M1-16 only reads D11 thresholds.)
- Production attempts at unapproved fees, unsupported tax issue, or an unapproved provider route fail server-side with an actionable typed error.
- **Fitness test (rev 2.2):** in `production` mode, every code path that posts a plan/recovery fee obligation, issues a tax invoice, or dispatches to a provider fails with a typed denial unless the corresponding D01/D02/D04 record is `approved` — proven by attempting each with the record `proposed`, plus a static check that these effect sites import the gate (the analogue of M0-8's commercial-boundary architecture test).
- Synthetic development runs without claiming production approval. Mode cannot be set by an API caller or changed to launder sandbox evidence.
- The job/quote/payment terminology, source precedence, and command/event version policy are consistent across both plan documents.

### M0-3 Money, quantity, allocation, and tax-policy primitives

**Depends on:** M0-1. (Wave 1 — parallel with M0-2, M0-4, M0-12.)

**Build:** checked pence type and serializers, exact rational/`bigint` intermediate arithmetic, quantity parser, net/discount calculation, half-even/half-up functions, deterministic penny allocation, tax-policy interface, and pure candidate fee calculations.

**Done when:**
- Property tests cover conservation on split/recombine, deterministic remainder assignment, non-integral quantity input, negative corrections, currency mismatch, all tie cases, magnitude limits, and overflow.
- The section 3.5 fixture table and cumulative/refund examples compute exactly with no binary-float money operations. Include one fixture whose cap or fee lands on an exact half-penny tie so the golden gate distinguishes half-even from half-up (rev 2.2 item 10). **A static rule (lint/AST, or a `Money` API that exposes no float operators) bans `number` multiplication/division in `packages/core` money/fee modules** — fixtures and property tests reduce but do not by themselves prevent a stray float (rev 2.2 item 8).
- £79 owed and £79 settled remain separate inputs; the fee credit never appears solely because a job is live.
- VAT-policy fixtures demonstrate group-level rounding and exact reversing credit notes; unsupported tax treatment is rejected, not mapped to 20%.

### M0-4 PostgreSQL, tenant context, privileges, and RLS

**Depends on:** M0-1. (Wave 1 — parallel with M0-2, M0-3, M0-12.)

**Build:** Drizzle/migrations, tenant account and membership foundations, restricted global identity/bootstrap schema, runtime/migration/infrastructure roles, tenant-scoped repositories, composite keys, and catalog-based policy inspection. `withTenant` accepts only a trusted verified context; until M0-6, synthetic tests supply that context and no public business mutation is exposed.

**Done when:**
- Real-PostgreSQL two-tenant tests cover reads, inserts, updates, deletes, changed `tenant_id`, wrong filters, missing/malformed context, transaction rollback, and pooled connection reuse.
- Cross-tenant and same-tenant wrong-job references fail through composite relationships where relevant. Constraint errors do not expose another tenant’s record details.
- Runtime has no table ownership, `BYPASSRLS`, superuser, privileged role membership, policy-alter, or protected-table truncate rights. Required RLS/`FORCE RLS` and `WITH CHECK` policies are inspected in the actual database.
- Exceptions for bootstrap/identity/Graphile are narrow and tested; infrastructure connections have no routine business-data access. Every new business table automatically joins the isolation suite.
- Fresh migration and upgrade/backfill tests run in CI; tenant-safe indexes support expected scoped access patterns.

### M0-5 Serialized append-only audit and trusted checkpoints

**Depends on:** M0-4.

**Build:** immutable audit events, canonical event serialization, per-tenant head/sequence allocation, `appendAuditBatch`, verifier, privilege restrictions, lock-order contract, and independent restricted checkpoint export.

**Done when:**
- Concurrent append tests produce a single contiguous verifiable chain with unique sequences; rollback leaves no business-only change or orphan audit event.
- Tampering with payload, actor, subject, type, timestamp, sequence, or previous hash fails verification. Tail truncation is detected against a supplied independent checkpoint.
- Runtime cannot update/delete/truncate audit rows or alter the verifier’s trusted checkpoint. Privileged rewrite limitations are documented rather than claimed away.
- Payload allowlists exclude free-text PII; references/hashes have an access/retention classification. Lock-order tests exercise competing audited commands without persistent deadlock.

### M0-6 Entered-code authentication, sessions, membership, and permissions

**Depends on:** M0-4. (Wave 2 — parallel with M0-5, M0-11.)

**Build:** `AuthProvider`, explicitly implemented email-code challenge/verification, web-session/API principal bridge, atomic signup/bootstrap, invitations, permission matrix, membership revocation, CSRF/origin checks, and abuse controls from section 3.7. Identity emails use the narrow bootstrap message category.

**Done when:**
- A new user signs up and owns one new tenant; an invited user joins only the intended tenant/role/email after verification. A client cannot self-select an elevated role.
- Code expiry, resend cooldown, request throttling, attempt limits, single use under concurrent submission, and non-enumerating responses are tested; codes/tokens never enter logs.
- NestJS rejects unauthenticated requests even when a web route was bypassed; revoked memberships cannot create new business commands. Tenant selection must match verified membership.
- **Tenant-context provenance test (rev 2.2, §5.1 invariant):** an import/boundary test proves the only callers that construct a `verifiedContext`/`effective_tenant_id` for `withTenant` are the authenticated principal bridge; a negative test proves a request supplying `x-tenant-id`/`requested_tenant_id` that differs from verified membership is rejected, never honoured. This gives the §5.1 "context created only after auth, never from a request header" guarantee a real test owner (M0-4 tests RLS *given* a context; it does not test the context's provenance).
- Roles cover owner/admin, estimator, foreman, operative, finance, and read-only with deny-by-default actions. Operatives cannot approve commercial charges or administration; finance authority is explicit rather than inferred.
- Auth.js imports exist only in the adapter; the documented mobile token/session extension point does not require mobile implementation yet.

### M0-7 Job spine, identity registry, revisions, and lifecycle

**Depends on:** M0-3, M0-4, M0-6. (Wave 3 — parallel with M0-10.)

**Build:** job aggregate/repository, scope identity/lineage/revision/progress, quote-baseline references, and the section 3.1 lifecycle with permission/revision guards. Create only fields consumed by M1 contracts; snapshots are populated by later tasks.

**Done when:**
- Unit/integration tests enumerate legal and illegal job/progress transitions, pre-live acceptance cancellation, lost-quote reopening, and payment reversal projection.
- Stable IDs survive create/read/review transitions; same-tenant wrong-job links fail; proposal reservation does not create an authoritative price.
- Commercial snapshot immutability does not block progress/evidence writes; illegal direct mutation of frozen commercial terms fails at the controlled database boundary.
- Concurrent updates require the expected revision; no generic PATCH route can set `live`, `paid`, cap, or settled-fee balances directly.

### M0-8 Decisions, exact action authorization, and command receipts

**Depends on:** M0-5, M0-6, M0-7. (Wave 4.)

**Build:** immutable Decision resolutions and action authorizations, user-command dispatcher, inline approval, semantic business-effect keys, revocation/expiry handling, and durable tenant-scoped command receipts. Define future standing authorization types but leave unattended commercial execution disabled.

**Done when:**
- “Resolved/dismissed” never authorizes an action. Approved recipient/content/revision/amount changes, expired permissions, and revoked authorization fail before execution.
- Double-click and simultaneous switch-live-style synthetic commands with the same or different command IDs create at most one semantic effect. Same key/different payload returns conflict.
- Approval resolution, domain mutation, audit, and command result are atomic; a failed transaction creates no usable authorization.
- A direct commercial adapter import/call outside the approved boundary fails architecture tests. Inline “Send” approval can use the boundary without an extra inbox visit.
- **Lock-order fitness test (rev 2.2 item 7):** two competing consequential commands prove no business aggregate lock is acquired after `appendAuditBatch` — extending M0-5's audit-only deadlock test to the command layer, so the §5.4 "audit append is the last lock" invariant has a command-layer owner (this task or M0-9), not only prose.

### M0-9 Transactional outbox, worker isolation, provider inbox, and retries

**Depends on:** M0-8.

**Build:** durable action outbox/attempt log, Graphile dispatcher, fake outbound adapters, provider-event inbox/signature interface, dead-letter/unknown-outcome queues, and reconcile/retry/cancel commands. Worker business queries use the RLS role, not Graphile’s infrastructure connection.

**Done when:**
- Transaction rollback sends nothing. A committed but not enqueued-to-Graphile action is later discovered and executed; no dual-write gap loses approved work.
- Worker restart before/after the provider call, duplicate jobs, expired authorization, duplicate/out-of-order events, and same provider effect represented by different event IDs are covered.
- The exact approved immutable content is sent; no live document lookup silently changes it. Provider deduplication behavior is an adapter contract, not assumed.
- An ambiguous accepted request becomes `outcome_unknown`, is visible to an operator, and cannot be automatically resent unsafely. Reconciliation can establish success or a safe retry.
- Logs/metrics show queue age, failures, retries, and unknown outcomes without content/credentials. External calls never hold a business transaction open.

### M0-10 Balanced ledger and controlled financial posting boundary

**Depends on:** M0-3, M0-4, M0-5. (Wave 3 — parallel with M0-7; not blocked by M0-8/M0-9. Its integration with commands lands in the M1 fee tasks.)

**Build:** immutable journal headers/lines, ledger accounts/books, safe source-event uniqueness, compensating entries, derived balances, obligation/settlement distinction, and restricted posting routines. Add interfaces for candidate fee derivations and the future qualifying-landing routine, with real recovery-fee posting disabled until implemented and approved.

**Done when:**
- A transaction cannot commit an unbalanced, zero-line, mixed-currency, cross-tenant, duplicate-source, or post-hoc edited journal; direct runtime writes outside the controlled routines fail.
- Reversal/partial settlement fixtures rebuild balances exactly. Receivables, cash/provider clearing, tax, and recognized/deferred income are distinguishable; real chart mappings remain gated on D02.
- A quote event cannot generate a platform journal. A pilot switch-live creates no platform obligation. A synthetic authorized plan obligation is owed, not paid.
- The financial primitive requires real authorization and provenance interfaces; a generic journal API cannot bypass the future no-proof-no-fee rule.
- SQL enforcement uses valid checks/keys and explicit transactional cross-row routines/triggers, with real-PostgreSQL concurrency tests rather than cross-table `CHECK` fiction.

### M0-11 Versioned private storage and verified evidence uploads

**Depends on:** M0-1, M0-4. (Wave 2 — parallel with M0-5, M0-6.)

**Build:** evidence upload/finalization states, private versioned S3/MinIO adapter, short-lived scoped URLs, server-side hash/size/type verification, quarantine/rejection, immutable object registration, and authorized evidence links. Establish original/preview separation and a retention-class field; do not enable WORM yet.

**Done when:**
- An unfinished upload, wrong hash/type, exceeded size, missing version, cross-tenant object, wrong job/scope, or rejected object cannot satisfy a proof predicate.
- A verified image is stored and fetched by its exact version with matching SHA-256. Overwriting the same key with a new version does not change the registered evidence.
- Two retries of finalization create one evidence identity; stale signed URLs and unauthorized downloads fail; orphan upload cleanup respects retention policy.
- Capture time from a device is separate from server receive/verify time. Derived previews do not replace original bytes or their hash.

### M0-12 Approved AI gateway, provider register, and evaluation harness

**Depends on:** M0-1; coordinate the provider/data-flow register with M0-2. (Wave 1 — parallel with M0-2, M0-3, M0-4.)

**Build:** Claude deployment abstraction and Deepgram STT adapter behind `packages/ai`; strict schema/citation validation; bounded repair, timeout/cost limits, cancellation, prompt-injection-resistant separation of source data, and source/model/prompt/schema provenance. Register all external data flows. Create synthetic source fixtures and `pnpm eval` with deterministic contract tests plus an approved-region live-model gate.

**Done when:**
- Malformed structured output gets at most one repair, then a typed error; invalid citation spans/IDs are rejected; feature code cannot import vendor SDKs or execute model-directed commercial actions.
- A proposed EU/UK Claude route and explicit Deepgram regional endpoint are verified for the actual features/model/profile; absent D04 approval, live personal-data calls are blocked. No silent global fallback exists.
- The initial capture set contains at least 20 labelled synthetic walkarounds with omissions, uncertain rates/quantities, split/merge cases, and adversarial embedded instructions. At least one has five explicitly priced lines and an unresolved question.
- Initial **proposed pilot evaluation targets** are ≥95% labelled scope-intent recall, zero unsupported monetary values labelled as extracted facts, 100% in-bounds persisted citations, and correct unknown/flag behavior on every designated ambiguity fixture. Report numerators/denominators and per-case failures; passing does not imply universal accuracy.
- Relevant model/prompt/parser/schema changes trigger CI contract evaluation and a release-blocking live golden run in the approved region. Results record deployment/version/cost; test thresholds cannot be weakened silently.

### M0-13 Pilot deployment, recovery, privacy operations, and foundation gate

**Depends on:** M0-9, M0-10, M0-11, M0-12. (Wave 6 — convergence for the G0 gate.)

**Build:** deployable UK-region environments, TLS/private storage, secrets/least privilege, redacted observability, backup and restore runbooks, independent audit checkpoints, retention/export/deletion procedures, access revocation, incident/reconciliation ownership, and commercial outbound kill switches. Keep the no-charge pilot mode enforced.

**Done when:**
- An isolated restore recovers database, evidence versions, and checkpoint references; verification checks tenant isolation, chain integrity, and representative artifact hashes. Record actual recovery/data-loss measurements against D07’s approved objectives.
- A deletion/export rehearsal handles source data, derived data, logs/backups according to policy, retained legal/accounting records, and in-flight work; it does not promise impossible immediate erasure from every backup.
- Alerts and ownership exist for queue failures, unknown sends, failed backups, unauthorized route attempts, and storage verification errors. Disabling outbound execution does not discard audit/evidence.
- G0 evidence is complete. G1 requirements are either approved with evidence or visibly blocking real-data access; no owner approval is fabricated to close the task.

**M0 exit:** all foundation acceptance tests pass; no unapproved real-data route, unrestricted financial writer, fake payment state, or commercial-send bypass exists. M1 may begin after G0; real-data pilot activation waits for G1.

---

## 6. M1 — The core loop: ship and test this first

**Target:** two builders run a job end to end in the mobile-first web client without re-typing the same commercial facts. Use synthetic data until G1; the real pilot is no-charge. Do not start M2 until the M1 exit journey and its critical controls pass.

### M1-1 Mobile-first shell, jobs list, and tenant-safe navigation

**Depends on:** M0-6, M0-7. (UI track — may start once auth + the job spine exist, in parallel with the rest of M0 and the M1 backend; real-data use still waits for G1.)

**Build:** responsive field/office shell, sign-in and tenant selection, accessible navigation, jobs list and empty states, job header, action/status indicators, and typed error/retry presentation. Evolve this shell throughout M1 rather than bolt it on after the workflows.

**Done when:**
- At a 360 CSS-pixel viewport and desktop width, core navigation works without horizontal page overflow; keyboard/focus labels and touch controls are usable.
- Job lists display canonical status plus document/payment provenance; queued/unknown sends are not shown as delivered, and a pilot job does not display a fee as paid.
- Switching tenants clears/re-keys cached data; direct links, search results, and unauthorized job IDs do not expose another tenant’s content.
- Browser tests cover sign-in, tenant switching, empty jobs, a live job, typed failure, and refresh/retry without duplicate creation.

### M1-2 Capture source → cited JobRecordProposal

**Depends on:** M0-7, M0-11, M0-12. (Head of the capture chain; runs in parallel with the M1-1 UI track.)

**Build:** `POST /jobs/capture` and “Walk it” text screen; optionally approved-region audio transcription. Persist immutable source bytes/text and hashes, a `draft` job, proposed lines with reserved scope IDs, materials suggestions, and flagged questions. Gateway output is proposal data only.

**Done when:**
- The labelled, explicitly priced reference walkaround yields at least five proposed scope lines and the expected flagged question; sources lacking prices retain unknown rates instead of invented values.
- Every extracted field has a validated source span/reference and source version; inferred/defaulted/human-supplied fields have a different provenance tag.
- No canonical commercial revision or quote-send action exists until human confirmation. A retry of capture does not duplicate the proposal/job.
- The screen exposes source text alongside results and can recover from invalid model output, unavailable provider, or missing audio upload without discarding the user’s original input.
- The M0 capture golden suite passes for the actual pinned prompt/model. AI extraction does not interpret embedded source instructions as permission to access tools or other tenants.

### M1-3 Review, reconciliation, confirmation, and scope lineage

**Depends on:** M1-2, M0-8.

**Build:** editable proposed lines grouped by room/category, visible source excerpts, flagged questions, per-item accept/edit/dismiss/split/merge, human-added lines, and a reconciliation summary. Confirmation creates canonical revisions and moves the job to `quoting` through the command boundary.

**Done when:**
- Human edits persist; dismissals/reasons and split/merge lineage are recorded; unchanged confirmed items retain their reserved `scope_item_id`.
- Repeated/concurrent confirmation produces one canonical outcome and audit event set. Stale proposal edits require reconciliation rather than overwriting a newer review.
- The summary separately identifies proposed, accepted, dismissed, split/merged, and human-added items. It does not claim the model heard everything solely because counts balance.
- Required missing commercial inputs block quote issue; non-blocking questions may remain visible with a documented disposition. Review cannot silently drop unresolved questions.
- A builder can inspect the original walkaround and add an omitted item. Only confirmation promotes AI output; failure rolls back scope, audit, and command receipt together.

### M1-4 Quote pricing, supported VAT, coverage, and rate observations

**Depends on:** M1-3, M0-3.

**Build:** draft quote editor with exact quantity/rate/discount inputs, tax-policy selection within the M1 restriction, totals, coverage diff, and human-confirmed price provenance. Write tenant-scoped `rate_book_observation` facts whenever a human confirms a relevant unit rate; no learning/suggestions are enabled yet.

**Done when:**
- Subtotal, tax groups, discounts, and total match approved fixtures to the penny; missing quantities/rates and unsupported tax treatments block real issue with a clear explanation.
- Coverage diff identifies unpriced captured scope, excluded items and their reasons, unresolved blocking questions, and human-added extras. It does not silently reprice accepted commercial snapshots.
- Rate observations include source scope revision, unit, rate principal, tax basis, category/region where known, effective time, and whether the rate was entered or accepted from a suggestion; repeated confirmation does not duplicate an observation.
- Quote edits create revisions/draft-pointer updates and preserve lineage. No quote operation creates platform obligations, ledger entries, or payment requests.

### M1-5 Immutable quote artifact and free authorized send

**Depends on:** M1-4, M0-9.

**Build:** deterministic server-rendered quote PDF in the approved region, immutable quote snapshots/versioned objects, preview, recipient confirmation, and inline Decision-authorized send through the outbox. Store issuer/client details in the document record, not free-text audit payloads.

**Done when:**
- The PDF contains all included lines, totals, exclusions/qualifications, issuer and customer details, and a stable document version. Multi-page/long-description fixtures are visually checked for clipping and omitted lines.
- “Send quote” approves exactly the previewed version and recipient set; subsequent edits require a new version and fresh approval. A stale approval cannot send a changed artifact.
- Failure/retry/unknown-outcome states are visible and follow the adapter contract. `issued`, provider-accepted, delivered, and customer acceptance remain different facts.
- Creating, downloading, issuing, or sending any number of quotes produces zero platform fee obligations, platform journals, or charge attempts, including under retries and malicious payloads.

### M1-6 Record acceptance of exact terms

**Depends on:** M1-5.

**Build:** “Record customer acceptance” with actual actor, method, date, exact quote revision/hash, and supporting evidence. M1 supports builder attestation with an explicitly labelled claim of customer approval; authenticated customer-link approval is a separately verified method, not a relabelled builder click.

**Done when:**
- Accepting quote version 2 cannot authorize version 3; the accepted revision and total remain immutable and the job becomes `accepted`.
- Builder-attested approval records the builder as actor and the stated customer/method as an attestation; the UI/export does not claim an e-signature or independently authenticated customer action.
- Decline, supersession, and pre-live acceptance cancellation are audited; cancellation does not erase the old acceptance/document.
- Acceptance alone never activates a plan, fixes a new paid obligation, or collects money. A stale or unauthorized acceptance attempt fails.

### M1-7 Switch live, freeze cap/baseline, and separate fee states

**Depends on:** M1-6, M0-10.

**Build:** explicit switch-live Decision/command bound to the accepted revision and activation terms. Atomically set the live state, baseline pointer, accepted-net-value, and immutable cap/policy snapshot. For the real pilot, record a no-charge entitlement; for the isolated synthetic demo, exercise an authorized £79 principal obligation and a separate simulated settlement event when desired.

**Done when:**
- Double-clicks and concurrent commands create one activation, one cap snapshot, and at most one permitted synthetic base obligation; quote activity on another job cannot trigger any of them.
- Frozen quote/accepted-value/cap cannot be edited or enlarged by a later variation. Operational progress and evidence attachments remain writable through authorized commands.
- A pilot activation produces no platform obligation, no production journal, and no collection request; the screen says no charge. The cap/fee example is labelled illustrative until D01 approval.
- A synthetic obligation displays owed/unpaid until a separate fake-provider settlement is processed. The same fake settlement is rejected by production/pilot accounting paths.
- Unresolved required acceptance/price/tax fields, changed quote revision, or missing permission block activation. The audit ties the activation to exact accepted terms.

### M1-8 Pure checks, initial suppression, and Decision Inbox

**Depends on:** M1-7.

**Build:** pure checks over an immutable job/fact snapshot: unresolved questions, required proof by scope rule, and a generic materials-bill-review suggestion. Add deterministic finding identity/fingerprint, mandatory-vs-advisory classification, persistence/suppression, and inbox list/detail/resolve using the existing command boundary.

**Done when:**
- A live fixture with plastering/electrical/groundwork proof rules and unresolved questions raises the expected decisions; replaying the same snapshot does not create duplicates.
- Mandatory proof/commercial blockers are never suppressed by low monetary value, low suggestion confidence, or a daily advisory budget.
- Checks perform no I/O, writes, sends, orders, or charges; architecture/purity tests enforce this. Persistence and Decision creation occur in separate application code.
- Resolving an advisory check by dismissal is audited but does not authorize a send. Approval of a consequential option binds its exact action through M0-8/M0-9.
- “Check the materials bill” is labelled a review suggestion, not a claim that an actual overcharge has been detected.

### M1-9 Variations: proposal, confirmed price, and approval provenance

**Depends on:** M1-7, M0-8. (Track A — parallel with M1-8 and M1-10.)

**Build:** “Log an extra” text/approved audio capture into a variation proposal; human-reviewed rates/quantities and price; new/existing scope identity linkage; customer approval evidence or builder attestation; immutable approved revisions and append-only rate observations.

**Done when:**
- AI pricing remains a labelled suggestion with source/rate provenance; a missing rate is not treated as agreed. Only confirmed values move the variation to `priced`.
- Approval binds the exact priced revision, customer-approval method, and actual actor. A changed amount/content invalidates prior approval for the new revision.
- Rejected/unapproved variations remain visible but ineligible for final-account assembly. An approved omission/negative adjustment is represented as a signed delta, not a baseline edit.
- New variation scope gets a new lineage-linked identity; variations of existing scope retain the existing identity. Concurrent approvals are idempotent and audited.
- This task verifies eligibility flags and immutable approved revisions. Final-account inclusion is tested in M1-11, where assembly actually exists.

### M1-10 Proof capture and operational stage gates

**Depends on:** M1-7, M0-11. (Track A — parallel with M1-8 and M1-9.)

**Build:** mobile web proof capture/upload on a scope item or proof Decision, upload progress/resume, evidence preview, finalized linking, and gated progress completion. Resolve proof Decisions only when their actual predicate is satisfied.

**Done when:**
- A photo is server-verified, stored by exact object version, and linked to the correct `scope_item_id`; the audit records evidence identity/hash without the photo or free text.
- An unfinished upload, wrong evidence type, cross-job link, rejected image, or missing original object cannot satisfy completion. Two concurrent complete/upload commands do not bypass finalization.
- Commercial snapshot immutability does not prevent legitimate stage updates. A revoked/invalidated evidence item raises an explicit review/rework event, not silent history changes.
- Failure and retry preserve the selected scope identity; the UI distinguishes uploaded, verified, and rejected states rather than immediately showing “proof complete”.

### M1-11 Final-account assembly from accepted history

**Depends on:** M1-4, M1-9, M1-10. (Track A — joins the frozen baseline with approved variations and verified proof.)

**Build:** deterministic draft final account from baseline quote lines plus approved variation revisions, proof appendix manifest, exact tax totals, coverage/leak checks for performed-but-unbilled approved variations and an unissued final account.

**Done when:**
- Totals equal the frozen baseline plus approved signed variation deltas and the approved tax calculation, independent of subsequent working-scope edits.
- Approved variations appear once; unapproved/rejected revisions never enter billable lines. Each line traces to scope identity, commercial revision, and approval where required.
- Attached proof references exact evidence versions and scope identities. Missing mandatory proof blocks the applicable completion/issue rule; unrelated optional media does not satisfy it.
- Draft rebuilds are deterministic for the same source revisions. Changes to included variations/evidence create a new draft revision and invalidate stale issue/send approvals.
- Leak checks are findings/Decisions only; they do not send an invoice or create an unapproved charge.

### M1-12 Customer invoice issue/send and explicit payment records

**Depends on:** M1-11.

**Build:** immutable numbered customer invoices/PDFs from approved final-account revisions, Decision-authorized issue/send, customer credit-note correction, and “Record customer payment” with date, amount, method, reference, and builder attestation. Separate customer billing from platform fees.

**Done when:**
- Real issue is gated on D02/D06/G1 and supported tax scope; synthetic PDFs are visibly non-production. Issued invoices retain issuer details, numbering, tax policy, source revision, and evidence appendix.
- A repeated issue/send creates one semantic invoice/action, not duplicate customer debt. Changing terms after issue requires a credit note or new valid document, not overwriting the PDF.
- Partial receipts reduce the invoice balance without prematurely projecting the job to `paid`; full allocated receipts do. A reversal restores the balance and correct status with history intact.
- Manual receipt provenance is visible and cannot become qualifying recovery proof or a platform-fee settlement. Overpayments remain an explicit unapplied/customer-credit balance rather than negative invoice “paid” flags.
- Browser and accounting tests cover unpaid, partial, paid, credited, reversed, stale approval, and retry states.

### M1-13 Recovery outcome primitives and structural fee guard

**Depends on:** M1-7, M0-10. (Track B — parallel with Track A; not blocked by customer billing.)

**Build:** the minimal recovery event/landing-allocation schema and controlled fee-derivation/posting routine needed to test section 3.5/3.6. Use isolated synthetic provider facts, verified synthetic evidence, explicit eligibility/landing approval commands, and the same typed interfaces M4 extends. There is no production “toggle landed” control.

**Done when:**
- In the synthetic environment, approved partial landings produce cumulative deterministic derivations; duplicate/concurrent allocations cannot exceed receipt/claim availability or consume a job cap/credit twice.
- Positive fee posting fails for missing evidence, incomplete upload, wrong tenant/job/case, pending settlement, prevented case, unapproved eligibility, reused underlying cash, stale approval, or a direct runtime insert.
- Multiple recovery cases on one job share a single cap and plan credit. Reversal and evidence-invalidation fixtures produce compensation/review, never mutation of old journals.
- Production/pilot modes reject synthetic proof and the unapproved reference policy; pilot fee calculation is read-only. Production eligibility logic remains gated until M4/D03.
- The SQL test attempts actual forbidden writes and races in PostgreSQL; a Zod-only test is not accepted as structural enforcement.

### M1-14 Fee illustration and transparent per-job statement

**Depends on:** M1-13.

**Build:** statement projections showing mode/policy, base plan obligation/settlement, eligible outcomes and proof, cap, cumulative fee/credit, prior postings/payments, compensation, and separate principal-benefit vs gross-cash views. Real pilot screens contain no collectible platform balance.

**Done when:**
- All section 3.5 examples, including the £18,800 binding boundary and the cap-below-£79 case, display the exact results and explain the cap interpretation.
- The £2,820 example distinguishes £203 additional principal liability, £2,617 incremental retained principal, and £2,538 net benefit after total platform principal. VAT is explicitly excluded from those example figures.
- Unpaid base fees do not earn paid credit; prevented findings show no recovery fee; partial landings/reversals visibly reconcile to immutable source records.
- Synthetic/demo and no-charge pilot exports cannot be mistaken for an issued platform tax invoice or actual money collected. Proof links obey tenant authorization.

### M1-15 Demo seed, regression suite, and unscripted builder trial

**Depends on:** M1-1, M1-12, M1-14. (Convergence of the UI, customer-billing, and platform-fee tracks.)

**Build:** `pnpm seed:demo` for a separate synthetic tenant/environment at several workflow points; full browser regression; pilot onboarding and observation checklist; issue capture without quietly changing acceptance criteria.

**Done when:**
- The complete journey passes: sign in → walk → review/confirm → price/send free quote → record exact customer acceptance → switch live no-charge → resolve a decision → upload verified proof → price/approve an extra → assemble/issue final invoice → record payment → view the labelled fee illustration.
- `job_id` and scope lineage persist throughout. No accepted commercial facts are re-typed to build the invoice; human correction/approval remains possible and visibly intentional.
- Two builders complete the supported flow unscripted and observed friction is recorded. Blocking defects are resolved; the trial is described as usability/continuity validation, not proof of recovery economics.
- Gate G1 is satisfied before real data/send. Demo seeds cannot run against production without an explicit safety refusal; they never overwrite a real tenant.
- Adversarial regressions cover double activation, stale send approval, cross-tenant relationships, unfinished proof, partial payment, missing fee proof, cap/credit races, and a worker crash after an external request.

### M1-16 Commercial-integrity instrumentation (advisory, non-billing)

**Depends on:** M1-7, M0-10. Runs in parallel with Tracks A/B; does not gate the M1-15 trial.

**Build:** implement D11 as pure checks over immutable facts — switched-live-vs-won ratios, accepted-vs-quoted-vs-final variance, live-job activity signals, and a “recovery discussed then no in-app landing” signal — plus a per-tenant review queue and aggregates. Store the freeze of `accepted_net_value` with the quoted and (later) final values alongside. Detection produces findings only.

**Done when:**
- Checks perform no writes to money/authorization and cannot charge, suspend, cap, or penalize; architecture tests enforce it. Outputs are review findings with the underlying numbers cited.
- Won-but-never-switched-live, accepted value materially below quoted/final, and “recovery settled outside the app” each raise distinct findings; thresholds come from D11, not hardcoded guesses.
- Signals are strictly per-tenant and cannot read another tenant’s data. While D11 is pending, the cap stays on the D01 candidate and these signals run advisory in synthetic mode only.

### M1-17 Adopt an in-flight job (import path)

**Depends on:** M1-7; a decision record for import terms (D06/D11 as applicable). Independent track; not required for the M1-15 trial.

**Build:** an explicit “adopt a job already under way” path, distinct from capture→quote→win: create a job at a chosen lifecycle point with builder-stated, attested accepted terms and baseline, an `imported` provenance flag, and a clearly-labelled weaker evidence lineage. Fix the recovery-fee cap from the stated accepted value at import, under the same authorization/audit/command boundary as switch-live.

**Done when:**
- An imported job carries `provenance = imported`, records who attested its baseline/accepted value and when, and can never masquerade as system-generated quote lineage.
- The cap is fixed at import from the stated accepted value under the approved policy; an imported baseline cannot later be silently enlarged.
- Evidence and recovery bundles from an imported job visibly mark the weaker lineage; no AI estimate can set the accepted value or the cap.
- Import never creates historic fees or bills the no-charge pilot; production import requires its own decision-record approval and satisfies section 12’s import conditions.

**M1 exit:** the no-charge core loop works end to end; user trials and critical tests pass. Real overcharge detection, bank-verified recovery, platform collection, native offline, and statutory construction billing remain explicitly unshipped.

---

## 7. M2 — Watchdog depth

### M2-1 Materials model, agreed rates, and purchase-order pre-commit checks

**Depends on:** M1-15.

**Build:** merchant/SKU/alias, agreed rates and validity, pack/unit conversions, PO/lines, required-on-site dates, and pure pre-commit checks for price, known stock, and delivery timing. Place/send an order only through an exact approved action; manual placement attestation is a separate fact.

**Done when:**
- A proposed order above its applicable agreed rate raises a cited Decision before placement. Rate version, tax basis, unit, and pack quantity are explicit.
- Unknown/stale stock or lead-time data is shown as unknown, not guaranteed availability. A revised price/quantity/recipient invalidates old order authority.
- Confirm/retry cannot place two orders for one approved business effect; same-tenant wrong-job links and duplicate supplier references are handled safely.
- Prevention findings are non-billable and cannot manufacture a recovery landing or fee.

### M2-2 Merchant document intake and delivery-note capture

**Depends on:** M2-1.

**Build:** upload plus approved inbound email alias for merchant invoices, credit notes, and delivery notes; tenant-safe alias mapping; verified originals; duplicate intake identity; quarantine; pagination/multi-document splitting; and GRN capture with delivered quantities and partial deliveries. Do not implement matching in this task.

**Done when:**
- Re-upload/forward of the same underlying invoice produces a linked duplicate/candidate rather than duplicate debt. Invoice number alone is not treated as globally unique.
- Unknown senders/aliases, oversized/malicious attachments, cross-tenant routing, password-protected/unreadable files, and partially uploaded documents are rejected or held for review.
- Original object versions and source-page references survive splitting. GRNs distinguish ordered, delivered, rejected, missing, and later-delivered quantities.
- Inbound email/attachment processing is in the D04 register and cannot enable arbitrary outbound email or fetch untrusted remote URLs without controlled validation.

### M2-3 Document extraction with human confirmation

**Depends on:** M2-2.

**Build:** text-first extraction for digital PDFs, OCR for genuinely image-only sources through an approved regional service, and a structured line proposal/review UI. Keep Textract/LLM-vision behind adapters; use the least complex approved route that meets the fixture requirement. Before M2-4 starts, also freeze the labelled matching corpus, development/held-out split, and M2-5 target definitions using manually reviewed ground truth.

**Done when:**
- Merchant identity, invoice/date/currency, line quantity/unit/net/tax/total, discounts, credits, and stated totals have page/region citations and confidence/provenance.
- Total reconciliation detects missing pages, decimal/quantity errors, duplicate lines, and extracted totals inconsistent with the document. Uncertainty requires review instead of a fabricated balanced total.
- Human corrections create confirmed document data and retained extraction history; AI output alone cannot establish an agreed debt, delivery, or fee.
- Fixture tests cover digital PDFs, photographed invoices, rotated/blurred images, multi-page documents, credit notes, and mixed pack units. At least 100 varied held-out document sets and a separate development set are labelled before matching is tuned; preserve their source hashes and frozen labels.

### M2-4 Deterministic three-way matching and correction workflow

**Depends on:** M2-3.

**Build:** order ↔ delivery ↔ invoice matching using explicit merchant/SKU aliases, exact normalized references, quantities, units/packs, price validity, dates, and human-approved mappings. Represent partial/one-to-many matches and unmatched/ambiguous lines. Do not add vector search or LLM tie-breaking yet.

**Done when:**
- Fixtures cover partial deliveries, short delivery, duplicate invoices, split invoicing, agreed discounts, credits, pack conversions, substitutions, and a rate change outside its effective date.
- Price and quantity variance use the same net/tax basis and do not confuse an order estimate with an invoice obligation. Ambiguous matches remain unresolved.
- A reviewer can correct a match; correction is versioned/audited and reproducible, and does not retroactively rewrite original source data.
- Re-running the same facts produces the same match results and discrepancy identities. Concurrent corrections use revision conflicts rather than last-write-wins.

### M2-5 Evidence-linked discrepancy checks and held-out benchmark

**Depends on:** M2-4.

**Build:** pure discrepancy checks over confirmed match facts, monetary exposure, cited findings/Decisions, and evaluation against the development/held-out benchmark fixed in M2-3. Define prevention versus potential recovery without deeming a detected variance billable.

**Done when:**
- A photographed invoice with a confirmed £320 net overcharge surfaces a Decision with the agreed-rate basis, invoice citation, matching quantities, and transparent arithmetic.
- The initial held-out benchmark contains at least 100 varied document sets with genuine matches, genuine discrepancies, and ambiguous cases. Publish class counts, confusion matrix, error examples, and uncertainty rather than a single accuracy claim.
- **Proposed release targets:** false-discovery proportion `FP / (TP + FP) ≤ 5%` among actionable monetary discrepancy Decisions; recall ≥90% for labelled discrepancies of at least £25 net. “No predictions” does not pass. Freeze labels/targets before tuning; changing them requires a recorded product decision.
- Precision/recall are measured on confirmed source facts separately from end-to-end extraction+matching, so extraction failures are not hidden. Deterministic critical fixtures must all pass.
- A Decision does not send a claim, classify cash as landed, or charge a fee. Gate G2 requires reviewed pilot feedback as well as the benchmark.

### M2-6 Site-readiness model, factual adapters, and scheduled checks

**Depends on:** M2-5.

**Build:** planned work and typed dependencies; confirmed voice/text-derived planning proposals; readiness snapshots; Graphile evaluation schedules; approved Met Office/weather and jurisdiction-specific bank-holiday adapters; labour-cost exposure and resequencing proposals. Cure/technical requirements must come from a cited supplied specification or reviewed rule, not model invention.

**Done when:**
- A missing predecessor, required material, access, or crew fact raises a next-workday risk at the configured local time; fully ready work does not. Distinguish unknown from false.
- Time-zone/DST, weekends, different UK bank-holiday calendars, stale weather, changed dates, cycles, partial completion, and provider outage are covered.
- An LLM suggestion cannot silently change a work programme or technical cure requirement. A builder confirms changes; scheduling only records proposals/Decisions.
- Readiness captures are prevention and never fee-eligible, even when the estimated labour cost is high. Replays dedupe using fact/rule versions.

### M2-7 Inbox relevance, mandatory lanes, and outcome metrics

**Depends on:** M2-6.

**Build:** separate mandatory/blocking and advisory queues, deterministic/optional semantic coalescing, per-user advisory budget, ranking, explanation, structured optional AI wording, feedback reasons, and a signal-to-noise dashboard.

**Done when:**
- Finding-to-Decision conversion, dismissal/confirmation, duplicate/coalesced count, time-to-decision, and later outcomes are measurable by rule/version without exposing sensitive message content.
- Mandatory proof, authorization, and commercial blockers cannot disappear under a money threshold, confidence threshold, or daily advisory cap.
- Semantic coalescing never merges different jobs, actions, recipients, or materially changed money; the retained Decision shows all relevant source findings.
- Generated copy cannot change the underlying amount/facts/action, introduce uncited claims, or bypass review. Existing deterministic copy remains a fallback.

### M2-8 Conditional matching enhancement: earn complexity with evidence

**Depends on:** M2-7.

**Build:** inspect held-out failure clusters. Only where a documented gap remains, evaluate bounded fuzzy matching, then vector retrieval/LLM tie-break suggestions through approved adapters. Keep deterministic/human-confirmed matching as the authoritative basis.

**Done when:**
- The PR either records that no added technique is warranted, or documents a specific failure class, baseline, candidate, held-out improvement, latency/cost, and rollback switch.
- Any enabled enhancement meets M2-5’s end-to-end targets without worsening mandatory critical cases; no evaluation examples are moved into the development set to inflate results.
- Suggestions retain evidence and require confirmation for ambiguity; generated matches cannot create a landed outcome, order, invoice obligation, or fee.
- New embeddings/model providers/storage are tenant-scoped and D04-approved. No technology is added simply because the original roadmap mentioned it.

**M2 exit:** the £320 discrepancy is genuinely derived from confirmed source documents; readiness checks use explicit facts; G2 and the held-out tests pass. Findings remain human-reviewed, and prevention remains non-billable.

---

## 8. M3 — Field app + offline

The risk validation is now explicitly first. Do not interpret a later task number as an instruction to start it earlier. M0’s command contract is the base; M3 freezes its download/upload/conflict profile before feature screens depend on it.

### M3-1 Native/sync risk slice and versioned offline contract

**Depends on:** M2-8.

**Build:** minimal Expo development build on supported iOS/Android, encrypted SQLite/PowerSync adapter compatibility slice, and one authorized read plus one queued command round trip. Define client UUIDv7, HLC metadata, schema/event versions, server ordering, migrations, data classification, stale-command behavior, and unsupported offline operations.

**Done when:**
- A physical-device development build proves the selected encryption and sync adapter works; a successful Expo Go demo alone is insufficient. Record exact versions/build flags and approved hosting route.
- Contract specifies three classes: allowlisted non-commercial field merge; append-only facts; validated state/financial commands. Financial approvals and money are not last-writer-wins.
- Multi-crew property tests cover duplicate, reordered, delayed, concurrent, and clock-skewed commands with stable convergence or explicit conflicts. IDs/HLC do not override server permission/revision checks.
- D08 is approved before real-data distribution. An incompatible stack/region result blocks the affected feature and produces a decision, not an unencrypted/global fallback.

### M3-2 Native authentication, encrypted local store, and device lifecycle

**Depends on:** M3-1.

**Build:** Expo shell, `AuthProvider` mobile exchange/refresh path, platform secure key storage, encrypted local database/files, per-user/tenant caches, logout/tenant-switch cleanup, and a bounded offline read lease under D08.

**Done when:**
- Extracted database/media files do not reveal plaintext without the device-held key; release build settings prove encryption is active, not only a named dependency.
- Access/refresh credentials never enter general SQLite, logs, or sync tables. Refresh rotation/revocation, cold start, expired session, tenant switching, and local migration are tested.
- Logout removes keys/caches and queued sensitive content according to policy, with explicit handling of unsynced work. A newly signed-in user cannot inherit another user’s cached tenant data.
- Offline revocation limits are documented: a disconnected device cannot learn a new revocation instantly. Lease expiry and reconnect checks bound access; the UI never promises immediate remote erasure while offline.

### M3-3 PowerSync download authorization and minimal read models

**Depends on:** M3-2.

**Build:** tenant/user/role-scoped sync streams/rules and least-data read projections, approved-region sync deployment, scoped token issuance, and revocation/re-subscription behavior. Exclude secrets and unnecessary banking/financial details from field sync.

**Done when:**
- Two-tenant/multi-role download tests prove no unauthorized rows are synced even when the client requests another tenant or modifies query parameters.
- Download policy is tested independently of PostgreSQL RLS; provider replication privilege does not make every replicated row visible to clients [R10].
- Membership/role change and tenant switch stop new unauthorized downloads and trigger local cleanup as soon as policy/reconnect allows. Resync/migration cannot restore purged unauthorized rows.
- Large initial sync, interrupted sync, deletion/tombstones, and minimal projection rebuilds are tested without exposing provider tokens or full bank transaction history.

### M3-4 Offline command outbox, upload authorization, and conflicts

**Depends on:** M3-3.

**Build:** durable encrypted client intent queue with command ID/payload hash/expected revision, server upload endpoint through the existing command dispatcher, acknowledgment/rejection states, retry/backoff, and user reconciliation UI. No direct client writes to authoritative money/approval tables.

**Done when:**
- Reconnect/retry/reinstall-recovery scenarios do not duplicate semantic effects. Same key/different payload is rejected, and authenticated server membership is rechecked at upload.
- Stale price, accepted-version changes, revoked permission, expired approval, or conflicting completion produce explicit conflicts requiring appropriate re-review, not silent “success”.
- Commercial outbound actions are queued intent only until the server validates them online; changed recipients/content require renewed authority. A queued action is never shown as sent or paid.
- Offline merge tests are restricted to the explicit low-risk allowlist; all other fields use append-only or expected-revision semantics. Poison commands do not permanently block unrelated safe queue items.

### M3-5 Offline voice/photo capture and resumable evidence upload

**Depends on:** M3-4.

**Build:** local text/voice/photo capture, client hash and source timestamps, encrypted pending media, resumable upload, server verification/finalization, and queued AI extraction when online. Offline media is not yet authoritative server proof.

**Done when:**
- Capture survives airplane mode, app termination, device restart, low storage, and interrupted upload without losing scope identity or duplicating confirmed evidence.
- Server hash/version verification remains authoritative; client hash/time are useful metadata, not trusted settlement/proof authority.
- Pending proof cannot complete a server-required stage until upload and finalization succeed. The UI shows local-only, uploading, verified, rejected, and conflict states.
- Local deletion/retention and failed-upload cleanup preserve user intent and privacy. Audio is sent only through the approved gateway after access/processing authorization is valid.

### M3-6 Mobile core-loop screens on shared domain contracts

**Depends on:** M3-5.

**Build:** walk/review, job list, quote preview, acceptance/switch-live intent, inbox, proof, variations, final account/invoice preview, and payment-record screens using `packages/core` and the same API/commands as web.

**Done when:**
- Supported mobile flows yield the same server revisions, totals, audit, and authorization records as web; no duplicate mobile-only fee or state-machine implementation exists.
- The app clearly distinguishes offline capture/edit intent from online-only approval/issue/send/charge operations. It cannot silently approve an obsolete commercial snapshot on reconnect.
- Accessibility, small screens, media permissions, denied camera/microphone, and intermittent connectivity have usable error/recovery paths.
- No server/vendor secret is bundled in the app, and all network routes appear in the provider register.

### M3-7 Device chaos/regression suite and native release gate

**Depends on:** M3-6.

**Build:** versioned physical-device test matrix, upgrade/resync/restore scenarios, multi-crew conflict runs, lost-device/security review, operational sync telemetry, and rollout/rollback procedure.

**Done when:**
- Full field journey passes on supported iOS/Android builds: offline capture → app restart → reconnect → confirm proposal → prove work → resolve conflict → server-authorized commercial action.
- Duplicate uploads, wrong-tenant tokens, membership revocation while offline, clock skew, corrupted cache, schema upgrade, and stale approval are all covered with expected outcomes.
- G3 has evidence for encryption, independent download/upload authorization, bounded offline access, migration safety, and support ownership.
- Web remains a supported office/field fallback; a native rollout failure does not require bypassing server authority or dropping unsynced work without explanation.

**M3 exit:** offline capture is resilient; commercial truth remains server-authorized; G3 passes. Native support does not introduce a second job spine, ledger, or permission model.

---

## 9. M4 — Recovery + billing: the outcome engine

Implement and test against provider sandboxes first. Real pursuit, bank access, invoices, and payment collection each require their applicable approvals. Core recovery/payment readiness and expanded customer-billing readiness are independently gated capabilities; completing an unrelated tax template is not proof that a payment rail is safe, or vice versa. Core G4 can be reviewed after M4-17 without enabling expanded customer billing. All planned tasks still require their own acceptance before milestone exit; a disabled or unapproved feature is not silently counted as completed.

### M4-1 Full RecoveryCase state machine and case workbench

**Depends on:** M3-7, M1-13.

**Build:** extend the minimal case/events model to the complete section 3.6 transition table, case types (`merchant_overcharge|short_delivery|withheld_payment`), claim amount/revision, evidence completeness, partial outcomes, negotiation, closure, disputes, and reopen-on-reversal. Keep all claim amendments explicit.

**Done when:**
- Every permitted/forbidden transition is covered, including direct receipt after evidence assembly, partial recovery plus write-off, closed-case reversal, and duplicate transition commands.
- `prevented` is terminal and non-billable; an agent/user cannot relabel the same prevention as landed to create a fee. A genuinely separate later recovery requires a separately evidenced case/identity.
- Claimed, disputed, eligible, landed, reversed, and outstanding amounts remain distinguishable; a status label does not manufacture cash.
- The case workbench displays source facts, unresolved ambiguity, next authorized action, and complete append-only history.

### M4-2 Billability/attribution policy and review workflow

**Depends on:** M4-1.

**Build:** versioned D03 eligibility policy with default non-billable classifications; a cited classifier may propose but not decide; human review records category, attribution, claimed eligible principal, exclusions, and reasons. Resolve D01–D03 for any intended production fee path before enabling it.

**Done when:**
- Pending cash, ordinary customer payments unrelated to the recovery case, duplicate claims, unapplied credits, prevented spend, and unverified manual receipts cannot qualify as landed recoveries.
- Approved billability is tied to exact case/evidence/policy versions and the authorized reviewer. A high AI confidence cannot override a failed rule or missing proof.
- Uncertain causation/amount/tax basis is held non-billable until reviewed. Historical policy changes do not silently expand entitlement on existing cases.
- Owner/adviser approval evidence is stored for D01–D03 or production fee functionality remains disabled; a green classifier test is not commercial approval.

### M4-3 Deterministic evidence-bundle assembly and verifier

**Depends on:** M4-2.

**Build:** deterministic scope/revision joins for quote acceptance, variations, work proof, orders/deliveries/invoices, case history, and relevant landed-money evidence; versioned bundle manifest and PDF/ZIP export; minimal disclosure/redaction; standalone verification of hashes and audit checkpoint references.

**Done when:**
- The same selected immutable inputs produce the same ordered manifest and content digests. Each assertion traces to an actual source/revision, not current mutable working data.
- Missing originals, wrong versions, altered files, cross-tenant/scope mislinks, and stale approvals are detected before a bundle is offered as complete.
- Redacted copies are derived artifacts linked to originals; bundle authority binds the exact exported set and intended recipients. Unrelated bank transactions/personal data are not included by default.
- The verifier distinguishes intact content, absent files, untrusted/missing checkpoint, and externally unverified claims. It does not certify workmanship or customer agreement merely from hashes.

### M4-4 WORM retention, legal holds, and external timestamp anchoring

**Depends on:** M4-3.

**Build:** S3 Object Lock on approved evidence versions, D07 retention classes/hold-release workflow, independently restricted checkpoint retention, and an approved RFC-3161 timestamp adapter for manifest/checkpoint hashes. Pin algorithms, verification policy, and certificate/trust data.

**Done when:**
- Tests against the actual configured object store show the selected version’s retention/hold behavior; a new object under the same key does not substitute for it. Local MinIO behavior is not assumed identical to production S3.
- Retention/deletion conflicts are resolved by documented policy with authorized holds/releases; the application cannot arbitrarily erase locked evidence or retain all personal data forever.
- Timestamp responses are validated against requested imprint/nonce, policy, trusted signer/certificate, and time assumptions; store the token and verification material. Service failure marks anchoring pending, not falsely complete.
- The artifact states the supported claim: integrity and existence relative to trusted timestamp/checkpoint. Device capture time, truthful work, enforceability, and absolute tamper-proofness are not asserted.

### M4-5 Reviewed pursuit templates, drafting, and builder-approved sends

**Depends on:** M4-4.

**Build:** versioned factual claim/reminder templates within D10’s approved scope, structured AI drafting from cited case facts, tone/prohibited-claim checks, explicit recipient/attachment preview, and send through the established outbox. The builder is the identified sender/decision maker; no autonomous collection service is introduced.

**Done when:**
- Each factual amount/date/allegation in a draft has evidence or is clearly marked for human input; generated threats, invented deadlines, or implied legal authority cannot bypass review.
- A builder approves exact text, attachments, sender identity, and recipient before dispatch. Changed evidence/amount/content requires a new approval.
- D10/legal review covers supported activity and template use; passing a tone filter is not recorded as regulatory compliance.
- Failed/unknown sends and recipient corrections follow the established reconciliation/reapproval path. A scheduled reminder is only a pending Decision unless separately authorized under approved policy.

### M4-6 Temporal recovery orchestration and scheduling ownership

**Depends on:** M4-5.

**Build:** Temporal workflows for long recovery waits, builder responses, evidence completion, reminders, and closure; activities call idempotent application commands/services. Register workflow ownership and migrate any relevant Graphile scheduling responsibility exactly once.

**Done when:**
- Replay/restart, duplicate signals, workflow-version upgrade, cancellation, and delayed responses produce no duplicate case transition, message, or financial effect.
- Graphile remains responsible for the generic outbox/execution infrastructure; Temporal owns the named recovery timeline. Neither independently schedules the other’s same commercial action.
- A timer produces a Decision/task or executes a previously approved bounded action; elapsed time never creates new authority. Permission/consent revocation is respected on execution.
- Region/data-retention approval includes Temporal history and payloads; workflows store references/minimal data rather than whole bank statements or message bodies.

### M4-7 TrueLayer consent route, account linking, and transaction ingestion

**Depends on:** M4-6.

**Build:** D10-approved AIS onboarding/consent, scoped account connection, secure tokens, consent expiry/revocation, settled and pending transaction ingestion, durable source identity, pagination/backfill, and redacted observability. Do not ingest more account data than the approved purpose requires.

**Done when:**
- The actual regulated/non-regulated client route and required provider consent are verified, not assumed from possession of an API key [R16]. G1/D04/D10 approvals cover the selected features and destinations.
- Pending and settled transactions remain distinct [R17]; a bank transaction observation alone does not mark a case landed or authorize fees.
- Duplicate pulls, pagination overlap, changed provider IDs/observations, out-of-order updates, consent expiry, account unlink, and token revocation are handled without duplicate cash identities or data leaks.
- Tokens never appear in field sync/exports/logs. Authorization binds account ownership to the correct tenant; forged callbacks or swapped account references fail.

### M4-8 Landing reconciliation, partial allocations, and reversal controls

**Depends on:** M4-7.

**Build:** deterministic cash-to-case matching suggestions using approved evidence, amount/reference/counterparty/date constraints, human confirmation, gross/net/tax allocations, shared-receipt allocation, duplicate underlying movement reconciliation, and reversal/dispute handling.

**Done when:**
- An approved £320 case and later £2,500 case can be allocated to actual sandbox settled transaction facts with finalized proof; ambiguity requires review, and a pending match never qualifies.
- Allocations across cases/jobs cannot exceed a transaction’s available amount or a claim’s remaining eligible principal. Concurrent assignments cannot double-count cash represented by both an API feed and a statement file.
- Partial receipts, partial refunds, transaction corrections, chargebacks/disputes, and case closure/reopening produce append-only changes and block obsolete fee collection.
- Confirming landing checks current policy/permissions/evidence, records the actual reviewer, and creates an immutable qualifying allocation. There is no writable `landed=true` shortcut.
- Sandbox events/evidence cannot qualify for production, and ordinary “mark customer paid” records from M1 are not automatically imported as recovery proof.

### M4-9 Production fee derivation and authorized accrual

**Depends on:** M4-8, M1-13.

**Build:** release the controlled cumulative fee routine against the approved D01–D03 policy, per-job locks and semantic uniqueness; immutable derivation breakdowns; statement approval; positive/negative posting; replay/rebuild checks. Continue to use the pure exact-money implementation, not AI or provider floating-point totals.

**Done when:**
- All section 3.5 reference tests pass for any adopted policy, plus production-policy-specific fixtures. A different approved policy updates examples/tests explicitly before release.
- Two cases racing near the shared cap, receipt splits, repeated events, plan-credit settlement/refund changes, and reversal after fee posting cannot overstate net liability or use credit twice.
- A positive posting requires approved qualifying proof and exact statement authorization. Direct SQL insert, wrong environment, stale statement, unapproved policy, or evidence invalidation fails through structural controls.
- Negative rederivations preserve the historical journal and create linked compensation/credit work. Previously collected excess is visible as refund/credit due, not hidden by clamping a balance to zero.
- Rebuilding from immutable events yields the same cap, credit used, net fee liability, and source attribution. G4 is still required for production enablement.

### M4-10 Platform tax invoices, credit notes, and statement of account

**Depends on:** M4-9.

**Build:** JobGuard’s own invoice issuer/profile/numbering, approved VAT/tax policy, line-level provenance, separate base/recovery charges and credit application, credit-note/refund obligations, and principal/tax/gross statements. Keep platform documents distinct from builders’ customer invoices.

**Done when:**
- D02-approved examples show correct principal, VAT, gross, already paid amounts, and remaining cash due; any £79 display states its approved VAT treatment.
- Base-plan credit is reflected once in the approved fee/invoice model without double-taxing or double-crediting. Accountant-approved examples cover already invoiced base fees and subsequent recovery adjustments.
- Issued invoices are immutable and sequentially/uniquely identified within the issuer; corrections use linked credit notes. A fee derivation is not assumed to be an issued invoice.
- A customer can trace each recovery-fee line to approved landing proof, cap, credit, policy, and prior settlements. Confidential bank details are minimized.
- No collection is started merely by rendering a statement or issuing an unsupported/gated document.

### M4-11 Stripe one-off base activation payment

**Depends on:** M4-10.

**Build:** hosted checkout/payment adapter for the approved base plan charge, bound to an exact activation Decision and invoice/obligation. Add signed raw-body webhook verification, provider account/environment identity, provider idempotency, clearing/settlement observations, and activation-payment UI.

**Done when:**
- Paid activation explicitly approves gross amount and terms. Switch-live can create an authorized obligation according to the approved policy, but only a verified provider outcome records payment; a redirect/checkout-completed screen does not itself settle it.
- Duplicate/out-of-order webhooks and payment retries create one semantic payment effect. Process an authenticated event durably before acknowledging success; reconcile missing provider facts rather than rely on arrival order [R15].
- Failed/expired checkout, customer authentication required, partial refund, dispute, delayed clearing/payout, and an unknown create-payment result have explicit states and safe recovery.
- No card data or reusable provider secret enters the application client/database/logs. A quote/acceptance event cannot initiate the charge.
- Pilot jobs remain exempt; production charge permission requires G4 and the approved activation agreement, not just a changed environment setting.

### M4-12 Recovery-fee collection and refund execution

**Depends on:** M4-11.

**Build:** Stripe collection for an exact approved recovery-fee statement/gross balance, allocation to immutable invoices, safe outstanding-balance recomputation, and explicitly authorized refund/credit execution. Default to a separate Decision per statement.

**Done when:**
- Collection cannot exceed the currently approved outstanding principal+tax balance after credits/prior receipts. Plan settlement is applied and the recovery amount recomputed before using an obsolete uncredited statement.
- A newly invalidated landing, reversal, refund obligation, revoked authority, or changed invoice version stops an unsent collection attempt and raises reapproval/reconciliation.
- Concurrent collectors and alternate payment attempts cannot reserve/collect the same outstanding balance twice. Reservation, provider acceptance, settlement, and release on definite failure are explicit.
- Refunds are linked to original settlements/credit notes and cannot exceed refundable value. Unknown refund outcomes are reconciled, not repeatedly paid out.
- Tests cover webhook replay, provider-side duplicate event objects, double-clicks, crash after provider acceptance, and a recovery fee subsequently reversed to zero.

### M4-13 Subscription terms and bounded standing authorization

**Depends on:** M4-12.

**Build:** D05/D09-approved subscription terms, exact plan/price/version, billing-cycle basis, cancellation, and bounded standing authorization permitting only specified renewals/retries/notices. Disable provider-default automations that exceed that authorization.

**Done when:**
- No recurring subscription charge exists without a human-approved mandate/terms record; changes to price, included allowance, frequency, or scope follow the approved notice/reauthorization policy.
- Revocation/cancellation blocks future initiation as specified and triggers provider-side cancellation; in-flight/committed provider actions are reconciled honestly, not claimed reversible after the fact.
- Failed renewals, retries, subscription pauses, trial/pilot exemption, plan refunds, and provider-managed email settings are covered. A worker cannot invent a new plan upgrade.
- Subscription discounts/credits have explicit allocation and cannot accidentally become the same per-job £79 credit a second time.

### M4-14 Concurrency metering and explicit tier-upgrade Decisions

**Depends on:** M4-13.

**Build:** immutable job activation/closure concurrency events, deterministic billing-period aggregation, approved included-job/tier rules from D09, and upgrade/downgrade proposals with exact commercial impact.

**Done when:**
- Replay, simultaneous activations/closures, late events, time-zone boundaries, cancellation, and reopen events produce the same meter result with source attribution.
- Cached live-job counts are rebuildable; an inconsistent counter cannot trigger a charge. Pilot/exempt jobs follow the approved inclusion rule rather than defaulting billable.
- An over-limit event raises the required Decision or enforces the agreed limit; it does not silently change price/tier outside a valid standing authorization.
- Invoice/meter fixtures reconcile to the approved pricing examples. Missing D09 prices/limits keep paid metering disabled rather than inventing defaults.

### M4-15 GoCardless Direct Debit as a separate payment rail

**Depends on:** M4-14.

**Build:** approved hosted mandate setup, mandate/payment lifecycle, notification requirements, signed webhook ingestion, idempotent collection/refund adapter, and same invoice/balance reservation interface as Stripe. Add actual provider rules/settings to D04/D05.

**Done when:**
- Mandate creation/authorization, pending submission, confirmed collection, cancellation, failure, chargeback/indemnity events, and retries remain distinct; creating a payment request is not “paid”.
- Signed events, duplicate deliveries, per-event processing in batch webhooks, and environment/account routing are validated [R21]. Core ledger reconciliation does not trust an unsigned payload.
- A Stripe attempt and a Direct Debit attempt cannot both collect the same reserved invoice balance; rail switching requires definite cancellation/failure or manual reconciliation of an unknown outcome.
- Revoked mandates/standing authority block new collections as required; required notices and provider-managed messages match approved terms.
- Sandbox success is recorded as sandbox evidence; production enablement is independent and requires the rail-specific G4 review.

### M4-16 Dunning, retries, cancellation, and commercial communication control

**Depends on:** M4-15.

**Build:** approved retry/dunning policy, unpaid invoice workbench, reminder Decisions or bounded standing-authority execution, dispute/refund suppression, provider-automation inventory, and account/plan suspension rules that preserve data access required by policy.

**Done when:**
- Dunning never pursues a disputed/reversed/paid amount or a no-charge pilot job. Changed balances regenerate drafts and invalidate stale amount approvals.
- Payment retries stay within provider and D05 authorization; no second orchestration system independently retries the same payment. Failed consent/expired authority requires renewed action.
- Customer/supplier communication and platform-to-builder collection messages are categorized explicitly, with exact recipients/content or approved template/variable bounds. Provider automatic emails cannot bypass these rules unnoticed.
- Stopping collection and changing account service status preserve ledger/evidence/export access according to approved terms; no destructive “delete unpaid customer” shortcut exists.

### M4-17 Financial reconciliation, operational controls, and money-surface review

**Depends on:** M4-16.

**Build:** daily/on-demand reconciliation of internal invoices/journals/reservations with provider payments/refunds/fees/payouts and bank observations; unexplained balance queue; adjustment approval; backup/restore of financial history; targeted independent security review of the money surface.

**Done when:**
- Reconciliation explains gross charged, provider fees, net payout, VAT, allocations, refunds, and outstanding clearing without treating a net payout as the gross recovered amount.
- Seeded missing/duplicate/late events, partial payouts, orphaned provider payments, and reversal discrepancies are surfaced and repaired through authorized append-only facts, not manual row editing.
- A restored environment reproduces balances and proof/cap/credit history while keeping external execution disabled until reconciliation prevents replaying already executed actions.
- Money-surface review covers privilege escalation, RLS/context misuse, webhook forgery/replay, fee-proof bypass, IDOR, outbox authority, and cross-rail duplicate collection; critical findings are fixed before production.
- The core recovery/payment part of G4 has an evidence pack. Any incomplete rail/policy remains server-disabled.

### M4-18 Interim applications and staged customer invoicing

**Depends on:** M4-17, M1-12.

**Build:** versioned interim application/valuation model, approved contract schedule, prior-certified/prior-invoiced/paid distinctions, cumulative value reconciliation, and customer issue/send through exact Decisions. Preserve the accepted baseline and approved variation lineage.

**Done when:**
- Applications, certified sums, invoices, and cash receipts are different records; cumulative billing cannot invoice the same completed value twice.
- Prior applications, approved variations, partial payments, omitted work, and credit notes reconcile to the eventual final account without rewriting earlier documents.
- D06-approved contract/jurisdiction templates and D02 tax rules gate real issue. Unsupported arrangements stay drafts with clear errors.
- A timer or valuation suggestion cannot issue a contractual document without required authority.

### M4-19 Reviewed construction notices and service/deadline workflow

**Depends on:** M4-18.

**Build:** professionally reviewed notice templates/rule profiles for the explicitly supported jurisdictions/contracts; structured input checklist; deadline calculator with source/version; service-method evidence; preview and human approval. Do not hardcode a universal “UK Construction Act deadline”.

**Done when:**
- An appropriate reviewer signs off the supported templates, required facts, trigger/date rules, and service assumptions; missing review disables real notice generation/send.
- Fixture suites supplied/approved with the review cover contract-specific dates, weekends/holidays where relevant, changed due dates, missing facts, and documented service methods. Unsupported cases are flagged for advice.
- Sending records the exact notice/version/recipient/method and provider/service evidence; queued/provider-accepted/read/legally served are not collapsed into one flag.
- No AI-generated legal assertion or tone-filter pass substitutes for the reviewed rule/template and human authorization.

### M4-20 Retention balances, release review, and durable timers

**Depends on:** M4-19.

**Build:** contract-specific retention principal and tax treatment, release conditions, due-date/source records, retained balances, release approvals, and durable reminders under one named orchestration owner.

**Done when:**
- Part releases, changed completion/defects dates, payment reversals, final retention, and already-billed amounts reconcile without duplicate release invoices.
- A timer raises a release review/Decision; it cannot invent satisfaction of a contractual condition or issue an unapproved notice/invoice.
- Every deadline/condition traces to an approved contract profile or human input; unsupported terms are not guessed.
- Retention release is not automatically classified as a fee-eligible recovery. D03 attribution and qualifying settlement still apply separately.

### M4-21 Expanded VAT treatments and DRC customer invoicing

**Depends on:** M4-20.

**Build:** D02/D06-reviewed tax codes and eligibility inputs for supported zero/reduced/non-VAT/DRC cases, required document wording/data, and retention/interim interactions. Keep each treatment and policy version explicit; missing eligibility does not default to 20%.

**Done when:**
- Adviser-approved fixture sets cover supported treatments/combinations, credit notes, partial/interim billing, retained amounts, and required calculation bases [R13, R14].
- Unsupported/missing status or conflicting inputs block issue; a model cannot decide tax registration, end-user status, or legal applicability from job description alone.
- Customer invoice net, VAT treatment, gross, retention, and expected cash remain separately reconcilable. DRC is not represented as a commercial discount or waived customer debt.
- The new support matrix is explicit and versioned. M1’s 20%-only restriction is relaxed only for tested, approved cases, not globally removed.

### M4-22 CIS verification, deductions, and payment reconciliation

**Depends on:** M4-21.

**Build:** reviewed CIS verification/status records, eligible deduction bases, required deduction/payment documentation, and reconciliation to customer/subcontractor payment records within the approved product scope. CIS is a separate regime, not a VAT rate or recovery-fee deduction.

**Done when:**
- Adviser-approved fixtures cover supported verification statuses, applicable deduction bases, materials/VAT treatment, partial payments, corrections, and interactions with the VAT/retention profiles already implemented [R22].
- Missing or stale verification/status inputs block the applicable real calculation/issue path; the system does not invent a status, submit a statutory return, or claim a verification occurred without its evidence.
- Invoice value, VAT, CIS deduction, retention, and actual cash reconcile separately. A correctly evidenced deduction is not automatically classified as unpaid debt or a fee-eligible recovery.
- Human-approved documents preserve source calculations and policy versions; corrections use the appropriate versioned/compensating records, not edits to historic issued statements.

### M4-23 End-to-end outcome acceptance and controlled production release

**Depends on:** M4-22.

**Build:** integrated sandbox acceptance pack, pending-policy/rail inventory, core recovery/payment gate review, separate expanded-customer-billing review, live smoke-test procedure, rollback/disable plan, and evidence-based rollout checklist.

**Done when:**
- In sandbox: detect a £320 evidenced overcharge → confirm billability → assemble a verifiable pack → builder approves pursuit → settled money is ingested and allocated → exact approved fee statement posts/collects once within the shared cap and credit → reconciliation balances.
- Repeat with no proof, prevented loss, unpaid base, partial receipt, duplicated/out-of-order events, cap exhausted across cases, refunded landing, revoked consent, unknown provider outcome, and competing payment rails; no unjustified positive fee results.
- Core G4 approvals authorize a bounded, explicitly consented live smoke test before general billing. The test is reconciled and reviewed before wider enablement; sandbox success alone does not open production.
- Expanded construction billing is enabled only for specifically approved/tested jurisdictions and treatments. Other regimes remain disabled. The release record lists exactly what is enabled, for whom, and under which policy/jurisdiction; any deferred task requires an explicit approved scope change, not a false completion claim.
- Nothing retroactively bills the no-charge pilot population. No claim of regulatory approval, guaranteed recovery, or certification is made from technical completion alone.

**M4 exit:** qualifying outcomes, fees, invoices, and collection are independently evidenced and reconciled; no-proof/no-fee, once-only shared cap/credit, human authority, and compensating corrections hold under failure and concurrency. Unapproved rails or customer-billing regimes remain disabled and explicitly unshipped.

---

## 10. M5 — Integrations, hardening, enterprise

Basic backups, restore, privacy operations, permissions, and financial security were prerequisites earlier; M5 expands them rather than introducing them for the first time. Each connector uses the existing job spine and authorized command boundary.

### M5-1 Accounting export model and Codat integration

**Depends on:** M4-23.

**Build:** canonical accounting export contract, external ID/mapping ledger, D02-approved tax/account mappings, Codat adapter, human-confirmed export preview, idempotent push/reconciliation, and consent/data-flow approval. Start with a bounded documented direction/scope rather than universal two-way sync.

**Done when:**
- Customer invoices, credits, receipts, and approved tax/retention/CIS/DRC fields map to supported target objects without losing source IDs or posting the same document twice.
- Failed/unknown pushes, external edits, duplicate imports, expired consent, and conflicting references are visible/reconcilable; retry never blindly recreates an object.
- An export Decision binds target tenant/company, exact source revisions, mappings, and scope. Sync cannot import an external “paid” label as qualifying recovery proof without the existing settlement checks.
- Supported connector operations, accounting systems, regional data paths, and sandbox/live evidence are recorded; unsupported tax/object mappings fail explicitly.

### M5-2 Direct Xero adapter

**Depends on:** M5-1.

**Build:** direct Xero authentication/mapping/export adapter behind the same contract, with independent onboarding and reconciliation. Keep Codat and direct exports from duplicating the same target business effect.

**Done when:**
- The common export conformance suite plus Xero-specific sandbox tests cover invoices, credit notes, receipts, supported tax codes, retries, rate limits, token expiry, and external edits.
- Switching integration route preserves target IDs/mapping history; it cannot repost all historic invoices or reauthorize broader access silently.
- A human confirms changed mapping/target company, and the data-flow register/G5 approval covers the actual integration.

### M5-3 Direct QuickBooks adapter

**Depends on:** M5-2.

**Build:** direct QuickBooks adapter using the same canonical export and authorization/reconciliation contracts; do not copy Xero-specific field assumptions into a generic mapping.

**Done when:**
- Common conformance and QuickBooks-specific sandbox tests pass for supported objects/tax treatments; unsupported features are surfaced in the capability matrix.
- Duplicate-route protection, exact source revisions, unknown-outcome recovery, token revocation, and external-edit conflicts behave consistently without pretending provider APIs are identical.
- G5 and provider approval are complete before live access; retries and rate-limit backoff do not change invoice amounts or recipients.

### M5-4 Merchant ingestion hardening and connector capability contract

**Depends on:** M5-3.

**Build:** merchant connector capability registry, hardened alias/document ingestion, supplier identity resolution, schema/version monitoring, quarantine, deduplication, and contract tests. Define read/quote/order/acknowledgment capabilities separately.

**Done when:**
- Malformed/changed merchant documents and feeds cannot silently alter agreed prices, PO quantities, deliveries, or account ownership; drift produces review/alerts.
- Duplicate documents arriving through portal/email/upload reconcile to the same underlying identity without losing source provenance.
- Each merchant capability has a verified source/terms/access route and regional data approval. An unavailable API is not replaced by unapproved scraping or credential sharing.
- Order placement remains a separately authorized exact action; ingestion access never implies purchase authority.

### M5-5 One scoped merchant/punchout/PEPPOL adapter at a time

**Depends on:** M5-4.

**Build:** choose a verified supported merchant or network route based on an actual pilot need, then implement its specific adapter, identifiers, document acknowledgments, and reconciliation. Repeat as separately numbered sub-tasks for additional adapters.

**Done when:**
- The selected adapter passes capability/tenant/identity/deduplication tests and actual sandbox or approved partner conformance tests; unavailable capabilities are recorded, not invented.
- Quotes, order acknowledgments, invoices, credits, and delivery evidence retain their distinct meanings and source IDs. A supplier acknowledgment does not become proof of delivery or bank settlement.
- Outbound procurement/document exchange binds the exact approved order/document and recipient/routing identity through the common outbox.
- A partner outage or schema change fails safely and leaves a human-operable fallback with audit history.

### M5-6 Rate-book learning and human-accepted suggestions

**Depends on:** M5-5, M1-4.

**Build:** use the immutable observations already written since M1; normalize units/tax/region/context; evaluate a simple descriptive baseline before Bayesian drift estimation, recurring-extra suggestions, and merchant reliability scoring. Suggestions stay tenant-scoped by default.

**Done when:**
- Historical observations can be traced to human-confirmed source revisions, and duplicates/credits/outliers/unit changes are handled explicitly. No “add the missing M1 write now” retroactive task is needed.
- Held-out evaluation compares proposed estimates to a simple recent-rate baseline, with sample counts, uncertainty, drift, and sparse-data behavior. Lack of evidence produces unknown/broad uncertainty, not a confident rate.
- Suggestions never silently update accepted quotes, agreed rates, invoices, or cap values. Human acceptance creates a new revision/observation with provenance.
- Cross-tenant learning is disabled unless a separate privacy/commercial decision permits it and the data design is reviewed; tenant-private raw rates are not leaked through suggestions.

### M5-7 Enterprise SSO and policy-based permissions

**Depends on:** M5-6.

**Build:** SAML/OIDC adapters behind `AuthProvider`, enterprise identity/account linking, fine-grained role policy using Cedar only when its adoption is justified, provisioning/deprovisioning, audit, and break-glass administration with restricted approvals.

**Done when:**
- Identity collision, domain takeover, cross-tenant account linking, assertion replay, revoked membership, role downgrade, and deprovisioning are tested across web/native/background action paths.
- Existing permission behavior has a conformance suite; SSO/policy-engine introduction does not broaden finance/order/export authority or bypass exact Decisions.
- Break-glass operations are bounded, separately logged/reviewed, and cannot silently rewrite journals, evidence, or audit history.
- Enterprise metadata and identity-provider flows satisfy updated D04/G5 requirements; a vendor feature flag alone is not SSO acceptance.

### M5-8 Tenant-specific keys and optional stronger database isolation

**Depends on:** M5-7.

**Build:** per-tenant KMS envelope encryption where required; repository/connection routing for explicitly contracted schema- or database-per-tenant deployments; key rotation, migration, backup/restore, and isolated worker/sync routes. Shared RLS remains the default unless a requirement justifies migration.

**Done when:**
- Routing tests cannot cross tenants via wrong connection pools, caches, worker jobs, sync credentials, exports, or restore destinations. Isolation includes object storage/keys, not only table schemas.
- Key rotation, denied/wrong key, revocation, backup restore, and migration rollback/forward-fix are demonstrated without unrecoverable loss of permitted retained data.
- Per-tenant isolation does not fork core arithmetic/state/authorization logic; contract and regression suites run against each supported topology.
- Cost/operations/DR implications and tenant exit/export procedures are accepted before offering the topology commercially.

### M5-9 Signed audit exports and long-term verification

**Depends on:** M5-8.

**Build:** signed tenant-scoped audit/evidence export manifests, checkpoint/timestamp verification bundle, signer-key rotation, explicit verification instructions, and long-term evidence preservation/algorithm review policy.

**Done when:**
- An independent verifier detects altered/missing files, inconsistent scope/revision links, invalid signatures, and checkpoint mismatch; exported PII is minimized and authorized.
- Signer identity/key version, timestamp trust, expiry/revocation assumptions, and unverifiable gaps are clearly reported. A signature is not described as proof the underlying commercial claim is true.
- Exporting one tenant cannot expose another tenant’s chain, keys, bank records, or identities; the export itself is audited and bound to approved scope/recipient.
- Key rotation and retained verification material preserve validation of earlier exports without rewriting old signatures.

### M5-10 Expanded resilience, failover, and recovery exercises

**Depends on:** M5-9.

**Build:** stronger D07 recovery objectives where required, routine restore/failover exercises, key/evidence/provider recovery dependencies, operational incident exercises, and reconciled resumption of external execution. Improve the M0 baseline instead of replacing it with an untested architecture.

**Done when:**
- Repeated exercises measure actual recovery time/data loss across database, evidence versions, keys, sync, audit anchors, and provider state against approved objectives.
- A restored/failover environment does not resend already executed commercial actions or collect invoices twice; reconciliation precedes resumed dispatch.
- Runbooks have named owner roles, accessible credentials/recovery material under least privilege, escalation paths, and recorded exercise defects/remediation.
- Existing M0–M4 protections remain enforced during failover, including tenant isolation, approved regions, proof checks, and journal/audit immutability.

### M5-11 Expanded DSAR, retention, and tenant offboarding

**Depends on:** M5-10.

**Build:** comprehensive data inventory, access/export/deletion-request automation, retention and legal-hold review, connector disconnection, tenant exit, and native/cache cleanup procedures. Preserve mandatory financial/legal records under the approved policy rather than deleting or retaining everything indiscriminately.

**Done when:**
- Rehearsals include source and derived data, observations/models, logs, caches/native stores, connector copies, backups, locked evidence, keys, and retained accounting records.
- Requests verify identity/authority and tenant scope; one tenant’s export or deletion cannot affect another. Execution receipts identify completed actions, exceptions, and pending expiry/backup handling.
- Offboarding revokes access/consent and stops new authorized work as defined, while reconciling in-flight actions and outstanding financial obligations without inventing retroactive pilot charges.
- Immediate offline-device or immutable-backup erasure is not falsely promised. Document permitted retention and effective deletion/expiry behavior with owner review.

### M5-12 Security assurance and certification evidence programme

**Depends on:** M5-11.

**Build:** recurring independent penetration/security reviews, supply-chain and configuration assurance, remediation workflow, policy/control evidence, and an explicitly scoped programme for Cyber Essentials and any later ISO 27001/SOC 2 work.

**Done when:**
- Security findings have owners, severity, remediation evidence, and retesting; unresolved high-impact issues block the affected commercial feature.
- The programme identifies assessment scope, controls, operational evidence, external assessor responsibilities, and actual assessment status. It does not treat a checklist or this task as the certification itself.
- Customer-facing claims reflect only achieved, documented assessment/certification scope and dates; unachieved assurance remains visibly pending.
- Earlier runtime and operational protections stay mandatory while the assurance programme proceeds; green CI is not a substitute for operational evidence.

**M5 exit:** each released connector/enterprise capability has its own verified contract and gate evidence; operational assurance is ongoing. Unavailable integrations or unachieved certifications remain explicitly unclaimed.

---

## Appendix A — Mandatory adversarial acceptance matrix

These scenarios supplement every task’s own assertions. Keep them as named regression tests; do not substitute end-to-end happy paths for database/security coverage.

| Invariant / failure | Required result | First owning task / later extension |
|---|---|---|
| Missing/wrong tenant context; reused pooled connection | Deny access; no stale-tenant reads/writes | M0-4; every business table |
| Cross-tenant FK; same-tenant wrong-job evidence/line | Database rejects invalid relationship | M0-4, M0-7, M0-11 |
| Runtime role assumes owner/BYPASSRLS or truncates audit/ledger | Privilege operation denied | M0-4, M0-5, M0-10 |
| Concurrent audit append; rollback; metadata tamper; tail deletion | Single valid committed chain; detection against trusted checkpoint | M0-5; M4-4 |
| Dismissed Decision; old recipient/content/amount; revoked member | No usable commercial authorization | M0-8, M0-9 |
| Same command ID/different payload; different IDs/same business effect | Conflict or one semantic result, never duplicate effect | M0-8 |
| Commit then worker crash; provider accepts then connection drops | Durable replay or explicit unknown-outcome reconciliation; no blind duplicate | M0-9; each adapter |
| Quote create/send/accept reaches billing | No platform obligation/journal/charge | M0-10; M1-5, M1-6 |
| Simulated settlement in production; pilot made billable by flag | Reject; no historical pilot debt | M0-2, M1-7, M1-13 |
| Unsafe money integer, fractional units, tie rounding, split allocation | Exact checked arithmetic, deterministic conservation, typed overflow | M0-3 |
| Pending/wrong-type upload satisfies stage proof | Completion/fee rejected until valid finalized evidence | M0-11, M1-10 |
| Model invents a rate, cites absent text, obeys uploaded instructions | Unknown/error/review; no canonical or commercial action | M0-12, M1-2 |
| Current scope edits alter accepted quote/final invoice | Historic snapshot unchanged; new revision/variation required | M0-7; M1-6, M1-11 |
| Builder clicks customer approval | Recorded as builder attestation, not forged customer signature | M1-6, M1-9 |
| Two switch-live requests | One activation/cap snapshot and only permitted obligation | M1-7 |
| Partial invoice payment; later payment reversal | Correct remaining balance/status, visible provenance | M1-12 |
| Fee with missing proof/pending cash/prevented case | Positive posting structurally rejected | M1-13; M4-8, M4-9 |
| Two cases race near shared cap; same cash via image and feed | No double allocation, duplicate fee, cap overrun, or extra credit | M1-13; M4-8, M4-9 |
| Cap below £79; unpaid/refunded plan; zero recovery | Agreed policy calculated/disclosed exactly; no invented paid credit | M0-3; M1-14, M4-9 |
| Recovery or evidence later reversed/invalidated | Suspend stale collection; reviewed compensation/credit/refund | M1-13; M4-8 through M4-12 |
| Monetary ranking suppresses mandatory proof/approval | Mandatory lane remains visible/blocking | M1-8; M2-7 |
| Reordered offline commands, revoked membership, stale approval | Explicit rejection/conflict/reapproval; no authoritative LWW money | M3-1, M3-4 |
| Valid SQL RLS but overbroad sync download policy | Independent sync test fails release | M3-3 |
| Stripe and Direct Debit race for same invoice | One reserved collectible balance; unknown state blocks unsafe switching | M4-12, M4-15 |
| Dunning acts after refund/dispute/cancelled mandate | New actions blocked; provider state reconciled | M4-13 through M4-17 |
| Restore replays already executed sends/charges | Execution initially disabled; reconciliation precedes resumed dispatch | M0-13; M4-17, M5-10 |
| Unsupported tax/notice jurisdiction or missing review | Draft retained, real issue blocked with explanation | M1-4; M4-18 through M4-22 |

**Evidence expectations:** record automated test identifiers and the real system boundary tested. Use sandbox contracts for vendors, physical devices for native encryption/offline behavior, real PostgreSQL for SQL invariants, and dated human review for commercial/tax/legal/operational gates. None of these substitutes for the others.

## Appendix B — What changed from the supplied plans

| Original issue / area | Revision 2.0 resolution |
|---|---|
| M3/M4/M5 mismatch between documents | One milestone map: native/offline M3; recovery/Temporal/payments M4; integrations/enterprise M5. |
| `quoted`/`won` vs job status mismatch | One authoritative status machine; sent quote and acceptance are separately versioned facts. |
| Extractor both writes scope and only proposes | Reserved identity + proposal; only confirmation creates authoritative commercial revisions. |
| Whole scope row frozen | Immutable accepted commercial snapshots; progress/evidence remain separately mutable through commands. |
| Late command dispatcher | Authorization/idempotency/outbox implemented in M0 before any commercial send/ledger consumer. |
| “Resolved Decision” treated as permission | Exact approved action with revision/content/recipient/amount/policy binding, expiry/revocation, and typed principal. |
| Worker/webhook exactly-once assumptions | Durable command/outbox/inbox identities, semantic uniqueness, at-least-once handling, and unknown-outcome reconciliation. |
| Recurring billing conflicts with fresh approval requirement | Bounded standing authorization specified and gated; per-statement recovery approval remains default. |
| £79 owed/paid stub and landed toggle | Separate obligations/settlements; no-charge pilot and physically isolated synthetic/sandbox facts. |
| Undefined fee cap/credit/VAT semantics | Explicit proposed policy, decision owners, cumulative delta formula, signed approval gates, and small-job/refund fixtures. |
| £188,000 example hides cap boundary | £18,800 boundary plus capped/uncapped/low-cap cases; principal benefit and gross cash are not conflated. |
| Evidence non-null check presented as sufficient | Verified version-specific proof + approved settled allocations + tenant/job binding + controlled locked posting routine. |
| Double-entry ledger lacks its own prerequisite | Balanced immutable journal primitive in M0, with corrections and accounting-book separation. |
| RLS guarantee exceeds trust boundary | Verified tenant selection, read/write and FK tests, role/catalog inspection, narrow bootstrap/worker exceptions. |
| Audit concurrency/truncation/PII limitations omitted | Serialized chain, canonical metadata coverage, independent checkpoints, explicit privacy/threat model, M4 anchoring. |
| Evidence keyed only by S3 key | Store exact object version and server-verified hash; two-phase upload/finalization and typed proof gates. |
| AI counters/JSON validity imply completeness | Labelled omission/hallucination/citation evaluation, unknowns, source review, and gated live-model changes. |
| Claude/direct API residency assumed | Approved actual deployment route and full provider register; regional capability must be verified before personal data. |
| Auth.js entered code assumed to be standard email behavior | Explicit entered-code implementation/security contract behind provider-neutral sessions/API verification. |
| Universal 20% VAT and half-even | Supported pilot tax restriction, explicit tax policy/rounding, later professionally reviewed expansion. |
| Variation acceptance depends on later final account task | Eligibility tested in variation task; actual inclusion tested in the assembly task. |
| Late mobile-first shell | Shell/job list starts M1 and grows with the workflows. |
| Late instruction to collect rate observations “since M1” | M1-4 and variation confirmation write provenance-rich observations; M5 only enables learning. |
| Large OCR/matching task commits to every technique | Intake, extraction, deterministic match, benchmark, and optional evidence-justified enhancement are separate tasks. |
| M3-2 says start first despite numbering | M3-1 is the explicit encrypted sync risk slice; contracts freeze before feature screens. |
| PowerSync assumed to inherit all RLS protection | Independently tested download policy and server-command upload authorization. |
| Bundled recovery, payments, and construction billing | Separate case/evidence/pursuit/banking/fee/invoice/rail/subscription/reconciliation/customer-billing tasks and feature gates. |
| Basic backups/restore/privacy deferred to enterprise | Minimum operational controls before real pilot; financial restore/reconciliation before billing; M5 expands assurance. |
| Agent guesses unspecified load-bearing policy | Reversible implementation decisions permitted; commercial/legal/security decisions require records and fail-closed gates. |
| Missing later acceptance criteria | Every task has dependencies, build scope, and measurable “Done when” assertions; cross-cutting adversarial matrix retained. |
| Strict serial dependency chain underused parallel agents | "Execution model" section plus true per-task dependencies: tasks are ordered only by real prerequisites, and independent tasks run concurrently (M0 collapses to ~7 waves; M1 runs three tracks plus UI after switch-live). |
| Anti-gaming / commercial integrity absent | Added decision **D11** and task **M1-16** — advisory, non-billing detection of won-never-live, under-reported accepted value, run-elsewhere, and settled-outside signals, with an optional quoted-value cap basis. |
| In-flight job import deferred with no home | Added task **M1-17** (imported provenance, attested cap basis, weaker labelled lineage); section 12’s import conditions now point to it. |

This revision is a specification change, not confirmation that the original repository already satisfies any requirement. The user-supplied prototype remains an optional UX reference only; no inaccessible prototype or undocumented repository behavior is required to interpret this plan.

## Appendix C — Verified technical references

**Checked for this revision on 11 September 2026.** These primary sources support the indicated technical constraints, not commercial approval of JobGuard. Recheck at implementation/release because provider features, supported versions, and legal/tax guidance can change. The document’s numeric evaluation targets, fee candidate, magnitude limit, security defaults, and proposed recovery objectives are design choices requiring the stated review, not vendor promises or measured results.

**R01 — PostgreSQL 16: row security policies.** Owners/BYPASSRLS and referential-integrity behavior motivate explicit runtime roles, verified context, and tenant-qualified relationships.  
https://www.postgresql.org/docs/16/ddl-rowsecurity.html

**R02 — PostgreSQL 16: constraints.** Ordinary `CHECK` constraints do not enforce conditions over other rows/tables; use appropriate keys and explicit transactional enforcement.  
https://www.postgresql.org/docs/16/ddl-constraints.html

**R03 — ECMAScript: numeric representation / safe integers.** The public `number` boundary requires range checks and exact intermediate arithmetic.  
https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number.max_safe_integer

**R04 — Graphile Worker: task executors.** Failed jobs can be retried; task code must await its work and handle idempotency.  
https://worker.graphile.org/docs/tasks

**R05 — Graphile Worker: database schema and privileges.** Default owner-role assumptions require deliberate separation from tenant business-data access.  
https://worker.graphile.org/docs/schema

**R06 — Auth.js: email providers.** The documented email flow uses a verification link; an entered-code UX needs an explicit implementation contract.  
https://authjs.dev/getting-started/authentication/email

**R07 — Claude Platform: data residency.** The reviewed first-party controls list `global`/`us` inference and a US workspace setting, not an assumed EU/UK-only first-party route.  
https://platform.claude.com/docs/en/manage-claude/data-residency

**R08a — Amazon Bedrock: geographic cross-Region inference.** Review the actual model/profile destination geography; choosing a UK caller region alone is insufficient proof of where inference runs.  
https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html

**R08b — Deepgram: custom/regional endpoints.** The EU endpoint must be deliberately selected and verified for the required APIs/settings.  
https://developers.deepgram.com/reference/custom-endpoints

**R09 — Amazon S3: Object Lock.** Retention protection applies to object versions, motivating version-specific evidence references and a reviewed retention policy.  
https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html

**R10 — PowerSync: RLS and Sync Streams.** Sync download access needs its own policy; application backend authorization governs uploaded writes.  
https://docs.powersync.com/integrations/supabase/rls-and-sync-streams

**R11a — PowerSync: React Native & Expo SDK.** Validate the supported native adapter/build configuration rather than assume an Expo Go demonstration proves the required production setup.  
https://docs.powersync.com/client-sdks/reference/react-native-and-expo

**R11b — PowerSync: data encryption.** The reviewed guidance identifies SQLCipher through `@powersync/op-sqlite` for React Native; implementation must prove encryption is active on supported devices.  
https://docs.powersync.com/client-sdks/advanced/data-encryption

**R12 — HMRC VATREC12030: rounding.** Guidance distinguishes its described rounding convention and acceptable alternative methods; tax policy requires explicit review rather than a universal commercial rounding assumption.  
https://www.gov.uk/hmrc-internal-manuals/vat-trader-records/vatrec12030

**R13 — GOV.UK: VAT for builders, new homes.** Construction can include qualifying non-standard VAT treatment; a general builder product cannot assume every invoice is 20%.  
https://www.gov.uk/vat-builders/new-homes

**R14 — GOV.UK: domestic reverse charge for construction services.** Eligibility and document treatment require explicit supported rules and inputs.  
https://www.gov.uk/guidance/vat-domestic-reverse-charge-for-building-and-construction-services

**R15 — Stripe: webhooks.** Verify signed raw payloads, handle duplicates, and do not depend on delivery order. Persist authenticated receipt before acknowledgment, then process asynchronously.  
https://docs.stripe.com/webhooks

**R16 — TrueLayer: collecting user consent.** Verify the applicable client/regulatory onboarding and consent route before real bank access.  
https://docs.truelayer.com/docs/collect-user-consent

**R17 — TrueLayer: account transactions.** The documented transaction endpoint returns settled transactions; pending observations must not be conflated with settled qualifying recovery.  
https://docs.truelayer.com/reference/getaccounttransactions

**R18 — ICO: pseudonymisation.** References/hashes can remain personal data; audit minimization is not a blanket exemption from privacy obligations.  
https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/pseudonymisation/

**R19 — Node.js: release lifecycle.** Confirm supported/security-patched versions during scaffold and schedule major upgrades before end of support.  
https://nodejs.org/en/about/previous-releases

**R20 — IETF: RFC 3161 Time-Stamp Protocol.** Timestamp tokens support data-existence assertions relative to a trusted authority; validate the returned imprint/signature and relevant trust policy. The RFC record identifies subsequent updates that implementers must review.  
https://datatracker.ietf.org/doc/rfc3161/

**R21 — GoCardless: staying up to date with webhooks.** Authenticate webhook signatures and process provider events through the common durable inbox.  
https://docs.gocardless.com/docs/getting-started/stay-up-to-date-with-webhooks

**R22 — GOV.UK: CIS deductions and subcontractor payments.** Verification and deduction bases need dedicated accounting rules rather than being represented as a generic VAT adjustment.  
https://www.gov.uk/what-you-must-do-as-a-cis-contractor/make-deductions-and-pay-subcontractors

## 11. Out of scope unless separately approved

Full project-management/Gantt planning; holding or routing builders’ customer funds through JobGuard; debt-collection-as-a-service or autonomous legal representation; unsupported tax/jurisdiction regimes; automatic commercial sends/orders/charges outside exact or approved bounded standing authorization; cross-tenant rate learning without a new reviewed policy; unverified merchant scraping/integrations; retrospective billing of pilot jobs; claims of guaranteed recovery, tamper-proof truth, regulatory approval, or certification without the relevant evidence.

A proposal to import an already-running job is specified as task M1-17, which must define verified accepted terms, scope identity provenance, customer documents, activation agreement, and cap basis. Do not infer a cap from an AI estimate or silently bill historic recoveries.

## 12. Discovered later

Agents append adjacent findings here rather than implementing them inline. Each entry must include discovery date, related task, evidence, risk, proposed scope, dependency/release gate, and whether it changes an invariant or needs a decision record.

_No repository-specific findings have been added: the repository has not been inspected for this revision._
