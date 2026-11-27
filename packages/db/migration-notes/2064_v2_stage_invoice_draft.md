# 2064 · V2 stage invoice drafts (K5B-1)

V2-only: the same `DO $v2$` fence as 2046 (database name, practice firm policy), and it returns early when
`app.v2_payment_stage_due` is absent. The checked V2 bootstrap applies 2064 after 2046, so in a plain numeric run it
is a no-op. Practice tenant only. Running it twice changes nothing.

- `app.v2_stage_invoice_draft`: one draft of a deposit or stage invoice, numbered 1, 2, … per stage. The FK to
  `v2_payment_stage_due` means no draft exists without a frozen stage. An AFTER INSERT guard requires the copied
  `amount_pence` and `counted_approval_ids` to equal the frozen row, the next draft number, and no earlier live draft.
- `app.v2_stage_invoice_draft_withdrawal`: one withdrawal per draft, with a reason. A withdrawn draft lets the next one in.
- Both append-only (`reject_immutable_authorization_record`), RLS enabled and forced, runtime policy tenant plus job
  EXISTS (2046's pattern), `SELECT, INSERT` for runtime. No SECURITY DEFINER function.

A draft is a V2 record only. Nothing here touches `customer_invoice`, the ledger, the final account or fees, and
nothing is numbered, posted or sent. Issuing a stage invoice (VAT, numbering, send) is K5B-2.
