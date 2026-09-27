# JobGuard — review handoff (how a build task gets an independent verdict)

> **▓▓ THIS IS THE JOBGUARD BUILD ▓▓** — repo `/Users/benharwood/Claude/Projects/my-new-project`, plan `BUILD_PLAN.md`, tasks named `M0-1…M0-13`, `M1-…`. The control plane has its own handoff (`agent-delivery-control-plane/docs/review/GOV_CONTROL_PLANE_REVIEW_HANDOFF.md`). Same loop, different build — keep the two separate.

## ▓▓ CURRENT STATE — RESUME HERE (2026-09-14) ▓▓

**Build model now:** cloud-autonomous. Codex builds each leaf and opens a real GitHub PR on the private remote `ben2harwood-lgtm/jobguard`; an independent Claude checker reviews PRs, merges green on-contract ones, and bounces the rest with `@codex` comments. The "human-relayed / no-remote / no-live-reviewer" text further down is **historical**.

**Merged to `main`:** all buildable M0 foundations, M1-1 (#14), M1-2 (#16), the #15 CI/security repair, **M1-3 (#17)**, **M1-4 (#18)**, **M1-5 (#22)**, **M1-6 (#23)**, **M1-7 (#24)**, **M1-8 (#25)**, and **M1-9 (variations + priced-revision approval provenance, #26, merged 2026-09-14, main CI green)**, migrations through `0014_variations`. Built on synthetic data (money/live-send/live-AI/live-transcription all OFF; £79/1.5% fee illustrative-until-D01; D01 unapproved; AI is always a labelled suggestion). Next feature leaf: **M1-10** (proof capture + operational stage gates — involves PHOTO UPLOAD: use synthetic fixture images generated at RUNTIME only, never a committed binary; audit stores evidence hash/identity only, never the image or free text; no real data/bucket; states uploaded/verified/rejected distinct). Then M1-11..M1-14, M1-15. Every new leaf branches off latest main + registers its own lane (Codex mis-names the lane every time — even when its summary claims otherwise; checker one-line-fixes it). Every new leaf branches off latest main and registers its own lane; Codex keeps registering a guessed lane name instead of the real auto-generated branch, so the checker fixes that one-line mismatch each time (m1-4 and m1-5 both needed it). Every new leaf must branch off latest main and register its own lane in `config/agent-lane-assignments.json` (exact branch name). M1-4 needed three checker interventions: a one-line lane-name fix, and — after Codex's e2e fix got stuck in its sandbox with no push button — landing it via a fresh `@codex` PR comment's GitHub-Mention task + Update-branch. Checker caught two real M1-4 defects CI-first: a leaked-connection teardown (on M1-3) and an e2e regression where M1-4's `review-proposal.tsx` edit broke the M1-3 journey.

**PR #15 — CI/security repair + capture reconciliation** (branch `codex/fix-jobguard-ci-guards-2026-09-14`):
- Verified combined tip: **`bc9bb03a7c54946c0352e9da2aa1e757be867e26`** (tested 2026-09-14).
- The branch already contains **all of `main` including #16** plus the CI/security repairs — `origin/main` is a strict ancestor, so a merge would be a clean fast-forward. GitHub's earlier "conflict" flag was stale (it predated Codex's reconciliation commits). Nothing in `main` is missing from the branch.
- **Branch CI at `bc9bb03`: ALL GREEN** — `checks` ✅, `dependency-review` ✅ (the real dependency audit now passes after audited version pins), `secrets` ✅.
- Independent local verify in a detached worktree corroborated `typecheck` ✅ and `build` ✅. Its `lint`/`test` failures were **verification-setup artifacts, not code defects**: the lane-boundary lint fails on a detached HEAD by design; one API test failure was a stale `dist/**` compiled test double-counted because `build` ran before `test`; `@jobguard/db` integration tests need a running Postgres not present in the local shell. All three pass on the real branch in CI.
- **Independent checker verdict: ACCEPT** (recorded 2026-09-14). Reviewed the receipt and the actual merge version `bc9bb03`: the CI/security guards are strengthened, not weakened — the dependency audit runs fail-closed at `--audit-level=low` with `--ignore-registry-errors=false`/`--ignore-unfixable=false`, no waivers, no `continue-on-error`, no skipped/`.only` tests, no `eslint-disable`/`@ts-ignore`, RLS untouched; new regression tests assert the CI cannot be silently weakened. node:crypto fixed by declaring real Node types, not relaxed type-checking. Diff is confined to CI tooling, lane policy, dependency manifests/lockfile, Playwright config and evidence docs — no app/UI/db/migration/OpenAPI source. Audit baseline was 81 findings (5 crit/35 high/34 mod/7 low); after audited pins the scan reports 0/0/0/0/0.
- **MERGED to `main` on 2026-09-14** (Ben approved conditional on review + all checks passing). Squash-merge commit `064ceda`, branch deleted. Post-merge **main CI is GREEN** (checks + dependency-review + secrets all pass). Note: main's CI had been failing on every prior commit (broken push-comparison + skipped dep scan); #15 is what makes main's checks honest and green.

**Next step:** none for #15 — done. The M1-3 PR (#17) is now behind this new main and may need a rebase onto `064ceda` before it merges. OWN MIND repo left untouched.

---

**The problem this solves (historical):** originally the JobGuard build chat had no live channel to a reviewer, and reviews were relayed by hand. That is superseded by the cloud-autonomous model above — a live Claude checker now reviews PRs directly.

## The loop, per JobGuard task

1. **JobGuard build chat** builds one task (e.g. `M0-1`), runs its tests, commits it on a branch `codex/m0-1-<slug>`, writes a run receipt, and stops with "M0-1 ready for review".
2. **You**, in a terminal in `my-new-project`:
   ```bash
   git diff main...HEAD > /tmp/jobguard-M0-1.diff
   ```
   Gather three things: that diff, the task's "Done when" list from `BUILD_PLAN.md` §5, and the agent's run receipt.
3. **Paste those three into a reviewer** — this Claude session, or a fresh Claude chat started with the reviewer prompt below.
4. **Reviewer returns** ACCEPT / REPAIR / REJECT + reasons. Save to `docs/verdicts/M0-1-claude.md`.
5. **ACCEPT** → `git checkout main && git merge --no-ff codex/m0-1-<slug>`. **REPAIR/REJECT** → paste reasons back into the build chat (max two rounds, then hold).
6. The builder never reviews its own work; you never merge without a saved verdict.

## Reviewer prompt (paste into a fresh Claude chat to make a dedicated JobGuard checker)

> You are the independent checker for a **JobGuard** build task (a UK builders' money/quotes/recovery SaaS). You did not write this code; be adversarial and concrete. I will paste: (a) the task's "Done when" criteria, (b) the agent's run receipt, (c) the diff. Judge whether the diff meets every "Done when" bullet, whether the receipt's claims are supported by the diff (a claimed test must appear and actually exercise the invariant — money maths must be exact-integer, tenant isolation and command authorization must be tested not asserted), and whether any non-negotiable (AGENTS §5) is asserted but untested. "Source-inspected", "test-executed", "independently-verified" are different claims; missing evidence is a hold. No "proof/guarantee/certified" language. Return exactly: **VERDICT: ACCEPT / REPAIR / REJECT**, then a numbered list of what is wrong or missing (empty if ACCEPT), then the one line the builder does next. Review, do not rewrite. Here is the task:

Then paste (a), (b), (c).

## GitHub (current)

The private remote `ben2harwood-lgtm/jobguard` is live and is now the build surface: Codex opens PRs, CI runs on each, and the checker reviews and merges. Merge to `main`, release and deployment remain **founder-reserved**. The "stay local, no remote" advice below/above is historical.
