# CH-3a round 13 builder receipt

7 October 2026 · `codex/sandbox/ch-3a` · existing PR #98.
Starting HEAD: `33d34dd172ba1163e3400dfe1cdde836b7aa1980` (round 12).
All repairs are uncommitted in this worktree. Round 11 (`0ad202c`) and round 12
remain intact. No git write, commit, push, merge, checkout or PR operation.
The dispatcher owns committing/pushing and must obtain exact-head CI, a fresh
independent recorded verdict and separate acceptance. This receipt is builder
evidence, not an independent verdict or technical acceptance.

## Repair and smallest correct design

The dispatch reports PostgreSQL failures in CI run `37677138095` on `0ad202c`:
0094's issuer inserts a generated home job directly as `live`, and 0095's
`require_job_parties()` rejects it before a binding exists. Source inspection
confirms that conflict; PostgreSQL was not started locally.

**0095 remains the only amended migration. 0000–0094 are byte-identical.**
A narrow **SECURITY INVOKER** BEFORE INSERT trigger seeds the live home example's
fixed fictional customer/site and same-as-customer payer before the existing
party guard. It requires `current_user = 'jobguard_migration'`, the fixed demo
tenant, `home`/`live`, and a persisted valid synthetic session. The unchanged
0094 SECURITY DEFINER issuer supplies that server identity and tenant context.
Runtime cannot assume the migration role. Row fields, digests and GUCs alone
cannot authorize generation. The helper has no PUBLIC/runtime/infrastructure
EXECUTE grant and introduces no elevated helper API.

The binding's existing deferred job FK permits parties/current pointer before
the job INSERT, completing atomically when the job exists. Alphabetical trigger
order places `job_parties_generated_practice` before `job_parties_live_guard`.
The guard is byte-identical, still applies to every insert/promotion, and has no
exemption. The original live INSERT also retains SH-1's AFTER INSERT commercial
track hook; inserting as quoting and later promoting would miss that hook.
The fixed three titles/statuses, revision 0, immutable creator/scenario and
session authentication/expiry rules remain unchanged. Quoting/capture jobs need
user parties before preview/live. Prior explicit test fixture bindings are kept
when already present. Nothing infers parties from arbitrary job titles/data.

The live default uses `backfilled_synthetic_fixture`, a `.invalid` email and a
fixed fictional address. Reuse suggestions exclude another job's generated
fixture defaults; its own workspace shows them. Human-created/explicitly bound
identities remain suggestions. Authorization still permits reuse of the owning
session's defaults and rejects strangers; non-practice reads remain tenant-wide.
This preserves the existing exact empty/own-only registry assertions and avoids
putting the canned extension's defaults into an unrelated quoting job's choices.
Lists and recognition continue to use current bindings.

SBOX's existing evidence-pack test builds a legacy quote directly on a captured
job. Its setup now explicitly seeds fictional parties and tenant context before
that quote INSERT, satisfying CH-3a's document guard. Every original test line,
including every assertion, remains in order. Neither SBOX suite installs an
automatic party fixture trigger; CH-3a's missing-party tests remain unassisted.
Only the existing `ch-3a` lane line changed, adding the exact path
`packages/db/test/practice-session.integration.test.ts`; every other lane line
and all prior grants are unchanged. Shared SBOX paths are repaired serially here
under this dispatch; no parallel agent edits.

## Round 11 practice-session change

**Keep it: required for CH-3a's authorized adoption path.** The controlled
adoption routine creates an imported job without a directly stored session
digest. 0094 forbids assigning ownership later. The existing same-command,
append-only adoption audit reference names the source job, so the recursive
ownership relation gives the source session access to its import, list and
recognition. Removing it would make successful imports inaccessible to their
creator. Unreferenced legacy jobs stay unowned; another session receives
`NOT_FOUND`; no first-touch ownership mutation is introduced.

This round changes only the stale explanatory comment in
`packages/db/src/practice-session.ts`: its ownership SQL, authorization and
material adapter executable code are byte-identical to HEAD. SBOX application
and transport unit tests pass unchanged. Its real PostgreSQL ownership,
material-isolation and evidence-pack tests are collected for CI, not claimed as
executed locally.

