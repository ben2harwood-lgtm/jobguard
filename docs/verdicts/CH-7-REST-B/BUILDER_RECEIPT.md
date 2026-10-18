# CH-7-REST-B — builder receipt, issuance STOP

18 October 2026. RED qualifying-money lane. **DW3 NOT IMPLEMENTED; no technical acceptance claimed.**

Inspected/tested inherited HEAD: `302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c` (A #292 build-ahead base). B changes are uncommitted documentation and lane configuration only. The dispatcher must bind any eventual implementation and independent different-model verdict to its exact commit; the builder does not self-accept.

## Work and STOPs

Read repository AGENTS, BUILD_PLAN §§10.3.3/CH-7, recovery eligibility and terms contracts, Ben's 17 October answers, the referenced 18 October remainder draft, A's ledger/receipt, core evaluator and repository, and latest routine locations. No external provider/research needed.

The issuance requests “sub-order A”, but its pasted B draft has no such section. The referenced draft's A is F21, already present. Asked for scope clarification asynchronously; no reply received at receipt preparation.

STOP-2 blocks the actual atomic DW3 change: missing/pre-terms result wording, saved exclusion versus refusal, and header/line precedence are expressly undecided. No allowed existing reason describes a post-opening/pre-terms receipt. No null/held encoding, refusal contract or new wording was invented. STOP-1 also remains for equality and reversed transaction-start/commit ordering. These are explicit order restrictions, not newly imposed approval requirements. No permissive application-only slice or incomplete SQL guard was installed.

Completed unaffected work: exact B lane (never lists itself), refreshed dependency/routine anchors, itemized STOP ledger, baseline verification, intended commit message. A's F21 changes are untouched. Local maximum migration is 0195, so lane substitutes 0196 in both future paths; **no migration installed**. No backfill, new objects, grants, RLS changes or inventory exceptions. Ruling 113 was not exercised. No new alerts, providers, financial effects or compatibility changes.

## Execution evidence

Preinstalled dependencies used; no install/download requested. Node 24.17.0 differs from pinned .nvmrc 24.15.0, so this is not exact pinned clean-install evidence. Initial ambient `pnpm --version` stalled and was interrupted (130); subsequent commands used cached pnpm 10.28.1 through `PATH=/private/tmp/jg-ch7-cont-bin:$PATH`, as A's receipt documents. No git write commands run.

| Command | Actual result | Local log |
| --- | --- | --- |
| `pnpm typecheck` | PASS, 7 tasks, 2 cached | `/private/tmp/jg-ch7-b-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL at lane boundary: inherited A paths outside B | `/private/tmp/jg-ch7-b-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL for the same eight inherited A paths | `/private/tmp/jg-ch7-b-lanes.log` |
| `LANE_BASE_REF=302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c pnpm lint:lanes` | Refuses self-comparison (base equals current HEAD), not a pass | `/private/tmp/jg-ch7-b-own-lanes.log` |
| `pnpm exec turbo run lint` | PASS, 7 package tasks, 2 cached; does not replace root lane check | `/private/tmp/jg-ch7-b-package-lint.log` |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-eligibility-v3.test.ts --maxWorkers=2` | PASS, 45/45 inherited tests | `/private/tmp/jg-ch7-b-core.log` |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-eligibility-v3.application.test.ts --maxWorkers=2` | Initial import failure before db build output existed; repeated after output became available: PASS, 15/15 mocked tests | `/private/tmp/jg-ch7-b-api.log`, `/private/tmp/jg-ch7-b-api-after-build.log` |
| `pnpm openapi:check` | BLOCKED by tsx IPC listen EPERM | `/private/tmp/jg-ch7-b-openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` (apps/api cwd) | PASS, exit 0; same checker without tsx IPC wrapper | `/private/tmp/jg-ch7-b-openapi-direct.log` |
| `git diff --check` | PASS | terminal |

The eight inherited lane failures are A's web assertion, lane file, ledger, receipt, 0195 SQL/note and two F21 test files. No B-owned edit to these files. STOP for widening B to cover A; dispatcher must resolve the dependency comparison after A merges. Local origin/main was `42990862881cd048c7167869246551d5360beb17` (no fetch).

## Not run / still owed

All six new DW3 tests are NOT IMPLEMENTED / NOT RUN because their load-bearing result contract and issued sub-order remain unresolved. No failing-first failures claimed. PostgreSQL, test:db, test:migrations and browser/e2e are NOT RUN by instruction. Full `pnpm test` is NOT RUN because it invokes database suites; selected tests above are not full-suite evidence. AI evaluation is inapplicable to this documentation-only change. No real integration, independent verification, security/commercial approval or task closure claimed.

DW3 and C's non-v3 pursuit remain open, as do CI, independent RED verdict, separate acceptance and all release gates. No commit, push, merge or release. Commit-message handoff: `/private/tmp/jg-msg-ch-7-rest-b.txt`.

`pnpm build`: PASS, 7/7 tasks, 2 cached, exit 0 (`/private/tmp/jg-ch7-b-build.log`). Existing workspace-root/CSS/dependency warnings remain; no browser runtime proof inferred. Only B lane, ledger and receipt were added in this working tree.
