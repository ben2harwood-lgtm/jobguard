// Type-only, so the "use client" Briefs card can name these without importing the database package
// (apps/api identity.test.ts refuses client files that name @jobguard/db).
export type { CrewBrief, CrewBriefCommand } from "@jobguard/db";
