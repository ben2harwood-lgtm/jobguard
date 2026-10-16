# LP-5B command writers v1 — partial conversion inventory

Prepared 16 October 2026. **Source-inspected only; no caller is converted here.** Inherited LP-5a HEAD is `01c7a16a098a919aa989d6bbda006e977600774e`; observed `origin/main` is `4c407a6c81bd714a6875b7adf995812381d0fe57`. The build-ahead instruction permits work on this predecessor; its receipt records an unconnected candidate codec and no checked command SQL or trusted audit. No settled overload, approved design verdict, completion verifier, legacy rule or checked revocation API exists to reuse. LP-5B cannot implement the inseparable lifecycle/caller group against a sketch.

Main BUILD_PLAN §11.8:3306, :3363–3380 and §12.2:3602 govern. They match the inherited task text; the observed main SHA differs from both issued and draft SHAs. MERGE-CHURN-1 machinery exists. Main wins over stale assertions that it is missing. All discovered database source reference files match main except inherited `demo-bootstrap.ts:98`: LP-2 selects the migration role for job setup where observed main selects runtime. This is inherited work, not an LP-5B edit; main reconciliation must preserve the final approved LP-2 setup guarantees.

## Current disposition manifest

This is a conversion handoff, **not a privilege allowlist or acceptance baseline**. `runtime_direct` explicitly means unconverted; `controlled` means an existing checked entry point, not independent verification of every reachable helper. `read` may write other subsystem tables. `owner_setup` and `test_fixture` confer no application permission. No entry waives a later role, catalogue, completion or replay proof.

The new source-only test discovers literal references in all TypeScript/MJS files under db/src and db/tools, including split strings, comments and embedded test doubles. It checks documentation coverage and labels direct SQL as direct. It does not parse arbitrary dynamic SQL or prove absence of delegated writers. Manual call tracing below complements it. It pins no merged file bytes, routine hash, shared list or row shape. Existing security scanners remain unchanged.

