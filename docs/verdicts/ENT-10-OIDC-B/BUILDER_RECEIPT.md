# ENT-10-OIDC-B builder receipt — 18 October 2026

**Builder receipt only — not independently verified, not accepted.**

Dispatcher-designated builder: Codex gpt-6-astra. RED lane. Only issued sub-order A (persisted practice OIDC) built; C, UI and roadmap closure are not included. No worktree commit, push, merge, deployment, external provider action or approval record created by the builder.

## Base and scope

Unmodified inherited HEAD/A adapter: `a2ae1c01ad52f9a3c46b4b4cf9c1a5826bf274d1`; merge-base with local `origin/main`: `27ed904de8a6483f69fc4339221953e946418645`; local main reference: `765f0f369e22a601c3e29686bd3436c82f600e0b`. Branch `codex/sandbox/ent-10-oidc-b`. Dispatcher expressly authorized build-ahead on unmerged #295, superseding the draft's merged-A starting prerequisite for construction only. A's accepted commit is not established here. There is no candidate commit yet; dispatcher owns commit and exact-head checks.

Consumes A unchanged: `OidcAdapter(config, localIssuer)`, `start(browserBinding)`, `validate(callback, storedRequest, browserBinding)`, strict versioned exports and `TestOidcIssuer`. No new/reselected library or dependency changes. Installed runtime inspected: Node `v24.17.0`; pinned cached pnpm `10.28.1`. The shell's default pnpm launcher failed while trying to verify/switch versions; later commands used `/private/tmp/jg-oidc-bin/pnpm`, a symlink to the already-cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. No package install/download was performed by the builder.

Implemented strict synthetic HTTP/persistence schemas, immutable registration, restricted durable request/claim/replay state, exchange after client release, fresh-sign-in behavior after claims/unknown outcomes, commit-time linking/current-authority checks, database-clock sessions, committed no-group revocation, separate OIDC replay namespace, real Nest/Next handlers and redacted parser failures. Existing SAML schemas, raw assertion records, SCIM subject hashing and permission authority remain. Default local issuer identities are fixed per connection; no live issuer or network fallback. Details and acceptance mapping: [ledger](../../ledger/ENT-10-OIDC-B.md).

Migration: `0193_oidc_signin.sql`, next free above inherited 0192; dispatcher renumbers if necessary. [Migration note](../../../packages/db/migration-notes/0193_oidc_signin.md) records objects, owners/grants, lock order, compatibility and forward fix. Existing `sso_complete` is restated only to select OIDC's separate replay namespace; its SAML replay path remains intact. New restrictive policy prevents OIDC metadata from breaking the existing SAML view. Only new-object LP-0 inventory rows and additive SERIOUS-B5 snapshot expectations were added under standing ruling 113. No historical migration, migration runner, MIGRATIONS.md, scanner rule or mandatory assertion changed.

## Actual execution

Commands below use the pinned cached pnpm through `PATH=/private/tmp/jg-oidc-bin:$PATH` unless stated otherwise. `/private/tmp/oidc-b-*.log` contains local output; these temporary logs are not committed acceptance evidence.

