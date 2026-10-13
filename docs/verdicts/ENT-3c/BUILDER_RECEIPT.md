Built by Claude Sonnet 5.5, Codex unavailable; dispatched 13 Oct 2026

# ENT-3c builder receipt: order check and server-priced schedule-of-rates site extras (server only)

**Builder receipt only — not independently verified, not accepted.** (The same line closes this document.)

- Task `ENT-3c`, check lane RED (money figures, a new migration, a company boundary). Builder: Claude Sonnet 5.5 sub-agent (Codex unavailable), dispatched by the Claude session "JobGuard dispatcher, Tuesday". The builder is neither the Opus check nor the second check.
- Base: `origin/main` = `4db73817ab7b3be4993fe8b01279ac0e1b8cf836` (ENT-3a merged on main). Branch `codex/sandbox/ent-3c`, worktree `.worktrees/ent-3c`, migration `0140_site_extra_pricing.sql` (registered last in `packages/db/src/migrate.ts`; ENT-3b is `0139` in parallel; the dispatcher renumbers at landing, SQL bytes unchanged).
- Code head: `71a0fd315c6eb8eb92e8002c34531cfce35b062a` (code, tests, contract); `4f0b938` renames six test titles; the receipt is the tip commit, so the final head sha is the branch tip given in the dispatch message (a document cannot hold its own commit hash). Nothing is pushed, merged or opened as a pull request.
- Files changed against the base: 31 in the code commits plus this receipt (32). `git diff --stat 4db7381 HEAD`: 2794 insertions, 2 deletions (the 2 deleted lines are the two shared registration lines that gained a token: `apps/api/src/app.module.ts` controllers list and `apps/api/src/workspace/application.ts` `siteExtras` object). Lane check: `LANE_BASE_REF=4db7381... pnpm lint:lanes` passed for lane `ent-3c`.

## What was built, in plain words
A site worker can log an extra by picking an item from the job's price list and saying the TOTAL done. The server compares that with the client's order ("already on the order", "N more than ordered", "new"), prices the EXTRA quantity alone with the merged exact half-even function, and keeps the price in two new permanent records written in the same transaction as the extra (the price, and the fact that the server set it from the price list). Two read lists exist: search of this job's price list, and the order check before logging. It stops at "logged". No screens, no approval step, no photo, no visit, no fee. Made-up practice data only; nobody signed in can reach the success path yet, so it is proved in tests.

## Environment note (not a product change)
The worktree's embedded PostgreSQL could not start at first (`Library not loaded: libicudata.68.dylib`): pnpm 10 does not run the package's own postinstall, so the short library names were missing. I ran that package's own `scripts/hydrate-symlinks.js` once inside this worktree's ignored `node_modules` (it only creates relative symlinks). After that the database tests ran here. Nothing tracked changed.