```json
{
  "version": "lp-5b-writers.v1",
  "status": "source-inspected-only",
  "sources": [
    {
      "path": "apps/api/src/job-parties.application.ts",
      "kind": "delegated",
      "owner": "LP-5a / LP-5b coordinator lane extension",
      "note": "Adoption delegates mutation to dispatcher but has preliminary and conflict-recovery receipt reads/returns at lines 29-30 and 44-45. Preserve practice resource checks; checked replay conversion needs explicit API lane authorization."
    },
    {
      "path": "packages/db/src/acceptance-repository.ts",
      "kind": "read",
      "owner": "LP-5b trace / LP-8 / LP-10",
      "note": "Receipt reads for commercial replay; existing dispatcher handles approval authority."
    },
    {
      "path": "packages/db/src/commands.ts",
      "kind": "runtime_direct",
      "owner": "LP-5a",
      "note": "Dispatcher and finding.resolve still write receipts/resolutions/authorizations. Inherited candidate codec is unconnected; no checked SQL lifecycle."
    },
    {
      "path": "packages/db/src/commercial-integrity-application-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "Feedback is the receipt itself, not an independent completion anchor. Exact receipt-only handling remains dependent on LP-5a/Q03."
    },
    {
      "path": "packages/db/src/contractor-party-repository.ts",
      "kind": "controlled",
      "owner": "LP-5c / LP-6 / LP-12",
      "note": "Protected bridge calls link_contractor_customer/bind_contractor_parties; receipt reads support audit. No edit authorized."
    },
    {
      "path": "packages/db/src/contractor-repository.ts",
      "kind": "controlled",
      "owner": "LP-5c / LP-6 / LP-12",
      "note": "Protected bridge calls contractor_admin_command; reads receipt hash for audit. Retain controlled entry point and role distinctions; no edit authorized."
    },
    {
      "path": "packages/db/src/customer-billing-repository.ts",
      "kind": "read",
      "owner": "LP-5b trace / LP-8 / LP-10",
      "note": "Joins receipts/payment/authorization for current state; billing writes are dispatcher/controlled paths."
    },
    {
      "path": "packages/db/src/decision-repository.ts",
      "kind": "read",
      "owner": "LP-5b trace / LP-8 / LP-10",
      "note": "Reads resolution and authorization to project decision state; no direct resolution/authorization writer."
    },
    {
      "path": "packages/db/src/demo-bootstrap.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b / LP-1 / LP-2",
      "note": "Owner-connected setup deliberately switches to runtime for seed checkpoints. Checkpoint direct writes remain; do not confuse owner pool with runtime execution role."
    },
    {
      "path": "packages/db/src/extra-approval-chain-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "run writes receipts; xa_* own business checks/resolutions. Client sends delegate to dispatcher; scheduled escalation is separate."
    },
    {
      "path": "packages/db/src/extra-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "claim/complete, capture retry, duplicate/order-line links and unlink; preserve immutable origin, alias identity and exact first result."
    },
    {
      "path": "packages/db/src/inbox-relevance-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "seed writes receipts; other inbox commands use watchdog identity/results. Preserve legacy reservation and frozen result paths."
    },
    {
      "path": "packages/db/src/job-parties-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "Direct receipt lifecycle; owner/practice resource checks and identity revisions remain required on replay."
    },
    {
      "path": "packages/db/src/northside-run.ts",
      "kind": "read",
      "owner": "LP-5b trace / LP-8 / LP-10",
      "note": "Reads receipts/client-link results to attribute synthetic practice actions. Preserve attribution trigger and original command identity."
    },
    {
      "path": "packages/db/src/outbox.ts",
      "kind": "read",
      "owner": "LP-5b trace / LP-8 / LP-10",
      "note": "Reads exact resolution/authorization and executes approved durable work; writes outbox/attempt facts, not these authority tables. LP-8/10 own that separate cutover."
    },
    {
      "path": "packages/db/src/practice-invoice-repository.test.ts",
      "kind": "test_fixture",
      "owner": "Coordinator-owned merged test",
      "note": "SQL double recognizes receipt reads; fixture evidence only, not a production writer."
    },
    {
      "path": "packages/db/src/practice-invoice-repository.ts",
      "kind": "controlled",
      "owner": "LP-5c / LP-8a / LP-12",
      "note": "Invoice/credit/receipt/reversal routines write on owner side; repository reads receipts and appends audit. Preserve controlled paths; review older overload reachability separately."
    },
    {
      "path": "packages/db/src/prevention-check-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "Direct receipt lifecycle after current owner and binding checks; membership fence and watch revision must survive."
    },
    {
      "path": "packages/db/src/proof-replacement.test.ts",
      "kind": "test_fixture",
      "owner": "Coordinator-owned merged test",
      "note": "SQL double recognizes receipt SELECT/INSERT to exercise prior proof guarantees; never route runtime conversion through mock-specific SQL."
    },
    {
      "path": "packages/db/src/proof-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "Two early receipt reads, direct claim/completion and operational resolution. Complete and invalidate share upload serialization; no commercial grant."
    },
    {
      "path": "packages/db/src/purchase-order-repository.ts",
      "kind": "delegated",
      "owner": "LP-5a / LP-5c",
      "note": "Receipt reads reject cross-job replay; consequential actions use dispatcher; other commands preserve watchdog identity/results."
    },
    {
      "path": "packages/db/src/recovery-case-terms-repository.ts",
      "kind": "delegated",
      "owner": "LP-5a / LP-5c",
      "note": "Terms approval uses dispatcher and approve_recovery_case_terms. Constraint-name reference is error mapping, not direct DML."
    },
    {
      "path": "packages/db/src/recovery-follow-up-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "claim inserts succeeded marker before event. Dispatcher approves reminders; decision_resolution is also read. Separate command commit from provider delivery."
    },
    {
      "path": "packages/db/src/recovery-message-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "claim inserts succeeded marker and revoke changes authorization; approval delegates to dispatcher; multi-transaction execution/reconciliation needs explicit stage proof."
    },
    {
      "path": "packages/db/src/site-extra-pricing-queries.ts",
      "kind": "read",
      "owner": "LP-5b trace / LP-8 / LP-10",
      "note": "Checks receipt identity before pricing and replay; no lifecycle DML."
    },
    {
      "path": "packages/db/src/site-extra-repository.ts",
      "kind": "delegated",
      "owner": "LP-5b (conversion needs amended lane)",
      "note": "Reads legacy receipt/origin for replay; calls ExtraRepository and ent3c/ent3d controlled writers. Existing replay shortcuts require checked current access; draft lane excludes this source, so coordinator must authorize narrow edits if needed."
    },
    {
      "path": "packages/db/src/site-visit-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "claim/finish wrap ent3b writers; preserve authority lock 54, visit ownership, live guard and first result."
    },
    {
      "path": "packages/db/src/variation-repository.ts",
      "kind": "runtime_direct",
      "owner": "LP-5b",
      "note": "LogBuilderExtra and AddFinalReviewExtra directly write receipts; free capture, final-review lock and immutable origins remain required."
    },
    {
      "path": "packages/db/src/watchdog.ts",
      "kind": "read",
      "owner": "LP-5b compatibility / LP-8 / LP-13",
      "note": "Reads legacy receipt reservations, writes watchdog_command_identity/result through existing helpers. Not a direct writer to the three lifecycle tables; separate store is still relevant authority."
    },
    {
      "path": "packages/db/src/work-order-repository.ts",
      "kind": "controlled",
      "owner": "LP-5c / LP-6 / LP-12",
      "note": "Protected bridge calls work-order operations and party binding; receipt read is not application receipt DML. No edit authorized."
    },
    {
      "path": "packages/db/tools/synthetic-restore.mjs",
      "kind": "owner_setup",
      "owner": "LP-8 restore tooling",
      "note": "Separate owner-connected fixture authority INSERTs in restore rehearsal; no normal request pool. Deferred restore conversion remains mandatory."
    }
  ]
}
```

