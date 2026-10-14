Built by Codex; dispatched 13 Oct 2026.

# MIGFIX-1 builder receipt — PARTIAL / RED review pending

Task: MIGFIX-1. Issued worktree is the reused `ch-7-terms` checkout, branch
`codex/sandbox/migfix-1`. Inspected base, `origin/main`, and final unchanged
HEAD are all **bd959b01e857de0ba7cbd3588bab84add7d0f493**. No commit, staging,
checkout, push, PR, external message, provider action or acceptance was performed.
Intended commit message: `/private/tmp/jg-msg-migfix-1.txt`.

The addendum requested an attribution to Claude with Codex unavailable. This
session's builder is Codex, so the first line records the actual builder.
No different-model verdict or separate acceptance is claimed.

## Scope and source verification

Read AGENTS.md, the issued header/addendum, the standing handoff, authentication
contract v1, BUILD_PLAN §§2.2–2.4, identity/control-plane contract, ENT-1,
ENT-10 and M0-6L. Source audit `mig-0000-0003.md` was found at
`~/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0000-0003.md`;
its inspection base was `6659fb5`. The stopped API-AUTH receipt in
`fixlater-1` inspected `e4cb843`. Main at the issued base wins.

Rechecked the relevant source claims against current main: unrestricted
membership CRUD grant still exists at `0000_tenancy.sql:82`; membership
lookup at `0111_persisted_identity.sql:131–144` and invitation authority at
`146–160` omit contractor revocations; active invitation reuse at
`101–103` has the same omission. `IdentityRepository.memberships:27–28`
delegates to the SSO wrapper; provider `memberships:100–105` filters those
results. `0138_practice_session_hardening.sql:135` already takes the tenant
advisory key with seed 54; `membership.revoke:195` inserts the immutable
contractor revocation. No substantive drift in these findings was found.
Other findings in the source audit are outside MIGFIX-1 and were not changed.

Migration 0150 was unused on main (main's registration ends at 0142). Added
only its own registration and one additive lane row. Those two shared files
serialize with the dispatcher/integrator and other migration pieces. No
0143–0149 or other piece's SQL was modified.

## Built separable behavior

Migration `0150_membership_authority_fix.sql` replaces exactly three installed
identity routines, preserving their signatures, SECURITY DEFINER settings,
owners and EXECUTE ACLs:

- `current_memberships`: tenant-qualified contractor-revocation exclusion.
  Existing ordinary and SSO session wrappers inherit it.
- `invite_member`: persisted-session owner authorization still occurs inside
  the definer routine; the existing contractor tenant key is taken before
  the active-membership authority read. Refused work raises existing `42501`
  before either invitation or identity security-event insertion.
- `provision_verified_challenge`: takes the same tenant key before locking
  the invitation and checking membership reuse. Revalidates the invitation
  after the lock; contractor-revoked memberships are inactive for reuse.
  A valid fresh invitation creates a replacement and atomically repoints the
  locator. The historical membership and revocation remain unchanged.

No tables, columns, constraints, policies, provider routes, API schemas, UI,
commercial terms, money records, watchdog guard registrations or alerts were
added. C1: installed-routine repair through existing application paths; UI is
parked. Standard F(2)'s new contractor job-writing-route requirements do not
apply: this task adds no route and writes no job record.

**PARTIAL:** runtime membership UPDATE removal is not implemented. The existing
direct authority-change gap remains. It is not classified as fixed or dropped.

## STOP / BLOCKING prerequisite

Removing runtime UPDATE would make existing runtime `FOR SHARE` membership
queries fail with permission refusal, including successful existing journeys.
PostgreSQL requires UPDATE privilege to take these row locks; merged code
explicitly records that dependency. There is no justified existing
non-authority column privilege to retain, and standard F forbids adding a new
direct membership write grant. Removing the locks would weaken authorization
serialization. Changing the merged insurer test's setup is coordinator-owned
under rule G. The issued lane permits none of those repository changes.

Stopped that part. Coordinator must issue checked membership-lock replacements
with their own actor-authority checks, preserving every current predicate,
tenant/session binding, refusal, replay behavior and lock-order guarantee,
including the merged fixture below, before `REVOKE UPDATE ON app.membership
FROM jobguard_runtime` can be applied. No replacement routine interface has
been agreed; no hypothetical call was inserted. Exact before/after lines below
are identical because STOP means leave them unchanged.

### STOP: packages/db/src/practice-feed-repository.ts:82
Before (main):
```ts
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>transaction_timestamp())${writeCommandId ? " FOR SHARE" : ""}`,
```
After (left unchanged):
```ts
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>transaction_timestamp())${writeCommandId ? " FOR SHARE" : ""}`,
```

### STOP: packages/db/src/recovery-case-repository.ts:56
Before (main):
```ts
  const membership=await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>transaction_timestamp()) FOR SHARE`,[context.tenantId,member.membershipId,member.identityUserId]);
```
After (left unchanged):
```ts
  const membership=await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>transaction_timestamp()) FOR SHARE`,[context.tenantId,member.membershipId,member.identityUserId]);
```

### STOP: packages/db/src/recovery-case-repository.ts:77
Before (main):
```ts
   FOR SHARE`,[context.tenantId,reviewer.membershipId,reviewer.identityUserId]);
```
After (left unchanged):
```ts
   FOR SHARE`,[context.tenantId,reviewer.membershipId,reviewer.identityUserId]);
```

### STOP: packages/db/src/recovery-case-repository.ts:126
Before (main):
```ts
   FOR SHARE`,[context.tenantId,reviewer.membershipId,reviewer.identityUserId]);
```
After (left unchanged):
```ts
   FOR SHARE`,[context.tenantId,reviewer.membershipId,reviewer.identityUserId]);
```