| Command / evidence | Result |
|---|---|
| Clean frozen install | **NOT RUN** — dependencies supplied; dispatcher forbids downloads. Existing install is not clean-install evidence. |
| Initial `pnpm --filter @jobguard/api exec vitest run src/auth/sso/oidc-persistence.contracts.test.ts` before implementation | Launcher failed before Vitest (version-verification/registry access failure). **No behavioral failing-first result exists.** Later tests must not be represented as failing-first evidence. |
| `pnpm typecheck` | PASS, all 7 packages on final rerun. Earlier e2e import/type failures were corrected within the lane. |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL at lane boundary: inherited A files are outside B's lane. No lint-rule bypass or lane expansion to absorb A. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Same inherited-A failure. Supplemental uncommitted-path inspection uses the actual lane helpers and finds B's changed paths allowed; this is **not** the official base comparison. |
| `pnpm turbo run lint` | PASS, all 7 package TypeScript lint checks. Root core-purity check passed before lane failure; standalone money and commercial boundary scripts also exited 0. |
| `pnpm build` | PASS, all 7 packages including production Next build. Latest implementation build succeeded; no deployment. |
| `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts src/watchdog-registry.test.ts src/auth/sso/oidc.application.test.ts src/auth/sso/oidc-persistence.contracts.test.ts src/auth/sso/oidc-paths.test.ts` | PASS: 5 files, **280 tests**. Includes 14 OIDC tests and unchanged context/registry scanners. Initial inheritance and discarded-context scanner failures were fixed by composition and explicit context use, without changing scanners. |
| `pnpm --filter @jobguard/api exec vitest run src` | Attempted: 109 files passed / 11 failed; 2,003 tests passed / 131 failed / 23 skipped. Two own scanner failures subsequently fixed and rerun green above. Other failures involved forbidden listeners, an unavailable PostgreSQL free-port harness, and the nested build harness. Not a green API-suite claim. |
| `pnpm --filter @jobguard/api exec vitest run src/auth/sso src/auth/context-boundary.test.ts src/watchdog-registry.test.ts` | 580 passed / 2 failed, 20 files passed / 1 failed. Both failures are existing `action-paths.test.ts` HTTP-listener tests: `listen EPERM`. Focused final rerun above covers B's final handler/filter tests. |
| `pnpm --filter @jobguard/web test` | PASS: 40 files, **867 tests**. |
| `node --test tools/*.test.mjs` | PASS: **100 tests**. |
| `pnpm --filter @jobguard/core test` | FAIL: emitted `dist` tests look for nonexistent source-relative `.ts` fixture files; 5 failed, 5,789 passed. No out-of-lane runner changes. |
| `pnpm --filter @jobguard/core exec vitest run src` | PASS: 115 files, **2,897 tests**. Source-only result, not a replacement claim for the failing command above. |
| `pnpm --filter @jobguard/config test` | PASS: 8 files, **82 tests**. |
| `pnpm --filter @jobguard/db exec vitest run test/lp-0-catalog.test.ts` | PASS: **26 pure catalogue-comparator tests**; no PostgreSQL execution. |
| `tsc -p /private/tmp/oidc-b-test-tsconfig.json` | PASS: source typecheck for new DB tests and imported fixtures, **not DB execution**. |
| `pnpm openapi:check` / API `openapi:generate` | Standard CLI fails creating tsx IPC socket (`EPERM`). |
| From apps/api: `node --import tsx src/generate-openapi.ts` and `node --import tsx src/generate-openapi.ts --check` | PASS; actual generator/committed OpenAPI compared without the tsx CLI listener. Only the two OIDC paths added. Compiled-generator output was replaced with this source-generator output before verification. |
| `pnpm test` | Full aggregate **NOT RUN**: includes forbidden PostgreSQL execution. Component results above are not aggregate success. An API test's attempted database harness failed at free-port selection; no PostgreSQL acceptance evidence. |
| `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e` | **NOT RUN**, dispatcher expressly prohibits local PostgreSQL/browser. Tests authored for CI; no catalogue, populated-upgrade, concurrent database or browser execution claim. |
| `pnpm eval`, native/device suites | Inapplicable: no AI/model/prompt or native change. |
| `git diff --check` | PASS. |

## Holds and delivery

- **Failing-first evidence incomplete:** initial command never reached Vitest. Do not infer that the requested process evidence exists.
- **A dependency and lane:** dispatcher must merge/accept A and refresh B, then rerun the official lane check. B did not modify any inherited adapter/library file.
- **CI:** real PostgreSQL suites (including unchanged LATER-B28, SAML/SCIM/emergency, LP-0 and SERIOUS-B5), migration upgrade/catalogue/RLS checks and both actual transport browser flows remain outstanding. Unit repository doubles are not database proofs; handler execution without sockets is not a browser journey.
- **Existing out-of-lane test runner:** emitted core-test discovery remains a separately recorded STOP item; no existing test was deleted, skipped or weakened.
- **Independent verdicts:** fresh Claude and separate Codex RED checks must bind the dispatcher's exact candidate commit, followed by separate acceptance. No builder self-acceptance.

Intended commit message: `/private/tmp/jg-msg-ent-10-oidc-b.txt`. D01/D02/D03/D08/D09/D16 and applicable D04/G5, residency and assurance gates remain closed. No production-readiness, certification or whole-ENT-10 completion claim.
