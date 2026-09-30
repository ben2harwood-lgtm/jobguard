# Independent review round 2 — BUILD_PLAN rev 3.0 — FAIL

**Reviewer:** OpenAI Codex, independent plan reviewer  
**Model:** GPT-6 Astra  
**Date:** 30 September 2026  
**Scope:** Read-only verification of the 28 dispositions and additional consistency review. No files edited, application tests executed, implementation accepted, or policies approved.

**Reviewed snapshots:**

- `BUILD_PLAN.md`: `e6c0637bbed4002af30055bf7e1c9c60b2858e752fbddef5759eb32424833fa1`
- `AGENTS.md`: `ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1`

**Approval check:** D01–D16 each retain `Status: proposed` and `Dated approver evidence: None` at their respective files’ lines 3 and 6. `BUILD_PLAN.md:5,171,1704` explicitly deny commercial approval. No new approval is marked. The existing Node 24 “approved deviation” remains at `AGENTS.md:15,55`; therefore “nothing anywhere says approved” would be inaccurate.

| # | Round-1 finding | Status | Current evidence and assessment |
|---|---|---|---|
| 1 | Push authority and verdict terminology | partly | Founder-owned pushes and PASS/HOLD/FAIL are restored at `BUILD_PLAN.md:70–78,119,438`. The active delegation example still requires an `ACCEPT` verdict at line 78. |
| 2 | G0 incorrectly marked met | resolved | `BUILD_PLAN.md:157` expressly makes G0 pending; lines 2692–2700 retain foundation evidence and acceptance requirements. |
| 3 | Shadow-pilot measurement and charging prerequisites | resolved | G4-S restores D12, isolation, attribution, arithmetic and reviewed pilot evidence at `BUILD_PLAN.md:162`. M1-15S supplies measurement acceptance at lines 2713–2720 and has a §12 entry at line 3388. |
| 4 | Consumed-credit candidate allegedly outside adopted scope | resolved | **The disposition’s reason is valid.** On `claude/plan-rev24-adopt`, `BUILD_PLAN.md:2408–2409` expressly includes consumed credits; lines 2524–2527 retain D03 v3 as proposed. The adoption packet records Ben’s adoption at line 3 and preservation of commercial text at line 65. Current D03:3,6,13 retains that proposed candidate. This establishes adopted development scope, not production approval; contradictory cash-only contracts remain below. |
| 5 | Retired cap/credit contract applied to new jobs | resolved | `BUILD_PLAN.md:215,294,3491` applies v3 terms and confines cap/credit checks to historical v1 synthetic records. CH-1’s no-cap/no-obligation acceptance remains at lines 1932–1943. |
| 6 | Invoice issuance before Final Check completion | partly | The canonical requirement is fixed at `BUILD_PLAN.md:1504`. SV-4 still tests only a missing lock at line 1847; SV-5:1857–1871 does not explicitly establish or race-test the invoice completion guard. The schema note at line 2549 still mentions only the lock. |
| 7 | Attribution revisions and partial refunds | resolved | Remaining qualifying principal replaces the all-or-nothing refund predicate at `BUILD_PLAN.md:1539`. Lines 1888–1889 permit false-conjunct reassessments and proportional reductions/compensation; F3 remains £600/£60 at line 1664. |
| 8 | Blended-invoice allocation requires non-extra balances | partly | Complete composition and the PostgreSQL ENT-F2 assertion are restored at `BUILD_PLAN.md:627,942`. However, the import contract still identifies its line reference as `export_line_id` at line 626, without a representable identity for original-order/non-exported lines. |
| 9 | Negative SoR adjustment formula | resolved | `BUILD_PLAN.md:560` uses `1 + adjustment`, gives £96.50, and names the required edge tests. |
| 10 | Contractor aggregation/locking key | partly | `BUILD_PLAN.md:2988` correctly binds tenant plus `enterprise_agreement_version` and includes the two-contract rounding example. Its acceptance still says “job or contract version” at line 2991. |
| 11 | Accrual before approval and pilot charging escape | partly | Proposal-first posting and permanent no-charge pilot wording are fixed at `BUILD_PLAN.md:649–651,1160`. ENT-7:970–980 omits several expressly requested adversarial assertions, including direct pre-approval accrual and pilot refusal **with approved records**. |
| 12 | Post-export duplicate repair and races | partly | The required wording appears at `BUILD_PLAN.md:878`. It assigns paid/billed reconciliation and fee-compensation acceptance to ENT-4b, which precedes the export, billing and fee tasks it needs. The product command table still provides only ordinary `MarkDuplicate` at line 589. |
| 13 | Deleted live M2 contracts | partly | M2-1–M2-7 acceptance is restored at `BUILD_PLAN.md:2724–2807`. M2-1 retains ambiguous `M1-15` at line 2726 despite the explicit split at line 3257. M2-8’s card:2812 and §12 entry:3390 disagree about its benchmark prerequisite. |
| 14 | Shared allocation/schema ownership | partly | Pure ownership is fixed at `BUILD_PLAN.md:1759`; allocator ownership is fixed at lines 928,2378,2553. The contractor data model still names shared `receipt_line_allocation` at line 1189, and SV-2 still owns/repeats the origin backfill at lines 1782,2543. |
| 15 | Unbuildable cross-table origin CHECK | partly | SH-1 now specifies the same-row CHECK and qualified FK at `BUILD_PLAN.md:480`; ENT-2 depends on SH-1 at lines 709,752,3339. SH-1’s acceptance:483 does not explicitly cover forged `job_track`, missing binding, or changing an established job-track binding. |
| 16 | Nine missing prerequisite edges | resolved | The requested edges appear in cards at `BUILD_PLAN.md:887,1128,1895,2209,2838,2904,2914,2925,2945`; synthetic counterparts agree at lines 3354,3358,3367–3368. Additional prerequisite and reservation defects remain below. |
| 17 | Stripe dependency cycle | resolved | `BUILD_PLAN.md:3021` places M4-13 before collection; lines 2127,3010 place MON-2B and M4-12 downstream. The reported cycle is removed. |
| 18 | Track-move measurement and grandfathered terms | partly | `BUILD_PLAN.md:543,545,1381,2163` contains the correction. Line 1384 still ends original terms at lock/close, and D09:13 still uses calendar months for the proposed ten-day trigger. |
| 19 | Builder cap and next-job price | partly | Correct pricing and unblocked Builder behavior appear at `BUILD_PLAN.md:1329,1333,1416,2123`. CH-5:1986 and SB-18:2588 still prescribe generic refusal. Required distinct-job activation races and capacity display cases are absent from MON-1 acceptance. |
| 20 | Homeowner clients and distinct flats | partly | Unit-sensitive matching and confirmed reuse appear at `BUILD_PLAN.md:490,492,504`. Homeowner linkage is permitted at line 524 but expressly forbidden by CH-3b’s Build instruction at line 516. |
| 21 | Graph/table disagreements and retired ranges | resolved | Correct track edges appear at `BUILD_PLAN.md:707–709,1710,1713`; DEMO-S has surviving explicit prerequisites at line 2490; CH-3b points to §8 at line 3333. Group terminology is defined at line 3296. Static inspection found the 59-row synthetic graph acyclic, with correct printed phases and 44 unique numbered post-adoption migrations. |
| 22 | Fresh core/recovery convergence weakened | resolved | `BUILD_PLAN.md:2514–2515` restores fresh journeys, source-linked outcomes, both browser projects, and prohibition on seeding directly into the recovery end state. |
| 23 | Shared-file serialization and migration ownership | partly | Single editing ownership is restored at `BUILD_PLAN.md:87,3297`. Exact in-flight reservations exist at lines 3304–3310, but their numbering contradicts dependencies and mandatory migration-order merging. |
| 24 | Stale section references | partly | AGENTS references are corrected at `AGENTS.md:17,25,147,211`; decision Source fields largely move. Active policy bodies remain stale: D01:13,17; D03:13; D11:14; D12:13; D13:13. Two round-1 Source replacement targets also pointed to incorrect current sections. |
| 25 | Pure/non-code tasks forced to build UI/DB | partly | C1 and contractor fixture wording are corrected at `BUILD_PLAN.md:105,703`. C6:115 still requires each task to execute a new Playwright spec, and C7:117 still applies UI assertions to every task. |
| 26 | Contractor agreement acceptance and assurance overclaim | partly | Agreement/mandate acceptance is transferred at `BUILD_PLAN.md:1165`; §12.4 correctly distinguishes later assurance at line 3401. ENT-14 remains “Non-code” at line 722, and the mapping at line 1236 still presents M5-9/M5-12 contractor scope as ENT-10 delivery without the corrected limitation. |
| 27 | Release gates become construction prerequisites | partly | The general stage distinction is corrected at `BUILD_PLAN.md:3381`. “Gated before build” remains at lines 1730,1733,2616; current unqualified G4 references remain in line 2900 and decision gate fields. A native task-completion deadlock also survives below. |
| 28 | D16 reopens fee-on-invoice | resolved | D16:13 expressly excludes fee-on-invoice from this revision; line 17 now seeks evidence for the fixed payment basis. The plan’s corresponding future-activation wording still needs alignment below. |