## Conversion seams and significant input

Every future begin must bind tenant, current server-selected actor, operation, command/semantic identity and exact resources. The input column records current digest material and additional closure input that must be reconciled with LP-5a; it is not a new hash definition. Historical hashes/results are never rewritten. None of the completion anchors below is an installed verifier. A mere row reference is insufficient: match command, actor, operation, tenant/job, revision and effect, plus required audit/outbox.

| Family / current seam | Input and legacy compatibility to preserve | Required persisted completion and replay concerns |
| --- | --- | --- |
| Extra `claim/complete`, :45/:52; raise :62 | Canonical input minus commandId (clientCaptureId remains included); origin kind, job, actor/grant, device/time, description/note, coverage, visit and source links remain material. Link/unlink use their exact command-specific content and semantic keys. | Origin plus variation/scope/event; link or compensating unlink and exact audit. Client-capture retry needs its own identity receipt referencing the original immutable origin/result; no duplicate origin. Retry shortcut must recheck access after waits. |
| Visits `claim/finish`, :41/:49 | Hash includes kind/job/member; completion adds visit and answer. Start/complete types remain distinct. | Start's same-member visit; completion's visit and exactly one immutable closeout_answer plus completion audit. Replays retain six-digit stored server time and first answer. |
| Approval `run`, :75 | SHA-256 canonical `{type,actor,content}`; submit job/extra; price/revise exact net; steps request/index/revision hash/net/reason; withdrawal reason; duplicate pair; client decisions token digest/email/terms/tester; revoke link. Sends also bind exact recipient/content/amount/revision/expiry/authorization/outbox. | Request/binding/priced revision, step/outcome or client-link/closure and required audit/outbox. No operative/owner status substitutes for the separate approval chain; `xa_*` business routines stay checked. |
| Parties `command`, :61 | Existing digest `{jobId,input}` includes versioned action, identities/contact/site fields and expected revisions. Actor and practice-owned resource are additional checks, never inferred from the hash. | Created/revised identity or party binding and its referenced revisions, command and audit. Hidden references stay refused. Replay cannot skip current practice ownership. |
| Prevention `command`, :73 | Existing digest `{job,input}`: action, binding identity, watch/expected revision and fixture controls; current owner/practice scope remains separate. | Check fact/watch event, binding and watch revision plus audit. Preserve synthetic-only and company-eligibility rules, no invented safety authority. |
| Proof `complete`, :23–44 | Existing canonical completeProofCommandV1 (job/scope/stage/evidence/type/Decision or derive flag/actor) and stage semantic key; watchdog identity is a separate reservation. | Exact verified evidence version/hash/link, stage_completion/progress and optional operational resolution, with audit. Both preliminary and transactional receipt reads must use checked replay. Invalidation remains serialized; an operational resolution cannot create action_authorization. |
| Inbox `seed`, :6 | Seed hashes job/member/type and optional practice digest; preserve watchdog requestHashFor separately. Dismiss/preferences/rules delegate to watchdog store with their own payload hashes and legacy branches. | Exact seeded finding/rule/decision revisions, or a narrowly justified persisted no-op; stored first inbox result. Existing-view recomputation is not automatically a first-result replay. |
| Variation `addFinalReviewExtra/logBuilderExtra`, :35/:65 | Complete capture schema, proposal, optional confirmed exact price, actor/device/capture time. Proposal id is command identity; `extra-origin:job:id` semantic key. | New variation/scope/lineage, immutable small-builder origin and optional price revision; final-review lock exclusion; audit. Builder capture stays fee-free. Preliminary final-review replay must not weaken current access. |
| Follow-up `claim`, :355 | Existing canonical case/member/input + normalized sourceMessageId/followUpId/packId/messageId. Preserve cross-family command and evidence-pack reservations and run fence. | Schedule row/event, tick-advance fact, review/reminder event, cancellation or exact reminder authorization/outbox. Do not certify provider delivery from a command marker. Multiple transaction stages need operation-specific completion evidence. |
| Message `claim/revoke`, :396/:214 | Existing canonical preview/action input, case, actor, normalized message identity, expected revision; approval exact content/recipient/terms. | Preview plus preview event, revoke plus cancellation, committed started/blocked/unknown/reconcile stage. No succeeded marker before corresponding stage fact. External accepted/delivered outcome is separate from execution-claim success and cannot be fabricated by receipt completion. |
| Integrity feedback `review`, :88 | SHA-256 JSON `{jobId,...reviewV1}`; actor and owner/practice ownership checked before current insert/replay. Preserve exact first feedbackV1 result. | Receipt currently IS authoritative feedback. LP-5a must issue narrowly typed checked persistence or an exact reviewed side-table amendment. Generic success JSON is forbidden. Q03 remains unsupplied, not an agent-selected schema. |
| Demo `seedDatabase`, :84/:112 | Existing whole DemoSeedCommand digest, semantic checkpoint identity, fixed synthetic target and actor. Preserve created/replayed semantics and persisted checkpoints. | Receipt currently IS checkpoint. Owner-connected bootstrap switches execution role; it is outside normal startup, not a request-owner escape. Q03 must define checked/owner-only checkpoint persistence explicitly. |

