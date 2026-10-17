Built by Codex; dispatched 13 Oct 2026

## Repair round r1 — 13 October 2026

Built by Codex. Repair base and final observed HEAD: `6b9819c5a8fbb2eea0fdc93f5456cf2bd8805743`; PR #179, AMBER lane. No Git write command was run. The dispatcher supplies the next commit SHA and independent review. The original build receipt below is historical evidence for its earlier base, not the repair head.

Scope: only `packages/db/test/catalog-fixlater-8.integration.test.ts` and this receipt changed in the repository. The intended commit message at `/private/tmp/jg-msg-fixlater-8.txt` was updated at the dispatcher's explicit destination. No migration, production code, merged test, shared helper, lane entry, scope note, grant or fingerprint changed.

### Repair and source inspection

- B1: the pg_class sequence branch now passes lowercase `s` to acldefault. The default-privilege fallback also maps pg_default_acl's uppercase sequence kind to lowercase `s`; other kinds and recorded object identities remain unchanged.
- The existing NULL-ACL sequence fixture guard now requires the owner's SELECT, UPDATE and USAGE entries, each with grantor/grantee f8_owner and grantable false. These assertions were edited first, before either reader fallback. They tighten A08 coverage through fixtureCoverage in F8-01/F8-02/F8-03. The initial failing database run is **NOT RUN (cannot start PostgreSQL here; CI)**. No executed failure or PostgreSQL pass is claimed.
- E2: only this piece's new F8-01, F8-02 and F8-06 tests receive an explicit `60_000` ms per-test budget, authorized by the repair header. No existing merged test or hook budget changed. The sibling small-builder-origin-rule9 proof uses the same explicit 60-second scale.
- LATER — temp-directory cleanup: the sibling retains its own mkdtemp directory. The installed embedded-postgres stop implementation cleans nonpersistent directories using a recursive delete operation. This order prohibits adding deletion, so persistence and cleanup stay unchanged. No directory was created by a DB run during this repair.

Self-inspection (builder, not independent review): both uppercase sequence inputs are normalized; the guard checks all three owner privileges while retaining the real NULL-ACL assertion; only the three named test budgets changed; own-step/later-step behavior, controls and role probes remain intact. Rule 9's existing proof shape is unchanged. No self-acceptance or rebound Opus verdict is claimed. Review B1 is source-addressed; E1 still needs actual PostgreSQL execution on the dispatcher's repaired commit.

### Executed checks and limits

| Check | Exit | Result |
| --- | --- | --- |
| `pnpm exec turbo run typecheck --force` | 0 | 7 successful / 7 tasks; 0 cached; 1m3.954s |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | 7 successful / 7 tasks; 0 cached; 42.95s |
| Initial `git diff --check` and preservation read | 0 | Only the requested test changed before receipt update; 12 files hashed |

Each forced check ran once. Both logs include nonfatal `WARNING IO error: Operation not permitted (os error 1)`; all seven compiler tasks executed and the commands exited 0. No reroute or rerun was attempted. Preflight memory free: typecheck 70%, lint 69%; available disk 65 GB before both. Installed Node: v24.17.0; repository .nvmrc: 24.15.0. Reused the already-existing local pnpm shim with pinned pnpm 10.28.1; no install, download or new shim.

**NOT RUN:** `packages/db/test/catalog-fixlater-8.integration.test.ts` (all six F8 tests; sandbox cannot start PostgreSQL; CI owns execution). All other DB files listed in the original receipt remain NOT RUN in this repair; no whole suite was launched. Browser suites NOT RUN (cannot start a browser here; no browser change). Build, unit suites and OpenAPI check NOT RUN in this narrow repair: header requests forced typecheck/lint only, and no production/schema/API change was made. No live-model evaluation applies. TypeScript/package lint results are not claimed as DB proof.

**New migration GRANTs: none. Standard F:** no new direct INSERT, UPDATE or DELETE grant to jobguard_runtime on money, membership, authorization, receipt or audit tables. No fixture or control grant was added or altered.

No new STOP or BLOCKING question. The first source read used the verdict's abbreviated relative path, which did not exist (exit 1); discovery located the actual read-only verdict under the user's full-steam directory. This was a missing file, not a permission refusal.

### Repair command log

Every shell command below is copied as launched; source reads have no test count. Pooling/polling used write_stdin on the same two running checks, with no additional shell command. Three successful apply_patch calls preceded the receipt: assertions first, reader/budgets second, intended message third. Receipt edits use apply_patch only.

Read command 1 — exit 0:
```sh
pwd; git status --short; git rev-parse HEAD; git diff --stat
```

Read command 2 — exit 1:
```sh
cat AGENTS.md; rg -n 'FIXLATER-8|catalog|Discovered later' BUILD_PLAN.md; cat jg-runs/fixlater-8-opus-6b9819c.md
```

Read command 3 — exit 0:
```sh
cat packages/db/test/catalog-fixlater-8.integration.test.ts; rg -n '60_000|60000|afterAll|mkdtemp|cleanup' packages/db/test/*small-builder*rule9*; cat docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md; cat package.json
```

Read command 4 — exit 0:
```sh
sed -n '1,210p' packages/db/test/catalog-fixlater-8.integration.test.ts; sed -n '211,430p' packages/db/test/catalog-fixlater-8.integration.test.ts
```

Read command 5 — exit 0:
```sh
sed -n '76,126p' BUILD_PLAN.md; sed -n '1050,1076p' BUILD_PLAN.md; sed -n '1779,1805p' BUILD_PLAN.md; sed -n '3358,3396p' BUILD_PLAN.md; sed -n '1,100p' docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md; rg -n 'afterAll|mkdtemp|cleanup|60000|60_000|persistent' packages/db/test/small-builder-origin-rule9.integration.test.ts; rg --files /Users/benharwood/.local/share/full-steam | rg 'fixlater-8-opus-6b9819c|FIXLATER-8'; cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md
```