**Additional round-2 findings — new defects and incomplete fix propagation**

1. **HIGH — The new migration ledger cannot obey its own merge rule.**

   **Evidence:** `BUILD_PLAN.md:85,3297,3304–3310,3324`; M4-7-S depends on M4-2-S-R at line 2347. Migration 0043 therefore waits for the repair reserved at 0048. Case allocation reserved at 0045 also waits for that repair at line 2369. Waiting a day and renumbering is not a valid initial schedule.

   **Replace this → With this:**

   | Exact current reservation | Replacement |
   |---|---|
   | M4-1-S-R: `0046 (recovery_case_current)` | `0043 (recovery_case_current)` |
   | M4-2-S-R: `0048 if needed` | `0044 if needed` |
   | M4-5-S: `0044 if needed` | `0045 if needed` |
   | M4-7-S: `0043 (practice_feed)` | `0046 (practice_feed)` |
   | M4-8-S case allocation: `0045` | `0048` |

   Keep M4-3-S-R at 0042, M4-6-S at 0047, and 0049 spare. Propagate reservations into unmerged migration filenames, branch/lane registrations and current inventory references before dispatch. Historical receipts retain their original facts; changed heads require fresh verdicts.

2. **HIGH — ENT-12 and M3-7 have a task-completion deadlock.**

   **Evidence:** ENT-12 cannot finish until M3-7 passes (`BUILD_PLAN.md:1116`); M3-7 cannot start until ENT-12 merges (`2888`, ready rule `3294`). Allowing construction before G3 does not remove this dependency on task completion.

   **Replace this → With this:**

   `G3: M3-7 passes for this app on physical devices, covering the flows below.`  
   → `ENT-12 implementation acceptance covers its native build, command, encryption, capture and authorization tests. After ENT-12 merges, M3-7 owns the complete physical-device journey and G3 evidence. Real-data native distribution remains disabled until that suite passes; the operative feature’s release acceptance includes both tasks.`

