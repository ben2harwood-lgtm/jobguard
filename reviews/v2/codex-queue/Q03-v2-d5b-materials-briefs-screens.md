# Q03 · V2-D5B: product picker, Materials and Briefs screens (second half of D5; the Measurements screen moved to V2-D5A)

Tier: T1 (screens), unless the builder needs a new table, which makes it RED. Repo: ben2harwood-lgtm/jobguard. Plan: rev 1.2 chunk D, piece v2-d5, and section 3 (what people see), on branch `coordinator/briefs-1120`. Start only after D3 and D4 pass Codex review.

## Goal
A builder can go from an accepted quote to a usable enquiry and both crew briefs using only the screens, on a phone and on a desktop. View and internal export only. Nothing is sent.

## Before you start
Check GitHub for any `v2-d5` branch or PR. Compare against the merged clickable mock-ups (`v2-mock`, PR #895) and the section 3 text; the screen rule says the screen follows the checked mock.

## Base and branch
**Starts:** now. Rework risk: **high** (D3, D4 and D5A are all still in review). Rules: `01-RULES.md`.
Make `codex/sandbox/v2-d5b` from D5A's branch `codex/sandbox/v2-d5a` (#914), then merge D3 (`claude/project-thread-8zze8p`, #912) and D4 (`claude/project-thread-btt9d2`, #916) into it. All three sit on d1, so the merges should be clean; stop and report if not. Draft PR against `codex/sandbox/v2-d5a`. When D3, D4 or D5A move, merge them in again.
Do not edit D3, D4 or D5A files; call their commands and queries. If product choices need a store D3 doesn't provide, stop and report (that would be a table, so RED).

## Scope
- (The Measurements screen is built in V2-D5A; reuse it, do not rebuild it.)
- A simple way to pick each product, its pack size and the firm's wastage allowance.
- Materials screen: edit supplier, needed-by date, who supplies each item, enquiry notes, and correct every input to the sums. Shows "out of date" and clashing edits from D3.
- Briefs screen: one brief per trade from D4, with internal export.
- Inside the job's Work tab next to c4's Plan view, V2 only (`JOBGUARD_LOCAL_V2 === "1"`); the non-V2 Work tab is unchanged.
- Saved only after the server confirms; stale version refused plainly with a reload.
- `config/lanes/<your lane>.json` lists exactly your files and branch.

## Done when
- Playwright run on the fictional job at 360 px and 1280 px: confirm measurements, pick products, reach a usable enquiry and both briefs; edits survive reload.
- Zero paid AI calls. Generating creates zero outbox rows, orders or messages, and the local catcher receives nothing.
- Screenshots beside the matching mock states.
- The phone-mode run is recorded on Ben's Mac (the cloud has no home-network address).
- CI green apart from the known Vercel check. A Claude session checks it. One build plus up to two repairs.
