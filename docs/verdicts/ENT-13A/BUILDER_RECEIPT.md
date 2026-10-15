Built by Codex; dispatched 13 Oct 2026; source work 15 Oct 2026.

# ENT-13A builder receipt — partial issued portion, AMBER

The requested first-line attribution “Built by Claude Sonnet 5.5, Codex unavailable; dispatched 13 Oct 2026” is not factual for this run. Codex authored this working-tree diff. No Claude build, independent verdict or acceptance is claimed.

Branch `codex/sandbox/ent-13a`; initial and final HEAD `5105a55eb2a712af7c4b6001ae73bfde934b5679`, equal to inspected `origin/codex/sandbox/ent-6`. Inspected `origin/main` is `6671538c8d69936c162368c760dd6ce0f7f10493`. No commit, add, push, checkout, reset, package install, socket, PostgreSQL or browser was run. All changes are uncommitted. Intended commit message: `/private/tmp/jg-msg-ent-13a.txt`. The dispatcher must commit the diff before an independent exact-commit verdict can bind it; HEAD alone does not identify these new bytes.

## Issued portion and acceptance disposition

Implemented a dedicated versioned Zod configuration parser, a narrow config export, commented fixture-reference examples, new configuration tests and three requirements/operations documents. Required fields have no defaults; real modes/endpoints and extra authority/activation fields refuse with a safe typed error. `fixture:` labels are a local reversible format for fictional references only, not a secret-store, key-management or transport-security policy. No secret retrieval or endpoint resolution exists. Parsing does not activate a route or grant authority.

The entire new test file was written before its implementation. First attempted run timed out before Vitest started (exit 124); the post-implementation attempt did the same. This is **NOT RUN**, not an observed failing assertion or red/green proof. Static inventory: **31 expanded test cases authored, 0 executed, 0 passed** (including 20 invalid-reference assertions within two cases).

| Acceptance | Evidence / remaining hold |
|---|---|
| E13-A01–A23, A25–A28 | HELD, no implementation or tests created; H1–H5 cumulative, plus actual dependency and SFTP prerequisites |
| E13-A24 | Configuration portion authored with 31 cases; execution NOT RUN. Application/HTTP remains HELD. Aggregate remains HELD |
| E13-A29 | Issued portion documented: unresolved fields, data-flow register, unknown-outcome requirements, alert/kill-switch requirements and holds. Exact-commit independent review outstanding |
| E13-A30 | Source preservation checks completed; regressions and independent verdict outstanding. Main-based lane check fails on inherited parent paths. No aggregate pass |

No UI, money calculation, fee, subscription, shadow data, model/prompt, origin, permission or existing test change. No commercial action or network adapter was added. No migration or database backfill; reservation **0170** is unused/unregistered. The dispatch supersedes historical 0084 and the draft placeholder. Rule-9 upgrade proof is held with the complete migration sub-part; there is no partial migration to prove.

## Base and main reconciliation

The build-ahead header and final addendum supersede Q1's older merged-dependency start rule for this independent portion only. Parent files are unchanged. No PR may open until the parent merges. ENT-8a is absent; no inference is made from its reported review status.

`BUILD_PLAN.md` is byte-identical in main and this checkout (SHA-256 `d8793fa7c3112ca2d07d8976d5823546fcbf681c1f152cd2cc2a04e128aae2d5`). Inspected C1–C8, §§9.1.3, 9.1.8, 9.1.10, 9.1.13, ENT-13a card at lines 1133–1151, mode table line 724, boundary rows 1206/1212, ready rule 3510, ledger §12.2 and task graph line 3668. The draft's quoted card/requirements remain present. Their existence is not implementation evidence.

