# Connector and billing expected outcomes v1 (EP-D2)

Made-up data only (`synthetic_demo`). This is the answer sheet every future connector adapter is judged against (enterprise plan D2, needed by D3–D5). Each answer was worked by hand from the contracts listed below, not by running the code. Fixtures: `docs/fixtures/connector-expected-outcomes-v1.json`. Test: `apps/api/src/contractor/connector-expected-outcomes.test.ts`.

Sources: `work-order-import-v1.md`, `contractor-billing-v1.md` (`billing-export.v1`, `billing-status.v1`), `contractor-billing-persistence-v1.md`, `connector-billing-status-v1.md`, `connector-export-delivery-v1.md`, `docs/operations/connector-*.md`, `BUILD_PLAN.md` §§9.1.3, 9.1.8, 9.1.9 and `AGENTS.md` §5.4.

Where a stored result can only be reached through PostgreSQL (receipts, revision counts, replay, staged connector receipts), the test lists it as skipped "not run here" so D3 runs it. Those answers are still binding.

## Shared made-up facts

- Schedule of rates: `PLB01` £45.00 each, `ELE02` £33.33 per metre; tendered adjustment −35/1000 (multiplier 0.965). Line net = quantity × rate × 0.965, rounded half-even once at the line.
- Work order `FICT-WO-100`. Rev 1: L1 `PLB01` × 2, L2 `ELE02` × 1.5.
- One approved extra, £240.00 net (A = 24,000p), one export line.
- Invoice INV-1 (VAT 20%): ORD-1 original order £1,000 net / £200 VAT / £1,200 gross; EXT-1 the extra £240 / £48 / £288. Total £1,240 / £248 / £1,488. Both lines exist from 2 Nov 09:00; invoiced 2 Nov 10:00.
- Fee: `enterprise_site_capture_policy_v1`, rate 10/100, on payment. Per extra: Q = max(0, min(A, I − C, D)); F = half-even(Q × 10/100) on the cumulative exact Q; posting delta = F − prior F.

## Cases

**EO-01 Same work-order delivery repeated.** Inputs: rev 1, then rev 1 again. L1 = 2 × 4,500 × 0.965 = 8,685p. L2 = 1.5 × 3,333 × 0.965 = 4,824.5175 → 4,825p. Order £135.10. Stored: first `created`, second `unchanged` (receipt only, no audit event); still one revision with the same revision and scope IDs. The same file again after a clean import is replayed from the stored batch and writes nothing.

**EO-02 Same order key, changed payload.** Inputs: rev 1, then rev 2 (expected revision 1; L1 quantity 3). L1 = 3 × 4,500 × 0.965 = 13,027.5 → half-even tie → 13,028p; L2 stays 4,825p. Order £178.53. Both lines keep their scope IDs (matched by client line reference); only L1 is in the diff. Stored: `revised`, revision 2 appended, revision 1 untouched. The same import command ID with a different file is `COMMAND_CONFLICT`. For billing events the same key with a changed payload is EO-13.

**EO-03 A revision arrives before the one it replaces.** Rev 3 (expected revision 2; L2 quantity 2) arrives while current is 1, then rev 2, then rev 3 again, then rev 2 late. Outcomes: `STALE_REVISION` (nothing written, still 1); `revised` (2); `revised` (3); `STALE_REVISION` (still 3). Rev 3 prices L1 13,028p, L2 2 × 3,333 × 0.965 = 6,432.69 → 6,433p; order £194.61. Arrival order never rolls an order back. A connector-staged revision pair stays two separate staged facts.

**EO-04 Cancellation after an extra has been logged.** Inputs: rev 1; a site operative logs a £240 extra on the job; a cancelling row (expected revision 1). Stored: revision 2 with status `cancelled`, keeping rev 1's lines and scope IDs; the job stays `live`; the extra keeps its ID, site origin and amount; nothing is deleted. A cancellation for an unknown order is `ORDER_NOT_FOUND`. The format has no delete: an order missing from a later file is unchanged. **Open for a person:** no contract says whether an extra on a cancelled order can still be exported and billed (the import contract leaves cancellation's meaning to ENT-3 "and later"). This sheet does not invent that rule.