## Added PostgreSQL coverage and CI requirements

All 82 previous job-parties cases are retained, including the round-11 ownership
case and round-12 bound-revision/correction-reason tests. Four new cases cover:

- The same three generated scenarios/statuses/revisions; exactly bound live
  customer/payer/site; SH-1 track binding; unbound quoting jobs; own-job default
  suggestions; stranger reference refusal/receipt rollback; authorized explicit
  reuse and recognition.
- Forged row/session/scenario/bypass settings cannot insert live without parties;
  runtime status UPDATE is denied; migration-role promotion still hits the guard.
  Issuer and generator owner/security/grants and denied `SET ROLE` are checked.
- A transactional fault on the final home INSERT rolls back session, jobs,
  generated revisions, bindings and current pointers. Fault DDL also rolls back;
  issuance is invoked as runtime with its existing migration-role definer.
- Duplicate, malformed/null and revoked-membership issuance produce no additional
  sessions, jobs, customers, sites or bindings.

Collected **106 PostgreSQL cases**, with unchanged timeout/configuration:

| Suite | Cases | What CI must show |
| --- | ---: | --- |
| `packages/db/test/practice-session.integration.test.ts` | 10 | All pass; no `JOB_PARTIES_REQUIRED` during issuance; immutable ownership, failed first-touch claims, current membership, inbox isolation, sandbox creation, two-session material catalogues, non-practice catalogues and evidence-pack approval/stranger denial remain sound. |
| `packages/db/test/sandbox.integration.test.ts` | 2 | Both pass, including “isolates sessions, deterministically advances, and append-only resets”; runtime mutation denials and zero external effects remain. |
| `packages/db/test/job-parties.integration.test.ts` | 86 | All earlier and four new cases pass, including “isolates labels, unbound suggestions, recognition and forged registry references; an adopted job inherits only its source session”. |
| `packages/db/test/practice-scope.integration.test.ts` | 6 | Every shared practice subject/RLS/proof assertion passes. |
| `packages/db/test/practice-finding-scope.integration.test.ts` | 2 | Confirmed-scope selection and tenant/job separation pass. |

For explicit reproduction after push:
`pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/practice-session.integration.test.ts test/sandbox.integration.test.ts test/job-parties.integration.test.ts test/practice-scope.integration.test.ts test/practice-finding-scope.integration.test.ts`.
CI must also pass the full existing `pnpm test`, migration fresh/upgrade/catalog
checks, restore coverage and both browser projects. Browser collection includes
all **62 cases** in `CH-3a.spec.ts` (42), `SBOX-SESSION-1.spec.ts` (2),
`SBOX-1.spec.ts` (6), `SBOX-2.spec.ts` (6) and `SBOX-resume.spec.ts` (6).
Collection is not browser/database execution evidence.

## Commands actually run

