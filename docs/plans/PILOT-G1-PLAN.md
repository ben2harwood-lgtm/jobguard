# JobGuard free pilot build plan (G1)

**Owner direction, 21 November 2026.** Ben said “Start the pilot.” Build an invite-only, browser-based `pilot_no_charge` for a few real small builders and their real customers. G0 and G1 are open requirements. This plan grants no release, deploy, provider, spending, legal or policy approval. Ben's later first paid release includes the 10% success fee. All JobGuard subscriptions, success-fee accrual and collection, payment credentials and events, mandates, pay-now links, and production platform postings stay disabled throughout this pilot. Hypothetical fees are clearly labelled, non-posting illustrations. Pilot jobs retain their no-charge entitlement. Builders can issue their own supported invoices and record authorized, off-platform customer receipts under the approved scope.

**Basis.** Current `origin/main` at `ee974f0343fee3822f952b0299bc1f4c2ac8ad3d`; [21 November gap review](https://github.com/ben2harwood-lgtm/jobguard/blob/17e55b59c3fa6f6649fefa31c2427ab888b4facb/reviews/jobguard-v1-launch-gap-2026-11-21.md). The authoritative gate rows are in [foundation-gates.v1.json](../../config/foundation-gates.v1.json) and explained in [foundation-gates.md](../operations/foundation-gates.md). References below use the named cards and sections in [BUILD_PLAN.md](../../BUILD_PLAN.md). Reuse the persisted auth and principal bridge, existing small-builder commands and screens, outbox and pause controls, privacy and restore scaffolds, dark shadow reporting and LP refusal suite.

**Execution.** PILOT-01a through PILOT-11 can be built with fictional records, deterministic adapters and local/disposable PostgreSQL without a decision from Ben. Dependencies give the build order. Work can overlap when dependencies and path ownership permit. Start the approval requests alongside this work. S is up to one workday, M is about one to three workdays, L is more. Sizes cover implementation and evidence work, with outside review and pilot calendar time separate. Allowed paths are implementation limits. A directory permits only files needed for that piece. For implementation PRs, use the required lane manifest/registration and exact-head verdict and acceptance paths under `config/lanes/`, `config/agent-lane-assignments.json` and `docs/verdicts/` as applicable. Serialize shared files and migrations. Follow AGENTS §5.13 and BUILD_PLAN §2, including independent RED review and required CI. Build the smallest clear solution that preserves every control, reuse existing code, and keep unrelated refactors out.

## Build first — no Ben decision

### PILOT-01a — Enforce pilot approval and G1 before opening a workspace path

- **Goal** — Close the pilot approval bypass and establish a request-scoped data path for verified pilot members.
- **Reference** — BUILD_PLAN §3 G1, §5.6, M0-6L and M0-13a, [environment-modes-v1](../contracts/environment-modes-v1.md). Current bypass at [policy-gates.ts:20](../../packages/config/src/policy-gates.ts#L20), [provider-dispatch.ts:4](../../apps/api/src/effects/provider-dispatch.ts#L4) and [tax-invoice.ts:4](../../apps/api/src/effects/tax-invoice.ts#L4).
- **Dependencies** — Existing persisted auth, principal bridge and foundation evidence schema. Build this first with fictional approvals. PILOT-21 supplies the release approval record later.
- **RED / size** — Yes (identity, data and money), M.
- **Allowed paths** — `packages/config/src/{policy-gates*,foundation-gates*,enterprise-real-data.test.ts}`, `apps/api/src/effects/{provider-dispatch*,tax-invoice*}`, applicable API/worker entry points and tests, new `apps/web/app/lib/pilot-workspace-server.ts` and sibling tests, existing workspace/API composition under `apps/api/src/{workspace,auth}/`, `apps/web/app/api/jobs/route.ts` (boundary proof only), environment-mode contract.
- **Done when** — First, in `pilot_no_charge`, `requireApprovedDecision` refuses D02, D04, D06, D07, D12 and D13 unless the exact required decision and policy version is approved, including calls without an enterprise gate. Change [enterprise-real-data.test.ts:26](../../packages/config/src/enterprise-real-data.test.ts#L26) to expect refusal for proposed pilot D04 and retain its synthetic allowance. Cover all six IDs plus both direct effect callers, including absent, proposed, wrong-ID, wrong-version and superseded inputs. Introduce one shared server-side G1 switch that defaults closed and opens only on the exact candidate's trusted PILOT-21 approval record. Check it before opening the real-data workspace or customer portal and at real sign-in, invitation issue and redemption (builder and portal), every real send (including identity and worker dispatch), real customer invoice issue, and real-data Final Check ingestion, reads and worker processing. Receipt of a request or prior queueing grants no bypass. Test direct calls and workers with missing, invalid, stale or revoked approval evidence, and fully approved fictional evidence in isolated tests. D04 alone never opens the switch.
- **Done when (workspace)** — Put the server-only Next.js composition in `apps/web/app/lib/pilot-workspace-server.ts`. From the persisted session and selected membership, call the existing `apps/api/src/auth/principal-bridge.ts` through a pilot entry in `apps/api/src/workspace/application.ts`, exposed via the existing `@jobguard/api/workspace` export. Pass its verified context to existing commands/read services using the non-owner pilot connection. Add a pilot job-list boundary proof with no cross-tenant or synthetic fallback. Keep `apps/web/app/lib/synthetic-server.ts` and `apps/web/app/lib/workspace-server.ts` practice-only. Inventory the 243 current references under `apps/web/app/` by route/helper and assign each either to the supported pilot surface or to an explicitly blocked practice/out-of-scope surface. PILOT-02 and PILOT-04a through PILOT-07 migrate only their listed supported handlers/helpers to the pilot path, retaining practice behavior on its own path. Demo seed/reset/personas, contractor, pay-now/payment/billing, and other fixture-only or unsupported commands keep their practice guards and are refused in pilot. Verify imports and request coverage for migrated routes and refusal for excluded routes. Leave unrelated call sites alone.
- **Needs Ben** — none.

### PILOT-01b — Separate pilot resources from practice, sandbox and billing

- **Goal** — Bind each pilot runtime and operator job to dedicated resources and refuse cross-mode data or credentials.
- **Reference** — BUILD_PLAN §3, §5.6, M0-13a/b, LP-9 and [environment-modes-v1](../contracts/environment-modes-v1.md).
- **Dependencies** — PILOT-01a's server gate and pilot workspace boundary.
- **RED / size** — Yes (data, identity and money), M.
- **Allowed paths** — `packages/config/src/` (resource bindings), `apps/web/app/lib/` (pilot startup), `apps/api/src/` (boot and execution gates), `packages/db/{src,test}/` (connection and seed guards), `packages/storage/src/`, `tools/` (seed/restore entry points), `.env.example`, environment-mode contract.
- **Done when** — Trusted deploy configuration chooses the mode. Require distinct hosts/cookies/signing keys, databases and principals, storage/bucket/version bindings, queue namespaces and secrets. Web, API, worker and operator tools refuse missing or mismatched resource bindings. Keep seed/reset/practice cookies, fixture identities/objects/queue payloads, sandbox callbacks and all payment events out at HTTP ingress and execution. Prove both directions with wrong-credential/resource, seed-destination, restore-target, queue, object and replay refusal tests against isolated fixtures. The top-to-bottom no-charge journey is verified in PILOT-11.
- **Needs Ben** — none.

### PILOT-02 — Connect builder sign-in to verified membership

- **Goal** — Reuse the persisted entered-code flow and the authenticated principal bridge for invite-only pilot builders.
- **Reference** — BUILD_PLAN M0-6L, §5.3, [authentication-v1](../contracts/authentication-v1.md) and [M0-6L identity](../operations/m0-6l-identity.md), deployed proxy and PostgreSQL acceptance notes.
- **Dependencies** — PILOT-01a/b.
- **RED / size** — Yes (identity, data), M.
- **Allowed paths** — `apps/api/src/auth/`, `apps/web/app/api/auth/`, `apps/web/app/sign-in/`, auth/session helpers under `apps/web/app/lib/`, `packages/config/src/identity-environment*`, `packages/db/src/` and `packages/db/test/` (identity only), `apps/web/e2e/`, M0-6L identity runbook.
- **Done when** — With a fake delivery port, verified first owner creates one tenant through the scoped pilot bootstrap, and invite acceptance binds the intended email, tenant and role. Session cookies are secure, HttpOnly and scoped, with CSRF/origin checks on mutations. Test the §5.6 defaults (eight random digits, ten-minute expiry, five failed attempts, at least sixty seconds between resends, one active challenge per destination/purpose), per-destination/IP limits, keyed hashes, generic responses, single use under concurrency, revoke and sign-out, tenant switching and pool reuse. Direct API, forged tenant selection, revoked membership, privilege escalation and practice cookies are refused. Only the principal bridge mints verified business context. A trusted-edge address adapter can be tested locally, strips or ignores caller-supplied forwarding headers and fails closed or uses conservative throttling if provenance is unavailable. Confirm the deployed proxy trust chain in PILOT-17.
- **Needs Ben** — none.

### PILOT-03 — Prepare email ports and deterministic test delivery

- **Goal** — Route identity and commercial email through provider-neutral contracts with an in-process fake.
- **Reference** — BUILD_PLAN M0-6L, M0-13a, §5.3 and [identity email data flow](../operations/identity-email-data-flow.md).
- **Dependencies** — PILOT-01a/b. Coordinate the port signature with PILOT-02.
- **RED / size** — Yes (identity, data), M.
- **Allowed paths** — `apps/api/src/auth/identity-email.ts` and sibling identity tests, `apps/api/src/effects/`, `packages/config/src/` (email configuration), `packages/db/src/` and `packages/db/test/` (delivery contracts only), identity email data-flow doc.
- **Done when** — The fake records deterministic request and outcome pairs in tests with no network. Identity bootstrap accepts only its narrow, rate-limited category and never logs codes or tokens. Commercial delivery has a separate authorization path and stable action ID. Test delivered, rejected, retryable and unknown outcomes, including unknown without blind retry. Missing approval or adapter fails closed. Fake delivery cannot be selected by the pilot deployment.
- **Needs Ben** — none.

### PILOT-04a — Open the builder job list, capture and quote issue

- **Goal** — Run the job list, capture and exact quote issue on verified pilot membership.
- **Reference** — BUILD_PLAN M0-6L, §5.1, §5.3, §13.2 and MON-5 for the customer handoff.
- **Dependencies** — PILOT-01a/b and PILOT-02. Use PILOT-03's fake where delivery is exercised.
- **RED / size** — Yes (tenant data, commercial authorization), M.
- **Allowed paths** — `apps/web/app/(designed)/` (list, new job and quote), `apps/web/app/api/jobs/route.ts`, job capture/confirm and quote routes under `apps/web/app/api/jobs/`, `apps/web/app/api/firm-profile/`, corresponding web helpers/components, `apps/api/src/{auth,capture,quote,workspace}/`, matching `packages/db/{src,test}/` and `apps/web/e2e/`.
- **Done when** — Phone and desktop fixtures list only verified-member jobs, capture via manual entry or supported on-device input, and review, issue and stage delivery of the exact authorized quote artifact and customer invitation. Use PILOT-01a's data path for the listed pilot handlers. Verify cross-tenant, wrong-role, stale revision and revoked-session refusals in direct requests. G1 and exact document approval apply at issue/send time.
- **Needs Ben** — none.

### PILOT-04b — Connect acceptance, switching live, extras and proof

- **Goal** — Show customer acceptance and continue the same job from its accepted baseline into progress, extras and evidence.
- **Reference** — BUILD_PLAN §5.1, §5.3, §5.6, §13.2 and MON-5.
- **Dependencies** — PILOT-04a. Use acceptance fixtures until PILOT-06 connects the customer portal.
- **RED / size** — Yes (tenant data, commercial authorization), M.
- **Allowed paths** — Relevant existing job pages in `apps/web/app/(designed)/` and `apps/web/app/jobs/`, acceptance/activation, progress, variation and proof routes under `apps/web/app/api/jobs/`, matching web helpers/components, `apps/api/src/{quote,variation,proof,workspace}/`, matching `packages/db/{src,test}/` and `apps/web/e2e/`.
- **Done when** — The verified builder sees exact quote acceptance, explicitly switches the same job live against its immutable accepted baseline, records progress and extras, and attaches tenant/job-scoped, private versioned proof. Use PILOT-01a's data path. Exercise same-tenant wrong-job, cross-tenant, wrong-role, stale-revision and revoked-session refusals, and prove fixtures/practice personas are excluded from pilot composition.
- **Needs Ben** — none.

### PILOT-05 — Complete the final account, Final Check and supported invoice screens

- **Goal** — Finish the builder's job using the existing lock, post-lock reveal and builder/customer accounts.
- **Reference** — BUILD_PLAN §3, §10.2, §13.2, SV-6, CH-8 and M1-15S, [final-account-lock-v1](../contracts/final-account-lock-v1.md), [final-check-v1](../contracts/final-check-v1.md) and [pilot-terms-v1](../contracts/pilot-terms-v1.md).
- **Dependencies** — PILOT-04b.
- **RED / size** — Yes (money, hidden data), L.
- **Allowed paths** — `apps/web/app/(designed)/`, `apps/web/app/jobs/`, relevant final-account, Final Check, invoice and receipt routes under `apps/web/app/api/jobs/`, `apps/web/app/{lib,ui}/`, relevant existing Final Check and commercial modules under `apps/api/src/`, `packages/{core,db}/src/` (same feature only), `packages/db/test/`, `apps/web/e2e/`.
- **Done when** — Fixture runs show approved extras and immutable lock, authorized post-lock reveal/dispute and human confirmation, and a supported customer invoice with authorized receipt entry where applicable. Hidden signals stay out of pre-lock screens, reads, exports, meter, notices and side effects except required must-surface and lawful disclosure paths. Permanently mark pre-lock disclosures fee-ineligible. Pending or unsupported tax, invoice or disclosure policy blocks execution. Test no platform money effects, no automated collections, no synthetic paid state and no automatic conversion of findings to billable lines.
- **Needs Ben** — none.

### PILOT-06 — Build real customer portal sign-in and job-scoped access

- **Goal** — Let each invited customer authenticate into a single job and act on exact documents.
- **Reference** — BUILD_PLAN §10.4, MON-5 (CH-3a and SV-7A), §13.2, D06 v2, D12 small-builder portal scope and [customer portal authority proposal](../contracts/customer-portal-authority-proposal.md).
- **Dependencies** — PILOT-01a/b, PILOT-02, PILOT-03 and PILOT-04a.
- **RED / size** — Yes (identity, personal data, approvals), M.
- **Allowed paths** — `apps/web/app/customer/`, `apps/web/app/api/customer-portal/`, portal helpers under `apps/web/app/lib/`, corresponding existing portal services and repositories in `apps/api/src/` and `packages/db/{src,test}/`, `apps/web/e2e/`, portal contract.
- **Done when** — A fake-delivered invitation reaches only the intended customer identity and creates a revocable, expiring job-scoped session. Mobile journey accepts the exact quote, approves extras, acknowledges stages and sends a message recorded as evidence. Bind revisions and hashes, distinguish customer approval from builder attestation, exercise must-surface messages and include the approved domestic notice kit once supplied. Test wrong job/customer, enumeration, forged/expired/revoked/stale links, replay with one effect, and audit without customer PII. Keep external access gated on G1 and exact D06/D12 scope.
- **Needs Ben** — none.

### PILOT-07 — Stage commercial email and exercise the outbound stop

- **Goal** — Queue and dispatch only exact builder-authorized customer messages and documents.
- **Reference** — BUILD_PLAN §5.3, M0-13a and [commercial outbound pause](../operations/commercial-outbound-pause.md).
- **Dependencies** — PILOT-03–06.
- **RED / size** — Yes (data, external action), M.
- **Allowed paths** — Existing action executors and quote, invoice, extra and message delivery modules in `apps/api/src/`, their web handlers and `packages/db/{src,test}/`, `packages/config/src/` (outbound gate), `apps/web/e2e/`, commercial outbound pause runbook.
- **Done when** — Fake tests cover staged quotes, invoice documents, extras, portal invitation delivery and supported message notifications. Check exact artifact, recipient, current membership/approval, version and idempotency before execution. Dispatch only after commit. Test stale/revoked approval, duplicates, unknown outcome, paused claim preserving queued work/evidence, stop/drain and reconciliation, and two distinct operator logins approving resume with the exact reconciliation receipt. Narrow identity messages retain separate limits and an operational disable path. No live recipient is contacted under this piece.
- **Needs Ben** — none.

### PILOT-08 — Check in deployment-representative infrastructure and recovery wiring

- **Goal** — Define repeatable web/API, always-on worker, data and monitoring topology before selecting accounts.
- **Reference** — BUILD_PLAN §3, §5.6, M0-13a/b and LP-9, [incident ownership](../operations/incident-ownership.md), [restore runbook](../operations/restore-runbook.md).
- **Dependencies** — PILOT-01a/b. Wire worker interfaces from PILOT-03 and PILOT-07 as they land.
- **RED / size** — Yes (secrets, data, access), L.
- **Allowed paths** — New `infra/pilot/`, `docker-compose.yml` (only for fixture parity), `.env.example`, `apps/api/src/` (worker startup/health and operational checks only), `packages/config/src/` (typed operational config), `tools/` (deploy/restore checks), `DEPLOY.md`, relevant `docs/operations/` runbooks.
- **Done when** — Versioned provider-neutral manifests and a reproducible fixture bring-up use the intended topology and separate roles. Keep host, database, object, monitoring and backup account bindings as inputs. Defer vendor-specific provisioning, endpoints and production credentials until D04 is approved in PILOT-12. Specify UK-primary hosts, private network and versioned storage, encrypted transport/storage/backups, a restricted checkpoint target independent of business runtime and the primary database, and secret references injected at runtime. Run the existing worker under a host supervisor with auto-restart, health/heartbeat and redacted monitoring. Exercise missed heartbeat, backlog/failure, unknown send, failed backup, unauthorized route and storage verification alerts with runbooks and responder slots. Validate with outbound paused, clean restart and no laptop dependency.
- **Needs Ben** — none.

### PILOT-09 — Prepare privacy operations and notice drafts

- **Goal** — Make verified access, export, deletion and revocation rehearsable against the actual pilot data classes.
- **Reference** — BUILD_PLAN M0-13c, §10.2.10, D07 and D12, [privacy operations](../operations/privacy-operations.md).
- **Dependencies** — PILOT-01a/b, PILOT-02, PILOT-06 and PILOT-08.
- **RED / size** — Yes (personal and hidden data, identity), M.
- **Allowed paths** — `docs/operations/privacy-operations.md`, draft notices in `docs/contracts/`, existing privacy machinery under `apps/api/src/`, `packages/db/{src,test}/`, `packages/storage/src/`, `tools/` (operator workflow only), notice page or onboarding paths under `apps/web/app/`.
- **Done when** — The operator route verifies requester identity and authority, scopes data to the subject/tenant, handles source versions, derived data and caches, logs, subprocessors, retained legal/accounting records, access grants and in-flight work. Verify export/redaction, retention expiry, queue fencing, revoking sessions and object access, and restricted tombstone reapplication after restore. Cover backup expiry and scoped disclosures of hidden material using the required fee-ineligibility path. Draft builder and homeowner notices and the Article 14 route. Use fixtures with explicit provisional settings until D07/D12 are approved.
- **Needs Ben** — none.

### PILOT-10 — Instrument the shadow pilot and no-charge report

- **Goal** — Capture the minimum records required to produce M1-15S reproducibly.
- **Reference** — BUILD_PLAN M1-15T/S, SV-6, CH-8, MON-1 and §10.2, [M1-15S stored financial check](../operations/m1-15s-read-records.md).
- **Dependencies** — PILOT-04a/b, PILOT-05, PILOT-06 and PILOT-09. Required before opening the cohort in PILOT-22 and for the report in PILOT-23.
- **RED / size** — Yes (hidden data, money and personal data), M.
- **Allowed paths** — Existing shadow-pilot modules in `packages/{core,db}/src/`, `packages/db/test/`, the existing restricted report or operator tooling under `tools/`, relevant post-reveal observation surfaces under `apps/web/app/`, M1-15S and trial runbooks.
- **Done when** — Fixture reports derive captures per job, signals at lock, false positives, confirmed and recovered amounts, disputed attributions, post-reveal fairness separate from usage, withholding harm, missed must-surface events, source usefulness and hypothetical subscription and success fees versus demonstrated value. Record methods and denominators, attribute immutable source records and identify missing observations. Keep any randomised hidden-versus-shown arm disabled unless D13 permits it. Use the existing restricted financial reader, with no privileged web credential. Check zero gross accruals, fee documents and collection/refund attempts plus zero tenant subscription activation/effects, with seeded negative controls. Audit exports and telemetry for pre-lock leaks and PII.
- **Needs Ben** — none.

### PILOT-11 — Prepare the evidence index and current-head test matrix

- **Goal** — Give each G0/G1 row a named artifact, runner and explicit fail-closed status.
- **Reference** — BUILD_PLAN §3, §5.6, §2 C8, M0 exit, M0-13d, LP-9 and [foundation gates](../operations/foundation-gates.md).
- **Dependencies** — PILOT-01a/b and PILOT-02–09 for final fixture receipts, including PILOT-04a/b. Start the index immediately.
- **RED / size** — Yes (release gates), M.
- **Allowed paths** — `config/foundation-gates.v1.json`, `packages/config/src/foundation-gates*`, related validation in `tools/`, `docs/operations/foundation-gates.md`, scrubbed evidence references under `docs/operations/`.
- **Done when** — Map all five G0 rows and all thirteen applicable G1 rows listed below. Preserve the three contractor-only rows with explicit scope blocks. Run the critical test matrix on current-head PostgreSQL with fixtures: fresh/upgrade, catalog/grants/RLS, identity, tenancy, concurrency/rollback, outbox, audit/ledger and affected phone/desktop E2E. Exercise pending, absent, wrong-version and superseded policies, versioned contracts and server-side refusal with either gate pending. Run the full pilot journey with fictional actors and fake delivery in an isolated pilot-mode test harness, from sign-in, quote and portal approval through extras/proof, Final Check, builder invoice and receipt. Assert zero JobGuard obligations, accruals, invoices, journals and collection attempts. Attach exact-head pass/fail receipts, leaving deployed checks and approvals visibly open.
- **Needs Ben** — none.

## Approvals, deployment and acceptance

### PILOT-12 — Approve the provider and residency map

- **Goal** — Verify and approve the exact routes and accounts the pilot will use.
- **Reference** — BUILD_PLAN §3 G1, M0-13a, [D04](../decisions/d04-providers-residency.md), [provider register](../operations/provider-register.md) and [provider-data-flow-v1](../contracts/provider-data-flow-v1.md).
- **Dependencies** — PILOT-08 topology and PILOT-03 mail requirements. Prepare candidate accounts and evidence in parallel.
- **RED / size** — Yes (security, personal data), M.
- **Allowed paths** — D04, `docs/operations/provider-register.md`, `docs/operations/identity-email-data-flow.md`, affected provider data-flow documents and existing policy/gate evidence records.
- **Done when** — D04 records the approved UK host for web/API/worker, separate Neon production project with verified region, private object storage, immutable versions, independently restricted checkpoint destination, backups, telemetry/logs, and the identity/commercial email provider and verified sending domain. Inventory processing and storage regions, remote access/transfers, subprocessors, retention/training/deletion, owners and fail-closed settings. Approve individually verified UK/EU-only data flows with UK-primary deployment and no global fallback. Keep live AI, remote speech, banking and other unused providers disabled. Record dated owner evidence.
- **Needs Ben** — D04 approval and delegated access to the UK host, Neon production project, storage/checkpoint/backup and alerting accounts, and approved email account and domain/DNS.

### PILOT-13 — Wire the approved email adapter

- **Goal** — Deliver entered codes, customer invitations and authorized documents via the selected regional route.
- **Reference** — BUILD_PLAN M0-6L, M0-13a, MON-5, D04 and [identity email data flow](../operations/identity-email-data-flow.md).
- **Dependencies** — PILOT-03, PILOT-06, PILOT-07 and approved PILOT-12.
- **RED / size** — Yes (identity, personal data, external action), M.
- **Allowed paths** — Existing email modules under `apps/api/src/{auth,effects}/`, `packages/config/src/`, the delivery adapter/repository in `packages/db/{src,test}/` if required, `.env.example`, email/provider data-flow docs and adapter dependencies if essential.
- **Done when** — The adapter uses the exact approved regional endpoint, verified sender, external secret injection and outbox outcome mapping. PILOT-01a’s server-side G1 switch must be open for identity, portal and commercial delivery in addition to exact D04 approval. After D04, wire the adapter and verify configuration with outbound disabled. Pending G1 or missing, revoked, superseded or mismatched approval prevents any real send. Deny fallback and attempts to route fake/test traffic through the live adapter. Verify authenticated domain/signing, expiry, provider redaction and failure behavior through fixtures and authorized non-customer controls. A controlled real inbox smoke with consenting participants follows G1 before cohort invites in PILOT-22.
- **Needs Ben** — Approved provider account, sender domain verification and securely provisioned credentials from PILOT-12.

### PILOT-14 — Approve the precise customer document and invoice scope

- **Goal** — Authorize only the legally and fiscally supported pilot documents and customer actions.
- **Reference** — BUILD_PLAN §3 G1, §§5.1/5.4, MON-5, [D02](../decisions/d02-vat-rounding-invoicing.md), [D06](../decisions/d06-builder-invoices-customer-approval-jurisdiction.md) and [pilot terms](../contracts/pilot-terms-v1.md).
- **Dependencies** — PILOT-04a/b and PILOT-05–07 fixture workflows. Legal and tax review can start earlier.
- **RED / size** — Yes (tax, approvals), M plus outside review.
- **Allowed paths** — D02/D06, `BUILD_PLAN.md` and `AGENTS.md` only for an approved contract reconciliation, exact notice and document templates under `docs/contracts/` or existing pilot document paths, existing policy gates and their tests.
- **Done when** — Ben, with UK solicitor and qualified tax/accounting review, records dated approval of the named jurisdiction(s), authenticated approval vs builder attestation, domestic cancellation kit and exact invoice/credit/rounding cases. D02/D06 propose a narrow standard-rated 20% GBP scope. Resolve explicitly D02's `tax_invoice` G4 wording versus D06's G1 `real_customer_invoice_issue` and the pilot contract; record exact approved versions and tested executable authorization for builder invoices, with JobGuard platform invoice and charging gates still closed. Unsupported cases and unresolved policy conflicts fail closed. Verify rejects for zero/reduced-rated, exempt, non-VAT-registered, mixed or foreign-currency cases, reverse charge, CIS and retention. Keep supported drafts available with an explanation when issue is blocked.
- **Needs Ben** — Solicitor and qualified UK tax/accounting review, then approval of exact D02/D06 scope, templates and reconciled gating.

### PILOT-15 — Approve retention and small-builder data protection

- **Goal** — Fix the privacy rules and recovery targets before processing customer or builder data.
- **Reference** — BUILD_PLAN §3 G1, §10.2.10, MON-5, M0-13b/c, [D07](../decisions/d07-retention-recovery-operations.md), [D12](../decisions/d12-data-protection-role-third-party-transparency.md).
- **Dependencies** — PILOT-09 and PILOT-12 destination inventory.
- **RED / size** — Yes (data and access), M plus outside review.
- **Allowed paths** — D07/D12, `BUILD_PLAN.md` and `AGENTS.md` only for an approved contract reconciliation, privacy/restore runbooks, notice content and the existing policy registry/gate tests.
- **Done when** — With legal/data and operations review, approve data-class retention periods, expiry/exceptions, restore/tombstone handling, access/export/deletion and measured recovery targets (draft RPO ≤24 hours and RTO ≤one working day). Approve the small-builder controller scope, job-linked purposes, lawful bases, Article 14 delivery, portal DPIA, homeowner notice and customer messages as Final Check evidence. MON-5 names D12 v3 while the current decision file is v4 (v3 plus contractor additions). Record the exact approved small-builder version and make MON-5 and its executable checks agree, including how the D12 track-gate wording applies to portal processing at G1. Keep contractor processing and WORM disabled.
- **Needs Ben** — Data/operations and UK data-protection legal review, then dated D07 and exact D12 small-builder approvals, including the DPIA and notices.

### PILOT-16 — Approve no-charge terms and Final Check disclosure

- **Goal** — Make the no-charge agreement and the Final Check rules clear before the first real job.
- **Reference** — BUILD_PLAN §3 G1, §10.2, M0-13d, M1-15S, [D13](../decisions/d13-shadow-attribution-delayed-disclosure.md) and [pilot-terms-v1](../contracts/pilot-terms-v1.md).
- **Dependencies** — PILOT-05 and PILOT-15 privacy scope.
- **RED / size** — Yes (money and hidden data), M plus outside review.
- **Allowed paths** — D13, `docs/contracts/pilot-terms-v1.md`, pilot onboarding/Final Check copy and existing terms/gate tests.
- **Done when** — Approve content versions and show/record them before the first job. Specify post-lock reveal, must-surface threshold and exceptions, dispute handling, pre-lock fee ineligibility and whether the measurement arm is allowed. Only approved hypothetical figures may be shown and the terms state zero JobGuard charges. Reconcile the pilot-terms reference to the older v1 hypothetical fee formula with the approved D13 disclosure and current small-builder policy before presenting examples. New versions preserve historic agreements and confer no paid entitlement.
- **Needs Ben** — Legal review and dated approval of `pilot_no_charge_v1` (or its reviewed successor), exact D13 small-builder scope, disclosure wording and hypothetical example.

### PILOT-17 — Provision the locked UK pilot deployment

- **Goal** — Run the exact pilot topology, with a monitored worker on the host, using only approved accounts and fictional evidence before G1.
- **Reference** — BUILD_PLAN M0-13a, M0-6L, LP-9 and §5.6, [incident ownership](../operations/incident-ownership.md) and [commercial outbound pause](../operations/commercial-outbound-pause.md).
- **Dependencies** — PILOT-08, PILOT-12 and the PILOT-13 deployable adapter. Use the integrated pilot build for acceptance.
- **RED / size** — Yes (secrets, data, identity), L.
- **Allowed paths** — `infra/pilot/`, deployment validation under `tools/`, deployment and incident runbooks, `.env.example` for names only. Credentials and private receipts stay in approved storage.
- **Done when** — Ben provisions or deploys the pinned artifacts into the approved isolation topology with real-data enrollment and all real sends disabled. Prove secret separation and rotation, no owner credential in services or artifacts, verified edge address provenance, non-owner runtime grants, redaction and versioned private objects. Kill/restart the Final Check/outbox worker and verify heartbeat, backlog recovery and alert delivery to named responders with Ben's Mac disconnected. Exercise the deployed outbound pause and reconciliation path and alerts from PILOT-08. Verify synthetic and billing resource refusal, access revocation and disabled live routes.
- **Needs Ben** — Founder-authorized provisioning/deploy for the exact head, plus named on-call owner, incident/reconciliation owner and two independent outbound operator accounts.

### PILOT-18 — Rehearse privacy operations on deployed topology

- **Goal** — Prove the approved privacy procedure with operator-run fictional requests on the pilot topology.
- **Reference** — BUILD_PLAN M0-13c, D07/D12 and [privacy operations](../operations/privacy-operations.md).
- **Dependencies** — PILOT-09, PILOT-15 and PILOT-17.
- **RED / size** — Yes (personal and hidden data), M.
- **Allowed paths** — `docs/operations/privacy-operations.md`, gated retention configuration, operational test tooling and scrubbed receipts in `docs/operations/`.
- **Done when** — Route, verify, fulfill and record representative access/export/deletion requests and access revocation across all approved data classes. Run two-tenant negative cases and verify storage and session revocation, redacted output, retained-record restriction, backup expiry and reconciliation of dispatched or unknown work. Record operator, scoped exceptions and remaining blocks. Builder and homeowner notices are ready at onboarding and portal entry and match the approved data flow.
- **Needs Ben** — Approved rules from PILOT-15 and a named privacy operator/contact with scoped access.

### PILOT-19 — Restore from deployed backups

- **Goal** — Recover the database, object versions and independently protected audit heads into an isolated, paused environment.
- **Reference** — BUILD_PLAN M0-13b and §5.6 (line 306), D07, LP-9 and [restore runbook](../operations/restore-runbook.md).
- **Dependencies** — PILOT-15, PILOT-17 and PILOT-18's deletion/revocation records.
- **RED / size** — Yes (data, access, duplicate execution), M.
- **Allowed paths** — `infra/pilot/` (backup/restore jobs only), `tools/` (restore verifier), restore runbook and scrubbed receipt under `docs/operations/`.
- **Done when** — A scheduled backup of the deployed pilot topology with fictional data is actually restored to an isolated destination. Verify object versions and representative hashes, audit chain against independent checkpoint (including a mismatch/tail-loss check and denial of checkpoint writes by the business runtime), role ownership/grants/RLS/triggers, tenant isolation and recovery time/data loss against approved RTO/RPO. Restore starts with external execution paused. Reapply tombstones, current revocations and approvals, reconcile outbox and unknown results and prove no replay of previously executed actions before any resume. Retain dated scrubbed backup and restore receipts.
- **Needs Ben** — D07 approval from PILOT-15 and scoped backup/restore access and operator ownership from PILOT-12/17.

### PILOT-20 — Close LP-9 deployment-representative evidence

- **Goal** — Verify exact deployed privileges and obtain the independent human review required before real data.
- **Reference** — BUILD_PLAN §11.8 LP-9, lines 3502–3511, and §5.6.
- **Dependencies** — Existing LP-0–LP-8b and LP-10–13 evidence, PILOT-17 and PILOT-19. Obtain the reviewer quote while construction proceeds.
- **RED / size** — Yes (identity, tenant data, money), M plus outside review.
- **Allowed paths** — Existing LP/catalog test harness in `packages/db/test/` and `tools/`, `docs/operations/` LP receipts and `docs/verdicts/`; fixes go through the owning PILOT piece.
- **Done when** — Run the existing LP-9 suite with real pooling as each least-privileged role against a disposable deployment equivalent. Pair refusals with authorized positive cases and committed-state checks. Verify role/credential separation, ownership and catalogs, seed destination guard, credential rotation with existing connections, restore/refusal rerun and restricted audit checkpoints. Bind results to application SHA, migrations, grants and topology. Document identity/business co-location and captured-session/admin limits. Record the independent human review of role model, binding and suite at that version. Green CI and synthetic LP-9 evidence alone do not close the row.
- **Needs Ben** — Explicit approval of the named independent human reviewer's quote before any spend, and access arrangements. Ben's existing direction already authorizes obtaining the quote.

### PILOT-21 — Record separate G0 acceptance and close G1

- **Goal** — Use the exact release candidate and approval receipts to determine whether pilot activation can proceed.
- **Reference** — BUILD_PLAN §2 C8, §3 G0/G1, §5.6 and M0-13d, [foundation gates](../operations/foundation-gates.md) and [gate rows](../../config/foundation-gates.v1.json).
- **Dependencies** — PILOT-01a/b, PILOT-02–09 (including PILOT-04a/b) and PILOT-11–20. PILOT-10 is independent of G1.
- **RED / size** — Yes (release, identity, data, money), M plus independent acceptance.
- **Allowed paths** — `config/foundation-gates.v1.json`, `docs/operations/foundation-gates.md`, scrubbed deployment/rehearsal receipts and `docs/verdicts/`, existing gate validation and policy records if required.
- **Done when** — Tie evidence to the same release SHA, topology, migrations, exact policy versions, test runs and dated approvers. Complete all G0 rows including independent technical acceptance by a separate actor, then all applicable G1 rows. Record exact D02, D04, D06, D07, D12 and D13 approvals and G0/G1 acceptance for the trusted release-bound switch in PILOT-01a. Verify at each server entry point and executor that real sign-in and invitations, real sends, customer invoice issue and real-data Final Check refuse without that approval record. Store the record only after Ben authorizes activation. Verify charging remains disabled even after the switch opens. Keep provider smoke with real participants for the authorized post-G1 step. Any unresolved row leaves real access and real sending disabled. Record Ben's exact activation decision separately.
- **Needs Ben** — Name an acceptor separate from the builder and checker for `g0-acceptance`, review dated approval and acceptance evidence, explicitly authorize activating the named candidate only after G0/G1 pass, and name the first consenting smoke participants. The separate technical acceptance belongs to its own actor.

## After G1 — pilot operation

### PILOT-22 — Open the cohort after the controlled smoke

- **Goal** — Admit a few approved small builders after a controlled builder/customer walkthrough on the deployed candidate.
- **Reference** — BUILD_PLAN §3 G1, M0-6L, MON-5, M1-15T and [UIWIRE-15 human trial checklist](../UIWIRE-15-human-trial-checklist.md).
- **Dependencies** — PILOT-10 and PILOT-21. If instrumentation changes the release candidate, rebind affected release evidence before exposing that candidate. Stop and re-close enrollment/outbound if smoke fails.
- **RED / size** — Yes (real identities, data and customer communications), S plus participant time.
- **Allowed paths** — Pilot activation and incident runbooks, restricted cohort/smoke receipts referenced by scrubbed `docs/operations/` records. No participant details in Git.
- **Done when** — Under Ben's activation authority and with consenting test participants, verify real inbox code and portal delivery, customer sign-in and exact document/approval path, monitoring and an authorized pause/resume as applicable. Then admit only the named cohort and record terms/notice receipt. A person observes two unscripted builder runs on the supported flow (prior qualifying practice evidence can count under M1-15T), dates the checklist, records friction and tracks blocking defects. No G2 reliance or paid action follows from this result.
- **Needs Ben** — Consenting smoke participants, named small-builder invite cohort and human trial observer, plus authorization to invite after smoke.

### PILOT-23 — Run and review the no-charge measurement period

- **Goal** — Collect the agreed observations and produce the real-job M1-15S pilot report for review.
- **Reference** — BUILD_PLAN M1-15S, §10.2 and §3 G4-S, [M1-15S stored financial check](../operations/m1-15s-read-records.md).
- **Dependencies** — PILOT-10, PILOT-15, PILOT-16 and PILOT-22.
- **RED / size** — Yes (real data, attribution and fee evidence), M analysis plus pilot calendar time.
- **Allowed paths** — Restricted report output in approved storage, scrubbed methods/evidence reference under `docs/operations/` and approved operator reporting tooling only.
- **Done when** — Gather immutable observation/financial records for authorized jobs and post-reveal fairness responses, disclose gaps and denominators, and review the reproducible report and no-charge proof. No collection or automatic policy lift follows. This is after G1 and is required evidence before any later G4-S decision.
- **Needs Ben** — Approve the cohort observation window and name the report reviewer. Review the resulting evidence before any paid-release decision.

## Gate evidence index

| Gate rows | Producing pieces and evidence |
| --- | --- |
| `g0-m0`, `g0-contracts`, `g0-policies`, `g0-postgres` | PILOT-11 and PILOT-17–21. Exact-head M0 exit matrix, versioned contracts, fail-closed tests and critical real PostgreSQL results. |
| `g0-acceptance` | PILOT-21. Technical acceptance of the exact candidate from Ben’s named acceptor, separate from its builder and checker. |
| `g1-d04`, `g1-invoice`, `g1-permissions` | PILOT-01a/b, PILOT-02–07 (including PILOT-04a/b), PILOT-12–14, PILOT-17 and PILOT-20. Approved register and invoice scope, verified builder/customer authority and deployed least privilege. |
| `g1-d07`, `g1-d12` | PILOT-15 and PILOT-18. Approved retention/privacy and deployed request rehearsal. |
| `g1-secrets`, `g1-alerts`, `g1-outbound` | PILOT-07/08 and PILOT-17/20. Secret/role proof, monitored restart and alerts, and stop/drain/reconcile/resume receipts. |
| `g1-backup`, `g1-restore`, `g1-checkpoint` | PILOT-08/17/19/20. Actual backups, measured isolated restore and an independently restricted checkpoint of tenant, sequence, hash and recorded time. |
| `g1-terms`, `g1-d13` | PILOT-16. Approved no-charge terms and exact Final Check disclosure. |
| `g1-contractor-pilot`, `g1-contractor-dpa`, `g1-contractor-d12` | Outside the small-builder cohort. Preserve these rows and keep real contractor access blocked. |

## Ben's decisions in unblock order

Start the combined legal/tax/privacy engagement and LP-9 quote first, while build work and D04 selection proceed in parallel. Book the separate technical acceptor early. Amounts below are indicative GBP planning ranges, with VAT and recurring charges to confirm in the quotes. Replace bracketed amounts with the exact approved cap inclusive of VAT where applicable. Send commissioning approval before work starts and policy approval after reviewing the named artifacts.

1. **Solicitor, tax review and invoice limits (PILOT-14–16).** Budget £2,000–£5,000 once for a combined UK engagement covering D02/D06, D12 and the pilot terms/D13. “I authorize up to £[combined cap] total under [quote] for [UK solicitor], [qualified UK tax/accounting reviewer] and [UK data-protection reviewer]. Use one engagement if it covers all three disciplines.” After review, send “Having reviewed [references], I approve [exact D02 and D06 versions and reconciled gate] for [named jurisdiction and supported GBP/VAT cases] and [exact customer approval and cancellation notice versions]. Keep other cases blocked.”
2. **Independent LP-9 review (PILOT-20).** Obtain the quote now under the existing direction. Allow £1,000–£3,000 once for budgeting. “I approve spending up to £[cap] on [named independent reviewer] under [quote] for LP-9 review of the role model, binding and deployment-representative refusal suite.” Schedule the review for the deployed evidence.
3. **Privacy, recovery, terms and Final Check (PILOT-15/16/18/19).** Use the combined cap in decision 1. “I authorize £[allocated amount] of the approved combined cap for the privacy, pilot terms and Final Check reviews under [quote], within the existing total.” After privacy review, send “Having reviewed [DPIA, notices and legal/operations evidence], I approve [exact D07 and small-builder D12 versions] with the retention schedule, Article 14 route and recovery targets at [reference]. [Name] owns privacy requests and [name] owns backup and restore.” After legal review of the terms, send “I approve [exact pilot terms version] and [exact D13 version] for this free small-builder pilot, with the disclosure, hypothetical example wording, must-surface threshold, dispute process and measurement arm [off or exact approved protocol] at [reference]. The pilot charges nothing.”
4. **D04, accounts and monthly spend (PILOT-12/13/17).** Budget UK web/API/worker host £30–£100/month, separate Neon production project £20–£75/month, storage/checkpoints/backups £10–£50/month, regional email £0–£30/month, and logging/alerts £0–£45/month. Indicative total £60–£300/month. “I approve D04 `provider_residency_policy_v1` for the exact pilot register at [reference]. I authorize monthly spend up to £[host] for [UK host/region], £[database] for [Neon production project/region], £[storage] for [storage/checkpoint/backup accounts/regions], £[email] for [regional email provider/endpoint and verified sender domain], and £[monitoring] for [logging/alerts destination], capped at £[total] per month. I will provision scoped access through [secret manager/access route].”
5. **Separate G0 technical acceptor (PILOT-21).** “I name [acceptor] to record technical acceptance against the exact release SHA for `g0-acceptance`. [Acceptor] is separate from [builder] and [checker] and will record the result against their verdict and the test evidence.”
6. **Deployment and incident ownership (PILOT-17).** “I authorize deployment of [full release SHA] to the approved UK pilot environment with real enrollment and real sends disabled. [Name] owns incidents, [name] owns reconciliation, and [two named people] hold separate outbound operator logins.”
7. **G1 activation and invite release (PILOT-21/22).** “I have reviewed [G0 separate technical acceptance and G1 evidence references]. Activate the free small-builder pilot at [full release SHA] for a controlled smoke with [consenting builder and customer], with all charging disabled. After a passing smoke, invite only [named cohort]. [Name] will observe the two unscripted builder trials.”
8. **Measurement and review (PILOT-23).** “Run the approved M1-15S observation plan for [cohort and dates]. [Name] will review the report and no-charge evidence before any paid-release decision.”

Native/offline, contractors, live model and remote speech routes, G2 reliance, connectors, regulated payment work and later paid-release changes are outside this plan.
