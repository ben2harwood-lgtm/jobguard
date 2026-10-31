# ENT-10-OIDC-A builder receipt — 18 October 2026

**Builder receipt only — not independently verified, not accepted.**

Issued builder: Codex (dispatcher designated gpt-6-astra); no claim of an independent model review. RED lane: two independent Claude checks on the eventual exact commit and separate acceptance remain pending. Builder has not committed, pushed, merged or written checker verdicts.

## Scope and baseline

Branch `codex/sandbox/ent-10-oidc-a`, dispatcher HEAD `7c8665248cd5abbd991d66480df08e064873d9ff`; lane comparison to `origin/main` resolves merge-base `5284aa2c917a4775c91275c85d412798497bf835`. Only sub-order A built. The manifest/lockfile pin was already present at HEAD and is unchanged by this builder. The lane explicitly allows both and does not list itself.

Implemented strict versioned synthetic configuration, request and qualified-proposal schemas; typed redacted failures; actual openid-client code exchange with PKCE S256, state, nonce, exact binding, RS256 signature validation enabled explicitly, and temporal checks. In-process issuer uses runtime-generated RSA keys. Responses, streamed bodies and handler waits are bounded; metadata endpoints/redirects are denied outside the fixed registration. No global-fetch fallback, refresh, retry, sessions or permissions. No reachable route, application registration, public export, database implementation or migration. **No schema or data change.**

The proposal is not authentication authority. Durable replay, concurrency, explicit account linking, verified domains, mapping/SCIM/SSO-required/session parity and commit-time rechecks belong to B. Existing SAML implementation and tests are unchanged. C emergency review is untouched. No new money/access rule or production operational alert is introduced.

## Installed-library licence/provenance evidence

Read the installed package manifests, MIT licence texts, openid-client README, declaration and implementation files; inspected the lockfile integrity/resolved dependency entries. Exact versions: openid-client **6.8.8** (MIT, Filip Skokan 2016, repository `panva/openid-client`), jose **6.2.12** (MIT, Filip Skokan 2018, `panva/jose`), oauth4webapi **3.8.8** (MIT, Filip Skokan 2022, `panva/oauth4webapi`). openid-client declares `jose: ^6.2.12`, `oauth4webapi: ^3.8.8`; both transitives declare no runtime dependencies. Only openid-client is a direct OIDC dependency.

Evidence paths: `apps/api/node_modules/openid-client/{package.json,LICENSE.md,README.md,build/index.d.ts,build/index.js}` and `node_modules/.pnpm/<package>@<version>/node_modules/<package>/{package.json,LICENSE.md}`. SHA-256 of installed licence files:

- openid-client: `14c5cc0dc21f` (full SHA-256 recorded in the local build log)
- jose: `8078b0829d6c` (full SHA-256 recorded in the local build log)
- oauth4webapi: `81e7b4b0196e` (full SHA-256 recorded in the local build log)

MIT usage rights require retaining notices. Package metadata is not an independent registry attestation. README identifies Node 20+ support and upstream conformance/security-policy links; runtime here is Node **24.17.0**. Release date 2026-09-05 comes from dispatch, not an independently fetched release record. Current advisories/maintenance are not proven offline. See [library review](../../security/oidc-library-review.md) for comparison and lockfile hashes.

**STOP — security/advisory evidence item only:** unchanged repository `tools/dependency-audit.mjs` requires an online registry audit and has no offline mode. Dependency audit **NOT RUN**. Current upstream advisory/security-policy/provenance verification remains a hold. No scanner change, waiver or clean-scan claim. Continued other A work as explicitly instructed; no other STOP-list rule was needed.

## Execution environment

The initial shell `pnpm --version` reached a launcher that attempted version/signature resolution and failed (`fetch failed`). No package was downloaded. No bypass setting was used. All subsequent pnpm runs used the already-cached **10.28.1** at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, directly or via `/private/tmp/ent-10-oidc-a-bin/pnpm` on PATH. No dependency installation into the worktree or manifest/lockfile change occurred.

Clean install probe: copied workspace manifests and lockfile into `/private/tmp/ent-10-oidc-a-clean-install`, then ran `pnpm --dir /private/tmp/ent-10-oidc-a-clean-install install --offline --frozen-lockfile`. **FAILED**: `ERR_PNPM_NO_OFFLINE_TARBALL`, missing `tslib-2.8.1.tgz`; downloaded **0**. Checks below use preinstalled dependencies, not a successfully clean-installed tree. No registry retry/download was attempted to fill the store.

