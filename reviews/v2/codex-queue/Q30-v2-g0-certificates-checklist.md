# Q30 · V2-G0: certificates checklist by job type (batch C4)

**Tier:** T1 (data file plus one panel; the ticks stay on the device for now and are saved by G2's handover pack later; no migration). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Base:** `v2/main` @ 63f3af5ab or later. **Branch:** `codex/sandbox/v2-g0`. **PR:** draft into `v2/main`. **Planner:** Fable thread, 25 Nov 16:00 UK. Use ★★, effort S. Migration 2026 was reserved but isn't used, so leave it unused.

## Rules this piece must meet
`01-RULES.md` (rules 1 to 28) and `02-BUILD-RULES-CHECKLIST.md`, with a "Rules met" list in the PR body.

## Dry-check (planner, 25 Nov 15:55 UK, rule 23)
- The template key is `splashback-decorating.v1`, in `packages/db/src/v2-splashback-decorating-template.ts` (v2/main). It has tasks `prepare-splashback`, `tile-splashback`, `prepare-hall` and `paint-hall`, with `proofPoints` and `customerChoices`. **Don't edit that file.**
- The pattern to copy is C5's prompt data (#921, branch `claude/project-thread-g02v99`, not merged): `apps/web/app/ui/v2-quote-prompts.ts`, keyed by template key with `V2_QUOTE_TEMPLATE_KEY`, plus a panel and a pure unit test. Copy the shape, not the file. **Don't import from #921**, because it isn't merged.
- The Records tab is `apps/web/app/(designed)/jobs/[id]/records/page.tsx` (it exists on `codex/sandbox/v2-d5b`; confirm it's on your base, and if not, stop and report).
- `apps/web` has no jsdom, so test the data and the pure status logic, not the rendered component (see Q25's note).

## What to build
1. `apps/web/app/ui/v2-certificates.ts`: `v2Certificates: Record<templateKey, Certificate[]>`, with `{ key, label, when, whoIssues, needed: "always" | "if" }`. For `splashback-decorating.v1`:
   - **Electrical work certificate (Part P / BS 7671 Minor Works)**, needed only if a socket or spur is moved or added behind the splashback; issued by a registered electrician.
   - **Gas Safe check**, needed only if a hob or gas pipe is disconnected or moved; issued by a Gas Safe engineer.
   - **Manufacturer's tile adhesive and grout data sheets**, always; kept for the handover pack.
   - **Paint product data and colour references**, always; for touch-ups.
   - **Waste transfer note**, needed if a skip or waste carrier is used.

   Each entry has wording a builder would recognise. JobGuard never says a certificate has been issued; the builder records that.
2. `apps/web/app/ui/v2-certificates-panel.tsx`:
   - each certificate with "Got it", "Not needed" (asks why, max 200 characters) or "Still needed";
   - the state is kept in `localStorage` under a key with the job id, read and written inside try/catch;
   - a banner says "Saved on this device only. The handover pack (coming later) keeps the final list".
3. **One mount** in `records/page.tsx`: one import line plus one element, only when `process.env.JOBGUARD_LOCAL_V2 === "1"`. Put it in your lane file with the note "mount only".
4. Tests: every certificate entry is complete; the "if" entries have a `when`; the status logic handles "Not needed" without a reason as invalid; and the storage key includes the job id.

## Done when
Unit tests pass, CI is green apart from Vercel, and a Claude check has been done on the frozen head. The screen follows M3's Certificates mock-up once that has merged. If M3 hasn't merged, follow this packet's wording, and a later small piece aligns it.
