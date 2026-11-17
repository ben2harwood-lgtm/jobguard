# CH-7-REST-A builder receipt

Work in progress; execution evidence will be recorded before handoff. PostgreSQL/browser NOT RUN. No technical acceptance or independent verification claimed.

## continuation — 18 October 2026

Builder continuation of dispatcher-committed partial work, CH-7-REST-A only, RED money lane. Authority: issued order and coordinator ruling 108 (approved hash-pinned text wins). No commit, push, merge, acceptance, release, PostgreSQL start or browser/Playwright run by this builder. No packages downloaded or pins changed. Existing implementation retained after inspection; this continuation completes verification/documentation, not a fresh implementation.

### Base, scope and dependency

- Start/current HEAD: `1ce0d36153c16e23317a8415f7da3710f641c0e6`, including partial candidate `7a3219ac`; original implementation base `5284aa2c917a4775c91275c85d412798497bf835`.
- Inspected current `origin/main`: `c4f929f5a37bbc2639186fa3e2a4b2e7adc1ec3a`; merge base `5be718fac210c77f9898c846cdc76dae829267bb`. Both endpoint and merge-base diffs inspected. The endpoint diff also reflects newer-main LATER-B18 files absent here, not task changes. **STOP for that item only:** no modification of those out-of-lane files or attempt to merge main. Dispatcher owns base integration.
- `git merge-base --is-ancestor 71d525de HEAD` exited 0; merge `71d525dec8de95a89ab923be298f9d18b3408e31` is #269. Dispatch supplies merged-prerequisite authorization. Only its historical builder receipt is available locally; this is not independent acceptance evidence. Dispatcher must attach dependency acceptance evidence at handoff.
- Read AGENTS.md, BUILD_PLAN.md §§10.3.3–10.3.5 and CH-7, current recovery contract, Ben's 17 October answers, partial receipt/diff and migration convention. Newest merged definitions of both affected routines are still 0188; 0195 is the issued migration number, subject to dispatcher renumbering.
- Lane does not list itself. No repository, route, display implementation, historical migration, central lane registry, BUILD_PLAN or security inventory was edited. B/DW3 and C/non-v3 pursuit remain outside A. No new money/access policy was invented.

### Result and affected invariants

New F21 header and principal line use the approved constant and `reasonHeld:false`. Wording is 163 characters, UTF-8 SHA-256 `44e291a1874a9c230b704f972df2a547fcb4d67256d1c0f69114682decaf0e21`; F19's approved hash remains `fb24c95b4190d5b342b52302d5f5e18734f6b75a06b1c943de313359fa07a72f`.

F21 remains excluded, Q=0 GBP, principal net=9000p, principal qualifying=0p, source event=null, terminal=false, productionEnabled=false, with unchanged version/policy labels. The existing reader accepts historical null/held results. Replay uses the original immutable stored review; new revisions get the explanation. No historical backfill, new authorization, financial posting or external action. Tenant/session/membership checks, audit atomicity and hashes, idempotency, exact money and immutable history remain required invariants.

### Ruling-bound expectation edits

- Core F21 fixture reason: null → approved constant; header and line held flags: true → false. Both original approved hash assertions preserved. New `F21ApprovedReasonHeaderAndLine` checks the complete result across all 3 settlement × 3 payer × 2 timing combinations; `LegacyF21ResultStillParses` uses an explicit historical result independent of the evaluator.
- Existing DB fixture row: only F21 expected reason null → approved text.
- Existing missing-reason-key test: `expect(good.result.reason).toBeNull()` → conditional exact F21 approved text, otherwise null. Both F17 null cases, malformed construction, missing-key rejection/23514 and zero-row assertions remain unchanged.
- Insurer new-review test: F21 null/held → exact text/false held flags regardless of insurer payer. Its pre-schema adapter explicitly restores F21 null/held while `previousSchema.active`; historical assertions and upgrade comparisons remain unchanged.
- CH-7.spec.ts: F21 fixture null → exact text; F21 absence assertion → exact reason text. Text edit only; no browser execution or screen implementation claimed.

### Failing-first evidence recovered from the interrupted run