## Failing-first and required-check sensitivity

1. Before creating `oidc.ts` and `oidc.contracts.ts`, ran `pnpm --filter @jobguard/api exec vitest run src/auth/sso/oidc.test.ts src/auth/sso/oidc.contracts.test.ts`: **2 failed suites, 0 tests collected**, missing adapter/contracts imports. This is missing-implementation evidence, not a claim that individual assertions executed. Log `/private/tmp/ent-10-oidc-a-red.log`.
2. First implementation run: **39 passed, 3 failed** of 42. The redaction tests incorrectly required an own `cause: undefined` property; corrected them to require absence of `cause`, retain exact generic code/message and prohibit the secret marker. No product check weakened.
3. Temporarily removed `execute: [client.enableNonRepudiationChecks]`, ran `pnpm --filter @jobguard/api exec vitest run src/auth/sso/oidc.test.ts -t 'refuses altered token'`: **1 failed, 37 skipped**, as the altered token was accepted without the signature check. Restored the source in a `finally` block. Log `/private/tmp/ent-10-oidc-a-signature-mutation.log`.
4. Final focused run, after restoring the check and expanding attacks: `pnpm --filter @jobguard/api exec vitest run src/auth/sso/oidc.test.ts src/auth/sso/oidc.contracts.test.ts src/auth/sso/saml.test.ts`: **3 files, 87 tests passed** (55 new OIDC tests, 32 unchanged SAML tests). Log `/private/tmp/ent-10-oidc-a-focused-final.log`.

Coverage includes signed success; wrong issuer/audience/nonce/state/redirect/configuration/browser; future/expired temporal claims; unsigned/altered tokens; unverified/real email; PKCE mismatch; duplicates/unsolicited responses; unknown/rotated keys; endpoint escape; timeouts including stalled body; oversize discovery/token/JWKS; generic secret-free errors; no automatic token retry after unknown outcome. Actual library processing throughout; no mock of validation success.

## Repository checks

- `pnpm typecheck`: **PASS**, 7 tasks, 4 cached; `/private/tmp/ent-10-oidc-a-typecheck.log`. A final API-only typecheck after test expansion also passed (details below).
- `LANE_BASE_REF=origin/main pnpm lint`: **PASS**, 7 tasks, 4 cached; `/private/tmp/ent-10-oidc-a-lint.log`. Turbo reported sandbox cache IO warnings without failing checks.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: **PASS**, exact lane file set including dispatcher dependency pin; final handoff rerun passed; `/private/tmp/ent-10-oidc-a-lanes-final.log`.
- `node --test tools/*.test.mjs`: **100 passed**; `/private/tmp/ent-10-oidc-a-tools.log`.
- `pnpm openapi:check`: **BLOCKED**, tsx CLI IPC `listen EPERM`. Same check via `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`: **PASS**, exit 0; no generated OpenAPI edit. Logs `...-openapi.log`, `...-openapi-fallback.log`.
- `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --filter @jobguard/web test`: **FAILED** in core: 9 failures / 5,602 tests, including duplicate compiled-dist source-path assertions and receipt-allocation timeouts. Config **2 passed** and storage **4 passed**. Log `...-units.log`.
- Separate `pnpm --filter @jobguard/ai --filter @jobguard/web test`: **PASS**, AI 113 tests / 10 files, web 867 tests / 40 files. These are unit/fixture tests, not browser or live-model verification. Log `...-web-ai.log`.
- Core source-only `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2`: **FAILED**, 2,800 passed / 1 timed-out existing receipt-allocation bound test, 111 files. No unrelated source or test edited. Log `...-core-source.log`.
- API source suite excludes socket-requiring files by command only: `pnpm --filter @jobguard/api exec vitest run src --exclude '**/health.test.ts' --exclude '**/shadow-isolation.application.test.ts' --exclude '**/action-paths.test.ts' --exclude '**/*.http.test.ts'`. Initial run before prerequisite DB build completed: **73 failed / 21 passed files; 6 failed / 347 passed tests**, predominantly missing `@jobguard/db` build imports plus a context-boundary timeout. Retried after prerequisite build with `--maxWorkers=2`; result below. No tests disabled in repository configuration.
- Full `pnpm test`: **NOT RUN** as one command because it includes forbidden local PostgreSQL/socket suites; selected executable portions are reported separately, not as a full-suite pass.
- PostgreSQL, `pnpm test:db`, `pnpm test:migrations`, browser/e2e: **NOT RUN** by dispatch/environment constraint. Persistence/migrations/browser are inapplicable to A's code change; B's named suites and existing SAML/SSO-required browser checks remain mandatory for sign-in acceptance.
- `pnpm eval`: inapplicable to this change (no AI behavior changed). AI package fixtures above ran only as regression coverage.

