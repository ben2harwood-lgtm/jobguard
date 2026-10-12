VERDICT: PASS
HEAD: 77634e62900b46076220304a2bb9af13fe6a6421

**First question: No. Nothing that previously failed for one of the specified real faults now passes.** The intended exceptions are later column additions and later function replacements or removals.

No BLOCKING findings.

**P3 — LATER:** [BUILDER_RECEIPT.md:106](/private/tmp/jg-check-mig-order-3-20261011T235400/docs/verdicts/MIG-ORDER-3/BUILDER_RECEIPT.md:106) leaves the compiled-generator OpenAPI mismatch unresolved. The actual source generator passed during this check. Follow-up: record the successful source command below in acceptance evidence and distinguish it from the historical compiled-check result. No S8 repair is required.

All `S8` references below mean [extra-origin-upgrade.integration.test.ts](/private/tmp/jg-check-mig-order-3-20261011T235400/packages/db/test/extra-origin-upgrade.integration.test.ts:60).

| Fault | Still fails? | Enforcing line |
|---|---|---|
| 0122 changes or removes an existing function | Yes | `S8:84`; helper `43–49` compares every recorded OID’s exact definition and reports missing functions |
| 0122 adds an undeclared column | Yes | `S8:85` requires precisely the old ordered names/types followed by declared additions |
| 0122 or a later migration changes an old column’s value | Yes | `S8:103`, after both full migration runs |
| A pre-existing row is deleted or duplicated | Yes | `S8:103` compares complete ordered arrays, including their counts |
| A pre-existing column is dropped, renamed or retyped | Yes | `S8:85` for 0122; `S8:106` after all migrations |
| 0122’s new columns are non-NULL on old rows | Yes | Unchanged assertion at `S8:104`; coverage tied to declared additions at `101` |
| Migration execution fails or reapplication breaks idempotency | Yes | Both calls at `S8:97` must succeed; subsequent row, type and registry assertions must pass |
| 0122 is not recorded | Yes | Exact step-1 registry at `S8:83`, full registry at `98`, unchanged single-record assertion at `159` |

Both newly permitted cases pass:

- A later nullable column on `app.extra_origin`: control at `S8:119–122` runs the same post-migration comparisons.
- A later `CREATE OR REPLACE` of the recorded `app.half_even_ratio`: control at `S8:124–127` passes those comparisons. No function comparison executes after step 2.

The same function replacement at 0122’s own step reports exactly that function at `S8:93`.

| Criterion | Verdict | Evidence |
|---|---|---|
| MO3-1 | **MET** | Failure preservation above; committed controls and real PostgreSQL execution |
| MO3-2 | **MET** | `81–83`: execute only 0122, record it, assert the exact registry prefix |
| MO3-3 | **MET** | `84`: every recorded function remains text-identical; missing counts as changed |
| MO3-4 | **MET** | Original double migration call retained at `97`; exact complete registry at `98` |
| MO3-5 | **MET** | Named old-column comparison at `103`, NULL assertion at `104`, existence/type check at `106` |
| MO3-6 | **MET** | Only original lines 34 and 41 replaced; all other original lines remain byte-identical |
| MO3-7 | **MET** | Mac S8: 1/1 passed; exact candidate also passed S8 in GitHub CI |
| MO3-8 | **MET** | Receipt contains the exact ruling, fault, before/after comparisons, enforcement table, controls, commands, limitations and self-review |

The only removed or changed original lines are:

| Original line | Where its assertion now lives |
|---|---|
| 34: whole rows minus 0122 additions equal the snapshot | `S8:103`, using helper `38–42`; `85` retains the undeclared-column guard and `106` explicitly checks old types |
| 41: every recorded function definition equals its snapshot | `S8:84`, using helper `43–49`, immediately after 0122 alone |

The remaining original assertions retain their text: ordering/uniqueness `14→62`, migration position `15→63`, provenance `26→74`, NULL additions `35→104`, legacy repository result `39→157`, registry record `42→159`, runtime rejection `43→160`, and fresh/upgrade catalog equality `46→163`. The original double runner call is `30→97`; the closing `120_000` budget is unchanged at `165`.

Step 1 uses the runner’s SQL execution and registry insertion behavior. [migrate.ts:77](/private/tmp/jg-check-mig-order-3-20261011T235400/packages/db/src/migrate.ts:77) then skips the recorded 0122 file. The fresh-install cluster still applies it through the runner.

`git diff origin/main...HEAD` contains exactly three allowed paths: S8, the receipt, and one lane insertion at [agent-lane-assignments.json:80](/private/tmp/jg-check-mig-order-3-20261011T235400/config/agent-lane-assignments.json:80). Every migration, `migrate.ts`, `extra-fixtures.ts`, and every other test is unchanged. No founder-reserved behavior changed.

I executed these checks using cached pinned pnpm 10.28.1:

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | 7/7 tasks; 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Boundaries passed; 7/7 tasks; 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Exact three-file scope |
| `pnpm build --concurrency=2` | 0 | 7/7 tasks; 5 cached; 27 static pages |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/tenant-context.test.ts src/demo-seed.test.ts src/outbox.test.ts` | 0 | 3 files, 29 tests passed |
| `node --test --test-concurrency=2 .tmp-check/mo3-independent.test.mjs` | 0 | 6 independent cases passed |
| `node node_modules/typescript/bin/tsc -p /tmp/mo3-check-s8-tsconfig.json` | 0 | S8 semantic typecheck |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Source OpenAPI check passed |
| Git diff, scope and preservation checks | 0 | No tracked working-tree changes |

The initial typecheck invocation was interrupted before completion when a child selected host pnpm 11; it is not counted as a pass. Lane checks used a scratch PR-event file bound to the exact candidate/base SHAs because this worktree is detached.

My [scratch tests](/private/tmp/jg-check-mig-order-3-20261011T235400/.tmp-check/mo3-independent.test.mjs) exercise the candidate’s actual helpers for changed/deleted/duplicated rows, missing/changed functions, column retypes/renames, rollback on failure, literal-column accuracy and original-line preservation. Their query doubles do **not** prove PostgreSQL behavior.

For PostgreSQL evidence, I inspected the Mac receipt and actual logs: S8 passed 1 test, nearby regressions passed 48 and 15 tests, and the by-hand changed-value control failed at the real named-column comparison. The two green controls ran inside S8; they were not separate by-hand repeats. Only the receipt changed between the Mac-tested commit and this HEAD.

[PR #141 CI](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/38182075499) finished successfully. Its logs show S8 passed, the database suite passed **77 files / 1,029 tests**, and browser tests passed **326 tests**. Secrets and dependency review also passed.

I did not execute PostgreSQL or browsers locally. No tracked files were edited, committed or pushed. This is one independent checker verdict, not technical acceptance or merge authorization.