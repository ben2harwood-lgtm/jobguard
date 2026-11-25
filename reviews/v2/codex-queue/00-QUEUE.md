# JobGuard V2 overnight Codex queue (24 to 25 Nov 2026)

> **25 Nov 08:20 UK: Ben's standing repair rule is in force (rule 24).** Held pieces restart under it. Rules 24 to 28 apply to every piece from now on. K2A (Q04) waits for Astra.
>
> Earlier note (25 Nov 01:10 UK): no new pieces went to Codex overnight beyond Q20 (BH1) and K3's repair (#935).

Ben, 24 Nov 21:25 UK: "Keep jobguard v2 building on codex desktop all night." Builder: desktop Codex on Ben's Mac (`codex exec`), at most two builds at a time. A Claude session checks each PR; the builder never checks its own work. Only Ben merges RED or T2.

Plan of record: V2 build plan rev 1.3, `reviews/v2/JobGuard-V2-Build-Plan-rev-1.3.md` on branch `claude/project-thread-cw5qv5` (PR #915). These packets are also on that branch under `reviews/v2/codex-queue/`.

**Read `01-RULES.md` and `02-BUILD-RULES-CHECKLIST.md` first (both in this folder). They apply to every packet. Everything a builder must read is in this repo; nothing lives only in the project folder.**

## Order (re-ranked 24 Nov 21:45 UK: most useful for least effort first)

Ben, 21:28 UK: "I just want features planned according to usefulness/easyiness." Order is by usefulness to a builder first, then by effort, within what dependencies and safety allow. **A piece Codex has already started keeps going; don't stop it to follow this order.** Packet file names keep their Q numbers; follow the Order column.

Take the next piece in Order whose "Starts when" is true. If it isn't true yet, skip to the next one that is. Rework risk: **low** = base is checked or merged; **medium** = base is under review and may still change; **high** = stacked on two or more unchecked pieces, expect merge work or a redo. Usefulness: ★★★ very high, ★★ high, ★ useful. Effort: S, M, L.

| Order | Packet | Piece | Use | Effort | Starts when | Base | Migration | Tier | Rework risk |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Q03 | V2-D5B-M product picker and Materials screen (resume from the kept base merge; Briefs half D5B-B waits for D4A) | ★★ | M | now | merge of D3 #912 + D4 #916 + D5A #914 | none | T1 | high |
| 1b | Q18 | V2-CI2 automatic guard for the audit-chain rule (safety, protects every piece below) | ★★ | S | now | v2/main (#917 merged 12:12 UK 25 Nov) | none | T2 | low |
| 1c | Q20 | V2-BH1 shared sign-in helper for V2 browser tests (test helper only; stops tonight's repeated sign-in failures, rule 22) | ★★ | XS | now | `v2/main` | none | T1 | low |
| 1d | Q21 | RULES-T, one "Rules met" PR template (jobguard; base `main`, after #915 merges) | ★★ | XS | after #915 | `main` | none | T1 | low |
| 1e | Q22 | CI-RV, RED PRs need an other-vendor review naming the current head (base `main`) | ★★★ | S | after Astra | `main` | none | T2 | low |
| 2 | Q12 | V2-F6 customer approves an extra by link | ★★★ | M | now | `v2/main` | 2018 | RED | low |
| 2b | Q19 | V2-F6T browser and phone proof for F6 (test files only; #923 waits for it) | ★★ | S | now | `codex/sandbox/v2-f6` @ d7fabdf6 | none | T1 | low |
| 3 | Q13 | V2-K4 automatic chasing of quotes and invoices | ★★★ | S–M | now | `v2/main` | 2019 | RED | low |
| 4 | Q14 | V2-K6A merchant invoice forward, routing only on the unchanged intake (real files = K6B, later, Astra first) | ★★ | S | now | `v2/main` | 2023 | RED | low |
| 5 | Q11 | V2-K5A payment schedule, no invoices (drafting and issuing = K5B, later, Astra first) | ★★ | S | R2 has pushed c3 | new c3 | 2012 | RED money | medium |
| 6 | Q15 | V2-K3 Friday customer update | ★★ | S | now (mock-up passed; photo case waits for V2-PX) | new c3 | 2021 | RED | medium |
| 7 | Q04 | V2-K2A builder-only calendar feed for the whole job (crew feeds after C3C) | ★★ | S | R2 has pushed c3 | `codex/sandbox/v2-c4` merged with new c3 | 2017 | RED | medium |
| 8 | Q16 | V2-K10 job profit so far | ★★ | S | R2 has pushed c3 | new c3 | none | RED | medium |
| 9 | Q01 | V2-D1R1 audit append on measurement saves (safety fix) | ★ | S | R2 has pushed c3 | `codex/sandbox/v2-d1` | none | RED | low |
| 10 | Q05 | V2-K8 off-hire reminders | ★★ | S | R2 has pushed c3 | new c3 | 2010 | RED | medium |
| 11 | Q17 | V2-E9 customer choices and PC sums tracker | ★★★ | M | **building** (Opus thread, #948, from 25 Nov 13:00 UK; flow seed test first) | E1 #919 | 2022 | RED | high |
| 12 | Q09 | V2-F1 Done, Blocked, Changed on a brief | ★★ | M | **now** (released 25 Nov 14:55 UK; D4A + taskKey are on #916 @ f7aacf55d). **Desktop Codex.** PR into v2/main | D4 #916 | 2015 | RED | medium |
| 13 | Q10 | V2-F8 who was on site today | ★ | S | **parked: C3C crew binding** | V2-F1 branch | 2016 | RED | high |
| 14 | Q06 | V2-K9 RAMS and construction phase plan draft | ★★ | M | now (mock-up passed #930) | new c3 | 2011 | RED | medium |
| 15 | Q08 | V2-E2 replies to open facts | ★ | M | **building** (Opus thread, Ben ran the allowance at about 12:25 UK 25 Nov; RED conditions in Q08) | E1 #919 | 2013 | RED | high |
| 16 | Q07 | V2-E3 stock position | ★ | M | now | D3 #912 | 2014 | RED | high |
| 17 | Q02 | V2-E5A same-firm double-booking warning (multi-crew, later) | ★ | S | **parked: C3C crew binding** | `codex/sandbox/v2-c3` | none | T1 | medium |

Every RED packet also needs Astra's plan check before the PR is called ready (rule 13); building can start before it lands.

Why this order: the three "now" pieces at the top (F6, K4, K6) are the review's biggest time savers and sit on merged code, so they can't be wasted by a later repair. Money and customer pieces on the new c3 come next as soon as R2 lands. Pieces stacked on unchecked branches (E9, F1, E2, E3) go after, because they carry the most redo risk. Multi-crew planning (E5A, and E4 to E6 outside this queue) goes last.

V2-C5 (don't-forget prompts) has a Claude builder (#921); not in this queue.

## Batch released 25 Nov 14:55 UK (planner; Ben: "why is nothing coding?")
Every piece below was dry-checked against the current code (rule 23). None needs a database before building: their database proof is in seed tests or browser tests that CI1 or Mac lane B run. Open each PR **into `v2/main` or a `codex/sandbox/v2-*` branch**, so CI1's seed job runs.

| Order | Packet | Piece | Builder | Base | Migration | Tier |
|---|---|---|---|---|---|---|
| B1 | Q09 | V2-F1 Done, Blocked, Changed on a brief | **desktop Codex** (lane A, slot 1) | #916 @ f7aacf55d, PR into v2/main | 2015 | RED (Claude plan check asked) |
| B2 | Q23 | V2-D5B-B Briefs screen | **desktop Codex** (lane A, slot 2) | #916 @ f7aacf55d, PR into v2/main | none | T1 |
| B3 | Q24 | V2-K3-F Friday filter keeps measurements and times | **Codex** (web Codex now, or lane A when a slot frees) | `codex/sandbox/v2-k3` | none | T1 |
| B4 | Q25 | V2-F6-UX Check again, and photo ticks reset | **Codex** (web Codex now, or lane A) | `codex/sandbox/v2-f6t` | none | T1 |
| B5 | Q26 | V2-SX crew and customer test sessions | **Opus thread** (needs a live V2 database while building) | `v2/main` | 2024 (V2 bootstrap file) | RED (Claude plan check asked) |

Already moving, so don't duplicate: CI2 #947, phone-test sign-in #950, E2 #949, E9 #948. Next batch after this one: V2-PX (Opus), K10-R (after SX), K5A-1 (after #929 and #931), K1 share (after D5B-B).

## Dry-checked against the code (25 Nov 00:10 UK)
Verified and released: **K8 (Q05), E9 (Q17), E3 (Q07)**, since 00:15 UK **K9 (Q06) and E2 (Q08)**, and since 00:20 UK **K3 (Q15) and F1 (Q09)** with re-scoping. All four mock-ups passed in #930, each with a dated note at the top of its packet. Re-scoped: **K2 → K2A** (builder-only feed). Parked: **E5A** and **F8**, both waiting for C3C. They get checked before they're released.

## Migration numbers (one list; checked against every branch 24 Nov 22:15 UK)
2001 practice quote (main) · 2002 to 2005 c-chain and d1 · 2006 D3 #912 · 2007 D4 #916 · 2008 B1A #920 · 2009 E1 #919 · 2010 K8 · 2011 K9 · 2012 K5 · 2013 E2 · 2014 E3 · 2015 F1 · 2016 F8 · 2017 K2 · 2018 F6 #923 · 2019 K4 · **2020 C3B #922** · 2021 K3 · 2022 E9 · **2023 K6A** (moved from 2020) · **2024 V2-SX** (crew and customer test sessions, V2 bootstrap file, Astra first) · next free: **2025**. A builder that needs a number not listed here stops and asks; it never takes the next one itself.

## Not in this queue, and why
- **New piece found by the C5 builder:** once scope is confirmed the app can't add a line to a priced quote, so prompts can only remind or be dismissed. "Add a line to a priced quote" (v2-c6) is its own later piece, on the quote track; not tonight.
- **Wait for the main sync into v2/main** (after milestone one merges): G1 to G4 snags and handover (would duplicate QW-4 #911 and QW-5). K3 and K10 no longer wait; they are Q15 and Q16.
- **Need unbuilt pieces first:** K1 share (after D5B), E4 and E6 multi-crew planning (later on purpose), E7, E8, F2 to F5, F7, G0 (after E1 settles), H.
- **Better left for Claude builders:** V2-PX proof photos in the V2 seed (`packets/v2-px-proof-photos-in-v2-seed.md`; security boundary, Astra first; F6's photo proof waits for it), C3B (edits the file R2 is finishing; start right after R2), D4A (needs Ben's OK for a third round), B1E (changes the shared live-job upload rule), B2B1 (offline security, waiting for Astra), QW-7 (on main, firm money data, waiting for Astra), CI1 (#917, in flight).
