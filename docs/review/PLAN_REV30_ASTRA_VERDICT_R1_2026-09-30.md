# Independent review — BUILD_PLAN rev 3.0 — FAIL

**Reviewer:** OpenAI Codex, independent plan reviewer  
**Model:** GPT-6 Astra  
**Review date:** 30 September 2026  
**Scope:** Read-only plan review. No files edited, application tests run, commercial decisions approved, or implementation accepted.

**Read:** The whole current `BUILD_PLAN.md` and `AGENTS.md`; D01–D16; archived BUILD_PLAN rev 2.5; the adopted rev 2.4 plan, adoption packet and independent verdict on `claude/plan-rev24-adopt`; the R01–R12 replacement packet; and the rev 2.2 comparison for retained contracts and acceptance requirements.

**Reviewed working-tree snapshots:**

- `BUILD_PLAN.md` SHA-256: `68facb9bbc0cbed72d131c776cdc885575bc1d59c8362ae50e51d3e6b9aafeab`
- `AGENTS.md` SHA-256: `59720af6400ad6979786e742519cbc10558e4d4b17ea00b8f6c6efa26646c4bb`

The written §12.3 synthetic graph is acyclic and its numbered migrations are unique, outside reserved 0042–0049. The two-track structure, withdrawn subscription tiers, proposed decision statuses, and most inherited safeguards survive. Nevertheless, conflicting commercial instructions, missing contracts, authorization gaps and dependencies make this revision unsuitable for adoption.

1. **HIGH — The checker receives push authority without written delegation; verdict terminology also conflicts.**

    **Evidence:** `BUILD_PLAN.md:70–78,119,438`; `AGENTS.md:203`. R09 retained founder-owned push/merge/release, but the new role table expressly tells Claude to push branches.

    **Replace this → With this:**

    - `Starts each ready task; pushes the branch and opens the PR with the receipt;`
      → `Dispatches ready tasks within the founder-authorized scope after adoption; prepares the branch and PR receipt for Ben to push and open the PR, unless a dated written delegation expressly authorizes those actions;`
    - `Push to main, merge, release and deploy;`
      → `All remote pushes, merge, release and deploy;`
    - `ACCEPT, REVISE, HOLD or FAIL`
      → `PASS, HOLD or FAIL; requested revisions accompany HOLD or FAIL`
    - `Until a repair merges and receives ACCEPT`
      → `Until a repair has a recorded PASS verdict against its exact head, separate technical acceptance, and founder-authorized merge`

2. **HIGH — G0 is marked met despite missing foundation work and acceptance evidence.**

    **Evidence:** `BUILD_PLAN.md:157,433,437,2691–2699`. M0-13 is explicitly unbuilt, retrospective acceptance remains outstanding, and M0-13d must still assemble G0 evidence.

    **Replace this → With this:**

    `Feature rollout (met)`  
    → `Feature rollout; status pending until the required foundation evidence and separate technical acceptance are recorded. Existing synthetic construction is not evidence that G0 has passed.`

3. **HIGH — The consolidation loses explicit shadow-pilot measurements and charging-gate requirements.**

    **Evidence:** `docs/archive/BUILD_PLAN.rev2.5.md:2304–2310`; `BUILD_PLAN.md:162,2605,2703–2710`. The mapping claims preservation, but the current gate omits D12 and does not explicitly require proven isolation, lock/attribution integrity, independently checked arithmetic or reviewed pilot evidence. The two-builder usability trial does not replace the longitudinal fairness measurement.

    **Replace this → With this:**

    `D01, D02, D03, D05, D09, D11 and D13 approved;`  
    → `The applicable exact versions of D01, D02, D03, D05, D09, D11, D12 and D13 approved; success-fee activation additionally requires proven final-account lock, shadow isolation and attribution integrity, production settlement and reversal/refund evidence, independently checked cumulative fee arithmetic, reviewed customer terms and reviewed no-charge pilot evidence;`

    Replace the mapping row at `BUILD_PLAN.md:2605` with:

    `| §14.17 pilot measurement, §14.18 G4 additions, §14.19 order | §3 retains the charging prerequisites. A separately issued shadow-pilot extension to M1-15T measures builder captures, signals remaining at lock, false positives, confirmed and recovered amounts, disputed attribution, perceived fairness, harm from withholding, missed must-surface events, source usefulness, and hypothetical subscription/success fees against demonstrated value. It requires accepted shadow implementation, G1 and approved D12/D13 pilot scope; it never charges. §12 controls order. |`

    The extension needs its own card and §12 entry before dispatch.