Main wins over stale draft assertions: ENT-3b/c/d migrations 0139–0141, CH-7/ENT-10e 0142–0143 and later registrations exist. Main's registry ends at **0158_extra_approval_chain.sql** (ENT-5b #217); the supplied ENT-6 base ends at **0157_extra_approval.sql**. This piece does not merge, edit or reconstruct that parent/main delta. The draft's claim that the registry ends at 0138 and ENT-5 is unbuilt is stale. The inspected main migration names for 0154/0155 also differ from this older parent; no historical migration is edited. The plan's historical reservation 0084 does not release a migration. No dispatcher-owned ledger amendment was made.

## Actual seam map (source-inspected, not invoked)

| Seam | Actual boundary / missing prerequisite |
|---|---|
| ENT-2 application | `WorkOrderApplication.importFile(principal: unknown, request: WorkOrderImportRequest)` at `apps/api/src/contractor/work-order.application.ts:39`; human membership resolution, not machine authentication |
| ENT-2 repository | `WorkOrderRepository.importCsv(principal: AuthenticatedMembership, input: { commandId: string; name: string; kind: "generated" | "csv"; csv: string })` at pinned repository :112; uses human gate and context. Helpers `assertContractorGate`, `canonicalJson`, `sha256Hex`, `derivedUuid` exist; none reused as a connector bridge |
| ENT-2 SQL | 0110 defines `app.work_order_import_permitted(actor uuid) RETURNS boolean`, `app.work_order_client_permitted(actor uuid, p_client uuid) RETURNS boolean`, `app.work_order_begin(actor uuid, p_job uuid, p_title text) RETURNS integer`, `app.work_order_commit(actor uuid, payload jsonb) RETURNS jsonb`, `app.import_batch_record(actor uuid, payload jsonb) RETURNS jsonb`; these are not reviewed machine entrypoints |
| Human practice context | `contractorSessionContext(pool: Pool, sessionId: string): Promise<VerifiedTenantContext>` at :42, unchanged in main; accepts a persisted human practice session, not a connector |
| Tenant/lifecycle foundations | Existing `withTenant` and `requireLiveJob` remain unchanged; no context reconstruction or connector guard registered |
| ENT-6 pure schemas | `billingStatusV1` (`billing-status.v1`), `billingExportV1` (`billing-export.v1`), `billingDeliveryV1`, `billingReconcileV1`, `billingAllocationV1`, `billingErrorV1` in `packages/core/src/contractor-billing.ts`; no connector import added |
| ENT-6 pure methods | `normalizeBillingStatus`, `renderBillingExport`, `verifyBillingExportArtifact`, `renderBillingCsv`, `parseBillingCsv`, `allocateBillingReceipt`, `deriveUnambiguousBilling`; actual core methods, not persisted receipts/allocation or authority |
| ENT-6 adapters | `createSyntheticBillingAdapter(raw: unknown)` in `billing.adapters.ts`; process-local fake download/SFTP/API behavior, not an external server or durable dispatch |
| Export/outbox owner | Existing `ActionExecutor.execute`, `reconcileOutbox`, `OutboundAdapter` and `FakeDeliveryResult` exist in `packages/db/src/outbox.ts`; ENT-6 has no persisted authorised artifact writer, checked delivery routine or scheduling integration. This leaf registers no scheduler |
| ENT-6 foreign keys / SQL | No actual ENT-6 billing/export/quarantine/allocation tables or checked SQL signatures in this base. Proposed names are not keys to bind. Parent receipt records a coordinator-owned catalogue prerequisite; not repaired here |
| ENT-8a | No `materials-issue.v1` owning implementation in base. Older small-builder materials APIs are not a substitute. Actual schema, routines, keys and prompt integration HELD pending merge/reissue |
| Machine bridge | Unresolved Q2; no authenticated composition, machine role or grant matrix supplied |

Shared additions: only ENT-13A's lane line, config index export and env-example comments. Dispatcher owns serialization of these shared files against later parent repairs. All parent source and tests remain byte-identical to starting HEAD. There are no new app-module/bootstrap/worker/OpenAPI/CI changes, so no route registration, API package export or generated specification is needed.

## Clearly separated HELD list