3. **HIGH — The valid consumed-credit candidate still contradicts cash-only engineering contracts.**

   **Evidence:** D03:13 and `BUILD_PLAN.md:1632,1676–1678,2018` permit realized credit consumption. `BUILD_PLAN.md:290,1922` excludes non-cash qualification, while `AGENTS.md:145,211` requires settled landing value/cash. The adoption packet explicitly states that adoption supplies no commercial approval (`claude/plan-rev24-adopt:BUILD_PLAN.md:2492`).

   **Replace this → With this:**

   - `The candidate policy excludes pending transactions and non-cash credits.`  
     → `Cash landing allocations exclude pending transactions and non-cash credits. D03 v3’s consumed-credit candidate uses a separately typed, immutable realized-credit allocation; it must never be represented as a cash receipt. Its positive production fee path remains disabled until a signed versioned amendment aligns AGENTS §5.6, this contract and the affected tests. Synthetic candidate fixtures remain permitted.`

   - `Only verified, settled, allocated, unreversed cash in a 10.3.3 category creates a positive liability.`  
     → `Cash categories require verified, settled, allocated, unreversed cash. The consumed-credit category remains production-disabled until its separate proof, allocation, consumption-reversal and authorization contract is approved and incorporated into both governing documents.`

   This preserves the adopted candidate without inventing an exception to AGENTS.

