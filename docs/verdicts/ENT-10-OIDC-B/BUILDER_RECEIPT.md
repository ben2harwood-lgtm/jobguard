# ENT-10-OIDC-B builder receipt — 18 October 2026

**Builder receipt only — not independently verified, not accepted.**

Dispatcher-designated builder: Codex gpt-6-astra. RED lane. Only issued sub-order A (persisted practice OIDC) built; C, UI and roadmap closure are not included. No worktree commit, push, merge, deployment, external provider action or approval record created by the builder.

## Base and scope

Unmodified inherited HEAD/A adapter: `a2ae1c01ad52f9a3c46b4b4cf9c1a5826bf274d1`; merge-base with local `origin/main`: `27ed904de8a6483f69fc4339221953e946418645`; local main reference: `765f0f369e22a601c3e29686bd3436c82f600e0b`. Branch `codex/sandbox/ent-10-oidc-b`. Dispatcher expressly authorized build-ahead on unmerged #295, superseding the draft's merged-A starting prerequisite for construction only. A's accepted commit is not established here. There is no candidate commit yet; dispatcher owns commit and exact-head checks.

Consumes A unchanged: `OidcAdapter(config, localIssuer)`, `start(browserBinding)`, `validate(callback, storedRequest, browserBinding)`, strict versioned exports and `TestOidcIssuer`. No new/reselected library or dependency changes. Installed runtime inspected: Node `v24.17.0`; pinned cached pnpm `10.28.1`. The shell's default pnpm launcher failed while trying to verify/switch versions; later commands used `/private/tmp/jg-oidc-bin/pnpm`, a symlink to the already-cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. No package install/download was performed by the builder.

Implemented strict synthetic HTTP/persistence schemas, immutable registration, restricted durable request/claim/replay state, exchange after client release, fresh-sign-in behavior after claims/unknown outcomes, commit-time linking/current-authority checks, database-clock sessions, committed no-group revocation, separate OIDC replay namespace, real Nest/Next handlers and redacted parser failures. Existing SAML schemas, raw assertion records, SCIM subject hashing and permission authority remain. Default local issuer identities are fixed per connection; no live issuer or network fallback. Details and acceptance mapping: [ledger](../../ledger/ENT-10-OIDC-B.md).

Migration: `0347_oidc_signin.sql`, next free above inherited 0192; dispatcher renumbers if necessary. [Migration note](../../../packages/db/migration-notes/0347_oidc_signin.md) records objects, owners/grants, lock order, compatibility and forward fix. Existing `sso_complete` is restated only to select OIDC's separate replay namespace; its SAML replay path remains intact. New restrictive policy prevents OIDC metadata from breaking the existing SAML view. Only new-object LP-0 inventory rows and additive SERIOUS-B5 snapshot expectations were added under standing ruling 113. No historical migration, migration runner, MIGRATIONS.md, scanner rule or mandatory assertion changed.

## Actual execution

Commands below use the pinned cached pnpm through `PATH=/private/tmp/jg-oidc-bin:$PATH` unless stated otherwise. `/private/tmp/oidc-b-*.log` contains local output; these temporary logs are not committed acceptance evidence.

