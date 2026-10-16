# LP-5C authority withdrawal v1 — partial tests-first preparation

Prepared 16 October 2026. **Cutover STOPPED. Not accepted. BUILD-DONT-MERGE; PARK.** Synthetic construction only; Ben controls merge, activation and deployment.

## Actual dependency boundary

Construction base is LP-5b `2eb4d98024f92e98cc538ab9279f8984be834502`, not the issued main SHA. Observed local origin/main is `7ff452eeec1c523345d34715adfa3f8310062013`; no fetch or live remote claim. Main's LP-5c card remains BUILD_PLAN.md:3381–3387. The inherited LP-5A receipt explicitly supplies a candidate codec only; LP-5B supplies a source writer inventory only. Neither supplies app.begin_command/app.complete_command, checked resolution/authorization creation, checked revocation, converted callers, a reviewed SQL lifecycle or acceptance evidence. The design note still says `Review record: none yet` at :5. LP-4's trusted audit append is also absent. There is no merged signature or reviewed-design commit/verdict to cite. No interface is invented.

Decision 74 permits building with made-up data, not withdrawal before conversion. The plan's compatible-landing rule still applies. LP-5c therefore does not create a migration, replacement routine or registration for missing SQL. Reservation 0200 is unused; eventual migration placeholder is `{mig}_revoke_direct_authority_writes.sql`. Use packages/db/migration-notes for its note, never shared migration files. The runner currently discovers numbered migrations; dispatcher renumbering must produce a numbered file before execution. No placeholder SQL is supplied to imply installation.

## Independent work prepared

Two new PostgreSQL suites are tests-first specifications, with **22 direct-write cases and four catalogue cases**. Both are NOT RUN: this sandbox cannot bind sockets or start PostgreSQL. They have no skip, fake database or test-only ACL withdrawal. On the inherited unconverted base they are expected red; no failing-first execution or passing implementation is claimed. Dispatcher must keep this partial branch parked, not interpret a package build as cutover evidence.

Direct cases use the actual jobguard_runtime login, distinct owner fixtures and a second owner connection for canonical state comparisons. Each statement has a valid owner-side control (or the existing immutable-record trigger refusal), is rolled back, and is followed by independent inspection of receipt/resolution/authorization/Decision/audit/outbox state. Each runtime refusal must be 42501. Valid references, independent status/result/time updates, combined completion, identity/actor/hash/type/semantic/time updates, direct revocation, INSERT SELECT, column-qualified INSERT, ON CONFLICT, UPDATE and DELETE are covered. The status-only control is an otherwise-valid unchanged status assignment; the combined case tests fabricated completion.

Catalogue cases query every live column, not merely columns carrying explicit ACLs. They check table/column privileges as the actual login, PUBLIC/inherited/switchable ACL routes, ownership, role posture, RLS/FORCE RLS, transitive view dependencies and retained SELECT with unset tenant context. These relation checks do not certify callable routines/helpers, trusted identity or approved positive command behavior. No copied or filtered LP-0 inventory substitutes for the protected reviewed baseline; re-grant controls remain stopped on coordinator maintenance.

## Required withdrawal after prerequisites

One transaction must revoke INSERT/UPDATE/DELETE on app.command_receipt, app.decision_resolution and app.action_authorization; separately revoke UPDATE(status,result,completed_at) on command_receipt and UPDATE(revoked_at) on action_authorization. Inspect every column and withdraw every remaining independent INSERT/UPDATE grant. No CASCADE. Retain SELECT, existing checked EXECUTE, rows, types, keys, policies, owner roles and triggers. New runtime grants: none. New tables/columns/functions/triggers: none. No backfill or historical rewrite.

Revocation is blocked until the checked revocation path and every legitimate writer are converted. Existing recovery-message-repository.ts:223 still directly revokes; extra-approval-chain-repository.ts:81 still claims receipts directly. Do not use an owner request connection, restore grants or provide generic definer wrappers.

## Caller-to-proof handoff

The complete inherited source inventory is [LP-5B](lp-5b-command-writers-v1.md), including its 31 dispositions, digest terms, completion anchors, actor rules and 46 source-indexed SQL overloads. It is a source map, not evidence of conversion or current PostgreSQL ACLs.

| Family | Current checked replacement | Required unchanged regressions / new positive proof |
| --- | --- | --- |
| Dispatcher commercial and dismiss/reject | Missing LP-5a lifecycle; commands.ts:67,90–95,100 still direct | commands; decision-adoption; command-replay-contract; atomic mutation/terminal receipt/audit/outbox |
| Extra and unlink | Missing LP-5b lifecycle | extra-origin; extra-links; extra-unlink; site-extra and authority |
| Site visit and approval chain (later writer) | ENT routines retained; repository receipt conversion missing | site-visit and authority; extra-approval-chain; non-owner committed replay |
| Proof and variations | Missing LP-5b lifecycle | proof-replay; variation; proof completion and exact approval |
| Inbox relevance and prevention | Missing LP-5b lifecycle | match-inbox-replay; prevention-checks; first result and no-op |
| Recovery follow-up/message | Missing LP-5b lifecycle and checked authorization revocation | recovery-follow-up; recovery-messages; cancellation, unknown outcome and exact execution-time authority |
| Job parties and adoption | Missing LP-5b lifecycle; excluded API replay seam | job-parties; work-order-import; API boundary tests |
| Commercial integrity feedback/checkpoint | Missing typed persistence/completion mechanism | commercial-integrity; commit-visible feedback/checkpoint proof |
| Demo bootstrap/seed | Missing LP-5b lifecycle; owner setup is not an application fallback | demo-bootstrap and bootstrap rollback/restart |
| Retained contractor/party/work-order/SoR/scheduling routes | Existing owner-side routes, not newly reviewed here | contractor; contractor-parties; work-order-import; sor; job-scheduling; pricing/evidence |
| Invoice, purchase order, recovery terms | Delegated dispatcher or retained checked routes; missing LP-5a seam | practice-invoice-audit; purchase-order-audit; recovery-case-terms; recovery-allocation; activation |
| Workers/outbox and synthetic restore | Existing reads/execution state and owner restore setup; not a new receipt writer grant | outbox; sandbox; restore CI; LP-10 remains open |

