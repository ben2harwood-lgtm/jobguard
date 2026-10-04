# M4-3-S repair — BUILDER RECEIPT, not an independent review

## 2026-09-27: repairs to the 8116aa6 FAIL verdict

Builder: Codex (GPT-6 Astra). No delegated workers in this run. Branch: `codex/sandbox/m4-3-s-repair`.
Implementation commit: **`906f35ba794879e4aafc24f2794fa942f5f9ae3c`**, based on receipt commit `27697954a9aed1047e0edbb18604debe74945d8e` (previous implementation `8116aa6aed2542a0644d0c9042c73c9198dc734e`). This receipt is a subsequent documentation-only commit. Full review base remains `694e9e1755f2a5680898eb0fa04af48afd66c86b`.

**State: repairs committed locally; PostgreSQL migration/DB proof and both browser projects NOT RUN to acceptance because of startup failures. NOT independently verified, NOT technically accepted. No push or PR.** The supplied independent FAIL verdict at `8116aa6-repair.md` is preserved verbatim and committed; it is not superseded by this builder receipt. A fresh independent Claude verdict must bind the new implementation commit after executable verification in an environment that supports PostgreSQL and listeners.

### The five requested repairs

1. **0042 bootstrap policy repair implemented.** At the start of 0042, ALTER POLICY on the two existing 0041 tables uses `nullif(current_setting('app.tenant_id', true), '')::uuid` for both USING and WITH CHECK, before constraint validation. This repairs upgrades from 0041 without editing that historical migration. Missing/empty context admits no rows; malformed context still errors. FORCE RLS, role grants, ownership, validated FK additions and existing data are unchanged. No BYPASSRLS, SECURITY DEFINER helper, data rewrite or NOT VALID constraint introduced.
2. **Real migration-role proof attempted, held.** `demo-bootstrap.integration` continues to call the real bootstrap with its non-superuser owner and `SET ROLE jobguard_migration`; fresh and idempotent expectations now require all 43 migrations. It and `sandbox.integration` fail PostgreSQL startup here, before migration execution. Playwright cannot start its web server; its global setup is NOT RUN. There is no claim that the role-specific fix has been executed successfully.
3. **UIWIRE-12 stale count fixed** from 42 to 43. Its exact path is explicitly added to the repair lane roots with a note explaining the migration-count-only change (the lane already included the broader DB directory). Bootstrap's three stale count assertions and migration-range test title are also corrected. No receipt behavior or existing assertion is removed.
4. **Required DB/browser runs attempted; counts below.** Both `mobile-360` and `desktop` were requested in the exact M4-3-S command. Zero browser tests executed; the two requested screenshots are **NOT PRODUCED**. Existing screenshots are not reused as evidence.
5. **Three low findings repaired.** The repository view reports the stored ZIP/PDF/TEXT format; new artifacts remain TEXT and legacy downloads/approvals remain held. Actor references now use verified `membership:<id>` without session-cookie material. The API test confirms identical generate arguments across two session UUIDs and checks membership-only approval actor identity. The checkpoint option explicitly says it uses the same intact sources, and its explanation says no server scenario has an independent digest; it is no longer described as malformed.

Added PostgreSQL adversarial coverage (authored, NOT RUN): two legacy ZIP/PDF projection/held-action cases and one raw runtime SQL case for absent/empty context reads, denied INSERT and malformed context. The evidence-pack integration file now has 11 tests (previously 8). Existing tenant/FK/immutability/approval/replay assertions remain intact.

Compatibility: expanded view format type is honest about historical labels. Historical actor refs and command hashes are not rewritten. New commands replay consistently across sessions for the same verified member; pre-change command hashes incorporating a session actor can still conflict on replay after this change. No AI/policy/provider behavior or production gate changed. No new operational alert. Forward fix is documented in `packages/db/MIGRATIONS.md`; preserve history and hold attachment actions if remediation is needed. An environment that already applied the earlier candidate 0042 will not rerun it automatically; this repair targets the failed rollout/unapplied 0042, as requested.

### Environment and actual commands

