# SEC-DEPS-2026-09-30 builder run receipt

Date: 2026-09-30. Repository: `ben2harwood-lgtm/jobguard`.
Branch: `codex/sandbox/sec-deps-2026-09-30`.
Base: `694e9e1755f2a5680898eb0fa04af48afd66c86b`.
The candidate is the commit containing this receipt; obtain its exact SHA with `git rev-parse HEAD` before independent review.

Status: dependency remediation implemented and registry audit clean. Full local test command FAILED on PostgreSQL initialization. Technical acceptance is HOLD, not PASS. No independent Claude verdict or separate acceptance is claimed (AGENTS §5.13 / BUILD_PLAN C8).

## Scope and rationale

Read AGENTS §2/§5.13, BUILD_PLAN M0-1/C8, and the PR #15 merged precedent `064ceda9dcc5b6e55da24b5bde2a56dc439ea725` including its recorded audited pins. The first repository edit registered this task's lane in the existing compact, single-line JSON format with exactly the requested branch and four allowed paths/scopes. No workspace package manifest needed changes.

All newly vulnerable packages are transitive dependencies. Ranged root `pnpm.overrides` preserve the direct dependency pins and existing major-version families. The previous multer override is raised to the patched version; the existing js-yaml 4.x override remains. No audit exceptions, waivers, ignore lists, level relaxations, application changes, migrations, workflow/scanner edits, spending, or live provider/service actions.

## Every baseline finding and resolution

The baseline scanner exited 1 with moderate 5, high 4, critical 0 (also info/low 0). Nine registry entries cover six distinct GHSAs; each brace advisory has one finding on each installed release line.

