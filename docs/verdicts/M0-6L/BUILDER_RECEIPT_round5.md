# M0-6L builder receipt — round 5

Code head: `6a8c5876359a6b9c70c22d7f367ce01abde097d1` (receipt follows as a documentation-only commit).
Merge head: `4b1b834a737493ef02ecb39cbba856c65ecb80bf`, merging main `a5ed99a8f7b4e76925c35297dda0d06d6f8834ab` into M0-6L head `86f30d6a1d953a91f91c7d5dd47511b422ee626d`.

## Repair

The two Opus probes were added before the implementation and reproduced the bypass: `Object.assign({}, context, { tenantId })` and assigning `.tenantId` on `structuredClone(context)`. The final fixtures also cover `Object.assign(context, { tenantId })`; existing spread reconstruction coverage remains unchanged. Context taint now propagates through the named copy helpers, and tenant replacement through `Object.assign` or a property assignment fails closed.

## Checks

- `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts`: PASS, 40/40.

Static syntax analysis cannot resolve a helper name or property name computed entirely at runtime. Such spellings remain covered by the branded type, compiler, explicit approved-file list and review; the scanner does not silently claim semantic completeness.