Node `v24.17.0`; cached pinned pnpm `10.28.1` via
`PATH=/private/tmp/jg-ch3a-round12-bin:$PATH`. Existing dependencies reused;
no install, package download or clean reinstall. Logs:
`/private/tmp/ch3a-round13-*.log`.

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm typecheck` (initial / final) | 0 / 0 | All seven tasks pass, two cached, including the final working tree. |
| `LANE_BASE_REF=origin/main pnpm lint` (initial / final) | 0 / 0 | Boundary checks and all seven package checks pass on the final tree; no self-comparison refusal. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (initial / receipt-inclusive final) | 0 / 0 | Existing lane passes against main with the working-tree changes and receipt. |
| `pnpm --filter @jobguard/db exec vitest run src test/verify-evidence-pack-cli.test.ts` | 0 | Three files, 12 unit tests pass. |
| `pnpm --filter @jobguard/web test` | 0 | 13 files, 115 tests pass, including round 12. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | 1 | 375 pass; unchanged Next quote-delivery transport case hits its existing 5-second timeout during the parallel checks. No timeout was changed. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` | 1 | All 376 non-socket tests pass; only unchanged health test fails on sandbox `listen EPERM`, with one related unhandled error. Resolves the transport timeout without extending it. |
| `pnpm --filter @jobguard/api exec vitest run src/practice-session.test.ts src/practice-transports.test.ts src/job-parties.application.test.ts --maxWorkers=1` | 0 | Three files, all 255 SBOX/session/transport/CH-3a tests pass. |
| `pnpm --filter @jobguard/db exec vitest run test/free-port.test.ts` | 1 | Both unchanged socket tests fail on `listen EPERM 127.0.0.1` and their existing timeouts; two related unhandled errors. |
| `node --test tools/*.test.mjs` | 0 | 42 pass, none skipped. |
| `pnpm build` | 0 | All seven tasks pass, two cached; Next production compilation/types/page generation complete. |
| `pnpm openapi:check` | 1 | Sandbox denies tsx CLI IPC socket (`listen EPERM`); no contract mismatch. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Exact same generator/comparison passes without CLI IPC. |
| DB `vitest list` for the five suites above (initial/final) | 0 / 0 | Final: 106 cases; collection only, no PostgreSQL started. |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/CH-3a.spec.ts e2e/SBOX-SESSION-1.spec.ts e2e/SBOX-1.spec.ts e2e/SBOX-2.spec.ts e2e/SBOX-resume.spec.ts` | 0 | 62 cases across both existing projects; collection only. |
| `node /private/tmp/jg-ch3a-round11-test-types.cjs` | 0 | Supplemental comparison: no new job-parties test diagnostics versus HEAD; nine pre-existing unknown-to-string diagnostics. Final two-file comparison recorded below. |
| `python3 /private/tmp/ch3a-round13-inspect.py` | 0 | All merged migrations unchanged; validator/reason checks/live guard/bind routine byte-identical; new SQL ASCII-only; exactly one lane line/path addition; original test lines/assertions retained in order; round-11 ownership executable code unchanged. An initial inline inspection used the wrong JSON nesting and failed; corrected inspection passes. |
| `git diff --check` | 0 | No whitespace errors. |

Final verification: `node /private/tmp/ch3a-round13-test-types.cjs` exits 0:
no new diagnostics in either changed database test file versus HEAD; the same
nine pre-existing unknown-to-string helper diagnostics remain. The package's
normal typecheck does not include DB tests, so this is supplemental comparison,
not a claim that those pre-existing errors were fixed. Receipt-inclusive
`LANE_BASE_REF=origin/main pnpm lint:lanes`, `git diff --check` and the final static
inspection all exit 0.

Turborepo reports nonfatal cache I/O permission warnings; Next retains its existing
multiple-lockfile/root warning. No suite, assertion, timeout, retry, CI step or
failure boundary was weakened. Socket failures remain CI requirements.

## Migration and remaining gates

No merged migration or routine is edited; migration number remains **0095**.
This adds one invoker trigger/function and generated synthetic bindings, with no
new business table or API schema. Exact owner/context/privilege and deferred-FK
behavior still require real PostgreSQL verification. If an environment already
applied 0095, use a separately reviewed forward-fix migration rather than editing
its recorded migration; preserve immutable parties, ownership, audit and artifact
bytes/hashes. Destructive rollback is unsuitable after those records exist.

Not run: PostgreSQL execution/startup, browser execution, fresh/upgrade execution,
restore or root `pnpm test` (which starts PostgreSQL). This sandbox cannot bind
localhost/start PostgreSQL; the dispatcher must obtain GitHub CI evidence after
pushing. No screenshot/trace or live integration claim. Unit doubles, collection
and source inspection do not prove database/ownership/browser guarantees.

No real data, live provider, commercial send, spending, production execution,
financial posting, AI prompt/model change, decision approval, release or deploy.
No new operational alert. Synthetic-only and independent-review/acceptance gates
remain held. Intended conventional commit subject/body:
`/private/tmp/jg-msg-ch-3a.txt`. The dispatcher owns committing and pushing.
