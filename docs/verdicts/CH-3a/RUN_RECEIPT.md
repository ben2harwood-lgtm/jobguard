# CH-3a builder run receipt

Date: 2026-10-03. Builder: Codex. Branch: `codex/sandbox/ch-3a`.
Base commit: `3e0764b639e5a0cdeb1ada1d17dadb90cc2ba24a`.
Result: implementation supplied; **technical acceptance HOLD** pending GitHub CI,
exact-commit independent Claude verdict and separate acceptance.
This is a builder receipt of source inspection and deterministic checks, not an
independent verdict. The dispatcher has not yet committed this working tree.
No worktree git add/commit/checkout, push, merge or PR was performed.

## Delivered scope

- Versioned customer/site/party/command/result schemas, seven customer types,
  derived `isIndividual`, normalized UK postcode and digits-only UPRN.
- Tenant identities, immutable revisions/bindings, unique current projection,
  explicit paying-party default, operational commands, durable replay/conflict,
  revision locking, post-live reason and identity/hash-only audit events.
- Authoritative customer/site workspace and Jobs list, explicit same-place reuse,
  distinct units, missing/stale/error states, live/preview/import gates.
- Shared Nest/Next application seam and regenerated OpenAPI. Route mappings are
  recorded in `docs/contracts/job-parties-v1.md`. Fictional adoption reuses the
  original M1-17 mutation/dispatcher; it records no historic billing. Concurrent
  identical imports reconcile the durable public-command result if the existing
  dispatcher's server-generated authorization expiry differs between requests.
- Live/adoption PostgreSQL guards; activation/import binding references; new
  quote/invoice snapshots included before artifact hashing; old artifacts retained.
- Recognition by current tenant/customer/site IDs, with server-recorded lifecycle
  timestamps and null for historically unknown intervals. No meter or fee policy.

## Commands actually run

All checks used existing installed dependencies. No manifest, lockfile or package
versions were changed. Node: `24.17.0`. Repository pnpm pin: `10.28.1`; installed
PATH pnpm: `11.8.0`. Paths below are relative to the repository unless a working
directory is given. Repeated checks are grouped; the listed successful results
refer to the corrected/latest working tree.

| Command | Exit | Evidence / limit |
| --- | --- | --- |
| `pnpm --version`, `pnpm typecheck` | 1 | Launcher tried to resolve pinned pnpm; signature verification failed before the task ran. |
| Installed pnpm with `--pm-on-fail=warn --version` | 0 | Reported `11.8.0`; not the required pin. |
| Local pnpm wrapper `pnpm typecheck` (also cached pnpm 9 probe) | 1 | Exact pnpm engine rejected execution; an automatic dependency-verification/install path was rejected before installation. Disabling manager-version management did not fix pin resolution. Unknown `--verify-deps-before-run=false` also exited 1. No dependency installation completed. |
| `node node_modules/typescript/bin/tsc -p <project>/tsconfig.json --noEmit` | 0 each | All seven: config, core, storage, db, ai, api, web. Executed directly in a Python subprocess loop, preserving each exit code. These also cover the packages' TypeScript-based lint checks. |
| `node node_modules/typescript/bin/tsc -p <project>/tsconfig.json` | 0 each | Actual dependency builds: config, core, storage, db, ai. DB build rerun after the fixture export. |
| `node node_modules/@nestjs/cli/bin/nest.js build` (apps/api) | 0 | Actual Nest production build. Earlier wrong-directory invocation exited 1, then corrected. |
| `node node_modules/next/dist/bin/next build` (apps/web) | 0 | Actual production Next build, including routes, compilation/type validation and static generation. First attempt exited 1 because API dist was still being built; prerequisites were completed before successful reruns. Workspace-root warning comes from the parent worktree lockfile. |
| `node --import tsx src/generate-openapi.ts` (apps/api) | 0 | Repo generator wrote `apps/api/openapi.json`; no hand edits. An initial wrong-directory loader invocation exited 1 and was corrected. |
| `node --import tsx src/generate-openapi.ts --check` (apps/api) | 0 | Generated contract check. |
| `node --test tools/*.test.mjs` | 0 | 39 tests; includes fail-closed lane/audit/purity/gate checker tests. This is not a live dependency registry audit. |
| `node node_modules/vitest/vitest.mjs run src` (packages/core) | 0 | 194 tests / 35 files. |
| `node node_modules/vitest/vitest.mjs run src --exclude src/health.test.ts` (apps/api) | 0 | 75 tests / 10 files. Existing socket health test excluded only for this local run; CI must run it. |
| `node node_modules/vitest/vitest.mjs run src` (apps/api, initial full run) | 1 | Socket health test hit sandbox EPERM. An initial CH-3a negative fixture and missing config build were corrected; the subsequent 75-test run passed. No assertion was weakened. Full suite remains pending CI. |
| `node node_modules/vitest/vitest.mjs run app` (apps/web) | 0 | 56 tests / 7 files. Initial `run src` exited 1 (no web tests there); corrected to app. |
| `node node_modules/vitest/vitest.mjs run src` (packages/ai) | 0 | 72 fixture tests / 3 files; equivalent applicable synthetic evaluation. No model/prompt/gateway changed; no live model used. |
| Same Vitest command (packages/db, packages/storage, packages/config) | 0 each | 3, 2, 1 unit tests respectively; no PostgreSQL execution in this command. |
| `node node_modules/vitest/vitest.mjs list test` (packages/db) | 0 | Suite collection only; does not initialize/start PostgreSQL or prove SQL behavior. Focused collection of CH-3a, activation, quote, invoice, tenancy and bootstrap suites also passed. |
| `node node_modules/@playwright/test/cli.js test --list CH-3a.spec.ts --project=mobile-360 --project=desktop` (apps/web) | 0 | Four registered cases: two in each existing viewport project. Collection only, no browser execution. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 1 | Core purity passed; lane guard refuses a missing/self-comparison commit range because HEAD is still the base commit. No checker bypass or weakened rule. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1 | Same pre-commit range refusal; dispatcher/CI must run after commit. |
| `node tools/core-purity-lint.mjs` | 0 | 71 TypeScript files inspected. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Exact money boundary check. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Commercial adapter boundary check. |
| `node --check packages/db/tools/synthetic-restore.mjs` | 0 | Updated restore fixture script syntax only. |
| Supplemental working-tree lane check using `matches`/`selectLane` from the existing checker | 0 | All 69 modified/untracked paths fall within ch-3a; prior lane definitions and package export prefixes equal HEAD. Supplements, never replaces, mandatory commit-range lint. |
| `git diff --check` | 0 | Whitespace/patch check. Read-only git status/diff/show/rev-parse inspections also exited 0. |

