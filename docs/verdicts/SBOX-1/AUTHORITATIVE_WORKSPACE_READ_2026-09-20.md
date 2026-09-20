# Saved workspace read and lifecycle navigation repair

Date: 20 September 2026. Author: ChatGPT, directly implementing Ben's continuing JobGuard instruction. This is a builder run receipt, not a Claude verdict or independent acceptance.

Base: `b3af5f7d283bdf8b387ffa435dfd6be92f82d13f` (open receipts PR #65). Local tested code commit: `faf801e879277968e3acfc850901e1a8119cb2eb`; this receipt is the only subsequent content addition. The remote commit is separately identifiable by its PR; uploaded tree contents are compared with the tested local tree.

## Reproduced defects and repair

The single-job service searched the deliberately filtered home-list fixtures. Captured jobs therefore returned 404 even though their quote/proof APIs worked. New PostgreSQL regressions failed 4/11 before the fix. Direct tenant-qualified lookup now rechecks the synthetic identity's membership, expiry and revocation, returns the exact confirmed scope IDs in the same SQL snapshot, and leaves home-list filtering unchanged. Wrong-tenant jobs remain indistinguishable from missing jobs. Output is parsed by the versioned workspace schema.

The restored resume tests then exposed stale parent navigation after successful acceptance/activation. Post-command server snapshots now update navigation, cancel superseded reads and preserve the same job. Navigation never manufactures a lifecycle transition. Existing second-context persistence, missing-job denial and overflow assertions are restored rather than discarded.

## Executed local evidence

Pinned offline workbench: Linux x64; Node 24.15.0; pnpm 10.28.1; real embedded PostgreSQL 16; Playwright Chromium 1193. Workbench archive checksums were verified before use. No provider API or production credentials were used.

- New database regression: 11 passed after repair (4 failed before repair).
- `pnpm typecheck`: exit 0.
- `LANE_BASE_REF=b3af5f7 pnpm lint`: exit 0, exact workspace lane; existing purity/security-policy tests retained.
- `pnpm test`: exit 0. Existing package discovery also includes compiled duplicate tests after a build; totals are not represented as distinct coverage. Turbo replay is distinguished from fresh execution in the logs.
- `pnpm test:migrations`: exit 0.
- `pnpm build`: exit 0 on the final code.
- `CI=1 pnpm --filter @jobguard/web exec playwright test SBOX-resume.spec.ts SBOX-1.spec.ts`: 12 passed across both projects.
- `CI=1 pnpm test:e2e`: 130 passed, 0 failed, 0 skipped (233.31 seconds for the command).

A first Playwright attempt failed because its CommonJS loader could not load an import-only package export; the test now imports the same pure contract source. The next attempt demonstrated the stale-navigation defect and was stopped after preserving failure evidence; only subsequent clean green runs support the results above. No timeout or mandatory business assertion was weakened.

## Boundaries and outstanding evidence

No migration, runtime grant, live gate, provider, deployment or main merge. The added lane authorizes only this repair's exact files and this receipt; existing lanes are unchanged. Dependency audit/secrets checks must be read from this PR's actual CI, not inferred from offline execution. Fixed synthetic principal access is not a claim of production session isolation. Independent Claude review, separate technical acceptance, founder merge/release and UIWIRE-15's full convergence remain outstanding.