| Command / evidence | Result |
|---|---|
| Clean frozen install | **NOT RUN** — dependencies supplied; dispatcher forbids downloads. Existing install is not clean-install evidence. |
| Initial `pnpm --filter @jobguard/api exec vitest run src/auth/sso/oidc-persistence.contracts.test.ts` before implementation | Launcher failed before Vitest (version-verification/registry access failure). **No behavioral failing-first result exists.** Later tests must not be represented as failing-first evidence. |
| `pnpm typecheck` | PASS, all 7 packages on final rerun. Earlier e2e import/type failures were corrected within the lane. |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL at lane boundary: inherited A files are outside B's lane. No lint-rule bypass or lane expansion to absorb A. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Same inherited-A failure. Supplemental uncommitted-path inspection uses the actual lane helpers and finds B's changed paths allowed; this is **not** the official base comparison. |
| `pnpm turbo run lint` | PASS, all 7 package TypeScript lint checks. Root core-purity check passed before lane failure; standalone money and commercial boundary scripts also exited 0. |
| `pnpm build` | PASS, all 7 packages including production Next build. Latest implementation build succeeded; no deployment. |
| `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts src/watchdog-registry.test.ts src/auth/sso/oidc.application.test.ts src/auth/sso/oidc-persistence.contracts.test.ts src/auth/sso/oidc-paths.test.ts` | PASS: 5 files, **280 tests**. Includes 14 OIDC tests and unchanged context/registry scanners. Initial inheritance and discarded-context scanner failures were fixed by composition and explicit context use, without changing scanners. |
| `pnpm --filter @jobguard/api exec vitest run src` | Attempted: 109 files passed / 11 failed; 2,003 tests passed / 131 failed / 23 skipped. Two own scanner failures subsequently fixed and rerun green above. Other failures involved forbidden listeners, an unavailable PostgreSQL free-port harness, and the nested build harness. Not a green API-suite claim. |
| `pnpm --filter @jobguard/api exec vitest run src/auth/sso src/auth/context-boundary.test.ts src/watchdog-registry.test.ts` | 580 passed / 2 failed, 20 files passed / 1 failed. Both failures are existing `action-paths.test.ts` HTTP-listener tests: `listen EPERM`. Focused final rerun above covers B's final handler/filter tests. |
| `pnpm --filter @jobguard/web test` | PASS: 40 files, **867 tests**. |
| `node --test tools/*.test.mjs` | PASS: **100 tests**. |
| `pnpm --filter @jobguard/core test` | FAIL: emitted `dist` tests look for nonexistent source-relative `.ts` fixture files; 5 failed, 5,789 passed. No out-of-lane runner changes. |
| `pnpm --filter @jobguard/core exec vitest run src` | PASS: 115 files, **2,897 tests**. Source-only result, not a replacement claim for the failing command above. |
| `pnpm --filter @jobguard/config test` | PASS: 8 files, **82 tests**. |
| `pnpm --filter @jobguard/db exec vitest run test/lp-0-catalog.test.ts` | PASS: **26 pure catalogue-comparator tests**; no PostgreSQL execution. |
| `tsc -p /private/tmp/oidc-b-test-tsconfig.json` | PASS: source typecheck for new DB tests and imported fixtures, **not DB execution**. |
| `pnpm openapi:check` / API `openapi:generate` | Standard CLI fails creating tsx IPC socket (`EPERM`). |
| From apps/api: `node --import tsx src/generate-openapi.ts` and `node --import tsx src/generate-openapi.ts --check` | PASS; actual generator/committed OpenAPI compared without the tsx CLI listener. Only the two OIDC paths added. Compiled-generator output was replaced with this source-generator output before verification. |
| `pnpm test` | Full aggregate **NOT RUN**: includes forbidden PostgreSQL execution. Component results above are not aggregate success. An API test's attempted database harness failed at free-port selection; no PostgreSQL acceptance evidence. |
| `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e` | **NOT RUN**, dispatcher expressly prohibits local PostgreSQL/browser. Tests authored for CI; no catalogue, populated-upgrade, concurrent database or browser execution claim. |
| `pnpm eval`, native/device suites | Inapplicable: no AI/model/prompt or native change. |
| `git diff --check` | PASS. |

## Holds and delivery

- **Failing-first evidence incomplete:** initial command never reached Vitest. Do not infer that the requested process evidence exists.
- **A dependency and lane:** dispatcher must merge/accept A and refresh B, then rerun the official lane check. B did not modify any inherited adapter/library file.
- **CI:** real PostgreSQL suites (including unchanged LATER-B28, SAML/SCIM/emergency, LP-0 and SERIOUS-B5), migration upgrade/catalogue/RLS checks and both actual transport browser flows remain outstanding. Unit repository doubles are not database proofs; handler execution without sockets is not a browser journey.
- **Existing out-of-lane test runner:** emitted core-test discovery remains a separately recorded STOP item; no existing test was deleted, skipped or weakened.
- **Independent verdicts:** fresh Claude and separate Codex RED checks must bind the dispatcher's exact candidate commit, followed by separate acceptance. No builder self-acceptance.