4. **HIGH — Active non-cash fee eligibility contradicts the fixed cash-refund decision.**

    **Evidence:** `BUILD_PLAN.md:31,290,1283,1631,1675–1677,2017,2024–2026,2550`; `docs/decisions/d03-eligible-recovery-reversals.md:13`. Consumed supplier credits earn positive fees even though the fixed scope names supplier **cash refunds**.

    **Replace this → With this:**

    - `supplier cash refunds and consumed credit notes;`
      → `supplier cash refunds; supplier credit notes remain fee-free, including when consumed;`
    - `| merchant_overcharge, applied credit note | The credit is consumed against a later supplier invoice paid in full, with at least £250 consumed in the case | Credit net consumed | Unconsumed credit; an invoice not yet paid in full; less than £250 |`
      → `| merchant_overcharge, applied credit note | Never qualifying under this revision | £0 | Applied and unapplied supplier credits remain fee-free |`
      
      Apply this replacement to the corresponding row with its existing code formatting.
    - `**supplier_credit_consumption,** linking a credit note to a later invoice and its settled payment, with the £250 case minimum.`
      → `**Supplier-credit tracking,** linking credits to later invoices for the builder's accounting; consumption never creates qualifying principal or a JobGuard fee.`

    F14–F16 must all assert `Q £0`, `F £0`, no posting, with reason **“Supplier credits are fee-free”**. Align D03’s active candidate and the data-model notes in the same amendment. This implements the fixed decision; it does not require reopening it.

5. **HIGH — The canonical contracts still instruct new jobs to use the retired cap/credit model.**

    **Evidence:** `BUILD_PLAN.md:215,294,339,3407,3410–3411`; compare `BUILD_PLAN.md:1609,1686,2892–2899` and `AGENTS.md:147`.

    **Replace this → With this:**

    - `At switch-live, baseline_quote_version_id, accepted_net_value_pence, fee-policy version, and recovery_cap_pence are fixed atomically. Approved variations do not increase that cap under the candidate policy.`
      → `At switch-live, the accepted baseline, accepted net value, immutable job activation terms, commercial track and applicable policy versions are bound atomically. New small-builder jobs use reference_fee_policy_v3 without a recovery cap or plan credit. Cap snapshots remain only for existing v1 synthetic records and their regression tests.`
    - `cumulative remaining cap/credit`
      → `the cumulative entitlement and prior net postings under the bound policy; cap/credit checks apply only to historical v1 synthetic records`
    - `These scenarios supplement every task’s own assertions.`
      → `These scenarios supplement every task’s own assertions. Rows mentioning £79, recovery caps or plan credits apply only to historical v1 synthetic regression data; new v3 and contractor work uses its track-specific acceptance rows.`

6. **HIGH — A lock permits invoice issuance before the asynchronous Final Check finishes.**

    **Evidence:** `BUILD_PLAN.md:1503,1511,1837,1846,1856`; `AGENTS.md:210`. A lock alone cannot guarantee “the final check always precedes the invoice.”

    **Replace this → With this:**

    `The final customer invoice requires the lock. It derives from the locked revision, or from a later revision linked to the lock.`  
    → `Final and supplementary customer invoices require the immutable lock and a completed reconciliation run bound to that lock and its pre-lock evidence cutoff. The run must be completed and its result made available before invoice issue. Pending or failed reconciliation blocks issue with a typed error. Invoices derive from the locked revision or a later revision linked to it; deposit and interim invoices remain unaffected.`

    Replace SV-4’s invoice assertion with:

    `A final or supplementary invoice without the lock or completed bound reconciliation fails in the command, controlled routine and UI. Race tests cover invoice issue against pending, failed and completing reconciliation. SV-4 introduces the fail-closed guard; SV-5 supplies and tests the completion record.`