Cwd: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m4-3-s-repair`. Node **24.17.0** installed versus `.nvmrc` **24.15.0**; cached exact pnpm **10.28.1**, embedded PostgreSQL **16.10.0-beta.15**, Vitest **4.1.11**. Reused hydrated dependencies. **Clean pinned install NOT established**: offline frozen install aborted before replacement with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. No manifest or lockfile changes.

`P` means `PATH=/private/tmp/jobguard-pinned-bin:$PATH`, with `pnpm` symlinked to the existing cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. The default wrapper's initial `pnpm --version` failed online signature verification (`fetch failed`); no signature-ignore option was used. Local bundled libraries already had ICU `.68` aliases; added only untracked node_modules sibling aliases for `libzstd.1`, `liblz4.1`, `libz.1`, and `libicui18n` to their installed versioned dylibs. Initial missing-library failures were resolved, but kernel shared-memory failure remained. No sandbox permission escalation or kernel changes attempted.

Logs: `/private/tmp/m4-3-s-rerepair-logs/` (temporary local evidence). Results below are builder execution, not model review. Turbo used the existing shared worktree cache and emitted nonfatal cache IO permission warnings; cached work is identified explicitly.

| Command | Exit | Result |
|---|---|---|
| `P pnpm install --offline --frozen-lockfile` | 1 | NOT completed; no-TTY abort described above. |
| `P pnpm test:migrations` (before and after local library aliases) | 1 / 1 | Each: 2 failed setup files, 11 skipped tests, 0 assertions executed. Real-role migration proof NOT RUN. |
| `P pnpm test:db` (initial attempt) | 1 | 34 failed files / 2 passed; 15 passed / 1 failed / 148 skipped tests. Before the 3 new DB regression cases. |
| `P pnpm test:db` (final source) | 1 | 34 failed files / 2 passed; **15 passed / 1 failed / 151 skipped**, 167 total. PostgreSQL-backed assertions NOT RUN. Restore listener fails with EPERM. Evidence packs 0/11, source mapping 0/6, demo-bootstrap 0/2, sandbox 0/2, UIWIRE-12 0/22 executed. |
| `P pnpm build` (initial and final) | 0 / 0 | 7/7 tasks, 4 cached each; affected DB/API/web compiled, Next production build passed. Final run completed after root test's cancelled API build. |
| `P pnpm typecheck` | 0 | 7/7 tasks, 4 cached. |
| `P LANE_BASE_REF=694e9e1 pnpm lint` | 0 | Purity, lane, money/commercial checks and 7/7 package tasks, 4 cached. |
| `P pnpm test` | 1 | Tools 39/39 executed; config 2, storage 4, core 366, AI 72 replayed from cache. API 83 passed / 1 failed, plus listener error in health test; DB task cancelled by Turbo, web task not reached. Root suite is NOT GREEN. |
| `P pnpm --filter @jobguard/api exec vitest run src/evidence-pack.application.test.ts` | 0 | **9/9 executed and passed** independently of the health listener failure. |
| `P pnpm --filter @jobguard/web test` | 0 | **36/36 executed and passed**, 4 files. |
| `P pnpm test:regression` | 1 | 7 DB setup files failed, 39 tests skipped, 0 assertions executed. Complete-journey browser stage NOT RUN. |
| `P CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-3-S.spec.ts` | 1 | Web-server listener denied. **mobile-360: 0/2 executed, 0 passed; desktop: 0/2 executed, 0 passed. NOT RUN; no screenshots.** |
| `P pnpm openapi:check` | 1 | tsx IPC listener EPERM; wrapper NOT RUN to completion. |
| `node apps/api/dist/generate-openapi.js --check` | 1 | No diagnostic output; not treated as a passing check. |
| `P pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same source generator and comparison via Node loader; committed spec matches. |
| `P LANE_BASE_REF=694e9e1 pnpm lint:lanes` | 0 | Final implementation plus updated receipt remain within the registered repair lane. |
| `git diff --check` | 0 | No whitespace errors. |

Exact final blockers:

```text
FATAL:  could not create shared memory segment: No space left on device
DETAIL: Failed system call was shmget(key=110614420, size=56, 03600).
HINT: This error does *not* mean that you have run out of disk space.
```

Direct bundled `initdb -D <fresh temporary directory> --lc-messages=C` exited 1 after the library aliases were repaired (`initdb-final.log`). Suites suppress the underlying startup log and report `Postgres init script exited with code 1. Please check the logs for extra info. The data directory might already exist.` The directory was freshly created; no running database was reset.

```text
Playwright: Error: listen EPERM: operation not permitted 127.0.0.1:3000
Root API health test: Error: listen EPERM: operation not permitted 0.0.0.0
Restore test: Error: listen EPERM: operation not permitted 127.0.0.1
OpenAPI tsx wrapper: Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/53716.pipe
```

No test weakening, mocks substituted for real database proof, changed Playwright setup, approvals, push, PR, merge or release. The next verification must run migrations/bootstrap, full DB and both browser projects on this candidate and capture fresh screenshots, then obtain the independent verdict. This builder does not accept its own work.

---

## Historical receipt — 2026-09-25 (superseded only by the dated update above)

Date: 2026-09-25. Builder: Codex (GPT-6 Astra), with three scoped Codex workers. Their source inspections are builder work, not the required independent Claude verdict.

Branch: `codex/sandbox/m4-3-s-repair`. Base: `694e9e1755f2a5680898eb0fa04af48afd66c86b`. Implementation head: `8116aa6aed2542a0644d0c9042c73c9198dc734e`. The subsequent receipt commit changes documentation only. Review the full branch diff from the base; the earlier FAIL at `fd56bdd` has not been superseded by a new independent verdict.

**State: implementation committed locally; mandatory DB and browser verification NOT RUN because startup is blocked. NOT technically accepted, NOT independently verified, NOT pushed, no PR opened.** R6 was attempted with the exact required commands; it has no passing DB/browser execution receipt. No tests were weakened or skipped by changing configuration to obtain a pass.

## Repairs and contract mapping

| Repair | Implementation | Evidence and limit |
|---|---|---|
| R1 | `evidence-pack-sources.ts` selects actual tenant/job-bound accepted quote document and acceptance, verified proof object/version and available stored bytes, approved variation revisions/approvals, immutable claim/events, and case-reference-bound invoice or supplier rows. The job's accepted quote pointer prevents a cancelled historical acceptance becoming its baseline. Unchanged jobs need no invented variation. | Six new PostgreSQL source tests authored; all six NOT RUN. No literal document contents are fabricated by the pack loader. Supplier sources are explicitly labelled immutable record snapshots with original bytes unavailable; quote sources are labelled records. Available proof/invoice bytes have their persisted hashes checked. Redaction is explicitly a metadata derivative, not a claim of redacted photo pixels. |
| R2 | Append-only `evidence_pack_attachment_approval` command records exact manifest/content hashes and server-derived actor, with command replay/conflict handling and audit. Validity is computed against current source hashes, including before rebuild; a changed source invalidates the old approval without UPDATE/DELETE. Rebuilding unchanged sources preserves the same digests. | Eight new repository integration tests authored, including actual approval, source append, invalidation, stale rejection, audit uniqueness/rollback and concurrent replay. All eight NOT RUN. This internal attachment approval does not authorize a commercial send. |
| R3 | Stored `TEXT` artifact is a versioned, standalone JSON text bundle. Nest and Next return `text/plain; charset=utf-8`, `.txt` filename and truthful UI label. Stored artifact hash, canonical manifest and sources are cross-checked before approval/download. | Core/API tests executed; production Next build passed. Runtime browser download NOT RUN. 0041 legacy rows are held, cannot be downloaded/approved, and must be rebuilt; no fictitious original-byte backfill. |
| R4 | `evidence-packs.integration.test.ts` uses the embedded PostgreSQL 16 harness and actual runtime login. Tests replay, wrong case, cross-tenant INSERT SQLSTATE 42501, same-tenant wrong-job FK 23503, UPDATE/DELETE/TRUNCATE denial for all three pack tables, exact-hash FK denial, FORCE RLS/ownership, audit, rollback and concurrency. | Authored before the corresponding changes; startup failures are not assertion failures or passes. Full DB command results below. |
| R5 | Server inspection verifies the stored text artifact. Malformed specimens are produced on the server without mutating persisted sources. UI renders returned findings. Standalone `packages/db/tools/verify-evidence-pack.mjs` parses the exported bundle, defaults to an untrusted checkpoint, and accepts a separately supplied expected manifest digest. Omissions are bound into the manifest hash. | Core tests and six actual CLI subprocess scenarios executed. SHA-256 tests include multi-block and non-ASCII vectors. Browser equality assertions are authored but NOT RUN. No server call hard-codes checkpoint trust to true. |
| R6 | Ran `pnpm test:db`, `pnpm test:migrations`, the existing regression wrapper, root checks, and the exact M4-3-S Playwright command in both projects. | Counts and startup failures below. Missing evidence remains a hold for re-review. |

