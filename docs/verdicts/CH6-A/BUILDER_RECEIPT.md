# CH6-A builder receipt

Build ahead only; no commit, push, merge, independent verdict or acceptance.
Base `96f8bca9` (CH6-P); target origin/main `cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe`.

Issued order overrides draft-only status, draft registration ownership and draft AppModule ownership. The order's “MON1-I allowlist” is interpreted as the explicitly named CH6-A section at line 4168; MON1-I meter files are unrelated and untouched. No migration is needed; reserved 0229 is unused.

## Scope and safe choices

Additive v3 application, strict query/core review schemas, Nest family/view/review controller and three Next routes. Current PracticeAccess verifies session/membership/job before detailed schema/repository work; CH6-P independently checks authority, family and snapshot/replay. Tenant and actor come only from the authenticated principal. Canonical lowercase session/job/command IDs. D11 remains proposed, synthetic-only, zero external actions. No client policy/profile/time/family/source/settlement inputs. Public feedback excludes session digest and actor metadata. Ordinary source holds are retained verbatim. Unknown failures become bounded INTEGRITY_UNAVAILABLE; retries/conflicts remain 409. Every application transport result carries no-store. Next reviews check current owned family before parsing JSON and reauthenticate at review.

Safest choice: missing shared composition refuses with 503 INTEGRITY_UNAVAILABLE; no fallback to v1 or synthetic fixture results. Query version is optional for ordinary GET, but if supplied must be commercial-integrity-query.v3. Duplicate query keys stay arrays and are rejected. No speculative threshold/policy or source activation. No browser spec: this change adds no page (C1); CH6-J owns the browser journey.

## STOPs / coordinator additions

- STOP: `commercialIntegrityV3` is absent from apps/api/src/workspace/application.ts (git grep verified). Add import CommercialIntegrityV3Application, instantiate with dependencies.pool, and facade `commercialIntegrityV3: Object.freeze({family:(jobId:string)=>integrityV3.family(dependencies.sessionId,jobId),view:(jobId:string,query:unknown)=>integrityV3.view(dependencies.sessionId,jobId,query),review:(jobId:string,raw:unknown)=>integrityV3.review(dependencies.sessionId,jobId,raw)})`. Next routes structurally require this exact request-scoped facade and refuse until installed.
- STOP: shared workspace exports for new application/contracts absent. Add `export * from "../commercial-integrity-v3.application.js"; export * from "../commercial-integrity-v3.contracts.js";` to apps/api/src/workspace/index.ts. No new package subpath.
- CH6-C/P barrel exports absent. Private dist-module imports consume their existing verified APIs without altering barrels. Coordinator should add `export * from "./commercial-integrity-v3.js"` to core index, repository/sources exports to db index, then switch leaf imports to public packages serially. Build core/db first until then.
- Registry: add `"/api/jobs/[id]/commercial-integrity/v3/reviews": "post_live_billing"` and `"nest:/jobs/:id/commercial-integrity/v3/reviews": "post_live_billing"` to packages/core/src/watchdog.ts; preserve v1 rows and update its exhaustive catalogue tests. No worker/command key invented.
- OpenAPI: coordinator regenerates apps/api/openapi.json via pnpm --filter @jobguard/api openapi:generate after the assigned AppModule controller import/entry. Existing file is coordinator-owned.

## Evidence

Local evidence and outcomes follow below. PostgreSQL, HTTP listener and browser suites are NOT RUN locally by order. The new commercial-integrity-v3.http.test.ts uses real CH6-P PostgreSQL fixture/runtime role and real Nest AppModule/auth guard; CI must run it with one worker. Parent DB query-log/review/receipt-guard/upgrade suites remain required. Mocked unit/transport results are not PostgreSQL proof. Parent source gates CI-H1/H2/H3/H4/H5/H7 and D11/production gates remain held. No aggregate CH-6 acceptance claimed.

## Local run receipt (25 October 2026)

Node v24.17.0; pnpm 10.28.1 from the existing Corepack cache; Vitest 4.1.11; Next 15.5.27. No install command was run. The PATH pnpm launcher reported v11 configuration warnings and stalled; those two launcher attempts were interrupted (130). Subsequent commands used `/private/tmp/jg-ch6-a-bin/pnpm`, a shell wrapper invoking `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` with the original arguments. No manifest/lockfile edits.

Heavy commands use `PATH=/private/tmp/jg-ch6-a-bin:$PATH HEAVY_SLOTS=1 /Users/benharwood/.local/bin/heavy-slot ch6-a-<label> <command>`. At start 103 GiB disk available, subsequently 101 GiB; memory_pressure reported 40% free, hence one slot requested. The wrapper emitted sandbox denials for its sysctl/ps probes; those probe results are not resource verification. Turbo explicitly used concurrency=1 and each Vitest invocation maxWorkers=2, with at most three named files per invocation. No PostgreSQL or browser process was deliberately started.

