# Q18 · V2-CI2: automatic guard for the audit-chain rule

Tier: **T2** (CI change, corrected 25 Nov 12:20 UK: planner miss, it was mislabelled T1). Stacked on **#917's branch** (`claude/project-thread-qfah0w`), because it adds to the CI workflow #917 introduces. Migration: none. Astra: no. Usefulness **high** (stops the most-missed rule of 24 Nov reaching review), effort **S**. Rework risk: **low**.
**Starts:** now. **Base:** #917's branch `claude/project-thread-qfah0w` (corrected 25 Nov 12:20 UK). Draft PR against it, retargeted to `v2/main` after #917 merges. Plan: Ben, 24 Nov 21:36 UK ("make sure every future piece is built [to the rules]... see if we can strengthen it").

> **Rules this piece must meet.** AGENTS.md rev 3.0, BUILD_PLAN.md and `01-RULES.md`; Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`).

## Astra conditions, approved by Ben (25 Nov 08:13 UK). These override the scope below where they differ.
- **The guard is a pointer, not a judge.** A search inside one method gives false positives, such as the watchdog idempotency helper (`packages/db/src/watchdog.ts` lines 129 to 150 on main), and misses ledger writes made through `SELECT app.post_*` (`packages/db/src/ledger.ts`). The static scan therefore **lists** the commands a PR changes that write business state, and posts that list for review. It fails only when a listed command has neither an exemption line with a reason nor matching evidence (next point).
- **Evidence per command (rule 25).** The guard checks that the PR's seed tests name each listed command in a case that asserts all three: the event, the replay, and the rollback.
- **Prove the guard catches the gap.** Add a deliberately broken fixture (a command with no audit append) and show the guard fails on it. Only after that is the guard made a required check, with Ben's merge of this PR.
- **Positive CI fixture.** Include the real stacked pair from #932, a Codex E3 branch on a Claude-named D3 base, so the scope selection doesn't skip it (see the CI1 scope finding, comment 7153704124).

## Goal
CI fails a V2 PR when a repository method writes data (INSERT, UPDATE or DELETE on a firm table) but its transaction has no `appendAuditBatch` call, so the audit-chain rule (AGENTS.md §5.7) is checked by a machine, not only by a reviewer.

## Scope
- `tools/v2/audit-chain-guard.mjs`: scan changed files under `packages/db/src/**` and `apps/api/src/**` (diff against `LANE_BASE_REF`, same pattern as `tools/agent-lane-boundary-lint.mjs`). For each function that issues a write, require `appendAuditBatch(` in the same function, or an explicit `// audit-chain: exempt <reason>` comment the reviewer must accept. Also flag a payload-references object with a `version` key.
- A unit test with three fixtures: write with audit (pass), write without audit (fail), exempt with reason (pass).
- Wire it into the existing V2 CI job (beside CI1's seed suite, #917) for PRs into `v2/main` and `codex/sandbox/v2-*` only. Do not change main's CI.
- Run it against today's branches and list what it flags in the PR body: it must flag `v2-crew-brief-repository.ts` on D4 #916 (the known gap) and nothing on D3 #912. Report, don't fix, what it finds.
- Lane file lists exactly your files.

## Done when
- The three fixture tests pass; the guard flags #916's gap and passes #912.
- CI green apart from the known Vercel check. A Claude session checks it. One build plus up to two repairs.
