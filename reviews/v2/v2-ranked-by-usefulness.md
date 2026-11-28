# JobGuard V2: what gets built next, most useful for least effort first

24 Nov 2026, 21:45 UK. Ben asked for features "planned according to usefulness/easyiness". This puts the review's automation ideas (builder-usefulness-review-2026-11-24.md) at the top, within what dependencies and safety allow. Multi-crew planning moves to the end.

Use: ★★★ very high, ★★ high, ★ useful. Effort: S small, M medium, L large.

## Overnight on desktop Codex (in this order)

| Rank | Piece | Use | Effort | Waits on |
|---|---|---|---|---|
| 1 | Product picker, Materials and Briefs screens (D5B) | ★★ | M | nothing, already running |
| 1b | Automatic guard that fails CI when a change skips the audit rule (CI2, safety) | ★★ | S | nothing |
| 2 | Customer approves an extra by link (F6) | ★★★ | M | nothing |
| 2b | Browser and phone proof for approval by link (F6T, test files only) | ★★ | S | F6 #923 |
| 3 | Automatic chasing of quotes and unpaid invoices (K4) | ★★★ | S–M | nothing |
| 4 | Merchant invoice forward, routing only (K6A; real attached files are K6B, later) | ★★ | S | nothing |
| 5 | Payment schedule, deposit and stages, no invoices yet (K5A; invoices are K5B, later) | ★★ | S | R2 repair (done) |
| 6 | Friday customer update (K3) | ★★ | S | R2 repair |
| 7 | Calendar link for the customer (K2) | ★★ | S | R2 repair |
| 8 | Job profit so far (K10) | ★★ | S | R2 repair |
| 9 | Audit fix on measurement saves (D1R1, safety) | ★ | S | R2 repair |
| 10 | Off-hire reminders (K8) | ★★ | S | R2 repair |
| 11 | Customer choices and allowance tracker (E9) | ★★★ | M | E1 #919 (in review, redo risk) |
| 12 | Done, Blocked, Changed on a brief (F1) | ★★ | M | D4 #916 (in review) |
| 13 | Who was on site today (F8) | ★ | S | F1 |
| 14 | RAMS and construction phase plan draft (K9) | ★★ | M | R2 repair |
| 15 | Replies to open facts (E2) | ★ | M | E1 #919 |
| 16 | Stock position (E3) | ★ | M | D3 #912 |
| 17 | Same-firm double-booking warning (E5A, multi-crew) | ★ | S | R2 repair |

## Being built by Claude threads now
Don't-forget prompts (C5, #921), V2 tests in CI (CI1, #917), the R2 audit repair on the c-chain. Approved extras become plan tasks (C3B) starts right after R2.

## Next after the queue
0. Reload button after a refused stale agreement on the approval page (F6-R) ★ S, after F6 #923.
0. Photo tick-boxes reset for each new approval link (F6-T2) ★ S, after F6 #923.
0. Payment schedule counts every approved extra, same total as job profit (K5A-1) ★ S, after #929 and #931.
1. Share a brief or update to WhatsApp (K1) ★★★ S, after D5B.
2. Add a line to a priced quote (C6) ★★ M.
3. Walk photo upload (B1E) ★★ S.
4. Snags and handover in V2 (G1 to G4) ★★ M, after milestone one is merged and synced in.
5. Multi-crew planning (E4 to E6) ★ L, on purpose last.

## Waiting on someone
- Astra's plan check: every RED piece above (sent on the handoff issue), plus accountant export (QW-7) and encrypted offline photos (B2B1).
- Ben: a third repair round for the crew brief audit fix (D4A); merges tomorrow.
0. Crew and customer test sessions on the V2 database (V2-SX, RED, Astra first, with V2-PX). Unblocks K10-R, F1 crew presses, K2 feeds, F8 and E5A.
0. K10-R: K10's real crew and customer refusal tests (test files only), after V2-SX.
0. F1 progress buttons: parked behind D4A plus the task key on #916 (Ben's OK for D4's third round).
0. Diary entries get a "customer can see this" flag (DV1; RED, it touches main's diary, Astra first). Then K3-D adds diary content to the Friday update, flagged entries only.
0. K3-F, the Friday update price filter (T1, S, after #935). The current filter treats measurements and times in task titles, such as "2.40 m worktop" or "09.30", as prices and drops those tasks, so a busy week can show "No work scheduled this week". Fix: drop only real money (a currency sign or "p"/"pence" wording, matching the existing money helpers), never plain decimals or times. When every title is filtered out, say "Some work this week has been left out of this update. Please check before sending." instead of claiming nothing is scheduled. Tests: those title examples, a real "£120" title, and the all-filtered wording. Found by the Claude check of #942 (comment 7154552179). The builder still sees and edits the text before sending, so this is not a leak.