H1/Q2: all machine capability/authority contracts, authentication/context, persistence/repository, PostgreSQL tests, ingestion, delivery, executor and Nest/Next composition. No human impersonation or public bypass. H2/Q3: provisioning, widening, rotation, revocation/disconnect authority, management routines and credential lifecycle. H3/Q4: signing profile, byte binding, freshness/skew/replay, numeric limits, rotation overlap, SFTP host/path and outbound API destination/redirect rules; no values selected. H4/Q6: billing admission after live and uncertain-delivery reconciliation; no lifecycle exception selected. H5/Q7: work-order baseline/variation scope; no extra-origin command allowed.

Q5 technical prerequisite: separately reviewed/pinned SFTP and external fake-server toolchain; no dependencies or pins changed. ENT-6 persistence/integrated approval/outbox and machine-entrypoint gaps remain prerequisites even when its pure parent merges.

**Needs ENT-8a code, deferred until dispatcher merge/reissue:** authoritative `materials-issue.v1` schema/validation, source identity, facts, same-job citations, deterministic prompt effects/coalescing, machine ingestion seam, relevant FKs and regression filenames. These are the materials-specific portions of A01/A09/A10/A12–A18/A25–A28. No stand-in or older materials implementation was constructed. H1–H3 still apply after merge.

G5 per real endpoint, real-data/privacy/residency/retention approvals, operational readiness, independent verdict and separate acceptance remain outstanding. No named-system adapter or release/deployment is included. LATER: connector configuration/reconciliation/inbox screens remain parked.

## STOP: main-based lane comparison includes the unmerged parent

`LANE_BASE_REF=origin/main node tools/lint.mjs` exits **1** after core purity passes. Exact refusal:

```text
Lane boundary FAILED: Lane ent-13a cannot edit:
"apps/api/src/contractor/billing.adapters.test.ts"
"apps/api/src/contractor/billing.adapters.ts"
"apps/api/src/contractor/billing.contracts.ts"
"docs/contracts/contractor-billing-v1.md"
"docs/operations/contractor-billing-synthetic.md"
"docs/verdicts/ENT-6/BUILDER_RECEIPT.md"
"packages/core/src/contractor-billing-ordering.test.ts"
"packages/core/src/contractor-billing.test.ts"
"packages/core/src/contractor-billing.ts"
"packages/core/src/index.ts"
```

`tools/agent-lane-boundary-lint.mjs:233`, before and after (unchanged):

```js
  if (violations.length) throw new Error(`Lane ${name} cannot edit:\n${violations.map((file) => JSON.stringify(file)).join("\n")}`);
```

No checker or pinned list change is proposed. The required after-state is the dispatcher landing/merging the parent and reissuing the comparison; inherited ENT-6 paths must no longer be attributed to this leaf. Using starting HEAD as the comparison while HEAD is unchanged would hit the existing self-comparison refusal at line 212; no workaround or broader lane was used. The requested main-based lane check is not green. New files belong only to the narrow issued-portion allow list; earlier lane entries are unchanged.

## Tooling, commands and verification

Node `v24.17.0`; existing dependencies only, no frozen reinstall (dispatcher says do not download). Resource observations: memory 54–56% free; Data volume 57–59 GiB available, above required thresholds. No tests/builds ran together and no test fan-out occurred. No database/browser command was started; sandbox cannot start PostgreSQL or bind sockets. No automatic permission review rejected an action in this run.

Initial pinned `pnpm --version` stalled without reporting a version; interrupted through its existing session, exit **130**. The before/after config test invocations each timed out at 45 seconds, **124**, before any Vitest output. The only emitted package-manager text was:

```text
[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.overrides". See https://pnpm.io/settings for the new home of each setting.
```

Timeout wrappers use Python `subprocess.run(..., timeout=...)`, kill the stalled direct child and report NOT RUN. No alternate package runner, disabled signature check, download command or permission escalation was used. Typecheck/lint/build attempts use the required `--force`; none may be described as passing from cache or otherwise. See command results below; package runner health must be restored by the dispatcher.