- `pnpm turbo run build --filter=@jobguard/db... --concurrency=1`: exit 0, three package builds successful. Turbo emitted cache-write permission warnings. Log `/private/tmp/ch6-a-dependencies.log`.
- Initial `pnpm --filter @jobguard/api typecheck`: exit 2 while P dist artifacts were not yet available. Log `/private/tmp/ch6-a-api-typecheck.log`.
- Initial API unit pair: exit 1; application 20 passed, boundary module could not resolve the unbuilt config package. Log `/private/tmp/ch6-a-api-unit.log`.
- First root build: exit 1 at API with three src/dist nominal tenant-context declaration errors; dependencies built successfully. Log `/private/tmp/ch6-a-build.log`.
- Repair round 1: add a documented type-only bridge for the exact same PracticeAccess context object. Runtime `@jobguard/db` and P's private module both use dist/tenant-context; no tenant fields are copied, minted or replaced. A unit assertion checks object identity. Coordinator public-barrel integration removes this temporary nominal-declaration seam. No dependency edits or source guards weakened.

The sequential check batch `/private/tmp/jg-ch6-a-checks.py` actually ran:

| Command | Exit | Result |
|---|---:|---|
| `pnpm --filter @jobguard/api typecheck` | 2 | Initial nominal context declaration mismatch; repaired as above. |
| `pnpm --filter @jobguard/web typecheck` | 0 | Pass. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/commercial-integrity-v3.application.test.ts src/commercial-integrity-v3.boundary.test.ts` | 0 | 24 tests passed in 2 files; scripted authority/transport plus real AppModule registration without socket. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/commercial-integrity.application.test.ts src/commercial-integrity.audit.test.ts src/watchdog-registry.test.ts` | 1 | 127 passed, 2 failed: ONLY the two new Next/Nest review mutation keys are unclassified. Existing v1 application/audit files pass. Shared registry is coordinator-owned. |
| `pnpm --filter @jobguard/api lint` | 0 | Pass after the context bridge. |
| `pnpm --filter @jobguard/web lint` | 0 | Pass. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | 1 | Core purity passed; lane check refuses inherited predecessor changes outside CH6-A. Turbo package phase not reached. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Refuses inherited CH6-C/P, CH-4, MON-1 etc changes outside this leaf. Do not widen allowlist. |
| `LANE_BASE_REF=96f8bca9 pnpm lint:lanes` | 1 | Tool rejects self-comparison because issued base equals uncommitted HEAD. Dispatcher must rerun after committing. |
| `pnpm typecheck --concurrency=1` | 0 | Pass: all seven packages. |
| `pnpm openapi:check` | 1 | Sandbox EPERM creating tsx CLI IPC pipe; not an OpenAPI freshness pass. |

Logs use `/private/tmp/ch6-a-<label>.log` for the labels in `/private/tmp/ch6-a-check-results.json`.

`pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/jobs/[id]/commercial-integrity/v3/route.test.ts' 'app/api/jobs/[id]/commercial-integrity/v3/reviews/route.test.ts' 'app/api/jobs/[id]/commercial-integrity/family/route.test.ts'`: exit 0, **30 tests passed / 3 files**, log `/private/tmp/ch6-a-web-unit.log`.

A deterministic working-path-only check imported the real loadLanePolicy/selectLane/lanePathAllowed functions and checked `git diff --name-only -z HEAD --` plus `git ls-files --others --exclude-standard -z`: exit 0, all **15** changed/new paths allowed. Log `/private/tmp/ch6-a-working-paths.log`. This does not replace full-range lane lint or CI. `git diff --check`: exit 0.

Additional global ordering HOLD: ApplicationAuthGuard runs before controller code. Outside synthetic mode it can initialize the existing identity application before the leaf application refuses mode. The new application and Next adapters refuse mode before record/provider work; pre-provider wrong-mode ordering for the entire Nest global guard cannot be claimed by this leaf. If required for exact CI-A01 mode parity, coordinator must add a narrow mode preflight for `/jobs/:id/commercial-integrity/family`, `/jobs/:id/commercial-integrity/v3`, `/jobs/:id/commercial-integrity/v3/reviews` before global identity processing and test it without weakening current authentication. No guard bypass or global auth edit made here.

## Acceptance / release holds

