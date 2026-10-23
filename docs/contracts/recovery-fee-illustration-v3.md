# SV6-05 exact recovery illustration (v1 wire, v3 reference fee)

Status: synthetic build-ahead implementation, not accepted or released. Issued 23 October 2026 under decision 74 on SV6-01 `106cd0a3fddb7222cb1c9fbac309f1b6c0f75abd`; parents still gate merge. Governing task: BUILD_PLAN §10 SV-6; pure-core subdivision S6-05-A–F. No persistence, network, tax calculation, journal, collection or entitlement is introduced.

`deriveRecoveryFeeIllustration(input: RecoveryFeeIllustrationInputV1)` consumes the branded result of strict `recoveryFeeIllustrationInputV1.parse`. It also reparses at runtime and returns the strict `recoveryFeeIllustrationOutputV1` shape, deeply frozen. Invalid structure, inconsistent provenance, an unqualified entry, duplicate consumption or excessive money yields typed `RecoveryFeeIllustrationError`, code `INVALID_RECOVERY_FEE_ILLUSTRATION`. Parsing does not establish authenticity or authorization.

The input selects synthetic_demo and one tenant/job/lock. Each source entry supplies its expected case/work/line selector, an immutable SV6-01 assessment, and its current qualification. All bindings, assessment ID/revision, source hash/revision and exact remaining principal must agree. Assessment predicates must all qualify, with no unresolved dispute/permanent exclusion. Each allocation ID must cite a line_allocation in the assessment manifest. A work, assessment, review or allocation can contribute once across the whole envelope. Capture facts have distinct capture identities, tenant/job/lock, immutable revision/hash references and exact nonnegative net amounts; duplicate identities refuse.

The pure function cannot discover a missing source, a different UUID alias for the same economic movement, an omitted reversal, or a forged/obsolete review. SV6-03/06 must reconstruct the complete current accepted assessment/qualification and capture inventory in their authorized source transaction, reverify settlement, evidence, approval expiry/revocation, identity and policy, and reject incomplete/stale/held results before calling this function. Do not turn unavailable data into an empty successful inventory. This interface is internal and must never accept HTTP caller assertions as authority.

Current sources contain positive remaining values after signed reversals/refunds/credits have already been applied by their owner. Do not add historical assessment revisions or signed reversal rows to this projection. A complete authoritative empty qualified inventory gives Q=0/F=0; a supplied held/excluded/unreviewed/not_assessed entry refuses. Sources remain linked in output by assessment, review, authorization, watermark/hash and allocation IDs. No receipt allocation is recomputed.

## Safest synthetic policy choices

Authority: `/Users/benharwood/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261023.md`, Ben's 23 October “Use safest choice” instruction, expressly applied by the issued SV6-05 order. These choices are changeable before real customers and approve no commercial decision record.

- Q4: preserve exact rational qualifying remaining principal separately from integer fee Money. Show integer-pence principal/remainder/capture totals only when exactly representable; otherwise the corresponding display field is null, meaning withheld, never zero. Do not select a fractional display-rounding rule. Omit ambiguous `found` and unpaid-findings fields; a downstream UI must not relabel settled qualifying principal as all findings.
- Q5: omit prior-illustration comparison, simulated delta and posted J entirely. F3 returns the new cumulative target £60. It does not display −£20, infer a journal, or authorize compensation.
- Q9: require the exact reference `recovery-fee-illustration.synthetic-policy.v1` on the input and every assessment/qualified source. This local reference composition binds `shadow_attribution_policy_v3`, `reference_recovery_eligibility_policy_v3`, `reference_fee_policy_v3` at exactly 10%, and `commercial_half_even.v1`, plus the Q4/Q5 restrictions here. Unknown/mismatched references refuse; there is no default/fallback policy. Upstream policy-reference integration and real approvals remain holds.

## Arithmetic and output

Use existing `sumExactPence` to sum current remaining rational principal Q without intermediate rounding. Use existing `calculateCumulativeFee` once for F = half-even(Q × 10%). Its priorNetPostedPence=0 argument is only how this leaf requests cumulative F; it is not a fact about ledger J. Discard the kernel's postingDelta. Preserve the exact remainder Q − F separately from the display. Capture totals are a separate fee-free measure and never enter Q or F. Validate aggregate money limits as well as each term; reject malformed, negative or oversized rationals. Every output is `productionEnabled:false`, `realExternalActions:0`.

The result carries “Illustration — proposed policy; principal only”, “VAT not calculated” and “Practice sandbox — synthetic data; nothing is sent or charged”. No base, cap, credit-used, subscription-offset, VAT figure, posting, previous-illustration or tax field exists. It does not call the raw-receipt success-fee adapter, allocator or any provider. Existing v1 arithmetic is unchanged.

| Synthetic arithmetic fixture | Exact Q (pence) | F (pence) |
|---|---:|---:|
| F1 | 80000/1 | 8000 |
| F2 first → final | 40000/1 → 80000/1 | 4000 → 8000 |
| F3 after partial reduction | 60000/1 | 6000 |
| F4 | 2000000/43 | 4651 |
| F4b | 80000/1 | 8000 |
| F5 | 40000/1 | 4000 |
| F6 | 0/1 | 0 |
| F7 | 80000/1 | 8000 |
| F8 | 0/1 | 0 |
| F9 tie controls | 5, 15, 25, 35 | 0, 2, 2, 4 |
| F12 capture-only | 0/1 (captured 360000/1 separately) | 0 |
| F13/F23 | 80000/1 | 8000 (remainder 72000/1) |

F4's exact remainder is 1800007/43 pence; its principal and remainder display values are withheld. Subscription £69 never reduces F23's £80. Split/combined histories with the same current principal yield the same F; multiple current work principals aggregate before rounding. These fixtures prove pure arithmetic/envelope behavior, not real saved F5 deposit or F7 invoice precedence.

## Integration and retained gates

No database/browser files are applicable or permitted for this C1 leaf. SV6-06 owns the real source-backed DB/browser journeys, including tenant/session/current authority, hidden-before-lock behavior, saved history, receipts and both browser projects. Parent merge gates, full CI, two independent exact-head Claude verdicts, separate acceptance and Ben's merge remain required. G1–G5 and D01–D16 remain closed where pending.

Coordinator integration: add the module's narrow public exports to the shared core barrel after agreement on this reference policy and downstream reader binding. No database catalogue rows, migration, routing, OpenAPI or UI registration is needed for this pure leaf. No existing tests or shared files are edited.
