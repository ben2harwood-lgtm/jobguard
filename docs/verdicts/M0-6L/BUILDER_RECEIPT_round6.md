# M0-6L builder receipt — round 6, 7 October 2026

Builder: Codex. Branch `codex/sandbox/m0-6l`, PR #104. Repair implemented in the working tree; technical acceptance remains pending. This is builder evidence, not an independent verdict or acceptance.

## Exact bindings and historical correction

- Round-five code: `3caad59b03e7801f04dea087f7ce4ccb6ac9e4d9`.
- Merge of SH-1/main: `dae6d7614b0bdd8579f99df0125c1a5f587ed64d`, incorporating main `a5ed99a8f7b4e76925c35297dda0d06d6f8834ab`.
- Historical receipt: `94a0ab14af843064692fe116eb7c3acdcdf91796`. Its round-five code/merge IDs (`6a8c587…`, `4b1b834…`) were wrong; the two real commits above are the correction. The old receipt is preserved unchanged as history.
- Latest inherited repair/start head: `098a064c8e8c880e5d8e7e194d440025363a3ed0`. Its three-file repair retained 45 migrations after SH-1 merged and made the identity fixture actually start before the then-0052 migration; these guarantees are retained and updated for 0098.
- This round is an **uncommitted repair of that exact head**. No new commit SHA exists in this sandbox. Its 13 implementation path changes are bound by `/private/tmp/jg-m0-6l-round6-manifest.json`, SHA-256 `b4ae4a2c5554561a1924f1478aa9e07afc8907d005ab383a4f16d211c1168e47`. The manifest contains the base SHA and sorted path/content SHA-256 entries (null for deletion), serialized with sorted JSON keys, two-space indentation and a final newline; this receipt is excluded to avoid self-reference. The dispatcher must bind the fresh independent verdict and separate acceptance to its actual new commit.

Read AGENTS.md, BUILD_PLAN.md §11.1 M0-6L, C1–C8, the authentication contract, existing receipts and the supplied Sol repair findings. No earlier work or recorded verdict was removed. No writes to this worktree’s .git, task commit, push, merge or PR creation were performed. Lane-scanner unit tests use disposable temporary Git fixtures; they do not modify this branch.

## Repairs and regressions

The scanner now identifies `Object.create` by its full callee name and refuses reconstruction itself, whether or not a replacement tenant is visible. Object.assign sources need not be literal objects. Initializers and assignments after declaration propagate context provenance to a fixed point. Property writes are refused for every key, including computed keys, nested destructuring, deletion and iteration targets; reflection and descriptor writes are refused too. Original-value forwarding remains permitted, including the existing forwarding control. Serialization/entry carriers and bracketed reconstruction calls are covered. The scan remains syntactic; arbitrary type/signature laundering and dynamically selected helpers require review. TypeScript branding alone does not prove runtime provenance.

All nine Sol forms were added as regressions: Object.create with a shadowing tenant; Reflect.set; Object.defineProperty; Object.defineProperties; Object.assign with a variable source; Object.assign with a spread source; destructuring into a clone; a constant computed tenant key; and a clone assigned after declaration, then changed through a descriptor. Before the scanner repair, **all nine failed on 098a064, while all 40 existing boundary tests passed**. The exact final nine fixtures were also run against a temporary copy of the scanner read from that commit: all nine failed. The nine reproductions pass strict TypeScript with the same readonly, uniquely branded context shape and explicit VerifiedTenantContext return types; writable views mutate the two property-assignment cases while preserving the returned clone’s brand. Temporary probe files were removed.

Another 14 boundary tests verify unconditional copy refusal, direct mutation without a clone, delayed aliases, and forwarding/ordinary-object controls. Every prior assertion is retained. The auth principal bridge explicitly Object.freezes every context it mints; the added unit test uses a mutable view in strict ESM, asserts TypeError on replacement and verifies that the tenant stays unchanged. `packages/db/src/tenant-context.ts` is untouched.

Several intermediate API runs hit the unchanged five-second repository-scan timeout. The final scanner collects mutation candidates during its existing traversal, memoizes expressions only within a taint-set revision, caches complete per-file results by path AND full source text, and reads the same enumerated small local source files directly. No source root, assertion, timeout or tracked test was weakened, skipped or deleted. The final full API unit invocation passed all 176 tests.

## Migration, contracts and compatibility

Renamed `0052_persisted_identity.sql` to **`0098_persisted_identity.sql`**, with byte-for-byte identical SQL: SHA-256 `9779d3f643b248b025b0951c204c6cf51d6a936e531e883e783d9e17b85a59e0`. It is LAST in MIGRATION_URLS, following merged 0053; registration has 45 unique, existing files in ascending order. Counts remain **45**, not 46 or 99. The UIWIRE-12 range now includes 0098 and the bootstrap title reflects the new order.

The PostgreSQL identity upgrade fixture slices at the exact 0098 registration, asserts all 44 preceding migrations are installed and identity.challenge is absent, then migrates twice and asserts 45 registrations and the new table. Existing fresh-install, privilege/RLS, identity race, revocation, invitation and rollback tests remain. SQL ownership, grants and financial semantics are unchanged. No backfill, data reset or database migration was executed here. Branch-local databases that previously recorded 0052 need explicit migration-bookkeeping reconciliation before replaying this renamed file; no automatic transition is shipped. The documented forward-fix/expand-compatible rollback strategy is retained.

