# M4-2-S-R repair 4 — builder receipt

Date: 2026-10-04. Builder: **Claude Sonnet 5.5** (repair 4, after Codex repair 1 and Sonnet repairs 2 and 3).
**Implementation and test evidence only. Not an independent verdict, not independently verified, not technically accepted.**
Inputs: Claude Opus re-review PASS on `36362d1` (PR comment) and the GPT-6.1 Sol high REPAIR on `36362d1`:
`~/.local/share/full-steam/jg-runs/m4-2-s-r-solcheck-20261003T234651.md`. Both are bound to `36362d1`; this repair changes the e2e spec, so a fresh or rebound verdict is needed.

Branch `codex/sandbox/m4-2-s-repair`, PR #102. Starting point `36362d1`; `origin/main` was `b039abf` throughout and is already contained, so no merge was needed. Test-only change: **no production code, migration, grant, RLS, role or routine changed.**

## Finding

| Source | Finding | Status | Where / evidence |
|---|---|---|---|
| Sol P2 | C1's second browser context is not exercised: `context.newPage()` is another tab of the same context | **FIXED** | `apps/web/e2e/M4-2-S.spec.ts`: new helper `secondContextReads`. It builds a separate `browser.newContext()` carrying only the practice-session cookie `jg_session` (exactly one such cookie is required) and a second cookie-less context that must get HTTP 401 from `/api/jobs/:id/recovery-cases`, which shows the cookie is what authenticates. From the separate context it asserts, from the server response: case ID and revision equal the first context's, job ID, case type `withheld_customer_payment`, book `builder_customer`, source type `customer_invoice`, source `Generated customer invoice INV-18800`, claimed £320 (32,000 pence), landed 0, and the saved eligibility revision number, status, evidence revision, policy revision, policy version `reference-d03.v1` and reviewer `membership:d1500000-0000-4000-8000-000000000003`; and from the rendered page: the job ID on the workspace, status text, reviewer, revisions text, landed £0.00, source type, book and the source link. It runs after approval (revisions 1/1), after evidence supersession (superseded, 2/1), after the re-approval (approved, 2/1), after policy supersession (superseded, 1/2) and after the policy re-approval (approved, 1/2): five reads, all in a context that is closed afterwards. No `context.newPage()` remains in the spec |

Unchanged and still **OPEN FOR BEN** (Sol and Opus both treat them as decisions, not defects):
1. Finding 4: the literal click on a Jobs card. Captured practice jobs are by design not listed on the Jobs home; the spec goes to Jobs and then opens the saved job on a fresh navigation.
2. Finding 5: the text of merged PR #85 (a correcting comment is the only fix, and it is a GitHub write).

Merge note (unchanged from repair 3): #103 relabels `case-fee` to "Not calculated here" while this spec asserts `£0.00`; whichever PR merges second reconciles that assertion.

## Tests first

This finding is missing coverage, not a production defect, so there is no red run of production code. The red state was Sol's source assertion on the previous spec (same-context tabs). The new check is shown to depend on the cookie by its own 401 assertion for a cookie-less context. No mutation run was made.

## Commit

| SHA | What |
|---|---|
| `26282d9` | test(web): read the saved job from a separate browser context (C1) |
| this receipt | docs only |

No lane registry change this round (`apps/web/e2e/M4-2-S.spec.ts` was already allowed).

## Commands actually run

Node v24.17.0, pnpm 10.28.1 (pinned). The browser run used `heavy-slot m42r`, waited for ports 3000 and 55432 to be free, and checked shared memory first (1 live segment, no leaks).

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck --force` | 0 | 7 of 7 tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0 | core purity (69 files), lane boundary, money-arithmetic, 7 of 7 tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `m4-2-s-repair`, all changed files inside the allow-list |
| `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-2-S.spec.ts -c <local override>` | 0 | 6 passed (3 tests in each of 2 projects), 15.3 s, against the current production build and the real embedded database |

Not re-run, because the change is the e2e spec only and no source under test changed since the repair 3 runs: `pnpm build`, `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm openapi:check`, and the M4-1-S and M4-3-S e2e. Their last results are in `BUILDER_RECEIPT_repair3.md` (all exit 0 on the identical production code) and in CI for `36362d1` (`checks`, `secrets`, `dependency-review` green; Playwright 164 passed). GitHub CI for this head is reported in the PR.

## NOT RUN, deviations and environment

- Browser binary deviation, unchanged: Playwright 1.55.1 needs `chromium_headless_shell-1193`, not installed here and not downloaded. A local override config outside the repo (not committed) imports the real `playwright.config.ts` and only sets `executablePath` to the installed `chromium_headless_shell-1234` (Google Chrome for Testing 151.0.7922.34). Tests, projects, viewports, timeouts, retries and assertions are the repo's.
- Not run: `pnpm eval`, the full e2e suite across every spec, `pnpm test:regression`, `pnpm test:restore`, a clean (non-offline) install.
- The cookie handling relies on the existing synthetic practice session (`jg_session` is a generated UUID accepted by format). It proves the persisted state is readable in an independent context; it is not a real-user authentication test.

Environment: macOS 26.4 (Darwin 25.4.0, arm64); Node v24.17.0; pnpm 10.28.1; Playwright 1.55.1; vitest 4.1.11; embedded-postgres 16.10.0-beta.15 (PostgreSQL 16.10).

## Status

Test-only repair implemented, run locally and committed. Not independently verified, not accepted. Open for Ben: finding 4 (Jobs-card click) and finding 5 (PR #85 text). A fresh or rebound different-model verdict on the final head and separate technical acceptance are still required.
