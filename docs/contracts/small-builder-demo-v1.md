# Small-builder DEMO-P1 catalogue v1

Build-ahead documentation/input fixtures only. Issued 23 October 2026 under decision 74. Base `dc5721230fd8aedbf2d9d0457789074b66b48765`. No runtime integration, real data, provider, policy approval or migration.

**Complete executable map: BLOCKED / NOT COMPLETE.** Documentation coverage does not establish executable acceptance. All bindings remain HELD with null acceptance evidence, even where installed source was inspected. Both viewport projects are documented; neither was run. No successful fake adapter or invented route discharges a hold.

The TypeScript catalogue is static documentation, unregistered in barrels/routes/exports. The JSON contains fictional raw text only, without expected results or business state. Its strict grammar is test-only, not a production parser. Meter/trial text is preparation input, not a lifecycle schedule. Supplier/photo/diary byte recipes and source-to-catch mapping remain owned by SV-3/SV-5/SV-7A. No such input can be claimed as a successful catch fixture here. Expected amounts are assertions only and must never populate a runtime response or report.

## Interface bindings

Each matrix row names its actual or externally owned inventory bindings in the static catalogue. Every binding includes command/schema, source, inspection status, authority and result/recovery requirements. Source presence is partial evidence only. Complete acceptance still needs accepted concrete file/method/route, payload/version, authority/subject, result/recovery and prerequisite receipts for every operation. Requested tenant identifiers undergo existing server verification and are never authority. No invented generic command ID, success proxy or direct business SQL is permitted.

### 7.3 Existing command inventory and proposed dependency seams

All paths in the table are existing Next paths unless marked **PROPOSED**. Where the corresponding Nest controller exists it omits `/api`; a Next route delegating directly to an application service is not proof of a registered Nest route. Payload values such as IDs, revisions and hashes must come from the immediately preceding authoritative result; never hardcode cross-run IDs.