### STOP: packages/db/src/recovery-eligibility-v3-repository.ts:23
Before (main):
```ts
    WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()) FOR SHARE OF m`,[context.tenantId,actor.membershipId,actor.identityUserId,sessionDigest]);
```
After (left unchanged):
```ts
    WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()) FOR SHARE OF m`,[context.tenantId,actor.membershipId,actor.identityUserId,sessionDigest]);
```

### STOP: packages/db/src/recovery-allocation-repository.ts:115
Before (main):
```ts
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE OF m`,
```
After (left unchanged):
```ts
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE OF m`,
```

### STOP: packages/db/src/recovery-payment-payer-repository.ts:20
Before (main):
```ts
    AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()) FOR SHARE OF m`, [context.tenantId, actor.membershipId, actor.identityUserId, sessionDigest]);
```
After (left unchanged):
```ts
    AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()) FOR SHARE OF m`, [context.tenantId, actor.membershipId, actor.identityUserId, sessionDigest]);
```

### STOP: packages/db/src/recovery-message-repository.ts:367
Before (main):
```ts
      `SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`,
```
After (left unchanged):
```ts
      `SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`,
```

### STOP: packages/db/src/recovery-follow-up-repository.ts:351
Before (main):
```ts
      `SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`, [tenantId, actor.membershipId]);
```
After (left unchanged):
```ts
      `SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`, [tenantId, actor.membershipId]);
```

### STOP: packages/db/test/recovery-insurer-money.integration.test.ts:42
Before (main):
```ts
    WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()) FOR SHARE OF m`,[context.tenantId,actor.membershipId,actor.identityUserId,sessionDigest]);
```
After (left unchanged):
```ts
    WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()) FOR SHARE OF m`,[context.tenantId,actor.membershipId,actor.identityUserId,sessionDigest]);
```



## Tests first and acceptance coverage

Both new test files were written before SQL/registration/document implementation.
Database failing-first attempts are **NOT RUN (cannot start PostgreSQL here)**,
as directed; no behavioral regression has been empirically reproduced here.

The supplementary own-SQL source assertion was run before migration creation:
exit 1, **1 failed / 3 filtered**, with ENOENT for the new SQL file. After
implementation the same assertion passed: exit 0, **1 passed / 3 filtered**.
That is a source assertion, not a PostgreSQL guarantee or independent review.

| ID | Test and current evidence |
| --- | --- |
| MIGFIX-1-1 | `runtime cannot promote or reactivate memberships`: explicitly **HELD** new test (`it.skip` with its reason). It contains real-runtime role/expiry/revocation UPDATE refusals, exact row preservation and continued context/invitation refusal. Not a passed criterion; no existing mandatory test made optional. |
| MIGFIX-1-2 | Ordinary persisted owner session, SSO off; revocation through `ContractorRepository.command`; empty `IdentityApplication.session` memberships, context/invitation `TENANT_FORBIDDEN`, direct identity SQL `42501`, zero added invitations/security events. NOT RUN. |
| MIGFIX-1-3 | Real runtime repository transaction held immediately before COMMIT; invitation started on an identity login; `pg_blocking_pids` proves blocking on the uncommitted revocation, commit released, then `42501` and no invitation/security event. No ORM double. NOT RUN. |
| MIGFIX-1-3b | Invitation committed before revocation keeps its exact immutable stored artifact; subsequent invitation refused. NOT RUN. |
| MIGFIX-1-4 | Direct ordinary lookup and SSO membership wrapper exclude revoked membership; shared-user membership in a second tenant and unrelated owner remain available; SSO invitation wrapper refuses the revoked tenant. NOT RUN. |
| MIGFIX-1-5 | Fresh verified invitation creates finance replacement and repoints locator without reactivating/changing the original membership or revocation. NOT RUN. |
| MIGFIX-1-U1 | Populated preceding schema; snapshot; apply N alone as migration role; compare catalog and function attributes at N only, exactly three changed definitions; migrate later entries twice. Existing named columns/full types/PK identities/canonical text and microseconds preserved. NOT RUN. |
| MIGFIX-1-U1 controls | Same comparison rejects one-microsecond time change, pre-existing varchar retype and changed row identity; accepts later nullable column, function replacement and inserted row. Controls rolled back; every compared table must have a pre-existing row. NOT RUN. |
| MIGFIX-1-U2 | Actual owner, FORCE RLS, identity-only routine EXECUTE and identity schema restrictions. NOT RUN. |
| MIGFIX-1-U3 | Separate fresh database, complete installation and repeated migrator, installed repaired routine bodies. NOT RUN. |
| MIGFIX-1-S1 | Supplementary own-migration source gate. Executed fail then pass, as above. |

The integration file has 5 active database tests and 1 explicit HELD test.
The upgrade file has 3 active database tests plus the one executed source
assertion. No unchanged shared file is pinned by these new tests. The catalog
comparison uses a runtime-captured preceding catalog at N's own step only;
later column/routine/row additions are permitted. Shared proof helpers are
reused unchanged. Own DB files are auto-discovered by the mandatory CI
`pnpm test` database package suite.

## Actual verification

