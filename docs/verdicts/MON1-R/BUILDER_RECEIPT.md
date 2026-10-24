# MON1-R builder receipt — 24 October 2026

Status: **STOP — product build not implemented; not accepted.** This is a source inspection and baseline check receipt, not an implementation, independent review, or tenant-isolation verification. No commit, staging, push, merge, provider action or database execution.

## Issuance and inspected authority

Read repository AGENTS.md in full; BUILD_PLAN.md §§10.1.3–10.1.7 and MON-1; the complete MON1-R draft (line 1705 through the next heading) and its common contract §§2–3; MON1-S/A receipts; and `jg-orders/next-wave/BEN-ANSWERS-20261023.md`. Decision 74 explicitly permits building on the issued accepted stack before integration. No predecessor merge condition was used to block this build.

Observed clean initial tree, branch `codex/sandbox/mon1-r`, HEAD `a9dc9c42ba23df5b5bb35bb4537c904aae71dac6`, origin/main `cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe`. CH-4-C `14eca750` ancestry check exited 0. Acceptance of the issued stack is dispatcher-provided context, not a new verdict by this builder. Node v24.17.0; cached pinned pnpm 10.28.1 selected using existing `/private/tmp/jg-mon1-a-bin` wrapper, with login shell rewriting disabled. No install or download command was run. Initial ordinary pnpm invocation hung at its launcher and was interrupted (exit 130); subsequent commands use the cached pinned CLI.

## STOPs and safest choices

1. **STOP-file-authority.** Issuance says “Permitted files: the draft's allowlist for MON1-I” and separately “Do not edit MON1-I's consumer files.” MON1-I has a different explicit file list from MON1-R. Asked asynchronously whether the MON1-R own-file list is intended; no answer received when this receipt was written. Did not silently widen authority or edit the parallel consumer lane. Added only the explicitly authorized own lane and this receipt. Lane currently grants only this receipt, with exact issued branch and no self-register grant. A corrected product allowlist must be bound before source changes.
2. **STOP-summary-seam.** `git grep` verified `MeterLifecycleRepository.capture`, `.rebuild`, `.read` in `packages/db/src/meter-lifecycle-repository.ts`. Read accepts `meter-lifecycle-read.v1` and a computation ID; there is no current-summary/latest-computation selector. Searches for `mon1_lifecycle_summary`, `mon1_lifecycle_latest`, meter summary symbols returned no match. A read-only GET must not use capture/rebuild to create a source or choose a caller-supplied period/tenant. A checked session-scoped current-source lookup needs an explicit source-owner handoff.
3. **STOP-public-export.** `git grep` found no `MeterLifecycleRepository` in `packages/db/src/index.ts` and no `projectMeterDays` in `packages/core/src/index.ts`. Shared exports are coordinator-owned. No unauthorized deep import or package-map edit was introduced.
4. **H-METER-CLOCK / H-HTTP.** Inspected actual accepted `projectMeterDays`: every day has `status: held`, `places: null`, `countedPlaces: null`, and all three candidate allowance numbers null. No authoritative numerical inclusion/paid-extra/grace result exists. Candidate groups and MON1-A's supplied-input oracle are not persisted current counts. Safest choice: no count or price rather than a fabricated `5 of 7`, zero, or inferred bill. The positive M1R-01/02/06/07 acceptance cannot be credited from these APIs as they stand.
5. **H-PRACTICE.** Explicitly preserved. No `jg_session`/shared workspace fallback, global practice total, practice-cookie forgery, static tenant/member, or owner-to-practice adoption. The generic principal bridge exists, but a MON1-R normal-company persisted-session resolver/current summary composition is not already installed. Read authority must come from authenticated session plus current membership and checked SQL, never a query/header tenant claim alone.
6. **H-CI / H-REVIEW.** PostgreSQL/browser proof, exact-commit Claude A/B verdicts, separate acceptance and integration remain required. None is claimed here. No external/regulatory/charging gate opened.

These choices follow Ben's synthetic-only “refuse rather than allow; ... do not count, rather than count” instruction. They do not amend production policy. The specific AGENTS.md authority rule is “Conflicts are blockers for the affected behavior, not permission to choose the weaker rule.”

## Actual commands and results

All check logs are `/private/tmp/jg-mon1-r-*.log`. At most two workers/concurrent check processes; all Vitest invocations explicitly limit workers to two. No socket-dependent suite attempted.

