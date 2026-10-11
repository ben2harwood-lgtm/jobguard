# ENT-10b builder receipt — 11 October 2026

Builder receipt only — not independently verified, not accepted.

Builder: Codex GPT-6.1 Sol, high reasoning. Issued scope: ENT-10b, audit export only; coordinator/integrator is not this leaf's builder, reviewer or accepter. RED lane: fresh Claude Opus verdict and separate Sol check after CI, followed by separate acceptance, remain required.

## Base and head

Branch: `codex/sandbox/ent-10b`. Base and inspected HEAD: `530681c030a2333ec8f27f4d1a2cf4803a833465` (the local `origin/main` at start). The implementation is an uncommitted working-tree diff: `.git` is read-only and no commit/add/branch/rebase/push/merge/PR action was performed. The dispatcher must supply the eventual committed head and bind independent verdicts to it. Intended commit message: `/private/tmp/jg-msg-ent-10b.txt`.

During the run another actor advanced the shared `origin/main` ref to `8db62b3cda93e41ed6c3eff32e708f9e464db080` (M4-6-S-R1, migration 0115). HEAD and the working tree remain on the issued base; no Git write/rebase was performed. A later two-endpoint `git diff origin/main` therefore also shows upstream-only changes absent from this older worktree; those were not edits or reversions made by this leaf. The changed-file list below is bound to the issued base/HEAD plus untracked new files. The dispatcher must reconcile the new 0115 registration and shared files during integration.

No ENT-10a code, table, route or file is relied upon. No SSO/SAML/OIDC/SCIM/emergency-access, assurance pack, production key management or M5-9 rotation implementation is included. BUILD_PLAN.md is unchanged; the integrator owns its migration ledger line.

## Delivered behavior and invariants

The shared workspace seam, Nest controller and thin Next adapter expose persisted single-tenant audit exports to active tenant-wide owner/admin grants. The existing ENT-1 session and reviewed membership query feed the existing principal bridge; its temporary query projection is discarded and grants no export authority. The export repository rechecks grants/membership under ENT-1's business lock. Refused authenticated roles commit their refusal audit before the typed error is thrown. Unauthenticated requests have no trusted tenant in which to append an audit event.

Restricted assurance credentials copy existing checkpoint records into a new immutable, tenant-scoped handoff table. Runtime gets no existing privilege change, no access to `audit_control`, no checkpoint INSERT and no new elevated routine. No HTTP route, workspace method or worker performs handoff. Creation without a handoff refuses with `AUDIT_EXPORT_CHECKPOINT_REQUIRED`. Normal UI cannot manufacture one; browser fixtures explicitly use test-only assurance credentials.

Each new command appends its own audit event and includes that event in the signed snapshot. Exact UTF-8 payload bytes are signed with Node Ed25519. A key pair exists per creation in memory; only the public half persists. Signed count, tail hash and export-event binding support omission/reordering/truncation checks. The CLI reuses `verifyAuditChain`, requires no database/server/network, and distinguishes bundled material from an independently trusted public key. The signature proves export integrity only. Checkpoint origin is attested by the signer; there is no external timestamp, approved production signer identity or long-term trust service.

Same-command retries return the same stored file and one audit event; a different actor reusing the ID conflicts. A failed creation rolls back both event and artifact. No money, commercial sends, provider adapters, AI behavior, evidence/journal history, existing role, table, grant, policy or routine is changed. Existing RLS still assumes a correctly authenticated context and cannot protect against a compromised privileged owner.

## DW6 and security-rule mapping