The single global sandbox banner is retained; no second page banner was introduced. Text exports contain `Practice sandbox — synthetic data; nothing is sent or charged`. UI has server loading/error states, error focus, safe long-content wrapping, and 44px controls. Browser assertions cover reload, Jobs navigation, a second browser context, immutable source identities, disclosure lineage, stale approval, forgery rejection, banner count, focus and overflow. These rendered assertions were not executed.

The existing synthetic demo identity boundary remains: an opaque UUID session plus the server-selected demo owner membership, rechecked for role/revocation/expiry. It is not production authentication or evidence of session-isolated production tenancy. Production/pilot modes are refused by this application seam; the API tests cover both refusals. No provider, send, charge, or bank integration was enabled.

## Migration and compatibility

`0042_evidence_pack_repair.sql` is an additive forward fix. New approval table: `jobguard_migration` owner, ENABLE + FORCE RLS, SELECT/INSERT-only runtime grants, exact tenant/job/case/pack/hash foreign keys. **No SECURITY DEFINER write routine is added.** The old unused boolean remains only for expand compatibility and supplies no authority. New artifact/request-hash columns are nullable for legacy rows; new code refuses legacy unverified artifacts. Old ZIP/PDF labels remain allowable during rollout but repaired readers never serve them as archives. Migration/catalog expectations are updated, and 0041/0042 are documented in `packages/db/MIGRATIONS.md`. Roll forward; preserve historical packs, approvals and audits.

The generate v1 boundary now accepts only `TEXT` and rejects client `actorRef`, `evidenceVersion` and tenant authority. This intentionally rejects the old misleading ZIP/PDF requests. The UI resolves real issued invoice IDs or the exact relevant supplier version/rate IDs before opening a new backed case. Existing unbacked claims retain their history and fail with an honest missing-source message; sources are never fabricated to repair their labels. The materials-320 fixture has no matching delivery source; an unrelated materials-B delivery is excluded and the absence remains explicit.

Additive shared Nest/Next endpoints: `POST .../:packId/attachment-approval`, `GET .../:packId/inspect`. Existing list/generate/download routes remain. `apps/api/openapi.json` adds two paths; no existing path is removed. Shared route registry, migration registration and catalog expectations are part of this one leaf's serialized change.

## Environment and command notation

Working directory: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m4-3-s-repair` unless stated otherwise. Node `v24.17.0`; exact cached pnpm `10.28.1`; PostgreSQL package `16.10.0-beta.15`; Vitest `4.1.11`.

`P` below means `PATH=/private/tmp/jobguard-pinned-bin:$PATH`. That directory contains a symlink to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. `N` means `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. This uses the existing exact pinned package manager, not an ignored-signature switch. The default pnpm wrapper failed its attempted online version verification. Hydrated `node_modules` was reused; **a fresh frozen install was not performed**. No lockfile/package changes were made.

Tables record every validation/build/run command, including unsuccessful attempts. Counts are runner counts, not independent acceptance. `N/A` means the command has no test-case count. Temporary detailed outputs are in `/private/tmp/m4-3-s-repair-logs/` and the three `/private/tmp/m4-3-s-*-receipt.txt` worker journals; the material results are preserved in this file.