| Command / check | Exit and result |
|---|---|
| `pnpm --filter @jobguard/config exec vitest run --maxWorkers=2 src/connector-environment.test.ts` before implementation | 124 (45s bound); NOT RUN, 0 tests started |
| Same config invocation after implementation | 124 (45s bound); NOT RUN, 0 tests started |
| `pnpm exec turbo run typecheck --force` | 124 (40s bound); NOT RUN |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 124 (40s bound); NOT RUN |
| `pnpm build --concurrency=2 --force` | 124 (40s bound); NOT RUN |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 1; core purity passes (170 TS files), lane fails on inherited parent paths; later root-lint steps not reached |
| `node tools/money-arithmetic-lint.mjs` | 0, passed |
| `node tools/commercial-boundary-lint.mjs` | 0, passed without output |
| `git diff --check` | 0, no whitespace errors (rechecked) |
| One-off tracked-byte comparator against HEAD | 0; 1,843 other tracked files unchanged; exactly .env.example, own lane line and config index changed |
| One-off lane JSON comparator | 0; after removing only ent-13a, entire prior policy equals HEAD |

**NOT RUN files/checks:** the new config file above; `apps/api/src/auth/{context-boundary,identity}.test.ts`, `apps/api/src/watchdog-registry.test.ts` (dispatcher limits local testing to own piece and runner unavailable); `packages/db/test/{fingerprinted-row-shape,tenancy,demo-bootstrap,contractor-session-context,work-order-import,work-order-concurrency,site-extra,command-replay-contract}.integration.test.ts` (PostgreSQL unavailable; CI/dispatcher required). No heavy-slot invocation was needed because no DB/browser test was attempted. Parent ENT-6 core tests `contractor-billing.test.ts`, `contractor-billing-ordering.test.ts` and API `billing.adapters.test.ts` likewise NOT RUN; dispatcher owns those regressions. ENT-8a filenames cannot be supplied from this base. Root `pnpm test`, `test:db`, `test:migrations`, `test:e2e` remain required CI evidence, not replaced by static checks. All held connector core/DB/application/transport/HTTP/Next test files remain uncreated/unexecuted. No provider or persistence proof passed. `pnpm eval` is inapplicable to this configuration-only change; no AI gateway/prompt/parser/matching change.

`pnpm openapi:check` and `LANE_BASE_REF=origin/main pnpm lint:lanes` remain NOT RUN through the stalled runner; the actual static lane failure is recorded above. Connector OpenAPI generation, CI fake-server setup and runtime registration remain HELD, not skipped implementation tests. No existing mandatory CI step changed.

## Grants and invariants

**Every new GRANT: none.** Standard F: no new direct runtime INSERT/UPDATE/DELETE on money, membership, authorization, receipt or audit tables; no runtime role/grant/routine change at all. No connector mutation route added; no watchdog registry or guard/harness change. Existing tenant, audit, receipt, origin, commercial authorization and fingerprint guarantees are untouched. No claim that untouched PostgreSQL behavior was re-executed here.

## Self-review (builder source inspection only)

Checked explicit version/environment/fake selection, required fixture references, strict unknown-field refusal, no defaults/coercion, no endpoint/credential retrieval, no request mode activation, safe errors without Zod issue/input retention, and no new secret literal. Checked that docs distinguish implemented parser behavior from held/runtime requirements and do not choose security values or imply approvals. Checked changed tracked files are additive only, parent/test/pin bytes unchanged and no UI/database/network path exists. These are source-inspected claims, not a model verdict or technical acceptance. Unexecuted compilation/tests, inherited lane failure and missing exact-commit review remain material limits.

## Preservation evidence

The one-off byte comparator compared every tracked file to starting HEAD (1,846 total, 3 additive shared changes). It is receipt evidence only, not a new permanent test that pins others' files. Representative unchanged SHA-256 values:

```text
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 apps/api/src/auth/context-boundary.test.ts
9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14 packages/db/src/practice-session.ts
56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c packages/db/src/contractor-repository.ts
e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0 packages/db/src/contractor-party-repository.ts
4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3 packages/db/src/work-order-repository.ts
45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5 packages/db/src/sor-repository.ts
ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d packages/db/src/job-scheduling-repository.ts
cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386 packages/db/src/work-order-fixtures.ts
a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c packages/db/src/contractor-session-context.ts
be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8 packages/db/test/fingerprinted-row-shape.integration.test.ts
cdc958e1afaf59c4c3f8545fc8db7c6414afa82c928b41afeade11cd999141ec packages/db/test/tenancy.integration.test.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f packages/db/test/command-replay-contract.integration.test.ts
1628a2c3dc2d24cdb20c11ded7461a9206af9e71f918bff571ba51e66cf9aaf7 packages/core/src/watchdog.ts
302f2cdcc2bfaa4a17ab730225404631634aa5ba02c9d027c20683fc79b03cc5 packages/db/src/migrate.ts
06b501e413424d77fc5c3a1ac0f481b7230c271e36bfbde2cb953385ccccd349 pnpm-lock.yaml
```

Changed shared-file base → working-tree hashes:

```text
.env.example c601dfaaebd91b2f7ae35bc02451796969642b5d6f088564d59b2ec200c7c1e5 → 8f242cd15832b0facd0a8a20335abca07a929d5a8ab249a3b0d0638499e5958d
config/agent-lane-assignments.json f9eb12bf333e441cd9edf03ec0a542ef78817704f4bc58470f7c2d07e5cd88df → a1a9ec9010751780648b660245a8b07dc3a56fe58b7c5121218a02b3465c2e31
packages/config/src/index.ts 697b0b95c3f3b712a7dfa698622a5721c80076661ba94c65faf292dcf5c0faeb → 9630c5fb41fb183070fb5819542521d0ce062638cbf77a4969bcaa0fb5d5e9d1
```

New payload-file hashes (receipt excluded to avoid self-reference):

```text
50f74b388744c0ec44ddf5273cff3e19a0915d5ae0799c02ad6cce85db67dfa1 packages/config/src/connector-environment.ts
346cdfd32ebce42a10fdf6dfd97a9ddec9a29b808aff88d58f24ca8432b4667e packages/config/src/connector-environment.test.ts
807bf33ea38a41764f06cd70d3e1501741c50129704a305f77521f854b04daa0 docs/contracts/connector-capabilities-v1.md
adf2bf9f40b0de0d76d5d53575ca9c21243cda7b1676c51d185f2d9e3c1ca0e9 docs/operations/connector-data-flow.md
18aaa9d1746da4cb80b0010cf72779fa73ba4e097dc1347d4f12f06bd7bf3779 docs/operations/connector-reconciliation.md
```

`git diff --stat` (tracked files; new files are separately inventoried):

```text
 .env.example                       | 9 +++++++++
 config/agent-lane-assignments.json | 1 +
 packages/config/src/index.ts       | 1 +
 3 files changed, 11 insertions(+)
```

New files: config implementation 28 lines; config test 61; capability requirements 43; data-flow 29; reconciliation 15; this receipt. Git's tracked diff stat excludes untracked additions. Final status/head/checks are recorded below before handoff. No exact commit for the finished diff exists yet.

## Read-only inspection command inventory

Each block is the exact shell batch invoked, followed by its exit code. Truncated tool output is not a check pass. The resource/version batch was interrupted while pnpm stalled (130); subsequent resource batches completed. The schema search batch ends with absent `.npmrc` (1). One early optional read of `policy-gates.test.ts` also reported that the file does not exist; no file was changed to satisfy that read.

Inspection 1, exit 0:

```sh
pwd; git status --short; git rev-parse HEAD; git rev-parse origin/main; git rev-parse origin/codex/sandbox/ent-6; rg --files -g 'AGENTS.md' -g 'package.json' -g '*connector*' -g 'BUILD_PLAN.md' -g '*environment*' -g '*lane*' | head -80
```

