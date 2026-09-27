# JobGuard plan revision 2.4 — adoption packet (27 Sep 2026)

**Founder decision:** "Adopt with the fixes" (Ben, 26 Sep 10:49).
**Repo:** `/Users/benharwood/Claude/Projects/my-new-project` · base `origin/main` = `694e9e1`.
**Branch:** `claude/plan-rev24-adopt` (worktree `.worktrees/plan-rev24-adopt`).
**Commit:** `4a6892a22c9cd69e3cbd5795d2210abf5f35dbab` — one docs-only commit, not pushed.
**Author:** Claude (Fable 5.1). **Independent review required before merge:** GPT-6 Astra — Claude authored this, so Claude cannot be its checker (AGENTS §5.13; working agreement §4). Nothing here is merged, pushed or accepted.

## What is in the commit

Source: the frozen dirty tree `scratchpad/jobguard/freeze-20260925T161327Z/` (25 Sep). Every one of its 41 files was compared with the *current* main working tree on 27 Sep — all 41 are byte-identical, so no post-freeze drift had to be reconciled. The main checkout was read only; its working tree, index and HEAD are unchanged.

Included (37 files): `BUILD_PLAN.md` (rev 2.4 + the twelve corrections), `AGENTS.md` (rev 2.4), `JOBGUARD_BUILD_PACK.md`, `JOBGUARD_REVIEW_HANDOFF.md`, decision records D01–D15 (`docs/decisions/`), archived rev 2.2 / 2.3 plan and AGENTS copies (`docs/archive/`), the dispatch note (`docs/dispatch/2026-09-25-rev2.4-parallel-build.md`, with a governing-pointer banner — see below), and the sources the plan cites: `reports/` (2 reports + the workflow-results JSON), `research_notes/` (5), `sales/JobGuard Sales Bible/` (8) and the NotebookLM setup note.

Deliberately left out, because the commit is docs-only:
- `packages/config/src/policy-gates.ts` (DecisionId union `D01–D12` → `D01–D15`) and `tools/decision-records.test.mjs` (count 12 → 15). These two lines are the only code in the proposal. They belong in a separate tiny code leaf. The HEAD test still passes with D13–D15 present (its filename filter only admits d01–d12; ran `node --test tools/decision-records.test.mjs` in the worktree: 1 pass, 0 fail).
- `sales/JobGuard-Sales-Bible.zip` — a binary bundle of the eight markdown chapters already committed.
- `drafts/chatgpt-jobs/JOBGUARD-FULL-SYNTHETIC-DEMO-BUILD-PLAN-BRIEF.md` — a brief *to* Astra, cited nowhere in the plan. Moved to `scratchpad/jobguard/not-committed/` (not deleted; the original is still in the main checkout).

## `git diff --stat origin/main..HEAD`

```
 AGENTS.md                                          |   35 +-
 BUILD_PLAN.md                                      |  576 +-
 JOBGUARD_BUILD_PACK.md                             |   19 +-
 JOBGUARD_REVIEW_HANDOFF.md                         |   24 +-
 docs/archive/AGENTS.rev2.2.md                      |  203 +
 docs/archive/AGENTS.rev2.3.md                      |  214 +
 docs/archive/BUILD_PLAN.rev2.2.md                  | 1986 ++++
 docs/archive/BUILD_PLAN.rev2.3.md                  | 2285 +++++
 docs/decisions/d01-commercial-fees-cap.md          |   16 +-
 docs/decisions/d03-eligible-recovery-reversals.md  |   16 +-
 docs/decisions/d05-authority-standing-consent.md   |    8 +-
 ...lder-invoices-customer-approval-jurisdiction.md |    8 +-
 docs/decisions/d09-plan-tiers-metering.md          |   18 +-
 docs/decisions/d10-pursuit-banking-route.md        |    8 +-
 .../d11-commercial-integrity-anti-gaming.md        |   12 +-
 ...ata-protection-role-third-party-transparency.md |   14 +-
 .../d13-shadow-attribution-delayed-disclosure.md   |   25 +
 docs/decisions/d14-paid-data-services.md           |   17 +
 .../d15-partner-commissions-introductions.md       |   17 +
 docs/dispatch/2026-09-25-rev2.4-parallel-build.md  |   98 +
 .../JobGuard competitor and pricing research.md    |  218 +
 reports/JobGuard monetisation and jobs pricing.md  |  498 +
 .../jobguard-monetisation-workflow-results.json    | 9697 ++++++++++++++++++++
 .../construction_platforms_and_ai.md               |  179 +
 .../price_level_and_tier_psychology.md             |  214 +
 .../success_fee_benchmarks.md                      |  174 +
 .../success_fee_psychology_and_trades_wtp.md       |  162 +
 .../uk_trade_job_software.md                       |  239 +
 .../01 What JobGuard is and how it works.md        |  109 +
 .../02 How JobGuard saves builders money.md        |  146 +
 .../03 The Final Check and the 10 percent fee.md   |  137 +
 sales/JobGuard Sales Bible/04 Pricing and plans.md |  116 +
 sales/JobGuard Sales Bible/05 Who to sell to.md    |   89 +
 sales/JobGuard Sales Bible/06 How to sell it.md    |  155 +
 .../07 The market and the competition.md           |   81 +
 sales/JobGuard Sales Bible/08 FAQ and glossary.md  |  157 +
 ...bookLM setup guide for Tommy (do not upload).md |  122 +
 37 files changed, 18039 insertions(+), 53 deletions(-)
```

