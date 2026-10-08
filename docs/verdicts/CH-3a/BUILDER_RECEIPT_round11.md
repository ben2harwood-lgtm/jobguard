# CH-3a builder receipt — round 11

7 October 2026. Working-tree integration for PR #98, branch
`codex/sandbox/ch-3a`, on merge commit
`e988e2c03cde91c8e06fef2431d6299d9bb1755c` (main
`3395d343fd50d979c734daf4946ba293ee2ed836`). No commit, add, checkout, push,
merge or PR operation was performed. The dispatcher must commit this tree and
obtain a fresh independent verdict bound to that commit. The previous Opus PASS
at `52006fa` is historical evidence only; this receipt is not acceptance or an
independent review.

## Four-file reintegration

- `apps/api/src/quote/quote.application.ts`: restored the `JobPartiesRepository`
  member and the `JOB_PARTIES_REQUIRED` guard before activation, using the
  authenticated context, membership and digest. All SBOX `PracticeAccess.job`
  checks remain, including reads, preview, send, worker execution, artifacts,
  acceptance, disposition and activation. The comparison used the exact earlier
  CH-3a quote diff requested in the dispatch.
- `apps/api/src/quote/quote.controller.ts`: restored the preview endpoint and
  activation/preview mapping of `JOB_PARTIES_REQUIRED` to 409. Both construct the
  application with `practiceCookie(cookie)`; every existing cookie-aware method
  is retained.
- `apps/api/src/workspace/application.ts`: restored the frozen `parties` member
  (`list`, `view`, `command`, `adopt`) built from `JobPartiesApplication`. Kept
  SBOX's `sessionId` dependency and its forwarding to the existing applications.
  Parties retains its explicit principal parameter, populated with the actual
  request cookie by both adapters; no shared synthetic token substitution remains.
- `apps/api/openapi.json`: regenerated with the repository's
  `src/generate-openapi.ts`, using `node --import tsx` to avoid the blocked CLI
  IPC socket. All 60 main paths and their operations are unchanged. Added
  `/jobs/{id}/parties`, `/jobs/{id}/parties/import`, `/job-parties/jobs` and the
  restored `/jobs/{id}/quotes/preview`.

## Ownership and preserved behaviour

| Endpoint/action | Ownership and failure mapping |
| --- | --- |
| Next GET `/api/jobs/:id/parties`; Nest GET `/jobs/:id/parties`; application `view` | Actual cookie principal → `PracticeAccess.job` before party reads; session-scoped suggestions and recognition. |
| Next POST `/api/jobs/:id/parties`; Nest POST `/jobs/:id/parties`; application `command` | Same job authorization before schema validation, revision checks, replay and writes. Hidden customer/site/payer references on an owned job also fail before receipt claims. |
| Next POST `/api/jobs/:id/parties/import`; Nest POST `/jobs/:id/parties/import`; application `adopt` | Authorizes the source before validation, source projection or receipt replay; preserves the exact binding check under the existing transaction lock, synthetic dispatcher, idempotency and conflict handling. |
| Next GET `/api/jobs`; Nest GET `/job-parties/jobs`; application `list` | `PracticeAccess.session` authenticates the persisted session. The labelled repository projection contains only its jobs, including captured and adopted jobs. A valid stranger's aggregate list contains its own jobs, rather than returning a job-specific 404. |

Missing, malformed or invented sessions produce `UNAUTHENTICATED` / 401;
persisted-session authentication also governs expiry, revocation and membership.
Stranger and non-existent jobs produce the same `NOT_FOUND` / 404 without labels.
Next catches `practiceFailure` before domain errors; Nest preserves
`PracticeAccessError` for the existing global `PracticeErrorsFilter`. A foreign
requested tenant on an owned job retains the earlier 403. Malformed Next JSON is
passed as invalid input so it cannot bypass the application's ownership check.

Registry suggestions, revision/reference checks and recognition are scoped to
session-owned jobs. Unbound identities remain visible to their creator through
existing immutable creation audit references; saved bindings permit reuse within
that session. Legacy/non-practice repository callers keep their existing
tenant-wide registry semantics. This is an authenticated application boundary,
not a claim that RLS defeats stolen runtime credentials.

