# SBOX-SESSION-1 — builder receipt, round 2

7 October 2026. Repairs the independent Claude Opus **REPAIR** verdict bound to
`a54742061a7a2f0b74e98d86fac9b79c38da58b4`, on the same
`codex/sandbox/sbox-session-1` worktree / PR #109. Earlier work is retained.
Authority is Ben's 5 October “build it” decision, restated in this dispatch:
keep each synthetic practice session's data separate. The original order text
file was not found in the supplied workspace; this receipt does not claim to
have inspected it independently of the dispatch.

This is builder implementation/test evidence, **not technical acceptance or a
new independent verdict**. HEAD remains the reviewed commit; the dispatcher
will create the repair commit. No git writes, push, merge or PR creation; no
live provider, real send, spending, production-mode processing or decision
approval. All fixtures are synthetic.

## Finding → fix → test

| Finding | Fix | Test / evidence |
|---|---|---|
| Blocking `42P08` in decision-inbox ownership fixture | Bind `subject_ref` to `$6`, with its own argument, while `$3` remains the UUID `job_id`. Fixture only; every existing inbox assertion is unchanged. | The existing failing SQL ownership regression predates this repair and remains intact. The reported CI failure is the pre-fix evidence; local PostgreSQL execution is forbidden by the dispatch. Its TypeScript source passes explicit checking. CI must execute it. |
| P2: shared practice material catalogue reveals/stale-conflicts another session and changes its projection | Extend **unmerged 0094**, with immutable session-digest ownership on merchants, SKUs, rates, aliases and pack conversions. Restrictive policies filter catalogue SQL under the existing tenant policy. Requirement guards reject mismatched job/SKU/session links. Practice material calls install the authenticated digest transaction-locally before business SQL. Purchase-order pricing and evidence-pack supplier agreements consume that same scope. | Written first: real-PostgreSQL two-session regression in `practice-session.integration.test.ts`, plus an API test that first failed because none of the three material operations installed a digest. Evidence-pack consumer regression also first failed. Final runnable API suite passes. PostgreSQL regression requires CI. |
| P3: delivery GET escapes typed practice errors | Catch delivery-view errors and pass them through the existing `practiceFailure`, retaining other error behavior. | Written first: actual Next GET handler and actual `practiceFailure` loaded/transpiled in the API transport test, with framework/application doubles. Missing/invented → 401; stranger → 404; authenticated success retained. It first failed on escaped `UNAUTHENTICATED` and now passes. Added `/quotes/delivery` denial assertions to the existing real browser regression for both projects; CI must execute them. |

The PostgreSQL material test covers A creating M/S, B independently creating
M/S at version 0 with a different description, isolated identities/versions,
foreign-SKU denial, A's overlapping later rate/pack revisions leaving B's entire
view unchanged, and B's own version-1 update remaining independent. It also
checks wrong-session reads, digest storage, immutable ownership even for admin
writes, runtime mutation denial, pooled scope cleanup and six material-table
catalog/grant checks. Supplementary coverage verifies no attribution of a
pre-0094 merchant and preserves non-practice tenant-wide stale conflicts,
revision identities and original descriptions. The earlier real-tenant material
integration tests remain unchanged and mandatory.

The material repository itself is outside this lane and is **unchanged**. The
per-call pool adapter lives in the existing `packages/db/src/practice-session.ts`
and implements the repositories' promise-based connection contract. It adds a
parameterized, transaction-local setting immediately after BEGIN, before the
existing tenant/business queries. Commit/rollback release that setting. It takes
an authenticated digest, never the bearer token. No new privileged routine,
role elevation, table grant, commercial effect or business network call.

All repair source/test paths were already allowed in `sbox-session-1`. The only
additional allowlist entry is the exact round-2 receipt path explicitly ordered
by the user; no additional implementation path or directory wildcard is added.

## Commands actually run

Node **24.17.0**, cached pinned pnpm **10.28.1**, dependencies already installed.
Commands use `PATH=/private/tmp/sbox-tools:$PATH`; no install/download or clean-
install claim. Logs are `/private/tmp/sbox-round2-*.log`. Turbo cache replay is
identified below, rather than represented as fresh execution.