Node: **v24.17.0** (installed), pnpm: **10.28.1** (locally cached), Turbo:
**2.10.12**, Vitest: **4.1.11**, embedded PostgreSQL dependency: **16.10.0-beta.15**.
No install or package download was performed; this is not clean-install evidence.
The default pnpm 11.8 launcher stalled and was interrupted. A temporary pnpm
shim in `/private/tmp/jg-migfix-1-pnpm-x00y9ou4` invokes the already cached pinned executable
at `~/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Every pnpm command
starts by exporting the issued pnpm path; the shim is then prepended so child
build processes also use the pinned local version.

Before heavy checks, observed free memory was 79–81%, and free disk remained
38 GB, above the issued 35% / 35 GB stops. No build and test ran together;
only this piece's filtered test file ran, with `--maxWorkers=2`, through
`heavy-slot`. No package/repository test sweep was run.

| Command/check | Exit and counts |
| --- | --- |
| `pnpm exec turbo run typecheck --force` | 0; 7/7 package tasks successful, **0 cached**. |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0; 7/7 package tasks successful, **0 cached**. This is package lint, not root lane lint. |
| `pnpm build --concurrency=2 --force` | 0; 7/7 package tasks successful, **0 cached**; Next generated 31 static pages. Existing workspace-root/CSS/cache warnings. |
| New-test strict TypeScript command in appendix | 0 on both runs; checks both new files and their imports. Second run checks the final race promise handling. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 1; core purity passed (158 files), then lane guard refused HEAD==base. Root lint is **not passed**. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; `tools/agent-lane-boundary-lint.mjs:212`: “Missing branch or self-comparison range; refusing a misleading pass.” Left unchanged; dispatcher reruns on its committed head. |
| `node tools/money-arithmetic-lint.mjs` | 0. |
| `node tools/commercial-boundary-lint.mjs` | 0. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; actual generated OpenAPI equals committed JSON. Invokes the same check program without the tsx CLI IPC listener. Root `pnpm openapi:check` CLI was not invoked. |
| Source test before migration | 1; 1 failed, 3 filtered. |
| Source test after migration | 0; 1 passed, 3 filtered. |
| `git diff --check` | 0. |
| Supplemental working-tree lane inventory | 0; 7 changed/untracked paths all allowed, old lane entries unchanged, own migration registration only. Not a lane-lint pass. |
| PostgreSQL integration and upgrade files | **NOT RUN (cannot start PostgreSQL here)**, 0 executed database assertions. |
| Browser journeys / `pnpm test:e2e` | **NOT RUN (cannot start a browser here)**. |
| Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations` | **NOT RUN locally** under the dispatcher's file/memory limits; dispatcher/CI owns whole suites. |
| AI `pnpm eval` / live-model evaluation | Inapplicable: no prompt, model, extraction parser or AI behavior changed. |

Permission-limited observation commands were stopped and not retried through
another observation route. The exact attempted process-list command was
`ps -axo pid,ppid,command | rg 'pnpm|93936' | head -25`, which emitted
`zsh:1: operation not permitted: ps`. The heavy-slot invocations emitted:

```text
sysctl: sysctl fmt -1 1024 1: Operation not permitted
sysmon request failed with error: sysmond service not found
pgrep: Cannot get process list
```

The gate itself proceeded to run the one source assertion; its actual test
exits are recorded above. No alternate process/monitoring route was attempted.
Turbo emitted `WARNING IO error: Operation not permitted (os error 1)`
for shared-cache I/O, but executed each forced task; 0 cache hits were reported.
No sandbox escalation or automatic-approval rejection was requested.

One preliminary direct test command used a wrong relative executable path and
exited 127; corrected through the prescribed heavy-slot route before the
failing-first source run. Missing optional inspection paths are recorded in
the command ledger; none is presented as verification.

## Migration, grants and compatibility

**Every new migration GRANT: NONE (0).** Standard F: no new direct INSERT,
UPDATE or DELETE grant to `jobguard_runtime` on money, membership,
authorization, receipt or audit data; no new runtime privilege or definer
entrypoint. Fixture-only SQL grants `jobguard_identity` to a non-superuser
test login, not to business runtime. Existing FORCE RLS and migration ownership
are untouched. Routine replacement preserves existing narrow identity EXECUTE.

Migration performs no data rewrite/backfill, history deletion or schema-column
change. Eight-digit codes, ten-minute expiry, five attempts, sixty-second resend
spacing, role allowlist, signup owner, invitation-recorded role, SSO/emergency
exceptions and existing `42501` refusals are unchanged. Corrected behavior
removes a revoked tenant from ordinary membership responses; callers cannot
treat a previously cached membership as current invitation authority.

Rollback/forward fix: apply a new reviewed CREATE OR REPLACE migration preserving
the same contracts. There is no data rollback to perform. Restoring the previous
definitions would reopen the revocation gap and is not an operational fix.
Direct runtime UPDATE remains an explicitly unresolved prerequisite; no existing
successful lock path was removed to make this partial piece pass.

## Builder self-review (source-inspected only)

Checked the diff for standard F grants, current-main ownership/EXECUTE,
tenant-qualified revocation predicates, the matching seed-54 serialization
point, active invitation reuse/history, typed existing authorization refusal,
zero migration data writes, shared-file additive registration and catalog
proof shape. The race test attaches promise outcomes immediately and uses
PostgreSQL blocking introspection; it does not use elapsed time as the race
ordering proof. Canonical row comparison remains driver-unparsed and keyed
by original primary identities; positive and negative controls use the same
comparison implementation.

No independent model review, real-PostgreSQL proof, browser verification,
professional sign-off, technical acceptance or release approval is claimed.
Partial acceptance must remain partial. RED verdict(s) on the dispatcher's exact
commit, separate acceptance and full mandatory CI are pending. D04/live-user
and all existing release gates remain unchanged. LATER UI: none added.

## Change isolation evidence

Protected/shared dependency hashes and changed-file hashes (receipt excludes
its own self-referential hash):

