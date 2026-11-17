# ENT-1 builder receipt — round 3 (7 October 2026)

Builder: Codex. Branch `codex/sandbox/ent-1`, existing PR #100. Repair is an uncommitted working-tree diff on **ca202443e9c0021573d5ba776cc12632209c30aa**; the dispatcher supplies the next commit. No add, commit, checkout, push, merge or PR creation was performed. **Not independently verified, not accepted.** The supplied Sol verdict is REPAIR on ca20244, not a verdict on this new diff.

Read AGENTS.md rev 3.0, BUILD_PLAN.md §9.1.2 and the §9.2 ENT-1 card, canonical command/authorization/money contracts and C1–C8. All earlier work is retained. No lane was widened; no requested fix was omitted for a lane conflict.

## Earlier work retained: 00b52d6 and ca20244

- **00b52d6410d41cba83b5ecdd6266fa2e10a1d137** closes the P1 subject-ID collision: unit/team/client creation rejects an ID already naming any of those subjects or the tenant, under the existing tenant lock. Its PostgreSQL regression attempts a branch administrator's shadow-team collision against another branch's client and pins COMMAND_CONFLICT plus continued NOT_FOUND. Source-inspected here; the commit message reports a red exploit on f6f4077, green afterwards and 14/14 contractor tests. Those are historical claims, not database execution in this round.
- **ca202443e9c0021573d5ba776cc12632209c30aa** merges main **a5ed99a8f7b4e76925c35297dda0d06d6f8834ab** into ENT-1, preserving both package exports and migration histories: main's 0042 and 0053, then ENT-1's 0054, 45 registered migrations and the union of the lanes. The merge message reports 208/208 DB tests, lint and typecheck; source-inspected here, not rerun as historical commits. The supplied Sol report cites CI run 37479796778 on ca20244 (205 DB/package tests, 14 contractor cases, 172 browser cases). This receipt does not promote that earlier evidence into proof of the new diff.
- Earlier SQL/parser/migration-count repairs, Origin-header bypass repair, acknowledged-save refresh repair, collision guard and every earlier assertion remain present. **Migration 0054 is byte-for-byte unchanged from ca20244, remains above main's 0053, and is not renumbered.** No migration registration/count/ledger changes were needed this round.

## Finding → fix → test

| Finding | Change | Evidence and pending execution |
| --- | --- | --- |
| Sol P2-1: client_approver `extra.approve` | Integrator ruling applied: keep SQL denial. TS permission requires an extra awaiting that client's decision; the current SQL helper cannot test that state and no caller uses it. | Added PostgreSQL test pins `extra.approve = false` for client-wide and contract-restricted grants, including own contract, another contract and another client; positive/negative `contract.read` checks pin existing read scope. No SQL grant widened. CI execution pending. **ENT-5 must add scoped, state-checked approval execution, including pending client step, exact revision, authorization and client/contract restrictions.** |
| Sol P2-2: commercial manager revision 0 | Query checks persisted active scoped `organisation.manage`, `contract.manage` or `client.invite` permissions before exposing the tenant command revision to an ENT-1 writer. Restricted readers still receive 0; no administrative member/grant rows are added to their projections. | Adapter regression red (0 instead of 7), green afterwards. New real-PostgreSQL sequence uses a branch commercial manager's own contracts projection for both contract revision and client invitation commands, reads the next revision from its own projection, and writes again after unrelated administration. Authentication fixture lookup uses runtime credentials; no privileged connection supplies a revision. Restricted client's complete projection remains identical after unrelated administration. CI execution pending. |
| Sol P2-3: failed manual Reload leaves old view editable | Any failed load marks the view stale. Existing views retain a visible out-of-date status and focused error. Reload is busy while pending; command handlers and every revision-dependent button refuse stale state until successful reload. A failure counter focuses repeated identical errors. Generated start clears stale state. | Scripted-hook regression red (missing alert), green afterwards. New browser transport-abort case exercises two failed manual reload/recovery cycles, checks all nine mutation buttons, focused error, old revision, enabled Reload, successful further command and persisted revision after refresh. Existing acknowledged-save refresh test/assertions retained. Both viewports collected; execution pending. |
| Sol P3-4: invalid roles/scopes become 503 | Both invitation and grant variants in the versioned command schema reject client/non-client scope mismatches, non-tenant finance scopes and internal contract restrictions. Invitation client binding must match its client scope; internal invitations require null client binding. Repository uses existing INVALID_COMMAND → HTTP 422 path. UI offers only scopes valid for the selected role and resets client scope when switching to an internal role. | Added 90 role × scope × command cases plus invitation binding case; 89 failed before the fix. Application boundary regression red before fix and green afterwards, checking typed 422 and no execution transaction. PostgreSQL regression checks typed errors for invitation and grant, independent SQLSTATE 23514 enforcement via raw SQL and identical projection after rollback. Browser checks selector options and real 422 responses without side effects. DB/browser execution pending. |
| Sol P3-5: Account navigation touch target | Account link uses existing `card-action` navigation style (flex, min-height 48px and visible keyboard focus). No global CSS edit. | Source assertion red before fix, green afterwards. Existing persisted browser journey now checks keyboard focus, visible outline and both dimensions ≥44 CSS px on Account before following the link. Both browser projects collected; geometry measurement pending CI. |