4. **HIGH — Final Check completion is fixed in prose but not carried into owning acceptance; the worker also needs an evidence-completeness barrier.**

   **Evidence:** `BUILD_PLAN.md:1504` requires completion, but SV-4:1847 and the data-model note:2549 require only a lock. Detection is asynchronous (`1804`); reconciliation compares held signals (`1512`), without requiring all pre-lock sources to have been processed. A completed run could otherwise precede delayed detection.

   **Replace this → With this:**

   - `A final invoice without a lock fails in the command, the routine and the UI. Deposit and interim invoices still work.`  
     → `A final or supplementary invoice without the lock or a completed reconciliation bound to that lock and cutoff fails in the command, controlled routine and UI. Race tests cover pending, failed and completing reconciliation. SV-4 introduces the fail-closed guard; SV-5 supplies the completion record. Deposit and interim invoices remain unaffected.`

   - `the post-lock reconciliation run, using only evidence received before the lock;`  
     → `the post-lock reconciliation run, bound to the lock and a frozen manifest of evidence received before it; completion requires processing every manifest source through detection and reconciliation, including a recorded zero-result. Pending or failed source processing prevents completion. Tests delay a pre-lock detector until after lock and prove invoice issue remains blocked.`

   - `Final and supplementary invoices need the lock`  
     → `Final and supplementary invoices need the lock and its completed, evidence-complete reconciliation run`

5. **HIGH — Several cards require acceptance supplied by later tasks.**

   **Evidence:** ENT-4b:878 requires billed/paid duplicate repair and fee compensation before ENT-6/ENT-7 exist. CH-5:1986 requires the meter owned by MON-1:2095. CH-8:2048–2054 requires attribution and settled catch traceability owned by SV-6.

   **Replace this → With this:**

   - ENT-4b’s sentence beginning `A separate authorized post-export duplicate-reconciliation command preserves issued artifacts and origin history`  
     → `ENT-4b supplies immutable duplicate lineage and pre-export integrity controls. ENT-6 owns unresolved-candidate export blocking and duplicate/export serialization tests. ENT-7 implements the authorized post-export reconciliation command and the billed-and-paid duplicate test, preserving artifacts and origins, issuing linked billing corrections, and compensating fees so the underlying work contributes once.`

   - CH-5: `Depends on: CH-1, CH-3a, SV-2`  
     → `Depends on: CH-1, CH-3a, SV-2, MON-1`

   - CH-8: `Depends on: SV-5, M4-3-S-R`  
     → `Depends on: SV-5, SV-6, M4-3-S-R`

   Apply the edges to track tables and §12. CH-5 and CH-8 become phase 7; reallocate their migrations after their prerequisites and regenerate the remaining reservation order. Do not add ENT-6/ENT-7 as dependencies of ENT-4b, which would create cycles.

6. **HIGH — The revised billing import still cannot identify non-exported invoice lines.**

   **Evidence:** `BUILD_PLAN.md:626` defines line reference as `export_line_id`; lines 627 and 942 now require original-order and other non-fee-bearing lines. Export lines themselves are restricted to extras at line 936.

   **Replace this → With this:**

   `line reference (export_line_id)`  
   → `a stable external_invoice_line_id for every invoice line, plus a nullable export_line_id required only for matching an exported extra; original-order and other non-extra lines retain their external identity and always contribute zero fee`

   `facts for unknown lines are quarantined;`  
   → `facts with unknown or incomplete invoice composition are quarantined; identified original-order and other non-extra lines are retained without an export-line match. PostgreSQL tests prove these lines remain in the allocation denominator and cannot become fee contributions.`

