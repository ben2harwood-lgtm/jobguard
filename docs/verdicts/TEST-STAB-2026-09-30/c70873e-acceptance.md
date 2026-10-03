# Technical acceptance TEST-STAB-2026-09-30 — PR #95 — candidate on top of c70873e — ACCEPTED

**Decision:** ACCEPTED, subject to the merge condition in §7 (three consecutive full green GitHub CI runs on the exact final SHA). This acceptance does not merge, push, deploy or release anything.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), a fresh-context technical acceptance agent launched on 3 October 2026 from a coordinating session on Ben's Mac. It did not build, repair or check any part of this change. It is not the Claude cloud session `session_018WSeySi5BzWEJ1yyt1qaVD` (which recorded the a92ed6b REPAIR verdict, built repair cf59d09 and launched the earlier 035d5a5 acceptance) and it is not a subagent of that session; it shares none of that session's context. It is not Codex. It worked read-only in the worktree apart from writing this file (and the rebuildable `node_modules`/`packages/core/dist` outputs that the requested install and test commands produce). It made no commit, push, merge or deletion.

**Independence statement:** under the founder's delegation this actor is "neither the builder nor the checker session". Code builders: Codex (a92ed6b) and the Claude cloud session (cf59d09). Checkers: the Claude cloud session (REPAIR on a92ed6b) and Codex/GPT (PASS on cf59d09). This agent is the same model family as the repair builder (Claude) but a separate actor and session. The Codex origin of `cf59d09.md` is taken from its header (relayed by Ben); this agent could not verify it independently.

**Repository / PR:** `ben2harwood-lgtm/jobguard` PR #95, `codex/sandbox/test-stab-2026-09-30` → `main`, open, not draft, `mergeStateStatus` CLEAN at the time of review. Stacked on PR #94 (SEC-DEPS-2026-09-30, head `10f1fae9bdcba62157ccd8b1cac5947ce7992e42`, PASS + accepted); `git merge-base --is-ancestor 10f1fae HEAD` exits 0, so merging #95 lands #94's three commits too.
**Base:** `origin/main` = merge base = `694e9e1755f2a5680898eb0fa04af48afd66c86b`.

## 1. Rules applied
- `BUILD_PLAN.md` line 80 on `origin/claude/plan-rev30` (`c2c68c8`): "Written delegation (Ben, 30 September 2026, Command Center card `jobguard-push-delegation`…)". Its merge conditions: CI fully green on the exact head; a recorded PASS verdict bound to that head; a separate acceptance by an actor that is neither the builder nor the checker session, at `docs/verdicts/<TASK>/<commit>-acceptance.md`; migration order (§12.2); no founder-reserved area touched. Note: PR #93 carrying this text is still OPEN and unmerged; `origin/main:BUILD_PLAN.md` has no "Written delegation" entry.
- `AGENTS.md` §5.13 on `main`: a different model records a verdict bound to the exact commit; a separate actor records acceptance; a builder never accepts its own work; source-inspected, test-executed and independently-verified are different claims.
- The PR body's extra condition: green CI on three consecutive runs of the same head (because this PR fixes flakiness).

## 2. Binding chain — PASS
- **Code head (verdict-bound):** `cf59d09c6fc1ac71c45e766bd0c8f27f7c24cb56`. `cf59d09.md` reads "VERDICT: PASS", HEAD cf59d09…, reviewer Codex/GPT, independent of the Claude repair builder.
- **Docs-only commits after it:** `git log --stat cf59d09..HEAD` lists exactly two commits:
  - `035d5a5` — `M docs/verdicts/TEST-STAB-2026-09-30/REPAIR-1.md`, `A docs/verdicts/TEST-STAB-2026-09-30/cf59d09.md`;
  - `c70873e` — `A docs/verdicts/TEST-STAB-2026-09-30/035d5a5-acceptance.md`.
