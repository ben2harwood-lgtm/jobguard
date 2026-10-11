# ENT-4b builder receipt — 11 October 2026

Builder: Codex GPT-6.1 Sol. Base: 530681c030a2333ec8f27f4d1a2cf4803a833465. Head: UNCOMMITTED WORKING TREE; the dispatcher supplies the committed head. Branch: codex/sandbox/ent-4b. Issued scope is persistence, repository, audit events and tests only. Check lane RED. No route, screen, OpenAPI change, live provider, spending, deployment, push, merge or acceptance.

Builder receipt only — not independently verified, not accepted.

## Build coverage

| Card | Source-inspected result |
|---|---|
| B1 Origin | BUILT contractor provenance in 0122 (built as 0117; renumbered) and ExtraRepository; command-receipt FK ALREADY MERGED in 0053_shared_money_origin.sql:26. |
| B2 Trigger | ALREADY MERGED command map/actor/track: 0053:136–161, CHECKs at 28–29 and 70–71. New work-order provenance guard BUILT after extra_origin_validate; existing function untouched. |
| B3 Deferred origin | ALREADY MERGED variation_requires_origin: 0053:77–78; primary key at 24 prevents a second origin. Tests/catalog assertions added, no second constraint. |
| B4 Event/link tables | BUILT extra_event, extra_duplicate_link, extra_order_line_link, composite keys, sequencing, graph guards, later-instruction links. Unlink rows/guards BUILT; unlink repository/receipt type HELD (Q9, plan names no command). |
| B5 Variation columns | BUILT four nullable SoR/excess reference columns. Revision pricing basis removed in Round 1 under the coordinator ruling; HELD pending its own decision. No feature revision/pricing write. variation.state and its grant/CHECK untouched (Q5). |
| B6 Repository/audit/immutability | BUILT raiseExtra, linkDuplicate, linkOrderLine, readExtra, readDuplicateGroup; same-transaction seam before audit. Existing origin immutability retained; new tables append-only, deferred exact audit checks include xmin equality. |

Tests were written before feature implementation. Subsequent self-review strengthened the written tests. Every database result below is **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Test-source compilation is not PostgreSQL execution, migration validation or a model verdict.

## Changed files

- `config/agent-lane-assignments.json`
- `docs/contracts/extra-origin-persistence-v1.md`
- `docs/verdicts/ENT-4b/BUILDER_RECEIPT.md`
- `packages/core/src/extra-persistence.test.ts`
- `packages/core/src/extra-persistence.ts`
- `packages/core/src/index.ts`
- `packages/db/MIGRATIONS.md`
- `packages/db/migrations/0122_extra_origin_persistence.sql`
- `packages/db/src/extra-repository.ts`
- `packages/db/src/index.ts`
- `packages/db/src/migrate.ts`
- `packages/db/test/extra-fixtures.ts`
- `packages/db/test/extra-links.integration.test.ts`
- `packages/db/test/extra-origin-upgrade.integration.test.ts`
- `packages/db/test/extra-origin.integration.test.ts`
- `packages/db/test/tenancy.integration.test.ts`

## Acceptance map

O = packages/db/test/extra-origin.integration.test.ts; L = packages/db/test/extra-links.integration.test.ts; U = packages/db/test/extra-origin-upgrade.integration.test.ts; P = packages/core/src/extra-persistence.test.ts.

