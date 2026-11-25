import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ramsCommandV1, ramsSections, editRamsSections, ramsReadyToSign, RamsError, type RamsDraft } from "../src/v2-rams-draft.js";
import type { WorkPlan } from "../src/v2-work-plan-repository.js";
import { splashbackDecoratingTemplate } from "../src/v2-splashback-decorating-template.js";

const scope = randomUUID();
const plan = {
  jobId: randomUUID(), quoteRevisionId: randomUUID(), templateKey: splashbackDecoratingTemplate.key,
  version: 0, state: "draft", agreement: null, activationId: null, unplanned: [], scopeItems: [],
  changes: { added: [], removed: [], changed: [] },
  tasks: splashbackDecoratingTemplate.tasks.map((task, index) => ({ ...task, dependsOn: [], position: index + 1, scopeItemId: scope })),
} satisfies WorkPlan;
const previous = (sections: RamsDraft["sections"]): RamsDraft => ({
  version: "rams-draft.v1", environment: "synthetic_demo", jobId: plan.jobId, quoteRevisionId: plan.quoteRevisionId,
  revision: 1, documentVersion: 1, planVersion: 0, status: "signed", sections,
  actorMembershipId: randomUUID(), recordedAt: new Date().toISOString(), signedBy: randomUUID(), signedAt: new Date().toISOString(), signedName: "Fictional Builder",
});

describe("Q06 V2-K9 deterministic safety draft", () => {
  it("lists tile-cutting dust, occupied-home controls, COSHH and height for the exact template tasks", () => {
    const sections = ramsSections(plan);
    expect(sections.map(section => section.heading)).toEqual([
      ...plan.tasks.map(task => `Hazards and controls — ${task.title}`),
      "Sequence of work", "Site rules", "Welfare", "Emergency contacts",
    ]);
    const text = JSON.stringify(sections);
    for (const hazard of ["Tile-cutting dust", "Occupied home", "COSHH", "Working at height"]) expect(text).toContain(hazard);
    expect(text).not.toMatch(/pence|£|netPence|signedDelta/u);
    expect(ramsReadyToSign(sections)).toBe(false);
  });
  it("requires custom and unplanned task hazards rather than leaving a blank", () => {
    const sections = ramsSections({ ...plan, tasks: [{ ...plan.tasks[0]!, key: "custom-scope-item" }],
      unplanned: [{ scopeItemId: randomUUID(), title: "Custom preparation", status: "Unplanned" }] });
    expect(sections.slice(0, 2).every(section => section.required && section.text === "No standard hazards listed: add your own")).toBe(true);
    expect(ramsReadyToSign(sections)).toBe(false);
  });
  it("does not borrow another template's hazards for a matching task name", () => {
    expect(ramsSections({ ...plan, templateKey: "another-template.v1" })[0]!.required).toBe(true);
  });
  it("requires completion of both site fields and every clash", () => {
    let sections = editRamsSections(ramsSections(plan), "welfare", "Fictional site cabin and handwashing point");
    expect(ramsReadyToSign(sections)).toBe(false);
    sections = editRamsSections(sections, "emergency", "Fictional site contact and muster point checked");
    expect(ramsReadyToSign(sections)).toBe(true);
    expect(ramsReadyToSign([{ ...sections[0]!, needsReview: true }, ...sections.slice(1)])).toBe(false);
    expect(ramsReadyToSign(editRamsSections(sections, "welfare", "To complete"))).toBe(false);
  });
  it("keeps edits on unchanged sections, flags edited changed tasks, and leaves the signed source intact", () => {
    const original = previous(editRamsSections(ramsSections(plan), `hazards:${scope}:tile-splashback`, "Builder's fictional cutting-area controls"));
    const frozen = JSON.stringify(original);
    const unchanged = ramsSections(plan, original);
    expect(unchanged.find(section => section.edited)).toMatchObject({ text: "Builder's fictional cutting-area controls", needsReview: false });
    const changed = ramsSections({ ...plan, tasks: plan.tasks.map(task => ({ ...task, durationMinutes: task.durationMinutes + 1 })) }, original);
    const clash = changed.find(section => section.edited)!;
    expect(clash.needsReview).toBe(true);
    expect(editRamsSections(changed, clash.key, clash.text).find(section => section.key === clash.key)?.needsReview).toBe(false);
    expect(JSON.stringify(original)).toBe(frozen);
  });
  it("retains removed edited sections for reconciliation", () => {
    const sections = editRamsSections(ramsSections(plan), `hazards:${scope}:tile-splashback`, "Fictional builder controls");
    const next = ramsSections({ ...plan, tasks: [] }, previous(sections));
    expect(next.find(section => section.edited)).toMatchObject({ needsReview: true, text: "Fictional builder controls" });
  });
  it("refuses unknown section keys", () => {
    expect(() => editRamsSections(ramsSections(plan), "not-a-section", "Edited")).toThrow(RamsError);
  });
  it("requires exact versioned command envelopes and refuses caller-supplied actor, status or mode", () => {
    const command = { version: "rams-command.v1", commandId: randomUUID(), expectedVersion: 0,
      expectedPlanVersion: 0, quoteRevisionId: plan.quoteRevisionId, action: "generate" };
    expect(ramsCommandV1.safeParse(command).success).toBe(true);
    for (const extra of [{ actor: randomUUID() }, { status: "signed" }, { environment: "synthetic_demo" }, { jobId: plan.jobId }]) {
      expect(ramsCommandV1.safeParse({ ...command, ...extra }).success).toBe(false);
    }
    expect(ramsCommandV1.safeParse({ ...command, action: "sign" }).success).toBe(false);
    expect(ramsCommandV1.safeParse({ ...command, action: "edit", sectionKey: "welfare", text: " " }).success).toBe(false);
  });
});