Final results:

- `pnpm build`: **PASS**, 7 successful tasks / 4 cached, 4m29.578s. API and web compiled; existing Next root/CSS and Turbo cache-IO warnings. Log `/private/tmp/ent-10-oidc-a-build.log`. Built adapter inspected to retain `enableNonRepudiationChecks` after the mutation restoration.
- `pnpm --filter @jobguard/api typecheck` after final test expansion: **PASS**, exit 0. Log `/private/tmp/ent-10-oidc-a-api-final-typecheck.log`.
- API retry above: **93 passed files / 1 failed suite; 1,747 passed tests / 1 skipped**. The remaining `final-account-lock.isolation.test.ts` indirectly imports a DB fixture and failed before startup (`no free port in 58400..58650`). This dependency was not caught by the initial socket-test exclusion search; no PostgreSQL server started. This is a failed environment-dependent attempt, not PostgreSQL evidence. Log `/private/tmp/ent-10-oidc-a-api-retry.log`.
- The remaining core receipt-allocation timeout was rerun in isolation with `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts --maxWorkers=1`; **PASS: 34 tests**, default timeout unchanged; `/private/tmp/ent-10-oidc-a-core-isolated.log`. This resolves the isolated test failure under lower load, but does not rewrite the failed broad runs as passes.
- `git diff --check`: **PASS**. Final `LANE_BASE_REF=origin/main pnpm lint:lanes`: **PASS**, same exact file list; `/private/tmp/ent-10-oidc-a-lanes-final.log`. No unrelated tracked file was modified by builds.

## Exact files and handoff

New files: `apps/api/src/auth/sso/oidc.ts`, `oidc.contracts.ts`, `oidc.test.ts`, `oidc.contracts.test.ts`, `test-oidc-issuer.ts`; `config/lanes/ent-10-oidc-a.json`; `docs/contracts/oidc-signin-v1.md`; `docs/operations/oidc-data-flow.md`; `docs/security/oidc-library-review.md`; `docs/ledger/ENT-10-OIDC-A.md`; this receipt. Dispatcher-owned `apps/api/package.json` and `pnpm-lock.yaml` are included in the lane/comparison, unchanged by builder. No edits outside the allowed repository lane.

Intended conventional commit message: `/private/tmp/jg-msg-ent-10-oidc-a.txt`. Raw logs listed above remain local temporary artifacts for dispatcher inspection.

Remaining holds: clean install, advisory/current provenance verification, full required suites in CI, two independent Claude exact-commit checks and separate acceptance; B/C acceptance and native/live-provider/assurance obligations. D01/D02/D03/D08/D09/D16 and identity D04/G5 remain closed. No real identity/domain, outward notification, paid service, real-provider route, secret, retention policy or sanction introduced. This does not close parent ENT-10.


## Repair round r1 — 18 October 2026

Builder: Codex (dispatcher designated gpt-6-astra). Baseline `b3abbffc`, PR #289. Shortened only the two flagged openid-client and oauth4webapi licence hashes to their first 12 hex characters, with the requested local-log note. Full values are preserved in `/private/tmp/ent-10-oidc-a-r1-provenance-build.log`. No scanner or ignore-rule change; this receipt is the only changed repository file. No code, migration or behavior change; prior release holds remain. This is builder execution evidence, not independent review or acceptance.

Checks used preinstalled dependencies and cached pnpm 10.28.1 via `/private/tmp/ent-10-oidc-a-bin` on PATH; Node 24.17.0. No install or package download performed.

