# Q27 · V2-PX: proof photos on the V2 practice database (batch C2)

> **Released 25 Nov 16:00 UK (planner).** **Builder:** a Claude Opus thread. It must run the failing upload path on a live V2 database first (finding 1 below), so it isn't for Codex's sandbox. **Base:** `v2/main` @ 63f3af5ab or later. **Branch:** `claude/<thread>`. **PR:** draft into `v2/main`. **RED.** The web Codex plan check (7147269615) is binding. A fresh Claude RED plan check is requested on frm-management-layer#3. Build now; the PR isn't ready until that verdict lands. Rules 1 to 28 apply, with a "Rules met" list in the PR body. **Migration:** none expected. 2025 is reserved if one turns out to be needed; stop and say why first.
>
> **Planner re-check against v2/main @ 63f3af5ab (rule 23):**
> - `packages/db/src/practice-proof-image.ts`, `tools/v2/bootstrap.mjs`, `tools/v2/seed.mjs` and `tools/v2/seed.integration.test.mjs` all exist.
> - F6 (#923) isn't merged, so **split the browser case**. This PR proves the seed, its idempotence, the bytes' SHA-256 and MIME type through the API, the second-firm refusal, and that main's 42501 still holds.
> - The F6 page case (selected photo shows, unselected one never appears) goes in a second small PR into `codex/sandbox/v2-f6t`, after this PR's seed is merged into that branch.
> - The checklist path below is outdated: use `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md`.

# Packet V2-PX: customer-visible proof photos in the V2 practice database (RED, Astra first)

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, `codex-queue/01-RULES.md` (rules 5 to 7, 12, 15 and 16), and Ben's build rules checklist `/mnt/project-files/audits/build-rules-checklist.md` (version 1). **No change to any main migration, function, grant, RLS policy or database-name check.**

**Status:** written by the planner 24 Nov 22:55 UK. **Goes to Astra before anyone builds it.** Builder: a Claude thread (security boundary), not the Codex queue. Migration: none expected. If one turns out to be needed, stop and ask the planner for a number; the next free one is 2024.

## What was found (verified by the planner in the repo)
F6T (#928) and F6 (#923) set up a variation photo by calling the live app's practice proof command (`POST /api/jobs/:id/proof`, `select_generated`, fixture `completion-photo`). On the V2 database this fails with PostgreSQL 42501. That is **by design on main**, not a missing grant:
- `packages/db/migrations/0734_job_proof_statement.sql` makes every practice proof function `SECURITY DEFINER`. They refuse with `FORBIDDEN` (42501) unless the request carries a practice credential binding (`app.lp6_bound_request()`, 0562) for a live `synthetic_demo` practice session.
- Some of them also refuse unless `current_database() = 'jobguard_synthetic_demo'` (for example line 190).
- V2 runs on its own local database and refuses to point at the demo one (V2 chunk A rule), so main's practice proof path can never run there.

**Decision:** don't widen main's proof boundary. A migration that adds V2's database name, or grants V2 roles access to these functions, would weaken a deliberate main safety rule to fix a test fixture. Rejected.

## Goal
The V2 practice database gets customer-visible proof photos for the fictional job through the **V2 seed**, so F6's customer approval page (and later K3's Friday update) can show and test real photo references without using main's demo-only proof command.

## Scope
- In the V2 seed (`tools/v2/bootstrap.mjs` / the V2 seed module; shared-file rule 5 applies, so add your own block only), insert fixture proof media for the fictional job as the V2 migration or seed role. Use the same tables, the same tenant columns, and the existing practice image bytes (`packages/db/src/practice-proof-image.ts`). There is no `customer_visible` field; visibility comes from F6's per-link photo selection (the builder ticks photos for that link), so the seed only provides photos for the builder to choose from.
- Every inserted row must be one the live proof command could have produced: same columns, same constraints, same visibility flag. No new table, column, grant or policy.
- Prove that the runtime role still can't write or read proof outside its tenant (second-firm test). Prove that main's proof functions still refuse on the V2 database (42501), so the boundary is unchanged.
- Then add one F6 browser case showing the seeded photo on the customer page at 360 and 1280 px. This piece owns it, or it goes to F6T's follow-up if F6T is still open.

## Web Codex plan-check findings (frm-management-layer#3 comment 7147269615, 24 Nov), binding for the builder
These are a reviewer's findings, not Astra's verdict. Building still waits for Astra.
1. **Find the real failing path first.** #928 uploads through `EvidenceService.beginUpload`/`finalize`, not the proof command. Before writing any seed, run that path on the V2 database, record its exact SQLSTATE and the function that raises it, and put both in the PR body. If the cause is not a deliberate demo-only boundary like 0734, stop and report, because the right fix may differ.
2. **Seed provenance stays separate from receipts.** A seeded image proves only that the page serves the right photo, not that a verified upload happened. Mark seeded rows by provenance, never write a fake verified-upload receipt, and never present seeded media as uploaded.
3. **Keep every database check and trigger on.** Migrations 0767 and 0025 tie originals to the verified upload and its bytes. If the seed can't meet those invariants with checks and triggers enabled, **hold the approach** and report. Don't disable, bypass or weaken anything.
4. **No audit event per row.** This is fixture data written by the seed, not a user command.
5. **Idempotent.** Run the seed twice; the second run adds zero rows (test).
6. **Test the bytes, not the picture.** In the browser and API tests, check the HTTP response body's SHA-256 against the seeded bytes, and check its MIME type, not just that an image appears.
7. **Unselected photo stays hidden.** Seed a second photo on the same job that the builder does not select for the link; it must never appear on the customer page or in its responses.

## Done when
- The V2 seed gives the fictional job two photos with seed provenance. The one the builder selects shows on F6's customer page at both widths and in phone mode, with matching SHA-256 and MIME type. The unselected one never appears. A second seed run adds nothing.
- `git diff` touches no file under `packages/db/migrations/` and no grant or policy.
- Main's proof functions still return 42501 on the V2 database (test).
- The full V2 seed suite passes without tripping the sign-in rate limit (rule 16c).
- CI green apart from Vercel. A different session checks it. One build plus up to two repairs.
