# Technical acceptance TEST-STAB-2026-09-30 — PR #95 — head 035d5a5eee608a4b8dff6b4b50e0bb937c684618 — ACCEPTED

**Actor:** a separate, fresh-context Claude acceptance agent. It did not build or check this change, and it was read-only apart from writing this file. **Independence disclosure:** this agent was launched as a subagent of the Claude cloud session `session_018WSeySi5BzWEJ1yyt1qaVD`. That session recorded the a92ed6b REPAIR verdict and built repair cf59d09 (both commits carry that `Claude-Session` trailer). The delegation's wording, "(a fresh-context acceptance agent)", is met. If the founder reads "neither the builder nor the checker session" as excluding subagents of the builder's session, he should treat this acceptance as advisory.
**Date:** 2026-10-01.
**Repository / PR:** `ben2harwood-lgtm/jobguard` PR #95, branch `codex/sandbox/test-stab-2026-09-30` → `main`. It is stacked on PR #94 (SEC-DEPS-2026-09-30, head `10f1fae9bdcba62157ccd8b1cac5947ce7992e42`, PASS + accepted in `docs/verdicts/SEC-DEPS-2026-09-30/`). Merging #95 lands #94's three commits as well.
**Base:** `origin/main` = PR base = `694e9e1755f2a5680898eb0fa04af48afd66c86b`.
**Code head (verdict-bound):** `cf59d09c6fc1ac71c45e766bd0c8f27f7c24cb56`.
**Current PR head (accepted):** `035d5a5eee608a4b8dff6b4b50e0bb937c684618`. The PR API `head.sha`, `origin/codex/sandbox/test-stab-2026-09-30` after `git fetch` and local HEAD all agree.

**Roles (from the receipts and verdicts; git author metadata does not separate actors):**
- Original code `a92ed6b`: built by Codex (`RECEIPT.md`, local git identity "Ben Harwood").
- REPAIR verdict on `a92ed6b`: recorded by the Claude cloud session (`a92ed6b.md`).
- Repair `cf59d09`: built by the same Claude session (`REPAIR-1.md`, author "Claude").
- PASS verdict on `cf59d09`: recorded by Codex/GPT (`cf59d09.md`), relayed verbatim by Ben.

No actor accepted its own work. The repair's builder (Claude) and its checker (Codex) are different models. The original builder (Codex) and its checker (Claude) are also different. This agent could not verify the Codex origin of the relayed text and relies on the founder's relay.

**Rules applied:**
- The written delegation in `BUILD_PLAN.md` on `origin/claude/plan-rev30` (`c2c68c8`), line 80, "Written delegation (Ben, 30 September 2026, Command Center card `jobguard-push-delegation`…)". That branch is the unmerged plan PR #93, so the delegation is not yet on `main`.
- AGENTS.md §5.13 on `main`.
- The PR body's added condition: green CI on three consecutive runs of the same head.

## 1. Scope of the diff — PASS
`git diff origin/main...origin/codex/sandbox/test-stab-2026-09-30 --stat` reports 25 files, +808/−123:
- **Web UI:** `apps/web/app/ui/` `purchase-order.tsx`, `purchase-order-state.ts` (new), `materials.tsx`, `materials-command.ts` (new), `supplier-documents.tsx`, `supplier-fact-editor.tsx`, `supplier-match.tsx`, `things-to-check.tsx`.
- **Unit tests:** `purchase-order-state.test.ts`, `materials-command.test.ts`, `supplier-fact-editor.test.ts` (all new).
- **e2e:** `apps/web/e2e/M2-1B-S.spec.ts`, `M2-5-S.spec.ts`.
- **Core:** `packages/core/src/money.ts` and `money.test.ts` (exact `parsePoundsToPence`).
- **Config:** `config/agent-lane-assignments.json`.
- **Inherited from #94:** `package.json` (`pnpm.overrides` only, identical to the accepted #94 change) and `pnpm-lock.yaml`.
- **Records:** `docs/verdicts/SEC-DEPS-2026-09-30/*` (3) and `docs/verdicts/TEST-STAB-2026-09-30/*` (4).

Checks on the scope:
- `git diff --quiet origin/main <head> -- .github tools pnpm-workspace.yaml .nvmrc turbo.json packages/db apps/api packages/ai vercel.json .env.example` exits 0. No CI workflow, tool, lane linter, migration, DB/API/AI code, deploy config or env contract changed. A name grep for `migration|.github|tools/|deploy|vercel|.env` over the changed files finds nothing.
- No check was weakened. The e2e diffs keep `test.setTimeout(180_000)` and the 45 s poll timeout unchanged and only add assertions that wait for committed state (preview revision/quantity/recipient/net, delivery/match values, confirmed revision text). The added lines under `apps/` and `packages/` contain no `.skip`, `.only`, `fixme`, retries, timeout change, `eslint-disable` or `ts-ignore`/`ts-expect-error`. There is no audit waiver.
- **Lane JSON:** structural comparison against `origin/main` shows version 2 → 2, no other top-level key changed, no lane removed or changed, and two lanes added:
  - `sec-deps-2026-09-30`: identical to the accepted #94 entry.
  - `test-stab-2026-09-30`: exact branch only; 13 exact web/e2e paths, `config/agent-lane-assignments.json`, `package.json`, `pnpm-lock.yaml`, plus `packages/core/**` and `docs/verdicts/**`. The `packages/core/**` directory scope was already present in a92ed6b's lane entry, so the repair did not introduce it (it is broader than the two money files actually changed). The repair added exactly three paths, `supplier-fact-editor.test.ts`, `package.json` and `pnpm-lock.yaml`, as corrected in `REPAIR-1.md`. There is no `**` blanket grant.