Every positive must commit, then independently read business result, terminal receipt and required linked facts, then replay in a later transaction without another effect. Unknown command kinds, changed significant actor/tenant/job/type/input, expired/revoked membership, insufficient roles and missing/dismissed/rejected/expired/revoked/superseded exact approvals require paired refusal controls. Completion-without-mutation, rollback, concurrent duplicates, cancellation and stale processing follow the eventual reviewed lifecycle; no policy is invented here. No command-path suite is fabricated against an absent interface.

The six exact named contractor cases remain UNBUILT in LP-5c:

- “replaying a command id returns the first result, never the job's current state”;
- “the same command id with a changed payload conflicts”;
- “the same command id on another job conflicts”;
- “a successful no-op keeps its identity”;
- “a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written”;
- “an unauthorised caller gets the identical EXTRA_FORBIDDEN for unknown, foreign, not-live and live jobs”.

Site logging remains operative/supervisor/surveyor; office entries finance/admin/owner; client instructions commercial-manager/admin/owner. No registration or guard is changed. All requested regression suites are NOT RUN here. No new route/UI/OpenAPI operation or AI behavior is introduced.

## Remaining authority paths — source inventory, not live catalogue

The following is a dated snapshot of the reviewed **main** inventory, rather than a new permitted baseline. Every listed path remains open or needs fresh live verification; none is declared closed by this partial piece. Effective route is the exact ACL grantee/signature below; additional inherited/PUBLIC/owner/helper paths require actual readCatalogue and behavior after prerequisite integration. Callers are the LP-5B map above for command families and the sources below for other domains. Tests listed are required existing behavior references, all NOT RUN in this sandbox. Status for every row: **OPEN / not independently verified**. Cards are the existing plan assignments; this piece does not silently close LP-6d/LP-8/LP-10.

### a-exec-activation-v3

Closing/review cards: LP-3, LP-6c. Status: OPEN / source only.

Checked activation: active owner, processing receipt and matching unexpired authorization are verified inside the routine; actor and tenant are still caller-supplied until LP-6.

Callers/source: `packages/db/migrations/0012_job_activation.sql:71`, `packages/db/migrations/0012_job_activation.sql:72`.

Behavioral evidence required: `packages/db/test/activation.integration.test.ts`, `packages/db/test/job-activation-terms.integration.test.ts`, `packages/db/test/quote.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.switch_job_live_v3(uuid,uuid,uuid,uuid,uuid,integer,character,integer,uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
```

### a-exec-checked-billing-money

Closing/review cards: LP-6c, LP-8a. Status: OPEN / source only.

Routines that post invoices, credit notes, receipts, reversals and journal entries with same-actor processing receipt and exact authorization checks inside; the older issue_practice_customer_invoice signature and the lock-bound signature both exist and both are inventoried.

Callers/source: `packages/db/migrations/0017_customer_billing.sql:8`, `packages/db/migrations/0017_customer_billing.sql:14`, `packages/db/migrations/0027_uiwire10_customer_invoice.sql:52`, `packages/db/migrations/0028_uiwire11_credit_notes.sql:14`.

Behavioral evidence required: `packages/db/test/UIWIRE-10.integration.test.ts`, `packages/db/test/UIWIRE-11.integration.test.ts`, `packages/db/test/final-account-lock-invoice.integration.test.ts`, `packages/db/test/practice-invoice-audit.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.issue_practice_customer_credit_note(uuid,uuid,uuid,uuid,uuid,bigint,text,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.issue_practice_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,date)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.post_plan_obligation(uuid,uuid,uuid,uuid,bigint,character,character varying,character varying,character varying,character,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.post_plan_settlement(uuid,uuid,uuid,uuid,uuid,bigint,character,character varying,character varying,character,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.record_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,date,bigint,text,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.reverse_journal(uuid,uuid,uuid,character varying,character varying,character,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,uuid,text)|jobguard_runtime|EXECUTE|-
```

### a-exec-final-account

Closing/review cards: LP-6c, LP-8a. Status: OPEN / source only.

Checked final-account operations that call owner-side lock and audit helpers (append_final_lock_audit is owner-only and unreachable by the login).

Callers/source: `packages/db/migrations/0132_final_account_lock.sql:74`, `packages/db/migrations/0132_final_account_lock.sql:142`.

Behavioral evidence required: `packages/db/test/final-account.integration.test.ts`, `packages/db/test/final-account-lock.integration.test.ts`, `packages/db/test/final-account-lock-invoice.integration.test.ts`, `packages/db/test/final-account-lock-reveal.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.accept_final_check_terms(uuid,uuid,uuid,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.advance_final_account_draft(uuid,uuid,uuid,integer)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.invalidate_stale_final_account_authorizations(uuid,uuid,character)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.prepare_final_review_extra(uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.read_final_account_lock_verification(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.record_final_account_disposition(uuid,uuid,uuid,uuid,uuid,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.require_current_job_parties(uuid,uuid)|jobguard_runtime|EXECUTE|-
```

### a-exec-helper-predicates

Closing/review cards: . Status: OPEN / source only.

Permission predicates (contractor_allowed, ent3a_extra_authority, ...), validators (valid_*), recovery message and follow-up readers and similar helpers. Static source scan shows no table writes; they run SECURITY INVOKER (RLS applies) or are definers without writes. This is a hypothesis from source inspection; behavioural coverage is the callers tests.

Callers/source: `packages/db/migrations/0005_commands.sql`.

Behavioral evidence required: `packages/db/test/contractor.integration.test.ts`, `packages/db/test/recovery-follow-up.integration.test.ts`, `packages/db/test/site-extra-authority.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.contractor_allowed(uuid,text,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.contractor_job_allowed(uuid,text,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.contractor_job_assigned(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.contractor_job_team(uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.contractor_member_active(uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.contractor_role_permits(text,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.lock_recovery_message_sources(uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_follow_up_case_facts(uuid,uuid,integer)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_follow_up_delivered(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_follow_up_live(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_follow_up_reminder_approvable(uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_follow_up_reminder_window(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_follow_up_run_tick(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_follow_up_stop_reason(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_job_payer_type(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_message_canonical_content(uuid,uuid,text,integer,bigint,uuid,integer,text,text,text,text,text,text,jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_message_case_snapshot(uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_message_proofs_current(uuid,uuid,jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_message_source_refs(text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_message_sources_current(uuid,uuid,uuid,jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.sor_import_permitted(uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.sor_line_net_pence(text,bigint,bigint,bigint)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.valid_approval_rules(jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.valid_client_contract(jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.valid_contractor_resident(jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.valid_party_revision_text(jsonb,integer,integer)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.valid_prevention_result(jsonb,text,text,text,timestamp with time zone)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.work_order_client_permitted(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.work_order_import_permitted(uuid)|jobguard_runtime|EXECUTE|-
```