### Lock and replay order to preserve by family

- Extra raise: administration 54 shared, job 417, origin/capture/receipt and business locks, audit last. Duplicate/order-line paths have their own job-first sequence; do not insert an administration lock after a held job lock. Unlink's membership/administration fence and compensating lineage remain intact.
- Visit: administration 54 shared, authority and ownership recheck, live-job row share, receipt, visit serialization 3101/3102, audit. Replays remain under authority lock; deferred closeout checks take no new business lock.
- Approval: existing `xa_begin`/job 417/operation locks must be reconciled with claim order, then audit and lock-free completion. Current `run` returns stored result before calling the checked business routine: that shortcut needs checked authority, not merely matching actor in an old hash. Sends remain individually owner-approved.
- Parties: current owner, practice ownership/hidden-reference checks, receipt, business routine/revisions; receipt is finished before audit. Prevention: current membership FOR SHARE before receipt, prevention advisory lock and business facts, receipt then audit. Keep LP-1-supported membership locking; do not revive broad UPDATE grants.
- Proof: current active actor, live/watchdog identity, evidence-upload serialization and progress locks, receipt/business mutation, audit, completion. Preliminary reads do not authorize replay; invalidation must share serialization. Preserve predecessor proof-replacement tests.
- Inbox: existing live guard and watchdog identity/legacy reservation, inbox/preference operation locks, revisions/audit/result. This is inventory of current order, not proof that authority precedes every current live guard.
- Recovery: per-command advisory lock, current owner membership fence, cross-family pack reservation, run fence/case/row locks in existing branch-specific order; audit locks last. Follow-up advance/open-review and message advance/reconcile span transactions: compare fences again on entry to each stage. Do not claim one transaction over an external call.
- Builder/final-review capture: current owner before replay, final-review preparation lock before new capture, receipt/origin/revisions, audit; no changes to fingerprinted tables. Demo setup stays owner-connected and target restricted.