| Assertion | Automated coverage | Builder execution |
|---|---|---|
| Altered/missing entries; reordering; truncated tail; invalid signature | CLI `detects %s with original signature and with a new valid signature` (altered, missing, reordered, truncated); `detects truncation even if the untrusted sender updates the entry count and head`; `detects invalid signatures, replacement public keys and wrong trust material` | Offline CLI suite executed; final result below |
| Export contains one tenant only, including shared-user tenants; no foreign row, key, identity or count | PostgreSQL `exports one tenant only, including shared-user tenants, with its own audit event and distinct public key`; compares entry count against ONLY tenant A, rejects B tenant/member/export/head/key references; CLI foreign-entry/foreign-checkpoint cases; browser second-tenant empty register | CLI executed; PostgreSQL/browser NOT RUN |
| Every export itself audited | Same PostgreSQL test asserts exact `audit.export.created` ID and signed tail; `replays racing command IDs once and persists one audited effect`; browser asserts signed last event ID | PostgreSQL/browser NOT RUN |
| Append-only export rows, qualified keys and FORCE RLS | PostgreSQL `catalogs append-only tenant-qualified tables and denies missing-context, cross-tenant, mutation and checkpoint privilege attacks`; existing tenancy catalogue receives four new rows only | NOT RUN |
| Only owner/admin; all other roles refused/audited | PostgreSQL `allows only current tenant-wide owner/admin and durably audits every other role's create/list refusal`, including all ENT-1 roles, scoped admin, revocation; browser revoked grant/read/write refusals; API inactive-membership refusal | API executed; PostgreSQL/browser NOT RUN |
| Existing runtime privileges unchanged; restricted checkpoint handoff | PostgreSQL `leaves every existing table, policy, routine privilege and runtime role attribute unchanged on upgrade`; catalog/denial test checks runtime cannot call handoff or read `audit_control`; `requires a trusted handoff and rolls back creation/audit on failure` | NOT RUN |
| Signature-integrity wording on screen and contract | CLI trusted-material test asserts exact notice; API seam test asserts exact notice; browser asserts `The signature proves export integrity only`; contract and operations file use those exact words | CLI/API executed; browser NOT RUN |
| Synthetic-only mode, strict versioned boundaries, redacted errors | API mode cases, missing-session, forged tenant/checkpoint/key/mode fields, inactive membership and redacted-driver-error cases; PostgreSQL pilot/production refusals; strict CLI boundary case | API/CLI executed; PostgreSQL NOT RUN |
| Shared composition and persisted screen | API `uses the persisted session and existing principal bridge in the shared composition seam`; `Nest exposes the same service and checks the browser origin before a write`; browser full reload/deep-link/two-context/download/refusal/focus/44px/no-overflow journey | API executed; browser NOT RUN |

The offline tests generate keys and fictional chains at test time. Mocked API seam tests demonstrate composition/input behavior, not PostgreSQL isolation or a live integration. Only the separate PostgreSQL/browser suites can establish their database/UI guarantees.

## Migration and compatibility

`0116_audit_export.sql` as built (renumbered to `0121_audit_export.sql` by the integrator on 11 October 2026; see CI repair 1), registered after 0112 in numeric order on the issued base; 0113/0114/0115 were reserved and absent on the issued base; 0115 merged into the moving remote ref during this run and must be preserved during integration. Adds only `app.audit_export`, `app.audit_export_checkpoint`, their tenant-qualified foreign keys, migration ownership, ENABLE/FORCE RLS, policies/grants on those new tables, and immutable triggers calling the already-existing rejection function. Export runtime grants: SELECT/INSERT; handoff runtime grant: SELECT. No new SQL routine, new credential, backfill or alteration of an existing object. The previous application ignores both tables. Disable new routes and fix forward on failure; never delete exports/checkpoints or rewrite audit history as rollback.

Upgrade/idempotence and unchanged security catalogs are authored in the new integration suite; fresh install and bootstrap remain covered by existing `test:migrations` suites. None was executed in this sandbox. PostgreSQL timestamp matching in handoff accounts for the existing JS Date millisecond precision and copies the original stored timestamp, with an exact stored-record join on replay.

## Commands and observed results