- **Founder-reserved areas:** none touched (no live provider, production mode, real data, spending, decision approval, deployment or release).

## 2. Verdict binding — PASS
- `cf59d09.md`: "VERDICT: PASS", HEAD `cf59d09c6fc1ac71c45e766bd0c8f27f7c24cb56`, reviewer Codex/GPT, which states it is independent of the Claude repair builder. It separates what was executed (unit tests, old-editor regression) from what was not (e2e, full suite, three CI runs).
- `git log origin/main..HEAD` shows one commit after `cf59d09`, namely `035d5a5`. `git diff --name-status cf59d09 035d5a5` gives `M docs/verdicts/TEST-STAB-2026-09-30/REPAIR-1.md` and `A docs/verdicts/TEST-STAB-2026-09-30/cf59d09.md` only, so the code at the verdict-bound head is identical to the current head.

## 3. CI — PASS (three consecutive green attempts on the exact head)
Workflow run 36834897366 (CI, `head_sha` 035d5a5…, `run_attempt` 3, conclusion success). Jobs per attempt, from `gh api …/runs/36834897366/attempts/{n}/jobs` and `actions_get get_workflow_job`:

| Attempt | checks | secrets | dependency-review |
|---|---|---|---|
| 1 | 110279845927 success (08:12–08:22Z) | 110279845765 success | 110279846006 success |
| 2 | 110283309013 success (08:23–08:32Z) | 110283308702 success | 110283309248 success |
| 3 | 110299148291 success (09:08–09:17Z) | 110299148113 success | 110299147884 success |

- In every attempt the `checks` job ran all its steps successfully: frozen install, typecheck, lint, test, build, browser install, and the production web e2e at mobile and desktop sizes.
- The attempt-3 log ends "Running 162 tests using 1 worker … 162 passed (5.8m)", with no flaky or retried test reported.
- PR check runs for the head list only the three CI jobs, all success.
- Earlier run 36830110781 on `cf59d09` was also green on both attempts. Attempt 1: jobs 110264538919/…941/…990. Attempt 2: jobs 110267558317/…557755/…558253.

## 4. Merge state — PASS
- PR #95 is open, not a draft, with `mergeable_state` = `clean`.
- `git merge-tree --write-tree origin/main origin/codex/sandbox/test-stab-2026-09-30` exits 0 with tree `8ab67697…` and no conflicts.
- Migration order (§12.2) is not affected because no migration file changed.

## 5. Repair spot-check — PASS
- `supplier-fact-editor.tsx` (a92ed6b→cf59d09): the initial quantity is now `String(fact.confirmed?.quantity_decimal ?? fact.quantity_decimal ?? "")` before the zero-trimming `.replace`. The `confirmed` type now admits `string | number`.
- The root cause is confirmed in source. `packages/db/src/supplier-document-repository.ts` builds `confirmed` with `(SELECT row_to_json(r) FROM app.supplier_fact_revision r …)` and does not normalize it, unlike the proposal columns.
- `supplier-fact-editor.test.ts` renders the real component with `renderToStaticMarkup`. It asserts the visible quantity `10`, `£25.00`, `£250.00` and "Confirmed revision 1" for numeric `confirmed` columns, and `10.5` for a string quantity. These are behavioural assertions, not snapshots or mocks of the code under test.
- Run here: `PATH=/tmp/jg-review/node-v24.15.0-linux-x64/bin:$PATH pnpm --filter @jobguard/web exec vitest run app/ui/supplier-fact-editor.test.ts` gave Test Files 1 passed, Tests 2 passed (Node v24.15.0).
- This agent did not re-run the old-editor mutation itself. Both REPAIR-1 and the Codex verdict report reproducing `.replace is not a function` against a92ed6b's editor.

## Open items (recorded, not fixed; not blocking)
- P3s from `a92ed6b.md`, still open:
  - Server-side placement does not reject a superseded purchase-order revision (the UI gating is the only guard).
  - A fetch that never settles holds the job-scoped command lock until reload, because there is no timeout.
  - `parsePoundsToPence` rejects trailing whitespace (the UI could trim).
- The out-of-scope UI sweep in `RECEIPT.md` lines 47–59 is left for follow-up:
  - float money in `recovery-cases.tsx`;
  - no shared command lock in `quote-editor.tsx`, the decision/readiness/inbox/final-account/fee-statement screens, the customer invoice/credit/receipt and recovery/evidence siblings, and WalkIt capture;
  - a late-preview race in `customer-credit-notes.tsx`.
- The delegation exists only on unmerged plan branch `claude/plan-rev30` (PR #93). This agent did not verify the Command Center card.
- The delegation grants merge authority to "the Claude checker". On this PR the Claude session built the repair and Codex checked it, so the founder should confirm who performs the merge.
- Local count differences: the Codex verdict reports "core unit tests 190 passed", while REPAIR-1 and a92ed6b.md report core 380. This does not affect the result, because CI ran the full suites green three times.
- Committing this file creates a new PR head. Before merging, the merging actor must confirm that the only commit after `035d5a5` adds this file and that CI is green on that final head (and on three consecutive runs if the PR-body rule is applied to the final head).

## Decision
**ACCEPTED.**
- The diff is limited to the declared web/core/lane scope plus the accepted #94 dependency files.
- The PASS verdict from a different model is bound to `cf59d09`, and only verdict records follow it.
- CI passed on three consecutive attempts of the exact head `035d5a5`.
- The PR merges cleanly, touches no migration, and touches no founder-reserved area.

This acceptance does not merge, push, deploy or release anything.
