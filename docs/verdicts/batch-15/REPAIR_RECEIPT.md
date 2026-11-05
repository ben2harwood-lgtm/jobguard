# PR #556 — batch-15 repair receipt

Branch: `codex/sandbox/batch-15`; original head: `0fac585a92c88dd39d212726b913e557eb75d257`; repair code: `65372780`.

Main `56b74eaec205e86c9eaf7eee75d85ade2599a364` (#555) was merged without conflict edits in `46f10fb5`. Main's top migration is 0589. Reserved 0590 and 0591 remain numbered and named as reserved; 0590 SQL is unchanged.

## Causes and repairs — one line each

1. 0591's definer was excluded by the original-byte table's FORCE RLS policy, producing empty photo tags; return metadata, read the bytes as runtime, and validate session/job/evidence/version/hash/length in a narrow parser routine with an updated exact catalog proof.
2. The siteExtras method-list assertion omitted the existing `sorRecentItems`; include it in the exact method contract.
3. Chromium proved two disabled BUTTON nodes at 2.0014209747314453:1 at each width; give disabled buttons explicit AA foreground/background/border colours and retain the unchanged contrast assertion.
4. The reachable observation page POST fell through to the GET-only `[promptId]` route and returned 405; add the real POST through the sibling origin/mode/session/application checks and classify it alongside the existing checked contractor commands, keeping the intended screen functional.
5. The real ENT-5 journey omitted Finished, correctly leaving photo attachment disabled; select Finished first and execute reject/revise/withdraw, replay/conflict, stale approval, the race and foreign-tenant refusal on real routes at both widths.
6. The mocked withdrawal fixture left the newly added duplicates panel unmocked, adding a second alert; supply an empty versioned duplicates response while preserving the original alert assertion.

The observations route was added rather than withdrawing the page: the existing checked application and database command already provide the required authority and persistence. No second authorization implementation was introduced. A real browser/PostgreSQL test proves stored PNG tags, refusal checks, save, one persisted observation and exact replay; the separate mocked screen test injects transport failures only.

## Exact validation commands and results

Every `pnpm` command below used pnpm 10.28.1 with `export PATH=/workspace/jobguard/work/bin:$PATH`; Node is 24.19.0. Source checks exercised the tree committed as `65372780`; this receipt changes documentation only.

| Command | Result |
| --- | --- |
| `CI=true PNPM_HOME=/workspace/jobguard/work/pnpm COREPACK_HOME=/workspace/jobguard/work/corepack corepack pnpm install --frozen-lockfile --store-dir /workspace/jobguard/work/pnpm-store` | PASS; lockfile unchanged. |
| `pnpm build` | PASS; all 7 build tasks on merged main. |
| `pnpm typecheck` | PASS; all 7 tasks on merged main. |
| `pnpm lint` | FAIL at the exact lane scope check described below; core purity passes and every other lint script/workspace task passes separately. The guard remains enforced. |
| `node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs && node tools/ai-provider-boundary-lint.mjs && node tools/plpgsql-case-in-if-lint.mjs && pnpm exec turbo run lint` | PASS; all four remaining root lint scripts and all 7 workspace lint tasks. |
| `pnpm exec turbo run build --filter=@jobguard/ai... && pnpm --filter @jobguard/ai eval:contract` | PASS; fixture gateway, zero provider spend, no live-model claim. |
| `node --test tools/*.test.mjs` | PASS; 423 tests, zero skipped, after merging main. |
| `VITEST_MAX_WORKERS=2 pnpm exec turbo run test --filter='!@jobguard/db' --concurrency=1 --env-mode=loose` | PASS; 12 tasks; core 4665 tests/210 files, API 3987/225 plus OpenAPI check, web 1736/127, AI 276/20, config 344/18, storage 108/8 with 2 existing external-storage skips. |
| `pnpm --filter @jobguard/db test --shard=1/4` | PASS; 190 files, 1713 tests passed, 15 existing TODOs, exit 0. |
| `pnpm --filter @jobguard/db test --shard=2/4` | PASS; 190 files, 1396 tests passed, exit 0. |
| `pnpm --filter @jobguard/db test --shard=3/4` | PASS; 190 files, 1676 tests passed, 4 existing TODOs, exit 0. |
| `pnpm --filter @jobguard/db test --shard=4/4` | PASS; 190 files, 1698 tests passed, exit 0. |
| `CI=true FONTCONFIG_PATH=/tmp/fonts pnpm --filter @jobguard/web exec playwright test --config=../../work/playwright.config.ts ENT-3.spec.ts ENT-5-chain-actions.spec.ts ENT-5-duplicate-candidates.spec.ts ENT-8a-completion-observations.spec.ts ENT-8a-possible-extras.spec.ts` | PASS; 36 tests, mobile-360 and desktop (360px/1280px), 4.2 minutes, zero retries. The full real ENT-5 journey and actual observation save/replay/refusal pass at both widths. |

## Reproduction and environment evidence

- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/enterprise-live-prompt-repository.integration.test.ts` — original head FAIL: 1 failed/2 passed; stored photo tag expected, `photoTags: []` received.
- `pnpm --filter @jobguard/api exec vitest run src/contractor/site-visit.application.test.ts` — original head FAIL: 1 failed/58 passed; actual method list also contained sorRecentItems.
- Actual unauthenticated POST to `/api/contractor/jobs/:id/possible-extras/observations` — original production build returned 405 at both widths; final real-route test requires 401 before sign-in and proves authorized persistence.
- `CI=true FONTCONFIG_PATH=/tmp/fonts pnpm --filter @jobguard/web exec playwright test --config=../../work/playwright.config.ts ENT-5-duplicate-candidates.spec.ts` — original screen FAIL at both widths; each audit identified two BUTTON nodes with `disabled` attributes and ratio 2.0014209747314453 against AA 4.5. Diagnostic node attachments were added; the assertion and audit options are unchanged.
- The Playwright CDN download is forbidden by environment network policy; installed Chromium 154 removed Audits.checkContrast. `npm install --prefix /workspace/jobguard/work/browser140 --cache /workspace/jobguard/work/npm-cache --ignore-scripts --no-audit --no-fund @sparticuz/chromium@140.0.0` supplied Chromium 140.0.7339.0 from the permitted npm registry. The temporary config selects `/tmp/chromium`, preserves both viewport projects and zero retries, sets test/global setup paths and webServer cwd, and uses extracted fonts. No security-disabling package arguments or audit exclusions were used; no application dependency changed.
- Early concurrent builds/checks caused timing failures; the complete final non-DB stage passed against the completed, stable production build with bounded workers. No timeout or assertion changed. `VITEST_MAX_WORKERS=1 pnpm --filter @jobguard/api exec vitest run src/shadow-isolation.application.test.ts -t 'Test Q: successful mutations'` also passed in 31.75s before the full successful API rerun (the other 21 tests were filtered in this focused diagnostic run only).
- DB shard 4 initially exposed `spawn pg_dump ENOENT` in `lp6a-practice-restore.integration.test.ts`: the embedded server was available but command-line clients were absent. Official Debian `postgresql-client-17_17.11-0+deb13u1_amd64.deb` and `libpq5_17.11-0+deb13u1_amd64.deb` were downloaded from `https://deb.debian.org/debian/pool/main/p/postgresql-17/`, extracted with `dpkg-deb -x` under `work/pg-client/root`, and selected through task-local `work/bin/pg_dump` and `work/bin/psql` wrappers with the local libpq path. No system install, source change or test change was required.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6a-practice-restore.integration.test.ts` — PASS after adding clients: all 3 tests, including real logical dump/restore and colliding-xid refusal. Full shard 4 was restarted with the prerequisite present; its final result is in the table above. Stopped/overloaded attempts are not reported as passes.

## Lane approval hold

Automatic approval review rejected extending `config/lanes/batch-15.json`, stating that the lane authorization change was not authorized merely by the repair request. The allowlist and lint implementation remain unchanged. Root lint therefore correctly refuses these seven required repair paths plus this receipt path:

- `apps/api/src/contractor/site-visit.application.test.ts`
- `apps/web/app/api/contractor/jobs/[id]/possible-extras/route.test.ts`
- `apps/web/app/api/contractor/jobs/[id]/possible-extras/observations/route.ts`
- `apps/web/app/lib/possible-extras-server.ts`
- `apps/web/app/northside/northside.module.css`
- `apps/web/e2e/ENT-8a-possible-extras.spec.ts`
- `apps/web/e2e/helpers/tagged-completion-photo.ts`
- `docs/verdicts/batch-15/REPAIR_RECEIPT.md`

The pending request is to register only those exact paths for the existing branch, with no wildcard or rule change. This is the remaining core-checks hold; the root core-checks stage must not be described as fully green until `pnpm lint` passes.

This repair adds no columns to fingerprinted tables, storage policies, existing table grants, or SET app.* function clauses. RLS, session checks, money rules, hidden-data rules and all test assertions remain enforced. All fixtures are fictional. This is builder test evidence, not an independent RED verdict or approval to merge.