Approval clock remains transaction start, expiry checks remain wall-clock, and audit wall times remain ordered inside one transaction (CH-7-TERMS). Current access after waits, stale-processing/cancellation, durable alias reservation and completion-without-post-audit-locks all need the real LP-5a contract and two-connection PostgreSQL tests. No generic global lock order is invented here.

## Controlled and delegated call chains

- Contractor administration: protected ContractorRepository → `app.contractor_admin_command` (0138 latest body). Party bridge → `app.link_contractor_customer` / `app.bind_contractor_parties` (0102). WorkOrderRepository → existing work-order/party checked operations; its receipt join at :216 is a read. These three protected bridges remain untouched, including their pinned authentication boundary.
- PracticeInvoiceRepository → checked practice invoice, credit, record-receipt and reversal entry points; repository receipt reads support immutable first results and audit. An older five-UUID/text reversal overload still exists but runtime EXECUTE was explicitly withdrawn at 0030:135. Its existence must not be called an executable runtime route. Latest credit body is 0166, not 0028; latest allocation writer is 0169, not 0136.
- RecoveryCaseTermsRepository → UserCommandDispatcher → `approve_recovery_case_terms` (0134); PurchaseOrderRepository → dispatcher for consequential sends plus watchdog identities/results for operational commands. They inherit LP-5a's missing lifecycle. Receipt-reading names alone do not make them direct writers.
- SiteExtraRepository → ExtraRepository → origin/source/visit/pricing/evidence routines. Its `loadReceipt` join and SOR retries are result shortcuts; current authority and original result semantics must survive. This caller is omitted from the draft's editable paths. Coordinator must add it to the eventual conversion lane before any necessary edit; no bridge or source edit is made here.
- Watchdog `claimCommandIdentity` / `beginStoredCommand` / `storeCommandResult` / `runStoredCommand` write separate watchdog identity/result tables and inspect legacy command_receipt reservations. Preserve existing cross-family semantics, replay/deferred triggers and membership fence. They cannot be relabelled generic LP-5a lifecycle calls merely because their names look similar.
- DecisionRepository, customer-billing, acceptance, pricing-query, northside-run and outbox receipt/authority references are reads. Outbox writes its own execution attempts and statuses; LP-8/10 still own those money/external-effect boundaries. `apps/api/src/job-parties.application.ts:29–30,44–45` reads and returns adoption receipts before dispatch and after conflict. These are significant delegated replay paths outside the draft lane, not direct DML. Their checked-replay conversion needs an exact coordinator lane extension. Broader literal search found no additional non-test application direct lifecycle writer outside db/src/tools.
- `escalateOverdueExtrasTask` delegates to `ExtraApprovalRepository.escalateOverdue` → `xa_escalate`, then audit. The scheduled system operation lacks a human receipt and must retain its finite automatic escalation rule, never create human send approval. Recovery history settlement hooks append their own event/audit stages, not invented delivery success. General worker authority separation remains LP-10.
- Synthetic demo bootstrap CLI → bootstrapSyntheticDemo → owner-connected seedDatabase, with explicit role switches. The server/API startup does not call it. Restore tooling uses a distinct owner connection for fixture authority; LP-8 owns that conversion. Test-only SQL doubles are labelled separately and cannot justify a runtime fallback.

## Source-indexed routine definitions

The table below indexes latest CREATE bodies by name and input types in the migration source; it is **not a live PostgreSQL catalogue**, ACL proof or independent safety verdict. Historical replaced bodies are not treated as active. The retained old reverse overload is identified above as runtime-revoked. Trigger-only invoker routines and internal helpers are included as downstream guards; appearance here does not imply runtime EXECUTE. Full grants, helper closure, fixed search path, temporary objects and owner-assumption safety still need actual catalogue/real-role checks.

Source index includes inherited 0195_unchecked_job_doors; that migration is predecessor work, not present as LP-5B SQL. Read main and predecessor dispositions before landing. No lifecycle grant is added or removed here.

