# JobGuard V2 overnight Codex queue (24 to 25 Nov 2026)

> **25 Nov 08:20 UK: Ben's standing repair rule is in force (rule 24).** Held pieces restart under it. Rules 24 to 28 apply to every piece from now on. K2A (Q04) waits for Astra.
>
> Earlier note (25 Nov 01:10 UK): no new pieces went to Codex overnight beyond Q20 (BH1) and K3's repair (#935).

Ben, 24 Nov 21:25 UK: "Keep jobguard v2 building on codex desktop all night." Builder: desktop Codex on Ben's Mac (`codex exec`), at most two builds at a time. A Claude session checks each PR; the builder never checks its own work. Only Ben merges RED or T2. **Updated (Ben, 25 Nov 20:02 UK, via the coordinator):** T2 PRs are merged by the "Merge all ready PRs" thread once CI is green and the Codex check is clean. Only RED merges still go to Ben.

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
| 13 | Q10 | V2-F8 who was on site today | ★ | S | **released 25 Nov 20:20 UK (Opus)** | C3C #955 | 2016 | RED | medium |
| 14 | Q06 | V2-K9 RAMS and construction phase plan draft | ★★ | M | now (mock-up passed #930) | new c3 | 2011 | RED | medium |
| 15 | Q08 | V2-E2 replies to open facts | ★ | M | **building** (Opus thread, Ben ran the allowance at about 12:25 UK 25 Nov; RED conditions in Q08) | E1 #919 | 2013 | RED | high |
| 16 | Q07 | V2-E3 stock position | ★ | M | now | D3 #912 | 2014 | RED | high |
| 17 | Q02 | V2-E5A same-firm double-booking warning (E5A-1 query now; E5A-2 screen after c4) | ★ | S | **released 25 Nov 20:25 UK (Opus)** | C3C #955, then v2/main | none | T1 | low |

Every RED packet also needs Astra's plan check before the PR is called ready (rule 13); building can start before it lands.

Why this order: the three "now" pieces at the top (F6, K4, K6) are the review's biggest time savers and sit on merged code, so they can't be wasted by a later repair. Money and customer pieces on the new c3 come next as soon as R2 lands. Pieces stacked on unchecked branches (E9, F1, E2, E3) go after, because they carry the most redo risk. Multi-crew planning (E5A, and E4 to E6 outside this queue) goes last.

V2-C5 (don't-forget prompts) has a Claude builder (#921); not in this queue.

## Batch C released 25 Nov 16:00 UK (planner; dry-checked, each packet lists the files and lines it opened)
| Order | Packet | Piece | Builder | Base | Migration | Tier |
|---|---|---|---|---|---|---|
| C1 | Q29 | V2-M3 mock-ups for every remaining screen | **desktop Codex** (lane A) | v2/main | none | T1 |
| C2 | Q27 | V2-PX proof photos on the V2 database | **Opus** | v2/main | 2025 (evidence firm lock) | RED |
| C3 | Q04 | V2-K2A builder-only calendar feed | **desktop Codex** (lane A), after its Claude plan check | `codex/sandbox/v2-c4` | 2017 | RED |
| C4 | Q30 | V2-G0 certificates checklist | **Codex** (web or lane A) | v2/main | none | T1 |
| C5 | Q31 | V2-K1 share the Friday update to WhatsApp | **Codex** (web or lane A) | `codex/sandbox/v2-k3` | none | T1 |
| C6 | Q32 | V2-B1B Walk screen, online first cut | **desktop Codex** (lane A) | #920, PR into v2/main | none | T1 |
| C9 | Q34 | V2-K5A-2 custom-task stages and frozen due amounts (Codex P2s on #929) | **Opus** | `codex/sandbox/v2-k5` | 2046 | RED money |
| C10 | Q35 | V2-FL-1 firm-lock guard test + V2 core tables (39) | **Opus** | PX #964 / v2/main | 2047 | RED tenancy |
| C11 | Q36 | V2-FL-2 firm lock, money tables (34) | **Opus** | `codex/sandbox/v2-fl1` | 2048 | RED tenancy |
| C12 | Q37 | V2-FL-3 firm lock, orders and site tables (33) | **Opus** | `codex/sandbox/v2-fl1` | 2049 | RED tenancy |
| C13 | Q38 | V2-FL-4 firm lock, recovery tables (35) | **Opus** | `codex/sandbox/v2-fl1` | 2050 | RED tenancy |
| C14 | Q39 | V2-FL-5 firm lock, supplier, feed and the rest (37) | **Opus** | `codex/sandbox/v2-fl1` | 2051 | RED tenancy |
| C15 | Q40 | V2-FL-F definer-function review (report, no migration) | **Opus** | `codex/sandbox/v2-fl1` | none | RED tenancy |
| C16 | Q41 | V2-D4B translated crew briefs, fake translator only (Ben: paid service later) | **Opus** | #954 `codex/sandbox/v2-d5b-b` | 2052 | RED |
| D5 | Q42 | V2-B1C walk check and correct: "needs room" tray, re-file a photo, original kept | **Opus** | `codex/sandbox/v2-b1b` #957 | 2029 | RED |
| D3 | Q43 | V2-F1-P photo on Done, Blocked or Changed | **Opus** | `codex/sandbox/v2-f1` #953 (PX #964 before merge) | 2053 | RED |
| C17 | Q44 | V2-FL-6 lock every V2-owned job table, last bootstrap line (rule 30) | **Opus** | `codex/sandbox/v2-fl1` #966 | 2054 | RED tenancy |
| D10 | Q45 | V2-SYNC-1 merge main into v2/main (#905, #910, #911 and pilot 0771 to 0782; SYNC-2 later for #906 and #907), retarget the snag fence, lock 8 new main job tables | **Opus** | v2/main (merge after FL-1) | 2056 | RED |
| D11 | Q46 | V2-E7 one reminder per unanswered E2 request, and "unconfirmed" with its reason from 08:00 London the day before (catcher only; E3 stock chase is later piece E7-S) | **Opus** | E2 #949 `claude/project-thread-49qd38` | 2030 | RED |
| D12 | Q47 | V2-C3B-1 the plan screen sends an extra's approved revision, so "Add trim" can be planned; lists extras not on the plan | **Opus** | c4 #903 `codex/sandbox/v2-c4` + merge v2/main | none | T1 |
| D13 | Q48 | V2-C3B-2 the builder marks a no-charge extra "adds work" or "removes work" | **Opus** | Q47's branch | 2055 | RED |
| D14 | Q49 | V2-F2 a task that needs a proof photo stays open until the photo is verified (derived status, no migration) | **Opus** | F1-P #974 `codex/sandbox/v2-f1p` | none (2028 kept) | RED |
| D15 | Q50 | V2-B1E "Take photo" on the walk, through the shared upload path unchanged (live jobs only; pre-live is later B1E-2) | **Opus** | B1C #973 `codex/sandbox/v2-b1c` | none | RED |
| D16 | Q51 | V2-K5A-1 the payment schedule counts every approved extra (drops the origin filter; same rule as K10) | **Opus** | K5A-2 #961 `claude/project-thread-ek9rje-k5a-2` | none | RED money |
| D17 | Q52 | V2-F7M "My brief" for a crew member by their own link: Done, Blocked, Changed as crew presses the builder confirms into F1 (no photos by link yet) | **Opus** | F2 #991 `claude/project-thread-trp08u` | 2041 | RED |
| D18 | Q53 | V2-G1 snag register: crew owner, who fixed and who checked (a different person), agreed outstanding, Snags screen; main's QW-4 unchanged | **Opus** | SYNC-1 #980 `claude/project-thread-ctngmn` (screen: M3 #956) | 2042 | RED |
| D19 | Q54 | V2-DV1 + K3-D the builder marks diary notes "Customer can see this", and the Friday update draft offers them (amount rule, builder still reviews) | **Opus** | K3 #935 `codex/sandbox/v2-k3` | 2036 | RED |
| D20 | Q55 | V2-F3 change draft: one new quantity drafts price (builder-confirmed rate), extra time and materials together as an existing-scope variation; pending kept apart; F6 link per revision | **Opus** | F6 #923 `codex/sandbox/v2-f6` | 2031 | RED money |
| C8 | Q33 | V2-SX-R refusal proof for the four existing v2-backend routes (rule 29) | **Opus** | `codex/sandbox/v2-d5b`, after SX merges | none | T1 |
| C7 | Q28 | V2-C3C crew records (data and command half) | **Opus** | v2/main | 2027 | RED |

## Batch released 25 Nov 14:55 UK (planner; Ben: "why is nothing coding?")
Every piece below was dry-checked against the current code (rule 23). None needs a database before building: their database proof is in seed tests or browser tests that CI1 or Mac lane B run. Open each PR **into `v2/main` or a `codex/sandbox/v2-*` branch**, so CI1's seed job runs.

| Order | Packet | Piece | Builder | Base | Migration | Tier |
|---|---|---|---|---|---|---|
| B1 | Q09 | V2-F1 Done, Blocked, Changed on a brief | **desktop Codex** (lane A, slot 1) | #916 @ f7aacf55d, PR into v2/main | 2015 | RED (Claude plan check asked) |
| B2 | Q23 | V2-D5B-B Briefs screen | **desktop Codex** (lane A, slot 2) | #916 @ f7aacf55d, PR into v2/main | none | T1 |
| B3 | Q24 | V2-K3-F Friday filter keeps measurements and times | **Codex** (web Codex now, or lane A when a slot frees) | `codex/sandbox/v2-k3` | none | T1 |
| B4 | Q25 | V2-F6-UX Check again, and photo ticks reset | **Codex** (web Codex now, or lane A) | `codex/sandbox/v2-f6t` | none | T1 |
| B5 | Q26 | V2-SX **rev 4**: refusal proof through V2's own links (no portal or crew sign-ins; rev 3 stopped at both stop points) | **Codex** (desktop or web; seed tests run on CI) | `v2/main` | none (2024 freed) | T1 tests, with a Claude RED plan check before ready |

Already moving, so don't duplicate: CI2 #947, phone-test sign-in #950, E2 #949, E9 #948. Every later batch (C to H) and the full list to the end of V2 are in `reviews/v2/V2-completion-roadmap.md`. Migration numbers 2025 to 2045 are reserved there; next free is 2046.

## Dry-checked against the code (25 Nov 00:10 UK)
Verified and released: **K8 (Q05), E9 (Q17), E3 (Q07)**, since 00:15 UK **K9 (Q06) and E2 (Q08)**, and since 00:20 UK **K3 (Q15) and F1 (Q09)** with re-scoping. All four mock-ups passed in #930, each with a dated note at the top of its packet. Re-scoped: **K2 → K2A** (builder-only feed). Parked: **E5A** and **F8**, both waiting for C3C. They get checked before they're released.

## Migration numbers (one list; checked against every branch 24 Nov 22:15 UK)
**Numbering rule (25 Nov 19:05 UK):** these numbers are build-time reservations only. The final number is set at merge time by `node tools/migration-renumber.mjs --base=origin/v2/main --write`, run on the piece's branch after catching up with v2/main. That rewrites the file name, the migration note and the bootstrap line. Never hard-code a migration number anywhere else, in tests, code or checks. A clash between a renumbered file and another branch's reservation is expected, and that branch's own renumber at its merge resolves it. 2001 practice quote (main) · 2002 to 2004 c-chain · **d1 #904: 2005, renumbered to 2021 at aca51458 by the merge thread on 25 Nov. It now overlaps K3 #935's 2021, which K3 resolves with the tool at its merge.** · 2006 D3 #912 · 2007 D4 #916 · 2008 B1A #920 · 2009 E1 #919 · 2010 K8 · 2011 K9 · 2012 K5 · 2013 E2 · 2014 E3 · 2015 F1 · 2016 F8 · 2017 K2 · 2018 F6 #923 · 2019 K4 · **2020 C3B #922** · 2021 K3 · 2022 E9 · **2023 K6A** (moved from 2020) · **2024 V2-SX** (crew and customer test sessions, V2 bootstrap file, Astra first) · 2025 to 2045 reserved in `reviews/v2/V2-completion-roadmap.md` · **2046 K5A-2** · **2047 to 2051 V2-FL-1 to FL-5** · **2052 D4B** · **2053 F1-P** · **2054 FL-6** · 2055 C3B-2 (reserved) · **2056 SYNC-1** · next free: **2057**. A builder that needs a number not listed here stops and asks; it never takes the next one itself.

## Not in this queue, and why
- **New piece found by the C5 builder:** once scope is confirmed the app can't add a line to a priced quote, so prompts can only remind or be dismissed. "Add a line to a priced quote" (v2-c6) is its own later piece, on the quote track; not tonight.
- **Wait for the main sync into v2/main** (after milestone one merges): G1 to G4 snags and handover (would duplicate QW-4 #911 and QW-5). K3 and K10 no longer wait; they are Q15 and Q16.
- **Need unbuilt pieces first:** K1 share (after D5B), E4 and E6 multi-crew planning (later on purpose), E7-S (stock delivery chase, needs a fact-to-delivery link), E8, F2 to F5, F7, G0 (after E1 settles), H.
- **Better left for Claude builders:** V2-PX proof photos in the V2 seed (`packets/v2-px-proof-photos-in-v2-seed.md`; security boundary, Astra first; F6's photo proof waits for it), C3B (edits the file R2 is finishing; start right after R2), D4A (needs Ben's OK for a third round), B1E (changes the shared live-job upload rule), B2B1 (offline security, waiting for Astra), QW-7 (on main, firm money data, waiting for Astra), CI1 (#917, in flight).

## Workflow change (Ben, 25 Nov 19:53 UK): "I want Opus 5.5 to do the coding and Codex to do the checking."
Every queued and future packet is built and repaired by an Opus 5.5 thread. Codex only checks, by `@codex review` on the PR or a read-only Mac review. Desktop Codex lane A takes no new builds. Repair rounds already used on Codex-built PRs still count.

## Who decides (Ben, 25 Nov 20:02 and 20:07 UK, via the coordinator)
- T2 PRs: the merge thread merges once CI is green and Codex is clean.
- Build decisions (design choices, P1/P0 fix-or-log, extra repair rounds, when to stop reviewing): the coordinator decides. Builders and the planner bring them to the coordinator, not to Ben.
- Still Ben only: RED merges, deploys, spending, accounts, and company facts.

## (Superseded) Lane A order (25 Nov 18:20 UK)
Web Codex has no runner, so desktop Codex lane A is the single Codex lane. It has at most 4 builds on the Mac at once, shared with Vibe Control. Building now: FL-F (Q40) and D4B (Q41). Next, in this order as slots free:
1. FL-6 (Q44). It's small, and it unblocks every V2 branch that meets FL-1.
2. FL-2 (Q36) repair round, and D4B (Q41) repair round.
3. F1-P (Q43).
4. FL-5 (Q39).
5. B1C (Q42).
6. C3B-1 and then C3B-2 (follow-ups from #922). The planner writes their packets next, after a dry-check on v2/main with #922 merged.
Done or passed: FL-3 #969, FL-4 #970. FL-F (Q40) is building.

Tenancy locks come first because every later V2 piece relies on them. F1-P is ahead of FL-4 because builders use proof photos every day.