Dependencies were already installed; no install/download was requested and no package manifest or lockfile changed. Node observed: v24.17.0. The default system pnpm launcher attempted a version switch and failed signature verification because registry fetches failed; the initial API command exited 1 before running tests. A `pnpm --version` attempt through that launcher was interrupted (exit 130). Subsequent commands use an executable at `/private/tmp/jg-ent-10b-bin/pnpm` that invokes the already-installed `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; PATH is prefixed accordingly. This changes no repository configuration or checks.

| Exact command (with that PATH prefix) | Exit | Observed counts/result |
|---|---:|---|
| `pnpm --filter @jobguard/api exec vitest run src/audit-export` — failed-first before implementation | 1 | 1 failed suite, 0 tests: new application module absent |
| `pnpm turbo run build --filter=@jobguard/api...` | 0 | 6 successful tasks, 4 cache hits; workspace packages built before tests |
| `pnpm --filter @jobguard/api exec vitest run src/audit-export` — first implementation | 0 | 1 file / 6 tests passed |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/verify-audit-export-cli.test.ts` — first run | 1 | 11 failed / 3 passed (14); verifier module imported database runtime; unchanged 5000ms timeouts hit |
| `pnpm --filter @jobguard/api exec vitest run src/audit-export src/auth/context-boundary.test.ts` — initial expanded tests | 1 | 2 failed / 151 passed (153): too-short internal CSRF value and new helper-name collision with scanner tracking |
| `pnpm --filter @jobguard/api exec vitest run src/audit-export` — expanded pre-fix standalone | 1 | 1 failed / 7 passed (8), same CSRF validation defect |
| `pnpm --filter @jobguard/api exec vitest run src/audit-export src/auth/context-boundary.test.ts` — after those fixes, overlapping builds | 1 | 2 failed / 151 passed (153): unchanged scanner tests hit 5000ms timeouts; no assertion mismatch reported |
| `pnpm --filter @jobguard/api exec vitest run src/audit-export` — corrected intermediate | 0 | 1 file / 8 tests passed |
| `pnpm --filter @jobguard/api exec vitest run src/audit-export` — active-membership validation added | 0 | 1 file / 9 tests passed |
| `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts` — isolated, unchanged scanner | 0 | 1 file / 145 tests passed; no test timeout/retry/assertion change |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/verify-audit-export-cli.test.ts` — after lazy database-runtime import | 0 | 1 file / 14 tests passed, original timeouts unchanged |
| `pnpm typecheck` — initial and intermediate | 0 / 0 | 7 successful tasks each, 4 cache hits each |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity: 125 TypeScript files; then `Missing branch or self-comparison range; refusing a misleading pass` because HEAD equals base |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same commit-range refusal; not a passing lane verdict |
| `pnpm turbo run lint` — supplementary package checks | 0 | 7 successful tasks, 4 cache hits; does not replace top-level lane check |
| `pnpm build` — pre-final review corrections | 0 | 7 successful tasks, 4 cache hits; Next production build includes both new routes |
| `pnpm openapi:check` | 1 | tsx IPC `listen EPERM` before document comparison; no socket permission in sandbox |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` — two generations | 0 / 0 | Source generator; one new path / two operations; old paths preserved |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Equivalent source document check without tsx CLI socket; not a claim about compiled metadata parity |
| `pnpm --filter @jobguard/db build` — two supplementary rebuilds | 0 / 0 | TypeScript package builds |
| `pnpm --filter @jobguard/db exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck test/audit-export.integration.test.ts test/verify-audit-export-cli.test.ts` — two inspections | 0 / 0 | New DB/CLI test source compiles; no database tests executed |
| `node tools/core-purity-lint.mjs` | 0 | 125 TypeScript files |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary passed |
| `node tools/commercial-boundary-lint.mjs` | 0 | No output, exit 0 |
| `git diff origin/main --check` | 0 | No whitespace errors |

Final completed runs and cleanup verification are recorded in the final section below. Turbo emitted non-fatal `IO error: Operation not permitted` cache warnings. Next emitted pre-existing workspace-root/autoprefixer warnings. These were not hidden or presented as browser execution.

## NOT RUN and HELD evidence

