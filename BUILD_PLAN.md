# BUILD_PLAN.md — JobGuard, for Codex

**Revision:** 3.0 · 30 September 2026 (consolidated plan: contractor and small-builder tracks)  
**Companion:** `AGENTS.md`, revision 3.0  
**Status:** implementation plan. It describes work to perform; it is not evidence that anything is built or verified. Commercial terms are `proposed` decision records; none is approved.

**How to read this plan.** §1 is the product and the two commercial deals. §2 is how the build runs. §3 gates, §4 decisions, §5 contracts and §6 the data model apply to everything. §7 says what is already built. §8 changes to built work that both tracks need. §9 is the contractor track, §10 the small-builder track, §11 shared platform and live work. §12 is the one dependency graph and build order. §13 lists every promise sales may make and the task that delivers it. Task cards use one format: **Track**, **Depends on**, **Build**, **Done when**.

**What rev 3.0 replaces.** Rev 2.5 was the validated rev 2.2 core plus a sandbox addendum (§13) and three layered amendments (§14 shadow bill, §15 monetisation, §16 contractor track). Rev 3.0 merges them into one plan with one definition per task. Completed task cards (M0, M1, the built §13 leaves) are summarised in §7; their original text is preserved in `docs/archive/BUILD_PLAN.rev2.5.md`, as are rev 2.1–2.4. Rev 3.0 also records a new founder decision (30 September 2026): the line between the two deals is 7 jobs at once, per company, and the Firm and Contractor subscription plans are withdrawn.

---

## 1. The product and the two deals

JobGuard is a UK profit watchdog for builders. Work is captured once — talked through on site or imported from a client's work order — and the same job carries through to the bill. JobGuard watches the job and the money: extras, approvals, proof, supplier bills and billing. It has two commercial deals, decided per company.

### 1.1 Contractor track — the primary customer (D16)

**Who:** firms whose jobs are run by staff, not the owner: repairs and maintenance contractors, planned-works programmes, insurance repair networks, home-improvement companies, housebuilders' customer extras. Typically hundreds or thousands of jobs a month.

**The leak:** the operative who agrees an extra with a resident is not the person who owns the money, so the extra is done and never logged or billed.

