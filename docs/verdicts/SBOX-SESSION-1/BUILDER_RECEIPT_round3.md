# SBOX-SESSION-1 — builder receipt, round 3

7 October 2026 · branch `codex/sandbox/sbox-session-1` · PR #109.
Repairs the independent Opus **REPAIR** verdict bound to
`ed3769922b5ebd7d555f38bc3f2deee5acc3ab5c`. HEAD remains that commit;
changes are in the working tree for the dispatcher. All earlier work is retained.

**Status: permitted repairs implemented; merge remains on hold.**
`apps/web/e2e/VALUE-1.spec.ts` is outside the lane and was deliberately skipped.
DB/browser execution and a new independent verdict remain outstanding.

Authority: Ben's 5 October “build it” order (`SBOX-SESSION-1.txt`), as restated
in this dispatch: each practice session's data stays separate, together with
the round-2 order and receipt. The original order file was not located in the supplied
workspace searches; this receipt relies on the dispatch restatement and does
not claim an independent reading of that file. AGENTS.md, applicable BUILD_PLAN.md contracts/C1–C8,
the 0094 dispatch amendment, lane and round-2 receipt were inspected.

## Findings and repairs

| Finding | Result |
|---|---|
| P1(a): isolation browser fixture fails before pack checks | Uses `practice-owner` and real session-bound rate plus job-linked supplier invoice/delivery references. Creates the requirement and purchase-order draft needed by delivery intake. All original stranger denial, creator read/reload and response assertions remain; extra setup assertions added. No retries or timeout changes. |
| P1(b): owned pending proof upload gets 404 instead of 422 | `complete` checks either evidence-object or upload ownership under the authorized tenant/job. Owned pending uploads reach the existing `PROOF_INVALID` mapping; foreign/unknown IDs remain `NOT_FOUND`. Finalize and invalidate retain their specific ownership checks. `UIWIRE-7.spec.ts` is unchanged. |
| P1(c): VALUE-1 second context creates a stranger session | **Skipped exact path: `apps/web/e2e/VALUE-1.spec.ts`.** It is not allowed by `sbox-session-1`; no lane expansion made. Coordinator must authorize that path, then use `browser.newContext({ storageState: await page.context().storageState() })` and remove that context's `POST /api/session`, exactly as the PR's `SBOX-1.spec.ts:19` already does. Keep the £1,320 persisted-value assertion and its existing timeout. Code cannot permit this stranger read without breaking session isolation. |
| P2: evidence-pack approval/list lose material scope | Authorization now creates the scoped repository used by every operation: list, generate, approveAttachment, inspect, download, and follow-up lists. No unscoped instance remains. Added real PostgreSQL application regression with accepted quote, verified proof bytes, session-owned rate/requirement, invoice/delivery and merchant case; generate → approve → valid list, inspect/export integrity, all five stranger operations denied, creator view unchanged. Existing two-session material/isolation tests are retained. |
| P3-1: upgrade fixture assumes 0094 is last | Find `0094_practice_session_ownership.sql` by filename, fail if absent, and use migrations preceding that index for both schema setup and migration history. Later migrations cannot silently pre-apply ownership. |
| P3-4: exact-BEGIN adapter contract | One-line comment at the installation point says only withTenant's exact BEGIN installs the digest; other callers run unscoped and fail closed. |

## Tests first and actual execution

Before implementation edits, new API regressions ran against unchanged
`ed37699` implementation: **6 failed / 13 passed**, exit **1**. Owned pending
proof expected `PROOF_INVALID` but received `NOT_FOUND`; five parameterized
pack operations exposed missing scoped bindings, including follow-up lists.
Exact output is preserved in `TESTS_FIRST_round3.log` alongside this receipt.
After repair the identical selection passed **19/19**, exit **0**.

The PostgreSQL regression was also written before the implementation repair,
but could not execute here. It is **not claimed red or green locally**. The
browser red evidence is the supplied verdict/CI run **37613628587** on
`ed37699` (**6 failed / 162 passed**), not a local rerun. The new browser source
and PostgreSQL source require real CI execution; typechecking/discovery is not
behavioral proof.

