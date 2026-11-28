// Import the browser-safe leaf, never the database's server composition barrel.
export { briefDisplayText, briefLanguages, type Lang } from "../../../../packages/db/src/v2-brief-translator";
// Type-only, so client components can name these without importing the database package (identity.test.ts guard).
export type { CrewBrief, CrewBriefTranslation, CrewBriefTranslationCommand } from "@jobguard/db";
