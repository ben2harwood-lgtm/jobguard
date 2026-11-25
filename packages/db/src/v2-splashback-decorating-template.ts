import type { WorkPlanTemplate } from "./v2-work-plan-repository.js";

export const splashbackDecoratingTemplate = {
  key: "splashback-decorating.v1",
  tasks: [
    {
      key: "prepare-splashback", category: "Tiling", title: "Prepare the splashback surface",
      trade: "tiler", durationMinutes: 60, dependsOn: [],
      materialNeeds: ["Surface protection", "Primer"],
      proofPoints: ["Photo of the prepared surface"], customerChoices: [],
    },
    {
      key: "tile-splashback", category: "Tiling", title: "Fit and grout the splashback",
      trade: "tiler", durationMinutes: 240, dependsOn: ["prepare-splashback"],
      materialNeeds: ["Tiles", "Adhesive", "Grout"],
      proofPoints: ["Photo of the finished splashback"], customerChoices: ["Tile and grout finish"],
    },
    {
      key: "prepare-hall", category: "Decorating", title: "Protect and prepare the hall",
      trade: "decorator", durationMinutes: 90, dependsOn: [],
      materialNeeds: ["Dust sheets", "Filler", "Abrasives"],
      proofPoints: ["Photo of protection and prepared surfaces"], customerChoices: [],
    },
    {
      key: "paint-hall", category: "Decorating", title: "Paint the hall walls and trim",
      trade: "decorator", durationMinutes: 240, dependsOn: ["prepare-hall"],
      materialNeeds: ["Wall paint", "Trim paint"],
      proofPoints: ["Photo of finished walls and trim"], customerChoices: ["Paint colour and finish"],
    },
  ],
} as const satisfies WorkPlanTemplate;