## Final root checks

| Command | Exit | Executed result / count |
|---|---:|---|
| `P TURBO_FORCE=true pnpm typecheck` | 0 / 0 | 7/7 package tasks, 0 cached, 0 TypeScript errors; repeated after final code. |
| `P pnpm lint` | 0 | First run 7/7 tasks, 2 cached; core purity, repair lane, money/commercial checks passed. |
| `P TURBO_FORCE=true pnpm lint` | 0 / 0 | Two later runs after edits, each 7/7 tasks, 0 cached. |
| `P TURBO_FORCE=true pnpm build` | 0 / 0 / 0 | Three runs as edits settled, each 7/7 package tasks, 0 cached; final production Next build passed. |
| `P TURBO_FORCE=true pnpm test` | 1 | Tools 39 passed; core 366 passed; AI 72 passed; config 2 passed; storage 4 passed. API 83 passed, 1 health test failed + one unhandled `listen EPERM`; DB task interrupted and web task not reached. Whole command **NOT GREEN**. Core suite discovers both source and generated dist tests; 366 is not 366 distinct source tests. |
| `P pnpm --filter @jobguard/web test` | 0 | 36 tests passed, 4 files. |
| `P pnpm --filter @jobguard/api exec vitest run src/evidence-pack.application.test.ts` | 0 | Final targeted run 9 passed, 1 file. These mock repository calls and prove API/schema behavior only. |
| `P pnpm test:db` | 1 / 1 / 1 | Initial: 15 passed / 1 failed / 145 skipped (161). Second: 15 passed / 1 failed / 147 skipped (163). Final: **15 passed / 1 failed / 148 skipped (164)**; 34 failed files, 2 passed. All PostgreSQL assertions NOT RUN: 33 suite initializers fail; restore test hits listener EPERM. The 15 passes are non-PostgreSQL checks, not DB verification. Final new pack/source tests: **0 executed, 8 + 6 skipped**. |
| `P pnpm test:migrations` | 1 | 2 files fail initialization, 11 skipped, 0 executed. Fresh/upgrade/catalog assertions NOT RUN. |
| `P pnpm test:regression` | 1 | 7 DB files fail initialization, 39 skipped, 0 executed. Wrapper stops before complete-journey Playwright; that journey NOT RUN. |
| `P CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-3-S.spec.ts` | 1 / 1 | Both attempts (including after final production build) fail web-server startup. **mobile-360: 0 executed, 0 passed; desktop: 0 executed, 0 passed — NOT RUN.** No screenshots/traces representing executed journeys exist. |
| `P pnpm --filter @jobguard/web exec playwright test --list --project=mobile-360 --project=desktop M4-3-S.spec.ts` | 0 | Discovery only: **4 cases, 2 mobile-360 + 2 desktop**. This is not a browser test pass. |
| `P pnpm openapi:check` | 1 | Default tsx CLI cannot open its local IPC pipe; NOT RUN through this wrapper. |
| `P pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator/check with Node import loader, no IPC listener; checked spec matches. N/A tests. |
| `P pnpm lint:lanes` | 0 | Final repair lane check includes 29 changed paths, including this receipt; no out-of-lane files. N/A tests. |
| `git diff --check` | 0 | Repeated during assembly/finalization; no whitespace errors. |

Final build/lint contain non-fatal Turbo cache-write warnings `IO error: Operation not permitted (os error 1)`; force runs executed locally with no cache hits. They do not convert DB or browser startup failures into success.

## Exact execution blockers

Bundled PostgreSQL direct diagnostic (`initdb -D <fresh /private/tmp/m4-3-s-initdb.*> -U postgres -A trust --lc-messages=C`, exit 1):

```text
dyld[75305]: Library not loaded: @loader_path/../lib/libzstd.1.dylib
  Referenced from: <814F67E0-9D7E-3709-B07F-65F671C71C3D> /Users/benharwood/Claude/Projects/my-new-project/.worktrees/m4-3-s-repair/node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64/native/bin/postgres
  Reason: tried: '/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m4-3-s-repair/node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64/native/bin/../lib/libzstd.1.dylib' (no such file)
