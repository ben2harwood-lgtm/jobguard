import { describe, expect, it } from "vitest";
import {
  smallBuilderDemoCreateV1,
  smallBuilderDemoResetV1,
  smallBuilderDemoReportSnapshotV1,
  smallBuilderDemoReadRunV1,
  smallBuilderDemoReadReportV1,
} from "./small-builder-demo.contracts.js";

// Boundary preparation only. These tests do not establish lifecycle, DB or journey acceptance.
const id = "d1500000-0000-4000-8000-000000000001";
const create = { contractVersion: "small-builder-demo.create.v1", commandId: id, scenario: "core-1000" };
const reset = { contractVersion: "small-builder-demo.reset.v1", commandId: id, expectedRunRevision: 1 };
const snapshot = { ...reset, contractVersion: "small-builder-demo.report-snapshot.v1" };
const commands = [
  { schema: smallBuilderDemoCreateV1, input: create },
  { schema: smallBuilderDemoResetV1, input: reset },
  { schema: smallBuilderDemoReportSnapshotV1, input: snapshot },
];

describe("DEMO-I boundary preparation; runtime acceptance remains HELD", () => {
  it.each(["core-1000", "recovery-18800", "shadow-30000", "meter", "trial"])(
    "accepts catalogue selection %s without asserting executability (DI2-01 preparation)", scenario => {
      expect(smallBuilderDemoCreateV1.parse({ ...create, scenario })).toEqual({ ...create, scenario });
    },
  );
  it.each(["", "core", "core-1000; DROP TABLE app.job", "constructor", "CORE-1000"])(
    "refuses non-catalogue selection %s", scenario => {
      expect(smallBuilderDemoCreateV1.safeParse({ ...create, scenario }).success).toBe(false);
    },
  );
  for (const { schema, input } of commands) {
    describe(input.contractVersion, () => {
      it("requires its exact version and a metadata command UUID", () => {
        expect(schema.parse(input)).toEqual(input);
        const { commandId: _commandId, ...missingId } = input;
        expect(schema.safeParse(missingId).success).toBe(false);
        for (const commandId of ["", "not-a-uuid", 1, null]) {
          expect(schema.safeParse({ ...input, commandId }).success).toBe(false);
        }
        for (const contractVersion of [undefined, "small-builder-demo.create.v2", "sandbox_command_v1"]) {
          expect(schema.safeParse({ ...input, contractVersion }).success).toBe(false);
        }
      });
      it.each([
        ["tenantId", id], ["sessionId", id], ["actor", id], ["membershipId", id],
        ["environment", "synthetic_demo"], ["authority", { verified: true }],
        ["jobId", id], ["step", 99], ["completed", true], ["amountPence", 100],
        ["fee", 100], ["settlementStatus", "settled"], ["count", 0], ["trial", true],
        ["facts", []], ["receipt", {}], ["sourceVector", []], ["PASS", true],
        ["ci", "https://example.invalid/pass"], ["modelVerdict", "PASS"], ["humanObservation", "PASS"],
        ["expectedValue", 100], ["observedValue", 100], ["disclosedBeforeLock", false],
      ])("rejects client-owned %s (DI1-05 / DI3-01 / DI3-06 / DI3-09 preparation)", (key, value) => {
        expect(schema.safeParse({ ...input, [String(key)]: value }).success).toBe(false);
      });
      it.each([null, [], "", 1, true])("rejects non-object %j", raw => {
        expect(schema.safeParse(raw).success).toBe(false);
      });
    });
  }
  for (const { schema, input } of commands.slice(1)) {
    it(`${input.contractVersion} requires a positive safe expected revision (DI1-03 boundary only)`, () => {
      for (const expectedRunRevision of [undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, "1"]) {
        expect(schema.safeParse({ ...input, expectedRunRevision }).success).toBe(false);
      }
    });
  }
  it("reset cannot request cancellation, entitlement reuse or deletion (DI1-06 / DI3-11 preparation)", () => {
    for (const key of ["cancelPending", "deleteHistory", "releaseTrialKey", "excludeOldJobsFromMeter", "successorTenantId", "snapshotBeforeReset"]) {
      expect(smallBuilderDemoResetV1.safeParse({ ...reset, [key]: true }).success).toBe(false);
    }
  });
  it("read queries contain only subject locators; no snapshot/write flag (DI3-04 preparation)", () => {
    expect(smallBuilderDemoReadRunV1.parse({ runId: id })).toEqual({ runId: id });
    expect(smallBuilderDemoReadReportV1.parse({ runId: id })).toEqual({ runId: id });
    expect(smallBuilderDemoReadReportV1.parse({ runId: id, snapshotId: id })).toEqual({ runId: id, snapshotId: id });
    for (const schema of [smallBuilderDemoReadRunV1, smallBuilderDemoReadReportV1]) {
      for (const runId of [undefined, "", "not-a-uuid", [], null]) {
        expect(schema.safeParse({ runId }).success).toBe(false);
      }
      for (const key of ["createSnapshot", "commandId", "tenantId", "includeHidden", "archive"]) {
        expect(schema.safeParse({ runId: id, [key]: true }).success).toBe(false);
      }
    }
    expect(smallBuilderDemoReadReportV1.safeParse({ runId: id, snapshotId: "invalid" }).success).toBe(false);
    expect(smallBuilderDemoReadRunV1.safeParse({ runId: id, snapshotId: id }).success).toBe(false);
  });
});
