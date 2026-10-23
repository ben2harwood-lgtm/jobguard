/** Static documentation fixture only; no command parser, dispatcher or runtime registration.
 * Expected evidence is an assertion recipe, never observed source output. All bindings remain held. */
export const demoCatalogue = {
  "version": "small-builder-demo-scenarios.v1",
  "purpose": "documentation-only",
  "executableMap": "BLOCKED_NOT_COMPLETE",
  "sourceBase": "dc5721230fd8aedbf2d9d0457789074b66b48765",
  "bindings": [
    {
      "id": "B01",
      "operation": "Fresh capture",
      "commandSchemaAndRoute": "`POST /api/jobs/capture`; `captureRequestV1` (`contractVersion: job_capture_v1`), `captureId`, reviewed text/source kind, `fixtureId`, requested tenant verified by server",
      "source": "`packages/core/src/capture.ts`; `apps/api/src/capture/capture.application.ts:13`. Fresh source bytes plus deterministic extractor are allowed fixture inputs; commercial end state is not.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B02",
      "operation": "Cited review",
      "commandSchemaAndRoute": "`GET /api/jobs/[id]/proposal`; `POST /api/jobs/[id]/review`, `proposal_review_command_v1`, expectedRevision and reviewed choices; `POST /api/jobs/[id]/confirm`, `proposal_review_confirm_v1`, commandId, expectedRevision",
      "source": "`apps/api/src/capture/contracts.ts`; five stable scope IDs, explicit shelf dismissal and disposal answer.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B03",
      "operation": "Customer/site",
      "commandSchemaAndRoute": "`GET/POST /api/jobs/[id]/parties`, `job-parties-command.v1`, actions `create_customer`, `revise_customer`, `create_site`, `bind`, `correct`",
      "source": "`job-parties.application.ts`, `job-parties.controller.ts`; compose existing exact paying-customer/site fields.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B04",
      "operation": "Quote revisions",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/quotes`, `quote_draft_command_v1`, draftId, expectedRevision, currency GBP, taxPolicyVersion, complete existing scope-linked lines",
      "source": "`apps/api/src/quote/contracts.ts`; stable original scope IDs retained.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B05",
      "operation": "Send exact quote",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/quotes/preview`, `quote-preview-command.v1`; `POST /api/jobs/[id]/quotes/delivery`, `quote-send-command.v1`, commandId, documentId/hash/recipient; `POST /api/jobs/[id]/quotes/delivery/execute` existing execute transport with `quote-execute-command.v1`, mode `success`/`timeout`/`reconcile`",
      "source": "Existing execute handler is `apps/web/app/api/jobs/[id]/quotes/delivery/[action]/route.ts` with `action=execute`; `QuoteApplication.preview/issue/execute` supplies the service. `.invalid` recipient; send approval and customer acceptance are separate records.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B06",
      "operation": "Practice acceptance",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/quotes/acceptance`, `quote-acceptance-command.v1`, exact document ID/hash/version and stated name/method/time",
      "source": "This is builder-attested practice acceptance, not authenticated customer signing. MON-5 authentic customer approval is an external gate for final integrated customer journeys.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B07",
      "operation": "Start",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/quotes/activation`, `practice-activation-command.v1`, `scenario: no_charge`",
      "source": "New v3 terms must show no cap or activation/base obligation. Do not choose `simulated_base_obligation`, which is preserved historical v1 behavior. MON-1/MON-3 later compose actual admission.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B08",
      "operation": "Ordinary extras",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/variations`, `variation-command.v1`, actions `propose`, `revise`, `approve`, `reject`",
      "source": "Fields use proposalId/scopeItemId/variationId/revisionId/approvalId rather than assuming every v1 operation has a `commandId`. Existing approve attests builder-recorded practice acceptance.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B09",
      "operation": "Proof",
      "commandSchemaAndRoute": "`GET/POST /api/jobs/[id]/proof`, `practice-proof-command.v1`, actions `select_generated` (`completion-photo`), `finalize`, `complete`",
      "source": "Select returns upload ID/version; finalize must return verified evidence; complete binds evidence+scope. Domain proof UI may choose actual generated file bytes.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B10",
      "operation": "Materials",
      "commandSchemaAndRoute": "`POST /api/material-rates`, `material-rate-command.v1`; `POST /api/jobs/[id]/materials`, `material-requirement-command.v1`; `POST /api/jobs/[id]/purchase-orders/revisions`, `purchaseOrderDraftV1`; `POST /api/jobs/[id]/purchase-orders/placement`, `purchase-order-placement.v1` with exact approved command",
      "source": "Use existing M2 materials checks. Prevented spend and revised unpaid bills are not recovered cash.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B11",
      "operation": "Supplier evidence",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/supplier-documents/intake`, `supplier-document-intake.v1`; `POST /api/jobs/[id]/supplier-documents/receipts`, `goods-receipt.v1`; `POST /api/jobs/[id]/supplier-documents/facts/confirm`, `supplierFactCorrectionV1`; `POST /api/jobs/[id]/supplier-matches`; `POST /api/jobs/[id]/supplier-matches/corrections`",
      "source": "Existing source/receipt/fact APIs; intake after lock is refused for new work.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B12",
      "operation": "Diary/messages",
      "commandSchemaAndRoute": "Existing `GET /api/jobs/[id]/diary` and `GET /api/jobs/[id]/customer-messages`; **PROPOSED upstream** POST operations at those same full paths",
      "source": "Do not claim writable intake exists at baseline; preserve post-lock refusal and approved actor binding.",
      "status": "HELD",
      "inspection": "proposed-upstream",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B13",
      "operation": "Account review",
      "commandSchemaAndRoute": "`GET/POST /api/jobs/[id]/final-account`, `final-account.assemble.v1`; `POST /api/jobs/[id]/final-account/review-extras`, `final-review-extra.v1`; `POST /api/jobs/[id]/final-account/dispositions`, `final-account.disposition.v1`",
      "source": "Disposition every baseline item; revision/hash binds account. Review extra is capture, not a recovered catch.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B14",
      "operation": "Lock/terms",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/final-account/terms`, `final-check-terms.accept.v1`; `POST /api/jobs/[id]/final-account/lock`, `final-account.lock.v1`, exact revision and declaration version",
      "source": "SV-5 completion/reveal command interface is upstream/coordinator-owned; never write a completed-check flag. Existing invoice guard requires exact lock and completed check.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B15",
      "operation": "Locked invoice",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/final-account/lock`, `lock-bound-invoice.issue.v1`, finalAccountRevisionId, expectedSourceHash, invoiceKind `final`/`supplementary`, `.invalid` recipient/date",
      "source": "Source `final-account-lock.contracts.ts` / controller; guard `assertFinalAccountInvoiceGuard`. Existing direct `/customer-invoices` is not a bypass for new v3 lock completion.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B16",
      "operation": "Cases",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/recovery-cases`, `recovery-case-command.v1`, `open`/`transition`; `POST /api/jobs/[id]/recovery-cases/eligibility`, `recovery-eligibility-command.v1` review/approve or installed `recovery-eligibility-command.v3` review only; `POST /api/jobs/[id]/recovery-cases/terms`, `recovery-case-terms-command.v1`, `approve`",
      "source": "Pinned v3 enum only covers F14/F15/F16-partial/F16-full/F17/F18/F19/F20/F21/F22; it has no F10/F11 request fixture. Existing pre-pursuit v1 evidence-review/approval may remain a valid workflow prerequisite, but is not itself v3 fee qualification. Accepted CH-7/SV-6 mapping for the £320/£2,500 later settlements is required; do not fake a F10 body or reuse an incompatible fixture.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B17",
      "operation": "Evidence pack/pursuit",
      "commandSchemaAndRoute": "`GET/POST /api/recovery-cases/[id]/evidence-packs`; `GET /api/recovery-cases/[id]/evidence-packs/[packId]/inspect`; `GET /api/recovery-cases/[id]/evidence-packs/[packId]/download`; `POST /api/recovery-cases/[id]/evidence-packs/[packId]/attachment-approval`; `POST /api/recovery-cases/[id]/messages`, `recovery-message-preview.v1`; `POST /api/recovery-cases/[id]/messages/[messageId]/commands`, `recovery-message-command.v1`, actions approve/advance/revoke/reconcile",
      "source": "Preview binds case revision and pack; approve binds exact recipient/body/amount/hash/pack. CH-7 fee terms precede pursuit. H-PACK-CONSUMER requires the latest version-aware source-current/attachment guards; never strip v3 sections or disable validation.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B18",
      "operation": "Follow-up",
      "commandSchemaAndRoute": "`POST/GET /api/recovery-cases/[id]/follow-ups`; `POST /api/recovery-cases/[id]/follow-ups/[followUpId]/commands`; `recovery-follow-up-command.v1`, actions schedule/advance_time/open_review/approve_reminder/cancel",
      "source": "Current clock calls `SandboxRepository.advance` and uses legacy `sandbox_run`, bounded at tick 3. **H-FOLLOWUP-CLOCK:** accepted M4-6 owner binding is required for new DEMO runs; neither this clock nor a new run ID is MON billing authority. Due time creates a Decision only.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B19",
      "operation": "Customer receipt",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/customer-invoices/[invoiceId]/receipts`, `practice-customer-receipt.record.v1`, amountPence/date/method/reference; `POST /api/jobs/[id]/customer-invoices/[invoiceId]/receipts/reversals`, `practice-customer-receipt.reverse.v1`, paymentId/reason",
      "source": "Builder record only until matched to a settled source.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B20",
      "operation": "Fake settled facts",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/practice-feed`, `practice-feed-command.v1`, `connect`, `advance` with fixed movement key and pending/settled/replay/page_overlap/alternate_representation/unknown_duplicate, `match_receipt`, `reconcile_duplicate`, `disconnect`",
      "source": "Client cannot submit a settlement amount, event ID or arbitrary state. A settled movement is still unallocated.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B21",
      "operation": "Case/line allocation",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/recovery-allocations`; `POST /api/jobs/[id]/recovery-allocations/reversals`; `recovery-allocation-command.v1`, `review`→`allocate`, `review_reverse`→`reverse`, exact approvalHash/revision",
      "source": "M4-8-S owns full-invoice composition and exact ratios. No client-supplied qualifying net.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B22",
      "operation": "Customer correction",
      "commandSchemaAndRoute": "`POST /api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/preview`, `practice-credit-note.preview.v1`; `POST /api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes`, `practice-credit-note.issue.v1`, previewHash/commandId",
      "source": "Linked immutable source invoice and exact tax policy.",
      "status": "HELD",
      "inspection": "source-inspected-partial",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B23",
      "operation": "Fee/statement/collection/reconciliation",
      "commandSchemaAndRoute": "**PROPOSED upstream** `/api/jobs/[id]/success-fees`, `/api/jobs/[id]/success-fee-statements`, `/api/success-fee-statements/[id]/collections`, `/api/success-fee-statements/[id]/refunds`, `/api/jobs/[id]/money-check`",
      "source": "Draft targets from the factpack, not baseline routes. Exact accepted command names, HTTP methods and payloads are prerequisite deliverables from their owners; DEMO may only consume them. No generic set-paid adapter.",
      "status": "HELD",
      "inspection": "proposed-upstream",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    },
    {
      "id": "B24",
      "operation": "Meter/trial",
      "commandSchemaAndRoute": "**PROPOSED upstream** MON-1 lifecycle source/admission/read API, MON-2A plan/period command API and MON-3 trial/card/lifecycle API; DEMO spec references named typed ports `DemoMeterCommands`, `DemoSubscriptionCommands`, `DemoTrialCommands` until owning contracts fix routes",
      "source": "These port names are proposed adapter interfaces only. No undisclosed endpoint, new clock rule, company binding or provider is invented. Implementation/CI is blocked until actual mapping and scope are accepted.",
      "status": "HELD",
      "inspection": "proposed-upstream",
      "authority": "Current server-verified synthetic session/member and exact job/subject; company/customer authority requires accepted owner binding.",
      "resultRecovery": "Actual producer result and immutable revision; unknown outcome waits for accepted typed read or permitted exact replay. No generic success adapter.",
      "acceptanceEvidence": null,
      "holds": [
        "H-DEMO-P1-EXEC",
        "H-OPERATION-READ",
        "H-REVIEW"
      ]
    }
  ],
  "steps": [
    {
      "id": "DC-01",
      "family": "core-1000",
      "operation": "Fresh text capture; accept Protect room, Prepare walls, Paint walls, Finish trim, Clean site; dismiss Replace shelves with reason; answer disposal; save and confirm cited review",
      "expectedEvidence": "Five stable source-linked scope IDs; reload retains exact decisions.",
      "bindingIds": [
        "B01",
        "B02"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DC-02",
      "family": "core-1000",
      "operation": "Create the fictional paying customer and site, then bind their exact current revisions through the existing parties commands; enter quantity 1 for each; rates £200,£200,£200,£200,£100; save quote v1; revise Clean site to£200 and save v2",
      "expectedEvidence": "Net£900 then£1,000; VAT £200; gross £1,200. Old v1 remains intact.",
      "bindingIds": [
        "B03",
        "B04"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DC-03",
      "family": "core-1000",
      "operation": "Preview/send exact v2; run fake send; record current exact acceptance (final MON-5 path when accepted); `no_charge` start/admission",
      "expectedEvidence": "Same job and accepted document; new v3 policy; no v1 cap snapshot/activation obligation.",
      "bindingIds": [
        "B05",
        "B06",
        "B07"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DC-04",
      "family": "core-1000",
      "operation": "Propose +£125, −£25 and +£50; approve exact first two, retain third unapproved; run required proof select/finalize/complete",
      "expectedEvidence": "Approved additions£125, reductions£25, pending£50; final net £1,100. No source swapping.",
      "bindingIds": [
        "B08",
        "B09"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DC-05",
      "family": "core-1000",
      "operation": "Assemble final account; resolve all dispositions; accept exact Final Check terms; lock; run installed SV-5 worker/check to completed; create lock-bound final invoice",
      "expectedEvidence": "Invoice net £1,100 + illustrative VAT £220 = £1,320. No shortcut to completed check.",
      "bindingIds": [
        "B13",
        "B14",
        "B15"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DC-06",
      "family": "core-1000",
      "operation": "Actual receipt command£500; actual second receipt£820; reload; reverse exact second payment with reason",
      "expectedEvidence": "Due£820→£0→£820. Original two receipt records and reversal retained. These are labelled recorded, not bank-confirmed.",
      "bindingIds": [
        "B19"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DC-07",
      "family": "core-1000",
      "operation": "**Proposed fixture, held under H-CORE-CORRECTION:** after acceptance of the fixture choice and concrete command binding, preview and approve £100 net customer credit using the existing `invoice-later.spec.ts` mechanics",
      "expectedEvidence": "Conditional expected result: £100 net + £20 VAT = £120 credit; after prior reversal, due £700. The amount remains a proposed fixture choice, not approved product policy or an executed correction; original invoice stays £1,320/hash unchanged. Full DC-07/core acceptance remains held until the accepted actual command proves it.",
      "bindingIds": [
        "B22"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DC-08",
      "family": "core-1000",
      "operation": "Read CH-9 value and report from persisted facts; reload/another authorised browser context",
      "expectedEvidence": "Correct source-linked capture/final-account/invoiced/recorded/reversed/corrected history. No positive recovery/fee from ordinary customer receipts; all counts/zeroes sourced.",
      "bindingIds": [
        "B23"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-01",
      "family": "recovery-18800",
      "operation": "Fresh five-line capture/confirmation, actual customer/site creation and binding, then entered quote prices summing£18,800; preview/send/accept/start; verified proof",
      "expectedEvidence": "Accepted net £18,800; source-linked proof. No cap/base amount.",
      "bindingIds": [
        "B01",
        "B02",
        "B03",
        "B04",
        "B05",
        "B06",
        "B07",
        "B09"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-02",
      "family": "recovery-18800",
      "operation": "Materials A: rate£20×10, proposed£25×10; revise before exact simulated placement. Materials B:£20×10 order,8 accepted, supplier bill£25×10, human-confirm revised unpaid £160",
      "expectedEvidence": "A£250→£200, difference£50; B non-overlapping£50 price +£40 quantity=£90 questioned/reduced. All three prevention/reduction figures are not cash recovery, Q £0/fee £0.",
      "bindingIds": [
        "B10",
        "B11"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-03",
      "family": "recovery-18800",
      "operation": "Complete actual review/lock/Final Check and issue invoice",
      "expectedEvidence": "Net£18,800, VAT £3,760, gross £22,560. Materials checks must precede lock if they create new work evidence.",
      "bindingIds": [
        "B13",
        "B14",
        "B15"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-04",
      "family": "recovery-18800",
      "operation": "Builder opens two withheld-payment cases,£320 and£2,500, against exact invoice; eligibility evidence review; exact per-case terms; assemble/version evidence pack; preview/approve/advance source-bound pursuit",
      "expectedEvidence": "Each source/time precedes qualifying later receipt; fake sink contains exact approved message/recipient/pack once. Terms guard active; builder's own ignored reminder/overdue evidence follows accepted CH-7 fixture authority. Current eligibility schema does not accept F10/F11 as v3 fixture names: require the upstream accepted workflow/qualification mapping. New CH-8 pack consumer compatibility is a prerequisite; never strip v3 sections or bypass latest-pack/source checks to send.",
      "bindingIds": [
        "B16",
        "B17"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-05",
      "family": "recovery-18800",
      "operation": "Connect generated feed; record£384 gross receipt; pending then settled `receipt-384`; match receipt; review/approve allocation",
      "expectedEvidence": "£384=£320 net+£64VAT; source/line/case allocation IDs; Q£320; SV-6 illustration£32; M4-9 cumulative post£32. Settled feed itself reports allocated eligible net0 until allocation.",
      "bindingIds": [
        "B19",
        "B20",
        "B21"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-06",
      "family": "recovery-18800",
      "operation": "Record£3,000; pending→settled `receipt-3000`; match; review/approve exact allocation",
      "expectedEvidence": "Total gross £3,384; Q£2,820; VAT allocated£564; customer due £19,176. Cumulative fee £282, new delta£250; value£2,538.",
      "bindingIds": [
        "B19",
        "B20",
        "B21"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-07",
      "family": "recovery-18800",
      "operation": "Derive/review exact v3 statement; identical approval replay; create/download immutable statement; approve exact collection and advance sanctioned fake adapter",
      "expectedEvidence": "Zero repeat delta/no duplicate journal; statement principal £282/Q£2,820; pending then settled£282; fee outstanding£0. The fresh authorised scenario must produce the required `DEMO-FEE-000001`; prepare its legitimate empty document namespace through accepted bootstrap, with no earlier numbered document in that world. If the accepted namespace/statement contract cannot do this, retain the upstream hold—do not relax this assertion or reset a counter. Ordinary subsequent documents use their legitimate next numbers and are tested separately.",
      "bindingIds": [
        "B23"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-08",
      "family": "recovery-18800",
      "operation": "Reverse original£3,000 customer receipt; review/approve linked M4-8 allocation reversal; rederive compensation",
      "expectedEvidence": "Q£320, tax£64, invoice due £22,176; case 2 reopened£2,500; fee execution paused; compensation−£250; original receipt/allocation/statement preserved.",
      "bindingIds": [
        "B20",
        "B21",
        "B23"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-09",
      "family": "recovery-18800",
      "operation": "New exact refund approval; execute fake refund; reconcile both books",
      "expectedEvidence": "Fee refunded£250, retained/net posted£32; value found yours£288; money state “Records match within this simulation”; unresolved0; measured real external actions0.",
      "bindingIds": [
        "B23"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-10",
      "family": "recovery-18800",
      "operation": "Read report, resume and refresh at each preceding durable boundary",
      "expectedEvidence": "Every amount links through command→source/evidence→approval→settled movement→allocation→attribution→journal→statement→collection/refund. Neither a report expectation nor an old fee illustration supplies a value.",
      "bindingIds": [
        "B23"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DR-11",
      "family": "recovery-18800",
      "operation": "After DR-04's delivered message and before DR-05's receipt, schedule a follow-up; use accepted bound `advance_time`; open review of the current pack and approve the exact reminder; execute its separate message command. After real case settlement, perform/observe accepted `close_recovered`; cancellation and reopening use independent command-created branches",
      "expectedEvidence": "Due time creates a Decision with zero automatic sends. The separately approved reminder sends once through the fake sink. A `close_recovered`, dispute or cancellation source stops the intent as specified; bank settlement alone is not the stop source, and reopening never revives a stopped intent. Requires H-FOLLOWUP-CLOCK; no new-run ID is passed to legacy sandbox storage.",
      "bindingIds": [
        "B18",
        "B17"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DV-01",
      "family": "recovery-18800",
      "operation": "Separate fresh job/run with no prior qualifying recovery; £18,800 net/£22,560 gross invoice and verified proof; eligible builder-opened £500 withheld case with accepted terms/evidence/pursuit; record and match existing generated settled `receipt-3000`; `recovery-allocation-command.v1` review then allocate `grossPence=60000` against that case using returned approval hash/revision",
      "expectedEvidence": "Server derives £500 net and £100 tax at the invoice’s 5/6 net ratio; accepted SV-6 fee £50; source receipt still has £2,400 gross unallocated. No invented £500 bank movement or copied end-state fee.",
      "bindingIds": [
        "B16",
        "B19",
        "B20",
        "B21"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DV-02",
      "family": "recovery-18800",
      "operation": "A second isolated fresh job/run: create a positive eligible claim with actual terms/evidence/pursuit, then read before any customer receipt or allocation",
      "expectedEvidence": "Authoritative Q £0 and fee £0 with complete sources and the unpaid reason. Do not call allocation with `grossPence=0`, and do not combine this job total with DV-01. A missing/held reader is not this zero.",
      "bindingIds": [
        "B16",
        "B23"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DS-01",
      "family": "shadow-30000",
      "operation": "Fresh source capture/review and actual customer/site creation/binding; quote exact£30,000 net; send; exact acceptance; start and verify proof",
      "expectedEvidence": "Accepted baseline £30,000; stable parties/scope.",
      "bindingIds": [
        "B01",
        "B02",
        "B03",
        "B04",
        "B05",
        "B06",
        "B07",
        "B09"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DS-02",
      "family": "shadow-30000",
      "operation": "Builder logs and approves£3,200 extras through ordinary variation/capture path",
      "expectedEvidence": "Tracked capture £3,200; fee £0.",
      "bindingIds": [
        "B08"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DS-03",
      "family": "shadow-30000",
      "operation": "Ingest approved fictional supplier-document bytes, photo bytes and diary text through real source commands; actual shadow worker consumes original versions",
      "expectedEvidence": "Held findings derived from source; no pre-lock builder response/count/timing/query difference. Never seed signal, reveal or attribution rows. Source fixture→expected catch mapping is owned by SV-3/SV-5.",
      "bindingIds": [
        "B11",
        "B12"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DS-04",
      "family": "shadow-30000",
      "operation": "Assemble baseline+captures; add£400 at final review; approve through accepted review semantics; dispositions/terms/lock",
      "expectedEvidence": "Review account £33,600; tracked£3,600; fee £0; immutable lock source/capture hashes.",
      "bindingIds": [
        "B13",
        "B14"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DS-05",
      "family": "shadow-30000",
      "operation": "Actual SV-5 completed check/reveal; confirm and price£500 and£300; ordinary current customer approval through approved MON-5 authority",
      "expectedEvidence": "Two unique catches; no duplicated catch across three source types; exact capture absence/lock cutoff/reveal/approval/attribution links. This step is held if customer binding is not approved.",
      "bindingIds": [
        "B14",
        "B08"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DS-06",
      "family": "shadow-30000",
      "operation": "Issue single current lock-bound final invoice; record customer payment; generated `receipt-41280` pending→settled and match; full-invoice line allocation",
      "expectedEvidence": "Net£34,400; VAT £6,880; gross £41,280. Customer money remains paid to builder; one invoice and one canonical receipt.",
      "bindingIds": [
        "B15",
        "B19",
        "B20",
        "B21"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DS-07",
      "family": "shadow-30000",
      "operation": "Accepted SV-6 attribution and fee derivation; source-linked payment/value views; CH-8 pack/download standalone verify",
      "expectedEvidence": "Found Q£800; fee £80; yours before VAT/tax£720; tracked£3,600 with£0 fee. Paid£41,280 ≠ fee base. Pack walks source→lock→reveal→approved line→invoice→settled receipt/line allocation.",
      "bindingIds": [
        "B23",
        "B17"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-01",
      "family": "meter",
      "operation": "Twelve monthly Solo periods; daily target places for full periods(1,1,1,2,2,2,2,2,2,3,3,4), reached by actual job activity/ends",
      "expectedEvidence": "£29 each period; £348 across twelve actual monthly payments. Annual-plan activation remains off.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-02",
      "family": "meter",
      "operation": "Twelve monthly Builder periods; full-period places(3,4,4,4,4,5,5,5,5,6,6,7)",
      "expectedEvidence": "£69 each period; £828 across twelve actual monthly payments. Annual-plan activation remains off.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-03",
      "family": "meter",
      "operation": "Builder eighth counted place throughout 30-day period",
      "expectedEvidence": "£89.00. Requires source-linked measured period, subscription statement, approval and simulated settlement; billed and settled principal remain distinct.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-04",
      "family": "meter",
      "operation": "Builder eighth counted place for 15 of 30 London dates, seven for remaining 15",
      "expectedEvidence": "£79.00. Requires source-linked measured period, subscription statement, approval and simulated settlement; billed and settled principal remain distinct.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-05",
      "family": "meter",
      "operation": "Builder 12 throughout period",
      "expectedEvidence": "£169.00. Requires source-linked measured period, subscription statement, approval and simulated settlement; billed and settled principal remain distinct.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-06",
      "family": "meter",
      "operation": "Solo 5 throughout period",
      "expectedEvidence": "£49.00. Requires source-linked measured period, subscription statement, approval and simulated settlement; billed and settled principal remain distinct.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-07",
      "family": "meter",
      "operation": "Solo 6th admitted grace place",
      "expectedEvidence": "£49.00; visible grace/upgrade Decision;7th refused without explicit move to Builder.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-08",
      "family": "meter",
      "operation": "Solo 6 places, accepted upgrade effective day 11 of 30;10 days at £49 and20 at £69",
      "expectedEvidence": "(49×10+69×20)/30=£62.333…→£62.33 half-even once.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-09",
      "family": "meter",
      "operation": "Builder 8 places for 1 day of31",
      "expectedEvidence": "£69+£20/31=£69.645…→£69.65.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-10",
      "family": "meter",
      "operation": "Builder 13 then 14…17 places through actual admissions",
      "expectedEvidence": "13 is grace; crossing to14 immediately raises `track_review_due`;14–17 remain admitted; subscription≤£169; no automatic contractor track change. Exact day/phase marker retained.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-11",
      "family": "meter",
      "operation": "Above7 on≥10 days in two of last 3 billing periods; a separate nontrigger profile",
      "expectedEvidence": "Sustained trigger independently tested against accepted versioned rule; not conflated with immediate beyond-grace trigger.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-12",
      "family": "meter",
      "operation": "MON-1 lifecycle subjourneys: day 31 start; first photo day 5; finished+7 days;30 quiet days; restart; same customer/site; small allowances 4/7; irreversible£4,000 trip; linked live import; invoiced import; trial",
      "expectedEvidence": "Source-bound day ledger/rebuild equals expected period; cache damage cannot change bill; late facts create next-period correction, preserving issued documents. Hidden-signal worlds give identical bills and meter role has no shadow query.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DM-13",
      "family": "meter",
      "operation": "Reach actual Solo capacity through fresh admissions; separately attempt resume/reopen/live-import bypasses and two simultaneous distinct-job admissions at the boundary; exercise pause/finish tails, locked-new-work refusal and different-customer/same-site grouping",
      "expectedEvidence": "Accepted cap/grace outcomes derive from real source commands; no more than six committed Solo places without upgrade; one permitted effect or typed capacity/stale conflict, no free import period or cross-customer coalescing. Job-list and next-price displays agree with the accepted day ledger.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DT-01",
      "family": "trial",
      "operation": "Approved fresh fictional business; first exact accepted job; card request via accepted synthetic provider adapter; choose Skip for now only here; actual first activation",
      "expectedEvidence": "Eligibility not a client flag; accepted all-key identity claim and trial-start fact; subscription0 while only trial job live; data/exports remain accessible. Missing sufficient independent identity remains held/refused under MON-3 contract, not invented by DEMO.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DT-02",
      "family": "trial",
      "operation": "Branch A: actual dispositions/terms/lock and completed Final Check",
      "expectedEvidence": "Trial ends at own successful lock; actual Final Check and SV-6 illustration operate normally. No synthetic “ended” flag.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DT-03",
      "family": "trial",
      "operation": "Independent branch B: actual close with reason",
      "expectedEvidence": "Trial ends at own close; no Final Check on closed job; reopening cannot restore entitlement.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DT-04",
      "family": "trial",
      "operation": "Independent branch C: advance approved reference clock to accepted London day 90 boundary",
      "expectedEvidence": "Before boundary still active; at boundary exactly one durable expiry/end, with approved DST/leap/sub-millisecond semantics. Persisted conversion/stub rules are external holds, not inherited elapsed-day preview behavior.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DT-05",
      "family": "trial",
      "operation": "Independent branch D: prepare second accepted job; attempt without card; complete real accepted synthetic card-setup command; activate second",
      "expectedEvidence": "Without card refuses and offers Add a card; pending/unknown/redirect-only/foreign-business card never qualifies; successful second activation ends trial atomically and prorates accepted subscription from that day; failed activation creates no end/key consumption.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DT-06",
      "family": "trial",
      "operation": "Fresh proposed second entitlement with same company number; separately with same normalised phone+provider fingerprint, including cross-tenant attempt",
      "expectedEvidence": "Each duplicate refused; reset never frees either key. Test all available keys, not company-only fallback.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DT-07",
      "family": "trial",
      "operation": "Distinct second small/same-site/noncounting job; failed activation; close other job; own finish/quiet; imported or reopened/historical candidate",
      "expectedEvidence": "Card rule cannot be bypassed by counted-place grouping; failed second/other-job close/finish/quiet do not end; imported/reopened/historical rules follow accepted MON-3 authority.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    },
    {
      "id": "DT-08",
      "family": "trial",
      "operation": "Close/lock/expiry/second-activation race; delayed earlier fact; replay after session revoke; snapshot after reload",
      "expectedEvidence": "Earliest successful source wins; no duplicate claim/end/statement; no reopened trial; current authority still required. Every conversion figure links to existing accepted MON-2 computation.",
      "bindingIds": [
        "B24"
      ],
      "projects": [
        "mobile-360",
        "desktop"
      ],
      "execution": "NOT_RUN"
    }
  ],
  "negatives": [
    {
      "id": "no-proof",
      "expectedEvidence": "Verified proof absent: gate refuses; no qualifying fee.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "prevention",
      "expectedEvidence": "Materials checks/reductions are not recovered cash; no positive fee.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "disclosure-before-lock",
      "expectedEvidence": "Disclosure permanently disqualifies that signal from fees.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "evidence-after-lock",
      "expectedEvidence": "Post-lock evidence cannot qualify v1 attribution; new work refuses.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "disputed-attribution",
      "expectedEvidence": "Disputed attribution cannot produce approved fee principal.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "unpaid-catches",
      "expectedEvidence": "Unpaid catch has no qualifying settlement or positive fee.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "partial-receipts",
      "expectedEvidence": "Actual allocation ratio retains unallocated receipt balance.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "duplicate-receipts",
      "expectedEvidence": "Replay/overlap/alternate representation has no duplicate effect.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "stale-authority",
      "expectedEvidence": "Revoked session/member/approval replay fails current authority.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "unknown-outcomes",
      "expectedEvidence": "Retain original operation identity; reconcile before retry.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "tenant-isolation",
      "expectedEvidence": "Other tenant/session/job/run cannot read or attach results.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    },
    {
      "id": "corrupted-evidence",
      "expectedEvidence": "Hash/version/source mismatch fails verification and cannot qualify.",
      "execution": "NOT_RUN",
      "projects": [
        "mobile-360",
        "desktop"
      ]
    }
  ],
  "holds": [
    {
      "id": "H-SV5",
      "requirement": "Coordinator-owned SV-5 lock/reveal/disposition, #189/#181, accepted public seam",
      "consequence": "No local Final Check substitute; CH-8/SV-6 and full journeys wait"
    },
    {
      "id": "H-EP-MUST-SURFACE",
      "requirement": "Accepted worker-owned must-surface request/completion receipt, bound to authorised job and exact source cutoff",
      "consequence": "A before-lock pack cannot fabricate an all-clear, inspect hidden relations or branch on ordinary hidden signals"
    },
    {
      "id": "H-PACK-CONSUMER",
      "requirement": "Accepted version-aware `app.recovery_message_sources_current` and latest-pack/sink compatibility, owned by CH-7/M4-5-S/M4-6-S",
      "consequence": "New pack sections cannot bypass current source validation; consumer compatibility precedes CH8-V, with actual full-pack delivery tested in CH8-V"
    },
    {
      "id": "H-CH8-A-BINDING",
      "requirement": "Accepted SV-5/SV-6/M4-8 source contracts, exact versions and authoritative producer-to-section mappings for all eight required sections",
      "consequence": "Unbound envelope/canonicalisation/specimen preparation may proceed after issuance; final source/section binding, producer-specific provenance and complete CH8-A acceptance stay HOLD. CH8-V and pack-consumer compatibility cannot consume a preparation-only receipt"
    },
    {
      "id": "H-SV6",
      "requirement": "Persisted attribution, immutable qualified outputs and resolved display/illustration semantics; accepted CH-7 and allocator bridge",
      "consequence": "CH-8 settlement sections and CH-9 fee/value sources wait; pure shapes/fixtures may be prepared"
    },
    {
      "id": "H-VALUE-SOURCES",
      "requirement": "Accepted actual SV-6/M4-8, MON-1/MON-2A and applicable lifecycle/money source contracts: complete source coverage, immutable identities/revisions, canonical event/correction identity and accepted time/window meanings, with concrete public file/API/schema bindings and producer acceptance evidence",
      "consequence": "CH9-S/R may prepare schema/illustrative DTOs/rendering only. CH9-J/B must prove source-list reproduction, event deduplication and exact boundaries from real command-created records. Self-authored DTOs, hashes or expected outputs do not clear this hold"
    },
    {
      "id": "H-FOLLOWUP-CLOCK",
      "requirement": "M4-6 accepted binding from the new run to its persisted follow-up clock/intent contract; current code uses legacy three-step `sandbox_run`",
      "consequence": "New run IDs cannot be passed to legacy clock storage, and that clock cannot drive MON billing/trial time"
    },
    {
      "id": "H-ALLOC",
      "requirement": "M4-8 persisted eligibility/catch bridge and any required saved F5/F7 support",
      "consequence": "Do not turn pure allocation fixtures into saved settlement proof or build another allocator"
    },
    {
      "id": "H-MONEY",
      "requirement": "Accepted M4-9-S → M4-10-S → M4-12-S → M4-17-S, plus MON-4A authority",
      "consequence": "Recovery ending, fee/refund reports and whole DEMO-S remain held; statement namespace evolution belongs to that lane/coordinator"
    },
    {
      "id": "H-LIFECYCLE",
      "requirement": "Accepted CH-4 commands → MON-1 event sources/admission, CH-5 import and SV-7A intake",
      "consequence": "No supplied daily counts, end-state job seeding or forged diary/photo lifecycle facts as demo acceptance"
    },
    {
      "id": "H-COMPANY",
      "requirement": "Explicitly approved MON-2A/security composition for persisted company authority and a supported isolated demo-company/run design",
      "consequence": "Business/period value, meter and trial paths cannot use the current practice cookie as a bypass"
    },
    {
      "id": "H-CUSTOMER",
      "requirement": "Approved MON-5 small-builder customer binding and accepted reuse of MON-5A/B candidates",
      "consequence": "A full customer approval/message journey is held; builder attestation remains its accurately labelled existing behavior"
    },
    {
      "id": "H-TRIAL",
      "requirement": "Accepted MON-3 eligibility, card/identity, first/second activation and lifecycle conversion; actual clock/period decision",
      "consequence": "No UTC/London, DST, first-period stub or charge-day choice invented in DEMO-S. The old preview is not runtime trial authority"
    },
    {
      "id": "H-CORE-CORRECTION",
      "requirement": "Accepted fixture choice for the proposed £100 net / £20 tax customer credit after the core £820 reversal; existing authorised correction command and review must support it",
      "consequence": "The £120 gross credit and £700 due remain conditional expected figures, not approved policy or completed commands. DC-07, the P1 binding and full core acceptance remain held until this fixture choice and command binding are accepted"
    },
    {
      "id": "H-DEMO-P1-EXEC",
      "requirement": "Every required scenario step mapped to its concrete accepted producer operation/read/recovery contract, version, authority/subject binding and prerequisite receipt; all required policy/clock/fixture decisions resolved",
      "consequence": "Draft documentation may list held entries, but the complete executable map is BLOCKED / NOT COMPLETE while any required binding remains held. Actual I/J/A1 execution, both projects and final acceptance remain separately mandatory"
    },
    {
      "id": "H-OPERATION-READ",
      "requirement": "Accepted typed operation receipts/read interfaces, including lost-response lookup for APIs with server-generated identities",
      "consequence": "DEMO intent/checkpoint recovery cannot trust a browser copy, invent a generic command ID or query private domain tables"
    },
    {
      "id": "H-MON7",
      "requirement": "MON-7a exists; MON-7b B4 is explicitly parked and undefined until payment stages",
      "consequence": "The full prerequisite remains open. Owner must either obtain approved scope amendment or supply an approved/unparked dependency; this pack chooses neither"
    },
    {
      "id": "H-REVIEW",
      "requirement": "Real final-head A/B PASSes, green required CI, separate acceptance of each predecessor",
      "consequence": "Candidate status, older verdict, schema inspection and this planning output do not clear the gate"
    }
  ],
  "milestoneGraph": {
    "P1-documentation": [
      "P2-schema-preparation-only"
    ],
    "P1-complete-executable-map": [
      "I"
    ],
    "P2-accepted-schema": [
      "I"
    ],
    "I": [
      "J1",
      "J2",
      "J3",
      "J4",
      "J5"
    ],
    "J1-J5": [
      "A1"
    ],
    "A1": [
      "separate-technical-acceptance",
      "Ben-merge"
    ]
  },
  "requiredPrerequisites": [
    "SV-1",
    "SV-2",
    "SV-3",
    "SV-4",
    "SV-5",
    "SV-6",
    "SV-7A",
    "CH-1",
    "CH-4",
    "CH-5",
    "CH-6",
    "CH-7",
    "CH-8",
    "CH-9",
    "MON-1",
    "MON-2A",
    "MON-3",
    "MON-4A",
    "MON-5",
    "MON-7",
    "MON-8",
    "M4-5-S",
    "M4-6-S",
    "M4-7-S",
    "M4-8-S",
    "M4-9-S",
    "M4-10-S",
    "M4-12-S",
    "M4-17-S"
  ],
  "coreCorrection": {
    "status": "PROPOSED_HELD",
    "hold": "H-CORE-CORRECTION",
    "netPence": 10000,
    "taxPence": 2000,
    "grossPence": 12000,
    "remainingDuePence": 70000
  }
} as const;