Intended commit message: `/private/tmp/jg-msg-ent-10-oidc-b.txt`. D01/D02/D03/D08/D09/D16 and applicable D04/G5, residency and assurance gates remain closed. No production-readiness, certification or whole-ENT-10 completion claim.

## r1 repair round — 19 October 2026

**Builder receipt only — not independently verified, not accepted.** Builder for this round: Claude Sonnet, standing in for Codex while its allowance was spent, on the dispatcher's instruction. Two blockers only; nothing else changed.

- **B1 (access control).** `OidcApplication` no longer constructs or defaults to the fictional issuer. The issuer is an optional constructor argument (`OidcIssuer` interface, no import of the fixture); `start` and `callback` refuse (`OIDC_REFUSED`) before any load, save, claim or session when none is configured. Production composition (`createWorkspaceApplication`) configures none, so no deployed route can sign anyone in; only tests inject `TestOidcIssuer`. Added tests in `oidc.application.test.ts`: unauthenticated start refused with nothing loaded/saved/claimed; the same start succeeds when a test injects an issuer; a legitimately started callback is refused by an instance with no issuer without being claimed; production composition has no issuer and an anonymous visitor who knows a connection id is refused at both steps with only the redacted bootstrap refusal touching the database; a source scan proving no route, module or default configuration references the fixture and no production `new OidcApplication(...)` passes an issuer. The four behavioural tests were run against the unfixed code and fail there. `docs/contracts/oidc-signin-v1.md` no longer describes a default local issuer.
- **Consequence for the browser spec.** The deployed Next transport is a separate process with no issuer, so it can no longer complete a sign-in. `ENT-10-oidc.spec.ts` now runs the full sign-in, replay refusal and revocation on the Nest transport with a test-injected issuer, and asserts on the Next transport that an anonymous visitor is refused with no cookie or session. NOT RUN (CI browser/PostgreSQL).
- **B2 (CI typecheck).** `ENT-10-oidc.spec.ts` no longer imports `apps/api/dist` types. `TestOidcIssuer` comes from source; `createIdentityApplication`, `OidcApplication` and `OidcRepository` come from the package entries `@jobguard/api/identity`, `@jobguard/api/workspace` (now also exports `OidcApplication` and `OidcIssuer`) and `@jobguard/db`. The decorated Nest controller cannot be source-imported (apps/web has no `experimentalDecorators`: TS1206), so it is loaded natively from the built package, as `global-setup.ts` loads `@jobguard/db`; it is not a typecheck input. Reproduced the CI failure with all `dist` directories moved away (original spec: TS2307 x3; fixed spec: clean).
- **Checks run.** `pnpm typecheck` PASS (7 packages); web and api `tsc` also PASS with no `dist` present; DB OIDC test sources typecheck PASS (not executed); `pnpm lint` and `pnpm lint:lanes` PASS against the base this branch last merged (`9b28a2ed`). Against current `origin/main` they fail only on migration order (`0347_oidc_signin.sql` must be numbered above `0196`): `origin/main` is 81 commits ahead, so catching up and `node tools/migration-renumber.mjs --write` remain dispatcher work. API unit tests (OIDC, context-boundary and watchdog-registry scanners, SSO-required/identity composition; 9 files) 356 PASS; web unit 867 PASS; OpenAPI check PASS (no controller change). NOT RUN: `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e`, PostgreSQL and browser suites; full aggregate `pnpm test`.

## CI repair (run 39312323207) — 19 October 2026

**Builder receipt only — not independently verified, not accepted.** Builder for this round: Claude Sonnet 5.5, on the dispatcher's instruction. CI run 39312323207 (`pull_request`, head `6a2e1c6b`, step `pnpm test`) failed four real-PostgreSQL tests in `@jobguard/db`. These suites had never executed before: earlier rounds were forbidden local PostgreSQL. This round the embedded PostgreSQL 16.10 did run on the builder's Mac (darwin-arm64), so each failure was reproduced with the same assertion text as CI, fixed, and re-run green. No application, SQL or migration source was changed; no assertion was weakened, skipped or removed.

