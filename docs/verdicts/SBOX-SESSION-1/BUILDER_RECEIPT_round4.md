# SBOX-SESSION-1 — builder receipt, round 4

7 October 2026 · branch `codex/sandbox/sbox-session-1` · PR #109.
Base HEAD: `80338ba4c073d58288621bdafc7066c05ed88741`, unchanged by this builder.
Repairs the outstanding VALUE-1 fixture from the independent Claude Opus
**REPAIR** verdict bound to `a00d20f109d855fc1c6f568c6ec0c79a350e7894`.
All earlier work is retained; this is builder evidence, not a new independent
verdict or technical acceptance.

Read: AGENTS.md rev 3.0, BUILD_PLAN.md §2.4 C1–C8 / simulation and authorization
contracts / M0-6L, authentication-v1.md, SBOX-1 records, and earlier task receipts.
The original `SBOX-SESSION-1.txt` and round-2/3 orders were located and read at
`/Users/benharwood/.local/share/full-steam/jg-orders/` (respectively
`SBOX-SESSION-1.txt`, `SBOX-SESSION-1-r2-opus-repair.txt`, and
`SBOX-SESSION-1-r3-opus-repair.txt`), along with the round-4 order.
The current explicit authorization is Ben's 7 October “Add the one file”
instruction, reflected in the existing lane. No lane registry edit was made.

## Exact change

Only code change: `apps/web/e2e/VALUE-1.spec.ts`, line 9.
Replace `browser.newContext()` with
`browser.newContext({ storageState: await page.context().storageState() })`.
Remove `await secondPage.request.post("/api/session");` from that second context.
It now uses the first context's issued session, exactly as SBOX-1.spec.ts:19,
while retaining a separate browser context reading the persisted result (C1).

The `value-recorded-gross` assertion remains exactly
`toHaveText("£1,320.00",{timeout:45_000})`.
Every other byte is unchanged, verified against HEAD by an exact two-substitution
comparison. No assertion added, removed or loosened; no retry or timeout change.
Application code, session ownership/stranger denials, migration 0094 and all
prior regression files remain unchanged. The other repository change is this
receipt, inside `docs/verdicts/SBOX-SESSION-1/**`.

The integrator already merged main in `e6de64c` and added the exact VALUE-1 lane
path in `80338ba`; those are not this builder's changes. Per the supplied dispatch,
CI run **37653803758** on 80338ba passed every PostgreSQL suite and
SBOX-SESSION-1/UIWIRE-7 in both projects; VALUE-1 alone failed twice (166 passed).
That is supplied CI evidence, not a local execution or a green result for this
uncommitted repair.

## Commands actually run

Node **24.17.0**, cached pinned pnpm **10.28.1**, existing installed dependencies.
All check commands below use `PATH=/private/tmp/sbox-tools:$PATH` to select the
existing cached launcher. No install/download or clean-install claim.
Detailed check logs: `/private/tmp/sbox-round4-*.log`.

| Command | Exit / observed result |
|---|---|
| `pnpm typecheck` | **0**, seven tasks succeed, four cached; DB/API/web freshly checked. |
| `LANE_BASE_REF=origin/main pnpm lint` | **0**, seven package tasks succeed, four cached; boundary checks passed. No self-comparison refusal. |
| `pnpm lint:lanes` | **0**, sbox-session-1 lane passed; no self-comparison refusal. |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/VALUE-1.spec.ts` | **0**, two cases discovered, one each in mobile-360 and desktop. Discovery only. |
| `pnpm --filter @jobguard/web test` | **0**, eight files / **63 passed**. |
| `pnpm build` | **0**, seven tasks succeed, four cached; DB/API compiled and real Next production build freshly executed. |
| `pnpm openapi:check` | **1**, tsx CLI's IPC listener blocked with `EPERM` by the sandbox. |
| From apps/api: `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` | **0**, same real generator verifies the unchanged artifact without the CLI IPC listener. |
| Exact authorized-diff comparison (Python against HEAD) | **0**, only the two substitutions; line count, assertion and timeout preserved. |
| `git diff --check` | **0**, whitespace check. |

Lane comparison base is `6566abc34f74629f2c4316da3bddcda2dde09a51` (origin/main),
not HEAD. Final receipt-inclusive `pnpm lint:lanes` and `git diff --check` both exited **0**.
Turbo emitted sandbox cache I/O warnings; the successful task exit codes above
are the observed results, with cache replay distinguished from fresh execution.
An initial default-launcher `pnpm --version` probe attempted automatic manager
selection and reported failed registry verification; it did not install packages.
The existing cached launcher returned **10.28.1**, exit **0**, and was used for
all checks. Exploratory order-file searches were interrupted (**130**) after
narrowing the location; the exact authoritative order files were then read
successfully. These probes/searches are not test evidence.

## Carried follow-ups and remaining gates

Recorded only, not built:

- Rate limit and cleanup for unauthenticated `POST /api/session`, which writes
  one session and three generated jobs per call, before public availability.
- M0-6L must re-point real-tenant capture through its authenticated principal bridge.
- Separate card for the existing recovery-case audit actor on main using the
  client-supplied `reviewerRef` (`packages/db/src/recovery-case-repository.ts:67`).

No data migration, backfill, compatibility change, provider/data-flow change,
new operational alert, money/AI policy change or live-model evaluation applies
to this test-fixture repair. No database migration was applied.

Not run: actual browser suites, PostgreSQL integration/migration suites and full
root `pnpm test`, which includes database/listener-dependent checks. The dispatcher
states this sandbox cannot bind localhost or start PostgreSQL and assigns those
suites to GitHub CI after its push. Discovery and unit tests do not prove the
browser journey. Full CI must pass on the dispatcher's new commit, including
VALUE-1 in both projects and all earlier mandatory regressions; a different
model must record a verdict bound to that exact commit and a separate actor
must record acceptance. No PASS, acceptance, merge or release is asserted.

No git writes, commit, push, merge or PR creation; no real data, live provider,
spending, real send, production mode or decision approval. Intended conventional
commit subject/body is at `/private/tmp/jg-msg-sbox-session-1.txt`:
`test(value): reuse practice session in second browser context`.
