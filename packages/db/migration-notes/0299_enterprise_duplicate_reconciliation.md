# 0299 — ENT-7 leftovers (RED)

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

Local validation: the installed compiler passes db source and the affected integration/reference test graph.
With one worker and at most three named files per invocation, core billing/reference suites pass 76 tests and db
boundary/reference/LP-0 comparator suites pass 32 tests. Money/commercial boundary checks and diff whitespace
checks pass. The existing lane allows the repair paths and renumbered files. The incoming main/7c merges remain
staged by the router; conflict contents are resolved in the worktree, while the read-only index still needs the
router to stage that resolution. No full lane-against-main pass is claimed before that merge is completed.
PostgreSQL integration, migrations and the new adversarial cases were not executed here; they run in GitHub CI.
Independent RED recheck remains required. Synthetic data only; no providers, live money or release.


Repair round 2 (PR #378): keep 7c's 0298 posting migration and apply this migration as 0299. The
`migration-renumber.mjs` planner produced the filesystem renumber; its CLI `--write` also stages files, which is
forbidden in this sandbox, so only its planned moves/references were applied. The SERIOUS-B5 conflict keeps both
the reconciliation objects and the 0298 posting rows, as well as current main's practice-reader expectations.

CI diagnosis against the actual failure logs (expectations retained): F3/F12 and F9 exposed a missing credit cap;
F5/F6 exposed an import match incorrectly requiring billed net to equal approved net. The stored derivation now
computes `Q_g = max(0, min(A_g, I_g-C_g, D_g))` per extra from current stored projections and signed receipt
allocations. Exact capped contributions retain every source allocation, scaled proportionally so their sum is
exactly Q; no rounding precedes the cumulative fee. Matching still binds every immutable identity and revision hash;
amount differences are retained as billing facts, with integer/range/net-plus-VAT guards at the SQL boundary.
F7 exposed numeric revision/journal-count audit references, contrary to audit.v1's identifier-string schema. The
private audit helper converts numeric references to strings before hashing new events; existing history is untouched.
F11's two-receipt fixture supplied the same economic instant for distinct receipts, which correctly held the ambiguous
allocation. Its second receipt now has a distinct effective time; the expected 1p cumulative fee is unchanged.

Self-check additions cover two receipts under an approval cap, a later credit and partial reversal (signed exact thirds
summing to Q), reversal replay, invalid exported revision, oversized amounts through both the application and direct
runtime SQL, stale approval after credit without rewriting the locked statement, closed-month refusal, cross-tenant
replay/derivation reads, cross-job references, shadow-role execution refusal and full audit-chain verification after
statement posting. Existing duplicate races, command conflicts, non-live replay, full reversal, fractional correction
hash binding and direct table-write refusals remain. These PostgreSQL attacks are authored and typechecked here;
execution remains for CI. Local pure tests do not constitute a RED review or PostgreSQL verification.

The replay attack also found posting returned an existing outcome before checking a new authorization, and zero
statements had no durable command identity. Posting now binds a shared command receipt to statement, authorization
and actor, rejects changed-payload keys, checks authority on new keys, and records zero outcomes once. Replays
reconstruct results from immutable posting/correction records rather than the shared receipt's legacy runtime-writable
result column. Tests deliberately corrupt that result column and verify the authoritative response remains unchanged.
