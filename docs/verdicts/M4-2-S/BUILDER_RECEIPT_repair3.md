# M4-2-S-R repair 3 — builder receipt

Date: 2026-10-03. Builder: **Claude Sonnet 5.5** (repair 3, after Codex repair 1 and Sonnet repair 2).
**Implementation and test evidence only. Not an independent verdict, not independently verified, not technically accepted.**
The earlier PASS (Claude Opus, head `e957ef6`) and REPAIR (GPT-6.1 Sol high, head `e957ef6`) are bound to that head. This repair changes the code, so both need a fresh or explicitly rebound verdict.

Branch `codex/sandbox/m4-2-s-repair`, PR #102. Starting point `e957ef6` (repair 2 merged with `origin/main` `3e0764b`). Implementation head for this receipt: `6f78d8f`. After the first push `origin/main` moved to `b039abf` (#96, D13-16-IDS) and PR #102 became CONFLICTING, which also stopped GitHub Actions from starting, so `544647b` merges `origin/main` into the branch (a merge commit, no rebase, no force). The only conflict was the one-line lane registry: main's registry was kept (including its new `d13-16-ids` lane) and this task's own entry was re-applied; a JSON comparison shows the result differs from `origin/main` only in lane `m4-2-s-repair`. This receipt is committed on top of the merge, docs only.
Inputs: `~/.local/share/full-steam/jg-verdicts/M4-2-S-R-e957ef6.md` (Opus) and `~/.local/share/full-steam/jg-runs/m4-2-s-r-solcheck-20261003T214601.md` (Sol).

## Findings from the two checks

| Source | Finding | Status | Where / evidence |
|---|---|---|---|
| Sol P2, Opus P2-1 | The page hardcodes revision 1: Approve sent `expectedPolicyRevision: 1` after a policy supersession (refused as stale), and re-review reset evidence and policy to 1, so an approval could bind to a superseded revision | **FIXED** | `apps/web/app/ui/recovery-eligibility-command.ts` (new, pure) builds the review, approve, supersede and stale-approval commands from the saved eligibility record; revision 1 is used only for a case's first review. `recovery-cases.tsx` now calls it at exactly the three call sites (`review`, `approve`, `stale`). Server side: `packages/db/src/recovery-case-repository.ts` review branch refuses any `evidenceRevision` or `policyRevision` below the recorded one with the typed `ELIGIBILITY_STALE_REVISION` (existing 409 and message). Tests: web unit test (7), DB tests (2 revision cases), browser journey *re-reviews and approves at the later policy revision after the policy is superseded* (policy supersession, reload, re-review, approval at policy revision 2, second context), and the evidence journey now asserts evidence revision 2 is retained |
| Opus P2-2 | Merge coordination with #103 and #101 | **NOT A CODE FINDING; note for the merge** | Both siblings also edit `recovery-cases.tsx`, `recovery-case-repository.ts`, `recovery-cases.integration.test.ts`, `recovery-case.application.ts` and the lane registry. This repair keeps its component change to the three revision call sites. `M4-2-S.spec.ts` asserts `case-fee` = `£0.00` while #103 changes that label to "Not calculated here"; whichever PR merges second must reconcile that one assertion (this repair's new journey also asserts it) |
| Opus P3-3 | Case advisory key used the raw case ID | **FIXED for the eligibility path** | `eligibilityCommand` now uses the lower-case ID for the advisory lock, queries, revision row, audit subject and result lookup. DB test: two concurrent approvals, one with an upper-case ID, give one effect and a typed refusal, and the audit subject is the canonical ID. The `command()` path and the landing routine belong to #103 and were left alone |
| Opus P3-4 | Membership `FOR SHARE` works only because runtime holds UPDATE on `app.membership` | **FIXED (comment)** | Comment at the lock in `recovery-case-repository.ts` naming `0000_tenancy.sql` |
| Opus P3-5 | Reviewer is the fixed synthetic demo principal | **UNCHANGED, as labelled** | Sandbox principal bridge, not real authentication; later work |
| Earlier OPEN FOR BEN | Finding 4: literal click on a Jobs card (captured practice jobs are not listed on the Jobs home by design); finding 5: PR #85 body text | **STILL OPEN FOR BEN** | Both checks treat them as decisions, not defects. Opus: accept the substitute and add a one-line correcting comment on #85 if the GitHub record should be tidy |

No migration (0044 stays unused). No grant, RLS, role, routine, posting, fee or landing path touched. No test weakened, skipped or retried; no timeout changed.

## Tests first (red evidence kept)

- DB, before the server change: `recovery-cases.integration.test.ts` exit 1, 9 passed / 3 failed. Two failures were the lower-revision review being accepted (`promise resolved instead of rejecting`); one was the upper-case ID race ending in a raw `duplicate key value violates unique constraint` instead of a typed refusal.
- Web unit test written before its module existed: exit 1, `Cannot find module './recovery-eligibility-command'` (module-missing red, so not a behavioural red). The behavioural red is the browser run below.
- Browser, desktop, with the server fix built but the page still on literal 1: exit 1, 2 failed. The evidence journey stayed at `Review superseded` (`toBeEnabled` failed) and the new policy journey got `Expected: "Ready for approval", Received: "Review superseded"`. After wiring the page: 6 of 6 passed.