7. **HIGH — Shared schema ownership and origin-binding tests remain inconsistent.**

   **Evidence:** `BUILD_PLAN.md:928` assigns contractor allocation to ENT-6, but line 1189 still names the small-builder shared table. SH-1 owns backfill at line 480, while SV-2 repeats it at lines 1782 and 2543. The additional binding attacks requested in round 1 are absent from line 483.

   **Replace this → With this:**

   - Contractor data-model cell: `shared receipt_line_allocation`  
     → `contractor_receipt_line_allocation, owned by ENT-6 and importing SH-1’s pure rules`

   - SV-2: `a builder_logged backfill for existing variations.`  
     → `verification of SH-1’s completed builder_logged backfill; SV-2 performs no second backfill.`

   - SV-2 model note: `serialises with ENT-4b; backfills builder_logged`  
     → `serialises with ENT-4b; verifies SH-1’s backfill`

   - SH-1: `backfill is idempotent.`  
     → `backfill is idempotent. Direct runtime SQL with a forged job_track, a missing binding or a same-tenant wrong-job binding fails; attempts to change an established job-track binding fail. New activation/import routes establish the binding atomically.`

8. **HIGH — Contractor fee authorization acceptance still omits the requested attacks; the live race key remains ambiguous.**

   **Evidence:** Posting semantics are corrected at `BUILD_PLAN.md:649`, but ENT-7:970–980 does not require direct accrual refusal before approval, stale-input refusal, revoked authority, or unconditional pilot refusal after decision approval. M4-9:2991 retains the ambiguous key.

   **Replace this → With this:**

   - `refused for a non-finance role, a different hash or total, or an expired authorisation;`  
     → `controlled accrual is refused before exact statement approval and for non-finance, mismatched hash/total/agreement version, changed input facts, disputed lines, or expired/revoked authority. These refusals are tested through commands and direct runtime SQL.`

   - `posting and collection are refused in pilot_no_charge and production_billing while D16 or D02 is proposed;`  
     → `pilot_no_charge refuses accrual and collection even with approved decision records and otherwise valid statement authority. Production refuses them until the applicable gate and exact policy versions are approved; tests use isolated fixtures and mark no repository decision approved.`

   - `Two cases or two paid extras racing on the same job or contract version`  
     → `Two small-builder cases racing on the same job, or two contractor extras on different client contracts racing under the same tenant and enterprise_agreement_version`

9. **HIGH — Grandfathering and Builder refusal contradictions survived in secondary instructions.**

   **Evidence:** `BUILD_PLAN.md:545` preserves the complete lifecycle, but line 1384 ends terms at lock/close. D09:13 mixes billing periods with calendar months. CH-5:1986 and SB-18:2588 do not restrict refusal to Solo.

   **Replace this → With this:**

   - `Jobs already live at the move keep small-builder terms until they are locked or closed, including the Final Check and the success fee.`  
     → `Jobs already live at the move keep their original small-builder terms throughout their remaining lifecycle, including Final Check, later invoices, settlement, fee derivation, reversals and refunds. Lock or close never changes those terms.`

   - D09: `two of the last three calendar months`  
     → `two of the last three monthly billing periods, using the proposed measurement rule pending founder confirmation`

   - CH-5: `an import at the cap, which gets the grace place and then PLAN_LIMIT_REACHED;`  
     → `Solo imports receive the grace place and then PLAN_LIMIT_REACHED; Builder imports remain unblocked, preserve the monthly maximum, and raise track_review_due beyond the grace place;`

   - SB-18: `Grace place, then refusal; 7-day tail; linked job; same start rule`  
     → `Solo grace place, then refusal; Builder remains unblocked within its monthly maximum and raises track review; 7-day tail; linked job; same start rule`

   - MON-1: `A mutated cached count cannot change a bill: periods recompute from events, and any mismatch raises an alert.`  
     → `A mutated cached count cannot change a bill: periods recompute from events, and any mismatch raises an alert. Tests cover included, paid-extra and grace-capacity displays, plus two distinct jobs concurrently activating at Solo’s limit under tenant-level capacity locking.`