7. **HIGH — Attribution cannot represent disqualification, and the all-or-nothing predicate contradicts partial-refund fixtures.**

    **Evidence:** `BUILD_PLAN.md:1538,1663,1887–1888`. “No revision while any conjunct is false” prevents recording the required invalidation revision. “Not refunded or credited” can disqualify an entire £800 catch after a £200 refund, whereas F3 requires £600 qualifying.

    **Replace this → With this:**

    - `AND not_reversed_refunded_or_credited`
      → `AND qualifying_allocated_principal_remains_after_item_specific_reversals_refunds_and_credits`
    - `No revision is created while any conjunct is false.`
      → `Every assessment and reassessment may create an immutable attribution revision recording true and false conjuncts with their sources. No positive qualifying allocation or fee posting is authorized unless every required conjunct holds for the remaining qualifying principal.`
    - `A reversal, refund, credit or evidence invalidation creates a new revision and a recomputation, never an edit.`
      → `A reversal, refund, credit or evidence invalidation creates a new revision and recomputation, never an edit; partial changes reduce qualifying principal, while complete disqualification yields zero and linked compensation.`

8. **HIGH — Contractor blended-invoice allocation needs facts the import contract forbids.**

    **Evidence:** `BUILD_PLAN.md:627–628,658,926–948`. ENT-F2 needs the £1,000 original-order balance in its denominator, but imported facts may attach only to exported extra lines.

    **Replace this → With this:**

    `A fact attaches only to an exported line of the same tenant and client contract; unmatched facts are quarantined.`  
    → `Invoice and payment imports retain the complete relevant invoice-line balances, including original-order and other non-fee-bearing lines, under the same tenant and client contract. Only eligible exported extra lines can contribute to the contractor fee. Unknown or incomplete invoice composition is quarantined for review; it cannot default to allocation wholly onto extras.`

    Replace ENT-6’s matching assertion:

    `facts attach only to exported lines;`  
    → `invoice and payment facts retain all lines needed for allocation; extra-line fee contributions require a valid exported-line match, while non-extra lines affect allocation only and always contribute zero fee;`

    Add a PostgreSQL ENT-F2 test proving Q is £80.645161… rather than £416.666… or £240.

9. **HIGH — The SoR pricing formula produces negative prices for the plan’s own adjustment example.**

    **Evidence:** `BUILD_PLAN.md:553,560`. Multiplying by adjustment `−35/1000` gives a negative amount, rather than a 3.5% reduction.

    **Replace this → With this:**

    `quantity × the sor_version rate in force on the order's issue date × the contract adjustment`  
    → `quantity × the sor_version rate in force on the order's issue date × (1 + the signed tendered adjustment), using exact rational arithmetic`

    Add:

    `For a £100 rate and adjustment −35/1000, quantity 1 produces £96.50 before VAT. Zero and positive adjustments, fractional quantities, half-even ties, overflow and an invalid negative resulting multiplier are tested.`

10. **HIGH — Shared live fee derivation changes the contractor aggregation and locking key.**

    **Evidence:** `BUILD_PLAN.md:633,642–649,2892,2895`. The contractor contract aggregates by tenant and **enterprise agreement version**; M4-9 instead says “contract version,” which can be read as the client contract version.

    **Replace this → With this:**

    `per contractor and contract version) — with per-job or per-contract-version locks`  
    → `per tenant and enterprise_agreement_version) — with per-job locks for small-builder fees and per-tenant enterprise_agreement_version locks for contractor fees`

    Add:

    `Two extras on different client contracts but the same enterprise agreement version share one cumulative rounding and posting lock. Two 5p qualifying contributions produce a cumulative 1p fee, not two separately rounded zero fees.`

11. **HIGH — Contractor accrual precedes exact statement authorization, and pilot charging has an escape clause.**

    **Evidence:** `BUILD_PLAN.md:649–651,959–978,1159`; `AGENTS.md:115–123,181–183`. Approval of the contractor’s customer billing does not authorize a JobGuard fee posting.

    **Replace this → With this:**

    - `A positive delta posts an accrual in a separate platform_enterprise_fee book;`
      → `A positive delta first creates a non-posting proposal. Only exact statement approval authorizes accrual in platform_enterprise_fee; the controlled routine rechecks the bound hash, amount, agreement version, input facts, current authority and expiry under lock before posting;`
    - `statements say "Illustration — no charge" unless approved pilot terms and G4-C say otherwise.`
      → `statements always say "Illustration — no charge" in pilot_no_charge, and that mode never accrues or collects JobGuard fees. Paid activation requires a separately authorized production activation and cannot retroactively bill pilot jobs.`
    - `the pilot fee (default none).`
      → `no JobGuard pilot fee; any later paid production agreement is separate.`

    ENT-7 must test direct accrual before approval, stale facts after approval, disputed lines, expired/revoked authorization and pilot mode even with approved decision records.

