# Q07 · V2-E3: stock position (forecast vs on site)

Tier: **RED** (new table). Migration **2014**. Astra: yes. Rework risk: **high** (D3 is in review).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-e3.
**Starts:** now. **Base:** D3's branch `claude/project-thread-8zze8p` (#912). Draft PR against it. Merge D3 again when it moves. Do not edit D3's files; read its enquiry lines and stock set aside.

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
