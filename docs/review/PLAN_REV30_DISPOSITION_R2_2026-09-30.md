# BUILD_PLAN rev 3.0 — disposition of independent review round 2

**Review:** `docs/review/PLAN_REV30_ASTRA_VERDICT_R2_2026-09-30.md` — **FAIL**: round-1 findings 2, 3, 4 (reason accepted), 5, 7, 9, 16, 17, 21, 22, 28 resolved; the rest partly resolved; 17 further findings with exact replacement text.

All 17 round-2 findings were applied as written, including the partly-resolved round-1 items they cover:

| # | Applied |
|---|---|
| 1 | In-flight migration ledger reordered to follow dependencies (M4-3-S-R 0042, M4-1-S-R 0043, M4-2-S-R 0044, M4-5-S 0045, M4-7-S 0046, M4-6-S 0047, M4-8-S case allocation 0048, 0049 spare); branches must rename before dispatch |
| 2 | ENT-12 / M3-7 deadlock removed |
| 3 | Consumed-credit candidate kept as D03 v3 (valid adopted scope) but typed as a separate non-cash realized-credit allocation and production-disabled until a signed amendment aligns AGENTS §5.6, the contract and tests |
| 4 | Final Check completion carried into SV-4/SV-5 acceptance with a frozen evidence manifest and a delayed-detector test |
| 5 | Duplicate repair split across ENT-4b / ENT-6 / ENT-7 (`ReconcileExportedDuplicate`); CH-5 depends on MON-1; CH-8 on SV-6; §12 regenerated |
| 6 | Stable `external_invoice_line_id` for every invoice line |
| 7 | Contractor allocation table named and owned by ENT-6; SV-2 verifies SH-1's backfill; job-track binding attacks tested in SH-1 |
| 8 | ENT-7 accrual refusals and unconditional pilot refusal; M4-9 race key |
| 9 | Grandfathered terms for the whole lifecycle; D09 billing periods; Solo-only refusal in CH-5 and SB-18; MON-1 capacity display and concurrent-activation tests |
| 10 | M2-1 depends on M1-15T; M2-8 on M2-5 and M2-7-S; mapping aligned |
| 11 | CH-3b allows homeowner (`person`) clients |
| 12 | Active decision-record references corrected (D01, D02, D03, D05, D11, D12, D13) |
| 13 | C6/C7 and lane wording apply only to tasks changing web workflows |
| 14 | ENT-14 mode; ENT-10 assurance mapping; sales promise limited to a security evidence pack |
| 15 | MON-6/MON-9 stage wording; track-specific G4 in the plan and every decision gate field |
| 16 | Fee-on-invoice rejected in this revision |
| 17 | Delegation wording uses PASS bound to the exact head |

**Founder decisions still open (not text fixes):** D09 measurement (ten busy days, billing periods, notice period); D16 agreement-version binding and approved-value ceiling; whether consumed supplier credits stay in the eventual approved policy (and, if so, a signed non-cash amendment); remote push/PR authority (retain or delegate in writing).
