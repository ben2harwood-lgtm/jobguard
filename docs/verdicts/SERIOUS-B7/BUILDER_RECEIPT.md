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

- **0166_evidence_pack_authority.sql** is necessary to fence the private
  control-plane session row: runtime cannot read/lock that table directly.
  Highest migration on supplied main is **0165**. Notes:
  `packages/db/migration-notes/0166_evidence_pack_authority.md`.
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
