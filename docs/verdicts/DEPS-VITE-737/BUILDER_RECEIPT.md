# DEPS-VITE-737 — R2 builder receipt, 21 October 2026

**STOP / HOLD — do not commit.** The first R2 resolver attempt retained vulnerable Vite 7.3.6 and changed unrelated Rollup versions. The explicit R2 STOP condition applies. No further resolver, install, patched-graph test, commit, push, merge, acceptance or Claude invocation was performed. This is a builder run receipt, not an independent verdict.

## Authority and baseline

Controlling instruction: Ben's 21 October R2 authorization for exact Vite 7.3.7 and necessary real pnpm 10.28.1 peer-graph regeneration, official npm metadata/tarballs permitted, all other versions/pins/importers preserved. Vitest stays 4.1.11. The historical automatic approval rejection of recursive update under narrower R1 authority remains part of the record; R2 supersedes resolution permission only in its stated scope. This run's escalated resolver was allowed by current automatic review; no rejection was bypassed. The ineffective alias assessment was not used. No previous failed source patch was reused.

Branch: `codex/sandbox/deps-vite-737`. Source HEAD and observed `origin/main` / integration target: `dc5721230fd8aedbf2d9d0457789074b66b48765`. Initial `git status --short` was clean. Read AGENTS.md in full, BUILD_PLAN.md §2 including C1–C8 and foundation/security entries, main-checkout `docs/dispatch/2026-10-20-speed-v5-milestone-and-deferrals.md`, and `/Users/benharwood/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261017.md`. Read the source-supported peer diagnosis at `/Users/benharwood/.local/share/full-steam/jg-runs/DEPS-VITE-737-Astra-peer-diagnosis-20261020T230231Z.md`.

MON7b stays parked; MON7a demo ruling belongs to root. No demo documentation, reserved SV5/#189/#181 work, scanner/workflow/tests/exceptions or product code was changed. Shared package/lock ownership was exclusive for this task.

## Partial changes and preserved evidence

- `package.json`: one literal override, `vite@>=7.0.0 <=7.3.6` → `7.3.7`. Parsed package comparison after removing this one key equals the complete original manifest. Every other direct pin, override, script, engine and package-manager setting is unchanged.
- `config/lanes/deps-vite-737.json`: exact branch and own receipt; allowlist only package.json, pnpm-lock.yaml and own receipt, no self-list. C1: dependency-only, no web workflow or new browser spec.
- This receipt.
- `pnpm-lock.yaml` was restored byte-for-byte from the captured initial lock after preserving the unsuccessful pnpm output and diff in scratch. Thus no unrelated Rollup change remains in the working tree. The partial manifest and original lock are intentionally inconsistent and **must not be committed or represented as an implemented patch**.

Scratch evidence: `/private/tmp/jg-deps-vite-737-r2/` contains `package.before.json`, `lock.before.yaml`, `lock.resolved.yaml`, `resolve.diff`, `resolve.log`, `audit-before.log`, `audit-after-attempt.log`, `parsed-comparison.json`, `compare.cjs`, and the resource guard plus task-local cached-pnpm wrapper. Scratch is local evidence, not committed repository content. No lock integrity was manually authored.

## Toolchain, resources and commands actually executed

Node `v24.17.0`; cached pnpm `10.28.1` at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. A task-local `/private/tmp/jg-deps-vite-737-r2/bin/pnpm` invokes that runtime. No global package manager/configuration or registry setting was changed.

The lifetime outer `HEAVY_SLOTS=1` slot was already held. No nested acquisition. Each heavy command ran serially through scratch `guard.py`, which measures real free disk bytes, node process count, `memory_pressure` free percentage and 1-minute load immediately before execution; it waits if disk <45 GiB, nodes >45, memory <30%, or load >24. Sandboxed `ps` initially returned operation-not-permitted; its apparent zero was not accepted as evidence. Actual process/resource reads used approved escalation.

| Command (all from this worktree) | Exit / actual result |
| --- | --- |
| Cached pnpm `--version`; `node --version` | 0; 10.28.1 / v24.17.0 |
| Guarded `node tools/dependency-audit.mjs` before changes | 1; 3 findings: moderate 2, high 1; official registry returned valid audit JSON |
| Guarded `pnpm --recursive update vite --depth Infinity --lockfile-only --ignore-scripts` | 0 command completion, **failed repair**; retained Vite 7.3.6, unrelated Rollup change; stopped |
| `node /private/tmp/jg-deps-vite-737-r2/compare.cjs` | 0; complete parsed package records, snapshots, importers, settings and other top-level fields compared, plus full manifest assertion |
| Guarded unchanged `node tools/dependency-audit.mjs` after attempted resolution, before lock restoration | 1; same 3 findings, not a clean scan |

Actual pre-command floors recorded in their logs:

| Command | Free bytes | Nodes | Memory free | Load 1m |
| --- | ---: | ---: | ---: | ---: |
| Before audit | 248557801472 | 42 | 71% | 2.31 |
| Resolver | 248552558592 | 43 | 71% | 1.74 |
| After-attempt audit | 248497713152 | 42 | 72% | 1.52 |

