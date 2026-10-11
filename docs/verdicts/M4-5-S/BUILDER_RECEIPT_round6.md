# M4-5-S — builder receipt, round 6

7 October 2026. PR #106, branch `codex/sandbox/m4-5-s-r2`, worktree `m4-5-s-fresh`.
Starting HEAD: `2213c08b0341e8ecfe0a2d696808bbdf42dedfd2` (clean tree). Repairs the independent Claude Opus REPAIR verdict bound to that head (comment 6047337966). No push, merge, PR change or acceptance was performed; the dispatcher binds CI and the rebound verdict to the commit this round creates.

**Test and display repair only; technical acceptance remains on hold for exact-commit CI and independent review.** No migration, API, product-logic, lane-registry or assertion change beyond the four items below. Synthetic data only.

## Repairs

### P1-1 (blocking): supplier test could not find the document picker

`apps/web/e2e/M4-5-S.spec.ts` (supplier test, was line 188) used `getByLabel("Generated document", { exact: true })`. The picker is a `<label>` wrapping the `<select>`, so its accessible label text includes the option text and an exact match never succeeds. The test now uses `page.locator("#supplier-documents select").first()`, the same panel-scoped approach the M2 supplier specs use, held in one `documentPicker` constant and used for both `toBeEnabled()` and `selectOption(fixtureId)`. Every assertion after it is unchanged, and no timeout was added or lengthened.

Not run locally: the browser suite. All 32 of 32 System V shared-memory segments on this Mac are in use (`kern.sysv.shmmni` = 32), so embedded PostgreSQL cannot start; not retried. CI must run this spec in both projects. If the steps now reached after the picker fail, that is a real code defect for a later round and must not be loosened in the test.

### P3-1: delivery picker could read " · <uuid>"

`apps/web/app/ui/recovery-cases.tsx`: `document_number` is typed nullable (it is nullable in the database), and the option label comes from a small `deliveryLabel` helper: the trimmed document number when present, otherwise `Document <first 8 characters of the id>`. The raw id is no longer shown beside a number. The option value stays the full id.

Tests, in `apps/web/app/ui/recovery-messages.test.tsx`: the existing picker test now also asserts the option reads exactly the number; a new `it.each` covers an empty, a blank and a missing (null) number and asserts the short fallback label and that no ` · ` separator appears. Red before: 4 failed / 5 passed against the round 5 component (the strengthened existing test plus the three new cases); green after: 9 / 9.

### P3-2: stranger-page check could pass before the page rendered

Before `toHaveCount(0)` on `pursuit-body`, the test now waits for `getByRole("heading", { name: "You cannot open this job", exact: true })` to be visible (same locator as `SBOX-resume.spec.ts`), using the default timeout. The `toHaveCount(0)` assertion is kept.

### P3-3: §14.3 follow-up moved into the table

`BUILD_PLAN.md` is in the `m4-5-s` lane (its exact path is in the lane entry). The follow-up bullet above the section's instruction paragraph was removed and re-entered as a dated row, 2026-10-07, in the table's Date / Finding / Related / Proposed handling format, with the same content (claim `app.command_receipt`, reject IDs held by any recovery/shared command family, sequential and concurrent reuse, receipt-before-case locking, recovery-to-pack side already covered, reverse paths outside this lane).

## Commands and exits

Node and pnpm 10.28.1 as installed in the worktree; existing dependencies reused, no install, no lockfile change.

| Command | Exit | Evidence |
|---|---:|---|
| `pnpm typecheck` | 0 | 7/7 tasks (web re-ran; 6 cached) |
| `pnpm --filter @jobguard/web exec vitest run` | 0 | 12 files, 109 passed (was 106) |
| `pnpm --filter @jobguard/web exec vitest run app/ui/recovery-messages.test.tsx` with the round 5 `recovery-cases.tsx` temporarily restored (then put back) | 1 | Red before: 4 failed, 5 passed |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/M4-5-S.spec.ts` | 0 | 12 tests collected: 6 mobile-360, 6 desktop |
| Lane lint with simulated pull-request metadata | see hand-off message | A commit cannot contain its own SHA, so this is run against the committed head after this receipt is committed |

## Not run

Browser execution of `M4-5-S.spec.ts` and every PostgreSQL suite (shared memory exhausted, see above). No new independent verdict or acceptance is claimed. The stale PR description (Opus P3-4) is the integrator's to update on the next push.
