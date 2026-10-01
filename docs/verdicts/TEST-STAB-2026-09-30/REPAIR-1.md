# TEST-STAB-2026-09-30 — repair 1 receipt

Builder for this repair: Claude (cloud session). Because Claude also recorded the a92ed6b verdict, the verdict for this repair head must come from a different model (Codex/GPT) or a fresh reviewer that did not author it (AGENTS §5.13). This receipt is not a verdict.

Fixes the two P1 findings in `a92ed6b.md`:
1. `apps/web/app/ui/supplier-fact-editor.tsx`: the initial quantity is `String(…)`-converted before trimming zeros; the `confirmed` type now states that `row_to_json` delivers numeric/bigint columns as numbers. New `apps/web/app/ui/supplier-fact-editor.test.ts` renders a confirmed revision with numeric columns (fails on a92ed6b with `.replace is not a function`; passes now) and a string quantity case.
2. `config/agent-lane-assignments.json`: the test-stab lane additionally allows exactly `package.json` and `pnpm-lock.yaml`, which it inherits from the stacked, already-accepted SEC-DEPS-2026-09-30 (#94). No wildcard; no other lane changed. #94 and #95 must land together: main fails the dependency audit without #94, and #94's e2e flakes without this fix.

Commands actually run (Linux, Node 24.15.0, pnpm 10.28.1, embedded PostgreSQL 16.10, pre-installed Chromium build 1194 via a private PLAYWRIGHT_BROWSERS_PATH symlink for the pinned 1193):

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm install --frozen-lockfile` | 0 | no package/lockfile change |
| `pnpm typecheck` | 0 | 7/7 |
| `LANE_BASE_REF=694e9e1 pnpm lint` (main, as CI compares) | 0 | lane test-stab-2026-09-30 passed |
| `pnpm build` | 0 | 7/7 |
| `pnpm test` | 0 | tools 39, core 380, api 75, ai 72, web 56, storage 4, config 2, db 150 |
| `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M2-1B-S.spec.ts M2-5-S.spec.ts` ×3 | 0, 0, 0 | 6/6 passed each run |
| new test against a92ed6b's editor | 1 | `.replace is not a function` reproduced |

GitHub CI on the pushed head is still required (three consecutive green runs per the merge rule).