The original placeholder receipt lacked evidence, but `/private/tmp/jg-ch7-a-failing-first.log` survives. It records `pnpm --filter @jobguard/core exec vitest run src/recovery-eligibility-v3.test.ts --maxWorkers=2` at 14:59:42: **4 failed, 41 passed**, exit 1. Failures were `DW1 F21 exact candidate Q and available reason`, `F21 excludes an unpaid-bill reduction with the approved reason`, `[B1] approved constants have the exact independent UTF-8 hashes for F21 activation`, and `F21ApprovedReasonHeaderAndLine`. Received reason=null/held=true versus approved text/false. The legacy parse test passed. The surviving implementation script is timestamped 15:02 and the subsequent core log records 45/45 passed at 15:02:11. These are recovered earlier-run execution artifacts, not claimed to have been executed anew in this continuation.

Both new PostgreSQL files carry written-first comments and the retained generator scripts precede activation. **Written first, NOT RUN**: no failing PostgreSQL output exists locally. CI must establish the database proof; source inspection is not execution.

### PostgreSQL acceptance coverage — written, NOT RUN

- `F21SavedReasonSurvivesReconnect`: real session/job/case/review commands; independent pool rereads exact result and case projection.
- `F21MalformedHeaderAndLineCannotCommit`: 14 raw-runtime probes for omitted/null/wrong/ASCII reason, held=true, nonzero Q and mismatched line; precise 23514 refusal (`ELIGIBILITY_FIXTURE_MISMATCH` header, `ELIGIBILITY_LINES_REQUIRED` line), table-count rollback and no stored result. Complete valid raw control commits.
- `F21ExactReplayAndConflict`: exact replay and no extra review/line/audit, payload conflict, stale case/review revisions.
- `F21TenantJobSessionIsolation`: foreign tenant, same-tenant foreign job/session, revoked owner/session refuse both new write and replay.
- `F21NoFinancialOrExternalEffects`: across app/infrastructure table counts, only +1 review/+1 line/+1 audit; null source and exact result. No new landing, allocation, journal, fee, authorization or outbox row.
- `F21FreshInstallAndOwnMigrationUpgrade`: nonempty F21/F19/v1 historical records, canonical PostgreSQL values plus identities/full types, exact own-migration-only security comparison (tables, columns, policies, triggers, constraints, roles/memberships and other functions); only two function bodies differ. Fresh empty database and idempotent runner also covered.
- `F21LegacyReplayAfterUpgrade`: original response unchanged before/after a new revision, original rows/hashes/audit preserved.
- `F21UpgradeComparatorControls`: rolled-back timestamp/content/type/identity corruption detected; later columns/function changes/new rows ignored by original-row preservation proof.

No database preservation result is claimed as executed. No retries, timeout increases or skipped assertions were introduced.

### Routine source comparison

Source-inspected 0195 against post-#269 0188. Exactly four expression edits across the two function bodies; all other bytes match. No signatures, owner/grant commands, lock order, RLS, trigger, supplier-credit branch, F17 timing, insurer exclusion/lock, F19 wording, F18 separately settled interest, source or audit checks change. The own-upgrade test additionally normalizes these four edits against PostgreSQL's actual pre-N function definitions.

```diff
--- 0188 guard_recovery_eligibility_v3
+++ 0195 guard_recovery_eligibility_v3
@@ -90,7 +90,7 @@
  IF NEW.fixture='F20' AND NOT coalesce(paid_before,false) THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  IF NEW.fixture='F15' THEN expected_reason:='Credit note below the £250 minimum';
  ELSIF NEW.fixture='F22' THEN expected_reason:='Prevented spending is not recovered cash';
- ELSIF NEW.fixture='F21' THEN expected_reason:=NULL;
+ ELSIF NEW.fixture='F21' THEN expected_reason:='Your supplier reduced a bill you hadn’t paid yet. That’s a saving, not money back in your account, so it isn’t counted as recovered money and there’s no fee on it.';
  ELSIF coalesce(paid_before,false) AND c.case_type IN('withheld_customer_payment','duplicate_supplier_payment') THEN expected_reason:='Paid before you opened this case';
  ELSIF insurer_money THEN expected_reason:='Insurer proceeds never qualify';
  ELSIF NOT coalesce(settled,false) THEN expected_reason:='Pending money cannot qualify';
@@ -125,7 +125,7 @@
  OR NEW.result->>'version' IS DISTINCT FROM 'recovery-eligibility-review.v3' OR NEW.result->>'policyVersion' IS DISTINCT FROM NEW.policy_version
  OR NEW.result->>'fixture' IS DISTINCT FROM NEW.fixture OR NEW.result->'qualifyingPrincipal' IS DISTINCT FROM jsonb_build_object('pence',expected_q,'currency','GBP')
  OR NEW.result->>'reason' IS DISTINCT FROM expected_reason OR NEW.result->>'outcome' IS DISTINCT FROM (CASE WHEN expected_q>0 THEN 'eligible_for_review' ELSE 'excluded' END)
- OR NEW.result->'reasonHeld' IS DISTINCT FROM to_jsonb(NEW.fixture='F21')
+ OR NEW.result->'reasonHeld' IS DISTINCT FROM 'false'::jsonb
  OR NEW.result->'productionEnabled' IS DISTINCT FROM 'false'::jsonb OR NEW.result->'terminal' IS DISTINCT FROM to_jsonb(NEW.fixture='F22')
  THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  RETURN NEW;

```