| Criterion | File and exact test name | Evidence |
|---|---|---|
| S7 | P: `[S7] strict raise schema accepts minimal/full inputs and refuses authority keys` | PASS (executed) |
| S7 | P: `[S7] strict link/read schemas refuse unknown keys and accept valid records` | PASS (executed) |
| S6 | P: `[S6] fixed hash vector binds every field and distinguishes NULL from empty text` | PASS (executed) |
| DW1 | O: `[DW1] runtime cannot mutate immutable rows; owner triggers refuse UPDATE and DELETE` | Written-first; NOT RUN |
| DW2a | O: `[DW2a] all mismatched raising command/kind pairs are refused` | Written-first; NOT RUN |
| DW2b | O: `[DW2b] receipt actor, processing status and exact semantic identity are required` | Written-first; NOT RUN |
| DW2c | O: `[DW2c] origin and client capture uniqueness reject second rows with 23505` | Written-first; NOT RUN |
| DW2d | O: `[DW2d] neither origin column accepts the other track's kinds` | Written-first; NOT RUN |
| DW3 | O: `[DW3] missing origin fails at commit; SH-1 deferred constraint remains singular` | Written-first; NOT RUN |
| DW5a | O: `[DW5a] failures at each write, seam, audit and commit leave no facts or receipt` | Written-first; NOT RUN |
| DW5b | O: `[DW5b] command/capture replay and two-connection retry have one effect; conflicting payloads fail` | Written-first; NOT RUN |
| DW6 | O: `[DW6] audit uses closed ID/hash keys; capture metadata never appears in audit or errors` | Written-first; NOT RUN |
| R1 | O: `[R1] office, instruction, import, parties, unknown commands cannot write or relabel site origins` | Written-first; NOT RUN |
| R4 | O: `[R4] earlier small-builder origins survive a later contractor assignment unchanged` | Written-first; NOT RUN |
| S1 | O: `[S1] stamped per-call contexts fail closed; other tenant/job reads are NOT_FOUND` | Written-first; NOT RUN |
| S2 | O: `[S2] new tenant tables have FORCE RLS, tenant policy and migration ownership` | Written-first; NOT RUN |
| S3 | O: `[S3] exactly SELECT/INSERT; invoker functions uncallable by runtime/PUBLIC; least privilege preserved` | Written-first; NOT RUN |
| S4 | O: `[S4] origin/event/audit share xmin; absent or mismatched audit/logged fact fails at commit` | Written-first; NOT RUN |
| S5 | O: `[S5] server overwrites authority fields; grants, scope, visits, membership and prompt are guarded` | Written-first; NOT RUN |
| S4 | O: `[S4] origin requires exact logged and exact hash/command audit in the same transaction` | Written-first; NOT RUN |
| S5 | O: `[S5] evidence and excess references preserve job identity and new scope lineage` | Written-first; NOT RUN |
| S5 | O: `[S5] grants cover exactly tenant/team/branch/region; visits bind member/job; inactive members fail` | Written-first; NOT RUN |
| S6 | O: `[S6] every stored contractor hash equals the pure mirror with six-digit timestamp text` | Written-first; NOT RUN |
| S9 | O: `[S9] merged regression suites, scanner and seven pinned bridges stay byte-identical` | Written-first; NOT RUN |
| C3 | O: `[C3] all fixtures are synthetic_demo and every raised identity is a new scope item` | Written-first; NOT RUN |
| DW1 | L: `[DW1] all new table rows refuse mutation as runtime and migration owner` | Written-first; NOT RUN |
| DW4a | L: `[DW4a] composite foreign keys reject cross-tenant and same-tenant wrong-job links/evidence` | Written-first; NOT RUN |
| DW4b | L: `[DW4b] self, chain, cycle, second active link and concurrent chain are refused` | Written-first; NOT RUN |
| DW4b | L: `[DW4b] immutable unlink row guards preserve history and allow relink before export; command surface HELD` | Written-first; NOT RUN |
| DW4c | L: `[DW4c] order-line links preserve origin/hash; same/older revision and duplicate use are refused` | Written-first; NOT RUN |
| DW4b | L: `[DW4b] either exported endpoint blocks link and unlink, preserving the origin` | Written-first; NOT RUN |
| DW4c | L: `[DW4c] an instructed revision older than the origin is refused` | Written-first; NOT RUN |
| DW5a | L: `[DW5a] failed link/order seam and deferred missing audit roll back rows and receipts` | Written-first; NOT RUN |
| DW5a | L: `[DW5a] link, raw unlink and order writes roll back at receipt, fact, audit and commit failures` | Written-first; NOT RUN |
| S4 | L: `[S4] missing unlink/order audit fails commit with no partial link history` | Written-first; NOT RUN |
| DW6 | L: `[DW6] link audits contain only allowed IDs and hashes` | Written-first; NOT RUN |
| R2 | L: `[R2] effective origin is independent of canonical choice and uses lower ID on a time tie` | Written-first; NOT RUN |
| R3 | L: `[R3] later formal instruction leaves one extra and its immutable site origin intact` | Written-first; NOT RUN |
| S1 | L: `[S1] foreign tenant link/event reads are NOT_FOUND; writes cannot name foreign extras` | Written-first; NOT RUN |
| S4 | L: `[S4] both link tables and unlink history share xmin with their audit; missing audit fails commit` | Written-first; NOT RUN |
| S8 | U: `[S8] preserves old columns and fixture origins, adds only NULL columns; migrator idempotent and ordered` | Written-first; NOT RUN |

S2 also has six appended catalogue rows (RLS and owner lists) in packages/db/test/tenancy.integration.test.ts; every prior line/row/assertion is byte-identical. S9's unchanged context scanner actually ran: 145/145. R4 uses genuine command-backed small-builder origins, then appends a contractor assignment and verifies the immutable earlier job track; legacy/backfilled NULL identities are separately preserved by S8.

## Commands and actual results

Node v24.17.0, TypeScript 5.8.3, Turbo 2.10.12, Vitest 4.1.11. No package or lockfile change; no dependency downloaded/installed. The initial global pnpm launcher stalled at its package-manager handoff and was interrupted (exit 130). A temporary shell launcher in /private/tmp/jg-ent4b-bin/pnpm executes the **already cached pinned pnpm 10.28.1** at /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs. PATH was prepended for subsequent pnpm commands, without changing repository configuration. First typecheck/lint attempts were interrupted (130) while diagnosing excessive generic Zod type instantiation; a supplemental direct DB tsc completed with exit 2 and TS2589 at repository lines 61/102/115. The parse helper was narrowed to safeParse's structural interface; subsequent commands passed as below. A diagnostic trace attempt was interrupted (130), and no trace was committed.

