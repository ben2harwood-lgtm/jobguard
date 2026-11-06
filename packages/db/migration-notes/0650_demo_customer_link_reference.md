# LATER-SAFETY-13 — RED — demo customer sign-in content

Initial build: confirmed on the issued main snapshot d16ef1978 (HEAD and origin/main): 0518
is the only definition of app.demo_issue_customer_link and stores its path argument.

0650 starts from that exact latest body. It preserves the signature, owner,
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

## PR-opening catch-up — 6 November 2026

READY for router commit and PR opening; this is RED. The launcher completed the
main merge at 88dc9e9c7. No new product behaviour was introduced in this catch-up.
The independent pre-check PASS at a88721ae is retained as prior evidence, not a
review of the eventual PR head. Its later observations remain deferred.

Migration inventory against available origin/main (9d4677cbd, through 0640):
only `0650_demo_customer_link_reference.sql` is added. No duplicate is on main.
The reserved landing order remains 0641–0645 (#594), 0646–0649 (#595), then 0650;
the router must retain that order. Renumbering changed only the filename stem,
proof, note and references: the SQL is byte-identical to the prechecked migration.

Main's latest `app.demo_issue_customer_link(uuid,uuid,uuid,text,text,text)` body
is still 0518. A fresh exact diff shows only the approved content-validation and
redaction block differs. Every other byte of the routine is preserved. The
historical DO block remains byte-identical to 0533. No routine has a SET app.*
clause, and no command-lifecycle claim access or new table is introduced.

The two whole-database definition comparisons that freeze this predecessor now
pin only this exact named signature to 0650's full body: MIGFIX-7 and the plan
entitlement lifecycle upgrade test. Existing owner, ACL, configuration and other
routine assertions remain. MIGFIX-6 and restore-reconciliation snapshot tests
need no changes: this migration adds no tables/registry rows, and their fictional
fixtures create no historical customer sign-in links to redact. The enterprise
access upgrade already scopes later body replacements while preserving metadata.

CI must prove fresh and populated PostgreSQL upgrades, including MIGFIX-6/7,
plan-entitlement-lifecycle, enterprise-access and restore-reconciliation upgrades;
shadow-demo-guide, shadow-demo-guide-outside, customer-signin and audit/outbox
regressions; and the unchanged DEMO-J3-shadow browser journey at both widths,
with at most two workers. The sandbox cannot run PostgreSQL or bind localhost.
Required CI checks and an independent RED review against the final head remain
merge gates; no merge, release or deployment is claimed.

## Catch-up local validation

- PASS: installed `tsc -p packages/db/tsconfig.json --noEmit` and
  `tsc -p apps/api/tsconfig.json --noEmit`.
- PASS: installed DB Vitest, `--maxWorkers=2`, migration-proof-loader and
  migfix-6: 2 files, 80 tests.
- PASS: installed API Vitest, `--maxWorkers=2`, shadow-demo-guide.application and
  auth/customer-signin: 2 files, 47 tests.
- PASS: PL/pgSQL CASE-in-IF lint (306 migrations), money-arithmetic and
  commercial-boundary and AI-provider-boundary lint, core-purity lint, and
  `git diff --check`. Both changed upgrade tests also passed TypeScript syntax
  transpilation; this is not a PostgreSQL execution result.
- PASS: exact SQL comparison with prechecked a88721ae, fresh latest-main routine
  diff and verbatim historical-redaction comparison with 0533.
- Lane CLI was run: it sees the three old committed filenames as well as the
  uncommitted renames and rejects the old paths. The repository's actual
  `loadLanePolicy`, `lanePathAllowed` and `migrationOrderViolations` helpers
  passed on all eight final paths against origin/main. The lane lists every
  final changed file except itself, as required. Router must rerun the normal
  CLI after committing the renames; no legacy paths were added as exceptions.
- The pnpm shim could not verify its pinned version because registry access was
  unavailable. Checks used the existing installed binaries; no packages installed.

## Initial build local validation

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
