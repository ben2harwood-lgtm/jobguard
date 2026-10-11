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
| B5 Variation columns | BUILT four nullable SoR/excess reference columns and nullable revision pricing_basis. No feature revision/pricing write. variation.state and its grant/CHECK untouched (Q5). |
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
- app.variation_revision: nullable/no-default pricing_basis and value CHECK.

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