- **NOT RUN (sandbox cannot start PostgreSQL / a browser):** every database integration test in the repository, including `test/audit-export.integration.test.ts` (8 authored cases), `test/tenancy.integration.test.ts`, `test/UIWIRE-12.integration.test.ts`, `test/demo-bootstrap.integration.test.ts`, unchanged ENT-1 `test/contractor.integration.test.ts`, all other regression integration suites, `pnpm test:db`, and `pnpm test:migrations`.
- **NOT RUN (sandbox cannot start PostgreSQL / a browser):** every Playwright test, including `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop ENT-10b.spec.ts` (one authored journey, two configured projects), and existing regression browser suites. No screenshot was taken or claimed; the spec defines future screenshot paths only.
- `pnpm test`: NOT RUN; its database suites cannot run here. No suite was weakened, skipped in source, retry-wrapped or given a longer timeout.
- `pnpm install --frozen-lockfile`: NOT RUN as instructed; dependencies were already installed and downloads were prohibited.
- `pnpm eval`: not applicable; no prompt, model, extraction schema/parser, matching policy or AI gateway changed.
- **BLOCKING for technical acceptance:** actual PostgreSQL migration/RLS/authorization/atomicity tests, browser journeys, standard `openapi:check` and repeat commit-range lane/lint checks on the committed dispatcher/CI head; fresh Opus verdict, separate Sol check after green CI, exact committed head and separate acceptance.
- **HELD:** non-synthetic signing-key decision and production export creation, real-data residency/privacy/retention/export/deletion approval, D04/G5/ENT-14 live gates. All other modes refuse server-side. Trusted checkpoint handoff is an operator prerequisite, with no runtime shortcut.
- **LATER:** M5-9 key rotation, approved signer identity, external timestamp trust, revocation/expiry and long-term verification; ENT-10a identity and ENT-10c assurance and aggregate M5-7/M5-12 acceptance remain outside this leaf. No founder approval is inferred.

## Self-review

Re-read the issued header, applicable plan/contracts, `git diff origin/main` for all existing-file changes and the full new files. This is builder source inspection, not an independent model verdict.

Fixed BLOCKING findings in the new files: an internal caller supplying a foreign membership for a genuine tenant context could otherwise leak that identity in a refusal event (now the event uses a generic unverified-member actor, with a shared-user foreign-actor attack test); the bridge CSRF value did not satisfy its existing schema; helper and local context names collided in scanner tracking; eager database-runtime loading made offline subprocess cases exceed unchanged test timeouts; the handoff replay path needed an exact join to the original restricted record; PostgreSQL Date precision needed millisecond matching while copying original timestamps; a missing JSON version could pass a nullable SQL CHECK; Next's pre-existing workspace mode refusal could mask the required export-mode error; stale list data needed hiding after failed refresh. Added keyboard input to the browser focus assertion and explicit transaction-local context for its test-only grant revocation.

Every DW6 clause and additional security rule maps to the tests above, which exercise the new implementation and fail if the new export/verifier/schema is absent. Existing assertions are unchanged: tenancy takes four catalogue rows only. The first change is exactly one compact `ent-10b` lane line in name order; no other lane line changed. Shared registration edits only add this leaf's imports, controller, service method, barrel exports, migration entry and OpenAPI path. No file pinned by the context scanner changed, and its isolated 145-test run passed. No existing object/role/grant/policy/routine is changed by the migration; the real catalogue comparison/denials remain NOT RUN and must be established by CI. No out-of-scope identity/security-pack/key-rotation feature was built.

Shared overlaps: lane registry, app.module.ts, workspace/application.ts, workspace/index.ts, OpenAPI, db/index.ts, migrate.ts, MIGRATIONS.md and tenancy catalogue are additive and serialize with other leaves at integration. This worktree owns only the ENT-10b additions; the dispatcher/integrator reconciles concurrent registration and reserved migration entries. No BUILD_PLAN ledger edit was made. No new operational alerting integration is added; missing checkpoint, invalid artifact, unavailable persistence and permission refusal are typed errors for the existing operator surface.

Remaining BLOCKING items are verification/acceptance evidence listed above, not claimed passes. No independent verification, professional sign-off, founder approval or technical acceptance is asserted.

## Changed files