| Routine and input types | Latest source definition | Disposition |
| --- | --- | --- |
| `app.require_approved_resolution()` | `0005_commands.sql:47` | Read/guard; preserve, trace helpers before cutover |
| `app.invalidate_stale_final_account_authorizations(uuid,uuid,char(64))` | `0016_final_accounts.sql:29` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.issue_practice_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,date)` | `0095_job_parties.sql:340` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.issue_practice_customer_credit_note(uuid,uuid,uuid,uuid,uuid,bigint,text,text)` | `0166_customer_billing_integrity.sql:58` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.record_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,date,bigint,text,text)` | `0030_receipt_replay_and_invoice_binding.sql:5` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,text)` | `0029_uiwire12_customer_receipts.sql:48` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,uuid,text)` | `0030_receipt_replay_and_invoice_binding.sql:76` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.record_legacy_builder_origin()` | `0053_shared_money_origin.sql:122` | Read/guard; preserve, trace helpers before cutover |
| `app.validate_extra_origin()` | `0128_shadow_persistence.sql:170` | Read/guard; preserve, trace helpers before cutover |
| `app.contractor_admin_command(uuid,jsonb,text)` | `0138_practice_session_hardening.sql:129` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.bind_job_parties(uuid,uuid,uuid,integer,uuid,uuid,uuid,boolean,text,uuid,uuid)` | `0095_job_parties.sql:111` | Read/guard; preserve, trace helpers before cutover |
| `app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,char(64),varchar,bigint,bigint,varchar,varchar,uuid,timestamptz,uuid,uuid,uuid,uuid,uuid)` | `0195_unchecked_job_doors.sql:94` | Read/guard; preserve, trace helpers before cutover |
| `app.require_binding_record()` | `0095_job_parties.sql:300` | Read/guard; preserve, trace helpers before cutover |
| `app.require_adoption_record()` | `0095_job_parties.sql:317` | Read/guard; preserve, trace helpers before cutover |
| `app.reserve_watchdog_command_id()` | `0096_watchdog_live.sql:199` | Read/guard; preserve, trace helpers before cutover |
| `app.link_contractor_customer(uuid,uuid,jsonb)` | `0102_contractor_parties.sql:63` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.bind_contractor_parties(uuid,jsonb)` | `0102_contractor_parties.sql:96` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.require_contractor_party_record()` | `0102_contractor_parties.sql:183` | Read/guard; preserve, trace helpers before cutover |
| `app.guard_recovery_message_approval()` | `0112_recovery_follow_up.sql:208` | Read/guard; preserve, trace helpers before cutover |
| `app.guard_recovery_message_event()` | `0107_recovery_messages.sql:185` | Read/guard; preserve, trace helpers before cutover |
| `app.guard_recovery_message_sink()` | `0112_recovery_follow_up.sql:245` | Read/guard; preserve, trace helpers before cutover |
| `app.switch_job_live_v3(uuid,uuid,uuid,uuid,uuid,integer,char(64),integer,uuid,uuid,uuid)` | `0109_job_activation_terms.sql:51` | Read/guard; preserve, trace helpers before cutover |
| `app.guard_recovery_follow_up_due()` | `0112_recovery_follow_up.sql:392` | Read/guard; preserve, trace helpers before cutover |
| `app.ent4b_origin_provenance()` | `0122_extra_origin_persistence.sql:34` | Read/guard; preserve, trace helpers before cutover |
| `app.ent4b_fact_guard()` | `0122_extra_origin_persistence.sql:128` | Read/guard; preserve, trace helpers before cutover |
| `app.accept_final_check_terms(uuid,uuid,uuid,text)` | `0132_final_account_lock.sql:210` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.record_final_account_disposition(uuid,uuid,uuid,uuid,uuid,text)` | `0132_final_account_lock.sql:229` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text)` | `0166_customer_billing_integrity.sql:6` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)` | `0132_final_account_lock.sql:337` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid)` | `0134_recovery_case_terms.sql:37` | Read/guard; preserve, trace helpers before cutover |
| `app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb)` | `0169_recovery_allocation_sources.sql:42` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.ent3b_closeout_guard()` | `0139_site_visit_closeout.sql:56` | Read/guard; preserve, trace helpers before cutover |
| `app.ent3b_start_visit(uuid,uuid,uuid)` | `0139_site_visit_closeout.sql:91` | Read/guard; preserve, trace helpers before cutover |
| `app.ent3b_complete_visit(uuid,uuid,uuid,uuid,text)` | `0139_site_visit_closeout.sql:120` | Read/guard; preserve, trace helpers before cutover |
| `app.ent3c_record_sor_revision(uuid,uuid,text,text)` | `0140_site_extra_pricing.sql:67` | Read/guard; preserve, trace helpers before cutover |
| `app.ent3c_sor_revision_guard()` | `0140_site_extra_pricing.sql:135` | Read/guard; preserve, trace helpers before cutover |
| `app.ent3c_pricing_basis_guard()` | `0140_site_extra_pricing.sql:215` | Read/guard; preserve, trace helpers before cutover |
| `app.ent3d_record_resident_confirmation(uuid,uuid,uuid,uuid,text,text,uuid,text)` | `0141_site_extra_evidence.sql:90` | Read/guard; preserve, trace helpers before cutover |
| `app.ch4_capture_site_source()` | `0144_job_work_state.sql:219` | Read/guard; preserve, trace helpers before cutover |
| `app.xa_fact_guard()` | `0158_extra_approval_chain.sql:99` | Read/guard; preserve, trace helpers before cutover |
| `app.xa_begin(uuid,uuid,text[],uuid)` | `0158_extra_approval_chain.sql:138` | Read/guard; preserve, trace helpers before cutover |
| `app.xa_resolve_decision(uuid,uuid,integer,text,uuid)` | `0158_extra_approval_chain.sql:188` | Owner-side write; retain, LP-5c/LP-8/LP-12 verification |
| `app.xa_issue_link(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,uuid)` | `0158_extra_approval_chain.sql:403` | Read/guard; preserve, trace helpers before cutover |
| `app.job_source_original_binding()` | `0164_job_sources.sql:85` | Read/guard; preserve, trace helpers before cutover |
| `app.northside_capture_action()` | `0167_northside_run_attribution.sql:60` | Read/guard; preserve, trace helpers before cutover |
| `app.start_quote_from_review(uuid,uuid,integer,uuid,uuid,uuid,uuid,text)` | `0195_unchecked_job_doors.sql:264` | Read/guard; preserve, trace helpers before cutover |