### a-exec-job-parties-work-orders

Closing/review cards: LP-6d, LP-7, LP-13. Status: OPEN / source only.

Checked entry points that write jobs, party bindings, work orders, scope identity, memberships and role grants after contractor and member permission checks; decided member and contractor permissions are preserved.

Callers/source: `packages/db/migrations/0150_membership_authority_fix.sql`.

Behavioral evidence required: `packages/db/test/contractor.integration.test.ts`, `packages/db/test/contractor-parties.integration.test.ts`, `packages/db/test/contractor-owner-grant.integration.test.ts`, `packages/db/test/work-order-import.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.adopt_in_flight_job(uuid,uuid,uuid,character varying,character varying,character,character varying,bigint,bigint,character varying,character varying,uuid,timestamp with time zone)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.adopt_in_flight_job(uuid,uuid,uuid,character varying,character varying,character,character varying,bigint,bigint,character varying,character varying,uuid,timestamp with time zone,uuid,uuid,uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.bind_contractor_parties(uuid,jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.bind_job_parties(uuid,uuid,uuid,integer,uuid,uuid,uuid,boolean,text,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.contractor_admin_command(uuid,jsonb,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.import_batch_record(uuid,jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.import_sor_version(uuid,jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.link_contractor_customer(uuid,uuid,jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.read_contractor_resident(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.work_order_begin(uuid,uuid,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.work_order_commit(uuid,jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.work_order_parties_unchanged(uuid,uuid,uuid,uuid,uuid,jsonb)|jobguard_runtime|EXECUTE|-
```

### a-exec-practice-session-trusted

Closing/review cards: LP-6a, LP-6d. Status: OPEN / source only.

authenticate_practice_session, revoke_contractor_practice_session and the trusted practice records of 0138 validate a practice credential; a usable session digest is a credential and is kept out of logs.

Callers/source: `packages/db/migrations/0018_recovery_outcomes.sql:41`, `packages/db/migrations/0023_recovery_demo_ui.sql:17`, `packages/db/migrations/0024_fee_illustration.sql:15`, `packages/db/migrations/0097_recovery_case_current.sql:38`.

Behavioral evidence required: `packages/db/test/contractor-practice-session.integration.test.ts`, `packages/db/test/practice-session.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.authenticate_practice_session(text,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ch4_read_work_facts(uuid,uuid,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.contractor_session(uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.revoke_contractor_practice_session(uuid)|jobguard_runtime|EXECUTE|-
```

### a-exec-practice-worker-switch

Closing/review cards: LP-6a, LP-6d, LP-12. Status: OPEN / source only.

Runtime EXECUTE is the only runtime power added: practice_worker_switch_on, practice_worker_switch_off and practice_worker_switch_state authenticate through contractor_practice_session_live, compare its tenant, and refuse outside jobguard_synthetic_demo. Start checks the active owner, made-up company and eligible same-company worker; end and state remain session-scoped. These are checked session-authorized routines, not direct table writes. Both control_plane tables and all seven helpers have no runtime or PUBLIC access; the three entry points revoke PUBLIC and pin search_path=pg_catalog. No membership, commercial approval, billing or money authority is granted.

Callers/source: `packages/db/migrations/0165_practice_worker_switch.sql`, `packages/db/src/practice-worker-switch-repository.ts`.

Behavioral evidence required: `packages/db/test/practice-worker-switch.integration.test.ts`, `packages/db/test/practice-worker-switch-proof.integration.test.ts`, `packages/db/test/practice-company-marker.integration.test.ts`, `packages/db/test/practice-worker-switch-upgrade.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.practice_worker_switch_off(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.practice_worker_switch_on(uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.practice_worker_switch_state(uuid)|jobguard_runtime|EXECUTE|-
```

### a-exec-recovery-money

Closing/review cards: LP-6c, LP-8a. Status: OPEN / source only.

Checked recovery operations including write_recovery_allocation (M4-8-S) over the six SELECT-only allocation tables; preserved, not widened.

Callers/source: `packages/db/migrations/0136_recovery_allocation.sql:111`, `packages/db/migrations/0134_recovery_case_terms.sql:61`, `packages/db/migrations/0018_recovery_outcomes.sql:41`.

Behavioral evidence required: `packages/db/test/recovery-allocation.integration.test.ts`, `packages/db/test/recovery-case-terms.integration.test.ts`, `packages/db/test/recovery-cases.integration.test.ts`, `packages/db/test/recovery-insurer-money.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.lock_recovery_payer_job(uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_allocation_invoice_lines(uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.recovery_case_terms_approved(uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.write_recovery_payment_payer_mark(uuid,uuid,jsonb)|jobguard_runtime|EXECUTE|-
```

### a-exec-shadow-runtime

Closing/review cards: LP-4, LP-6d, LP-10. Status: OPEN / source only.

reveal_shadow_signals and the narrow shadow and emergency-access grants (signal state columns, disclosure and emergency access writers) are reviewed role-scoped paths; append_shadow_audit is owner-side.

Callers/source: `packages/db/migrations/0128_shadow_persistence.sql:214`.

Behavioral evidence required: `packages/db/test/shadow-catalog.integration.test.ts`, `packages/db/test/shadow-persistence.integration.test.ts`, `packages/db/test/shadow-isolation-query-log.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.read_shadow_emergency(uuid,uuid,text)|jobguard_shadow_emergency_access|EXECUTE|-
acl|routine|function:app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text)|jobguard_shadow_emergency_access|EXECUTE|-
acl|routine|function:app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text)|jobguard_shadow|EXECUTE|-
acl|routine|function:app.reveal_shadow_signals(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.surface_shadow_signal_early(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb)|jobguard_shadow|EXECUTE|-
```

### a-exec-site-extra-routines

Closing/review cards: LP-5b, LP-6d. Status: OPEN / source only.

Site visits, pricing basis and resident confirmation routines apply contractor and member permission checks inside the database; contractor write routes are registered pre_live_allowed with their own live-job guards.

Callers/source: `packages/db/migrations/0139_site_visit_closeout.sql`, `packages/db/migrations/0140_site_extra_pricing.sql`, `packages/db/migrations/0141_site_extra_evidence.sql`.