Read command 6 — exit 0:
```sh
cat /Users/benharwood/.local/share/full-steam/jg-runs/fixlater-8-opus-6b9819c.md; sed -n '25,41p' packages/db/test/small-builder-origin-rule9.integration.test.ts; sed -n '282,296p' packages/db/test/small-builder-origin-rule9.integration.test.ts; sed -n '1,26p' docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md
```

Read command 7 — exit 0:
```sh
rg -n 'persistent|rm\(|rmdir|stop\(' node_modules/.pnpm/embedded-postgres*/node_modules/embedded-postgres/dist/*; cat packages/db/package.json; cat packages/db/vitest.config.ts; cat tools/lint.mjs; memory_pressure | tail -1; df -g /System/Volumes/Data; node --version; ls /private/tmp/jg-f8-tools /private/tmp/jg-msg-fixlater-8.txt
```

Read command 8 — exit 0:
```sh
git diff -- packages/db/test/catalog-fixlater-8.integration.test.ts; sed -n '192,229p' node_modules/.pnpm/embedded-postgres@16.10.0-beta.15/node_modules/embedded-postgres/dist/index.js; cat turbo.json; cat /private/tmp/jg-f8-tools/pnpm; cat .nvmrc; sed -n '1,65p' tools/agent-lane-boundary-lint.mjs
```

Forced check 1 — exit 0, 7/7 tasks, 0 cached:
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm exec turbo run typecheck --force
```

Forced check 2 — exit 0, 7/7 tasks, 0 cached:
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; LANE_BASE_REF=origin/main pnpm exec turbo run lint --force
```

Preservation command — exit 0:
```sh
git diff --check; git diff --stat; git status --short; git rev-parse HEAD; cat /private/tmp/jg-msg-fixlater-8.txt; python3 - <<'PY'
from pathlib import Path
import hashlib, subprocess
paths = [
'packages/db/migrations/0121_audit_export.sql',
'packages/db/migrations/0128_shadow_persistence.sql',
'packages/db/src/migrate.ts',
'packages/db/test/audit-export.integration.test.ts',
'packages/db/test/shadow-catalog.integration.test.ts',
'packages/db/test/small-builder-origin-rule9.integration.test.ts',
'packages/db/test/pool-test-utils.ts',
'packages/db/test/upgrade-proof-utils.ts',
'apps/api/src/auth/context-boundary.test.ts',
'config/agent-lane-assignments.json',
'docs/verdicts/FIXLATER-8/CATALOG_SCOPE.md',
'packages/db/test/catalog-fixlater-8.integration.test.ts',
]
for path in paths:
    current = Path(path).read_bytes()
    original = subprocess.check_output(['git', 'show', 'HEAD:' + path])
    print(hashlib.sha256(current).hexdigest(), path, 'UNCHANGED' if current == original else 'REPAIR')
PY
```

Captured hashes and diff (before receipt update):
```text
 .../db/test/catalog-fixlater-8.integration.test.ts    | 19 +++++++++++--------
 1 file changed, 11 insertions(+), 8 deletions(-)
 M packages/db/test/catalog-fixlater-8.integration.test.ts
6b9819c5a8fbb2eea0fdc93f5456cf2bd8805743
test(db): add supplementary own-step catalogue proofs

Cover schema, sequence, view and default-privilege facts around existing
0121 and 0128, including rolled-back controls and actual role probes.
Permit only the two specified non-grantable app USAGE additions at 0128.

Keep merged tests and migrations unchanged. Register FIXLATER-8 and
record source scope, local checks and PostgreSQL execution still pending.
a4a36afbe8c4e0fdc7940e47057f8c7d3e52db1b2e651dd5cd56a983fc9eaf68 packages/db/migrations/0121_audit_export.sql UNCHANGED
d8f7370560595a47f1395dad198abacda1e1351ade096697656c76805e957afe packages/db/migrations/0128_shadow_persistence.sql UNCHANGED
3c1d7b6a6d1511b38284401974dc9ff65b41d6691be375f348aaf0147da5d11d packages/db/src/migrate.ts UNCHANGED
dadb5e37870aa5178b023b52c385731cb40403b6d8d73163e9270281b4d018ee packages/db/test/audit-export.integration.test.ts UNCHANGED
0ee8767ffdf773e515b679cb964dfa6f8b3ee511164cf2521978c221f1b3d455 packages/db/test/shadow-catalog.integration.test.ts UNCHANGED
e6e631d34c2e03f0a603fc713ca76999e3319f61d89df8e349caa1c406f2b77e packages/db/test/small-builder-origin-rule9.integration.test.ts UNCHANGED
8411ccba37f0cadb0a5e0c56782235af059e5be28fb8a662d00e4d9dff45c22a packages/db/test/pool-test-utils.ts UNCHANGED
9c0db8b49cd23bc3bae5dc19bdc9749486bd1869b7d642b37a137d7175b56e49 packages/db/test/upgrade-proof-utils.ts UNCHANGED
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 apps/api/src/auth/context-boundary.test.ts UNCHANGED
6da58fdf78dc7d7e21160795285535463c2384513b34ef05a03bbd45c054ea7c config/agent-lane-assignments.json UNCHANGED
fd56fdc358d6dbe7d659f47a3a45c4c6dde17524317accccf9046b75ab5d7d7e docs/verdicts/FIXLATER-8/CATALOG_SCOPE.md UNCHANGED
16a0356af13e11f0a08e6030e07fbb06f991f2c38e4211e0c2b67069cc72f2ca packages/db/test/catalog-fixlater-8.integration.test.ts REPAIR
```