**What JobGuard does:** site staff log an extra in seconds (code, voice or text, photo, the resident's confirmation on the device); the contractor's approval rules route it to supervisors and, where required, the client; approved extras go to the contractor's billing system; JobGuard reconciles what is billed and paid. Possible extras are surfaced live to supervisors. Nothing is held back.

**The deal:** 10% of the net value of **site-originated extras** that are approved, billed and paid (precise rules in §9.1). No platform charge by default; minimums and volume bands are negotiable per contract.

### 1.2 Small-builder track (D01, D03, D09, D13)

**Who:** owner-run firms with up to 7 jobs at once — sole traders and small firms doing extensions, kitchens, bathrooms and renovations for homeowners.

**The deal:** a monthly plan — **Solo £29 (4 jobs on the go), Builder £69 (7 jobs)** — with extra jobs at £20 a month for peaks, small jobs under £2,000 free, a free first job, and quoting free forever. Everything the builder logs is free. After the builder completes their final account, JobGuard's **Final Check** reveals work its evidence shows was done but not billed; JobGuard earns 10% only on what the builder then bills and is paid (plus supplier cash refunds and recovery cases the builder opens). Until that check, JobGuard's own findings are held back unless a must-surface rule applies (§10.2).

### 1.3 The line between the two deals

- The deal is per company, never per person.
- Up to 7 jobs at once: small-builder deal. A small-builder account that runs more than 7 jobs at once in any 2 of 3 consecutive monthly billing periods is moved to the contractor deal, with notice. The move needs a signed contractor agreement and data processing agreement, because JobGuard's data role changes from controller to processor; until both are signed the account stays on Builder and pays extra jobs. Short peaks are billed as extra jobs.
- The deal is recorded per job at switch-live or import: jobs already live when a company moves finish on the terms they started under.
- Firms that start above 7 jobs at once, or that want operatives logging extras, go straight onto the contractor deal.
- A change of deal applies from a date forward and never rewrites past fees.

### 1.4 Why the contractor track leads

1. **The leak is structural and large.** Operatives have no reason to log extras; the company loses the money every time.
2. **The fee is easy to accept.** Unlogged extras were worth nothing to the contractor; 90% of them is a gain, judged by a commercial director on return.
3. **The incentives line up.** JobGuard earns by getting extras logged at the time, so nothing is hidden and the trust risk of the small-builder Final Check does not arise.
4. **Scale.** Illustration only: 2,000 jobs a month with a £150 extra captured on one job in five is about £60,000 a month billed; 10% is about £72,000 a year from one customer.
5. **Most of what is built carries over** (§7), and pilots can prove value by measuring extras billed per job before and after JobGuard.

The small-builder track is built in parallel (§12) because its Final Check is a genuine differentiator for owner-run firms and shares most of the platform.

**Main risks:** long enterprise sales and procurement; security questionnaires; fitting alongside contractors' existing job-management systems; operative adoption; client contracts that require approval before extra work; contractors routing extras around the app to avoid the fee; for the small-builder track, builders' trust in a check that holds findings until the end.

### 1.5 Words used in this plan

- **Contractor:** a contractor-track customer. **Client:** whoever the contractor bills (housing association, council, insurer, managing agent, homeowner). **Resident:** the person at the property. **Operative:** a site worker. **Supervisor / surveyor / commercial manager / finance:** the contractor's approvers and back office.
- **Builder:** a small-builder-track customer. **Customer:** the builder's client, usually a homeowner.
- **Work order:** a client instruction for a job; **schedule of rates:** a client contract's coded price list.
- **Extra / variation:** work beyond the order or accepted quote.
- **Site-originated extra:** §9.1. **Final Check, shadow bill, lock:** §10.2.

---

## 2. How the build runs

### 2.1 Roles (AGENTS §5.13)

| Role | Who | Does |
|---|---|---|
| Builder | **Codex on Ben's Mac**: the Codex engine bundled with the ChatGPT desktop app (currently `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`, v0.159; the path moves when the app updates, so locate it again after an update), signed in with Ben's account, run headless as `codex exec -C <task worktree> --approve-for-me -o <receipt> "<work order>"` (in v0.159 `--approve-for-me` implies the workspace-write sandbox and cannot be combined with `-s`; add `-c sandbox_workspace_write.network_access=true` when a task needs package downloads) | Builds one task in its own managed git worktree on branch `codex/sandbox/<lowercase-task-id>`; runs the checks it can run locally; commits; returns a truthful run receipt; revises the same branch when the checker resumes the session with fixes |
| Independent checker and dispatcher | **Claude** (the JobGuard Claude Code session) | Dispatches ready tasks within the founder-authorized scope after adoption; prepares the branch and PR receipt for Ben to push and open the PR, unless a dated written delegation expressly authorizes those actions; reviews against the task's Done-when once GitHub CI has run; records `docs/verdicts/<TASK>/<commit>.md` (PASS, HOLD or FAIL; requested revisions accompany HOLD or FAIL, stating what was source-inspected, test-executed and not verified); resumes the Codex session with exact fixes; tells Ben when a PR is ready to merge and in which order; keeps the Command Center and the tracker issue current |
| Acceptance | A separate actor from the builder and the checker | Records technical acceptance against the verdict (§2.4 C8) |
| Second opinion | Codex's automatic GitHub PR review | Read by the checker; not the verdict |
| Founder | **Ben** | All remote pushes, merge, release and deploy; decisions, live work, real data and spending; can stop the loop at any time |
| Plan reviewer | GPT-6 Astra (in the ChatGPT app, or through the bundled Codex engine, which runs the same model) | Independent review of plan and policy changes Claude authors |

A builder never accepts its own work, and Claude never checks a plan it wrote.

**Merge authority:** Ben retains push, merge and release authority (§2.4 C8, adopted 26 September 2026). A dispatch note or an uncommitted handoff delegates nothing. If Ben delegates PR merging, it must be a dated written delegation recorded in this section, stating its limits (for example: CI fully green, recorded PASS verdict bound to the exact head, separate technical acceptance recorded, no founder-reserved area touched).

**Written delegation (Ben, 30 September 2026, Command Center card `jobguard-push-delegation`: "Also merge on PASS").** Ben delegates to the Claude checker, for this repository, until he revokes it: (a) pushing Codex task branches named `codex/sandbox/<lowercase-task-id>` and opening their pull requests; (b) merging such a pull request into `main` only when all of these hold: GitHub CI is fully green on the exact head; a recorded PASS verdict bound to that head exists in `docs/verdicts/<TASK>/`; a separate technical acceptance is recorded by an actor that is neither the builder nor the checker session (a fresh-context acceptance agent) in `docs/verdicts/<TASK>/<commit>-acceptance.md`; the merge follows migration order (§12.2); and the pull request touches no founder-reserved area (live providers, production mode, real data, spending, decision approvals, deployment, release, or weakening any CI check). Never force-push; never push directly to `main` except through such a merge; no release or deployment. Plan and policy changes authored by Claude still need an independent review and Ben's merge. Ben can revoke or narrow this at any time.

**Founder instruction for this revision (Ben, 30 September 2026, Command Center card `jobguard-adopt-rev30`, question "Do you adopt plan revision 3.0 so it can be pushed to GitHub and merged?", answer "Adopt and merge").** This is Ben's specific authority to push and merge PR #93 (rev 3.0) once its checks are green on the final head. It does not extend the general delegation above to any other Claude-authored plan or policy change.

**Adoption first.** No new task in §§8–11 is dispatched until this revision has an independent review and Ben has merged it. Work already in flight before adoption may continue: the repairs to M4-1-S, M4-2-S and M4-3-S, and the committed M4-5-S and M4-7-S branches, then M4-6-S and the unextended M4-8-S.

### 2.2 Parallel execution

- A task is **ready** when every task in its "Depends on" is merged. Start every ready task, up to five Codex runs at once; the contractor, small-builder and shared lanes run side by side (§12).
- **Migration numbers are pre-allocated** in §12. Numbers 0042–0049 are reserved for work already in flight (repairs and M4-5-S…M4-8-S). A task uses only its number; PRs merge in migration order, and the checker asks for a renumber if a lower-numbered PR is stuck for more than a day.
- **One lane per task:** branch `codex/sandbox/<lowercase-task-id>` (the convention adopted 26 September 2026); the task's first commit adds its lane (exact branch, applicable e2e spec `apps/web/e2e/<ID>.spec.ts`, or a recorded C1 reason why the task introduces no web workflow, allowed paths) to `config/agent-lane-assignments.json`. No blanket grants.
- **Shared registration files** (`apps/api/src/app.module.ts`, `apps/api/openapi.json`, `packages/core/src/index.ts`, `packages/db/src/index.ts`, web navigation, the lane registry), controlled routines and shared schema changes have one active editing owner at a time. Independent preparation may proceed, but conflicting edits serialize before commits. After integration, affected branches rebase and regenerate OpenAPI. The receipt names each overlap and its owner.
- **Declared overlaps serialize** through the graph; an undeclared overlap is reported in the receipt.
- **Always branch from the latest `main`.** GitHub CI runs the full PostgreSQL, MinIO and browser suites; local runs cover what the Mac can run (Docker is not installed, so database and browser suites run in CI until it is).
- **Stalls:** a run that ends without a receipt or with failing local checks is resumed once with the failure; if it fails again the task is marked blocked and the loop moves on.
- **Stop and ask Ben** for any founder-reserved area, a CI check that would need weakening, a contract conflict that changes a merged guarantee, or a decision record needing approval.

### 2.3 The work order given to Codex

> Implement **<TASK-ID> <title>** in this repository (`ben2harwood-lgtm/jobguard`).
> **Read first:** `AGENTS.md` (rev 3.0), `BUILD_PLAN.md` §2.4 (inherited criteria C1–C8) and the task card at `BUILD_PLAN.md` <section>. Build exactly that task; nothing adjacent.
> **Branch:** you are in a fresh worktree from the latest `main`; commit on `codex/sandbox/<lowercase-task-id>`. **Lane:** add the lane entry as your first change. **Migration:** if needed, `packages/db/migrations/<NNNN>_<name>.sql`; use no other number.
> **Depends on (merged):** <list>. Reuse their code.
> **Rules:** synthetic data only; no live providers, spending, real sends, production mode or decision approvals; exact integer pence; PostgreSQL tests for every database guarantee; keep every earlier test passing.
> **Done when:** every Done-when line in the card, plus C1–C8.
> **Deliver:** commits on the task branch and, as your final message, the run receipt: commands run with exit codes, what was not run and why, migrations, invariants touched, remaining gates. Do not push, merge or open PRs. If resumed with fixes, revise the same branch.

### 2.4 Inherited Done-when for every task (C1–C8)

**C1 — Complete vertical slice.** Each application feature ships its applicable versioned boundaries, services, authoritative persistence/projections, UI states and tests together. Expressly pure-core tasks add domain/schema/property tests and preserve regressions without inventing UI or persistence. Documentation, human-observation, professional-review and native-only tasks state their applicable evidence; web browser assertions apply where web workflows change. Exemptions never make an existing mandatory suite optional. Read-only leaves ship real server projections plus UI. Reuse existing domain/repository logic. No localStorage, component state, fixed JSON response or intercepted success response may substitute for authoritative business state. Refresh, deep link and a second browser context must read the persisted result. Local UI state may hold an unsaved draft, visibly labelled.

**C2 — Server composition and deployment.** Extend `apps/api` application services/controllers and export a narrow server-only application entrypoint. Next route handlers are thin authenticated adapters to those same services, composed in-process in the existing Vercel deployment; the Nest standalone API exposes the same schemas/services. Establish this seam in SBOX-1, with generated OpenAPI/contract checks and a Vercel-compatible build test. No second write implementation or undeployed Nest-only endpoint counts. A leaf's Next `/api/...` paths below define its web contract; additive routes may reuse the existing command route where semantically identical, with an explicit mapping in its receipt and tests. Route implementation is server-only, never a browser import of DB/credentials.

**C3 — Simulation boundary.** Server-selected mode; session-scoped generated tenant/scenario; `.invalid` recipients; fixed generated source documents and optional synthetic-only text editing. UI tells users to use the supplied fictional job, not real names, addresses, bank details or invoices. Use selectable generated documents instead of inviting arbitrary real uploads. Every screen and exported artifact says `Practice sandbox — synthetic data; nothing is sent or charged`. Audio stays on device; only reviewed fictional text is submitted. Live adapter factories reject initialization in this mode; no real bank/provider credentials or outbound integrations are configured. Mutation responses, queue records and synthetic receipts retain environment identity. Tests reject a production/pilot request carrying a synthetic command, object or settlement. Production workers reject synthetic references even if a client forges a mode flag. Internal application/DB/storage traffic is allowed; commercial/provider outbound attempts must be zero.

**C4 — Database and money.** GBP Money uses validated safe integer pence, the existing `1_000_000_000_000` magnitude limit and checked bigint/rational arithmetic; exact quantities/units and versioned rounding. Every new tenant table has non-null tenant ID, tenant/job-qualified FKs, enabled and FORCE RLS, `jobguard_migration` ownership. `jobguard_runtime` stays non-owner, non-superuser, no BYPASSRLS/role escalation/DDL/UPDATE/DELETE/TRUNCATE; ordinary table grants stay SELECT/INSERT. Use existing narrowly authorized command/posting routines for protected effects; any necessary routine EXECUTE grant is specific and catalog-tested, never an elevation of the runtime role. No new unrestricted SECURITY DEFINER helper. Test actual runtime SQL denial of forbidden inserts as well as mutation/tenant attacks. Append events/revisions; preserve audit actor/subject/hash/sequence and transactional rollback. No superuser-only runtime feature; fresh/upgrade migrations and the existing Neon bootstrap remain compatible. Use expand-compatible schema changes so the preceding demo still runs during rollout.

**C5 — Authorization and races.** Authenticate membership server-side; client tenant IDs are requests, not authority. Test missing tenant context, a non-member tenant, and a same-tenant wrong-job link. Commercial commands bind action, amount/currency, document/evidence/recipient hash, policy version and expected revision to an approved Decision. Dismissal is not approval. Replay the same command ID; reuse with different payload must conflict. Two browser clients must produce one effect or a typed stale-revision conflict. Approvals expire/revoke/supersede; workers recheck authority. Atomic command/domain/audit/outbox; no business lock after audit append. Unknown send/payment outcome means reconcile, never blind retry or success.

**C6 — Executable tests.** Vitest covers pure domain, schema and service logic. Any DB-touching leaf runs real PostgreSQL 16 integration tests using the embedded-postgres harness and actual runtime/migration roles; no SQLite/ORM-mock substitution. Browser tests run the production Next build against that real database and the same application services as deployment. Only external effects, clock and browser speech hardware may be faked. Do not `route.fulfill()` JobGuard success APIs. Fault tests may abort transport to exercise recovery, and must say so. Each task changing a web workflow executes its new Playwright spec in BOTH existing projects; expressly pure-core and non-code tasks provide the applicable evidence specified in C1 and preserve existing regressions: `mobile-360` (360×800) and `desktop` (1280×800). These are viewport tests, not proof of real phone/browser speech support.

**C7 — UI assertions for tasks changing web workflows.** After its positive and negative paths, reload, open the job from Jobs, and verify the same authoritative state and source identity. Assert the sandbox banner; no horizontal page overflow (`scrollWidth <= clientWidth`); keyboard-accessible primary actions with visible focus; labels, error focus and touch targets at least 44×44 CSS px. Unknown/stale/pending data must remain distinct from successful completion. Money labels show pounds to two decimals, never ask builders to type pence. No binary assets committed: inline SVG/CSS and generated textual fixtures; valid synthetic image/PDF bytes may be generated at test/runtime and stored as evidence/export artifacts.

**C8 — CI and independent verdict.** Preserve fail-closed dependency audit, secrets scan, lane-boundary, purity, gate, typecheck, lint, build, applicable evaluation, migration, DB and previous regression checks. Security scanner failure/unavailability is a failure, not `continue-on-error`. Register one leaf per branch/lane in `config/agent-lane-assignments.json`; shared route registry, package exports, migration sequence and global CSS edits serialize. Codex supplies the diff, exact commit, changed contracts, commands actually run, environment/fixtures, results and Playwright traces. Independent Claude inspects that exact diff, runs the specified tests plus listed negative assertions, and records PASS/HOLD/FAIL with evidence in `docs/verdicts/`. No claim of Claude review without an actual Claude response. A separate actor records technical acceptance; founder-owned push/merge/release remains founder-owned. Any changed commit needs a fresh or explicitly rebound review. Missing/inconclusive evidence is HOLD; green UI alone is not acceptance.

**Per-leaf executable command pattern:** preserve existing root `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm openapi:check`. For a task changing a web workflow, run `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop <ID>.spec.ts`. Every task preserves existing mandatory regressions and records its applicable C1 evidence; pure-core and non-code tasks need no invented browser spec. The root currently lacks `test:db`, `test:migrations`, `eval` wrappers named by AGENTS; SBOX-1 must map/add real wrappers to existing package suites, report applicable commands precisely, and never introduce placeholder pass scripts. New deterministic extraction/matching policies run the synthetic `pnpm eval` suite; paid/live model evaluation is not part of these leaves.

### 2.5 Test notation

The following helpers are exact Playwright assertions, not visual-review shorthand. Bind them per test to `page`; use the named test IDs as UI acceptance contracts. Every leaf also inherits C1–C8. Actions below use exact accessible names; job links use job IDs returned by the test's real seed/capture API. `J` means `/jobs/<that job_id>`, never a global fixture job. `D(id)` reads the job's Details/source panel and checks the persisted identity. Tests assert source IDs/revisions from server responses and database receipts, not just copied DOM attributes.

```ts
const B = (name: string) => page.getByRole('button', { name, exact: true });
const V = async (id: string, value: string) =>
  expect(page.getByTestId(id)).toHaveText(value);
const H = async (name: string) =>
  expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
const X = async (text: string) =>
  expect(page.getByText(text, { exact: true })).toBeVisible();
const disabled = async (name: string) => expect(B(name)).toBeDisabled();
// All examples below are inside async Playwright tests.
// The assertion strings are deliberately plain English and normative.
```

---

## 3. Release modes and gates

### Environment and accounting separation

- **`synthetic_demo`:** generated source material, mail sink/test recipients, fake settlements, and simulated journals. Separate deployment/database/bucket/credentials from production. Every screen, export, and provider event identifies the simulation.
- **`pilot_no_charge`:** real builder data only after gate G1. Real builder-approved quotes/customer invoices are permitted within the supported tax/jurisdiction scope. No JobGuard fee obligation, payment collection, or production recovery-fee posting is permitted. Fee illustrations remain non-posting projections.
- **`provider_sandbox`:** provider test credentials and test events; never a source of production settlement evidence or customer debt.
- **`production_billing`:** available only after the applicable track gate (G4-C or G4-S) and relevant decision records. Fee obligations, issued invoices, settlement, and refunds remain distinct facts.

The deployment selects the mode; it is not a user-editable flag. A production worker must reject a demo/sandbox reference even if a client sends it. Pilot jobs retain their no-charge entitlement: no retrospective conversion to paid jobs without a new explicit, versioned agreement and migration task.

### Release gates

| Gate | Required before | Evidence required |
|---|---|---|
| **G0 — foundation acceptance** | Feature rollout; status pending until the required foundation evidence and separate technical acceptance are recorded. Existing synthetic construction is not evidence that G0 has passed. | M0 tasks pass, contracts are versioned, pending policies fail closed, critical tests run on real PostgreSQL. |
| **G1 — real data** | Any real personal data or real commercial document send, on either track | Approved processor/data-flow register (D04); supported invoice/tax scope; permissions; privacy/retention procedure (D07, D12); secret management; alerts; backup and successful restore evidence; outbound kill switch. Small-builder pilots: approved no-charge pilot terms and D13 approval of the Final Check disclosure. Contractor pilots: a signed pilot agreement and data processing agreement (ENT-14) and D12 v4. |
| **G2 — watchdog reliance** | Operational reliance on automated findings or prompts | Fixed labelled evaluation sets, published error metrics, confirmed input provenance, human review and false-positive feedback (M2 checks, SV-3 detection, ENT-8 prompts). |
| **G3 — native release** | Real-data native distribution (ENT-12, M3) | Encrypted storage/device tests, download and upload authorization tests, revocation/cleanup behaviour, supported build/OS matrix, tested sync migration. |
| **G4-C — contractor fee charging** | Invoicing or collecting the contractor fee | D16 and D02 approved; settlement from the contractor's billing and payment data tested end to end with audit; enterprise contract reviewed by a solicitor; penetration review of the money surface; runbooks; controlled live smoke checks. |
| **G4-S — small-builder charging** | Paid subscriptions or small-builder success fees | The applicable exact versions of D01, D02, D03, D05, D09, D11, D12 and D13 approved; success-fee activation additionally requires proven final-account lock, shadow isolation and attribution integrity, production settlement and reversal/refund evidence, independently checked cumulative fee arithmetic, reviewed customer terms and reviewed no-charge pilot evidence; tested bank/fee/payment reconciliation, reversals and refunds; external-action authorization; penetration review; runbooks; controlled live smoke checks. Each rail (subscription, success fee, pay-now links) can stay disabled independently. |
| **G5 — connector or enterprise capability** | Each connector or enterprise capability | Its task acceptance, updated data-flow approval, migration/restore evidence, and customer-specific requirements. |

Pending gates block the affected production feature in configuration and server-side execution. They do not block synthetic development.

---

## 4. Decision register

Every record lives in `docs/decisions/`, has owner, status (`proposed | approved | superseded`), exact policy version, dated approver evidence, jurisdiction, supporting review and an executable feature gate. All are `proposed`. An agent cannot mark any approved.

| Record | Current proposed policy | Track |
|---|---|---|
| D01 Commercial fees | `reference_fee_policy_v3`: 10% of qualifying recovered net principal, uncapped, no base plan or credit; optional managed-recovery service charge table (§10.3) | Small builders |
| D02 VAT, rounding, invoicing | Candidate VAT-exclusive fee figures; tax rounding separate from commercial half-even | Both |
| D03 Eligible recovery | `reference_recovery_eligibility_policy_v3` (§10.3) | Small builders |
| D04 Providers and residency | EU/UK-only processing; verify every destination | Both |
| D05 Authority and standing consent | Monthly maximums per plan; per-statement fee approval by default; optional capped Direct Debit for fees | Small builders (and contractor statement approval) |
| D06 Customer approval and jurisdiction | Authenticated customer approval; domestic cancellation-notice kit; reviewed commercial notice templates | Both |
| D07 Retention and operations | Retention classes, deletion/export, checkpoints, backup/restore | Both |
| D08 Offline security | Encrypted local store; append-only offline commands | Both (ENT-12, M3) |
| D09 Subscription pricing | `subscription_pricing_policy_v4`: Solo and Builder plans, counting rules, the 7-job line (§10.1) | Small builders |
| D10 Pursuit, banking and payment links | Builder-approved factual pursuit; pay-now links through the builder's own provider account | Small builders |
| D11 Commercial integrity | Advisory signals only; never-build list (§14.2) | Both |
| D12 Data protection | JobGuard controller for small-builder processing; processor for contractors (v4) | Both |
| D13 Shadow attribution | `shadow_attribution_policy_v3`: Final Check rules for small builders; live surfacing for contractors | Both |
| D14 Paid data services | Companies-only checks, flat prices, free public-register layer first | Small builders (later) |
| D15 Partner commissions | Insurers and professional bodies only, disclosed; never in pilots | Later |
| D16 Contractor commercial terms | `enterprise_site_capture_policy_v1` (§9.1) plus the 7-job line | Contractors |

---

## 5. Canonical domain contracts

These contracts apply to both tracks. Track-specific money contracts are in §9.1 (contractor fee) and §10.3 (small-builder fee); the superseded v1 fee contract is kept in Appendix B for existing synthetic data only.

**Contractor jobs.** A contractor job starts from an imported client work order rather than a JobGuard quote. The work order is its baseline (the equivalent of the accepted quote in §5.1), each order revision is immutable, and the job is live from import. The job, scope-identity, command, audit and evidence contracts below apply unchanged.

### 5.1 Job, documents, and acceptance

The authoritative job status is:

```text
draft -> quoting -> accepted -> live -> invoiced -> paid
              \-> lost
accepted -> quoting  only after an explicit pre-live acceptance cancellation/supersession
paid -> invoiced     only for a recorded payment reversal or additional valid amount due
```

A draft may be discarded/archived without becoming a “lost quote”. `lost` records a declined/abandoned quotation; reopening is an explicit audited `ReopenQuote` command to `quoting`. A live job is never reset to quoting to evade its baseline or fee cap. Cancellation after activation is an explicit closure/financial-adjustment workflow, not deletion or baseline mutation.

“Quoted” means an immutable quote revision has an outbound send record; it is not an extra job status. “Won” is the UI label for accepted quote terms; it is not another status. Quote status (`draft|issued|accepted|declined|superseded`) and send status (`queued|provider_accepted|delivered|failed|outcome_unknown`) are separate. Provider acceptance is not proof a customer read the document.

An acceptance binds the exact quote revision/hash, accepting actor or attesting builder, method, and timestamp. `accepted_quote_version_id` points to the accepted document. At switch-live, the accepted baseline, accepted net value, immutable job activation terms, commercial track and applicable policy versions are bound atomically. New small-builder jobs use `reference_fee_policy_v3` without a recovery cap or plan credit. Cap snapshots remain only for existing v1 synthetic records and their regression tests.

Operational progress uses a separate scope-stage state machine: `not_started -> in_progress -> complete`; explicitly audited rework can move `complete -> in_progress`. A required proof gate must pass before completion. Quote acceptance freezes commercial snapshot records, not scope progress or evidence attachments.

Customer invoice status and receipt allocations are separate from job status. M1 “mark paid” records a dated amount and builder attestation, not a boolean pretending a bank verified it. A zero outstanding balance can project the job to `paid`, with payment provenance visible. A manual payment record does not qualify as recovery landing evidence. Credit notes and payment reversals preserve historic issued documents.

### 5.2 Scope identity, proposals, and document revisions

Mint `scope_item_id` into a lightweight identity registry at capture. A `proposal_line` references that reserved ID and an immutable source. Before confirmation there is no authoritative priced `scope_revision` for that proposal. Accept promotes the reserved identity and creates a human-confirmed commercial revision in one transaction; retrying cannot create another canonical line.

Working commercial revisions are append-only. A draft pointer may move; accepted/sent document snapshots never change. Quote lines and final-account lines have their own row IDs but retain `scope_item_id` and source revision. Model-output IDs are never trusted: the server assigns or verifies them.

Dismissals preserve the proposal/source and reason. A split retires the original proposed identity and creates child identities with lineage; a merge creates a new identity linked to all inputs. Never transfer existing invoices/evidence silently onto an unrelated item. New variation items have their own identity; changes to an existing item reference its identity and record a commercial delta rather than rewriting the baseline.

A variation’s state is `draft -> priced -> approved|rejected`; changes to approved terms create a new revision and fresh approval. “Priced” requires confirmed arithmetic inputs, not merely an AI estimate. Customer approval evidence and the builder’s attestation of customer approval have different methods and actor fields. M1 does not claim an e-signature was collected when a builder clicked “Got customer’s OK”.

### 5.3 Command, Decision, outbox, and event envelope

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

### 5.4 Exact arithmetic and supported tax scope

- **Money boundary:** GBP only. `pence` must be a finite safe integer with absolute value at most `1_000_000_000_000` (an application validation limit, not a business offer). PostgreSQL stores `bigint`; serialize to the public number type only after range validation. Use checked `bigint` intermediates and reject overflow rather than truncate.
- **Quantity:** signed decimal input with up to six fractional places; ordinary quantities are nonnegative, while negative commercial adjustments require an explicit adjustment type. Parse to scaled integers. Units and allowed conversions are enumerated; do not interpret a pack as a single unit by guessing.
- **Net line calculation:** exact quantity × unit-rate × exact discount ratio, rounded once at the defined line boundary with half-even. Store input factors, calculation version, and rounded result. Document-level discounts are allocated with a deterministic largest-remainder method, stable tie-break IDs, and penny conservation.
- **Fees/cap:** exact rational percentages and half-even as in the track fee contracts (§9.1, §10.3); never `Math.round(0.015 * amount)`.
- **Tax:** store a tax-treatment code and policy version, not just a percentage. Candidate M1 policy totals taxable net by tax code, calculates VAT once per code group with half-up for positive invoices, and uses a sign-symmetric inverse for credit corrections; allocate display tax to lines deterministically. D02 must approve the actual policy before real invoice issue. Other valid tax methods require a versioned decision, not incidental UI rounding.
- **M1 support restriction:** only explicitly confirmed standard-rated 20% GBP customer invoices within D06’s approved pilot scope. Reject unsupported zero/reduced-rated, exempt, non-VAT-registered, DRC, CIS, retention, foreign-currency, or mixed-regime cases from real issue; retain their draft data and explain the limitation. M4 extends support after review. Do not infer tax treatment from job category.
- **Document identity:** issued customer/platform invoices have separate issuer namespaces, immutable numbers/dates/tax details, versioned PDFs, and credit-note correction paths. A draft final account is not automatically a legally issued invoice.

The ECMAScript safe-integer boundary and HMRC guidance motivating explicit numerical/tax policies are recorded in Appendix C [R03, R12–R14]. The choices above are implementation requirements, not an assertion that every UK construction transaction uses the same treatment.

### 5.5 Landing, eligibility, accounting, and reversal

A recovery case records the claimed issue and approved claim principal separately from settled amounts. Its lifecycle supports:

```text
identified -> prevented (terminal, non-billable)
identified -> evidence_assembled -> pursuing <-> negotiating
active evidenced case -> partially_landed -> landed -> closed_recovered
active case with no remaining outcome -> closed_no_recovery
```

Direct receipt before pursuit is permitted from an evidenced active case, but requires the same attribution and landing approval. Partial receipts accumulate through append-only allocations. A case closes recovered only with confirmed disposition of the full claim; an explicitly recorded write-off can close the unresolved remainder without making it recovered. Reversal/dispute events reopen the outstanding portion into the appropriate active state; history is never erased. M4-1 implements the complete transition table, including rejected transitions and amendments to a claim.

A `landing_candidate` from a bank matcher is not a qualifying landing. Confirmation creates an immutable `landing_allocation` referencing a settled transaction, finalized evidence, tenant/job/case, gross amount, eligible net principal, tax allocation, policy version, approving command, and attribution evidence. Cash landing allocations exclude pending transactions and non-cash credits. D03 v3’s consumed-credit candidate uses a separately typed, immutable realized-credit allocation; it must never be represented as a cash receipt. Its positive production fee path remains disabled until a signed versioned amendment aligns AGENTS §5.6, this contract and the affected tests. Synthetic candidate fixtures remain permitted. Use server/provider timestamps and separately labelled user observations.

One bank receipt may be explicitly split between cases, but allocated gross value cannot exceed its available settled value, and eligible principal cannot exceed its evidenced amount/claim remainder. Do not count the same receipt again because a statement image and an API feed both describe it. Use provider/source identities plus an explicit reconciliation identity for alternate evidence of the same underlying movement. Ambiguity is held for review, not forced into a unique match.

The positive fee posting routine verifies same-tenant/same-job references, valid evidence, approved eligibility, the cumulative entitlement and prior net postings under the bound policy; cap/credit checks apply only to historical v1 synthetic records, policy/environment, current authorization, and unique derivation identity while holding the appropriate job/settlement locks. Fee corrections can reference reversal events without requiring a new positive landing. Invalidated evidence suspends disputed fee collection and creates reviewed compensation work according to D03.

Use distinct journal books for platform accounting and builder-customer records. A posted journal has one immutable header, balanced positive debit/credit lines, currency, policy version, source event, business-effect key, and links to its approval/derivation. Same-currency debit and credit totals must balance at transaction commit. No generic fee insertion path or runtime journal edits/deletes are available. Chart-of-accounts and revenue-recognition mappings require the D02 accounting decision; the model must not imply that every obligation is immediately recognized revenue.

### 5.6 Audit, evidence, and minimal security contracts

Audit sequence allocation and head updates are serialized per tenant. Hash canonical event metadata and payload; prohibit a payload that omits actor/type/subject from integrity coverage. Define a single lock order and batch audit appends at the end of domain mutation, with no later domain lock acquisition. Keep an independently restricted checkpoint `(tenant, sequence, hash, recorded_at)` before G1; external anchoring arrives in M4. A verifier needs a trusted checkpoint to substantiate detection of tail deletion or complete-chain replacement.

Evidence registration is two-phase: request an authorized private upload, then finalize only after the server verifies bytes, type, size, SHA-256, and object version. An S3 key alone is not a permanent reference [R09]. Store original and derived object versions separately. A required proof gate tests type, scope/job/tenant binding, finalized status, and accessibility/integrity, not just row existence. Revoking a now-invalid proof does not rewrite prior completion history; it raises an audited review/rework state.

Auth uses entered email codes explicitly implemented behind `AuthProvider`. Initial security defaults: cryptographically random 8-digit codes; 10-minute expiry; maximum 5 failed attempts per challenge; one active challenge per destination/purpose; request throttling per destination/IP and at least 60 seconds between resend requests; store keyed hashes, not raw codes; atomically consume once. Tune stricter limits from abuse tests through a security decision, not by removing controls. Responses do not disclose whether an address is registered. Bind invitations to intended email, tenant, role, and expiry; a caller cannot choose their own role.

M1 web sessions use secure, HttpOnly, appropriate SameSite cookies and CSRF/origin checks. NestJS verifies the session through a provider-neutral server contract; a Next.js page guard is not API authorization. M3 introduces the provider-neutral mobile exchange/refresh path with secure token storage. Never ship a second, undocumented authentication system simply to make mobile work.

---

## 6. Data model reference — create incrementally

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

Track-specific additions: contractor track §9.3; small-builder track §10.5. Shared additions from CH-3 are in §8.

---

## 7. What's built

### 7.1 Baseline

- **Repository state inspected:** `main` at `694e9e1` (30 September 2026). Migrations `0000`–`0041` in `packages/db/migrations`. 59 Next route handlers under `apps/web/app/api` (one is `/api/test-support/drain`); the Nest API exposes the same services (`apps/api/openapi.json`). 72 CI runs on `main`; the latest (`694e9e1`) is green on the full suite (PostgreSQL 16, browser projects `mobile-360` and `desktop`, secrets and dependency audit). Many earlier merge commits on `main` have at least one failed CI run (every M0 merge before #15, which repaired main's CI, and several later merges including `9a8241e` #81 and `5e4ab21` #88), so test evidence for a task must be read from that PR's own CI run for its exact commit, not inferred from today's green main.
- **Environment:** everything merged runs only in `synthetic_demo`. No live provider, real data, real send, bank feed, payment rail or production mode is configured. The deployed demo (Vercel + Neon, #35–#38) is a synthetic deployment.
- **Plan history:** rev 2.3–2.5 and decision records D13–D16 were drafted after the inspected baseline and are consolidated into this revision. Rev 2.4 was adopted with twelve corrections (R01–R12, independent review PASS) on 26 September on the unpushed branch `claude/plan-rev24-adopt`; every correction is carried here.
- **In flight, unmerged:** `codex/sandbox/m4-1-s-repair` (adds `0046_recovery_case_current.sql`), `codex/sandbox/m4-2-s-repair`, `codex/sandbox/m4-3-s-repair` (adds `0042_evidence_pack_repair.sql`), `codex/sandbox/m4-5-s` and `-v2`, `codex/sandbox/m4-7-s` (adds `0043_practice_feed.sql`), `codex/sandbox/m4-8-s`. None of these is built work.

**Verdict language.** AGENTS §5.13 distinguishes source-inspected, test-executed and independently verified. In the table, **"No — source-inspected only"** means there is no recorded independent verdict for the merged commit; CI results are test execution, not a verdict. A **builder receipt** is the builder's own run record; every receipt on `main` says in its own text that it is not an independent verdict. **PR comment** means the checker commented on the PR under the founder's GitHub account; those comments are not bound to the merged commit and are not recorded verdicts.

### 7.2 Inventory of merged work

Merge order. Routes are the Next `/api/...` paths (the Nest API mirrors them); `…/:id` abbreviates `/api/jobs/:id`.

| Task | What it delivers | Key migrations · routes | Merged PR · commit | Recorded verdict | Reused by |
|---|---|---|---|---|---|
| M0-1 | pnpm/Turborepo workspace, strict TypeScript, Nest API, Next web, CI (typecheck, lint, test, build, secrets, dependency review), lane-boundary lint, `packages/core` purity check, Compose file (never smoke-tested: no container runtime locally) | — · `/healthz` | #1 · `b945739` | No — source-inspected only | both |
| M0-2 | D01–D12 as `proposed` records, deployment modes, fail-closed policy gates | — | #2 · `578f1b7` | No — source-inspected only | both |
| M0-3 | checked pence `Money`, exact rational/`bigint` arithmetic, quantities, allocation, tax-policy interface, v1 fee arithmetic, float-money lint | — | #3 · `fe52d49` | No — source-inspected only | both |
| M0-4 | runtime/migration roles, `withTenant`, RLS + FORCE RLS, identity and control-plane schemas, catalog tests | `0000` | #4 · `2ef0825` | No — source-inspected only | both |
| M0-12 (fixture-only part) | `packages/ai` gateway with a fixture provider, strict schema/citation validation, bounded repair, provenance, `pnpm eval`. **No live Claude route and no Deepgram adapter** | — | #5 · `a0f971b` | No — source-inspected only | both |
| M0-5 | append-only per-tenant audit chain, verifier, checkpoints | `0001` | #6 · `221f55a` | No — source-inspected only | both |
| M0-6 (scaffold) | `AuthProvider` with an **in-memory** entered-code provider, principal bridge, tenant guard, role matrix (`owner, admin, estimator, foreman, operative, finance, read_only`). No persisted challenges or sessions, no email delivery; the web app uses a synthetic session cookie | — | #7 · `6dcbee7` | No — source-inspected only | both |
| M0-11 | two-phase verified evidence upload, private versioned S3/MinIO adapter, scoped URLs | `0002` | #9 · `034e98d` | No — source-inspected only | both |
| M0-7 | job aggregate and lifecycle routine, scope identity/lineage/revision/progress | `0003` | #10 · `bf976e2` | No — source-inspected only | both |
| M0-10 | balanced immutable journals, controlled posting routines (v1 plan obligation/settlement) | `0004` | #11 · `c60b661` | No — source-inspected only | both (journal primitive); v1 plan-fee routines historic |
| M0-8 | Decisions, immutable resolutions, exact action authorisation, command receipts | `0005` | #12 · `5671a72` | No — source-inspected only | both |
| M0-9 | outbox, attempts, fake adapters, provider inbox, unknown-outcome handling, Graphile worker entry | `0006` | #13 · `b5c70ce` | No — PR comment ("Hold": no behavioural tests) before merge; no recorded verdict | both |
| M1-1 | mobile-first shell, jobs list, first synthetic endpoints | — · `/api/session`, `/api/jobs`, `/api/decisions`, `/api/quotes/preview` | #14 · `739d681` | No — source-inspected only | both |
| Fix: CI and security repair | honest push/PR CI, fail-closed dependency audit, lane policy enforcement, production browser suite in CI | — | #15 · `064ceda` | ACCEPT recorded in `JOBGUARD_REVIEW_HANDOFF.md` (2026-09-14), not under `docs/verdicts/` | both |
| M1-2 | capture source → cited proposal with reserved scope IDs | `0007` | #16 · `d753bfd` | No — source-inspected only | both |
| M1-3 | review, split/merge lineage, atomic confirmation | `0008` | #17 · `bc1a282` | No — PR comment (on-contract; CI red at the time) | both |
| M1-4 | draft quote pricing, VAT coverage, rate observations | `0009` | #18 · `edb5d65` | No — PR comment (on-contract; CI red at the time) | small-builder |
| M1-5 | immutable quote documents, runtime PDF, fake send | `0010` | #22 · `da0a3d6` | No — source-inspected only | small-builder |
| M1-6 | builder-attested acceptance bound to revision and hash | `0011` | #23 · `2ba9510` | No — source-inspected only | small-builder |
| M1-7 | switch-live: baseline, accepted net value, **v1 cap snapshot**, synthetic £79 obligation path | `0012` | #24 · `96dbcf3` | No — source-inspected only | small-builder (v1 cap path historic; contractor jobs go live at work-order import) |
| M1-8 | pure checks, finding fingerprints, Decision inbox | `0013` | #25 · `ed3bb18` | No — source-inspected only | both |
| M1-9 | variations: priced revisions, approval provenance, rate observations | `0014` | #26 · `070575e` | No — source-inspected only | both |
| M1-10 | proof capture, verified evidence links, stage gates | `0015` | #27 · `2516a00` | No — PR comment ("otherwise ACCEPT", one blocker) | both |
| M1-11 | deterministic draft final account from baseline plus approved variations | `0016` | #28 · `7307736` | No — source-inspected only | small-builder |
| M1-12 | synthetic customer invoices, credit notes, payments | `0017` | #29 · `c06a5f6` | No — PR comment ("otherwise ACCEPT", CI blocker) | small-builder |
| M1-13 | minimal recovery outcomes, synthetic landing, v1 fee-posting guard | `0018` | #30 · `66111cb` | No — source-inspected only | small-builder (v1 historic); its exact-money derivation method is reused by both |
| M1-14 | v1 per-job fee statement projection | — | #31 · `1485cce` | No — source-inspected only | small-builder (v1 historic) |
| M1-15 (technical part) | `pnpm seed:demo`, complete-journey browser regression, DB adversarial regressions. **Human trial not observed** | — | #32 · `1325642` | No — source-inspected only | both (regression suite) |
| M1-16 | D11 advisory integrity checks | `0019` | #33 · `83b47e3` | No — source-inspected only | small-builder |
| M1-17 | adopt an in-flight job (`imported` provenance, v1 cap) | `0020` | #34 · `b4b8ae5` | No — source-inspected only | small-builder |
| Deploy | synthetic no-charge Vercel + Neon demo, Neon bootstrap roles | — | #35–#38 · `215665f`…`b6b9b6d` | No — source-inspected only | both |
| Demo UI | plain-English onboarding and mobile navigation (#40 merged into #39's branch) | — | #39 · `7ca6541` | No — source-inspected only | both |
| §13 plan text | adopts the synthetic sandbox addendum | — | #41 · `66be8ce` | n/a (plan text) | — |
| SBOX-1 | server-backed job workspace, the in-process Next/Nest application seam, synthetic session | — · `…/:id` | #43 · `2e49231`; repairs landed via #66 and #65 (#71) | No — builder receipts only: `docs/verdicts/SBOX-1/WORKSPACE_RESUME_REPAIR_2026-09-19.md`, `docs/verdicts/SBOX-1/AUTHORITATIVE_WORKSPACE_READ_2026-09-20.md` | both |
| SBOX-2 | resettable practice runs, per-run fake clock, deterministic adapter executor | `0021` · `/api/sandbox/runs`, `/api/sandbox/runs/:id`, `/api/sandbox/runs/:id/:action` | #45 · `5d95f97` | No — source-inspected only | both |
| UIWIRE-1 | persisted capture → review → confirm | — · `/api/jobs/capture`, `…/proposal`, `…/review`, `…/confirm` | #47 · `41ac01e` (+#48 test hardening) | No — source-inspected only | both |
| UIWIRE-2 | persisted quote pricing revisions | — · `…/quotes` | #49 · `a6408d9` | No — source-inspected only | small-builder |
| VOICE-1 | on-device browser dictation with honest fallback. **Real-device rehearsal not recorded** (its own Done-when leaves that claim on HOLD) | `0022` | #53 · `4d3e6b1` | No — source-inspected only | both |
| UIWIRE-3 | immutable quote preview, simulated send, unknown-outcome reconciliation | — · `…/quotes/preview`, `…/quotes/delivery`, `…/quotes/delivery/:action`, `…/quotes/artifacts/:artifactId` | #54 · `6c2a98d` | No — source-inspected only | small-builder |
| UIWIRE-4 | practice acceptance provenance, decline and cancellation | — · `…/quotes/acceptance`, `…/quotes/acceptance/disposition` | #55 · `3c4b9a7` | No — source-inspected only | small-builder |
| UIWIRE-5 | start practice job; freeze baseline, v1 cap and optional £79 synthetic obligation | — · `…/quotes/activation` | #56 · `d4ead43` | No — source-inspected only | small-builder |
| UIWIRE-6 | persisted findings; job Decisions inbox | — · `/api/decisions` | #57 · `134b2d4` | No — source-inspected only | both |
| UIWIRE-13 | synthetic structural fee guard (v1) | `0023` · `…/recovery`, `…/recovery/:action` | #58 · `666b574` | No — source-inspected only | small-builder (v1 historic) |
| UIWIRE-8 | practice variations: signed deltas, approval, lineage | — · `…/variations` | #59 · `b108bc2` | No — source-inspected only | both |
| UIWIRE-14 | persisted v1 fee illustration and side-effect-free what-if | `0024` · `…/fee-illustration`, `…/fee-illustration/what-if` | #60 · `c8389bb` | No — builder receipt only: `docs/verdicts/UIWIRE-14/COMMIT.md` (itself says HOLD) | small-builder (v1 historic) |
| UIWIRE-7 | synthetic proof bytes, finalisation, operational completion | `0025` · `…/proof` | #61 · `243d8a5` | No — builder receipts only: `docs/verdicts/UIWIRE-7/COMMIT.md`, `docs/verdicts/UIWIRE-7/PROOF_SCOPE_REPAIR_2026-09-19.md` | both |
| UIWIRE-9 | final-account assembly API and UI | `0026` · `…/final-account` | #62 · `5de02b8` | No — builder receipt only: `docs/verdicts/UIWIRE-9/COMMIT.md` | small-builder |
| UIWIRE-10 | numbered synthetic customer invoice, simulated send | `0027` · `…/customer-invoices`, `…/customer-invoices/:invoiceId` | #63 · `b899ed6` | No — source-inspected only | small-builder |
| UIWIRE-11 | linked customer credit notes | `0028` · `…/customer-invoices/:invoiceId/credit-notes`, `…/credit-notes/preview` | #64 · `ab8e7f2` | No — source-inspected only | small-builder |
| UIWIRE-12 | receipts, partial and over-payment, reversals, replay serialisation | `0029`, `0030` · `…/customer-invoices/:invoiceId/receipts`, `…/receipts/reversals` | #65 · `dd58dd7` (includes #71) | No — builder receipts only: `docs/verdicts/UIWIRE-12/RECEIPT_HARDENING.md`, `PAYMENT_UI_REPAIR.md`, `PREVIEW_SEQUENCE_REPAIR.md` | small-builder |
| Fix: proof scope | dismissed/retired scope excluded from proof, Decisions and final-account gates | — | #66 · `d566e0d` | No — builder receipt only (`docs/verdicts/UIWIRE-7/PROOF_SCOPE_REPAIR_2026-09-19.md`) | both |
| JG-C | synthetic backup/restore/replay rehearsal on a disposable fixture (`pnpm test:restore`); not a deployed restore | — | #75 · `539f4af` | No — source-inspected only | both (earlier evidence for M0-13b) |
| JG-B | labelled synthetic extraction evaluation; ambiguity-safe fixture parser | — | #76 · `ff6050c` | No — source-inspected only | both |
| UIWIRE-15 | persisted, resumable practice journey; `docs/UIWIRE-15-human-trial-checklist.md` with every item "Not observed" | — | #77 · `03a1668` | No — source-inspected only | small-builder |
| VALUE-1 | per-job money read model and value page | — · `…/value` | #79 · `52e1219` | No — source-inspected only | small-builder |
| M2-1A-S | materials, units, versioned agreed prices | `0031` · `/api/material-rates`, `…/materials` | #80 · `d7e7bca` | No — source-inspected only | small-builder |
| M2-1B-S | purchase-order pre-commit checks, simulated placement | `0032` · `…/purchase-orders`, `…/purchase-orders/revisions`, `…/purchase-orders/placement` | #81 · `9a8241e` | No — PR comments (several fix rounds) | small-builder |
| Fix: capture parser | long dictated notes kept with a raised question instead of rejecting the capture | — | #82 · `03079e2` | No — source-inspected only | both |
| M2-2-S | synthetic supplier document intake and goods receipts | `0033` · `…/supplier-documents`, `…/supplier-documents/intake`, `…/supplier-documents/receipts` | #83 · `2c5c492` | No — builder receipt only: `docs/verdicts/M2-2-S/COMMIT.md` | small-builder |
| M4-1-S | recovery case state machine and workbench | `0034` · `…/recovery-cases` | #84 · `64398d8` | **HOLD** — retrospective independent verdict `docs/verdicts/M4-1-S/54adf02.md`, on unmerged branch `codex/sandbox/m4-1-s-repair`; repair unmerged | small-builder |
| M4-2-S | D03 eligibility review | `0035` · `…/recovery-cases/eligibility` | #85 · `8c2b0fe` | **HOLD** — `docs/verdicts/M4-2-S/be81bd5.md`, on unmerged `codex/sandbox/m4-2-s-repair` | small-builder |
| M2-3-S | cited supplier facts, human confirmation, frozen evaluation corpus | `0036` · `…/supplier-documents/facts/confirm` | #86 · `a756998` | No — source-inspected only | small-builder |
| M2-4-S | deterministic three-way matching with correction history | `0037` · `…/supplier-matches`, `…/supplier-matches/corrections` | #87 · `cd5412d` | No — source-inspected only | small-builder |
| M2-5-S | cited, reviewable Things to check | `0038` · `…/things-to-check`, `…/things-to-check/:action` | #88 · `5e4ab21` | No — source-inspected only | small-builder |
| M2-6-S | readiness risks from explicit synthetic facts | `0039` · `…/readiness`, `…/readiness/:action` | #89 · `95fdea3` | No — source-inspected only | small-builder |
| M2-7-S | mandatory/advisory inbox, coalescing, advisory budgets | `0040` · `…/relevance-inbox`, `…/relevance-inbox/:action`, `…/relevance-inbox/decisions/:decisionId` | #90 · `080949e` | No — source-inspected only | both (supervisor approval queue) |
| M1-16-S | builder-inspectable D11 advisory signals | — · `…/commercial-integrity`, `…/commercial-integrity/reviews` | #91 · `483e012` | No — source-inspected only | small-builder |
| M4-3-S | evidence packs and manifest verifier | `0041` · `/api/recovery-cases/:id/evidence-packs`, `…/evidence-packs/:packId/download` | #92 · `694e9e1` | **FAIL** — `docs/verdicts/M4-3-S/fd56bdd.md`; repair candidate `8116aa6` also **FAIL** (`docs/verdicts/M4-3-S/8116aa6-repair.md`); both on unmerged `codex/sandbox/m4-3-s-repair` | both (evidence for client approval and disputes) |

### 7.3 Not built

No merged code exists for: persisted sign-in and identity email (the rest of M0-6); the live Claude route and the Deepgram adapter (the rest of M0-12); M0-13 in any part; the M1-15 human trial; VOICE-1's real-device rehearsal; the live parts of M2-1…M2-7 (real inbound mail alias, approved OCR, live weather and bank-holiday adapters, G2 pilot review); M2-8; all of M3; every live M4 task and the synthetic leaves M4-5-S…DEMO-1; every SV, CH, MON and ENT task; all of M5.

### 7.4 Verdict backfill needed

1. **No merged task has an independent recorded verdict on `main`.** The six directories under `docs/verdicts/` (SBOX-1, UIWIRE-7, UIWIRE-9, UIWIRE-12, UIWIRE-14, M2-2-S) hold builder receipts from Codex or ChatGPT, each stating that independent review is outstanding. Record retrospective verdicts, labelled retrospective, bound to each merged commit, citing that PR's CI run for DB and browser evidence (the embedded-postgres binaries fail to load on Ben's Mac and Docker is not installed, so local runs cannot supply it).
2. **Land or close the three open reviews first:** M4-1-S (HOLD), M4-2-S (HOLD), M4-3-S (FAIL, repair FAIL). Until a repair has a recorded PASS verdict against its exact head, separate technical acceptance, and founder-authorized merge, the merged code is "reviewed, not accepted" and nothing new may build on the parts the verdicts name.
3. **Priority for the rest:** tenancy, authorisation, audit and money first — M0-4, M0-5, M0-8, M0-9, M0-10, M1-7/UIWIRE-5, M1-12 with UIWIRE-10/11/12 (including the `0030` controlled routines), M1-13/UIWIRE-13, M1-17. Then work the contractor track reuses — M1-9/UIWIRE-8, M1-10/UIWIRE-7, M1-8/UIWIRE-6, M2-7-S, SBOX-1/2, VOICE-1. Then the remainder.
4. **Move the existing historical ACCEPT verdict (the term then in use)** for #15 from `JOBGUARD_REVIEW_HANDOFF.md` into `docs/verdicts/` bound to `064ceda`, and convert the PR-comment reviews (#13, #17, #18, #27, #29, #81) into recorded retrospective verdicts against their merged commits; the comments themselves were conditional and pre-date the final commits.
5. **Human evidence stays separate:** the UIWIRE-15 checklist and VOICE-1 device rehearsal are observations, not verdicts, and remain "Not observed" until a person records them.

---

---

## 8. Shared changes to built work

Both tasks inherit C1–C8 and AGENTS §2 and are buildable now in `synthetic_demo`. CH-3 is pre-split into CH-3a (both tracks, no dependencies) and CH-3b (contractor party links, after ENT-1); their aggregate acceptance is the CH-3 acceptance.

### CH-2 The watchdog runs only on live jobs
**Track:** shared
**Depends on:** none.
**Build:**
- **One predicate.** `packages/core` defines `watchdogActive(job)`: true only when `job.status = 'live'`, whatever the job's provenance. A quoted small-builder job reaches `live` by switch-live; an adopted job (M1-17) by import at `live`; a contractor job created from an imported work order enters `live` in the same transaction as its import, with the work order as its baseline and no quote, acceptance or switch-live (ENT-2 owns that entry and asserts it passes this predicate). `invoiced`, `paid`, `lost`, `draft`, `quoting` and `accepted` are not live.
- **Database enforcement.** A narrowly granted controlled routine, owned by `jobguard_migration` with EXECUTE granted only to `jobguard_runtime` (catalog-tested), verifies that the job belongs to the transaction's verified tenant context, takes a share lock on the job row as the command's first business lock, and raises `JOB_NOT_LIVE` unless the job is live. Every command that records a watchdog input calls it, and a BEFORE INSERT trigger on each watchdog input table calls it too, so a direct runtime-role insert cannot bypass the service. Lifecycle transitions already lock the job row for update, so a watchdog command and a transition out of `live` serialise.
- **Commands that require live:** purchase-order draft, revision and simulated placement (M2-1B-S); supplier-document intake and goods receipts (M2-2-S); supplier-fact confirmation (M2-3-S); match corrections (M2-4-S); Things-to-check evaluation, review and bill supersession (M2-5-S); readiness planning and fact advance (M2-6-S); relevance-inbox seeding (M2-7-S); proof upload, finalisation and stage completion (UIWIRE-7). Variations and the final account keep their existing activation checks.
- **Allowed before live:** capture, review and confirmation; quote pricing, preview, simulated send and acceptance; switch-live itself; material requirements and tenant agreed prices (quoting inputs); reads of everything. **Unaffected by this task:** customer invoices, credit notes, receipts, recovery cases, eligibility, evidence packs, fee illustration and commercial-integrity reviews, which belong to the post-live billing and recovery lifecycle.
- **Command registry.** Every job-scoped mutation command is classified `pre_live_allowed | watchdog_live_only | post_live_billing` in one registry. The rule: a command that records a site fact, supplier document, order, proof or site message is `watchdog_live_only`. Future commands inherit the rule by classification: job diary entries (once SV-7A adds the diary) and customer messages (small-builder), operative "Log an extra" and live extra prompts (contractor). An unclassified command fails CI.
- **Typed error and copy.** `JOB_NOT_LIVE` maps to HTTP 409. The watchdog panels (Materials orders, Supplier documents, Proof, Readiness, Things to check) on a non-live job show "Switch this job live to use the watchdog — it's free until work starts on site." for jobs before live, and "This job is no longer live." for jobs after it, with their primary actions disabled and existing records still readable.
- **Fixtures.** Seed recipes and scenarios that record watchdog inputs switch the job live first through the real command, and record those inputs before any later invoice; nothing writes `status` directly or bypasses the guard.

**Done when:**
- For each `watchdog_live_only` command, real-PostgreSQL tests with the job in `draft`, `quoting`, `accepted`, `invoiced`, `paid` and `lost` return `JOB_NOT_LIVE` and leave no domain row, evidence finalisation, audit event, outbox action or command receipt; the same command on a `live` job succeeds once.
- A direct runtime-role INSERT into each watchdog input table for a non-live job is refused by the trigger; a runtime-role attempt to call the routine for another tenant's job, or to take its lock by any other path, fails.
- Race: a watchdog command and a transition of the same job out of `live` run on two connections; either the command commits first, or it is refused. No watchdog row exists whose commit follows the job's exit from `live`. The M0-8 command-layer lock-order test is extended to the guarded commands and shows no business lock after the audit append.
- A refused command leaves no receipt, so the same command ID succeeds once after the job goes live; replaying it again returns the first result, and the same ID with a different payload conflicts.
- A client-supplied status, lifecycle flag or "live" claim in any payload is ignored. A same-tenant live job's ID cannot be used to attach an input to a non-live job (composite-key failure). A non-member tenant gets 403/404 without learning the job's state.
- An M1-17 job imported at `live` accepts watchdog inputs; one imported at `invoiced` refuses them. A quoted job accepts them only after switch-live.
- Capture, review, confirmation, quote pricing, preview, simulated send, acceptance and switch-live still succeed on non-live jobs (existing regressions unchanged). Records created while live stay readable after the job leaves `live`.
- The registry test fails when a new job-scoped mutation command is unclassified, and a static plus runtime check proves every `watchdog_live_only` command calls the guard.
- Browser tests in both projects: on a quoting job each watchdog panel shows the exact message and disabled primary actions; after switching live through the real command the same panels accept input; reload and a second browser context show the persisted state. `real-external-actions` stays `0`.
- Existing e2e and DB suites pass with fixtures reordered as above; no assertion is removed or weakened.

### SH-1 Shared money and origin primitives
**Track:** shared
**Depends on:** adoption of this revision (§2.1)
**Build:**
- **Pure (`packages/core`):** the cumulative-fee kernel used by both tracks — fee = rate × cumulative qualifying principal as an exact rational, rounded half-even once, postings as deltas against prior net postings, reversals as linked negative deltas, rate fixed per policy or agreement version; and the pure receipt-to-line allocation rules (explicit allocation → separate invoice → pro-rata across lines outstanding at receipt, exact rationals, single rounding). No persistence.
- **Persistence:** `variation.origin` with both tracks' kinds (`builder_logged | final_review | jobguard_catch` for small-builder jobs; `site_user | jobguard_surfaced_confirmed | office_entry | client_instruction` for contractor jobs) and a same-row CHECK over origin kind and a server-written immutable `job_track` value, with a tenant/job/track-qualified foreign key to the job's immutable commercial-track binding; SH-1 creates this shared binding schema and safely backfills existing synthetic jobs, while activation/import routines bind new jobs; the immutable `extra_origin` table (tenant, job, variation, kind, command receipt, raising user and role, server time, labelled device capture time, evidence hash) with FORCE RLS, no runtime UPDATE/DELETE/TRUNCATE, and one origin per variation; SH-1 performs the idempotent `builder_logged` origin backfill for existing synthetic small-builder variations, preserving source provenance and earlier guarantees; SV-2 verifies that completed backfill and performs no second backfill.
**Done when:**
- Property tests: splitting or combining receipts never changes a cumulative fee; half-even ties (5p → 0p, 15p → 2p, 25p → 2p at 10%); every §10.3 and §9.1 fee fixture reproduces exactly; no binary-float arithmetic (existing money lint).
- PostgreSQL tests: the runtime role cannot update or delete an origin row or change `variation.origin`; a contractor kind on a small-builder job (and the reverse) is rejected; cross-tenant and cross-job origin links fail; backfill is idempotent. Direct runtime SQL with a forged `job_track`, a missing binding or a same-tenant wrong-job binding fails; attempts to change an established job-track binding fail. New activation/import routes establish the binding atomically.
- SV-1, ENT-4a and M4-8-S import these functions; no second implementation exists (architecture test).

### CH-3a Structured customer, paying party and site on every job
**Track:** shared
**Depends on:** none.
**Build:**
- **Domain (`packages/core`).** Versioned Zod schemas `customer.v1`, `site.v1`, `job-parties.v1`. Customer type: `person | business | landlord_or_agent | insurer | main_contractor | housing_association | local_authority` (a homeowner is `person`, a managing agent `landlord_or_agent`, a council `local_authority`). `isIndividual` is derived (`type = 'person'`), never accepted from a client. UK postcode validation and normalisation (upper case, single space); a deterministic site match key including normalized postcode, premises address and unit/flat identifier, using a validated UPRN where available; optional UPRN (digits only).
- **Persistence.** Tenant-scoped `customer` and `site` identities with append-only revisions (customer: name, type, optional email, phone and company number; site: address lines, town, postcode, optional UPRN, match key). An append-only job-party binding per job: exactly one customer, one site, and a paying party that is either "same as customer" or a different customer in the same tenant; each binding records its provenance (`entered | backfilled_from_quote_snapshot | backfilled_synthetic_fixture | work_order_import`). A current-binding projection is unique per job. All tables: non-null `tenant_id`, tenant-qualified foreign keys, enabled and FORCE RLS, migration-owned, runtime SELECT/INSERT only.
- **Commands.** Create and revise a customer; create a site; a matching key proposes the existing identity, but reuse requires explicit confirmation and an ambiguous or different unit creates a separate identity (the UI asks the user to confirm it is the same place; near matches are shown as suggestions and never merged automatically); bind job parties with the expected job revision; after live, correct a binding only through an audited correction command with a reason. The switch-live record and any issued document keep the binding they were made with.
- **Required at entry into live.** The switch-live routine and the M1-17 adoption-import routine refuse a job without a current customer and site binding (`JOB_PARTIES_REQUIRED`). Work-order import enforces the same through CH-3b.
- **Documents.** Quote preview requires a customer and site. Quote and customer-invoice documents issued after this task snapshot the customer, paying party and site revisions they name. Documents issued earlier are unchanged.
- **Recognition read model.** A tenant-scoped projection of jobs that share the same customer identity and site identity, with their lifecycle intervals, for the jobs-on-the-go meter (overlapping jobs for the same customer and site) and for import linking. No cross-tenant matching.
- **UI.** A "Customer and site" panel in the job workspace, with type choices in plain words ("A person (homeowner)", "A business", "Landlord or letting agent", "Insurer", "Main contractor", "Housing association", "Council") and "Who pays?" defaulting to "Same as customer". Switch-live is disabled with an explanation while details are missing. The jobs list shows each job's customer and site.
- **Privacy.** Names, contacts and addresses of individuals are personal data: a retention class is recorded, and audit payloads carry identities and hashes only, never names, addresses or contact details.
- **Backfill.** An expand-compatible migration binds every existing job. In `synthetic_demo`: the customer name comes from the latest issued quote's existing customer snapshot where one exists (`backfilled_from_quote_snapshot`), otherwise from the scenario's fixture recipe (`backfilled_synthetic_fixture`); sites come from the fixture recipe. In any other mode the migration invents nothing: the job is marked "details needed" and raises a Decision.

**Done when:**
- Switch-live and adoption import refuse a job without customer or site, in the PostgreSQL routine, the API and the UI; with both present, each succeeds once. Double-clicked or concurrent switch-live still produces one activation.
- A job has exactly one current customer and one current site: two concurrent bindings produce one success and one typed stale-revision conflict, and the database's unique constraint rejects a second current binding written any other way. Two customers can never share a job.
- A customer, paying party or site from another tenant fails through tenant-qualified foreign keys without disclosing the other record. The same customer and site may be bound to several jobs in one tenant.
- The recognition projection groups two jobs with the same customer and site; "sw1a1aa" and "SW1A 1AA" normalise to one site; different flats in one building stay separate sites; a near match is never merged without a user's confirmation.
- A post-live correction requires a reason, appends a revision and an audit event, and leaves the switch-live record and every issued document's snapshot unchanged (bytes and hashes compared). Runtime UPDATE/DELETE on customer, site and binding tables is denied.
- A client-supplied `isIndividual`, provenance or tenant ID is ignored; invalid postcode, UPRN or type fails the versioned schema with a typed error.
- The audit payload allowlist test shows no name, address, email or phone in any CH-3a audit event.
- Replaying a command ID with the same payload returns one result; the same ID with a different payload conflicts.
- Migrations: a fresh install and an upgrade from the previous schema, seeded with jobs in every lifecycle state, leave every synthetic job with a complete binding and labelled provenance; a non-synthetic job is left "details needed" with a Decision and no invented value; existing quote and invoice snapshots are byte-identical after upgrade; the previous demo keeps running during rollout; all existing journeys pass.
- Browser tests in both projects: capture customer and site on a quoting job, see switch-live disabled with its explanation while they are missing, complete them, switch live, reload and open from Jobs; a second browser context shows the same customer and site.

### CH-3b Contractor job parties: client organisation, client contract and resident
**Track:** contractor
**Depends on:** CH-3a, ENT-1.
**Build:**
- Link each ENT-1 client to exactly one CH-3a customer record: homeowner clients use `person`; organisation-only clients use the corresponding non-person type. Both tracks use this registry to answer who is billed, with tenant/client-contract-qualified relationships.
- An append-only contractor-party binding per work-order job: client organisation; client contract, constrained by composite key to that organisation and tenant; resident contact (name plus at least one of phone or email) or a recorded no-resident reason from a closed list (`void_property | communal_area | client_withheld`). Resident contact lives in its own restricted table with its own retention class.
- A controlled routine that ENT-2's work-order import calls inside its import transaction: it sets the job's customer to the client organisation's customer record, the paying party to that organisation unless the work order names another, and the site from the work order; it refuses the import (`CONTRACTOR_PARTIES_REQUIRED`) unless client organisation, client contract, site and resident contact or reason are all present.
- Resident contact is readable only by members with access to that job under ENT-1's scoping. It is excluded from job lists, dashboards and exports by default, from AI gateway input, from logs and from audit payloads.
- The provider/data-flow register records resident and client contact data as processed for the contractor as controller, with JobGuard as processor (D12 v4, proposed).

**Done when:**
- The routine refuses a work-order job missing any of client organisation, client contract, site or resident contact/reason, and binds a complete one once; ENT-2's import tests call this routine and assert the refusal.
- A client contract belonging to another client organisation, or to another tenant, fails through the composite key; a person customer may be linked as a homeowner client; organisation-only clients must use their corresponding non-person customer type. Tenant and client-contract bindings remain enforced by composite keys.
- An operative outside the job's team gets 404 for the resident contact without learning it exists; an operative on the job and that team's supervisor can read it; list, dashboard and export endpoints omit it by default.
- Audit payloads, logs and AI gateway requests contain no resident name, phone or email (payload allowlist and log-capture tests).
- A replayed or concurrent import of the same work order produces one binding; the same command ID with a different payload conflicts.
- CH-3a's switch-live and recognition assertions still pass for contractor tenants.

---

---

## 9. Contractor track

On the contractor track, site operatives log extras in seconds. The contractor's own approval rules decide what can be billed, and the contractor bills from its own system. JobGuard earns a share of the net value of **site-originated extras** that are approved, billed and paid. Nothing is held back: supervisors see possible extras as soon as JobGuard finds them. The relevant decision records are D16 (enterprise terms), D12 v4 (JobGuard as processor) and D13 v3 (nothing held on this track). All three are `proposed`, and no task may mark them approved.

### 9.1 Product contract

#### 9.1.1 Who is on this track

- **The track belongs to the company (tenant), never a person.** `commercial_track ∈ {small_builder, contractor}` is an append-only, audited assignment written only by a JobGuard operations routine against a signed agreement reference (generated in `synthetic_demo`).
- **The line between tracks.** Up to 7 jobs on the go at once: small-builder deal. A small-builder account with more than 7 jobs at once in any 2 of 3 consecutive monthly billing periods, using the explicitly approved D09 measurement rule, is moved to the contractor deal with notice once the contractor agreement and data processing agreement are signed; short peaks are billed as extra jobs. A firm that starts above 7 jobs, or wants operatives logging extras, starts on the contractor deal. There is no Firm or Contractor subscription plan.
- **Crossing the line.** The small-builder meter raises the track-move notice (10.1.9); it never moves an account itself, because the move needs an accepted contractor agreement (D16) and a data processing agreement (DPA) (9.1.12).
- **Never retroactive.** The track is bound to each job: a quoted job at switch-live, a work-order job at import. Jobs live at a move keep small-builder terms through their remaining lifecycle, including later invoices, settlement, fee derivation, reversals and refunds; lock or close never substitutes new commercial terms; and their extras stay fee-free builder capture. Site-origin capture, approval chains, export and the enterprise fee exist only on contractor jobs of contractor tenants, where the shadow bill and Final Check are off.

#### 9.1.2 Organisation model

- **Structure.** One tenant is one contractor: an `org_unit` tree (tenant → region → branch); `team`s in one branch; members in any number of teams.
- **Roles:** `operative | supervisor | surveyor | commercial_manager | finance | admin`, plus existing `owner` (bootstrap) and `read_only`. A `role_grant` is (membership, role, scope: tenant, region, branch or team); a member may hold several; everything else is denied. Invitations validate roles against the track (`estimator` and `foreman` are small-builder roles; `supervisor`, `surveyor` and `commercial_manager` contractor roles).
- **Visibility.** RLS enforces the tenant boundary; one scoped repository layer enforces grants on every contractor read and command. Operative: assigned jobs. Supervisor: jobs of teams in scope. Surveyor and commercial_manager: jobs in their unit scope. Finance: export, import, reconciliation and statements, tenant-wide. Admin: administration only. An out-of-scope ID returns the same not-found as a non-existent one.
- **`client_approver`:** a restricted membership bound to one client organisation (optionally named contracts), invited by a commercial_manager or admin, signing in by email code or SSO. It sees only extras awaiting that client's decision and their approval packs; never fees, statements, dashboards, other clients or other jobs.
- **Clients and contracts.** `client_organisation` (housing association, council, insurer, managing agent, homeowner, main contractor), linked by CH-3b to exactly one CH-3a customer record so both tracks answer "who is billed" from one registry; `client_contract` with immutable `client_contract_version`s holding reference, dates, schedule-of-rates versions, tendered adjustment as an exact ratio (e.g. −35/1000), approval-rule version, photo rule, VAT code (D02) and the "exported, not billed" alert age (default 30 days). Immutable `sor_version`s hold `sor_item`s (code, description, unit, rate in pence, optional standard minutes).

#### 9.1.3 Work-order jobs

- **Creation.** A job created from a client work order has provenance `work_order` and is `live` from import: no quote, acceptance, switch-live or platform obligation; null v1 cap and fee-policy columns. Its baseline is the current work-order revision.
- **Identity and revisions.** Identity is (tenant, client contract, client work-order reference). An identical re-imported row is a recorded no-op; a changed row appends an immutable `work_order_revision` with immutable lines (origin `client_instruction`); a cancellation is a revision. Each line mints a `scope_item_id`, kept across revisions for unchanged lines (matched by client line reference, else SoR code and position).
- **Fields and facts.** Client organisation, contract version, site and resident contact (or a no-resident reason), bound by the CH-3b routine inside the import transaction; priority; dates; lines (SoR code, quantity, unit, rate, net). Operational facts: `job_assignment`, `site_visit` (server times), `closeout_answer`.
- **Pricing extras.** SoR items: quantity × the `sor_version` rate in force on the order's issue date × (1 + the signed tendered adjustment), using exact rational arithmetic, rounded half-even once at the line (for a £100 rate and adjustment −35/1000, quantity 1 produces £96.50 before VAT; zero and positive adjustments, fractional quantities, half-even ties, overflow and an invalid negative resulting multiplier are tested); a later version never reprices a revision. Non-schedule items are priced by a surveyor (`surveyor_quoted`). AI rates remain labelled suggestions.

#### 9.1.4 The extra and its lifecycle

An extra is a positive-value `variation` on a work-order job: a new item (new scope identity, `variation` lineage) or quantity beyond an instructed line (the excess only, linked to that line). Omissions and negative adjustments are order revisions, never extras. Priced revisions are immutable; a change voids approvals of the previous revision. The lifecycle is a projection over append-only `extra_event` facts; `variation.state` is a cached projection.

```text
logged -> awaiting_approval -> approved -> exported -> billed -> part_paid -> paid
                            \-> rejected
approved | rejected -> awaiting_approval         new priced revision only, before export
logged | awaiting_approval | approved -> withdrawn   not_done | raised_in_error | resident_cancelled | already_on_order
logged | awaiting_approval | approved | rejected -> duplicate   before export
exported -> billing_rejected
billed | part_paid | paid -> credited            billed net reduced to zero; partial credits change amounts only
part_paid | paid -> billed | part_paid           imported payment reversal
```

`withdrawn`, `duplicate`, `credited` and `billing_rejected` are terminal. `rejected` is terminal for its revision.

| Transition | Command | Who (grant must cover the job) | Guard |
|---|---|---|---|
| — → logged | `LogSiteExtra` | operative, supervisor assigned to the job | origin `site_user`; note or verified photo |
| — → logged | `ConfirmPrompt` | supervisor, surveyor, commercial_manager | origin `jobguard_surfaced_confirmed` |
| — → logged | `RecordOfficeExtra` | supervisor, surveyor, commercial_manager, admin | origin `office_entry` |
| — → logged | `RecordClientInstruction`, order import | surveyor, commercial_manager, connector | origin `client_instruction` |
| logged → awaiting_approval | `SubmitExtra` / `PriceExtra` | supervisor, surveyor; an operative only via a server-priced SoR log | confirmed price; requirement snapshot |
| → approved | `ApproveExtraStep` (last step) | the step's role; `client_approver` for the client step | exact revision and hash; no self-approval |
| → rejected | `RejectExtra` | holder of a pending step; `client_approver` | reason code |
| → withdrawn | `WithdrawExtra` | the raiser, before any step; supervisor and above | not exported |
| → duplicate | `MarkDuplicate` | supervisor, surveyor, commercial_manager | same job; canonical not itself a duplicate |
| → awaiting_approval | `ReviseExtra` | supervisor, surveyor | new revision; not exported |
| approved → exported | `FinaliseExportBatch` | finance, commercial_manager | requirement satisfied under lock |
| exported onwards | `ImportBillingStatus` | finance, connector | matched export line |

#### 9.1.5 Origin and the site-originated predicate

- **Where it lives.** The kind is `variation.origin`, the column shared with the small-builder track (created by SH-1, §8). The runtime role has no UPDATE grant on it, and one CHECK ties each value to the job's track: `builder_logged | final_review | jobguard_catch` for small-builder jobs; `site_user | jobguard_surfaced_confirmed | office_entry | client_instruction` for contractor jobs. Each contractor extra also has one immutable `extra_origin` record: raising command ID and type, actor and grant, `server_recorded_at`, labelled client metadata (device ID, capture time), job track, work-order revision in force, visit and prompt (if any), evidence hash, resident-confirmation link.
- **Written once by the server** in the transaction of the command that first raises the extra. The database maps command type to the one kind it may write (`LogSiteExtra → site_user`, `ConfirmPrompt → jobguard_surfaced_confirmed`, `RecordOfficeExtra → office_entry`, `RecordClientInstruction`/import → `client_instruction`), requires actor = command actor, and requires exactly one `extra_origin` per contractor extra at commit. No edit, AI output, import, connector, office action or later instruction can write or change it; the runtime role cannot update or delete it.
- A later formal client instruction for the same work links through `extra_order_line_link`; the origin is unchanged and the work is billed once.
- Offline capture keeps the raising user and client capture time as labelled metadata; ordering and entitlement use server time only.

**Predicate.** For a duplicate group *g* (one extra is a group of one), the **effective origin** *o* is the member with the earliest `server_recorded_at` (ties: lowest ID). `site_originated(g)` holds only when all four conditions hold:

1. `o.kind ∈ {site_user, jobguard_surfaced_confirmed}` on a job whose track is `contractor`.
2. The item was not instructed on the order revision in force at *o* (a new item, or the excess quantity only).
3. *o* carries a capture note or a server-verified photo (plus the resident confirmation, where captured).
4. For `jobguard_surfaced_confirmed`, the prompt was surfaced before any other group member was raised, and was confirmed by a supervisor, surveyor or commercial_manager covering the job.

`fee_bearing(g)` holds only when `site_originated(g)`; the canonical's current revision is approved with its snapshot satisfied; it is exported and matched to billed lines; `Q_g > 0` (9.1.9); and the mode permits fee derivation. A false site origin only raises the contractor's own fee, and statement disputes handle it; the controls stop JobGuard, AI, connectors and office relabelling from creating or changing an origin.

#### 9.1.6 Duplicates

The server flags candidates deterministically (same job; same SoR code or excess on the same line; same visit or day); supervisors may also link manually. `MarkDuplicate(duplicate, canonical)` writes an immutable link; the canonical is billed, and the group's effective origin follows 9.1.5, never the linker's choice. Only the canonical can be exported, and the group counts once. Unlinking is allowed before export only, by a supervisor or above, with a reason. A prompt matching an existing extra coalesces into it and creates no origin.

- **After export,** a duplicate is repaired only by the authorized `ReconcileExportedDuplicate` command (ENT-7), never by editing links; unresolved candidates block export (ENT-6).
#### 9.1.7 Approval chain

Each client contract version references an immutable `approval-rules.v1` document setting: **proceed limit X** (work may start before approval when priced net ≤ X; unpriced counts as above every threshold); **contractor steps by value band** (e.g. ≤ £250 supervisor; ≤ £1,000 supervisor, surveyor; above, plus commercial_manager; a zero-step band is approved by a recorded `contract_rule` step); **client approval** (`none`, or required above T, and before work above Y); per-step **time limits** with escalation and alternate roles; and **evidence rules** (photos, resident confirmation).

- **Snapshot.** On submission the server snapshots the requirement (rule version, band, steps) onto the revision; later rule versions do not change it.
- **Steps.** Each `approval_step` is immutable, bound to extra, revision, hash, net value, rule version, step index, actor, grant, server time and `timing: before_work | after_work` (derived from the work-done fact). Steps are ordered; the raiser cannot approve their own extra; no one fills two steps; escalation notifies and grants authority only to listed alternates.
- **Client approval.** The client approver decides through an authenticated link bound to membership, revision and expiry, seeing the pack (origin, photos, resident confirmation, pricing, timing). Work done before a required pre-approval is flagged `done_without_required_preapproval`; the client decides.
- **Scope.** Approval authorises billing export only. Sending an approval request is an outbound message through the outbox, authorised for the exact recipient and pack hash.

#### 9.1.8 Billing export, status import and reconciliation

- **Export.** A batch is an immutable CSV artifact (documented JSON form `billing-export.v1`) with a content hash, for one client contract. Each line has a stable `export_line_id`, unique per extra revision. Finalisation locks extras in ID order and re-checks approvals and canonical status. Delivery (download, SFTP, API) goes through the outbox with its own status, including `outcome_unknown`.
- **Status import.** `billing-status.v1` rows carry source and source event ID, invoice number, a stable `external_invoice_line_id` for every invoice line, plus a nullable `export_line_id` required only for matching an exported extra; original-order and other non-extra lines retain their external identity and always contribute zero fee, net/VAT/gross, fact type (`invoiced | credited | paid | payment_reversed | rejected`), effective date, remittance reference, and line- or invoice-level allocation. Idempotent on (source, event ID); same ID with a different payload is a conflict; one payment arriving by two channels is resolved by an explicit reconciliation identity or held for review.
- **Matching.** Invoice and payment imports retain the complete relevant invoice-line balances, including original-order and other non-fee-bearing lines, under the same tenant and client contract. Only eligible exported extra lines can contribute to the contractor fee. Unknown or incomplete invoice composition is quarantined for review; it cannot default to allocation wholly onto extras. Imports never create, price or approve an extra.
- **Allocation (shared exact method).** Explicit line allocation, else a separate invoice, else pro-rata by each line's outstanding gross at the receipt's effective time; gross converts to net at the line's own ratio. Receipts dated before a line existed never spread onto it. Credits and refunds use the same order in reverse.
- **Reconciliation.** Approved not exported; exported but unbilled past the alert age; billed ≠ approved; paid > billed; credits, rejections, unmatched facts. Every total equals its drill-down sum.

#### 9.1.9 Enterprise fee contract (`enterprise_site_capture_policy_v1`, proposed)

The candidate deal is a success fee only, with no platform charge. Settlement comes from the contractor's own billing and payment data, with audit rights both ways; JobGuard invoices the contractor monthly. JobGuard's terms with the contractor are immutable `enterprise_agreement_version`s (distinct from client contract versions), written only by JobGuard operations. Each holds the rate as an exact ratio (default `10/100`); the basis (`on_payment` only in this revision; any historical or imported `on_invoice_with_true_up` value is rejected. A future invoice basis requires a separately issued, versioned policy amendment and corresponding changes to both governing documents and tests); the effective date; the end-of-job-check flag; and any minimum commitment, onboarding fee or volume band (recorded, refused until D16 fixes a formula, never part of the fee base). Each duplicate group binds to the version in force at its effective origin — a reference choice D16 must confirm.

```text
Per fee-bearing group g (exact rationals, pence, ex-VAT):
A_g = net of the approved current revision
I_g = invoiced net on matched lines;   C_g = credited net on those lines
D_g = deemed paid net on those lines after reversals and refunds (9.1.8)
Q_g = max(0, min(A_g, I_g − C_g, D_g))

Per tenant and agreement version v:
Q_v = Σ Q_g for groups bound to v
F_v = roundHalfEven(Q_v × rate_v)         // once, on the cumulative exact value
J_v = prior net posted fee for v, including compensations
delta_v = F_v − J_v
```

- **Posting.** A positive delta first creates a non-posting proposal. Only exact statement approval authorizes accrual in `platform_enterprise_fee`; the controlled routine rechecks the bound hash, amount, agreement version, input facts, current authority and expiry under lock before posting; a negative delta posts a linked compensating journal; a zero delta keeps its derivation row with no journal. Posted journals are never edited. Deltas split into per-group statement lines by largest remainder over exact contribution changes (ties by extra ID), summing exactly to the delta. Each derivation identity (tenant, version, period, input-facts hash) is unique and taken under the version lock.
- **Statements.** One per calendar month (Europe/London), covering facts the server recorded before cut-off; later facts go on the next statement with their effective dates. Each line shows extra, origin, approval steps, export line, invoice, payments and credits, allocation rule, change in `Q_g`, and fee. Revisions are immutable and hashed. Contractor finance approves the exact revision (a Decision bound to hash, total, versions and expiry) or disputes lines, which creates a new revision without them; disputed lines are held until re-derived. JobGuard then issues a platform invoice (a simulation now).
- **Pilot and separation.** Pilots run in `pilot_no_charge`; statements always say "Illustration — no charge" in `pilot_no_charge`, and that mode never accrues or collects JobGuard fees. Paid activation requires a separately authorized production activation and cannot retroactively bill pilot jobs. Small-builder fees use a separate book, policy and statement.

**Mandatory fixtures** (VAT 20%):

| ID | Facts | Q | F | Posting |
|---|---|---:|---:|---|
| ENT-F1 | £150 site extra, approved, billed £150 + £30 VAT, paid £180 | £150.00 | £15.00 | +£15.00 |
| ENT-F2 | One invoice: order £1,000 + extra £240, gross £1,488; unallocated £500 received | £80.645161… | £8.06 | +£8.06; the remaining £988 gives Q £240, F £24.00, +£15.94 |
| ENT-F3 | F1, then £50 net credit on the extra's line | £100.00 | £10.00 | −£5.00 |
| ENT-F4 | F1, then the payment reversed | £0 | £0 | −£15.00 |
| ENT-F5 | Approved £150, invoiced £200 (office merged other work), paid | £150.00 | £15.00 | the excess is not fee-bearing |
| ENT-F6 | Approved £150, invoiced £120, paid | £120.00 | £12.00 | +£12.00 |
| ENT-F7 | One £150 extra logged by two operatives, collapsed, paid | £150.00 | £15.00 | one line |
| ENT-F8 | Office entry £500, client-instructed £800 and an order line, all paid | £0 | £0 | none |
| ENT-F9 | v1 10/100 to 15 Nov, v2 8/100 from 15 Nov; X £150 raised 10 Nov, Y £150 raised 16 Nov, both paid 20 Nov | £150 each | £15.00; £12.00 | +£27.00 in two sections; a later credit on X compensates under v1 |
| ENT-F10 | Three £0.05 extras paid | £0.15 | £0.02 | lines 1p, 1p, 0p by ID |
| ENT-F11 | Q 5p / 15p / 25p; 5p + 5p as two receipts | — | 0p / 2p / 2p; 1p | half-even, cumulative |
| ENT-F12 | October statement approved; credit imported in November | — | — | compensation on November's statement; October unchanged |

#### 9.1.10 Live prompts and the optional end-of-job check

- Prompts are advisory findings shown at once to supervisors covering the job; no lock, `disclosed_before_lock` rule or shadow table is used.
- **Deterministic rules first:** (a) a completion photo tag or note names work not on the order; (b) materials issued to the job (imported stores facts) exceed the order lines; (c) visit time exceeds the order's standard minutes by the contract factor (never when minutes are missing); (d) a close-out "yes" with no extra logged. AI proposals through `packages/ai` follow.
- Each prompt cites evidence IDs and hashes for the same tenant and job, with its rule or model/prompt/schema version and a coalescing key.
- A supervisor, surveyor or commercial_manager confirms (`ConfirmPrompt`, then normal pricing and approval) or dismisses with a reason. AI output cannot set origin, price, approval or fee status. An office entry matching a surfaced or dismissed prompt raises an advisory signal, never a fee.
- Where an agreement version enables the end-of-job check, it runs at job completion and surfaces prompts the same way.

#### 9.1.11 Never fee-bearing

Order lines and instructed quantities; `office_entry` and `client_instruction` extras; omissions; withdrawn (including `not_done`, `already_on_order`), rejected, `billing_rejected`, unexported or unbilled extras; unpaid or pending amounts; credited or reversed portions (fee reversed with them); non-canonical duplicates; billed amounts above the approved net; unconfirmed prompts and AI output; advisory signals; anything raised on the small-builder track; anything in `synthetic_demo` or where the fee gate is closed.

#### 9.1.12 Data protection

- The contractor is controller of residents' and clients' personal data; JobGuard is its processor under a DPA, and controller only of its own account, billing and security data (D12 v4).
- Retention follows the contractor's instructions within D07 classes; residents' access requests go to the contractor; resident data is never used for JobGuard's own purposes (no model training, no cross-customer analytics).
- Resident contact is readable only by members with access to the job under ENT-1 scoping, and is excluded by default from lists, dashboards, exports, AI gateway input, logs and audit payloads (CH-3b). Resident confirmation is labelled "confirmed on the operative's device; identity not verified". Operative-level figures are visible only to roles covering that operative.
- Before the first pilot: the DPA, a sub-processor list, a data-protection impact assessment (DPIA) for resident data, and D04-approved routes for any AI or speech processing.

#### 9.1.13 Gates

| Capability | Gate |
|---|---|
| Synthetic construction | Cards marked "synthetic now" in 9.2, in `synthetic_demo` |
| Real contractor data (pilot) | G1, signed pilot agreement and DPA, D12 v4 and D16 pilot terms approved by the founder (ENT-14) |
| Charging the enterprise fee | G4-C with D16 and D02 approved; settlement from the contractor's billing and payment data tested end to end; solicitor-reviewed contract. No bank feed needed |
| Native operative app | G3 for the operative app (ENT-12 screens, M3-7 device suite) |
| Each live connector or SSO capability | G5 |

The gates `enterprise_real_data`, `enterprise_fee_posting`, `enterprise_fee_collection` and `enterprise_ai_prompts` fail closed in `pilot_no_charge` as well as `production_billing`.

### 9.2 Task cards

Every card inherits §2.4 C1–C8 and AGENTS §2. Cards reuse the merged command dispatcher, Decisions, outbox, audit chain and evidence upload. Screens are mobile-first Next routes on the shared application services (for example `/site/...` for operatives, `/approvals/...` for supervisors and client approvers, `/billing/...` and `/statements/...` for finance). Each card generates minimal fictional fixtures through the commands available at its dependencies; ENT-11a later assembles the complete contractor fixture. All recipients use `.invalid`.

| Card | Depends on | Build mode |
|---|---|---|
| ENT-1 | ADOPT | Synthetic now |
| ENT-4a | SH-1 | Synthetic now |
| ENT-2 | ENT-1, SH-1, CH-2, CH-3b | Synthetic now |
| ENT-4b | ENT-4a, ENT-2 | Synthetic now |
| ENT-3 | ENT-2, ENT-4b | Synthetic now |
| ENT-5 | ENT-3, M4-3-S-R | Synthetic now |
| ENT-6, ENT-8a, ENT-11a | ENT-5 | Synthetic now |
| ENT-7 | ENT-4b, ENT-6 | Synthetic now; posting outside the sandbox needs G4-C |
| ENT-8b | ENT-8a | Fixture evaluation now; live model and real data need D04, the DPA and `enterprise_ai_prompts` |
| ENT-9 | ENT-7 | Synthetic now; real history needs G1 and the DPA |
| ENT-10 | ENT-1 | SSO and audit export synthetic now; assurance programme founder-led, live |
| ENT-11b | ENT-11a, ENT-7, ENT-9 | Synthetic now |
| ENT-13a | ENT-2, ENT-6, ENT-8a | Synthetic now with fakes; each real endpoint needs G5 |
| ENT-12 | ENT-3, M3-5 | Live: physical devices, D08; G3 through M3-7 |
| ENT-13b | ENT-13a | Live: named pilot contractor, G5 |
| ENT-14 | ENT-9, ENT-10 | Contract/review evidence plus the versioned agreement/mandate record and gate tests; solicitor and founder approval remain separate |

### ENT-1 Contractor organisation, roles and client contracts
**Track:** contractor
**Depends on:** none (extends the merged M0-6 memberships)
**Build:**
- The `commercial_track` assignment, written only by an operations routine.
- `org_unit`, `team`, team membership and scoped `role_grant`.
- The contractor roles and `client_approver`.
- The scoped repository layer, with a conformance matrix of permission × role × scope.
- `client_organisation`, `client_contract`, immutable `client_contract_version`.
- The `approval-rules.v1` schema with immutable rule versions (ENT-5 evaluates them).
- Admin screens and audit events.

**Done when:**
- **Tenancy:** across two contractor tenants and one small-builder tenant, nothing crosses tenants. Within a tenant, an out-of-scope ID returns the same not-found as a non-existent one.
- **Conformance suite:** every contractor command and query is tested against every role, in scope, in another team, another branch and another region.
- **Role limits:**
  - operatives cannot approve, price non-SoR items, export, import or view statements;
  - admin without an approval grant cannot approve.
- **Revocation:** a removed grant or a revoked membership refuses the next command. A team move takes effect on the next request and is audited.
- **Immutability:** the runtime role cannot update or delete contract or rule versions in PostgreSQL. An invalid rule document returns typed errors.
- **Track assignment:**
  - only the operations routine writes `commercial_track`;
  - the tenant owner and admin get permission denied;
  - a role from the other track is refused.
- **Client approver scope:** a client approver for client A cannot read client B's contracts, nor any job, statement, dashboard or resident record.

### ENT-2 Work-order jobs and schedules of rates
**Track:** contractor
**Depends on:** ENT-1, SH-1, CH-2, CH-3b
**Build:**
- **Import:** `work-order-import.v1` CSV import, with the API on the same service later, plus import batches and row receipts.
- **Orders:**
  - `work_order`;
  - immutable `work_order_revision` and `work_order_line`;
  - a scope identity per line.
- **Job provenance:** job provenance `work_order`, with a pointer to the current revision and no quote baseline, cap or fee-policy columns. The import transaction calls the CH-3b party routine and enters `live` in the same transaction.
- **Rates:** SoR version import and pure SoR pricing.
- **Scheduling:** `job_assignment` and `site_visit`.
- **Screens:** office import results and order-revision views.

**Done when:**
- **Idempotent import:**
  - a synthetic import of 2,000 orders succeeds;
  - importing the same file again creates no rows;
  - a file with 3 changed orders creates exactly 3 revisions, each with a diff;
  - two concurrent imports of one file produce one set of rows.
- **Import validation:**
  - a row naming another tenant's contract is refused;
  - a failing row never commits half an order;
  - malformed rows get per-row typed errors (unknown code, negative quantity, more than 6 decimal places, money out of range, missing site).
- **Immutability:**
  - the runtime role cannot update or delete revisions or lines;
  - a cancellation is recorded as a revision;
  - unchanged lines keep a stable scope identity.
- **No fee setup:**
  - jobs are `live` at import and pass CH-2's `watchdogActive`, with no quote, acceptance, obligation, journal, cap or fee-policy row;
  - an order missing client, contract, site or resident contact/reason is refused (`CONTRACTOR_PARTIES_REQUIRED`) and commits nothing;
  - the v1 import path and its tests are unchanged.
- **Pricing:**
  - exact, with tie fixtures;
  - uses the SoR version in force on the issue date;
  - a later version never reprices an existing revision.
- **Personal data and origin:**
  - resident details never appear in audit payloads or logs;
  - an import cannot write any origin except `client_instruction`.

### ENT-3 Operative capture: "Log an extra" and the close-out question
**Track:** contractor
**Depends on:** ENT-2, ENT-4b
**Build:**
- **Operative area:** assigned jobs, order lines, and visit start and complete.
- **"Log an extra":**
  - SoR search with recent items, free text, or on-device dictation (only reviewed text is sent);
  - quantity and a photo;
  - an order check showing "already on the order", "N more than ordered" or "new";
  - work status, with the proceed limit shown;
  - resident confirmation bound to the content hash on screen.
- **`LogSiteExtra`:** writes the variation, first revision and origin in one transaction. SoR logs are priced by the server and submitted; free-text logs stay `logged`.
- **Close-out question:** asked on visit completion — "Did the resident ask for anything extra?"

**Done when:**
- **Speed:** a priced SoR extra takes at most 4 taps plus the photo and typed search (Playwright, `mobile-360`).
- **Forgery attempts:**
  - the payload cannot set origin, time, actor, role or track: the strict schema refuses each attempt;
  - the stored origin matches the principal, the server time and the baseline in force.
- **Retries:**
  - the same command ID gives one extra and one origin;
  - the same ID with a different payload is a conflict;
  - two operatives logging the same item create two candidate duplicates, not an automatic merge.
- **Order check:**
  - an item within the instructed quantity becomes a supervisor query, not an extra;
  - excess quantity creates an extra for the excess only.
- **Close-out:**
  - completing a visit without an answer is refused in both the API and the UI;
  - answers are immutable, audited and replay-safe.
- **Refused targets:** unassigned jobs, cancelled orders and other tenants' jobs (not-found).
- **Evidence:**
  - a pending or rejected upload is not origin evidence;
  - with no note and no verified photo, submission is refused;
  - resident confirmation is labelled "identity not verified" and bound to its revision.
- **Accessibility:** no serious violations; touch targets at least 44 px at 360 px width.

### ENT-4a Site-origin and enterprise-fee domain (pure)
**Track:** contractor (imports the exact cumulative-fee kernel and receipt allocation rules from SH-1, §8)
**Depends on:** SH-1
**Build:** in `packages/core`:
- the 9.1.4 transition and permission table;
- origin kinds per track, and the command-type map;
- the site-originated predicate and the effective origin;
- `fee_bearing`;
- exact receipt allocation (explicit, then separate, then pro-rata; reversed for credits and refunds);
- `Q_g`, per-version derivation and delta;
- largest-remainder statement lines;
- Zod schemas.

**Done when:**
- **Transitions:** every legal and illegal transition is tested for every role.
- **Property tests:**
  - `fee_bearing` equals the 9.1.5 predicate across origin kind × track × order coverage × evidence × approval × billing state;
  - every 9.1.11 exclusion yields zero;
  - the effective origin does not change with member order or the choice of canonical.
- **Fee arithmetic:**
  - ENT-F1 to ENT-F12 come out exact;
  - splitting or merging receipts, in any order, never changes F;
  - Q is never negative;
  - overflow raises a typed error;
  - rates such as 8/100 are exact;
  - statement lines sum to the delta.
- **Boundaries:**
  - AI and prompt output types have no origin, price, approval or fee fields (compile-time test);
  - there are no network, database or vendor imports;
  - the v1 fee module and its tests are unchanged.

### ENT-4b Origin persistence and audit
**Track:** contractor
**Depends on:** ENT-4a, ENT-2
**Build:**
- **Origin:** uses the shared `variation.origin` column (both tracks' value sets, one track CHECK) and immutable `extra_origin` table created by SH-1 (§8); adds the contractor provenance columns and a foreign key to `command_receipt`.
- **Trigger:** enforces the command-type → kind map, actor equality and track.
- **Deferred constraint:** exactly one origin per contractor variation.
- **Event and link tables:** `extra_event`, `extra_duplicate_link` and `extra_order_line_link`.
- **Variation columns:** expand-compatible SoR, pricing-basis and excess-link columns on variations.
- **Also:** immutability triggers, a repository and audit events.

**Done when:**
- **Runtime role:** cannot update, delete or truncate origin, event or link rows (checked in the catalog and by executing SQL).
- **PostgreSQL refuses:**
  - a `site_user` origin written by a `RecordOfficeExtra` command;
  - an actor other than the command actor;
  - a second origin for the same extra;
  - a kind from the other track.
- **Missing origin:** a contractor variation without an origin fails at commit.
- **Links:**
  - composite foreign keys refuse cross-tenant and cross-job duplicate, order-line and evidence links;
  - duplicate links cannot chain or cycle. Ordinary duplicate resolution precedes export. ENT-4b supplies immutable duplicate lineage and pre-export integrity controls. ENT-6 owns unresolved-candidate export blocking and duplicate/export serialization tests. ENT-7 implements the authorized post-export reconciliation command and the billed-and-paid duplicate test, preserving artifacts and origins, issuing linked billing corrections, and compensating fees so the underlying work contributes once;
  - linking an order line leaves the origin hash unchanged.
- **Failure and replay:**
  - a failed command leaves no origin, event or audit row;
  - two commands sharing a client capture ID create one extra.
- **Audit content:** audit payloads hold IDs and hashes only.

### ENT-5 Approval chain and client approval
**Track:** contractor
**Depends on:** ENT-3, M4-3-S-R
**Build:**
- **Rules engine:** a pure evaluator plus the requirement snapshot.
- **Commands:** `SubmitExtra`, `PriceExtra`, `ApproveExtraStep`, `RejectExtra`, `ReviseExtra`, `WithdrawExtra` and `MarkDuplicate`.
- **Queues:** grant-filtered queues in the mandatory lane of the Decisions inbox, with Graphile-scheduled time limits and escalation.
- **Client approval:** invitation, sign-in and an approval page for client approvers; the approval request is sent through the outbox.
- **Evidence packs:** packs whose subject is `extra`. The merged pack table is keyed to `recovery_case`; extend it expand-compatibly.

**Done when:**
- **Completeness:** no extra reaches `approved` without every step in its snapshot.
- **Stale and wrong approvals:**
  - approving revision n after n+1 exists returns a typed stale conflict;
  - a wrong hash or net is refused.
- **Races:**
  - approve racing withdraw produces exactly one effect;
  - two approvers on one step produce one fact.
- **Refused approvers:** self-approval; one person filling two steps; steps out of order; a grant that does not cover the job; a revoked member.
- **Client approval:**
  - refused: forged, expired or revoked links; another client's extra; a different email; a replayed decision;
  - the client approver is always recorded as the actor, never as a contractor attestation.
- **Thresholds:**
  - exact at pence equality;
  - an unpriced extra counts as above all thresholds;
  - a later rule version leaves existing snapshots unchanged.
- **Timing:** the server derives timing, and `done_without_required_preapproval` is shown to the client.
- **Escalation:**
  - fires once, including across worker restarts;
  - grants authority only to listed alternates;
  - the advisory budget cannot suppress mandatory items.
- **Pack verification:** the extra's pack lists origin, photos, confirmation, pricing and steps; the merged verifier detects an altered or missing source.

### ENT-6 Billing export and status import
**Track:** contractor
**Depends on:** ENT-5
**Build:**
- **Export:**
  - export batches and lines, in CSV and `billing-export.v1`;
  - delivery through the outbox: download, fake SFTP and API.
- **Status import:**
  - `billing-status.v1` import by CSV and API;
  - `billing_fact`, `billing_line_match` and a quarantine.
- **Allocation:** `contractor_receipt_line_allocation`, owned by ENT-6 and using SH-1's shared pure allocation rules, storing the exact numerator and denominator plus the rule used.
- **Screens:** the billing projection and a reconciliation screen.

**Done when:**
- Known unresolved duplicate candidates block export until resolved; MarkDuplicate and export serialize on the job/group and member locks in the declared lock order; tests cover two exports racing duplicate resolution.
- **Export races:**
  - finalising again adds no lines;
  - of two racing batches, only one gets the extra;
  - an extra revised or withdrawn during finalisation is either included at the locked revision or excluded.
- **Export guard:** a controlled routine allows export lines only for canonical, approved extras of the same tenant and client contract.
- **Import idempotence:**
  - imports are idempotent by source event ID;
  - the same ID with a different payload is a conflict;
  - one payment arriving by both CSV and API is allocated once, or held as ambiguous.
- **Matching:**
  - invoice and payment facts retain all lines needed for allocation; extra-line fee contributions require a valid exported-line match, while non-extra lines affect allocation only and always contribute zero fee; a PostgreSQL ENT-F2 test proves Q is £80.645161… rather than £416.666… or £240;
  - facts with unknown or incomplete invoice composition are quarantined; identified original-order and other non-extra lines are retained without an export-line match. PostgreSQL tests prove these lines remain in the allocation denominator and cannot become fee contributions;
  - imports never create, price or approve an extra.
- **Ordering:** out-of-order facts are held and then applied, and projections are identical under any arrival order (property test).
- **Fixtures:**
  - part-payment, credit, reversal and rejection fixtures project correctly;
  - earlier deposits never spread onto a new line;
  - totals equal their drill-down sums.
- **Delivery and roles:**
  - an `outcome_unknown` delivery is reconciled, never blindly retried;
  - only finance and commercial_manager can export or import.

### ENT-7 Enterprise fee engine and monthly statement
**Track:** contractor
**Depends on:** ENT-4b, ENT-6
**Build:**
- **Agreement versions:** `enterprise_agreement_version`, written only by operations.
- **Derivation:** a locked derivation routine and its contributions.
- **Posting:** a controlled posting routine into `platform_enterprise_fee`, with accrual and compensation journal kinds.
- **Statements:** statement revisions, disputes, and finance approval through Decision and action authorisation.
- **Invoicing hook:** a simulated platform-invoice hook.
- **Screens and gates:** a drill-down statement screen and gate checks.

**Done when:**
- An authorized post-export duplicate-reconciliation command (`ReconcileExportedDuplicate`) preserves issued artifacts and origin history, records the group lineage, produces the required billing corrections and compensates fees through linked postings; a duplicate discovered after both lines were billed and paid ends with net fee entitlement counting the work once.
- **Fixtures:** ENT-F1 to ENT-F12 are reproduced through commands on PostgreSQL.
- **Excluded amounts contribute zero:**
  - office, client-instructed, order-line, withdrawn, rejected, duplicate, unexported and unpaid amounts, each created through its real command;
  - the runtime role cannot insert contributions or journals.
- **Posting:**
  - concurrent or replayed derivations post once;
  - a credit after approval becomes a compensation on the next statement;
  - approved statements and journals are never updated.
- **Statement approval:**
  - controlled accrual is refused before exact statement approval and for non-finance, mismatched hash/total/agreement version, changed input facts, disputed lines, or expired/revoked authority. These refusals are tested through commands and direct runtime SQL;
  - a dispute creates a new revision.
- **Traceability:** every line drills down to origin, steps, export line, invoice, payment and allocation rule.
- **Gates:**
  - `pilot_no_charge` refuses accrual and collection even with approved decision records and otherwise valid statement authority. Production refuses them until the applicable gate and exact policy versions are approved; tests use isolated fixtures and mark no repository decision approved;
  - the production worker refuses synthetic references.
- **Small-builder isolation:** small-builder fee tables and tests are unchanged.

### ENT-8a Deterministic live prompts
**Track:** contractor
**Depends on:** ENT-5
**Build:**
- The 9.1.10 rules (a)–(d).
- `materials-issue.v1` import.
- `extra_prompt`.
- A "Possible extras" inbox lane.
- `ConfirmPrompt` and `DismissPrompt`.
- The end-of-job check.
- The office-entry advisory signal.

**Done when:**
- **Rules:** each rule fires on its fixture. Near-misses stay silent: on-order items, synonyms of ordered items, missing standard minutes.
- **Citations:** citations to missing evidence or to another job's evidence are refused.
- **Confirmation:**
  - confirming creates exactly one `jobguard_surfaced_confirmed` extra, for permitted roles only;
  - a prompt matching an existing extra coalesces.
- **Visibility:** prompts are visible when created, and no shadow table is touched.
- **Office entries:** an office entry matching a prompt contributes no fee.
- **Evaluation:** `pnpm eval` reports false prompts and missed extras separately on a held-out synthetic set.

### ENT-8b AI prompts and SoR suggestions
**Track:** contractor
**Depends on:** ENT-8a
**Build:**
- `packages/ai` detection of extras from notes, transcripts and photo captions.
- Cited structured output, with at most one repair attempt.
- Labelled SoR suggestions for free-text extras.
- A golden set.

**Done when:**
- **Schema limits:** the schema cannot express origin, price, approval or fee status.
- **Citations and injection:** citations are validated against stored inputs, and embedded instructions have no effect.
- **Golden set:** reports omission, unsupported additions, citation validity and ambiguity, with recall and false-prompt precision given separately.
- **Before real use:**
  - a live-model run is required;
  - the gate refuses real data until D04 and the DPA allow it.
- **Suggestions:** a suggestion never becomes a price without human confirmation.

### ENT-9 Enterprise dashboards and pilot baseline
**Track:** contractor
**Depends on:** ENT-7
**Build:**
- **Read models:** extras captured, approved, billed and paid, by region, team, operative, client, contract and period, plus approval backlog, time-limit performance and close-out rates.
- **Baseline:**
  - a `baseline-history.v1` import covering 6–12 months;
  - a versioned method — extras per 100 jobs and value per job, pilot teams against the rest.
- **Advisory signals:**
  - billed variations with no JobGuard extra;
  - order lines that match unlinked extras;
  - `already_on_order` withdrawals followed by quantity increases;
  - "no" close-out outliers.

**Done when:**
- **Drill-down:** every figure drills down to jobs and extras, and totals equal their drill-down sums.
- **Scope:** scope is enforced; operative-level figures are visible only to roles covering that operative.
- **Reproducibility:** the same input hash and method version give the same output, and the method text appears in every export.
- **Signals are advisory only:** architecture and privilege tests prove signals cannot change a price, count, state, fee or statement.

### ENT-10 Enterprise identity and security
**Track:** contractor
**Depends on:** ENT-1
**Build:** may ship as three sub-PRs (AGENTS §1):
- **SSO:** SAML 2.0 and OIDC behind `AuthProvider`, with verified domains, group-to-grant mapping, just-in-time provisioning, optional SCIM 2.0, a bounded session lifetime and break-glass administration.
- **Audit export:** signed, tenant-scoped, with an independent verifier.
- **Assurance pack:** the assurance programme and questionnaire pack (penetration-test scope, Cyber Essentials Plus, an ISO 27001 roadmap).

**Done when:**
- **Assertion attacks refused against a test identity provider:**
  - replayed assertions;
  - wrong audience or issuer;
  - altered, unsigned or expired assertions;
  - IdP-initiated sign-in to the wrong tenant.
- **Account linking:**
  - unverified domains cannot link;
  - email-code accounts are never linked silently.
- **Role mapping:** `finance` and `commercial_manager` are granted only when explicitly mapped, and mapping changes are audited.
- **Deprovisioning:**
  - a SCIM deactivation refuses the user's next request;
  - without SCIM, access ends at next sign-in and within the session limit.
- **Regression:** the existing permission conformance suite passes unchanged, and every M5-7 Done-when assertion (§11) passes as part of this card.
- **Audit export:**
  - the verifier detects altered or missing entries;
  - each export covers one tenant only;
  - exports are themselves audited.
- **Pack honesty:** the pack claims only achieved controls, labels pending ones as pending, and is checked in the verdict.

### ENT-11a First enterprise demo
**Track:** contractor
**Depends on:** ENT-5
**Build:**
- A generated fictional contractor, "Northside Property Services": 3 clients, 40 operatives and 2,000 work orders a month, seeded through commands.
- The journey:
  1. an operative logs an extra with a photo and resident confirmation;
  2. a supervisor approves it;
  3. the client approves it.

**Done when:**
- **Journey:** the journey passes in Playwright on a real database, with the operative in `mobile-360` and the supervisor and client in `desktop`, and survives a reload.
- **Data:** every number comes from seeded facts.
- **Isolation:**
  - there are no outbound attempts;
  - the sandbox label appears everywhere;
  - a reset starts a new run and keeps the audits.

### ENT-11b Full enterprise demo and enterprise sales bible
**Track:** contractor
**Depends on:** ENT-11a, ENT-7, ENT-9
**Build:**
- The journey extended through export, billed, part-paid and paid to the statement and dashboard.
- A sample baseline.
- An enterprise edition of the sales bible in `sales/`.

**Done when:**
- **Timing:** a timed Playwright run and a recorded human rehearsal each finish in under ten minutes on a phone and a laptop.
- **Traceability:** every on-screen figure has a drill-down test.
- **Sales bible claims:**
  - every claim cites a merged feature, test or decision record;
  - proposed terms (10%, no platform charge) are labelled proposed;
  - no unachieved certification is claimed.

### ENT-12 Native offline operative app
**Track:** contractor
**Depends on:** ENT-3, M3-5
**Build:** the operative screens on the shared native foundation (M3-2 to M3-5); M3-7 then runs the device suite and G3 for this app:
- assigned jobs, visits and the close-out question;
- "Log an extra", photos and resident confirmation;
- an encrypted store;
- download rules limited to assigned jobs;
- an offline queue through the existing dispatcher.

**Done when:**
- **G3:** ENT-12 implementation acceptance covers its native build, command, encryption, capture and authorization tests. After ENT-12 merges, M3-7 owns the complete physical-device journey and G3 evidence. Real-data native distribution remains disabled until that suite passes; the operative feature’s release acceptance includes both tasks.
- **Origin:**
  - offline extras keep the raising user and client capture time as labelled metadata;
  - the server writes the origin at upload;
  - a backdated device clock changes neither ordering nor agreement binding.
- **Sync conflicts:**
  - replaying after a reinstall yields one extra;
  - revocation or reassignment while offline refuses the upload with an explanation, and no origin is written.
- **Download rules:** tested independently of RLS, they never sync other operatives' jobs or their resident contacts.

### ENT-13a File and webhook connectors
**Track:** contractor
**Depends on:** ENT-2, ENT-6, ENT-8a
**Build:**
- A scoped connector capability contract.
- SFTP pull and push, with a fake server in CI.
- Signed webhooks (HMAC, timestamp, replay window) and API push.
- Coverage for work orders, billing status, export delivery and materials issues.
- A connector principal limited to import and export.
- Data-flow register entries.

**Done when:**
- **Input robustness:** contract tests cover malformed, duplicate, reordered, replayed and oversized input, bad signatures and clock skew.
- **Principal limits:** the connector principal cannot approve, price, write an origin (the database refuses its command types) or read statements.
- **Credentials:** held in secret storage, rotatable, and never logged.
- **Outcomes and endpoints:**
  - unknown outcomes are reconciled;
  - real endpoints stay disabled until G5.

### ENT-13b Named contractor systems
**Track:** contractor
**Depends on:** ENT-13a
**Build:** one adapter per named job-management or finance system a pilot contractor needs, each as its own sub-task ENT-13b.n on the ENT-13a contract.

**Done when:**
- **Conformance:** sandbox or partner conformance tests pass.
- **Approval:** data-flow approval and G5 evidence are recorded.
- **Gaps:** unavailable capabilities are recorded, not invented.
- **Limits:** no adapter can write an origin, approval or fee.

### ENT-14 Pilot agreement and enterprise gate
**Track:** contractor
**Depends on:** ENT-9, ENT-10 (plus the D12 and D16 records; only the founder approves them)
**Build:**
- **Pilot terms:** duration, the ENT-9 baseline method, and no JobGuard pilot fee; any later paid production agreement is separate.
- **Contract set:** the master services agreement, DPA, sub-processor list, DPIA, the ENT-10 security pack, and a pilot runbook.
- **Gate:** the `enterprise_real_data` gate.

**Done when:**
- **Legal review:** a solicitor has reviewed the contract set. Contractor fee collection additionally requires a human-approved agreement/mandate record bound to exact terms and agreement version. Tests cover changed rates or scope requiring the approved notice/reauthorization process, revocation/cancellation, provider-side cancellation, in-flight and unknown outcomes, retries, refunds and pilot exemption. Workers cannot invent agreement changes or authority.
- **Approval:** Ben's dated approval of the pilot terms is recorded in the decision records; no agent marks a record approved.
- **Gate:**
  - real-data contractor features refuse in `pilot_no_charge` and `production_billing` until that evidence exists;
  - this extends `requireApprovedDecision`, which today enforces only in `production_billing`.

### 9.3 Data model additions

All tables are tenant-owned and follow the same rules:

- non-null `tenant_id`, with tenant- and job-qualified foreign keys;
- `ENABLE` and `FORCE` row-level security;
- owned by `jobguard_migration`;
- the runtime role gets SELECT and INSERT unless a column grant is named.

| Family | Entities and distinctions |
|---|---|
| Track | `commercial_track_assignment`: append-only, operations-only, with an agreement reference and effective period |
| Organisation | `org_unit`, `team`, `team_membership`, `role_grant` (role, scope kind and ID, revoked_at), and the `client_approver` binding |
| Clients and contracts | `client_organisation`, `client_contract`, immutable `client_contract_version` (adjustment ratio, VAT code, alert age), immutable `approval_rule_version` (JSON plus hash) |
| Schedules of rates | `schedule_of_rates`, immutable `sor_version` and `sor_item` |
| Work orders | `work_order` (unique by client contract and reference); immutable `work_order_revision` and `work_order_line` (scope_item_id); `import_batch`, `import_row_receipt`; `job.provenance = 'work_order'`; `job_assignment`, `site_visit`, immutable `closeout_answer` |
| Extras | Reused `variation` and `variation_revision` (plus SoR item, pricing basis, excess link); contractor values in `variation.origin` (shared column, track CHECK); immutable `extra_origin` (command-receipt FK, provenance); append-only `extra_event`; `extra_duplicate_link`; `extra_order_line_link`; resident confirmation as a typed evidence object |
| Approvals | Immutable `approval_requirement` and `approval_step`; `client_approval_link` (token hash, membership, revision, expiry); `approval_escalation`; evidence-pack subject `extra` |
| Billing | Immutable `billing_export_batch`; `billing_export_line` (unique per extra revision); `billing_status_import`; immutable `billing_fact` (unique per source event); `billing_line_match`; `billing_quarantine`; `contractor_receipt_line_allocation`, owned by ENT-6 and importing SH-1’s pure rules |
| Enterprise fee | Immutable `enterprise_agreement_version`; `enterprise_fee_contribution`; `enterprise_fee_derivation` (unique identity; Q as a rational, F, J, delta); `platform_enterprise_fee` book with accrual and compensation kinds; immutable statement revisions and lines; `statement_dispute` |
| Prompts | `extra_prompt` (provenance, citations, coalescing key), immutable `prompt_resolution`, `materials_issue_fact` |
| Identity | `sso_connection`, `verified_domain`, `idp_group_role_mapping`, `scim_event`, break-glass records (identity and control-plane schemas) |
| Analytics | `baseline_dataset`, `baseline_run` (method version, input hash), advisory `integrity_signal` with no write path to prices, states or fees |

### 9.4 Adversarial acceptance rows (Appendix A)

| Risk | Required behaviour | Tasks |
|---|---|---|
| Office command, connector, import or AI output writes or changes a site origin | PostgreSQL refuses; origin hash unchanged | ENT-4b, ENT-8b, ENT-13a |
| Operative reads another team's, branch's or tenant's job by ID | Same not-found as a non-existent ID | ENT-1, ENT-3 |
| Client approver acts on another client's extra or replays a decision | Refused; no step fact | ENT-5 |
| Stale-revision approval; approve racing withdraw; two approvers on one step | Typed conflict or one effect | ENT-5 |
| Self-approval; one person fills two steps | Refused | ENT-5 |
| Unapproved or duplicate extra exported; two batches race | Refused; one export line per revision | ENT-6 |
| Status file imported twice; one payment arrives by file and by API | One allocation, or held as ambiguous | ENT-6, ENT-13a |
| Payment facts lack complete invoice composition, or claim an extra without a valid export match | Quarantined; no extra or fee contribution. Identified original-order and other non-extra lines are retained without an export match, remain in the allocation denominator and contribute zero fee | ENT-6 |
| Invoiced above the approved net | Fee base capped at the approved net | ENT-4a, ENT-7 |
| Split receipts, blended invoice, half-penny ties | Cumulative exact rational, rounded once | ENT-4a, ENT-7 |
| Credit or reversal after statement approval | Linked compensation on the next statement | ENT-7 |
| Mid-month rate change | Bound to the version at the effective origin | ENT-4a, ENT-7 |
| One extra logged twice; canonical chosen to avoid the fee | One line; effective origin fixed by rule | ENT-4a, ENT-4b |
| Client formally instructs a logged extra later | Stays site-originated; billed once | ENT-2, ENT-4b |
| Tenant leaves the small-builder track | Earlier extras stay fee-free | ENT-1, ENT-4b |
| Backdated device clock; replay after reinstall | Server time governs; one extra | ENT-12 |
| Close-out question bypassed via the API | Visit completion refused | ENT-3 |
| Prompt dismissed, then the same work entered by the office | Advisory signal only | ENT-8a, ENT-9 |
| Integrity signal changes a count, state or fee | Architecture and privilege tests fail | ENT-9 |
| SSO assertion replay; user deprovisioned | Refused | ENT-10 |
| Fee posted while D16 is proposed; synthetic reference in production | Refused | ENT-7, ENT-14 |

### 9.5 Mapping from rev 2.5

| Rev 2.5 | Rev 3.0 |
|---|---|
| §16.1–16.5, §16.10, AGENTS §5.16 | 9.1 |
| §16.6, §16.9 | Build lines and the 9.2 dependency table |
| ENT-1, ENT-2, ENT-6, ENT-7, ENT-10, ENT-12, ENT-14 | Same IDs |
| ENT-3 | ENT-3; now depends on ENT-4b, which it needs in order to write the origin |
| ENT-4a | ENT-4a; also holds the shared exact allocation from SV-1 |
| ENT-4b | ENT-4b; kind in the shared `variation.origin` column, provenance in the immutable `extra_origin` table |
| ENT-5 | ENT-5; depends on ENT-3 and M4-3-S-R |
| ENT-8 | ENT-8a (deterministic) and ENT-8b (AI) |
| ENT-9 | ENT-9; also holds the §16.5 advisory analytics |
| ENT-11 | ENT-11a (first demo) and ENT-11b (full demo and sales bible) |
| ENT-13 | ENT-13a (file and webhook) and ENT-13b (named systems) |
| M5-7 (whole), M5-9 and M5-12 (contractor scope first) | ENT-10 carries full M5-7 acceptance and early audit-export/security-pack subsets only. M5-9 long-term verification/key rotation and M5-12 independent assurance remain outstanding under their cards. |
| M3 scoped for operatives (rev 2.5 ENT-12 text) | ENT-12 = operative screens on shared M3-2 to M3-5; G3 via M3-7 |
| M5-4 connector contract (contractor systems) | ENT-13a |
| MON-10 | Dropped: the Contractor plan is withdrawn; each company on this track is its own tenant (ENT-1) |

---

## 10. Small-builder track

The small-builder track serves owner-run firms with up to seven jobs on the go. It is built in parallel with the contractor track, on the same job spine, money primitives, tenancy, audit, command and outbox foundations. It implements AGENTS §5.6, §5.10, §5.14 and §5.15.

Its terms are proposed decision records, none approved:

- D01 v3: `reference_fee_policy_v3`.
- D03 v3: `reference_recovery_eligibility_policy_v3`.
- D05: the monthly maximum and fee-collection authority.
- D09 v4: `subscription_pricing_policy_v4`, the plans and metering.
- D11 v3: integrity signals.
- D12: third-party data and shadow transparency.
- D13: shadow attribution and delayed disclosure, small-builder rules.

Until the relevant record is approved, the production capability is disabled server-side:

| Capability | Needs |
|---|---|
| Paid subscriptions and metering execution | D09, D05, D02, G4-S |
| Shadow processing of real data | G1, D12, D13 |
| Success-fee posting and collection | G4-S, D01, D02, D03, D13 |

Every card in 10.4 can be built and accepted with synthetic data unless it is marked otherwise.

**The v1 contract is historic.** It set a £79 per-job base, a 1.5% cap and a plan credit (`reference_fee_policy_v1`). Its tables (`cap_snapshot`, `synthetic_obligation`, `simulated_settlement_event`, `recovery_fee_derivation`, `recovery_fee_journal`), routines and tests stay, so existing synthetic data still renders and merged tests still pass. No new job writes to them. No default screen mentions £79, a cap or a plan credit.

### 10.1 Commercial rules

#### 10.1.1 Who is on this track

The track belongs to the company (tenant), never to a person or user (9.1.1).

- A company that runs up to seven jobs at once is on the small-builder deal.
- A company that starts above seven jobs at once, or wants operatives logging extras, starts on the contractor deal.
- A small-builder account that runs more than seven jobs at once in any two of three consecutive monthly billing periods (measured by the approved D09 rule) is moved to the contractor deal (10.1.9). Shorter peaks are billed as extra jobs.

#### 10.1.2 Two charges that never offset

1. **Subscription.** A capacity charge on the tenant, priced by jobs on the go. It is never attached to a job's value, a quote, an acceptance or a finding.
2. **Success fee.** 10% of qualifying recovered net principal (10.3). This covers:
   - Final Check catches the builder confirms, bills and is paid for;
   - supplier cash refunds and consumed credit notes;
   - withheld-payment cases the builder opened and agreed terms for.

Neither charge credits, offsets, refunds or reduces the other.

- **Quoting** is free forever. Creating, editing, sending or accepting a quote never creates a platform obligation.
- **Users** are unlimited on every plan.
- **Builder capture** is always fee-free. That means **Log an extra** in any state, and any line added at final review.
- **`pilot_no_charge`** runs the meter, the shadow bill and the fee arithmetic with hypothetical, labelled figures only. A pilot job is never billed retrospectively.

#### 10.1.3 Plans

| Plan | Monthly | Annual | Places included | Each extra place | Extras cap | Monthly maximum |
|---|---:|---:|---:|---|---:|---:|
| Solo | £29 | £290 | 4 | £20 a month, by the day | 1 | £49 |
| Builder | £69 | £690 | 7 | £20 a month, by the day | 5 | £169 |

Prices are principal, ex VAT; VAT follows D02. The monthly maximum is the most the subscription may take in a billing period without a new decision by the builder (D05).

Steady monthly price by counted places: 1–4 £29 (Solo); 5 £49 (Solo plus one extra); 6–7 £69 (Builder); then £20 more for each place up to 12 places at £169.

#### 10.1.4 Extra places, the grace place and billing by the day

**Period charge.**

```text
Billing period P: monthly from the subscription anchor; Europe/London calendar days; D = days in P.
plan(d)      = plan in effect at the end of day d   (trial days: price 0, no extras)
included(d)  = 4 | 7            cap(d) = 1 | 5
extra(d)     = min(max(0, places(d) − included(d)), cap(d))
period_pence = roundHalfEven( Σ_d [ monthly_price_pence(plan(d)) + extra(d) × 2,000 ] / D )
Lines (plan; each extra job with its days) are allocated from period_pence by largest remainder.
Invariant: period_pence ≤ max_d monthly_maximum(plan(d)); an excess is never billed and raises an alert.
```

On an annual plan, `monthly_price_pence` is zero in each period because the plan was prepaid. Extras are billed monthly and never discounted.

**Cap check.** *Committed places* are the places the tenant would have if every live, unlocked, unstopped and unclosed job were counting, under the small-job rule and the same-customer-and-site rule.

- Committed places are checked at every place-adding command:
  - switch-live;
  - resuming site work on a job that stopped counting before lock, whether explicitly or implicitly through site activity;
  - reopening a closed job;
  - importing a job at the live stage.
- **Grace place.** When a command would take committed places past `included + cap`, one further place is accepted, is never billed, and raises the upgrade Decision.
- **Beyond the grace place.** On Solo, anything beyond the grace place waits for the one-tap move to Builder (the builder approves it on the spot). On Builder nothing is ever blocked: further jobs go live, the monthly maximum still holds, and the account raises `track_review_due` immediately (10.1.9).
- **Events that are not commands.** The day-31 start, first site evidence and the £4,000 trip are never refused. Anything they add beyond the cap is absorbed within the monthly maximum.
- **Upgrade prompt.** A Solo account within one place of its cap for two consecutive periods is prompted to move to Builder.

**What the builder sees.** The job list always shows the count and the next place's price, for example "5 of 7 jobs on the go; next job included". The bill is one flat line unless extras arose; then it lists each extra job and its days.

#### 10.1.5 Counting jobs on the go

This is the pricing-page sentence. MON-1 replay fixtures must prove the code does what it says.

> "We count the jobs you've got on the go, not jobs you've ever created. A job starts counting when work starts on site, or 30 days after you switch it live, whichever comes first. It stops when you complete the final account, a week after you mark it finished on site, or once it has gone quiet for a month. Small jobs (under £2,000 when accepted) don't take a place, up to your plan's number of them at once; if a small job grows past £4,000 before you complete the account, it takes a place from then. Your first job is free."

| Rule | Definition |
|---|---|
| Job identity | One paying customer, one site and one accepted quote, using the structured fields from CH-3a. Two customers never share a job. A quote covering several addresses becomes linked jobs, one per site, unless the builder attests it is one site. |
| Start | The earlier of two moments. The first is the server time of the first site-evidence event: a proof or progress photo, a delivery note or goods receipt, or an on-site diary entry. The second is 00:00 Europe/London on day 31, counting the switch-live day as day 1. Purchase orders, supplier invoices, quotes, messages and readiness facts never start counting. |
| Site activity | A site-evidence event, a Log an extra entry, or a stage marked in progress or complete. |
| Stop | The earliest of: the lock; 7 days after "Finished on site"; 30 days after the last site activity; or closing the job with a recorded reason. Site activity cancels a "Finished on site" marker. No Final Check runs on a closed job. |
| Restart | Site activity on a job that stopped counting before lock restarts counting from that event. It is a place-adding command. A locked job never restarts. |
| After lock | These never count: confirming catches, invoicing, payments, credit notes, retention release and snagging photos. New site work on a locked job (an order, a supplier invoice, a progress photo or an extra) is refused on that job. It is offered as a new linked job for the same customer and site, on the ordinary path. |
| Days | A job counts on each calendar day that any part of its counting interval touches. |
| Same customer and site | Jobs counting on the same day for the same customer and site form one place. The place is small only if every job in it is small. |
| Imports | Imports use the same start rule. An import matching an existing customer and site with an overlapping job is linked, not counted as a new place. An import at the invoiced stage never counts. |
| Inputs | Only the builder's own commands and server timestamps. No shadow signal, detector output, finding, eligibility result, recovery or document count can change a count, a plan, a bill or any builder view before lock. |
| Late facts | Counts are rebuilt from immutable events when a period closes. A fact processed after its period has closed posts a correction line in the next period; an issued period is never edited. A cached counter never triggers a charge. |

#### 10.1.6 Small jobs

A job is small when `max(accepted net, highest net of any quote revision sent for the job) < £2,000.00`. This is tested once, at switch-live, and recorded immutably. On each day, `free small places = min(small places counting, included(plan(d)))`.

**The £4,000 trip.** The first time the pre-lock draft final-account net exceeds £4,000.00, an immutable trip event makes the job non-small from that day. The draft net is the baseline plus approved variations, including final-review lines. Later omissions do not reverse the trip. The trip is shown only on the job list and the bill, never on Log an extra, pricing or approval screens.

#### 10.1.7 Free first job

- **One trial per business.** The business is identified by its Companies House number where one exists, otherwise by a normalised phone number plus the card's provider fingerprint. No tax identifier is collected for this, and JobGuard never sees the card number.
- **While it runs.** No subscription is charged while the trial job is the only live job. The Final Check and the success fee run normally on it.
- **When it ends.** The trial ends at the earliest of:
  - the trial job's lock;
  - the trial job's close;
  - 90 days after it switched live;
  - a second job going live. The subscription then starts that day, pro-rated.
- **Card.** A card is asked for at the first switch-live, with "Skip for now". A card must be on file before a second job goes live.

#### 10.1.8 Annual plans, upgrades and downgrades

- **Annual plans.** An annual plan costs ten times the monthly plan price. It is offered, never pre-selected, and stays behind a flag until six months of monthly-plan data exist.
- **Upgrades.** Upgrades are immediate and pro-rated by day. On an annual plan the £400 difference is charged pro rata for the rest of the plan year, rounded once.
- **Downgrades.** Downgrades take effect at the next billing date, and only if committed places then fit the smaller plan plus its extras cap.
- **Data is kept.** No plan change, trial end, lapsed payment or track change deletes or hides data or exports.

#### 10.1.9 Moving to the contractor deal

- **Trigger.** `busy_days(M)` is the number of days in billing period M on which `places(d)` is above 7. When `busy_days` is at least 10 in two of the last three billing periods (a proposed D09 v4 parameter; the founder accepted it as proposed on 30 September 2026, pending formal approval evidence), or immediately when a Builder account passes its grace place, the meter raises `track_review_due` (9.1.1). This creates a mandatory Decision telling the owner, and an operations card for the founder.
- **The move.** The operations routine writes the contractor track against a signed contractor agreement and data processing agreement. The move takes effect from the start of the next billing period after the notice period set by D09 v4. The meter never moves an account itself.
- **Until the agreement is signed.** The account stays on Builder, is charged no more than £169 a period, and the notice stays open.
- **Jobs already live.** Track and fee policy are recorded on each job at switch-live. Jobs already live at the move keep their original small-builder terms throughout their remaining lifecycle, including Final Check, later invoices, settlement, fee derivation, reversals and refunds. Lock or close never changes those terms. Held signals stay held, and the move is not a disclosure.
- **Onboarding.** Onboarding asks how many jobs are usually on the go, and whether site staff should log extras. More than seven, or yes, routes the company to the contractor deal.

#### 10.1.10 Money never taken, and parked items

AGENTS §5.15 applies in full. This track never builds money from merchants, suppliers, lenders, lead platforms or the builder's customers; a change to the 10% rate or any automatic minimum or band; a paid "show me what you found" disclosure; fees measured on VAT, CIS or bad-debt relief; fees or features that depend on which merchant is used; or a fee to open a recovery case. Parked for pilot data, and not built: "Tell me now", weighted places for big jobs, and a £0 month when nothing counts. D14 and D15 are outside this section.

#### 10.1.11 Gaming vectors and mitigations

| What a builder might try | What stops it | Accepted residual |
|---|---|---|
| Keep jobs off JobGuard | The small-job allowance, the £20 extra place, the free first job, and the watchdog running only on live jobs (CH-2) | Lost catches on those jobs; "won, never live" is an advisory signal |
| Merge customers into one job | One paying customer per job, one final account and one final invoice | None |
| Split a job into quotes under £2,000 | The allowance limited to included places, "greater of quoted and accepted", the trip, and one place per customer and site | Quotes within 90 days are an advisory signal |
| Pause weekly | The 7-day tail; a restart is a cap-checked command | None material |
| Lock early and keep working | Post-lock work goes to a linked job; the final invoice needs the lock; every scope item needs a disposition | A builder who misstates completion forfeits the Final Check on the rest |
| Never lock and invoice elsewhere | A month of quiet stops counting | The fee-side residual in 10.2.9 |
| Exceed the cap by resuming, reopening or importing | The cap and grace check on every place-adding command | None |
| Several accounts instead of the contractor deal | The track is per company, with a company number per account; shared users, phones and cards are flagged | Low; reviewed by a person |
| Import old work for free Final Checks | Pre-adoption evidence is permanently fee-free | None |
| Under-log extras on a small job nearing £4,000 | The trip is invisible where extras are logged or approved | The pilot compares logging rates on these jobs; D09 changes the trip if needed |
| A wrong cached count (JobGuard's own error) | Recompute from events, and correct only in a later period | None; this is a build requirement |

#### 10.1.12 Parameters D09 v4 must confirm

These are versioned parameters of `subscription_pricing_policy_v4`, not code constants:

- calendar-day granularity;
- which events count as site activity;
- the 30-day quiet period, which is counted while it runs;
- "quoted" meaning the highest net of any sent revision;
- the trip never being reversed;
- Solo's grace place and refusal beyond it; Builder remains unblocked, its monthly maximum holds, and crossing its grace place raises `track_review_due`;
- the move trigger counting busy days (at least 10 days above 7 places), not a single peak day;
- the track-review notice period;
- the trial ending when the trial job is closed.

### 10.2 Shadow bill and Final Check contract

#### 10.2.1 Capture and evidence

**Builder capture, always fee-free:**

- every **Log an extra** record, typed or voice, in any state: draft, priced, approved, rejected or withdrawn;
- every line added at final review before lock;
- the accepted baseline scope.

**Evidence, which may support a success fee:** everything else JobGuard holds for the job — diary and voice notes not submitted through Log an extra, proof and progress photos, supplier invoices, delivery notes and credits, purchase orders, customer messages and approvals received through JobGuard, imported documents and, later, approved connectors.

The rules:

- **AI structuring.** When AI structures the builder's own Log an extra entry, it is still capture.
- **No deletion.** Log an extra records cannot be deleted, only withdrawn. A withdrawn record still counts as capture.
- **Standing notice.** Evidence surfaces show only this notice: *"Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it."* No per-note prompt, badge or suggestion.
- **Builder-favourable tie-break.** A pre-lock capture that plausibly describes the same work as a signal settles it as `builder_captured`. That means the same scope area, an overlapping description, and a compatible date and value.
- **Imports.** Evidence dated before an imported job was adopted is permanently fee-free.

#### 10.2.2 Shadow signals

A `shadow_commercial_signal` is only a *possible* unrecorded commercial change. It is never an invoice line, variation, debt, journal, fee or proof that money is owed.

- **Fields:** tenant, job, `signal_type`, `detector_kind (deterministic|ai_proposal)`, `detector_version`, server `created_at`, `evidence_cutoff_at`, description, a nullable labelled `estimated_value_pence`, `confidence_band`, `must_surface_now`, monotonic `disclosed_before_lock`, `first_builder_visible_at`, match references (scope item, variation, final-account line), and `coalesced_into_signal_id`.
- **Evidence links:** immutable rows of `(tenant_id, job_id, signal_id, evidence_id, object_version_id, sha256, source_received_at)`.
- **Ineligibility reasons, append-only:** `disclosed_before_lock`, `surfaced_early`, `evidence_after_lock`, `pre_adoption_evidence`, `attribution_disputed`.

```text
candidate → held_for_final_check
held_for_final_check → reconciled(outcome) | revealed           (final check, after lock)
revealed → dismissed(reason) | confirmed_extra | attribution_disputed
attribution_disputed → dismissed(reason) | confirmed_extra       (human review; unresolved = fee-free)
confirmed_extra → recovery_case_created
any pre-lock state → surfaced_early                              (terminal for attribution)
created after lock → revealed with evidence_after_lock
```

- **Reconciled outcomes:** `already_in_original_scope`, `builder_captured`, `already_on_final_account`, `duplicate_signal`, `not_enough_evidence`.
- **Dismissal reasons:** `already_included(line)`, `in_original_scope(item)`, `not_completed`, `not_chargeable`, `wrong_job_or_evidence`.

No transition leads to fee liability.

#### 10.2.3 Structural isolation

- **Ownership and grants.** Shadow tables are owned by `jobguard_migration` and granted only to the `jobguard_shadow` worker role. The builder runtime role has no grant. A reveal goes through one controlled routine, which returns `revealed` rows only for a locked job.
- **Detection path.** Detection runs in the shadow worker, never in a builder request.
- **No variation before lock.** Before lock, none of these may vary with whether signals exist: a builder route, notification, export, count, badge, error code, cache key, analytics event, timing path or response shape. The lock and Final Check flow runs the same steps, and shows "Running JobGuard's final check", whether there are zero signals or many.
- **Support access.** Support access needs a separate, audited break-glass permission. It is never used to tell a builder about a candidate before lock.
- **Disclosure terms first.** Processing runs only for tenants whose accepted onboarding terms disclose the Final Check and the success fee.

#### 10.2.4 Disclosure before lock

**Any disclosure before lock, by any route, sets `disclosed_before_lock = true` for good, and the signal can never earn a fee.** JobGuard absorbs that cost.

- **Current routes:** a must-surface override, a support conversation, an export, a data-subject access response, or a defect.
- **Future routes,** fee-free from the moment the signal is created: "Tell me now", a trial job shown live, a paid human or drawing review, or an upgrade bridge.
- **One routine.** Every route records a `shadow_disclosure_event` through a single routine.
- **Never suppressed.** A must-surface signal is never held back to protect a fee.

#### 10.2.5 Must-surface rules

A deterministic, versioned D13 rule shows a signal at once as a mandatory Decision, and the signal becomes permanently fee-ineligible. The rules:

1. It has a safety implication.
2. The customer clearly asks for significant work that needs written agreement before it proceeds. The value threshold is set by D13 and is still open.
3. There is an active dispute that silence would make materially worse.
4. There is a legal or contractual duty to tell.

- **Not suppressible.** No model score or cost estimate can suppress a rule. Each firing is audited with its rule version.
- **Supplier lines.** A supplier or order line outside the quote and captures is evidence, not a must-surface item, unless a rule fires.
- **Evidence packs.** Ordering an evidence pack before lock runs these checks.

#### 10.2.6 Final-account lock

1. **Build.** The account shows the accepted contract, every captured variation, and recorded credits and receipts. It shows no shadow content.
2. **Review.** The builder sees: *"Anything else to add before you finish this job?"* They can add extras (`final_review` origin), correct data, inspect their own evidence, or leave and return. Every baseline scope item needs a disposition: done, removed or deferred.
3. **Declare.** The button is **Complete final account**, with the text *"I've reviewed the work and extras on this job and this is my complete final account."*

**What the lock binds.** On confirmation, one transaction creates an immutable `final_account_lock` binding the tenant and job, the `final_account_revision_id`, the `baseline_quote_version_id`, a capture-register hash (every Log an extra in every state and every final-review line), the line-set hash, the scope-disposition hash, the declaration and onboarding-terms versions, and the locking membership, server time, command ID and audit event. There is one lock per job. Later revisions (confirmed catches, corrections) link to it and never alter it.

**Invoicing after lock.**

- Final and supplementary customer invoices require the immutable lock and a completed reconciliation run bound to that lock and its pre-lock evidence cutoff. The run must be completed and its result made available before invoice issue. Pending or failed reconciliation blocks issue with a typed error. Invoices derive from the locked revision or a later revision linked to it; deposit and interim invoices remain unaffected.
- If the main final invoice is already issued, confirmed catches go on a supplementary invoice that carries only the lines added since.
- Deposit and interim invoices need no lock.

**A builder who never locks** gets no Final Check and no catches, and pays no success fee on that job. Invoice or payment activity without a lock is an advisory signal, never a penalty.

#### 10.2.7 Final check: reconcile, reveal, dispose

**The check.** After lock, a worker compares every held signal with the locked baseline, the locked capture register, the locked lines, earlier dispositions and the other signals. Only evidence received before the lock counts. Each signal gets one outcome, and only unreconciled signals are revealed.

**The reveal.** For each item, the reveal shows the description and each evidence item with its date and source. It also shows the proof that the item is missing, for example: "Accepted quote: no outside tap. Your extras: none. Your completed final account: no outside tap."

**The builder's choices:**

- **Yes — this was extra work.** This creates a variation with `jobguard_catch` origin and `source_signal_id`. It then follows the ordinary path: priced, approved, customer approval, and a new final-account revision.
- **Already included.** The builder must pick the exact locked line or baseline item. An unmatched claim cannot rewrite the lock; it becomes `attribution_disputed`, for human review.
- **Included in original scope.** The builder must pick the baseline item.
- **Not completed**, **Not chargeable**, **Wrong job or wrong evidence.** The item is dismissed and the reason is recorded.

Nothing is charged automatically. A check that finds nothing is a normal outcome: "JobGuard's final check found nothing missing from your bill."

#### 10.2.8 Attribution predicate

A `missed_variation_final_account` recovery qualifies only if every one of these holds. Each conjunct is recorded, with its source, in an immutable `recovery_attribution_revision`.

```text
evidence_received_before_lock
AND NOT disclosed_before_lock
AND absent_from_accepted_scope
AND absent_from_builder_captures_at_lock      (any state, builder-favourable matching)
AND absent_from_locked_final_account
AND revealed_after_lock
AND builder_confirmed_genuine_extra_and_completed
AND billed_through_a_final_account_revision_and_invoice
AND customer_payment_settled_and_allocated_to_that_line   (10.3.2)
AND qualifying_allocated_principal_remains_after_item_specific_reversals_refunds_and_credits
```

Evidence first received after lock can inform the builder but never qualifies. The test for every design choice: can immutable records prove that the builder completed their own final bill without this item before JobGuard showed it to them? If not, there is no fee.

#### 10.2.9 Anti-gaming and residual risk

**Structural controls:** immutable lock and evidence receive times; variations are withdrawn, never deleted, and still count as capture; one recovery per coalesced work item, with a unique `(job, coalesced signal)` identity; nothing in the locked account or baseline can be caught; AI confidence is never entitlement; nothing may be revealed before lock and charged later.

**Advisory signals (CH-6), never a penalty:** a catch dismissed as "not completed" despite completion evidence; receipts above the locked account plus confirmed catches; credit notes or write-offs against catch lines; explicit allocations that consistently avoid catch lines; invoice or payment activity with no lock.

**Residual risk.** After the reveal, a builder can dismiss a genuine catch, or bill it outside JobGuard, and pay nothing. Signals and terms reduce this but do not prevent it. No charge is ever inferred from a signal.

#### 10.2.10 Privacy, transparency and wording

"Hidden" means not shown in the ordinary workflow until the Final Check. It never means undisclosed surveillance.

- **Before the first job,** onboarding and terms state that JobGuard:
  - analyses job records;
  - may identify possible unrecorded extras;
  - compares them independently with the completed final account;
  - may earn the success fee on paid recoveries that qualify.
- **Data processed.** Only job-linked data needed for the service is processed. Customer messages and third-party data need the lawful basis and Article 14 route set in D12.
- **Data-subject access.** A data-subject access request is answered lawfully. If the answer discloses a candidate before lock, that candidate becomes ineligible.
- **Pilot data.** Real pilot data needs G1, plus approval of the pilot disclosure under D12 and D13.

**Permitted claim:** "This item was missing from the final account you completed at 16:42 on 3 July. JobGuard found it afterwards from [sources], and £X was then paid."

**Forbidden claims:** "you would have forgotten this"; "you would never have billed this"; "JobGuard saved you £X" before cash has settled; "you kept £X" without the VAT and tax basis; any hint that the subscription is free or hidden; any £ figure for prevention.

#### 10.2.11 Scenario catalogue

| Test | Scenario | Expected |
|---|---|---|
| A | £800 logged before lock; customer pays | Fee £0 |
| B | Signal exists; builder adds £800 at final review | `builder_captured`; never revealed; £0 |
| C | Pre-lock evidence; item omitted, locked, revealed, confirmed, billed, paid | Q £800; fee £80 |
| D | Signal is in the baseline scope | Reconciled; £0 |
| E | Customer asked, but the work was not done | Dismissed "not completed"; £0 |
| F | Catch invoiced, never paid | £0 |
| G | £400 of £800 paid | £40 until more settles |
| H | £800 paid; £200 item-specific refund | Q £600; fee £60; −£20 compensation |
| I | £8,000 change surfaced early by a D13 rule | Builder told; permanently ineligible |
| J | An email, a message and a photo describe one extra | One signal, one recovery, one fee |
| K | "Already included" | Must pick a locked line; the lock stays unchanged |
| L | Old message imported after lock | Usable evidence; not fee-eligible |
| M | Blended invoice; partial unallocated receipt | Pro-rata (10.3.5) |
| N | Separate catch invoice paid; main invoice unpaid | £80 |
| O | Diary note "fitted outside tap"; no Log an extra; omitted at lock | Eligible catch |
| P | Draft Log an extra "outside tap", never priced; omitted at lock | `builder_captured`; £0 |
| Q | Shadow isolation | Role denied; responses identical with and without signals |
| R | Disclosed through support, export or a data-subject access response before lock | Permanently ineligible |

### 10.3 Success-fee contract: `reference_fee_policy_v3`

#### 10.3.1 Formula

```text
Q = cumulative qualifying recovered net principal for the job and rate, as an exact rational in
    pence, after allocation (10.3.2), reversals, refunds and credits; never negative
F = roundHalfEven(Q × 10 / 100)       // cumulative success-fee principal
J = prior net posted success-fee principal for the job and rate, including compensations
posting_delta = F − J
```

- **No offsets.** There is no cap, no base, no plan credit and no subscription offset. The v3 derivation has no "credit used" field.
- **Rounding.** Rounding happens once, on the cumulative exact value, so splitting receipts cannot change F.
- **Positive delta.** A positive delta needs qualifying proof and an exact, approved statement authorisation.
- **Negative delta.** A negative delta creates a linked compensating journal, and credit or refund work if the fee was already collected.
- **Zero delta.** A zero delta keeps its derivation and posts no journal.
- **VAT and AI.** VAT on the fee follows D02 and is calculated separately. No AI takes part in the arithmetic or in entitlement.
- **Shared rules.** SH-1 (§8) builds the pure allocation rules and the cumulative-rounding kernel once; SV-1 and the contractor fee domain (ENT-4a) import them. M4-8-S builds the persisted receipt-to-line allocator and its acceptance tests on top of them.

#### 10.3.2 Allocating customer receipts to lines

Apply the first rule that fits. A rule is never chosen because it pays JobGuard more.

1. **Explicit.** Reliable evidence recorded with its source, such as a remittance or payment reference, says what was paid for.
2. **Separate invoice.** The caught item is on its own (supplementary) invoice, or is otherwise separately settled. Other invoices are irrelevant.
3. **Pro-rata.** An unallocated receipt against a blended invoice is spread across the lines outstanding at the moment of receipt, in proportion to each line's outstanding gross. A receipt taken before a line existed (a deposit or stage payment) is never spread onto that line.

**Calculation.** For receipt `r`, invoice outstanding gross `O` and line outstanding gross `o`, the deemed gross paid to the line is the exact rational `r × o / O`. Convert it to net with the line's own `net/gross` ratio. Nothing is rounded before F.

**Reversals.** Refunds and credit notes go back through the same hierarchy: item-specific first, then pro-rata across the lines they settled. Each allocation row records the rule used and its source.

**Ownership.** M4-8-S owns the persisted allocator and its acceptance tests. SV-6 and every later card consume that allocator; none builds a second one.

#### 10.3.3 Qualifying categories (D03 v3)

| Category | Qualifies when | Principal counted | Never |
|---|---|---|---|
| `missed_variation_final_account` | Every 10.2.8 conjunct holds | Net of catch lines deemed paid | Captures; disclosed, surfaced-early, post-lock or pre-adoption signals; unpaid or pending amounts; unresolved disputes |
| `merchant_overcharge`, cash refund | The supplier's cash refund has settled and is allocated to an approved case | Refund net | Prevented spend; invoice reductions before payment |
| `merchant_overcharge`, applied credit note | The credit is consumed against a later supplier invoice paid in full, with at least £250 consumed in the case | Credit net consumed | Unconsumed credit; an invoice not yet paid in full; less than £250 |
| `duplicate_supplier_payment` | An evidenced double payment, refunded in cash | Refund net | Credit against future purchases |
| `withheld_customer_payment` | The builder's invoice is overdue beyond the D03 threshold; the customer refused, disputed or ignored the builder's own reminder; and the builder opened the case and approved the fee terms before any JobGuard pursuit | Net of cash settled after opening; overdue retention once M4-20 exists | Ordinary late payment; normal billing reminders; payments made before opening; insurer proceeds |
| Statutory interest (a claim line inside such a case) | The debtor is a business and has paid the interest | Interest paid | The fixed statutory compensation; debtors who are individuals |
| `prevention` | Never | — | Always terminal and fee-free |

A new category needs a new D03 version.

#### 10.3.4 Collection on the payment screen

When a qualifying receipt is verified as settled (by a bank feed in live use, or a generated settled movement in simulation), one screen shows:

- what was received;
- the qualifying net;
- JobGuard's fee: principal plus VAT once D02 is approved, or "VAT not calculated" in simulation;
- "yours before your VAT and tax", which is qualifying net minus the fee principal.

**How the fee is collected.**

- The customer's payment always goes to the builder's own account and is never reduced. The fee is collected separately.
- Each statement is approved individually by default.
- A builder may opt in to a standing Direct Debit authority. It is capped at the fee on each verified receipt, can be revoked, and pauses while a dispute is open on the receipt, the case or the attribution.
- No fee is collected before settlement is verified, and none can exceed the verified amount.

#### 10.3.5 Mandatory fixtures

Figures are principal and ex VAT unless stated; VAT is 20%. Vitest covers every row to the penny. Browser tests cover the rows their cards name.

| # | Scenario | Q | F | Posting |
|---|---|---:|---:|---|
| F1 | Test C: £800 catch paid in full | £800.00 | £80.00 | +£80.00 |
| F2 | Test G: £400 of £800 paid (explicit), then the rest | £400.00 → £800.00 | £40.00 → £80.00 | +£40.00, +£40.00 |
| F3 | Test H: £800 paid, then a £200 item-specific refund | £600.00 | £60.00 | −£20.00 |
| F4 | Test M: invoice net £34,400 / gross £41,280 including £800 net (£960 gross) of catches; £24,000 unallocated | 20,000/43 = £465.1162… | £46.51 | +£46.51 |
| F4b | F4, then the remaining £17,280 | £800.00 | £80.00 | +£33.49 |
| F5 | As F4, with a £12,000 deposit before lock; then £14,640 unallocated against £29,280 outstanding | £400.00 | £40.00 | +£40.00; the deposit is never spread |
| F6 | As F4, with a remittance naming non-catch lines for the £24,000 | £0.00 | £0.00 | none |
| F7 | Test N: separate £960 gross catch invoice paid; £40,320 main invoice unpaid | £800.00 | £80.00 | +£80.00 |
| F8 | Test F: catch invoiced, never paid | £0.00 | £0.00 | none |
| F9 | Ties: Q = 5p, 15p, 25p | | 0p, 2p, 2p | Two 5p receipts: Q = 10p, F = 1p |
| F10 | `recovery-18800`: builder-opened withheld-payment cases, £320 then £2,500 settled after opening | £320.00 → £2,820.00 | £32.00 → £282.00 | +£32.00, +£250.00 |
| F11 | F10, then the £3,000 gross receipt reversed | £320.00 | £32.00 | −£250.00; refund due £250.00 if collected |
| F12 | Tests A and B: £3,600 captured (£3,200 logged, £400 at review) | £0.00 | £0.00 | none |
| F13 | `shadow-30000`: catches of £500 and £300 on one invoice (net £34,400 / gross £41,280), paid in full | £800.00 | £80.00 | +£80.00; builder keeps £720.00 before VAT and tax |
| F14 | £300 net supplier credit consumed against a later invoice paid in full | £300.00 | £30.00 | +£30.00 |
| F15 | £200 net supplier credit (below the £250 minimum) | £0.00 | £0.00 | none |
| F16 | £300 credit against a later invoice part-paid, then paid in full | £0 → £300.00 | £0 → £30.00 | +£30.00 on full payment |
| F17 | Duplicate supplier payment of £540 gross (£450 net) refunded in cash | £450.00 | £45.00 | +£45.00 |
| F18 | Business debtor pays £2,500 net principal, £120 statutory interest and £70 fixed compensation | £2,620.00 | £262.00 | +£262.00; the £70 excluded |
| F19 | As F18, but the debtor is an individual | £2,500.00 | £250.00 | +£250.00 |
| F20 | £384 gross paid before the builder opened the case | £0.00 | £0.00 | none |
| F21 | `materials-B`: an unpaid supplier bill reduced by £90 | £0.00 | £0.00 | none |
| F22 | Prevention case | £0.00 | £0.00 | none; terminal |
| F23 | £69 subscription settled in the same month as F1 | £800.00 | £80.00 | +£80.00; never offset |

The v1 fixtures (the `core-1000` cap, `small-fee`, `zero-fee`, the v1 `rounding-tie`, and £203 / £2,538 / £241) serve merged v1 tests only. Under v3 the £282 in `recovery-18800` is 10% of £2,820, not a cap.

### 10.4 Task cards

**Shared rules for every card.** Every card inherits C1–C8 (§2.4) and AGENTS §2.

- The coordinator assigns migration numbers.
- Cards that touch the same files serialise, and must say so in the PR.
- CH-2 and CH-3a are shared cards defined in §8. "Merged" marks existing work.
- "Synthetic" means the card can be built and accepted now, in `synthetic_demo`. "Live-gated" names what must exist first.

**Adoption precondition.** No SV, CH or MON card, no receipt-to-line allocator in M4-8-S and no v3 rewrite starts until this revision is adopted. Adoption means three things: Ben adopts it, the independent verdict on the plan text is recorded (the former SV-0), and the revision is merged. Before adoption, only these may proceed:

- M4-5-S and M4-7-S, in their committed scopes;
- then M4-6-S;
- then M4-8-S's case allocation, without the allocator.

Adoption approves no proposed decision.

**Repairs first.** The merged M4-1-S and M4-2-S carry retrospective HOLD verdicts, and M4-3-S a FAIL. Repairs are in flight on the `codex/sandbox/m4-*-s-repair` branches. A card that builds on one of them depends on its repair being accepted. The repairs are named M4-1-S-R, M4-2-S-R and M4-3-S-R.

| Card | Depends on | Build mode |
|---|---|---|
| SV-1 | SH-1 | Synthetic |
| SV-2 | SV-1 | Synthetic |
| SV-3 | SV-2 | Synthetic; a live-model run is a separate release item |
| SV-4 | SV-2, UIWIRE-9, UIWIRE-10 | Synthetic |
| SV-5 | SV-3, SV-4, M4-1-S-R | Synthetic |
| SV-6 | SV-5, M4-8-S, CH-7 | Synthetic |
| SV-7 | 7A: SV-3, CH-4 · 7B: 7A + G1, D04, D12 per connector | 7A synthetic · 7B live-gated |
| SV-8 | SV-6, MON-4, live M4-7…M4-12, G4-S | Live-gated |
| CH-1 | SV-1, CH-3a | Synthetic |
| CH-4 | CH-2, CH-3a, SV-4 | Synthetic |
| CH-5 | CH-1, CH-3a, SV-2, MON-1 | Synthetic |
| CH-6 | SV-5, MON-1 | Synthetic |
| CH-7 | SV-1, M4-1-S-R, M4-2-S-R, M4-5-S | Synthetic |
| CH-8 | SV-5, SV-6, M4-3-S-R | Synthetic |
| CH-9 | SV-6, MON-1 | Synthetic |
| MON-1 | CH-1, CH-2, CH-3a, CH-4, SV-4 (after CH-4, never alongside it) | Synthetic |
| MON-2 | 2A: MON-1 · 2B: 2A + live M4-10, M4-13, G4-S | 2A synthetic · 2B live-gated |
| MON-3 | MON-2A | Synthetic |
| MON-4 | 4A: SV-6, M4-8-S · 4B: 4A + live M4-12, M4-15, G4-S | 4A synthetic · 4B live-gated |
| MON-5 | CH-3a, SV-7A | Synthetic; real customers need G1, D06 v2, D12 v3 |
| MON-6 | MON-5, M4-18 | Synthetic construction after its task prerequisites; real payments require the named approvals and G4-S |
| MON-7 | CH-3a, M2-6-S | Synthetic; live needs M2-6, plus D04 and D12 v3 for each source |
| MON-8 | MON-2A | Synthetic |
| MON-9 | SV-6, M4-5 (live) | Separately issued later work; synthetic preparation may precede release approval, while the stated pilot-data and professional prerequisites govern offering the service |
| M4-5-S | M4-3-S-R, UIWIRE-3 | Synthetic (committed scope) |
| M4-6-S | M4-5-S | Synthetic |
| M4-7-S | M4-2-S-R, SBOX-2 | Synthetic (committed scope) |
| M4-8-S | M4-2-S-R, M4-3-S-R, M4-7-S, SV-2 | Synthetic |
| M4-9-S | M4-8-S, SV-6, UIWIRE-13 | Synthetic |
| M4-10-S | M4-9-S, UIWIRE-14 | Synthetic |
| M4-12-S | M4-10-S | Synthetic |
| M4-17-S | M4-12-S, UIWIRE-12, MON-2A | Synthetic |
| DEMO-S | the explicit DEMO-S prerequisite list; exclude all live-gated cards and retired task IDs | Synthetic |

### SV-1 Shadow domain and success-fee rules
**Track:** small-builder · synthetic
**Depends on:** SH-1 (which waits for adoption of this revision)

**Build:** Pure code in `packages/core`:

- signal, state, outcome, dismissal and ineligibility types, with the 10.2.2 transitions;
- the capture-versus-evidence predicate, with builder-favourable matching;
- must-surface rules as a versioned function of structured facts;
- lock-snapshot canonicalisation and hashing;
- the 10.2.8 predicate over an immutable input record;
- the 10.3.2 allocation rules as exact rationals, including deposit-before-line;
- the `reference_fee_policy_v3` derivation and posting delta;
- the D03 v3 category predicates.

The exact allocation and cumulative-rounding module is shared with the contractor fee domain (ENT-4a). SH-1 creates and owns the pure module. SV-1 and ENT-4a import it and add track-specific tests; neither implements a second allocation or rounding kernel.

**Done when:**

- Tests cover all 1,024 truth assignments of the ten conjuncts; only all-true qualifies.
- Every 10.3.5 row is exact, including 20,000/43 and the ties.
- No transition leads from a signal to a variation, line, debt, journal or fee.
- `surfaced_early` and `disclosed_before_lock` are monotonic. Withdrawn and rejected records reconcile as capture.
- Property tests show that splitting a receipt, or reordering receipts with the same timestamp, never changes Q or F. The chosen allocation rule never depends on the fee it yields.
- AI output types cannot construct attribution, eligibility, origin or fee inputs. A type test and a schema test prove it.
- Negative or out-of-range Q is rejected, not clamped.
- `fee.ts`, `activation.ts` and their tests are unchanged.

### SV-2 Shadow persistence and isolation
**Track:** small-builder · synthetic
**Depends on:** SV-1

**Build:**

- The 10.5 shadow tables.
- Small-builder origin kinds (`builder_logged | final_review | jobguard_catch`) written to the shared `variation.origin` column and immutable `extra_origin` table that SH-1 creates (§8, 9.1.5):
  - the command-type map `LogExtra → builder_logged`, `AddFinalReviewExtra → final_review`, `ConfirmCatch → jobguard_catch` (with `source_signal_id`);
  - one origin per variation;
  - verification of SH-1’s completed `builder_logged` backfill; SV-2 performs no second backfill.
- An append-only variation withdrawal fact.
- The `jobguard_shadow` role.
- The reveal routine.
- One `record_shadow_disclosure` routine.
- Audit events.

**Done when:**

- Catalog tests prove `jobguard_runtime` has no privilege on shadow tables, directly or through views.
- `jobguard_shadow` cannot read identity or credential tables, alter policies, assume roles or bypass RLS.
- The reveal routine returns nothing for an unlocked job, and returns only `revealed` rows for the right tenant and job. Its EXECUTE grant is specific and catalog-tested.
- No runtime role can update or delete links, receive times, disclosures, classifications, dispositions or origins. `disclosed_before_lock` never returns to false.
- Links across tenants, or across jobs in one tenant, fail on composite foreign keys.
- Break-glass reads need a separate permission and write an audit reason.
- A support action that tells the builder about a signal records a disclosure (Test R).
- Merged variation and final-account tests pass after the backfill.

### SV-3 Detection engine and must-surface rules
**Track:** small-builder · synthetic; a live-model evaluation is a separate release item
**Depends on:** SV-2

**Build:** A shadow worker, never running in a builder request, that turns evidence observations into signals.

- **Deterministic detectors first:**
  - supplier items or orders with no matching baseline or capture;
  - completion photos of work that has no scope item;
  - diary or voice mentions of new work;
  - customer requests received through JobGuard.
- **AI proposals** through `packages/ai`, with validated citations (fixture responses in simulation).
- **Coalescing** of signals, and matching against scope and captures.
- **Must-surface evaluation** on every new or changed signal. A firing becomes a mandatory Decision plus a recorded disclosure.
- **Track-neutral observations**, so ENT-8 can reuse them. Only this track's sink holds them back.

**Done when:**

- `pnpm eval` reports recall and false-positive precision separately on a held-out labelled set. The set covers genuine extras, contracted work, ambiguity, chat, alternative materials, duplicates, cancelled or unfinished requests, supplier spares, builder mistakes, work already captured, and one extra with several sources.
- Fixture CI and live-model runs are reported as distinct results.
- **Test Q.** Builder-facing routes, notifications, exports, counts, badges, errors, cache keys, analytics and response shapes are byte-identical with zero signals and with many (must-surface fixtures excluded). A query-log test shows no builder request touches a shadow table.
- Tests J and P pass.
- **Test I.** The D13 rule fires, a mandatory Decision is shown, and `surfaced_early` is recorded with the rule version. The signal is permanently ineligible. A model score cannot suppress the rule.
- A supplier line outside the quote stays evidence unless a rule fires.
- Instructions inside uploaded documents cannot change detector or gateway behaviour.

### SV-4 Final-account lock
**Track:** small-builder · synthetic
**Depends on:** SV-2, UIWIRE-9 (merged), UIWIRE-10 (merged)

**Build:** The 10.2.6 flow:

- the final account assembled from baseline and captures only;
- the review prompt;
- `final_review` extras;
- a disposition for every scope item;
- the declaration;
- the atomic lock command;
- a final invoice bound to the lock, including a supplementary invoice for catch lines.

**Done when:**

- Anything added before lock is capture.
- The lock is refused while any scope item has no disposition, or while disclosure terms have not been accepted.
- The locked account can be rebuilt from its hashes, and changing any source row is detected.
- A double submit, a second browser or a replay creates one lock, or a typed conflict.
- A trigger test proves later revisions never change the lock row.
- A final or supplementary invoice without the lock or a completed reconciliation bound to that lock and cutoff fails in the command, controlled routine and UI. Race tests cover pending, failed and completing reconciliation. SV-4 introduces the fail-closed guard; SV-5 supplies the completion record. Deposit and interim invoices remain unaffected.
- The lock screen, its response and "Running JobGuard's final check" are identical with zero signals and with many.
- `await V('lock-state','Final account completed');` passes after a reload and when the job is opened from Jobs.

### SV-5 Final check, reveal and disposition
**Track:** small-builder · synthetic
**Depends on:** SV-3, SV-4, M4-1-S-R

**Build:**

- the post-lock reconciliation run, bound to the lock and a frozen manifest of evidence received before it; completion requires processing every manifest source through detection and reconciliation, including a recorded zero-result. Pending or failed source processing prevents completion. Tests delay a pre-lock detector until after lock and prove invoice issue remains blocked;
- the reveal screen, showing evidence dates, sources and proof of absence;
- the dispositions;
- the case type `missed_variation_final_account`;
- turning a confirmed catch into a `jobguard_catch` variation and a case of that type;
- the queue for disputed attributions.

**Done when:**

- Tests B, D, E, I, J, K, L and O pass as browser journeys in both projects, and still show the same state after a reload.
- Only "Yes — this was extra work" creates a variation or case. The catch then follows the ordinary path through pricing, approval and customer approval into a revision linked to the lock.
- "Already included" needs an exact locked line or item. An unmatched claim stays `attribution_disputed`, with no fee, until a person resolves it.
- A zero result shows "JobGuard's final check found nothing missing from your bill." after the same steps.
- Rerunning reconciliation creates no duplicate classification.
- Evidence received after lock produces signals shown at once with `evidence_after_lock` (Test L).

### SV-6 Attribution and success-fee illustration
**Track:** small-builder · synthetic
**Depends on:** SV-5, M4-8-S, CH-7

**Build:**

- an immutable `recovery_attribution_revision` for each conjunct, with its source;
- the D03 v3 review of `missed_variation_final_account`;
- receipt-to-line allocations for catch lines, consumed from M4-8-S's allocator (never a second allocator);
- the v3 illustration;
- the value receipt: found, recovered, fee, and yours before VAT and tax.

**Done when:**

- Tests C, F, G, H, M and N pass end to end in simulation, with the F1–F8 figures and a navigable chain from source to settled receipt.
- Every assessment and reassessment may create an immutable attribution revision recording true and false conjuncts with their sources. No positive qualifying allocation or fee posting is authorized unless every required conjunct holds for the remaining qualifying principal.
- A reversal, refund, credit or evidence invalidation creates a new revision and recomputation, never an edit; partial changes reduce qualifying principal, while complete disqualification yields zero and linked compensation.
- `shadow-30000` shows `await V('found-recovered-net','£800.00'); await V('found-success-fee','£80.00'); await V('found-yours-before-tax','£720.00'); await V('tracked-captured-net','£3,600.00'); await V('tracked-fee','£0.00');`
- The card makes no real posting, collection or tax figure. Screens are labelled "Illustration — proposed policy; principal only".

### SV-7 Diary, customer messages, then connectors
**Track:** small-builder · SV-7A synthetic; SV-7B live-gated
**Depends on:** SV-7A: SV-3, CH-4. SV-7B: SV-7A, plus G1 and D04 and D12 evidence for each connector.

**Build:**

- **SV-7A** delivers:
  - the job diary, with typed or dictated notes on live jobs, an on-site flag and the standing notice;
  - the customer-message page for MON-5;
  - one evidence-observation contract that every source emits, carrying tenant, job, source, server receive time, object version and SHA-256;
  - CH-4 site-evidence events emitted from on-site diary entries.
- **SV-7B** adds approved connectors (email forwarding, messaging, accounting) one at a time, each through the same contract.

**Done when:**

- The diary shows only the standing notice.
- Diary responses are identical with and without signals derived from the notes, and Test O passes.
- Every source uses the same contract, and none writes to shadow tables except through the worker.
- Tenant and job binding fail closed.
- Each connector ships its own contract tests, data-flow entry and approval evidence. Otherwise it stays server-disabled.

### SV-8 Production settlement
**Track:** small-builder · live-gated
**Depends on:** SV-6, MON-4, live M4-7, M4-8, M4-9, M4-10 and M4-12; G4-S; approved D01 v3, D02, D03 v3, D11 v3, D12 and D13

**Build:** Production use of verified settlement evidence, case and line allocation, v3 accrual, platform invoice lines, collection and refunds on this track.

**Done when:**

- Cash categories require verified, settled, allocated, unreversed cash. The consumed-credit category remains production-disabled until its separate proof, allocation, consumption-reversal and authorization contract is approved and incorporated into both governing documents.
- Builder-attested receipts, pending movements and synthetic or sandbox facts cannot create one, and production workers refuse them.
- The G4-S evidence exists. The lock, isolation, attribution, and reversal and refund controls are proven. The v3 arithmetic has been checked independently. The terms and the pilot evidence have been reviewed.

### CH-1 Switch-live under v3
**Track:** small-builder · synthetic
**Depends on:** SV-1, CH-3a

**Build:** A v3 switch-live routine.

- **It records** the baseline quote version, accepted net, the highest net of any sent quote, the small-job flag, `reference_fee_policy_v3`, the commercial track in force, and the trial or plan context, all in `job_activation_terms`.
- **It creates** no cap snapshot and no per-job obligation.
- **The £79 is gone:** the demo stops simulating a £79 payment, and £79 wording leaves the quote editor.
- **v1 data moves:** v1 statements and illustrations move behind "Earlier proposed pricing (v1)" for jobs with v1 data.

**Done when:**

- A new demo job switches live with no `cap_snapshot`, `synthetic_obligation` or platform-journal rows, and exactly one terms row. A replay adds nothing.
- v1 jobs still render under the v1 label, and their merged tests pass unchanged.
- A copy audit finds no "£79", "cap" or "plan credit" on any screen, export or snapshot for a new job.
- The small-job flag cannot change after activation.
- `core-1000` (£1,000) is small; `recovery-18800` and `shadow-30000` are not.

### CH-4 Work-state events and the post-lock rule
**Track:** small-builder · synthetic
**Depends on:** CH-2, CH-3a, SV-4

**Build:**

- Immutable, server-timestamped events for:
  - first site evidence: a photo, a delivery note or goods receipt, or an on-site diary entry once SV-7A lands;
  - site activity;
  - "Finished on site", and its cancellation;
  - close, with a reason: `cancelled_by_customer | abandoned | completed_outside_jobguard | other` plus a note;
  - reopen;
  - resume.
- A post-lock redirect: new site work on a locked job is refused with "Start a linked job for this customer and site".

**Done when:**

- Replays produce identical events and intervals.
- Late processing keeps the original server time and edits nothing.
- After lock, catch confirmation, invoicing, payments, credits, retention and snagging photos create no activity.
- After lock, an order, supplier invoice, progress photo or extra is refused and offered as a linked job.
- Purchase orders and supplier invoices never create first site evidence.
- Closing needs a reason and ends Final Check eligibility.

### CH-5 Job import under v3
**Track:** small-builder · synthetic
**Depends on:** CH-1, CH-3a, SV-2, MON-1

**Build:**

- Imports record v3 activation terms, without the v1 cap or policy.
- Imports matching an existing customer and site with an overlapping job are linked.
- Imports at the invoiced stage never count.
- Evidence from before adoption carries `pre_adoption_evidence`.
- Imported baselines keep the builder-attested lineage label.

**Done when:**

- Tests cover:
  - linking;
  - the invoiced-stage rule;
  - Solo imports receive the grace place and then `PLAN_LIMIT_REACHED`; Builder imports remain unblocked, preserve the monthly maximum, and raise `track_review_due` beyond the grace place;
  - a pre-adoption catch, which shows a £0 fee and the reason.
- Imports follow the ordinary start rule, so no import period is free.
- v1 imports keep their fields and tests.

### CH-6 Integrity signals for v3
**Track:** small-builder · synthetic
**Depends on:** SV-5, MON-1

**Build:**

- v1 cap-basis signals are labelled v1-only.
- These D11 v3 advisory signals are added:
  - the 10.2.9 list;
  - won but never switched live;
  - same customer and site with quotes under £2,000 within 90 days;
  - repeated finish-and-restart;
  - accounts sharing users, phones or cards.

**Done when:**

- An architecture test proves that no pricing, meter, fee, entitlement or account-status code reads signal output.
- Signals shown before lock read no shadow table; a query-log test proves this.
- Each signal cites its sources and time window, and is labelled advisory.

### CH-7 Eligibility under D03 v3
**Track:** small-builder · synthetic
**Depends on:** SV-1, M4-1-S-R, M4-2-S-R, M4-5-S

**Build:** The v3 reason set and categories (10.3.3):

- **`duplicate_supplier_payment`** as a new category.
- **`supplier_credit_consumption`,** linking a credit note to a later invoice and its settled payment, with the £250 case minimum.
- **Claim lines** of kind `principal | statutory_interest | fixed_compensation`, each with a debtor type.
- **Fee-terms approval.** A `recovery_case_terms_approval` is required before any pursuit of a withheld-payment case. CH-7 wires this guard into the M4-5-S pursuit command, and the live M4-5 must call it too.
- **Insurer proceeds** are excluded.

**Done when:**

- Browser and database tests show F14–F22 with these exact reasons:
  - "Credit note below the £250 minimum";
  - "Credit note used against an invoice not yet paid in full";
  - "Fixed statutory compensation is not part of the fee base";
  - "Paid before you opened this case";
  - "Insurer proceeds never qualify".
- Pursuit without approved terms fails.
- Approving terms later never makes an earlier receipt qualify.
- v1 reviews keep their version and outcome.

### CH-8 Evidence packs with lock and reveal
**Track:** small-builder · synthetic
**Depends on:** SV-5, SV-6, M4-3-S-R

**Build:**

- Evidence packs gain sections for:
  - the lock;
  - the capture snapshot;
  - source observations;
  - reconciliation;
  - the reveal;
  - the disposition;
  - the attribution revision;
  - settlement.
- A pack ordered before lock runs the must-surface check and contains no shadow content.

**Done when:**

- A `shadow-30000` catch pack can be followed from source to settled receipt, and the verifier agrees with the UI.
- A pack ordered before lock is byte-identical with and without signals (must-surface fixtures excluded).
- The same inputs give the same manifest and digests.

### CH-9 Value page and receipt
**Track:** small-builder · synthetic
**Depends on:** SV-6, MON-1

**Build:** This card replaces VALUE-2. Each job and the whole business get these sections:

- **What we checked:** counts only, no £ figures.
- **Tracked through to your bill:** builder captures, with a £0 fee.
- **Found by JobGuard after your bill was complete:** the amount recovered, the fee, and "yours before VAT and tax".
- **Supplier and withheld-payment recoveries,** each a separate category.
- **The subscription,** shown per billing period, never per job.

Where the figures come from:

- Fee figures come from the v3 derivation (SV-1, illustrated by SV-6) over M4-8-S allocations.
- Subscription figures come from the MON-1 period computation.

A `/api/value` aggregate carries the source, period, policy and derivation version.

**Done when:**

- `recovery-18800` shows £2,820.00 / £282.00 / £2,538.00, and after the reversal £320.00 / £32.00 / £288.00.
- `shadow-30000` shows £3,600.00 tracked with a £0.00 fee, and £800.00 / £80.00 / £720.00 found.
- Recoveries of £500 and £0 give fees of £50.00 and £0.00.
- A copy audit forbids "saved you", "would have forgotten", "you kept" without its tax basis, and any £ figure for prevention.
- Every figure reproduces from the API's source list.
- Time filters count each event once and show reversals explicitly.
- No data from another tenant appears.

### MON-1 Jobs-on-the-go meter
**Track:** small-builder · synthetic
**Depends on:** CH-1, CH-2, CH-3a, CH-4, SV-4. It starts after CH-4 merges, never alongside it.

**Build:**

- A pure `packages/core` function implementing 10.1.4 to 10.1.6 over immutable events.
- A job-days ledger for each period, rebuilt from those events.
- The committed-place, cap and grace check in every place-adding command.
- The job-list line and a drill-down.
- Correction lines.
- A meter role with no grant on shadow tables.

`pilot_no_charge` shows hypothetical prices.

**Done when:**

- Replay fixtures prove the pricing sentence and the code agree for each case:
  - a start on day 31;
  - a first photo on day 5;
  - "Finished on site" plus 7 days;
  - 30 quiet days;
  - a restart;
  - the same customer and site;
  - small allowances at 4 and at 7;
  - the trip;
  - a linked import;
  - the trial job.
- These attacks fail:
  - bypassing the cap through resume, reopen or import (Solo never passes six committed places without an upgrade);
  - pausing weekly;
  - locking early;
  - a free import period;
  - splitting one site between two customers.
- A mutated cached count cannot change a bill: periods recompute from events, and any mismatch raises an alert. Tests cover included, paid-extra and grace-capacity displays, plus two distinct jobs concurrently activating at Solo’s limit under tenant-level capacity locking. Late facts correct the next period.
- Architecture and grant tests prove that nothing from the shadow side is an input. Bills are identical with and without signals.
- `await V('jobs-on-the-go','5 of 7 jobs on the go'); await V('next-job-price','Next job included');`

### MON-2 Plans, subscription billing and the monthly maximum
**Track:** small-builder · MON-2A synthetic; MON-2B live-gated
**Depends on:** MON-2A: MON-1. MON-2B: MON-2A, live M4-10 and M4-13, G4-S, and approved D09 v4, D05 and D02.

**Build:**

- **MON-2A** delivers:
  - a versioned catalogue (Solo and Builder only) with the v4 parameters;
  - a subscription agreement per tenant: plan, cadence, anchor, maximum and terms version;
  - 10.1.4 period computation;
  - upgrade and downgrade commands;
  - annual plans behind a flag;
  - subscription statements in the platform statement namespace, as documents separate from success-fee statements;
  - the `track_review_due` detector (10.1.9);
  - onboarding routing to the contractor deal;
  - a provider-neutral simulated payment adapter with simulated settlement.

  MON-2A and M4-10-S serialise on the platform statement namespace; whichever merges first creates it.
- **MON-2B** collects the exact amount JobGuard computed, within the D05 bound. It uses signed webhooks, idempotency and reconciliation of unknown outcomes. Provider proration, retries and emails are turned off or set to match the approved terms.

**Done when:**

- These fixtures give the exact figures:

  | Scenario | Result |
  |---|---|
  | Solo profile (1,1,1,2,2,2,2,2,2,3,3,4) | £348 a year |
  | Small-firm profile on Builder (3,4,4,4,4,5,5,5,5,6,6,7) | £828 a year |
  | Builder, 8 places for a full 30-day period | £89 |
  | Builder, 8 places for 15 of 30 days | £79 |
  | Builder, 12 places | £169 |
  | Solo, 5 places | £49 |
  | Solo with a grace place | £49 |
  | Solo with 6 places, upgraded on day 11 of 30 | £62.33 |
  | Builder, 8 places for 1 day of 31 | £69.65 |

- A property test shows no period ever exceeds its maximum.
- An architecture test shows the subscription never offsets, credits or refunds a fee.
- The 13–17-place profile raises `track_review_due` immediately on crossing Builder's grace place; the sustained-use trigger is tested separately against the approved billing-period rule. With no signed agreement recorded, charges stay at or below £169.
- A redirect never settles a period, and replays give one effect.
- MON-2B passes the same checks on provider sandbox events, recorded as sandbox evidence only.

### MON-3 Free first job
**Track:** small-builder · synthetic
**Depends on:** MON-2A

**Build:**

- the 10.1.7 trial, with its entitlement key;
- the card request at the first switch-live, with "Skip for now", through the provider's hosted flow;
- storage of the provider reference and fingerprint only (a placeholder in simulation);
- the card requirement before a second job goes live.

**Done when:**

- The trial ends at lock, at close, on day 90, and when a second job goes live (with the subscription pro-rated from that day).
- A second trial is refused for the same company number, or for the same phone and card.
- A second switch-live without a card is refused and offers "Add a card".
- "Skip for now" is offered on the first job only.
- The trial job's Final Check and illustration run normally.

### MON-4 Success fee on the payment screen
**Track:** small-builder · MON-4A synthetic; MON-4B live-gated
**Depends on:** MON-4A: SV-6, M4-8-S. MON-4B: MON-4A, live M4-12 and M4-15, G4-S, and approved D05 and D02.

**Build:** The 10.3.4 screen and flow:

- a fee statement for each verified qualifying receipt;
- per-statement approval by default;
- an opt-in standing authority, capped per verified fee and revocable;
- a pause during disputes.

MON-4A records approvals and authorities; the M4-12-S simulated collection honours them once both have merged. MON-4B collects by Direct Debit through M4-15.

**Done when:**

- A fee statement or approval cannot come before verified settlement or exceed that receipt's fee. It pauses while a dispute on the receipt, case or attribution is open.
- `shadow-30000` shows `await V('payment-received','£41,280.00'); await V('payment-qualifying-net','£800.00'); await V('payment-fee','£80.00'); await V('payment-yours-before-tax','£720.00');` with "VAT not calculated in this simulation".
- The customer's payment is never reduced.
- A stale, revoked or disputed authority stops dispatch with a specific reason.
- Replays and double clicks collect once.

### MON-5 Customer portal
**Track:** small-builder · synthetic; real customers need G1, D06 v2 and D12 v3
**Depends on:** CH-3a, SV-7A

**Build:**

- An authenticated link for each customer, with no app. Through it the customer can:
  - accept the exact quote revision;
  - approve extras, including `jobguard_catch` variations;
  - sign off stages;
  - message the builder.
- A `customer_authenticated` method alongside `builder_attestation`.
- Customer messages become evidence through the SV-7A contract.
- A domestic cancellation-notice kit on every domestic quote. It is a labelled synthetic template until the D06 v2 review.
- If the link mechanism is shared with ENT-5 client approval, that module serialises.

**Done when:**

- Approvals bind to the exact revision and hash.
- Forged, expired, revoked and stale links fail. A replay creates one approval.
- The builder sees messages as messages and as evidence, with no signal visible before lock.
- A message can fire a must-surface rule.
- Links expose only that customer's job. Enumeration fails.
- Audit payloads hold no customer personal data.

### MON-6 Pay-now links and stage collection
**Track:** small-builder · later (after M4-18); synthetic build allowed, live use gated
**Depends on:** MON-5, M4-18. Live use: a written payment-regulation opinion, a VAT ruling, D10 v2, G4-S and M4-15.

**Build:**

- card and pay-by-bank links on customer invoices, through the builder's own provider account (direct charges; JobGuard never holds funds);
- the capped JobGuard fee under D10 v2, charged to the builder and never surcharged to the customer;
- bank transfer always shown on an equal footing;
- deposits and stage payments collected by Direct Debit through M4-15.

**Done when:**

- The fee cap holds at every payment size, and there is no customer surcharge.
- Presentation, payment options and fee treatment are identical with or without a catch on the invoice.
- Sandbox evidence shows funds settle only to the builder's account.

### MON-7 Prevention checks
**Track:** small-builder · synthetic (generated, dated source fixtures only); live operation needs M2-6, plus D04 and D12 v3 approval for each source
**Depends on:** CH-3a, M2-6-S (merged)

**Build:**

- property constraints at quote time: listed building, conservation area, Article 4, planning history and flood;
- "who actually pays?", from the paying-party field;
- a free Companies House card for business customers;
- the exposure curve on a stage schedule;
- watch-this-customer monitoring on free feeds;
- synthetic register fixtures.

No meters, and no paid checks (D14).

**Done when:**

- Each check cites its source and retrieval date.
- Stale or missing data shows "unknown", never "clear".
- Company checks run only on business customers, and nothing runs on an individual other than the builder's own customer record.
- No check creates a fee, a £ figure on the value receipt, or a meter change.

### MON-8 Plan entitlements
**Track:** small-builder · synthetic
**Depends on:** MON-2A

**Build:** One server-side entitlement service, keyed on track and plan.

- **Solo and Builder have identical features:** the watchdog, the Final Check, invoices, recovery cases, and pay-now and accounting export once those are enabled. They differ only in places, extras cap and maximum.
- **Contractor capabilities come from a contractor agreement,** never from a plan. These are operative roles, site-origin capture, approval chains, work orders and SSO.

**Done when:**

- Forged client flags fail every entitlement check.
- A small-builder tenant cannot create an operative role or a site-origin record.
- No plan change, trial end, lapsed payment or track change deletes or hides data or exports.

### MON-9 Managed-recovery service charge
**Track:** small-builder · separately issued later work. Synthetic preparation may proceed after its task prerequisites; offering the service requires pilot data, a solicitor's view on damages-based agreements, approval of the exact D01 service table and the applicable release gate.
**Depends on:** SV-6, M4-5 (live)

**Build:** A per-case choice, made before JobGuard does anything:

- +5 points: drafted for you;
- +10 points: a solicitor letter through an SRA-regulated partner.

It is shown and invoiced as a service charge, separate from the unchanged 10%.

**Done when:**

- The success-fee derivation is identical with or without the election.
- A builder who does not opt in is never charged.
- The election binds the case, the points and the terms version, and cannot be made once pursuit has started.

### M4-5-S Draft, approve and simulate a factual recovery message
**Track:** small-builder · synthetic
**Depends on:** M4-3-S-R, UIWIRE-3 (merged). This is the committed scope and may proceed before adoption.

**Build:**

- source-bound templates;
- a preview of sender, recipient, body and pack;
- the exact Decision and outbox adapter;
- simulated delivery and reconciliation history.

CH-7 later adds the fee-terms guard to the pursuit command.

**Done when:**

- The preview reads `Practice message — not sent. Our practice records show £320.00 net remains in this case. Please review the attached example records.` to `practice-customer@example.invalid`, with the sources linked. Supplier corrections use supplier wording and a supplier recipient.
- Approving and advancing gives `await V('pursuit-delivery','Simulated delivery — nothing sent');`.
- The sink holds exactly one action with the approved body, hash, recipient and attachment. No live mail, SMS or AI request is made.
- Any change to the preview shows `Review the changed message before approving`.
- An unknown outcome shows `Outcome unknown — check needed`.
- Revocation blocks execution.
- Embedded instructions cannot override validation, and no statutory deadline is invented.

### M4-6-S Advance a persisted recovery timeline
**Track:** small-builder · synthetic
**Depends on:** M4-5-S

**Build:**

- a durable follow-up intent for each run, with a fake clock and one persisted scheduling owner;
- `Advance practice time`;
- reminder review and cancel.

**Done when:**

- Passing the due time gives `await V('follow-up-state','Review reminder'); await V('new-simulated-messages','0');`.
- Only approving the exact reminder sends. Elapsed time never creates consent.
- Repeated advances, a restart and duplicate signals leave exactly one due Decision, with no duplicate transition, journal or send.
- Cancel, dispute or settlement shows `Stopped`.
- Revocation shows `Approval needed again`.
- A reopened case needs a new reviewed intent.

### M4-7-S Synthetic settled movement facts
**Track:** small-builder · synthetic
**Depends on:** M4-2-S-R, SBOX-2 (merged). This is the committed scope and may proceed before adoption.

**Build:**

- a provider-neutral fake account and consent;
- deterministic ingestion of pending and settled movements, each with a durable identity;
- the `Practice receipts` screen;
- movements that verify customer receipts: £384 and £3,000 (`recovery-18800`), £41,280 (`shadow-30000`), £24,000 and £17,280 (Test M), and £960 (Test N);
- a movement for supplier refunds: £540.

**Done when:**

- A pending £384 shows `Pending — cannot qualify`.
- Once settled, it shows `Simulated settled movement`, with `allocated-eligible-net` still £0.00.
- Replays, overlaps and alternate representations give one movement.
- An unknown duplicate shows `Possible duplicate movement — review needed`.
- A builder-attested receipt qualifies only once matched to a settled movement.
- `Disconnect practice feed` keeps history.
- Forged data is refused, and pilot or production use of synthetic facts is refused.

### M4-8-S Allocate settled money to cases and lines, and handle reversals
**Track:** small-builder · synthetic
**Depends on:** M4-2-S-R, M4-3-S-R, M4-7-S, SV-2. Before adoption, only the case-allocation scope may proceed, without the allocator.

**Build:**

- gross, net and tax allocation to cases, with review and approval;
- the reversal workbench.

M4-8-S also owns the receipt-to-line allocator:

- `receipt_line_allocation` rows (10.3.2), created and owned by M4-8-S using SH-1's pure rules; SV-2 owns shadow persistence, not this allocator table;
- each row records its rule and source, the exact rationals, and the bound invoice line;
- the deposit-before-line rule;
- reversal of refunds and credits through the same hierarchy.

SV-6 consumes this allocator. M4-8-S does not wait for SV-6.

**Done when:**

- Allocating £384 as £320 + £64 and £3,000 as £2,500 + £500 gives `await V('recovery-gross-movements','£3,384.00'); await V('eligible-net','£2,820.00'); await V('allocated-tax','£564.00');`, each linked to its movement, evidence, policy and reviewer.
- F4, F4b, F5, F6 and F7 are exact.
- Over-allocation, links across jobs, reused cash and concurrent alternate allocations fail, both on screen and in PostgreSQL.
- Reversing the £3,000 gives `await V('eligible-net','£320.00'); await V('allocated-tax','£64.00'); await V('customer-invoice-balance','£22,176.00'); await V('case-2-state','Reopened — £2,500.00 outstanding'); await V('fee-execution-state','Paused — recovery changed');`, and the original facts are kept.
- Invalidating only claim 2's evidence leaves receipts at £3,384 and the balance at £19,176, and holds only fee eligibility.
- Allocation tests prove the priority order: explicit remittance first, then separate settlement, then pro-rata across the lines outstanding at the moment of receipt.
- A deposit taken before a line existed is never allocated to it.
- Real-PostgreSQL tests:
  - persist the exact rational allocations;
  - conserve available money under concurrent and replayed allocation;
  - apply item-specific refunds and credits first, and reverse pro-rata otherwise;
  - show that split receipts match one combined receipt with the same facts.
- No receipt's deemed net is rounded.

### M4-9-S Derive and approve cumulative v3 success fees
**Track:** small-builder · synthetic
**Depends on:** M4-8-S, SV-6, UIWIRE-13 (merged)

**Build:**

- v3 derivation and journal tables beside the untouched v1 tables;
- a guarded posting routine;
- source drill-down;
- statement-hash approval;
- linked compensation.

**Done when:**

- The first £320 gives `await V('success-fee-principal','£32.00'); await V('posting-delta','£32.00');`.
- Reaching £2,820 gives £282.00 with a £250.00 delta.
- A second approval run gives a £0.00 delta and no journal.
- Reversal to £320 gives `await V('compensation-principal','−£250.00');`.
- No v3 field, label or property is named base, cap or credit.
- Vitest covers every 10.3.5 row.
- Races between cases on one job give the serial result and one derivation.
- Direct inserts, stale approvals, invalidated proof and wrong-mode commands fail.
- A zero delta keeps its derivation and posts no journal.

### M4-10-S Traceable simulation fee statement
**Track:** small-builder · synthetic
**Depends on:** M4-9-S, UIWIRE-14 (merged)

**Build:**

- immutable, numbered simulation statements in the platform namespace;
- a principal breakdown;
- source, allocation and approval links;
- prior postings, settlements and compensations;
- a versioned download.

Subscription statements from MON-2A are separate documents in the same namespace.

**Done when:**

- The statement shows `await V('fee-statement-number','DEMO-FEE-000001'); await V('statement-success-fee-principal','£282.00'); await X('Simulation statement — proposed policy, principal only; not a tax invoice or real amount due');`, with policy v3 and Q £2,820 linked to its sources.
- No base, cap or credit line appears.
- The download has the same number, hash and inputs, and says "VAT not calculated".
- Rendering never posts or collects.
- After the reversal, the original keeps its hash. The linked correction shows −£250.00 and a new balance of £32.00, and a replay creates one correction.

### M4-12-S Simulate collection and refund
**Track:** small-builder · synthetic
**Depends on:** M4-10-S

**Build:**

- fake collection and refund attempts;
- exact statement approval;
- atomic reservation of the outstanding amount;
- pending, unknown and settled states;
- reconciliation.

**Done when:**

- `Approve simulated collection of £282.00 principal` shows pending. The settled event then gives `await V('fee-settled-principal','£282.00'); await V('fee-outstanding-principal','£0.00');`.
- A redirect never settles.
- Double clicks, retries, concurrency and replays never collect more than £282.
- An unknown outcome blocks further attempts.
- After the reversal, `await V('fee-refund-due','£250.00');`.
- The approved refund gives `await V('fee-refunded-principal','£250.00'); await V('fee-retained-principal','£32.00');`.
- Refunds never exceed refundable settled principal.

### M4-17-S Reconcile the synthetic money trail
**Track:** small-builder · synthetic
**Depends on:** M4-12-S, UIWIRE-12 (merged), MON-2A

**Build:** A deterministic reconciliation, with authorised review actions, across:

- customer records;
- receipt-line and case allocations;
- the success-fee book: derivations, journals, collections and refunds;
- the subscription book: periods, lines and settlements.

**Done when:**

- After the reversal: `await V('money-check-state','Records match within this simulation'); await V('unresolved-money-differences','0'); await V('eligible-net','£320.00'); await V('customer-invoice-balance','£22,176.00'); await V('success-fee-net-posted','£32.00'); await V('fee-refunded-principal','£250.00');`.
- The two books are labelled separately, and no base principal appears.
- Seeded orphan, duplicate, late and unknown events show specific rows and `Review needed`.
- Nothing is fixed by deleting history, inventing a settlement or clamping.
- A rebuild and a checkpoint restore reproduce the balances and hashes, and the restored instance starts paused.

### DEMO-S Small-builder practice journey
**Track:** small-builder · synthetic
**Depends on:** SV-1–SV-6, SV-7A, CH-1, CH-4–CH-9, MON-1, MON-2A, MON-3, MON-4A, MON-5, MON-7, MON-8, M4-5-S, M4-6-S, M4-7-S, M4-8-S, M4-9-S, M4-10-S, M4-12-S, M4-17-S

**Build:** A guided chooser covering:

- `core-1000`;
- `recovery-18800`;
- `shadow-30000`;
- the meter profiles;
- the trial.

It supports resume and reset, and ends with a report linking every screen to persisted state.

**Done when:**

- **`shadow-30000` runs with no step skipped:**
  1. A £30,000 quote is accepted.
  2. The builder logs £3,200 of extras.
  3. Signals are held from supplier documents, photos and a diary note.
  4. The account is built from the baseline and captures; the builder adds £400 at review.
  5. The account is locked.
  6. Two missing extras, £500 and £300, are revealed, confirmed and approved by the customer.
  7. One invoice is issued, net £34,400 / gross £41,280, and is paid; settlement is verified.
  8. Q is £800, the fee £80, and the builder keeps £720 before VAT and tax.
  9. The £3,600 of captures carries a £0 fee, and the pack proves the chain.
- **`recovery-18800` ends at** `await V('success-fee-net-posted','£32.00'); await V('fee-refunded-principal','£250.00'); await V('value-found-yours-before-tax','£288.00'); await V('unresolved-money-differences','0'); await V('real-external-actions','0');`. Reach these figures through the complete fresh `recovery-18800` journey: confirmed £18,800 baseline, send/accept/start/proof, £22,560 customer invoice, materials checks, two builder-opened cases, eligibility, evidence pack, exact approved pursuit, settled fake receipts, landing allocations, approved v3 statement, simulated collection, reversal, refund and reconciliation. Do not seed directly into the asserted end state.
- **`core-1000`** runs from fresh capture through the five-line cited confirmation, quote, acceptance, switch-live, approved extras, verified proof, final account, completed Final Check, £1,320 customer invoice/payment/reversal/correction and source-linked value screens in both browser projects. New v3 work creates no v1 cap or activation obligation; historical v1 regression tests remain.
- **The meter scenarios** reproduce the MON-2 figures, and the 13–17 profile raises `track_review_due` immediately on crossing Builder's grace place.
- **Dedicated scenarios** cover:
  - no proof;
  - prevention;
  - disclosure before lock;
  - evidence after lock;
  - disputed attribution;
  - unpaid catches;
  - partial and duplicate receipts;
  - stale authority;
  - unknown outcomes;
  - tenant isolation;
  - corrupted evidence.
- **Evidence.** An actual independent verdict covers the exact commit. Two non-technical builder observations are either recorded or listed as missing, never faked. Technical completion marks no gate or decision as passed.

### 10.5 Data model additions

Every table follows these rules:

- it is keyed by tenant, with foreign keys qualified by tenant and job;
- RLS is enabled and forced;
- `jobguard_migration` owns it;
- the runtime has no UPDATE, DELETE or TRUNCATE;
- evidentiary rows are append-only.

| Table or change | Card | Notes |
|---|---|---|
| `extra_origin` rows with small-builder kinds; `source_signal_id` | SV-2 | Shared table (9.1.5); serialises with ENT-4b; verifies SH-1’s backfill |
| `variation_withdrawal` | SV-2 | A withdrawn record stays in the capture register |
| `shadow_commercial_signal`, `shadow_signal_evidence`, `shadow_signal_ineligibility` | SV-2 | Granted only to `jobguard_shadow`; disclosure is monotonic |
| `shadow_reconciliation_run`, `shadow_signal_classification`, `shadow_signal_disposition` | SV-2, SV-5 | One classification per signal per run; dispositions bind exact lock lines |
| `shadow_disclosure_event`, `shadow_break_glass_access` | SV-2 | All disclosure goes through one routine |
| `final_account_lock` and scope dispositions | SV-4 | Unique per job; binds the 10.2.6 fields |
| `customer_invoice.invoice_kind` (`final\|supplementary\|interim`) and invoiced-line binding | SV-4 | Final and supplementary invoices need the lock and its completed, evidence-complete reconciliation run |
| `recovery_case.case_type` gains `missed_variation_final_account` and `duplicate_supplier_payment` | SV-5, CH-7 | Existing types kept; built on the accepted M4-1-S repair |
| `recovery_claim_line`, `supplier_credit_consumption`, `recovery_case_terms_approval` | CH-7 | Fixed compensation is never in Q; £250 minimum; terms needed before pursuit |
| `recovery_attribution_revision` | SV-6 | Each conjunct, with its source |
| `receipt_line_allocation` | M4-8-S | Exact rational gross and net, rule, source, reversal link |
| `success_fee_derivation`, `success_fee_journal` | M4-9-S | v3 only; no cap or credit columns; unique per source event |
| `platform_statement`, `platform_statement_line` | M4-10-S, MON-2A | One namespace; fee and subscription documents kept separate |
| `fee_collection_attempt`, `fee_refund`, `fee_collection_authority` | M4-12-S, MON-4 | Reservation; authority capped per verified fee |
| `job_activation_terms` | CH-1 | Replaces `cap_snapshot` for new jobs |
| `job_work_state_event`, `job_link` | CH-4 | Includes linked post-lock jobs |
| `job_small_trip_event`, `meter_day_ledger`, `meter_correction` | MON-1 | The ledger is a rebuildable projection |
| `subscription_plan_catalogue` (control plane), `subscription_agreement`, `subscription_period`, `subscription_period_line`, `plan_change`, `track_review_due` | MON-2A | Lines sum exactly to the period amount |
| `trial_entitlement`, `payment_method_reference` | MON-3 | Provider reference and fingerprint only |
| `customer_portal_link`, `customer_approval`, `customer_message` | MON-5 | |
| `job_diary_entry` | SV-7A | |
| `property_constraint_fact`, `counterparty_check` | MON-7 | Source and date required |
| `pay_now_link`, `managed_recovery_election` | MON-6, MON-9 | Gated |

### 10.6 Adversarial acceptance rows for Appendix A

| # | Attack or failure | Required result | Proven by |
|---|---|---|---|
| SB-01 | Builder runtime role reads a shadow table directly or through a view | Denied; no grant in the catalog | SV-2 |
| SB-02 | A builder view, count, error, cache key, export or timing varies with signals before lock | Byte-identical; no shadow query | SV-3, SV-4, CH-8, MON-1 |
| SB-03 | Disclosure through support, export, a data-subject access response or a defect before lock | Recorded; permanently ineligible | SV-2, SV-3 |
| SB-04 | A must-surface rule fires, but a model score says hold | Surfaced and audited; ineligible | SV-3 |
| SB-05 | Backdated evidence, or evidence received after lock | Server receive time rules; after lock never qualifies | SV-2, SV-5 |
| SB-06 | Double lock, replayed lock, or a later revision edits the lock | One lock, never altered | SV-4 |
| SB-07 | "Already included" with no matching line | Lock unchanged; disputed; no fee | SV-5 |
| SB-08 | A draft, rejected or withdrawn Log an extra treated as a catch | `builder_captured`; £0 | SV-1, SV-3 |
| SB-09 | One extra found in three sources | One signal, recovery and fee | SV-3, SV-6 |
| SB-10 | Detector or AI output creates a variation, case, attribution or fee input | Refused by type and schema | SV-1, SV-5 |
| SB-11 | Allocation picks the rule best for JobGuard, or split receipts change the fee | Fixed hierarchy; rounded once | SV-1, M4-8-S |
| SB-12 | A pre-catch deposit spread onto the catch | Never | M4-8-S |
| SB-13 | Refund, credit or reversal after posting | Linked compensation and refund; history kept | M4-9-S, M4-12-S |
| SB-14 | A receipt from before the case opened, or pursuit before terms | £0; pursuit refused | CH-7 |
| SB-15 | Fixed compensation, unconsumed credit, credit under £250 or insurer money in Q | Excluded | CH-7 |
| SB-16 | Subscription used to offset, credit or refund a fee | No such code path or journal link exists | MON-2, M4-17-S |
| SB-17 | A cached or mutated count changes a charge | Recomputed; alert; later correction only | MON-1 |
| SB-18 | Cap bypass by resume, reopen or import; pause rotation; early lock; import grace | Solo grace place, then refusal; Builder remains unblocked within its monthly maximum and raises track review; 7-day tail; linked job; same start rule | MON-1, CH-4, CH-5 |
| SB-19 | Signals or findings move the meter, a plan or a bill | Grant and architecture tests; identical bills | MON-1 |
| SB-20 | A period exceeds its monthly maximum | Never billed; alert | MON-2 |
| SB-21 | A second trial for the same company, or the same phone and card | Refused | MON-3 |
| SB-22 | A track change without a signed agreement | Stays on Builder at £169 or less | MON-2 |
| SB-23 | Fee collected before verified settlement, above it, or during a dispute | Refused or paused | MON-4, M4-12-S |
| SB-24 | Forged, stale or wrong-customer portal link | Fails; the exact revision is bound | MON-5 |
| SB-25 | Pay-now invoice differs when it carries a catch; customer surcharge | Identical; no surcharge | MON-6 |
| SB-26 | Links across tenants or jobs on signals, locks, allocations, attributions or periods | Composite foreign keys fail | SV-2, M4-8-S, MON-2 |
| SB-27 | Synthetic receipts used in pilot or production | Refused | M4-7-S, SV-8 |

### 10.7 Mapping from rev 2.5

| Rev 2.5 | Rev 3.0 |
|---|---|
| §14.1–14.11 | 10.1.2, 10.2, 10.3 |
| §14.12 | 10.5 (plus supplementary invoice, CH-7 records and meter tables) |
| §14.15 Tests A–R; §14.16 `shadow-30000` | 10.2.11, 10.3.5, 10.6; DEMO-S |
| §14.17 pilot measurement, §14.18 G4 additions, §14.19 order | §3 retains the charging prerequisites. A separately issued shadow-pilot extension (M1-15S, §11.2) measures builder captures, signals remaining at lock, false positives, confirmed and recovered amounts, disputed attribution, perceived fairness, harm from withholding, missed must-surface events, source usefulness, and hypothetical subscription/success fees against demonstrated value. It requires accepted shadow implementation, G1 and approved D12/D13 pilot scope; it never charges. §12 controls order. |
| SV-0 | Dropped as a task: its content is this revision. Adoption is the precondition for SV-1 and every new card (10.4) |
| SV-1…SV-6, SV-8 | Same IDs. SV-1 shares its allocation kernel with ENT-4a. SV-4 absorbs CH-4's scope-disposition rule. SV-5 now adds the case type. D11 signals move from SV-5 to CH-6. SV-6 consumes M4-8-S's allocator |
| M4-1-S, M4-2-S, M4-3-S (merged; HOLD, HOLD, FAIL) | Their repairs, M4-1-S-R, M4-2-S-R and M4-3-S-R, are dependencies of the cards that build on them |
| SV-7 | SV-7A (synthetic) and SV-7B (connectors, live) |
| `variation.origin` column (§14.12) | Rows in the shared `extra_origin` table |
| CH-1, CH-4…CH-9 | Same IDs. CH-1 also records the small-job flag and the track |
| CH-2, CH-3a | Shared section |
| MON-1 | MON-1, absorbing M4-14 |
| MON-2 | MON-2A and MON-2B, absorbing M4-11 and M4-11-S; Firm and Contractor plans removed; `track_review_due` added |
| MON-3…MON-7, MON-9 | Same IDs; MON-6 synthetic construction allowed after its task prerequisites; live use gated |
| MON-8 | Solo and Builder only; the tiered commercial layer and staff tiers are removed |
| MON-10 | Dropped: it existed only for the withdrawn Contractor plan |
| M4-11, M4-11-S, M4-14 | MON-2B, MON-2A, MON-1 |
| M4-5-S…M4-10-S, M4-12-S, M4-17-S | Same IDs, rewritten to v3. The dependency lines follow the 26 September adoption corrections (R01–R12): M4-8-S owns the allocator and depends on SV-2; M4-9-S depends on SV-6; M4-17-S depends on MON-2. CH-7 adds the fee-terms pursuit guard |
| VALUE-2 | CH-9 |
| DEMO-1 | DEMO-S plus the contractor demo; the v1 end states (£203, £241) are dropped |
| §3.5 v1 contract and fixtures | Historic; kept for merged tests only |
| §15.1 Firm/Contractor rows, £25/£30 extras, £329/£829 maximums, Firm Care | Dropped |
| §15.5 Firm+ and Contractor sales promises | The sales bible must remove them |

---

## 11. Shared platform and live work

Every task in this section inherits C1–C8 and AGENTS §2. For work that reaches live providers, real data or charging, C3 applies to its synthetic and provider-sandbox stages; the live stage additionally needs the release gate and decision records named in the card, and live providers, real data, spending, deploys and decision approvals remain founder-reserved. Native tasks (M3) meet C6 and C7 on the supported device matrix as well as in the web projects where they touch web code.

### 11.1 Foundation operations and live routes

### M0-6L Persisted entered-code sign-in and identity email
**Track:** shared
**Depends on:** M0-6 (merged scaffold), M0-4 (merged).
**Build:** replace the in-memory `MemoryAuthProvider` outside tests with a persisted implementation behind `AuthProvider`: challenges, sessions and invitations in the restricted identity/control-plane schema; the entered-code contract of `docs/contracts/authentication-v1.md`; an identity-email adapter on an approved regional route using the narrow bootstrap message category; secure web session cookies and the principal bridge for real users. The synthetic session remains for `synthetic_demo` only. Auth.js, if used, stays inside the adapter.
**Done when:**
- A new user signs up and owns one new tenant; an invited user joins only the intended tenant/role/email after verification. A client cannot self-select an elevated role.
- Code expiry, resend cooldown, request throttling, attempt limits, single use under concurrent submission, and non-enumerating responses are tested; codes/tokens never enter logs.
- NestJS rejects unauthenticated requests even when a web route was bypassed; revoked memberships cannot create new business commands. Tenant selection must match verified membership.
- An import/boundary test proves the only callers that construct a `verifiedContext`/`effective_tenant_id` for `withTenant` are the authenticated principal bridge; a negative test proves a request supplying `x-tenant-id`/`requested_tenant_id` that differs from verified membership is rejected, never honoured.
- The synthetic session cookie is refused in every mode other than `synthetic_demo`; identity email to a real address stays blocked until D04 approves its route.
- Auth.js imports exist only in the adapter; the documented mobile token/session extension point does not require mobile implementation yet.

### M0-12a Approved live Claude route and release-blocking live evaluation
**Track:** shared
**Depends on:** M0-12 (merged fixture-only gateway), JG-B (merged evaluation corpus).
**Build:** a Claude deployment adapter behind `packages/ai` on a proposed EU/UK processing route, reusing the merged strict schema/citation validation, bounded repair, timeout/cost limits, cancellation, prompt-injection-resistant separation of source data and provenance. Register the data flow. Live personal-data calls stay blocked until D04 approves the route; running live evaluations is founder-reserved spending.
**Done when:**
- A proposed EU/UK Claude route is verified for the actual features/model/profile; absent D04 approval, live personal-data calls are blocked. No silent global fallback exists.
- Relevant model/prompt/parser/schema changes trigger CI contract evaluation and a release-blocking live golden run in the approved region. Results record deployment/version/cost; test thresholds cannot be weakened silently.
- The live run reports the **proposed pilot evaluation targets** — ≥95% labelled scope-intent recall, zero unsupported monetary values labelled as extracted facts, 100% in-bounds persisted citations, and correct unknown/flag behavior on every designated ambiguity fixture — with numerators/denominators and per-case failures; passing does not imply universal accuracy.
- Feature code cannot import vendor SDKs or execute model-directed commercial actions.

### M0-12b Deepgram speech-to-text on an approved regional endpoint
**Track:** shared
**Depends on:** M0-12 (merged), M0-11 (merged), VOICE-1 (merged).
**Build:** Deepgram STT adapter behind `packages/ai` using an explicitly configured regional endpoint; audio registered as verified evidence before transcription; the transcript enters capture as its own labelled source kind. On-device browser dictation remains available and is never silently replaced by remote recognition. Register the data flow.
**Done when:**
- An explicit Deepgram regional endpoint is verified for the required APIs/settings; absent D04 approval, live personal-data audio is blocked. No silent global fallback exists.
- Capture recovers from an unavailable provider, timeout, partial transcript or missing audio upload without discarding the user's original input.
- Feature code cannot import the vendor SDK; the adapter passes its contract tests with a deterministic fake.

### M0-13a Pilot deployment, least privilege and outbound kill switches
**Track:** shared
**Depends on:** M0-9, M0-10, M0-11, M0-12 (all merged).
**Build:** deployable UK-region environments, TLS/private storage, secrets/least privilege, redacted observability, access revocation, incident/reconciliation ownership, and commercial outbound kill switches. Keep the no-charge pilot mode enforced. The synthetic Vercel + Neon demo (#35–#38) is a `synthetic_demo` deployment: reuse what meets these requirements, but it is not a pilot environment.
**Done when:**
- Alerts and ownership exist for queue failures, unknown sends, failed backups, unauthorized route attempts, and storage verification errors. Disabling outbound execution does not discard audit/evidence.
- The deployed runtime connects only as the non-owner business role, and the M0-4 catalog and isolation suites pass against the deployed database.
- Secrets are absent from the repository, build artifacts and logs; every personal-data destination, including backups and logs, is in the provider/data-flow register with its region.
- Deployment mode is set by the deployment, not by any API caller; a pilot deployment refuses synthetic commands, objects and settlements.

### M0-13b Backup, restore and recovery rehearsal
**Track:** shared
**Depends on:** M0-13a.
**Build:** backup and restore runbooks for the database, evidence object versions and independently restricted audit checkpoints; an isolated restore rehearsal from the deployed environment's actual backups. The JG-C fixture rehearsal (#75) is earlier evidence, not this rehearsal.
**Done when:**
- An isolated restore recovers database, evidence versions, and checkpoint references; verification checks tenant isolation, chain integrity, and representative artifact hashes. Record actual recovery/data-loss measurements against D07's approved objectives.
- A restored environment starts with external execution disabled; reconciliation precedes resumed dispatch, so no already executed send or charge is replayed.

### M0-13c Privacy operations: retention, export, deletion and access revocation
**Track:** shared
**Depends on:** M0-13a.
**Build:** retention/export/deletion procedures, access revocation and the data-subject request route under D07 and D12. For contractor tenants JobGuard acts as processor (D12 v4, proposed): requests about residents and clients are routed to the contractor as controller and executed on its documented instruction.
**Done when:**
- A deletion/export rehearsal handles source data, derived data, logs/backups according to policy, retained legal/accounting records, and in-flight work; it does not promise impossible immediate erasure from every backup.
- A request about a contractor's resident is routed to that contractor and executed only on its recorded instruction; one tenant's export or deletion cannot affect another.

### M0-13d Foundation gate evidence (G0 and G1)
**Track:** shared
**Depends on:** M0-13a, M0-13b, M0-13c, M0-6L.
**Build:** the G0 evidence pack and the G1 checklist with its evidence or its visible blocks; approved pilot terms stating no platform charge.
**Done when:**
- G0 evidence is complete. G1 requirements are either approved with evidence or visibly blocking real-data access; no owner approval is fabricated to close the task.
- A contractor pilot additionally shows the signed pilot agreement and data processing agreement (ENT-14) before any real contractor data is accepted.

**M0 exit:** all foundation acceptance tests pass; no unapproved real-data route, unrestricted financial writer, fake payment state, or commercial-send bypass exists. M1 may begin after G0; real-data pilot activation waits for G1.

### 11.2 Core-loop trial evidence

### M1-15T Unscripted builder trial
**Track:** small-builder
**Depends on:** UIWIRE-15 (merged). A trial on real data additionally needs G1.
**Build:** not code. Two builders run the supported journey unscripted in the practice sandbox, or after G1 in the no-charge pilot; an observing person records friction against `docs/UIWIRE-15-human-trial-checklist.md`; blocking defects become tasks. Agents cannot perform or record the observation.
**Done when:**
- Two builders complete the supported flow unscripted and observed friction is recorded. Blocking defects are resolved; the trial is described as usability/continuity validation, not proof of recovery economics.
- Gate G1 is satisfied before real data/send.
- Each checklist item is marked observed with observer, date and notes, or stays "Not observed".

### M1-15S Shadow-pilot measurement (no-charge)
**Track:** small-builder
**Depends on:** SV-6, CH-8, MON-1 (accepted), plus G1 and approved D12/D13 pilot scope for real data
**Build:** a no-charge pilot extension of M1-15T that runs the shadow bill and Final Check on real small-builder jobs with hypothetical fees only, and the measurement instruments: builder captures per job, signals remaining at lock, false positives, confirmed and recovered amounts, disputed attributions, perceived fairness after the reveal (including a randomised hidden-versus-shown arm where D13 permits), harm from withholding, missed must-surface events, source usefulness, and hypothetical subscription and success fees against demonstrated value.
**Done when:**
- Every metric is computed from immutable records with its method written into the pilot report; no pilot job accrues, invoices or collects a JobGuard fee.
- Fairness responses are collected after the reveal and reported separately from usage; missing observations are listed as missing, never inferred.
- The report is reviewed before G4-S; it is evidence for decisions, not an approval.

### 11.3 Watchdog depth

### M2-1 Materials model, agreed rates, and purchase-order pre-commit checks
**Track:** small-builder (live remainder). The synthetic web slice (M2-1-S, or M2-1A-S/M2-1B-S) is built (§7); this card covers approved live routes and providers, frozen held-out evaluation and G2 evidence. Its synthetic dependencies are met.
**Depends on:** M1-15T; the merged technical M1-15 slice is reused and does not substitute for the outstanding human trial.

**Build:** merchant/SKU/alias, agreed rates and validity, pack/unit conversions, PO/lines, required-on-site dates, and pure pre-commit checks for price, known stock, and delivery timing. Place/send an order only through an exact approved action; manual placement attestation is a separate fact.

**Done when:**
- A proposed order above its applicable agreed rate raises a cited Decision before placement. Rate version, tax basis, unit, and pack quantity are explicit.
- Unknown/stale stock or lead-time data is shown as unknown, not guaranteed availability. A revised price/quantity/recipient invalidates old order authority.
- Confirm/retry cannot place two orders for one approved business effect; same-tenant wrong-job links and duplicate supplier references are handled safely.
- Prevention findings are non-billable and cannot manufacture a recovery landing or fee.

### M2-2 Merchant document intake and delivery-note capture
**Track:** small-builder (live remainder). The synthetic web slice (M2-2-S, or M2-1A-S/M2-1B-S) is built (§7); this card covers approved live routes and providers, frozen held-out evaluation and G2 evidence. Its synthetic dependencies are met.
**Depends on:** M2-1.

**Build:** upload plus approved inbound email alias for merchant invoices, credit notes, and delivery notes; tenant-safe alias mapping; verified originals; duplicate intake identity; quarantine; pagination/multi-document splitting; and GRN capture with delivered quantities and partial deliveries. Do not implement matching in this task.

**Done when:**
- Re-upload/forward of the same underlying invoice produces a linked duplicate/candidate rather than duplicate debt. Invoice number alone is not treated as globally unique.
- Unknown senders/aliases, oversized/malicious attachments, cross-tenant routing, password-protected/unreadable files, and partially uploaded documents are rejected or held for review.
- Original object versions and source-page references survive splitting. GRNs distinguish ordered, delivered, rejected, missing, and later-delivered quantities.
- Inbound email/attachment processing is in the D04 register and cannot enable arbitrary outbound email or fetch untrusted remote URLs without controlled validation.

### M2-3 Document extraction with human confirmation
**Track:** small-builder (live remainder). The synthetic web slice (M2-3-S, or M2-1A-S/M2-1B-S) is built (§7); this card covers approved live routes and providers, frozen held-out evaluation and G2 evidence. Its synthetic dependencies are met.
**Depends on:** M2-2.

**Build:** text-first extraction for digital PDFs, OCR for genuinely image-only sources through an approved regional service, and a structured line proposal/review UI. Keep Textract/LLM-vision behind adapters; use the least complex approved route that meets the fixture requirement. Before M2-4 starts, also freeze the labelled matching corpus, development/held-out split, and M2-5 target definitions using manually reviewed ground truth.

**Done when:**
- Merchant identity, invoice/date/currency, line quantity/unit/net/tax/total, discounts, credits, and stated totals have page/region citations and confidence/provenance.
- Total reconciliation detects missing pages, decimal/quantity errors, duplicate lines, and extracted totals inconsistent with the document. Uncertainty requires review instead of a fabricated balanced total.
- Human corrections create confirmed document data and retained extraction history; AI output alone cannot establish an agreed debt, delivery, or fee.
- Fixture tests cover digital PDFs, photographed invoices, rotated/blurred images, multi-page documents, credit notes, and mixed pack units. At least 100 varied held-out document sets and a separate development set are labelled before matching is tuned; preserve their source hashes and frozen labels.

### M2-4 Deterministic three-way matching and correction workflow
**Track:** small-builder (live remainder). The synthetic web slice (M2-4-S, or M2-1A-S/M2-1B-S) is built (§7); this card covers approved live routes and providers, frozen held-out evaluation and G2 evidence. Its synthetic dependencies are met.
**Depends on:** M2-3.

**Build:** order ↔ delivery ↔ invoice matching using explicit merchant/SKU aliases, exact normalized references, quantities, units/packs, price validity, dates, and human-approved mappings. Represent partial/one-to-many matches and unmatched/ambiguous lines. Do not add vector search or LLM tie-breaking yet.

**Done when:**
- Fixtures cover partial deliveries, short delivery, duplicate invoices, split invoicing, agreed discounts, credits, pack conversions, substitutions, and a rate change outside its effective date.
- Price and quantity variance use the same net/tax basis and do not confuse an order estimate with an invoice obligation. Ambiguous matches remain unresolved.
- A reviewer can correct a match; correction is versioned/audited and reproducible, and does not retroactively rewrite original source data.
- Re-running the same facts produces the same match results and discrepancy identities. Concurrent corrections use revision conflicts rather than last-write-wins.

### M2-5 Evidence-linked discrepancy checks and held-out benchmark
**Track:** small-builder (live remainder). The synthetic web slice (M2-5-S, or M2-1A-S/M2-1B-S) is built (§7); this card covers approved live routes and providers, frozen held-out evaluation and G2 evidence. Its synthetic dependencies are met.
**Depends on:** M2-4.

**Build:** pure discrepancy checks over confirmed match facts, monetary exposure, cited findings/Decisions, and evaluation against the development/held-out benchmark fixed in M2-3. Define prevention versus potential recovery without deeming a detected variance billable.

**Done when:**
- A photographed invoice with a confirmed £320 net overcharge surfaces a Decision with the agreed-rate basis, invoice citation, matching quantities, and transparent arithmetic.
- The initial held-out benchmark contains at least 100 varied document sets with genuine matches, genuine discrepancies, and ambiguous cases. Publish class counts, confusion matrix, error examples, and uncertainty rather than a single accuracy claim.
- **Proposed release targets:** false-discovery proportion `FP / (TP + FP) ≤ 5%` among actionable monetary discrepancy Decisions; recall ≥90% for labelled discrepancies of at least £25 net. “No predictions” does not pass. Freeze labels/targets before tuning; changing them requires a recorded product decision.
- Precision/recall are measured on confirmed source facts separately from end-to-end extraction+matching, so extraction failures are not hidden. Deterministic critical fixtures must all pass.
- A Decision does not send a claim, classify cash as landed, or charge a fee. Gate G2 requires reviewed pilot feedback as well as the benchmark.

### M2-6 Site-readiness model, factual adapters, and scheduled checks
**Track:** small-builder (live remainder). The synthetic web slice (M2-6-S, or M2-1A-S/M2-1B-S) is built (§7); this card covers approved live routes and providers, frozen held-out evaluation and G2 evidence. Its synthetic dependencies are met.
**Depends on:** M2-5.

**Build:** planned work and typed dependencies; confirmed voice/text-derived planning proposals; readiness snapshots; Graphile evaluation schedules; approved Met Office/weather and jurisdiction-specific bank-holiday adapters; labour-cost exposure and resequencing proposals. Cure/technical requirements must come from a cited supplied specification or reviewed rule, not model invention.

**Done when:**
- A missing predecessor, required material, access, or crew fact raises a next-workday risk at the configured local time; fully ready work does not. Distinguish unknown from false.
- Time-zone/DST, weekends, different UK bank-holiday calendars, stale weather, changed dates, cycles, partial completion, and provider outage are covered.
- An LLM suggestion cannot silently change a work programme or technical cure requirement. A builder confirms changes; scheduling only records proposals/Decisions.
- Readiness captures are prevention and never fee-eligible, even when the estimated labour cost is high. Replays dedupe using fact/rule versions.

### M2-7 Inbox relevance, mandatory lanes, and outcome metrics
**Track:** small-builder (live remainder). The synthetic web slice (M2-7-S, or M2-1A-S/M2-1B-S) is built (§7); this card covers approved live routes and providers, frozen held-out evaluation and G2 evidence. Its synthetic dependencies are met.
**Depends on:** M2-6.

**Build:** separate mandatory/blocking and advisory queues, deterministic/optional semantic coalescing, per-user advisory budget, ranking, explanation, structured optional AI wording, feedback reasons, and a signal-to-noise dashboard.

**Done when:**
- Finding-to-Decision conversion, dismissal/confirmation, duplicate/coalesced count, time-to-decision, and later outcomes are measurable by rule/version without exposing sensitive message content.
- Mandatory proof, authorization, and commercial blockers cannot disappear under a money threshold, confidence threshold, or daily advisory cap.
- Semantic coalescing never merges different jobs, actions, recipients, or materially changed money; the retained Decision shows all relevant source findings.
- Generated copy cannot change the underlying amount/facts/action, introduce uncited claims, or bypass review. Existing deterministic copy remains a fallback.


### M2-8 Conditional matching enhancement: earn complexity with evidence
**Track:** small-builder
**Depends on:** M2-5 and M2-7-S (merged). Reuse the frozen synthetic corpus as earlier evidence; enhancement acceptance uses M2-5’s restored benchmark, including separately reported end-to-end extraction/matching results.
**Build:** inspect held-out failure clusters. Only where a documented gap remains, evaluate bounded fuzzy matching, then vector retrieval/LLM tie-break suggestions through approved adapters. Keep deterministic/human-confirmed matching as the authoritative basis.
**Done when:**
- The PR either records that no added technique is warranted, or documents a specific failure class, baseline, candidate, held-out improvement, latency/cost, and rollback switch.
- Any enabled enhancement meets the restored M2-5 gate: actionable-discrepancy false-discovery proportion ≤5%, recall ≥90% for labelled discrepancies of at least £25 net, non-empty predictions, frozen held-out labels, separately reported confirmed-fact and end-to-end extraction/matching results, and all deterministic critical fixtures; no evaluation examples are moved into the development set to inflate results.
- Suggestions retain evidence and require confirmation for ambiguity; generated matches cannot create a landed outcome, order, invoice obligation, or fee.
- New embeddings/model providers/storage are tenant-scoped and D04-approved. No technology is added simply because the original roadmap mentioned it.

**M2 exit:** the £320 discrepancy is genuinely derived from confirmed source documents; readiness checks use explicit facts; G2 and the held-out tests pass. Findings remain human-reviewed, and prevention remains non-billable.

### 11.4 Field app and offline

The risk validation is explicitly first. Do not interpret a later task number as an instruction to start it earlier. M0's command contract is the base; M3 freezes its download/upload/conflict profile before feature screens depend on it. The contractor operative app (ENT-12) is M3 scoped to the operative's jobs, "Log an extra", photos, resident sign-off and the close-out question; it builds on M3-1 and follows the same acceptance.

### M3-1 Native/sync risk slice and versioned offline contract
**Track:** shared
**Depends on:** none (uses the merged M0 command and auth contracts).
**Build:** minimal Expo development build on supported iOS/Android, encrypted SQLite/PowerSync adapter compatibility slice, and one authorized read plus one queued command round trip. Define client UUIDv7, HLC metadata, schema/event versions, server ordering, migrations, data classification, stale-command behavior, and unsupported offline operations.
**Done when:**
- A physical-device development build proves the selected encryption and sync adapter works; a successful Expo Go demo alone is insufficient. Record exact versions/build flags and approved hosting route.
- Contract specifies three classes: allowlisted non-commercial field merge; append-only facts; validated state/financial commands. Financial approvals and money are not last-writer-wins.
- Multi-crew property tests cover duplicate, reordered, delayed, concurrent, and clock-skewed commands with stable convergence or explicit conflicts. IDs/HLC do not override server permission/revision checks.
- D08 is approved before real-data distribution. An incompatible stack/region result blocks the affected feature and produces a decision, not an unencrypted/global fallback.

### M3-2 Native authentication, encrypted local store, and device lifecycle
**Track:** shared
**Depends on:** M3-1, M0-6L.
**Build:** Expo shell, `AuthProvider` mobile exchange/refresh path, platform secure key storage, encrypted local database/files, per-user/tenant caches, logout/tenant-switch cleanup, and a bounded offline read lease under D08.
**Done when:**
- Extracted database/media files do not reveal plaintext without the device-held key; release build settings prove encryption is active, not only a named dependency.
- Access/refresh credentials never enter general SQLite, logs, or sync tables. Refresh rotation/revocation, cold start, expired session, tenant switching, and local migration are tested.
- Logout removes keys/caches and queued sensitive content according to policy, with explicit handling of unsynced work. A newly signed-in user cannot inherit another user's cached tenant data.
- Offline revocation limits are documented: a disconnected device cannot learn a new revocation instantly. Lease expiry and reconnect checks bound access; the UI never promises immediate remote erasure while offline.

### M3-3 PowerSync download authorization and minimal read models
**Track:** shared
**Depends on:** M3-2.
**Build:** tenant/user/role-scoped sync streams/rules and least-data read projections, approved-region sync deployment, scoped token issuance, and revocation/re-subscription behavior. Exclude secrets and unnecessary banking/financial details from field sync.
**Done when:**
- Two-tenant/multi-role download tests prove no unauthorized rows are synced even when the client requests another tenant or modifies query parameters.
- Download policy is tested independently of PostgreSQL RLS; provider replication privilege does not make every replicated row visible to clients [R10].
- Membership/role change and tenant switch stop new unauthorized downloads and trigger local cleanup as soon as policy/reconnect allows. Resync/migration cannot restore purged unauthorized rows.
- Large initial sync, interrupted sync, deletion/tombstones, and minimal projection rebuilds are tested without exposing provider tokens or full bank transaction history.

### M3-4 Offline command outbox, upload authorization, and conflicts
**Track:** shared
**Depends on:** M3-3.
**Build:** durable encrypted client intent queue with command ID/payload hash/expected revision, server upload endpoint through the existing command dispatcher, acknowledgment/rejection states, retry/backoff, and user reconciliation UI. No direct client writes to authoritative money/approval tables.
**Done when:**
- Reconnect/retry/reinstall-recovery scenarios do not duplicate semantic effects. Same key/different payload is rejected, and authenticated server membership is rechecked at upload.
- Stale price, accepted-version changes, revoked permission, expired approval, or conflicting completion produce explicit conflicts requiring appropriate re-review, not silent "success".
- Commercial outbound actions are queued intent only until the server validates them online; changed recipients/content require renewed authority. A queued action is never shown as sent or paid.
- Offline merge tests are restricted to the explicit low-risk allowlist; all other fields use append-only or expected-revision semantics. Poison commands do not permanently block unrelated safe queue items.

### M3-5 Offline voice/photo capture and resumable evidence upload
**Track:** shared
**Depends on:** M3-4.
**Build:** local text/voice/photo capture, client hash and source timestamps, encrypted pending media, resumable upload, server verification/finalization, and queued AI extraction when online. Offline media is not yet authoritative server proof.
**Done when:**
- Capture survives airplane mode, app termination, device restart, low storage, and interrupted upload without losing scope identity or duplicating confirmed evidence.
- Server hash/version verification remains authoritative; client hash/time are useful metadata, not trusted settlement/proof authority.
- Pending proof cannot complete a server-required stage until upload and finalization succeed. The UI shows local-only, uploading, verified, rejected, and conflict states.
- Local deletion/retention and failed-upload cleanup preserve user intent and privacy. Audio is sent only through the approved gateway after access/processing authorization is valid.

### M3-6 Mobile core-loop screens on shared domain contracts
**Track:** small-builder (the contractor operative screens are ENT-12)
**Depends on:** M3-5.
**Build:** walk/review, job list, quote preview, acceptance/switch-live intent, inbox, proof, variations, final account/invoice preview, and payment-record screens using `packages/core` and the same API/commands as web.
**Done when:**
- Supported mobile flows yield the same server revisions, totals, audit, and authorization records as web; no duplicate mobile-only fee or state-machine implementation exists.
- The app clearly distinguishes offline capture/edit intent from online-only approval/issue/send/charge operations. It cannot silently approve an obsolete commercial snapshot on reconnect.
- Accessibility, small screens, media permissions, denied camera/microphone, and intermittent connectivity have usable error/recovery paths.
- No server/vendor secret is bundled in the app, and all network routes appear in the provider register.

### M3-7 Device chaos/regression suite and native release gate
**Track:** shared
**Depends on:** M3-6 for the small-builder app; ENT-12 for the operative app.
**Build:** versioned physical-device test matrix, upgrade/resync/restore scenarios, multi-crew conflict runs, lost-device/security review, operational sync telemetry, and rollout/rollback procedure.
**Done when:**
- Full field journey passes on supported iOS/Android builds: offline capture → app restart → reconnect → confirm proposal → prove work → resolve conflict → server-authorized commercial action.
- Duplicate uploads, wrong-tenant tokens, membership revocation while offline, clock skew, corrupted cache, schema upgrade, and stale approval are all covered with expected outcomes.
- G3 has evidence for encryption, independent download/upload authorization, bounded offline access, migration safety, and support ownership.
- Web remains a supported office/field fallback; a native rollout failure does not require bypassing server authority or dropping unsynced work without explanation.

**M3 exit:** offline capture is resilient; commercial truth remains server-authorized; G3 passes. Native support does not introduce a second job spine, ledger, or permission model.

### 11.5 Recovery, billing and live money

Implement and test against provider sandboxes first. Real pursuit, bank access, invoices, and payment collection each require their applicable approvals. Core recovery/payment readiness and expanded customer-billing readiness are independently gated capabilities; completing an unrelated tax template is not proof that a payment rail is safe, or vice versa. The applicable core track gate, G4-C or G4-S, can be reviewed after M4-17 without enabling expanded customer billing. All planned tasks still require their own acceptance before milestone exit; a disabled or unapproved feature is not silently counted as completed. Where a synthetic web slice exists (M4-x-S), the live task depends on it and completes the live acceptance.

### M4-1 Full RecoveryCase state machine and case workbench
**Track:** small-builder
**Depends on:** M4-1-S-R, M1-13.
**Build:** extend the minimal case/events model to the complete §5.5 transition table, the D03 v3 case types (including `missed_variation_final_account`), claim amount/revision, evidence completeness, partial outcomes, negotiation, closure, disputes, and reopen-on-reversal. Keep all claim amendments explicit.
**Done when:**
- Every permitted/forbidden transition is covered, including direct receipt after evidence assembly, partial recovery plus write-off, closed-case reversal, and duplicate transition commands.
- `prevented` is terminal and non-billable; an agent/user cannot relabel the same prevention as landed to create a fee. A genuinely separate later recovery requires a separately evidenced case/identity.
- Claimed, disputed, eligible, landed, reversed, and outstanding amounts remain distinguishable; a status label does not manufacture cash.
- The case workbench displays source facts, unresolved ambiguity, next authorized action, and complete append-only history.

### M4-2 Billability/attribution policy and review workflow
**Track:** small-builder
**Depends on:** M4-1, M4-2-S-R.
**Build:** versioned D03 v3 eligibility policy with default non-billable classifications, including `missed_variation_final_account` catches (which also require the D13 attribution predicate and a final-account lock) and the builder-opened withheld-payment entry test; a cited classifier may propose but not decide; human review records category, attribution, claimed eligible principal, exclusions, and reasons. Resolve D01–D03 and D13 for any intended production fee path before enabling it.
**Done when:**
- Pending cash, ordinary customer payments unrelated to the recovery case, duplicate claims, unapplied credits, prevented spend, and unverified manual receipts cannot qualify as landed recoveries.
- A builder-captured item, or a catch disclosed before lock, never qualifies.
- Approved billability is tied to exact case/evidence/policy versions and the authorized reviewer. A high AI confidence cannot override a failed rule or missing proof.
- Uncertain causation/amount/tax basis is held non-billable until reviewed. Historical policy changes do not silently expand entitlement on existing cases.
- Owner/adviser approval evidence is stored for D01–D03 and D13 or production fee functionality remains disabled; a green classifier test is not commercial approval.

### M4-3 Deterministic evidence-bundle assembly and verifier
**Track:** shared
**Depends on:** M4-3-S-R; M4-2 for recovery-case bundles; ENT-5 for contractor approval bundles.
**Build:** deterministic scope/revision joins for quote acceptance, variations, work proof, orders/deliveries/invoices, case history, and relevant landed-money evidence; versioned bundle manifest and PDF/ZIP export; minimal disclosure/redaction; standalone verification of hashes and audit checkpoint references. Small-builder bundles also carry the final-account lock, capture snapshot, source observations, reconciliation, reveal, disposition, confirmed recovery and qualifying settlement. Contractor bundles carry the extra's origin record, approvals, export, invoice and payment status.
**Done when:**
- The same selected immutable inputs produce the same ordered manifest and content digests. Each assertion traces to an actual source/revision, not current mutable working data.
- Missing originals, wrong versions, altered files, cross-tenant/scope mislinks, and stale approvals are detected before a bundle is offered as complete.
- Redacted copies are derived artifacts linked to originals; bundle authority binds the exact exported set and intended recipients. Unrelated bank transactions/personal data are not included by default.
- The verifier distinguishes intact content, absent files, untrusted/missing checkpoint, and externally unverified claims. It does not certify workmanship or customer agreement merely from hashes.

### M4-4 WORM retention, legal holds, and external timestamp anchoring
**Track:** shared
**Depends on:** M4-3.
**Build:** S3 Object Lock on approved evidence versions, D07 retention classes/hold-release workflow, independently restricted checkpoint retention, and an approved RFC-3161 timestamp adapter for manifest/checkpoint hashes. Pin algorithms, verification policy, and certificate/trust data.
**Done when:**
- Tests against the actual configured object store show the selected version's retention/hold behavior; a new object under the same key does not substitute for it. Local MinIO behavior is not assumed identical to production S3.
- Retention/deletion conflicts are resolved by documented policy with authorized holds/releases; the application cannot arbitrarily erase locked evidence or retain all personal data forever.
- Timestamp responses are validated against requested imprint/nonce, policy, trusted signer/certificate, and time assumptions; store the token and verification material. Service failure marks anchoring pending, not falsely complete.
- The artifact states the supported claim: integrity and existence relative to trusted timestamp/checkpoint. Device capture time, truthful work, enforceability, and absolute tamper-proofness are not asserted.

### M4-5 Reviewed pursuit templates, drafting, and builder-approved sends
**Track:** small-builder
**Depends on:** M4-4, M4-5-S, CH-7.
**Build:** versioned factual claim/reminder templates within D10's approved scope, structured AI drafting from cited case facts, tone/prohibited-claim checks, explicit recipient/attachment preview, and send through the established outbox. The builder is the identified sender/decision maker; no autonomous collection service is introduced.
**Done when:**
- Each factual amount/date/allegation in a draft has evidence or is clearly marked for human input; generated threats, invented deadlines, or implied legal authority cannot bypass review.
- A builder approves exact text, attachments, sender identity, and recipient before dispatch. Changed evidence/amount/content requires a new approval.
- D10/legal review covers supported activity and template use; passing a tone filter is not recorded as regulatory compliance.
- Failed/unknown sends and recipient corrections follow the established reconciliation/reapproval path. A scheduled reminder is only a pending Decision unless separately authorized under approved policy.

### M4-6 Temporal recovery orchestration and scheduling ownership
**Track:** small-builder
**Depends on:** M4-5, M4-6-S.
**Build:** Temporal workflows for long recovery waits, builder responses, evidence completion, reminders, and closure; activities call idempotent application commands/services. Register workflow ownership and migrate any relevant Graphile scheduling responsibility exactly once.
**Done when:**
- Replay/restart, duplicate signals, workflow-version upgrade, cancellation, and delayed responses produce no duplicate case transition, message, or financial effect.
- Graphile remains responsible for the generic outbox/execution infrastructure; Temporal owns the named recovery timeline. Neither independently schedules the other's same commercial action.
- A timer produces a Decision/task or executes a previously approved bounded action; elapsed time never creates new authority. Permission/consent revocation is respected on execution.
- Region/data-retention approval includes Temporal history and payloads; workflows store references/minimal data rather than whole bank statements or message bodies.

### M4-7 TrueLayer consent route, account linking, and transaction ingestion
**Track:** small-builder (the contractor track needs no bank feed; its settlement comes from the contractor's own billing and payment data)
**Depends on:** M4-6, M4-7-S.
**Build:** D10-approved AIS onboarding/consent, scoped account connection, secure tokens, consent expiry/revocation, settled and pending transaction ingestion, durable source identity, pagination/backfill, and redacted observability. Do not ingest more account data than the approved purpose requires.
**Done when:**
- The actual regulated/non-regulated client route and required provider consent are verified, not assumed from possession of an API key [R16]. G1/D04/D10 approvals cover the selected features and destinations.
- Pending and settled transactions remain distinct [R17]; a bank transaction observation alone does not mark a case landed or authorize fees.
- Duplicate pulls, pagination overlap, changed provider IDs/observations, out-of-order updates, consent expiry, account unlink, and token revocation are handled without duplicate cash identities or data leaks.
- Tokens never appear in field sync/exports/logs. Authorization binds account ownership to the correct tenant; forged callbacks or swapped account references fail.

### M4-8 Landing reconciliation, partial allocations, and reversal controls
**Track:** small-builder
**Depends on:** M4-7, M4-8-S.
**Build:** deterministic cash-to-case matching suggestions using approved evidence, amount/reference/counterparty/date constraints, human confirmation, gross/net/tax allocations, shared-receipt allocation, duplicate underlying movement reconciliation, and reversal/dispute handling. Allocate customer receipts to caught items by the first rule that fits — explicit allocation, then separate invoice, then pro-rata across the lines outstanding at the moment of the receipt — as exact rationals rounded once at fee derivation; never choose the rule that pays JobGuard most.
**Done when:**
- An approved £320 case and later £2,500 case can be allocated to actual sandbox settled transaction facts with finalized proof; ambiguity requires review, and a pending match never qualifies.
- Allocations across cases/jobs cannot exceed a transaction's available amount or a claim's remaining eligible principal. Concurrent assignments cannot double-count cash represented by both an API feed and a statement file.
- The success-fee allocation fixtures (blended invoice part-payment, a deposit received before the catch existed, a separate catch invoice) reproduce exactly from sandbox settled facts.
- Partial receipts, partial refunds, transaction corrections, chargebacks/disputes, and case closure/reopening produce append-only changes and block obsolete fee collection.
- Confirming landing checks current policy/permissions/evidence, records the actual reviewer, and creates an immutable qualifying allocation. There is no writable `landed=true` shortcut.
- Sandbox events/evidence cannot qualify for production, and ordinary "mark customer paid" records from M1 are not automatically imported as recovery proof.

### M4-9 Production fee derivation and authorized accrual
**Track:** shared
**Depends on:** M1-13; M4-8 for the small-builder success fee; ENT-7 for the contractor fee.
**Build:** release the controlled cumulative fee routine against each track's approved policy — the small-builder success fee (D01 v3, `reference_fee_policy_v3`: 10% of cumulative qualifying recovered net principal; no cap, base plan or credit) and the contractor fee (D16: 10% of cumulative paid site-originated net principal per tenant and enterprise_agreement_version) — with per-job locks for small-builder fees and per-tenant enterprise_agreement_version locks for contractor fees (two extras on different client contracts but the same agreement version share one cumulative rounding and posting lock; two 5p qualifying contributions produce a cumulative 1p fee, not two separately rounded zero fees) and semantic uniqueness; immutable derivation breakdowns; statement approval; positive/negative posting; replay/rebuild checks. Subscription obligations are derived separately from D09 terms and never offset a fee. Continue to use the pure exact-money implementation, not AI or provider floating-point totals.
**Done when:**
- The success-fee and contractor-fee fixtures pass for the adopted policies, plus production-policy-specific fixtures; the v1 fixtures keep passing against historic synthetic data only. A different approved policy updates examples/tests explicitly before release.
- Two small-builder cases racing on the same job, or two contractor extras on different client contracts racing under the same tenant and `enterprise_agreement_version`, receipt splits, repeated events, and reversal after fee posting cannot overstate net liability or post the same derivation twice.
- No office-entered, order-line or client-instructed amount enters the contractor fee base, and no builder-captured or disclosed-before-lock amount enters the small-builder fee base (tested in PostgreSQL).
- A positive posting requires approved qualifying proof and exact statement authorization. Direct SQL insert, wrong environment, stale statement, unapproved policy, or evidence invalidation fails through structural controls.
- Negative rederivations preserve the historical journal and create linked compensation/credit work. Previously collected excess is visible as refund/credit due, not hidden by clamping a balance to zero.
- Rebuilding from immutable events yields the same net fee liability and source attribution. the applicable track gate (G4-C or G4-S) is still required for production enablement.

### M4-10 Platform tax invoices, credit notes, and statement of account
**Track:** shared
**Depends on:** M4-9.
**Build:** JobGuard's own invoice issuer/profile/numbering, approved VAT/tax policy, line-level provenance, separate subscription-period lines and success-fee lines (small-builder) and monthly contractor-fee lines (contractor), credit-note/refund obligations, and principal/tax/gross statements. Keep platform documents distinct from builders' and contractors' customer invoices.
**Done when:**
- D02-approved examples show correct principal, VAT, gross, already paid amounts, and remaining cash due.
- Subscription and fee lines never offset each other, and no base-plan or credit line exists. Accountant-approved examples cover already invoiced periods and subsequent fee compensations.
- Issued invoices are immutable and sequentially/uniquely identified within the issuer; corrections use linked credit notes. A fee derivation is not assumed to be an issued invoice.
- A builder can trace each success-fee line to approved qualifying proof, policy, and prior settlements; a contractor can trace each fee line to its origin record, approvals, invoice and payment. Confidential bank details are minimized.
- No collection is started merely by rendering a statement or issuing an unsupported/gated document.

### M4-12 Fee collection and refund execution
**Track:** shared
**Depends on:** M4-10; M4-13 for small-builder agreement authority; ENT-14 for contractor agreement authority; MON-2B wherever the shared Stripe adapter is enabled.
**Build:** collection for an exact approved success-fee statement or contractor monthly statement/gross balance, allocation to immutable invoices, safe outstanding-balance recomputation, and explicitly authorized refund/credit execution; Stripe is the card rail here and M4-15 adds Direct Debit on the same reservation interface. Default to a separate Decision per statement. Each rail can remain disabled independently.
**Done when:**
- Collection cannot exceed the currently approved outstanding principal+tax balance after credits/prior receipts. The outstanding balance is recomputed from current derivations before collection; an obsolete statement is never collected.
- A newly invalidated landing, reversal, refund obligation, revoked authority, or changed invoice version stops an unsent collection attempt and raises reapproval/reconciliation.
- Concurrent collectors and alternate payment attempts cannot reserve/collect the same outstanding balance twice. Reservation, provider acceptance, settlement, and release on definite failure are explicit.
- Refunds are linked to original settlements/credit notes and cannot exceed refundable value. Unknown refund outcomes are reconciled, not repeatedly paid out.
- Tests cover webhook replay, provider-side duplicate event objects, double-clicks, crash after provider acceptance, and a fee subsequently reversed to zero.

### M4-13 Subscription and success-fee agreement (small builders)
**Track:** small-builder (the contractor equivalent is the master services agreement in ENT-14)
**Depends on:** MON-2A, M4-10. This task establishes the approved terms/mandate contract consumed by MON-2B and M4-12; it does not depend on execution of collection.
**Build:** D05/D09 v4-approved terms: exact plans and prices by version, billing-period basis, the 7-job line and the move to the contractor deal, the success-fee terms (D01 v3, D03 v3, D13), cancellation, and a bounded standing authorization permitting only the specified renewals, extra-job charges within the monthly maximum, per-statement fee collection and notices. Disable provider-default automations that exceed that authorization.
**Done when:**
- no recurring or statement collection without a human-approved terms/mandate record; changes to price, allowance, frequency or scope follow the approved notice/reauthorisation policy; revocation and cancellation block future initiation and trigger provider-side cancellation, with in-flight actions reconciled honestly; failed renewals, retries, pauses, trial/pilot exemption, refunds and provider-managed email settings covered; a worker cannot invent a plan change; discounts and credits have explicit allocation and never offset a fee.

### M4-15 GoCardless Direct Debit as a separate payment rail
**Track:** shared
**Depends on:** M4-12.
**Build:** approved hosted mandate setup, mandate/payment lifecycle, notification requirements, signed webhook ingestion, idempotent collection/refund adapter, and same invoice/balance reservation interface as Stripe. Add actual provider rules/settings to D04/D05.
**Done when:**
- Mandate creation/authorization, pending submission, confirmed collection, cancellation, failure, chargeback/indemnity events, and retries remain distinct; creating a payment request is not "paid".
- Signed events, duplicate deliveries, per-event processing in batch webhooks, and environment/account routing are validated [R21]. Core ledger reconciliation does not trust an unsigned payload.
- A Stripe attempt and a Direct Debit attempt cannot both collect the same reserved invoice balance; rail switching requires definite cancellation/failure or manual reconciliation of an unknown outcome.
- Revoked mandates/standing authority block new collections as required; required notices and provider-managed messages match approved terms.
- Sandbox success is recorded as sandbox evidence; production enablement is independent and requires the applicable track gate (G4-C or G4-S) review.

### M4-16 Dunning, retries, cancellation, and commercial communication control
**Track:** shared
**Depends on:** M4-15.
**Build:** approved retry/dunning policy, unpaid invoice workbench, reminder Decisions or bounded standing-authority execution, dispute/refund suppression, provider-automation inventory, and account/plan suspension rules that preserve data access required by policy.
**Done when:**
- Dunning never pursues a disputed/reversed/paid amount or a no-charge pilot job. Changed balances regenerate drafts and invalidate stale amount approvals.
- Payment retries stay within provider and D05 authorization; no second orchestration system independently retries the same payment. Failed consent/expired authority requires renewed action.
- Customer/supplier communication and platform-to-builder collection messages are categorized explicitly, with exact recipients/content or approved template/variable bounds. Provider automatic emails cannot bypass these rules unnoticed.
- Stopping collection and changing account service status preserve ledger/evidence/export access according to approved terms; no destructive "delete unpaid customer" shortcut exists.

### M4-17 Financial reconciliation, operational controls, and money-surface review
**Track:** shared
**Depends on:** M4-16.
**Build:** daily/on-demand reconciliation of internal invoices/journals/reservations with provider payments/refunds/fees/payouts and bank observations; unexplained balance queue; adjustment approval; backup/restore of financial history; targeted independent security review of the money surface.
**Done when:**
- Reconciliation explains gross charged, provider fees, net payout, VAT, allocations, refunds, and outstanding clearing without treating a net payout as the gross recovered amount.
- Seeded missing/duplicate/late events, partial payouts, orphaned provider payments, and reversal discrepancies are surfaced and repaired through authorized append-only facts, not manual row editing.
- A restored environment reproduces balances and proof and fee-derivation history while keeping external execution disabled until reconciliation prevents replaying already executed actions.
- Money-surface review covers privilege escalation, RLS/context misuse, webhook forgery/replay, fee-proof bypass, IDOR, outbox authority, and cross-rail duplicate collection; critical findings are fixed before production.
- The core recovery/payment part of the applicable track gate (G4-C or G4-S) has an evidence pack. Any incomplete rail/policy remains server-disabled.

### M4-18 Interim applications and staged customer invoicing
**Track:** small-builder
**Depends on:** M4-17, M1-12.
**Build:** versioned interim application/valuation model, approved contract schedule, prior-certified/prior-invoiced/paid distinctions, cumulative value reconciliation, and customer issue/send through exact Decisions. Preserve the accepted baseline and approved variation lineage.
**Done when:**
- Applications, certified sums, invoices, and cash receipts are different records; cumulative billing cannot invoice the same completed value twice.
- Prior applications, approved variations, partial payments, omitted work, and credit notes reconcile to the eventual final account without rewriting earlier documents.
- D06-approved contract/jurisdiction templates and D02 tax rules gate real issue. Unsupported arrangements stay drafts with clear errors.
- A timer or valuation suggestion cannot issue a contractual document without required authority.

### M4-19 Reviewed construction notices and service/deadline workflow
**Track:** small-builder
**Depends on:** M4-18.
**Build:** professionally reviewed notice templates/rule profiles for the explicitly supported jurisdictions/contracts; structured input checklist; deadline calculator with source/version; service-method evidence; preview and human approval. Do not hardcode a universal "UK Construction Act deadline".
**Done when:**
- An appropriate reviewer signs off the supported templates, required facts, trigger/date rules, and service assumptions; missing review disables real notice generation/send.
- Fixture suites supplied/approved with the review cover contract-specific dates, weekends/holidays where relevant, changed due dates, missing facts, and documented service methods. Unsupported cases are flagged for advice.
- Sending records the exact notice/version/recipient/method and provider/service evidence; queued/provider-accepted/read/legally served are not collapsed into one flag.
- No AI-generated legal assertion or tone-filter pass substitutes for the reviewed rule/template and human authorization.

### M4-20 Retention balances, release review, and durable timers
**Track:** small-builder
**Depends on:** M4-19.
**Build:** contract-specific retention principal and tax treatment, release conditions, due-date/source records, retained balances, release approvals, and durable reminders under one named orchestration owner.
**Done when:**
- Part releases, changed completion/defects dates, payment reversals, final retention, and already-billed amounts reconcile without duplicate release invoices.
- A timer raises a release review/Decision; it cannot invent satisfaction of a contractual condition or issue an unapproved notice/invoice.
- Every deadline/condition traces to an approved contract profile or human input; unsupported terms are not guessed.
- Retention release is not automatically classified as a fee-eligible recovery. D03 attribution and qualifying settlement still apply separately.

### M4-21 Expanded VAT treatments and DRC customer invoicing
**Track:** small-builder
**Depends on:** M4-20.
**Build:** D02/D06-reviewed tax codes and eligibility inputs for supported zero/reduced/non-VAT/DRC cases, required document wording/data, and retention/interim interactions. Keep each treatment and policy version explicit; missing eligibility does not default to 20%.
**Done when:**
- Adviser-approved fixture sets cover supported treatments/combinations, credit notes, partial/interim billing, retained amounts, and required calculation bases [R13, R14].
- Unsupported/missing status or conflicting inputs block issue; a model cannot decide tax registration, end-user status, or legal applicability from job description alone.
- Customer invoice net, VAT treatment, gross, retention, and expected cash remain separately reconcilable. DRC is not represented as a commercial discount or waived customer debt.
- The new support matrix is explicit and versioned. M1's 20%-only restriction is relaxed only for tested, approved cases, not globally removed.

### M4-22 CIS verification, deductions, and payment reconciliation
**Track:** small-builder
**Depends on:** M4-21.
**Build:** reviewed CIS verification/status records, eligible deduction bases, required deduction/payment documentation, and reconciliation to customer/subcontractor payment records within the approved product scope. CIS is a separate regime, not a VAT rate or recovery-fee deduction.
**Done when:**
- Adviser-approved fixtures cover supported verification statuses, applicable deduction bases, materials/VAT treatment, partial payments, corrections, and interactions with the VAT/retention profiles already implemented [R22].
- Missing or stale verification/status inputs block the applicable real calculation/issue path; the system does not invent a status, submit a statutory return, or claim a verification occurred without its evidence.
- Invoice value, VAT, CIS deduction, retention, and actual cash reconcile separately. A correctly evidenced deduction is not automatically classified as unpaid debt or a fee-eligible recovery.
- Human-approved documents preserve source calculations and policy versions; corrections use the appropriate versioned/compensating records, not edits to historic issued statements.

### M4-23 End-to-end outcome acceptance and controlled production release
**Track:** shared
**Depends on:** M4-9, M4-10, M4-17 for the core release of both tracks; ENT-7 for the contractor track; M4-18–M4-22 only for the expanded construction-billing release.
**Build:** integrated sandbox acceptance pack, pending-policy/rail inventory, core recovery/payment gate review, separate expanded-customer-billing review, live smoke-test procedure, rollback/disable plan, and evidence-based rollout checklist.
**Done when:**
- Small-builder track, in sandbox: detect a £320 evidenced overcharge → confirm billability → assemble a verifiable pack → builder approves pursuit → settled money is ingested and allocated → exact approved fee statement (£32 principal) posts/collects once → reconciliation balances. A Final Check catch (£800 recovered, £80 fee) does the same.
- Repeat with no proof, prevented loss, a builder-captured item, a catch disclosed before lock, partial receipt, duplicated/out-of-order events, refunded landing, revoked consent, unknown provider outcome, and competing payment rails; no unjustified positive fee results.
- Contractor track, in sandbox: an operative logs an extra → the contract's approvals → export → the contractor's billing and payment status import → the monthly statement and platform invoice post and collect once → reconciliation balances. Repeat with an office-entered extra, an order line, a client-instructed variation, a rejected extra, a part payment, a credit and a duplicate log; no unjustified positive fee results.
- The applicable track gate (G4-C or G4-S) approvals authorize a bounded, explicitly consented live smoke test before general billing. The test is reconciled and reviewed before wider enablement; sandbox success alone does not open production.
- Expanded construction billing is enabled only for specifically approved/tested jurisdictions and treatments. Other regimes remain disabled. The release record lists exactly what is enabled, for whom, and under which policy/jurisdiction; any deferred task requires an explicit approved scope change, not a false completion claim.
- Nothing retroactively bills the no-charge pilot population. No claim of regulatory approval, guaranteed recovery, or certification is made from technical completion alone.

**M4 exit:** qualifying outcomes, fees, invoices, and collection are independently evidenced and reconciled; no-proof/no-fee (small-builder), paid-site-origin-only (contractor), once-only fee derivation, human authority, and compensating corrections hold under failure and concurrency. Unapproved rails or customer-billing regimes remain disabled and explicitly unshipped.

### 11.6 Integrations, hardening and enterprise controls

Basic backups, restore, privacy operations, permissions, and financial security were prerequisites earlier; this work expands them rather than introducing them for the first time. Each connector uses the existing job spine and authorized command boundary.

### M5-1 Accounting export model and Codat integration
**Track:** small-builder
**Depends on:** M4-23.
**Build:** canonical accounting export contract, external ID/mapping ledger, D02-approved tax/account mappings, Codat adapter, human-confirmed export preview, idempotent push/reconciliation, and consent/data-flow approval. Start with a bounded documented direction/scope rather than universal two-way sync.
**Done when:**
- Customer invoices, credits, receipts, and approved tax/retention/CIS/DRC fields map to supported target objects without losing source IDs or posting the same document twice.
- Failed/unknown pushes, external edits, duplicate imports, expired consent, and conflicting references are visible/reconcilable; retry never blindly recreates an object.
- An export Decision binds target tenant/company, exact source revisions, mappings, and scope. Sync cannot import an external "paid" label as qualifying recovery proof without the existing settlement checks.
- Supported connector operations, accounting systems, regional data paths, and sandbox/live evidence are recorded; unsupported tax/object mappings fail explicitly.

### M5-2 Direct Xero adapter
**Track:** small-builder
**Depends on:** M5-1.
**Build:** direct Xero authentication/mapping/export adapter behind the same contract, with independent onboarding and reconciliation. Keep Codat and direct exports from duplicating the same target business effect.
**Done when:**
- The common export conformance suite plus Xero-specific sandbox tests cover invoices, credit notes, receipts, supported tax codes, retries, rate limits, token expiry, and external edits.
- Switching integration route preserves target IDs/mapping history; it cannot repost all historic invoices or reauthorize broader access silently.
- A human confirms changed mapping/target company, and the data-flow register/G5 approval covers the actual integration.

### M5-3 Direct QuickBooks adapter
**Track:** small-builder
**Depends on:** M5-2.
**Build:** direct QuickBooks adapter using the same canonical export and authorization/reconciliation contracts; do not copy Xero-specific field assumptions into a generic mapping.
**Done when:**
- Common conformance and QuickBooks-specific sandbox tests pass for supported objects/tax treatments; unsupported features are surfaced in the capability matrix.
- Duplicate-route protection, exact source revisions, unknown-outcome recovery, token revocation, and external-edit conflicts behave consistently without pretending provider APIs are identical.
- G5 and provider approval are complete before live access; retries and rate-limit backoff do not change invoice amounts or recipients.

### M5-4 Merchant ingestion hardening and connector capability contract
**Track:** shared (the connector capability contract is reused by the contractor's named-system connectors, ENT-13b)
**Depends on:** M2-2-S (merged).
**Build:** merchant connector capability registry, hardened alias/document ingestion, supplier identity resolution, schema/version monitoring, quarantine, deduplication, and contract tests. Define read/quote/order/acknowledgment capabilities separately.
**Done when:**
- Malformed/changed merchant documents and feeds cannot silently alter agreed prices, PO quantities, deliveries, or account ownership; drift produces review/alerts.
- Duplicate documents arriving through portal/email/upload reconcile to the same underlying identity without losing source provenance.
- Each merchant capability has a verified source/terms/access route and regional data approval. An unavailable API is not replaced by unapproved scraping or credential sharing.
- Order placement remains a separately authorized exact action; ingestion access never implies purchase authority.

### M5-5 One scoped merchant/punchout/PEPPOL adapter at a time
**Track:** small-builder (contractor systems follow the same one-at-a-time rule under ENT-13b)
**Depends on:** M5-4.
**Build:** choose a verified supported merchant or network route based on an actual pilot need, then implement its specific adapter, identifiers, document acknowledgments, and reconciliation. Repeat as separately numbered sub-tasks for additional adapters.
**Done when:**
- The selected adapter passes capability/tenant/identity/deduplication tests and actual sandbox or approved partner conformance tests; unavailable capabilities are recorded, not invented.
- Quotes, order acknowledgments, invoices, credits, and delivery evidence retain their distinct meanings and source IDs. A supplier acknowledgment does not become proof of delivery or bank settlement.
- Outbound procurement/document exchange binds the exact approved order/document and recipient/routing identity through the common outbox.
- A partner outage or schema change fails safely and leaves a human-operable fallback with audit history.

### M5-6 Rate-book learning and human-accepted suggestions
**Track:** small-builder
**Depends on:** M5-5, M1-4.
**Build:** use the immutable observations already written since M1; normalize units/tax/region/context; evaluate a simple descriptive baseline before Bayesian drift estimation, recurring-extra suggestions, and merchant reliability scoring. Suggestions stay tenant-scoped by default.
**Done when:**
- Historical observations can be traced to human-confirmed source revisions, and duplicates/credits/outliers/unit changes are handled explicitly. No "add the missing M1 write now" retroactive task is needed.
- Held-out evaluation compares proposed estimates to a simple recent-rate baseline, with sample counts, uncertainty, drift, and sparse-data behavior. Lack of evidence produces unknown/broad uncertainty, not a confident rate.
- Suggestions never silently update accepted quotes, agreed rates, invoices, or cap values. Human acceptance creates a new revision/observation with provenance.
- Cross-tenant learning is disabled unless a separate privacy/commercial decision permits it and the data design is reviewed; tenant-private raw rates are not leaked through suggestions.

### M5-7 Enterprise SSO and policy-based permissions
**Track:** contractor — delivered as ENT-10; these Done-when assertions are part of ENT-10's acceptance.
**Depends on:** ENT-1.
**Build:** SAML/OIDC adapters behind `AuthProvider`, enterprise identity/account linking, fine-grained role policy using Cedar only when its adoption is justified, provisioning/deprovisioning, audit, and break-glass administration with restricted approvals.
**Done when:**
- Identity collision, domain takeover, cross-tenant account linking, assertion replay, revoked membership, role downgrade, and deprovisioning are tested across web/native/background action paths.
- Existing permission behavior has a conformance suite; SSO/policy-engine introduction does not broaden finance/order/export authority or bypass exact Decisions.
- Break-glass operations are bounded, separately logged/reviewed, and cannot silently rewrite journals, evidence, or audit history.
- Enterprise metadata and identity-provider flows satisfy updated D04/G5 requirements; a vendor feature flag alone is not SSO acceptance.

### M5-8 Tenant-specific keys and optional stronger database isolation
**Track:** contractor (offered only where a contract requires it)
**Depends on:** M5-7.
**Build:** per-tenant KMS envelope encryption where required; repository/connection routing for explicitly contracted schema- or database-per-tenant deployments; key rotation, migration, backup/restore, and isolated worker/sync routes. Shared RLS remains the default unless a requirement justifies migration.
**Done when:**
- Routing tests cannot cross tenants via wrong connection pools, caches, worker jobs, sync credentials, exports, or restore destinations. Isolation includes object storage/keys, not only table schemas.
- Key rotation, denied/wrong key, revocation, backup restore, and migration rollback/forward-fix are demonstrated without unrecoverable loss of permitted retained data.
- Per-tenant isolation does not fork core arithmetic/state/authorization logic; contract and regression suites run against each supported topology.
- Cost/operations/DR implications and tenant exit/export procedures are accepted before offering the topology commercially.

### M5-9 Signed audit exports and long-term verification
**Track:** shared — the contractor audit export is delivered first in ENT-10.
**Depends on:** M0-5 (merged); M4-4 for the timestamp part.
**Build:** signed tenant-scoped audit/evidence export manifests, checkpoint/timestamp verification bundle, signer-key rotation, explicit verification instructions, and long-term evidence preservation/algorithm review policy.
**Done when:**
- An independent verifier detects altered/missing files, inconsistent scope/revision links, invalid signatures, and checkpoint mismatch; exported PII is minimized and authorized.
- Signer identity/key version, timestamp trust, expiry/revocation assumptions, and unverifiable gaps are clearly reported. A signature is not described as proof the underlying commercial claim is true.
- Exporting one tenant cannot expose another tenant's chain, keys, bank records, or identities; the export itself is audited and bound to approved scope/recipient.
- Key rotation and retained verification material preserve validation of earlier exports without rewriting old signatures.

### M5-10 Expanded resilience, failover, and recovery exercises
**Track:** shared
**Depends on:** M0-13b.
**Build:** stronger D07 recovery objectives where required, routine restore/failover exercises, key/evidence/provider recovery dependencies, operational incident exercises, and reconciled resumption of external execution. Improve the M0 baseline instead of replacing it with an untested architecture.
**Done when:**
- Repeated exercises measure actual recovery time/data loss across database, evidence versions, keys, sync, audit anchors, and provider state against approved objectives.
- A restored/failover environment does not resend already executed commercial actions or collect invoices twice; reconciliation precedes resumed dispatch.
- Runbooks have named owner roles, accessible credentials/recovery material under least privilege, escalation paths, and recorded exercise defects/remediation.
- Existing M0–M4 protections remain enforced during failover, including tenant isolation, approved regions, proof checks, and journal/audit immutability.

### M5-11 Expanded DSAR, retention, and tenant offboarding
**Track:** shared
**Depends on:** M0-13c.
**Build:** comprehensive data inventory, access/export/deletion-request automation, retention and legal-hold review, connector disconnection, tenant exit, and native/cache cleanup procedures. Preserve mandatory financial/legal records under the approved policy rather than deleting or retaining everything indiscriminately. For contractor tenants, requests about residents and clients are executed on the contractor's instruction as controller (D12 v4, proposed).
**Done when:**
- Rehearsals include source and derived data, observations/models, logs, caches/native stores, connector copies, backups, locked evidence, keys, and retained accounting records.
- Requests verify identity/authority and tenant scope; one tenant's export or deletion cannot affect another. Execution receipts identify completed actions, exceptions, and pending expiry/backup handling.
- Offboarding revokes access/consent and stops new authorized work as defined, while reconciling in-flight actions and outstanding financial obligations without inventing retroactive pilot charges.
- Immediate offline-device or immutable-backup erasure is not falsely promised. Document permitted retention and effective deletion/expiry behavior with owner review.

### M5-12 Security assurance and certification evidence programme
**Track:** shared — the contractor security pack is delivered first in ENT-10.
**Depends on:** M0-13a.
**Build:** recurring independent penetration/security reviews, supply-chain and configuration assurance, remediation workflow, policy/control evidence, and an explicitly scoped programme for Cyber Essentials and any later ISO 27001/SOC 2 work.
**Done when:**
- Security findings have owners, severity, remediation evidence, and retesting; unresolved high-impact issues block the affected commercial feature.
- The programme identifies assessment scope, controls, operational evidence, external assessor responsibilities, and actual assessment status. It does not treat a checklist or this task as the certification itself.
- Customer-facing claims reflect only achieved, documented assessment/certification scope and dates; unachieved assurance remains visibly pending.
- Earlier runtime and operational protections stay mandatory while the assurance programme proceeds; green CI is not a substitute for operational evidence.

**M5 exit:** each released connector/enterprise capability has its own verified contract and gate evidence; operational assurance is ongoing. Unavailable integrations or unachieved certifications remain explicitly unclaimed.

### 11.7 Mapping from rev 2.5

| Rev 2.5 | Rev 3.0 | Change |
|---|---|---|
| §15.2 "What's built" table; §16.6 "What carries over" | §7.2 | Replaced by one inventory with merged PR, commit, migrations, routes, recorded verdict and reuse by track. §15's claim that six leaves have independent verdicts is corrected: those files are builder receipts. |
| §16.8 "What happens to the rest" | Track lines on every card | The survive/pause/pull-forward lists become per-card tracks; nothing is paused. |
| CH-2 | CH-2 | Extended: one live predicate for all provenances, imported work orders are live from import, database trigger and routine enforcement, command registry, race and replay tests. |
| CH-3 | CH-3a + CH-3b | Split. CH-3a (shared, no dependencies): customer with type, paying party, site, recognition projection, backfill. CH-3b (contractor, after ENT-1): client organisation, client contract, resident contact, required at work-order import. Customer types add `housing_association` and `local_authority`. |
| M0-6 (unbuilt remainder) | M0-6L | Added: M0-6 merged only as an in-memory scaffold; persisted sign-in and identity email had no card. Done-when carried from M0-6 against the persisted store. |
| M0-12 (unbuilt remainder) | M0-12a, M0-12b | The rev 2.2 pre-split applied to what is unbuilt: live Claude route and live evaluation (a), Deepgram adapter (b). Done-when carried from M0-12. |
| M0-13 | M0-13a, M0-13b, M0-13c, M0-13d | The rev 2.2 pre-split (deploy / DR-restore / privacy-ops / gate evidence), aggregate acceptance preserved. Added: deploy part restates its Build items as tests; restore-replay row from Appendix A; contractor processor routing (D12 v4); ENT-14 pilot documents in the gate; M0-13d depends on M0-6L. |
| M1-15 (human trial) | M1-15T | The technical part is merged (#32); the trial becomes its own non-code card. |
| M2-8 | M2-8 | Depends on M2-5 and merged M2-7-S; the restored benchmark precedes any enhancement. Live M2-7 is not an additional technical dependency. |
| M3-1 | M3-1 | No longer depends on M2-8 (not a technical prerequisite; M3 is pulled forward for ENT-12). Pointer line removed. |
| M3-2…M3-6 | M3-2…M3-6 | Unchanged; tracks added. M3-6 is small-builder; the operative screens are ENT-12. |
| M3-7 | M3-7 | Depends on M3-6 or ENT-12 per app. |
| M4-1 | M4-1 | No longer depends on M3-7 (not a technical prerequisite); depends on M4-1-S. Case types follow D03 v3, including `missed_variation_final_account`. |
| M4-2 | M4-2 | §14.13 change folded in: D03 v3, `missed_variation_final_account`, entry test, D13; new bullet that builder captures and pre-lock disclosures never qualify. |
| M4-3 | M4-3 | Shared. §14.13 pack sections folded in; contractor pack contents added (origin, approvals, export, invoice, payment). |
| M4-4 | M4-4 | Unchanged; shared. |
| M4-5, M4-6, M4-7 | M4-5, M4-6, M4-7 | Unchanged text; each also depends on its synthetic slice. M4-7 marked small-builder (no bank feed on the contractor track). |
| M4-8 | M4-8 | §14.8 receipt-to-line allocation folded in, with its fixtures. |
| M4-9 | M4-9 | Shared. Derives the v3 success fee and the D16 contractor fee; cap, base-plan and credit text removed; fee-base exclusion bullet added; depends on ENT-7 for the contractor fee. |
| M4-10 | M4-10 | Shared. Subscription-period, success-fee and contractor-fee lines; £79 VAT clause and base-plan credit removed. |
| M4-11 | MON-2 (live stage) | Dropped as a card. Its signed-webhook, idempotency, duplicate/out-of-order event, unknown-outcome and no-card-data acceptance moves to MON-2's live Stripe subscription stage. |
| M4-12 | M4-12 | Retitled "Fee collection and refund execution"; shared; v1 plan-settlement clause removed; depends on M4-10 and MON-2 live instead of M4-11. |
| M4-13 | small-builder "Subscription and success-fee agreement"; contractor "Master services agreement and fee terms" | Folded. Carry its acceptance into both: no recurring or statement collection without a human-approved terms/mandate record; changes to price, allowance, frequency or scope follow the approved notice/reauthorisation policy; revocation and cancellation block future initiation and trigger provider-side cancellation, with in-flight actions reconciled honestly; failed renewals, retries, pauses, trial/pilot exemption, refunds and provider-managed email settings covered; a worker cannot invent a plan change; discounts and credits have explicit allocation and never offset a fee. The £79 credit bullet is dropped. |
| M4-14 | MON-1 | Dropped as a card; the jobs-on-the-go meter is MON-1. |
| M4-15 | M4-15 | Depends on M4-12 instead of M4-14; shared. |
| M4-16 | M4-16 | Unchanged; shared. |
| M4-17 | M4-17 | "proof/cap/credit history" becomes "proof and fee-derivation history"; shared. |
| M4-18…M4-22 | M4-18…M4-22 | Text unchanged; small-builder. Their plan entitlement (previously Firm and Contractor plans) is open. |
| M4-23 | M4-23 | Shared. v3 figures replace cap/credit/unpaid-base scenarios; contractor end-to-end scenario added; core release depends on M4-9/M4-10/M4-17 (and ENT-7), expanded billing on M4-18–M4-22. |
| M5-1…M5-3, M5-5, M5-6, M5-8 | same | Text unchanged; tracks added. |
| M5-4 | M5-4 | Depends on M2-2-S instead of M5-3; shared (ENT-13b reuses the capability contract). |
| M5-7 | M5-7 (delivered as ENT-10) | Depends on ENT-1 instead of M5-6; pointer line removed; its Done-when is part of ENT-10's acceptance. |
| M5-9 | M5-9 | Depends on M0-5 and M4-4 instead of M5-8; contractor audit export first in ENT-10. |
| M5-10 | M5-10 | Depends on M0-13b instead of M5-9. |
| M5-11 | M5-11 | Depends on M0-13c instead of M5-10; contractor controller/processor sentence added. |
| M5-12 | M5-12 | Depends on M0-13a instead of M5-11; pointer line removed; contractor security pack first in ENT-10. |
| MON-10 | dropped | Withdrawn with the Contractor subscription plan. |

---

## 12. Dependency graph and build order

### 12.1 How it runs

- **Ready rule:** a task starts when every task in its "Depends on" is merged. Up to five Codex runs at once (§2.2).
- **When more than five are ready, pick in this order:** (1) the contractor critical path to the first demo — ENT-1 → CH-3b → ENT-2 → ENT-4b → ENT-3 → ENT-5 → ENT-11a; (2) shared tasks others wait on (SH-1, CH-2, CH-3a); (3) the small-builder critical path — SV-1 → SV-2 → SV-4 → SV-5 → SV-6; (4) everything else, lowest phase first.
- **Phase** is the longest chain of dependencies before a task, so tasks in the same phase can run side by side. It is a guide, not a gate: the ready rule decides. §12.3 displays outstanding-task edges; task cards also name merged prerequisites. Aggregate names such as ENT-8, ENT-13, SV-7, MON-2 and MON-4 denote groups; only their lettered parts are dispatchable.
- **Migrations:** each database task has its pre-allocated number below; pure-core tasks add none, and native tasks use their own local version namespace and take a global PostgreSQL number only if their server change needs one. Before dispatch, the reservation ledger (§12.2) assigns each exact number to one task and branch. PRs merge in migration order.
- **Milestones:** the first contractor demo for Tommy (ENT-11a) is reachable after phase 7; the full contractor demo and sales edition (ENT-11b) after phase 10; the complete small-builder practice journey (DEMO-S) after phase 11.

### 12.2 Work already in flight (may continue before adoption) and the migration reservation ledger

| Task | What it is | Branch | Migration |
|---|---|---|---|
| M4-3-S-R | Repair of merged M4-3-S against its FAIL verdicts (`fd56bdd`, repair candidate `8116aa6`) | `codex/sandbox/m4-3-s-repair` | 0042 (`evidence_pack_repair`) |
| M4-1-S-R | Repair of merged M4-1-S against its HOLD verdict (`docs/verdicts/M4-1-S/54adf02.md` on the branch) | `codex/sandbox/m4-1-s-repair` | 0043 (`recovery_case_current`; the branch currently uses 0046 and must rename) |
| M4-2-S-R | Repair of merged M4-2-S against its HOLD verdict (`be81bd5`) | `codex/sandbox/m4-2-s-repair` | 0044 if needed |
| M4-5-S | Committed §10.4 scope | `codex/sandbox/m4-5-s-v2` | 0045 if needed |
| M4-7-S | Committed §10.4 scope | `codex/sandbox/m4-7-s` | 0046 (`practice_feed`; the branch currently uses 0043 and must rename) |
| M4-6-S | After M4-5-S | `codex/sandbox/m4-6-s` | 0047 if needed |
| M4-8-S (case allocation only) | The permitted in-flight part; the receipt-to-line allocator is the post-adoption extension in §12.3 | `codex/sandbox/m4-8-s` | 0048 |
| — | Spare | — | 0049 |

These numbers follow the dependency order, so migration-order merging works: 0042 and 0043 have no in-flight prerequisites, 0044 precedes M4-7-S's 0046, and M4-8-S's 0048 follows both repairs and M4-7-S. Before dispatch, the in-flight branches rename their migration files to these numbers and their registrations follow; historical receipts keep their original facts, and changed heads need fresh verdicts.

Each repair's specification is its verdict file: every finding is fixed or explicitly accepted by Ben, the verdict is re-recorded against the new head, and CI is green. Tasks that build on a merged task with a HOLD or FAIL verdict depend on its repair (`-R`), not on the original.

**Ledger amendment — SBOX-SESSION-1, 5 October 2026 (Ben's released dispatch, merge-ahead ruling).** `codex/sandbox/sbox-session-1` takes **0094** (`practice_session_ownership`). The supplied checkout's highest merged migration is 0053; 0054–0093 are reserved in §12.3, so 0094 is the next number neither merged nor reserved above that baseline. This task may merge ahead under Ben's 5 October ruling. Existing reservations are unchanged. Scope is synthetic practice authentication and immutable creator/session/job binding across the shared application and Next/Nest transports; no live identity, provider, charging or release approval. The older founder-held session prerequisite notes remain historical; this explicit dispatch releases their shared ownership repair, and does not independently accept any dependent feed implementation. M4-7-S and M4-5-S are absent from this checkout and must consume this boundary when integrated.

**Ledger amendment — M4-1-S-R, 7 October 2026 (merge-ahead ruling).** This PR moves from its reserved 0043 to **0097** because 0053 merged ahead; 0054–0093 stay reserved, 0094 is SBOX-SESSION-1's and 0095 CH-3a's. It must merge after any lower-numbered PR that merges first, or renumber again.

### 12.3 The graph (synthetic work, buildable after adoption)

| Phase | Task | Title | Track | Depends on | Migration | Card |
|---|---|---|---|---|---|---|
| 0 | ADOPT | Independent review of rev 3.0 and Ben merges it | shared | — | — | §2.1 |
| 0 | M4-1-S-R | Repair M4-1-S per its HOLD verdict | small-builder | — | see §12.2 | §12.2 |
| 0 | M4-2-S-R | Repair M4-2-S per its HOLD verdict | small-builder | — | see §12.2 | §12.2 |
| 0 | M4-3-S-R | Repair M4-3-S per its FAIL verdict | small-builder | — | see §12.2 | §12.2 |
| 1 | M4-5-S | Factual recovery message | small-builder | M4-3-S-R | see §12.2 | §12.2 |
| 1 | M4-7-S | Synthetic settled movements | small-builder | M4-2-S-R | see §12.2 | §12.2 |
| 1 | CH-2 | Watchdog only on live jobs | shared | ADOPT | 0050 | §8 |
| 1 | CH-3a | Customer, paying party and site on every job | shared | ADOPT | 0051 | §8 |
| 1 | M0-6L | Persisted email-code sign-in | shared | ADOPT | 0052 | §11.1 |
| 1 | SH-1 | Shared money and origin primitives | shared | ADOPT | 0053 | §8 |
| 1 | M3-1 | Native risk slice and offline contract | shared | ADOPT | none unless its server change needs one | §11.4 |
| 1 | ENT-1 | Organisations, roles, client contracts | contractor | ADOPT | 0054 | §9 |
| 2 | M4-6-S | Recovery timeline | small-builder | M4-5-S | see §12.2 | §12.2 |
| 2 | M3-2 | Native auth and encrypted store | shared | M3-1, M0-6L | none unless its server change needs one | §11.4 |
| 2 | CH-3b | Client, contract and resident on contractor jobs | contractor | CH-3a, ENT-1 | 0055 | §8 |
| 2 | ENT-10 | Single sign-on and role mapping | contractor | ENT-1 | 0056 | §9 |
| 2 | ENT-4a | Site-origin and contractor-fee domain | contractor | SH-1 | none (pure core) | §9 |
| 2 | MON-7 | Prevention checks | small-builder | CH-3a | 0057 | §10 |
| 2 | SV-1 | Shadow commercial domain | small-builder | SH-1 | none (pure core) | §10 |
| 3 | M3-3 | Sync download authorization | shared | M3-2 | none unless its server change needs one | §11.4 |
| 3 | ENT-2 | Work-order jobs and schedules of rates | contractor | ENT-1, SH-1, CH-2, CH-3b | 0058 | §9 |
| 3 | CH-1 | v3 switch-live; retire v1 default | small-builder | SV-1, CH-3a | 0059 | §10 |
| 3 | CH-7 | Eligibility under D03 v3 | small-builder | SV-1, M4-1-S-R, M4-2-S-R, M4-5-S | 0060 | §10 |
| 3 | SV-2 | Shadow persistence and isolation | small-builder | SV-1 | 0061 | §10 |
| 4 | M3-4 | Offline command outbox and conflicts | shared | M3-3 | none unless its server change needs one | §11.4 |
| 4 | ENT-4b | Origin persistence and audit | contractor | ENT-4a, ENT-2 | 0062 | §9 |
| 4 | M4-8-S | Receipt-to-line allocator (post-adoption extension) | small-builder | M4-2-S-R, M4-3-S-R, M4-7-S, SV-2 | 0063 | §10 |
| 4 | SV-3 | Detection engine and evaluation | small-builder | SV-2 | 0064 | §10 |
| 4 | SV-4 | Final-account lock | small-builder | SV-2 | 0065 | §10 |
| 5 | M3-5 | Offline voice/photo capture | shared | M3-4 | none unless its server change needs one | §11.4 |
| 5 | ENT-3 | Operative Log an extra and close-out question | contractor | ENT-2, ENT-4b | 0066 | §9 |
| 5 | CH-4 | Work-state events and post-lock rules | small-builder | CH-2, CH-3a, SV-4 | 0067 | §10 |
| 5 | SV-5 | Final Check, reveal, disposition | small-builder | SV-3, SV-4, M4-1-S-R | 0068 | §10 |
| 6 | ENT-12 | Operative offline app | contractor | ENT-3, M3-5 | none unless its server change needs one | §9 |
| 6 | ENT-5 | Approval chain and client approval | contractor | ENT-3, M4-3-S-R | 0069 | §9 |
| 6 | MON-1 | Jobs-on-the-go meter | small-builder | CH-1, CH-2, CH-3a, CH-4, SV-4 | 0070 | §10 |
| 6 | SV-6 | Attribution and v3 fee illustration | small-builder | SV-5, M4-8-S, CH-7 | 0071 | §10 |
| 6 | SV-7A | Job diary and customer-message sources | small-builder | SV-3, CH-4 | 0072 | §10 |
| 7 | ENT-11a | First contractor demo | contractor | ENT-5 | 0073 | §9 |
| 7 | ENT-6 | Billing export and status import | contractor | ENT-5 | 0074 | §9 |
| 7 | ENT-8a | Deterministic live prompts | contractor | ENT-5 | 0075 | §9 |
| 7 | CH-5 | Import under the new rules | small-builder | CH-1, CH-3a, SV-2, MON-1 | 0076 | §10 |
| 7 | CH-6 | Integrity signals for v3 | small-builder | SV-5, MON-1 | 0077 | §10 |
| 7 | CH-8 | Evidence packs with lock and reveal | small-builder | SV-5, SV-6, M4-3-S-R | 0078 | §10 |
| 7 | CH-9 | Value page and value receipt | small-builder | SV-6, MON-1 | 0079 | §10 |
| 7 | M4-9-S | v3 success-fee derivation | small-builder | M4-8-S, SV-6 | 0080 | §10 |
| 7 | MON-2A | Plans and subscription billing (synthetic) | small-builder | MON-1 | 0081 | §10 |
| 7 | MON-4A | Fee on the payment screen (synthetic) | small-builder | SV-6, M4-8-S | 0082 | §10 |
| 7 | MON-5 | Customer portal | small-builder | CH-3a, SV-7A | 0083 | §10 |
| 8 | ENT-13a | File and webhook connectors | contractor | ENT-2, ENT-6, ENT-8a | 0084 | §9 |
| 8 | ENT-7 | Contractor fee engine and statement | contractor | ENT-4b, ENT-6 | 0085 | §9 |
| 8 | M4-10-S | Simulation fee statement | small-builder | M4-9-S | 0086 | §10 |
| 8 | MON-3 | Free first job | small-builder | MON-2A | 0087 | §10 |
| 8 | MON-8 | Plan entitlements | small-builder | MON-2A | 0088 | §10 |
| 9 | ENT-9 | Dashboards and pilot baseline | contractor | ENT-7 | 0089 | §9 |
| 9 | M4-12-S | Simulated collection and refund | small-builder | M4-10-S | 0090 | §10 |
| 10 | ENT-11b | Full contractor demo and sales edition | contractor | ENT-11a, ENT-7, ENT-9 | 0091 | §9 |
| 10 | M4-17-S | Money-trail reconciliation | small-builder | M4-12-S, MON-2A | 0092 | §10 |
| 11 | DEMO-S | Whole small-builder practice journey | small-builder | SV-6, SV-7A, CH-1, CH-4, CH-5, CH-6, CH-7, CH-8, CH-9, MON-1, MON-2A, MON-3, MON-4A, MON-5, MON-7, MON-8, M4-6-S, M4-17-S | 0093 | §10 |

### 12.4 Live and later work (not dispatched automatically)

These tasks are not dispatched automatically. Their deterministic implementation, synthetic tests and authorized provider-sandbox stages may be issued before release-gate completion. Real providers, spending, real data, operational reliance, distribution and charging require the applicable founder authority and gates before that stage executes. A task producing gate evidence does not require that same gate to have already passed. The checker raises a decision card when one becomes otherwise ready.

| Task | Waits for |
|---|---|
| M0-12a Claude route, M0-12b Deepgram | D04 approval of the provider routes |
| M0-13a–d deployment, restore, privacy operations, gate evidence | Ben (deployment is founder-reserved); M0-6L |
| M1-15T builder trial, VOICE-1 device rehearsal | Real people and devices; G1 for real data |
| M1-15S shadow-pilot measurement | Accepted SV-6, CH-8, MON-1; G1; approved D12/D13 pilot scope |
| M2-1 … M2-7 live remainder (approved intake and OCR routes, held-out evaluation, readiness adapters, inbox feedback) | Their §11.3 cards; D04; G2 |
| M2-8 matching enhancement | The restored M2-5 gate |
| M3-6, M3-7 native screens and release gate | M3-5; devices; G3 |
| ENT-8b AI prompts | M0-12a; G2 |
| ENT-13b named-system connectors | A pilot contractor's systems; G5 |
| ENT-14 pilot and contract pack | ENT-9, ENT-10; solicitor review; D12 v4 and D16 approval |
| SV-7B live evidence connectors | G1, D04, D12 per connector |
| MON-2B, MON-4B, MON-6 live, SV-8 | G4-S and the approvals in §3 |
| MON-6 pay-now links (synthetic construction) | M4-18 |
| MON-9 managed recovery | Pilot data; solicitor view on damages-based agreements |
| M4-1 … M4-23 live money, banking and billing | Their §11.5 prerequisites; G4-C or G4-S |
| M4-18 … M4-22 staged invoicing, notices, retention, reverse charge, CIS | Small-builder demand after the pilot; D06 v2 templates |
| M5-1 … M5-12 | Their §11 prerequisites. ENT-10 carries the full stated M5-7 acceptance and early contractor audit-export/security-pack subsets only. M5-9's signed long-term verification and key-rotation acceptance, and M5-12's independent assurance programme, remain outstanding under their own cards. |

---

## 13. Sales promises register

Nothing may be promised to a customer that has no task here. When a task is dropped or delayed, the matching sales material changes in the same PR (`sales/`).

### 13.1 Contractor track

| Promise | Delivered by | State |
|---|---|---|
| Operatives log an extra in seconds by code, voice or text, with photo and the resident's confirmation | ENT-3, ENT-12 (offline) | To build |
| Every job ends with "Did the resident ask for anything extra?" | ENT-3 | To build |
| Jobs and prices come from your clients' work orders and schedules of rates | ENT-2, ENT-13 | To build |
| Your approval rules, including client pre-approval above a value | ENT-5 | To build |
| Approved extras go straight to your billing system | ENT-6, ENT-13 | To build |
| Supervisors see possible extras live — nothing held back | ENT-8 | To build |
| 10% only on site-originated extras once approved, billed and paid; never on order lines or office entries; no platform fee | ENT-4a/4b, ENT-7, D16 | To build |
| Every fee line traceable to the log, photo, approvals, invoice and payment | ENT-4b, ENT-7 | To build |
| Dashboards by region, team, operative and client; before-and-after pilot measurement | ENT-9 | To build |
| Single sign-on, roles and a security evidence pack | ENT-10 | To build; certification claims require achieved assessment evidence under M5-12 |
| Works with no signal | ENT-12 | To build |
| Evidence packs for approvals and disputes | M4-3-S (built), ENT-5 | Partly built |
| Data stays in the UK/EU; JobGuard acts as your processor | D04, D12 v4, ENT-14 | Gated |

### 13.2 Small-builder track

| Promise | Delivered by | State |
|---|---|---|
| Talk through the job on site; it writes the list | M1-2/M1-3, VOICE-1; M0-12b live voice; M3-5 offline | Built (synthetic, browser dictation) |
| Gaps flagged before the quote goes out; no unpriced lines | M1-4 | Built |
| Prices from your own rates; learns over time | M1-4; M5-6 | Partly built; learning later |
| Quoting free forever | M1-5, §10.1 | Built |
| Customer accepts the quote and approves extras on their phone | MON-5 | To build (today builder-attested only) |
| Log an extra in seconds; anything you log is 100% yours | M1-9/UIWIRE-8; SH-1 origin | Built; origin to build |
| Proof reminders; a stage can't complete without proof | M1-10/UIWIRE-7; CH-2 | Built; change |
| Orders checked against agreed prices; order, delivery and invoice matched before you pay | M2-1B-S, M2-4-S, M2-5-S | Built |
| Readiness warnings | M2-6-S; live adapters later | Partly built |
| Listed building / conservation-area checks at quote time | MON-7 | To build |
| Final account built automatically | M1-11/UIWIRE-9 | Built |
| Complete your final account, then the Final Check shows what you missed, with proof | SV-1…SV-6, CH-4, CH-8 | To build |
| Diary and voice notes | SV-7A | To build |
| 10% only on Final Check finds you bill and get paid for, supplier cash refunds, and recovery cases you open | SV-6, CH-7, M4-8-S…M4-17-S, D01/D03 | To build |
| Invoices, credit notes, receipts | UIWIRE-10/11/12 | Built |
| Recovery cases with evidence packs and drafted factual letters | M4-1-S…M4-3-S (repairs in flight), M4-5-S…M4-8-S | Partly built; repairs pending |
| Solo £29 (4 jobs), Builder £69 (7 jobs); extra jobs £20; small jobs free; first job free; monthly maximum | MON-1, MON-2A/B, MON-3, D09 v4, D05 | To build |
| Fee shown on the payment screen and collected by Direct Debit | MON-4A/B, M4-15 | To build |
| Pay-now links on invoices | MON-6 | Later (gated) |
| Value receipt: what we checked, what you logged, what we found | CH-9 | To build |
| Mobile app that works with no signal | M3 | To build |
| Export to Xero and QuickBooks | M5-1…M5-3 | Later |
| Import jobs already under way | M1-17 + CH-5 | Built; change |
| Data in the UK/EU; export; email-code sign-in | D04/D07, M0-6L, M5-11 | Sign-in scaffold built; live parts to build |

Withdrawn with the Firm and Contractor plans (remove from sales material): Firm and Contractor subscription prices; applications for payment, Construction Act notices, retention tracking, reverse-charge VAT and CIS as plan features (they are later small-builder work, §12.4); several companies under one Contractor plan.

---

## 14. Scope limits

### 14.1 Out of scope unless separately approved

Full project-management/Gantt planning; holding or routing any customer's or client's funds through JobGuard; debt-collection-as-a-service or autonomous legal representation; unsupported tax/jurisdiction regimes; automatic commercial sends, orders or charges outside exact or approved bounded standing authorization; cross-tenant rate learning without a new reviewed policy; unverified merchant scraping or integrations; retrospective billing of pilot jobs; claims of guaranteed savings or recovery, tamper-proof truth, regulatory approval or certification without the relevant evidence.

### 14.2 Never build

Any money from merchants or suppliers, lenders, lead platforms or builders' customers; any change to a 10% rate by automatic minimums or bands (contract-negotiated contractor rates are recorded per contract version, not automatic); a paid "show me what you found" disclosure of Final Check findings; fees measured on tax outcomes (VAT, CIS, bad-debt relief); fees or features that depend on which merchant a builder uses; value-indexed price rises; a file fee to open a recovery case; a verified-builder marketplace or lead selling; homeowner-paid audits of a builder; pooled cross-tenant payer ratings; a per-person fee rule inside one company (the deal is per company); any mechanism by which an office entry, an AI output or a later edit makes an extra site-originated.

### 14.3 Discovered later

Agents append adjacent findings here rather than implementing them inline, with date, related task, evidence, risk, proposed scope, gate, and whether an invariant or decision record changes.

| Date | Finding | Related | Proposed handling |
|---|---|---|---|
| 2026-09-25 | Leaves merged after 14 September have no recorded verdict files in `docs/verdicts/` | AGENTS §5.13; §7 | Retrospective verdicts by the checker, labelled as such (§7) |
| 2026-09-25 | Docker is not installed on the build Mac; database and browser suites run only in CI | §2.2 | Install Docker Desktop (Ben, needs a password) to shorten fix loops |
| 2026-09-25 | Codex repeatedly mis-named lanes in earlier cloud runs | §2.2 | Lane entry is the first change of every work order; checker verifies before review |
| 2026-09-30 | Sales bible Part 4 still lists the withdrawn Firm and Contractor plans; no contractor edition exists | §13; ENT-11b | Update Part 4 in the SV/MON PR that changes plans; contractor edition in ENT-11b |
| 2026-09-30 | `JOBGUARD_BUILD_PACK.md` and `JOBGUARD_REVIEW_HANDOFF.md` carry uncommitted local edits describing the earlier cloud loop | §2.1 | Ben to commit or discard; §2 is the current loop |
| 2026-09-25 | Retrospective independent verdicts: M4-1-S HOLD (`54adf02`), M4-2-S HOLD (`be81bd5`), M4-3-S FAIL (`fd56bdd`; repair candidate `8116aa6` also FAIL — the evidence pack maps template strings, not real sources) | §7; M4-1-S-R…M4-3-S-R | Repairs in flight on `codex/sandbox/m4-1-s-repair`, `m4-2-s-repair`, `m4-3-s-repair`; dependent tasks wait for accepted repairs |
| 2026-09-27 | Rev 2.4 adoption (R01–R12, Astra PASS) exists only on the unpushed branch `claude/plan-rev24-adopt`; rev 3.0 carries every correction | §2 | Rev 3.0 replaces that branch once reviewed and merged |
| 2026-09-27 | PR-merge delegation (rev 2.4 packet item 9) is unanswered; merging stays with Ben | §2.1 | Ben to retain or delegate in writing |
| 2026-09-30 | `app.job` constraint `job_baseline_shape` (0020) and the lifecycle routine (0003) require a quote or imported baseline plus cap when a job goes live; contractor work-order jobs and v3 small-builder activations have neither | CH-1, ENT-2 | ENT-2 adds a `work_order` provenance and a controlled route into `live`; CH-1 relaxes the cap requirement for v3 |
| 2026-09-30 | Flaky mobile browser tests: `e2e/M2-5-S.spec.ts` and `e2e/M2-1B-S.spec.ts` (mobile-360) each timed out on a 45-second poll in CI run 36748730218 on a docs-only commit, after identical code passed twice; recent PR histories show repeated CI failures before success | §2.4 C6; every task | Standalone repair `TEST-STAB-2026-09-30` before parallel dispatch: find the shared race (projection timing, seed readiness or server start under load) and fix it without lengthening timeouts, adding retries or skipping tests; CI must pass three consecutive runs |
| 2026-09-30 | M0-6 is an in-memory auth scaffold (no persisted sessions or identity email) and the AI gateway is fixture-only (no Claude route or Deepgram adapter) | §11 M0-6L, M0-12a/b | Carried as live prerequisites before any real user signs in |

---

## Appendix A — Mandatory adversarial acceptance matrix

These scenarios supplement every task’s own assertions. Rows mentioning £79, recovery caps or plan credits apply only to historical v1 synthetic regression data; new v3 and contractor work uses its track-specific acceptance rows. Keep them as named regression tests; do not substitute end-to-end happy paths for database/security coverage.

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

Track-specific rows: contractor §9.4; small-builder §10.6.

---

## Appendix B — Historic material kept for existing data

### B.1 Superseded fee contract `reference_fee_policy_v1` (existing synthetic data only)

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

### B.2 Sandbox fixtures and notation used by the built leaves

These fixtures and assertion helpers were used by the built §13 leaves and describe v1 synthetic data. New small-builder fixtures are in §10.3.

Each browser test gets a fresh generated tenant and scenario run. Seeds are immutable, versioned source recipes; mutations go through domain commands. Per-leaf seeded states are permitted for isolation; UIWIRE-15 and DEMO-1 also traverse without skipping business steps. Reset creates a new run and archives the previous run; it never deletes audits or reuses document/receipt identities. Tests must not depend on test order.

| Fixture | Exact source facts and expected arithmetic |
|---|---|
| `core-1000` | Exact confirmed scope: Protect room, Prepare walls, Paint walls, Finish trim, Clean site; each quantity 1, rates £200/£200/£200/£200/£100. Five stable IDs; quote v1 net £900. Change Clean site rate from £100 to £200 to create v2 net £1,000, illustrative standard VAT £200, gross £1,200. At activation A=100000 pence, cap=1500. Approve +£125 extra and −£25 omission; leave a £50 extra unapproved. Final net £1,100, VAT £220, gross £1,320. Baseline and cap stay £1,000/£15. Payment £500 leaves £820; then £820 settles; reversing that £820 restores £820 due. |
| `materials-A` | Order A belongs to `recovery-18800` in the two-job aggregate scenario. 10 units at proposed £25 vs applicable agreed £20: proposed commitment £250, reference £200, difference £50. Builder changes order before simulated placement: £200 commitment, £50 lower than recorded proposal; zero recovered cash. |
| `materials-B` | Separate order B also belongs to `recovery-18800`: 10×£20=£200; accepted delivery 8 units; supplier bill 10×£25=£250. Price variance = 10×(£25−£20)=£50; quantity variance = (10−8)×£20=£40; combined net questioned amount £90, with no overlapping £10. Human-confirmed revised supplier bill £160 is £90 lower; it is neither landed cash nor fee-eligible. Supplier costs never alter the accepted customer-sale baseline by themselves. |
| `materials-320` | Separate selectable original M2 acceptance scenario, excluded from the two-job VALUE-2 aggregate: 40 units received/ordered, agreed £20, billed £28; £1,120−£800=£320 net questioned. Retain this original required fixture. |
| `recovery-18800` | Accepted net A=£18,800, cap £282. A generated issued customer invoice has net £18,800 + reference VAT £3,760 = £22,560. Two attributed claims have eligible principal £320 and £2,500. Fake settled customer receipts are £384 (£320 net+£64 VAT) and £3,000 (£2,500 net+£500 VAT). Aggregate eligible net L=£2,820; not gross £3,384. Separate fake base settlement P=£79 principal gives F=£282, K=£79, R=£203. These movements remain entirely synthetic. |
| `small-fee` / `zero-fee` | A=£1,000,L=£500,P=£79 → C=£15,F=£15,K=£15,R=£0,total principal £79,benefit £421. A=£10,000,L=£0,P=£79 → recovery fee £0,total principal £79,benefit −£79. No suppression of negative benefits. |
| `rounding-tie` | A=300 pence → cap=roundHalfEven(4.5)=4 pence; with L=100 and P=0, F=4,R=4. A=100000,L=5,P=0 → F=0; L=15 → F=2. These distinguish half-even from half-up. |

### B.3 What changed from the supplied plans (rev 2.2)

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

---

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
