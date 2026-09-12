# JobGuard — review handoff (how a build task gets an independent verdict)

> **▓▓ THIS IS THE JOBGUARD BUILD ▓▓** — repo `/Users/benharwood/Claude/Projects/my-new-project`, plan `BUILD_PLAN.md`, tasks named `M0-1…M0-13`, `M1-…`. The control plane has its own handoff (`agent-delivery-control-plane/docs/review/GOV_CONTROL_PLANE_REVIEW_HANDOFF.md`). Same loop, different build — keep the two separate.

**The problem this solves:** the JobGuard build chat has no live channel to a reviewer or to any other chat. It must never try to "contact" one. Reviews are **asynchronous and relayed by you (Ben)** — the OWN MIND builder→checker→accept loop, run by hand.

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

## Do we need GitHub?

No — this is a local build; the relay above needs no remote. A GitHub remote/push is **founder-reserved** (it publishes your commercial IP) and only worth it if you later want hosted agents or an automatic push/pull bus. Recommendation: stay local now.