| Step | Existing operation and exact schema/action | Source evidence / limitation |
|---|---|---|
| Fresh capture | `POST /api/jobs/capture`; `captureRequestV1` (`contractVersion: job_capture_v1`), `captureId`, reviewed text/source kind, `fixtureId`, requested tenant verified by server | `packages/core/src/capture.ts`; `apps/api/src/capture/capture.application.ts:13`. Fresh source bytes plus deterministic extractor are allowed fixture inputs; commercial end state is not. |
| Cited review | `GET /api/jobs/[id]/proposal`; `POST /api/jobs/[id]/review`, `proposal_review_command_v1`, expectedRevision and reviewed choices; `POST /api/jobs/[id]/confirm`, `proposal_review_confirm_v1`, commandId, expectedRevision | `apps/api/src/capture/contracts.ts`; five stable scope IDs, explicit shelf dismissal and disposal answer. |
| Customer/site | `GET/POST /api/jobs/[id]/parties`, `job-parties-command.v1`, actions `create_customer`, `revise_customer`, `create_site`, `bind`, `correct` | `job-parties.application.ts`, `job-parties.controller.ts`; compose existing exact paying-customer/site fields. |
| Quote revisions | `POST /api/jobs/[id]/quotes`, `quote_draft_command_v1`, draftId, expectedRevision, currency GBP, taxPolicyVersion, complete existing scope-linked lines | `apps/api/src/quote/contracts.ts`; stable original scope IDs retained. |
| Send exact quote | `POST /api/jobs/[id]/quotes/preview`, `quote-preview-command.v1`; `POST /api/jobs/[id]/quotes/delivery`, `quote-send-command.v1`, commandId, documentId/hash/recipient; `POST /api/jobs/[id]/quotes/delivery/execute` existing execute transport with `quote-execute-command.v1`, mode `success`/`timeout`/`reconcile` | Existing execute handler is `apps/web/app/api/jobs/[id]/quotes/delivery/[action]/route.ts` with `action=execute`; `QuoteApplication.preview/issue/execute` supplies the service. `.invalid` recipient; send approval and customer acceptance are separate records. |
| Practice acceptance | `POST /api/jobs/[id]/quotes/acceptance`, `quote-acceptance-command.v1`, exact document ID/hash/version and stated name/method/time | This is builder-attested practice acceptance, not authenticated customer signing. MON-5 authentic customer approval is an external gate for final integrated customer journeys. |
| Start | `POST /api/jobs/[id]/quotes/activation`, `practice-activation-command.v1`, `scenario: no_charge` | New v3 terms must show no cap or activation/base obligation. Do not choose `simulated_base_obligation`, which is preserved historical v1 behavior. MON-1/MON-3 later compose actual admission. |
| Ordinary extras | `POST /api/jobs/[id]/variations`, `variation-command.v1`, actions `propose`, `revise`, `approve`, `reject` | Fields use proposalId/scopeItemId/variationId/revisionId/approvalId rather than assuming every v1 operation has a `commandId`. Existing approve attests builder-recorded practice acceptance. |
| Proof | `GET/POST /api/jobs/[id]/proof`, `practice-proof-command.v1`, actions `select_generated` (`completion-photo`), `finalize`, `complete` | Select returns upload ID/version; finalize must return verified evidence; complete binds evidence+scope. Domain proof UI may choose actual generated file bytes. |
| Materials | `POST /api/material-rates`, `material-rate-command.v1`; `POST /api/jobs/[id]/materials`, `material-requirement-command.v1`; `POST /api/jobs/[id]/purchase-orders/revisions`, `purchaseOrderDraftV1`; `POST /api/jobs/[id]/purchase-orders/placement`, `purchase-order-placement.v1` with exact approved command | Use existing M2 materials checks. Prevented spend and revised unpaid bills are not recovered cash. |
| Supplier evidence | `POST /api/jobs/[id]/supplier-documents/intake`, `supplier-document-intake.v1`; `POST /api/jobs/[id]/supplier-documents/receipts`, `goods-receipt.v1`; `POST /api/jobs/[id]/supplier-documents/facts/confirm`, `supplierFactCorrectionV1`; `POST /api/jobs/[id]/supplier-matches`; `POST /api/jobs/[id]/supplier-matches/corrections` | Existing source/receipt/fact APIs; intake after lock is refused for new work. |
| Diary/messages | Existing `GET /api/jobs/[id]/diary` and `GET /api/jobs/[id]/customer-messages`; **PROPOSED upstream** POST operations at those same full paths | Do not claim writable intake exists at baseline; preserve post-lock refusal and approved actor binding. |
| Account review | `GET/POST /api/jobs/[id]/final-account`, `final-account.assemble.v1`; `POST /api/jobs/[id]/final-account/review-extras`, `final-review-extra.v1`; `POST /api/jobs/[id]/final-account/dispositions`, `final-account.disposition.v1` | Disposition every baseline item; revision/hash binds account. Review extra is capture, not a recovered catch. |
| Lock/terms | `POST /api/jobs/[id]/final-account/terms`, `final-check-terms.accept.v1`; `POST /api/jobs/[id]/final-account/lock`, `final-account.lock.v1`, exact revision and declaration version | SV-5 completion/reveal command interface is upstream/coordinator-owned; never write a completed-check flag. Existing invoice guard requires exact lock and completed check. |
| Locked invoice | `POST /api/jobs/[id]/final-account/lock`, `lock-bound-invoice.issue.v1`, finalAccountRevisionId, expectedSourceHash, invoiceKind `final`/`supplementary`, `.invalid` recipient/date | Source `final-account-lock.contracts.ts` / controller; guard `assertFinalAccountInvoiceGuard`. Existing direct `/customer-invoices` is not a bypass for new v3 lock completion. |
| Cases | `POST /api/jobs/[id]/recovery-cases`, `recovery-case-command.v1`, `open`/`transition`; `POST /api/jobs/[id]/recovery-cases/eligibility`, `recovery-eligibility-command.v1` review/approve or installed `recovery-eligibility-command.v3` review only; `POST /api/jobs/[id]/recovery-cases/terms`, `recovery-case-terms-command.v1`, `approve` | Pinned v3 enum only covers F14/F15/F16-partial/F16-full/F17/F18/F19/F20/F21/F22; it has no F10/F11 request fixture. Existing pre-pursuit v1 evidence-review/approval may remain a valid workflow prerequisite, but is not itself v3 fee qualification. Accepted CH-7/SV-6 mapping for the £320/£2,500 later settlements is required; do not fake a F10 body or reuse an incompatible fixture. |
| Evidence pack/pursuit | `GET/POST /api/recovery-cases/[id]/evidence-packs`; `GET /api/recovery-cases/[id]/evidence-packs/[packId]/inspect`; `GET /api/recovery-cases/[id]/evidence-packs/[packId]/download`; `POST /api/recovery-cases/[id]/evidence-packs/[packId]/attachment-approval`; `POST /api/recovery-cases/[id]/messages`, `recovery-message-preview.v1`; `POST /api/recovery-cases/[id]/messages/[messageId]/commands`, `recovery-message-command.v1`, actions approve/advance/revoke/reconcile | Preview binds case revision and pack; approve binds exact recipient/body/amount/hash/pack. CH-7 fee terms precede pursuit. H-PACK-CONSUMER requires the latest version-aware source-current/attachment guards; never strip v3 sections or disable validation. |
| Follow-up | `POST/GET /api/recovery-cases/[id]/follow-ups`; `POST /api/recovery-cases/[id]/follow-ups/[followUpId]/commands`; `recovery-follow-up-command.v1`, actions schedule/advance_time/open_review/approve_reminder/cancel | Current clock calls `SandboxRepository.advance` and uses legacy `sandbox_run`, bounded at tick 3. **H-FOLLOWUP-CLOCK:** accepted M4-6 owner binding is required for new DEMO runs; neither this clock nor a new run ID is MON billing authority. Due time creates a Decision only. |
| Customer receipt | `POST /api/jobs/[id]/customer-invoices/[invoiceId]/receipts`, `practice-customer-receipt.record.v1`, amountPence/date/method/reference; `POST /api/jobs/[id]/customer-invoices/[invoiceId]/receipts/reversals`, `practice-customer-receipt.reverse.v1`, paymentId/reason | Builder record only until matched to a settled source. |
| Fake settled facts | `POST /api/jobs/[id]/practice-feed`, `practice-feed-command.v1`, `connect`, `advance` with fixed movement key and pending/settled/replay/page_overlap/alternate_representation/unknown_duplicate, `match_receipt`, `reconcile_duplicate`, `disconnect` | Client cannot submit a settlement amount, event ID or arbitrary state. A settled movement is still unallocated. |
| Case/line allocation | `POST /api/jobs/[id]/recovery-allocations`; `POST /api/jobs/[id]/recovery-allocations/reversals`; `recovery-allocation-command.v1`, `review`→`allocate`, `review_reverse`→`reverse`, exact approvalHash/revision | M4-8-S owns full-invoice composition and exact ratios. No client-supplied qualifying net. |
| Customer correction | `POST /api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/preview`, `practice-credit-note.preview.v1`; `POST /api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes`, `practice-credit-note.issue.v1`, previewHash/commandId | Linked immutable source invoice and exact tax policy. |
| Fee/statement/collection/reconciliation | **PROPOSED upstream** `/api/jobs/[id]/success-fees`, `/api/jobs/[id]/success-fee-statements`, `/api/success-fee-statements/[id]/collections`, `/api/success-fee-statements/[id]/refunds`, `/api/jobs/[id]/money-check` | Draft targets from the factpack, not baseline routes. Exact accepted command names, HTTP methods and payloads are prerequisite deliverables from their owners; DEMO may only consume them. No generic set-paid adapter. |
| Meter/trial | **PROPOSED upstream** MON-1 lifecycle source/admission/read API, MON-2A plan/period command API and MON-3 trial/card/lifecycle API; DEMO spec references named typed ports `DemoMeterCommands`, `DemoSubscriptionCommands`, `DemoTrialCommands` until owning contracts fix routes | These port names are proposed adapter interfaces only. No undisclosed endpoint, new clock rule, company binding or provider is invented. Implementation/CI is blocked until actual mapping and scope are accepted. |

**Exact follow-up payload binding for DR-11:** `schedule` carries `commandId`, the delivered `sourceMessageId` and `expectedCaseRevision`; `advance_time` carries `commandId` and `followUpId`; `open_review` also binds `expectedRevision`, `expectedCaseRevision` and current `packId`; `approve_reminder` binds `commandId`, `followUpId`, `expectedRevision`, `messageId`, `expectedMessageRevision`, `recipient`, `body`, `amountPence`, `packId` and `contentHash`; `cancel` binds `commandId`, `followUpId`, `expectedRevision`. Every action uses `recovery-follow-up-command.v1`. Reminder execution is a separate `recovery-message-command.v1` `advance` on the exact message route with `commandId`, `messageId`, `expectedRevision`, `outcome:'success'`; permitted failure outcomes and reconcile behavior remain owned by M4-5/6. Source: `packages/core/src/recovery-follow-up.ts`, `apps/api/src/recovery-follow-up.application.ts:64–70`, `apps/api/src/recovery-follow-up.contracts.ts`, `packages/core/src/recovery-message.ts:100–112`.


