# Technical acceptance CH-7 (partial build, held parts) — PR #132 — verified head 5a69467 — ACCEPTED AS PARTIAL

**Decision:** CH-7 "Eligibility under D03 v3" is ACCEPTED for merge as a PARTIAL build with the held parts listed below, under Ben's written delegation and the three check lanes (Ben, 11 Oct, card `speed-up-three-check-lanes-2026-10-11`), provided GitHub CI is fully green on the exact final head that adds this file. **CH-7 is not fully accepted while any part below is held.** Synthetic only; no fee is shown, derived or posted; no deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), JobGuard integrator (11 Oct), a subagent of the coordinator session. It issued the orders and dispatched builders; it built nothing here and gave no review verdict.

## What is built
Duplicate supplier payment as a new case category (F17 £450.00); claim lines with debtor type (F18 £2,620.00 with the £70 compensation excluded; F19 £2,500.00); the £250 minimum (F15 £0.00); "Paid before you opened this case" (F20 £0.00); prevention (F22, existing wording); old v1 reviews keep their version and outcome byte for byte (DW4). Migration `0119_recovery_eligibility_v3.sql` (new tables; one widened case-type list; one new key; new guards). Both checkers confirmed every plan figure F14–F22 to the penny.

## Held parts (rulings: coordinator rounds 5 and 7; Ben's answers of 11 Oct)
- B4, DW2, DW3 — fee-terms approval and the pursuit guard: HELD (D01 v3 is a founder pricing decision still at proposed).
- B5 and "Insurer proceeds never qualify": HELD (the insurer type is attached to the job, not to the receipt fact).
- Reason wording for F19's individual-debtor interest and for F21: HELD (no existing wording; none invented).
- F14 and F16 saved and on-screen positive path: HELD (the practice feed has no "supplier invoice paid" fact; pure-maths proof stands; orders PRACTICE-FACTS-1 and PRACTICE-FACTS-1b follow).
- Owed follow-ups from Ben's answers of 11 Oct: a duplicate supplier payment refunded BEFORE the case opened must not count (own order CH-7-F17-BEFORE-OPEN); the F18 example gains two practice receipts for the £120 interest and £70 compensation (PRACTICE-FACTS-1).

## Chain
- Order `jg-orders/CH-7-issued-codex-2026-10-11.txt`. Builder Codex GPT-6.1 Sol (45f8488; its sandbox ran no database or browser test). Claude Sonnet helper: main merged in, migration renumbered 0113 → 0119 with the §12.2 ledger line (58094c9, d234315); first real database and browser runs and their repairs (8c74591).
- Lane: **RED** (qualifying money figures).
- First verdicts on 8c74591: Sol `8c74591-sol.md` REPAIR (seven items). Opus `8c74591-opus.md`: first written as PASS, then revised by the same reviewer to REPAIR after the Sol finding that a duplicate-payment case could be approved under the old v1 policy (the reviewer records that it had under-called this). Integrator triage: fix Sol 1, 2, 3; Sol 5 (job reached by its address, not from the Jobs list) and Sol 4 (evidence packs for the new category) relabelled LATER with reasons — both checkers agreed in their re-checks; Sol 6 and 7 were evidence items, met by CI below.
- Repair round 1 of at most 2: commit 5a69467 (Claude Sonnet, tested on the Mac against real PostgreSQL): no v1 review or approval for a duplicate-payment case (application refusal plus a new database trigger); "before opening" decided once in PostgreSQL on the original timestamps; the stored-result guard requires every key.
- Re-checks on 5a69467, fixes and regressions only: the SAME Opus reviewer `5a69467-opus-delta.md`: "VERDICT: PASS — bound to head 5a69467b7a82758cb29723cc10c0b5d90ea24f98", 0 blocking; a fresh Sol session `5a69467-sol-delta.md`: "VERDICT: PASS", no findings.
- Tests on 5a69467: GitHub CI run 38158275171 green (CH-7 database file 23 tests, tenancy, demo-bootstrap and the neighbouring recovery and practice-feed suites; 960 API tests; browser 318 passed, none failed, flaky or retried). An earlier run on 8c74591 had one dropped connection in the unrelated merged UIWIRE-9 spec; no assertion, retry or timeout was changed for it.
- Migration order: merged through 0115; 0119 is above every merged number and registered in numeric order. §12.2 ledger line d234315 ("CH-7 takes 0119").
- LATER findings are on `jg-orders/FIX-LATER.md`.
- Only commit after 5a69467: this one, adding record files inside `docs/verdicts/CH-7/`.

## Founder-reserved areas — none exercised
No live provider or send, production mode, real data, spending, deployment or release. No fee derivation. No security test edited; no existing assertion of a merged leaf changed.