- CI-A01: targeted application/Nest/Next scripted payload/failure tests pass; live shared Next facade and exact integrated transport equivalence remain held on coordinator integration and CI.
- CI-A02/A03: local tests verify authority-before-detailed-validation, strict forged fields, bounded errors and canonical identifiers. Real expiry/revocation/membership/wrong-session/replay paths are written in CI-only HTTP suite and NOT RUN.
- CI-A04: local source architecture check permits only CH6-P reads/advisory writer; result retains exact snapshots, proposed D11, no legacy cap/plan-credit figures and realExternalActions=0. Full CH6-B transitive architecture remains its own dependency gate.
- CI-A05: CI HTTP test compares zero/25 hidden candidates, GET and failed-review values/query sequence/no-store and unchanged protected business facts. P query-log/privilege suite remains required. NOT RUN against PostgreSQL here; no wall-clock equality claim.
- CI-A06: v1 application and audit regression files pass; exhaustive mutation registry correctly fails pending its two exact additive rows.
- CI-A07: new real PostgreSQL runtime-role/Nest HTTP suite includes wrong-job finding snapshot, original persisted replay, session expiry/revocation and membership expiry/revocation. CI command: `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/commercial-integrity-v3.http.test.ts`. NOT RUN locally.
- CI-A08: family uses only P's checked readFamily; no client family choice is forwarded as authority. P independently refuses non-v3 and unsupported/imported/contradictory family. Existing upstream source holds remain visible; no adapter is activated.

No schema/data migration, new role, grant, external provider, fee obligation, commercial action, worker or alert is introduced. Existing v1 implementation and tests are unchanged. API changes are additive. Rollback is removal of these leaf files/controller entry; there are no persisted schema changes to roll back. Advisory feedback already written by CH6-P stays immutable under its existing migration.

No AI/model/prompt/extraction/matching change: eval inapplicable. Full root tests/DB/migration/browser/security/required CI suites are NOT RUN locally; CI and exact-head independent Claude A/B verdicts plus separate acceptance remain required. Parent build-ahead review state is not acceptance. The builder has not accepted its own work. Shared integration must precede exact-head checks and review. No commit exists for this working diff; dispatcher commits after exit, then Ben controls push/merge/release.

Intended commit subject/body: `/private/tmp/jg-msg-ch6-a.txt`.

## Final verification after repair

- `pnpm build --concurrency=1` through heavy-slot: **exit 0, all 7 packages successful**, including Nest and the production Next build with all 41 static pages. New family/v3/review routes appear as dynamic build entries. Log `/private/tmp/ch6-a-build-final.log`. Existing CSS/webpack/workspace-root warnings and denied Turbo cache writes were warnings, not test evidence or code changes.
- `pnpm --filter @jobguard/api typecheck`: **exit 0** against final API/test source. Log `/private/tmp/ch6-a-api-typecheck-verified.log`.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/commercial-integrity-v3.application.test.ts src/commercial-integrity-v3.boundary.test.ts`: **exit 0, 24 tests / 2 files** against final source, log `/private/tmp/ch6-a-api-unit-verified.log`.
- Socket-free OpenAPI fallback from apps/api: `node --import tsx src/generate-openapi.ts --check` through heavy-slot: **exit 1**, actual generator reports `openapi.json is stale`. Log `/private/tmp/ch6-a-openapi-no-ipc.log`. This is the expected coordinator-owned regeneration hold, not a claimed pass. No artifact was regenerated or overwritten by the builder.
- Final `git diff --check`: **exit 0**. The implementation required one repair round for the nominal declaration mismatch, within C250. Remaining failures are explicitly assigned shared integration/CI holds rather than hidden or weakened checks.

### Changed paths (working tree only)

- `apps/api/src/app.module.ts`
- `apps/api/src/commercial-integrity-v3.application.test.ts`
- `apps/api/src/commercial-integrity-v3.application.ts`
- `apps/api/src/commercial-integrity-v3.boundary.test.ts`
- `apps/api/src/commercial-integrity-v3.contracts.ts`
- `apps/api/src/commercial-integrity-v3.controller.ts`
- `apps/api/src/commercial-integrity-v3.http.test.ts`
- `apps/web/app/api/jobs/[id]/commercial-integrity/family/route.test.ts`
- `apps/web/app/api/jobs/[id]/commercial-integrity/family/route.ts`
- `apps/web/app/api/jobs/[id]/commercial-integrity/v3/reviews/route.test.ts`
- `apps/web/app/api/jobs/[id]/commercial-integrity/v3/reviews/route.ts`
- `apps/web/app/api/jobs/[id]/commercial-integrity/v3/route.test.ts`
- `apps/web/app/api/jobs/[id]/commercial-integrity/v3/route.ts`
- `config/lanes/ch6-a.json`
- `docs/verdicts/CH6-A/BUILDER_RECEIPT.md`

No commit/push performed. The intended conventional commit message is written to `/private/tmp/jg-msg-ch6-a.txt` for the dispatcher. This receipt describes local source inspection and executed deterministic checks only; independent verification and technical acceptance have not occurred.
