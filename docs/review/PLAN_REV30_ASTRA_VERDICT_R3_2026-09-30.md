# Independent review round 3 — BUILD_PLAN rev 3.0 — PASS WITH FIXES

**Reviewer:** OpenAI Codex, independent plan reviewer  
**Model:** GPT-6 Astra  
**Date:** 30 September 2026  
**Scope:** Read-only plan review. No files edited, application tests executed, implementation accepted or policies approved.

**Reviewed snapshots:** `BUILD_PLAN.md` SHA-256 `4127141f4e72097ef3d53d165d8ca0dc830c62a163cd29a99d6efc7a315ca897`; `AGENTS.md` SHA-256 `ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1`.

No HIGH-severity blocker remains in the reviewed fixes. Four residual wording and acceptance inconsistencies prevent an unconditional PASS; correct them before dispatching the affected tasks. “Resolved” below means implemented in the specification, not verified in application code.

| Round-2 finding | Related partly resolved round-1 finding | Status | Current file:line evidence |
|---|---|---|---|
| 1. Migration ledger | R1-23 | Resolved in plan | `BUILD_PLAN.md:3307–3316` orders 0042–0048 by prerequisites and expressly requires branch filenames and registrations to follow before dispatch, with fresh verdicts for changed heads. |
| 2. ENT-12/M3-7 deadlock | R1-27 | Resolved | `BUILD_PLAN.md:1118–1119,2891–2896` separates ENT-12 implementation acceptance from subsequent physical-device release evidence. |
| 3. Consumed-credit/cash conflict | — | Resolved | `BUILD_PLAN.md:290,1925` requires a separate realized-credit allocation and keeps its production fee path disabled pending an amendment to both governing documents and tests. `AGENTS.md:145,211` retains the cash safeguards. |
| 4. Final Check completion and evidence barrier | R1-6 | Resolved | `BUILD_PLAN.md:1507,1850,1860,2552` requires bound, evidence-complete reconciliation; delayed detection, pending/failed processing and invoice races are explicitly covered. |
| 5. Acceptance requiring later tasks | R1-12 | Resolved | `BUILD_PLAN.md:614,879,933,968` assigns duplicate integrity, export races and paid duplicate repair to ENT-4b, ENT-6 and ENT-7 respectively. CH-5/CH-8 dependencies agree across cards, track table and graph at `1723,1726,1974,2040,3365,3367`. |
| 6. Non-exported invoice-line identity | R1-8 | Partly resolved | `BUILD_PLAN.md:627–629,944–945` correctly retains external identities and the complete allocation denominator. The contradictory matrix row at `1209` survives; remaining finding 1. |
| 7. Schema ownership, backfill and binding attacks | R1-14, R1-15 | Partly resolved | Contractor allocation ownership agrees at `BUILD_PLAN.md:929,1192`; binding attacks are explicit at `483`; SV-2 verifies rather than repeats the backfill at `1785,2546`. SH-1 now incorrectly describes verification of its own already-completed backfill at `480`; remaining finding 2. |
| 8. Fee authorization attacks and race key | R1-10, R1-11 | Resolved | `BUILD_PLAN.md:650,978,982,2991,2994` covers pre-approval accrual, stale facts, disputed lines, revoked authority, unconditional pilot refusal and tenant/agreement-version locking across client contracts. |
| 9. Grandfathering and Builder refusal | R1-18, R1-19 | Resolved | `BUILD_PLAN.md:545,1387,1989,2124,2591` preserves lifecycle terms, restricts refusal to Solo and adds capacity displays/concurrent activations. `docs/decisions/d09-plan-tiers-metering.md:13` uses monthly billing periods and labels the measurement candidate pending. |
| 10. Restored M2 prerequisites | R1-13 | Resolved | `BUILD_PLAN.md:2729,2815,3261,3394–3395` consistently distinguishes M1-15T and requires the restored M2-5 benchmark before enhancements. |
| 11. Homeowner linkage | R1-20 | Resolved | `BUILD_PLAN.md:516,524` permits homeowner `person` records while enforcing organisation types and qualified relationships. |
| 12. Active decision references | R1-24 | Resolved | Corrected active references appear in D01:8,13,17; D02:8; D03:8,13; D05:8; D11:8,14; D12:8,13; D13:8,13, in their respective `docs/decisions/` files. Previous-candidate references remain explicitly historical. |
| 13. Pure/non-code exemptions | R1-25 | Partly resolved | `BUILD_PLAN.md:86,105,115,117` correctly scopes browser requirements. The command pattern at `121` remains unconditional; remaining finding 3. |
| 14. Agreement and assurance scope | R1-26 | Resolved | `BUILD_PLAN.md:723,1168,1239,3406,3427` carries agreement/mandate tests, limits ENT-10 assurance delivery and reserves certification claims for achieved evidence. |
| 15. Construction/release stages and gate names | R1-27 | Partly resolved | `BUILD_PLAN.md:1733,1736,2619,2903,3386` separates construction from release; decision gate fields use track-specific gates. MON-9’s card still prohibits starting preparation at `2290`; remaining finding 4. |
| 16. Fee-on-invoice scope | — | Resolved | `BUILD_PLAN.md:634` rejects historical/imported invoice-basis values; `docs/decisions/d16-enterprise-commercial-terms.md:13,17` preserves payment-only scope. |
| 17. Retired verdict terminology | R1-1 | Resolved | `BUILD_PLAN.md:70,78,119` consistently requires PASS bound to the exact head and separate acceptance. Remaining ACCEPT references are historical inventory/review records at `375,384,386,440`. |
| Graph and migration consistency | R1-23 | Pass | Static analysis of `BUILD_PLAN.md:3324–3382` found 59 graph rows, no cycle, correct phases and 44 unique numbered post-adoption migrations ordered after their numbered prerequisites. Merged/transitive prerequisites account for omitted graph edges. |
| Approval state | — | Pass | Each D01–D16 decision file retains `Status: proposed` at line 3 and `Dated approver evidence: None` at line 6. `BUILD_PLAN.md:5,171,1707` denies commercial approval; G0 remains pending at `157`. |

