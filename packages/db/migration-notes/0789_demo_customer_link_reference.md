# LATER-SAFETY-13 — RED — demo customer sign-in content

Confirmed on the issued main snapshot d16ef1978 (HEAD and origin/main): 0518
is the only definition of app.demo_issue_customer_link and stores its path argument.

0789 starts from that exact latest body. It preserves the signature, owner,
search_path, grants, database/practice tenant restrictions, final lock and found
extra requirements, session/owner checks, locks, customer binding, fake recipient,
digest, rate limit, expiry and audit checks. No tables or columns change.

The repository replaces an exact, tenant/job/customer-bound path with an
independent random 32-byte base64url reference before invoking SQL. The API and
its direct path return stay unchanged, including the existing unit expectations.
Copied from 0533: the exact customer-signin-reference.v1:<tenant>/<job>/<customer>/<43 chars>
validation and SHA-256 of UTF-8 stored content, bound in both authorization and
outbox. Existing direct SQL callers with valid exact paths are preserved by
converting their content to customer-signin-redacted.v1:<original SHA-256> before
hashing or storage; invalid paths still fail. This compatibility branch keeps
all existing shadow guide tests unchanged.

The historical redaction DO block is copied verbatim from 0533. It revokes grants,
cancels pending/retryable deliveries, hashes the digest-only marker, and appends
both action_outbox.redacted and customer_portal.redacted using the existing audit
path. It retains historical authorization hashes and all rows, as 0533 does.
Forward-fix only: never restore plaintext; reissue a new short-lived link if needed.

Regression cases were written before the fix. Real PostgreSQL is unavailable in
this sandbox: no observed red/green database run is claimed. Added cases cover
legacy direct-call content, the real application/repository issue path, reference
and authorization hashes, returned token digest, and historical rows written by
the actual predecessor routine, including revocation, audit payloads and replay.
LP-0 static writes/calls, ownership/ACL and the upgrade catalog facts are unchanged;
therefore the new proof has empty deltas and no baseline pins are edited.

## Named holds for landing

- packages/db/test/plan-entitlement-lifecycle-upgrade.integration.test.ts compares
  every predecessor routine definition. The router must authorize a separate exact
  named exception for app.demo_issue_customer_link(uuid,uuid,uuid,text,text,text),
  binding its body to 0789. This scanner file is outside this piece's allowlist;
  it is deliberately unchanged. No broader exemption is appropriate.
- Renumber only the 0789 migration filename stem and its references at landing.
- CI must execute the added regression against the predecessor to observe failure,
  then the fixed real-PostgreSQL shadow-demo-guide and shadow-demo-guide-outside
  suites, customer-signin, fresh/upgrade/migration/privilege suites and audit checks.
  CI must run unchanged apps/web/e2e/DEMO-J3-shadow.spec.ts at phone and desktop
  widths, at most two workers, plus required typecheck/lint/test/build checks.
- Exact-head independent RED review and green CI remain required. NOPR build only;
  this is not acceptance, merge, deployment or release evidence.

## Local validation

Results are recorded below after running the permitted checks. No provider, real
customer data, database server or browser server was used.

- PASS: installed `tsc -p packages/db/tsconfig.json --noEmit` and
  `tsc -p apps/api/tsconfig.json --noEmit`.
- PASS: installed `tsc` builds for core, storage, config and db prepared missing
  ignored dist outputs; no dependencies downloaded. Initial unit attempts could
  not resolve the absent package entrypoints; reruns after these builds passed.
- PASS: API `vitest run --maxWorkers=2 src/shadow-demo-guide.application.test.ts
  src/auth/customer-signin.test.ts`: 2 files, 47 tests, unchanged.
- PASS: DB `vitest run --maxWorkers=1 test/migration-proof-loader.test.ts`:
  1 file, 77 tests.
- PASS: `node tools/plpgsql-case-in-if-lint.mjs` (279 migrations);
  `git diff --check`; exact source comparison of the retained 0518 body and
  the verbatim 0533 historical redaction block.
- Lane CLI cannot compare HEAD with identical origin/main before the router's
  commit; local main is stale and includes unrelated upstream changes. The
  existing lanePathAllowed and migrationOrderViolations helpers passed against
  the six actual changed/untracked paths and the issued HEAD tree. Rerun the
  normal lane CLI in CI after commit. No git writes or fetch performed.
- The pnpm version command stalled and was interrupted; validation used installed
  package binaries directly.

## LATER-SAFETY-19 landing catch-up — 6 Nov 2026

Current main for this check is the local `origin/main` snapshot 9d4677cbd;
local `main` is stale and was not used. The launcher already completed the
merge at f0bd92eb3; no unresolved merge entries or conflict markers were found
in the affected files. No git writes were run.

- Compared the replacement issuer against main's latest definition (0518).
  It is byte-identical outside the intended content validation/redaction block.
  Main has no later definition of this routine and does not contain 0789.
  The existing migration-number checker reports no renumber required.
- Added the exact issuer signature to the existing predecessor routine comparison,
  asserting the full replacement body from 0789. The complete owner/ACL/security
  comparison remains enforced. This resolves the earlier named routine-test hold;
  it adds no runtime behaviour and introduces no general exception.
- Updated the later-safety-19 lane to exactly the changed non-lane paths against
  origin/main, including the inherited migration, note, proof and tests.
- PASS: installed `tsc -p packages/db/tsconfig.json --noEmit` and
  `tsc -p apps/api/tsconfig.json --noEmit`.
- PASS: API `vitest run --maxWorkers=2 src/shadow-demo-guide.application.test.ts
  src/auth/customer-signin.test.ts`: 2 files, 48 tests.
- PASS: DB `vitest run --maxWorkers=1 test/migration-proof-loader.test.ts`:
  1 file, 77 tests.
- PASS: PL/pgSQL CASE-in-IF lint (306 migrations), `git diff --check`, latest-main
  routine comparison and exact own-lane path comparison.
- FAIL: `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`:
  `Lane later-safety-19 cannot edit: "config/lanes/later-safety-13.json"`.
  That inherited lane file is absent on main and predates this catch-up. The lane
  checker permits only a branch's own lane file, including for deleted paths, so
  removing it on this branch would not resolve the gate. It was preserved under
  the no-deletion instruction. Router integration of this inherited registration
  is required; no lane checker or protection was weakened.

NOT READY: lane boundary remains red. Database and browser suites were not run
in this sandbox; real PostgreSQL fresh/upgrade/privilege/audit tests, the changed
plan-entitlement lifecycle upgrade test, browser journeys, required CI and an
independent RED review remain required. No PR, push, merge or release is claimed.