## Required matrix

All 49 DC/DR/DS/DM/DT/DV entries below retain their exact source operation and expected evidence. Each static entry requires both `mobile-360` and `desktop`, has NOT_RUN execution and HELD bindings. These observations are conditional assertions over future authoritative facts.

### 7.4 Fresh command-to-figure acceptance matrix

Each row requires exact stored IDs and a report row. A pure fixture test may check expected arithmetic in advance; its expected values cannot populate a browser response or report an observed pass.

#### Core-1000

| ID | Actual operation sequence / state source | Required observation |
|---|---|---|
| DC-01 | Fresh text capture; accept Protect room, Prepare walls, Paint walls, Finish trim, Clean site; dismiss Replace shelves with reason; answer disposal; save and confirm cited review | Five stable source-linked scope IDs; reload retains exact decisions. |
| DC-02 | Create the fictional paying customer and site, then bind their exact current revisions through the existing parties commands; enter quantity 1 for each; rates £200,£200,£200,£200,£100; save quote v1; revise Clean site to£200 and save v2 | Net£900 then£1,000; VAT £200; gross £1,200. Old v1 remains intact. |
| DC-03 | Preview/send exact v2; run fake send; record current exact acceptance (final MON-5 path when accepted); `no_charge` start/admission | Same job and accepted document; new v3 policy; no v1 cap snapshot/activation obligation. |
| DC-04 | Propose +£125, −£25 and +£50; approve exact first two, retain third unapproved; run required proof select/finalize/complete | Approved additions£125, reductions£25, pending£50; final net £1,100. No source swapping. |
| DC-05 | Assemble final account; resolve all dispositions; accept exact Final Check terms; lock; run installed SV-5 worker/check to completed; create lock-bound final invoice | Invoice net £1,100 + illustrative VAT £220 = £1,320. No shortcut to completed check. |
| DC-06 | Actual receipt command£500; actual second receipt£820; reload; reverse exact second payment with reason | Due£820→£0→£820. Original two receipt records and reversal retained. These are labelled recorded, not bank-confirmed. |
| DC-07 | **Proposed fixture, held under H-CORE-CORRECTION:** after acceptance of the fixture choice and concrete command binding, preview and approve £100 net customer credit using the existing `invoice-later.spec.ts` mechanics | Conditional expected result: £100 net + £20 VAT = £120 credit; after prior reversal, due £700. The amount remains a proposed fixture choice, not approved product policy or an executed correction; original invoice stays £1,320/hash unchanged. Full DC-07/core acceptance remains held until the accepted actual command proves it. |
| DC-08 | Read CH-9 value and report from persisted facts; reload/another authorised browser context | Correct source-linked capture/final-account/invoiced/recorded/reversed/corrected history. No positive recovery/fee from ordinary customer receipts; all counts/zeroes sourced. |

Do not rewrite `UIWIRE-12`, v1 fee sample tests, `fee-statement.spec.ts` or the old three-step sandbox to make DC pass.

#### Recovery-18800

| ID | Actual sequence | Required observation / provenance |
|---|---|---|
| DR-01 | Fresh five-line capture/confirmation, actual customer/site creation and binding, then entered quote prices summing£18,800; preview/send/accept/start; verified proof | Accepted net £18,800; source-linked proof. No cap/base amount. |
| DR-02 | Materials A: rate£20×10, proposed£25×10; revise before exact simulated placement. Materials B:£20×10 order,8 accepted, supplier bill£25×10, human-confirm revised unpaid £160 | A£250→£200, difference£50; B non-overlapping£50 price +£40 quantity=£90 questioned/reduced. All three prevention/reduction figures are not cash recovery, Q £0/fee £0. |
| DR-03 | Complete actual review/lock/Final Check and issue invoice | Net£18,800, VAT £3,760, gross £22,560. Materials checks must precede lock if they create new work evidence. |
| DR-04 | Builder opens two withheld-payment cases,£320 and£2,500, against exact invoice; eligibility evidence review; exact per-case terms; assemble/version evidence pack; preview/approve/advance source-bound pursuit | Each source/time precedes qualifying later receipt; fake sink contains exact approved message/recipient/pack once. Terms guard active; builder's own ignored reminder/overdue evidence follows accepted CH-7 fixture authority. Current eligibility schema does not accept F10/F11 as v3 fixture names: require the upstream accepted workflow/qualification mapping. New CH-8 pack consumer compatibility is a prerequisite; never strip v3 sections or bypass latest-pack/source checks to send. |
| DR-05 | Connect generated feed; record£384 gross receipt; pending then settled `receipt-384`; match receipt; review/approve allocation | £384=£320 net+£64VAT; source/line/case allocation IDs; Q£320; SV-6 illustration£32; M4-9 cumulative post£32. Settled feed itself reports allocated eligible net0 until allocation. |
| DR-06 | Record£3,000; pending→settled `receipt-3000`; match; review/approve exact allocation | Total gross £3,384; Q£2,820; VAT allocated£564; customer due £19,176. Cumulative fee £282, new delta£250; value£2,538. |
| DR-07 | Derive/review exact v3 statement; identical approval replay; create/download immutable statement; approve exact collection and advance sanctioned fake adapter | Zero repeat delta/no duplicate journal; statement principal £282/Q£2,820; pending then settled£282; fee outstanding£0. The fresh authorised scenario must produce the required `DEMO-FEE-000001`; prepare its legitimate empty document namespace through accepted bootstrap, with no earlier numbered document in that world. If the accepted namespace/statement contract cannot do this, retain the upstream hold—do not relax this assertion or reset a counter. Ordinary subsequent documents use their legitimate next numbers and are tested separately. |
| DR-08 | Reverse original£3,000 customer receipt; review/approve linked M4-8 allocation reversal; rederive compensation | Q£320, tax£64, invoice due £22,176; case 2 reopened£2,500; fee execution paused; compensation−£250; original receipt/allocation/statement preserved. |
| DR-09 | New exact refund approval; execute fake refund; reconcile both books | Fee refunded£250, retained/net posted£32; value found yours£288; money state “Records match within this simulation”; unresolved0; measured real external actions0. |
| DR-10 | Read report, resume and refresh at each preceding durable boundary | Every amount links through command→source/evidence→approval→settled movement→allocation→attribution→journal→statement→collection/refund. Neither a report expectation nor an old fee illustration supplies a value. |
| DR-11 | After DR-04's delivered message and before DR-05's receipt, schedule a follow-up; use accepted bound `advance_time`; open review of the current pack and approve the exact reminder; execute its separate message command. After real case settlement, perform/observe accepted `close_recovered`; cancellation and reopening use independent command-created branches | Due time creates a Decision with zero automatic sends. The separately approved reminder sends once through the fake sink. A `close_recovered`, dispute or cancellation source stops the intent as specified; bank settlement alone is not the stop source, and reopening never revives a stopped intent. Requires H-FOLLOWUP-CLOCK; no new-run ID is passed to legacy sandbox storage. |