12. **HIGH — Duplicate handling has no permitted repair after export and lacks a duplicate/export race test.**

    **Evidence:** `BUILD_PLAN.md:612,625,877,931–935`; `AGENTS.md:227`. Two site entries can both export before their duplicate relationship is resolved; subsequent linking is expressly forbidden.

    **Replace this → With this:**

    `duplicate links cannot chain, cycle or be added after export;`  
    → `duplicate links cannot chain or cycle. Ordinary duplicate resolution precedes export. A separate authorized post-export duplicate-reconciliation command preserves issued artifacts and origin history, records the group lineage, produces required billing corrections, and recomputes fees through linked compensation so the underlying work contributes once;`

    Add:

    `Known unresolved duplicate candidates block export until resolved. MarkDuplicate and export serialize on the job/group and member locks in the declared lock order. Tests cover two exports racing duplicate resolution and a duplicate discovered after both lines were billed and paid; net fee entitlement counts the work once.`

13. **HIGH — Pending live M2 contracts were deleted rather than consolidated.**

    **Evidence:** `docs/archive/BUILD_PLAN.rev2.5.md:736–821`; `BUILD_PLAN.md:433,2712–2724,3288`. The current file has no M2-1–M2-7 cards, yet MON-7 still depends on live M2-6 and M2-8 requires M2-5 targets.

    **Required structural repair:** Restore explicit remaining-work cards for M2-1–M2-7 and named §12.4 entries. Preserve the archived acceptance for approved intake/OCR routes, citation and total reconciliation, frozen held-out sets, ambiguity, corrected-match history, readiness/DST/provider failures, mandatory inbox lanes and feedback.

    **Replace this → With this:**

    `Any enabled enhancement meets M2-5's end-to-end targets without worsening mandatory critical cases;`  
    → `Any enabled enhancement meets the restored M2-5 gate: actionable-discrepancy false-discovery proportion ≤5%, recall ≥90% for labelled discrepancies of at least £25 net, non-empty predictions, frozen held-out labels, separately reported confirmed-fact and end-to-end extraction/matching results, and all deterministic critical fixtures;`

    A generic “live M2 adapters” row cannot replace seven acceptance contracts.

14. **HIGH — R02’s sound SH-1 refinement is undermined by competing ownership instructions.**

    **Evidence:** `BUILD_PLAN.md:479–484,1609,1754–1758,1778–1781,927,2375–2378,2552`. SH-1 owns the pure kernel, but SV-1 still tells whichever track merges first to create it. Both contractor and small-builder cards name a shared persisted allocation table without one schema owner.

    **Replace this → With this:**

    - `Whichever of the two merges first creates it; the other imports it, and they serialise on that file.`
      → `SH-1 creates and owns the pure module. SV-1 and ENT-4a import it and add track-specific tests; neither implements a second allocation or rounding kernel.`
    - `receipt_line_allocation rows (10.3.2), using SV-1's pure rules and SV-2's persistence;`
      → `receipt_line_allocation rows (10.3.2), created and owned by M4-8-S using SH-1's pure rules; SV-2 owns shadow persistence, not this allocator table;`
    - ENT-6’s `shared receipt_line_allocation`
      → `contractor_receipt_line_allocation, owned by ENT-6 and using SH-1's shared pure allocation rules`

    Align both data-model tables. SH-1 performs the existing-origin backfill once; SV-2 verifies it rather than independently repeating it.

15. **HIGH — The origin/track CHECK is not buildable as specified without an earlier job-track schema.**

    **Evidence:** `BUILD_PLAN.md:480,542,545,596,749,3228–3240`; `AGENTS.md:149`. An ordinary CHECK cannot inspect another table’s job track. SH-1 runs before ENT-1/CH-1/ENT-2 bind track terms, and ENT-2 does not explicitly depend on SH-1.

    **Replace this → With this:**

    `one CHECK tying each value to the job's track`  
    → `a same-row CHECK over origin kind and a server-written immutable job_track value, with a tenant/job/track-qualified foreign key to the job's immutable commercial-track binding; SH-1 creates this shared binding schema and safely backfills existing synthetic jobs, while activation/import routines bind new jobs`

    Replace ENT-2’s dependencies:

    `ENT-1, CH-2, CH-3b`  
    → `ENT-1, SH-1, CH-2, CH-3b`

    Test direct SQL with a forged track, cross-job binding, missing binding, and attempts to change a bound track.

