# LP-6b repair WIP — 4 November 2026

**Not merge-ready. Final four-shard database run and supplementary browser run are in progress. Guard and policy decisions remain with Ben.**

Only `codex/sandbox/lp-6b-repair-wip` is being pushed. The PR branch
`codex/sandbox/lp-6b-withtenant` remains at
`6c7ded22c533c7d7660beb640144934d8c7f6e53`. Main
`f78c8168449a08b3db6719a3388d9c23d325ac14` was merged cleanly, without repair
behavior in the merge commit, as `4497621853cdccde351c8997d10af3b30667eeb4`
(122 commits). The final repair source is frozen at
`a7fa979aa55749529f676d77db410b988fabd9a7`; subsequent report commits do not
change the tested source. Earlier checkpoints were pushed as the work progressed.

## Repair scope

- Named retained binding deferrals are documented individually in
  `docs/contracts/lp-command-binding-design-v1.md`, with LP-6c/LP-6d closure
  owners. Identity SSO, OIDC and SSO-required routines, the shadow persistence
  sink and refusal-only audit logging retain their existing SQL authorization.
  Customer-portal-message and job-sources-isolation need no separate exception.
  No `app` usage or `bind_request` execution was granted to `jobguard_identity`.
- Forward migration `0584_lp6b_effective_session_actor.sql` changes the existing
  authority helper to use the contractor session's effective actor and retain
  membership/revocation checks. Its proof classifies the added existing-routine
  call. A populated own-step upgrade test reproduces the old mismatch, applies
  0584 alone, verifies rows/types/privileges, tests stale/foreign refusal and
  reruns the migrator twice. No new routine, privilege, function `SET app.*`
  clause or fingerprinted-table column was introduced.
- Evidence snapshots begin repeatable-read writable, bind, then become read-only
  before tenant setup. Worker tests use the existing queued context. Browser
  request fixtures refresh authenticated contexts after worker switches.
- Binding and derived-authority `42501` refusals become a sanitized internal
  error after rollback, then translate to the existing domain public code.
  A regression covers expiry at the authority lookup and proves no callback.
  Both real authentication provider principals keep credentials non-enumerable;
  JSON and shallow copies omit them while the authenticated bridge can read them.
- Snapshot comparison omits exactly `control_plane.request_binding`; all other
  selected tables stay exact. Historical-schema fixtures use the approved
  outbound-pause-style foundation or contextless authenticated fixture seed.
  Web principals and narrow SQL mock answers include binding requirements.
- The lane file names the WIP branch and repair paths, and does not list itself.
  `[S9]`, the other guard baselines and other source pins remain untouched by
  the repair. Only the authorized practice source pin was refreshed inside
  `context-boundary.test.ts` relative to the original PR head.

## Execution and exact results

Repository cwd: `/workspace/jobguard`. Node `24.15.0`, pnpm `10.28.1`, real
embedded PostgreSQL `16.10`; made-up data only. Commands use the session runtime
on PATH. `pg_dump`/`psql` `16.15` are extracted test clients in scratch, not
project dependencies. Network/local-process permission is required by this
cloud sandbox for PostgreSQL sockets and Node synchronous subprocesses.

The final commands below started against frozen source `a7fa979a`, after
`pnpm --filter @jobguard/db build` passed. All are allowed to complete.

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/db test --shard=1/4` | Running |
| `pnpm --filter @jobguard/db test --shard=2/4` | Running |
| `pnpm --filter @jobguard/db test --shard=3/4` | Running |
| `pnpm --filter @jobguard/db test --shard=4/4` | Running |
| `pnpm --filter @jobguard/web test` | Exit 0; 116 files / 1,638 tests passed; 133.46s Vitest / 136.810s wall |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1` | Running |