## Tests first on ca20244

The implementation was unchanged when these newly written tests ran. No red-test commit was created in this read-only-git sandbox. Logs are in `/private/tmp/jg-ent-1-red-{core,api,web}.log`.

| Command | Exit | Actual result before implementation changes |
| --- | ---: | --- |
| `pnpm --filter @jobguard/core exec vitest run src/contractor.test.ts` | 1 | 636 passed, 89 failed: invalid roles/scopes, internal contract restrictions and invitation bindings accepted. |
| `pnpm --filter @jobguard/api exec vitest run src/contractor` | 1 | 4 passed, 2 failed: commercial revision 0; invalid input reached execution instead of typed INVALID_COMMAND. The adapter test initially imported DB source directly; final test uses the public package export. |
| `pnpm --filter @jobguard/web exec vitest run app/admin/contractor` | 1 | 3 failed: manual reload had no alert; finance offered all five scopes; Account link lacked card-action. A hook-fixture setup error was corrected and this red run repeated before implementation. |

PostgreSQL and browser tests were written before implementation but **not executed red or green here**. Local adapter/hook/source evidence is explicitly distinct from database/browser proof.

## Commands actually run this round

Existing installed dependencies only; no install or dependency changes. Runtime Node **24.17.0** (repository .nvmrc is 24.15.0); cached pinned **pnpm 10.28.1**. The default pnpm launcher refused version switching during `pnpm --version` (exit 1, registry fetch/signature failure); subsequent commands use `/private/tmp/jg-ent-1-bin/pnpm`, which invokes the already cached 10.28.1 entrypoint, with that directory prepended to PATH. No install command was run and no dependencies were changed; the initial version query triggered a failed automatic registry lookup. Logs are `/private/tmp/jg-ent-1-*.log`.

