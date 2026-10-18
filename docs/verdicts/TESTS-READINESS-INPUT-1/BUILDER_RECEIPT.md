# TESTS-READINESS-INPUT-1 builder receipt

## Current Codex verification — 18 October 2026

**PARK — RED, decision 74.** Local evidence refreshed; Opus, final commit-bound
reviews, required CI and separate technical acceptance remain pending. Nothing
committed, pushed, merged, enabled or deployed by this run.

### Starting state and scope

- Worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/tests-readiness-input-1`.
- Branch: `codex/sandbox/tests-readiness-input-1`.
- Starting and final HEAD: `e7fe1d8b30cee107d4f8a8b8c32f9bb321f1fe48`.
- Task implementation parent: `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`.
- Local `origin/main`: `b881f90be0a6d368838ca4392338147ef819bd3a`; no fetch performed.
- Initial `git status --short` was empty. The prepared checkout already contained
  the requested 18-test file, exact lane configuration, ledger and prior receipt.
  They were inspected rather than regenerated. This run changes only the ledger
  and this receipt; all tests, expectations and product code remain unchanged.
- Authority read: AGENTS.md, BUILD_PLAN.md §2.4 (including C5), §5.3 and M2-6;
  audit `api-file-readiness.tests.md`, proposals 3–4 only. The issued header controls
  scope; malformed-input/controller/LATER-B13 work is excluded.
- `df -g /System/Volumes/Data`: 62 GB available initially and during build, above
  the 33 GB floor. No browser or database installation or suite was run.
- Existing dependency install reused; no install command run. Runtime is Node
  `v24.17.0` (within package engines, but different from `.nvmrc` `24.15.0`),
  pnpm `10.28.1`, Vitest `4.1.11`. This is not clean-install or exact Node-pin proof.
  The default pnpm launcher stalled on `--version` and was interrupted (130).
  Checks used the already-cached pinned executable
  `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, via the
  scratch `bin/pnpm` symlink on PATH. No runner or check was bypassed.

### Acceptance evidence

RP1 accepts true/false unchanged and rejects `"true"`, `"false"`, `""`, `1`, `0`,
`null`, `[]` and `{}`. RP2 checks absence, explicit false presence, and different
serialized payloads. RP3 checks exact command identity (including an accepted
uppercase plan UUID), accepted timestamp spellings with/without `.000`, and
unchanged plan/advance inputs. No new timestamp-format acceptance rule is defined.

The test file and schema match HEAD byte-for-byte. The schema also matches the
task implementation parent. Scratch copies of the existing test are byte-identical;
only their local schema copy changes. First `z.boolean()` was replaced with
`z.coerce.boolean()` in `coercion/`; then `z.boolean().optional()` was replaced with
`z.boolean().optional().default(false)` in `default-false/`. Both RED runs preceded
the GREEN run against repository source. Repository source was never modified or
restored. Scratch artifacts are retained, not deleted.