Inspection 2, exit 0:

```sh
cat AGENTS.md; cat packages/config/package.json; cat packages/config/src/index.ts; cat package.json
```

Inspection 3, exit 0:

```sh
cat packages/config/src/identity-environment.ts; cat packages/config/src/policy-gates.ts; cat packages/config/tsconfig.json; cat .env.example; cat docs/contracts/provider-data-flow-v1.md
```

Inspection 4, exit 0:

```sh
rg -n 'ENT-13a|ENT-6|ENT-8a|9.1.8|12.2|Ready rule|live connector|Status import|Office command, connector' BUILD_PLAN.md; rg -n 'ent-13|ent-6' config/agent-lane-assignments.json; cat tools/agent-lane-boundary-lint.mjs | head -160; cat tools/lint.mjs | head -170
```

Inspection 5, exit 0:

```sh
rg -n 'export (class|const|function|type)|async |app\.ent6|CREATE.*FUNCTION|CREATE TABLE' apps/api/src/contractor/*billing* packages/db/src/*billing* packages/db/migrations/*billing* packages/core/src/*billing*; rg --files | rg '(billing|material|ent-6|ENT-6|work-order.application|outbox|migrate.ts|watchdog.ts)'
```

Inspection 6, exit 130:

```sh
cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md; node --version; /Users/benharwood/Library/pnpm/bin/pnpm --version; memory_pressure | tail -1; df -g /System/Volumes/Data
```

Inspection 7, exit 0:

```sh
sed -n '550,645p' BUILD_PLAN.md; sed -n '915,1015p' BUILD_PLAN.md; sed -n '1128,1155p' BUILD_PLAN.md; sed -n '3510,3540p' BUILD_PLAN.md; head -8 config/agent-lane-assignments.json; cat tools/lint.mjs
```

Inspection 8, exit 0:

```sh
cat docs/verdicts/ENT-6/BUILDER_RECEIPT.md; cat docs/contracts/contractor-billing-v1.md; cat docs/operations/contractor-billing-synthetic.md; cat apps/api/src/contractor/billing.contracts.ts; head -100 apps/api/src/contractor/billing.adapters.ts
```

Inspection 9, exit 1:

```sh
rg -n 'export |async |CREATE FUNCTION app\.(work_order|import_batch)' apps/api/src/contractor/work-order.application.ts packages/db/src/work-order-repository.ts packages/db/src/contractor-session-context.ts packages/db/src/outbox.ts packages/db/src/watchdog.ts packages/db/migrations/0110_work_orders.sql; tail -18 packages/db/src/migrate.ts; rg -n '0138|new URL|014[0-9]' packages/db/src/migrate.ts; cat apps/api/package.json | head -75; cat .npmrc
```

Inspection 10, exit 0:

```sh
sed -n '1,105p' docs/verdicts/ENT-6/BUILDER_RECEIPT.md; sed -n '1,120p' docs/contracts/contractor-billing-v1.md
```

Inspection 11, exit 0:

```sh
rg -n 'export (const|type|class|function)|^  (async|readonly)' packages/core/src/contractor-billing.ts apps/api/src/contractor/billing.adapters.ts; tail -22 packages/db/src/migrate.ts; sed -n '190,255p' tools/agent-lane-boundary-lint.mjs
```

Inspection 12, exit 0:

```sh
command -v pnpm; ls -l /Users/benharwood/Library/pnpm/bin/pnpm node_modules/.bin/turbo; ls /Users/benharwood/Library/pnpm; memory_pressure | tail -1; df -g /System/Volumes/Data
```

Inspection 13, exit 0:

```sh
sed -n '92,160p' BUILD_PLAN.md; sed -n '588,625p' BUILD_PLAN.md; sed -n '665,704p' BUILD_PLAN.md; sed -n '1199,1216p' BUILD_PLAN.md; sed -n '3652,3672p' BUILD_PLAN.md
```