```diff
--- 0188 require_recovery_eligibility_v3_effect
+++ 0195 require_recovery_eligibility_v3_effect
@@ -16,12 +16,13 @@
     WHEN NEW.result->>'reason'='Paid before you opened this case' THEN 'Paid before you opened this case'
     WHEN NEW.result->>'reason'='Insurer proceeds never qualify' THEN 'Insurer proceeds never qualify'
     WHEN NEW.fixture='F16-partial' THEN 'Credit note used against an invoice not yet paid in full'
+    WHEN NEW.fixture='F21' THEN 'Your supplier reduced a bill you hadn’t paid yet. That’s a saving, not money back in your account, so it isn’t counted as recovered money and there’s no fee on it.'
     WHEN NEW.fixture='F15' THEN 'Credit note below the £250 minimum'
     WHEN NEW.fixture='F22' THEN 'Prevented spending is not recovered cash'
     WHEN l.kind='fixed_compensation' THEN 'Fixed statutory compensation is not part of the fee base'
     WHEN l.kind='statutory_interest' AND l.debtor_type='individual' THEN 'Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.'
     WHEN NEW.result->>'reason'='Pending money cannot qualify' THEN 'Pending money cannot qualify' ELSE NULL END,
-  'reasonHeld',NEW.fixture='F21')
+  'reasonHeld',false)
   ORDER BY CASE l.kind WHEN 'principal' THEN 1 WHEN 'statutory_interest' THEN 2 ELSE 3 END)
  INTO expected_lines FROM app.recovery_claim_line l WHERE l.tenant_id=NEW.tenant_id AND l.review_id=NEW.id;
  IF NEW.result->'lines' IS DISTINCT FROM expected_lines THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;

```

### Migration, compatibility and recovery

0195 is transactional and replaces only the two guards. No data/schema backfill, new tables/columns/grants/policies/triggers or historical rewrite. Failed installation rolls back. After installation, use a reviewed forward fix retaining historical results and compatible readers; do not restore permissive old guards. Existing display already renders supplied reasons. No new provider, environment variable, operational alert or AI/model/prompt/parser change; AI evaluation is inapplicable. Screens remain parked and no production gate or real charging is opened.

### Required dispatcher/CI handoff

Final-commit `pnpm typecheck`, `pnpm lint`, `pnpm lint:lanes`, `pnpm test`, `pnpm build`, `pnpm test:db`, `pnpm test:migrations`, `pnpm openapi:check` and affected `pnpm test:e2e` evidence remain required. Full `pnpm test` is NOT RUN locally because it includes PostgreSQL; selected non-DB units are reported separately, never as full-suite success. Database and browser commands are NOT RUN by instruction, not silently optional. No clean reinstall was attempted: dependencies were preinstalled and downloads forbidden.