10. **HIGH — Restored M2 cards and §12 still disagree about dispatch prerequisites.**

    **Evidence:** `BUILD_PLAN.md:2726` references M1-15 without distinguishing its merged technical part (`389`) from outstanding M1-15T (`2704`). M2-8:2812 consumes the old synthetic corpus, while §12.4:3390 waits for restored M2-5. M2-5:2782 expressly requires separately reported end-to-end results.

    **Replace this → With this:**

    - M2-1: `Depends on: M1-15.`  
      → `Depends on: M1-15T; the merged technical M1-15 slice is reused and does not substitute for the outstanding human trial.`

    - M2-8: `Depends on: M2-7-S (merged) and the frozen M2-3-S held-out corpus.`  
      → `Depends on: M2-5 and M2-7-S (merged). Reuse the frozen synthetic corpus as earlier evidence; enhancement acceptance uses M2-5’s restored benchmark, including separately reported end-to-end extraction/matching results.`

    - Mapping row: `Depends on M2-7-S and the frozen M2-3-S corpus instead of live M2-7. Text unchanged.`  
      → `Depends on M2-5 and merged M2-7-S; the restored benchmark precedes any enhancement. Live M2-7 is not an additional technical dependency.`

11. **MEDIUM — Homeowner acceptance contradicts the schema Build instruction.**

    **Evidence:** `BUILD_PLAN.md:516` excludes `person`; line 524 permits a homeowner client.

    **Replace this → With this:**

    `Link each ENT-1 client organisation to exactly one CH-3a customer record of an organisation type (not person), so both tracks answer "who is billed" from one registry.`  
    → `Link each ENT-1 client to exactly one CH-3a customer record: homeowner clients use person; organisation-only clients use the corresponding non-person type. Both tracks use this registry to answer who is billed, with tenant/client-contract-qualified relationships.`

12. **HIGH — Active decision references still point to removed sections.**

    **Evidence:** D01:13,17; D03:13; D11:14; D12:13; D13:13. The history qualifiers do not cover these active policy paragraphs. The round-1 suggested Source targets for D02 and D05 were themselves inaccurate and also need correction.

    **Replace this → With this:**

    | Location | Exact old reference | Replacement |
    |---|---|---|
    | D01:13,17 | `BUILD_PLAN §14.9` | `BUILD_PLAN §10.3.1` |
    | D01:17 | `§14.2` | `BUILD_PLAN §10.2.1` |
    | D03:13 | `BUILD_PLAN §15.3 CH-7` | `BUILD_PLAN §10.4 CH-7` |
    | D11:14 | `BUILD_PLAN §15.1` | `BUILD_PLAN §14.2` |
    | D12:13 | `BUILD_PLAN §16` | `BUILD_PLAN §9.1.12` |
    | D13:13 | `BUILD_PLAN §16` | `BUILD_PLAN §9.1.10` |
    | D02:8 | `§§4, 5.3, 5.5 and 11.5` | `§§4, 5.4 and 11.5` |
    | D05:8 | `§§4, 5.4 and M4-13` | `§§4, 5.3 and M4-13` |

13. **MEDIUM — C6/C7 still override the new pure/non-code exemption.**

    **Evidence:** `BUILD_PLAN.md:105` exempts pure/non-code tasks, but lines 86,115,117 require a web spec and UI assertions without qualification.

    **Replace this → With this:**

    - `Each task executes its new Playwright spec in BOTH existing projects:`  
      → `Each task changing a web workflow executes its new Playwright spec in BOTH existing projects; expressly pure-core and non-code tasks provide the applicable evidence specified in C1 and preserve existing regressions:`

    - `C7 — UI assertions for every task.`  
      → `C7 — UI assertions for tasks changing web workflows.`

    - Lane entry: `e2e spec apps/web/e2e/<ID>.spec.ts`  
      → `applicable e2e spec apps/web/e2e/<ID>.spec.ts, or a recorded C1 reason why the task introduces no web workflow`