```text
apps/api/src/auth/context-boundary.test.ts a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 UNCHANGED
packages/core/src/watchdog.ts 1628a2c3dc2d24cdb20c11ded7461a9206af9e71f918bff571ba51e66cf9aaf7 UNCHANGED
packages/db/test/watchdog-command-harness.ts 3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 UNCHANGED
packages/db/test/command-replay-contract.integration.test.ts db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f UNCHANGED
packages/db/src/practice-feed-repository.ts c7f077b9ce8782bc5c63da3715bee6cb07d5aeb28d531db01d363510de214283 UNCHANGED
packages/db/src/recovery-case-repository.ts ed507dc76814d92944e6e810d90992276197e8b30e72235f8fb34f87c7733d7a UNCHANGED
packages/db/src/recovery-eligibility-v3-repository.ts ab6374d12d4083460066b9b3ad4452636c8dda2789b7020b1049ccef1edd800f UNCHANGED
packages/db/test/recovery-insurer-money.integration.test.ts 837ea4b89d6ce58de4f71c75b80fba61424e1ada32b9b1c2357dc849a2f47003 UNCHANGED
Lane registration: own additive entry only
Migration registration: own additive entry only
Working-tree paths: 7 all in own lane (supplementary inventory, not lane-lint acceptance)
Changed-file SHA256 config/agent-lane-assignments.json fd60434c2ea692bf0891722dd4515b67d80aa83ead1c78f1cae5b8c5d6525d02
Changed-file SHA256 docs/contracts/authentication-v1.md d6f4d22a74c5fdde059d8aabd35e55f4bed003fd808e91a7ff8957d78c4520a4
Changed-file SHA256 packages/db/migrations/0150_membership_authority_fix.sql 5de215c87b0997af3134b847c4e0f3fda31713b7a8b2e09d7ea601bbad1cb5b7
Changed-file SHA256 packages/db/src/migrate.ts f2402956b3cc415b518ef4208c0dcfc4f2c66126682a0b48d80855c59d3885c4
Changed-file SHA256 packages/db/test/migfix-1-upgrade.integration.test.ts 3db6e68eb853f9a34c1af00ddf1a3af28654aaf22adfe5a3b44af8d52563d19b
Changed-file SHA256 packages/db/test/migfix-1.integration.test.ts e0c3749ae4f48732b94a0356e9022c495fde1e4868f830253fde6cf3ecd8d318

```

`git diff --stat` cannot include new untracked files before the dispatcher
stages them. The supplemental no-index stats below use only read-only git;
exit 1 means the new file differs from /dev/null.

```text
git diff --no-index --stat /dev/null packages/db/migrations/0150_membership_authority_fix.sql => 1
.../migrations/0150_membership_authority_fix.sql   | 103 +++++++++++++++++++++
 1 file changed, 103 insertions(+)
git diff --no-index --stat /dev/null packages/db/test/migfix-1.integration.test.ts => 1
.../db/test/migfix-1.integration.test.ts           | 157 +++++++++++++++++++++
 1 file changed, 157 insertions(+)
git diff --no-index --stat /dev/null packages/db/test/migfix-1-upgrade.integration.test.ts => 1
.../db/test/migfix-1-upgrade.integration.test.ts   | 127 +++++++++++++++++++++
 1 file changed, 127 insertions(+)
Final tracked stat:
config/agent-lane-assignments.json  |  1 +
 docs/contracts/authentication-v1.md | 25 +++++++++++++++++++++++++
 packages/db/src/migrate.ts          |  1 +
 3 files changed, 27 insertions(+)
packages/db/migrations/0150_membership_authority_fix.sql 5de215c87b0997af3134b847c4e0f3fda31713b7a8b2e09d7ea601bbad1cb5b7
packages/db/test/migfix-1.integration.test.ts e0c3749ae4f48732b94a0356e9022c495fde1e4868f830253fde6cf3ecd8d318
packages/db/test/migfix-1-upgrade.integration.test.ts 3db6e68eb853f9a34c1af00ddf1a3af28654aaf22adfe5a3b44af8d52563d19b
HEAD bd959b01e857de0ba7cbd3588bab84add7d0f493

```

Receipt finalization is the seventh lane file. No existing merged test,
protected context-boundary file, earlier migration, watchdog shared harness,
pin or fingerprint changed. Final HEAD remains
**bd959b01e857de0ba7cbd3588bab84add7d0f493**. The dispatcher creates the actual
reviewable commit and reruns lint on that head.

## Command ledger

Commands are logged exactly as submitted; compound inspections have the shell's
final exit code, with notable intermediate errors called out above. Polling
entries record process completion separately. Inspection/hash commands carry
no assertion count; all check/task/test counts are in the verification table.
File edits used apply_patch and the logged migration generator; final receipt
writing adds only this evidence document and makes no git write.

Final post-receipt command (exit 0; 7 lane paths, no trailing whitespace,
message file present; final unchanged HEAD verified):

```sh
git diff --check; git status --short; git rev-parse HEAD; python3 - <<'PY'
from pathlib import Path
import json,hashlib,subprocess
policy=json.loads(Path('config/agent-lane-assignments.json').read_text())['lanes']['migfix-1']
files=subprocess.check_output(['git','diff','--name-only']).decode().splitlines()+subprocess.check_output(['git','ls-files','--others','--exclude-standard']).decode().splitlines()
assert set(files)==set(policy['allow'])
for p in files:
    for n,line in enumerate(Path(p).read_text().splitlines(),1):
        assert line==line.rstrip(),f'{p}:{n}: trailing whitespace'
print('Final lane inventory: 7 files; no trailing whitespace')
print('Receipt SHA256',hashlib.sha256(Path(policy['receipt']).read_bytes()).hexdigest())
print('Intended commit message exists:',Path('/private/tmp/jg-msg-migfix-1.txt').is_file())
PY
```

Command 1 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
pwd; git status --short; git branch --show-current; git rev-parse HEAD; git rev-parse origin/main; cat AGENTS.md
```

Command 2 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat config/agent-lane-assignments.json; cat package.json; rg -n 'current_memberships|invite_member|provision_verified_challenge|contractor_membership_revocation|membership.*UPDATE|UPDATE.*membership' packages/db/migrations packages/db/src; rg -n 'identity|membership|migration|M0' BUILD_PLAN.md | head -90
```

