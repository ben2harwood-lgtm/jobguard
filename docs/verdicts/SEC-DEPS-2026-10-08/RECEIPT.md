# SEC-DEPS-2026-10-08 — builder receipt

**Builder:** Claude Sonnet 5.5 builder agent, spawned by the JobGuard integrator on the coordinator's go (8 Oct 2026), on Ben's precedent "C makes the JobGuard dependency patch" (the same instruction that produced SEC-DEPS-2026-10-07, PR #113). Not independently verified, not accepted. No Sol check is possible until 14 Oct (Codex out), and JobGuard's merge rule does not require one.

**Why:** GitHub `dependency-review` has been red on `main` and every PR since 7 Oct (about 20:31 UTC) for two medium Next.js advisories that affect `next` below 15.5.27: GHSA-4jqv-mc3x-m676 and GHSA-mcj8-r9mp-w47p. The repo pinned `next` 15.5.25.

**Version:** `next` 15.5.25 -> **15.5.27** (the lowest fixed release; no further).

**Change:**
- `package.json` (root devDependencies): `"next": "15.5.25"` -> `"15.5.27"`.
- `apps/web/package.json` (dependencies): `"next": "15.5.25"` -> `"15.5.27"`.
- No `pnpm.overrides` change: `next` is declared directly in exactly those two places and nothing else in the tree depends on it, so no override was needed.
- `pnpm-lock.yaml` regenerated with pnpm 10.28.1 (`pnpm install --lockfile-only`). The 86-line diff is only `next` and its own companion packages moving 15.5.25 -> 15.5.27, which `next` pins exactly: `@next/env`, and the eight platform binaries `@next/swc-darwin-arm64`, `-darwin-x64`, `-linux-arm64-gnu`, `-linux-arm64-musl`, `-linux-x64-gnu`, `-linux-x64-musl`, `-win32-arm64-msvc`, `-win32-x64-msvc`. The two importer entries (root, `apps/web`) and the `next` snapshot line move with them. The `overrides:` block is unchanged. No other package was added, removed or re-resolved. (`eslint-config-next` is not used in this repo.)
- `config/agent-lane-assignments.json`: new lane `sec-deps-2026-10-08`, one line, in sorted position via the lane-registry writer. Copied from `sec-deps-2026-10-07` with three differences: the branch (`codex/sandbox/sec-deps-2026-10-08`); the receipt scope (`docs/verdicts/**` -> `docs/verdicts/SEC-DEPS-2026-10-08/**`, a narrower grant); and one added exact file path, `apps/web/package.json`. That addition is the only widening and is unavoidable: the 10-07 allow list covers the root `package.json` only, but `apps/web/package.json` is where `next` is also declared, and lane lint (first run, exit 1: `Lane sec-deps-2026-10-08 cannot edit: "apps/web/package.json"`) refused the bump without it. The file differs from `main` by that one added line.
- `docs/verdicts/SEC-DEPS-2026-10-08/RECEIPT.md`: this file.
No application code, test, CI workflow (`.github/workflows/**`), dependency-review allow-list or CI setting changed. No deploy or release.

**Commands (all in the worktree `.worktrees/sec-deps-2026-10-08`, from `origin/main` 0264158):**

| Command | Exit |
|---|---|
| `node ~/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs install --lockfile-only` (pnpm 10.28.1, the pinned `packageManager`) | 0 |
| `pnpm install --frozen-lockfile --ignore-scripts` (85 GB free; resolves `next` 15.5.27) | 0 |
| `pnpm typecheck` (7 of 7 tasks) | 0 |
| `pnpm build` (7 of 7 tasks; Next.js 15.5.27 "Compiled successfully", types checked, routes generated) | 0 |
| `pnpm --filter @jobguard/web exec vitest run` (13 files, 115 tests passed) | 0 |
| Lane lint: `GITHUB_EVENT_NAME=pull_request GITHUB_EVENT_PATH=<simulated event> node tools/agent-lane-boundary-lint.mjs` (head = the PR head, base = `origin/main`) | 0 |
| `git grep -n "15.5.25" -- pnpm-lock.yaml '*package.json'` | 1 (no matches) |

Notes: the global pnpm launcher is 11.8.0 and prints a harmless `"pnpm" field in package.json is no longer read` warning before handing over to the pinned 10.28.1; the lockfile was regenerated with the 10.28.1 binary directly and its `overrides:` block came out unchanged, so no override was lost. The Next build prints a "multiple lockfiles" warning only because the worktree sits inside the main checkout, plus two existing `autoprefixer` CSS warnings; neither relates to this change.

**dependency-review result on the exact head:** TO BE CONFIRMED BY CI on the exact head (filled in by the integrator after CI; not claimed here).
