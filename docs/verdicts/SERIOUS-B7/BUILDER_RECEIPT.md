# SERIOUS-B7 — builder receipt

Issued 16 October 2026 by dispatcher 13 under FAST MODE rule 5; RED lane.
Scope: **only Batch 7, S21–S23**, in
`/Users/benharwood/.local/share/full-steam/jg-orders/NIGHT-AUDIT-TRIAGE-SERIOUS-2026-10-16.md`.
Read both source aliases: `api-file-evidence-pack.md` finding 1 (line 5),
and `mig-0040-0053.md` findings 1, 3 and 4 (lines 5, 13, 17), under
`/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/`.
AGENTS.md and BUILD_PLAN.md §§2.2–2.4, the M4-3-S repair/dependency entries,
and the deterministic evidence-bundle contract were inspected before implementation.

**Disposition: S21 and S22 implemented; S23 STOPPED for coordinator ruling.**
Nothing is DROPPED. No money-rule, access-policy, real-data or spending decision
was invented. This is a builder receipt, not independent verification or acceptance.

## Baseline and boundaries

- Branch: `codex/sandbox/serious-b7`; starting HEAD
  `5746f7b15c88db3fe279a0d4adce4dfb37491731`, initially clean.
- Supplied `origin/main` resolves to `66205cfa419f7ebee00dabaa4babb325aeb92472`;
  the sole newer commit changes CI scheduling/timeouts. No fetch/rebase was run.
- Node actually installed: **24.17.0**; `.nvmrc`: 24.15.0. Supplied dependencies,
  cached pnpm **10.28.1**, no install/download. Commands used
  `PATH=/private/tmp/jg-migfix-2-bin:$PATH COREPACK_ENABLE_NETWORK=0 npm_config_manage_package_manager_versions=false`.
- No add, commit, checkout, push, browser/e2e run, PostgreSQL start, real data,
  live provider, outbound commercial action or spending. Dispatcher owns commit/push.
- Exact lane: `config/lanes/serious-b7.json`, version 2. It grants neither itself
  nor either lane register. No existing expected value, refusal, count, pinned name,
  hash, fingerprint or list was changed; `apps/api/src/auth/context-boundary.test.ts`
  was not edited. No checker or existing test was weakened.

## Test first, then fix

Before changing either production source file, ran:

```sh
pnpm --filter @jobguard/db exec vitest run src/serious-b7.test.ts src/serious-b7-s23.repro.test.ts --maxWorkers=1
```

**Exit 1, five expected failures**, recorded in `/private/tmp/jg-serious-b7-red.log`:

| Item | Smallest regression and observed failure | Change / disposition |
| --- | --- | --- |
| S21 | `S21 refuses approval after the practice session is revoked while awaiting the case lock`: repository promise **resolved instead of rejecting** `UNAUTHENTICATED`, despite the adapter marking revocation at the case wait. The scripted adapter executes the real transaction/replay/validation/write/audit paths; it is not PostgreSQL evidence. | After the command/case waits, reauthenticate the server-installed practice digest in the approving transaction, bind it to the recorded membership actor, and fence session/member revocation through commit. Recheck clock-based expiry before insertion. |
| S22 | Both `S22 loads recorded supplier evidence for duplicate_supplier_payment` and `... prevention` throw **EVIDENCE_PACK_SOURCE_NOT_FOUND** against same-job supplier source records. | Load routing follows persisted, validated `source_type='supplier_documents'` and `book='supplier_cost'`, covering all accepted supplier case types with the existing tenant/job/type/status filters. |
| S23 | Both customer and supplier `S23 refuses ... catalogue labels without recorded backing` promises **resolve instead of rejecting**, returning `recorded: false` despite no stored backing. | STOPPED. The required rejection conflicts with an existing expected success; see below. |

An initial S21 adapter attempt failed at an unstubbed audit-context lookup; it was
corrected and rerun before any fix. Only the subsequent resolved-promise failure
above is credited as reproduction.

The retained S21/S22 file passes after the fix: **three tests**, exit 0
(`/private/tmp/jg-serious-b7-final-green.log`). The S23 reproduction was moved
unchanged to `/private/tmp/jg-serious-b7-s23.repro.test.ts` when that item was
stopped; no S23 fix, skip, expected-failure marker or altered existing test was added.
Its complete reproduction is retained here for the coordinator:

```ts
import { expect, it } from "vitest";
import type { TenantTransaction } from "./tenant-context.js";
import { resolveRecoverySources } from "./recovery-case-sources.js";

it.each([
  ["customer_invoice", "Generated customer invoice INV-18800"],
  ["supplier_documents", "Supplier invoice INV-320"],
] as const)("S23 refuses %s catalogue labels without recorded backing", async (sourceType, ref) => {
  const db = { $client: { query: async () => ({ rows: [], rowCount: 0 }) } } as unknown as TenantTransaction;
  await expect(resolveRecoverySources(db, "11111111-1111-4111-8111-111111111111", "18000000-0000-4000-8000-000000000002", sourceType, [ref])).rejects.toThrow("RECOVERY_SOURCE_NOT_RECOGNISED");
});
```

## S23 — exact existing-expectation conflict

File: **`packages/db/test/recovery-cases.workbench.integration.test.ts:126–127`**.

Before (left byte-for-byte unchanged):

```ts
const mixed = await repo.command(ctx,job,customer([ids.invoice,"Generated customer invoice INV-18800"]),owner);
expect(mixed.sources.map(source=>source.recorded)).toEqual([true,false]);
```

Required after for the audit's reject-unbacked-label fix:

```ts
await expect(repo.command(ctx,job,customer([ids.invoice,"Generated customer invoice INV-18800"]),owner))
  .rejects.toThrow("RECOVERY_SOURCE_NOT_RECOGNISED");
```

That changes an existing success and expected count/value to a refusal, forbidden
by this order without coordinator ruling. Other existing case journeys also open
catalogue-only cases. Creating invoice/backing facts merely to preserve those
expectations would not be a small correction to missing source validation.
**No edits were made to case-opening, catalogue policy or these expectations.**

## Migration, compatibility and invariants

- **0173_evidence_pack_authority.sql** is necessary to fence the private
  control-plane session row: runtime cannot read/lock that table directly.
  Highest migration on supplied main is **0165**. Notes:
  `packages/db/migration-notes/0173_evidence_pack_authority.md`.
- Reuses the existing `app.authenticate_practice_session(text,uuid)` signature,
  result, default tenant, owner, ACL and principal/permission rules. No new
  capability, grant, table, policy or business-data backfill. No edits to
  `packages/db/src/migrate.ts` or `packages/db/MIGRATIONS.md`.
- Only attachment approval enables the internal transaction-local fence setting.
  Bootstrap authentication and unrelated callers retain their original read-only
  path. The fence requires the matching tenant context, locks session then fixed
  owner membership, and evaluates current validity after waits. Server-owned
  digest scoping remains the application trust boundary, not a claim of safety
  against stolen privileged credentials.
- Existing internal tenant-only fixtures retain their existing path. Existing
  immutable packs, command hashes, exact attachment hash checks, replay conflicts,
  tenant/job isolation, audit records and original bytes are preserved.
- Lock order: command key → case key → session → membership → final audit head.
  No business lock follows audit append. A fresh check precedes insertion to catch
  time-based expiry during source assembly.
- No new external actions, money calculation, ledger entry or operational alert.
  Revoked/expired/unauthorized actors use the existing `UNAUTHENTICATED` refusal.
  No ledger note is applicable. Deploy migration before enabling the changed
  approval path; forward-fix/disable guidance is in its migration note.
- Shared implementation files were edited serially by one builder; S23 shares the
  source seam but is stopped. No shared exports, API registration, OpenAPI schema,
  legacy lane register or global stylesheet edits.

## Checks actually run

