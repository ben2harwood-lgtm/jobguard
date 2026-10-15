# Contractor billing data foundation v1 — ENT-6

Issued base and inspected main: `9865e4b32b71c75b763240bcdf27bd6a75b42f34` (#215), 15 October 2026. This implements independent synthetic data tools, not an enabled billing subsystem. BUILD_PLAN §§9.1.6–9.1.9, §9.2 ENT-6 and AGENTS remain authoritative. Migration allocation is **0160**, unused pending the coordinator's catalogue prerequisite. No migration, business table, grant, routine, route, repository writer or worker registration is added.

The draft's assertion that ENT-5 is unmerged is superseded by the issued header. Its merged contract (`extra-approval-v1.md:14–22`) supplies immutable source bindings and pure constraints; it explicitly holds integrated approval-chain execution. ENT-6 does not interpret that foundation as completed approval or invent its missing candidate interface.

## Implemented representations

All objects use strict Zod schemas. Unexpected fields, including tenant, actor, role, grant, mode and settlement flags, fail validation. Public amounts are integral GBP pence bounded by the existing `MAX_MONEY_PENCE`. Source net, VAT and gross must sum exactly using bigint; supplied VAT is retained, not calculated under a newly invented tax policy. Exact fractions reuse SH-1 digit/magnitude bounds, reject nonpositive denominators, and reduce on normalization/output. No fractional money is rounded.

`billing-status.v1` is one immutable *data representation* of a source event, potentially containing multiple invoice lines:

- Identity: `clientContractId`, `source`, `sourceEventId`, `invoiceNumber`.
- Fact: `invoiced | credited | paid | payment_reversed | rejected`, `effectiveAt`, nullable `remittanceReference`, `reconciliationId`, `originalEventId`.
- `amount`: `netPence`, `vatPence`, `grossPence`, all nonnegative. Reversal sign is expressed by fact type, not negative input amounts.
- Nullable `composition`: declared totals and all represented external lines. Every line has `externalInvoiceLineId`, kind (`original_order | extra | other`), `existedAt`, net/VAT/gross and nullable `match`.
- A represented extra match carries `exportLineId`, `jobId`, `extraId`, `scopeItemId`, `revisionId`, `revisionHash`. Ordinary lines have no match. Duplicate external identities/export IDs and inconsistent sums refuse.
- Nullable `explicit`: line IDs and exact gross shares; `separateInvoice`: a boolean representing the existing allocation precedence.
- `lineAdjustments`: explicit credit/rejection line detail, default empty. Credit details, when supplied, must sum to the event amounts.

This schema proves internal arithmetic consistency only. It cannot prove that a source omitted no line, that a match exists, that its contract/job/revision is correct, or that an extra is approved/canonical. Those require persisted checked writers and genuine dependency facts, which remain held. A fabricated smaller invoice whose declared totals also omit a line is not authoritative completeness evidence. There is no client `compositionComplete` flag. A missing composition remains representable so the source is not discarded.

`normalizeBillingStatus` selects schema fields in a deterministic object representation, sorts composition/shares/adjustments by their stable identity, reduces shares, lowercases UUIDs, and normalizes offsets to UTC while preserving arbitrary subsecond precision. UTC results must remain in the timestamp schema's supported year range. Its SHA-256 covers the economic event, including source/event identity. Transport and receipt time do not enter it. Distinct original source hashes remain separate metadata.

`billing-import.v1` in the API contract module is an **internal parser seam**, with `transport: api` and `events`, or `transport: csv` and `csv`. It is not registered as a route. API source hashes cover the JSON serialization of the received envelope; CSV hashes cover the received UTF-8 text. Each observation has its separate semantic hash. No authorization is inferred from successful parsing.

## CSV v1

UTF-8; exact header order below; comma delimiter; quoted fields double embedded quotes; embedded line breaks remain quoted. Writers use CRLF, readers also accept LF. Invalid UTF-8, NUL, unfinished quotes, characters after a closing quote, bare CR, extra/missing/duplicate columns, noncanonical numeric text, inconsistent event headers or duplicate external lines refuse with `BILLING_INVALID`. Input bytes are limited to 5,000,000 and data rows to SH-1's 10,000-line bound. Empty reference cells mean null; a non-null reference cannot be empty.

Both CSV writers prefix cells beginning with `=`, `+`, `-`, `@` or an apostrophe with an apostrophe before CSV quoting, preventing spreadsheet formula execution. Leading apostrophes are escaped too so the status reader can remove exactly one escape apostrophe before any of those characters and preserve source identities/text and semantic hashes on round-trip. JSON retains the original text. External CSV producers must use this same escape convention for such cells.

```text
version,source,source_event_id,client_contract_id,invoice_number,fact_type,effective_at,remittance_reference,reconciliation_id,original_event_id,net_pence,vat_pence,gross_pence,declared_net_pence,declared_vat_pence,declared_gross_pence,explicit,separate_invoice,line_adjustments,external_invoice_line_id,line_kind,line_existed_at,line_net_pence,line_vat_pence,line_gross_pence,export_line_id,job_id,extra_id,scope_item_id,revision_id,revision_hash,sandbox_label
```

One row per composition line repeats the same event header; rows are grouped by `(source, source_event_id)`, never treated as independent payments. Events without composition use one row with empty declaration/line columns. `explicit` is JSON null or a strict share array; `line_adjustments` is a strict JSON array. `separate_invoice` is exactly `true` or `false`. Every row carries `Practice sandbox — synthetic data; nothing is sent or charged`.

## Export artifacts

`billing-export.v1` renderer input is a contract ID and immutable-source line representations: job/extra/scope/revision/hash, approval binding/snapshot hash, description, exact decimal quantity (up to six places), unit, provenance (`server_sor | human_confirmed`) and approved net GBP money. These are **supplied data**, not approval assertions established by the renderer. One extra/revision appears at most once within an artifact.

`stableBillingExportLineId` is a deterministic UUIDv8 derived from a domain-separated SHA-256 of contract and revision IDs. Tenant qualification and cross-batch uniqueness remain future database obligations. Rendering sorts by this identity, validates the total with bigint, freezes lines recursively, and returns canonical JSON, CSV text, UTF-8 byte length, and separate SHA-256 hashes of the JSON and CSV. JSON/CSV carry the same line IDs, exact net totals and sandbox label. CSV adds the batch total to each row:

```text
version,client_contract_id,export_line_id,job_id,extra_id,scope_item_id,revision_id,revision_hash,approval_binding_id,approval_snapshot_hash,description,quantity,unit,price_provenance,approved_net_pence,currency,batch_total_net_pence,sandbox_label
```

`verifyBillingExportArtifact` validates the frozen JSON form then recomputes IDs, totals, canonical bytes and hashes. It does not trust a supplied checksum alone. This is artifact consistency, not approval verification, persisted immutability or authority to deliver. Reconnection and concurrent export ownership require PostgreSQL integration, still unbuilt.

## Pure allocation and restricted recomputation

`billing-allocation.v1` wraps the existing `allocateReceiptToLines`. It takes one full represented invoice, exact receipt gross, effective instant, required complete outstanding balances for receipts, explicit shares, separate-invoice selection, and direction. Missing, null, incomplete, duplicate, unknown-line or invalid receipt balances refuse; original invoice amounts are never substituted. It retains ordinary lines in the denominator and uses each line's net/gross ratio. It does not group by extra or job before allocation. Reversal input instead requires null outstanding balances and only one original movement's remaining allocations, with valid ratios, nonnegative balances and zero ordinary-line contribution; supplied lines and bounds are checked. Repeated reversals consume remaining shares in the evaluator.

Each result contains exact `gross`, `net`, `matchedExtraNet` fractions and `explicit | separate_invoice | pro_rata` method. `matchedExtraNet` is only the net assigned to a structurally matched line; it is **not qualifying principal, a fee, settlement evidence or approval**. Original-order/other lines always have zero in that field. ENT-F2 unit fixtures expect extra gross `300000/31` and net `250000/31` pence; the required persisted reference-Q proof is not built.

`deriveUnambiguousBilling` is a narrow internal evaluator of one source/contract/invoice with one composition and distinct, established effective instants. It deduplicates exact event identities, conflicts changed content, and uses explicit reconciliation identity to combine paid observations across transport. It retains line billed/credited/paid totals, rejection flags, exact allocations and drill-down totals. Credits do not assert cash refunds. No fee or lifecycle fact is persisted. It can be rerun from all facts; no historical input is mutated.

Missing invoice/composition/original movement/line detail or reconciliation identity is reported in a pure `held` result. These are prerequisite descriptions, not durable quarantine records or human release authority. Same-time consequential inputs and competing invoice compositions raise `BILLING_POLICY_HELD`. This deliberately leaves Q5's admissibility, precedence and resolution policy unimplemented. It selects neither arrival order nor an event-ID ordering to decide money. Over-allocation fails rather than assigning money beyond balances; preserving/reconciling excess source facts remains the held writer's obligation.

Earlier line-existence instants determine deposit eligibility through SH-1, including sub-millisecond differences. Exhaustive permutations in the new unit fixtures cover payment-before-invoice, credit-before-source and reversal-before-payment arrival with established economic order. They do not prove persisted successor runs, audit/recorded-time retention, restart safety or the full E6-20 criterion.

## Fake adapters and errors

Three process-local adapters implement the existing `OutboundAdapter`/`FakeDeliveryResult` types: `fake_download`, `fake_sftp`, `fake_api`. Configuration strictly requires `synthetic_demo`; destinations are fictional `.invalid` hostnames, never endpoints or credentials. They validate the existing action representation and exact artifact/amount bindings, simulate success/retryable/interruption/unknown outcomes and provide separate reconciliation. Explicit provider-effect identity preserves one simulated effect; a changed binding conflicts. Unknown acceptance can reconcile to success without another effect. State disappears on process restart.

No socket, SDK, network request, durable outbox claim or authorization check is performed. The carried authorization expiry is not interpreted as a decided delivery lifetime. Preparing a fake result establishes neither downloaded receipt, remote delivery, invoicing nor payment. The adapters are not registered in the existing executor/worker. Durable handling and retry after confirmed nonacceptance remain H5.

`billing-delivery.v1` is a non-executable artifact/destination/channel intent. `billing-reconcile.v1` represents inspection intent only. Neither exposes a held command. Typed errors are `billing-error.v1` with `BILLING_INVALID`, `BILLING_CONFLICT`, `BILLING_POLICY_HELD`, `BILLING_PREREQUISITE_REQUIRED`; they contain no private input or database detail. HTTP mappings remain unbuilt with the held controllers.

## Holds and required integration

H1: founder export/import roles, commercial-manager grant scope and connector authority. The card at main line 958 and transition/permission contracts still disagree; no list is selected here. H2: false-positive candidate dismissal. H3: billing writes after a job stops being live. H4: causal ambiguity policy. H5: applicable delivery expiry/revocation policy. H6: all screens/browser journeys and full-card acceptance. H7: downstream statements, fee posting, invoices, live connectors, native/offline, production activation and all other excluded capabilities.

Q2 is a STOP: `packages/db/test/tenancy.integration.test.ts:190,438` still compares exact table/owner lists without ENT-6. The coordinator must authorize its own prerequisite, preserving all rows and checks. No table or migration is constructed around it. No approved-chain/candidate producer interface is available from the merged ENT-5 foundation. Existing `extra-repository.ts:158` passes an empty candidate set for origin ordering; ENT-6 does not reuse that as candidate completeness evidence.

Future writers must authenticate with the unchanged stamped bridge, recheck authority first inside checked routines, refuse all unauthorized resource cases identically, apply their own live guards before replay, retain first results and use existing receipt/outbox/audit foundations. Integrated locks must include the shared tenant/job advisory key with seed 417, deterministic job/group/member order and all parent/uniqueness/allocation/action locks before audit. ENT-5 must publish the actual compatible sequence; no competing lock discipline is implemented here. No GRANT or SECURITY DEFINER entrypoint is added.

Recovery is a forward fix preserving immutable source/artifact/allocation history. The Rule-9 upgrade contract remains required when migration 0160 is released:

> An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

That future proof must compare canonical `row_to_json(t)::text` for named existing columns and pre-existing primary-key identities, preserve names/full types, require nonempty specimens, fail rolled-back microsecond/retype controls, and pass nullable-column/function-replacement/later-insert controls. No migration proof is claimed now.
