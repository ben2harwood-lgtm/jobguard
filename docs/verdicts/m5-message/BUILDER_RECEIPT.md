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
source authority seam, exact candidate B fixture selection, and customer receipt
projection. Only the branch-owned 0391 is edited; no migration on main is edited. New identity-only entrypoint customer_portal_message resolves/rechecks
the existing session in the same transaction and retains its job advisory lock;
it passes server-selected customer kind/name and exact text to SV-7A. The private
source helper permits a customer credential for customer_message only, leaving
CH-4 and all other commands unchanged. No source/evidence writes bypass SV-7A.
No new tables, provider calls, money, approval, detector scheduling, or shadow reads.

Compatibility: SV-7A requires actor_membership_id and exposes it to the builder as
actualTesterMembershipId. Customer responses omit it, including replay responses. For this synthetic adapter it remains the grant issuer
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


## 30 October follow-up — customer receipt redaction and claims

RED, MON-5 / M5-MESSAGE. The customer-only SQL entrypoint removes
`record.actualTesterMembershipId` after the shared intake returns, covering new
writes and authorized replays. Stored receipts, sponsor provenance, audit and the
builder read are unchanged. The API derives a strict customer record from the
existing schema with that field omitted; unexpected internal fields fail closed
with the existing private CUSTOMER_UNAVAILABLE response. OpenAPI and its source
use “checked evidence” / “checked original” for this operation.

Attack-first evidence: the new response/replay regression failed against the old
API (3 failures), including successful leakage of the sponsor-bearing fixture.
The PostgreSQL test now requires redacted concurrent and later replays while
asserting that builder reads and stored command receipts retain the sponsor.
It preserves all prior conflict, revocation, cross-customer, lock and shadow tests.
No renumbering, grants, routines, LP-0 or SERIOUS-B5 inventory entries were added
or removed in this follow-up; the existing parent-plus-piece union is retained.
The lane remains exact for the original piece plus this follow-up.

Follow-up local validation (installed binaries; at most two workers):

- API `./node_modules/.bin/vitest run --maxWorkers=2 src/auth/customer-message.test.ts src/auth/customer-signin.test.ts src/watchdog-registry.test.ts`: PASS, 161 tests.
- Core `./node_modules/.bin/vitest run --maxWorkers=2 src/job-source-intake.test.ts src/job-sources.test.ts`: PASS, 16 tests; builder receipt schema unchanged.
- Root `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` and `./node_modules/.bin/tsc -p /tmp/m5-message-integration-tsconfig.json --noEmit`: PASS. The latter checks the DB regression without executing it.
- API `node --import tsx src/generate-openapi.ts --check`: PASS.
- Root `./node_modules/.bin/tsc -p apps/api/tsconfig.json`: PASS (API emission; no full build claim).
- `node tools/plpgsql-case-in-if-lint.mjs`: PASS, 155 migrations. Existing lane-policy helpers confirm the piece's 26 paths exactly equal its lane allowlist plus its implicit own lane file. `git diff --check`: PASS.
- Next Gen Learning Platform `packages/floor/src/claims-gate.mjs` `checkClaims` on the changed `/customer-portal/messages` OpenAPI operation: PASS; also explicitly checked for absence of bare “verified”. A whole-file scan flags the pre-existing unrelated SSO summary “Mailbox-proven” (`absolute-proof`); it is outside this follow-up and is not claimed as a full-file PASS.

PostgreSQL/migration/catalogue and browser execution remain CI-only under the
sandbox constraint. Exact-head independent Claude RED review and green CI remain
required. No git write, commit, push, provider call or release was performed.

## 1 November 2026 NOPR catch-up

RED; MON-5 / M5-MESSAGE. Working files resolve both customer-message and main's
customer-variation routes, screens, proxy boundary and shared expectations.
The Git index is untouched because the sandbox makes .git read-only; the router
must stage resolved paths. origin/main and MERGE_HEAD both identify
e9d6c8b2bec984fb2edc604a1fe90005e67e7f0f. No fetch, git write or PR was attempted.

Renamed 0391_customer_portal_message.sql to 0545_customer_portal_message.sql
without changing SQL bytes, updated filename lookups, and added the strict proof
fragment with seven LP-0 changes, two explicit routine additions and no tenancy
changes (no tables are added). LP-0 baseline is current main; the proof composes
its customer-message additions without duplicate identities. Removed the new
routines from legacy upgrade expectations because proof application owns them.
The downstream-effects contract is unchanged; the unrelated main 0510 proof gap
is not altered.

Local checks actually run:
- API Vitest: customer-message.test.ts, customer-variation.test.ts and
  watchdog-registry.test.ts, maxWorkers=2: 149/149 PASS after rebuilding stale
  local core/API output.
- DB Vitest: customer-message-fixtures.test.ts and selected migration-proof-loader
  tests, maxWorkers=2: 27 PASS, 1 excluded (the zero-fragments live loader case
  reaches the known main proof gap).