Final boundary check — exit 0:
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; LANE_BASE_REF=origin/main node tools/lint.mjs
```
```text
Core purity passed (151 TypeScript files).
Lane boundary passed: {"lane":"fixlater-8","branch":"codex/sandbox/fixlater-8","event":"local","base":"6659fb58791ec22588948f005b2bd4f6b299fa48","head":"6b9819c5a8fbb2eea0fdc93f5456cf2bd8805743","comparison":"merge-base","files":["config/agent-lane-assignments.json","docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md","docs/verdicts/FIXLATER-8/CATALOG_SCOPE.md","packages/db/test/catalog-fixlater-8.integration.test.ts"]}
Money arithmetic boundary check passed.
```
This includes lint:lanes through its unchanged node entrypoint: four original PR paths allowed, working-tree repair confined to the test and receipt. Core purity covered 151 TypeScript files; money and commercial boundaries exited successfully.

Final two-path verification — exit 0:
```sh
git diff --check; git diff --stat; git status --short; git rev-parse HEAD; python3 - <<'PY'
from pathlib import Path
import hashlib, subprocess
expected = {'packages/db/test/catalog-fixlater-8.integration.test.ts', 'docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md'}
changed = set(subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], text=True).splitlines())
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], text=True).splitlines()
assert changed == expected, changed
assert not untracked, untracked
for path in sorted(expected):
    print(path, 'lines', len(Path(path).read_text().splitlines()))
path = 'packages/db/test/catalog-fixlater-8.integration.test.ts'
print('SHA256', hashlib.sha256(Path(path).read_bytes()).hexdigest(), path)
message = Path('/private/tmp/jg-msg-fixlater-8.txt').read_text()
assert message.startswith('fix(db): correct sequence ACL defaults in FIXLATER-8 proofs\n\n')
print('Two-path preservation and intended commit message: PASS')
PY
```
```text
 docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md        | 144 +++++++++++++++++++++
 .../db/test/catalog-fixlater-8.integration.test.ts |  19 +--
 2 files changed, 155 insertions(+), 8 deletions(-)
 M docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md
 M packages/db/test/catalog-fixlater-8.integration.test.ts
6b9819c5a8fbb2eea0fdc93f5456cf2bd8805743
docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md lines 595
packages/db/test/catalog-fixlater-8.integration.test.ts lines 423
SHA256 16a0356af13e11f0a08e6030e07fbb06f991f2c38e4211e0c2b67069cc72f2ca packages/db/test/catalog-fixlater-8.integration.test.ts
Two-path preservation and intended commit message: PASS
```
The diff statistics and receipt line count were captured before adding this command/result appendix. The appendix changes only this receipt; the test hash stays as captured. Final observed HEAD remains `6b9819c5a8fbb2eea0fdc93f5456cf2bd8805743`. Dispatcher owns the next commit and real PostgreSQL validation. No new STOP or BLOCKING question.

A final read-only `git diff --check; git diff --stat; git status --short; git rev-parse HEAD` follows this receipt edit; its actual output is returned directly to the dispatcher. No further file edit is planned.

## Original build receipt (historical)


# FIXLATER-8 builder receipt

Task: FIXLATER-8. Branch: `codex/sandbox/fixlater-8`. Worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/fixlater-8`.