| Command | Exit | Result |
| --- | ---: | --- |
| Cached `pnpm --version` | 0 | 10.28.1. |
| `pnpm --filter @jobguard/core build` | 0 | Rebuilt package used by boundary tests. |
| `pnpm --filter @jobguard/db build` | 0 | Rebuilt package used by final adapter/API tests. |
| `pnpm --filter @jobguard/core exec vitest run src/contractor.test.ts` after fix | 0 | 725 passed. |
| `pnpm --filter @jobguard/api exec vitest run src/contractor` after fix | 0 | 6 passed. |
| `pnpm --filter @jobguard/web exec vitest run app/admin/contractor` after fix | 0 | 3 passed. |
| First `pnpm typecheck` and `LANE_BASE_REF=origin/main pnpm lint` | 2 each | New adapter test's direct DB source import crossed API rootDir. Corrected to the existing public @jobguard/db export; no configuration/lane expansion. Final reruns below. |
| Second `pnpm typecheck` and `LANE_BASE_REF=origin/main pnpm lint` | 2 each | New web source assertion used import.meta under the web package’s CommonJS typecheck. Replaced with a package-relative file read; assertions unchanged. |
| `pnpm typecheck` final | 0 | 7 successful tasks; 2 cache replays. |
| `LANE_BASE_REF=origin/main pnpm lint` final | 0 | Lane passed; 7 successful tasks, 2 cache replays. |
| `pnpm lint:lanes` (initial and final) | 0 each | Actual branch/base comparison succeeded; no detached-head or self-comparison refusal. Includes uncommitted/untracked changes and the new receipt. |
| `pnpm --filter @jobguard/web test` (initial and final) | 0 each | 83 passed across 11 files, including final package-relative source assertion. |
| `pnpm --filter @jobguard/db exec vitest run src` | 0 | 3 pure tests; no PostgreSQL. |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | 113 passed; unchanged health.test.ts failed when supertest tried to listen (EPERM), also reported as uncaught exception. All 6 contractor cases passed using rebuilt package exports. No exclusion or assertion change. |
| `pnpm --filter @jobguard/core test` | 1 | 2,068 passed, 8 timeouts: 4 cases in unchanged SH-1 extra-origin/receipt-allocation tests, counted in both source and compiled copies, during concurrent local compilation. No timeout increased; serial diagnostic below. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1` after compiler/build completion | 1 | 2,074 passed, 2 unchanged compiled-copy timeouts: dist/extra-origin.test.js offset enumeration (5,038 ms) and dist/receipt-allocation.test.js 2,000-line aggregation (5,619 ms), against existing 5,000 ms limits. All source cases passed, including the new contractor regressions. This is not a full-suite pass. |
| `pnpm build` | 0 | 7 successful tasks, 2 cache replays; production Next build, types, generated pages and traces complete. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` (before and after full build) | 0 each | Socket-free generator matches committed specification. No OpenAPI edit needed. |
| `node --test tools/*.test.mjs` | 0 | 42 passed, no skips. |
| `pnpm --filter @jobguard/web exec playwright test --list --project=mobile-360 --project=desktop ENT-1.spec.ts` | 0 | 10 cases collected; **collection only**, no browser journey or viewport measurement executed. |
| `git diff --check` | 0 | No whitespace errors. |

## Scope, compatibility and outstanding evidence

- No new schema, migrations, backfills, provider actions, execution grants, fee/money arithmetic or operational alerts. Existing integer-pence rules, immutable commercial records, tenant transaction locks, RLS, membership verification and audit writes are retained. Runtime revision query changes only the ENT-1 projection; earlier valid commands remain valid. Invalid role/scope payloads now fail early with typed 422 rather than reaching database constraints/503. Forward fix or code rollback requires no data migration.
- C1–C5: existing vertical slice/service composition/synthetic boundary retained; updated input boundary, authoritative scoped projection and stale UI implemented. New PostgreSQL/browser cases cover authorization, runtime revision use, rollback, focus, touch target, repeated recovery, persistence, banner and overflow. C6–C7 real database/browser execution remains a hold until CI runs. C8 lane/tooling checks are recorded; independent exact-commit review and separate technical acceptance are outstanding.
- **Not run:** `pnpm test` (includes unavailable PostgreSQL); `pnpm test:db`, `pnpm test:migrations`, embedded PostgreSQL contractor suite and browser execution. This sandbox cannot start PostgreSQL or bind localhost; the dispatcher pushes and GitHub CI must run the real database/migration suites and ENT-1 in **mobile-360 (360×800)** and **desktop (1280×800)**, preserving the whole existing suite. No local PostgreSQL/browser pass, screenshot or trace is claimed.
- **Not run:** fresh dependency install (dependencies supplied; downloads forbidden); live providers/model evaluation, spending, real sends, production/pilot execution, decision approvals, deployment, secrets/dependency-review CI jobs. No AI/model/prompt/extraction behavior changed, so an AI evaluation is inapplicable. Founder-reserved capabilities and proposed decisions remain disabled/unapproved.
- **Outside-lane issues left untouched:** listener restriction affects `apps/api/src/health.test.ts`; inherited timeout investigation/fixes would touch `packages/core/src/extra-origin.test.ts`, `packages/core/src/receipt-allocation.test.ts` and potentially their corresponding implementation files `packages/core/src/extra-origin.ts` and `packages/core/src/receipt-allocation.ts`. These files match origin/main and were not edited. Exact final diagnostic outcome is recorded above; no assertion was weakened, skipped or deleted and no new/longer timeout was introduced. Existing ENT-1 180-second browser allowance is unchanged.
- ENT-5 owns scoped, state-checked client approval. The SQL denial regression is a deliberate integrator-approved boundary, not an unresolved request to widen today's permission grant. Missing CI/independent-review/acceptance evidence remains a hold; no release gate is declared passed.

Intended commit message is supplied separately at `/private/tmp/jg-msg-ent-1.txt` for the dispatcher.
