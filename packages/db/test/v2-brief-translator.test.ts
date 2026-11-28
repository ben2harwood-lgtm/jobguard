import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrewBriefContent } from "../src/v2-crew-brief-repository.js";
import { briefLanguages, briefTextsForTranslation, FakeTranslator, translatedBriefContent } from "../src/v2-brief-translator.js";
import { crewBriefTranslationCommandV1 } from "../src/v2-crew-brief-translation-repository.js";

const source: CrewBriefContent = {
  version: "v2-crew-brief.v1", trade: "Tiler", quoteRevisionId: "quote-id-private", accessWindow: "Mornings",
  tasks: [{ position: 1, taskKey: "private-task", scopeItemId: "private-scope", title: "Lay tiles",
    scope: { description: "Tile the wall", quantity: "91827", unit: "private-unit" },
    durationMinutes: 177, visit: "Monday", owner: "private-owner", proofNeeded: ["Before", "After"] },
  { position: 2, taskKey: "private-task-2", scopeItemId: "private-scope", title: "Grout",
    scope: { description: "Finish joints", quantity: null, unit: null },
    durationMinutes: 10, visit: null, owner: null, proofNeeded: [] }],
  photos: [{ evidenceId: "private-photo", scopeItemId: "private-scope", contentType: "image/jpeg" }],
  proofNeeded: ["Final photo"],
};
afterEach(() => vi.unstubAllGlobals());
describe("V2-D4B offline translator", () => {
  it("sends exactly the allowed text list and none of the excluded values", () => {
    expect(briefTextsForTranslation(source)).toEqual([
      "Tiler", "Mornings", "Lay tiles", "Tile the wall", "Monday", "Before", "After", "Grout", "Finish joints", "Final photo",
    ]);
    expect(JSON.stringify(briefTextsForTranslation(source))).not.toMatch(/private|91827|177|jpeg|quote-id/);
  });
  it.each(briefLanguages)("is deterministic offline for $name and preserves shape, nulls and local values", async ({ code }) => {
    const fetch = vi.fn(() => { throw new Error("NETWORK_FORBIDDEN"); }); vi.stubGlobal("fetch", fetch);
    const original = structuredClone(source);
    const translator = new FakeTranslator();
    const input = { texts: briefTextsForTranslation(source), target: code };
    const texts = await translator.translate(input);
    expect(await translator.translate(input)).toEqual(texts);
    expect(texts).toEqual(input.texts.map(text => `[${code}] ${text}`));
    const result = translatedBriefContent(source, texts);
    expect(briefTextsForTranslation(result)).toEqual(texts);
    expect(result.tasks.map(task => [task.taskKey, task.scopeItemId, task.scope.quantity, task.scope.unit,
      task.durationMinutes, task.owner, task.position])).toEqual(source.tasks.map(task => [task.taskKey, task.scopeItemId,
      task.scope.quantity, task.scope.unit, task.durationMinutes, task.owner, task.position]));
    expect(result.photos).toEqual(source.photos); expect(result.quoteRevisionId).toBe(source.quoteRevisionId);
    expect(result.tasks[1]!.visit).toBeNull();
    const shape = (value: unknown): unknown => value === null ? null : Array.isArray(value) ? value.map(shape)
      : typeof value === "object" ? Object.fromEntries(Object.entries(value!).map(([key, child]) => [key, shape(child)]))
      : typeof value;
    expect(shape(result)).toEqual(shape(source)); expect(source).toEqual(original);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses a malformed translator result", () => {
    expect(() => translatedBriefContent(source, [])).toThrow("CREW_BRIEF_TRANSLATION_INVALID_OUTPUT");
  });
  it("refuses unknown language, stale shape, invalid identity and authority overrides", () => {
    const command = { version: "v2-crew-brief-translation-command.v1", commandId: crypto.randomUUID(),
      trade: "tiler", expectedVersion: 1, lang: "pl" };
    expect(crewBriefTranslationCommandV1.safeParse(command).success).toBe(true);
    for (const patch of [{ lang: "en" }, { lang: "xx" }, { expectedVersion: 0 }, { commandId: "bad" },
      { actorMembershipId: crypto.randomUUID() }, { provider: "live" }, { texts: ["not authoritative"] }]) {
      expect(crewBriefTranslationCommandV1.safeParse({ ...command, ...patch }).success).toBe(false);
    }
  });
});