Dispatched base and final HEAD: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`; origin/main matched it initially. Final observed origin/main: `43a52cd957b3b41fe3fa44eb2153213b62717b39`. No commit, staging, push, PR, acceptance or independent model verdict was created. The dispatcher owns the candidate commit and subsequent verification. Intended conventional commit subject/body is written to `/private/tmp/jg-msg-fixlater-8.txt`.

The requested first-line Sonnet attribution is inaccurate for this session; this receipt names the actual builder, Codex. The issued header sets check lane GREEN. The exact required registry entry still says RED review because that supplied draft note was copied verbatim; it does not supersede the header. No lane-floor execution is claimed.

## Scope and partial evidence

Only open source FIX-LATER.md:108 is selected. The directly read FIXLATER-7 issued order selects 101 and 109; neither is included. No tracker, BUILD_PLAN, existing test, migration, application file or shared helper was edited. There is no FIXLATER-8 plan card; this is the issued supplementary maintenance proof under ENT-10 and SV-2.

All cited source anchors agree with the dispatched main, including the 0140 registry entry and the absence of 0139. See CATALOG_SCOPE.md for source anchors, boundaries and executable assertion mapping. The lane registry is the only shared edit, owned for this local piece by FIXLATER-8; the dispatcher serializes integration with other registry owners, including FIXLATER-7. No other shared editing overlap was introduced.

Four authorized repository paths:
- `config/agent-lane-assignments.json`: exactly the compact issued entry, one added line.
- `packages/db/test/catalog-fixlater-8.integration.test.ts`: 420 lines; six exact named tests and file-local helpers.
- `docs/verdicts/FIXLATER-8/CATALOG_SCOPE.md`: supplementary scope and evidence.
- `docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md`: this receipt.

Assertions were written before their local implementation. The first database run is **NOT RUN (cannot start PostgreSQL here)**, as the dispatch specifies. No historical failing execution or comparator-control outcome is invented. New assertions might pass the merged implementation immediately; the rolled-back controls supply deliberate negative evidence when the dispatcher executes them.

The explicit new-test TypeScript check passed before subsequent inspection changes. A small executed ordering probe showed that locale collation put the emergency-role ACL first while the expected list used the opposite order. The comparator now sorts by binary string order. Extra assertions/fixtures explicitly cover real NULL schema, sequence and view ACLs. The targeted TypeScript command was repeated after these two new-file changes; all three invocations exited 0 with no diagnostics.

Source anchors in the new test: F8-01:33, F8-02:41, F8-03:51, F8-04:81, F8-05:102, F8-06:120; catalogue reader:133; usage exception:185; comparator:195; own-step installer:253; fixtures:275; coverage guards:292; forbidden controls:327; actual role probes:405.

A01 and A17–A21 have source/tool evidence within this lane. A02–A16 remain **unverified by execution**. A22 is partial: local typechecks, package lint and build passed, but database/regression execution, root lint/lane validation and OpenAPI verification are outstanding. A23 remains for the independent checker and separate acceptance actor. This is not technical acceptance.

## Executed check outcomes

Runtime was Node `v24.17.0`; repository .nvmrc is `24.15.0`. This session did not install or change Node. Dependencies were already present; no clean install, package download or provider call was attempted. Cached pnpm `10.28.1` was used.

The default pnpm launcher did not complete its version probe and was interrupted (exit 130). It printed a pnpm-field warning. A temporary PATH shim points directly to the already-cached 10.28.1 entrypoint. Commands calling pnpm first export the required Library/pnpm PATH and then prepend that shim. This was a launcher selection, not a workaround for a permission refusal. No permission escalation was requested.

| Check | Exit | Observed count/result |
| --- | --- | --- |
| New-file explicit strict TypeScript check | 0, three invocations | One new file plus source imports; zero diagnostics. Repeats followed new-file changes. |
| `pnpm exec turbo run typecheck --force` | 0 | 7/7 tasks successful, 0 cached; 36.955 s. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 1 | Core purity passed, 151 TypeScript files; lane guard then refused self-comparison. Later root guards were not reached. |
| `pnpm exec turbo run lint --force` | 0 | 7/7 tasks successful, 0 cached; 14.38 s. This is package lint, not a root-lint pass. |
| `pnpm build --concurrency=2 --force` | 0 | 7/7 tasks successful, 0 cached; 47.473 s. |
| `pnpm openapi:check` | 1 | tsx IPC listen EPERM before generator execution; no OpenAPI comparison result. |
| Exact-base preservation script | 0 | 1,600 tracked files checked; only lane registry changed; removing the one new entry reproduces all original registry bytes. |
| `git diff --check` | 0 | No whitespace errors in tracked working-tree diff. |
| `git diff --name-status <base> HEAD` | 0 | Empty because HEAD is still the base; not evidence that uncommitted new files are absent. |
| Intended commit-message creation | 0 | One new temporary text file; no Git write. |

Forced typecheck, package lint and build used **--force**; zero Turbo cache hits were reported. Turbo printed shared-cache IO warnings `Operation not permitted (os error 1)`, but all tasks actually executed and succeeded. No cache-permission workaround was attempted. Build also printed existing Next workspace-root, CSS autoprefixer and webpack serialization warnings; no related source/configuration edits were made.

Before heavy commands, memory reported 67–69% free and Data-volume disk availability 79–77 GB, above the 35% / 45 GB limits. Commands ran sequentially; build and tests never overlapped. No Vitest invocation was launched, no whole-suite fan-out occurred and no explicit timeout/retry/skip was added.

## STOP items, exact refusals and unchanged lines

**STOP — root lint / lane range.** Exact command, after the PATH exports recorded in the command log:
`LANE_BASE_REF=origin/main node tools/lint.mjs` (exit 1).

Refusal: `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.`

`tools/agent-lane-boundary-lint.mjs:212`, before:
```js
  if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");
```
After: identical, unchanged. No proposed code edit. HEAD equals the base because this builder is forbidden to commit. The prerequisite is a dispatcher-created candidate commit and an actual base/head lane run. Do not weaken this guard. The separately prescribed `LANE_BASE_REF=origin/main pnpm lint:lanes` was NOT RUN after the same safety check had refused the range; no alternative range or workaround was tried.

**STOP — OpenAPI IPC boundary.** Exact command: `pnpm openapi:check`, with the PATH and resource checks in the log (exit 1).

Refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/469.pipe`; code `EPERM`, syscall `listen`, port `-1`. The stack points to the installed `tsx/dist/cli.mjs:53:31537` IPC listener.

`apps/api/package.json:72`, before:
```json
    "openapi:check": "tsx src/generate-openapi.ts --check",
```
After: identical, unchanged. No proposed code edit. No alternate loader, compiled generator, permission escalation or retry was attempted. Dispatcher/CI must execute the unchanged check outside this socket restriction.

No selected assertion has yet produced an executed PostgreSQL failure requiring a coordinator-owned grant, pin, merged assertion or budget change. If the new suite fails there, apply the order's STOP rule; this receipt does not authorize a repair beyond these four paths.

## NOT RUN files and gates

All database files below are **NOT RUN (cannot start PostgreSQL here)**, not passed:
- `packages/db/test/catalog-fixlater-8.integration.test.ts`: all six F8 tests, own-step reads, 13 forbidden controls, the valid two-USAGE control, failure rollback, role probes and both later migration pairs.
- `packages/db/test/audit-export.integration.test.ts`.
- `packages/db/test/shadow-catalog.integration.test.ts`.
- `packages/db/test/shadow-persistence.integration.test.ts`.
- `packages/db/test/small-builder-origin.integration.test.ts`.
- `packages/db/test/tenancy.integration.test.ts`.
- `packages/db/test/demo-bootstrap.integration.test.ts`.

The dispatcher runs these files one group at a time through heavy-slot, Vitest --maxWorkers=2 and at most three files per invocation. No database command was attempted here because the issued environment note explicitly prohibits socket/cluster startup. No mock replaces database evidence.

At final inspection FIXLATER-7 had merged. Its real companion file is `packages/db/test/small-builder-origin-rule9.integration.test.ts`, also NOT RUN (cannot start PostgreSQL here; file is on advanced main rather than this frozen worktree). The dispatcher runs it separately after integration.

