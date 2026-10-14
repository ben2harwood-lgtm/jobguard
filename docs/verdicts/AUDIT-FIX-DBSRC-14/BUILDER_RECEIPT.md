# AUDIT-FIX-DBSRC-14 — builder receipt

Issued by dispatcher 4, 13 October 2026; work performed 14 October 2026.
Branch: `codex/sandbox/audit-fix-dbsrc-14`. Starting HEAD and `origin/main`:
`bd959b01e857de0ba7cbd3588bab84add7d0f493`. Working tree was initially clean.
Audit source: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-14.md`
(source-inspected at `6659fb5`, not an executed test report).

Check lane: **RED** (tenant-qualified persistence and shadow isolation).
This is builder evidence, not an independent model verdict or acceptance. The
dispatcher owns commit/push; a different model's exact-commit RED verdict and a
separate actor's acceptance remain required. No git command that writes was run.

## Blocking findings

- **DROPPED #1 — pending mandatory alert overtaken by final-account lock: no executed failing real-PostgreSQL concurrency reproduction is available in this sandbox; no fix or passing claim.**
- **FIXED #2 — mixed baseline/capture reference binding.** The new adapter test
  exercised the real repository and real core matcher with baseline ID
  `f0000000-0000-4000-8000-000000000001`, variation ID
  `10000000-0000-4000-8000-000000000001` and a separate variation scope ID.
  Before the fix, all five mixed-match cases (draft, priced, approved, rejected,
  withdrawn) failed: expected scope reference `f000…0001`, received variation
  reference `1000…0001`. Capture-only and unmatched controls passed. Command:
  `pnpm --filter @jobguard/db exec vitest run src/shadow-detection-audit.test.ts --maxWorkers=1`
  exited **1**, **5 failed / 2 passed**; local log
  `/private/tmp/jg-dbsrc-14-logs/mixed-red.log`. The fix was applied only after
  this run. The unchanged seven tests then passed, exit **0**; log
  `/private/tmp/jg-dbsrc-14-logs/mixed-green.log`.

The repository now selects a matching capture whose kind agrees with the outcome:
`already_in_original_scope` stores the baseline's `scopeItemId`, while
`builder_captured` stores the capture's variation `id`. The core match's outcome,
reference ordering and builder-favourable policy are unchanged. No stored facts
are rewritten. The only existing product edit is this reference selection.

The adapter test records SQL bindings; **it does not prove a PostgreSQL foreign
key, privilege, RLS or race guarantee**. A separate new PostgreSQL 16 integration
test uses migrated shadow-role privileges, finalized synthetic evidence and both
scope identities. It asserts successful persistence, the exact baseline outcome
and references, no firing, and unchanged stored revision on replay. It has been
collected and statically typechecked, **not executed**. The real `23503` failure
and post-fix PostgreSQL success remain dispatcher/CI checks.

## Scope, invariants and before/after

Read AGENTS.md and BUILD_PLAN.md §§2.4, 10.2.3–10.2.5 and SV-3's task card before
changing product code. Affected invariants: AGENTS §§5.1, 5.9, 5.14 and SV-3 Test P.
C1/C2: existing server-side persistence only; no new route, service, UI or browser
workflow. Existing isolation and must-surface guarantees remain mandatory tests.

**Migrations: none. New GRANTs: none. Standard F:** no new direct application-login
write privilege, role membership, SECURITY DEFINER routine, schema, policy,
ownership or financial/authorization/audit write path. Only the new disposable
integration fixture enables LOGIN with a generated password on the existing
`jobguard_shadow` role; its migrated privileges are retained. No real data,
provider call, spending, external action or approval. No operational alert,
commercial policy, public contract, retention or residency change.

Rollback is a code rollback; no data backfill or rollback/forward-fix migration.
Previously failed batches can retry through their existing worker path; no
historical row repair is claimed. No API response shape or accepted input changes.

No existing test, expected value, refusal, count, pinned name or fingerprint was
edited. `apps/api/src/auth/context-boundary.test.ts` and its pinned lists are
untouched. No setup was inserted before a call in any existing test. The new
integration test supplies its own synthetic fixture before its own repository
call; the legacy fixture helper itself is unchanged.

Catalogue addition: before, `audit-fix-dbsrc-14` was absent; after, one compact
entry registers this new task with five exact allowed paths. All other lane rows
are unchanged. Shared lane registry and repository edits serialize with other
tasks touching those files. No application authorization catalogue was changed.

## LATER findings — receipt only

- #3: a new-source-only snapshot can leave the retained survivor's capture match stale.
- #4: replay does not conflict on changed `signal_type` or `evidence_cutoff_at`.
- Weak test: isolation query-log comparison can accept equal unexpected application failures.
- Weak test: J coalescing/replay lacks revision snapshots and a new-source-only batch.
- Weak test: P capture matching omits mixed references and exact fee exclusions.
- Weak test: observation reader lacks invalidation, pending/version/hash, lock and terms negatives.
- Weak test: SCIM G4 permissions establishes only the first positive control.

No LATER finding was implemented or used to change an existing assertion.

## Commands actually run

Dependencies were supplied; no install or package-download command was issued.
The global `pnpm --version` launcher stalled and was interrupted (**130**).
Subsequent pnpm commands used the existing temporary wrapper
`/private/tmp/jg-audit-bin/pnpm`, which invokes the cached **10.28.1** binary;
`pnpm --version` confirmed **10.28.1**, exit **0**. Node observed **24.17.0**;
`.nvmrc`/CI pin **24.15.0**. A clean pinned installation was not performed.
Logs are in `/private/tmp/jg-dbsrc-14-logs/`, not committed artifacts.

| Command | Result |
| --- | --- |
| `pnpm exec turbo run build --filter=@jobguard/db^...` | **0**, core/storage dependency builds restored from existing cache |
| New adapter regression, before / after fix (command above) | **1**, 5 failed / 2 passed; then **0**, all 7 passed |
| `pnpm typecheck` | **0**, all 7 package tasks succeeded, 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | **1**, core purity passed; lane checker refused identical base/HEAD before package lint |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **1**, same self-comparison refusal; dispatcher must rerun after commit |
| `pnpm exec turbo run lint` | **0**, all 7 package lint tasks succeeded, 4 cached |
| `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs` | **0** |
| `pnpm build` | **0**, all 7 package tasks succeeded, 4 cached; Next production build completed |
| `pnpm openapi:check` | **1**, tsx CLI IPC pipe creation refused with `listen EPERM` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Final **0**, same OpenAPI generator/check through Node's loader without CLI IPC; this does not make the canonical CLI invocation a pass |
| `pnpm --filter @jobguard/db exec vitest list test/shadow-detection-audit.integration.test.ts` | **0**, one real-PostgreSQL test collected; hooks not executed |
| `pnpm exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck packages/db/test/shadow-detection-audit.integration.test.ts` | **0**, standalone integration-test typecheck |
| `pnpm --filter @jobguard/db exec vitest run src --maxWorkers=1` | Final **0**, 6 files / **94 passed** |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | Final **0**, 81 files / **2445 passed** |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | Final **0**, 33 files / **784 passed** |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/final-account-lock.isolation.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/contractor/*.http.test.ts'` | Final **0**, 64 files / **1555 passed**; excluded PostgreSQL/listening HTTP suites reserved for CI |
| `pnpm --filter @jobguard/ai --filter @jobguard/config --filter @jobguard/storage --parallel exec vitest run src --maxWorkers=1` | **0**, AI **80**, config **2**, storage **1** passed |
| `pnpm eval` | **0**, 5 files / **80 passed**, fixture evaluation only; no live model run |
| `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs` | **0**, **19 passed** |
| Read-only Python inspection of lane JSON, changed/untracked paths and protected auth-file bytes | **0**, exact allow list, additive catalogue and unchanged existing tests confirmed; deterministic inspection, not independent review |
| `git diff --check` | **0** |