The materials screens may show the actual order/bill amounts and questioned price/quantity arithmetic. CH-9 must not turn these into a monetary prevention-value or savings claim; its checked section remains counts only and its recovery categories require actual qualifying receipts.

#### Value companions within the recovery family

| ID | Actual fresh command sequence | Required observation |
|---|---|---|
| DV-01 | Separate fresh job/run with no prior qualifying recovery; £18,800 net/£22,560 gross invoice and verified proof; eligible builder-opened £500 withheld case with accepted terms/evidence/pursuit; record and match existing generated settled `receipt-3000`; `recovery-allocation-command.v1` review then allocate `grossPence=60000` against that case using returned approval hash/revision | Server derives £500 net and £100 tax at the invoice’s 5/6 net ratio; accepted SV-6 fee £50; source receipt still has £2,400 gross unallocated. No invented £500 bank movement or copied end-state fee. |
| DV-02 | A second isolated fresh job/run: create a positive eligible claim with actual terms/evidence/pursuit, then read before any customer receipt or allocation | Authoritative Q £0 and fee £0 with complete sources and the unpaid reason. Do not call allocation with `grossPence=0`, and do not combine this job total with DV-01. A missing/held reader is not this zero. |

Source support for the partial amount is `packages/core/src/recovery-allocation.ts:12–24` and `packages/db/src/recovery-allocation-repository.ts:278–325`: the human selects gross amount, while the server derives net/tax, checks claim/evidence/unallocated receipt availability and requires complete invoice composition. The actual accepted CH-7/SV-6 eligibility/qualification bridge is still a prerequisite. CH9-J owns its first vertical proof; DEMO-J2 repeats the real operation path and records DV-01/02 in the final run report. The core-1000 builder-recorded £500 receipt cannot substitute.

#### Shadow-30000

| ID | Actual sequence | Required observation |
|---|---|---|
| DS-01 | Fresh source capture/review and actual customer/site creation/binding; quote exact£30,000 net; send; exact acceptance; start and verify proof | Accepted baseline £30,000; stable parties/scope. |
| DS-02 | Builder logs and approves£3,200 extras through ordinary variation/capture path | Tracked capture £3,200; fee £0. |
| DS-03 | Ingest approved fictional supplier-document bytes, photo bytes and diary text through real source commands; actual shadow worker consumes original versions | Held findings derived from source; no pre-lock builder response/count/timing/query difference. Never seed signal, reveal or attribution rows. Source fixture→expected catch mapping is owned by SV-3/SV-5. |
| DS-04 | Assemble baseline+captures; add£400 at final review; approve through accepted review semantics; dispositions/terms/lock | Review account £33,600; tracked£3,600; fee £0; immutable lock source/capture hashes. |
| DS-05 | Actual SV-5 completed check/reveal; confirm and price£500 and£300; ordinary current customer approval through approved MON-5 authority | Two unique catches; no duplicated catch across three source types; exact capture absence/lock cutoff/reveal/approval/attribution links. This step is held if customer binding is not approved. |
| DS-06 | Issue single current lock-bound final invoice; record customer payment; generated `receipt-41280` pending→settled and match; full-invoice line allocation | Net£34,400; VAT £6,880; gross £41,280. Customer money remains paid to builder; one invoice and one canonical receipt. |
| DS-07 | Accepted SV-6 attribution and fee derivation; source-linked payment/value views; CH-8 pack/download standalone verify | Found Q£800; fee £80; yours before VAT/tax£720; tracked£3,600 with£0 fee. Paid£41,280 ≠ fee base. Pack walks source→lock→reveal→approved line→invoice→settled receipt/line allocation. |

#### Meter: all MON-2 monetary figures through actual synthetic lifecycle commands

Each test world starts through the approved synthetic identity/agreement bootstrap. Before any **measured paid profile**, create, accept and start the first trial job and end it through an actual permitted close/lock command in the prelude; retain that historical job and consumed entitlement. Complete the required same-business synthetic card setup before the next activation. Use the accepted MON-3 conversion and MON-2 subscription anchor; never set `trial=false`, erase the trial, choose an ad hoc reanchor or seed a paid period. The measured full period begins only at a legitimate accepted boundary, with the prelude job closed before its first London date and the target count derived from real source events. Retain any actual conversion stub as a separately labelled period/statement in the report; it is not silently erased or included in the twelve-full-period reference sum. New measured jobs use unique customer/site identities and non-small baseline where required. Accepted reference fake clock advances drive authentic CH-4 events; no direct daily-count array, trial boolean, meter fixture loader, aggregate seeding or edited ledger. Start/proof/finish/close/resume/import commands are real domain commands. Preserve correct same-customer/site grouping. Runtime billing formula remains MON-1/MON-2's unchanged implementation.