Node **24.17.0**, pinned cached pnpm **10.28.1**, already-installed dependencies;
no download or clean-install claim. Commands use `PATH=/private/tmp/sbox-tools:$PATH`.
Logs: `/private/tmp/sbox-round3-*.log`.

| Command | Result |
|---|---|
| `pnpm --filter @jobguard/api exec vitest run src/evidence-pack.application.test.ts src/proof/proof.application.test.ts` | Before **1**, 6 failed/13 passed; after **0**, 19 passed. |
| `pnpm typecheck` | **0**; seven tasks, four cached; DB/API/web freshly checked. |
| `LANE_BASE_REF=origin/main pnpm lint` | **0**; seven tasks, four cached. No self-comparison refusal; base `73a643bfd5357b5ce4554f3c5a22874326604821`. |
| `pnpm lint:lanes` | **0**; authorized lane comparison, including working-tree changes. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | **0**; 16 files, **335 passed**. Listener-dependent health test excluded from this local selection only. |
| `pnpm --filter @jobguard/web test` | **0**; eight files, **63 passed**. |
| `pnpm --filter @jobguard/db exec vitest run test/verify-evidence-pack-cli.test.ts` | **0**; **4 passed**, non-DB unit tests. |
| `node --test tools/*.test.mjs` | **0**; **42 passed**, none skipped. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/practice-session.integration.test.ts` | **0**, including final source. Types only. |
| `pnpm build` | **0**; seven tasks, four cached; DB/API compiled and Next production build freshly executed. |
| `pnpm openapi:check` | **1**; sandbox blocks tsx CLI IPC listener with `EPERM`. |
| From `apps/api`: `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` | **0**; same real generator verifies unchanged OpenAPI artifact without CLI IPC listener. |
| `pnpm --filter @jobguard/web exec playwright test --list SBOX-SESSION-1.spec.ts UIWIRE-7.spec.ts VALUE-1.spec.ts` | **0**; eight tests discovered across both projects. Discovery only. |
| `git diff --check` | **0**; whitespace validation. |

Final receipt-inclusive `LANE_BASE_REF=origin/main pnpm lint` and
`pnpm lint:lanes` both exited **0**; final `git diff --check` exited **0**.

## Scope, carried follow-ups and gates

All changed paths are already authorized; records are under
`docs/verdicts/SBOX-SESSION-1/**`. No lane/config, dependency, migration SQL,
OpenAPI schema, money policy, provider or AI changes. No new operational alerts
or data backfill. No local migration applied. Round-2 0094 and its existing
rollback/forward-fix notes remain unchanged. Application repairs need no data
migration; authenticated session scope remains the application trust boundary,
with PostgreSQL RLS underneath it. No permission for cross-session access was
added.

Carried follow-ups, **recorded only, not built**:

- Rate limit and cleanup for unauthenticated `POST /api/session`, which writes a
  session and three jobs, before public practice availability.
- M0-6L re-pointing real-tenant capture through its authenticated principal bridge.
- P3-3: separate card for client-supplied `reviewerRef` used as recovery audit
  actor on main, at `packages/db/src/recovery-case-repository.ts:67`.

Not run: PostgreSQL integration/migration suites, actual browser suites and
listener-dependent health test. The dispatch forbids local PostgreSQL/listeners
and assigns these to GitHub CI. Full root `pnpm test` is not claimed green.
No live-model evaluation applies: no prompt/model/parser change.

Before merge: coordinator's authorized VALUE-1 fix, full CI green on the new
commit (including both projects for SBOX-SESSION-1/UIWIRE-7/VALUE-1 and the
new PostgreSQL approval regression plus existing two-session tests), independent
cross-model verdict bound to that commit, and separate technical acceptance.
Dependency-review remains CI's responsibility; the supplied verdict attributes
its advisories to PR #113, not this repair.

No git writes, commit, push, merge or PR creation. No real data, live provider,
real send, spending, production processing, policy/decision approval, deployment
or release. Synthetic attachment-approval tests are fixture behavior only.
This receipt is builder evidence, not acceptance or an independent PASS.
Intended conventional commit subject/body is at
`/private/tmp/jg-msg-sbox-session-1.txt` for the dispatcher.