Behavioral evidence required: `packages/db/test/site-visit.integration.test.ts`, `packages/db/test/site-visit-authority.integration.test.ts`, `packages/db/test/site-extra-pricing.integration.test.ts`, `packages/db/test/site-extra-evidence.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.ent3a_extra_authority(uuid,text,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3a_require_extra_authority(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3b_complete_visit(uuid,uuid,uuid,uuid,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3b_require_open_visit(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3b_start_visit(uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3b_visit_authority(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3c_record_sor_revision(uuid,uuid,text,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3d_confirmation_document(uuid,uuid,uuid,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3d_content_sha256(uuid,text,text,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3d_record_resident_confirmation(uuid,uuid,uuid,uuid,text,text,uuid,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3d_require_site_extra_evidence(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.ent3d_site_extra_evidence(uuid,text,text,uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.require_watchdog_live(uuid)|jobguard_runtime|EXECUTE|-
```

### a-exec-extra-approval-routines

Closing/review cards: LP-5b, LP-6d. Status: OPEN / source only.

The approval chain for contractor extras: submit, price, approve, reject, revise, withdraw, mark duplicate, owner-approved client link, client decision, escalation and queue. Each writer re-checks the command receipt, the actor and the stored grants; runtime holds SELECT only on the tables.

Callers/source: `packages/db/migrations/0158_extra_approval_chain.sql`, `packages/db/src/extra-approval-chain-repository.ts`.

Behavioral evidence required: `packages/db/test/extra-approval-chain.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.xa_approve(uuid,uuid,uuid,uuid,integer,text,bigint,boolean,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_client_decide(uuid,uuid,uuid,uuid,text,text,text,bigint,boolean,text,text,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_client_view_authority(uuid,uuid,uuid,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_covers(uuid,text[],uuid,text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_decision_id(uuid,integer)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_escalate()|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_issue_link(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_mark_duplicate(uuid,uuid,uuid,uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_price(uuid,uuid,uuid,uuid,bigint,boolean)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_queue(uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_revoke_link(uuid,uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_submit(uuid,uuid,uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.xa_withdraw(uuid,uuid,uuid,uuid,text)|jobguard_runtime|EXECUTE|-
```

### a-exec-trigger-functions-runtime

Closing/review cards: . Status: OPEN / source only.

Executable by the login but refused when called directly (0A000), proven by lp-0-authority-paths.integration.test.ts.

Callers/source: `packages/db/migrations/0005_commands.sql`.

Behavioral evidence required: `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.require_prevention_subject()|jobguard_runtime|EXECUTE|-
```

### x-audit-event-insert

Closing/review cards: LP-4, LP-6e. Status: OPEN / source only.

The application login computes sequence, previous hash, event hash, time and actor text of audit records, so it can seal a false approval, payment or completion statement. audit_export rows record exported checkpoints and are written by the same login.

Callers/source: `packages/db/migrations/0001_audit.sql:89`, `packages/db/migrations/0001_audit.sql:91`, `packages/db/migrations/0132_final_account_lock.sql:142`, `packages/db/migrations/0128_shadow_persistence.sql:214`.

Behavioral evidence required: `packages/db/test/audit.integration.test.ts`, `packages/db/test/audit-export.integration.test.ts`, `packages/db/test/final-account-lock.integration.test.ts`, `packages/db/test/shadow-persistence.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.audit_event|jobguard_runtime|INSERT|-
acl|rel|table|app.audit_export|jobguard_runtime|INSERT|-
```

### x-audit-head-execute

Closing/review cards: LP-4. Status: OPEN / source only.

Advancing the audit head directly lets the caller choose the head sequence and hash for the next record.

Callers/source: `packages/db/migrations/0001_audit.sql:89`, `packages/db/migrations/0001_audit.sql:91`, `packages/db/migrations/0132_final_account_lock.sql:142`, `packages/db/migrations/0128_shadow_persistence.sql:214`.

Behavioral evidence required: `packages/db/test/audit.integration.test.ts`, `packages/db/test/audit-export.integration.test.ts`, `packages/db/test/final-account-lock.integration.test.ts`, `packages/db/test/shadow-persistence.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.advance_audit_head(bigint,character)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.lock_audit_head()|jobguard_runtime|EXECUTE|-
```

### x-command-authority-writes

Closing/review cards: LP-5a, LP-5b, LP-5c. Status: OPEN / source only.

A receipt records who is processing a command, a resolution records an approval and an authorization is the single-use exact approval of an operation; the login can write all three and can mark a receipt complete or revoke an authorization.

Callers/source: `packages/db/migrations/0005_commands.sql:76`, `packages/db/migrations/0005_commands.sql:79`, `packages/db/migrations/0005_commands.sql:80`, `packages/db/src/commands.ts`.

Behavioral evidence required: `packages/db/test/commands.integration.test.ts`, `packages/db/test/command-replay-contract.integration.test.ts`, `packages/db/test/proof-replay.integration.test.ts`, `packages/db/test/decision-adoption.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|col|app.action_authorization.revoked_at|jobguard_runtime|UPDATE|-
acl|col|app.command_receipt.completed_at|jobguard_runtime|UPDATE|-
acl|col|app.command_receipt.result|jobguard_runtime|UPDATE|-
acl|col|app.command_receipt.status|jobguard_runtime|UPDATE|-
acl|rel|table|app.action_authorization|jobguard_runtime|INSERT|-
acl|rel|table|app.command_receipt|jobguard_runtime|INSERT|-
acl|rel|table|app.decision_resolution|jobguard_runtime|INSERT|-
```

### x-customer-billing-writes

Closing/review cards: LP-8a. Status: OPEN / source only.

Issuing an invoice, credit, payment or reversal moves money records; the login can write them without the exact-approval and same-actor receipt checks the routines apply.

Callers/source: `packages/db/migrations/0017_customer_billing.sql:8`, `packages/db/migrations/0017_customer_billing.sql:14`, `packages/db/migrations/0027_uiwire10_customer_invoice.sql:52`, `packages/db/migrations/0028_uiwire11_credit_notes.sql:14`.