16. **HIGH — Several task bodies consume unmerged prerequisites absent from their dependency lines.**

    **Evidence:** `BUILD_PLAN.md:886–892,1127–1132,1894–1902,2208–2227,2742–2743,2808,2818,2829,2849`; §12 rows at `BUILD_PLAN.md:3232,3236,3254,3256`.

    **Replace this → With this:**

    | Card | Replace this dependency | With this dependency |
    |---|---|---|
    | ENT-5 | `ENT-3` | `ENT-3, M4-3-S-R` |
    | ENT-13a | `ENT-2, ENT-6` | `ENT-2, ENT-6, ENT-8a` |
    | SV-7A | `SV-3` | `SV-3, CH-4` |
    | MON-5 | `CH-3a` | `CH-3a, SV-7A` |
    | M3-2 | `M3-1` | `M3-1, M0-6L` |
    | M4-1 | `M4-1-S (merged; HOLD repair pending), M1-13` | `M4-1-S-R, M1-13` |
    | M4-2 | `M4-1, M4-2-S (merged; HOLD repair pending)` | `M4-1, M4-2-S-R` |
    | M4-3 | `M4-3-S (merged; FAIL repair pending)` | `M4-3-S-R` |
    | M4-5 | `M4-4, M4-5-S` | `M4-4, M4-5-S, CH-7` |

    Propagate these edges into track tables and §12. Recompute phases and migration reservations: adding MON-5’s real dependencies while retaining migration 0059 would contradict mandatory migration-order merging.

17. **HIGH — The live Stripe path contains a dependency cycle.**

    **Evidence:** `BUILD_PLAN.md:2126,2914,2925`.

    Current edges are:

    `MON-2B → M4-13 → M4-12 → MON-2B` when Stripe is enabled.

    **Replace this → With this:**

    M4-13:  
    `Depends on: M4-12, MON-2 (synthetic stage)`  
    → `Depends on: MON-2A, M4-10. This task establishes the approved terms/mandate contract consumed by MON-2B and M4-12; it does not depend on execution of collection.`

    M4-12:  
    `M4-10; MON-2 (live stage) wherever the Stripe rail is enabled.`  
    → `M4-10; M4-13 for small-builder agreement authority; ENT-14 for contractor agreement authority; MON-2B wherever the shared Stripe adapter is enabled.`

    This resolves the cycle without allowing collections before terms approval.

18. **HIGH — Track migration uses three incompatible definitions and prematurely ends original job terms.**

    **Evidence:** `BUILD_PLAN.md:36–37,543–545,1276,1380–1383,2162`; `docs/decisions/d09-plan-tiers-metering.md:13`; `docs/decisions/d16-enterprise-commercial-terms.md:15`.

    The alternatives are monthly billing periods, calendar months, and at least ten busy days. The 13–17-place fixture waits until month two even though crossing Builder’s grace place triggers immediate review.

    **Replace this → With this:**

    - `in any 2 of 3 consecutive calendar months`
      → `in any 2 of 3 consecutive monthly billing periods, using the explicitly approved D09 measurement rule`
    - `until lock or close`
      → `through their remaining lifecycle, including later invoices, settlement, fee derivation, reversals and refunds; lock or close never substitutes new commercial terms`
    - `The 13–17-place profile raises track_review_due in its second month.`
      → `The 13–17-place profile raises track_review_due immediately on crossing Builder's grace place; the sustained-use trigger is tested separately against the approved billing-period rule.`

    The ten-day measurement is an additional policy candidate requiring a founder decision, not a consolidation detail.

19. **MEDIUM — Builder cap behaviour and the next-job price contradict their own contract.**

    **Evidence:** `BUILD_PLAN.md:1328,1332,1415,2122`. Builder is both never blocked and “refused at the cap.” A Builder account using five of seven included places is told the sixth costs £20.

    **Replace this → With this:**

    - `the grace place, and Builder being refused at the cap;`
      → `Solo's grace place and refusal beyond it; Builder remains unblocked, its monthly maximum holds, and crossing its grace place raises track_review_due;`
    - `5 of 7 jobs on the go; next job +£20 a month`
      → `5 of 7 jobs on the go; next job included`
    - `await V('next-job-price','Next job +£20 a month');`
      → `await V('next-job-price','Next job included');`

    Add distinct display tests at included capacity, paid-extra capacity and grace capacity. Add concurrent distinct-job activation tests at Solo’s limit; same-command replay tests alone do not prove tenant-level capacity locking.