Root checks were repeated after the final source changes. Raw logs are local
`/private/tmp/jg-serious-b7-*.log`, not committed provider or CI evidence.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Exit 0; seven tasks successful. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; lane and real package checks. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 0, exact branch lane and migration order. |
| `pnpm build` | Exit 0; seven tasks successful, production Next build. Existing Nest/load-esm import and sandbox cache-write warnings remain warnings. |
| `node --test tools/*.test.mjs` | Exit 0; 100 passed. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0: core 94 files/2,601 tests; config 1/1; storage 1/2; AI 6/85. Synthetic fixtures only, no live-model evaluation. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 39 files/844 tests. No browser run. |
| `pnpm --filter @jobguard/db exec vitest run src test --exclude 'dist/**' --exclude '**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --maxWorkers=1` | Exit 0; 29 files/304 tests. Includes the three new regressions. No PostgreSQL guarantee inferred. |
| API source unit subset below | Exit 0; 78 files/1,642 tests. |
| `pnpm openapi:check` | Exit 1: tsx launcher IPC `listen` fails EPERM in this sandbox. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same actual source generator/snapshot check, avoiding launcher IPC. |
| `pnpm --filter @jobguard/db exec vitest list test/serious-b7.integration.test.ts` | Exit 0; all 12 new PostgreSQL assertions collect. No hooks/database execution. |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-serious-b7-test-tsconfig.json` | Exit 0; strict root configuration plus decorators/noEmit, including the new integration test and transitive fixture/application imports. Temporary config only. |
| `git diff --check` | Exit 0. |

The API command was `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1`
with these explicit local exclusions (no file/configuration changes or CI waiver):
`src/auth/sso/action-paths.test.ts`,
`src/contractor/contractor-practice-session.http.test.ts`,
`src/contractor/site-extra-pricing.http.test.ts`,
`src/contractor/site-extra.http.test.ts`, `src/contractor/site-visit.http.test.ts`,
`src/contractor/practice-worker-switch.http.test.ts`, `src/health.test.ts`,
`src/shadow-isolation.application.test.ts`, `src/final-account-lock.isolation.test.ts`.
They require listeners/PostgreSQL; DB `test/free-port.test.ts` also binds listeners.

Earlier broad DB unit attempt, before adding `--exclude 'dist/**'`, exited 1:
duplicate compiled/source operator-reachability tests exceeded their 5-second
timeout under concurrent checks (410 passed, two failed). The corrected source-only
run passed without changing a timeout or assertion. This failed attempt is retained
in `/private/tmp/jg-serious-b7-db-unit.log` and is not represented as green.

## Dispatcher / CI and remaining gates

No PostgreSQL, `pnpm test:db`, `pnpm test:migrations`, full `pnpm test`, or browser/e2e
execution was attempted: the issued sandbox cannot start PostgreSQL/bind listeners,
and browser/e2e was explicitly forbidden. CI must run all mandatory checks unchanged.
Specifically run:

```sh
pnpm --filter @jobguard/db exec vitest run test/serious-b7.integration.test.ts test/evidence-packs.integration.test.ts test/evidence-pack-sources.integration.test.ts test/practice-session.integration.test.ts --maxWorkers=1
pnpm test:db
pnpm test:migrations
pnpm test
pnpm openapi:check
```

The new 12-test PostgreSQL suite covers previous-schema upgrade under the real
non-superuser migration owner with unchanged stored rows and privileges; active
approval/replay; session/member revocation, owner-role change and both expiry
paths during an observed case-lock wait with **zero approval/audit side effects**;
session/member revocation blocked by the approval's retained locks; and all three
supported supplier case types through real case-opening and pack applications.
The existing suites retain wrong-tenant/job, missing-source, immutable hash,
rollback and source integrity assertions. Fresh installation remains a CI gate.

**HOLD for technical acceptance:** actual PostgreSQL/migration and full CI results,
S23 coordinator ruling, and a different model's recorded verdict bound to the
dispatcher-created exact commit, followed by separate-actor acceptance. No claim
of independent review, professional/commercial approval or production release.

Intended commit message: `/private/tmp/jg-msg-serious-b7.txt`.

## r1 — dispatcher 13 CI repair, 16 October 2026

Starting HEAD: `35c5d05a8c7229a25521327297022bdc2284f001`, branch
`codex/sandbox/serious-b7`, initially clean. Task is **SERIOUS-B7**; LP-0 is
only the worktree label. Inspected the supplied failure excerpt for GitHub CI
run `38908824961`, AGENTS.md, applicable BUILD_PLAN.md contracts, and the
merged fixture/source paths. This section supersedes earlier local green
claims only for this repair; prior reviews do not verify the new diff.

### Failure 1 — practice fixture repaired

`packages/db/test/evidence-pack-fixture.ts:29` inserted the practice session
as the admin pool's `postgres` role. Migration 0109's
`app.seed_saved_v1_sample()` is SECURITY INVOKER and explicitly requires
`current_user='jobguard_migration'`, so superuser status does not satisfy it.
The existing admin connection can assume that owner role. The practice-only
branch now uses `SET LOCAL ROLE jobguard_migration` on that same transaction
client for the session insert and its real saved-sample trigger, then
`RESET ROLE` before continuing. This follows the existing owner-side fixture
pattern in `packages/db/test/lp-0-authority-paths.integration.test.ts:34`.
An insert failure reaches the existing outer transaction rollback, which
also clears the transaction-local role. No trigger, grant or policy is bypassed.

The default/non-practice branch and its statements are unchanged. No existing
test body, assertion, expected value, count, hash, fingerprint or pin changed.
The existing 12-test PostgreSQL suite remains the execution regression for
practice approval, revocation, fencing and supplier routing; local static
typechecking does not establish that those database assertions now pass.

### Failure 2 — STOP, case (b): T6 fixture depends on the old routing bug

**File/line:** `packages/db/test/recovery-case-terms.integration.test.ts:22`
(raw insert inside `newCase`); T6 calls it at line 139. Left unchanged.

Before, in the INSERT's values:

```sql
'Fictional party','builder_customer','customer_invoice',$6
```

The same line binds `$4` to `merchant_overcharge` and `$6` to
`JSON.stringify(supplierRefs)` for T6's first control. `supplierFixture()`
(lines 57–63) supplies a material-rate revision ID and two supplier-document
IDs for that job. Thus the raw fixture says **customer invoice** while its
references are **supplier records**. The normal opening command would reject
this case/book/source combination in `assertRecoverySources`
(`packages/core/src/recovery-case.ts:190–195`) before insertion.

Before S22, `loadEvidencePackSources` selected the supplier queries solely
when `case_type === 'merchant_overcharge'` (confirmed from `eae44155^`). That
accidentally concealed the fixture mismatch. S22 selects by the persisted
`source_type='supplier_documents'` and `book='supplier_cost'`. The fixture's
customer labels therefore select the customer-invoice query; none of the
supplier IDs map, and the final unmapped-reference check throws
`EVIDENCE_PACK_SOURCE_NOT_FOUND`. No legitimate supplier source kind was
dropped. The no-policy withheld-payment control already uses its matching
`unboundInvoice` and customer labels.

**Minimal proposed setup correction, NOT APPLIED:** replace only those two
hard-coded labels on line 22 with expressions using the already-bound `$4`:

```sql
'Fictional party',
CASE WHEN $4='merchant_overcharge' THEN 'supplier_cost' ELSE 'builder_customer' END,
CASE WHEN $4='merchant_overcharge' THEN 'supplier_documents' ELSE 'customer_invoice' END,
$6
```

This keeps all parameters, references, other fixture cases, and **every existing
assertion** unchanged, including both T6 controls. Per the explicit r1 order,
STOP on this setup correction and report it to the dispatcher; neither T6 nor
the production loader was edited. Do not restore case-type routing to mask it.
**CI remains held on T6 pending a dispatcher ruling.** The earlier S23 STOP
also remains in force.

### r1 checks and handoff

Dependencies were already installed; no install/download or git-writing command
was run. Used Node 24.17.0 and cached pnpm 10.28.1 via
`PATH=/private/tmp/jg-migfix-2-bin:$PATH COREPACK_ENABLE_NETWORK=0 npm_config_manage_package_manager_versions=false`.
Raw logs use `/private/tmp/jg-serious-b7-r1-*.log`.

| Command actually run | r1 result |
| --- | --- |
| `pnpm typecheck` | Exit 0; seven tasks successful (two cached). |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; lane checks and seven package tasks successful (two cached). |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; exact `serious-b7` lane and migration order. |
| `pnpm build` | Exit 0; seven tasks successful (two cached), including production Next build. Existing Nest/load-esm import and sandbox cache-write warnings remain warnings. |
| `node --test tools/*.test.mjs` | Exit 0; 100 passed. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Retry exit 0: core 94 files/2,601 tests; config 1/1; storage 1/2; AI 6/85. Synthetic fixtures, no live model. |
| `pnpm --filter @jobguard/db exec vitest run src test --exclude 'dist/**' --exclude '**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --maxWorkers=1` | Retry exit 0; 29 files/304 tests, including existing S21/S22 regressions. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 39 files/844 tests. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` with the same nine explicit local exclusions listed in the original receipt above | Exit 0; 78 files/1,642 tests. No listener/DB tests or CI check was made optional. |
| `pnpm openapi:check` | Exit 1; tsx launcher's IPC `listen` fails EPERM, as in the original sandbox run. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; actual generator/snapshot check, avoiding launcher IPC. |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-serious-b7-test-tsconfig.json` | Exit 0; same strict temporary config described above includes the changed fixture and integration suite. |
| `git diff --check` | Exit 0. |

The first concurrently launched core/DB runs exited 1 on unchanged five-second
test timeouts: core `receipt-allocation.test.ts`'s denominator-bound test
(2,600 passed, one timed out), and DB `audit-checkpoint-handoff.test.ts`'s
transitive operator reachability test (303 passed, one timed out). Those logs
remain `source-unit.log` and `db-unit.log` under the r1 prefix. After other
heavy checks finished, the same complete source-unit and DB-unit commands
passed without any assertion, timeout or configuration changes; successful
logs end in `source-unit-retry.log` and `db-unit-retry.log`. These failures
are recorded, not represented as first-attempt passes.

Migration **0173_evidence_pack_authority.sql** and its notes are unchanged;
there is no renumber, new migration, data backfill, new external action or
production policy change. No PostgreSQL, browser, `pnpm test:db`,
`pnpm test:migrations`, or full `pnpm test` run was attempted in this sandbox,
which cannot bind localhost/start PostgreSQL. CI must execute those mandatory
suites unchanged after the dispatcher handles the T6 ruling and pushes.
No fresh independent verdict or technical acceptance is claimed.

Intended repair commit message: `/private/tmp/jg-msg-lp-0.txt` (dispatcher commits).


## r2 — dispatcher 14, ruling 61 fixture correction, 16 October 2026

Starting HEAD: `3a438ed699246a27ca1a359866608e8e77cddd52`; branch
`codex/sandbox/serious-b7`, initially clean. Supplied `origin/main`:
`d74fd66d684226a5150fe3d3576a853d58abcf31`. No fetch or Git write was run.
Read AGENTS.md, applicable BUILD_PLAN.md working/terms contracts, the recovery
terms contract, prior receipt and rulings 61/65 in the supplied decision file.
The ruling's setup assumption matched the current code; no further setup or
assertion correction was needed.

**Only code change:** `packages/db/test/recovery-case-terms.integration.test.ts:22`.
Before: the raw `newCase()` INSERT always used
`'builder_customer','customer_invoice'`. After: two SQL `CASE WHEN
$4='merchant_overcharge'` expressions use `supplier_cost/supplier_documents`
for that type and retain `builder_customer/customer_invoice` otherwise.
All bindings, references, other lines and every assertion remain byte-identical
to starting HEAD. A deterministic byte comparison confirmed the replacement
and that line 22 is the sole changed test line; this is not a model verdict.

**Ruling 65:** S23 is DEFERRED to the stage-end LATER sweep; #232 carries S21
and S22 only. Existing S23-related catalogue handling is present at
`packages/db/src/recovery-case-sources.ts:19` (accepting known practice labels
with `recorded: false`) and is left byte-identical. No S23 fix was added or
removed; the historical S23 reproduction in this receipt remains unchanged.

No production source, migration, policy, pin, expectation, shared list or lane
registration changed. The only other repository edit is this appended r2
section. No new external action, operational alert, data backfill or
compatibility change. Existing production release gates still apply.

### r2 checks and handoff

Node 24.17.0; existing project pnpm 10.28.1, using
`PATH=/private/tmp/jg-migfix-2-bin:$PATH COREPACK_ENABLE_NETWORK=0 npm_config_manage_package_manager_versions=false`.
The initial default `pnpm --version` launcher stalled and was interrupted;
all actual pnpm checks used the existing cached project version above. No
package installation was run. Logs: `/private/tmp/jg-serious-b7-r2-*.log`.


| Command actually run | r2 result |
| --- | --- |
| `pnpm typecheck` | Exit 0; seven package tasks successful, two cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | **Exit 1**; lane checker rejects `packages/db/test/recovery-case-terms.integration.test.ts`; root package lint does not run after that failure. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **Exit 1**; same exact path rejection. |
| `pnpm exec turbo run lint` | Exit 0; supplemental package lint, seven successful tasks, two cached. Does not replace or clear the root lane failure. |
| `node tools/core-purity-lint.mjs && node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs` | Exit 0; remaining root boundary checks passed separately. |
| `pnpm build` | Exit 0; seven successful tasks, two cached; production Next build completed. Existing sandbox cache-write, workspace-root and Nest/load-esm import warnings remain warnings. |
| `node --test tools/*.test.mjs` | Exit 0; 100 passed. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 98 files/2,674 tests; config 1/1; storage 1/2; AI 6/85. Synthetic AI fixtures only. |
| `pnpm --filter @jobguard/db exec vitest run src test --exclude 'dist/**' --exclude '**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --maxWorkers=1` | Exit 0; 35 files/322 tests, including S21/S22 regressions. No PostgreSQL execution. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 40 files/867 tests. No browser execution. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1`, with the same nine explicit local exclusions listed in the original receipt | Exit 0; 81 files/1,656 tests. Listener/PostgreSQL tests excluded locally only; no file, suite or CI configuration changed. |
| `pnpm openapi:check` | **Exit 1**; tsx launcher IPC `listen` fails EPERM in the sandbox. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; actual generator/snapshot check without the launcher's IPC listener. |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-serious-b7-r2-test-tsconfig.json` | Exit 0; strict temporary noEmit config includes the changed recovery-terms test, SERIOUS-B7 integration test and transitive imports. Static validation only. |
| `pnpm --filter @jobguard/db exec vitest list test/recovery-case-terms.integration.test.ts` | Exit 0; affected file collects. Hooks and assertions were **NOT RUN**. |
| `python3 /private/tmp/jg-serious-b7-r2-verify.py` and `git diff --check` | Exit 0; exact one-line replacement, original receipt prefix preserved, only two authorized repository paths changed, no whitespace errors. |

**Remaining lane failure:** `config/lanes/serious-b7.json` does not allow the
ruling-authorized recovery-terms test path. The ruling permits only line 22 and
this receipt section, so that shared list and every other list/pin stay
byte-identical. The coordinator must resolve the lane mismatch separately;
root lint and lint:lanes are not green, and no override was used.

**NOT RUN:** the affected PostgreSQL integration assertions, full `pnpm test`,
`pnpm test:db`, `pnpm test:migrations` and browser/e2e suites. The dispatcher
states this sandbox cannot bind localhost or start PostgreSQL; these mandatory
checks remain for unchanged GitHub CI after push. Collection, typechecking and
scripted unit adapters do not establish PostgreSQL guarantees. No live-model,
provider, deployment, real-data, charge or spending run occurred.

Both requested intended commit-message files contain the same conventional
subject and body: `/private/tmp/jg-msg-serious-b7-r2.txt` and
`/private/tmp/jg-msg-lp-0.txt`. No add, commit, checkout or push was run.
This is a builder run receipt and deterministic preservation check, not either
checker's independent verdict or separate technical acceptance. Both checkers'
confirmation of the exact one-line code delta and the final-commit review/
acceptance gates remain with the dispatcher.

**Ruling 70 lane repair — dispatcher 14, 16 October 2026:** from clean HEAD `fb242a6d064c421c14aed984c992930bffc05091` on `codex/sandbox/serious-b7`, added exactly `packages/db/test/recovery-case-terms.integration.test.ts` to this piece's `config/lanes/serious-b7.json` allow-list, preserving every previous entry and its order; the only other repository change is this paragraph. No test, source, migration, shared register, commercial policy or release gate changed. Using Node 24.17.0 and the existing cached pnpm 10.28.1 launcher/environment documented above (the default version launcher stalled and was interrupted; no install/download), `LANE_BASE_REF=origin/main pnpm lint:lanes`, `LANE_BASE_REF=origin/main pnpm lint`, `pnpm typecheck`, and `pnpm build` exited 0. The same source-unit commands and local exclusions documented above exited 0: tools 100 tests; core 2,674; config 1; storage 2; AI 85 synthetic-fixture tests; web 867; API 1,656; DB 322. The initial DB source run exited 1 with the existing operator-reachability test timing out at its unchanged 5-second limit during concurrent checks (321 passed); repeating the identical command exited 0, all 322 passed, without edits or timeout changes. `pnpm openapi:check` exited 1 because the tsx launcher cannot bind its IPC listener (`EPERM`); `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` exited 0 against the actual snapshot. Exact-byte lane-delta/order verification and `git diff --check` passed; logs are `/private/tmp/jg-serious-b7-lane70-*.log`. Full `pnpm test`, PostgreSQL/migration and browser suites were NOT RUN because this sandbox cannot bind localhost/start PostgreSQL; unchanged mandatory GitHub CI, exact-commit independent verdict and separate acceptance remain pending. Conventional subject/body written to both `/private/tmp/jg-msg-serious-b7-lane70.txt` and `/private/tmp/jg-msg-lp-0.txt`; no add, commit, checkout or push occurred. This is a builder run receipt and deterministic scope check, not independent verification or acceptance.