The existing Node 24 **approved deviation** remains at `AGENTS.md:15,55`. Therefore, the accurate confirmation is **no D01–D16 policy or release gate is newly marked approved**, rather than “nothing anywhere is marked approved.”

## Remaining findings

1. **MEDIUM — The contractor acceptance matrix still quarantines legitimate non-extra lines.**

   **Evidence:** `BUILD_PLAN.md:1209` conflicts with the corrected canonical import contract and owning ENT-6 acceptance at `627–629,944–945`. Those primary instructions now protect the denominator, so this is incomplete propagation rather than an unresolved fee formula.

   **Replace this → With this:**

   > `| Payment for an unexported or unknown line | Quarantined; no extra, no fee | ENT-6 |`

   →

   > `| Payment facts lack complete invoice composition, or claim an extra without a valid export match | Quarantined; no extra or fee contribution. Identified original-order and other non-extra lines are retained without an export match, remain in the allocation denominator and contribute zero fee | ENT-6 |`

2. **MEDIUM — SH-1 must perform the backfill that SV-2 verifies.**

   **Evidence:** `BUILD_PLAN.md:480` now instructs SH-1 to verify “SH-1’s completed” origin backfill. Its earlier backfill wording concerns job-track bindings; `1785,2546` correctly makes SV-2 verification-only. The origin backfill therefore needs an explicit performing owner.

   **Replace this → With this, only at `BUILD_PLAN.md:480`:**

   > `verification of SH-1’s completed `builder_logged` backfill; SV-2 performs no second backfill.`

   →

   > `SH-1 performs the idempotent `builder_logged` origin backfill for existing synthetic small-builder variations, preserving source provenance and earlier guarantees; SV-2 verifies that completed backfill and performs no second backfill.`

3. **LOW — The executable command pattern retains an unconditional new-browser-spec requirement.**

   **Evidence:** `BUILD_PLAN.md:121` conflicts with the corrected applicability rules at `105,115,117`. The exemption is clear elsewhere, but the copyable work instruction should agree.

   **Replace this → With this:**

   > `Run `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop <ID>.spec.ts` and existing regressions.`

   →

   > `For a task changing a web workflow, run `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop <ID>.spec.ts`. Every task preserves existing mandatory regressions and records its applicable C1 evidence; pure-core and non-code tasks need no invented browser spec.`

4. **LOW — MON-9’s card retains the construction prohibition removed from its table.**

   **Evidence:** `BUILD_PLAN.md:2290` says “Do not start,” whereas `1736,3386` allows synthetic preparation before release approval. The restriction safely overblocks later preparation but is inconsistent.

   **Replace this → With this:**

   > `**Track:** small-builder · later. Do not start before pilot data, a solicitor's view on damages-based agreements, and approval of the D01 service table.`

   →

   > `**Track:** small-builder · separately issued later work. Synthetic preparation may proceed after its task prerequisites; offering the service requires pilot data, a solicitor's view on damages-based agreements, approval of the exact D01 service table and the applicable release gate.`

## Founder-decision items

- **D09:** Confirm the proposed ten-busy-day measurement, billing-period basis and notice period (`BUILD_PLAN.md:1384–1386,1410–1422`; D09:13).
- **D16:** Confirm agreement-version binding, the approved-value ceiling and any negotiated minimum/band formula. Fee-on-invoice remains outside this revision (`BUILD_PLAN.md:634–641`; D16:17).
- **Consumed supplier credits:** Decide whether to retain the candidate. Production requires the separate non-cash contract and signed amendment aligning AGENTS, BUILD_PLAN and tests (`BUILD_PLAN.md:290,1925`).
- **Remote authority:** Retain founder-owned pushes/PR opening/merge or record a dated, bounded delegation (`BUILD_PLAN.md:70,73,78`).
- **Approvals and adoption:** Exact-version policy approvals and release evidence remain outstanding. Incorporating these text fixes supplies none; adoption and merge remain Ben’s actions (`BUILD_PLAN.md:80,171,1707`).

No additional founder policy decision is needed for the four remaining text fixes.