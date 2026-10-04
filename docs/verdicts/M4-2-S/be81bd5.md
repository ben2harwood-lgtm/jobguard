# Verdict M4-2-S — PR #85 — head be81bd5ce92a8c79a91b6575271d0496a2c77970 — HOLD

**Reviewer:** Claude reviewer agent, fresh context; did not build this. Retrospective independent verdict (merged to main as 8c2b0fe without one). Bound to head `be81bd5` only; merge-base with main-before-merge is `64398d8`, so the reviewed diff is `git diff 64398d8 be81bd5` (20 files, +129/−20; commits fe229e1 + be81bd5). Note the PR body cites a different branch/SHA (`codex/build-m4-2-s-eligibility-review` @ 29d674c) than the real head; the lane registration was corrected in be81bd5 to the real branch `codex/implement-m4-2-s-functionality-in-jobguard`, which matches lane `m4-2-s`.
**Contract:** BUILD_PLAN.md §30 M4-2-S (lines 1847–1854) plus §13.2 C1–C8. Builder receipt under `docs/verdicts/`: none.

## Commands run (scratch worktree at be81bd5, `pnpm install --frozen-lockfile` clean)
| Command | Exit | Result |
|---|---|---|
| `pnpm -r build` | 0 | OK |
| `pnpm typecheck` | 0 | 0 TS errors |
| `pnpm openapi:check` | 0 | spec matches (adds `POST /jobs/{id}/recovery-cases/eligibility`) |
| `GITHUB_EVENT_NAME=pull_request GITHUB_EVENT_PATH=<head.ref=lane branch, base=64398d8, head=be81bd5> pnpm lint:lanes` | 0 | lane `m4-2-s`, all 20 files inside allow-list |
| same env, `pnpm lint` | 0 | core purity (56 files), lane, money-arithmetic, commercial-boundary all passed |
| `pnpm --filter @jobguard/core test` / `api` / `web` / `ai` | 0/0/0/0 | 276 / 73 / 36 / 72 passed (core includes the 9 new D03 cases) |
| `pnpm test:db` | — | **NOT RUN**: same machine gap as M4-1-S — embedded-postgres `initdb` aborts (`dyld: Library not loaded: @loader_path/../lib/libicudata.68.dylib`); no Docker or system Postgres. Not repaired per coordinator instruction. |
| `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-2-S.spec.ts` | — | **NOT RUN**: e2e global-setup needs the same embedded Postgres. |

Builder claims of DB (4 + 22 tests) and Playwright (4 tests) passes remain unverified assertions.

## Findings (severity, file:line)
1. **MEDIUM — a superseded review can be approved without a fresh review.** `packages/db/src/recovery-case-repository.ts` `eligibilityCommand`, approve branch: it checks review/case/evidence/policy revisions and `classification==="eligible_for_review"`, but never checks `old.status`. After `supersede` (which copies the old classification into a new row with status `superseded` and bumped evidence/policy revision), an approve carrying the *new* revision numbers passes every check and writes `status:"approved"`. The contract says superseded evidence "invalidates outstanding approval" and the stale click must send the user back to re-review; the server only enforces the stale path, and the UI's disabled button is the sole guard. The DB test only asserts the stale-revision path. Same gap lets an already-approved review be approved again (LOW).
2. **MEDIUM — "actual authorized reviewer" is a literal.** `apps/api/src/recovery-case.application.ts` passes `"practice-owner"` as `authorizedReviewer`; nothing derives it from the verified membership. The repository shape is right (server parameter, not client field) but the value is fixed, so Done-when 1's "actual authorized reviewer" is nominal. Inherited demo-context pattern noted; still not the contract.
3. **LOW/MEDIUM — the classifier decides from a client-chosen label and calls it "Verified".** `packages/core/src/recovery-eligibility.ts:20` returns reason `Verified evidence attributes settled customer money to this claim` whenever the client sends scenario `evidence_backed_withheld_payment`; `evidenceRevision` is also a client-supplied integer with no link to `app.evidence_object`. Acceptable as a table-driven synthetic simulation, but the word "Verified" asserts a check that does not happen and sits close to the banned "bank-verified" register. Suggest "Evidence cited as attributing…".
4. **LOW — e2e coverage vs C7.** `apps/web/e2e/M4-2-S.spec.ts`: second test (exclusions + stale) performs no reload/second-context check after the negative paths; neither test opens the job "from Jobs" (deep link used); no keyboard-focus assertion. Sandbox banner count and overflow are asserted once.
5. **LOW — process.** PR body's branch/SHA disagree with the merged head; no receipt in `docs/verdicts/M4-2-S/`.

Checked and clean: migration `0035_recovery_eligibility.sql` — owner `jobguard_migration`, ENABLE+FORCE RLS, tenant policy, runtime SELECT/INSERT only, tenant/job-qualified FK to `recovery_case`, `policy_version` CHECK pinned to `reference-d03.v1` (production D03 untouched), pence bigint with 1e12 bound, `UNIQUE(tenant_id,command_id)`; replay with payload-hash conflict; advisory lock per case; typed `ELIGIBILITY_STALE_REVISION` → 409 with the exact message `Review the changed evidence before approving`; forged `eligible:true` rejected by `.strict()` (DB test asserts); approve refused for excluded/pending classifications (`ELIGIBILITY_NOT_APPROVABLE`); approval never touches landing/fee totals (`case-landed-net` stays £0.00, no posting routine exists); Next route is a thin authenticated adapter over the shared seam; all six exclusion strings match the contract verbatim; unknown basis/causation → `pending_review` / "Non-billable — pending review"; no new SECURITY DEFINER; no external calls; no statutory-deadline wording; single global banner.

## Why HOLD, and exact repairs
HOLD because DB and both Playwright projects could not be executed here (missing evidence is a hold), and finding 1 is a real server-side gap in the leaf's own invariant.
- R1. Run `pnpm test:db` and the M4-2-S e2e (both projects) where embedded-postgres loads; attach counts.
- R2. In the approve branch require `old.status==="reviewed"` (reject `superseded` and `approved` with a typed code) and add a DB test: review → supersede → approve-with-new-revisions must fail.
- R3. Derive `authorizedReviewer` from the verified membership rather than the literal.
- R4. Reword the eligible reason to avoid "Verified".
