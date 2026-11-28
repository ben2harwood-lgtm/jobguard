# Q03 · V2-D5B: product picker, Materials and Briefs screens (second half of D5; the Measurements screen moved to V2-D5A)

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: T1 (screens), unless the builder needs a new table, which makes it RED. Repo: ben2harwood-lgtm/jobguard. Plan: rev 1.2 chunk D, piece v2-d5, and section 3 (what people see), on branch `coordinator/briefs-1120`. Start only after D3 and D4 pass Codex review.

## Change, 24 Nov 21:40 UK (after Codex stopped on two blockers)
- **Split.** This packet is now **D5B-M: product picker and Materials screen only**, and it can resume now from the kept local base merge. The **Briefs screen (D5B-B)** waits until D4A (audit append in `v2-crew-brief-repository.ts`) is pushed, which needs Ben's OK for a third round. Do not build or show brief generation until then.
- **Mount-only edit allowed** in `apps/web/app/(designed)/jobs/[id]/work/page.tsx` (D5A's file): add the V2-only entry point for Materials (and later Briefs) beside Plan and Measurements, behind `JOBGUARD_LOCAL_V2 === "1"`. Nothing else in that file changes: no refactor, no restyle, no change to D5A's own sections. List it in your lane file with the note "mount only, owned by D5A". If #914 moves, merge it in again; this branch resolves any conflict (the later piece resolves).
- **Rounds.** The stop was outside the packet, so resuming continues build round 1. Two repairs remain.

## Goal
A builder can go from an accepted quote to a usable enquiry using only the screens (both crew briefs come with D5B-B), on a phone and on a desktop. View and internal export only. Nothing is sent.

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
- (Briefs screen: D5B-B, after D4A. One brief per trade from D4, with internal export.)
- Inside the job's Work tab next to c4's Plan view, V2 only (`JOBGUARD_LOCAL_V2 === "1"`); the non-V2 Work tab is unchanged.
- Saved only after the server confirms; stale version refused plainly with a reload.
- `config/lanes/<your lane>.json` lists exactly your files and branch.

## Done when
- Playwright run on the fictional job at 360 px and 1280 px: confirm measurements, pick products, reach a usable enquiry; edits survive reload. (Briefs in D5B-B.)
- Zero paid AI calls. Generating creates zero outbox rows, orders or messages, and the local catcher receives nothing.
- Screenshots beside the matching mock states.
- The phone-mode run is recorded on Ben's Mac (the cloud has no home-network address).
- CI green apart from the known Vercel check. A Claude session checks it. One build plus up to two repairs.