14. **MEDIUM — Assurance scope and agreement implementation are still misstated elsewhere.**

    **Evidence:** `BUILD_PLAN.md:722` labels ENT-14 non-code despite its agreement/mandate tests at line 1165. Line 1236’s mapping overstates assurance delivery relative to line 3401. The sales promise at line 3422 assigns “security certifications” to ENT-10, whose acceptance promises only honest claims, not achieved certification.

    **Replace this → With this:**

    - ENT-14 mode: `Non-code; solicitor and founder`  
      → `Contract/review evidence plus the versioned agreement/mandate record and gate tests; solicitor and founder approval remain separate`

    - Mapping destination for `M5-7 (whole), M5-9 and M5-12 (contractor scope first)`: `ENT-10`  
      → `ENT-10 carries full M5-7 acceptance and early audit-export/security-pack subsets only. M5-9 long-term verification/key rotation and M5-12 independent assurance remain outstanding under their cards.`

    - Sales promise: `Single sign-on, roles, security certifications | ENT-10 | To build`  
      → `Single sign-on, roles and a security evidence pack | ENT-10 | To build; certification claims require achieved assessment evidence under M5-12`

15. **MEDIUM — Stage wording and decision gate names remain inconsistent with the corrected release model.**

    **Evidence:** `BUILD_PLAN.md:1730,1733,2616,2900`; D01–D05, D09–D16 executable gate fields still use unqualified G4, although §3 defines only G4-C/G4-S.

    **Replace this → With this:**

    - MON-6: `Gated before build`  
      → `Synthetic construction after its task prerequisites; real payments require the named approvals and G4-S`

    - MON-9: `Later; gated before build`  
      → `Separately issued later work; synthetic preparation may precede release approval, while the stated pilot-data and professional prerequisites govern offering the service`

    - `MON-6 gated before build`  
      → `MON-6 synthetic construction allowed after its task prerequisites; live use gated`

    - `Core G4 can be reviewed after M4-17`  
      → `The applicable core track gate, G4-C or G4-S, can be reviewed after M4-17`

    - Decision gate fields’ `G4`  
      → `G4-S` for small-builder effects; `G4-C` for D16 enterprise fee effects; `the applicable track gate (G4-C or G4-S)` for genuinely shared effects.

    Preserve G1/G3/G5 and capability-specific approvals; no gate is passed by this wording correction.

16. **MEDIUM — The plan still suggests this revision can activate fee-on-invoice by defining a trigger.**

    **Evidence:** D16:13 now excludes that basis, but `BUILD_PLAN.md:633` says it is refused only until D16 defines the trigger.

    **Replace this → With this:**

    `on_payment default; on_invoice_with_true_up recorded but refused until D16 defines the trigger`  
    → `on_payment only in this revision; any historical or imported on_invoice_with_true_up value is rejected. A future invoice basis requires a separately issued, versioned policy amendment and corresponding changes to both governing documents and tests.`

17. **MEDIUM — Active delegation wording retains the retired verdict term.**

    **Evidence:** `BUILD_PLAN.md:78`, contrary to lines 70 and 119.

    **Replace this → With this:**

    `recorded ACCEPT verdict, separate acceptance recorded`  
    → `recorded PASS verdict bound to the exact head, separate technical acceptance recorded`

    Historical `ACCEPT` quotations in §7 may retain their original wording when explicitly labelled historical.

**Items for founder decision**

1. **D09 measurement:** Confirm the proposed ten-busy-day threshold, monthly billing-period measurement, and notice period. Align the candidate first; this review confirms no commercial approval.
2. **D16 terms:** Confirm origin-time versus settlement-time agreement binding, the approved-value ceiling, and any negotiated formula for minimums or bands. Fee-on-invoice remains outside this revision.
3. **Consumed supplier credits:** The candidate belongs to the adopted development scope. Decide whether to retain it in the eventual approved policy; retention requires a separate non-cash proof/allocation contract and a signed amendment aligning AGENTS, BUILD_PLAN and tests.
4. **Remote authority:** Retain founder-owned pushes/PR opening/merge, or record a dated, bounded delegation. This review delegates nothing.
5. **Policy and release approvals:** D01–D16 remain proposed. Exact-version commercial, tax, privacy, security and professional approvals, plus gate evidence, remain outstanding. Rev 3.0 should not be adopted for dispatch until the high-severity contradictions and dependency defects above are corrected and independently rechecked.