- Installed tsc: core, API and DB emission PASS; API and web --noEmit PASS.
- OpenAPI regenerated from the merged module; --check PASS.
- Direct proofSchema/parseInventory/combineLp0 check PASS; effective inventory
  has no duplicate group, entry, authority-path or routine identities.
- PL/pgSQL CASE-in-IF lint PASS: 176 migrations.
- Initial pnpm commands stalled before runner output and were interrupted;
  installed repository binaries ran the checks above.

## 1 November 2026 resolved 0572 union — READY

Ben resolved the earlier byte-preservation hold: 0572 is not on main and may
change. Applied /tmp/m5-message-0572-proposed-main-body.sql exactly. A deterministic
assertion confirms its replacement writer equals main 0505's body with only the
customer source-authority seam and exact candidate B safety fixture added.
On-site diary admission, tenant advisory lock, open-job check, stored and returned
onSite values, and replay-before-admission order are preserved. Customer receipt
redaction remains at the identity entrypoint. No check was weakened.

Updated only the proof's replacement-writer staticCalls listing to include
app.ch4_admit_place and app.ch4_require_open. definitionSha256 remains null under
the existing inventory contract; there is no committed digest to refresh. The
LP-0 baseline, downstream-effects contract and known main 0510 proof gap are
unchanged.

Checks executed for this resolution:
- API installed Vitest, --maxWorkers=2, customer-message.test.ts,
  customer-variation.test.ts, watchdog-registry.test.ts: 149/149 PASS.
- DB installed Vitest, --maxWorkers=2, customer-message-fixtures.test.ts:
  2/2 PASS.
- Python exact-union/0505-body comparison, diary admission/replay-order assertions,
  and conflict-marker scan of all eleven index-unmerged working files: PASS.
- Strict proofSchema/parseInventory/combineLp0 check of the 0572 fragment with the
  committed LP-0 baseline: PASS. Initial root invocation could not resolve tsx;
  rerun from apps/api with its installed tsx passed. No package download.
- node tools/plpgsql-case-in-if-lint.mjs: PASS, 176 migrations.
- git diff --check: PASS.

READY for router staging and commit, NOPR. The read-only index still records merge
conflicts; working files contain their prepared resolutions. No git write, fetch,
commit, push or PR was performed. No origin/main refresh is required by this brief.

PostgreSQL and browser suites were not run under the sandbox restriction.
Independent exact-head RED review and green CI remain required.

## 2 November 2026 — m5-journey step 1 — READY (NOPR)

RED: MON-5 customer sign-in/session and tenant boundaries. Resolved the working
files for the in-progress m5-message / m5-quote-accept merge as an exact union.
Both controllers, application providers, existing guards and exports remain;
only exact customer POST routes delegate to their existing customer guards.
Parser refusals remain generic with no-store/no-referrer, and the Next proxy
retains both message and quote exceptions with its anchored path boundary.
Signed-in customers retain quote/extras links and the message form. No sign-in,
link, approval, session or commercial application check was changed.

Added combined-route regression coverage to customer-signin.test.ts (exact POST
only, non-POST and trailing/extra-path refusals, generic parser refusals) and
retained messages alongside quote actions in proxy.test.ts. No new product
behavior or substantial complexity was introduced.

Validation actually run using installed Node v24.17.0, TypeScript and Vitest
v4.1.12; every Vitest invocation used --maxWorkers=2 and at most three files:

- API: vitest run --maxWorkers=2 src/auth/customer-signin.test.ts
  src/auth/customer-message.test.ts src/auth/customer-quote.test.ts — 61 passed.
- API: vitest run --maxWorkers=2 src/auth/auth.test.ts
  src/auth/customer-variation.test.ts src/watchdog-registry.test.ts — 155 passed.
- Web: vitest run --maxWorkers=2 proxy.test.ts — 33 passed.
- Installed root tsc -p apps/api/tsconfig.json --noEmit and
  tsc -p apps/web/tsconfig.json --noEmit — passed, no stall.
- Dependency output preparation: tsc -p packages/{core,config,storage,db,ai}/tsconfig.json
  (each separately), then API tsc emission — passed. Initial test collection lacked
  core output; the next run lacked built API identity exports. Both resolved by
  these local builds; no package download or source workaround was needed.
- API node --import tsx src/generate-openapi.ts --check — passed unchanged.
- Deterministic exact module registration/import union, unchanged original
  guard/session/application boundary checks, tracked-file conflict-marker scan
  and git diff --check — passed.
- Migrations 0570 and 0572 and both proof files are byte-identical to their
  respective incoming-index / HEAD versions. The protected
  docs/contracts/lp-downstream-effects-v1.md is byte-identical to HEAD.

The index remains unmerged because .git is read-only. Router must stage these
working resolutions and commit. No fetch, git write, push or PR was performed.
PostgreSQL and browser suites were not run under the sandbox restriction;
required CI and independent exact-head RED review remain outstanding. This is
builder test evidence, not independent verification. Step 1 only is READY.