| ID | Scenario command schedule | Exact figure |
|---|---|---|
| DM-01 | Twelve monthly Solo periods; daily target places for full periods(1,1,1,2,2,2,2,2,2,3,3,4), reached by actual job activity/ends | £29 each period; £348 across twelve actual monthly payments. Annual-plan activation remains off. |
| DM-02 | Twelve monthly Builder periods; full-period places(3,4,4,4,4,5,5,5,5,6,6,7) | £69 each period; £828 across twelve actual monthly payments. Annual-plan activation remains off. |
| DM-03 | Builder eighth counted place throughout 30-day period | £89.00. |
| DM-04 | Builder eighth counted place for 15 of 30 London dates, seven for remaining 15 | £79.00. |
| DM-05 | Builder 12 throughout period | £169.00. |
| DM-06 | Solo 5 throughout period | £49.00. |
| DM-07 | Solo 6th admitted grace place | £49.00; visible grace/upgrade Decision;7th refused without explicit move to Builder. |
| DM-08 | Solo 6 places, accepted upgrade effective day 11 of 30;10 days at £49 and20 at £69 | (49×10+69×20)/30=£62.333…→£62.33 half-even once. |
| DM-09 | Builder 8 places for 1 day of31 | £69+£20/31=£69.645…→£69.65. |
| DM-10 | Builder 13 then 14…17 places through actual admissions | 13 is grace; crossing to14 immediately raises `track_review_due`;14–17 remain admitted; subscription≤£169; no automatic contractor track change. Exact day/phase marker retained. |
| DM-11 | Above7 on≥10 days in two of last 3 billing periods; a separate nontrigger profile | Sustained trigger independently tested against accepted versioned rule; not conflated with immediate beyond-grace trigger. |
| DM-12 | MON-1 lifecycle subjourneys: day 31 start; first photo day 5; finished+7 days;30 quiet days; restart; same customer/site; small allowances 4/7; irreversible£4,000 trip; linked live import; invoiced import; trial | Source-bound day ledger/rebuild equals expected period; cache damage cannot change bill; late facts create next-period correction, preserving issued documents. Hidden-signal worlds give identical bills and meter role has no shadow query. |
| DM-13 | Reach actual Solo capacity through fresh admissions; separately attempt resume/reopen/live-import bypasses and two simultaneous distinct-job admissions at the boundary; exercise pause/finish tails, locked-new-work refusal and different-customer/same-site grouping | Accepted cap/grace outcomes derive from real source commands; no more than six committed Solo places without upgrade; one permitted effect or typed capacity/stale conflict, no free import period or cross-customer coalescing. Job-list and next-price displays agree with the accepted day ledger. |

**Concrete event schedule:** each job needed for the whole period has its actual first-site-evidence event on measured day 1, so counting does not rely on the day-31 fallback. Keep activity gaps below 30 days with accepted site activity on days 1 and 16 of each period. For DM-04, the first seven have first-site evidence on day 1 and the eighth on day 16; assert exactly 15 counted London dates before asserting £79. For DM-09, the eighth first-site event is on day 31; assert exactly one counted date before £69.65. DM-08 uses all six counted places on day 1 and the accepted upgrade effective day 11. For year profiles, add/close/restart jobs at the accepted boundary according to actual lifecycle rules, retaining all interval history; never rewrite an input daily count array. Exact source dates and membership/clock authority must be valid under the accepted producer contracts.

**Period-to-money completion:** close each measured period using the accepted MON-2 command (not an installed HTTP capability at P0), create its actual separate subscription statement, approve the exact simulated collection, execute the sanctioned fake adapter and read pending then settled source facts. Billed principal and settled principal remain different report fields. Twelve actual monthly period outputs sum to £348 or £828; this is not annual-plan activation. A redirect-only path must remain unsettled; replay cannot create another statement or settlement. If the existing accepted namespace/authority contract cannot run this sequence, the meter journey stays held.

DM-12's cache-damage fault injection is a dedicated adversarial CI control and may alter a disposable projection in a test world; it must never populate or replace positive-journey authoritative business facts. Annual flag remains off unless its separate approved prerequisites clear. Every period figure carries policy, London dates, source event hashes, actual subscription statement, approval and simulated settlement references as required above.

#### Trial: independent fresh branches for each ending

| ID | Actual operations | Required result |
|---|---|---|
| DT-01 | Approved fresh fictional business; first exact accepted job; card request via accepted synthetic provider adapter; choose Skip for now only here; actual first activation | Eligibility not a client flag; accepted all-key identity claim and trial-start fact; subscription0 while only trial job live; data/exports remain accessible. Missing sufficient independent identity remains held/refused under MON-3 contract, not invented by DEMO. |
| DT-02 | Branch A: actual dispositions/terms/lock and completed Final Check | Trial ends at own successful lock; actual Final Check and SV-6 illustration operate normally. No synthetic “ended” flag. |
| DT-03 | Independent branch B: actual close with reason | Trial ends at own close; no Final Check on closed job; reopening cannot restore entitlement. |
| DT-04 | Independent branch C: advance approved reference clock to accepted London day 90 boundary | Before boundary still active; at boundary exactly one durable expiry/end, with approved DST/leap/sub-millisecond semantics. Persisted conversion/stub rules are external holds, not inherited elapsed-day preview behavior. |
| DT-05 | Independent branch D: prepare second accepted job; attempt without card; complete real accepted synthetic card-setup command; activate second | Without card refuses and offers Add a card; pending/unknown/redirect-only/foreign-business card never qualifies; successful second activation ends trial atomically and prorates accepted subscription from that day; failed activation creates no end/key consumption. |
| DT-06 | Fresh proposed second entitlement with same company number; separately with same normalised phone+provider fingerprint, including cross-tenant attempt | Each duplicate refused; reset never frees either key. Test all available keys, not company-only fallback. |
| DT-07 | Distinct second small/same-site/noncounting job; failed activation; close other job; own finish/quiet; imported or reopened/historical candidate | Card rule cannot be bypassed by counted-place grouping; failed second/other-job close/finish/quiet do not end; imported/reopened/historical rules follow accepted MON-3 authority. |
| DT-08 | Close/lock/expiry/second-activation race; delayed earlier fact; replay after session revoke; snapshot after reload | Earliest successful source wins; no duplicate claim/end/statement; no reopened trial; current authority still required. Every conversion figure links to existing accepted MON-2 computation. |


## Dedicated negative branches

Every branch below is NOT RUN in both projects; it requires actual refusal/source evidence, not a configured zero.

| Branch | Required evidence |
|---|---|
| no-proof | Verified proof absent: gate refuses; no qualifying fee. |
| prevention | Materials checks/reductions are not recovered cash; no positive fee. |
| disclosure-before-lock | Disclosure permanently disqualifies that signal from fees. |
| evidence-after-lock | Post-lock evidence cannot qualify v1 attribution; new work refuses. |
| disputed-attribution | Disputed attribution cannot produce approved fee principal. |
| unpaid-catches | Unpaid catch has no qualifying settlement or positive fee. |
| partial-receipts | Actual allocation ratio retains unallocated receipt balance. |
| duplicate-receipts | Replay/overlap/alternate representation has no duplicate effect. |
| stale-authority | Revoked session/member/approval replay fails current authority. |
| unknown-outcomes | Retain original operation identity; reconcile before retry. |
| tenant-isolation | Other tenant/session/job/run cannot read or attach results. |
| corrupted-evidence | Hash/version/source mismatch fails verification and cannot qualify. |

## Milestone and recovery contract

P1 documentation permits P2 schema preparation only. Complete accepted P1 mapping and accepted P2 plus upstream contracts gate I. I precedes J1–J5; all five precede A1, independent exact-head reviews, separate acceptance and Ben's merge. No schema/test PASS completes DEMO-S. Two real nontechnical builder observations remain missing.

