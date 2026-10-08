# CH-3a round 6 — builder receipt

- Task / PR: CH-3a, structured customer, paying party and site; PR #98.
- Repair builder: **GPT-6.1 Sol via Codex**, 5 October 2026.
- Base: **3b62d4e35f3137e5d3a16eb5ec695a7da61d77e2**. Changes are in this worktree for the dispatcher to commit; no new head or CI run is claimed.
- Input: `/private/tmp/jg-ch-3a-solverdict.md`, fresh Sol high **REPAIR**, two findings (P2 reuse confirmation and P3 address-line round trip).
- Read: AGENTS.md rev 3.0; BUILD_PLAN.md §2.4 C1–C8 and CH-3a card; all three prior task receipts; integrator's `CH-3a-round5.txt` scope readings.
- Status: **not independently verified, not accepted**. This is builder execution evidence, not an independent model verdict or acceptance. A fresh Claude Opus verdict on the dispatcher's exact commit and separate acceptance remain required.

## Scope and inherited rulings

Both remaining findings belong to CH-3a: its site editor/commands, `site.v1`, authoritative persistence and C1/C7 reopen behavior. No outside-card finding was identified, so no follow-up order file was needed. No authorization across practice sessions was changed; SBOX-SESSION-1 remains held for Ben.

Integrator's previous scope reading, carried forward verbatim:

- IN SCOPE, fix now (all three): P2-1 (a NULL correction flag bypasses the post-live guard in 0051; Done-when "a post-live correction requires a reason"), P2-2 (reopening and repeated saving replace saved party identities; commands/UI binding, C1/C7), P2-3 (editing a site silently drops additional address lines; site address lines are part of `site.v1`).
- Nothing is out of scope. Migration 0051 has not been applied anywhere, so it may still be edited.

Those round-5 fixes remain in place. Founder decisions (Ben, 4 October): the C7 Jobs-list substitute (fresh reopen plus second browser context) and fictional sample-source labels are accepted. Migration 0051 retains its allocated number. No new founder decision was made.

## Findings → failing-first tests → fixes

| Finding | Test written before the fixes / observed red | Fix and further coverage |
|---|---|---|
| P2: editing town, postcode or UPRN retains a confirmed reuse and can silently discard the edit | `apps/web/app/ui/job-parties.test.tsx:56`: **3 failed, 0 passed**, exit 1. Town/UPRN kept the checked confirmation; changing postcode hid the controls and restoring it revived the old site ID. Tests invoke the real component handlers with mocked React hooks and transport, not a browser. | `apps/web/app/ui/job-parties.tsx:138`, `:139`, `:141` clear both reuse and confirmation, as the existing address/unit handlers do. Component tests now **3/3**. `apps/web/e2e/CH-3a.spec.ts:237` adds one browser regression per field in both projects: select/confirm reuse, edit, persist a separate site with the changed value, preserve the original revision, reload and verify a second context. |
| P3: a schema-valid individual address string containing CR/LF is split differently on reopen, creating a new site on an unchanged save | `packages/core/src/job-parties.test.ts:5`: **5 failed, 4 passed**, exit 1; LF, CR, CRLF and leading/trailing line breaks were accepted. `apps/api/src/job-parties.application.test.ts:8`: **3 failed, 1 passed**, exit 1; each invalid address reached the mocked persistence boundary instead of returning `INVALID_PARTIES`. | `packages/core/src/job-parties.ts:7` checks raw strings for CR/LF before trimming; `:17` applies it to every address line. Existing application/repository validation returns `INVALID_PARTIES` before opening a connection. `packages/db/migrations/0051_job_parties.sql:28` adds `site_revision_address_lines_no_cr_lf`, checking all four possible lines for direct writes. Core targeted tests now **9/9**, API targeted tests **4/4**. `packages/db/test/job-parties.integration.test.ts:39` adds three real-PG cases for invalid-command refusal, SQLSTATE 23514 from direct runtime SQL, and rollback of the new site identity. `apps/web/e2e/CH-3a.spec.ts:262` rejects all three CR/LF forms with HTTP 400/`INVALID_PARTIES`, checks the persisted view is unchanged, reopens a valid four-line address, saves unchanged with only `bind`, preserves site IDs/revisions/lines, and verifies the second browser context. |

All regression sources were written before the production fixes. Red logs are `/private/tmp/jg-ch3a-r6/red-{core,api,web}.log`; pnpm reported exit 1 for each test invocation (the containing shell displayed each log afterward). No database/browser red or green execution is claimed: the dispatcher explicitly forbids starting their required services in this sandbox. Collection only succeeded below; GitHub CI must execute them after push.

The new hook-test harness initially failed strict TypeScript (`exactOptionalPropertyTypes`) because its optional cleanup field was assigned `undefined`. Its type now explicitly permits that value (`job-parties.test.tsx:8`); no assertion was weakened. The final full web suite was run after that correction.

## Commands actually run

