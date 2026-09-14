# CI repair: scope and verification

Date: 2026-09-14. User-authorised repair of three checking defects, not a new product build.

## Ownership and base

Repository: `ben2harwood-lgtm/jobguard`.
Base inspected: `739d681e207b8b9ad29e9e9e950bd156c501bcfe`, including the merged #14 UI work.
Repair branch: `codex/fix-jobguard-ci-guards-2026-09-14`.
Pull request: https://github.com/ben2harwood-lgtm/jobguard/pull/15

Ben identified the paused `integration/own-mind-reconciled-2026-08-21` branch. Connector branch searches located it in `ben2harwood-lgtm/next-gen-learning-platform`, not JobGuard. This repair does not change or resume that branch. Application source, package manifests, lockfile, database migrations, provider settings and product approvals are outside this repair's file scope.

## 1. Event-specific comparison

The old workflow supplied `origin/${{ github.base_ref }}` on main pushes, producing `origin/`. The guard now reads the GitHub event JSON and validates actual commit objects:

- Pull requests: merge-base comparison between the event's immutable base and head SHAs. The checkout must contain the PR head. Base-branch-only changes do not become the task's changes.
- Main pushes: the complete `before` to `after` range, including multi-commit pushes. HEAD must equal `after`. Non-fast-forward pushes require review and fail rather than silently reducing coverage.
- Initial branch push: inspect the entire tracked tree. Missing history, unsupported events and self-comparison never become a clean pass.
- Local use: compare against the task base (`LANE_BASE_REF`, otherwise available `origin/main` or `main`) and additionally inspect staged, unstaged and untracked files. Local main uses its previous commit. A missing comparison base fails explicitly.

Renames are checked as deletion plus addition. NUL-delimited Git output preserves whitespace/newlines in paths.

## 2. Explicit task lanes

Policy version 2 has no default lane and no `**` blanket grant. Every task branch must match exactly one registered lane. The observed descriptive Codex branch names are registered alongside the M0 task prefixes; the money task uses the actual leaf-file paths rather than nonexistent money/quantity/tax directories. Unregistered branches, ambiguous assignments and conflicting lane overrides fail.

`main` has an explicitly named integration scope because it combines multiple tasks. It is not a task-lane fallback and a PR cannot borrow it. Scope checks prevent accidental file overlap; they are not a security sandbox against an author who can edit the workflow, checker or policy. Policy changes and merges still need independent review and founder acceptance. No branch-protection settings were changed.

Before issuing a new task with an unregistered branch, add its intended files and branch mapping through a separately reviewed policy change. Do not restore the old `work`/all-files fallback to silence a failure.

## 3. Real dependency vulnerability scan

The existing `dependency-review` check identity is retained. It now runs a pinned-pnpm registry audit on PRs AND main pushes for private repositories, without GitHub Advanced Security dependency-review eligibility requirements. It installs from the frozen lockfile with dependency lifecycle scripts disabled in the scan job, then runs `node tools/dependency-audit.mjs`.

Production, development and optional dependencies are included. All reported vulnerability severities fail; no exclusions or baselines were added. A timeout, failed command, registry error, invalid JSON or incomplete result also fails. Findings are printed and a summary is written to the GitHub job summary. A registry's clean response means no known vulnerabilities were reported for that lockfile at that time, not proof that dependencies are safe. This does not replace licence, maintainer/provenance or malicious-package review.

The advisory lookup uses the configured package registry and discloses dependency inventory as part of a normal package audit; application code, customer data and credentials are not submitted by this script. Any pre-existing vulnerable pins need a separately scoped security update rather than an exception hidden in this checking repair.

## Verified hosted execution receipt

**Correction:** the initial receipt asserted a local 34-test run and a Git version without retained execution evidence. That local receipt is withdrawn, as are any local-verification claims in the initial commit/PR description. The evidence below is the actual hosted execution retrieved from GitHub, not a reconstruction of a local run.

Implementation commit tested: `ae65911be8af0a5f872840463c9081449a699745`, against base `739d681e207b8b9ad29e9e9e950bd156c501bcfe`.
Run: https://github.com/ben2harwood-lgtm/jobguard/actions/runs/34826582795
Checks job: https://github.com/ben2harwood-lgtm/jobguard/actions/runs/34826582795/job/103920033294
Runtime shown in that log: Ubuntu 24.04.5, Node 24.15.0, pnpm 10.28.1, Git 2.55.0.

| Executed check | Observed result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm typecheck` | Passed, seven workspace packages |
| `pnpm lint` | Passed; lane resolved to `ci-repair`, precisely the seven intended changed files |
| `pnpm test` | Passed: 38 tools tests plus 116 workspace tests = **154 tests** |
| New regression tests within those tools tests | **34 passed**, covering lane/range behavior and audit error handling |
| `pnpm build` | Passed, including the current Next.js web app and Nest server |
| Secrets job | Passed |
| Actual dependency registry audit | Completed, **failed on advisory findings**, not skipped |

The workspace breakdown is core 46, database integration 46, API 14, AI 6, storage 2, config 1 and web unit 1. The workflow did **not** run the separate Playwright `test:e2e` command. Do not describe these results as end-to-end product acceptance.

Push, initial-tree and local diff paths were exercised by the new tests using real temporary Git repositories with synthetic event payloads. The live hosted invocation above was a pull-request event. A post-merge main-push run remains to be verified after authorised merge; this branch has not been merged just to obtain that evidence.

## Security hold exposed by the working scan

Audit job: https://github.com/ben2harwood-lgtm/jobguard/actions/runs/34826582795/job/103920032918
Command: `node tools/dependency-audit.mjs`, invoking the real `pnpm audit` registry lookup.
Observed exit code: **1**.
Observed advisory-finding counts: **100 total: 3 critical, 40 high, 54 moderate, 3 low, 0 info**.

These are dependency-audit counts, not a claim of 100 distinct exploitable application bugs. The audit includes production and development dependencies, and actual exploitability depends on package use and exposure. The report includes existing Next.js 15.3.3 and Vitest 3.2.4 dependencies. No dependency version or lockfile was changed by this repair, so these findings were not introduced by a dependency upgrade in this PR.

Do not skip the audit, ignore critical findings, or report the overall workflow as green. Before release, a separately scoped dependency-remediation change must update affected direct/transitive dependencies, regenerate the lockfile, rerun the full checks and the live audit, and exercise relevant browser/server behavior. Avoid automatically accepting major-version migrations or applying unreviewed blanket overrides.

## Review handoff

The three checking repairs are implemented on a draft PR. The code checks/build and new regression tests passed in hosted CI at the pinned implementation commit. The newly enabled security check correctly blocks on the findings above. Dependency remediation, independent-model verdict, founder acceptance, merge and post-merge verification remain open. No deployment or release approval is claimed.

Review this change in **JobGuard PR #15**. Do not resume or modify the separate OWN MIND integration branch as part of this repair. The existing application and its recently merged UI must be preserved.

## Primary implementation references

- GitHub Actions contexts: https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
- pnpm 10 audit options: https://pnpm.io/10.x/cli/audit
- GitHub dependency-review availability: https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review
