import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { smallBuilderDemoRunV1, smallBuilderDemoReportV1, previewDemoMeter } from "@jobguard/core";
import { MeterPreview } from "./meter-preview";
import { DemoChooser, LifecycleReport } from "./chooser";
import { demoLink, journeyChoices, meterProfiles, journeyAvailable, pendingKey, readPending } from "./chooser-state";
vi.stubGlobal("React", React);
const id = "d1500000-0000-4000-8000-000000000001";
const facts = { version: "small-builder-demo-run.v1", environment: "synthetic_demo", runId: id, scenario: "shadow-30000", revision: 1, status: "blocked", reason: "Not ready yet: Final Check journey execution is unavailable.", createdAt: "2026-10-28T00:00:00Z", archivedAt: null, predecessorId: null, successorId: null };
describe("DEMO-S chooser and honest lifecycle report", () => {
  it("enables only journeys with a real guide and saved report reader", () => {
    expect(journeyChoices.map(item => item.journey)).toEqual(["DEMO-J1", "DEMO-J2", "DEMO-J3", "DEMO-J4", "DEMO-J5"]);
    expect(new Set(journeyChoices.map(item => item.scenario)).size).toBe(5);
    expect(meterProfiles).toHaveLength(13); expect(meterProfiles[9]).toContain("13–17");
    expect(journeyChoices.filter(item => journeyAvailable(item.scenario)).map(item => item.scenario)).toEqual(["core-1000", "recovery-18800", "shadow-30000", "meter", "trial"]);
    for (const item of journeyChoices.filter(choice => !journeyAvailable(choice.scenario))) expect(item.reason).toContain("not ready yet");
    expect(journeyChoices.find(row => row.scenario === "shadow-30000")!.reason).toContain("complete only when every one is saved");
  });
  it("links only persisted lifecycle identities and records missing A1 and observations", () => {
    const report = smallBuilderDemoReportV1.parse({ version: "small-builder-demo-report.v1", snapshotId: id, facts });
    const html = renderToStaticMarkup(<LifecycleReport report={report} tenantId={id} />);
    expect(html).toContain("Final Check journey execution is unavailable");
    expect(html).toContain("It does not record whether a product journey ran"); expect(html).toContain("Demo acceptance is not recorded here");
    expect(html).toContain("0 of 2"); expect(html).toContain("snapshotId="); expect(html).toContain("Revision");
    expect(html).not.toMatch(/£800|£80|£720|£34,400|PASS|settled|signals found/);
  });
  it.each([["meter", "/meter"], ["trial", "/demo-s/trial?"], ["core-1000", "Read saved core-1000 results"]])("points the %s report at its saved screens", (scenario, target) => {
    const report = smallBuilderDemoReportV1.parse({ version: "small-builder-demo-report.v1", snapshotId: id, facts: { ...facts, scenario } });
    expect(renderToStaticMarkup(<LifecycleReport report={report} tenantId={id} />)).toContain(target);
  });
  it.each([
    ["core-1000", "Read saved core-1000 results", null, true],
    ["recovery-18800", "Open the recovery practice guide", "/demo-s/recovery-18800", false],
    ["shadow-30000", "Create or resume and read saved results", null, true],
    ["meter", "Jobs on the go and account review", "/meter", false],
    ["trial", "trial source report", `/demo-s/trial?tenantId=${id}&amp;runId=${id}`, false],
  ] as const)("gives %s honest report directions and saved-screen links, including archived selections", (scenario, label, href, below) => {
    for (const archived of [false, true]) {
      const report = smallBuilderDemoReportV1.parse({ version: "small-builder-demo-report.v1", snapshotId: id,
        facts: { ...facts, scenario, ...(archived ? { status: "archived", revision: 2, archivedAt: "2026-11-03T00:00:00Z" } : {}) } });
      const html = renderToStaticMarkup(<LifecycleReport report={report} tenantId={id} />);
      expect(html).toContain("Saved screens:");
      expect(html).toContain(label);
      if (href) expect(html).toContain(`href="${href}"`);
      expect(html.includes("below")).toBe(below);
      expect(html).toContain(below ? "using the saved-results control below" : scenario === "recovery-18800"
        ? "Read saved results in the job’s own recovery practice guide." : "on the linked saved screens");
      if (scenario === "recovery-18800") {
        expect(html).toContain("This selection is not tied to one job");
        expect(html).toContain("The job’s own recovery practice guide holds its saved results");
        expect(html).not.toContain("jobId=");
      }
      expect(html).toContain("This snapshot records selection metadata only. It does not record whether a product journey ran.");
      expect(html).toContain(`href="/demo-s?tenantId=${id}&amp;runId=${id}&amp;snapshotId=${id}"`);
      expect(html).toContain("Independent verdict: missing");
      expect(html).toContain("0 of 2 recorded");
    }
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
    expect(html).toContain('href="/demo-s/core-1000"');
    expect(html).toContain('href="/demo-s/shadow-30000"');
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
