# Technical acceptance ENT-10b — PR #133 — verified head 379589a — ACCEPTED

**Decision:** ENT-10b (a signed, single-tenant audit export with an independent verifier; migration 0121; synthetic only) is ACCEPTED for merge under Ben's written delegation and the three check lanes (Ben, 11 Oct), provided GitHub CI is fully green on the exact final head that adds this file. It is the second sub-leaf of ENT-10; full ENT-10 acceptance still waits on the held and later parts. Nothing is released.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), JobGuard integrator (11 Oct), a subagent of the coordinator session. It issued the orders and dispatched builders; it built nothing here and gave no review verdict.

## What it is and is not
Built: a tenant's owner or admin can create a signed export of that tenant's audit chain; an independent command-line verifier detects an altered, missing or reordered entry, a truncated tail and an invalid signature; each export writes its own audit event; refused callers (including a revoked member) are audited. The signature proves the integrity of the export only. In every mode other than `synthetic_demo` export creation is refused server-side (key decision HELD for the founder).
Not built / owed: nothing in the product yet performs the trusted checkpoint hand-off, so on a hosted sandbox "Create signed audit export" answers CHECKPOINT_REQUIRED until an operator step exists (follow-up, on the fix-later list); the boundary scanner's pinned list does not yet cover this route (adding it is a security-test list change needing Ben's typed yes); key rotation and long-term verification stay with M5-9.

## Chain
- Order `jg-orders/ENT-10b-issued.txt`. Builder Codex GPT-6.1 Sol (7ae55ec); Claude Sonnet helper: catch-up, renumber 0116 → 0121 with the §12.2 ledger line, first real runs (129e19b).
- Lane: **RED** (export of stored records, tenant separation, signing). Floor RED.
- First verdicts on 129e19b: Opus `129e19b-opus.md` PASS (0 blocking, 13 later). Sol `129e19b-sol.md` REPAIR: fix (1) a refused revoked member was not audited, (2) the screen dropped its retry id after an "unavailable" answer, (3) no test of two distinct concurrent exports; integrator relabelled (4) "signing is not canonical JSON" LATER (the order signs the stored export bytes as the merged evidence-pack verifier does; the verifier checks those exact bytes) — both checkers agreed in their re-checks; (5) was an evidence hold.
- Repair round 1 of at most 2: Codex commit, then a Claude Sonnet helper merged main bbca5ca (ENT-10a, 0120; both sides kept) and verified on a real database (379589a).
- Re-checks on 379589a, fixes, catch-up and regressions only: the SAME Opus reviewer `379589a-opus-delta.md`: "VERDICT: PASS — bound to head 379589a846ed2c69550acabe5144cb1f20ebe367", 0 blocking; a fresh Sol session `379589a-sol-delta.md`: "VERDICT: PASS", no findings.
- Tests on 379589a: GitHub CI run 38168996421 green (audit-export database file 11 passed including the concurrency case; verifier 14; API 14; web page test 11; browser 326 passed, retries off).
- Fingerprinted-table rule (coordinator, 11 Oct): migration 0121 adds no column to any existing table.
- Migration order: merged through 0115, 0119, 0120; 0121 is above every merged number and registered in numeric order. §12.2 ledger line in this PR ("ENT-10b takes 0121").
- LATER findings are on `jg-orders/FIX-LATER.md`.
- Only commit after 379589a: this one, adding record files inside `docs/verdicts/ENT-10b/`.

## Founder-reserved areas — none exercised
No live provider, real data, spending, production mode, deployment or release. No security test edited; no existing assertion of a merged leaf changed.
