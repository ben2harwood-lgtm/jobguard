# MON-5 M5-MESSAGE — builder receipt

RED: customer sessions, tenant isolation and hidden-data boundaries. Synthetic only.
Stacked on m5-signin / PR #423. This is implementation and local-test evidence,
not an independent review, merge, release or PostgreSQL/browser PASS.

Customer POST `/customer-portal/messages` and Next `/api/customer-portal/messages`
share the same strict versioned envelope, existing customer-session resolver and
persisted checked intake. Cookie, one-time link, session expiry and issuer policy
are unchanged. Both transports return a 201 receipt, private uniform 401, 409 for
conflict/not-live, and the existing 422 POST_LOCK_WORK_REQUIRES_LINKED_JOB refusal.
Malformed JSON uses the same private refusal. Both routes are live-only in the
existing registry; new writes enforce that in SV-7A after authorized replay.

0391 starts from 0303, the latest existing SV-7A writer body. It changes only the
source authority seam and exact candidate B fixture selection. No existing migration
is edited. New identity-only entrypoint customer_portal_message resolves/rechecks
the existing session in the same transaction and retains its job advisory lock;
it passes server-selected customer kind/name and exact text to SV-7A. The private
source helper permits a customer credential for customer_message only, leaving
CH-4 and all other commands unchanged. No source/evidence writes bypass SV-7A.
No new tables, provider calls, money, approval, detector scheduling, or shadow reads.

Compatibility: SV-7A requires actor_membership_id and exposes it as
actualTesterMembershipId. For this synthetic adapter it remains the grant issuer
(the responsible test sponsor), never a customer membership or claimed customer
identity. A separate identifier-only customer-session audit event binds the command,
customer, session and source. The session digest participates in the existing
request hash, so another session cannot replay this customer's command. Sponsor
revocation, current party binding and session expiry are rechecked by sign-in's
existing SQL resolver before history access and after lock waits. Owner/finance
issuers remain supported. No customer member principal or tenant context is minted.

Candidate B's exact exposed-wires fixture and decoder are reused from
91834b6f03b24d4f798cc61aaa3b081a91301e68. Unknown/edited text stays unclassified;
prices remain unknown and messages never approve anything. The ordinary message
list includes its immutable evidence ID, hash and version. The customer form
retries an unknown outcome with the same command ID. Hidden detector findings
are not part of the intake response or message list. Safety disclosure is handled
by the existing worker, with permanent fee ineligibility.

Checks: final executed commands/results are recorded below before handoff.
PostgreSQL, upgrade, LP-0/catalogue, tenant, SERIOUS-B5 and browser execution run
in GitHub CI: this sandbox cannot start PostgreSQL or bind localhost. New real-DB
tests cover exact originals, replay/conflict, revoked/foreign credentials, lock
refusal/history, unknown text, pre-lock non-disclosure, and candidate B's real
must-surface worker path. Existing SERIOUS-B5 routine expectations are extended
only by the exact two new routine identities; there are no table-list additions.
LP-0 records the new identity grant/helper and changed source seam. Existing
contractor-entitlement and tenant relation expectations remain unchanged because
there are no new relations or grants on tables. The source guard test verifies
both the old and replacement writer instead of assuming one definition forever.

Migration recovery: forward-fix only after integration. If this slice is withdrawn
before release, disable the message route, revoke its identity EXECUTE, and restore
the 0303 source-writer definition in a new migration; retain all originals,
receipts and audit history. Do not edit 0303/0391 or delete evidence.

Shared files requiring sibling MON-5 reconciliation: app.module, auth export,
portal sign-in page, OpenAPI, route registry and LP-0/upgrade expectation lists.
Union additions; preserve later definitions and sibling routes. The session/link
implementation itself is unchanged.

LATER / SIMPLICITY (initial source review, nonblocking): apps/api/src/app.module.ts
has one long shared registration expression. After the MON-5 slices land, group
customer controller/provider registration in the existing module structure so
future additions have one clear location and fewer merge conflicts. No refactor
is included in this slice.

## Executed local checks

All Vitest commands used the installed package binaries, `--maxWorkers=2`, and
at most three named files per run. No database or browser suite was started.

- In apps/api: `./node_modules/.bin/vitest run --maxWorkers=2 src/auth/customer-message.test.ts src/auth/customer-signin.test.ts src/watchdog-registry.test.ts` — PASS, 159 tests (final run).
- In packages/core: `./node_modules/.bin/vitest run --maxWorkers=2 src/job-source-intake.test.ts src/job-sources.test.ts src/watchdog.test.ts` — PASS, 23 tests.
- In packages/db: `./node_modules/.bin/vitest run --maxWorkers=2 src/customer-message-fixtures.test.ts` — PASS, 2 tests (final run).
- Root installed `tsc -p <package>/tsconfig.json --noEmit` for packages/db, apps/api and apps/web — PASS. The custom `/tmp/m5-message-integration-tsconfig.json` also typechecks the new real-DB test and its imports without executing PostgreSQL — PASS.
- Root installed `tsc -p ...` dependency builds for core, config, storage, db and ai — PASS; API TypeScript emission also passed. No full Next production build is claimed.
- In apps/api: `node --import tsx src/generate-openapi.ts --check` — PASS after regenerating OpenAPI. The direct import avoids tsx CLI's forbidden local IPC listener.
- `git diff --check` — PASS.
- `node tools/lint.mjs` — core purity PASS; complete lane check HELD on the unmerged m5-signin parent. It includes parent-only paths against main (including its own lane file), which this slice must not claim. An exact working-diff check using the existing mergeLanePolicy/lanePathAllowed functions — PASS, 26 paths including this lane file. Do not widen the lane for parent changes; merge/rebase PR #423 first, then run normal CI against current main.

The initial `pnpm` invocations stalled in the installed version-managing wrapper
before executing their checks and were interrupted; no pnpm-script PASS is claimed.
Early local checks caught and repaired route documentation/guard registration,
missing built dependency exports, and integration-test UUID typing. Earlier tests
were preserved, with both SV-7A definitions now covered by the guard check.

Handoff: ready for router commit/push and CI, followed by independent exact-head
Claude RED review. Parent PR #423 is a merge-order dependency. Database/upgrade,
full lint/build, browser execution, independent review and merge remain pending.