## Commits

| SHA | What |
|---|---|
| `89b1fd9` | fix(db): lower-revision review refusal, canonical case ID, membership-lock comment (with 3 new DB tests) |
| `6f78d8f` | fix(web): revisions from the saved review; pure command module and unit test; new browser journey; lane entry paths |
| `4fcb4c8` | docs: this receipt (first version) |
| `544647b` | Merge `origin/main` `b039abf` (lane registry conflict resolved as described above) |
| this receipt update | docs only |

Lane registry: own entry `m4-2-s-repair` only; added exact paths `apps/web/app/ui/recovery-eligibility-command.ts` and `.test.ts` (JSON comparison against `HEAD`: no other lane changed).

## Commands actually run

Node v24.17.0, pnpm 10.28.1 (pinned, corepack). All database and browser commands ran under `heavy-slot m42r`. `--force` means turbo could not replay a cache. Logs are local files, not committed.

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck --force` | 0 | 7 of 7 tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0 | core purity (69 files), lane boundary, money-arithmetic, 7 of 7 tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `m4-2-s-repair`, all changed files inside the allow-list (this check covers the working tree) |
| `pnpm build --force` | 0 | 7 of 7 tasks, 0 cached |
| `pnpm openapi:check` | 0 | spec matches (no OpenAPI change) |
| `pnpm test --force` | 0 | 13 of 13 tasks. Tool tests 39; core 68 files / 384 tests; api 12 / 83; web 8 / 63; ai 3 / 72; config 2 / 2; storage 2 / 4; db 34 files / 158 tests |
| `pnpm test:db` | 0 | 34 files, 158 tests, 0 skipped |
| `pnpm test:migrations` | 0 | 2 files, 11 tests |
| `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-2-S.spec.ts -c <local override>` | 0 | 6 passed (3 tests in each of 2 projects), 14.1 s |
| Same for `M4-1-S.spec.ts M4-3-S.spec.ts` (same component) | 0 | 4 passed |

After the merge with `b039abf` (config and tooling files only), on the merged tree: `pnpm typecheck --force`, `pnpm lint --force`, `pnpm lint:lanes` and `pnpm build --force` exit 0 (7 of 7 tasks each, 0 cached); `pnpm test --force` exit 0 (13 of 13 tasks; tool tests 39; core 384; api 83; web 63; ai 72; config 2; storage 4; db 34 files / 158 tests); `CI=1 ... M4-2-S.spec.ts` exit 0, 6 passed. `pnpm test:db`, `pnpm test:migrations` and the M4-1-S/M4-3-S e2e were not re-run on the merged tree (their code and files are unchanged by the merge; the first and third are covered by `pnpm test` and CI).

GitHub Actions on `544647b` (run 37158477833): `checks` success (typecheck, lint, `pnpm test` with web 63, api 83, ai 72 and db 33 files / 155 tests, build, Playwright 164 passed on the pinned Chromium), `secrets` success, `dependency-review` success; PR mergeable again.

Two earlier attempts of the DB and regression commands failed for environment reasons and are **not counted**; the passing reruns above are on the identical tree:
- `pnpm test --force` (ledger suite) and `pnpm test:db` (UIWIRE-12 suite): "Postgres init script exited with code 1". Cause: SysV shared memory was exhausted again (33 segments against a limit of 32; 30 were leaked by dead processes from other agents' runs, 0 attached). I removed those 30 with `ipcrm` (creator dead, nothing attached; the 2 live ones were kept). The leak recurs within hours, so someone should schedule that cleanup.
- Regression e2e: `http://127.0.0.1:3000 is already used`. Another project's e2e held the fixed ports 3000 and 55432. The rerun waited until both ports were free.

## NOT RUN, deviations and environment

- **Browser binary deviation, unchanged from repair 2.** Playwright 1.55.1 needs `chromium_headless_shell-1193`, which is not installed here and was not downloaded. The runs use a local override config outside the repo (not committed) that imports the real `playwright.config.ts` and only sets `executablePath` to the installed `chromium_headless_shell-1234` (Google Chrome for Testing 151.0.7922.34). Tests, projects, viewports, timeouts, retries and assertions are the repo's.
- Not run: `pnpm eval`, the full `pnpm test:e2e` across every spec, `pnpm test:regression`, `pnpm test:restore`, a clean (non-offline) install, GitHub CI for the final docs-only head (see the PR; the code head `544647b` is green as stated above).
- Seen, not changed: evidence and policy revisions remain client-supplied numbers in this synthetic build (the server now only refuses going backwards); the case-level `practice-owner` literal belongs to M4-1-S.

Environment: macOS 26.4 (Darwin 25.4.0, arm64); Node v24.17.0; pnpm 10.28.1; TypeScript 5.8.3; vitest 4.1.11; Playwright 1.55.1; embedded-postgres 16.10.0-beta.15 (PostgreSQL 16.10); headless shell: Google Chrome for Testing 151.0.7922.34.

## Status

Implemented, tested locally and committed. Not independently verified, not accepted. Open for Ben: finding 4's Jobs-card click and finding 5's PR #85 text. A fresh or rebound different-model verdict on the final head and separate technical acceptance are still required.