Local-environment note, not committed: the embedded-postgres `darwin-arm64` package's pnpm postinstall (ICU symlink hydration) had been skipped, so `initdb` died with `libicudata.68.dylib` not found. Running that package's own `scripts/hydrate-symlinks.js` inside this worktree's untracked `node_modules` fixed it. It changes nothing in the repository.

| # | Failing test | Root cause | Fix (files) | Verification |
|---|---|---|---|---|
| 1 | `oidc-signin` "SSO-required retains bound session access while refusing ordinary email-code access" — `INVALID_SSO_REQUIRED_INPUT` | **Test defect.** The test passed `{...bound, origin}` as request credentials, where `bound` is the OIDC callback result (`sessionToken, csrfToken, tenantId, sessionLimitSeconds`). `tenantRequestCredentialsV1` is `.strict()`, so the extra `tenantId`/`sessionLimitSeconds` keys raised a ZodError in `resolveVerifiedTenantContext`; `SsoRequiredApplication.command` maps any ZodError to `INVALID_SSO_REQUIRED_INPUT` before reaching the repository (confirmed: the repository was never called). | `packages/db/test/oidc-signin.integration.test.ts`: credentials built explicitly as `{sessionToken, csrfToken, origin}`. | Ran and passed locally against embedded PostgreSQL; the rest of that test (bound session keeps the membership, ordinary email-code session loses it) now executes and holds. |
| 2 | `oidc-concurrency` "separate pool clients race one callback…" — `expected 0 to be greater than 0` (no `sso.refused` audit) | **Test-harness defect.** `new Pool({...h.identity.options, max:1})` drops the password: pg-pool keeps `options.password` non-enumerable, so the second client failed SCRAM with "empty password returned by client". The "losing" racer therefore died before `oidc_claim` and its refusal path (`refusal` -> `sso.refused` audit) was itself rejected and masked by `guarded`'s `finally { throw }`. The race never actually occurred. | `packages/db/test/oidc-concurrency.integration.test.ts`: second pool now copies `password: h.identity.options.password` (same pattern already used in `audit-export.integration.test.ts` and `job-sources.integration.test.ts`). | Ran and passed locally; with a real second client the loser is refused by `oidc_claim` and its `sso.refused` audit is written. Re-ran the race test 5 times: 5/5 passed. |
| 3 | `lp-0-authority-paths` [LP0-17] — 357 recorded vs 363 live routine identities | **Caused by this PR.** The inventory's `recorded.routines` had no records for the six routines migration 0198 adds (`identity.oidc_claim/complete/create/fail/link/save`). The live catalogue had them. Not a main-side defect: the diff named only those six identities. | `docs/contracts/lp-0-effective-privileges-v1.json`: added exactly six `recorded.routines` records, taken verbatim from the live catalogue (owner `jobguard_migration`, SECURITY DEFINER, `search_path=pg_catalog`, runtime/public EXECUTE false, `otherExecute` = `jobguard_identity` for five and none for `oidc_link`, with their static writes/calls). No new group, path or card: the five `jobguard_identity` EXECUTE grants were already dispositioned in `a-identity-role-routines`, and nothing is granted to `jobguard_runtime`. | Ran and passed locally (all six tests in the file). |
| 4 | `lp-0-grant-freeze` [LP0-02] — live profile vs inventory | **Caused by this PR.** The previous round added three `owner|…` entries the live catalogue never derives: `owner|rel:table|identity.oidc_request`, `owner|rel:table|identity.oidc_assertion_use` and `owner|routine|function:identity.oidc_link(...)`. The guard only emits an owner fact when an object has a non-owner ACL or an owner differing from its schema's; those two tables have all privileges revoked and `oidc_link` has no EXECUTE grant at all. The surplus entries showed as stale `reductions`. | Same JSON: removed those three entries only. The `acl|routine|…jobguard_identity|EXECUTE` and `owner|routine|…` entries for the other five routines are unchanged and match the live catalogue. | Ran and passed locally (all 13 tests in the file); `lp-0-catalog.test.ts` 26 pure tests pass; `lp-0-authority-paths` 6 tests pass (45 passed across the three LP-0 files). |