- `git diff --quiet cf59d09 c70873e -- . ':(exclude)docs/verdicts'` exits 0. Tree hashes are identical at cf59d09 and c70873e for `apps` (4a2eb43…), `packages` (eabb363…), `config` (691eae2…), `tools` (6c1b8f8…), `.github` (86da659…), `package.json` (047f75d…) and `pnpm-lock.yaml` (b44064f…).
- **Final candidate:** the commit that adds this file, whose parent is `c70873ecde28bc7fc9e6c3138b892fce44677015`. It adds only `docs/verdicts/TEST-STAB-2026-09-30/c70873e-acceptance.md`, so the Codex PASS on cf59d09 binds the code of the final candidate. Strictly, the PASS names cf59d09 rather than the final SHA; this acceptance relies on the code-identity argument above, as did the 035d5a5 acceptance.

## 3. Roles — PASS (no actor accepted its own work)
| Step | Actor | Record |
|---|---|---|
| Original code `a92ed6b` | Codex (git identity "Ben Harwood") | `RECEIPT.md` |
| REPAIR verdict on a92ed6b | Claude cloud session `session_018WSeySi5BzWEJ1yyt1qaVD` | `a92ed6b.md` |
| Repair `cf59d09` | same Claude cloud session (author "Claude") | `REPAIR-1.md` |
| PASS verdict on cf59d09 | Codex/GPT, relayed verbatim by Ben | `cf59d09.md` |
| Earlier acceptance at 035d5a5 | Claude subagent of the cloud session (self-flagged as possibly advisory) | `035d5a5-acceptance.md` |
| This acceptance | fresh-context Claude Opus 5.5, separate session | this file |

Each code change was checked by a different model from its builder (Codex built → Claude checked; Claude repaired → Codex checked).

## 4. Scope of `git diff origin/main...HEAD` — PASS
26 files, +900/−123 at c70873e:
- **Web UI** (`apps/web/app/ui/`): `purchase-order.tsx`, `purchase-order-state.ts` (new), `materials.tsx`, `materials-command.ts` (new), `supplier-documents.tsx`, `supplier-fact-editor.tsx`, `supplier-match.tsx`, `things-to-check.tsx`.
- **New unit tests:** `purchase-order-state.test.ts`, `materials-command.test.ts`, `supplier-fact-editor.test.ts`.
- **e2e:** `apps/web/e2e/M2-1B-S.spec.ts`, `M2-5-S.spec.ts`.
- **Core:** `packages/core/src/money.ts` (+ exact `parsePoundsToPence`), `money.test.ts` (import extended, 12 lines added, none removed).
- **Config:** `config/agent-lane-assignments.json`.
- **Inherited from #94:** `package.json`, `pnpm-lock.yaml` — `git diff 10f1fae HEAD -- package.json pnpm-lock.yaml` is empty (byte-identical to the accepted #94 head; `pnpm.overrides` additions only).
- **Records:** `docs/verdicts/SEC-DEPS-2026-09-30/*` (3), `docs/verdicts/TEST-STAB-2026-09-30/*` (5).

A filter for anything outside those declared paths returns nothing.

**No CI check weakened:**
- `git diff --quiet origin/main HEAD -- .github tools turbo.json pnpm-workspace.yaml .nvmrc packages/db apps/api packages/ai packages/storage packages/config apps/web/app/api apps/web/playwright.config.ts apps/web/vitest.config.ts vercel.json .env.example docker-compose.yml` exits 0. The CI workflow (`.github/workflows/ci.yml`), lint/lane tools, Playwright and Vitest configs, migrations, DB/API/AI code and deploy/env files are unchanged.
- e2e specs, compared statement by statement against main: `test.setTimeout(180_000)` and the single `timeout:45_000` poll are unchanged in both specs. There are no `.skip`, `.only`, `fixme`, `retries`, `describe.configure`, `route(` interception, `slow(` or `waitForTimeout`. The only edits are added assertions that wait for committed state: M2-1B-S gains 9 statements (approve-disabled checks; preview revision/quantity/recipient/net per edit; revision 5 / quantity 10 / £200.00 before approval) and extends the existing edit-loop tuple without changing its original values. M2-5-S gains 16 waits/assertions, using the pre-existing `V`/`X` helpers.
- Added lines under `apps/` and `packages/` contain no `process.env`, external URL, `eslint-disable` or `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`. Every `/api/...` endpoint they call was already called from `apps/web/app/ui` on main, and there are no new API routes.

