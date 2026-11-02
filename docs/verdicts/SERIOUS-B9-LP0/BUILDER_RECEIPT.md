# SERIOUS-B9-LP0 builder receipt

Issued by dispatcher 14 on 16 October 2026 under Ben ruling 69 ("Yes, update record"). Builder: Codex. Branch: `codex/sandbox/serious-b9-lp0`. HEAD and supplied `origin/main`: `d74fd66d684226a5150fe3d3576a853d58abcf31`. Working-tree delivery only; no commit, push, merge or release. The dispatcher creates the eventual commit.

**Builder evidence only; both independent checker verdicts and separate technical acceptance remain pending.** Read `AGENTS.md`, `BUILD_PLAN.md` §2.4 and §11.8 / LP-0, the LP-0 inventory contract, the catalog reader/scanner and migrations 0136/0169. This task corrects recorded source metadata; it does not change database capabilities.

## Exact authorized change

In `docs/contracts/lp-0-effective-privileges-v1.json`, only `recorded.routines` identity `function:app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb)` changes:

- `definitionSha256`: `3777b97f4f8fda000acf3c1cdd6431b9e1e4f3fc23af5fee196cc9c8e70831a2` → `2a57d8185a6ff29029614f8ab5ce29703a78c6ca007db0cc51579f78970d5140`.
- `staticCalls`: add `app.recovery_allocation_invoice_lines` in sorted position, producing `["app.authenticate_practice_session","app.lock_recovery_message_sources","app.recovery_allocation_fraction_sum","app.recovery_allocation_invoice_lines"]`.

Owner, grants, `securityDefiner`, `searchPath`, `staticWrites`, every other field and every other row remain byte-identical. The derivation check compares the complete file against the pinned supplied base with only these two literal field replacements. No whole-file JSON reformatting. The only other repository files are this receipt and the new `config/lanes/serious-b9-lp0.json`, whose allow list contains exactly the inventory and receipt. Its own lane file is automatically permitted by the existing lane checker. The legacy register and every existing lane stay unchanged.

## Offline derivation and reproducible evidence

`packages/db/test/lp-0-catalog.ts` reads `encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')` as `definitionDigest`, then records it as `definitionSha256`. It scans `p.prosrc` with the actual exported `staticScan`, strips line comments, finds known schema-qualified calls, deduplicates/sorts and excludes the routine itself in `readProtectionRecord`.

The reconstruction uses the canonical header below followed by the **unaltered body between `AS $$` and its closing `$$;`**, then the literal suffix `$function$\n`. The header's final `$function$` has no appended newline; the body's existing first newline supplies it. Body comments, spaces, trailing spaces and final `END ` are retained. Neither the CREATE statement's original layout nor ALTER/REVOKE/GRANT/COMMIT is hashed.

```js
const header = "CREATE OR REPLACE FUNCTION app.write_recovery_allocation(p_tenant uuid, p_job uuid, p_session text, p_command jsonb, p_artifact jsonb)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'app'\nAS $function$";
const body = sql.match(/CREATE (?:OR REPLACE )?FUNCTION app\.write_recovery_allocation\(p_tenant uuid,p_job uuid,p_session text,p_command jsonb,p_artifact jsonb\)\n RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS \$\$([^]*?)\$\$;/)[1];
const definition = header + body + '$function$\n';
const definitionSha256 = createHash('sha256').update(definition, 'utf8').digest('hex');
const knownRoutines = new Set(inventory.recorded.routines.map(r =>
  r.identity.replace(/^[^:]+:/, '').replace(/\(.*$/, '')));
const staticCalls = staticScan(body, knownRoutines, knownRelations)
  .staticCalls.filter(c => c !== 'app.write_recovery_allocation');
```

The same reconstruction first reproduces the existing live-derived 0136 entry's full hash and call list exactly. Both migrations have the identical function signature, return type, language, security mode and search path; only the body is substituted. This prior-hash match validates the reconstruction format without starting PostgreSQL.

| Migration | UTF-8 body bytes | UTF-8 definition bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `0136_recovery_allocation.sql` | 27522 | 27772 | `3777b97f4f8fda000acf3c1cdd6431b9e1e4f3fc23af5fee196cc9c8e70831a2` |
| `0169_recovery_allocation_sources.sql` | 28959 | 29209 | `2a57d8185a6ff29029614f8ab5ce29703a78c6ca007db0cc51579f78970d5140` |

Temporary reproducible script: `/private/tmp/jg-serious-b9-lp0-derive.mts`; reconstructed definition: `/private/tmp/jg-serious-b9-lp0-functiondef.sql`; output: `/private/tmp/jg-serious-b9-lp0-derivation.log`. Run the script from the API package using `node --import tsx` after building workspace dependencies. `--write --check` applies the two replacements and asserts full-file equality against that exact expected result; `--check` only verifies the repository file. Its original inventory is read by `git show d74fd66d684226a5150fe3d3576a853d58abcf31:docs/contracts/lp-0-effective-privileges-v1.json`, so it remains reproducible after the dispatcher commits. The script imports the unchanged catalog reader's actual `parseInventory` and `staticScan`. Its known routine names come from the existing recorded inventory; known relation names are collected from the base inventory text. Both scans preserve the recorded nine-write list. No live catalog observation or PostgreSQL integration result is claimed.

## Environment and checks

Supplied dependencies reused; no install/download command. Node `v24.17.0` (repository `.nvmrc`: `24.15.0`), cached pnpm `10.28.1`. Commands use `PATH=/private/tmp/jg-migfix-2-bin:$PATH npm_config_manage_package_manager_versions=false COREPACK_ENABLE_NETWORK=0`, reusing the dispatcher's existing wrapper. This is not a clean pinned install. Logs are `/private/tmp/jg-serious-b9-lp0-*.log`.