**Scope of the LP-0 failures.** Both diffs named only OIDC objects, and after changing only OIDC inventory content all LP-0 suites pass on this tree, which contains merged main `3db19f1f` in full. So no main-side inventory defect exists at that base. Main's last completed CI (`f0549837`) was green.

**Not changed, recorded for the reviewer.** Most other `recorded` records are already stale relative to the live catalogue on main (56 definition digests, plus 41 policies, 74 triggers and 11 RLS rows missing). That comparison is the held LP0-13 mechanism and is not enforced; only routine identity completeness is. They were left alone. `sso_complete` is restated by 0198, so its recorded digest and `staticWrites` are likewise behind; left alone for the same reason.

**B1 access fix intact.** `oidc.application.ts`, the controller, workspace composition and every other source file are unchanged by this round. `OidcApplication` still takes its issuer only from the caller, refuses `OIDC_REFUSED` when none is configured, and `oidc.application.test.ts` (B1 block: refusal without issuer, anonymous refusal at both steps under production composition, no production file mentions `TestOidcIssuer`) passes.

**Commands run this round** (all against the worktree head plus this change):

| Command | Result |
|---|---|
| `pnpm --filter @jobguard/db exec vitest run` on `oidc-signin`, `oidc-concurrency`, `oidc-upgrade`, `lp-0-authority-paths`, `lp-0-grant-freeze`, `serious-b5-upgrade` (`--maxWorkers=1`, real embedded PostgreSQL) | PASS: 6 files, 34 tests |
| Same on `lp-0-catalog.test.ts`, `lp-0-grant-freeze`, `lp-0-authority-paths` | PASS: 3 files, 45 tests |
| Race test alone x5 | 5/5 PASS |
| `pnpm --filter @jobguard/api exec vitest run src/auth/sso/oidc{.application,-paths,-persistence.contracts,,.contracts}.test.ts` | PASS: 5 files, 75 tests |
| `pnpm --filter @jobguard/{db,api,core} typecheck` | PASS |
| `LANE_BASE_REF=3db19f1f pnpm lint` (root lint, core purity, lane boundary, 7 package lints) and `pnpm lint:lanes` | PASS (3db19f1f is the main this branch last merged) |
| `LANE_BASE_REF=origin/main pnpm lint` / `pnpm lint:lanes` (origin/main now `dc572123`) | **FAIL, migration order only:** `0347_oidc_signin.sql` must be numbered above `0198`. Main's #293 (MON-8-P-A, merged after run 39312323207 started) took `0198_contractor_entitlement_authority.sql`. Not caused by this round and not fixed here: needs the dispatcher's catch-up merge and `node tools/migration-renumber.mjs --write` (decision 35). |
| `git diff --check` | PASS |

**Not run:** the full 280-file `@jobguard/db` suite (about 40 minutes in CI), `pnpm test:e2e`, `pnpm build`. The fixes touch only two DB test files and the LP-0 inventory JSON (read only by `lp-0-catalog.ts`).