## Not executed / mandatory follow-up

The dispatcher states this sandbox cannot bind localhost or start PostgreSQL.
Consequently no PostgreSQL instance, local server, browser journey, deployment,
backup or restore rehearsal was started. No Playwright screenshots/traces exist
from this run. PostgreSQL collection and source inspection are not execution.

GitHub CI must use the pinned install and run `pnpm typecheck`,
`LANE_BASE_REF=origin/main pnpm lint`, `pnpm lint:lanes`, `pnpm test`, `pnpm build`,
`pnpm openapi:check`, `pnpm eval`, `pnpm test:db`, `pnpm test:migrations`, the
existing deployment/regression/restore checks, and `pnpm test:e2e`, including
CH-3a in BOTH `mobile-360` and `desktop` and all earlier mandatory journeys.
The dependency registry audit and secret scanner were not run here; CI must
retain their fail-closed behavior. Pinned clean-install evidence remains pending.
No live provider/model evaluation was run: the change adds no prompt/model route
and all task inputs/outputs are synthetic.

## Acceptance evidence map (source exists; execution limits above apply)

| Assertion | Automated evidence |
| --- | --- |
| Missing parties refuse PostgreSQL live/import; API/UI refuse; complete live/import succeeds once | `job-parties.integration.test.ts`, existing `activation.integration.test.ts`, updated `job-import.integration.test.ts`, `CH-3a.spec.ts` (including concurrent identical import). |
| One current binding; concurrent expected revisions yield one success / typed stale result | CH-3a PG test: row lock, losing receipt rollback, unique current constraint, same-tenant wrong-job FK; browser contexts issue concurrent bindings. |
| Foreign customer, payer, site cannot bind or disclose; shared identities can span jobs | CH-3a PG test exercises each actual foreign revision through repository and each composite FK directly, plus RLS reads/inserts. |
| Normalized sites propose reuse; distinct flats/unknown unit do not collapse; recognition groups jobs | Pure-core keys/postcodes; PG explicit-confirmation/reuse/grouping tests; browser actual confirmed reuse and separate Flat 2. Activation test compares recognition start to server recorded time. |
| Post-live reason/audit and immutable prior snapshots/bytes/hashes | CH-3a PG reason/audit checks; activation snapshot/hash test; quote PDF/outbox byte/hash comparison; UIWIRE-10 invoice byte/hash/snapshot comparison. |
| Client authority fields ignored; invalid type/postcode/UPRN typed refusal | Core schema tests; application mode/auth negative test; browser INVALID_PARTIES and focused error state. |
| Audit has identities/hashes only | CH-3a PG payload allowlist checks every job.parties event and excludes fictional name/address/contact/reason text. |
| Same command replay; changed payload conflicts | CH-3a PG binding/customer revision tests, immutable prior revision; browser import replay. |
| C1/C2 complete slice/shared server composition | Persisted reads/writes, thin Next routes, Nest controllers, workspace exports, generated OpenAPI and production builds. Reload, Jobs and second context assertions use real APIs. |
| C3 synthetic boundary | Server mode/principal checks, .invalid customer email, generated import baseline, environment in mutation results, existing banner, no new external adapter or credentials. Production/pilot application access rejects before DB use. |
| C4 database/money | Six migration-owned FORCE-RLS tables, qualified FKs, narrow grants/controlled pointers; integer-pence existing import kernel, no new financial formula. Actual PG catalogue/denial assertions added and earlier full-schema catalogue lists extended. |
| C5 authorization/races | Current persisted owner membership, verified context, source binding checked again under job lock, replay/conflict and race tests; operational audit after receipt/domain writes. Existing commercial dispatcher retained. |
| C6/C7 executable/browser UI | Nine new PG test definitions plus earlier-suite extensions; two browser journeys registered in both projects, labels/focus/error/touch size/banner/overflow/reload/Jobs/second-context assertions. Execution HOLD. |
| C8 CI/independent review | Lane registered first; no CI checks weakened. Exact commit, Claude verdict, traces and separate acceptance remain outstanding. |