Behavioral evidence required: `packages/db/test/UIWIRE-10.integration.test.ts`, `packages/db/test/UIWIRE-11.integration.test.ts`, `packages/db/test/final-account-lock-invoice.integration.test.ts`, `packages/db/test/practice-invoice-audit.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.customer_credit_note|jobguard_runtime|INSERT|-
acl|rel|table|app.customer_invoice_evidence|jobguard_runtime|INSERT|-
acl|rel|table|app.customer_invoice|jobguard_runtime|INSERT|-
acl|rel|table|app.customer_payment_reversal|jobguard_runtime|INSERT|-
acl|rel|table|app.customer_payment|jobguard_runtime|INSERT|-
```

### x-decision-insert

Closing/review cards: LP-5b, LP-6d. Status: OPEN / source only.

A decision is the card an approval is attached to; inserting one directly is a precondition for forging an approval chain with the resolution write above.

Callers/source: `packages/db/migrations/0005_commands.sql:76`, `packages/db/migrations/0005_commands.sql:79`, `packages/db/migrations/0005_commands.sql:80`, `packages/db/src/commands.ts`.

Behavioral evidence required: `packages/db/test/commands.integration.test.ts`, `packages/db/test/command-replay-contract.integration.test.ts`, `packages/db/test/proof-replay.integration.test.ts`, `packages/db/test/decision-adoption.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.decision|jobguard_runtime|INSERT|-
```

### x-evidence-writes

Closing/review cards: LP-8b. Status: OPEN / source only.

Evidence objects, links, uploads, invalidations, packs and attachment approvals decide what proof stands; direct writes can substitute evidence or invalidate another person proof. evidence_object is fingerprinted.

Callers/source: `packages/db/migrations/0002_evidence.sql:100`.

Behavioral evidence required: `packages/db/test/evidence.integration.test.ts`, `packages/db/test/evidence-packs.integration.test.ts`, `packages/db/test/evidence-pack-sources.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|col|app.evidence_upload.id|jobguard_runtime|UPDATE|-
acl|col|app.evidence_upload.object_version_id|jobguard_runtime|UPDATE|-
acl|col|app.evidence_upload.rejection_code|jobguard_runtime|UPDATE|-
acl|col|app.evidence_upload.server_verified_at|jobguard_runtime|UPDATE|-
acl|col|app.evidence_upload.state|jobguard_runtime|UPDATE|-
acl|rel|table|app.evidence_invalidation|jobguard_runtime|INSERT|-
acl|rel|table|app.evidence_link|jobguard_runtime|INSERT|-
acl|rel|table|app.evidence_object|jobguard_runtime|INSERT|-
acl|rel|table|app.evidence_pack_attachment_approval|jobguard_runtime|INSERT|-
acl|rel|table|app.evidence_pack_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.evidence_pack|jobguard_runtime|INSERT|-
acl|rel|table|app.evidence_upload|jobguard_runtime|INSERT|-
acl|rel|table|app.synthetic_evidence_original|jobguard_runtime|INSERT|-
```

### x-exec-invoice-number

Closing/review cards: LP-8a, LP-13. Status: OPEN / source only.

Consumes the next invoice number for a tenant without issuing an invoice.

Callers/source: `packages/db/migrations/0017_customer_billing.sql:14`.

Behavioral evidence required: `packages/db/test/UIWIRE-10.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.reserve_customer_invoice_number(uuid)|jobguard_runtime|EXECUTE|-
```

### x-exec-invoker-follow-up-engine

Closing/review cards: LP-4, LP-6d. Status: OPEN / source only.

Runs with the runtime login own privileges: its audit and decision writes succeed only because of the direct audit INSERT and head EXECUTE exceptions above.

Callers/source: `packages/db/migrations/0134_recovery_case_terms.sql`, `packages/db/src/recovery-message-repository.ts`.

Behavioral evidence required: `packages/db/test/recovery-messages.integration.test.ts`, `packages/db/test/recovery-follow-up.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.evaluate_recovery_follow_ups(uuid,uuid)|jobguard_runtime|EXECUTE|-
```

### x-exec-legacy-activation-acceptance

Closing/review cards: LP-3. Status: OPEN / source only.

Legacy signatures take no command or authorization id and do not carry the 0109 active-owner, processing-receipt and matching-authorization checks; saved-v1 compatibility must be preserved.

Callers/source: `packages/db/migrations/0012_job_activation.sql:71`, `packages/db/migrations/0012_job_activation.sql:72`.

Behavioral evidence required: `packages/db/test/activation.integration.test.ts`, `packages/db/test/job-activation-terms.integration.test.ts`, `packages/db/test/quote.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,character varying,timestamp with time zone)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,character varying,character varying,character varying,uuid,timestamp with time zone)|jobguard_runtime|EXECUTE|-
```

### x-exec-practice-actorless

Closing/review cards: LP-2, LP-8a. Status: OPEN / source only.

Practice session issue, contractor practice start (creates tenant, account and membership rows as owner), recovery demo, fee illustration and synthetic landing routines act without a validated actor and must refuse outside the practice database.

Callers/source: `packages/db/migrations/0018_recovery_outcomes.sql:41`, `packages/db/migrations/0023_recovery_demo_ui.sql:17`, `packages/db/migrations/0024_fee_illustration.sql:15`, `packages/db/migrations/0097_recovery_case_current.sql:38`.

Behavioral evidence required: `packages/db/test/practice-session.integration.test.ts`, `packages/db/test/practice-invoice-audit.integration.test.ts`, `packages/db/test/recovery.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.approve_synthetic_landing(jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.configure_recovery_demo(uuid,uuid,character varying)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.create_fee_illustration_source(uuid,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.issue_practice_session(text)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.post_recovery_fee_candidate(jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.reverse_synthetic_landing(uuid,uuid,uuid,uuid,uuid,bigint,character varying)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.start_contractor_practice(uuid)|jobguard_runtime|EXECUTE|-
```

### x-exec-transition-job

Closing/review cards: LP-2. Status: OPEN / source only.

Moves a job between lifecycle states with caller-supplied tenant, actor and reason; the executable route that the plan names as an unchecked job door. Fails on its own checks, not on permission (demonstrated).

Callers/source: `packages/db/migrations/0003_job_spine.sql:121`, `packages/db/migrations/0020_job_import.sql:30`, `packages/db/migrations/0020_job_import.sql:32`, `packages/db/migrations/0020_job_import.sql:46`, `packages/db/migrations/0095_job_parties.sql:281`.

Behavioral evidence required: `packages/db/test/job.integration.test.ts`, `packages/db/test/job-import.integration.test.ts`, `packages/db/test/job-parties.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.transition_job(uuid,uuid,integer,character varying,character varying,uuid,bigint,character varying,bigint)|jobguard_runtime|EXECUTE|-
```