| Registry ID | Advisory | Severity | Installed → patched pin | Root override |
|---|---|---|---|---|
| 1239935 | [GHSA-3pph-fpjx-jg34](https://github.com/advisories/GHSA-3pph-fpjx-jg34) | moderate | multer 2.3.0 → 2.4.0 | `multer@>=2.0.0 <2.4.0` → `2.4.0` |
| 1239991 | [GHSA-r3ph-w7gj-g6xm](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm) | moderate | js-yaml 5.3.0 → 5.4.1 | `js-yaml@>=5.0.0 <5.4.1` → `5.4.1` |
| 1240091 | [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) | moderate | fast-uri 3.1.7 → 3.1.8 | `fast-uri@>=3.0.0 <3.1.8` → `3.1.8` |
| 1240100 | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | moderate | brace-expansion 1.1.18 → 1.1.21 | `brace-expansion@>=1.0.0 <1.1.21` → `1.1.21` |
| 1240103 | GHSA-q2hr-2g5m-vwhr | moderate | brace-expansion 5.0.9 → 5.0.12 | `brace-expansion@>=4.0.0 <5.0.12` → `5.0.12` |
| 1240104 | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | high | brace-expansion 1.1.18 → 1.1.21 | same 1.x override |
| 1240107 | GHSA-qhr7-859c-m2p7 | high | brace-expansion 5.0.9 → 5.0.12 | same 4/5.x override |
| 1240108 | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | high | brace-expansion 1.1.18 → 1.1.21 | same 1.x override |
| 1240111 | GHSA-6j4f-fj2g-mc7p | high | brace-expansion 5.0.9 → 5.0.12 | same 4/5.x override |

Affected paths:

- `apps/api > @nestjs/platform-express > multer`.
- `apps/api > @nestjs/swagger > js-yaml`.
- `apps/api > @nestjs/cli > @angular-devkit/core > ajv > fast-uri`; both locked AJV versions now resolve fast-uri 3.1.8.
- `apps/api > @nestjs/cli > fork-ts-checker-webpack-plugin > minimatch > brace-expansion` (1.x).
- `apps/api > @nestjs/cli > glob > minimatch > brace-expansion` (5.x).

brace-expansion 5.0.10 alone would fix parsing recursion but leave nested-group recursion and quadratic rewrite findings. Pins 1.1.21/5.0.12 cover all three. The generated lockfile changes only these five installed package versions and their edges/integrity hashes, plus removes multer's no-longer-used `concat-stream` and `typedarray` packages.

## Toolchain and exact verification commands

All root checks ran from this worktree. Node **24.15.0** and pnpm **10.28.1** match `.nvmrc`, `packageManager`, and CI. A temporary Corepack pnpm wrapper and downloaded pinned Node binary were used via:

```sh
export PATH="/tmp/sec-deps-0930-bin:$PATH"
export npm_config_cache=/tmp/sec-deps-0930-npm-cache
```

The initial system Node was 24.17.0; the global pnpm launcher emitted a pnpm 11 warning before selecting 10.28.1. Initial `pnpm view` and `corepack pnpm view` attempts exited 1 because the default npm cache was not writable. Switching only the temporary cache fixed metadata verification. The task-created `.pnpm-store` was moved to `/tmp/sec-deps-0930-pnpm-store` after installation to keep the worktree/lane clean. No global tools, permissions, OS settings, or repository install policy were changed.

| Exact command | Exit | Result |
|---|---:|---|
| `node tools/dependency-audit.mjs` (baseline, system launcher) | 1 | 9 findings: moderate 5 / high 4 |
| `node tools/dependency-audit.mjs` (pinned launcher, before updated lockfile) | 1 | Same 9 findings |
| `pnpm install` | 0 | Fresh worktree install, lockfile regenerated |
| `pnpm install --frozen-lockfile` | 0 | Updated lockfile installs without regeneration |
| `node tools/dependency-audit.mjs` (first post-install attempt) | 2 | Registry lookup failed with EHOSTUNREACH; not a clean scan |
| `node tools/dependency-audit.mjs` (retry) | 0 | Completed scan; info/low/moderate/high/critical all 0 |
| `pnpm typecheck` | 0 | 7 successful tasks; 5 cache hits |
| `TURBO_FORCE=true pnpm typecheck` | 0 | Fresh execution of all typecheck tasks |
| `pnpm lint` (before first local commit) | 1 | Lane checker refuses HEAD equal to main: missing/self-comparison range |
| `TURBO_FORCE=true pnpm lint` (after local comparison commit) | 0 | Lane/purity/money checks and all 7 workspace lint tasks passed, no cache hits |
| `pnpm test` | 1 | PostgreSQL initialization failed due to missing Mac dylib symlinks; 4 Turbo cache hits |
| `TURBO_FORCE=true pnpm test` (after local symlink hydration) | 1 | No cache hits; PostgreSQL initialization failed with host shared-memory exhaustion |
| `TURBO_FORCE=true pnpm build` | 0 | All 7 tasks passed; no cache hits; production Next build completed |
| `command -v docker` | 1 | Docker is not installed on this Mac |
| `git diff --check` | 0 | No whitespace errors |

Post-commit lint checked all four changed paths against the actual task base. Its result was recorded after the first local commit; only this documentation was then amended. Typecheck, lint, and build are green; the full test command remains failed for the host PostgreSQL limitation below.

The uncached test run passed all 39 root tool tests plus storage (4), config (2), core (326), AI fixtures (72), API (75, including OpenAPI check), and web unit tests (36). The DB package reported **32 failed files, 2 passed files; 1 failed test, 15 passed, 134 skipped** after setup failures. Skipped DB assertions are not passes.

## Local PostgreSQL diagnosis and limitations

The pinned install correctly preserved `pnpm-workspace.yaml`'s existing build-script policy and skipped `@embedded-postgres/darwin-arm64` postinstall. Direct `native/bin/initdb --version` initially exited **134** with `dyld` unable to load `libicudata.68.dylib`. Source-inspected the package's existing `scripts/hydrate-symlinks.js` and ran `node scripts/hydrate-symlinks.js` in `node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64` (exit **0**); `./native/bin/initdb --version` then exited **0**, PostgreSQL 16.10. This only repaired installed dependency symlinks; no tracked files changed.

The retry still failed during initdb. A disposable local probe ran the installed `native/bin/initdb -D "$task_pg_probe" --locale=C --auth=trust` against a newly created `/tmp/sec-deps-0930-initdb.*` directory (exit **1**, cleaned up afterward). Its exact diagnostic was `FATAL: could not create shared memory segment: No space left on device`, failing `shmget(..., size=56, ...)`; PostgreSQL explains this as exhausted shared-memory IDs/limit, not disk capacity. No kernel settings or unrelated processes were changed.

Docker is absent. Current DB and browser harnesses actually use embedded PostgreSQL, so absence of Docker alone is not their blocker. PostgreSQL initialization on this host is the observed blocker. Separate `pnpm test:db`, `pnpm test:migrations`, and `pnpm test:e2e` were not run after that diagnosis; CI's Linux checks still need to verify DB/migrations and the existing production browser journeys. There is no full-local-suite success claim. No native subsystem change or live-model evaluation was applicable; existing fixture evaluations ran through `pnpm test`.

## Files and outstanding gates

Changed files: `config/agent-lane-assignments.json`, `package.json`, `pnpm-lock.yaml`, and this receipt. No database migration or business-contract changes; no new operational alert or release-gate change. Package API compatibility was exercised by fresh typecheck/build and the passing non-DB test tasks; DB and browser compatibility remains unverified locally.

Independent Claude must inspect the exact final commit and record a verdict in `docs/verdicts/`; a different actor must record acceptance. CI DB/browser verification remains pending. The builder does not accept its own work. No push, merge, PR, deployment, or release was performed.
