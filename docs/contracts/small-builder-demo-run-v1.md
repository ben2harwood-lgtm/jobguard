# DEMO-I run boundary preparation v1

Status: **HELD — no lifecycle runtime or storage is installed.** This is request-shape preparation under the 24 October 2026 build-ahead order, based on DEMO-P2 `0d390b89`. It does not close DI1, DI2 or DI3.

The only implemented surfaces are unregistered, pure Zod request schemas in `apps/api/src/small-builder-demo.contracts.ts`. They accept no authority or business result. There is no browser or Nest endpoint for this feature. Validating a selection does not make its family executable.

| Prepared schema | Version / fields |
| --- | --- |
| Create | `small-builder-demo.create.v1`, metadata `commandId`, one of the five family IDs |
| Reset | `small-builder-demo.reset.v1`, metadata `commandId`, positive safe `expectedRunRevision` |
| Snapshot | `small-builder-demo.report-snapshot.v1`, metadata `commandId`, positive safe `expectedRunRevision` |
| Read run locator | UUID `runId` only |
| Read stored report locator | UUID `runId`, optional UUID `snapshotId` |

Objects are strict. Metadata commands cannot carry tenant/session/member authority, source facts, money, settlement, counts, completion, trial state, hidden-state selectors, or acceptance claims. Locators are not ownership checks. Reset has no cancel/delete/release-key option, and snapshot has no submitted fact-vector or receipt body. Revision checks here validate shape only; they do not lock or authorize anything.

Intent and checkpoint schemas are **not defined**: no accepted P1 operation/recipe/reference map is installed. Replacing them with strings, records, generic command proxies or arbitrary result JSON would weaken the required boundary. A future owner must bind every allowed step, variant, operation kind, recipe/version, parent identity and producer reference before implementing those schemas.

## Storage STOP

`VerifiedDemoAuthority` and the accepted isolated-company/reset bootstrap are absent at this base. `PracticeAccess` authenticates the existing synthetic session; it does not establish the proposed company/run authority. `issuePracticeSession` creates legacy prebuilt jobs and cannot be used as the fresh-world bootstrap for this order. The existing meter/company guard must not be bypassed.

The draft expressly says: “The concrete DB routine signatures and checked authority binding must be fixed in the issued migration against the accepted security contract; absence is a build hold”. Migration 0214 is reserved by the issued order; **no SQL or migration registration is supplied** because the security contract is absent. No table, routine, grant, owner, RLS policy, job, ledger, trial key, audit row or business history is changed by this preparation.

The storage handoff must fix checked authority/routine signatures, session/tenant/run-qualified keys, immutable intent/operation uniqueness, metadata command payload conflicts, authorization before replay, expected-revision serialization, reset successor/bootstrap scope, and immutable report/source-vector semantics. It must provide real PostgreSQL adversaries, N-alone and successor-twice upgrade tests and mutation controls. These obligations remain held, not waived.

## Runtime and integration holds

The P1 catalogue itself says `documentation-only`, `BLOCKED_NOT_COMPLETE`; its operation bindings remain HELD. P2 is a pure structural validator, not a source reader or a CH-9 runtime receipt. Missing operation recovery remains UNKNOWN; no latest-row or amount-matching fallback is allowed. No scenario end state or figure has been seeded.

DI2 is entirely HELD behind DI1 and accepted source/authority producers. No page, chooser, report component, Next adapter or registry has been installed. Consequently no Playwright test for a nonexistent route has been added.

After the missing contracts are supplied, the coordinator must serialize these shared changes (none is applied here):

- Export the accepted catalogue/trace modules through `packages/core/src/index.ts` and build output, or provide an explicit accepted package subpath. They are not currently exported through the public core barrel.
- Export the eventual run repository through `packages/db/src/index.ts` only once its checked storage contract exists.
- Compose the same eventual application in `apps/api/src/app.module.ts`, `apps/api/src/workspace/application.ts`, `apps/api/src/workspace/index.ts` and `apps/web/app/lib/workspace-server.ts`; expose any required package subpaths deliberately.
- Register the seven Nest operations and their equivalent Next adapters; regenerate `apps/api/openapi.json` on that integrated head.
- Register 0214 in actual migration discovery/protection/privilege inventories only after the reviewed SQL and companion `packages/db/migration-notes/0214_small_builder_demo_runs.md` exist. No unknown catalogue filename is invented here.
- Add navigation and accepted J1–J5 registry rows in merge order. No root navigation or other leaf is changed here.

Required future routes remain the seven draft operations: create, read run, reserve operation intent, checkpoint, create report snapshot, read report, and reset. GET must never create a snapshot; stored reports and archived runs must recheck current authority. Reset must preserve pending intents, snapshots, liabilities, meter history and consumed trial keys without implying domain cancellation.

No technical acceptance, independent model verdict, production activation or policy approval is asserted.
