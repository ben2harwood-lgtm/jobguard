# DEMO-P1-CAPTURE-RECIPES — builder receipt

Builder: Claude builder 1, Claude Desktop Code tab session `local_e33a5dde-13a2-4b63-a984-40e00d4258f5`,
model `claude-opus-5-5`, host `Bens-MacBook-Pro-2.local`. Built under the JobGuard simple build loop (Ben, 28 Oct).
Base: `origin/main` `dda5680c`; issued source SHA-256 prefixes unchanged (41fa9f78 / 6ae5df83 / f02320b5).
This is a builder record, not an independent review or acceptance.

## Change

- `docs/fixtures/small-builder-demo-inputs.json`: meter and trial `source.text` now use the same `JOB:`/`ITEM:`
  grammar as the other three families. The customer name and recipient address are removed. IDs, families and version are unchanged.
- `packages/core/src/small-builder-demo-scenarios.test.ts`: the existing real-parser `it.each` now covers all five
  families, with every assertion kept.
- `docs/contracts/small-builder-demo-v1.md`: the capture-grammar sentence now covers all five families. The
  "not a lifecycle schedule" limitation is unchanged.

## Checks actually run (local)

- Widened test on the original fixture: meter and trial failed (2 failed, 54 passed).
- After the fix: `vitest run src/small-builder-demo-scenarios.test.ts --maxWorkers=2` gave 56/56 passing.
- Mutation: restoring only the original meter text failed only the meter case, and restoring only the trial text
  failed only the trial case (each 1 failed, 55 passed). The fixed fixture was restored afterwards (hash identical).
- `pnpm --filter @jobguard/core typecheck`, `lint`, `build` all passed.
- DB and browser suites were not run locally; CI runs them.

This proves capture inputs only, not an executable lifecycle journey. Not RED: no money, sign-in, tenant or hidden-data code.
