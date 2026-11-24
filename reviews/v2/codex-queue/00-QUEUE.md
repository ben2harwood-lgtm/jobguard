# JobGuard V2 overnight Codex queue (24 to 25 Nov 2026)

Ben, 24 Nov 21:25 UK: "Keep jobguard v2 building on codex desktop all night." Builder: desktop Codex on Ben's Mac (`codex exec`), at most two builds at a time. A Claude session checks each PR; the builder never checks its own work. Only Ben merges RED or T2.

Plan of record: V2 build plan rev 1.3, `reviews/v2/JobGuard-V2-Build-Plan-rev-1.3.md` on branch `claude/project-thread-cw5qv5` (PR #915). These packets are also on that branch under `reviews/v2/codex-queue/`.

**Read `01-RULES.md` first. It applies to every packet.**

## Order

Take the next piece whose "Starts when" is true. Rework risk: **low** = base is checked or merged; **medium** = base is under review and may still change; **high** = stacked on two or more unchecked pieces, expect merge work or a redo.

| # | Piece | Starts when | Base | Migration | Tier | Astra | Rework risk |
|---|---|---|---|---|---|---|---|
| 1 | V2-D1R1 audit append on measurement saves | R2 has pushed `codex/sandbox/v2-c3` (an audit commit after `2d92684`) | `codex/sandbox/v2-d1` | none | RED | no (repair) | low |
| 2 | V2-E5A same-firm double-booking warning | R2 has pushed c3 | `codex/sandbox/v2-c3` | none | T1 | no | medium |
| 3 | V2-D5B product picker, Materials and Briefs screens | now | merge of D3 #912 + D4 #916 + D5A #914 | none (stop if needed) | T1 | no | high |
| 4 | V2-K2 calendar link | R2 has pushed c3 | `codex/sandbox/v2-c4` merged with new c3 | 2017 | RED | yes | medium |
| 5 | V2-K8 off-hire reminders | R2 has pushed c3 | new c3 | 2010 | RED | yes | medium |
| 6 | V2-K9 RAMS and construction phase plan draft | R2 has pushed c3 | new c3 | 2011 | RED | yes | medium |
| 7 | V2-E3 stock position | now | D3 #912 | 2014 | RED | yes | high |
| 8 | V2-E2 replies to open facts | now | E1 #919 | 2013 | RED | yes | high |
| 9 | V2-F1 Done, Blocked, Changed on a brief | now | D4 #916 | 2015 | RED | yes | high |
| 10 | V2-F8 who was on site today | V2-F1 pushed | V2-F1 branch | 2016 | RED | yes | high |
| 11 | V2-K5 deposit and stage invoices | R2 has pushed c3 | new c3 | 2012 | RED money | yes | medium |

V2-C5 (don't-forget prompts, on c1) is in the earlier Claude list; take it as #12 only if the coordinator confirms no Claude builder has it.

## Not in this queue, and why
- **Wait for the main sync into v2/main** (after milestone one merges): G1 to G4 snags and handover (would duplicate QW-4 #911 and QW-5), K3 Friday update, K10 job profit.
- **Need unbuilt pieces first:** K1 share (after D5B), K4 chasing (after E7), K6 merchant email (after E3), E4, E6 to E9, F2 to F7, G0 (after E1 settles), H.
- **Better left for Claude builders:** C3B (edits the file R2 is finishing; start right after R2), D4A (needs Ben's OK for a third round), B1E (changes the shared live-job upload rule), B2B1 (offline security, waiting for Astra), QW-7 (on main, firm money data, waiting for Astra), CI1 (#917, in flight).