| Command | Actual result |
| --- | --- |
| `pnpm typecheck --concurrency=2` before build | FAIL: missing predecessor private compiled core seam, producing TS2307 and consequent implicit-any errors in existing DB tests. No source changed to hide this. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/meter-lifecycle-repository.test.ts src/meter-repository.test.ts src/meter-persistence.test.ts` before build | FAIL: 3 files could not import unbuilt workspace packages; no tests ran. |
| `pnpm build --concurrency=2` | PASS: 7 successful tasks, 4 cached. Existing Next optional dependency/CSS/tracing warnings and sandbox Turbo IO warning. No site launched. |
| Same DB unit command after build | PASS: 3 files, 21 tests. Existing upstream tests only, not new API/tenant-isolation proof. |
| `pnpm typecheck --concurrency=2` after build | PASS: 7 successful tasks. |
| `LANE_BASE_REF=origin/main pnpm lint` before own registration | FAIL: no registered lane; core purity passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` after receipt-only registration | FAIL: inherited parent source/OpenAPI/contracts/catalogue/migration paths are outside this lane. No grants widened to conceal the parent diff. |
| `LANE_BASE_REF=origin/main pnpm lint` after registration | FAIL: same inherited parent paths outside lane; core purity passed. |
| `pnpm exec turbo run lint --concurrency=2` | PASS: 7 successful tasks, 2 cached. Package checks do not replace the failed root lane guard. |
| `pnpm openapi:check` | FAIL: tsx CLI IPC listener EPERM. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS: same generator/check through socket-free launcher, no generated artifact change. |
| `git diff --check` | PASS. Untracked receipt/lane also checked separately. |

No new unit, PostgreSQL or browser tests were written: source file scope is unresolved and no meter route/page was implemented. In particular, obeyed the instruction not to add a Playwright spec against an absent route/page. This is an explicit incomplete requirement, not a skip or a passing exemption. Existing source/authority/migration PostgreSQL suites and both browser projects remain CI obligations after an actual implementation exists. No migration needed or created; reserved 0228 remains unused. No data migration, compatibility change, alert, new role or privilege change.

## Exact integration handoff, not edits

Once file authority and a checked current-source lookup are supplied, the coordinator must serialize these additive registrations in the same review candidate:

- DB public index: export `MeterLifecycleRepository`, `meterLifecycleReadRequestV1` from `./meter-lifecycle-repository.js`; export `MeterLifecycleReadV1` type and `MeterLifecyclePersistenceError` from `./meter-lifecycle-source.js`. Core index: export `projectMeterJobTimeline`, `projectMeterDays`, `meterLifecycleInputV1` and their result types from `./meter-lifecycle.js`, replacing the predecessor's private compiled import in its owning lane.
- AppModule: import/register the eventual `MeterController` and an explicitly composed `MeterApplication` provider, with a persisted normal-company session authority and existing checked repository. No practice provider while H-PRACTICE remains.
- API export map: an explicit `./meter` entry for the implemented application/contracts/transport factory, with actual `src` type and `dist` runtime targets; corresponding barrel owned by coordinator. These symbols do not yet exist and are not claimed usable.
- OpenAPI: GET `/meter`, GET `/meter/periods/{id}`, strict version-only query schemas, safe unavailable/error responses, no-store semantics. Generate only after actual registration; no phantom path assertions.
- Jobs page composition: import/render eventual `JobsOnTheGo` only on list/bill display; never capture/pricing/approval. A component file alone is not a page. Drill-down navigation needs an explicitly assigned page file, absent from the draft own-file list; otherwise there is no browser destination to test.
- No new SQL/table/catalogue rows can be named truthfully without an assigned checked lookup design. Do not modify old SQL, migration discovery, tenant catalogs, MON1-I consumers, auth bridge or common navigation here. A required lookup migration needs explicit file scope and a same-stem note under `packages/db/migration-notes/`.

M1R-01 through M1R-09: **not completed**; no implementation acceptance claimed. Future executable proofs must cover strict queries/duplicate parameters, canonical IDs, current membership/revocation/expiry, uniform missing/foreign refusal, no-store on success and failure, no mutations in GET, held/null values, trip absent/unknown/present, every removed guard, real accepted source commands through capture/read, persistent receipts across refresh/deep-link/second context and both browser sizes. They must not seed final counts or bypass H-PRACTICE.

Intended conventional commit subject/body: `/private/tmp/jg-msg-mon1-r.txt`. Dispatcher owns any commit/push. This receipt records a blocked build, not completion of the issued product slice.