Full `pnpm test`, `pnpm test:db` and `pnpm test:migrations` are NOT RUN by this builder (dispatcher/GitHub CI ownership and memory rule). Existing browser suites are NOT RUN (cannot start a browser here); no new browser workflow/spec is applicable under C1. No new AI evaluation applies; existing CI evaluation obligations remain unchanged. No independent verdict, acceptance, lane-floor classification, live provider test or release approval exists for this uncommitted candidate.

## Production and fixture grants

**New production grants: none. No migration. Standard F: no new direct INSERT, UPDATE or DELETE grant to jobguard_runtime on money, membership, authorization, receipt or audit tables; no protected business-table write grant at all is introduced.** There are no new production tables, columns, routines, triggers, policies, backfills or rollback/forward-fix obligations.

Every grant introduced in this test file is listed below. Product migrations execute unchanged. Fixture setup is committed only inside disposable test databases; all control grants are rolled back.

| Test-only grant statement | Scope |
| --- | --- |
| `GRANT USAGE ON SCHEMA f8_fixture TO PUBLIC` | Fixture permitted-read twin only. |
| `GRANT SELECT ON f8_fixture.view_fixture TO PUBLIC` | Fixture permitted-read twin only. |
| `GRANT SELECT(payload) ON f8_fixture.view_fixture TO f8_reader` | Fixture column ACL coverage. |
| `GRANT SELECT ON f8_fixture.materialized_fixture TO f8_reader WITH GRANT OPTION` | Fixture relation ACL/grant-option coverage. |
| `ALTER DEFAULT PRIVILEGES FOR ROLE f8_owner GRANT SELECT ON TABLES TO f8_reader` | Fixture-role global default ACL; never product defining role. |
| `ALTER DEFAULT PRIVILEGES FOR ROLE f8_owner IN SCHEMA f8_fixture GRANT INSERT ON TABLES TO f8_reader WITH GRANT OPTION` | Fixture-role scoped default ACL; never product schema. |
| `GRANT CREATE ON SCHEMA f8_fixture TO f8_reader` | Rolled-back assertion-failure, SQL-failure and sequence-owner controls. |
| `GRANT USAGE ON SCHEMA app TO jobguard_shadow,jobguard_shadow_emergency_access` | Rolled-back passing control restores only the two historical schema grants after a transaction-local revoke. |
| `GRANT CREATE ON SCHEMA app TO jobguard_shadow` | Rolled-back prohibited-difference control. |
| `GRANT USAGE ON SCHEMA app TO jobguard_shadow WITH GRANT OPTION` | Rolled-back prohibited grant-option control. |
| `GRANT CREATE ON SCHEMA f8_fixture TO jobguard_shadow` | Rolled-back other-schema control. |
| `GRANT USAGE ON SCHEMA f8_fixture TO jobguard_shadow` | Rolled-back other-schema USAGE control. |
| `GRANT USAGE ON SCHEMA app TO f8_reader` | Rolled-back other-grantee control. |
| `GRANT USAGE ON SEQUENCE f8_fixture.sequence_fixture TO f8_reader` | Rolled-back sequence ACL control. |

No fixture login, role membership, application write route, watchdog registry entry or new grant on a business relation is created. Non-superuser probes use SET LOCAL ROLE and assert current_user posture. Credential values are generated with randomUUID at runtime; no credential-shaped URL or long credential literal was added.

## Self-review — builder inspection only, no verdict

The author inspected the new reader/comparator for selected-family coverage, symmetry, missing-object reporting, full view types/definitions, owner names, PUBLIC and grant-option preservation. The explicit expected raw two-USAGE delta prevents the exception from silently accepting a missing grant. Schema-owner-derived grantors bound the exception. Named coverage guards make empty-family reads fail. Global defaults are included without a namespace join that could exclude them.

Each forbidden control verifies its precondition before mutation and uses the same reader/comparator as the own-step assertions. Every retained transaction uses the unchanged rolledBack helper; SQL failure and assertion failure are themselves exercised. Renaming a fixture proves a missing captured qualified object without deletion. Fresh pool readings and permitted-read twins guard against unusable connections masquerading as access refusals. Disposal directories remain for the dispatcher to clean up; this order allows no deletion.

Only own-step catalogue facts are compared. Later migrations may add schema grants, change definitions or otherwise evolve the catalogue; only their successful two migrator runs and registry-derived receipts are asserted. No business-row persistence or microsecond/retype control is claimed. That work remains FIXLATER-7-owned. No committed object total, source-byte hash, fingerprinted-table column, timeout override or skipped test appears in the new file.

These are author/source observations, not independent review or executed PostgreSQL guarantees. Remaining risks are unexecuted SQL/controls and default hook/test durations. CI, actual non-superuser probes, earlier regressions and the independent recorded verdict remain required.

## Preservation hashes and diff

The executed preservation script compared every one of 1,600 tracked base files to working-tree bytes. Only `config/agent-lane-assignments.json` differed; removing the one compact fixlater-8 line reproduced the base exactly. This covers all merged tests, security pins, shared helpers, migrations, BUILD_PLAN and product files without adding any permanent source-pinning test.