### x-extra-writes

Closing/review cards: LP-5b, LP-5c, LP-8b. Status: OPEN / source only.

Extras origin and links decide who raised an extra and which order line it is linked to; ENT-3a permission distinctions must be preserved.

Callers/source: `packages/db/src/extra-repository.ts`, `packages/db/src/site-extra-repository.ts`, `packages/db/migrations/0135_site_extra_authority.sql`.

Behavioral evidence required: `packages/db/test/site-extra.integration.test.ts`, `packages/db/test/site-extra-authority.integration.test.ts`, `packages/db/test/extra-origin.integration.test.ts`, `packages/db/test/extra-links.integration.test.ts`, `packages/db/test/extra-unlink.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.extra_duplicate_link|jobguard_runtime|INSERT|-
acl|rel|table|app.extra_event|jobguard_runtime|INSERT|-
acl|rel|table|app.extra_order_line_link|jobguard_runtime|INSERT|-
acl|rel|table|app.extra_origin|jobguard_runtime|INSERT|-
```

### x-final-account-writes

Closing/review cards: LP-8a, LP-8b. Status: OPEN / source only.

Final account drafts, lines, proofs and revisions are the statement of what is owed; direct inserts can alter the pointer a lock later binds.

Callers/source: `packages/db/migrations/0132_final_account_lock.sql:74`, `packages/db/migrations/0132_final_account_lock.sql:142`.

Behavioral evidence required: `packages/db/test/final-account.integration.test.ts`, `packages/db/test/final-account-lock.integration.test.ts`, `packages/db/test/final-account-lock-invoice.integration.test.ts`, `packages/db/test/final-account-lock-reveal.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.final_account_draft|jobguard_runtime|INSERT|-
acl|rel|table|app.final_account_line|jobguard_runtime|INSERT|-
acl|rel|table|app.final_account_proof|jobguard_runtime|INSERT|-
acl|rel|table|app.final_account_revision|jobguard_runtime|INSERT|-
```

### x-invoice-number-sequences

Closing/review cards: LP-8a, LP-13. Status: OPEN / source only.

These are TABLES that allocate invoice and credit-note numbers, not PostgreSQL sequences: writing them burns or repeats issued numbers (numbering path). Not harmless working data.

Callers/source: `packages/db/migrations/0017_customer_billing.sql:8`, `packages/db/migrations/0017_customer_billing.sql:14`, `packages/db/migrations/0027_uiwire10_customer_invoice.sql:52`, `packages/db/migrations/0028_uiwire11_credit_notes.sql:14`.

Behavioral evidence required: `packages/db/test/UIWIRE-10.integration.test.ts`, `packages/db/test/UIWIRE-11.integration.test.ts`, `packages/db/test/final-account-lock-invoice.integration.test.ts`, `packages/db/test/practice-invoice-audit.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.customer_credit_note_sequence|jobguard_runtime|INSERT|-
acl|rel|table|app.customer_credit_note_sequence|jobguard_runtime|SELECT|-
acl|rel|table|app.customer_invoice_sequence|jobguard_runtime|INSERT|-
acl|rel|table|app.customer_invoice_sequence|jobguard_runtime|SELECT|-
```

### x-job-insert-and-terms

Closing/review cards: LP-2, LP-3, LP-8a. Status: OPEN / source only.

A job row carries status, accepted price and recovery cap; inserting one directly with commercial terms bypasses quote acceptance and activation.

Callers/source: `packages/db/migrations/0003_job_spine.sql:121`, `packages/db/migrations/0020_job_import.sql:30`, `packages/db/migrations/0020_job_import.sql:32`, `packages/db/migrations/0020_job_import.sql:46`, `packages/db/migrations/0095_job_parties.sql:281`.

Behavioral evidence required: `packages/db/test/job.integration.test.ts`, `packages/db/test/job-import.integration.test.ts`, `packages/db/test/job-parties.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.job_activation_terms|jobguard_runtime|INSERT|-
acl|rel|table|app.job|jobguard_runtime|INSERT|-
```

### x-membership-account-writes

Closing/review cards: LP-1, LP-7. Status: OPEN / source only.

Forging, promoting or restoring a membership row (owner or member) and creating accounts, directly as the application login inside its own tenant. Demonstrated by lp-0-authority-paths.integration.test.ts (membership insert as the real role).

Callers/source: `packages/db/migrations/0000_tenancy.sql:82`, `packages/db/migrations/0137_scim_deactivation.sql:78`, `packages/db/migrations/0150_membership_authority_fix.sql`.

Behavioral evidence required: `packages/db/test/tenancy.integration.test.ts`, `packages/db/test/identity.integration.test.ts`, `packages/db/test/contractor-owner-grant.integration.test.ts`, `packages/db/test/scim-deactivation.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|col|app.account.created_at|jobguard_runtime|UPDATE|-
acl|col|app.membership.created_at|jobguard_runtime|UPDATE|-
```

### x-outbox-writes

Closing/review cards: LP-8b, LP-10. Status: OPEN / source only.

The outbox holds approved actions awaiting execution; direct insert or status updates can add, change or complete a queued action. Fake outbound is not proof the writes are safe.

Callers/source: `packages/db/migrations/0005_commands.sql`, `apps/api/src/worker.ts`.

Behavioral evidence required: `packages/db/test/outbox.integration.test.ts`, `packages/db/test/sandbox.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|col|app.action_attempt.error_code|jobguard_runtime|UPDATE|-
acl|col|app.action_attempt.finished_at|jobguard_runtime|UPDATE|-
acl|col|app.action_attempt.outcome|jobguard_runtime|UPDATE|-
acl|col|app.action_attempt.provider_reference|jobguard_runtime|UPDATE|-
acl|col|app.action_outbox.claimed_at|jobguard_runtime|UPDATE|-
acl|col|app.action_outbox.completed_at|jobguard_runtime|UPDATE|-
acl|col|app.action_outbox.next_attempt_at|jobguard_runtime|UPDATE|-
acl|col|app.action_outbox.status|jobguard_runtime|UPDATE|-
acl|col|app.action_outbox.updated_at|jobguard_runtime|UPDATE|-
acl|col|app.provider_event_inbox.processed_at|jobguard_runtime|UPDATE|-
acl|col|app.provider_event_inbox.processing_status|jobguard_runtime|UPDATE|-
acl|rel|table|app.action_attempt|jobguard_runtime|INSERT|-
acl|rel|table|app.action_outbox|jobguard_runtime|INSERT|-
acl|rel|table|app.provider_event_inbox|jobguard_runtime|INSERT|-
```

