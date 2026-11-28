import type { CrewBriefContent } from "./v2-crew-brief-repository.js";

// Browser-safe data and pure projections; no provider, credentials or network.
export const briefLanguages = [
  { code: "pl", name: "Polish" },
  { code: "ro", name: "Romanian" },
  { code: "pt", name: "Portuguese" },
  { code: "lt", name: "Lithuanian" },
  { code: "bg", name: "Bulgarian" },
] as const;
export type Lang = typeof briefLanguages[number]["code"];
export interface BriefTranslator {
  translate(input: { texts: string[]; target: Lang }): Promise<string[]>;
}
export class FakeTranslator implements BriefTranslator {
  async translate({ texts, target }: { texts: string[]; target: Lang }): Promise<string[]> {
    return texts.map(text => `[${target}] ${text}`);
  }
}

/** The complete allowlist crossing the translation port, in reconstruction order. */
export function briefTextsForTranslation(content: CrewBriefContent): string[] {
  return [content.trade, content.accessWindow, ...content.tasks.flatMap(task => [
    task.title, task.scope.description, ...(task.visit === null ? [] : [task.visit]), ...task.proofNeeded,
  ]), ...content.proofNeeded];
}

/** Preserve the exact shape and all excluded values locally, without mutating English. */
export function translatedBriefContent(content: CrewBriefContent, texts: string[]): CrewBriefContent {
  if (texts.length !== briefTextsForTranslation(content).length || texts.some(text => typeof text !== "string")) {
    throw new Error("CREW_BRIEF_TRANSLATION_INVALID_OUTPUT");
  }
  let index = 0;
  const next = () => texts[index++]!;
  return { ...content, trade: next(), accessWindow: next(), tasks: content.tasks.map(task => ({
    ...task, title: next(), scope: { ...task.scope, description: next() },
    visit: task.visit === null ? null : next(), proofNeeded: task.proofNeeded.map(next),
  })), photos: content.photos.map(photo => ({ ...photo })), proofNeeded: content.proofNeeded.map(next) };
}

export function briefDisplayText(content: CrewBriefContent, translation: CrewBriefContent | null): CrewBriefContent {
  return translation ?? content;
}
