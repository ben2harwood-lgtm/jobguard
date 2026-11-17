# Technical acceptance ENT-2 — PR #125 — verified head ff953c6 — ACCEPTED

**Decision:** ENT-2 (contractor work-order import, schedule-of-rates pricing and a read-only scheduling view; migration 0110) is ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. Synthetic only; no connector, deploy or release. Remaining gates unchanged: D12 v4, D16, G1, G5 for connectors, ENT-14.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (Claude week), a subagent of the coordinator session, 9 October 2026. This integrator dispatched the Claude Sonnet builders (attempt 2, attempt 3, main-merge) and wrote the ledger line de29e5c; all were checked by the fresh reviewers below. It built no code and gave no verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- Order `ENT-2-issued.txt` (coordinator rulings round 4) and the attempt-2/attempt-3 briefs.
- **Import roles — Ben, 9 Oct, "Existing roles"** (card `jobguard-ent-2-import-roles-2026-10-08`): work-order import = `organisation.manage` on the order's client or `data.import` tenant-wide (the same per-client predicate as CH-3b's 0102:117); schedule-of-rates import = `contract.manage`. No permission or role list changed.
- **CH-3b held checks** (Ben, 7 Oct, "hold the two checks"): both proved here, so CH-3b's DW1 second clause and DW3 team-scoped positive cases are now closed.
- Migration `0110_work_orders.sql` under Ben's 5 October merge-ahead ruling; §12.2 ledger line (de29e5c). Merged numbers at this acceptance: 0102, 0103, 0106, 0107, 0109; 0110 is above all of them. M0-6L (#104) takes the next free number at its own landing.

## 2. Verified heads and verdicts — PASS
- **First full review:** REPAIR at de29e5c (PR #125 comment 6083343982): branch-scoped managers could see and revise other branches' orders (P1); old-file re-import replay (P2).
- **Final verdict:** `ff953c6-opus-delta.md`, copied verbatim from PR #125 comment 6084689781, by a different fresh Opus agent that had not built, repaired, merged or ordered any commit in the PR: "VERDICT: PASS — bound to head ff953c6288d93a2eb4c4c2f1ea9dfeb5e864027e". No P1 or P2: per-order client authority is enforced in the database on revise, cancel, create and the party check, and the office screens show only covered clients' orders and batch rows (other-branch orders look like unknown ids); re-importing an old file after later revisions records those rows as out of date instead of replaying; the CH-1 merge kept both sides and 0110 shares no object with 0109.
- **CI on ff953c6:** run 37954728411 — typecheck, lint and lane check, unit tests (core 1,751, api 744, web 448), all 826 PostgreSQL tests (work-order-import 49, contractor 19) and the build passed; browser 291 of 292 passed, the one failure being `[desktop] M4-1-S.spec.ts:11`, main's own focus-before-enabled flake (it failed main's CI at c283d4e, run 37942077378; ENT-2 touches neither the test nor recovery-cases.tsx). The green-CI condition above therefore applies to the run on the head that adds this file.
- **Only commit after ff953c6:** this one, adding record files inside `docs/verdicts/ENT-2/` (lane `docs/verdicts/ENT-2/**`).

## 3. Follow-ups — not blocking (P3)
- P3-a: `work-order-import.integration.test.ts:510` adds a 180 s `beforeAll` budget (copying the file's existing one at :49; no existing limit changed), contrary to the receipt's "no new timeout" wording.
- P3-b: `packages/db/MIGRATIONS.md` 0110 section still calls 0107–0109 "held"; all three are merged.
- P3-c: a branch-scoped admin's filtered batch view keeps original row numbers, so gaps reveal that hidden rows exist (not which orders).
- P3-d (product question, ENT-1 rule): `0110:411` only checks that an assigned team exists in the tenant, so a branch-A admin can route their own order to a branch-B team and learn whether a guessed team id exists. Whether cross-branch team routing is allowed belongs to ENT-1's rules.
- Carried P3-1: `work-order.application.ts:34` runs the synthetic demo setup before the import permission check (synthetic only).
- Main's `M4-1-S.spec.ts:18` focus race and `UIWIRE-9.spec.ts` proof race keep flaking CI; worth a TEST-STAB order.

## 4. Founder-reserved areas — none
No live provider or connector, production mode, real data, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Attempt 1 (core only) | Codex gpt-6.1-sol | `BUILDER_RECEIPT.md` |
| Attempt 2, attempt 3, main-merge | Claude Sonnet builders | `BUILDER_RECEIPT_attempt2.md`, `BUILDER_RECEIPT_attempt3.md`, `BUILDER_RECEIPT_main-merge-a7d5917.md` |
| Ledger line | JobGuard integrator (Claude week) | de29e5c |
| Independent checks | Two fresh Claude Opus review agents | `de29e5c-opus.md` (REPAIR), `ff953c6-opus-delta.md` (PASS) |
| Technical acceptance and merge | JobGuard integrator (Claude week), Claude Opus 5.5 | this file |