**Unchanged-migration import compatibility:** 0095's controlled routine creates
an imported job without a digest; 0094 forbids assigning one later. The adoption's
existing audit event now includes `references.sourceJobId`, atomically with the
successful command. The shared authorizer inherits ownership through that
append-only source relation, including repeated imports. No first-touch claim,
post-hoc owner update or migration change is used. Jobs without a session root or
this source reference remain inaccessible, as SBOX requires for legacy fixtures.
The list and recognition use that same relation. Audit additions contain only
IDs, not labels, contacts or tokens. Existing financial, document, correction,
reuse, stale-draft and idempotency assertions remain intact.

The merge's async workspace seam is awaited in all three CH-3a Next routes.
`apps/web/app/lib/synthetic-server.ts` also receives an optional-label type fix:
main's new home-job SQL projection omits those fields; CH-3a's existing fallback
labels remain explicit. No other merge-related unit-test failures were found.

## Lane and migrations

Only the compact `ch-3a` lane line changed: its existing paths were sorted and
**only** `packages/db/src/practice-session.ts` was added. All other lane lines
and grants are byte-identical. This shared change cannot live solely in a party
lane application: SBOX authorizes imported job access for the other existing
applications through `authorizePracticeJob`, and their access must retain the
same source ownership. The shared SQL relation is also reused by the lane's
repository so list/view/commands agree. No other new shared path was granted.

No migration was changed. `0095_job_parties.sql` is byte-identical to `e988e2c`,
SHA-256 `3ebbf25db33d827004507a05c02799e3f1f3f556fe5ad54005d91af7bef3dd82`.
No schema, data backfill, grant, rollback change or production-policy approval
is introduced. The existing 0054/0094/0095 migration registration and totals
from the merge are preserved.

## Tests first: red and green

Before production-code changes, on `e988e2c` with only new tests added, the API
unit run returned **1: 30 failed, 4 existing tests passed**. No compile fix was
needed for this red run. `/private/tmp/jg-ch3a-round11-red.log` records it.

The red cases are:

- `application|Nest view|command|adopt: missing|invalid|invented|stranger session refuses before party reads, validation, replay or writes` (24 cases).
- `application|Nest list: missing|invalid|invented session gets 401 before labels are read` (6 cases).

All 30 are now green. Each job-action test verifies the actual shared authorizer,
absence of business queries, and the global filter's exact 401/404 body/status
without opening an HTTP socket. Added a positive list delegation test verifying
the authenticated digest. The four earlier application tests remain: three CR/LF
validation cases and the unauthenticated/foreign-tenant/production boundary case.
They now use an authenticated ownership lookup double; validation still proves
no business persistence, missing-session assertions use the required 401 code,
and production still refuses before any query. Final targeted run: **35 passed**.

Added the browser case:
`CH-3a a new practice session cannot read, change, import or list another session's parties; reused storageState retains access`.
It creates a NEW session in a second context, compares stranger and unknown 404s
for both original and imported jobs, checks missing/invented 401s, checks jobs
list and suggestion-label privacy, rejects a stolen registry reference, and
verifies a reused storageState can read both jobs and persist an edit. Every
previous CH-3a assertion remains. Both projects collect this case; no new or
longer timeout and no retry was added.

Added the real-PostgreSQL case:
`CH-3a SBOX-SESSION-1 registry ownership on real PostgreSQL > isolates labels, unbound suggestions, recognition and forged registry references; an adopted job inherits only its source session`.
It uses real runtime roles, session issuance, repository commands and the unchanged
adoption routine/dispatcher. It covers unbound identity privacy, stolen customer,
site and payer bindings, failed-receipt rollback, replay, owner/stranger import
access and legacy-job refusal. **Collected, not executed locally**.

## Commands actually run

Node `v24.17.0`, cached pinned pnpm `10.28.1`, selected with
`PATH=/private/tmp/jg-ch3a-bin:$PATH`. Installed dependencies were reused;
`pnpm install --frozen-lockfile` was already done by the dispatcher and was not
rerun. No package download, live provider, real send, spending or production
execution occurred. Logs use `/private/tmp/jg-ch3a-round11-*.log`.

