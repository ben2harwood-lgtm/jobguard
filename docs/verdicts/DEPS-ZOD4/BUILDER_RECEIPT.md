# DEPS-ZOD4 builder receipt — round 4, C246, 24 October 2026

PR #312, starting head `9525a8684dacfef5a658356fa99f8782f58dcc9c`, branch `codex/sandbox/deps-zod4`. This replaces round 3's incorrect URL expectations and incomplete HTTP-status audit. Builder evidence only; fresh independent review and separate acceptance must bind to the dispatcher's eventual commit. No Git write, dependency download, commit, push, PR mutation, deployment or live-provider action performed.

## Repairs

- Replace the URL pre-check and Zod 4 URL parser with exactly `z.string().refine(value => URL.canParse(value), "Invalid url")`. Original strings are returned unchanged. The shared authentication schema covers origin, OIDC issuer/redirect URI, SSO metadata and identity environment fields. Apply the same predicate to all URL fields in worker configuration, audit-checkpoint CLI, bootstrap CLI and storage configuration. Existing protocol, domain, credential, issuer-origin and length refinements remain intact. No raw `z.url(...)` remains in application/package source.
- Replace the false legacy whitespace assertions with the real WHATWG/Zod 3 acceptance set: edge and embedded space, tab, CR, LF, NBSP, BOM, vertical tab, form feed and em-space; valid/invalid strings and path/protocol cases. Existing business refinements still apply (for example an OIDC issuer must equal its parsed origin). Seven principal-bridge cases explicitly preserve 403 `ORIGIN_FORBIDDEN` with a session and 401 `UNAUTHENTICATED` without one, using the existing status mapper without binding a listener.
- Add `route-error-code.ts`, which identifies a schema failure by `ZodError` type before reading a message; it also recognizes the legacy supplier error by name. It returns the route's fixed validation fallback code. Business messages retain their original bytes and mapping. Wire it into all 20 substring-based status handlers and the remaining 21 raw-message handlers found during the required audit, including four regex-based final-account handlers. Validation returns 400 even where the route's business default is 403/404/409/503. Preserve readiness's existing typed-code priority and all existing non-validation response bodies/statuses/headers.
- The 123 new route tests exercise the actual Next handlers with service/framework doubles, not database or browser integrations. Every guarded route receives Zod errors whose field input contains STALE/CONFLICT. All tested non-validation response bodies are byte-for-byte comparisons with the existing main body, and statuses use main's unchanged mapping, including genuine conflicts/staleness, forbidden/not-found/default failures. The existing receipt mapper now checks validation before reading a message. Extend the practice-transports VM's import adapters to load the real new helper; its assertions are unchanged. Update only the exact affected lane paths.
- The confirmed browser contract fix and supplier regex issue-key order are unchanged. No dependency, lockfile, database schema, financial formula, permission, provider route, prompt, model or browser spec changed in round 4.

## Executed comparison with main (Zod 3)

Created `/private/tmp/jg-zod4-r4-main` using read-only `git archive origin/main` at `89b7b3d2e55ed668cd09aac117d8055f4fb03b0c`. Reused installed dependencies through local links; scratch package resolution uses main's exact `zod@3.25.67` pin. No install or network access. Copied the same updated API URL compatibility test into scratch and ran it against main's actual authentication/OIDC/SSO/identity-environment schemas and principal bridge. A scratch-only Vitest alias points `@jobguard/config` to main's source, rather than this worktree's built config. All **397 tests pass on both main and this worktree**. For the shared-helper corpus (main has no helper file), the scratch fixture is main's original `z.string().url()` expression; all **45 identical inputs pass on both**. These runs compare acceptance, preserve unnormalized successful values, and retain the bridge's 403/401 outcomes. Existing downstream URL refinements can throw on invalid input; these count as rejections, not acceptance.

Logs: `/private/tmp/jg-zod4-r4-main-{api,config}.log`. Scratch-only files are not repository changes.

## HTTP/Zod-text audit

Ran:

`rg -n '\.(message|issues|errors)\b|ZodError|invalid_(string|format|type|value)' apps/web/app/api --glob '*route.ts'`

**No matches** (the expected rg exit is 1); `/private/tmp/jg-zod4-r4-route-error-audit.log` is empty. Also inspected the matching runtime library/UI consumers across `apps/web`. `route-error-code.ts` reads business messages only after excluding schema errors; `receipt-http-error.ts` now does the same. `recovery-case-requests.ts` reads already-typed response fields. Domain `fact.issues` and evaluation-report `errors` are not Zod issues. Test-only `.message` assertions deliberately verify that the tainted fixture contains STALE/CONFLICT. **Remaining runtime readers/parsers/comparators of Zod issue text: none.**

## Commands actually run