20. **MEDIUM — Party and site schemas exclude supported homeowners and can collapse separate flats.**

    **Evidence:** `BUILD_PLAN.md:55,490–492,504,516,524,553`.

    **Replace this → With this:**

    - `a customer record of type person cannot be linked as a client organisation.`
      → `a person customer may be linked as a homeowner client; organisation-only clients must use their corresponding non-person customer type. Tenant and client-contract bindings remain enforced by composite keys.`
    - `a deterministic site match key from the normalised postcode and first address line`
      → `a deterministic site match key including normalized postcode, premises address and unit/flat identifier, using a validated UPRN where available`
    - `create a site, which returns the existing site identity when the match key already exists in the tenant`
      → `create a site; a matching key proposes the existing identity, but reuse requires explicit confirmation and an ambiguous or different unit creates a separate identity`

21. **MEDIUM — The graph and track tables disagree, and ranged task names resurrect retired leaves.**

    **Evidence:** `BUILD_PLAN.md:707,1709,1712,1741,2489,3233,3235,3238,3277`.

    **Replace this → With this:**

    - `| ENT-1, ENT-4a | none | Synthetic now |`
      → `| ENT-1 | ADOPT | Synthetic now |` followed by `| ENT-4a | SH-1 | Synthetic now |`
    - `| SV-1 | Adoption | Synthetic |`
      → `| SV-1 | SH-1 | Synthetic |`
    - `| SV-4 | SV-2, UIWIRE-9 | Synthetic |`
      → `| SV-4 | SV-2, UIWIRE-9, UIWIRE-10 | Synthetic |`
    - `every synthetic card above`
      → `the explicit DEMO-S prerequisite list; exclude all live-gated cards and retired task IDs`
    - `M4-5-S–M4-17-S`
      → `M4-5-S, M4-6-S, M4-7-S, M4-8-S, M4-9-S, M4-10-S, M4-12-S, M4-17-S`
    - CH-3b’s §12 card pointer `§9`
      → `§8`

    Add: `§12.3 displays outstanding-task edges; task cards also name merged prerequisites. Aggregate names such as ENT-8 and ENT-13 denote groups, never dispatchable tasks.`

    **R01–R12 assessment:** R03–R08 survive; R02 is deliberately refined by SH-1 but needs finding 14 resolved. R09 regresses through push authority. R10/R11 are replaced by a valid printed phase graph, but actual consumed dependencies are incomplete. R12’s convergence survives structurally but its task ranges and acceptance are weakened.

22. **MEDIUM — R12 loses the explicit fresh end-to-end core/recovery convergence assertions.**

    **Evidence:** `docs/archive/BUILD_PLAN.rev2.5.md:2036–2043`; `BUILD_PLAN.md:2491–2528`. Current acceptance strongly specifies `shadow-30000`, but reduces the other two journeys to a core description and recovery end counters.

    **Replace this → With this:**

    `core-1000 runs as a small job, with no cap and no obligation.`  
    → `core-1000 runs from fresh capture through the five-line cited confirmation, quote, acceptance, switch-live, approved extras, verified proof, final account, completed Final Check, £1,320 customer invoice/payment/reversal/correction and source-linked value screens in both browser projects. New v3 work creates no v1 cap or activation obligation; historical v1 regression tests remain.`

    Append to the recovery end-state assertion:

    `Reach these figures through the complete fresh recovery-18800 journey: confirmed £18,800 baseline, send/accept/start/proof, £22,560 customer invoice, materials checks, two builder-opened cases, eligibility, evidence pack, exact approved pursuit, settled fake receipts, landing allocations, approved v3 statement, simulated collection, reversal, refund and reconciliation. Do not seed directly into the asserted end state.`

23. **MEDIUM — Shared-file serialization and migration ownership are weaker than the adopted controls.**

    **Evidence:** `BUILD_PLAN.md:85,87–88,119,352,3201,3220–3229`; `AGENTS.md:25`.

    Post-merge rebasing is not serialization. The reserved pool does not allocate each in-flight migration owner. M3-1 receives a global SQL number despite being a device/contract risk slice, potentially blocking contractor migrations on physical-device evidence.

    **Replace this → With this:**

    `Shared registration files (...) are touched append-only; after each merge the checker asks conflicting open PRs to rebase and regenerate OpenAPI.`  
    → `Shared registration files, controlled routines and shared schema changes have one active editing owner at a time. Independent preparation may proceed, but conflicting edits serialize before commits. After integration, affected branches rebase and regenerate OpenAPI. The receipt names each overlap and its owner.`

    Append to migration allocation:

    `Before dispatch, the reservation ledger assigns each exact migration number to one task and branch, including 0042–0049. It distinguishes M4-8-S's permitted in-flight case allocation from its post-adoption allocator extension. Native local migrations use their own version namespace; M3-1 receives a global PostgreSQL migration only if its scoped server change requires one.`

