# Q07 · V2-E3: stock position (forecast vs on site)

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (new table). Migration **2014**. Astra: yes. Rework risk: **high** (D3 is in review).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-e3.
**Starts:** now. **Base:** D3's branch `claude/project-thread-8zze8p` (#912). Draft PR against it. Merge D3 again when it moves. Do not edit D3's files; read its enquiry lines and stock set aside.

> **Ben's decision, 25 Nov 08:13 UK ("I agree on all"), from the #932 finding in handoff comment 7153703390.** If a line's **product or pack size** changes, that clears the line's delivered stock **and** its set-aside packs. Both follow the same rule.
> - The old receipts keep their history against the old product. They stop counting as stock for the new product, which starts at 0 available.
> - The builder can re-confirm the same count for the new product with one deliberate action. That action is audited and never automatic.
> - Changes that leave product and pack size alone (notes, quantity or delivery date) keep all stock.
> - Tests: tiles changed to oak with 6 needed and 4 tile packs received shows **0 available, 6 short**; a notes-only edit keeps 4; re-confirming after the change shows 4; set-aside packs behave the same way.
> - Built in **PR #937**. This packet's earlier lines about keying deliveries to the editable line are superseded.

## Dry-check against the code (planner, 25 Nov 00:10 UK)
**Verified, with decisions made.**
- **Delivery key:** key each delivery to D3's material line `(job_id, scope_item_id, line_key)` (`app.v2_material_line`, 2006). The set-aside packs come from D3's repository (`setAsidePacks`, a whole-number string).
- **Goods receipt:** don't reuse main's `goodsReceiptV1`, because it needs a supplier document from the fixture intake. Keep the delivery table separate; the reason is now recorded here.
- **Migration path:** `packages/db/migrations/2014_...sql`.

## Screen files and mounts (planner, 25 Nov 00:25 UK; copy this wording verbatim into the builder's brief)
**No mount is allowed.** E3 adds no screen: it is data, commands and the read API only, with no file under `apps/web/app/(designed)/`. Showing stock is a later screen piece. This overrides any other line in this packet or brief about editing screen files.

## Goal
A delivery date is only a forecast. Only a confirmed delivery or goods receipt puts stock on site.

## Scope
- Table of deliveries: job, enquiry line (from D3), supplier, packs expected, forecast date, status (forecast, confirmed date, delivered), packs received, received by and when. Commands: add forecast, confirm date, record receipt (partial allowed). Each with expected version, replay identity and one audit event.
- Stock position per product = usable packs already set aside (D3) + packs received; forecasts never count.
- Reuse the existing goods-receipt record on main's base (`supplier-documents/receipts`, M2-2-S) if it fits; if it can't be used without editing it, keep this table separate and say why.
- No order is placed; no message to the merchant (that is e7's delivery chase later).

## Done when
- Plan example: one usable pack on site and three of five ordered packs received shows **four of six available, two short**.
- A forecast date alone adds nothing on site. Replay, stale version, second-firm and audit tests per the rules. CI green apart from Vercel.
