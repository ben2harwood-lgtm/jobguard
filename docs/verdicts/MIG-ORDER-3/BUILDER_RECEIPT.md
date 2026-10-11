# MIG-ORDER-3 — builder receipt

Builder: Codex. Issued 11 October 2026 by the JobGuard integrator. Branch `codex/sandbox/mig-order-3`; dispatched base and local `origin/main` at the start: `4564e888b85aba559c542e935e52fe9f78769595`. Working-tree delivery only; the dispatcher commits this exact tree. Check lane RED: fresh Claude Opus review and a separate Codex Sol check, then separate acceptance; all remain pending against the eventual commit. This receipt is not either verdict.

## Coordinator's ruling (word for word)

"An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'."

## Fault and scope

On the dispatched base, the fixture's `cluster(true)` installs all files sorting before 0122 and records them. Old S8 line 28 snapshots `SELECT * FROM app.${table}` for `extra_origin`, `variation`, and `variation_revision`; line 29 snapshots every app function's `oid,pg_get_functiondef(oid) definition`. Line 30 then runs `await migrate(c.admin); await migrate(c.admin);` to the registry head. Old line 34 removes only 0122's columns before comparing whole rows, and old line 41 compares every earlier function after all migrations. Thus a later added column or function replacement incorrectly stops passing this proof of 0122.

Changed files: the one S8 test, exactly one new lane-registry line, and this receipt. No migration, product code, dependency, fixture, runner, other test, UI, or build-plan change. No added database or cluster; scratch statements use the existing admin pool. The original fresh-install cluster remains unchanged.

Read `AGENTS.md`, `BUILD_PLAN.md` §§2 and ENT-4b, the MIG-ORDER-2 receipt, the full S8 file, fixture setup, runner, the merged named-column/type helpers and lists, and the fingerprinted-table guard. Source inspection found no matches for these three table names in migrations 0119–0121. Exact pre-0122 lists were copied from the merged `columnsAt0115` lines and checked text-for-text: 15, 18 and 19 columns respectively.

## Before and after (base line numbers)

Line 30, before and after, byte-identical:

```ts
  await migrate(c.admin); await migrate(c.admin);
```

It now follows the isolated 0122 application, its registry check, exact column-shape check, and existing-function check. The isolated application reads/runs 0122 and records its name with the runner's `ON CONFLICT DO NOTHING` insertion. Its registry must be exactly `names.slice(0, own + 1)`; the later runner step must leave exactly `names` installed. The fresh cluster still installs 0122 through the runner.

Line 34 before:

```ts
   expect(after.map(row => Object.fromEntries(Object.entries(row).filter(([k]) => !added.includes(k))))).toEqual(before[table]);
```

Line 34 after (current line 103):

```ts
   expect(await namedColumnRows(c.admin, table, after)).toEqual(before[table]); // [MO3-5, MO3-1(c)] Same rows, order, count and old values.
```

`namedColumnRows` projects those same driver-parsed rows onto literal old column names. In controls it reads through the dedicated client, selecting those names and preserving the original `tenant_id, variation_id/id` ordering. Both paths use the same projection. The unchanged snapshot and driver representations preserve the original timestamp precision limits.

Line 41 before:

```ts
  for (const row of existingFunctions) expect((await c.admin.query("SELECT pg_get_functiondef($1::oid) definition", [row.oid])).rows[0].definition).toBe(row.definition);
```

Moved into step 1 through `changedFunctions`, current line 84:

```ts
  expect(await changedFunctions(c.admin, existingFunctions), "[MO3-3] 0122 changed no existing function").toEqual([]);
```

The helper compares the exact recorded text for every recorded OID and also reports a missing function as changed. No function comparison or function-definition query occurs after step 2.

## Is anything that used to fail for a real reason now passing?

Source-inspected answer: no. Execution evidence remains pending; every database test and database control is **NOT RUN (sandbox cannot start PostgreSQL)**. The only deliberate exclusions are a later migration adding a column, or replacing/dropping a function. The separate fingerprinted-table guard still owns exact column shapes at the head: `variation_revision` is pinned there; `extra_origin` and `variation` deliberately are not.