## The twelve pairs (R01–R12) — applied exactly

Astra's packet: `Next Gen Learning Platform/drafts/weekend-2026-09-25/ben-packets/JOBGUARD_REV24_CORRECTED_TEXT.md`. A script parsed the twelve "Replace this → With this" blocks from the *Recommended replacement pairs* section and required each anchor to occur exactly once in the frozen rev 2.4 plan before replacing it. All twelve anchors were unique; all twelve applied. Diffing the committed plan against the frozen one shows hunks only at the twelve anchors plus the header (see "Additions" below): frozen lines 3, 11, 1942, 1948, 1965, 1999, 2223, 2299–2300, 2309, 2409, 2461–2462, 2465–2470. No hunk touches §2 (decision register), §14.1–14.11 (commercial/attribution/allocation/fee policy), §15.1 (money-model table) or §15.7 (decision changes); the D01–D15 record files are byte-identical to the freeze. No commercial decision text changed.

**Alternatives:** Astra's recommended resolution was taken in every case where it offered one — A (explicit D1/D2, E1–E5 subwaves, not planning groups), B (§14.8 lives in M4-8-S, not SV-6), C (MON-7 synthetic depends on M2-6-S, not deferred behind live M2-6), D (M4-9-S depends on SV-6, not MON-2), E (keep §13.7's `codex/sandbox/<leaf>` branch convention), F (Ben retains push/merge/release authority; no delegation recorded). None of the optional alternative overlays was applied.

## The eleven packet items — where each fix landed (committed line numbers)

| # | Item | Fix | Where |
|---|---|---|---|
| 1 | SV-3 skipped SV-2 in the §14.19 lane summary | R01 replaces the lane paragraph with a dependency table (SV-3 ← SV-2); R10 row C repeats it. "Lane B" no longer appears. | `BUILD_PLAN.md` 2302–2329 (table row 2310), 2508; leaf line 2248 unchanged |
| 2 | CH-4 and MON-1 falsely parallel in wave D | R11 splits D into D1 (SV-5 · CH-4) and D2 (MON-1). | 2509–2510 |
| 3 | Serial chains hidden inside wave E | R11 splits E into E1–E5 (SV-6 → M4-9-S → M4-10-S → M4-12-S → M4-17-S; MON-2 → MON-3/MON-8); R01 table and R05 carry the same edges. | 2511–2515; 2317–2321; 2002 |
| 4 | M4-9-S depended on deleted M4-11-S | R04: dependency line now `M4-8-S, SV-6, UIWIRE-13`; v1 wording replaced by v3. No `Depends on`/`dependencies` line anywhere still names M4-11-S. | 1968 |
| 5 | M4-8-S scope stated three ways | R02/R03 put §14.8 into the leaf itself (dependency on SV-2, build text, two acceptance bullets); R01 table and R10 row C point at "the amended leaf". The "continues unchanged" sentence is gone. The leaf is the single owner statement; the other two mentions refer to it. | 1943, 1950–1951; 2316; 2508 |
| 6 | MON-7 depended on live M2-6 in a synthetic wave | R07: `CH-3, M2-6-S for the synthetic implementation…`; live operation still M2-6 + D04/D12 v3; row C says "MON-7 needs CH-3 and M2-6-S". | 2438; 2508 |
| 7 | False "six independent verdicts exist" | R08: zero independent verdicts in `docs/verdicts/` on main; the six are builder receipts. **Plus the truth sentence the founder asked for:** the only independent verdicts so far are retrospective and none is a PASS — M4-1-S HOLD (`54adf02`), M4-2-S HOLD (`be81bd5`), M4-3-S FAIL (`fd56bdd`; repair candidate `8116aa6` also FAIL), 25 Sep, held on `codex/sandbox/m4-1-s-repair` / `m4-2-s-repair` / `m4-3-s-repair`, not on main. Verified: `git ls-tree origin/main docs/verdicts` has no M4-* files; the three repair branches do, byte-identical to the scratchpad copies. | 2338 |
| 8 | Branch prefix disagreed with §13.7 | R09 "Branch convention" retains `codex/sandbox/<lowercase-leaf-id>` and requires the dispatch prefixes/lane registrations to align. The dispatch doc still *contains* `codex/jg-<id>` — subordinated by the new banner (below), not rewritten. | 2500; dispatch banner |
| 9 | Merge authority disagreed | R09 "Merge authority" retains §13.2 C8: checker records a verdict, a separate actor accepts, Ben keeps push/merge/release; a dispatch note or uncommitted handoff delegates nothing. The dispatch §1/§6, `JOBGUARD_BUILD_PACK.md` §0 and `JOBGUARD_REVIEW_HANDOFF.md` still describe the checker merging (the 13–14 Sep operating record). The plan now governs and the banner says so; those companion lines were not rewritten. **Ben's one-line #9 decision (retain or delegate PR merging) remains open** — Astra's exact wording for either answer is in its packet, alternative F. | 2502; dispatch banner |
| 10 | Two replacements for M4-11-S | R06: §14.13 row now "Superseded by MON-2 (synthetic), §15.4. Do not build M4-11-S or `placeholder_subscription_v0`…"; the £30 placeholder appears nowhere else. §13.6 item 36 keeps its "Rev 2.4: replaced by MON-2 … Do not build the text below" note. | 2226; 1953–1955 |
| 11 | SV-1 blocked on adopting SV-0 | R01 "Adoption first" paragraph; R09 "Before new revision work starts" (adopt + SV-0 verdict + merge before any SV/CH/MON, §14.8 scope or v3 rewrite; committed M4-5-S/M4-7-S, then M4-6-S and the *unextended* M4-8-S may proceed); R10 row A "SV-1 waits for SV-0". | 2302; 2492–2494; 2506 |