No paid provider/API, customer data, localhost server, PostgreSQL, migration, browser or Playwright command was used. Two initial parser probes (`require.resolve('yaml')`, Python `import yaml`) failed because those modules were absent from the root/Python environments; comparison then used the already-installed `js-yaml@4.3.2` parser by explicit local path, with no package download.

## Complete lock comparison and STOP evidence

Both locks contain 594 package identities and 8 importers. The complete parsed comparison, not a grep sample, found:

- Every importer, including direct specifiers and peer-suffixed versions, is identical. Root manifest unchanged apart from the single authorized override. Settings and all other top-level lock fields unchanged; lock override adds that same single key.
- Removed identities: `rollup@4.63.2` and all 25 `@rollup/rollup-*` platform identities at 4.63.2. Added identities: exactly the corresponding 26 identities at 4.64.12. This is an unrelated version upgrade and triggers STOP.
- Existing package records changed only for `vitest@4.1.11` and `@vitest/mocker@4.1.11`: their Vite peer range became `7.3.7`. Their versions, integrity and other metadata stayed unchanged. Every other retained package record is identical.
- Snapshot differences are the Rollup/platform replacements and the Vite 7.3.6 snapshot's Rollup edge pointing to 4.64.12. No successful Vite 7.3.7 snapshot/package was generated. Vite 7.3.6 remains the sole Vite package identity.
- Resolver warns `unmet peer vite@7.3.7: found 7.3.6` under Vitest and mocker. Webpack/picomatch/ajv peer warnings also appear; full parsed comparison shows these versions were already present, not new changes. Initial progress commentary inferred otherwise from warnings; this receipt corrects that inference.

Registry provenance: pnpm used existing official npm registry configuration and generated actual resolution/integrity records; no alternate registry/security bypass. The Vite [primary advisory](https://github.com/vitejs/launch-editor/security/advisories/GHSA-698v-4r3x-3vcv) and [official v7.3.7 release](https://github.com/vitejs/vite/releases/tag/v7.3.7) were read. Both actual unchanged audits report `GHSA-698v-4r3x-3vcv`, `GHSA-r825-w8mm-5pxw`, and `GHSA-587h-7wmj-h5pm`, each targeting Vite `>=7.0.0 <=7.3.6`, patched `>=7.3.7`. No verified patched tarball/install exists from this attempt; resolver progress reported zero tarball downloads. An exit-0 resolver is not security evidence.

## Execution limits and remaining gates

No frozen patched install: the attempted lock violates the explicit STOP condition and was restored. Existing node_modules is before-state evidence only. Existing script approval remains exactly `onlyBuiltDependencies: ["@embedded-postgres/linux-x64"]`; it was neither broadened nor disabled for an install. `--ignore-scripts` applied only to lockfile-only resolution as explicitly authorized.

Selected Vitest fixtures, affected typecheck, full root/package lint, build and OpenAPI checks are NOT RUN on a patched graph: there is no valid patched graph to install, and the unrelated-version STOP ended dependency execution. No old-node_modules test is presented as patch validation. If resumed under a concrete permitted recipe, first obtain valid narrow lock, compare complete parsed graphs, frozen-install under unchanged approvals/resource floor, prove installed/resolved Vite 7.3.7, run unchanged audit and bounded Vitest (max 2 workers, at most 3 named files), typecheck/lint/build/OpenAPI. Full mandatory CI including actual new-head GitHub dependency-review must pass; PostgreSQL/migration/browser suites remain CI-only. No DB/data migration, schema, AI/prompt or business invariant change is involved; eval/migration-specific local tests do not apply to this source-only dependency attempt.

Pending: successful narrow patch, frozen install, clean audit, patched-graph validation, full exact-head CI and GitHub dependency-review, two real independent Claude verdicts bound to the eventual exact commit, separate acceptance, founder-owned merge. Builder supplies none of those approvals. No commit exists for this attempt; dispatcher must heed **do not commit**. Intended message is `/private/tmp/jg-msg-deps-vite-737.txt`.

## Final deterministic source checks

- `LANE_BASE_REF=origin/main node tools/lint.mjs`: exit 1. Core purity passed (228 TypeScript files; seven existing computed-import notices). Lane CLI refused `Missing branch or self-comparison range; refusing a misleading pass` because uncommitted HEAD equals origin/main. Later chained checks therefore did not run in this invocation.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: exit 1 with the same self-comparison refusal. This is not a lane PASS and no fake base/commit was supplied.
- Direct import of the unchanged lane tool's `loadLanePolicy`, `selectLane`, `lanePathAllowed` with assertions for the exact branch, allowlist length 3 and all four intended working-tree paths: exit 0. This validates the new lane schema and working-tree scope, not a commit-range check.
- `node tools/money-arithmetic-lint.mjs`: exit 0. `node tools/commercial-boundary-lint.mjs`: exit 0.
- `git diff --check`: exit 0. Final tracked diff is only the package override; untracked additions are own lane and own receipt. No git write commands were run.
- SHA256 restored original lock: `e459271ae68845cfa6c59e6816e3a25d599b5777273d8e06625e692330b316b0` (matches captured before lock). Rejected attempted lock in scratch: `c68d7a1a2ab9f00967f5a4c647c5305165655e27ad8f54f726022206fb9b34ec`.

The static checks above are source checks on the partial work only; they do not validate an installed patched dependency graph. They do not remove the STOP or authorize a commit.