24. **HIGH — Active section references in AGENTS and decision records do not resolve.**

    **Evidence:** `AGENTS.md:17,25,147,211`; decision-record source fields at `docs/decisions/d01…d09:8`, `d12…d16:8`, plus current-policy references in D03, D11–D13. Rev 3.0 has no §§14–16 or §§3.1–3.6.

    **Replace this → With this:**

    | Location | Replace this | With this |
    |---|---|---|
    | AGENTS current contractor description | `BUILD_PLAN.md §16` | `BUILD_PLAN.md §9` |
    | AGENTS execution reference | `BUILD_PLAN.md §"Execution model"` | `BUILD_PLAN.md §§2.2 and 12` |
    | AGENTS attribution reference | `BUILD_PLAN.md §14.6` | `BUILD_PLAN.md §10.2.8` |
    | AGENTS fee reference | `BUILD_PLAN.md §14.6–14.9` | `BUILD_PLAN.md §§10.2.8 and 10.3.1–10.3.3` |
    | D01 source | `BUILD_PLAN.md §§2, 14.1, 14.9` | `BUILD_PLAN.md §§4, 10.1.2, 10.3.1` |
    | D02 source | `BUILD_PLAN.md §§2, 3.4, 3.6` | `BUILD_PLAN.md §§4, 5.3, 5.5 and 11.5` |
    | D03 source | `BUILD_PLAN.md §§2, 3.6, 14.6–14.8` | `BUILD_PLAN.md §§4, 5.5, 10.2.8 and 10.3.2–10.3.3` |
    | D04 source | `BUILD_PLAN.md §§2, 5.11 and Appendix C` | `BUILD_PLAN.md §4 and Appendix C; AGENTS.md §5.11` |
    | D05 source | `BUILD_PLAN.md §§2, 3.3` | `BUILD_PLAN.md §§4, 5.4 and M4-13` |
    | D06 source | `BUILD_PLAN.md §§2, 3.1, 3.4` | `BUILD_PLAN.md §§4, 5.1, 5.4 and M4-18–M4-22` |
    | D07 source | `BUILD_PLAN.md §§2, 5.7, 5.8, 5.11` | `BUILD_PLAN.md §§4 and 11.1; AGENTS.md §§5.7, 5.8 and 5.11` |
    | D08 source | `BUILD_PLAN.md §§2, 5.12` | `BUILD_PLAN.md §§4 and 11.4; AGENTS.md §5.12` |
    | D09 source | `BUILD_PLAN.md §§2, 14.1, 14.13` | `BUILD_PLAN.md §§4 and 10.1; MON-1 and MON-2` |
    | D12 source | `BUILD_PLAN.md §2, §14.11` | `BUILD_PLAN.md §§4, 9.1.12 and 10.2.10` |
    | D13 source | `BUILD_PLAN.md §§14.2–14.6, 14.10–14.11` | `BUILD_PLAN.md §10.2` |
    | D14/D15 active source | `BUILD_PLAN.md §15.1` | `BUILD_PLAN.md §4 and §10.1.10` |
    | D16 source | `BUILD_PLAN.md §§16.2, 16.4, 16.5, 16.10` | `BUILD_PLAN.md §§9.1.5–9.1.9 and 9.1.13; ENT-14` |

    Qualify references inside previous-candidate/history paragraphs with the actual archived revision, rather than rewriting their historical meaning. D11’s superseded M1-16 reference should point to CH-6.

