# Technical acceptance M4-6-S-R1 — PR #130 — verified head 48a729c — ACCEPTED

**Decision:** M4-6-S-R1 (fix-forward repair of the merged practice follow-up M4-6-S; migration 0115; synthetic only) is ACCEPTED for merge under Ben's written delegation and the three check lanes (Ben, 11 Oct, card `speed-up-three-check-lanes-2026-10-11`), provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release; nothing is sent.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), JobGuard integrator (11 Oct), a subagent of the coordinator session. It issued the orders and dispatched the builder; it built nothing here except two record commits (the §12.2 ledger line fae8695 and a conflict-free main-merge c88c554) and gave no review verdict.

## Why this piece exists
An independent Sol check of merged M4-6-S (#127, head 0c79738) found three acceptance gaps: the audit entry for a due transition was not saved with the practice-clock advance (C4); a reopened case could not get a new reviewed reminder after a revoked one (DW6); no upgrade test on a populated database. The coordinator ruled: fix forward in one piece, exactly those three, RED.

## Chain
- Order `jg-orders/M4-6-S-R1-issued.txt`; builder Codex GPT-6.1 Sol (Gmail account), commit 3b56568; receipt `BUILDER_RECEIPT.md`. The builder's sandbox ran no database or browser test; GitHub CI is the test evidence.
- Lane: **RED** (raised by the integrator above the mechanical floor, which read AMBER by path: the new migration replaces existing guard routines).
- First verdicts on fae8695: Opus `fae8695-opus.md` REPAIR (1 code BLOCKING: an unapproved preview wrongly blocked re-scheduling; plus "test evidence not yet seen"); Sol `fae8695-sol.md` REPAIR (1 BLOCKING: one interleaving could write the clock audit entry twice).
- Repair round 1 (of at most 2): order `jg-orders/M4-6-S-R1-r1-repair.txt`, builder commit 48a729c on top of c88c554 (main 530681c merged in, conflict-free, touching none of this piece's code).
- Re-checks on 48a729c, fixes and regressions only: the SAME Opus reviewer `48a729c-opus-delta.md`: "VERDICT: PASS — bound to head 48a729c5051390f680e85f8d51a392384d79677c", 0 BLOCKING, 4 LATER; a fresh Sol session `48a729c-sol-delta.md`: "VERDICT: PASS", HEAD 48a729c, no findings.
- Tests on 48a729c: GitHub CI run 38134140142 green (database suite 896 passed including the follow-up and upgrade suites; browser 300 passed).
- Migration: `0115_recovery_follow_up_repair.sql` — two `CREATE OR REPLACE FUNCTION` statements for routines from 0112 only; no table, policy, grant, role or row changed. §12.2 ledger line fae8695 ("M4-6-S-R1 takes 0115"). 0113 (CH-7) and 0114 (ENT-10a) are still in build and renumber if they land after this.
- LATER findings (twelve from Opus across both passes) are on `jg-orders/FIX-LATER.md`.
- Only commit after 48a729c: this one, adding record files inside `docs/verdicts/M4-6-S-R1/`.

## Founder-reserved areas — none
No live provider or send, production mode, real data, spending, deployment or release. No check was weakened; no security test edited.