Initial concurrent checks are not concealed: the DB source suite twice exited
**1** on the unchanged audit-checkpoint source-scan test's 5000ms timeout
(93 passed / 1 failed each time). Core initially reported two unchanged allocation
test timeouts. API/web initially loaded incomplete/stale package output and
reported failures. Those initial core/API/web runs were interrupted (**130**) so
the build could finish. The first Node-loader OpenAPI attempt exited **1** on an
incomplete DB export. After the package build completed, the unchanged commands,
assertions and time limits passed as reported above. No generated file or test
was deleted to obtain those results. Turbo also reported cache-write `EPERM`
warnings; actual compilation and checks nevertheless completed successfully.

`pnpm test`, `pnpm test:db`, `pnpm test:migrations`, browser journeys, restore
rehearsal and live-model evaluation were **not run**. Root tests start PostgreSQL
and listening HTTP suites. The two tooling suites that write temporary Git
repositories were also reserved for CI under the no-git-write instruction. No
restoration/model/provider behavior changed and no live evaluation is claimed.

Intended conventional commit subject/body are written to
`/private/tmp/jg-msg-audit-fix-dbsrc-14.txt`. No commit has been created, so this
receipt is bound to the named working-tree diff and starting HEAD, not a future
dispatcher commit.

## Dispatcher / Mac or GitHub CI checks

PostgreSQL, browsers and listening HTTP test servers cannot run here. No attempt
was made to start them. After dispatcher commit/push, run on the Mac if supported,
otherwise in the existing GitHub CI:

```sh
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm typecheck
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/shadow-detection-audit.integration.test.ts test/shadow-detection.integration.test.ts test/final-account-lock.integration.test.ts test/shadow-isolation-query-log.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm test
pnpm build
pnpm openapi:check
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop SV-3.spec.ts SV-4.spec.ts
pnpm test:e2e
```

No mandatory suite was made optional. Full database/browser checks, clean pinned
CI, exact-commit RED review and separate acceptance remain holds. Release gates
G1/G2 and production policy approvals are not inferred from this receipt.