All logs, scratch source, runner, `results.json` and `source-identity.json` are in
`/private/tmp/jg-test-tests-readiness-input-1/`. The runner limits each Vitest run to
2 workers and runs checks sequentially. Lint uses `LANE_BASE_REF=origin/main`.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --root /private/tmp/jg-test-tests-readiness-input-1/coercion readiness.payload-preservation.test.ts` | 1 | Expected RED: 8 failed, 10 passed; RP1 rejects truthiness coercion. Log: `red-coercion.log`. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --root /private/tmp/jg-test-tests-readiness-input-1/default-false readiness.payload-preservation.test.ts` | 1 | Expected RED: 2 failed, 16 passed; RP2 detects loss of absence. Log: `red-default-false.log`. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/readiness.payload-preservation.test.ts` | 0 | GREEN: 18 passed against unchanged repository source. Log: `green-readiness.log`. |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | 7/7 tasks successful; forced execution. Log: `typecheck.log`. |
| `pnpm exec turbo run lint --force --concurrency=2` | 0 | 7/7 tasks successful; forced execution. Log: `lint.log`. |
| `node tools/lint.mjs` | 0 | Core purity, local lane, money and commercial boundary checks passed. Log: `lint-root.log`. |
| `pnpm lint:lanes` | 0 | Local lane passed with LANE_BASE_REF=origin/main. Log: `lint-lanes.log`. |
| `pnpm build --force --concurrency=2` | 0 | 7/7 tasks successful; forced execution. Log: `build.log`. |
| `pnpm openapi:check` | 1 | BLOCKED before verification: tsx IPC listen EPERM; not an OpenAPI pass. Log: `openapi.log`. |
| `git diff --check` | 0 | Passed after ledger edit, before this receipt refresh. Log: `diff-check.log`. |

After the receipt refresh, local `pnpm lint:lanes` and `git diff --check` also
passed (exit 0); logs: `final-lint-lanes.log` and `final-diff-check.log`.

OpenAPI was attempted with the required script, but `tsx` failed creating its IPC
pipe with `EPERM` (`syscall: listen`) before the generator ran. No alternative
runner or permission escalation was used; CI must perform the real check.

Non-fatal build/check output includes Turbo IO permission warnings, Next workspace
root inference from multiple lockfiles, CSS autoprefixer/cache warnings and a Nest
`load-esm` dynamic-dependency warning. These are recorded, not repaired outside scope.

### Independent source review

2026-10-18. Fresh gpt-6.1-sol, high reasoning, agent /root/sol_review. Read-only review; no tests executed by reviewer.

PASS — source review; no concrete test acceptance blockers found.

Reviewed 1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4..e7fe1d8b30cee107d4f8a8b8c32f9bb321f1fe48, AGENTS.md, BUILD_PLAN.md C5/§5.3/M2-6, unchanged schemas, test source, lane, ledger, prior receipt and scratch logs. Test blob: c270212bc875778a51022e52c247e7eb19c10f54.

- RP1 accepts literal booleans and rejects all eight specified nonboolean cases.
- RP2 checks property presence and distinguishes omitted from explicit false.
- RP3 preserves accepted spellings and checks input immutability for plan and advance.
- Boundary reasoning: converting accepted timestamps through toISOString() would change the no-fraction spelling and fail RP3; lowercasing the uppercase plan UUID would also fail. No new timestamp-format policy is asserted.
- Scratch test copies match the reviewed test byte-for-byte. Inspected logs show coercion: eight failures; default-false: two failures; unchanged source: 18 passes.

This is source-review PASS, not Opus review or technical acceptance. Refreshed receipt, exact final-commit review binding, CI and required Opus evidence remain outstanding before acceptance; PARK remains appropriate.

The review text is also retained as `sol-source-review.md` in the scratch directory.
No callable Opus sub-agent is provided in this session; no external review call was
made under the order's no-outward-actions constraint. The dispatcher must obtain
Opus and bind required verdicts to its eventual exact commit. This builder does not
record technical acceptance or a completed two-model check.

### Invariants, exclusions and handoff

- Protects unknown-versus-false and payload identity at schema parsing only;
  not persisted replay, scheduler, authorization integration or provider evidence.
- No product/schema/controller/repository/scheduler/clock-policy changes, no existing
  test expectation changes, and no permissions, prices, money or policy changes.
- No migrations, data backfills, grants, rollback needs, compatibility changes or
  new operational alerts. Standard F unchanged. No real data or provider calls.
- **NOT RUN locally:** full tests, DB, migrations, browser/e2e, CI event/final-commit
  lane checks, live evaluations and deployment checks. Retain mandatory CI suites.
  Local lane checking above is distinct from final commit-dependent CI checks.
- Builder self-review compared the task diff with the order; only the requested
  test and paperwork are present. No protected-value change found.
- Intended commit subject: `test(readiness): preserve optional command payload fields`.
  Subject and body are in `/private/tmp/jg-msg-tests-readiness-input-1.txt`.
- No Git writes. Dispatcher commits; Ben retains the decision-74 merge/enable/deploy
  button. PARK remains in force; green local checks do not grant release authority.

## Prior receipt retained as historical input

The following was already committed in the starting checkout. It describes the
prior builder's run, not this Codex run; its claims are not independently upgraded
by reproducing selected checks above.

Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-READINESS-INPUT-1 builder receipt

Base 1bcd8db8. Test-only; no product code changed. Decision 74: RED two-model check, then PARK.

## Changed
- apps/api/src/readiness.payload-preservation.test.ts (new): RP1 (true/false accepted; "true","false","",1,0,null,[],{} refused), RP2 (omitted `resolved` stays absent, false stays present, omitted vs false serialise differently), RP3 (commandId and timestamp spelling `...000Z` vs `...Z` preserved exactly; plan and advance inputs unchanged).
- config/lanes/tests-readiness-input-1.json (new, as quoted in the order).
- docs/ledger/TESTS-READINESS-INPUT-1.md (new, one-line ledger).

## Run
- vitest on the new file against unchanged source: 18 passed.
- Scratch RED (source restored afterwards, git diff on contracts empty): `z.coerce.boolean()` -> 8 failed (RP1 string/number/null/array cases); `.default(false)` -> 2 failed (RP2 omitted-absent, omitted-vs-false).
- turbo typecheck --force, lint --force (LANE_BASE_REF=origin/main), pnpm build --force: all 7/7 successful.
- git diff --check clean. Disk free 52 GB at start.

## NOT RUN
Full test suite, DB/migration/browser suites, commit-dependent lane checks (CI). No claim of persisted replay, scheduling or provider behaviour. No new timestamp-format rule asserted beyond two spellings the unchanged schema accepts.
