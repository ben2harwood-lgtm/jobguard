# BUILD_PLAN rev 3.0 — disposition of independent review round 1

**Review:** `docs/review/PLAN_REV30_ASTRA_VERDICT_R1_2026-09-30.md` (GPT-6 Astra via the bundled Codex engine, read-only) — **FAIL**, 28 findings.
**Author of the fixes:** Claude (who also authored rev 3.0, so cannot judge them; a second independent round is required).

| # | Finding | Disposition |
|---|---|---|
| 1 | Checker given push authority; verdict terms | Applied as written (Ben pushes and opens PRs unless delegated in writing; PASS/HOLD/FAIL) |
| 2 | G0 marked met | Applied as written |
| 3 | Shadow-pilot measurement and G4-S prerequisites lost | Applied: G4-S text; mapping row; new card M1-15S (§11.2) and §12.4 entry |
| 4 | Consumed supplier credit notes earn fees | **Not applied.** The founder adopted rev 2.4 on 26 September including D03 v3, whose candidate makes supplier credit notes qualifying once consumed against a later invoice paid in full (minimum £250). The review prompt summarised the supplier category as "cash refunds" and omitted this, which produced the finding. D03 v3 stays `proposed`; the founder can remove credit notes by a new D03 version. |
| 5 | Canonical contracts still describe cap/credit for new jobs | Applied as written |
| 6 | Invoice could issue before the Final Check completes | Applied: lock plus a completed bound reconciliation run required before final/supplementary invoice issue |
| 7 | Attribution revision and partial refunds | Applied as written |
| 8 | Contractor blended-invoice allocation needs non-extra lines | Applied, including the ENT-F2 PostgreSQL test |
| 9 | Schedule-of-rates adjustment formula | Applied: × (1 + signed adjustment), with the £96.50 example and edge tests |
| 10 | Contractor aggregation key | Applied: tenant + `enterprise_agreement_version` locks; 5p + 5p → 1p |
| 11 | Accrual before statement approval; pilot escape clause | Applied as written |
| 12 | Duplicates after export | Applied: authorised post-export duplicate reconciliation, export blocked by unresolved candidates, race tests |
| 13 | Live M2 contracts deleted | Applied: M2-1 … M2-7 live-remainder cards restored verbatim in §11.3 with track lines; restored M2-5 gate in M2-8; §12.4 entries |
| 14 | Competing ownership of the allocation module and tables | Applied: SH-1 owns the pure module; M4-8-S owns `receipt_line_allocation`; ENT-6 owns `contractor_receipt_line_allocation` |
| 15 | Origin/track CHECK not buildable | Applied: SH-1 creates the immutable job-track binding; ENT-2 depends on SH-1 |
| 16 | Missing dependency edges | Applied to cards, track tables and §12 (ENT-5, ENT-13a, SV-7A, MON-5, M3-2, M4-1, M4-2, M4-3, M4-5); phases and migrations recomputed |
| 17 | Stripe dependency cycle | Applied: M4-13 depends on MON-2A, M4-10; M4-12 on M4-10, M4-13, ENT-14, MON-2B |
| 18 | Three definitions of the track move; original terms ended early | Applied: billing periods under the approved D09 rule; original terms for the whole remaining lifecycle; immediate review at Builder's grace place. The ten-busy-day threshold remains a proposed parameter awaiting the founder |
| 19 | Builder cap contradictions | Applied as written |
| 20 | Party and site schema | Applied as written |
| 21 | Graph/table disagreements; retired ranges | Applied; aggregate names defined as groups; CH-3b pointer §8 |
| 22 | Fresh end-to-end journeys weakened | Applied as written |
| 23 | Shared-file serialization; migration ownership | Applied: one active editing owner; reservation ledger in §12.2; native tasks take a global number only if needed |
| 24 | Stale section references in AGENTS and decision records | Applied; history paragraphs qualified as referring to archived revisions |
| 25 | Inherited criteria forced UI/DB on pure or non-code tasks | Applied as written |
| 26 | Contractor agreement acceptance; ENT-10 overstated | Applied as written |
| 27 | Gates described as prerequisites to building their evidence | Applied as written; G4 references made track-specific |
| 28 | D16 reopened fee-on-invoice | Applied as written |

**Founder decisions raised (not text fixes):** D09 measurement (ten busy days, billing periods, notice period); D16 agreement-version binding (raised-time vs paid-time) and whether the fee base is capped at the approved value; delegation of branch pushes and PR opening (merging stays with Ben regardless).