25. **MEDIUM — Inherited acceptance requires UI/database features for expressly pure or non-code tasks.**

    **Evidence:** `BUILD_PLAN.md:105,115–117,827–855,1747,2706,2730–2738`; `AGENTS.md:45`. ENT-4a and SV-1 are pure; M1-15T and ENT-14 include human/professional work. C1/C6/C7 otherwise require every task to create persistence, Next UI and a new Playwright spec.

    **Replace this → With this:**

    `Each task ships its versioned Zod commands/queries, application service, real PostgreSQL persistence or authoritative query, Next UI, accessible loading/error/empty/success states, and tests together.`  
    → `Each application feature ships its applicable versioned boundaries, services, authoritative persistence/projections, UI states and tests together. Expressly pure-core tasks add domain/schema/property tests and preserve regressions without inventing UI or persistence. Documentation, human-observation, professional-review and native-only tasks state their applicable evidence; web browser assertions apply where web workflows change. Exemptions never make an existing mandatory suite optional.`

    Also replace the assertion that every contractor card uses ENT-11a fixtures:

    `Tests use the fictional contractor from ENT-11a, with .invalid recipients.`  
    → `Each card generates minimal fictional fixtures through the commands available at its dependencies; ENT-11a later assembles the complete contractor fixture. All recipients use .invalid.`

26. **MEDIUM — Contractor agreement acceptance is promised but not transferred; ENT-10 is overstated as completing later assurance.**

    **Evidence:** `BUILD_PLAN.md:1157–1168,2927–2928,3108–3117,3140–3146,3176,3299`.

    **Replace this → With this:**

    ENT-14’s legal-review assertion:

    `A solicitor has reviewed the contract set.`  
    → `A solicitor has reviewed the contract set. Contractor fee collection additionally requires a human-approved agreement/mandate record bound to exact terms and agreement version. Tests cover changed rates or scope requiring the approved notice/reauthorization process, revocation/cancellation, provider-side cancellation, in-flight and unknown outcomes, retries, refunds and pilot exemption. Workers cannot invent agreement changes or authority.`

    Later-work row:

    `M5-7, M5-9, M5-12 are delivered early as ENT-10`  
    → `ENT-10 carries the full stated M5-7 acceptance and early contractor audit-export/security-pack subsets only. M5-9's signed long-term verification and key-rotation acceptance, and M5-12's independent assurance programme, remain outstanding under their own cards.`

27. **MEDIUM — Live gates are described as prerequisites to starting the work that supplies their evidence.**

    **Evidence:** `BUILD_PLAN.md:165,2630,2804,3281,3290,3294,3297`; compare M3-7 and M4-23 gate-evidence cards. This can turn release gates into construction deadlocks.

    **Replace this → With this:**

    `Each of these needs a founder decision, a gate, a provider or a professional opinion before it starts.`  
    → `These tasks are not dispatched automatically. Their deterministic implementation, synthetic tests and authorized provider-sandbox stages may be issued before release-gate completion. Real providers, spending, real data, operational reliance, distribution and charging require the applicable founder authority and gates before that stage executes. A task producing gate evidence does not require that same gate to have already passed.`

    Replace unqualified current `G4` references with `G4-S`, `G4-C`, or **the applicable track gate**, retaining independent capability and payment-rail activation.

28. **MEDIUM — D16’s active wording reopens fee-on-invoice despite the fixed approved/billed/paid rule.**

    **Evidence:** `docs/decisions/d16-enterprise-commercial-terms.md:13,17`; `BUILD_PLAN.md:633`. The plan correctly refuses an undefined invoice basis, but the active decision still says a contract may use it and lists the default basis as open.

    **Replace this → With this:**

    - `a contract may agree fee on invoice with true-up instead.`
      → `This revision permits fees only on approved, billed and paid amounts; fee-on-invoice with true-up is outside its authorized scope and remains disabled.`
    - `fee on payment versus on invoice by default;`
      → `implementation and contractual evidence for the fixed fee-on-payment rule;`

    Do not treat future negotiation language as authority to depart from the fixed default.

**Items requiring a founder decision rather than a text fix**

- **D09 measurement:** Confirm the proposed ten-busy-day threshold, billing-period measurement, and notice period. Keep the fixed seven-job line; do not silently substitute calendar months.
- **D16 version binding and approved-value ceiling:** Confirm the explicitly labelled reference choices at `BUILD_PLAN.md:633,640` and D16:17—origin-time versus settlement-time agreement binding, and treatment of billed amounts above approved value. Pending choices remain synthetic reference policies.
- **Outstanding approvals and release evidence:** D01–D16 remain proposed. Required commercial, tax, privacy, security and professional approvals must be recorded for their exact versions. This review supplies none.

No founder decision is needed to restore founder-owned push authority, cash-only supplier-refund eligibility, the paid-amount contractor rule, or the missing engineering safeguards.