The lane's old migration path was replaced with 0098; BUILD_PLAN.md and docs/verdicts/M0-6L/** were already permitted. BUILD_PLAN.md changes only by the exact requested ledger-amendment paragraph after §12.2's repair-specification paragraph. Migration notes and identity operations were updated. Shared migration registration changes serialize with any lower-numbered PR that merges first; renumber again if required by Ben's ruling.

Affected invariants: authenticated tenant provenance (§5.1), synthetic-only identity/real-route refusal (§5.10–5.11), and independent recorded evidence (§5.13/C8). No money representation, commercial authorization, provider route or production gate changed. No new operational alerts; existing identity error/rate/delivery monitoring requirements remain.

## Executed checks

Node 24.17.0; cached pinned pnpm 10.28.1 through `PATH=/private/tmp/jg-m0-6l-round4-bin:$PATH`. Dependencies were already installed; no install command was run. The system pnpm version launcher initially failed closed on signature/network verification; subsequent checks used the cached launcher. Turbo emitted cache-write permission warnings; Next emitted the existing workspace-root warning.

| Command/check | Exit/result |
|---|---|
| `pnpm typecheck` (final) | 0; seven packages, four cached |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; local lane check rejects deleted 0052 path |
| `LANE_BASE_REF=origin/main pnpm lint:lanes`, also `pnpm lint:lanes` | 1; same old-path deletion, not a self-comparison |
| `pnpm exec turbo run lint` (final, after build stopped mutating generated files) | 0; seven packages, four cached |
| Core purity, money arithmetic and commercial-boundary lint tools | 0 each |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts --maxWorkers=1` (final) | 0; 16 files, 176 tests, including 63 boundary tests and 10 auth tests |
| `pnpm --filter @jobguard/web test` | 0; eight files, 63 tests |
| `pnpm --filter @jobguard/config test` | 0; two files, two tests |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts test/verify-evidence-pack-cli.test.ts` | 0; two files, seven tests |
| `node --test tools/*.test.mjs` | 0; 42 tests, including fail-closed dependency/lane scanner regressions |
| `pnpm build` | 0; seven packages, four cached |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; source Swagger snapshot matches |
| Strict TypeScript compilation of nine reproduction snippets | 0 |
| Migration SQL byte comparison, registration/file/order checks, implementation manifest verification and `git diff --check` | 0 |
| Read-only final-tree PR scope check against origin/main | 0; no undeclared final paths (not a substitute for mandatory lane CI) |

The first package-lint run overlapped Next removing generated .next/types files and exited 2; its sequential final rerun passed. Earlier API timeout attempts are failures, not passes; final results above follow the scanner optimization. The red baseline invocation exited 1 with nine failures; its initial run also passed the original 40 tests. The later targeted temporary baseline replay selected the nine new probes only; no tracked suite was skipped by that replay.

The mandatory local lane tool unions committed HEAD paths and uncommitted working-tree paths. It sees the old 0052 file introduced in HEAD and its deletion, although the requested lane now permits only 0098. The old path never existed in origin/main, so the final-tree PR comparison has only the new migration path. The fail-closed scanner and requested lane replacement were preserved; no permissive metadata, fabricated event or lane widening was used. CI must still run the actual post-dispatch commit.

## Not executed; remaining blockers and handoff

No local PostgreSQL, test:db, test:migrations, browser/device suite, listener-dependent health test, clean install, full root pnpm test, dependency registry audit, secrets scan or GitHub CI execution occurred. This sandbox cannot start PostgreSQL or bind localhost; PostgreSQL/migration and both browser projects must run in GitHub CI after the dispatcher commits and pushes. Fixtures/provider unit tests are not live integration or RLS proof. No AI policy/prompt/model changed; no live evaluation was attempted. No real customer data, live provider, spending, real send, production mode, deployment, release or decision approval was used.

**Sol P1 remains an upstream acceptance blocker, outside this lane.** The supplied review records [CI run 37474776201](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/37474776201) failing dependency review with one critical and one high finding; this builder did not fetch or rerun that CI. The current lockfile still pins proxy-addr@2.0.7 and source-map-js@1.2.1. Ben must obtain remediation in the authorized dependency lane (exact paths `package.json` and `pnpm-lock.yaml`), incorporate proxy-addr >=2.0.8 and source-map-js >=1.2.2, and rerun mandatory CI. Neither file was edited; no security scanner was weakened. This head is not claimed fully green.

Ben follow-up: **a branded context checked by withTenant against a module-private WeakSet would make substitution structurally impossible; it needs a shared change outside M0-6L's lane.** Exact shared path: `packages/db/src/tenant-context.ts` (and its separately authorized callers/tests). Freezing does not itself prevent substitution.

Ben follow-up from PR #109/SBOX-SESSION-1: that PR moves Nest POST /jobs/capture off CaptureService/request.verifiedTenantContext. **Real-tenant capture must be re-pointed through M0-6L's principal bridge once both are merged.** Capture wiring at `apps/api/src/capture/capture.controller.ts` is outside this lane and remains untouched here; its service/application integration must be reviewed in that shared follow-up.

Fresh independent review bound to the dispatcher's exact commit and separate technical acceptance remain required under C8/AGENTS §5.13. G0/G1, D04 live identity-email approval, real-data operations/residency/retention gates and founder-owned deployment/release remain unresolved. Intended commit subject/body is in `/private/tmp/jg-msg-m0-6l.txt`. No push, merge or PR action was performed.