**Still open for the reviewers / dispatcher:** renumber 0198 -> next free number after catching up with main (the filename is also named in `config/lanes/ent-10-oidc-b.json`, `docs/ledger/ENT-10-OIDC-B.md` and `packages/db/test/oidc-upgrade.integration.test.ts`; the LP-0 inventory and serious-b5 expectations do not name it, so this round's fixes survive a renumber unchanged); fresh CI on the final head; independent verdicts and acceptance bound to that commit.

## Current-main catch-up — 29 October 2026

Builder repair only; not independent review, merge, deployment or release. This section supersedes the historical base/migration/lane/review-process holds above for this handoff. Scope checked against PR #296's current description via the GitHub connector: persisted synthetic OIDC, no real IdP/domain; no broader ENT-10 feature added. SIMPLE_LOOP now requires one fresh independent Claude review of this RED piece, arranged by the router, plus green current-main CI.

Resolved all five content conflicts, keeping OIDC alongside main's controllers/providers, workspace services/exports and cumulative SERIOUS-B5 upgrade additions. Regenerated OpenAPI with the actual source generator: the only changes relative to supplied main are the two OIDC paths (98 lines). Shared DB exports and LP-0 inventory preserve main's content with OIDC additions only. Production composition still supplies no issuer and refuses sign-in.

Renumbered B's `0199_oidc_signin.sql` and note to reserved `0347_oidc_signin`, updating references. Used `tools/migration-renumber.mjs`'s exported `planRenumber` at the reserved boundary, applying filesystem moves/reference updates only: its normal `--write` requires clean Git metadata and stages files, both incompatible with the supplied unfinished merge/read-only `.git`. No Git-writing command ran. SQL SHA-256 before/after: `83701833ab1e451b338340878bd1d17a431eb16a3b286a0fdc98c004b4066753`. There is no CASE inside a PL/pgSQL IF condition in this migration. The existing directory-discovery runner needs no change.

Adversarial coverage added: wrong-company loaded connection fails before save/provider access; callback-supplied finance/commercial-manager groups fail before claiming, followed by one valid use and replay refusal. Added a real-PostgreSQL test refusing cross-company connection creation and explicit linking, with unchanged connection/request counts; typechecked only here. Existing tests cover explicit role mapping, downgrade/no-group revocation, callback substitution, SCIM, concurrent replay and privilege inspection.

Commands below ran in this worktree on Node v24.17.0, using the existing cached pnpm 10.28.1 via `/tmp/ent-10-oidc-bin/pnpm`. No packages downloaded. The shell's default pnpm was interrupted before checks; initial OpenAPI generation failed against stale compiled exports, then succeeded after refreshing dependency builds. An initial final API typecheck caught an overly narrow new repository-double return type; corrected to the repository's `Promise<unknown>` contract and reran successfully.

| Check actually run | Result |
|---|---|
| `pnpm exec turbo run typecheck --concurrency=2` | PASS, 7 packages (2 cache hits), before adding adversarial tests. |
| `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit` | PASS after final new-test correction. |
| `pnpm exec turbo run build --filter=@jobguard/db... --filter=@jobguard/ai... --concurrency=2` plus config `tsc` | PASS, local dependency builds; not full application build. |
| API Vitest `--maxWorkers=2`: `oidc.application.test.ts`, `oidc-paths.test.ts`, `oidc-persistence.contracts.test.ts` | PASS, 22 tests; rerun after final correction. |
| API Vitest `--maxWorkers=2`: `oidc.test.ts`, `oidc.contracts.test.ts`, `context-boundary.test.ts` | PASS, 200 tests. |
| API Vitest `--maxWorkers=2`: `watchdog-registry.test.ts`, `sso-required.test.ts`, `sso-required-paths.test.ts` | PASS, 149 tests. |
| DB Vitest `--maxWorkers=1 test/lp-0-catalog.test.ts` | PASS, 27 pure comparator tests; not PostgreSQL. |
| `tsc -p /tmp/ent-10-oidc-db-tests-tsconfig.json` | PASS for OIDC sign-in/concurrency/upgrade and SERIOUS-B5 upgrade sources/imports; no DB execution. |
| From apps/api: `node --import tsx src/generate-openapi.ts`, then `--check` | PASS, actual source generator; no HTTP listener. |
| Core purity, money-arithmetic and commercial-boundary lint scripts | PASS. |
| Official root/lane lint | Cannot pass before merge staging: compares old HEAD and the supplied unresolved index, counting incoming main paths and the removed old migration. No lane widening or check changes. Router must stage the resolved merge and rerun. |
| Supplemental `origin/main` → working-files comparison using lane helpers | PASS, exact 28 paths, no missing/stale allow entries, migration order valid. Own lane file implicitly allowed. This is not the official committed-head check. |
| `git diff --check`; final conflict-marker, lane equality and SQL hash checks | PASS. |

Not run: clean install, full `pnpm test`/`pnpm build`, PostgreSQL/migration execution or browser suites (sandbox restrictions). No AI/native change. Historical executed-DB evidence above is not current-main evidence. Router owns staging the five resolved merge entries and migration rename, committing/pushing, final CI and one independent exact-head Claude RED review. No new library/configuration/production issuer/permission policy. Real IdP/domain, contractor-pilot/release gates and wider ENT-10 work remain outstanding. Commit message written to `/tmp/ent-10-oidc-b-20261029T055609Z-commit-msg.txt`.