Node `v24.17.0`, pnpm `10.28.1`, `PATH=/private/tmp/jg-zod-bin:$PATH`. Checks ran one at a time, Vitest `--maxWorkers=2`, Turbo `--concurrency=1`; the runner waits if the one-minute load exceeds 20 (observed loads stayed below 20). Existing dependencies were reused. Logs and exact command/exit records: `/private/tmp/jg-zod4-r4-*.log` and `/private/tmp/jg-zod4-r4-results.jsonl`.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm build --concurrency=1` | 0 | All 7 workspaces, including Next production build. |
| `pnpm typecheck --concurrency=1` | 0 | All 7 workspaces. |
| `pnpm lint --concurrency=1` | 0 | Root guards and all 7 workspace lint checks; LANE_BASE_REF=origin/main. |
| `pnpm lint:lanes` | 0 | Official lane check, including working-tree/untracked changes; LANE_BASE_REF=origin/main. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | 0 | 124 source files, 2,953 tests pass. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2` | 1 | 123 files pass; 2,476 tests pass, 129 fail, 23 skipped; 129 listener errors. All nine failing files require listeners or PostgreSQL; see exclusions below. No remaining unexpected-import failure. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --exclude src/auth/sso/action-paths.test.ts --exclude src/contractor/contractor-practice-session.http.test.ts --exclude src/contractor/practice-worker-switch.http.test.ts --exclude src/contractor/site-extra-pricing.http.test.ts --exclude src/contractor/site-extra.http.test.ts --exclude src/contractor/site-visit.http.test.ts --exclude src/final-account-lock.isolation.test.ts --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts` | 0 | 123 source files, 2,458 tests pass. Only the nine environment-blocked files from the unrestricted run are excluded locally; all remain mandatory in CI. |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=2` | 0 | 5 source files, 86 tests pass (including 45 URL corpus cases). |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | 0 | 41 files, 990 tests pass, including 123 new route tests across all 41 guarded routes. |
| `pnpm openapi:check` | 1 | tsx CLI fails to bind its IPC pipe (EPERM). |
| `node --import tsx src/generate-openapi.ts --check` | 0 | Real generator check succeeds through the direct tsx loader; no OpenAPI output change. |
| `pnpm --filter @jobguard/web exec playwright test --list` | 0 | 380 tests in 69 files discovered; no browser launched. |
| `pnpm exec vitest run src/auth/url-compatibility.test.ts --config /private/tmp/jg-zod4-r4-main/vitest.config.mts --maxWorkers=2` | 0 | 397 identical tests pass on scratch main with Zod 3.25.67. |
| `pnpm exec vitest run src/auth-url.test.ts --maxWorkers=2` | 0 | 45 identical URL inputs pass against the original Zod 3 .url() validator in scratch main. |

The scratch comparison commands run from scratch `apps/api` and `packages/config` respectively. The direct OpenAPI loader runs from this worktree's `apps/api`. The locally excluded API files are exactly: `auth/sso/action-paths.test.ts`, `contractor/contractor-practice-session.http.test.ts`, `contractor/practice-worker-switch.http.test.ts`, `contractor/site-extra-pricing.http.test.ts`, `contractor/site-extra.http.test.ts`, `contractor/site-visit.http.test.ts`, `final-account-lock.isolation.test.ts`, `health.test.ts`, and `shadow-isolation.application.test.ts` (all under `apps/api/src`). Unrestricted failures are EPERM listeners/Supertest null ports and two database setup failures (`no free port`); no successful PostgreSQL/HTTP integration is claimed.

Earlier diagnostics: the initial build passed; initial typecheck/lint failed on missing `.js` extensions in new dynamic test imports, now fixed. Initial API execution also found the VM's missing import adapter, now fixed. The first scratch attempt used the other cached Zod 3 version and exposed invalid-URL refinements that throw; the final recorded scratch comparisons use the exact main pin, 3.25.67, and handle rejections correctly. Early route fixture-generation mistakes were corrected against main before the final successful 123-test route run. These are superseded runs, not final passing evidence. `git diff --check` passes.

## Handoff and remaining gates

No migrations or data backfill; no new alerts. Affected invariants: boundary validation and HTTP error classification. Revert these source/test edits together for rollback. Shared overlap is limited to the existing DEPS-ZOD4 lane's authorized paths and receipt. No unrelated task work or agents were introduced.

The sandbox cannot bind localhost or start PostgreSQL. Full database/migration and browser execution remain mandatory in GitHub CI after the dispatcher commits/pushes; Playwright listing is discovery only. The unrestricted API suite is not green locally. Online advisory scanning, real providers and live-model evaluation were not run. No release/technical acceptance is asserted. Fresh independent verdict and separate acceptance remain required on the eventual commit.

Intended conventional commit message: `/private/tmp/jg-msg-deps-zod4.txt`. The dispatcher owns committing and pushing.
