VERDICT: PASS — bound to head d732b93ef7534c6b7ccabc0a3fccf8c4a21da115
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**Delta re-check** of the earlier PASS bound to 34be2c8 (https://github.com/ben2harwood-lgtm/jobguard/pull/110#issuecomment-6038166086). The head did not move while I reviewed: `gh pr view 110` gave `d732b93ef7534c6b7ccabc0a3fccf8c4a21da115` at the start and again just before posting.

**In short:** the only new commit, d732b93, merges main (6566abc) into the branch. It changes nothing in the ENT-4a work. The PR's own changes against the new main are byte-for-byte the same as they were against the old main. The lane registry is an exact union: main's 83 lanes, unchanged and in main's order, then the `ent-4a` lane, unchanged. Nothing main brought in touches the enterprise domain or anything it imports. `checks` is green on this exact head. That meets every condition in the earlier verdict's merge gate, so that PASS now carries over to d732b93.

## Findings

**P1:** none. **P2:** none.

**P3-D1 (carried, no action in this PR).** These follow-ups are unchanged from the 34be2c8 verdict and are still recorded in the round-2 and round-3 receipts:
- P3-R2 goes to ENT-7 (untimestamped inputs are not frozen at the cutoff).
- P3-R3 goes to ENT-6 (a partial refund can be steered through the supplied `remainingGross`).
- P3-4 goes to ENT-5.

This merge leaves all three as they were.

**P3-D2 (observation only).** The earlier review saw 5-second timeouts in SH-1's untouched `extra-origin` and `receipt-allocation` tests on a heavily loaded machine. Neither my run nor CI saw them on this head: core passed 591/591 in both. I make no claim about whether they will come back under load.

## 1. Head and merge identity
- d732b93 has two parents: 34be2c8 (the head the earlier review passed) and 6566abc (`origin/main`, which I confirmed by `git rev-parse origin/main` after fetching).
- **Independent reproduction.** I ran `git merge-tree --write-tree 34be2c8 6566abc` myself. Git's own merge conflicts on exactly one file, `config/agent-lane-assignments.json`. Its automatic tree differs from d732b93's tree in that one path only (`git diff --name-only <auto-tree> d732b93`). So every other file at d732b93 is what git itself produces, and the manual resolution touched only the lane file.

## 2. The PR's own changes are byte-identical
Both diffs below exclude `config/agent-lane-assignments.json`:
- `git diff 6566abc...34be2c8`: SHA-256 `44201bcf58972b12c3ff474b7ef4bdb5bb67756aac8ff967bdb38bb9e457f53b`, 179,461 bytes.
- `git diff 6566abc d732b93`: SHA-256 `44201bcf58972b12c3ff474b7ef4bdb5bb67756aac8ff967bdb38bb9e457f53b`, 179,461 bytes.
- `cmp` reports them identical.

The `--name-status` lists match exactly: the same 14 paths, namely the lane file, three `docs/verdicts/ENT-4a/` receipts, nine new files under `packages/core/src/enterprise-domain/`, and the one-line re-export added to `packages/core/src/index.ts`.

d732b93 differs from 34be2c8 in 20 paths. That is exactly the set main changed between a5ed99a and 6566abc. For each of those paths except the lane file, the blob at d732b93 equals main's blob at 6566abc (checked with `git rev-parse <commit>:<path>`).

**The lane file (parsed with Node):**
- The top-level keys are `version` and `lanes` on all sides, and `version` is 2 everywhere, unchanged.
- At d732b93 there are 84 lanes. The first 83 keys equal main's 83 keys in main's order, and every one of those lanes is JSON-identical to main's.
- The one extra key is `ent-4a`. It is JSON-identical to the `ent-4a` lane at 34be2c8: branch `codex/sandbox/ent-4a`, with the same 12 allow entries.
- There are no duplicate keys.
- 34be2c8 had changed none of its base's 80 lanes. The 80 lanes it shares with main are identical. The only lanes main adds are `sec-deps-2026-10-07`, `test-stab-3` and `outbox-adapter-1`, and all three are kept.
- **Byte-level check.** I rebuilt the expected file as main's JSON plus `lanes["ent-4a"]` from 34be2c8, serialised with `JSON.stringify` plus a newline. It is byte-identical to d732b93's file.

## 3. What main brought in, and whether it touches ENT-4a
`git log 34be2c8..6566abc` covers these merged changes:
- SEC-DEPS (#113): `package.json` overrides for sharp 0.35.5, proxy-addr 2.0.8 and source-map-js 1.2.2, plus `pnpm-lock.yaml`.
- TEST-STAB-3 (#114): `apps/web/e2e/SBOX-resume.spec.ts`.
- OUTBOX-ADAPTER-1 (#112): `packages/db/src/outbox.ts`, `outbox.test.ts` and `test/outbox.integration.test.ts`.
- Verdict docs for those three.

There are no changes in `packages/core`, and no changes to `AGENTS.md`, `BUILD_PLAN.md` or `docs/tasks`.

The enterprise domain imports only `zod`, `vitest` and the core modules `money`, `extra-origin`, `receipt-allocation` and `cumulative-fee`, none of which main changed. Nothing outside `packages/core/src/enterprise-domain/` references it except the `export *` line in `packages/core/src/index.ts` (grep over `apps/` and `packages/`). The merge contains no migration.

## What I executed
Everything below ran in my own detached worktree, `/private/tmp/opus-ent-4a-d732b93-0710`, at d732b93, on Node 24.17.0 and pnpm 10.28.1. No branches or refs were created.

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | exit 0 |
| `pnpm typecheck` | exit 0, 7/7 tasks |
| `node tools/agent-lane-boundary-lint.mjs` with a simulated `pull_request` event file (base 6566abc…, head d732b93…, ref `codex/sandbox/ent-4a`) and `GITHUB_HEAD_REF` | exit 0; "Lane boundary passed", lane `ent-4a`, comparison `merge-base`, the same 14 files |
| Negative control: the same event with ref `codex/sandbox/outbox-adapter-1` | fails: "Lane outbox-adapter-1 cannot edit: docs/verdicts/ENT-4a/…, packages/core/src/enterprise-domain/…" |
| `pnpm lint` under the same simulated event | exit 0: core purity (84 files), lane boundary, money arithmetic and commercial boundary passed; turbo lint 7/7 |
| `pnpm --filter @jobguard/core test` | exit 0, 41 files, 591/591 |
| `vitest run src/enterprise-domain` (verbose) | exit 0, 4 files, 278/278 (the same count the 34be2c8 review recorded); no `.skip`, `.only` or `.todo` in the enterprise tests |
| `node --test tools/*.test.mjs` | 42/42, 0 skipped |
| `pnpm build` | exit 0, 7/7 |
| `git merge-tree --write-tree 34be2c8 6566abc` | conflict on the lane file only; the auto-merged tree differs from d732b93 only on that path |

I did not re-run the functional ENT-4a probes from the earlier reviews. The ENT-4a code at d732b93 is proven byte-identical to 34be2c8, which those probes covered.

## Relied on CI (exact head)
Run 37653528092: event `pull_request`, `headSha` d732b93ef7534c6b7ccabc0a3fccf8c4a21da115, conclusion `success`.
- `checks` passed in 10m16s:
  - typecheck 7/7; lint passed, with lane boundary `ent-4a` against base 6566abc;
  - tools 42/42, core 591/591, API 108, web 63, AI eval 72, config and storage 1+2;
  - PostgreSQL 39 files / 198 tests, now including main's new outbox tests;
  - build 7/7; e2e 166 passed at mobile and desktop sizes.
- No failures, retries or ECONNREFUSED lines appear in the job log. The only "skipped" hits are pnpm's lockfile message, "skipped 0" and a webpack cache warning.
- `secrets` passed.
- `dependency-review` passed. It is now green because #113 is on main.
- Vercel api and demo: "Canceled by Ignored Build Step", reported as pass.

I relied on CI for the PostgreSQL and e2e suites. I did not run them locally.

## Not verified
- A run on the pinned Node 24.15.0 (I used 24.17.0 locally; CI used its own setup-node).
- Local PostgreSQL or e2e runs.
- The commercial validity of the D16 terms, which stay `proposed`. Nothing in this PR opens a gate, enables production mode or authorises posting.

**Merge note.** ENT-4a adds no migration, so Ben's 5 Oct renumber ruling does not apply.