`xa_submit`, `xa_price`, `xa_approve`, `xa_withdraw`, `xa_mark_duplicate`, `xa_revoke_link`, `xa_client_decide` and request/escalation helpers also reach `xa_begin`, `xa_resolve_decision` or other listed guards indirectly (0158). `xa_open_decision` writes Decisions, not one of the three scanned tables; retain its finite operational scope and explicit approval rules. `work_order_commit` delegates contractor checks/party writes and must remain in LP-5c compatibility tests. Source-body indexing cannot replace tracing these helper edges or live overload ACLs.

## Completion, migration and verification disposition

No adapter, conversion, migration or upgrade proof is produced against missing LP-5a SQL. Reservation 0199 is unused; eventual migration placeholder is `{mig}_command_writers.sql` with a per-piece note under `packages/db/migration-notes/` after an actual coherent conversion exists. No empty migration or misleading registration is added. LP-5c alone owns actual direct-write withdrawal after every writer is converted. No table/column or capability is improvised to solve receipt-only feedback/checkpoints.

Existing broad receipt/resolution/authorization grants remain. **New GRANTs: none.** Standard F remains binding. Session-derived actor protection remains LP-6; `p_actor` by itself does not establish session identity. Worker/money/evidence/restore closure remains LP-8/10. No fee, price, VAT, retention, owner-rights or safety policy changes.

The five new source tests support part of 5B-01 only: source coverage, correct direct classification, later omission control, split-string discovery and strict manifest schema. They do not satisfy the behavioral part of 5B-01, 5B-02–21, or any BP property. No placeholder/skip integration tests claim the missing behaviors. Full PostgreSQL/upgrade/runtime-revoke/temporary-object/authority/replay/atomicity/contractor suites remain unbuilt and NOT RUN. Required unchanged regressions and browser journeys belong to dispatcher/CI. Independent exact-commit RED review and separate acceptance remain required (5B-22).

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

When SQL is supplied, use existing upgrade-proof-utils unchanged: canonical `row_to_json(t)::text` of named original columns, full name/format_type snapshots and captured original primary keys; nonempty row guards; rolled-back microsecond/retype failures and nullable-column/function/later-insert successes. Forward-fix recovery never reopens authority grants or rewrites immutable history.

LATER: UI stays parked; no screen work.