no data was returned by command ""/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m4-3-s-repair/node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64/native/bin/postgres" -V"
initdb: error: program "postgres" is needed by initdb but was not found in the same directory as "/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m4-3-s-repair/node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64/native/bin/initdb"
```

The full unabridged diagnostic is `/private/tmp/m4-3-s-initdb-probe.log`. The harness reports:

```text
Postgres init script exited with code 1. Please check the logs for extra info. The data directory might already exist.
```

Playwright production-server startup (exit 1, both projects requested):

```text
Error: listen EPERM: operation not permitted 127.0.0.1:3000
code: 'EPERM', errno: -1, syscall: 'listen', address: '127.0.0.1', port: 3000
Error: Process from config.webServer was not able to start. Exit code: 1
```

The restore test separately reports `Error: listen EPERM: operation not permitted 127.0.0.1`. The API health test's underlying unhandled error is `listen EPERM: operation not permitted 0.0.0.0`; Supertest then reports `Cannot read properties of null (reading 'port')`.

Default OpenAPI wrapper (exit 1):

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/5040.pipe
code: 'EPERM', errno: -1, syscall: 'listen', port: -1
```

Default pnpm launcher (`pnpm -v`, exit 1; same failure during two worker test attempts):

```text
Refusing to run pnpm@10.28.1: its npm registry signature could not be verified
(@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed).
```

No signature verification was disabled, no sandbox escalation requested, no fake database or intercepted successful JobGuard API response substituted.

## Tests-first and intermediate command ledger

| Command / attempts | Exit | Count / result |
|---|---:|---|
| `node -v`; pinned `pnpm --version` | 0 / 0 | v24.17.0 / 10.28.1; N/A tests. |
| `N --filter @jobguard/core exec vitest run src/evidence-pack.test.ts` first | 1 | Genuine assertion red: 11 failed, 10 passed, 21 total. |
| Same command after initial verifier | 0 | 21 passed. |
| Same command after omission regression added, before its implementation | 1 | Genuine assertion red: 1 failed, 21 passed, 22 total. |
| `N --filter @jobguard/core test` before refreshing generated dist | 1 | Stale generated dist: 11 failed, 354 passed, 365 total. Source assertions green; not a suite pass. |
| `N --filter @jobguard/core build` | 0 | N/A tests; refreshes generated dist. |
| `N --filter @jobguard/core test` | 0 | 366 passed in 68 files, including generated dist duplicates. |
| `node --input-type=module` six-scenario CLI subprocess assertions | 0 | 6 scenarios: externally trusted intact exit 0; untrusted/missing/tampered/wrong-version exit 1 with findings; malformed JSON exit 2. Inputs generated in `/private/tmp`, no stored source changes. |
| `P pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/evidence-packs.integration.test.ts` first | 1 | 0 tests collected: fixture helper did not yet exist. Collection failure, not an asserted red result. |
| Same command during source-loader assembly | 1 | 0 tests collected: loader module not yet present. |
| Same command after loader / after integrity regressions / after command regressions | 1 / 1 / 1 | 4 / 6 / 8 skipped respectively, 0 assertions executed; initdb failure. |
| `packages/db/node_modules/.bin/vitest run packages/db/test/evidence-pack-sources.integration.test.ts --maxWorkers=1` before loader | 1 | 0 tests collected, missing loader. Collection failure, not an asserted red result. |
| `P pnpm --filter @jobguard/db exec vitest run test/evidence-pack-sources.integration.test.ts --maxWorkers=1` three runs | 1 / 1 / 1 | 4 / 4 / 5 skipped; 0 assertions executed, initdb failure (diagnostic logging added). |
| `P pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/evidence-pack-sources.integration.test.ts` no-variation regression first | 1 | 6 skipped, 0 assertions executed; then removed the invented minimum-variation requirement. |
| `packages/db/node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` | 2 | Repository undefined-pack narrowing errors during parallel assembly; fixed. N/A tests. |
| `P pnpm --filter @jobguard/db typecheck` intermediate/fixed | 2 / 0 | Same narrowing errors, then 0 errors. Two additional worker DB typechecks exited 0. |
| `P pnpm --filter @jobguard/api exec vitest run src/evidence-pack.application.test.ts` initial | 1 | 0 tests collected; dependency dist absent. |
| `P pnpm turbo run build --filter=@jobguard/db...` initial | 2 | 1 successful/2 attempted; concurrent core red tests referenced not-yet-implemented exports. |
| `P pnpm --filter @jobguard/db build` | 0 | N/A tests. |
| `P pnpm --filter @jobguard/api exec vitest run src/evidence-pack.application.test.ts` red | 1 | Genuine red: 7 failed/7 before API implementation. |
| Same command green / mode-gate additions / final worker run | 0 / 0 / 0 | 7 / 9 / 9 passed. Root final run also 9 passed (above). |
| `P pnpm --filter @jobguard/api typecheck`; `P pnpm --filter @jobguard/web typecheck` intermediate | 2 / 2 | Duplicate response field errors during interface assembly; corrected. |
| Same API/web typecheck pair | 0 / 0 | 0 errors. |
| `P pnpm --filter @jobguard/api openapi:generate` | 1 | tsx IPC EPERM at `.../tsx-501/86506.pipe`; not generated by this attempt. |
| From `apps/api`: `P pnpm exec node --import tsx src/generate-openapi.ts` first | 1 | AI dist missing; not generated. |
| `P pnpm turbo run build --filter=@jobguard/api^...` | 0 | 5 tasks successful, 2 cached; dependency build. |
| From `apps/api`: `P pnpm exec node --import tsx src/generate-openapi.ts` | 0 | Additive spec generated. |
| `P pnpm --filter @jobguard/web typecheck` after source-ref UI changes | 0 | 0 errors. |
| From `apps/api`: `P pnpm exec node --import tsx src/generate-openapi.ts --check` | 0 | Matches generated spec. |
| `P pnpm --filter @jobguard/web exec playwright test --list M4-3-S.spec.ts --project=mobile-360 --project=desktop` first/repaired | 1 / 0 | First: 0 collected, CJS import/export mismatch; changed to existing native ESM loader pattern. Then 4 listed, 0 executed. |