| Command | Exit / result |
|---|---|
| `pnpm --filter @jobguard/api exec vitest run src/practice-session.test.ts -t 'material calls install'` before repair | **1**; expected regression failure: zero scoped transactions versus three required. Other cases excluded by this targeted red command only. |
| `pnpm --filter @jobguard/api exec vitest run src/practice-transports.test.ts -t 'Next quote delivery GET'` before repair | **1**; actual GET let `UNAUTHENTICATED` escape. |
| `pnpm --filter @jobguard/api exec vitest run src/evidence-pack.application.test.ts -t 'derives a stable'` before repair | **1**; consumer did not request the digest-scoped pool. |
| `pnpm exec turbo run build --filter=@jobguard/db...` | **0**; DB freshly compiled; core/storage cache replay. |
| `pnpm typecheck` | **0**; seven tasks succeed, four cached; DB/API/web freshly checked. |
| `LANE_BASE_REF=origin/main pnpm lint` | **0**; valid comparison base in this environment, no self-comparison refusal. Boundary checks and all seven package tasks succeed, four cached. |
| `pnpm lint:lanes` | **0**; existing lane and valid comparison range. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | **0**; 16 files, **327 tests**, no skips in this full runnable API selection. |
| `pnpm --filter @jobguard/web test` | **0**; eight files, **63 tests**. |
| `pnpm --filter @jobguard/db exec vitest run test/verify-evidence-pack-cli.test.ts` | **0**; four non-DB unit tests. |
| `node --test tools/*.test.mjs` | **0**; **42 tests**, none skipped. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/practice-session.integration.test.ts` | **0** on initial and final expanded test source. This checks types, not PostgreSQL behavior. |
| `pnpm openapi:check` | **1**; tsx CLI cannot bind its IPC pipe (`EPERM`) in this sandbox. |
| From `apps/api`: `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` | **0**; same actual generator verifies the existing artifact without the CLI IPC listener. No OpenAPI artifact/schema change. |
| `pnpm --filter @jobguard/web exec playwright test --list SBOX-SESSION-1.spec.ts` | **0**; discovers the regression in both `mobile-360` and `desktop`. Discovery only. |
| `pnpm build` | **0**; seven successful tasks, four cached; DB/API compilation and actual Next production build freshly executed. |
| `git diff --check` | **0**; whitespace validation. |

Final receipt-inclusive `LANE_BASE_REF=origin/main pnpm lint` and
`pnpm lint:lanes` both **exit 0**. Final expanded PostgreSQL test-source typecheck
also **exits 0**. The comparison base is
`a5ed99a8f7b4e76925c35297dda0d06d6f8834ab`; there is no self-comparison refusal.

One documentation-edit attempt used an incorrect relative directory and exited
before changing files; the edit was rerun from the worktree. This is not test or
implementation evidence. Existing tool commands also emit sandbox cache I/O
warnings; successful exit codes above remain the observed results.

## Migration, compatibility and remaining holds

0094 is amended in place, as ordered; its number, registration and the earlier
job/session implementation remain. Existing material rows are explicitly left
unbound: the nullable column is added before setting the default for new rows.
FORCE RLS, migration ownership, runtime SELECT/INSERT grants and forbidden
UPDATE/DELETE/TRUNCATE remain unchanged in kind (C4). Non-practice material callers
retain their original tenant catalogue path. Practice callers cannot claim legacy
rows. MIGRATIONS.md and the authentication contract document the scope and the
existing forward-fix strategy: preserve ownership, revoke affected sessions and
repair through a reviewed later migration if needed. No migration was applied
locally. As with tenant RLS, a compromised runtime credential able to forge
session settings is outside the authenticated application trust boundary.

**Not run:** PostgreSQL integration suites (`pnpm test:db`), fresh/upgrade/privilege
migration suites (`pnpm test:migrations`), actual Playwright suites
(`pnpm test:e2e`, both projects), and the listener-dependent API health test. The
dispatch says this sandbox cannot start PostgreSQL or bind localhost and assigns
DB/browser execution to GitHub CI after dispatcher push. Those source tests,
assertions and mandatory CI scripts are preserved. The full root `pnpm test`
includes those unavailable suites and is not claimed green. No prompt, model,
parser or AI output policy changed, so no new eval/live-model run was needed or
performed. No live provider or external integration was tested.

**Follow-ups explicitly deferred, not built:**

- Verdict P3-4: rate limiting and cleanup of expired sessions' generated jobs for
  unauthenticated `POST /api/session`, before public practice availability.
- Verdict note 5: M0-6L must re-point real-tenant capture through its authenticated
  principal bridge / verified tenant context. This repair supplies no live
  identity authority.

Verdict note 6 is an existing dependency-review issue on main and is unchanged;
no dependency/lockfile repair is bundled here.

Intended conventional commit subject/body is written to
`/private/tmp/jg-msg-sbox-session-1.txt` for the dispatcher. Before acceptance,
CI must pass the unchanged full checks, real PostgreSQL ownership/material and
migration regressions, and both browser projects; a different model must record
an independent verdict bound to the dispatcher's repair commit, followed by a
separate actor's acceptance. No builder acceptance, independent PASS, push,
merge or release is asserted.