| Command | Exit | Evidence |
| --- | ---: | --- |
| `pnpm --filter @jobguard/api exec vitest run src/job-parties.application.test.ts` (red) | 1 | 30 new failures, 4 existing passes. |
| Same command (first green / final green) | 0 / 0 | 34, then 35 passes after adding list delegation coverage. |
| `pnpm --filter @jobguard/db build` | 0 | Rebuilt repository exports. |
| `pnpm typecheck` (initial / final) | 0 / 0 | All seven tasks pass; two cached. Includes API and web tests. |
| `LANE_BASE_REF=origin/main pnpm lint` (initial / final) | 0 / 0 | Purity, lane, money, commercial and all seven package checks pass. No self-comparison refusal. |
| `pnpm lint:lanes` (initial / final) | 0 / 0 | Correct registered lane against main, including local changes and this receipt. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` (first attempt) | 1 | Stale installed core build lacked merged ENT-1 `ContractorError` export. |
| `pnpm exec turbo run build --filter=@jobguard/db...` | 0 | Rebuilt merged dependencies; three tasks pass. |
| Same OpenAPI generation command (after rebuild) | 0 | Wrote the real generated document. |
| `pnpm openapi:check` | 1 | tsx CLI cannot create its IPC socket: `listen EPERM`. Not a stale-contract failure. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Exact same repository generator and comparison pass without CLI IPC. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | 0 | 19 files, 376 tests pass. Socket-only health case is accounted for by the full run below. |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | Same 376 passes; unchanged `GET /healthz` test fails solely on socket `listen EPERM`, with one related unhandled error. |
| `pnpm --filter @jobguard/web test` | 0 | 13 files, 108 tests pass. |
| `pnpm --filter @jobguard/core test` | 0 | 106 files, 2,860 tests pass. |
| `pnpm --filter @jobguard/db exec vitest run src test/verify-evidence-pack-cli.test.ts` | 0 | Three files, 12 tests pass. |
| `pnpm --filter @jobguard/db exec vitest run test/free-port.test.ts` | 1 | Two unchanged socket tests fail on `listen EPERM 127.0.0.1` and their existing timeout; no timeout or assertion changed. |
| `node --test tools/*.test.mjs` | 0 | 42 tests pass, none skipped. |
| `pnpm build` | 0 | All seven tasks pass; two cached. Next production compilation, type validation and page generation complete. |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/CH-3a.spec.ts` (initial / final) | 0 / 0 | 38 cases, 19 per existing project. Collection only. |
| `pnpm --filter @jobguard/db exec vitest list test/job-parties.integration.test.ts` (initial / final) | 0 / 0 | Includes the new ownership/inherited-import test. Collection only. |
| `node /private/tmp/jg-ch3a-round11-test-types.cjs` (initial / final) | 0 / 0 | Supplemental TypeScript comparison finds no new DB-test diagnostics against HEAD. Six pre-existing `unknown`-to-`string` diagnostics in older test helpers remain; this is not a claim that all DB tests are typechecked by the package script. |
| Python migration/lane/OpenAPI inspection | 0 | All migrations unchanged; exactly one path grant; all 60 main paths retained with four additions. |
| `git diff --check` | 0 | No whitespace errors. |

## Handoff and remaining evidence

PostgreSQL execution, migration/fresh-upgrade/privilege suites, restore rehearsal,
the browser journeys in both projects, and the socket tests must run in GitHub
CI after the dispatcher pushes. No assertion, suite configuration, retry or
timeout was weakened to accommodate this sandbox. Root `pnpm test` was not run
because it starts the unavailable database subsystem; the available units and
the socket failures are recorded above. The exact pnpm OpenAPI CLI command must
also pass in CI; its loader-equivalent comparison already passes locally.

No new external action, operational alert, financial effect, AI prompt/model
change or commercial/security approval was introduced. Synthetic-only release
gates remain unchanged. Technical acceptance stays on hold pending CI, a fresh
independent exact-commit verdict and the separate actor's acceptance.

Intended conventional commit subject and body are written to
`/private/tmp/jg-msg-ch-3a.txt`. The dispatcher owns committing and pushing.