Selected SHA-256 observations (unchanged sources agree with base):
```text
a4a36afbe8c4e0fdc7940e47057f8c7d3e52db1b2e651dd5cd56a983fc9eaf68 packages/db/migrations/0121_audit_export.sql
d8f7370560595a47f1395dad198abacda1e1351ade096697656c76805e957afe packages/db/migrations/0128_shadow_persistence.sql
3c1d7b6a6d1511b38284401974dc9ff65b41d6691be375f348aaf0147da5d11d packages/db/src/migrate.ts
dadb5e37870aa5178b023b52c385731cb40403b6d8d73163e9270281b4d018ee packages/db/test/audit-export.integration.test.ts
0ee8767ffdf773e515b679cb964dfa6f8b3ee511164cf2521978c221f1b3d455 packages/db/test/shadow-catalog.integration.test.ts
8411ccba37f0cadb0a5e0c56782235af059e5be28fb8a662d00e4d9dff45c22a packages/db/test/pool-test-utils.ts
9c0db8b49cd23bc3bae5dc19bdc9749486bd1869b7d642b37a137d7175b56e49 packages/db/test/upgrade-proof-utils.ts
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 apps/api/src/auth/context-boundary.test.ts
e56a0b98608352b6033896fcd038402ce04288084f122e8da804270a7f502ca6 packages/db/test/catalog-fixlater-8.integration.test.ts
4e53bb51b30b60f5636d697a571c648d88e37981bcef4d9d542cb869e428f34e config/agent-lane-assignments.json
```

Executed `git diff --stat`:
```text
 config/agent-lane-assignments.json | 1 +
 1 file changed, 1 insertion(+)
```
Git's tracked diff excludes untracked additions; status separately identifies the three new allowed files. Final four-path verification is recorded below. No receipt self-hash is asserted.

## Complete shell command log

Each block is the exact shell command launched. Exit codes refer to the complete command; successful source-read blocks are not test runs. Tool-level apply_patch edits succeeded only on the four allowed repository paths. Polls of running commands added no new commands; the initial launcher was interrupted with Ctrl-C and ended 130.

### Command 1 — exit 0

```sh
pwd; git status --short; git rev-parse HEAD origin/main; cat AGENTS.md; cat package.json; cat packages/db/package.json; cat packages/db/test/pool-test-utils.ts; cat packages/db/test/upgrade-proof-utils.ts
```

### Command 2 — exit 0

```sh
sed -n '76,126p' BUILD_PLAN.md; sed -n '1050,1076p' BUILD_PLAN.md; sed -n '1779,1805p' BUILD_PLAN.md; sed -n '3358,3396p' BUILD_PLAN.md; sed -n '100,111p' /Users/benharwood/.local/share/full-steam/jg-orders/FIX-LATER.md; cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md
```

### Command 3 — exit 0

```sh
cat packages/db/test/audit-export.integration.test.ts; cat packages/db/test/shadow-catalog.integration.test.ts; cat packages/db/migrations/0128_shadow_persistence.sql; cat packages/db/migrations/0121_audit_export.sql; cat packages/db/src/migrate.ts
```

### Command 4 — exit 0

```sh
head -30 config/agent-lane-assignments.json; tail -18 config/agent-lane-assignments.json; cat packages/db/vitest.config.ts; cat .nvmrc; sed -n '64,86p' docs/verdicts/MIG-ORDER-5/BUILDER_RECEIPT.md; rg -n 'FIXLATER-7|line 109|line 101' /Users/benharwood/.local/share/full-steam/jg-orders/FIXLATER-7-issued.txt
```

### Command 5 — exit 0

```sh
sed -n '1,110p' packages/db/test/audit-export.integration.test.ts; sed -n '1,95p' packages/db/test/shadow-catalog.integration.test.ts; sed -n '1,52p' packages/db/migrations/0128_shadow_persistence.sql; cat packages/db/migrations/0121_audit_export.sql; sed -n '1,150p' packages/db/src/migrate.ts; sed -n '100,111p' /Users/benharwood/.local/share/full-steam/jg-orders/FIX-LATER.md; memory_pressure | tail -1; df -g /System/Volumes/Data; command -v node; node --version; ls /Users/benharwood/Library/pnpm/bin; rg -n 'fixlater|mig-order-5' config/agent-lane-assignments.json
```

### Command 6 — exit 0

```sh
sed -n '1,23p' packages/db/migrations/0128_shadow_persistence.sql; sed -n '1,90p' packages/db/migrations/0000_tenancy.sql; sed -n '1,100p' packages/db/test/recovery-follow-up-upgrade.integration.test.ts; head -65 tools/agent-lane-boundary-lint.mjs; sed -n '1,75p' /Users/benharwood/Library/pnpm/bin/pnpm; sed -n '270,300p' AGENTS.md; sed -n '3362p;3373p;3392p' BUILD_PLAN.md
```

### Command 7 — exit 130

```sh
memory_pressure | tail -1; df -g /System/Volumes/Data; export PATH="$HOME/Library/pnpm/bin:$PATH"; COREPACK_ENABLE_NETWORK=0 pnpm --version; git diff --check; git status --short
```

### Command 8 — exit 0

```sh
rg --files /Users/benharwood/Library/pnpm/.tools /Users/benharwood/.cache/node/corepack /Users/benharwood/Library/Caches/node/corepack 2>/dev/null | rg '/(pnpm|package.json)$|pnpm.cjs$' | head -25; git diff --check; git status --short; nl -ba packages/db/test/catalog-fixlater-8.integration.test.ts | tail -15
```

### Command 9 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; python3 - <<'PY'
from pathlib import Path
p=Path('/private/tmp/jg-f8-tools')
p.mkdir(exist_ok=True)
s=p/'pnpm'
s.write_text('#!/bin/sh\nexec /usr/local/bin/node "$HOME/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs" "$@"\n')
s.chmod(0o755)
PY
export PATH="/private/tmp/jg-f8-tools:$PATH"; COREPACK_ENABLE_NETWORK=0 pnpm --version
```

### Command 10 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop test/catalog-fixlater-8.integration.test.ts
```

### Command 11 — exit 0

