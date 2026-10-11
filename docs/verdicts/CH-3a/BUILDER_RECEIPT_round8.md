# CH-3a builder receipt — round 8, 7 October 2026

Branch `codex/sandbox/ch-3a`, this worktree, existing PR #98. Starting HEAD:
`0999b7ab4383a98ca1fc512fd2def16c049fd10f`. Changes remain uncommitted for the
dispatcher. This records builder evidence, not an independent verdict or acceptance.

## Change → test

| Requested change | Result and verification |
| --- | --- |
| Lane amendment | Add the exact `packages/db/test/shared-money-origin.integration.test.ts` path and the separately requested `BUILD_PLAN.md`; replace the CH-3a migration path with `0095_job_parties.sql`. Deterministic comparison against HEAD proves every other lane and registry field unchanged. The existing `docs/verdicts/CH-3a/**` grant permits this receipt. |
| Restore SH-1 rollback proof | Preserve the authorised party-bound adoption fixture and invalid-party refusal. A separate valid adoption runs through the dispatcher, checks that the job, party binding, current-party projection, commercial track and imported baseline all exist inside its transaction, then throws a specific synthetic error. It checks the exact error and absence of all five effects after rollback, plus receipt, exact authorisation, Decision and audit event. The invalid-party case also checks absence of a binding. The test collects and has zero TypeScript diagnostics; PostgreSQL execution remains for CI. |
| Correct earlier receipt | `BUILDER_RECEIPT_ci-repair-37306387411.md` now acknowledges that substituting invalid-party refusal weakened the earlier post-write rollback proof. Historical commands, results and migration numbers remain historical facts. |
| Renumber migration | Rename 0051 to 0095 with byte-identical SQL, SHA-256 `e601e9adefe35e74ac9b579856462f747c0a072e2b431a8d48c53f82502fda7e`. Register it last, after 0053; update the runner's backfill-mode filename check, migration notes, party-test lookup, bootstrap description, UIWIRE-12 range and restore-tool assertions. SH-1 seeds its upgrade fixture before **0053**, then `migrate` installs 0053 and parties. The registry still contains **45** migrations, so numeric count assertions remain 45. Static comparison verifies every SQL file is registered once in numeric order. |
| Ledger amendment | Add exactly the supplied paragraph to BUILD_PLAN §12.2 after “Each repair's specification…”. No SBOX-SESSION-1 amendment is present there. Static comparison verifies no other BUILD_PLAN changes. |

## Commands actually run

Node `v24.17.0`; installed, cached pinned pnpm `10.28.1`, selected with
`PATH=/private/tmp/jg-ch3a-bin:$PATH`. No install or dependency download command
was run. Existing dependencies and Turbo cache were used; this does not prove a
clean install. Logs are `/private/tmp/jg-ch3a-*.log`.

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | Seven tasks passed, four cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passes. Lane guard rejects the deleted `packages/db/migrations/0051_job_parties.sql`; package lint is not reached. |
| `pnpm lint:lanes` | 1 | Same deleted-path rejection; **not** a self-comparison refusal. Local checking includes the deletion against HEAD, while the requested lane now grants only 0095. No extra permission or guard change was added. |
| `pnpm exec turbo run lint` | 0 | All seven package lint tasks passed, two cached. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Passed. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Passed. |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts test/verify-evidence-pack-cli.test.ts` | 0 | Two files, seven unit tests passed. |
| `pnpm --filter @jobguard/core test` | 0 | 76 files, 644 tests passed. |
| `pnpm --filter @jobguard/web test` | 0 | Ten files, 71 tests passed. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | 0 | 15 files, 111 tests passed. The socket-dependent health test is deferred to CI. |
| `node --test tools/*.test.mjs` | 0 | 42 tests passed. |
| `pnpm build` | 0 | Seven tasks passed, four cached, including Next compilation and page generation. Local compilation only; no deployment. |
| `pnpm openapi:check` | 1 | Sandbox denies tsx CLI's IPC socket (`listen EPERM`). |
| `node --import tsx src/generate-openapi.ts --check` (in `apps/api`) | 0 | Same OpenAPI generator and comparison pass without the CLI IPC server. |
| `pnpm --filter @jobguard/db exec vitest list test/shared-money-origin.integration.test.ts test/job-parties.integration.test.ts test/UIWIRE-12.integration.test.ts test/demo-bootstrap.integration.test.ts` (initial) | 1 | Duplicate declaration in the new rollback case; corrected without changing an assertion. |
| Same `vitest list` command (final) | 0 | All four affected DB suites collect, including the separate valid post-write rollback test. Collection does not execute PostgreSQL assertions. |
| `node --input-type=module` (TypeScript API, changed SH-1 test) | 0 | Repository compiler options; zero diagnostics for the changed SH-1 integration test. This is not a typecheck claim for all DB tests. |
| `node --check packages/db/tools/synthetic-restore.mjs` | 0 | Syntax passes. |
| `node /private/tmp/jg-ch3a-verify.mjs` | 0 | Exact lane/ledger changes; identical SQL; all 45 migrations registered in order. Proposed final tree fits the lane against origin/main. This supplemental inspection does not replace the failed official lane checks. |
| `git diff --check` | 0 | No whitespace errors. |

The deleted 0051 path is absent on `origin/main`. The supplemental final-tree
inspection passes; official lane checks must run again after the dispatcher
commits, and in CI. Their current failures are recorded above.

## Not run and remaining gates

`pnpm test:db`, `pnpm test:migrations`, the synthetic restore rehearsal,
`pnpm test:e2e`, socket-dependent free-port unit tests and the API health test
were not run: this sandbox cannot bind localhost or start PostgreSQL. The root
`pnpm test` was consequently not run. PostgreSQL and browser suites run in GitHub
CI after the dispatcher pushes; no execution result is claimed for the restored
rollback, upgrade/backfill or restore assertions. AI behaviour is unchanged, so
model evaluation is inapplicable to this revision.

No database was migrated or reset locally. This branch-only filename change does
not relabel a database that already recorded 0051. SQL, grants and production
behaviour are unchanged; no new operational alert is introduced. Lower-numbered
unmerged PRs that merge first require CH-3a to merge afterward or renumber again,
as the ledger amendment states. Independent review bound to the dispatcher's
exact commit, separate technical acceptance and CI remain pending.

Synthetic fixtures only. No live provider, spending, real send, production
operation, policy approval, push, merge, PR creation or Git-writing command was
performed. Earlier work and assertions are retained; this revision restores the
identified missing guarantee.

Intended commit message (subject and body) is written to
`/private/tmp/jg-msg-ch-3a.txt` for the dispatcher:
`fix(db): restore CH-3a rollback proof and renumber job parties to 0095`.