| MO3-1 case | Enforcement in the current S8 file | Strength compared with the merged check |
|---|---|---|
| (a) 0122 changes or removes an existing function | `changedFunctions` lines 43–49; step-1 assertion 84; same-function negative control 91–95 | Every earlier function is still compared by OID and exact text, now directly after 0122 alone. Missing is changed. |
| (b) 0122 adds an undeclared column or drops/renames/retypes an old column | Literal catalogue pin 78; exact post-0122 list 85, using typed declared additions 14–18 | The whole ordered list must be old names AND types followed by exactly the declared additions. An extra key still fails here; retypes are additionally checked explicitly. |
| (c) 0122 or a later migration changes any old value or adds/removes a row | Named-row equality 103; helper 38–42; one-value controls 129–140 | Same snapshot, driver values, row count and ordering. Only new-column keys are excluded. |
| (d) Any migration drops/renames/retypes an old column | `changedColumnTypes` 28–35; assertion 106; real and list-form controls 143–152 | Existence and full `format_type` strings, including modifiers, are checked independently of values. A missing column is reported too. |
| (e) Any of 0122's new columns is non-NULL on an old row | Unchanged base line 35, current 104; declaration tie 101 | Unchanged assertion on every row and column; the declaration tie prevents coverage drift. A later backfill of one of these columns still fails. |
| (f) A migration fails or rerunning is not idempotent | Unchanged double runner call 97; full registry equality 98; original ordering/uniqueness assertions 62 | Both calls must succeed and every registered file must be installed; original checks remain. |

Together the isolated exact shape/function check and the head's named value/type/NULL checks preserve these failures. The type checks strengthen coverage for a retype that keeps the values identical. No existing assertion was skipped, retry-wrapped, or given a different budget.

## Controls in S8 — expected outcomes, not execution claims

Every control uses `scratchStatement` (51–55): one `BEGIN` on one client from `c.admin.connect()`, statements and comparisons on that client, `ROLLBACK` in `finally`, and release in a nested `finally`. Controls are sequential. No migration file or login is introduced. The three single-value changes use `SET LOCAL session_replication_role=replica` only within their rolled-back transactions so the existing append-only triggers do not prevent exercising the comparison. CHECK constraints still apply.

| Control | Current lines | Expected proof outcome | Observed database execution |
|---|---|---|---|
| (iii) Replace recorded `app.half_even_ratio(bigint,bigint,bigint)` at 0122's step by inserting `/* mo3 scratch */` after the first body delimiter | 86–95 | RED: `changedFunctions` reports exactly its recorded OID; rollback then restores an empty change list | NOT RUN (sandbox cannot start PostgreSQL) |
| (i) Later `ALTER TABLE app.extra_origin ADD COLUMN mo3_scratch text` | 119–122 | GREEN: same old-row, old-type and new-NULL comparisons | NOT RUN (sandbox cannot start PostgreSQL) |
| (ii) Later replacement with the very same changed function statement | 124–127 | GREEN: same head comparisons, with no earlier-function comparison | NOT RUN (sandbox cannot start PostgreSQL) |
| (iv) Change one old `extra_origin.device_id` value | 129–140 | RED: named rows differ; exactly one updated row and only the intended value differ | NOT RUN (sandbox cannot start PostgreSQL) |
| (iv) Change one old `variation.description` value | 129–140 | RED: same helper detects exactly the intended value | NOT RUN (sandbox cannot start PostgreSQL) |
| (iv) Change one old `variation_revision.description` value | 129–140 | RED: same helper detects exactly the intended value | NOT RUN (sandbox cannot start PostgreSQL) |
| (iv) Retype `extra_origin.device_id` from varchar(200) to varchar(201) | 143–147 | RED: same type helper reports exactly `extra_origin.device_id`, while old values remain equal | NOT RUN (sandbox cannot start PostgreSQL) |
| (iv) Alter that type string in a copy of the expected list | 149–152 | RED: same type helper reports exactly `extra_origin.device_id` | NOT RUN (sandbox cannot start PostgreSQL) |
| After all controls | 153–154 | Exact live column lists and named rows equal their pre-control snapshots | NOT RUN (sandbox cannot start PostgreSQL) |

The expected RED cases are checked as negative controls inside the passing S8 test; they are not reported as failed test runs. The Mac helper also must do the issued one-off uncommitted scratch UPDATE between the double runner call and the row loop, observe S8 fail at the real named-column assertion, and remove it. That additional run is **NOT RUN (sandbox cannot start PostgreSQL)** here. If PostgreSQL refuses the real scratch retype, the helper must record the exact error; no fallback, skip or catch is included in this tree. The required list-form control remains present.

## Commands and results

The four prescribed commands ran once each, sequentially, in the issued order. Runtime: Node `v24.17.0`; cached Corepack pnpm `10.28.1`, with `COREPACK_ENABLE_NETWORK=0` and a temporary PATH entry pointing to that cached runner. Installed dependencies were used without installation. Turbo reported four cache hits for each seven-task command; cache replay is recorded as such.