Reserve operation identities before dispatch. Unknown outcomes freeze consequential work until the producer supplies an authoritative result or permitted replay. Capture may replay its exact identity/bytes; quote saves with old revisions cannot be blindly retried or matched solely by amount/latest revision. Domain message replay returns current state. Reset preserves history and consumed trial keys; isolated company/reset authority remains a blocking design input. A run filter cannot hide live jobs from a company meter. Stored domain facts, screen traversal and acceptance are separate evidence records. External-action zero needs measured adapter/sentinel evidence.

## Holds retained

## 3. Material dependency holds and non-duplication register

| Hold | Required predecessor / real decision | Consequence for this pack |
|---|---|---|
| H-SV5 | Coordinator-owned SV-5 lock/reveal/disposition, #189/#181, accepted public seam | No local Final Check substitute; CH-8/SV-6 and full journeys wait |
| H-EP-MUST-SURFACE | Accepted worker-owned must-surface request/completion receipt, bound to authorised job and exact source cutoff | A before-lock pack cannot fabricate an all-clear, inspect hidden relations or branch on ordinary hidden signals |
| H-PACK-CONSUMER | Accepted version-aware `app.recovery_message_sources_current` and latest-pack/sink compatibility, owned by CH-7/M4-5-S/M4-6-S | New pack sections cannot bypass current source validation; consumer compatibility precedes CH8-V, with actual full-pack delivery tested in CH8-V |
| H-CH8-A-BINDING | Accepted SV-5/SV-6/M4-8 source contracts, exact versions and authoritative producer-to-section mappings for all eight required sections | Unbound envelope/canonicalisation/specimen preparation may proceed after issuance; final source/section binding, producer-specific provenance and complete CH8-A acceptance stay HOLD. CH8-V and pack-consumer compatibility cannot consume a preparation-only receipt |
| H-SV6 | Persisted attribution, immutable qualified outputs and resolved display/illustration semantics; accepted CH-7 and allocator bridge | CH-8 settlement sections and CH-9 fee/value sources wait; pure shapes/fixtures may be prepared |
| H-VALUE-SOURCES | Accepted actual SV-6/M4-8, MON-1/MON-2A and applicable lifecycle/money source contracts: complete source coverage, immutable identities/revisions, canonical event/correction identity and accepted time/window meanings, with concrete public file/API/schema bindings and producer acceptance evidence | CH9-S/R may prepare schema/illustrative DTOs/rendering only. CH9-J/B must prove source-list reproduction, event deduplication and exact boundaries from real command-created records. Self-authored DTOs, hashes or expected outputs do not clear this hold |
| H-FOLLOWUP-CLOCK | M4-6 accepted binding from the new run to its persisted follow-up clock/intent contract; current code uses legacy three-step `sandbox_run` | New run IDs cannot be passed to legacy clock storage, and that clock cannot drive MON billing/trial time |
| H-ALLOC | M4-8 persisted eligibility/catch bridge and any required saved F5/F7 support | Do not turn pure allocation fixtures into saved settlement proof or build another allocator |
| H-MONEY | Accepted M4-9-S → M4-10-S → M4-12-S → M4-17-S, plus MON-4A authority | Recovery ending, fee/refund reports and whole DEMO-S remain held; statement namespace evolution belongs to that lane/coordinator |
| H-LIFECYCLE | Accepted CH-4 commands → MON-1 event sources/admission, CH-5 import and SV-7A intake | No supplied daily counts, end-state job seeding or forged diary/photo lifecycle facts as demo acceptance |
| H-COMPANY | Explicitly approved MON-2A/security composition for persisted company authority and a supported isolated demo-company/run design | Business/period value, meter and trial paths cannot use the current practice cookie as a bypass |
| H-CUSTOMER | Approved MON-5 small-builder customer binding and accepted reuse of MON-5A/B candidates | A full customer approval/message journey is held; builder attestation remains its accurately labelled existing behavior |
| H-TRIAL | Accepted MON-3 eligibility, card/identity, first/second activation and lifecycle conversion; actual clock/period decision | No UTC/London, DST, first-period stub or charge-day choice invented in DEMO-S. The old preview is not runtime trial authority |
| H-CORE-CORRECTION | Accepted fixture choice for the proposed £100 net / £20 tax customer credit after the core £820 reversal; existing authorised correction command and review must support it | The £120 gross credit and £700 due remain conditional expected figures, not approved policy or completed commands. DC-07, the P1 binding and full core acceptance remain held until this fixture choice and command binding are accepted |
| H-DEMO-P1-EXEC | Every required scenario step mapped to its concrete accepted producer operation/read/recovery contract, version, authority/subject binding and prerequisite receipt; all required policy/clock/fixture decisions resolved | Draft documentation may list held entries, but the complete executable map is BLOCKED / NOT COMPLETE while any required binding remains held. Actual I/J/A1 execution, both projects and final acceptance remain separately mandatory |
| H-OPERATION-READ | Accepted typed operation receipts/read interfaces, including lost-response lookup for APIs with server-generated identities | DEMO intent/checkpoint recovery cannot trust a browser copy, invent a generic command ID or query private domain tables |
| H-MON7 | MON-7a exists; MON-7b B4 is explicitly parked and undefined until payment stages | The full prerequisite remains open. Owner must either obtain approved scope amendment or supply an approved/unparked dependency; this pack chooses neither |
| H-REVIEW | Real final-head A/B PASSes, green required CI, separate acceptance of each predecessor | Candidate status, older verdict, schema inspection and this planning output do not clear the gate |

The full DEMO-S prerequisite set is retained exactly: **SV-1–SV-6, SV-7A, CH-1, CH-4–CH-9, MON-1, MON-2A, MON-3, MON-4A, MON-5, MON-7, MON-8, M4-5-S, M4-6-S, M4-7-S, M4-8-S, M4-9-S, M4-10-S, M4-12-S and M4-17-S**. Transitive repair dependencies, including M4-3-S-R for CH-8, remain applicable. The shorter historical graph row is not a waiver of this list. [R3]

Recorded in-flight heads are dependency pointers only: CH-4 changed from the reviewed `73a0e755…` to `e1d677c…` and still has the E25 repair/CI hold; CH-7 changed from `33a51a69…` to `9bfc6678…`; MON-3-P-B `91ff397e…` has a recorded B PASS but not complete A/B acceptance. Nothing in this pack issues duplicate repair work or describes these candidates as merged. [R8]