- `apps/api/openapi.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/audit-export/audit-export.application.test.ts`
- `apps/api/src/audit-export/audit-export.application.ts`
- `apps/api/src/audit-export/audit-export.contracts.ts`
- `apps/api/src/audit-export/audit-export.controller.ts`
- `apps/api/src/workspace/application.ts`
- `apps/api/src/workspace/index.ts`
- `apps/web/app/admin/contractor/audit-exports/page.tsx`
- `apps/web/app/api/contractor/audit-exports/route.ts`
- `apps/web/e2e/ENT-10b.spec.ts`
- `config/agent-lane-assignments.json`
- `docs/contracts/audit-export-v1.md`
- `docs/operations/audit-export-data-flow.md`
- `docs/verdicts/ENT-10b/BUILDER_RECEIPT.md`
- `packages/db/MIGRATIONS.md`
- `packages/db/migrations/0121_audit_export.sql` (built as 0116; renumbered 11 October 2026)
- `packages/db/src/audit-export-repository.ts`
- `packages/db/src/index.ts`
- `packages/db/src/migrate.ts`
- `packages/db/test/audit-export.integration.test.ts`
- `packages/db/test/tenancy.integration.test.ts`
- `packages/db/test/verify-audit-export-cli.test.ts`
- `packages/db/tools/verify-audit-export.mjs`

## Final verification of the delivered source

These runs include the final foreign-member refusal guard and all source/test changes. The later `origin/main` update allowed the ordinary lane checker to use its normal merge-base comparison; no checker or Git reference was modified by this builder.

| Exact command (same pinned PATH prefix) | Exit | Observed result |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 successful tasks, 4 cached |
| `pnpm build` | 0 | 7 successful tasks, 4 cached; production web/API/package build |
| `pnpm --filter @jobguard/api exec vitest run src/audit-export` | 0 | 1 file / 9 tests passed |
| `pnpm --filter @jobguard/db exec vitest run test/verify-audit-export-cli.test.ts` | 0 | 1 file / 14 tests passed; real offline CLI subprocesses |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Boundary checks and 7 successful package tasks, 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Ordinary checker: ENT-10b, 24 files, merge-base comparison |
| `pnpm --filter @jobguard/db build` | 0 | Final database package source compiled |
| `pnpm --filter @jobguard/db exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck test/audit-export.integration.test.ts test/verify-audit-export-cli.test.ts` | 0 | Final authored DB/CLI tests compile; no PostgreSQL execution |
| `pnpm openapi:check` | 1 | Standard tsx CLI refuses IPC socket with `listen EPERM`; comparison not reached |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same source OpenAPI comparison succeeds without CLI socket |

Preservation inspection also passed: removing this one new lane line reproduces the issued-base registry byte for byte; removing the four new tenancy catalogue rows reproduces that existing test byte for byte; all 83 existing OpenAPI path objects and the existing component object remain unchanged, with one added path/two operations.

Cleanup removed the generated `.pnpm-store`, six package/API `dist` directories, seven package/app `.turbo` directories, web `.next` and web `.tsbuildinfo` (16 paths). No tracked file was removed; installed dependencies were retained. No test-results or browser screenshots were created. The dispatcher must build workspace packages before executing the offline verifier or tests that import them.

Final post-cleanup checks: `git diff HEAD --check` exited 0; `LANE_BASE_REF=origin/main pnpm lint:lanes` exited 0 with the same exact 24-file lane; a read-only Python preservation/scope/artifact inspection exited 0 with 24 allowed changed files, one added lane line, four added catalogue rows, all 83 previous OpenAPI paths/components preserved, and zero generated artifacts outside installed dependencies. No product source changed after the final build/typecheck/test runs.

Builder receipt only — not independently verified, not accepted.

## CI repair 1 — 11 October 2026 (Claude Sonnet, run on the Mac)

Repair builder only; no review or acceptance. Branch `codex/sandbox/ent-10b`, started from local head 7ae55ec (one Codex builder commit on 530681c).

**Catch-up.** `git merge origin/main` (4a70824, which gained migrations 0115 and 0119) conflicted in three files, each resolved by keeping both sides: `packages/db/MIGRATIONS.md` (0115 and 0119 sections kept, the ENT-10b section kept after them), `packages/db/src/index.ts` (both `export *` lines), `packages/db/src/migrate.ts` (0115 and 0119 kept plus the ENT-10b migration). Auto-merged without conflict: `apps/api/openapi.json`, `config/agent-lane-assignments.json`, `packages/db/test/tenancy.integration.test.ts`; `pnpm openapi:check` exits 0, so the openapi file needed no regeneration. Merge commit: `Merge origin/main (4a70824) into codex/sandbox/ent-10b — catch-up, both sides kept`.