| Command | Exit / result | Log suffix |
| --- | --- | --- |
| `pnpm typecheck --force` | 0; all 7 tasks executed | `typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 1; core purity passes, then formal lane check refuses self-comparison because HEAD equals origin/main before dispatcher commit | `lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same self-comparison refusal | `lint-lanes.log` |
| `pnpm exec turbo run lint --force` | 0; all 7 package checks executed; formal root lint remains blocked as above | `package-lint.log` |
| `pnpm build --concurrency=2 --force` | 0; all 7 tasks executed, including production Next build | `build.log` |
| Supplementary working-tree lane check using unchanged `loadLanePolicy`, `selectLane`, `lanePathAllowed` | 0; exact two-path allow list, exactly the three authorized changed/new files, every path permitted. Not a formal range-lint pass | `working-tree-lane.log` |
| `node tools/money-arithmetic-lint.mjs` / `node tools/commercial-boundary-lint.mjs` | 0 / 0 | `money-lint.log`, `commercial-lint.log` |
| `node --test tools/*.test.mjs` | 0; 100 passed | `tools-unit.log` |
| `pnpm --filter @jobguard/db exec vitest run test/lp-0-catalog.test.ts --maxWorkers=1` | 0; 26 passed | `catalog-unit.log` |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | 0; core 2674, config 1, storage 2, AI 85 passed; fixtures only | `domain-unit.log` |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | 0; 40 files, 867 tests passed; no browser run | `web-unit.log` |
| API `vitest run src --maxWorkers=1` with the nine environment-dependent source suites below excluded | 0; 81 files, 1656 tests passed | `api-unit.log` |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` (rerun after the build and other checks completed) | 0; 15 files, all 124 tests passed, including the unchanged previously timed-out test | `db-source-unit-rerun.log` |
| `pnpm openapi:check` | 1; TSX CLI IPC listener refused with `listen EPERM` | `openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; same generator/snapshot check without the TSX CLI listener, OpenAPI artifact unchanged | `openapi-node.log` |
| `pnpm --filter @jobguard/api exec node --import tsx /private/tmp/jg-serious-b9-lp0-derive.mts --write --check` | 0; prior digest/calls reproduced; actual static scanner, strict inventory parsing and full-file two-field preservation pass | `derivation.log` |
| Same derivation script with `--check` for the final file / `git diff --check` | 0 / 0; byte-preservation check repeated, no whitespace errors | `final-preservation.log` |

The API command is prefixed with `pnpm --filter @jobguard/api exec` and has one `--exclude` argument for each of these existing listener/database suites, matching the prior SERIOUS-B9 receipt's environment exclusions: `src/auth/sso/action-paths.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/contractor/site-visit.http.test.ts`, `src/health.test.ts`, `src/shadow-isolation.application.test.ts`, `src/final-account-lock.isolation.test.ts`, `src/contractor/practice-worker-switch.http.test.ts`. No test/configuration is edited or disabled; CI must run all nine and the complete suite.

Successful available unit/source suites total **5535 passed**, counting each successful suite once. The full aggregate `pnpm test`, database/migration/browser suites and the nine excluded API suites are not run locally because they need the capabilities the dispatcher states this sandbox lacks. No complete-suite or PostgreSQL guarantee is inferred from these unit/source results.

Earlier attempts disclosed: the shell-default `pnpm --version` attempted automatic package-manager metadata resolution and exited 1 when registry signature metadata could not be fetched; the cached 10.28.1 wrapper above works without version switching. The first catalog-module import failed because the supplied checkout had no built core `dist/index.js`; rebuilding workspace dependencies resolved it without source/dependency changes. A scratch derivation assertion initially listed the new call before `fraction_sum`; the actual scanner caught that incorrect manual sort before the inventory was written. The assertion and receipt were corrected to the scanner's sorted result, then passed. The first DB source run had 123 passed and one unchanged `audit-checkpoint-handoff.test.ts` 5000ms timeout under concurrent checks; its successful rerun is recorded in the table. No timeout, assertion or existing test was changed. These are not automatic approval-review rejections.

Turbo emitted sandbox cache IO warnings. Next emitted its existing multiple-lockfile/workspace-root and CSS autoprefixer warnings; the build completed. Logs retain the warnings. No source/configuration changes were made to suppress them.

Intended commit subject/body written to `/private/tmp/jg-msg-serious-b9-lp0.txt`: `fix(db): refresh recorded recovery allocation definition for 0169`. No Git write command was run against this repository.

## Invariants, compatibility and remaining gates

No runtime grants, owner changes, SQL changes, new migrations, data updates/backfills, API/schema changes, UI workflow, new provider actions, operational alerts or commercial-policy changes. This corrects the LP-0 recorded metadata for an already-merged migration. Rollback is the inverse of the two inventory field substitutions; there is no database rollback. The shared inventory edit is limited to this task's authorized routine; no other task's metadata is refreshed. No tests, security scanner, refusal, pinned expectation or fingerprint is changed.

Full PostgreSQL/catalog, fresh/upgrade/migration and browser suites are not run: the dispatcher states this sandbox cannot bind localhost or start PostgreSQL; GitHub CI runs them after dispatcher push. CI must confirm the migrated definition and calls, the LP-0 grant freeze and authority paths, and all mandatory suites. Both independent checkers must confirm the exact eventual commit and its two-field boundary, then a separate actor records acceptance. Existing production/customer-data gates remain unchanged. No independent PASS, acceptance or release readiness is claimed.