| Command | Exit | Observed counts/result |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 successful / 7 total; 4 cached; 33.853s |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Core purity: 129 TypeScript files; money boundary passed; lane boundary: exactly the 3 authorized files; 7 successful / 7 total; 4 cached; 21.663s |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | `mig-order-3`, exactly the 3 authorized files, merge-base comparison |
| `pnpm build` | 0 | 7 successful / 7 total; 4 cached; 27/27 static pages generated; 1m26.656s |
| `pnpm openapi:check` | 1 | tsx failed before comparison: `listen EPERM` opening its local IPC socket |
| `node apps/api/dist/generate-openapi.js --check` | 1 | The same checker from the successful build ran without tsx IPC and reported `openapi.json is stale` |
| `git diff --check` | 0 | No whitespace errors |
| Read-only Python diff/list/scope checks, repeated against the immutable dispatched SHA after the ref advanced | 0 | Only original test lines 34 and 41 removed/replaced; unchanged closing line; exact 15/18/19-column literals; one lane line; exactly 3 changed/untracked files; function checks before step 2 only |
| `node --input-type=module` with TypeScript `transpileModule` on S8 | 0 | 0 syntax diagnostics; no semantic or PostgreSQL claim |

The db package's ordinary typecheck/lint/build include `src` only, so their success does not prove the changed integration test is semantically typechecked. S8 received the source/syntax checks above; the actual database run is still required. No Vitest or browser tests ran, and there are no executed test counts to report.

Observed nonfatal build/check warnings: Turbo cache IO `Operation not permitted`; Next's multiple-lockfile workspace-root warning; existing autoprefixer `end` compatibility warnings and related webpack warning-cache messages. These commands still exited 0 as recorded. The OpenAPI failure remains unresolved: neither its generator nor `apps/api/openapi.json` was edited by this lane, and regenerating that file is outside the explicit allowlist. It needs a separate owner/check; no adjacent repair was attempted.

Logs are in `/private/tmp/jg-mig-order-3-{typecheck,lint,lanes,build,openapi,openapi-compiled}.log`. Intended conventional commit subject/body are in `/private/tmp/jg-msg-mig-order-3.txt`. No commit, push or Git metadata write was performed.

## NOT RUN and remaining gates

- [MO3-7] `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/extra-origin-upgrade.integration.test.ts`: **NOT RUN (sandbox cannot start PostgreSQL)**. The Mac helper runs on this exact tree and records exit/counts and each control's result.
- Database suites `pnpm test:db`, `pnpm test:migrations`, and all committed controls: **NOT RUN (sandbox cannot start PostgreSQL)**. Whole-package/repository test suites are prohibited by the issued memory limit; no additional lane test files exist.
- Browser suites: **NOT RUN (sandbox cannot start a browser)**; no affected web workflow.
- Live providers, evaluations and deployment: not applicable; no corresponding code changed.
- OpenAPI check: unresolved as recorded above; the compiled checker found a stale committed document.
- Fresh Claude Opus review, separate Codex Sol check, exact-commit verdicts, separate acceptance, dispatcher commit/push, and merge are pending. At most two repair rounds. This order must merge before SV-2's refresh and #138. PR #140 overlaps only the S8 closing line; that line is unchanged on this base. The lane registry is the only shared registration file touched.

During final checks, an external fetch advanced local `origin/main` to `8e91b2d2e28564b8a19aa5293041bfae1e551485` (#140). HEAD and the dispatched working-tree baseline remain `4564e88`. A direct diff against the now-newer ref includes unrelated #140 changes absent from this old base; they are not working-tree edits. Final scope checks therefore also use the immutable dispatched SHA. The S8 closing line is still byte-identical to what was present at the start, as Q6 requires. The dispatcher must retain #140 when integrating this task.

## Self-review [MO3-6, MO3-8]

Re-read the complete working-tree diff against the issued order. The MO3-1 (a)–(f) table above answers each failure-preservation question with its enforcing line and strength comparison; these are source-inspection claims, not PostgreSQL proof. Before `origin/main` advanced, a read-only deterministic diff check against that ref confirmed that only base lines 34 and 41 were removed/replaced, every other original line is byte-identical, and the S8 closing line remains ` });` (no time budget on the base). Line 30 is byte-identical. Another check confirmed the three literal arrays exactly equal the merged lists, with 15/18/19 entries. The lane registry contains exactly one inserted line in name order, with only the three authorized path scopes.

All earlier-function comparisons sit between applying 0122 alone and the unchanged double runner call. Head rows and types are checked after that call. Each control shares the relevant function, row or type helper and runs on its own dedicated, always-rolled-back transaction using the existing pool. A self-review correction removed an extra head-step comparison against the old function definition, which would have recreated the fault. No comparison against the pre-0122 functions remains after step 2.

New SQL brackets combined predicates. Added text uses the issued scratch/negative-control/later-migration wording and introduces no scanner-sensitive credential assignment. No migration, product code, other test, fixture, timeout, or `BUILD_PLAN.md` changed. No Git write or package download was requested. Required checks and any limitations are recorded above from observed output; there is no acceptance claim.

Builder receipt only — not independently verified, not accepted.