- `pnpm typecheck`: **PASS**.
- `LANE_BASE_REF=origin/main pnpm lint`: **PASS**.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: **PASS**.
- `pnpm build`: **PASS**, 7 tasks, 2 cached. Existing build/cache warnings did not fail the build.
- `node --test tools/*.test.mjs`: **PASS**, 100 tests.
- `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1`: **PASS**, 114 files / 2,889 tests.
- `pnpm --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --filter @jobguard/web test`: **PASS**; config 18, AI 123, storage 4, web 867 tests.
- `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude '**/health.test.ts' --exclude '**/shadow-isolation.application.test.ts' --exclude '**/action-paths.test.ts' --exclude '**/*.http.test.ts' --exclude '**/final-account-lock.isolation.test.ts'`: **PASS**, 105 files / 1,938 tests. Socket/database exclusions apply to this invocation only; repository test configuration is unchanged.
- `pnpm openapi:check`: **BLOCKED**, tsx IPC socket `listen EPERM`. Same check through `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`: **PASS**.
- Local repository secrets scan: **NOT RUN**. No pnpm secrets script or tools scanner exists, and no local `gitleaks` executable is installed. The required GitHub `secrets` job uses `gitleaks/gitleaks-action@v2.3.7`; its result remains for CI after dispatcher push.
- Full `pnpm test`, PostgreSQL/migrations and browser suites: **NOT RUN** under dispatcher sandbox constraints; executable unit portions are listed above. CI remains required.
- `git diff --check`: **PASS**.

Local logs: `/private/tmp/ent-10-oidc-a-r1-{checks,build,units,openapi}.log`. Intended commit message: `/private/tmp/jg-msg-ent-10-oidc-a.txt`. No staging, commit or push performed by builder.

## Current-main repair — 29 October 2026

Piece ENT-10-OIDC-A, RED. Read the current SIMPLE_LOOP.md and simplicity rule and inspected AGENTS.md, BUILD_PLAN.md §ENT-10, PR #289's current description, adapter, callers and tests. PR #289 describes a synthetic protocol adapter without a sign-in route; it specifies no additional implementation for this slice. Current origin/main (`fe80add5`) already contains the adapter (commit `a2ae1c01`). This repair does not reopen the separate persistence/sign-in slice.

Resolved all three file-content conflicts: API manifest keeps main's Zod 4.6.6 pin and the existing openid-client pin; OIDC schemas keep main's shared auth URL parser and Zod 4 GUID/email compatibility; lane keeps both registered branch names and the historical exact-path union. The resolved manifest and schemas are byte-identical to current main. Added five adversarial tests: sequential consumed-code replay, concurrent fixture-code exchange, another company's stored request before transport, swapped callbacks between valid company requests, and privileged/provider authority claims remaining bounded proposal data. No adapter behavior change, route, session, grant, schema, SQL or migration change. No PL/pgSQL IF/CASE introduced. `node --check tools/migration-renumber.mjs` and `node tools/migration-renumber.mjs` pass; no own migration needs renumbering, so reserved 0346 is unused.

Dependencies were absent from this worktree despite the brief. The first cached-pnpm invocation could not find Vitest. Linked existing dependencies from the `ci-speed` worktree into ignored local node_modules, preserving workspace package links to this worktree. No packages downloaded or installed. Built this worktree's config, core, storage and DB TypeScript outputs (at most two concurrent package tasks); these are compilation checks, not database execution. Initial OIDC collection failed before config was compiled; the first URL-compatibility collection failed before DB was compiled. Both were resolved by the normal prerequisite builds, without altering checks.