No Ben decision is needed to finish this planning document. Before the affected integration is issued, the coordinator presents a concrete authority/calendar/MON-7 decision packet if existing approved evidence has not already resolved the relevant hold. Unaffected pure preparation does not wait for that conversation.


## Base symbol/schema verification

Presence is source inspection only; absent items are STOP individually. No upstream gap is silently optional.

| Symbol/schema | Read-only git grep result |
|---|---|
| `confirmCapturedScope` | SOURCE INSPECTED: `apps/web/e2e/CH-7.spec.ts` |
| `openQuotingWatchdogJob` | SOURCE INSPECTED: `apps/web/e2e/CH-1.spec.ts` |
| `seedManySignals` | SOURCE INSPECTED: `apps/web/e2e/SV-4.spec.ts` |
| `seedActivationFixturesV3` | SOURCE INSPECTED: `packages/db/src/demo-seed.ts` |
| `SYNTHETIC_WORKFLOW_ONLY` | SOURCE INSPECTED: `apps/api/src/auth/application-auth.guard.ts` |
| `assertFinalAccountInvoiceGuard` | SOURCE INSPECTED: `apps/api/src/final-account-lock.application.ts` |
| `SandboxRepository` | SOURCE INSPECTED: `apps/api/src/app.module.ts` |
| `QuoteApplication` | SOURCE INSPECTED: `apps/api/src/practice-session.test.ts` |
| `captureRequestV1` | SOURCE INSPECTED: `apps/api/src/capture/capture.application.ts` |
| `DemoMeterCommands` | STOP: absent at base; concrete upstream binding required; no substitute |
| `DemoSubscriptionCommands` | STOP: absent at base; concrete upstream binding required; no substitute |
| `DemoTrialCommands` | STOP: absent at base; concrete upstream binding required; no substitute |
| `job_capture_v1` / `CAPTURE_CONTRACT_VERSION` | SOURCE INSPECTED: `packages/core/src/capture.ts`; `captureRequestV1` binds `contractVersion` to this literal. |
| `final-account.assemble.v1` | SOURCE INSPECTED: `apps/api/src/final-account.application.test.ts` |
| `final-account.disposition.v1` | SOURCE INSPECTED: `apps/api/src/shadow-isolation.application.test.ts` |
| `final-account.lock.v1` | SOURCE INSPECTED: `apps/api/src/final-account-lock.application.test.ts` |
| `final-check-terms.accept.v1` | SOURCE INSPECTED: `apps/api/src/shadow-isolation.application.test.ts` |
| `final-review-extra.v1` | SOURCE INSPECTED: `apps/api/src/final-account-lock.application.test.ts` |
| `goods-receipt.v1` | SOURCE INSPECTED: `apps/web/app/ui/supplier-documents.tsx` |
| `job-parties-command.v1` | SOURCE INSPECTED: `apps/api/openapi.json` |
| `lock-bound-invoice.issue.v1` | SOURCE INSPECTED: `apps/api/src/final-account-lock.contracts.ts` |
| `material-rate-command.v1` | SOURCE INSPECTED: `apps/api/src/material.application.test.ts` |
| `material-requirement-command.v1` | SOURCE INSPECTED: `apps/api/src/material.application.test.ts` |
| `practice-activation-command.v1` | SOURCE INSPECTED: `apps/api/src/quote/contracts.ts` |
| `practice-credit-note.issue.v1` | SOURCE INSPECTED: `apps/api/src/customer-invoice.contracts.ts` |
| `practice-credit-note.preview.v1` | SOURCE INSPECTED: `apps/api/src/customer-invoice.contracts.ts` |
| `practice-customer-receipt.record.v1` | SOURCE INSPECTED: `apps/api/src/customer-invoice.contracts.ts` |
| `practice-customer-receipt.reverse.v1` | SOURCE INSPECTED: `apps/api/src/customer-invoice.contracts.ts` |
| `practice-feed-command.v1` | SOURCE INSPECTED: `apps/api/openapi.json` |
| `practice-proof-command.v1` | SOURCE INSPECTED: `apps/api/src/proof/contracts.ts` |
| `proposal_review_command_v1` | SOURCE INSPECTED: `apps/api/src/capture/contracts.ts` |
| `proposal_review_confirm_v1` | SOURCE INSPECTED: `apps/api/src/capture/contracts.ts` |
| `purchase-order-placement.v1` | SOURCE INSPECTED: `apps/api/src/purchase-order.contracts.ts` |
| `quote-acceptance-command.v1` | SOURCE INSPECTED: `apps/api/src/quote/contracts.ts` |
| `quote-execute-command.v1` | SOURCE INSPECTED: `apps/api/src/quote/contracts.ts` |
| `quote-preview-command.v1` | SOURCE INSPECTED: `apps/api/src/quote/contracts.ts` |
| `quote-send-command.v1` | SOURCE INSPECTED: `apps/api/src/quote/contracts.ts` |
| `quote_draft_command_v1` | SOURCE INSPECTED: `apps/api/src/quote/contracts.ts` |
| `recovery-allocation-command.v1` | SOURCE INSPECTED: `apps/api/openapi.json` |
| `recovery-case-command.v1` | SOURCE INSPECTED: `apps/api/src/recovery-case.application.test.ts` |
| `recovery-case-terms-command.v1` | SOURCE INSPECTED: `apps/api/src/recovery-case-terms.application.test.ts` |
| `recovery-eligibility-command.v1` | SOURCE INSPECTED: `apps/api/src/recovery-case.application.test.ts` |
| `recovery-eligibility-command.v3` | SOURCE INSPECTED: `apps/api/src/practice-supplier-credit.application.test.ts` |
| `recovery-follow-up-command.v1` | SOURCE INSPECTED: `apps/api/src/recovery-follow-up.application.test.ts` |
| `recovery-message-command.v1` | SOURCE INSPECTED: `apps/api/src/recovery-message.application.test.ts` |
| `recovery-message-preview.v1` | SOURCE INSPECTED: `apps/api/src/recovery-message.application.test.ts` |
| `supplier-document-intake.v1` | SOURCE INSPECTED: `apps/web/app/ui/supplier-documents.tsx` |
| `variation-command.v1` | SOURCE INSPECTED: `apps/api/src/shadow-isolation.application.test.ts` |

## Acceptance limits and fixture choices

DP1-01 documents all rows; executable-map acceptance BLOCKED. DP1-02 uses strict test-only input rejection. DP1-03 separates inputs/assertions and adds no runtime caller. DP1-04 documents five families, DV companions, all meter/trial variants and both projects; browser NOT RUN. DP1-05 modifies no earlier test/source. DP1-06 retains all holds. Actual command results are in the builder receipt, not inferred here.

