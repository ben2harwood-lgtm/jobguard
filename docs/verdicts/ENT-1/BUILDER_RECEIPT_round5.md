# ENT-1 builder receipt — round 5 (7 October 2026)

Builder: Codex. Branch `codex/sandbox/ent-1`, existing PR #100. Repair is an uncommitted working-tree diff on **3d6e6c7bbf61e44fa42e6aa6bb561e3d3852bccc**. No git add, commit, checkout, push, merge or PR creation. The dispatcher supplies the commit. The supplied Opus REPAIR verdict and green CI apply to the old head, not this diff. Independent review and separate technical acceptance remain outstanding.

Read AGENTS.md rev 3.0, BUILD_PLAN.md §2.4 C1–C8, contractor contracts and the ENT-1 card, plus earlier receipts. Keep the original ENT-1 implementation and rounds 2–4. This round touches only the admin component, its unit tests, contractor route and route tests, ENT-1 browser spec, and this receipt. All are already in the ent-1 lane. No registration/shared-file overlap or lane expansion.

## Repairs and evidence

- **P2-1, failed first read:** Start is initially absent and becomes available only after an actual `UNAUTHENTICATED` read. Other failures with no view say “The persisted organisation could not be loaded.” Reload reads the existing cookie. Loaded-view failures retain the earlier stale locks and accurate out-of-date message.
- **P2-1, practice start:** POST start with the current cookie first. Only an explicit HTTP error response carrying `UNAUTHENTICATED` permits one session bootstrap and one start retry. A per-mount attempt guard also prevents repeating a session bootstrap whose own outcome is unknown. Transport failure, unreadable JSON or invalid workspace output cannot trigger session creation. A failed start says “Practice start was not confirmed”; Start stays absent until an authoritative recovery read permits it. Recovery uses GET with the same cookie, never an automatic start retry.
- **P3-1:** parse malformed JSON before composing the application; return the existing `contractor-error.v1` envelope with 422 `INVALID_COMMAND`, `recoverable:false`. Both start and command route tests assert no application action call.
- **P3-2:** advance the error-focus counter in the invalid-rules catch and start catch. Repeated identical rejections regain focus, with a unit regression for each. Leave `owner` on `grant.create` to ENT-10.

New handler tests cover first-load transport failure, 503 and unreadable JSON; pending-read gating; start with an existing session; committed start with a lost/unreadable response for existing and fresh sessions; repeated unknown session bootstrap; and repeated error focus. They assert the same tenant on recovery/remount, zero session POSTs with an existing session and at most one with a fresh session. These use the real component handlers with a scripted server/hook harness, not a live database.

Two added browser **FAULT TESTS (transport abort)** collect in mobile-360 (360×800) and desktop (1280×800): (a) create practice, persist an edit, abort the first GET after page reload, then recover the identical tenant/revision with zero additional session POSTs; (b) let real start commit through `route.fetch()`, abort its successful response, then recover the same tenant on GET/full reload, with exactly one session POST in the fresh journey. No JobGuard success response is fabricated. Both retain banner/overflow checks; (a) also checks Reload keyboard focus and 44px targets.

Existing loaded-view unit setups now mount/read persisted state instead of clicking Start before a read. The existing deferred-read unit race first establishes an unauthenticated read, then delays a duplicate mount read until after Start; its earlier completion-order assertions remain. The browser delayed-401 setup now asserts Start absent while that first read is held and releases it before starting, as required by the new gate; all its earlier success, edit, reload, tenant, banner and overflow assertions remain. A TypeScript AST multiset comparison against 3d6e6c7 confirmed all earlier expect calls remain verbatim apart from whitespace: component tests **58**, route tests **22**, browser spec **276** (counts include nested expect calls). No assertion deleted, weakened or skipped; no timeout added or increased.

## Commands actually run

Dependencies were supplied; no install command. Node **24.17.0**, cached pinned **pnpm 10.28.1** through the existing `/private/tmp/jg-ent-1-bin/pnpm` launcher, prepended to PATH for checks. The initial default `pnpm --version` failed its registry/signature lookup because fetch was unavailable; no override or download/install was performed. Logs: `/private/tmp/jg-ent-1-round5-*.log`.

| Command | Exit | Actual result |
| --- | ---: | --- |
| `pnpm --filter @jobguard/web exec vitest run app/admin/contractor app/api/contractor` before implementation | 1 | **11 failed, 25 passed**, while both implementation files were byte-identical to 3d6e6c7. Reproduces seven P2 cases, both repeated-focus cases and both malformed-JSON 503s. The preliminary red run used an incomplete new client fixture; the corrected red run independently reproduced focus failing on the second rejection. `red-web.log` records that corrected run. Browser faults were written before implementation but could not run here. |
| Same targeted command after implementation | 0 | **36 passed**; subsequent full web run includes the added bootstrap-attempt regression. |
| `pnpm --filter @jobguard/web test` (initial and final route ordering) | 0 each | **100 passed / 11 files**. |
| `pnpm typecheck` (initial and final) | 0 each | 7 successful tasks; 6 cache replays, web executed. |
| `LANE_BASE_REF=origin/main pnpm lint` (initial and receipt-inclusive final) | 0 each | Real ent-1 branch/base lane comparison passed against f9de3ad; 7 successful lint tasks, 6 cache replays. No self-comparison refusal. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (initial and receipt-inclusive final) | 0 each | ent-1 boundary passed, including the new receipt. |
| `pnpm build` (initial and final route ordering) | 0 each | 7 successful tasks, 6 cache replays; production Next web executed, compiled, types/pages/traces completed. Existing workspace-root and Turbo cache IO warnings were non-fatal. |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/ENT-1.spec.ts` | 0 | **20 cases**, ten in each viewport. Collection only. |
| `pnpm openapi:check` | 1 | Sandbox EPERM on the tsx CLI IPC socket; generator did not execute through that launcher. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator without CLI socket; committed OpenAPI matches. |
| `node /private/tmp/jg-ent-1-round5-source-check.mjs` | 0 | Earlier assertions preserved; migration 0054, session route and lane registry byte-identical to 3d6e6c7. Deterministic source check, not model review. |
| `git diff --check` | 0 | Clean. |

## Boundaries and remaining gates

No SQL, schema, API contract, provider, money, policy or approval change. Migration **0054_contractor_organisation.sql** and its registration stay unchanged. No data migration/backfill; code rollback or forward fix only. No new operational alerts. Earlier Origin, role/scope, idempotency, subject identity, stale-lock, read-generation, immutable contract and Account accessibility guarantees remain. SQL client_approver extra.approve denial remains for ENT-5; owner-grant policy remains for ENT-10. Affected invariants: C1 persisted recovery, C5 uncertain-outcome reconciliation, C7 accurate status/error focus, and versioned HTTP errors.

**Not executed locally:** PostgreSQL/migration suites, browser journeys, root `pnpm test` (includes PostgreSQL), fresh install, CI dependency/secrets jobs. The sandbox cannot bind localhost/start PostgreSQL; the dispatcher must run full CI and both ENT-1 browser projects after committing/pushing. No current-diff DB/browser pass, trace or screenshot is claimed. No model/prompt/extraction change, so AI evaluation is inapplicable. Synthetic data only; no live providers, spending, real sends, production mode, decision approvals, deploy/release or self-acceptance. All real-data/commercial release gates remain unchanged.

Intended conventional commit subject/body is at `/private/tmp/jg-msg-ent-1.txt`. Exact-new-commit CI, independent recorded verdict and separate technical acceptance are still required.
