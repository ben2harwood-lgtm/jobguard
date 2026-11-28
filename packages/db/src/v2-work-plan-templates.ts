import type { WorkPlanTemplate } from "./v2-work-plan-repository.js";
import { splashbackDecoratingTemplate } from "./v2-splashback-decorating-template.js";

// V2-SQ-F: generic tasks per trade, in stage order. Categories are the closed trade labels (JOB_TRADES in
// packages/core/src/job-understanding.ts), spelled as quote_line.category stores them. Titles never name a room
// or an item. "Other" has no tasks: its line shows as unplanned and takes a custom task. Durations are round
// "typical time" defaults the builder changes on the plan screen. No prices, no quantities.
type Step = { key: string; title: string; stage: number; minutes: 60 | 120 | 240; materials?: string[]; proof?: string[]; choices?: string[] };
const trade = (category: string, who: string, steps: Step[]) => steps.map((step, index) => ({
  key: step.key, category, title: step.title, trade: who, durationMinutes: step.minutes, stage: step.stage,
  dependsOn: index ? [steps[index - 1]!.key] : [], materialNeeds: step.materials ?? [], proofPoints: step.proof ?? [],
  customerChoices: step.choices ?? [],
}));

export const tradesTemplate = {
  key: "trades.v1",
  tasks: [
    ...trade("Strip-out", "strip-out", [
      { key: "strip-out-protect", title: "Protect the area", stage: 1, minutes: 60, materials: ["Dust sheets"], proof: ["Photo of the protected area"] },
      { key: "strip-out-clear", title: "Strip out and clear waste", stage: 1, minutes: 240, materials: ["Waste removal"], proof: ["Photo of the cleared area"] },
    ]),
    ...trade("Groundworks", "groundworker", [
      { key: "groundworks-prepare", title: "Dig out and prepare the base", stage: 1, minutes: 240, proof: ["Photo of the prepared base"] },
      { key: "groundworks-lay", title: "Lay and finish", stage: 1, minutes: 240, proof: ["Photo of the finished work"] },
    ]),
    ...trade("Brickwork", "bricklayer", [
      { key: "brickwork-set-up", title: "Set up and protect", stage: 2, minutes: 60 },
      { key: "brickwork-build", title: "Build or repair the brickwork", stage: 2, minutes: 240, materials: ["Bricks", "Mortar"], proof: ["Photo of the finished brickwork"] },
    ]),
    ...trade("Roofing", "roofer", [
      { key: "roofing-access", title: "Make safe access", stage: 2, minutes: 120, proof: ["Photo of the access in place"] },
      { key: "roofing-work", title: "Carry out the roofing work", stage: 2, minutes: 240, proof: ["Photo of the finished roof work"] },
    ]),
    ...trade("Plumbing", "plumber", [
      { key: "plumbing-first-fix", title: "First fix pipework", stage: 3, minutes: 240, proof: ["Photo of the pipework before covering"] },
      { key: "plumbing-second-fix", title: "Second fix and test", stage: 6, minutes: 240, proof: ["Photo of the tested installation"] },
    ]),
    ...trade("Electrics", "electrician", [
      { key: "electrics-first-fix", title: "First fix cables", stage: 3, minutes: 240, proof: ["Photo of the cables before covering"] },
      { key: "electrics-second-fix", title: "Second fix, test and certificate", stage: 6, minutes: 240, proof: ["Test certificate"] },
    ]),
    ...trade("Carpentry", "carpenter", [
      { key: "carpentry-fit", title: "Fit the carpentry work", stage: 4, minutes: 240, proof: ["Photo of the fitted work"] },
    ]),
    ...trade("Plastering", "plasterer", [
      { key: "plastering-plaster", title: "Prepare and plaster", stage: 5, minutes: 240, materials: ["Plaster"], proof: ["Photo of the plastered surface"] },
      { key: "plastering-dry", title: "Allow to dry", stage: 5, minutes: 60 },
    ]),
    ...trade("Kitchen fitting", "kitchen fitter", [
      { key: "kitchen-fitting-units", title: "Fit the units", stage: 6, minutes: 240, proof: ["Photo of the fitted units"] },
      { key: "kitchen-fitting-worktops", title: "Fit worktops and finish", stage: 6, minutes: 240, proof: ["Photo of the finished kitchen"], choices: ["Worktop finish"] },
    ]),
    ...trade("Tiling", "tiler", [
      { key: "tiling-prepare", title: "Prepare the surface", stage: 7, minutes: 60, materials: ["Primer"], proof: ["Photo of the prepared surface"] },
      { key: "tiling-tile", title: "Tile and grout", stage: 7, minutes: 240, materials: ["Tiles", "Adhesive", "Grout"], proof: ["Photo of the finished tiling"], choices: ["Tile and grout finish"] },
    ]),
    ...trade("Flooring", "flooring fitter", [
      { key: "flooring-prepare", title: "Prepare the subfloor", stage: 8, minutes: 120, proof: ["Photo of the prepared subfloor"] },
      { key: "flooring-lay", title: "Lay the floor", stage: 8, minutes: 240, proof: ["Photo of the finished floor"], choices: ["Floor finish"] },
    ]),
    ...trade("Decorating", "decorator", [
      { key: "decorating-prepare", title: "Protect and prepare", stage: 9, minutes: 120, materials: ["Dust sheets", "Filler"], proof: ["Photo of protection and prepared surfaces"] },
      { key: "decorating-paint", title: "Paint and finish", stage: 9, minutes: 240, materials: ["Paint"], proof: ["Photo of the finished decoration"], choices: ["Paint colour and finish"] },
    ]),
  ],
} as const satisfies WorkPlanTemplate;

/** Every template a stored plan may name. A stored plan always reads back through its own template. */
export const workPlanTemplates: ReadonlyMap<string, WorkPlanTemplate> = new Map<string, WorkPlanTemplate>([
  [splashbackDecoratingTemplate.key, splashbackDecoratingTemplate],
  [tradesTemplate.key, tradesTemplate],
]);

/** A template with stages orders its tasks by stage; the splashback template has none and keeps line order. */
export const isStaged = (template: WorkPlanTemplate) => template.tasks.some(task => task.stage !== undefined);