```sh
python3 - <<'PY'
from pathlib import Path
for file, ranges in {
'packages/db/test/audit-export.integration.test.ts':[(26,32),(44,44)],
'packages/db/test/shadow-catalog.integration.test.ts':[(42,56)],
'packages/db/migrations/0128_shadow_persistence.sql':[(16,16)],
'packages/db/migrations/0121_audit_export.sql':[(47,47)],
'docs/verdicts/MIG-ORDER-5/BUILDER_RECEIPT.md':[(78,78)]}.items():
 lines=Path(file).read_text().splitlines()
 for start,end in ranges:
  for n in range(start,end+1): print(f'{file}:{n}: {lines[n-1]}')
PY
rg -n 'f8_|catalog-fixlater|password' packages/db/test/catalog-fixlater-8.integration.test.ts | tail -8
```

### Command 12 — exit 0

```sh
head -55 tools/lint.mjs; rg -n '^async function|^function|^type Control|^const forbidden|\[F8-' packages/db/test/catalog-fixlater-8.integration.test.ts; git branch --show-current
```

### Command 13 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm exec turbo run typecheck --force
```

### Command 14 — exit 0

```sh
node - <<'JS'
const fact=grantee=>'acl '+JSON.stringify({grantor:'jobguard_migration',grantee,privilege:'USAGE',grantable:false});
const rows=['jobguard_shadow','jobguard_shadow_emergency_access'].map(grantee=>({family:'schema',object:'app',change:'+',fact:fact(grantee)}));
console.log(rows.slice().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en')).map(x=>x.fact));
JS
```

### Command 15 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop test/catalog-fixlater-8.integration.test.ts
```

### Command 16 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop test/catalog-fixlater-8.integration.test.ts
```

### Command 17 — exit 1

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; LANE_BASE_REF=origin/main node tools/lint.mjs
```

### Command 18 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm exec turbo run lint --force
```

### Command 19 — exit 0

```sh
rg -n 'Missing branch or self-comparison' tools/agent-lane-boundary-lint.mjs; rg -n '^async function|^function|\[F8-' packages/db/test/catalog-fixlater-8.integration.test.ts; git diff --stat; git diff --check; git diff --name-status 269874640468a6e1dfdfed63edd4ce187d1d9dbb HEAD
```

### Command 20 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm build --concurrency=2 --force
```

### Command 21 — exit 0

```sh
python3 - <<'PY'
from pathlib import Path
import hashlib, subprocess
base='269874640468a6e1dfdfed63edd4ce187d1d9dbb'
paths=subprocess.check_output(['git','ls-tree','-r','--name-only',base],text=True).splitlines()
changed=[]
for path in paths:
 original=subprocess.check_output(['git','show',f'{base}:{path}'])
 current=Path(path).read_bytes()
 if current!=original: changed.append(path)
print('Tracked files inspected:',len(paths))
print('Tracked files changed:',changed)
assert changed==['config/agent-lane-assignments.json']
p='config/agent-lane-assignments.json'
original=subprocess.check_output(['git','show',f'{base}:{p}'])
lines=Path(p).read_bytes().splitlines(keepends=True)
new=[line for line in lines if line.startswith(b'"fixlater-8":')]
assert len(new)==1
assert b''.join(line for line in lines if line not in new)==original
print('Registry: exactly one compact line added; all original bytes preserved')
for p in ['packages/db/migrations/0121_audit_export.sql','packages/db/migrations/0128_shadow_persistence.sql','packages/db/src/migrate.ts','packages/db/test/audit-export.integration.test.ts','packages/db/test/shadow-catalog.integration.test.ts','packages/db/test/pool-test-utils.ts','packages/db/test/upgrade-proof-utils.ts','apps/api/src/auth/context-boundary.test.ts','packages/db/test/catalog-fixlater-8.integration.test.ts','config/agent-lane-assignments.json']:
 print(hashlib.sha256(Path(p).read_bytes()).hexdigest(),p)
PY
rg -n '^async function|^function|^const forbiddenControls' packages/db/test/catalog-fixlater-8.integration.test.ts
```

### Command 22 — exit 1

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-f8-tools:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm openapi:check
```

### Command 23 — exit 0

```sh
rg -n 'openapi:check' apps/api/package.json; git diff --check; git diff 269874640468a6e1dfdfed63edd4ce187d1d9dbb -- config/agent-lane-assignments.json; git diff --name-status 269874640468a6e1dfdfed63edd4ce187d1d9dbb HEAD; git rev-parse HEAD origin/main; wc -l packages/db/test/catalog-fixlater-8.integration.test.ts docs/verdicts/FIXLATER-8/CATALOG_SCOPE.md
```

### Command 24 — exit 0

```sh
python3 - <<'PY'
from pathlib import Path
p=Path('/private/tmp/jg-msg-fixlater-8.txt')
with p.open('x') as out:
 out.write('test(db): add supplementary own-step catalogue proofs\n\nCover schema, sequence, view and default-privilege facts around existing\n0121 and 0128, including rolled-back controls and actual role probes.\nPermit only the two specified non-grantable app USAGE additions at 0128.\n\nKeep merged tests and migrations unchanged. Register FIXLATER-8 and\nrecord source scope, local checks and PostgreSQL execution still pending.\n')
print('Intended commit message written:',p)
PY
git diff --check; git diff --stat; git status --short; git rev-parse HEAD; wc -l packages/db/test/catalog-fixlater-8.integration.test.ts docs/verdicts/FIXLATER-8/CATALOG_SCOPE.md
```

### Final preservation command — exit 0

```sh
python3 - <<'PY'
from pathlib import Path
import subprocess, hashlib
base='269874640468a6e1dfdfed63edd4ce187d1d9dbb'
expected={'config/agent-lane-assignments.json','packages/db/test/catalog-fixlater-8.integration.test.ts','docs/verdicts/FIXLATER-8/CATALOG_SCOPE.md','docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md'}
tracked=set(subprocess.check_output(['git','diff','--name-only',base],text=True).splitlines())
new=set(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines())
assert tracked|new==expected,(tracked,new)
print('Exact four-path verification: PASS')
for p in sorted(expected): print('path',p,'lines',len(Path(p).read_text().splitlines()))
test=Path('packages/db/test/catalog-fixlater-8.integration.test.ts').read_bytes()
assert hashlib.sha256(test).hexdigest()=='e56a0b98608352b6033896fcd038402ce04288084f122e8da804270a7f502ca6'
print('New-test hash unchanged since targeted typecheck and preservation capture')
original=subprocess.check_output(['git','show',f'{base}:config/agent-lane-assignments.json'])
current=Path('config/agent-lane-assignments.json').read_bytes()
assert b''.join(line for line in current.splitlines(keepends=True) if not line.startswith(b'"fixlater-8":'))==original
print('All original lane registry bytes preserved')
PY
git diff --check; git diff --stat; git status --short; git rev-parse HEAD origin/main
```

Observed result:
```text
Exact four-path verification: PASS
path config/agent-lane-assignments.json lines 154
path docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md lines 357
path docs/verdicts/FIXLATER-8/CATALOG_SCOPE.md lines 52
path packages/db/test/catalog-fixlater-8.integration.test.ts lines 420
New-test hash unchanged since targeted typecheck and preservation capture
All original lane registry bytes preserved
 config/agent-lane-assignments.json | 1 +
 1 file changed, 1 insertion(+)
 M config/agent-lane-assignments.json
?? docs/verdicts/FIXLATER-8/
?? packages/db/test/catalog-fixlater-8.integration.test.ts
269874640468a6e1dfdfed63edd4ce187d1d9dbb
43a52cd957b3b41fe3fa44eb2153213b62717b39
```

Final document/path check — exit 0:
```sh
git diff --check; python3 - <<'PY'
from pathlib import Path
import json, subprocess
allowed={'config/agent-lane-assignments.json','packages/db/test/catalog-fixlater-8.integration.test.ts','docs/verdicts/FIXLATER-8/CATALOG_SCOPE.md','docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md'}
changed=set(subprocess.check_output(['git','diff','--name-only','269874640468a6e1dfdfed63edd4ce187d1d9dbb'],text=True).splitlines())
changed.update(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines())
assert changed==allowed
policy=json.loads(Path('config/agent-lane-assignments.json').read_text())
assert set(policy['lanes']['fixlater-8']['allow'])==allowed
receipt=Path('docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md').read_text()
assert 'exit pending' not in receipt
assert Path('/private/tmp/jg-msg-fixlater-8.txt').is_file()
print('Final verification: exactly four paths, valid lane JSON, no pending command exit, intended message present')
PY
```

Observed: Final verification: exactly four paths, valid lane JSON, no pending command exit, intended message present

Final observed HEAD: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`. Final observed main: `43a52cd957b3b41fe3fa44eb2153213b62717b39`. No commit or push.


The line count above was captured before this command/result appendix was added to the receipt. Subsequent edits add only this receipt appendix and the latest-main note to the allowed scope document. The test and lane entry remain unchanged after their preservation/typecheck evidence.

Final head remains `269874640468a6e1dfdfed63edd4ce187d1d9dbb`. A new candidate SHA can only be supplied after the dispatcher commits these working-tree changes.

## Main advanced during the build

The final preservation command observed a new origin/main SHA. Read-only verification found FIXLATER-7 / PR #177 merged at `43a52cd957b3b41fe3fa44eb2153213b62717b39`. Its changes are the additive lane entry, its receipt, the MIG-ORDER-3 receipt clarification and the new companion test. All cited BUILD_PLAN, catalogue proof/migration and helper files are unchanged from the dispatched base; main wins and introduces no conflicting catalogue fact. The worktree remains on the issued base because Git writes are prohibited.

The dispatcher must integrate current main, preserve both lane entries, rerun the required checks on the actual candidate commit and include `small-builder-origin-rule9.integration.test.ts` separately. Local successful checks above apply to the working tree built on the dispatch base, not a claimed post-integration commit.

Executed command — exit 0:
```sh
git log -3 --oneline origin/main; git diff --name-status 269874640468a6e1dfdfed63edd4ce187d1d9dbb origin/main; git diff 269874640468a6e1dfdfed63edd4ce187d1d9dbb origin/main -- BUILD_PLAN.md packages/db/src/migrate.ts packages/db/test/audit-export.integration.test.ts packages/db/test/shadow-catalog.integration.test.ts packages/db/migrations/0121_audit_export.sql packages/db/migrations/0128_shadow_persistence.sql packages/db/test/pool-test-utils.ts packages/db/test/upgrade-proof-utils.ts docs/verdicts/MIG-ORDER-5/BUILDER_RECEIPT.md; git rev-parse HEAD origin/main
```

Observed:
```text
43a52cd Merge pull request #177 from ben2harwood-lgtm/codex/sandbox/fixlater-7
d03cf53 test(db): supplement SV-2 origin upgrade preservation proof
2698746 Merge pull request #173 from ben2harwood-lgtm/codex/sandbox/fixlater-6
M	config/agent-lane-assignments.json
A	docs/verdicts/FIXLATER-7/BUILDER_RECEIPT.md
M	docs/verdicts/MIG-ORDER-3/BUILDER_RECEIPT.md
A	packages/db/test/small-builder-origin-rule9.integration.test.ts
269874640468a6e1dfdfed63edd4ce187d1d9dbb
43a52cd957b3b41fe3fa44eb2153213b62717b39
```