Commands use the cached pnpm 10.28.1 launcher at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` with Node 24.17.0:

- `pnpm --filter @jobguard/config build`: PASS.
- `pnpm --filter @jobguard/core --filter @jobguard/storage --filter @jobguard/db --workspace-concurrency=2 run build`: PASS.
- `pnpm --filter @jobguard/api exec vitest run src/auth/sso/oidc.test.ts src/auth/sso/oidc.contracts.test.ts src/auth/sso/saml.test.ts --maxWorkers=2`: PASS, 92 tests / 3 files.
- Final `pnpm --filter @jobguard/api exec vitest run src/auth/sso/oidc.test.ts src/auth/sso/oidc.contracts.test.ts src/auth/url-compatibility.test.ts --maxWorkers=2`: PASS, 457 tests / 3 files, including the final callback test refinement.
- `pnpm --filter @jobguard/api typecheck` and `pnpm --filter @jobguard/api lint`: PASS.
- `git diff --check`: PASS; conflict-marker search in the three resolved files: no markers.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: FAIL before router staging, because HEAD/index still reflect the unfinished merge and the gate counts incoming main paths. Do not interpret this as a passed lane gate. Direct use of the unchanged lane-policy loader and path predicate against `git diff origin/main` confirms the resolved working-tree delta stays within this lane. Router must stage the three conflict resolutions, finish the merge and rerun the actual lane gate.

Actual delta from current main: OIDC adversarial test file, this existing receipt and the lane note. No new reporting document. No git writes, commit or push performed. Full CI, database/migrations and browser suites remain for CI under the issued sandbox limits. Fixture replay tests demonstrate issuer code-consumption handling only, not durable database replay prevention. Live-provider, advisories/provenance, real-data and parent ENT-10 acceptance remain outstanding. Under the current simple loop the router arranges one fresh independent Claude review of the exact RED head; earlier two-review/separate-acceptance workflow references above are historical.

## CI-fix try 1 — 29 October 2026, historical scan findings

The issued trace file contains only `=== job 123290980588`, no failure details. Retrieved the actual GitHub Actions job log for run 40826605232 through the connected GitHub tool. The secrets job has exactly two `generic-api-key` findings: this receipt's lines 21 and 23 in historical commit `8a06e3b7`, for the original full openid-client and oauth4webapi licence digests. Recomputed SHA-256 from both installed LICENSE.md files and confirmed both historical values exactly match the licence bytes. These are public licence checksums, not credentials or runtime fixture secrets.

Both full values are already absent from this worktree and origin/main; prior repairs shortened them. Gitleaks 8.16.1 scans the PR's original first-parent history (`--no-merges --first-parent`), including the original commit even after the merge of main. Therefore another receipt/source edit or a retry on the same history cannot remove these findings. No scanner configuration, ignore file, workflow, test, dependency or SQL was changed. No merge conflicts exist now. Actual lane gate and `git diff --check` pass on the current committed merge state.

Required router action: preserve/archive the existing branch tip, then reconstruct this piece on current main with only the reviewed final delta (OIDC adversarial tests, lane note and this receipt); arrange the PR to use that history under normal authority and rerun the unchanged secrets gate. Main already contains the adapter with shortened digests. Do not delete evidence or loosen scanning. A reconstructed head needs fresh CI and an exact-head RED review. This sandbox cannot perform that repair because Git metadata is read-only and git writes are explicitly forbidden. Handoff message is marked `do not commit`: an ordinary additive commit will not fix this CI failure.

At inspection, core-checks (including real typecheck/lint/unit suites), dependency-review and DB shard 1 were successful; other DB/browser shards were still running. No additional failed test was reported at that point. No local unit rerun was warranted for this evidence-only update; no code behavior changed. Local Gitleaks executable is unavailable, so no local scanner pass is claimed. Existing full-suite and RED gates remain required.

## NOPR current-main catch-up — 31 October 2026

Read the current SIMPLE_LOOP.md, full simplicity rule, repository AGENTS.md and ENT-10 plan section. On entry HEAD was already the completed merge `cf6abd59`, with available `origin/main` (`87b5dd4e`) as its second parent, no unmerged index entries and no committed delta from main. No merge or Git metadata write was needed or performed. The preceding CI-fix receipt section was already an uncommitted change; preserved it as historical evidence, without claiming its scan findings were rechecked or repaired today.

Registered the exact current branch `codex/sandbox/ent-10-oidc-a` in its existing lane, preserving both other branches and all allowed paths. This was necessary because the first actual lane check refused the unregistered branch. No application behavior, migration, shared expectation list, LP-0 or tenancy code changed; no SQL routine was recreated. Protected `docs/contracts/lp-downstream-effects-v1.md` is unchanged. The complete committed piece already matches available main, so there is no additional implementation to reapply or migration to renumber.

Checks use installed dependencies, Node 24.17.0 and cached pnpm 10.28.1; no install, fetch or package download:

- `pnpm --filter @jobguard/api exec vitest run src/auth/sso/oidc.test.ts src/auth/sso/oidc.contracts.test.ts src/auth/sso/saml.test.ts --maxWorkers=2`: PASS, 3 files / 92 tests.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: PASS after exact branch registration, covering only this lane file and receipt.
- `git diff --check`: PASS; no conflict markers in OIDC sources, lane files, tenant-context source or BUILD_PLAN.md; `git ls-files -u` is empty.
- `pnpm --filter @jobguard/api typecheck`: STALLED at `tsc -p tsconfig.json --noEmit`, no result or diagnostic returned at handoff. Not claimed as a pass; GitHub CI must complete typecheck. Per this catch-up's explicit brief, stalled typecheck with passing own unit tests permits a READY commit message.

RED identity piece. NOPR handoff only: router retains commit/push/PR ownership. Full GitHub CI and a fresh independent exact-head RED review remain required before merge; PostgreSQL and browser suites were not run under the issued sandbox constraints. Today's READY handoff concerns this bounded catch-up, not remediation of the historical secrets-scan report or parent ENT-10 completion.