Other checks the task named: SV-6 ← SV-5, M4-8-S (leaf 2257 = table 2316 = row E1); MON-7 ← M2-6-S (2438); M4-17-S ← MON-2 (2002 = row E5); every SV/CH/MON "Depends on" line in §14.14/§15.3/§15.4 was read against the R10/R11 row notes and all agree (CH-1/7 ← SV-1; CH-4 ← CH-2, CH-3, SV-4; CH-5 ← CH-3, SV-2; CH-6 ← SV-5, MON-1; CH-8 ← SV-5; CH-9 ← SV-6, MON-1; MON-1 ← CH-2, CH-3, CH-4, SV-4; MON-2 ← MON-1; MON-3/MON-8 ← MON-2; MON-4 ← SV-6, M4-8-S; MON-5 ← CH-3; SV-4 ← SV-2, UIWIRE-9; SV-5 ← SV-3, SV-4; M4-5-S ← M4-3-S, UIWIRE-3; M4-6-S ← M4-5-S; M4-7-S ← M4-2-S, SBOX-2; M4-10-S ← M4-9-S, UIWIRE-14; M4-12-S ← M4-10-S).

## Additions beyond the twelve pairs (for the reviewer to accept or strip)

1. **R08 truth sentence** (item 7 above) — added on the founder's instruction; the rest of R08 is verbatim.
2. **`BUILD_PLAN.md` header:** revision line now reads "2.4 · 25 September 2026, adopted with twelve corrections 26 September 2026"; a change-log item 5 lists what R01–R12 changed and states that no commercial decision text moved (lines 3, 12).
3. **`AGENTS.md` revision line** (the freeze had already moved it 2.2 → 2.4): now also says "adopted with twelve plan corrections 26 September 2026" and points at change-log item 5. Nothing else in AGENTS.md differs from the freeze.
4. **Dispatch doc banner** (`docs/dispatch/2026-09-25-rev2.4-parallel-build.md`, one blockquote under the title): the file is subordinate to §14.19/§15.6; where its wave grouping, M4-8-S/M4-9-S prerequisites, `codex/jg-<id>` prefix or checker-merge text differ, the plan governs and the file must be aligned before dispatch. Its content was not rewritten (Astra declined to invent text for files it had not seen; I followed that).

## Not done / still open

- Not pushed, not merged, not accepted. No Codex involved.
- The two-line code change (policy-gates union, decision-records test) is a separate follow-up leaf.
- Dispatch doc, build pack and review handoff still need their wave/prefix/merge text brought into line with the plan before any rev 2.4 task is dispatched (the banner makes the plan govern meanwhile).
- Ben's item-9 decision on PR-merge delegation is unanswered; the plan defaults to founder-reserved.
- No hooks were bypassed: the repo has no active pre-commit hook (only `.sample` files) and no `core.hooksPath`; the commit was made with hooks disabled as a precaution, which changed nothing.

## Next action

Independent GPT-6 Astra review of commit `4a6892a22c9cd69e3cbd5795d2210abf5f35dbab` on `claude/plan-rev24-adopt` (diff `git diff 694e9e1..4a6892a`; the plan-only diff against the frozen proposal is `diff scratchpad/jobguard/freeze-20260925T161327Z/files/BUILD_PLAN.md .worktrees/plan-rev24-adopt/BUILD_PLAN.md`). Claude authored it and must not be its checker. Merge is Ben's.