| Command | Exit | Observed result |
|---|---:|---|
| pnpm typecheck | 0 | 7 successful / 7 tasks, 2 cached; 42.09s |
| LANE_BASE_REF=origin/main pnpm lint | 0 | 7 successful / 7 tasks, 2 cached; 55.317s |
| LANE_BASE_REF=origin/main pnpm lint:lanes | 0 | ent-4b lane passed; merge-base comparison against origin/main 8db62b3 |
| pnpm turbo run build --filter=@jobguard/core... | 0 | 1 successful / 1 task |
| pnpm --filter @jobguard/core exec vitest run src/extra-persistence.test.ts src/extra-origin.test.ts src/enterprise-domain | 0 | 6 files, 287 tests passed; no skipped tests |
| pnpm turbo run build --filter=@jobguard/api... | 0 | 6 successful / 6 tasks, 2 cached; 2m3.571s |
| pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts | 0 | unchanged scanner: 1 file, 145 tests passed |
| node --test tools/*.test.mjs | 0 | 42 passed, 0 failed/cancelled/skipped/todo |
| pnpm build | 0 | 7 successful / 7 tasks, 2 cached; 9m21.87s; Next compiled and generated routes with existing warnings |
| pnpm openapi:check | 1 | environment failure before generation: tsx IPC listen EPERM, errno -1, address /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/66327.pipe; Node v24.17.0. No check weakening or retry workaround. |
| supplemental tsc of the four new database test/fixture sources | 0 | source-only strict compilation; initial fixture type inference errors (exit 2) corrected; later compilation passed |
| git diff HEAD --check | 0 | no whitespace errors |
| source-preservation script | 0 | 27 checks passed, including exact removal-of-additions comparison for the six allowed existing files |

Supplemental source-only command: `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --exactOptionalPropertyTypes --noUncheckedIndexedAccess --module NodeNext --moduleResolution NodeNext --target ES2023 packages/db/test/extra-fixtures.ts packages/db/test/extra-origin.integration.test.ts packages/db/test/extra-links.integration.test.ts packages/db/test/extra-origin-upgrade.integration.test.ts`. It does not execute any database test.

Observed environment warnings: Turbo shared worktree cache emitted `IO error: Operation not permitted (os error 1)` while tasks themselves succeeded; cached config/storage log paths name earlier worktrees. Next selected the parent workspace lockfile/root and emitted existing CSS autoprefixer `end` support warnings. No pinned file was edited to suppress warnings. Logs are /private/tmp/ent4b-*.log; only observed exits/counts are listed.

## NOT RUN — integrator/CI owns execution

All of the following: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.

- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/extra-origin.integration.test.ts test/extra-links.integration.test.ts test/extra-origin-upgrade.integration.test.ts test/shared-money-origin.integration.test.ts test/work-order-import.integration.test.ts test/tenancy.integration.test.ts test/demo-bootstrap.integration.test.ts`
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/work-order-concurrency.integration.test.ts test/job-scheduling.integration.test.ts test/contractor.integration.test.ts test/variation.integration.test.ts`
- SV-2's origin suites on the merged result (SV-2 owner/integrator identifies its final filenames).
- `pnpm test:db`
- `pnpm test:migrations`
- Existing Playwright suites in both mobile-360 and desktop projects; no new web workflow/spec in this leaf (C1/C7 exemption).
- Root `pnpm test` (includes PostgreSQL). Tools and selected pure/scanner tests were run separately as recorded.

`pnpm eval` is inapplicable: no AI gateway, extraction/parser/prompt/model/matching policy changed. No live-model run, no provider call.

## Migration and compatibility

Migration **0122_extra_origin_persistence.sql** is registered in numeric order after 0112 on this base. Position test asserts strictly increasing migration names and 0122 after 0053/0110, never that it is last. No migration was run here.

Existing objects extended, by addition only:

- app.extra_origin: ten nullable/no-default contractor columns; grant/order/revision/visit/two evidence composite FKs (six new FKs); contractor-column and hash CHECKs; partial capture-ID unique index; one BEFORE INSERT provenance trigger after SH-1's validator; one deferred raised-audit trigger.
- app.variation: four nullable/no-default SoR/excess columns; two existing-key FKs; one paired-reference/track CHECK.
- app.variation_revision: no change after Round 1; pricing basis HELD to preserve approved evidence packs.

New tables: app.extra_event, app.extra_duplicate_link, app.extra_order_line_link; policies, ownership, minimal grants and immutability only for these tables. New functions: app.ent4b_origin_provenance, app.ent4b_fact_guard, app.ent4b_require_origin_audit, app.ent4b_require_link_audit; all SECURITY INVOKER, migration-owned and revoked from PUBLIC/runtime. No new callable helper. New operational alerts: none; this leaf adds no executor or external action. Existing command-receipt FK/map/deferred origin constraint reused. No existing row UPDATE/backfill/default/type/constraint/policy/grant or routine replacement; no SECURITY DEFINER added. Forward fix is additive corrective migration with callers disabled; retain history, do not drop populated rows.

The upgrade fixture seeds actual pre-0053 input so SH-1 produces backfilled origins; also seeds later legacy and fixture-contractor origins and imported work-order jobs. A preceding revision fixture copies values from the merged immutable SoR, with no supplied price or arithmetic; the new repository writes no revision or money figure. Old-column equality/new-column NULL/fresh-catalog/idempotence and unchanged existing routine definitions are assertions written for CI, not observed database facts.

Origin hash recipe `extra-origin-hash.v1`: UTF-8 prefix plus LF, 24 fields in fixed documented order; NULL `N;`, non-null `S<byte-length>:<value>;`, booleans true/false, timestamps server-read UTC text with six fractional digits. Exact fields/vector are in docs/contracts/extra-origin-persistence-v1.md and P. Worked vector digest **461292ec6f37346ad387cf7499f2e15f538b564d7f18adf86de26524fb358654** (independently computed with Python hashlib before implementation; pure test actually passed). SQL/pure parity remains NOT RUN.

## Preserved source hashes

All hashes below compare byte-identically to base 530681c030a2333ec8f27f4d1a2cf4803a833465 (source check executed). This distinguishes source preservation from executing these suites.

| File | SHA-256 |
|---|---|
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/db/src/contractor-repository.ts` | `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c` |
| `packages/db/src/contractor-party-repository.ts` | `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0` |
| `packages/db/src/work-order-repository.ts` | `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3` |
| `packages/db/src/sor-repository.ts` | `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5` |
| `packages/db/src/job-scheduling-repository.ts` | `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d` |
| `packages/db/src/work-order-fixtures.ts` | `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386` |
| `packages/db/test/shared-money-origin.integration.test.ts` | `8095d33c25a5ea8ebf78a90fb0df926e958105df97a8901b109ee89fee1c1b56` |
| `packages/db/test/work-order-import.integration.test.ts` | `d2d9448e46c79fcba822fb8d3b0276e4b07df20309d53c2d31e3aba733324db4` |
| `packages/db/test/work-order-concurrency.integration.test.ts` | `c63bfde5e49701b698edb0b0d408390aaf5c93a6903cf0ee43a6ccd42fd7cf8e` |
| `packages/db/test/job-scheduling.integration.test.ts` | `f72ed51fa0cfd0f7241956ba593665992c0a963157c9cad482dfa11b1acd22b5` |
| `packages/db/test/contractor.integration.test.ts` | `6a024fb3e46e3db8b954c69838bddd22cc440c03bc68bcf29312c5a5f3f21ce9` |
| `packages/db/test/variation.integration.test.ts` | `c12456ca23db777f8deededc72ba1cc23a149fc00ef7764a48f8349a45998369` |
| `packages/db/test/demo-bootstrap.integration.test.ts` | `9105566ea61864253a0ee7de158dbe6b076b5538457b454e75d97f33ce684b8f` |
| `apps/api/src/auth/context-boundary.test.ts` | `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` |
| `apps/api/openapi.json` | `ba2754c61c83ffaf04dfb9d7dd97f4d95a66d9752ed12ec410de476404a6fe0b` |
| `packages/db/src/variation-repository.ts` | `3e5b0a9a6630678eb84e56f6c7da7d7c2af831a9c2dd856974c3256ded54800f` |
| `packages/db/src/tenant-context.ts` | `9237013c368deeec3d14098b030264dbd6cc3e57534e4cbc237cad06aa2b4b0f` |
| `packages/db/src/commands.ts` | `a3a96ccde8d07e4a1f9d8247715be7a20ffdca470c2cd8dcb9831c003d4551b5` |
| `packages/db/src/audit.ts` | `7c38ca4c738f40188fac05f7d1abe8361c081581992318d0124d1c9a9be2603b` |
| `packages/core/src/extra-origin.ts` | `abab327d1da9c66aac1ae62fef0a41f74cf51ce518c88c52f58d237326931d1c` |

## Held items, overlaps and owed work

- Q3 HELD: founder's role-per-command ruling; only structural grant/member provenance built, no role-per-command rule. ENT-3 must bind the actor/type server-side and enforce approved authorization before exposing a route.
- Q4 HELD to ENT-3: first route's stamped-context bridge/scanner question. Seven pinned files and scanner untouched.
- Q5 HELD to ENT-5: state-cache expansion and transition rules. variation.state untouched.
- Q6 HELD to ENT-8a: prompt provenance/table/FK. No prompt column; work-order jobguard_surfaced_confirmed refused.
- Q9 HELD: unlink repository function/type/authorization, because the plan names no unlink command. Row kinds/guards only; fixture SQL proves pre-export history and refusal behavior when CI runs it.
- Strict unchanged SH-1 extraOriginV1 cannot represent legacy/backfilled NULL command/member IDs. No UUID is fabricated and no legacy schema amendment is invented; readExtra returns INVALID_ORIGIN for those NULL identities. Optional expansion was asked asynchronously; no answer/ruling was received. R4 covers command-backed earlier small-builder origins; broader legacy reads remain held for an issued contract ruling.
- SV-2 (#119, reserved 0118 per issue) shares extra_origin and owns source_signal_id/map changes; ENT-4b never restates validate_extra_origin or edits variation-repository. Integrator reruns both origin suites and handles renumbering.
- ENT-3 owns the seam's first capture/revision rows and route; ENT-5 owns lifecycle transitions, MarkDuplicate user authorization and unlink authority; ENT-6 owes unresolved-candidate export blocking, duplicate/export serialization and billed-once proof; ENT-7 owns authorized post-export reconciliation/compensation; ENT-8a owns prompt provenance.
- No independent model review or acceptance was performed. Fresh Claude Opus and separate Sol checks must name every criterion after CI and bind the exact dispatcher commit; separate actor accepts. Founder/dispatcher owns commit/push/merge. Release gates D16, G1 and ENT-14 remain unresolved.

## Self-review

Re-read the issued header/card, shared primitives, migration/repository/schema/test sources and whole working-tree diff. `git diff origin/main` was inspected read-only; origin/main advanced to 8db62b3 while the issued checkout stayed 530681c030a2333ec8f27f4d1a2cf4803a833465, so unrelated merged repair differences were not copied or edited. Actual changes were reviewed against HEAD and the exact lane. The preservation script checked all prior lines in registration/catalog files byte-identical after removing only the permitted additions, and all pinned sources/test hashes against the issued base.

Checked every DW/R/S test ID; tenant/job composite keys, enabled/FORCE RLS, migration ownership, SELECT/INSERT grants, append-only rows, exact receipt mapping reuse, fixture exemptions, same-transaction audit/logged facts, timestamps/hash order/framing, retry/conflict/concurrency, no money arithmetic/feature revision, no existing routine/body/row change and no held route/prompt/unlink/permission feature. SQL is source-inspected only; no claim of migration execution/catalog verification.

Corrections made: narrowed generic parser after TS2589; completed receipts with completed_at; made duplicate semantic keys command-specific for later relink; strengthened deferred checks with xmin equality; bound event revisions to their extra; checked typed resident-confirmation evidence; corrected evidence fixture columns and succeeded receipt shape; fixed uniqueness and cross-track tests to use valid receipts; added actual SH-1 backfill and prior-revision upgrade fixtures; strengthened grant scope/member/visit, unlink/order audit and per-stage rollback tests; kept audit append as the final business lock. Pure/scanner/tool/type checks and strict database-test source compilation passed. Remaining evidence is listed above as NOT RUN/environment-held, not a pass.

Generated output cleanup completed: removed only untracked workspace .pnpm-store, dist, .next, .turbo and tsconfig.tsbuildinfo outputs; no test-results/browser output was produced. Intended commit message is /private/tmp/jg-msg-ent-4b.txt. Final lane check including this receipt passed (exit 0).

## CI repair 1 — 11 October 2026 (Claude Sonnet, run on the Mac)

First real database run of this leaf (the Codex sandbox could not start PostgreSQL, so every database test above was NOT RUN). Run on the Mac with embedded PostgreSQL 16.10, one vitest run at a time inside `heavy-slot`, `--maxWorkers=2`.

**Catch-up (before any repair).** Merged `origin/main` (bbca5ca) into the branch (merge commit d8563dc). Four files conflicted and were resolved by keeping both sides: `packages/core/src/index.ts` (main's `recovery-eligibility-v3` export plus this leaf's `extra-persistence` export), `packages/db/src/index.ts` (main's two exports plus `extra-repository`), `packages/db/src/migrate.ts` (main's 0115, 0119, 0120 entries, then this leaf's), `packages/db/MIGRATIONS.md` (main's 0115, 0119, 0120 sections, then this leaf's). `config/agent-lane-assignments.json`, `packages/db/test/tenancy.integration.test.ts` and `BUILD_PLAN.md` merged without conflict. Renumber commit 7859230: `git mv packages/db/migrations/0117_extra_origin_persistence.sql packages/db/migrations/0122_extra_origin_persistence.sql` (file content byte-identical), registered in `migrate.ts` after 0120. References changed from the old filename: this leaf's lane line (path in `allow`, and `BUILD_PLAN.md` added to `allow`), `packages/db/test/extra-fixtures.ts:23`, `packages/db/test/extra-origin-upgrade.integration.test.ts:14,37`, this receipt (lines 11, 29, 129), `packages/db/MIGRATIONS.md` (retitled 0122 with one renumbering sentence), and the §12.2 ledger paragraph added to `BUILD_PLAN.md` before `### 12.3`. The own-position assertion in the upgrade test was already by name and increasing order; it needed only the filename change.

**Environment.** The embedded PostgreSQL could not start (`Postgres init script exited with code null`): the darwin-arm64 package's short library names were missing because pnpm skips its postinstall. Ran the package's own `scripts/hydrate-symlinks.js` inside `node_modules` (not tracked; no repository file changed). Not a code fault.

**Faults found.** Migration 0122 itself applied cleanly on a fresh database and on the upgrade path; none of the migration-level fault classes checked beforehand (CASE inside an IF condition, mixed JSON operators, un-deferred constraint triggers, missing NOT NULL seed columns) was present.

1. `packages/db/test/extra-fixtures.ts:57`, helper `receipt()`. PostgreSQL error `inconsistent types deduced for parameter $6` (SQLSTATE 42P08). The `INSERT INTO app.command_receipt ... VALUES(...,$6,...,CASE WHEN $6='succeeded' ...)` used the same parameter once as the `varchar(16)` status column value and twice in a text comparison. Before: `$6` and `CASE WHEN $6='succeeded'` (twice). After: `$6::text` and `CASE WHEN $6::text='succeeded'` (twice); the value stored is identical. Kind (i), test set-up. This one fault failed 21 of the 38 tests in `extra-origin.integration.test.ts`, `extra-links.integration.test.ts` and `extra-origin-upgrade.integration.test.ts`; after it, all 38 passed with no other change.
2. `packages/db/test/tenancy.integration.test.ts`, the two catalogue arrays (row-security list near line 230 and ownership list near line 442). Failure: the received list had `extra_order_line_link` before `extra_origin`; the expected list had them the other way round (the query is `ORDER BY c.relname`). Before: this leaf's appended `extra_order_line_link` row sat after the existing `extra_origin` row. After: that one appended row sits directly before the existing `extra_origin` row. No row was added, removed or altered, the existing `extra_origin` row is byte-identical, and no field value changed; only the position of this leaf's own appended row. Kind (i), test set-up. Reviewers should still look at this as the one edit that touched an expected list.

**Commands and results.**
- `pnpm turbo run build --filter=@jobguard/db...`: exit 0, 3 tasks successful.
- core `vitest run --maxWorkers=2 src/extra-persistence.test.ts src/extra-origin.test.ts`: 2 files, 9 tests passed.
- db `test/extra-origin.integration.test.ts test/extra-links.integration.test.ts test/extra-origin-upgrade.integration.test.ts`: first run 21 failed, 17 passed (fault 1); after the repair 3 files, 38 tests passed.
- db `test/shared-money-origin.integration.test.ts test/work-order-import.integration.test.ts` (both unedited): 2 files, 61 tests passed.
- db `test/tenancy.integration.test.ts test/demo-bootstrap.integration.test.ts`: first run 2 failed, 11 passed (fault 2); after the repair 2 files, 13 tests passed.
- `pnpm turbo run build --filter=@jobguard/api...`: exit 0, 6 tasks successful.
- api `src/auth/context-boundary.test.ts` (unedited): 1 file, 145 tests passed.

**Stopped on.** Nothing. No item needed a change of expected value, a loosened assertion, a longer timeout, a wider grant or policy, a restated merged routine, an altered existing row or a forbidden file.

No assertion, expected value, timeout, grant or policy was changed or loosened. (The one edit that touched an expected list is fault 2: the position of this leaf's own appended rows only, stated above.)


## Round 1 — 11 October 2026 (Codex repair of be7c87b)

Builder: Codex. Working tree revised in place on `codex/sandbox/ent-4b`, starting at `be7c87b11ce54aaf55334d49179e1f317c4372de`. `.git` remained read-only; no commit, add, checkout, push or merge. The dispatcher owns the next commit. Re-read the issued header and applicable AGENTS/build-plan contracts, and source-inspected the Opus and Sol reviews supplied with the repair order. This receipt records implementation and local checks, not independent verification or technical acceptance.

Each fix below is **DONE in source**. Database proofs are written for real PostgreSQL and **NOT RUN (sandbox cannot start PostgreSQL)**. Tests for B, C and E were written before their implementation repairs; D adds assertions to the existing injected-failure test. The original R4 assertions remain and only new cases/assertions were added. No merged test or routine was edited.

| Fix | Before | After and evidence |
|---|---|---|
| A — DONE | A nullable revision column changed the whole-row evidence-pack serialization even for approved revisions. | Removed that column and its CHECK from unmerged 0122 and all leaf uses. `app.variation_revision` and every other fingerprinted table receive no column. S8 now compares complete unchanged revision rows (no excluded revision columns). Contract and migration notes record the hold; no side table or 0107 replacement. Database S8 and merged evidence-pack regressions: NOT RUN. |
| B — DONE | A successful second command for one capture returned the first result without binding the second ID. | A capture retry claims/completes the merged `command_receipt` in the same transaction with the same raising type and a command-specific retry semantic key. It binds hash/status/result and writes no second variation/origin/logged event/raised audit. New O `[DW5b] a successful capture retry durably binds its command ID before any reuse`: A/X, B/X, B/Y conflict with unchanged counts, B/X replay; exact one-effect counts and chain verification. NOT RUN. |
| C — DONE | `readExtra` rejected legitimate NULL legacy command/member IDs through the strict SH-1 schema. | Leaf-owned strict `extra-origin-legacy.v1` / `extra-record-legacy.v1` retain NULLs and stored provenance with `legacy: true`. Command-backed reads keep strict SH-1 shape. O adds two R4 cases using the unchanged merged `insertVariationProposal` path and `record_legacy_builder_origin` trigger, verifies stored rows unchanged, and keeps command-backed assertions. U S8 reads the actual SH-1 backfill. These PostgreSQL cases: NOT RUN. Core `[R4] versioned legacy reads preserve NULL identities without weakening command origins`: RUN, passed. The earlier receipt's held-read note is historical and superseded by this issued ruling. |
| D — DONE | Link/unlink/order fault injection asserted row counts alone. | The existing L `[DW5a] link, raw unlink and order writes roll back at receipt, fact, audit and commit failures` now verifies the full tenant chain and compares the actual audit-control head's sequence/hash before and after each of its 12 injected failures. All row-count assertions remain. NOT RUN. |
| E — DONE | Clearing tenant context before commit hid the origin from the deferred check and permitted an early return. | The deferred origin/audit function checks the transaction setting against the inserted fact's tenant before querying protected rows; absent, empty or mismatched context raises `INVALID_ORIGIN` / 23514. O adds `[S4] clearing tenant context after valid origin/event/audit writes refuses commit`, with valid logged/audit facts followed by an empty setting, rollback counts and chain verification. NOT RUN. |
| F — DONE | S9 pinned hashes of seven merged database test files, conflicting with other authorized pieces. | Removed exactly those seven test-file pins. S9 retains the scanner and seven pinned bridges; this leaf's own database/source assertions remain. No pinned source or merged test file was edited. S9: NOT RUN. |

B5 pricing basis: HELD — a column on a fingerprinted table would change approved evidence packs; it needs its own decision.

Migration 0122 was corrected in place; no second migration or existing-data update. The remaining nullable SoR/excess columns stay on `app.variation`, and provenance stays on `app.extra_origin`. Schema grants, policies, keys and existing routine bodies are unchanged in this round. No new provider/data flow, credentials, operational alert, money path, route or screen. The read method's return type now explicitly includes its versioned legacy branch; no deployed transport contract changes in this leaf.

### Round 1 commands and results

Dependencies were already installed; nothing was downloaded and no manifest/lockfile was changed. Used Node v24.17.0 and the cached pinned pnpm 10.28.1 through `/private/tmp/jg-ent4b-round1-bin/pnpm` (PATH prefix). Commands ran sequentially, one check at a time. Only the changed core test file was executed; no whole-package/repository test suite or database/browser startup was attempted. Typecheck, lint and root build each ran once.

| Command | Exit | Observed result |
|---|---:|---|
| `pnpm turbo run build --filter=@jobguard/core...` | 0 | 1/1 task successful, 0 cached; 3.332s, before the unit run. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/extra-persistence.test.ts` | 0 | 1 file; 4 passed, 0 failed/skipped; 1.27s. |
| Strict source compilation of the three changed DB test files (command below) | 2, then 0 | First found one TS7006 in the added backfill filter. Annotated that callback; corrected compilation passed. This proves TypeScript compilation only, not PostgreSQL behavior. |
| `pnpm typecheck` | 0 | 7/7 tasks successful, 2 cached; 29.196s. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 tasks successful, 2 cached; 25.615s; purity, lane, money and commercial boundary checks passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | ent-4b lane passed over 17 paths, including the 10 changed paths in this round; base bbca5ca, checkout be7c87b. |
| `pnpm build` | 0 | 7/7 tasks successful, 2 cached; 1m14.991s. Next compiled/generated routes with existing CSS/workspace-root/cache warnings; Turbo reported sandbox cache IO warnings. |
| `pnpm openapi:check` | 1 | Failed before generation: tsx IPC `listen EPERM`, errno -1, pipe `/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/43752.pipe`. Sandbox restriction; no workaround or check weakening. |
| Read-only source-preservation checks | 0 | 60 merged migrations and 9 explicitly checked forbidden files byte-identical to starting HEAD. 0122 extends only extra_origin/variation; no CREATE OR REPLACE/DROP. |
| `git grep -n 'pricing[_]basis' -- <all 17 leaf paths>` | 1 (expected) | No matches. |
| `git diff --check` | 0 | No whitespace errors. |

Supplemental source compilation, run sequentially twice with the stated exits:

```sh
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --exactOptionalPropertyTypes --noUncheckedIndexedAccess --module NodeNext --moduleResolution NodeNext --target ES2023 packages/db/test/extra-origin.integration.test.ts packages/db/test/extra-links.integration.test.ts packages/db/test/extra-origin-upgrade.integration.test.ts
```

All three changed PostgreSQL files (`extra-origin.integration.test.ts`: 26 tests; `extra-links.integration.test.ts`: 15 tests; `extra-origin-upgrade.integration.test.ts`: 1 test), all merged PostgreSQL regressions, migration/catalog checks and browser suites are **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Counts here describe authored tests, not passes. OpenAPI generation remains unverified in this sandbox (the command failed before generation); the API snapshot is unchanged. No AI/model/prompt change or live integration.

### Round 1 self-review and outstanding evidence

Re-read the repair diff as a strict reviewer: retry receipt uniqueness and hash/status/replay paths, typed strict-vs-legacy reads, unchanged stored legacy rows, SQL guard ordering, every new test, documentation and migration compatibility. `git grep -n 'pricing[_]basis'` across the 17 leaf paths returned no matches. 0122 adds no column to variation_revision or any other fingerprinted table, adds no pricing side table, and replaces no merged routine. No `app.validate_extra_origin()` restatement. All 60 merged migration files and the forbidden SH-1 schema, scanner, variation repository, tenant context, commands, audit, shared-money-origin/work-order-import tests and recovery-follow-up upgrade test are unchanged against the starting HEAD. The seven scanner-pinned bridges are outside this round's changed paths.

R4's existing assertions remain; S9 loses only the seven merged-test pins authorized by Fix F. Existing link fault/count assertions remain and now carry chain/head checks. No test was skipped, timeout lengthened, assertion relaxed beyond the explicit removal of the held column/pins, or grant/policy widened. PL/pgSQL has no new CASE expression inside an IF condition. The xmin comparisons and other Opus LATER findings remain fix-later; no scope expansion.

`recovery-follow-up-upgrade.integration.test.ts` is intentionally untouched: MIG-ORDER-2 (#137) owns its separate compatibility repair. At be7c87b the supplied reviews reported CI red (973/976 database tests passed; three failures in two merged upgrade suites). This round does not claim those suites green. CI must execute the new PostgreSQL proofs and all merged regressions on the dispatcher's exact commit; the same Opus reviewer and a fresh Sol check must record the requested repair verdicts, followed by separate acceptance. Role-per-command, unlink function/type, prompt provenance, routes/screens and existing production/release gates remain held. Intended conventional commit text is `/private/tmp/jg-msg-ent-4b.txt`; dispatcher owns commit/push.

Round 1 handoff cleanup removed only generated output in this working tree (`.turbo`, local package/application `dist`, `.next`, local tsconfig build info). Installed dependencies and shared external worktree symlinks were left intact. No database/browser artifacts were produced. Final whitespace/source checks passed and the intended commit-message file was written; no commit or push performed.

## Round 1 verification — 11 October 2026 (Claude Sonnet, run on the Mac)

First real database run of Codex repair round 1 (commit a134925, on top of be7c87b). Embedded PostgreSQL 16.10; one vitest run at a time inside `heavy-slot`, `--maxWorkers=2`; free memory 70% or more before every run. `origin/main` was NOT merged in this job.

**Grep confirmations (HEAD a134925, before any change in this job).**
- `pricing_basis` / `pricingBasis` appears nowhere in this leaf's files (`0122_extra_origin_persistence.sql`, `extra-repository.ts`, `extra-persistence.ts` and its test, the three `extra-*.integration.test.ts` files, `extra-fixtures.ts`, `extra-origin-persistence-v1.md`, `MIGRATIONS.md`, this receipt) and nowhere in the repository (`git grep -l pricing_basis` returns nothing).
- Migration 0122 now has `ALTER TABLE` on exactly two existing tables, `app.extra_origin` and `app.variation`, plus the loop that sets owner and row security on its own three new tables. It adds no column to `app.variation_revision`, `quote_document_version`, `quote_acceptance`, `evidence_object`, `variation_approval`, `recovery_claim_revision`, `recovery_case_event`, `material_rate_revision`, `supplier_document_version`, `supplier_document`, `customer_invoice` or `discrepancy_review_outcome`.
- Migration 0122 contains no `CREATE OR REPLACE`, no `DROP` and no `SECURITY DEFINER`.

**Faults found.** None. Round 1's migration change (fix A: the `pricing_basis` column and its CHECK removed; fix E: the commit-time origin/audit check raises `INVALID_ORIGIN` when `app.tenant_id` is absent or different) applied cleanly on a fresh database and on the upgrade path, and no test needed any set-up change. No file was edited in this job except this receipt.

**Do the six fixes work on a real database?** Each has a test that ran and passed:
- A: the upgrade test no longer lists `pricing_basis` among added columns; the two merged tests that had been red because of the column (`recovery-message-upgrade`, `evidence-pack-sources`) pass unedited.
- B: A/X, B/X, B/Y capture-retry sequence rejects with `COMMAND_CONFLICT` and leaves the bound receipt hash and all row counts unchanged.
- C: `readExtra` returns `extra-record-legacy.v1` / `extra-origin-legacy.v1` with explicit nulls for merged small-builder and backfilled legacy origins, while command origins stay strict.
- D: the audit chain verifies (`verifyAuditChain`) and the head is unchanged after each failed link operation.
- E: with `app.tenant_id` set empty the commit fails closed and leaves no receipt, variation, origin, event or audit row.
- F: `[S9]` now pins only the scanner and the seven bridges, with no whole-file hash of a merged test file.

**Commands and results.**
- `pnpm install --frozen-lockfile`: ok. `pnpm turbo run build --filter=@jobguard/db...`: exit 0, 3 tasks.
- core `src/extra-persistence.test.ts src/extra-origin.test.ts`: 2 files, 10 tests passed.
- db `test/extra-origin.integration.test.ts test/extra-links.integration.test.ts test/extra-origin-upgrade.integration.test.ts`: 3 files, 42 tests passed.
- db `test/shared-money-origin.integration.test.ts test/work-order-import.integration.test.ts` (unedited): 2 files, 61 tests passed.
- db `test/tenancy.integration.test.ts test/demo-bootstrap.integration.test.ts`: 2 files, 13 tests passed.
- db `test/recovery-message-upgrade.integration.test.ts test/evidence-pack-sources.integration.test.ts` (unedited): 2 files, 9 tests passed.
- `pnpm turbo run build --filter=@jobguard/api...`: exit 0, 6 tasks. api `src/auth/context-boundary.test.ts` (unedited): 1 file, 145 tests passed.

**Not run, on purpose.** `packages/db/test/recovery-follow-up-upgrade.integration.test.ts` was neither run nor edited. It is expected to stay red on this branch until the separate piece MIGRATION-ORDER-2 (MIG-ORDER-2, PR #137) merges; that is outside this leaf.

**Stopped on.** Nothing.

No assertion, expected value, timeout, grant or policy was changed or loosened.

## Round 2 — 11 October 2026 (Claude Sonnet, run on the Mac)

One fix, from the fresh Sol check of round 1: the commit-time guard compared the tenant setting as text, so an upper-case but valid tenant id (which `verifiedTenantContextFromMembership` accepts and `withTenant` passes through to `set_config` unchanged, while PostgreSQL prints uuids in lower case) made a legitimate commit fail with `INVALID_ORIGIN`. `origin/main` was NOT merged. `tenant-context.ts` and every merged migration were not touched.

**Comparisons changed (before / after).**
1. `packages/db/migrations/0122_extra_origin_persistence.sql`, `app.ent4b_require_origin_audit()` (about line 183), the only text comparison of the setting in the migration. Before: `IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM NEW.tenant_id::text THEN RAISE EXCEPTION 'INVALID_ORIGIN'`. After: the setting is cast to `uuid` inside an inner `BEGIN ... EXCEPTION WHEN invalid_text_representation` block that raises the typed `INVALID_ORIGIN` (23514), then `IF setting_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'INVALID_ORIGIN'`. The guard therefore refuses when the setting is absent, empty, not a uuid or a different tenant, and accepts the same tenant in any letter case. Nothing else in 0122 changed; the row-security policy text added there already cast the setting to `uuid`.
2. `packages/db/src/extra-repository.ts`, same class (tenant spelling used as text). `lockJob`: the advisory-lock key was `hashtextextended($1||':'||$2,417)` over the caller's spelling, so an upper-case caller took a different key from the lower-case key the table trigger uses; now `hashtextextended($1::uuid::text||':'||$2::uuid::text,417)`. The four `const tenant = context.tenantId` and the one `context.tenantId` handed to `readInTransaction` now use `context.tenantId.toLowerCase()`, so the derived extra id, the ordering facts and every SQL parameter use one spelling. No test was red for change 2 before it (all behaviour already matched), so it is covered by the green tests only, not by a red-then-green proof.

**Tests added** (appended to this leaf's own `test/extra-origin.integration.test.ts`; all existing assertions untouched).
- (1) `[S4] a stamped context with an UPPER-CASE tenant id commits a valid extra`: RED before the fix (`ExtraPersistenceError: INVALID_ORIGIN`, seen in the run before the migration change), green after. It checks one row each in receipt, variation, origin, event and audit, an identical read under both spellings, and the audit chain.
- (1b) `[S4] both spellings of one tenant identify one extra for one client capture ID`: also red before (same cause), green after.
- (2) absent setting (set to NULL before commit) refused, nothing written (the existing `[S4] clearing tenant context...` test is unchanged).
- (3) empty setting refused, nothing written. (4) another tenant's id, lower and upper case, refused. (5) a non-uuid setting refused. Each checks zero rows in all five tables and the audit chain. (2)-(5) were green before the fix too (the old text compare also refused them); they now pin the new comparison.

**Commands and results.**
- `pnpm turbo run build --filter=@jobguard/db...`: exit 0, 3 tasks.
- Before the fix, `test/extra-origin.integration.test.ts`: 32 tests, 2 failed (1 and 1b), 30 passed. After the migration fix alone: 32 passed.
- After both changes: db `test/extra-origin.integration.test.ts test/extra-links.integration.test.ts test/extra-origin-upgrade.integration.test.ts`: 3 files, 48 tests passed.
- db `test/shared-money-origin.integration.test.ts test/work-order-import.integration.test.ts test/tenancy.integration.test.ts` (unedited): 3 files, 70 tests passed.

**Not changed, noted.** The repository still derives the extra id from the caller's spelling of the job and capture ids (`derivedUuid(...)`); that is outside the tenant-setting scope of this fix and was not touched.

**Stopped on.** Nothing.

No assertion, expected value, timeout, grant or policy was changed or loosened.