Node 24.17.0; cached pinned pnpm **10.28.1**. A scratch PATH wrapper calls `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; all pnpm commands below used it. Installed dependencies were reused; no install/download command was issued. Source test paths avoid counting compiled test copies under `dist`.

| Command | Exit | Result |
|---|---:|---|
| `pnpm --filter @jobguard/core exec vitest run src/job-parties.test.ts` (before / after fix) | 1 / 0 | Red 5 failed + 4 passed; green 9 passed |
| `pnpm --filter @jobguard/web exec vitest run app/ui/job-parties.test.tsx` (before / after fix) | 1 / 0 | Red 3 failed; green 3 passed |
| `pnpm --filter @jobguard/api exec vitest run src/job-parties.application.test.ts` (before / after fix) | 1 / 0 | Red 3 failed + 1 passed; green 4 passed |
| `pnpm typecheck` | 0 | 7 packages, 2 unaffected packages cached; earlier run exit 2 on the new test harness typing, corrected above |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Purity, money/commercial boundaries, lane check and 7 packages; 2 unaffected packages cached |
| `pnpm lint:lanes` | 0 | Real local lane check includes working-tree/untracked paths, branch `codex/sandbox/ch-3a`, base `ebfeaae7b07747997194e17eff1601557fced6e8` |
| `pnpm build` | 0 | All 7 packages, including Nest and production Next; 2 unaffected packages cached. Run twice, including after the harness typing correction. |
| `pnpm --filter @jobguard/core exec vitest run src` | 0 | **225 tests, 35 files** |
| `pnpm --filter @jobguard/web exec vitest run app` | 0 | **71 tests, 10 files**; final run after harness typing correction |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | **111 passed, 1 failed**, 16 files; existing `health.test.ts` cannot listen (`EPERM`), with 1 associated uncaught socket error. No tests excluded or skipped; full API suite remains required in CI. |
| `pnpm openapi:check` | 1 | tsx launcher IPC socket rejected with `listen EPERM` before generator execution |
| `node --import tsx src/generate-openapi.ts --check` (apps/api) | 0 | Same repository generator/check via a launcher that needs no IPC listener; generated contract matches, no OpenAPI edits |
| `pnpm --filter @jobguard/db exec vitest list test/job-parties.integration.test.ts` | 0 | **22 registered tests**, collection only; no PostgreSQL execution |
| `pnpm --filter @jobguard/web exec playwright test --list CH-3a.spec.ts --project=mobile-360 --project=desktop` | 0 | **36 registered cases**, 18 per project; collection only |

Earlier lint and lane invocations each exited 1 because `.pnpm-store/v11/index.db` was an untracked out-of-lane launcher cache. An initial PATH `pnpm --version` probe invoked installed pnpm 11.8's manager launcher and did not finish; it was interrupted (exit 130). The untracked `.pnpm-store` was moved intact to `/private/tmp/jg-ch3a-r6/pnpm-launcher-store`, and the cached pinned executable was used thereafter. No ignored path or lane exception was added. The following lint run exposed the new harness type error (exit 2); after fixing the type, both required checks passed. Turbo reported denied writes to the shared worktree cache but the actual package checks/builds completed; this is not clean-install evidence.

## Migration, contracts, lane and remaining evidence

- Only migration change: a named CR/LF constraint in **unapplied 0051**. No new migration allocation, backfill, grants, policies, routines, financial effects, alerts or provider changes. Fresh/upgrade, real runtime constraint/rollback and catalog evidence remain for CI. After rollout, retain immutable history and forward-fix a constraint under review; do not drop/rewrite revisions. `packages/db/MIGRATIONS.md:127` records this.
- `docs/contracts/job-parties-v1.md:15` records the tightened line representation and edit/reuse behavior. Normal valid one-to-four-line addresses retain the same representation. Inputs with embedded CR/LF intentionally become invalid; historical document bytes/hashes are untouched. No AI model/prompt/parser/gateway or evaluation policy changed.
- Added exactly one new allowed path, **`apps/web/app/ui/job-parties.test.tsx`**, to **this lane only**. The new receipt is within its existing `docs/verdicts/CH-3a/**` scope. All other lane entries remain unchanged.
- No direct git command, commit, merge, push, PR edit, verdict edit, acceptance or release was performed. The previous repair brief's merge/push instructions are superseded by this round's dispatcher instructions. Shared migration/lane files still require integration serialization.
- **Not run here:** `pnpm test` (includes database suites), `pnpm test:db`, `pnpm test:migrations`, browser execution or restore: this sandbox cannot start PostgreSQL/bind localhost. **Database and browser suites run in GitHub CI after the dispatcher pushes**, including this spec in both projects, all earlier mandatory suites, and full API health/OpenAPI launcher checks. No pinned clean install, dependency/secrets scans, live providers, deployment or real-data operation was performed. `pnpm eval` is inapplicable to these non-AI schema/editor changes.
- Intended conventional commit subject and body: `/private/tmp/jg-msg-ch-3a.txt`. New commit SHA, CI result and exact-commit independent verdict must be supplied by the dispatcher/reviewer; the base-head CI cited by the previous reviewer is not evidence for this working-tree change.

**not independently verified, not accepted**