## Migration, compatibility and operational consequences

Only new migration: `packages/db/migrations/0051_job_parties.sql`; preceding
registered schema is 0000–0041. Registration is appended; no earlier SQL changed.
It adds six tenant tables and invoker views, narrow guards/binding routine,
nullable activation/import references and document snapshot columns. Old issued
quote/invoice bytes and hashes are not rewritten. Synthetic upgrade backfills
from the latest issued quote name or explicit fictional recipe, with provenance;
other modes invent no party and create a details-needed Decision. Backfill walks
control-plane tenants and sets transaction-local context, compatible with a
non-superuser migration owner under FORCE RLS. Bootstrap catalogue/count checks
now expect 43 registered migrations (0000–0041 plus 0051).

The new 16-argument adoption overload requires party revisions; the original
13-argument signature remains present and fails closed with JOB_PARTIES_REQUIRED.
Older callers must adopt the new version to import. Expand columns preserve old
artifacts; required live/preview/import behavior intentionally needs complete
parties. Rollback strategy: preserve additive schema and immutable history;
forward-fix application/routines under review rather than drop party history.
See `packages/db/MIGRATIONS.md` for the migration notes.

Retention labels `job_party_contact_d07_pending` and `job_site_address_d07_pending`
record pending classification; no retention/deletion approval or time limit is
invented. Audit stores references/hashes, never contact/address/name/reason text.
RLS protects a correctly authenticated context, not a compromised privileged
connection or an application permitted to choose a false context. No new alert,
secret, live provider, financial obligation or production capability is enabled;
typed missing-party/stale/conflict errors are surfaced by existing error paths.
Existing provider/residency/retention/pilot/commercial release gates stay held.
Production import remains disabled. No policy decision record was approved.

## Shared files, serialization and overlap

All paths are declared in this lane. Other lane definitions are unchanged.
App-module registration, generated OpenAPI and package/workspace exports are
additive. No global CSS or dependency manifests changed. Shared quote services,
workspace/list UI, migration registration, demo bootstrap, browser capture
helper, tenancy/bootstrap catalogues, restore rehearsal fixture and earlier DB
fixture setup must serialize with other work touching those paths. Those edits
supply explicit synthetic parties required by the new guards and preserve earlier
assertions; they add no adjacent feature. The earlier filtered fixture reader
still excludes captured jobs; a separate authenticated parties-list projection
includes them for Jobs. Document/payment details outside the existing shell
projection are marked unknown for newly listed jobs; their absence/payment state
is not invented. Legacy test-only triggers live only in disposable test
databases; runtime context attacks are not changed, and CH-3a's own tests never
install the triggers.

Undeclared overlap with another task: **none identified**. No CH-3b work-order
import, jobs-on-the-go meter, subscription/shadow-bill, native or live-provider
implementation is included. Intended commit message is in
`/private/tmp/jg-msg-ch-3a.txt`. The dispatcher owns commit/push; a different model
must bind its verdict to that exact commit, and a separate actor must accept it.
