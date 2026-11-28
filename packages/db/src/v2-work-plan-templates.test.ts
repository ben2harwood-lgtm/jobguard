import { describe, expect, it } from "vitest";
import { splashbackDecoratingTemplate } from "./v2-splashback-decorating-template.js";
import { customWorkPlanTaskKey } from "./v2-work-plan-edits.js";
import { isStaged, tradesTemplate, workPlanTemplates } from "./v2-work-plan-templates.js";

// The closed trade list from V2-SQ-C (JOB_TRADES in packages/core/src/job-understanding.ts), copied while that
// contract is not yet on this base; import it once SQ-C lands.
const JOB_TRADES = ["Strip-out", "Carpentry", "Kitchen fitting", "Plumbing", "Electrics", "Plastering", "Tiling",
  "Flooring", "Decorating", "Roofing", "Brickwork", "Groundworks", "Other"];

describe("V2-SQ-F work plan templates", () => {
  it("registers both templates, and keeps the splashback template as it was", () => {
    expect([...workPlanTemplates.keys()]).toEqual(["splashback-decorating.v1", "trades.v1"]);
    expect(workPlanTemplates.get("splashback-decorating.v1")).toBe(splashbackDecoratingTemplate);
    expect(isStaged(splashbackDecoratingTemplate)).toBe(false);
    expect(isStaged(tradesTemplate)).toBe(true);
  });
  it("trades.v1: closed trade labels, unique keys, round durations, dependencies inside one trade and earlier", () => {
    const keys = tradesTemplate.tasks.map(task => task.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(customWorkPlanTaskKey);
    for (const task of tradesTemplate.tasks) {
      expect(JOB_TRADES).toContain(task.category);
      expect([60, 120, 240]).toContain(task.durationMinutes);
      expect(task.stage).toBeGreaterThanOrEqual(1);
      for (const before of task.dependsOn) {
        const prior = tradesTemplate.tasks.find(entry => entry.key === before)!;
        expect(prior.category).toBe(task.category);
        expect(keys.indexOf(before)).toBeLessThan(keys.indexOf(task.key));
        expect(prior.stage).toBeLessThanOrEqual(task.stage);
      }
    }
    expect(new Set(tradesTemplate.tasks.map(task => task.category))).toEqual(new Set(JOB_TRADES.filter(trade => trade !== "Other")));
  });
  it("trades.v1 titles name no room or item, and carry no money or quantity", () => {
    for (const task of tradesTemplate.tasks) {
      const words = [task.title, ...task.materialNeeds, ...task.proofPoints, ...task.customerChoices].join(" ");
      expect(words).not.toMatch(/splashback|\bhall\b|bathroom|bedroom|landing|£|\d/iu);
    }
    expect(tradesTemplate.tasks.filter(task => task.trade === "tiler").map(task => task.category)).toEqual(["Tiling", "Tiling"]);
    expect(tradesTemplate.tasks.filter(task => task.trade === "decorator").map(task => task.category)).toEqual(["Decorating", "Decorating"]);
  });
});