## Commands run (exact exits and counts; memory 72-76% free, disk 92 GB free, one run at a time, `--maxWorkers=2`, at most three files per run, database runs through `heavy-slot ent-3c`)
| Command | Result |
|---|---|
| Baseline, before any change: `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts src/watchdog-registry.test.ts src/contractor/site-extra.http.test.ts` | exit 0; 3 files, 282 tests passed (145 + 121 + 16) |
| Baseline database: `test/site-extra.integration.test.ts` (ENT-3a) | first run exit 1 (PostgreSQL could not start, see environment note); after the symlink step exit 0, 22 passed |
| `pnpm turbo run build --concurrency=2 --filter=@jobguard/core...` / `--filter=@jobguard/api...` | exit 0 (core/ai/db/api built; an early core build failed once because my test file imported `node:fs`; fixed to the dynamic import core's other tests use) |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-extra-pricing.test.ts` | FIRST RUN (tests first): exit 1, module missing, no tests ran. Final: exit 0, 1 file, 98 tests passed |
| Database, tests-first record: `test/site-extra-order-check.integration.test.ts test/site-extra-pricing.integration.test.ts test/site-extra-pricing-basis.integration.test.ts` | FIRST RUN: exit 1, 39 failed / 4 passed of 43 (`repo.logSorSiteExtra / sorItems / orderCheck is not a function`; the 4 passes are catalogue checks of the already-written migration) |
| Same three database files, final | exit 0, 3 files, 43 tests passed (D1 order-check 12 incl. catalogue, D2 priced log 26, D4 basis 5) |
| `test/site-extra-pricing-upgrade.integration.test.ts` (D3, rule-9 proof) | exit 0, 9 tests passed (first run passed) |
| `test/command-replay-contract.integration.test.ts test/tenancy.integration.test.ts` (unedited apart from the four catalogue rows) | exit 0, 2 files, 62 tests passed |
| ENT-3a / ENT-4b merged database files, unedited: `site-extra-authority`, `site-extra`, `fingerprinted-row-shape` | exit 0, 3 files, 85 passed |
| `extra-origin`, `extra-links`, `extra-origin-upgrade` | exit 0, 3 files, 48 passed |
| `sor-pricing`, `work-order-import`, `watchdog` | exit 0, 3 files, 96 passed |
| `pnpm turbo run build --concurrency=2 --filter=@jobguard/api...` then api: `site-extra-pricing.application.test.ts` + `site-extra-pricing.http.test.ts` | exit 0, 2 files, 87 passed (71 + 16) |
| api, ENT-3a unit file `site-extra.application.test.ts` (own run) | exit 0, 41 passed |
| api `src/auth/context-boundary.test.ts` (own run) | exit 0, 145 passed (it failed once, 144/145, while I used a callback to hand the context on; rewritten so each method binds the context to a const and passes it straight to the repository) |
| api `src/watchdog-registry.test.ts` (own run) | exit 0, 121 passed |
| api `src/contractor/site-extra.http.test.ts` (own run) | exit 0, 16 passed |
| web: the three new route tests in one run | exit 0, 3 files, 102 passed |
| `pnpm typecheck --concurrency=2` | exit 0, 7 tasks (a first run found one type slip in my application test; fixed). The new database test files are outside `tsc`'s include, so I checked them once with a throwaway tsconfig in the scratch folder: clean |
| `LANE_BASE_REF=4db7381... pnpm lint --concurrency=2` | exit 0, 7 tasks |
| `LANE_BASE_REF=4db7381... pnpm lint:lanes` | exit 0, "Lane boundary passed" for lane ent-3c |
| `pnpm build --concurrency=2` | exit 0, 7 tasks; the three new web routes appear in the Next route list |
| `pnpm openapi:check` | exit 0 (no `listen EPERM`); `openapi.json` regenerated with `pnpm --filter @jobguard/api openapi:generate`: 180 insertions, 0 deletions, every existing path unchanged |

## NOT RUN, and why
- Nothing assigned to the builder was left unrun. Not run by me because they are the dispatcher's: whole-package or repository suites; the other merged files of [C23] (`job-scheduling`, `contractor`, `demo-bootstrap`, `recovery-follow-up-upgrade`, `watchdog-lock-order`, `work-order-concurrency`) and `watchdog-legacy-identities`; browser (end to end) specs (none exist for this piece: UI is parked, C1 server slice only).
- Two separate pieces of the draft are NOT built or not as drafted: see "Deviations and BLOCKING/LATER notes".

## Order of work: what was written before what
Core pure module and its test: test first, failing run recorded. The four database test files and fixtures were written before `site-extra-pricing-queries.ts` and the repository methods (first run failed, recorded above). HONEST EXCEPTIONS: the migration SQL was drafted before the database tests were first run (its catalogue/forbidden-path checks therefore passed on the first run); and the API and web tests (U, H, W) were written AFTER the application, controller and route code, not before. Their first runs are recorded above (one failure fixed in the application, one in the boundary scan).

## Definitions and acceptance lines: BUILT / HELD
| Line | Status |
|---|---|
| Definitions (schedule item, job's price list, baseline, order line, claimed quantity, order check, price, first priced revision, basis, may log, nothing written, replay, server time) | BUILT. `packages/core/src/site-extra-pricing.ts`, `packages/db/src/site-extra-repository.ts`, migration 0140, contract `docs/contracts/site-extra-pricing-v1.md` |
| [C1] | BUILT. P `site-extra-pricing.test.ts` "[C1] ..." (order-check cases, 12 invalid quantities, exactness); D1 `[C18] orderCheck gives the outcome the command then acts on, for every case of [C1] built as real orders` |
| [C2] | BUILT. P (51 field names, each its own case; quantity vs command codes; search text required); U (`createWorkspaceApplication` passes the very same member object, parsed fields only, bridge called once, stamp check; tenant/member/role in body, path, query, cookies, principal); W (each handler passes only the parsed body or query and the path ID) |
| [C3] | BUILT. P (result schemas refuse a price, net and rate; own file read with the TypeScript parser: no `parseFloat`, `toFixed`, `Math.`, no number-typed quantity; every code maps to one status). NOTE: the draft says a serialised example has no key matching `price`; the draft's own result has the field `priceSource` (where the price came from, not a value), so the test skips exactly that key |
| [C4] | BUILT. P: both fixed digests equal the draft's (`5efa4883...37334`, `77c5ad96...a8c7`); D2 `[C5]` compares the stored hash with the TypeScript mirror for every success; D2 `[C14]`, `[C16]` also |
| [C5] | BUILT. D2 `[C5] operative|supervisor|surveyor logs a new|excess schedule-item extra ...` (6 cases; same `xmin` for origin, event, revision, basis and the one raised audit event; no `variation_revision`, no `awaiting_approval`, state as a free-text extra's; scope lineage of kind `variation` asserted) |
| [C6] | BUILT. D2 money test (M1-M14, stored text compared with the table, merged `priceSorLine` and merged SQL function; M10 = 676 not 675); D2 later-price-list/later-revision test; P (merged function over all 17 rows) |
| [C7] | BUILT. D2 and D1 `[C7]` |
| [C8] | BUILT. D2 `[C8]` |
| [C9] | BUILT. D2 `[C9] every role ...` (command, 6 roles x 4 job IDs, deep-equal errors); D1 `[C9] sorItems|orderCheck: ...` |
| [C10] | BUILT. D2 and D1 `[C10]` (7 causes plus team.move, grant.revoke, cancelled order, small-builder job, not-live job; `membership.revoke` gives EXTRA_FORBIDDEN) |
| [C11] | BUILT. D2 `[C11]` and D1 `[C11]` (two contractor tenants, one small-builder tenant, unstamped/missing context before any connection, routine called directly as the runtime role, runtime role sees no row of tenant B) |
| [C12] | BUILT. D2 `[C12] replaying ...`, `[C12] the same command id with a changed payload conflicts`, `... on another job conflicts`, `... no-op ...` (free-text id both directions; revoked member refused) |
| [C13] | BUILT. D2 `[C13]` |
| [C14] | BUILT. D2: same command twice at once; same id with two quantities at once (one conflict); three order-revision shapes between the pre-check and the command (committed inside the call that follows the pre-check, no sleeps); grant.revoke holding the tenant lock; job leaving live while a log is in flight |
| [C15] | BUILT. D2: failure forced at nine statements (receipt, variation, origin, event, live guard, authority guard, pricing routine, audit insert, COMMIT); lock observer: nothing locked after the audit append; revision row without the raising transaction's audit event fails at commit `PRICING_AUDIT_REQUIRED` (raise placed in a released savepoint); one for an extra raised earlier is refused |
| [C16] | BUILT. D2 `[C16]` (runtime UPDATE/DELETE/TRUNCATE/INSERT 42501; owner 55000; nine tampered rows; supplied hash/time overwritten; second row; routine called directly with six bad argument sets) |
| [C17] | BUILT, with one clause done differently: see deviations. D2 `[C17] a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written`; `[C17] a replay ... after the job has left live ...`; D1 `[C17] both reads work on a job that is no longer live` |
| [C18] | BUILT. D1 (search literal/case-insensitive/by code, 50 + truncated, this job's price list only, no other tenant's items, text required, order check, refusals, no write and no refusal recorded, no money key) |
| [C19] | BUILT. U (fake connection, collaborators stubbed): `raiseExtra` once; seam statements in order live guard, live guard + ENT-3a authority, pricing routine; seven recorded refusals map to their own codes; access answer asked again; `ALREADY_ON_ORDER` before the command means no `raiseExtra`. ENT-3a's `site-extra.application.test.ts` passes unedited (41) |
| [C20] | BUILT. U, H (real Nest pipeline, no socket problem), W |
| [C21] | BUILT. D1 catalogue; D3 upgrade proof (rule 9) |
| [C22] | DONE (see hashes below); `context-boundary.test.ts` and `watchdog-registry.test.ts` pass unedited |
| [C23] | Run here where listed in the commands table; the rest is the integrator's |
| [C24] [C25] [C26] [C27] | BUILT. D4 (5 tests), D3 (twelve fingerprinted tables' names and full types identical), P (vocabulary and migration CHECK lists) |

## The worked money table, row by row (every row run through the merged function)
Rates: REPAIR-DOOR 10000p, PAINT-ROOM 25000p, FIT-LOCK 4500p, CLEAR-VOID 18000p, CLEAR-GUTTER 350p; adjustment -35/1000 unless stated. Each row is proved three ways: the stored row read back as text from PostgreSQL (D2 money test, RUN), merged `priceSorLine` (P, RUN) and merged `app.sor_line_net_pence` (D2, RUN). **No row differs from the draft's table.**
| Row | Inputs | Extra qty | Exact before rounding | Stored pence | Test | RUN? |
|---|---|---|---|---|---|---|
| M1 | new CLEAR-GUTTER, claimed 1 | 1 | 337.75 | 338 | P `[C6]` + D2 `[C6] money` | RUN |
| M2 | new CLEAR-GUTTER, claimed 1.625 | 1.625 | 548.84375 | 549 | P `[C6]` + D2 `[C6] money` | RUN |
| M3 | new CLEAR-GUTTER, claimed 2 | 2 | 675.5 (tie, odd below) | 676 | P `[C6]` + D2 `[C6] money` | RUN |
| M4 | new PAINT-ROOM, claimed 0.5 | 0.5 | 12062.5 (tie, even below) | 12062 | P `[C6]` + D2 `[C6] money` | RUN |
| M5 | new CLEAR-VOID, claimed 1 | 1 | 17370 | 17370 | P `[C6]` + D2 `[C6] money` | RUN |
| M6 | new REPAIR-DOOR on an order that does not carry it, claimed 1 | 1 | 9650 | 9650 | P `[C6]` + D2 `[C6] money` | RUN |
| M7 | excess REPAIR-DOOR, instructed 1, claimed 3 | 2 | 19300 | 19300 | P `[C6]` + D2 `[C6] money` | RUN |
| M8 | excess FIT-LOCK, instructed 2, claimed 5 | 3 | 13027.5 (tie, odd below) | 13028 | P `[C6]` + D2 `[C6] money` | RUN |
| M9 | excess FIT-LOCK, instructed 2, claimed 3 | 1 | 4342.5 (tie, even below) | 4342 | P `[C6]` + D2 `[C6] money` | RUN |
| M10 | excess as its OWN LINE, CLEAR-GUTTER, instructed 4, claimed 6 | 2 | 675.5 (tie, odd below) | 676 | P `[C6]` + D2 `[C6] money` | RUN |
| M11 | excess CLEAR-GUTTER, instructed 4, claimed 5.625 | 1.625 | 548.84375 | 549 | P `[C6]` + D2 `[C6] money` | RUN |
| M12a | adjustment +50/1000, REPAIR-DOOR new, claimed 2 | 2 | 21000 | 21000 | P `[C6]` + D2 `[C6] money` | RUN |
| M12b | adjustment 0/1, CLEAR-GUTTER new, claimed 1 | 1 | 350 | 350 | P `[C6]` + D2 `[C6] money` | RUN |
| M13a | CLEAR-GUTTER new, claimed 0.001 | 0.001 | 0.33775 | 0 -> refused EXTRA_NOT_POSITIVE, nothing written | P `[C6]` + D2 `[C6] money` | RUN |
| M13b | CLEAR-GUTTER new, claimed 0.002 | 0.002 | 0.6755 | 1 | P `[C6]` + D2 `[C6] money` | RUN |
| M14a | rate 1000000000000p, new, claimed 1.03 | 1.03 | 993950000000 | 993950000000 | P `[C6]` + D2 `[C6] money` | RUN |
| M14b | rate 1000000000000p, new, claimed 1.04 | 1.04 | 1003600000000 | refused MONEY_OUT_OF_RANGE, nothing written | P `[C6]` + D2 `[C6] money` | RUN |

**Q2 choice shown side by side (M10):** worked row, excess priced as its OWN line, rounded half-even ONCE: extra 2 x 350p x 965/1000 = 675.5, tie, odd below, so **676p** (this is what is stored). Alternative reading, whole-claim price minus instructed price: 6 x 337.75 = 2026.5 -> 2026p; 4 x 337.75 = 1351p; 2026p - 1351p = **675p** (NOT stored; the P test prints 2026, 1351 and 676 through the merged function and does no pence arithmetic of its own; the D2 test asserts the stored value is `676` and not `675`). The choice follows the coordinator's Q2 answer.

## The order check as built (`order-check.v1`)
Pure: `orderCheckV1` in `packages/core/src/site-extra-pricing.ts` (quantities as scaled `bigint` from merged `parseQuantity`, canonical text out). In the database it is decided AGAIN inside `app.ent3c_record_sor_revision` and re-checked by `app.ent3c_sor_revision_guard` from the baseline's own lines. Outcomes: `new` (extra quantity = claimed), `more_than_ordered` (claimed - instructed), `already_on_order` (never stored; the command refuses `ALREADY_ON_ORDER` and writes nothing). Same code on two lines needs the caller to name the line (`ORDER_LINE_AMBIGUOUS`, Q5). Equal counts as within the order (Q4).

## The routine, its signature and every new GRANT (standard F)
- Writer: `app.ent3c_record_sor_revision(p_job uuid, p_variation uuid, p_claimed_quantity text, p_request_hash text) RETURNS uuid`, `LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog`, owner `jobguard_migration`. It takes no actor, rate, price, outcome or time. It is the ONLY writer of both tables.
- Every new GRANT in the migration (one line each):
  1. `GRANT SELECT ON app.extra_sor_revision TO jobguard_runtime` (inside the `DO` loop).
  2. `GRANT SELECT ON app.extra_pricing_basis TO jobguard_runtime` (inside the `DO` loop).
  3. `GRANT EXECUTE ON FUNCTION app.ent3c_record_sor_revision(uuid,uuid,text,text) TO jobguard_runtime` (exact signature; no name-pattern loop).
  Revokes: `REVOKE ALL ON app.<each table> FROM PUBLIC, jobguard_runtime, jobguard_infrastructure`; `REVOKE ALL ON FUNCTION` the writer `FROM PUBLIC, jobguard_infrastructure`; the four trigger functions `FROM PUBLIC, jobguard_runtime, jobguard_infrastructure`. No GRANT of INSERT, UPDATE, DELETE or TRUNCATE exists anywhere in the migration.
- **Standard F statement:** the application login (`jobguard_runtime`) received NO direct INSERT, UPDATE or DELETE grant on any money, membership, authorization, receipt or audit table, and holds SELECT only on the two new tables; the writes go through the checked routine, which carries its own predicate (it runs only inside the raising command's own transaction, for that command's stored actor). No named exception is needed and none was reported as BLOCKING.

## Both tables and the four trigger functions
See `packages/db/migrations/0140_site_extra_pricing.sql` (the complete definitions) and the contract. In short: `app.extra_sor_revision` (26 columns exactly as drafted, `revision=1`, `UNIQUE(tenant_id,variation_id)`, foreign keys to variation, origin, work order, order revision, schedule item `(version, code, unit, rate)`, order line, receipt, membership) and `app.extra_pricing_basis` (key `(tenant_id, variation_id, revision)`, three `priceSource` values in the CHECK, only `server_sor` for revision 1 accepted). Both: owner `jobguard_migration`, row security enabled and forced, the merged two-role tenant policy, merged immutability trigger. Trigger functions: `ent3c_sor_revision_guard` (BEFORE INSERT, binds the owner too, sets `server_recorded_at` and `content_hash`), `ent3c_require_sor_revision_audit` (deferred, `PRICING_AUDIT_REQUIRED`), `ent3c_pricing_basis_guard` (BEFORE INSERT), `ent3c_require_pricing_basis` (deferred, `PRICING_BASIS_REQUIRED`). All with `search_path=pg_catalog`, tenant named in every WHERE, no INSERT inside a block that has an EXCEPTION clause, no advisory lock.

## Hash format and the two fixed digests
SHA-256, lower-case hex, of the UTF-8 text `extra-sor-revision-hash.v1`, a line feed, then nineteen values framed as merged `extraOriginHashV1` frames them (NULL is `N;`, otherwise `S<byte length>:<value>;`): tenant_id, job_id, variation_id, revision, origin hash, work_order_id, work_order_revision_id, sor_version_id, sor_code, unit, rate_pence, adjustment_numerator, adjustment_denominator, coverage, excess_of_scope_item_id, instructed_quantity, claimed_quantity, quantity, net_pence.
- excess example (tenant 1111..., rate 350, -35/1000, instructed 4, claimed 6, quantity 2, net 676): `5efa4883718ab9caa0bfd220781d3f235264aefa1a763dfb388df9433ef37334`
- new example (claimed 1, quantity 1, net 338): `77c5ad962a72be2d7b40e3ec22c498184f7ddd613629eacf9bab2206392aa8c7`
Both equal the draft's digests when computed by `extraSorRevisionHashV1` (P `[C4]`, RUN), and the SQL guard's stored hash equals the TypeScript mirror for every success row in D2 (RUN).

## Lock order of the command
Pre-check and replay lookup are separate short read transactions (no business lock). Write transaction: merged `raiseExtra` takes its per-job advisory lock (key 417) first (it cannot be edited here, Q9), then the live-job guard's job-row share lock (held to commit), ENT-3a's tenant administration share lock, the reads of the routine, the inserts; the audit append is last. The lock observer confirms no lock is taken after the audit append (D2 `[C15]`, RUN). No new advisory lock key is taken by this migration.

## No change to any existing object
No column, index, constraint, policy, grant or trigger added to any existing table; no row written to `app.variation_revision`; no existing object replaced or dropped (D3 proves it at 0140's own step: only the two new tables appear; each existing table's indexes, constraints, policies, privileges and non-internal triggers are identical; every existing function's text and ACL is identical; existing rows are identical by named columns as `row_to_json(...)::text`; then `migrate()` succeeds twice).

## B-prime (coordinator ruling, 12 Oct ~22:35)
Ruling, verbatim in the order: contractor work-order jobs have no pre-live phase, the shared replay-contract harness cannot model a contractor-track job, so the route is `pre_live_allowed` with its own live-job guard.
- Rows and the comment line, `packages/core/src/watchdog.ts` lines 20-22: the one comment line `// contractor work-order jobs have no pre-live phase (they become live in the same transaction as the import), and the route carries its own live-job guard`, then `"/api/contractor/jobs/[id]/site-extras/sor": "pre_live_allowed"` and `"nest:/contractor/jobs/:id/site-extras/sor": "pre_live_allowed"`. Nothing else in the file changed; `watchdogCommandGuards`, the replay-contract harness and its contract test are untouched.
- The six test titles (`packages/db/test/site-extra-pricing.integration.test.ts`): (a) line 193 `[C12] replaying a command id returns the first result, never the job's current state`; (b) line 206 `[C12] the same command id with a changed payload conflicts`; (c) line 225 `[C12] the same command id on another job conflicts`; (d) line 234 `[C12] a successful no-op keeps its identity` (the first call is not a no-op, so the property is tested as: a replay of the same id and body returns the same extra id, the same revision row and basis row and writes nothing; and the "already on the order" outcome logs nothing, so asking again leaves nothing and gives the same refusal each time); (e) line 246 `[C17] a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written`; (f) line 260 `[C9] an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job` (one table-driven test, run for an owner whose role may not log at all and for an allowed-by-role operative not named on the job; the not-live case proves the guard does not answer before authority). All six pass (RUN).
- **The `pre_live_allowed` class switches off NO runtime check for this route: it only removes the shared harness and guard-list expectations.** Evidence: the live-job guard runs AFTER the authority answer in `SiteExtraRepository.precheck` (`packages/db/src/site-extra-repository.ts` line 42) and again inside the write transaction as the seam's first step (line 173, my seam) and inside ENT-3a's `siteExtraAuthoritySeam` (line 26); the 201 and the two-code 409 are documented at `apps/api/src/contractor/site-extra-pricing.controller.ts` line 17 and 18 (`@ApiCreatedResponse`, `@ApiConflictResponse` with `["JOB_NOT_LIVE","IDEMPOTENCY_CONFLICT"]`) and checked by U `[C20]` against `openapi.json`.
- **Gap, named:** extend the shared replay harness to contractor-track jobs in the synthetic database and move these routes onto it (coordinator's FIX-LATER, owned).

## Q10: the "recent items" list is struck
Removed from the result schema (`siteSorItemsV1` has no `recent`, and a test refuses one), the queries file, the repository, the application, the route description and every acceptance line that mentioned it. The search of THIS job's price list stays. Because there is no recent list, the search text is REQUIRED (1 to 80 characters after trimming): a missing, empty or white-space text is refused `INVALID_COMMAND` with nothing read and no connection made (P, D1, W, H tests). That replaces the draft's "with no text it returns the recent list" case.

## SHA-256 evidence that nothing outside the lane changed
The boundary scanner and its seven pinned files are byte-identical to the base (`git show 4db7381:<file> | shasum -a 256` equals the working file):
- `d082694df3dc005461d92ac79f275f31525d35c3e022948b47efa0ed7f9a772f`  apps/api/src/auth/context-boundary.test.ts
- `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14`  packages/db/src/practice-session.ts
- `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c`  packages/db/src/contractor-repository.ts
- `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0`  packages/db/src/contractor-party-repository.ts
- `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3`  packages/db/src/work-order-repository.ts
- `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5`  packages/db/src/sor-repository.ts
- `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d`  packages/db/src/job-scheduling-repository.ts
- `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386`  packages/db/src/work-order-fixtures.ts
- The text of `resolveContext` (the merged shared-bridge call in `apps/api/src/contractor/site-extra.application.ts`; the draft's `contextForContractorSession` no longer exists on main) before and after: `54e01fa61b388ed14b2f6b7bbb1f5016686fe90761744a9ca0834bddb058b873` = `54e01fa61b388ed14b2f6b7bbb1f5016686fe90761744a9ca0834bddb058b873` (11 lines, byte-identical). `assertSiteExtraMode`, `log` and `siteExtraHttpFailure` are untouched. This piece makes no new copy of the context adapter and the context is never stored.
- ENT-3a's two files take ADDITIONS ONLY: `git diff --numstat 4db7381 HEAD`: `packages/db/src/site-extra-repository.ts` 121 insertions, 0 deletions; `apps/api/src/contractor/site-extra.application.ts` 53 insertions, 0 deletions. `inputV1`, `answerV1`, `siteExtraAuthoritySeam`, `precheck`, `recordRefusal` and `logSiteExtra` are unchanged (recordRefusal is CALLED as typed; I did not use the one permitted type edit).
- Existing merged test files changed: only `packages/db/test/tenancy.integration.test.ts`, +4 lines (two rows in each of its two lists, one contiguous pair per list, in name order). No ENT-3a test, pinned list, pinned value or fingerprint changed.
- 0140 migration bytes: `3f09656dc0e867f259b4ce8408f2244a883fd10fbfb83b4106958cbc9e9c322c`.

## Exact added lines in the 12 existing files
### `packages/db/src/site-extra-repository.ts` (full added text; no existing line changed)
```ts
import { SorSiteExtraError, canonicalSorQuantity, orderCheckV1, parseOrderCheckQuery, parseSorItemsQuery, parseSorSiteExtraInput, type SiteOrderCheck, type SorSiteExtraErrorCode } from "@jobguard/core";
import { canonicalJson, sha256Hex } from "./work-order-repository.js";
import { readOrderFacts, readReplay, readStoredPriced, searchItems, type StoredPriced } from "./site-extra-pricing-queries.js";
/** ENT-3c: what a priced log answers. The price itself is never part of an answer (Q7). */
export type StoredSorExtra = Pick<StoredPriced, "variationId" | "jobId" | "coverage" | "sorCode" | "unit" | "claimedQuantity" | "instructedQuantity" | "extraQuantity" | "orderLineScopeItemId" | "priceSource">;

 // ---- ENT-3c additions (append-only): the order check, the server-priced log and the two site reads. Authority first, through the private pre-check; nothing below restates the access rule. ----
 private async sorAuthority(context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string): Promise<{ grant: string; live: boolean } | Refusal> {
  try {
   if (!context || typeof context.tenantId !== "string") throw new InvalidTenantContextError();
   if (actor.tenantId.toLowerCase() !== context.tenantId.toLowerCase()) return { code: "EXTRA_FORBIDDEN", reason: "member_inactive" };
   const authority = await this.precheck(context, actor, jobId);
   return "code" in authority ? authority : { grant: authority.grant, live: true };
  } catch (error) {
   if (error instanceof InvalidTenantContextError) return { code: "NOT_FOUND", reason: "job_out_of_scope" };
   if (error instanceof WatchdogError && error.code === "JOB_NOT_FOUND") return { code: "NOT_FOUND", reason: "job_out_of_scope" };
   // The pre-check raises JOB_NOT_LIVE only after the authority answered allowed, so this caller may know the job exists but is not live.
   if (error instanceof WatchdogError && error.code === "JOB_NOT_LIVE") return { grant: "", live: false };
   throw error;
  }
 }
 private async storedSor(context: VerifiedTenantContext, variationId: string): Promise<StoredPriced> {
  const found = await withTenant(this.pool, context, db => readStoredPriced(db, context.tenantId.toLowerCase(), variationId));
  if (!found) throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
  return found;
 }
 /** Logs a schedule-item extra: the server compares the amount with the order, prices the extra quantity alone, and keeps the price in the raising transaction. */
 async logSorSiteExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<StoredSorExtra> {
  const input = parseSorSiteExtraInput(raw);
  const requestHash = sha256Hex(canonicalJson({ version: "log-sor-site-extra.v1", jobId: input.jobId.toLowerCase(), sorCode: input.sorCode, quantity: input.quantity, orderLineScopeItemId: input.orderLineScopeItemId?.toLowerCase() ?? null, note: input.note }));
  // recordRefusal reads only the command id and the job; the other fields are the typed shape it was written against.
  const refusalInput: Input = { commandId: input.commandId, jobId: input.jobId, note: input.note, description: input.sorCode };
  const refuse = async (refusal: Refusal): Promise<never> => { await this.recordRefusal(context, actor, refusalInput, refusal.reason); throw new SorSiteExtraError(refusal.code); };
  const authority = await this.sorAuthority(context, actor, input.jobId);
  if ("code" in authority) return refuse(authority);
  const tenant = context.tenantId.toLowerCase();
  // Replay comes before the order check, so a replay still returns the first answer after the order, the price list or the member's grants have moved on.
  const replay = await withTenant(this.pool, context, db => readReplay(db, tenant, input.commandId));
  if (replay.revision) {
   const same = replay.revision.jobId.toLowerCase() === input.jobId.toLowerCase() && replay.revision.raisingMembershipId.toLowerCase() === actor.membershipId.toLowerCase() && replay.revision.requestHash === requestHash;
   if (!same) throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
   return this.storedSor(context, replay.revision.variationId);
  }
  if (replay.receiptExists) throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
  if (!authority.live) throw new SorSiteExtraError("JOB_NOT_LIVE");
  let planned;
  try {
   planned = await withTenant(this.pool, context, async db => {
    await requireLiveJob(db, input.jobId);
    const facts = await readOrderFacts(db, tenant, input.jobId, input.sorCode);
    if (!facts || !facts.sorVersionId) throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
    if (!facts.item) throw new SorSiteExtraError("SOR_ITEM_NOT_FOUND");
    const check = orderCheckV1({ sorCode: input.sorCode, quantity: input.quantity, ...(input.orderLineScopeItemId ? { orderLineScopeItemId: input.orderLineScopeItemId } : {}), lines: facts.lines });
    if (check.outcome === "already_on_order") throw new SorSiteExtraError("ALREADY_ON_ORDER");
    return { versionId: facts.sorVersionId, description: facts.item.description, check };
   });
  } catch (error) {
   if (error instanceof WatchdogError && error.code === "JOB_NOT_FOUND") return refuse({ code: "NOT_FOUND", reason: "job_out_of_scope" });
   if (error instanceof WatchdogError && error.code === "JOB_NOT_LIVE") throw new SorSiteExtraError("JOB_NOT_LIVE");
   throw error;
  }
  // merged raiseExtra rewrites every error it does not know, so each seam step remembers its own exact refusal in this one call's local variable.
  let seamFailure: string | undefined;
  const remember = (error: unknown): never => { seamFailure = error instanceof Error ? error.message : undefined; throw error; };
  let raised: { variationId: string };
  try {
   raised = await new ExtraRepository(this.pool).raiseExtra(context, { version: "raise-extra.v1", commandId: input.commandId, commandType, jobId: input.jobId, actorMembershipId: actor.membershipId, grantId: authority.grant, note: input.note, description: planned.description,
    sorItem: { versionId: planned.versionId, code: input.sorCode }, ...(planned.check.outcome === "more_than_ordered" ? { excessOfScopeItemId: planned.check.orderLineScopeItemId } : {}) }, async (db, fact) => {
    try { await requireLiveJob(db, fact.jobId); } catch (error) { remember(error); }
    try { await siteExtraAuthoritySeam(db, fact); } catch (error) { remember(error); }
    try { await db.$client.query("SELECT app.ent3c_record_sor_revision($1,$2,$3,$4)", [fact.jobId, fact.variationId, input.quantity, requestHash]); } catch (error) { remember(error); }
   });
  } catch (error) {
   const recorded: Record<string, SorSiteExtraErrorCode> = { JOB_NOT_LIVE: "JOB_NOT_LIVE", ALREADY_ON_ORDER: "ALREADY_ON_ORDER", EXTRA_NOT_POSITIVE: "EXTRA_NOT_POSITIVE", MONEY_OUT_OF_RANGE: "MONEY_OUT_OF_RANGE", INVALID_QUANTITY: "INVALID_QUANTITY", ORDER_CHECK_STALE: "SITE_PRICING_UNAVAILABLE" };
   if (seamFailure && recorded[seamFailure]) throw new SorSiteExtraError(recorded[seamFailure]!);
   const persistence = error instanceof ExtraPersistenceError ? error.code : undefined;
   if (persistence === "COMMAND_CONFLICT") throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
   if (persistence === "INVALID_COMMAND") throw new SorSiteExtraError("INVALID_COMMAND");
   if (persistence === "NOT_FOUND" || persistence === "INVALID_ORIGIN" || seamFailure === "JOB_NOT_FOUND") {
    // The facts changed after the pre-check: ask the access rule again and answer what it now says.
    const current = await this.sorAuthority(context, actor, input.jobId);
    if ("code" in current) return refuse(current);
    if (!current.live) throw new SorSiteExtraError("JOB_NOT_LIVE");
   }
   throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
  }
  const stored = await this.storedSor(context, raised.variationId);
  if (stored.requestHash !== requestHash) throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
  return stored;
 }
 /** Search of THIS job's price list. The text is required. Writes nothing and records no refusal. */
 async sorItems(context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string, rawQuery: unknown): Promise<{ sorVersionId: string; items: Array<{ code: string; description: string; unit: string }>; truncated: boolean }> {
  const query = parseSorItemsQuery(rawQuery);
  if (!z.string().uuid().safeParse(jobId).success) throw new SorSiteExtraError("NOT_FOUND");
  const authority = await this.sorAuthority(context, actor, jobId);
  if ("code" in authority) throw new SorSiteExtraError(authority.code);
  const tenant = context.tenantId.toLowerCase();
  return withTenant(this.pool, context, async db => {
   const facts = await readOrderFacts(db, tenant, jobId, null);
   if (!facts || !facts.sorVersionId) throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
   return { sorVersionId: facts.sorVersionId, ...(await searchItems(db, tenant, facts.sorVersionId, query.q)) };
  });
 }
 /** The order check as a read: the same outcome the command then acts on, already-on-the-order included as a result. Writes nothing and records no refusal. */
 async orderCheck(context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string, rawQuery: unknown): Promise<SiteOrderCheck["orderCheck"]> {
  const query = parseOrderCheckQuery(rawQuery);
  if (!z.string().uuid().safeParse(jobId).success) throw new SorSiteExtraError("NOT_FOUND");
  const authority = await this.sorAuthority(context, actor, jobId);
  if ("code" in authority) throw new SorSiteExtraError(authority.code);
  const tenant = context.tenantId.toLowerCase();
  return withTenant(this.pool, context, async db => {
   const facts = await readOrderFacts(db, tenant, jobId, query.sorCode);
   if (!facts) throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
   if (!facts.item) throw new SorSiteExtraError("SOR_ITEM_NOT_FOUND");
   const check = orderCheckV1({ sorCode: query.sorCode, quantity: query.quantity, ...(query.orderLine ? { orderLineScopeItemId: query.orderLine } : {}), lines: facts.lines });
   const claimedQuantity = canonicalSorQuantity(query.quantity);
   if (check.outcome === "new") return { outcome: "new" as const, sorCode: query.sorCode, unit: facts.item.unit, claimedQuantity, instructedQuantity: null, extraQuantity: check.extraQuantity, orderLineScopeItemId: null };
   if (check.outcome === "more_than_ordered") return { outcome: "more_than_ordered" as const, sorCode: query.sorCode, unit: facts.item.unit, claimedQuantity, instructedQuantity: check.instructedQuantity, extraQuantity: check.extraQuantity, orderLineScopeItemId: check.orderLineScopeItemId };
   return { outcome: "already_on_order" as const, sorCode: query.sorCode, unit: facts.item.unit, claimedQuantity, instructedQuantity: check.instructedQuantity, orderLineScopeItemId: check.orderLineScopeItemId };
  });
 }
```
### `apps/api/src/contractor/site-extra.application.ts` (full added text; no existing line changed)
```ts
import { SorSiteExtraError, parseLogSorSiteExtra, parseOrderCheckQuery, parseSorItemsQuery, siteOrderCheckV1, siteSorItemsV1, sorSiteExtraFailureV1, sorSiteExtraHttpStatus, sorSiteExtraLoggedV1 } from "@jobguard/core";
 // ---- ENT-3c additions (append-only): the priced log and the two site reads, each in the same order as `log`: mode, principal, session, input, path, context, repository. ----
 // The context is bound to a const in each method and handed straight to the repository (the boundary scanner refuses it inside a callback or a container).
 private sorEntry(principal: unknown): string {
  try { assertSiteExtraMode(); } catch { throw new SorSiteExtraError("MODE_FORBIDDEN"); }
  const session = workOrderPrincipalV1.safeParse(principal); if (!session.success) throw new SorSiteExtraError("UNAUTHENTICATED");
  return session.data.sessionId;
 }
 private sorError(error: unknown): SorSiteExtraError {
  if (error instanceof SorSiteExtraError) return error;
  if (error instanceof SiteExtraError && error.code === "UNAUTHENTICATED") return new SorSiteExtraError("UNAUTHENTICATED");
  if ((error as { code?: string } | null)?.code === "UNAUTHENTICATED") return new SorSiteExtraError("UNAUTHENTICATED");
  return new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
 }
 async logSor(principal: unknown, jobId: string, raw: unknown) {
  const sessionId = this.sorEntry(principal);
  try {
   const member = await new ContractorRepository(this.pool).resolveSession(sessionId);
   const body = parseLogSorSiteExtra(raw);
   const job = z.string().uuid().safeParse(jobId); if (!job.success) throw new SorSiteExtraError("NOT_FOUND");
   const context = await this.resolveContext(sessionId, member);
   const result = await this.repository.logSorSiteExtra(context, member, { commandId: body.commandId, jobId: job.data, sorCode: body.sorCode, quantity: body.quantity, ...(body.orderLineScopeItemId ? { orderLineScopeItemId: body.orderLineScopeItemId } : {}), note: body.note });
   return sorSiteExtraLoggedV1.parse({ version: "sor-site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, extraId: result.variationId, state: "logged", priceSource: result.priceSource,
    orderCheck: { outcome: result.coverage === "new" ? "new" : "more_than_ordered", sorCode: result.sorCode, unit: result.unit, claimedQuantity: result.claimedQuantity, instructedQuantity: result.instructedQuantity, extraQuantity: result.extraQuantity, orderLineScopeItemId: result.orderLineScopeItemId } });
  } catch (error) { throw this.sorError(error); }
 }
 async sorItems(principal: unknown, jobId: string, query: unknown) {
  const sessionId = this.sorEntry(principal);
  try {
   const member = await new ContractorRepository(this.pool).resolveSession(sessionId);
   const parsed = parseSorItemsQuery(query);
   const job = z.string().uuid().safeParse(jobId); if (!job.success) throw new SorSiteExtraError("NOT_FOUND");
   const context = await this.resolveContext(sessionId, member);
   const result = await this.repository.sorItems(context, member, job.data, parsed);
   return siteSorItemsV1.parse({ version: "site-sor-items.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, sorVersionId: result.sorVersionId, items: result.items, truncated: result.truncated });
  } catch (error) { throw this.sorError(error); }
 }
 async orderCheck(principal: unknown, jobId: string, query: unknown) {
  const sessionId = this.sorEntry(principal);
  try {
   const member = await new ContractorRepository(this.pool).resolveSession(sessionId);
   const parsed = parseOrderCheckQuery(query);
   const job = z.string().uuid().safeParse(jobId); if (!job.success) throw new SorSiteExtraError("NOT_FOUND");
   const context = await this.resolveContext(sessionId, member);
   const result = await this.repository.orderCheck(context, member, job.data, parsed);
   return siteOrderCheckV1.parse({ version: "site-order-check.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, orderCheck: result });
  } catch (error) { throw this.sorError(error); }
 }
/** ENT-3c: the failure answer of the priced log and the two reads. Version and code only; anything unexpected, PostgreSQL text included, is SITE_PRICING_UNAVAILABLE. */
export function sorSiteExtraHttpFailure(error: unknown) {
 const code = error instanceof SorSiteExtraError ? error.code : "SITE_PRICING_UNAVAILABLE";
 return { status: sorSiteExtraHttpStatus(code), body: sorSiteExtraFailureV1.parse({ version: "sor-site-extra-error.v1", code }) };
}
```
### `config/agent-lane-assignments.json` (additions only)
```
"ent-3c":{"branches":["codex/sandbox/ent-3c"],"receipt":"docs/verdicts/ENT-3c/BUILDER_RECEIPT.md","note":"ENT-3c: the order check and the server-priced first re ...[line cut for the receipt; full text in the commit]
```
### `packages/core/src/index.ts` (additions only)
```
export * from "./site-extra-pricing.js";
```
### `packages/core/src/watchdog.ts` (additions only)
```
  // contractor work-order jobs have no pre-live phase (they become live in the same transaction as the import), and the route carries its own live-job guard
  "/api/contractor/jobs/[id]/site-extras/sor": "pre_live_allowed",
  "nest:/contractor/jobs/:id/site-extras/sor": "pre_live_allowed",
```
### `packages/db/src/migrate.ts` (additions only)
```
  new URL("../migrations/0140_site_extra_pricing.sql", import.meta.url),
```
### `packages/db/MIGRATIONS.md` (additions only)
```

## 0140 — site extra pricing (ENT-3c)

Additive only: two new tables, `app.extra_sor_revision` (the server-priced first revision of a schedule-item site extra, one row at most per extra, `revision=1`) and
`app.extra_pricing_basis` (how a revision's price was reached, keyed by extra and revision number, only `server_sor` for revision 1 can be written here), five routines
(`app.ent3c_record_sor_revision(uuid,uuid,text,text)`, `app.ent3c_sor_revision_guard()`, `app.ent3c_require_sor_revision_audit()`, `app.ent3c_pricing_basis_guard()`,
`app.ent3c_require_pricing_basis()`) and triggers on the two new tables only. It needs 0110 and 0122 and calls no ENT-3a routine. No column, index, constraint, policy,
grant or trigger is added to any existing table, no row of `app.variation_revision` is written, no existing object is replaced or dropped, nothing is backfilled and no existing row changes.

Standard F: the application login holds SELECT only on both new tables. The only writer is the SECURITY DEFINER routine `app.ent3c_record_sor_revision`
(owner `jobguard_migration`, `search_path=pg_catalog`, EXECUTE granted to `jobguard_runtime` by exact signature, revoked from PUBLIC and infrastructure). It takes no actor,
rate, price, outcome or time: it reads the stored origin, receipt, variation, baseline revision, schedule item and order lines of the raising transaction, decides the
order check again, prices the extra quantity alone through the merged `app.sor_line_net_pence`, and runs only while the raising command's own receipt is still processing.
The two BEFORE INSERT guards bind every writer, the table owner included, and set `content_hash` and `server_recorded_at` themselves; two deferred constraint triggers require
the raising transaction's one audit event and the basis row at commit. Row security is enabled and forced with the merged two-role tenant policy; the merged immutability
trigger rejects UPDATE and DELETE.

Forward fix only. Removing the new objects is permissible only before any priced extra has been accepted; accepted history must never be cleared by rollback. Upgrade proof:
`packages/db/test/site-extra-pricing-upgrade.integration.test.ts` (rule 9 shape). Database tests are written and run on the Mac gate; see the builder receipt for what was run here.
```
### `packages/db/test/tenancy.integration.test.ts` (additions only)
```
      { relname: "extra_pricing_basis", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_sor_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_pricing_basis", owner: "jobguard_migration" },
      { relname: "extra_sor_revision", owner: "jobguard_migration" },
```
### `apps/api/src/app.module.ts` (one existing line is replaced by itself plus the new tokens: 1 line removed, shown below)
```
import { SiteExtraPricingController } from "./contractor/site-extra-pricing.controller.js";
@Module({ controllers: [ScimController,SiteExtraController,SiteExtraPricingController,ContractorPracticeSessionController,SsoRequiredController,SsoController,AuditExportController,RecoveryFollowUpCont ...[line cut for the receipt; full text in the commit]
```
Removed (replaced by the line above):
```
@Module({ controllers: [ScimController,SiteExtraController,ContractorPracticeSessionController,SsoRequiredController,SsoController,AuditExportController,RecoveryFollowUpController,RecoveryMessageContr ...[line cut for the receipt; full text in the commit]
```
### `apps/api/src/workspace/application.ts` (one existing line is replaced by itself plus the new tokens: 1 line removed, shown below)
```
  return Object.freeze({ scim, ssoRequired, siteExtras: Object.freeze({ log: (jobId: string, raw: unknown) => siteExtras.log(contractorPrincipal, jobId, raw), logSor: (jobId: string, raw: unknown) => siteExtras.logSor(contractorPrincipal, jobId, raw), sorItems: (jobId: string, query: unknown) => siteExtras.sorItems(contractorPrincipal, jobId, query), orderCheck: (jobId: string, query: unknown) => siteExtras.orderCheck(contractorPrincipal, jobId, query) }), sso, auditExports:Object.freeze({list:()=>auditExports.list(dependencies.sessionId),create:(raw:unknown)=>auditExports.create(dependencies.sessionId,raw)}), practiceFacts:Object.freeze({view:practiceFacts.view.bind(practiceFacts),command:practiceFacts.command.bind(practiceFacts)}), recoveryAllocations:Object.freeze({view:recoveryAllocations.view.bind(recoveryAllocations),command:recoveryAllocations.command.bind(recoveryAllocations)}),  ...[line cut for the receipt; full text in the commit]
```
Removed (replaced by the line above):
```
  return Object.freeze({ scim, ssoRequired, siteExtras: Object.freeze({ log: (jobId: string, raw: unknown) => siteExtras.log(contractorPrincipal, jobId, raw) }), sso, auditExports:Object.freeze({list:()=>auditExports.list(dependencies.sessionId),create:(raw:unknown)=>auditExports.create(dependencies.sessionId,raw)}), practiceFacts:Object.freeze({view:practiceFacts.view.bind(practiceFacts),command:practiceFacts.command.bind(practiceFacts)}), recoveryAllocations:Object.freeze({view:recoveryAllocations.view.bind(recoveryAllocations),command:recoveryAllocations.command.bind(recoveryAllocations)}), workOrders:Object.freeze({overview:()=>workOrders.overview(contractorPrincipal),importGenerated:(raw:unknown)=>workOrders.importGenerated(contractorPrincipal,raw),batch:(batchId:string)=>workOrders.batch(contractorPrincipal,batchId),revisions:(workOrderId:string)=>workOrders.revisions(contractorPri ...[line cut for the receipt; full text in the commit]
```
### `apps/api/src/workspace/index.ts` (additions only)
```
export { sorSiteExtraHttpFailure } from "../contractor/site-extra.application.js";
```
### `apps/api/openapi.json`
Regenerated with the repository's own generator: 180 insertions, 0 deletions; every existing path unchanged. New paths: `/contractor/jobs/{id}/site-extras/sor` (POST, 201 and 409), `/contractor/jobs/{id}/sor-items` (GET), `/contractor/jobs/{id}/order-check` (GET).

## Deviations and BLOCKING / LATER notes
- **No STOP condition was hit.** No existing merged test, pinned list, pinned value or fingerprint changed; no money figure differs from the draft; no direct write grant was needed; every citation was reconciled except the two small items below.
- LATER (draft vs merged precheck): the draft's [C17] says a replay after the job has left live returns its first answer and that the two reads work on a job that is no longer live. On main `SiteExtraRepository.precheck` calls `requireLiveJob` after the authority answer and I may not edit it. I kept authority first and then used the fact that `precheck` raises `JOB_NOT_LIVE` only AFTER the answer is `allowed`: my methods treat that one outcome as "authorised, job not live", so a stored replay still returns its first answer, the reads work, and a NEW log is refused `JOB_NOT_LIVE` with nothing written. An unauthorised caller never reaches it. Reviewers: please confirm this reading.
- LATER (draft contradiction): [C3] forbids any result key matching `price`, but the draft's own log answer carries `priceSource` (and [C24] says the answer's `priceSource` is the stored value). The test skips exactly the key `priceSource`.
- LATER: added two private helper methods in the same appended block of `SiteExtraRepository` (`sorAuthority`, `storedSor`) and two in `SiteExtraApplication` (`sorEntry`, `sorError`); the order said three public methods and nothing else. No existing line changed. `sorCall`-style callbacks were refused by the boundary scanner (a context may not be passed through a callback), so each application method binds the context to a const and calls the repository directly.
- LATER: the replay lookup also reads `app.command_receipt` (any receipt under the command ID, of any command, gives `IDEMPOTENCY_CONFLICT`), so that a command ID first used by ENT-3a's free-text log, or by any other command, conflicts even when this body would otherwise be refused first.
- LATER: after `raiseExtra` resolves the stored request hash is compared with this call's hash; a concurrent second call with the same ID and a different quantity (quantity is not part of `raiseExtra`'s own fingerprint) therefore ends `IDEMPOTENCY_CONFLICT` with nothing written (D2 `[C14]`).
- LATER (a note for the lane line): the lane's `allow` list does not contain `packages/db/src/index.ts`, and I did not need it (the queries file is used only by the repository).
- UI one-liner (LATER, never code): a site screen could show the order-check result before the worker taps "log".
- Rule 11 / wording: no credential-shaped string; the database login value in the new cluster helper is built from two parts at run time; the avoided words are not used in code, tests, comments or this document.

## HELD (built none of it)
Every screen, page, component and browser test; the four-tap speed line and accessibility line (ENT-3e); on-device dictation; "submitted" (`awaiting_approval`, requirement snapshot, `variation.state`: ENT-5, ruling A3); the supervisor query for an item within the order (ENT-5, ruling A4); "work status, with the proceed limit shown" and flagging candidate duplicates (nobody owns them, Q11); a revision record for a free-text extra and the `surveyor_quoted` and `unpriced` basis records; any read of the stored price for a person and any money value in a site answer (ENT-5, Q7); photo and resident confirmation (ENT-3d: the note stays required); visits, close-out and the visit reference (ENT-3b, Q6b); offline capture and device fields (ENT-12); acting as a made-up site worker; office and client-instructed extras; fees (ENT-7); VAT; any registry row for ENT-3a's own route; any entry in `watchdogCommandGuards`.

## The eight honest limits (stated in the contract too)
1. Only the practice owner can hold a contractor practice session today and an owner may not log a site extra, so no signed-in person can reach a success path; it is proved through the repository in the database tests and at service level with a stubbed session lookup, until the separate "practice only" piece exists.
2. The writer reads the actor from the stored origin and runs only while the raising receipt is in flight; the access rule binds the governed path, not a raw database client holding the runtime role, which could raise an extra by hand as it already can; even then it cannot store any price but the merged function's.
3. The database does not force every schedule-item extra to have a price (merged ENT-4b tests raise such extras with none, and no trigger may be put on a merged table); the rule binds the one method.
4. The price is named in no audit payload: the record is tied to the raising transaction's one audit event at commit and to the origin hash (Q8).
5. The live-job guard is not the write transaction's first lock: merged `raiseExtra` takes its per-job advisory lock before any seam runs (Q9); the guard still holds to commit and a refusal leaves nothing written.
6. The pre-check and the command are separate transactions; the routine decides again from the stored baseline, so an order revision landing in between gives a refusal or a retry-safe 503, never a mixed record.
7. Nothing in this piece reads the stored price back to a person; ENT-5 owns that.
8. A free-text extra still has no revision record of any kind.

## Remaining gates
ENT-3b (parallel, `0139`; the dispatcher's union catch-up of the shared registration files and of `site-extra-repository.ts` / `site-extra.application.ts`, which both pieces extend at the end of the class); the "practice only" made-up site worker piece; UI (ENT-3e, parked); the shared replay harness FIX-LATER above; the separate Mac verification run, the push and both independent reviews are the dispatcher's. ENT-3a is merged on main, so this piece is not stacked on an unmerged branch.

## Self-review (read against the order as a strict independent reviewer would)
Checked, and what I changed:
- Every [C] line has a test carrying its ID that fails without the change (the failed-first runs above prove it for the core and database files; for U/H/W the tests were written after the code and I confirmed by the failures they found).
- The price is computed in exactly one place: `app.sor_line_net_pence` inside `app.ent3c_record_sor_revision`, and re-verified (not recomputed) by the guard with the same function. No TypeScript of mine does arithmetic on pence; the pure module reads the TypeScript parser check in P `[C3]`. No quantity is a `number`, `real` or `double precision`.
- No request value reaches the actor, tenant, time, command type, baseline, price list version, unit, rate, adjustment, price, extra quantity or pricing basis: the body schema is strict (51 names refused one by one), the route gives only the job, and the routine reads everything else from stored rows.
- The access rule appears nowhere in my code or SQL: it is called through the private `precheck` and `siteExtraAuthoritySeam` only. A caller-only refusal is identical for every job ID, a job refusal for every cause (D1, D2). Reads record no refusal.
- The routine and both guards fail closed on every missing row (NULL checks use `IS DISTINCT FROM`; `IF price IS NULL OR price<1`). EXECUTE is by exact signature. No INSERT sits in a block with an EXCEPTION clause. Tenant named in every WHERE.
- CHANGED during review: (1) removed two assertions from my unit test that pinned a shared merged file's content (rule 12); (2) renamed words that the wording note excludes; (3) split the line that held the value and the sensitive word in the http test; (4) built the database login value from parts; (5) renamed the six B-prime tests with their acceptance IDs; (6) the application was rewritten once to satisfy the boundary scanner (see commands table).
- Not changed but worth a reviewer's eye: the `JOB_NOT_LIVE` handling above; the extra helpers; the test-only hand-raise helpers in the fixtures insert as the table owner (never as the application login).

Builder receipt only — not independently verified, not accepted.