The £100 net/£20 tax credit (£120 gross, £700 remaining due) stays PROPOSED under H-CORE-CORRECTION. Core £500/£820 receipts remain builder-recorded, not bank-confirmed. Annual £348/£828 profiles are twelve monthly settlements; annual-plan activation stays off. Legacy cap/activation fixtures and the three-step sandbox remain regression-only. Existing money/fee/billing engines are unchanged; no second calculator is supplied.

## Route-file verification at base

These are Next file-presence checks only, not HTTP execution, method acceptance or registered Nest proof. Diary/message POSTs remain proposed even though GET route files exist.

| Route | Result |
|---|---|
| `/api/jobs/[id]/confirm` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/confirm/route.ts` |
| `/api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/route.ts` |
| `/api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/preview` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/preview/route.ts` |
| `/api/jobs/[id]/customer-invoices/[invoiceId]/receipts` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/customer-invoices/[invoiceId]/receipts/route.ts` |
| `/api/jobs/[id]/customer-invoices/[invoiceId]/receipts/reversals` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/customer-invoices/[invoiceId]/receipts/reversals/route.ts` |
| `/api/jobs/[id]/customer-messages` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/customer-messages/route.ts` |
| `/api/jobs/[id]/diary` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/diary/route.ts` |
| `/api/jobs/[id]/final-account` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/final-account/route.ts` |
| `/api/jobs/[id]/final-account/dispositions` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/final-account/dispositions/route.ts` |
| `/api/jobs/[id]/final-account/lock` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/final-account/lock/route.ts` |
| `/api/jobs/[id]/final-account/review-extras` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/final-account/review-extras/route.ts` |
| `/api/jobs/[id]/final-account/terms` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/final-account/terms/route.ts` |
| `/api/jobs/[id]/materials` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/materials/route.ts` |
| `/api/jobs/[id]/money-check` | STOP: proposed upstream; absent at base; H-MONEY |
| `/api/jobs/[id]/parties` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/parties/route.ts` |
| `/api/jobs/[id]/practice-feed` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/practice-feed/route.ts` |
| `/api/jobs/[id]/proof` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/proof/route.ts` |
| `/api/jobs/[id]/proposal` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/proposal/route.ts` |
| `/api/jobs/[id]/purchase-orders/placement` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/purchase-orders/placement/route.ts` |
| `/api/jobs/[id]/purchase-orders/revisions` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/purchase-orders/revisions/route.ts` |
| `/api/jobs/[id]/quotes` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/quotes/route.ts` |
| `/api/jobs/[id]/quotes/acceptance` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/quotes/acceptance/route.ts` |
| `/api/jobs/[id]/quotes/activation` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/quotes/activation/route.ts` |
| `/api/jobs/[id]/quotes/delivery` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/quotes/delivery/route.ts` |
| `/api/jobs/[id]/quotes/delivery/execute` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/quotes/delivery/[action]/route.ts`, action execute |
| `/api/jobs/[id]/quotes/preview` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/quotes/preview/route.ts` |
| `/api/jobs/[id]/recovery-allocations` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/recovery-allocations/route.ts` |
| `/api/jobs/[id]/recovery-allocations/reversals` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/recovery-allocations/reversals/route.ts` |
| `/api/jobs/[id]/recovery-cases` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/recovery-cases/route.ts` |
| `/api/jobs/[id]/recovery-cases/eligibility` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/recovery-cases/eligibility/route.ts` |
| `/api/jobs/[id]/recovery-cases/terms` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/recovery-cases/terms/route.ts` |
| `/api/jobs/[id]/review` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/review/route.ts` |
| `/api/jobs/[id]/success-fee-statements` | STOP: proposed upstream; absent at base; H-MONEY |
| `/api/jobs/[id]/success-fees` | STOP: proposed upstream; absent at base; H-MONEY |
| `/api/jobs/[id]/supplier-documents/facts/confirm` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/supplier-documents/facts/confirm/route.ts` |
| `/api/jobs/[id]/supplier-documents/intake` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/supplier-documents/intake/route.ts` |
| `/api/jobs/[id]/supplier-documents/receipts` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/supplier-documents/receipts/route.ts` |
| `/api/jobs/[id]/supplier-matches` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/supplier-matches/route.ts` |
| `/api/jobs/[id]/supplier-matches/corrections` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/supplier-matches/corrections/route.ts` |
| `/api/jobs/[id]/variations` | SOURCE INSPECTED: `apps/web/app/api/jobs/[id]/variations/route.ts` |
| `/api/jobs/capture` | SOURCE INSPECTED: `apps/web/app/api/jobs/capture/route.ts` |
| `/api/material-rates` | SOURCE INSPECTED: `apps/web/app/api/material-rates/route.ts` |
| `/api/recovery-cases/[id]/evidence-packs` | SOURCE INSPECTED: `apps/web/app/api/recovery-cases/[id]/evidence-packs/route.ts` |
| `/api/recovery-cases/[id]/evidence-packs/[packId]/attachment-approval` | SOURCE INSPECTED: `apps/web/app/api/recovery-cases/[id]/evidence-packs/[packId]/attachment-approval/route.ts` |
| `/api/recovery-cases/[id]/evidence-packs/[packId]/download` | SOURCE INSPECTED: `apps/web/app/api/recovery-cases/[id]/evidence-packs/[packId]/download/route.ts` |
| `/api/recovery-cases/[id]/evidence-packs/[packId]/inspect` | SOURCE INSPECTED: `apps/web/app/api/recovery-cases/[id]/evidence-packs/[packId]/inspect/route.ts` |
| `/api/recovery-cases/[id]/follow-ups` | SOURCE INSPECTED: `apps/web/app/api/recovery-cases/[id]/follow-ups/route.ts` |
| `/api/recovery-cases/[id]/follow-ups/[followUpId]/commands` | SOURCE INSPECTED: `apps/web/app/api/recovery-cases/[id]/follow-ups/[followUpId]/commands/route.ts` |
| `/api/recovery-cases/[id]/messages` | SOURCE INSPECTED: `apps/web/app/api/recovery-cases/[id]/messages/route.ts` |
| `/api/recovery-cases/[id]/messages/[messageId]/commands` | SOURCE INSPECTED: `apps/web/app/api/recovery-cases/[id]/messages/[messageId]/commands/route.ts` |
| `/api/success-fee-statements/[id]/collections` | STOP: proposed upstream; absent at base; H-MONEY |
| `/api/success-fee-statements/[id]/refunds` | STOP: proposed upstream; absent at base; H-MONEY |