**Renumber.** `git mv packages/db/migrations/0116_audit_export.sql packages/db/migrations/0121_audit_export.sql` (SQL byte-identical; 0121 follows the merged 0115 and 0119, 0120 is ENT-10a). References changed: `migrate.ts` (registered in numeric order after 0119), ENT-10b's own lane line (migration path, and `BUILD_PLAN.md` added to its allow list), `packages/db/test/audit-export.integration.test.ts` (the two migration-name strings, lines 33 and 61; its position logic already works by name), `docs/contracts/audit-export-v1.md`, `packages/db/MIGRATIONS.md` (retitled `0121`, one sentence on the renumber), this receipt (two lines in the file list and migration section). `BUILD_PLAN.md` §12.2 gained one "Ledger amendment — ENT-10b" paragraph directly before `### 12.3`. Commit: `chore(ent-10b): renumber migration 0116 → 0121 and record the §12.2 ledger line`.

**Setup.** `pnpm install --frozen-lockfile` exit 0 (nothing to change). The embedded-postgres short dylib names were missing, so the package's own `scripts/hydrate-symlinks.js` was run once inside node_modules; PostgreSQL then started. Playwright browsers: `chromium_headless_shell-1193` is not installed on this Mac and `playwright install` was not run, so the spec was run with `--headed` (full Chromium 1193, already installed). The first headless attempt failed only with `browserType.launch: Executable doesn't exist` (environment, not a code fault).

**Pre-run migration check.** The migration has no PL/pgSQL, no CASE and no JSON operator expressions, so none of the three known fault classes could apply. The tenancy and bootstrap suites exercise it in a fresh install and in the real upgrade path.

**Faults found (one).**
- `apps/web/e2e/ENT-10b.spec.ts` lines 12 and 55 (both browser projects): `Error: expect.toContainText: strict mode violation: getByRole('alert') resolved to 2 elements` — the screen's own `<p role="alert">` and Next.js's built-in `<div role="alert" id="__next-route-announcer__">`. Kind (i), test set-up: the locator was ambiguous. Before: `page.getByRole("alert")` (four occurrences). After: `page.locator("p[role=alert]")` (the page's own alert; the same disambiguation CH-3a, M0-6L and M4-1-S use). The matchers and expected values (`toContainText("AUDIT_EXPORT_CHECKPOINT_REQUIRED")`, `toHaveText("AUDIT_EXPORT_FORBIDDEN")`, both `toBeFocused()`) are byte-identical; only which element they are applied to is now unambiguous. Flagged here so the reviewer can judge it.
- No fault in the migration, repository, application, routes, verifier tool or screen; no fault in any merged test.

**Commands and results (each in `heavy-slot`, one at a time, `--maxWorkers=2`, memory free 86–87%, 1-minute load under 13).**
- `pnpm turbo run build --filter=@jobguard/api...` exit 0 (6 tasks).
- db: `test/audit-export.integration.test.ts` + `test/verify-audit-export-cli.test.ts` exit 0, 2 files, 22 tests passed.
- db: `test/tenancy.integration.test.ts` + `test/demo-bootstrap.integration.test.ts` exit 0, 2 files, 13 tests passed.
- api: `src/audit-export` + `src/auth/context-boundary.test.ts` exit 0, 2 files, 154 tests passed (`context-boundary.test.ts` unedited and passing as it stands).
- web e2e `ENT-10b.spec.ts`, `--project=mobile-360 --project=desktop --workers=1`: headless exit 1 (browser missing); `--headed` exit 1, 2 failed (the locator fault above); after the repair `--headed` exit 0, 2 passed (mobile-360 and desktop).
- `LANE_BASE_REF=origin/main pnpm lint:lanes` exit 0; `pnpm typecheck` exit 0 (7 tasks); `LANE_BASE_REF=origin/main pnpm lint` exit 0; `pnpm openapi:check` exit 0.
- Not run: `test/UIWIRE-12.integration.test.ts` (in the lane, not on the named list), whole-package and whole-repository suites.

**Stopped on:** nothing. No test was skipped, retried or re-run to obtain a pass (there was no timing-only failure).

No assertion, expected value, timeout, grant or runtime privilege was changed or loosened.

Builder receipt only — not independently verified, not accepted.