Command 3 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg --files /Users/benharwood/Library/pnpm /Users/benharwood/.cache/node/corepack /opt/homebrew/lib/node_modules 2>/dev/null | rg '(10\.28\.1|pnpm\.cjs$|bin/pnpm$)' | head -25
```

Command 4 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat package.json; cat packages/db/package.json; cat config/agent-lane-assignments.json
```

Command 5 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat docs/contracts/authentication-v1.md; sed -n '2640,2657p' BUILD_PLAN.md; sed -n '727,752p' BUILD_PLAN.md; cat ~/.local/share/full-steam/handoffs/jobguard-task.md
```

Command 6 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg -n 'current_memberships|invite_member|provision_verified_challenge|contractor_membership_revocation|revoke_membership' packages/db/migrations/*.sql
```

Command 7 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat packages/db/src/migrate.ts; cat packages/db/test/recovery-follow-up-upgrade.integration.test.ts
```

Command 8 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg -n 'current_memberships|invite_member|provision_verified_challenge|contractor_membership_revocation|revoke_membership' packages/db/migrations/*.sql
```

Command 9 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat docs/contracts/authentication-v1.md; cat ~/.local/share/full-steam/handoffs/jobguard-task.md
```

Command 10 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat packages/db/test/identity.integration.test.ts
```

Command 11 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat packages/db/src/identity-repository.ts; cat apps/api/src/auth/identity.application.ts; cat packages/db/src/contractor-repository.ts
```

Command 12 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat packages/db/migrations/0111_persisted_identity.sql
```

Command 13 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '115,210p' packages/db/migrations/0138_practice_session_hardening.sql; sed -n '50,125p' packages/db/migrations/0129_sso_required.sql; cat packages/db/test/test-database.ts; sed -n '1,100p' packages/db/test/identity.integration.test.ts
```

Command 14 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '1,160p' packages/db/test/enterprise-identity-upgrade.integration.test.ts; sed -n '1,140p' packages/db/src/migrate.ts; cat .github/workflows/ci.yml | head -180
```

Command 15 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '1,125p' packages/db/migrations/0000_tenancy.sql; sed -n '50,96p' packages/db/migrations/0054_contractor_organisation.sql; sed -n '65,119p' packages/db/migrations/0129_sso_required.sql
```

Command 16 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg -n 'UPDATE app.membership|update\(membership\)|SET ROLE jobguard_runtime|membership.*UPDATE' packages/db/test apps/api/src tools; cat packages/db/test/pool-test-utils.ts; cat packages/db/test/lock-observer.ts
```

Command 17 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '1,190p' packages/db/test/practice-session-hardening-upgrade.integration.test.ts; sed -n '1,95p' packages/db/test/contractor.integration.test.ts; cat packages/db/tsconfig.json; cat apps/api/src/auth/persisted-auth-provider.ts | tail -100
```

Command 18 (workspace): exit 130 (process 95175; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
memory_pressure | tail -1; df -g /System/Volumes/Data; node --version; export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version; sed -n '1,125p' tools/agent-lane-boundary-lint.mjs
```

Command 19 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg --files packages/db/test | rg 'upgrade|lock-observer|pool-test'; rg -n 'UPDATE app.membership' packages/db/test/commands.integration.test.ts packages/db/test/contractor.integration.test.ts packages/db/test/tenancy.integration.test.ts packages/db/test/identity.integration.test.ts; cat packages/db/test/lock-observer.ts; sed -n '1,110p' tools/agent-lane-boundary-lint.mjs
```

Command 20 (workspace): exit 1; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '1,160p' packages/db/test/scim-deactivation-upgrade.integration.test.ts; sed -n '1,130p' packages/db/test/pool-test-utils.ts; rg -n 'UPDATE|DELETE|INSERT' packages/db/test/tenancy.integration.test.ts | head -30; rg -n 'membership' packages/db/migrations/0003_job_spine.sql
```

Command 21 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
ls -l /Users/benharwood/Library/pnpm/bin; which pnpm; cat packages/db/test/upgrade-proof-utils.ts
```

Command 22 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg -n -C 2 'UPDATE app.membership' packages/db/test | head -160; sed -n '1,100p' packages/db/test/contractor-practice-session-upgrade.integration.test.ts; rg --files -g 'AGENTS.md'
```

Command 23 (workspace): exit 1; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat /Users/benharwood/Library/pnpm/bin/pnpm; ls -l node_modules/.bin/pnpm node_modules/.bin/vitest node_modules/.bin/turbo; rg -n 'runtime|UPDATE app.membership' packages/db/test/proof-replay.integration.test.ts; sed -n '1,80p' packages/db/test/proof-replay.integration.test.ts; rg -n 'role.*owner|UPDATE' packages/db/src/commands.ts; cat .npmrc
```

Command 24 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg -n 'UPDATE app.membership' packages/db/src apps/api/src; rg -n 'membership.*UPDATE|UPDATE.*membership|membership.*privilege' packages/db/test/tenancy.integration.test.ts tools/*.mjs; sed -n '165,190p' packages/db/migrations/0138_practice_session_hardening.sql
```

Command 25 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '45,94p' packages/db/src/commands.ts; rg -n 'membership.*FOR (SHARE|UPDATE|KEY SHARE)|FOR (SHARE|UPDATE|KEY SHARE).*membership' packages/db/src packages/db/test; sed -n '65,95p' packages/db/test/commands.integration.test.ts; rg -n 'packageManagerStrict|managePackageManagerVersions' /Users/benharwood/Library/pnpm/global/v11/15f13-19ef2fdabb2/node_modules/@pnpm -g '*.json' | head
```

Command 26 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
ls /Users/benharwood/Library/pnpm/.tools/pnpm; ls /Users/benharwood/Library/pnpm/global/v11; sed -n '1,55p' packages/db/test/contractor-practice-session-fixtures.ts; cat packages/db/vitest.config.ts
```

