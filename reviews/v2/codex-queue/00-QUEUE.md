# JobGuard V2 overnight Codex queue (24 to 25 Nov 2026)

Ben, 24 Nov 21:25 UK: "Keep jobguard v2 building on codex desktop all night." Builder: desktop Codex on Ben's Mac (`codex exec`), at most two builds at a time. A Claude session checks each PR; the builder never checks its own work. Only Ben merges RED or T2.

Plan of record: V2 build plan rev 1.3, `reviews/v2/JobGuard-V2-Build-Plan-rev-1.3.md` on branch `claude/project-thread-cw5qv5` (PR #915). These packets are also on that branch under `reviews/v2/codex-queue/`.

**Read `01-RULES.md` first. It applies to every packet.**

## Order (re-ranked 24 Nov 21:45 UK: most useful for least effort first)

Ben, 21:28 UK: "I just want features planned according to usefulness/easyiness." Order is by usefulness to a builder first, then by effort, within what dependencies and safety allow. **A piece Codex has already started keeps going; don't stop it to follow this order.** Packet file names keep their Q numbers; follow the Order column.

Take the next piece in Order whose "Starts when" is true. If it isn't true yet, skip to the next one that is. Rework risk: **low** = base is checked or merged; **medium** = base is under review and may still change; **high** = stacked on two or more unchecked pieces, expect merge work or a redo. Usefulness: ★★★ very high, ★★ high, ★ useful. Effort: S, M, L.

| Order | Packet | Piece | Use | Effort | Starts when | Base | Migration | Tier | Rework risk |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Q03 | V2-D5B product picker, Materials and Briefs screens (**running**) | ★★ | M | now | merge of D3 #912 + D4 #916 + D5A #914 | none | T1 | high |
| 2 | Q12 | V2-F6 customer approves an extra by link | ★★★ | M | now | `v2/main` | 2018 | RED | low |
| 3 | Q13 | V2-K4 automatic chasing of quotes and invoices | ★★★ | S–M | now | `v2/main` | 2019 | RED | low |
| 4 | Q14 | V2-K6 forward a merchant invoice to the job | ★★ | M | now | `v2/main` | 2020 | RED | low |
| 5 | Q11 | V2-K5 deposit and stage invoices | ★★★ | M | R2 has pushed c3 | new c3 | 2012 | RED money | medium |
| 6 | Q15 | V2-K3 Friday customer update | ★★ | S | R2 has pushed c3 | new c3 | 2021 | RED | medium |
| 7 | Q04 | V2-K2 calendar link | ★★ | S | R2 has pushed c3 | `codex/sandbox/v2-c4` merged with new c3 | 2017 | RED | medium |
| 8 | Q16 | V2-K10 job profit so far | ★★ | S | R2 has pushed c3 | new c3 | none | RED | medium |
| 9 | Q01 | V2-D1R1 audit append on measurement saves (safety fix) | ★ | S | R2 has pushed c3 | `codex/sandbox/v2-d1` | none | RED | low |
| 10 | Q05 | V2-K8 off-hire reminders | ★★ | S | R2 has pushed c3 | new c3 | 2010 | RED | medium |
| 11 | Q17 | V2-E9 customer choices and PC sums tracker | ★★★ | M | now | E1 #919 | 2022 | RED | high |
| 12 | Q09 | V2-F1 Done, Blocked, Changed on a brief | ★★ | M | now | D4 #916 | 2015 | RED | high |
| 13 | Q10 | V2-F8 who was on site today | ★ | S | V2-F1 pushed | V2-F1 branch | 2016 | RED | high |
| 14 | Q06 | V2-K9 RAMS and construction phase plan draft | ★★ | M | R2 has pushed c3 | new c3 | 2011 | RED | medium |
| 15 | Q08 | V2-E2 replies to open facts | ★ | M | now | E1 #919 | 2013 | RED | high |
| 16 | Q07 | V2-E3 stock position | ★ | M | now | D3 #912 | 2014 | RED | high |
| 17 | Q02 | V2-E5A same-firm double-booking warning (multi-crew, later) | ★ | S | R2 has pushed c3 | `codex/sandbox/v2-c3` | none | T1 | medium |

Every RED packet also needs Astra's plan check before the PR is called ready (rule 13); building can start before it lands.

Why this order: the three "now" pieces at the top (F6, K4, K6) are the review's biggest time savers and sit on merged code, so they can't be wasted by a later repair. Money and customer pieces on the new c3 come next as soon as R2 lands. Pieces stacked on unchecked branches (E9, F1, E2, E3) go after, because they carry the most redo risk. Multi-crew planning (E5A, and E4 to E6 outside this queue) goes last.

V2-C5 (don't-forget prompts) has a Claude builder (#921); not in this queue.

## Not in this queue, and why
- **New piece found by the C5 builder:** once scope is confirmed the app can't add a line to a priced quote, so prompts can only remind or be dismissed. "Add a line to a priced quote" (v2-c6) is its own later piece, on the quote track; not tonight.
- **Wait for the main sync into v2/main** (after milestone one merges): G1 to G4 snags and handover (would duplicate QW-4 #911 and QW-5). K3 and K10 no longer wait; they are Q15 and Q16.
- **Need unbuilt pieces first:** K1 share (after D5B), E4 and E6 multi-crew planning (later on purpose), E7, E8, F2 to F5, F7, G0 (after E1 settles), H.
- **Better left for Claude builders:** C3B (edits the file R2 is finishing; start right after R2), D4A (needs Ben's OK for a third round), B1E (changes the shared live-job upload rule), B2B1 (offline security, waiting for Astra), QW-7 (on main, firm money data, waiting for Astra), CI1 (#917, in flight).
