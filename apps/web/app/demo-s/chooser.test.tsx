import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { smallBuilderDemoRunV1, smallBuilderDemoReportV1, previewDemoMeter } from "@jobguard/core";
import { MeterPreview } from "./meter-preview";
import { DemoChooser, LifecycleReport } from "./chooser";
import { demoLink, journeyChoices, meterProfiles, pendingKey, readPending } from "./chooser-state";
vi.stubGlobal("React", React);
const id = "d1500000-0000-4000-8000-000000000001";
const facts = { version: "small-builder-demo-run.v1", environment: "synthetic_demo", runId: id, scenario: "shadow-30000", revision: 1, status: "blocked", reason: "Not ready yet: Final Check journey execution is unavailable.", createdAt: "2026-10-28T00:00:00Z", archivedAt: null, predecessorId: null, successorId: null };
describe("DEMO-S chooser and honest lifecycle report", () => {
  it("covers J1–J5 and every meter profile without executable or expected-money claims", () => {
    expect(journeyChoices.map(item => item.journey)).toEqual(["DEMO-J1", "DEMO-J2", "DEMO-J3", "DEMO-J4", "DEMO-J5"]);
    expect(meterProfiles).toHaveLength(13); expect(meterProfiles[9]).toContain("13–17");
    for (const item of journeyChoices) expect(item.reason).toContain("not ready yet");
  });
  it("links only persisted lifecycle identities and records missing A1 and observations", () => {
    const report = smallBuilderDemoReportV1.parse({ version: "small-builder-demo-report.v1", snapshotId: id, facts });
    const html = renderToStaticMarkup(<LifecycleReport report={report} tenantId={id} />);
    expect(html).toContain("Final Check journey execution is unavailable");
    expect(html).toContain("The product journey has not run"); expect(html).toContain("DEMO-A1 is not ready yet");
    expect(html).toContain("0 of 2"); expect(html).toContain("snapshotId="); expect(html).toContain("Revision");
    expect(html).not.toMatch(/£800|£80|£720|£34,400|PASS|settled|signals found/);
  });
  it("renders actual producer amounts, grace crossing and plain unavailable reasons without a settlement claim",()=>{
    const html=renderToStaticMarkup(<MeterPreview preview={previewDemoMeter({tenantId:id,runId:id})} />);
    for(const amount of ["£348.00","£828.00","£89.00","£79.00","£169.00","£49.00","£62.33","£69.65"])expect(html).toContain(amount);
    expect(html).toContain("track_review_due immediately");expect(html).toContain("MON-3 trial prelude");
    expect(html).toContain("Not ready yet");expect(html).toContain("not issued statements or settled payments");
    expect(html).toContain("2026-04-02");
  });
  it("accepts the saved meter run with a preview-unavailable note without changing lifecycle facts", () => {
    const saved = { ...facts, scenario: "meter", meterPreviewNote: "Preview unavailable." };
    expect(smallBuilderDemoRunV1.parse(saved)).toEqual(saved);
    expect(smallBuilderDemoRunV1.safeParse({ ...saved, meterPreviewNote: "private error" }).success).toBe(false);
    expect(smallBuilderDemoReportV1.safeParse({ version: "small-builder-demo-report.v1", snapshotId: id, facts: saved }).success).toBe(false);
  });
  it("renders no saved company or hidden data before authentication", () => {
    const html = renderToStaticMarkup(<DemoChooser />);
    expect(html).toContain("Checking your signed-in business");
    expect(html).not.toContain("Saved selection report"); expect(html).not.toContain(id);
  });
  it("restores only exact metadata intents, keeping replay IDs and owner storage scopes separate", () => {
    const command = { operation: "reset", runId: id, input: { contractVersion: "small-builder-demo.reset.v1", commandId: id, expectedRunRevision: 1 } };
    expect(readPending(JSON.stringify(command))).toEqual(command);
    expect(pendingKey("tenant-a", "member-a")).not.toBe(pendingKey("tenant-b", "member-a"));
    expect(pendingKey("tenant-a", "member-a")).not.toBe(pendingKey("tenant-a", "member-b"));
    for (const input of [null, "{", JSON.stringify({ ...command, completed: true }), JSON.stringify({ ...command, input: { ...command.input, releaseTrialKey: true } })]) expect(readPending(input)).toBeNull();
  });
  it.each(["allocation", "reversal", "lockedBillId", "hiddenSignals", "feePence", "completed"])("refuses invented result %s in both client and repository's shared schema", key => {
    expect(smallBuilderDemoRunV1.safeParse({ ...facts, [key]: 100 }).success).toBe(false);
    expect(smallBuilderDemoReportV1.safeParse({ version: "small-builder-demo-report.v1", snapshotId: id, facts: { ...facts, [key]: 100 } }).success).toBe(false);
  });
  it("cannot turn a completed status or foreign snapshot body into a saved report", () => {
    expect(smallBuilderDemoRunV1.safeParse({ ...facts, status: "completed" }).success).toBe(false);
    expect(smallBuilderDemoReportV1.safeParse({ version: "small-builder-demo-report.v1", snapshotId: "foreign", facts }).success).toBe(false);
    expect(demoLink(id, id, id)).toBe(`/demo-s?tenantId=${id}&runId=${id}&snapshotId=${id}`);
  });
});