Command 27 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '1,95p' packages/db/test/extra-fixtures.ts; cat /Users/benharwood/Library/pnpm/global/v11/933b1afb8467659abb23695dcb8cd7f3bad564cb27bb5c6843b75f41ac97b974/node_modules/@pnpm/exe/package.json; ls /Users/benharwood/.local/share/pnpm/.tools/pnpm /Users/benharwood/Library/Caches/node/corepack 2>/dev/null; sed -n '68,86p' packages/db/src/practice-feed-repository.ts; nl -ba packages/db/src/recovery-case-repository.ts | sed -n '52,80p'
```

Command 28 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '1,100p' packages/db/test/enterprise-identity.integration.test.ts; rg -n 'sso_session_binding|sso_required_event|sso_subject' packages/db/migrations/0120_enterprise_identity.sql packages/db/migrations/0129_sso_required.sql | head -40; cat tools/lint.mjs | head -45
```

Command 29 (workspace): exit 130 (process 93936; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; npm_config_manage_package_manager_versions=false npm_config_package_manager_strict=false pnpm --version
```

Command 30 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
ps -axo pid,ppid,command | rg 'pnpm|93936' | head -25; ls -l /opt/homebrew/bin/pnpm /usr/local/bin/pnpm /Users/benharwood/Library/pnpm/global/v11/933b1afb8467659abb23695dcb8cd7f3bad564cb27bb5c6843b75f41ac97b974/node_modules/.bin/pnpm 2>/dev/null; ls -l packages/db/node_modules/.bin/vitest; memory_pressure | tail -1; df -g /System/Volumes/Data
```

Command 31 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat /Users/benharwood/Library/pnpm/global/v11/933b1afb8467659abb23695dcb8cd7f3bad564cb27bb5c6843b75f41ac97b974/node_modules/.bin/pnpm; cat /Users/benharwood/Library/pnpm/global/v11/933b1afb8467659abb23695dcb8cd7f3bad564cb27bb5c6843b75f41ac97b974/node_modules/pnpm/package.json | head -15; cat packages/db/node_modules/.bin/vitest | tail -8; cat ~/.config/pnpm/rc 2>/dev/null; cat pnpm-workspace.yaml | head -40
```

Command 32 (packages/db): exit 127; counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; packages/db/node_modules/.bin/vitest run --maxWorkers=2 test/migfix-1-upgrade.integration.test.ts -t 'MIGFIX-1-S1'
```

Command 33 (packages/db): exit 1 (process 25651; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; ~/.local/bin/heavy-slot migfix-1-source node_modules/.bin/vitest run --maxWorkers=2 test/migfix-1-upgrade.integration.test.ts -t 'MIGFIX-1-S1'
```

Command 34 (workspace): exit 1; counts in the verification table.

```sh
poll heavy-slot migfix-1-source
```

Command 35 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
python3 - <<'PY'
from pathlib import Path
source=Path('packages/db/migrations/0111_persisted_identity.sql').read_text()
functions=[]
for name in ['provision_verified_challenge','current_memberships','invite_member']:
    start=source.index('CREATE FUNCTION identity.'+name+'(')
    end=source.index('END $$;',start)+len('END $$;')
    body=source[start:end].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
    if name=='provision_verified_challenge':
        body=body.replace(" IF c.purpose='invitation' THEN\n  SELECT * INTO i", " IF c.purpose='invitation' THEN\n  -- Match the contractor command lock before checking membership reuse.\n  SELECT tenant_id INTO t FROM identity.invitation WHERE id=c.invitation_id AND email=c.email;\n  IF t IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54)); END IF;\n  SELECT * INTO i",1)
        body=body.replace("    AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;", "    AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp())\n    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r\n     WHERE r.tenant_id=l.tenant_id AND r.membership_id=l.membership_id) FOR SHARE;",1)
    elif name=='current_memberships':
        body=body.replace("   AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp());", "   AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())\n   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r\n    WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id);")
    else:
        body=body.replace(" PERFORM set_config('app.tenant_id',t::text,true);", " -- Contractor revocation owns this same tenant key (seed 54). Take it before the authority read.\n PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));\n PERFORM set_config('app.tenant_id',t::text,true);",1)
        body=body.replace(" SELECT account_id INTO a FROM app.membership WHERE tenant_id=t AND identity_user_id=s.user_id", " SELECT m.account_id INTO a FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=s.user_id")
        body=body.replace("  AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;", "  AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())\n  AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r\n   WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id) FOR SHARE OF m;")
    functions.append(body)
header="""BEGIN;
-- MIGFIX-1 partial: contractor revocation is an inactive-membership fact on every identity path.
-- CREATE OR REPLACE retains the existing signatures, owners, EXECUTE ACLs and definer settings.
-- No grants or business rows change. Membership history is never reactivated or normalized.
-- HELD [MIGFIX-1-1]: runtime UPDATE revocation needs coordinator-owned replacement of existing
-- runtime FOR SHARE membership locks; PostgreSQL requires UPDATE for those locks. Do not add
-- a direct write grant or weaken those checks to make the privilege removal possible here.

"""
Path('packages/db/migrations/0150_membership_authority_fix.sql').write_text(header+'\n\n'.join(functions)+'\nCOMMIT;\n')
PY
```

Command 36 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '1,58p' packages/db/migrations/0120_enterprise_identity.sql; sed -n '1,32p' packages/db/migrations/0129_sso_required.sql; rg -n 'security_event|immutable' packages/db/migrations/0111_persisted_identity.sql; cat packages/db/migrations/0150_membership_authority_fix.sql
```

Command 37 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs --version; memory_pressure | tail -1; df -g /System/Volumes/Data
```

Command 38 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
python3 - <<'PY'
from pathlib import Path
import tempfile
p=Path(tempfile.mkdtemp(prefix='jg-migfix-1-pnpm-',dir='/private/tmp'))
shim=p/'pnpm'
shim.write_text('#!/bin/sh\nexec node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs "$@"\n')
shim.chmod(0o755)
print(p)
PY
```

Command 39 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg -n -B 3 -A 3 'FOR SHARE' packages/db/src/practice-feed-repository.ts packages/db/src/recovery-case-repository.ts packages/db/src/recovery-eligibility-v3-repository.ts packages/db/src/quote-delivery-repository.ts packages/db/src/variation-repository.ts; nl -ba packages/db/test/recovery-insurer-money.integration.test.ts | sed -n '33,45p'; cat tsconfig.json; git diff --check; git diff --stat; git status --short
```

Command 40 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
memory_pressure | tail -1; df -g /System/Volumes/Data
```

Command 41 (workspace): exit 0 (process 91386; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-migfix-1-pnpm-x00y9ou4:$PATH"; ~/.local/bin/heavy-slot migfix-1-source pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/migfix-1-upgrade.integration.test.ts -t 'MIGFIX-1-S1'
```

Command 42 (workspace): exit 0; counts in the verification table.

```sh
poll heavy-slot migfix-1-source after migration
```

Command 43 (workspace): exit 0 (process 74323; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-migfix-1-pnpm-x00y9ou4:$PATH"; pnpm exec tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/migfix-1.integration.test.ts packages/db/test/migfix-1-upgrade.integration.test.ts
```

Command 44 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
poll new test TypeScript check
```

Command 45 (workspace): exit 0 (process 5780; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-migfix-1-pnpm-x00y9ou4:$PATH"; pnpm exec turbo run typecheck --force
```

Command 46 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat /Users/benharwood/Claude/Projects/my-new-project/.worktrees/fixlater-1/docs/verdicts/AUDIT-FIX-API-AUTH/BUILDER_RECEIPT.md; rg --files docs /Users/benharwood/.local/share/full-steam/jg-orders | rg 'mig-0000-0003\.md$'; rg -n 'membership.*FOR SHARE|FROM app.membership|FOR SHARE' packages/db/src/variation-repository.ts; git diff --check
```

Command 47 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
poll forced typecheck
```

Command 48 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg --files /Users/benharwood/.local/share/full-steam | rg 'mig-0000-0003\.md$'; git rev-parse HEAD; git rev-parse origin/main; memory_pressure | tail -1; df -g /System/Volumes/Data
```

Command 49 (workspace): exit 0 (process 45796; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-migfix-1-pnpm-x00y9ou4:$PATH"; LANE_BASE_REF=origin/main pnpm exec turbo run lint --force
```

Command 50 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
cat /Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0000-0003.md; cat apps/api/src/generate-openapi.ts; rg -n 'openapi:check' apps/api/package.json
```

Command 51 (workspace): exit 1; counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; LANE_BASE_REF=origin/main node tools/lint.mjs
```

Command 52 (workspace): exit 1; counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-migfix-1-pnpm-x00y9ou4:$PATH"; LANE_BASE_REF=origin/main pnpm lint:lanes
```

Command 53 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
poll forced package lint
```

Command 54 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
node tools/money-arithmetic-lint.mjs; node tools/commercial-boundary-lint.mjs; memory_pressure | tail -1; df -g /System/Volumes/Data
```

Command 55 (workspace): exit 0 (process 64064; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-migfix-1-pnpm-x00y9ou4:$PATH"; pnpm build --concurrency=2 --force
```

Command 56 (workspace): exit 0 (process 64064; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
poll forced build
```

Command 57 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
python3 - <<'PY'
from pathlib import Path
import hashlib,json,subprocess
paths=['apps/api/src/auth/context-boundary.test.ts','packages/core/src/watchdog.ts','packages/db/test/watchdog-command-harness.ts','packages/db/test/command-replay-contract.integration.test.ts','packages/db/src/practice-feed-repository.ts','packages/db/src/recovery-case-repository.ts','packages/db/src/recovery-eligibility-v3-repository.ts','packages/db/test/recovery-insurer-money.integration.test.ts']
for p in paths:
    baseline=subprocess.check_output(['git','show','origin/main:'+p])
    actual=Path(p).read_bytes()
    print(p,hashlib.sha256(actual).hexdigest(),'UNCHANGED' if actual==baseline else 'CHANGED')
old=json.loads(subprocess.check_output(['git','show','origin/main:config/agent-lane-assignments.json']))
new=json.loads(Path('config/agent-lane-assignments.json').read_text())
assert {k:v for k,v in new['lanes'].items() if k!='migfix-1'}==old['lanes']
assert set(new['lanes'])-set(old['lanes'])=={'migfix-1'}
print('Lane registration: own additive entry only')
old_migrate=subprocess.check_output(['git','show','origin/main:packages/db/src/migrate.ts']).decode()
new_migrate=Path('packages/db/src/migrate.ts').read_text()
line='  new URL("../migrations/0150_membership_authority_fix.sql", import.meta.url),\n'
assert new_migrate.replace(line,'',1)==old_migrate
print('Migration registration: own additive entry only')
modified=subprocess.check_output(['git','diff','--name-only']).decode().splitlines()
untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard']).decode().splitlines()
allow=set(new['lanes']['migfix-1']['allow'])
assert set(modified+untracked)<=allow
print('Working-tree paths:',len(modified+untracked),'all in own lane (supplementary inventory, not lane-lint acceptance)')
for p in sorted(modified+untracked):
    if not p.endswith('BUILDER_RECEIPT.md'):
        print('Changed-file SHA256',p,hashlib.sha256(Path(p).read_bytes()).hexdigest())
PY
```

Command 58 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '82,136p' BUILD_PLAN.md; sed -n '315,324p' BUILD_PLAN.md; sed -n '1048,1095p' BUILD_PLAN.md; sed -n '2643,2654p' BUILD_PLAN.md; nl -ba packages/db/migrations/0000_tenancy.sql | sed -n '79,86p'; nl -ba packages/db/migrations/0111_persisted_identity.sql | sed -n '93,108p;131,158p'; nl -ba packages/db/migrations/0138_practice_session_hardening.sql | sed -n '136,143p;191,197p'; rg -n 'memberships\(|sessionScope\(' apps/api/src/auth/persisted-auth-provider.ts packages/db/src/identity-repository.ts
```

Command 59 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
memory_pressure | tail -1; df -g /System/Volumes/Data
```

Command 60 (workspace): exit 0 (process 64064; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
poll forced build
```

Command 61 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
poll forced build
```

Command 62 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
python3 - <<'PY'
from pathlib import Path
Path('/private/tmp/jg-msg-migfix-1.txt').write_text('fix(db): honor contractor revocation in identity membership paths\n\nReplace the installed identity membership lookup, invitation authorization and\nverified-invitation reuse routines in migration 0150. Serialize invitation\nauthority and replacement provisioning with the existing contractor tenant lock.\nPreserve membership history, routine owners, signatures, grants and FORCE RLS.\n\nAdd persisted-session, race, tenant and own-step upgrade regressions and the\nMIGFIX-1 run receipt. No migration GRANT or existing test changes.\n\nPartial: runtime membership UPDATE removal is HELD until the coordinator issues\nguarded replacements for the existing runtime FOR SHARE membership queries,\nincluding the merged recovery-insurer-money test fixture. PostgreSQL/browser\nproofs and independent RED review remain pending; no acceptance is claimed.\n')
PY
```

Command 63 (workspace): exit 0 (process 9857; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-migfix-1-pnpm-x00y9ou4:$PATH"; pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check
```

Command 64 (workspace): exit 0 (process 15181; final exit recorded on completion); counts not applicable for inspection/polling; validation counts in the table.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-migfix-1-pnpm-x00y9ou4:$PATH"; pnpm exec tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/migfix-1.integration.test.ts packages/db/test/migfix-1-upgrade.integration.test.ts
```

Command 65 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '38,110p' packages/db/migrations/0138_practice_session_hardening.sql; rg -n 'self-comparison|Missing branch' tools/agent-lane-boundary-lint.mjs; git diff --stat; git diff --check; memory_pressure | tail -1; df -g /System/Volumes/Data
```

Command 66 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
poll OpenAPI check
```

Command 67 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
poll final new test TypeScript check
```

Command 68 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '24,38p' packages/db/migrations/0138_practice_session_hardening.sql; git diff -- packages/db/src/migrate.ts config/agent-lane-assignments.json docs/contracts/authentication-v1.md; git status --short
```

Command 69 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
sed -n '1,25p' packages/db/migrations/0138_practice_session_hardening.sql; rg -n 'FROM app.membership|FOR SHARE' packages/db/src/quote-delivery-repository.ts; nl -ba packages/db/src/practice-feed-repository.ts | sed -n '79,84p'; nl -ba packages/db/src/recovery-eligibility-v3-repository.ts | sed -n '20,24p'
```

Command 70 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg -n -A 3 -B 1 'FROM app.membership' packages/db/src | rg 'FOR SHARE|^packages/db/src/[a-z-]+\.ts[:-][0-9]+.*SELECT.*membership' | head -75
```

Command 71 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
rg -n 'FOR SHARE' packages/db/src | rg -v '//|/\*'; nl -ba packages/db/src/recovery-allocation-repository.ts | sed -n '110,117p'; nl -ba packages/db/src/recovery-payment-payer-repository.ts | sed -n '15,22p'; nl -ba packages/db/src/recovery-message-repository.ts | sed -n '364,370p'
```

Command 72 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
python3 - <<'PY'
from pathlib import Path
import subprocess,hashlib
paths=['packages/db/migrations/0150_membership_authority_fix.sql','packages/db/test/migfix-1.integration.test.ts','packages/db/test/migfix-1-upgrade.integration.test.ts']
for p in paths:
    r=subprocess.run(['git','diff','--no-index','--stat','/dev/null',p],capture_output=True,text=True)
    print('git diff --no-index --stat /dev/null '+p+' => '+str(r.returncode))
    print(r.stdout.strip())
print('Final tracked stat:')
print(subprocess.check_output(['git','diff','--stat']).decode().strip())
for p in ['packages/db/migrations/0150_membership_authority_fix.sql','packages/db/test/migfix-1.integration.test.ts','packages/db/test/migfix-1-upgrade.integration.test.ts']:
    print(p,hashlib.sha256(Path(p).read_bytes()).hexdigest())
print('HEAD',subprocess.check_output(['git','rev-parse','HEAD']).decode().strip())
PY
```

Command 73 (workspace): exit 0; counts not applicable for inspection/polling; validation counts in the table.

```sh
python3 - <<'PY'
from pathlib import Path
import subprocess
points=[('packages/db/src/practice-feed-repository.ts',82),('packages/db/src/recovery-case-repository.ts',56),('packages/db/src/recovery-case-repository.ts',77),('packages/db/src/recovery-case-repository.ts',126),('packages/db/src/recovery-eligibility-v3-repository.ts',23),('packages/db/src/recovery-allocation-repository.ts',115),('packages/db/src/recovery-payment-payer-repository.ts',20),('packages/db/src/recovery-message-repository.ts',367),('packages/db/src/recovery-follow-up-repository.ts',351),('packages/db/test/recovery-insurer-money.integration.test.ts',42)]
for file,line in points:
    before=subprocess.check_output(['git','show','origin/main:'+file]).decode().splitlines()[line-1]
    after=Path(file).read_text().splitlines()[line-1]
    assert before==after
    print(f'### STOP: {file}:{line}')
    print('Before (main):\n```ts\n'+before+'\n```')
    print('After (left unchanged):\n```ts\n'+after+'\n```\n')
PY
```