Inspection 14, exit 0:

```sh
git diff --check; git diff --stat; git status --short; git branch --show-current; memory_pressure | tail -1; df -g /System/Volumes/Data
```

Bounded runner commands below were sequential. The config command ran twice: once before implementation and once after (both 124). Typecheck and package lint each ran once (124). Build ran once; its final result is recorded in the result table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; python3 - <<'PY'
import subprocess, sys
try:
    result = subprocess.run(["pnpm", "--filter", "@jobguard/config", "exec", "vitest", "run", "--maxWorkers=2", "src/connector-environment.test.ts"], timeout=45)
    sys.exit(result.returncode)
except subprocess.TimeoutExpired:
    print("NOT RUN: package runner did not start Vitest within 45 seconds; no package download authorised.", flush=True)
    sys.exit(124)
PY
```

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; python3 - <<'PY'
import subprocess, sys
try:
    result = subprocess.run(["pnpm","exec","turbo","run","typecheck","--force"], timeout=40)
    sys.exit(result.returncode)
except subprocess.TimeoutExpired:
    print("NOT RUN: pinned package runner did not start typecheck within 40 seconds.", flush=True)
    sys.exit(124)
PY
```

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; LANE_BASE_REF=origin/main python3 - <<'PY'
import subprocess, sys
try:
    result = subprocess.run(["pnpm", "exec", "turbo", "run", "lint", "--force"], timeout=40)
    sys.exit(result.returncode)
except subprocess.TimeoutExpired:
    print("NOT RUN: pinned package runner did not start package lint within 40 seconds.", flush=True)
    sys.exit(124)
PY
```

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; python3 - <<'PY'
import subprocess, sys
try:
    result = subprocess.run(["pnpm", "build", "--concurrency=2", "--force"], timeout=40)
    sys.exit(result.returncode)
except subprocess.TimeoutExpired:
    print("NOT RUN: pinned package runner did not start build within 40 seconds.", flush=True)
    sys.exit(124)
PY
```

## Remaining command inventory and final handoff

Additional shell batches after the numbered inspections (all exit **0** unless shown otherwise):