**EO-05 Approved-extras export delivered twice.** Rendering the same approved input twice gives byte-identical JSON and CSV, the same hashes, one line, total £240.00. Delivering the same action twice under one provider effect key gives the same `succeeded` result and one simulated effect. The same effect key with a different recipient is `BILLING_CONFLICT` and still one effect.

**EO-06 Export delivery outcome unknown.** Sequence: deliver, deliver again, reconcile, deliver again. Provider actually accepted: `outcome_unknown`, `outcome_unknown`, reconcile `succeeded`, then `succeeded`; one effect. Provider can't tell: `outcome_unknown`, `outcome_unknown`, `unknown`, `outcome_unknown`; no new effect. Provider didn't accept: `outcome_unknown`, `outcome_unknown`, `not_found`, `outcome_unknown`. A second delivery never resends; only a durable reconciliation showing safe non-delivery, with authority still current, may allow a retry (stored path, held).

**EO-07 Invoice status before the export is acknowledged.** Inputs: INV-1, then the partner's `export_delivery` `received` acknowledgement. INV-1 is taken as it stands: EXT-1 billed £240, invoice billed £1,240, paid £0, fee base £0, nothing held, fee £0. The acknowledgement parses with exactly its six fields, a money field is refused, and it stores as `staged` with `domainEffects: 0`: it changes no billing figure in either order.

**EO-08 Part payment, then the balance.** Inputs: INV-1; £500.00 paid 5 Nov, unallocated; £988.00 paid 9 Nov. Pro rata by outstanding gross over the whole invoice: EXT-1 gets 50,000 × 28,800 / 148,800 = 300,000/31 ≈ 9,677.42p gross, net × 5/6 = 250,000/31 ≈ 8,064.52p; ORD-1 gets 1,250,000/31 gross; total net paid 125,000/3. Q = 250,000/31; F = half-even(806.45…) = 806p; post +£8.06. After the balance: EXT-1 paid £240 net, ORD-1 £1,000 net, total gross £1,488; Q = 24,000; F = 2,400p; post +£15.94 (matches BUILD_PLAN ENT-F2).

**EO-09 Credit after payment.** INV-1 paid £1,488 in full (F £24.00), then £50 net (£60 gross) credited on EXT-1. C = 5,000; D stays 24,000 (a credit is not a refund). Q = min(24,000, 19,000, 24,000) = 19,000; F = 1,900p; post −£5.00.

**EO-10 Payment reversal.** INV-1 paid in full (F £24.00), then that payment reversed. Paid gross £0 on every line; Q = 0; F = 0; post −£24.00.

**EO-11 Billing rejection.** INV-1, then the client rejects the EXT-1 line (£240 / £48 / £288). EXT-1 is marked rejected; credited £0; paid £0; Q = 0; F = 0; no posting. The connector path cannot link a rejected fact (`BILLING_COMPOSITION_REQUIRED`).

**EO-12 Mixed invoice.** INV-2: ORD-1 £1,000 order, EXT-1 £240 extra, OTH-1 £50 other (£60 gross); total £1,290 / £258 / £1,548, paid in full. Net paid £1,290. Fee-base contribution: ORD-1 0, EXT-1 £240, OTH-1 0. Q = 24,000; F = £24.00. The £1,050 of non-extra net never counts.

**EO-13 Same billing event key twice.** INV-1, the full payment, the same payment again (identical): the result equals receiving it once. The same `(source, event ID)` with gross £1,487 instead of £1,488 is `BILLING_CONFLICT`; the first stored result is kept (stored path).

## Disagreements with the current code

None found in the cases the test runs. EO-04's billing question is an open policy gap, not a disagreement.