**Lane JSON (structural comparison vs main):**
- `version` 2 → 2; no other top-level key changed; 72 → 74 lanes; none removed or changed.
- Added `sec-deps-2026-09-30`, identical to #94's entry.
- Added `test-stab-2026-09-30`: exact branch only, the 13 exact UI/test/e2e paths, `packages/core/**` (already present in a92ed6b's entry), `config/agent-lane-assignments.json`, `docs/verdicts/**`, `package.json` and `pnpm-lock.yaml`.
- The repair added exactly `supplier-fact-editor.test.ts`, `package.json` and `pnpm-lock.yaml` (as corrected in `REPAIR-1.md`). There is no repository-wide wildcard.

**Founder-reserved areas: none touched.** No live provider, production mode, real data, spending, decision approval, deployment, release or CI weakening. The UI still labels the order "simulated", and the money parser is stricter, not looser. No migration changed, so migration order (§12.2) is unaffected. `git merge-tree --write-tree origin/main HEAD` exits 0 (no conflicts).

## 5. The PASS verdict addresses both P1 findings in `a92ed6b.md` — PASS
- **P1 numeric-quantity crash (M2-5-S):**
  - Root cause confirmed in source: `packages/db/src/supplier-document-repository.ts` builds `confirmed` with `row_to_json(r)` over `app.supplier_fact_revision`, whose `quantity_decimal` is `numeric(20,6)` and whose price columns are `bigint` (migration `0036_supplier_fact_confirmation.sql`). That JSON reaches the editor as numbers.
  - At cf59d09 the editor wraps the value in `String(…)` before `.replace`, and the `confirmed` type admits `string | number`. `inputPounds` uses `BigInt(p)`, which accepts integer numbers.
  - `supplier-fact-editor.test.ts` renders the real component with numeric `confirmed` columns and asserts the visible quantity `10`, `£25.00`, `£250.00` and "Confirmed revision 1", plus a string-quantity case (`10.5`).
  - The Codex verdict reports reproducing `.replace is not a function` against the a92ed6b editor; this agent did not re-run that mutation.
- **P1 lane-lint failure in CI:** the test-stab lane now lists the inherited `package.json` and `pnpm-lock.yaml`. This agent's `LANE_BASE_REF=origin/main pnpm lint` passes the lane check against base 694e9e1 (§6).
- The P2 from `a92ed6b.md` (no executed e2e evidence) is answered by `REPAIR-1.md`'s three local e2e runs and by CI. The three P3s remain open (§8).

## 6. Evidence
**Executed by this agent** (macOS arm64, Node v24.17.0 — `.nvmrc` says 24.15.0, engines `>=24 <25` satisfied; pnpm v10.28.1 via the packageManager pin; worktree at HEAD c70873e):

| Command | Exit | Result |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 1 | `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`: the existing `node_modules` recorded a store at `<worktree>/.pnpm-store`, which an earlier run had moved to `/tmp`. Environment issue, not a lockfile issue. |
| `CI=true pnpm install --frozen-lockfile --store-dir /tmp/test-stab-2026-09-30-pnpm-store --prefer-offline` | 0 | Recreated `node_modules` (a rebuildable dependency folder). "Lockfile is up to date"; 460 packages; "Done … using pnpm v10.28.1". `package.json`/`pnpm-lock.yaml` unchanged; `git status --porcelain` empty afterwards. |
| `pnpm typecheck --force` | 0 | 7/7 tasks successful, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0 | Core purity passed (69 files). Lane boundary passed for `test-stab-2026-09-30` against base 694e9e1 (26 files). Money arithmetic boundary passed. 7/7 package lint tasks, 0 cached. |
| `pnpm --filter @jobguard/core test` | 0 | 68 files, 380/380 tests passed |
| `pnpm --filter @jobguard/core build` | 0 | prerequisite for web tests (rebuildable `dist`) |
| `pnpm --filter @jobguard/web test` | 0 | 7 files, 56/56 tests passed |
| `pnpm exec vitest run --reporter=verbose` on the three new web test files | 0 | 3 files, 20/20 (18 race/approval tests + 2 editor tests) |

The outer pnpm 11.8.0 launcher prints a warning that it ignores `pnpm.overrides`. The install itself ran under the pinned v10.28.1 and reported the lockfile up to date.

The core count of 380 matches `REPAIR-1.md` and `a92ed6b.md`. The Codex verdict's "190" is not reproduced here.

**Source-inspected, not executed:**
- the command-lock module and its use in all six components;
- the approval gating in `purchase-order-state.ts`;
- `parsePoundsToPence` (regex, then bigint, then max check; no float);
- the e2e statement diffs;
- the lane JSON;
- the DB root cause of the numeric quantity.

**Observed, not executed** (context only, run-level conclusions from `gh run list`; job logs not inspected by this agent):
- run 36844541617 on c70873e, attempt 1: success;
- run 36834897366 on 035d5a5, attempt 3: success;
- run 36830110781 on cf59d09, attempt 2: success;
- run 36757408925 on a92ed6b: failure.

None of these is on the final candidate SHA.

**Not verified by this agent:**
- e2e (Playwright) and database suites, by instruction;
- `pnpm build`;
- the full `pnpm test`;
- the old-editor mutation;
- the Codex provenance of `cf59d09.md`;
- the Command Center delegation card;
- any CI result on the final candidate SHA, which does not exist yet.

## 7. Merge condition that remains (not satisfied by this file)
Before merging, the coordinator must obtain **three consecutive full green GitHub CI runs on the exact final SHA** that adds this file. Each run must have `checks` (install, typecheck, lint, test, build, browser install, production web e2e at mobile and desktop sizes), `secrets` and `dependency-review` all succeeding, with no failed or cancelled attempt in between.

The merging actor should also confirm:
- the final SHA's parent is `c70873e`;
- `git diff --name-status c70873e <final>` shows only `A docs/verdicts/TEST-STAB-2026-09-30/c70873e-acceptance.md`;
- `git diff --quiet cf59d09 <final> -- . ':(exclude)docs/verdicts'` exits 0;
- the PR is still mergeable/clean against `main`.

If any code commit lands after cf59d09, this acceptance and the cf59d09 PASS no longer bind, and new evidence is needed.

## 8. Open items (recorded, not blocking this technical acceptance)
- **Delegation location:** the delegation exists only on the unmerged plan branch `claude/plan-rev30` (PR #93 OPEN).
- **Merge actor:** it grants merge authority to "the Claude checker". On this PR the final code was checked by Codex and repaired by the Claude cloud session, so the coordinator or founder should confirm who performs the merge.
- **P3s from `a92ed6b.md`, still open:**
  - server-side placement does not reject a superseded purchase-order revision;
  - a fetch that never settles holds the job-scoped lock until reload;
  - `parsePoundsToPence` rejects surrounding whitespace (the UI could trim).
- **Follow-up candidates in the out-of-scope UI sweep** (`RECEIPT.md` lines 47–59):
  - float money in `recovery-cases.tsx`;
  - missing shared command locks in several other screens;
  - a late-preview race in `customer-credit-notes.tsx`.