- `cat /Users/benharwood/Library/pnpm/bin/pnpm; sed -n '1,80p' packages/config/src/policy-gates.test.ts; git diff --name-only origin/main...HEAD; git show origin/main:BUILD_PLAN.md | sed -n '1133,1152p'; git show origin/main:packages/db/src/migrate.ts | tail -23`. The optional test-file read was absent; the last command completed. No test ran.
- `git log -1 --format='%H %s' origin/main; git log -1 --format='%H %s' HEAD; git diff --stat origin/main...HEAD; rg -n '0110_|0122_|0135_|0138_|0139_|0140_|0141_|0142_|0143_|0158_' packages/db/src/migrate.ts; rg -n 'snapshot|pin|sha256|practice-session.ts|contractor-repository.ts|sources' apps/api/src/auth/context-boundary.test.ts | head -35; ls node_modules/.bin; ls /Users/benharwood/Library/pnpm/global/v11/15f13-19ef2fdabb2/node_modules/@pnpm/exe`.
- `git diff origin/main HEAD -- BUILD_PLAN.md; git show origin/main:packages/db/src/outbox.ts | head -7; sed -n '261,278p' packages/db/migrations/0110_work_orders.sql; sed -n '341,361p' packages/db/migrations/0110_work_orders.sql; sed -n '435,439p' packages/db/migrations/0110_work_orders.sql`.
- `python3` heredoc adding only ENT-13A's lane: asserted no previous entry, preserved original text after the opening line, inserted the narrow issued-portion allow list. This was the only command-based source edit; other changes used the file patch tool.
- `LANE_BASE_REF=origin/main node tools/lint.mjs`: **1**, exact inherited-path refusal recorded above; 170-file core purity check passed.
- `nl -ba tools/agent-lane-boundary-lint.mjs | sed -n '212,228p'; git diff --numstat; git diff --name-only HEAD -- apps packages/db packages/core .github tools AGENTS.md BUILD_PLAN.md; git ls-files --others --exclude-standard; git show origin/main:packages/db/src/contractor-session-context.ts | rg -n 'export async'; git diff origin/main HEAD -- packages/config/src/index.ts .env.example`. The protected-directory diff was empty.
- `nl -ba tools/agent-lane-boundary-lint.mjs | sed -n '230,240p'; git diff --check; git show origin/main:BUILD_PLAN.md | shasum -a 256; shasum -a 256 BUILD_PLAN.md; node tools/money-arithmetic-lint.mjs; node tools/commercial-boundary-lint.mjs; git diff origin/codex/sandbox/ent-6 -- packages/core/src/index.ts docs/verdicts/ENT-6/BUILDER_RECEIPT.md apps/api/src/contractor/billing.adapters.ts`. Both boundary commands returned 0; parent-file diff empty.
- `python3` tracked-file comparator: read `git ls-files -z`, compared each of 1,846 files with `git show HEAD:<path>`, asserted only the three permitted shared additions differ, printed base/current and representative protected-file SHA-256 values. All 1,843 other tracked files matched. No standing test added.
- `git diff -- .env.example packages/config/src/index.ts; sed -n '1,115p' packages/config/src/connector-environment.test.ts; cat packages/config/src/connector-environment.ts; memory_pressure | tail -1; df -g /System/Volumes/Data`.
- `python3` fixture/hash/lane inspection: checked intended-message path did not yet exist, SHA-256 and line counts for five new payload files, parsed policy and asserted every previous lane entry equals HEAD. Five payload hashes recorded above.
- `memory_pressure | tail -1; df -g /System/Volumes/Data`: 56% memory free, 57 GiB available before build attempt.
- Final one-off path/additivity check below: **0**, 9 own paths; prior lanes unchanged, three shared additions only, intended message exists. No package execution.
- After recording this appendix, a final `git diff --check; git diff --stat; git rev-parse HEAD; git status --short` is run as the last check; its actual outcome is included in the final response. It does not execute tests.

Final path/additivity command, exit **0**:

```sh
git diff --check; git diff --stat; git status --short; git rev-parse HEAD; python3 - <<'PY'
from pathlib import Path
import json, subprocess, hashlib
policy = json.loads(Path('config/agent-lane-assignments.json').read_text())
allowed = set(policy['lanes']['ent-13a']['allow'])
tracked = subprocess.check_output(['git','diff','--name-only','HEAD']).decode().splitlines()
new = subprocess.check_output(['git','ls-files','--others','--exclude-standard']).decode().splitlines()
paths = sorted(set(tracked + new))
assert not (set(paths) - allowed), paths
print('Current piece paths within own issued portion:', len(paths))
for name in paths:
    print(name, 'lines', len(Path(name).read_bytes().splitlines()))
print('Tracked preservation delta:')
assert set(tracked) == {'.env.example','config/agent-lane-assignments.json','packages/config/src/index.ts'}
for name in tracked:
    original = subprocess.check_output(['git','show','HEAD:'+name]).decode()
    current = Path(name).read_text()
    if name != 'config/agent-lane-assignments.json':
        assert current.startswith(original), name
    else:
        before = json.loads(original)
        after = json.loads(current)
        del after['lanes']['ent-13a']
        assert before == after
print('Only three allowed additive tracked changes; prior lane entries unchanged.')
assert Path('/private/tmp/jg-msg-ent-13a.txt').exists()
print('Intended message present; no commit created.')
PY
```

Final HEAD remains **5105a55eb2a712af7c4b6001ae73bfde934b5679**. Nine paths in this piece (three additive shared files and six new files including receipt); no parent path modified. No commit/push performed. Build, typecheck, package lint and both config test attempts are **NOT RUN** due package runner timeouts, not green. Static purity/money/commercial checks and preservation assertions are the only completed checks. Full task and independent acceptance remain HELD.


