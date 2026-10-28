# 0294 — ENT-7 leftovers (RED)

Adds `ReconcileExportedDuplicate` through `EnterpriseFeeRepository.reconcileExportedDuplicate` and
`app.ef_reconcile_exported_duplicate`. The SECURITY DEFINER routine uses the existing finance-session check,
synthetic database gate, billing lock order and live-job check. Q-02 applies before replay too. It accepts identities
only. Finance selects the canonical commercial identity. The derivation consults the earliest linked origin at its
recorded cutoff for fee eligibility and agreement selection, even when the canonical log is later. Neither origin
nor issued export is rewritten. A regression covers two rate versions with the later log chosen as canonical.

A private, tenant-qualified, FORCE RLS `enterprise_duplicate_correction` records immutable credit instructions
computed from current validated invoice projections, including remaining uncredited net/gross, source invoice line,
export line and allocation-run references. These are synthetic correction instructions, not imported provider facts
or a claim that an external credit has been issued. The explicit finance command creates a Decision, its approved
resolution and an authorization bound to the generated correction hash and gross total in the same transaction.
No amount comes from the application. No external action is performed. Correction `netPence` is a reduced exact
fraction with decimal-string `numerator` and `denominator`, computed by `cb_add` cross-multiplication and integer
GCD reduction; it is never divided into a rounded decimal. The non-negative clamp stores zero as `0/1`. No
correction-level rounding occurs; half-even remains at the cumulative fee. Gross pence and the authorization amount
are unchanged. A synthetic fractional-credit projection regression checks `250000/31` through the real command,
immutable storage, replay and the authorized content hash.

The existing duplicate-link trigger permits an exported link only when this private correction record binds the
exact link, command, actor and members. Ordinary pre-export links and post-export unlink refusal retain their
existing checks. Chains and cycles are refused. Existing exports, origins, billing facts, approved statements and
journals remain unchanged. The existing derivation excludes the linked duplicate; a separately approved later
statement compensates the fee through the existing linked-posting routine. Replay/concurrent commands record once.

No backfill or destructive rollback. Forward fix only: preserve correction instructions, authorizations, lineage,
audit events and journals. If a faulty correction is found, disable the command and ship a reviewed compensating
forward migration; never erase issued history. LP-0 and SERIOUS-B5 enumerate the new routine/table; the restated
link guard retains its owner, grants and search path.

Command fixtures cover ENT-F1–F12, including the second F2 receipt, credits/reversals, approval/invoice caps,
post-export duplicates, excluded origins/order lines, version boundaries, penny ties and next-statement compensation.
They use real commands for capture, pricing, approval, export, billing import, derivation, statement approval and
posting. Agreement versions remain operations-owned setup. The version-boundary fixtures use the CI server's
real clock instead of editing immutable timestamps. The closed-month fixtures use the current and following
calendar periods rather than assuming CI runs in October/November. F10 checks the stored contribution trace and
posted 2p total against core largest-remainder lines (1p, 1p, 0p); existing stored statements expose agreement
sections, not a new per-extra screen. Screens remain parked.

Local validation: installed TypeScript compiler passes db source and the new integration/reference test dependency
graph; installed Vitest passes the repository boundary, independent reference fixtures and LP-0 comparator tests
with one worker, at most three named files per invocation. Core/storage dependency builds pass. Core purity,
money arithmetic and commercial-boundary checks pass. Working-tree lane paths are checked against the exact lane
allow-list (the lane file itself is implicitly allowed by the checker). The full local lane comparison against main
also includes four inherited ENT-7c paths, including its lane file, and refuses them. Those paths are not widened
into this lane: #359 must land before this branch's main comparison can pass.
PostgreSQL integration, migrations, catalogue execution and full CI run in GitHub after router push. They were not
run in this sandbox. Independent RED review is still required. Synthetic data only; no providers, live money or release.