### x-prevention-fact-writes

Closing/review cards: LP-8b. Status: OPEN / source only.

Facts recorded by prevention checks and the watchdog are inputs to findings and gating; the database does not enforce who recorded them.

Callers/source: `packages/db/migrations/0005_commands.sql:76`.

Behavioral evidence required: `packages/db/test/watchdog.integration.test.ts`, `packages/db/test/prevention-checks.integration.test.ts`, `packages/db/test/capture.integration.test.ts`, `packages/db/test/commercial-integrity.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.capture_source|jobguard_runtime|INSERT|-
acl|rel|table|app.commercial_integrity_activity_fact|jobguard_runtime|INSERT|-
acl|rel|table|app.commercial_integrity_value_fact|jobguard_runtime|INSERT|-
acl|rel|table|app.counterparty_check|jobguard_runtime|INSERT|-
acl|rel|table|app.finding_suppression|jobguard_runtime|INSERT|-
acl|rel|table|app.inbox_decision_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.inbox_finding_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.inbox_outcome_event|jobguard_runtime|INSERT|-
acl|rel|table|app.inbox_preference_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.proof_application_response|jobguard_runtime|INSERT|-
acl|rel|table|app.property_constraint_fact|jobguard_runtime|INSERT|-
acl|rel|table|app.watchdog_command_identity|jobguard_runtime|INSERT|-
acl|rel|table|app.watchdog_command_result|jobguard_runtime|INSERT|-
```

### x-public-definer-trigger-functions

Closing/review cards: LP-6d. Status: OPEN / source only.

R2 requires definer entry points to revoke PUBLIC. Both are trigger functions, so direct calls are refused (0A000, proven), but they inherit PostgreSQL default PUBLIC EXECUTE and run as owner when fired.

Callers/source: `packages/db/migrations/0018_recovery_outcomes.sql:77`.

Behavioral evidence required: `packages/db/test/lp-0-authority-paths.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|routine|function:app.review_invalidated_recovery_evidence()|PUBLIC|EXECUTE|-
acl|routine|function:app.signal_outbox()|PUBLIC|EXECUTE|-
```

### x-quote-commitment-writes

Closing/review cards: LP-5c, LP-6d. Status: OPEN / source only.

Quote versions and document versions are what a customer accepts; quote_document_version is fingerprinted. Sends and delivery events feed later commercial sends (held).

Callers/source: `packages/db/migrations/0003_job_spine.sql:113`, `packages/db/migrations/0003_job_spine.sql:114`.

Behavioral evidence required: `packages/db/test/quote.integration.test.ts`, `packages/db/test/variation.integration.test.ts`, `packages/db/test/fingerprinted-row-shape.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|col|app.quote_draft.current_revision_id|jobguard_runtime|UPDATE|-
acl|col|app.quote_draft.revision|jobguard_runtime|UPDATE|-
acl|col|app.quote_draft.updated_at|jobguard_runtime|UPDATE|-
acl|rel|table|app.quote_delivery_event|jobguard_runtime|INSERT|-
acl|rel|table|app.quote_document_version|jobguard_runtime|INSERT|-
acl|rel|table|app.quote_draft|jobguard_runtime|INSERT|-
acl|rel|table|app.quote_line|jobguard_runtime|INSERT|-
acl|rel|table|app.quote_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.quote_send|jobguard_runtime|INSERT|-
acl|rel|table|app.quote_version|jobguard_runtime|INSERT|-
```

### x-recovery-case-writes

Closing/review cards: LP-6c, LP-6d. Status: OPEN / source only.

Recovery case state, claim revisions and eligibility drive fee derivation; recovery_claim_revision and recovery_case_event are fingerprinted.

Callers/source: `packages/db/migrations/0136_recovery_allocation.sql:111`, `packages/db/migrations/0134_recovery_case_terms.sql:61`, `packages/db/migrations/0018_recovery_outcomes.sql:41`.

Behavioral evidence required: `packages/db/test/recovery-allocation.integration.test.ts`, `packages/db/test/recovery-case-terms.integration.test.ts`, `packages/db/test/recovery-cases.integration.test.ts`, `packages/db/test/recovery-insurer-money.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.recovery_case_event|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_case|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_claim_line|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_claim_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_eligibility_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_eligibility_v3_review|jobguard_runtime|INSERT|-
```

### x-recovery-message-writes

Closing/review cards: LP-5c, LP-6d. Status: OPEN / source only.

A message approval is the approval to contact a person; sink and event rows record what was sent. Commercial sends stay held; this records the direct write.

Callers/source: `packages/db/migrations/0134_recovery_case_terms.sql`, `packages/db/src/recovery-message-repository.ts`.

Behavioral evidence required: `packages/db/test/recovery-messages.integration.test.ts`, `packages/db/test/recovery-follow-up.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.recovery_follow_up_advance|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_follow_up_due|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_follow_up_event|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_follow_up_owner|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_follow_up_reminder|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_follow_up|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_message_approval|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_message_event|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_message_sink|jobguard_runtime|INSERT|-
acl|rel|table|app.recovery_message|jobguard_runtime|INSERT|-
```

### x-scope-proposal-writes

Closing/review cards: LP-6d, LP-13. Status: OPEN / source only.

Proposal reviews are not append-only (full UPDATE and DELETE); accepted proposal lines become scope items and findings, so a direct edit changes what the job scope is.

Callers/source: `packages/db/migrations/0008_review.sql:50`, `packages/db/migrations/0003_job_spine.sql:113`, `packages/db/migrations/0003_job_spine.sql:114`, `packages/db/migrations/0003_job_spine.sql:94`.