CI must explicitly execute the new files and preservation controls (sequential invocations, max three files, one PG worker):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/ch7-f21-reason.integration.test.ts test/ch7-f21-reason-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-eligibility-v3.integration.test.ts test/recovery-insurer-money.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/practice-supplier-credit.integration.test.ts test/practice-supplier-credit-upgrade.integration.test.ts test/practice-supplier-credit-money-regression.integration.test.ts
```

The existing eligibility file contains F17 timing, F18 interest and missing-reason-key controls; supplier suites preserve earlier/equal/mixed zero-write refusal. Generic migration scripts alone do not execute the new own-upgrade proof. Require a recorded independent RED verdict bound to the dispatcher's exact final commit, followed by separate technical acceptance. This builder does not self-accept. A only completes the F21 implementation scope; CH-7 closure still needs B and C and their acceptance. Local execution results follow.

### Continuation execution results

Local runtime: Node **24.17.0**, versus repository `.nvmrc` **24.15.0** (within package engines, but not an exact pinned-runtime run). No pin changed or runtime downloaded. Exact pinned-runtime/clean-install evidence remains CI-owned. Cached pnpm **10.28.1** used via `/private/tmp/jg-ch7-cont-bin/pnpm`, symlink to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; this directory was prepended to PATH for pnpm commands. Dependencies were already installed. Turbo used its existing worktree cache where reported; sandbox cache-write warnings do not represent failed typechecks.

| Actual command | Result | Log |
| --- | --- | --- |
| `pnpm typecheck` | PASS, 7 tasks (2 cache hits) | `/private/tmp/jg-ch7-cont-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, repository lint and 7 tasks (2 cache hits) | `/private/tmp/jg-ch7-cont-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, 13 in-lane task paths, merge-base comparison | `/private/tmp/jg-ch7-cont-lanes.log` |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-eligibility-v3.test.ts --maxWorkers=2` | PASS, 45/45 | `/private/tmp/jg-ch7-cont-core.log` |
| `node --test tools/*.test.mjs` | PASS, 100/100, no skips | `/private/tmp/jg-ch7-cont-tools.log` |
| Sequential Vitest batches below | PASS, 121 files / 3,059 tests, no failures/skips | `/private/tmp/jg-ch7-cont-units.log` |
| `pnpm openapi:check` | BLOCKED: tsx wrapper IPC `listen EPERM` | `/private/tmp/jg-ch7-cont-openapi.log` |
| API cwd: `node --import tsx src/generate-openapi.ts --check` | PASS, exit 0 after package builds; same generator/check without IPC wrapper | `/private/tmp/jg-ch7-cont-openapi-direct-final.log` |
| `git diff --check` | PASS | terminal |

The first direct OpenAPI attempt before package builds finished failed with missing `@jobguard/db/dist/index.js`; the final direct attempt ran after the dependency existed and exited 0. No schema file was regenerated or edited. The wrapper's sandbox failure is not recorded as a pass.

Unit batch commands used `pnpm exec vitest run <up to three explicit paths> --maxWorkers=2`, sequentially, with every invocation/exit preserved in the unit log:

- `packages/core`: all 114 sorted `src/**/*.test.ts` files in 38 batches: 2,891 tests. Includes F14/F16 reference, F17 timing, F18 separate-interest and legacy-reader/core guards. This includes the 45-test F21 file (the separate initial pass is not double-counted in 3,059).
- `packages/db`: `test/recovery-eligibility-v3-interest.test.ts`: 5 tests. Mocked repository unit coverage, **not PostgreSQL proof**.
- `apps/api`: `src/recovery-eligibility-v3.application.test.ts`, `src/recovery-payment-payer.application.test.ts`, `src/practice-supplier-credit.application.test.ts`: 31 tests.
- `apps/web`: `app/ui/recovery-eligibility-command.test.ts`, `app/ui/recovery-cases.test.ts`, `app/ui/recovery-cases.behaviour.test.ts`: 132 tests. Unit coverage, **not browser journeys**.

No skipped assertions, retries of failed tests or timeout increases. Build result and final handoff checks are recorded below. All results describe this working-tree payload, not an invented final commit or independent verification.

`pnpm build`: **PASS**, 7/7 tasks (2 cache hits), exit 0; log `/private/tmp/jg-ch7-cont-build.log`. Next compiled and generated its output successfully. Existing workspace-root/multiple-lockfile, CSS/autoprefixer and dynamic dependency warnings remain outside this lane; no unrelated remediation. This is a build, not a running-browser proof.

Final `LANE_BASE_REF=origin/main pnpm lint:lanes`: **PASS**, log `/private/tmp/jg-ch7-cont-lanes-final.log`; `git diff --check`: **PASS**. Continuation changed only the ledger and this receipt; all earlier implementation, migration and tests were retained. Intended commit message written to `/private/tmp/jg-msg-ch-7-rest-a.txt`. Dispatcher must commit the complete branch payload and bind CI, independent RED verdict and separate acceptance to that exact commit. No builder acceptance is implied.
