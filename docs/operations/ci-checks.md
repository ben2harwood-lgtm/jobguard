# CI repair: scope and verification

Date: 2026-09-14. User-authorised repair of three checking defects, not a new product build.

## Ownership and base

Repository: `ben2harwood-lgtm/jobguard`.
Base inspected: `739d681e207b8b9ad29e9e9e950bd156c501bcfe`, including the merged #14 UI work.
Repair branch: `codex/fix-jobguard-ci-guards-2026-09-14`.

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

## Verification receipt

Local deterministic tests: `node --test tools/agent-lane-boundary.test.mjs tools/dependency-audit.test.mjs` — **34 passed, 0 failed, 0 skipped**. These tests ran, rather than merely being authored.
Environment: Linux container, Node `v22.16.0`, Git `2.47.3`. The repository's pinned Node 24 runtime is covered by the GitHub workflow, not this local environment.

The tests exercise real temporary Git repositories for PR/push/local diffs and synthetic registry responses for fail-closed scanner behavior. Synthetic scanner tests are not a live vulnerability scan. The complete application suite, actual advisory lookup and pinned-runtime build must be read from the repair PR's hosted CI run before claiming they passed.

No independent-model verdict, founder acceptance, merge, live deployment or release approval is claimed by this receipt. Existing full typecheck/lint/test/build and secrets checks remain enabled.

## Primary implementation references

- GitHub Actions contexts: https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
- pnpm 10 audit options: https://pnpm.io/10.x/cli/audit
- GitHub dependency-review availability: https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review