Behavioral evidence required: `packages/db/test/review.integration.test.ts`, `packages/db/test/readiness.integration.test.ts`, `packages/db/test/practice-scope.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|col|app.proposal_line.dismissal_reason|jobguard_runtime|UPDATE|-
acl|col|app.proposal_line.state|jobguard_runtime|UPDATE|-
acl|col|app.scope_identity.state|jobguard_runtime|UPDATE|-
acl|rel|table|app.job_finding|jobguard_runtime|INSERT|-
acl|rel|table|app.job_record_proposal|jobguard_runtime|INSERT|-
acl|rel|table|app.planned_work_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.proposal_line|jobguard_runtime|INSERT|-
acl|rel|table|app.proposal_review_line_parent|jobguard_runtime|DELETE|-
acl|rel|table|app.proposal_review_line_parent|jobguard_runtime|INSERT|-
acl|rel|table|app.proposal_review_line_parent|jobguard_runtime|UPDATE|-
acl|rel|table|app.proposal_review_line|jobguard_runtime|DELETE|-
acl|rel|table|app.proposal_review_line|jobguard_runtime|INSERT|-
acl|rel|table|app.proposal_review_line|jobguard_runtime|UPDATE|-
acl|rel|table|app.proposal_review_question|jobguard_runtime|DELETE|-
acl|rel|table|app.proposal_review_question|jobguard_runtime|INSERT|-
acl|rel|table|app.proposal_review_question|jobguard_runtime|UPDATE|-
acl|rel|table|app.proposal_review|jobguard_runtime|DELETE|-
acl|rel|table|app.proposal_review|jobguard_runtime|INSERT|-
acl|rel|table|app.proposal_review|jobguard_runtime|UPDATE|-
acl|rel|table|app.readiness_decision|jobguard_runtime|INSERT|-
acl|rel|table|app.readiness_snapshot|jobguard_runtime|INSERT|-
acl|rel|table|app.scope_identity|jobguard_runtime|INSERT|-
acl|rel|table|app.scope_lineage|jobguard_runtime|INSERT|-
acl|rel|table|app.scope_progress|jobguard_runtime|INSERT|-
acl|rel|table|app.scope_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.stage_completion|jobguard_runtime|INSERT|-
acl|rel|table|app.stage_review_event|jobguard_runtime|INSERT|-
acl|routine|function:app.transition_scope_progress(uuid,uuid,uuid,integer,character varying,character varying)|jobguard_runtime|EXECUTE|-
```

### x-supplier-procurement-writes

Closing/review cards: LP-6d, LP-8b. Status: OPEN / source only.

Supplier facts, match allocations, purchase orders and goods receipts feed what is owed and what is claimed; supplier_document and supplier_document_version are fingerprinted.

Callers/source: `packages/db/migrations/0005_commands.sql:76`.

Behavioral evidence required: `packages/db/test/supplier-documents.integration.test.ts`, `packages/db/test/supplier-matching.integration.test.ts`, `packages/db/test/purchase-order-audit.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|rel|table|app.discrepancy_finding_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.discrepancy_review_outcome|jobguard_runtime|INSERT|-
acl|rel|table|app.goods_receipt|jobguard_runtime|INSERT|-
acl|rel|table|app.material_pack_conversion|jobguard_runtime|INSERT|-
acl|rel|table|app.material_rate_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.material_requirement|jobguard_runtime|INSERT|-
acl|rel|table|app.merchant_sku_alias|jobguard_runtime|INSERT|-
acl|rel|table|app.merchant_sku|jobguard_runtime|INSERT|-
acl|rel|table|app.merchant|jobguard_runtime|INSERT|-
acl|rel|table|app.purchase_order_draft|jobguard_runtime|INSERT|-
acl|rel|table|app.purchase_order_placement|jobguard_runtime|INSERT|-
acl|rel|table|app.purchase_order_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.rate_book_observation|jobguard_runtime|INSERT|-
acl|rel|table|app.supplier_bill_supersession|jobguard_runtime|INSERT|-
acl|rel|table|app.supplier_credit_consumption|jobguard_runtime|INSERT|-
acl|rel|table|app.supplier_document_intake|jobguard_runtime|INSERT|-
acl|rel|table|app.supplier_document_version|jobguard_runtime|INSERT|-
acl|rel|table|app.supplier_document|jobguard_runtime|INSERT|-
acl|rel|table|app.supplier_fact_proposal|jobguard_runtime|INSERT|-
acl|rel|table|app.supplier_fact_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.supplier_match_allocation|jobguard_runtime|INSERT|-
acl|rel|table|app.supplier_match_proposal|jobguard_runtime|INSERT|-
acl|rel|table|app.supplier_match_revision|jobguard_runtime|INSERT|-
```

### x-variation-writes

Closing/review cards: LP-5c, LP-6d. Status: OPEN / source only.

variation_approval records an approval of changed price; variation_revision and variation_approval are fingerprinted. Direct writes can create approval records without the approval routine.

Callers/source: `packages/db/migrations/0003_job_spine.sql:113`, `packages/db/migrations/0003_job_spine.sql:114`.

Behavioral evidence required: `packages/db/test/quote.integration.test.ts`, `packages/db/test/variation.integration.test.ts`, `packages/db/test/fingerprinted-row-shape.integration.test.ts`.

Exact recorded capability keys (ACL/effective/signature, as applicable):

```text
acl|col|app.variation.current_revision_id|jobguard_runtime|UPDATE|-
acl|col|app.variation.state|jobguard_runtime|UPDATE|-
acl|rel|table|app.variation_approval|jobguard_runtime|INSERT|-
acl|rel|table|app.variation_rate_observation|jobguard_runtime|INSERT|-
acl|rel|table|app.variation_rejection|jobguard_runtime|INSERT|-
acl|rel|table|app.variation_revision|jobguard_runtime|INSERT|-
acl|rel|table|app.variation_withdrawal|jobguard_runtime|INSERT|-
acl|rel|table|app.variation|jobguard_runtime|INSERT|-
```

## Upgrade and recovery handoff (UNBUILT)

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

When an actual migration exists, apply it as jobguard_migration (non-superuser); snapshot named pre-existing columns, full format_type types, original primary keys and row_to_json(t)::text. Seed at least one row in every compared table, plus linked business/audit/outbox facts. Isolate N's ACL delta, then run later migrations and repeat runner. One-microsecond and retype controls must fail; nullable-column, scratch-function replacement and later-insert controls must pass. No upgrade test is supplied for an absent migration, and no test freezes future functions or unrelated schema.

Deploy the compatible converted application before withdrawal. Failed SQL transaction rolls back; successful rollout is repaired forward through review, never automatic broad re-grant. Whole LP track, trusted binding, independent RED verdicts, separate acceptance, exact-head CI and Ben's button remain required. This partial piece authorizes no real data, external action, spending or permanent deletion.