Additional focused validation of the final source changes:

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-withtenant.test.ts src/tenant-context.test.ts test/lp6b-deferred-binding.test.ts` | Exit 0; 3 files / 38 tests passed |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/auth.test.ts src/auth/credential-serialization.test.ts src/auth/context-boundary.test.ts` | Exit 0; 3 files / 162 tests passed |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/northside-demo.integration.test.ts` | Exit 0; 1 file / 7 tests passed; 231.56s Vitest / 232.652s wall |

These focused commands started before the final commit while its exact source
changes were in the working tree. Their recorded HEAD was `9488d6be`; the final
four shards and web run above are the committed-source evidence.

### Earlier complete run and rechecks

The first full four-shard run at `2fbb0f52` completed without interruption:

| Shard | Passed | Failed | Skipped | Todo | Total | Files passed / failed | Vitest seconds |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1/4 | 1608 | 8 | 42 | 13 | 1671 | 173 / 9 | 2097.28 |
| 2/4 | 1366 | 16 | 0 | 0 | 1382 | 170 / 12 | 2093.28 |
| 3/4 | 1528 | 30 | 12 | 4 | 1574 | 167 / 14 | 2131.59 |
| 4/4 | 1611 | 12 | 28 | 0 | 1651 | 168 / 13 | 1974.79 |

Total: **6,113 passed, 66 failed, 82 skipped, 17 todo / 6,278 tests**.
Setup failures account for some skips; skips are not passes. Both full runs
include built `dist` duplicate unit tests, as in the normal build-then-test
setup. No suite was removed or made optional.

Earlier `pnpm typecheck`, `pnpm lint` and `pnpm build` passed at `2fbb0f52`.
An initial no-network sandbox invocation of lint/build failed on synchronous
subprocess execution; the authorized cloud invocation passed. Initial
`pnpm exec turbo run test --filter=!@jobguard/db` ended when core timed out in
four existing 5-second tests under the overloaded initial run (4,568 passed,
4 failed); it did not complete all dependent suites. The separate first web
run passed all 1,638 tests. Full final rechecks will be recorded here.

### Supplementary browser evidence

`CI=1 pnpm --filter @jobguard/web exec playwright test --config=/workspace/work/lp6b/playwright-system.config.ts`
is running all 592 original cases with CI's single worker. The temporary
external configuration imports the repository configuration and only makes
paths/cwd absolute and selects `/usr/bin/chromium` version `154.0.8037.57`.
The pinned Playwright Chromium 140 download returned `403 Domain forbidden`;
this is supplemental evidence, not pinned-browser CI evidence. Assertions and
repository browser configuration were not changed. The production `.next`
build originated at `2fbb0f52`; it is not rebuilt underneath the running suite.
The first temporary-config startup attempt had the wrong cwd and was corrected
before the full run.

## Unchanged guards and decisions for Ben

- `[S9]`, `packages/db/test/extra-origin.integration.test.ts:252`: replacement
  bytes below require Ben's renewed pin review.
- `[PW32]` in `practice-worker-switch.integration.test.ts`: switching off after
  effective-worker revocation now hits binding refusal. `[PH11]` in
  `contractor-practice-session.integration.test.ts`: the base-revoked holder
  cannot reach its own session-revoke callback. Preserving these session-only
  controls needs new named opt-outs **and** additions to the deferred-binding
  guard. No new exception or guard relaxation was added for either.
- `job-sources-authority.integration.test.ts` `SV7A-07` directly calls SQL through
  `withTenant` after revocation and expects the later SQL's domain message.
  Binding must refuse before that callback; the real `JobSourceRepository`
  boundary now translates its refusal. Changing the direct-SQL guard is Ben's.
- `money-trail-security.integration.test.ts` expects the old six-query trace and
  old index. Binding and authority lookup add two queries. Its accounting guard
  is unchanged; neither query is hidden from the observed trace.
- `commercial-integrity-v3-query-isolation.integration.test.ts` expects no writer
  blocking while a session is changed. Binding deliberately takes the required
  session lock. Reconcile this guard/policy with Ben; no lock was removed.
- `tools/commercial-integrity-boundary.unresolved.json` and
  `tools/commercial-integrity-current-source-guard.unresolved.json`: four tool
  tests reject the practice proxy's changed source fingerprint. Baselines were
  not edited by the repair (main's baseline changes came with the required
  merge). `node --test tools/*.test.mjs`: 410 passed / 4 failed in the first run.
- `apps/api/src/watchdog-registry.test.ts` Round 12 query allow-list: 18 missing-
  session/stranger cases require binding answers plus an allow-list addition.
  Leave the guard for Ben. Separate replay mocks gained exact binding answers;
  the focused watchdog recheck passed 108 / failed 18 of 126 tests.
- Independent review found the new `lp6b-deferred-binding.test.ts` only scans
  direct names in `packages/db/src`, not all workspace packages or aliases/
  re-exports. No unauthorized production opt-out was found in source inspection,
  but this is incomplete enforcement of the requested restriction. Any scanner
  expansion now goes to Ben under the user's further-guard-edit limit.
- Existing contractor policy returns the owner in non-READ-COMMITTED transactions
  (`practice-worker-switch-v1.md:239`, `[PW30]`). A worker-stamped context then
  refuses, but a retained owner context can match that policy. No new HTTP path
  using such a context was identified. Any change needs Ben's contract/guard
  decision; universal stale-owner refusal across isolation levels is not claimed.

## Exact S9 replacements for Ben

Only two entries differ; every other pinned entry still matches.

| File | Old pinned SHA-256 | Proposed SHA-256 of final source |
| --- | --- | --- |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` | `4650b0963482827f605ec499e0b34a4b21d19d4fde6d639ffdba6182ffacec23` |
| `apps/api/src/auth/context-boundary.test.ts` | `b77c7b63985dc66d359af04285e099463335085aa47e64100af9473dc9f58bc0` | `7b7e45af15db8b567b13ebda9014ac084e221564a53b98e6cb0d8c49792926bd` |

S9 pins pre-LP-6b bytes. The practice bridge now privately carries the actual
authenticated session credential and installs its compatibility digest after
binding/authority verification, immediately before tenant setup. The boundary
file includes the original PR's authorized principal/practice/contractor bridge
contracts and the repair's authorized practice source-pin refresh. These byte
changes explain the hashes; they are not permission for the builder to alter S9.

## Independent checks and real-data ownership

Two separate agents performed source-only security checks at `9488d6be`.
One found no confirmed new exploitable defect in the reviewed scope. The other
identified lookup-time `42501` escaping translation (fixed at `a7fa979a`, with
regression), incomplete deferral-scanner coverage (left for Ben), and the existing
isolation-dependent contractor policy qualification above. Neither ran tests or
approved the PR. Final independent rechecks follow the final real DB run.
These checks do not substitute for the repository's formal fresh Opus/Sol RED
review gate; this WIP has no merge approval.

**Ben must appoint a named database/security operations owner for retention and
removal of `control_plane.request_binding` rows before real data**, coordinated
with the LP binding owners and independently reviewed. This repair implements no
cleanup job and makes no real-data readiness claim.