Read-only inspection used `pwd`, `git status --short`, `git branch --show-current`, `git log`, `git worktree list`, `git diff`, `git rev-parse`, `cat`, `head`, `tail`, `sed`, `grep`, `find` and directory listings. `rg` was unavailable (127), so grep/find were used. Missing guessed paths and zsh unmatched globs returned 1 during discovery and were replaced with actual paths; they are not test evidence. A generated pnpm wrapper cache was moved to `/private/tmp/m4-3-s-pnpm-wrapper-cache`, not committed. No project data was reset. Fixture setup uses generated valid PNG/PDF bytes and actual SQL records with FKs/triggers enabled; admin fixture inserts are not proof of application issuance commands. The browser fixture instead calls the existing real commands, but that journey could not execute here.

## Local commit journal and remaining gate

All `git add ... && git commit -m ...` commands below exited 0; test count N/A. No `--no-verify` was used.

- `ed5b899` — `chore(recovery): register evidence pack repair lane and verdict`
- `ba30541` — `fix(recovery): verify standalone text packs and untrusted checkpoints`
- `a03b653` — `fix(recovery): map evidence packs to immutable source records`
- `de16e9e` — `fix(recovery): record exact pack approvals and immutable text artifacts`
- `8116aa6` — `fix(recovery): expose recorded approvals and server pack inspection`

Receipt-only commit: `docs(recovery): record repair commands and verification holds` (its own hash is available from branch HEAD; self-hash is not embedded).

Required next evidence is a real PostgreSQL run and both Playwright projects in an environment that can load the bundled libraries and bind local sockets, followed by a fresh independent Claude verdict bound to the repair commit and separate technical acceptance. Existing G1/G4, professional/commercial decisions, provider, retention/WORM and release gates remain unchanged. No live integration, release, or founder acceptance is inferred from the passing deterministic checks.
