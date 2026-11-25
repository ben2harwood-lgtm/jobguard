import { afterEach, describe, expect, it, vi } from "vitest";
import { splashbackDecoratingTemplate } from "../../../../packages/db/src/v2-splashback-decorating-template";
import { isCovered, openPrompts, readDismissed, V2_QUOTE_TEMPLATE_KEY, v2QuotePrompts, writeDismissed } from "./v2-quote-prompts";

const prompts = v2QuotePrompts[V2_QUOTE_TEMPLATE_KEY]!;
const keys = (lines: { description: string }[], dismissed: string[] = []) =>
  openPrompts(V2_QUOTE_TEMPLATE_KEY, lines, dismissed).map(prompt => prompt.key);

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("V2 don't-forget prompts", () => {
  it("is keyed by c1's template key and lists the usual costs for the splashback and hall job", () => {
    expect(V2_QUOTE_TEMPLATE_KEY).toBe(splashbackDecoratingTemplate.key);
    expect(prompts.map(prompt => prompt.label)).toEqual([
      "Skip or waste removal", "Parking permit", "Making good", "Decorating after",
      "Protection and cleaning", "Overheads", "Contingency",
    ]);
    expect(new Set(prompts.map(prompt => prompt.key)).size).toBe(prompts.length);
  });

  it("shows every prompt for the seeded tiling and painting lines", () => {
    expect(keys([{ description: "Tile the splashback" }, { description: "Paint the hall walls and trim" }]))
      .toEqual(prompts.map(prompt => prompt.key));
  });

  it("works out cover from whole words in any line, ignoring case and punctuation", () => {
    const covered = keys([
      { description: "SKIP hire (4 yard)" }, { description: "Make-good plaster around sockets" },
      { description: "Contingency allowance" },
    ]);
    expect(covered).not.toContain("waste");
    expect(covered).not.toContain("making-good");
    expect(covered).not.toContain("contingency");
    expect(covered).toContain("parking");
    // "tip" must not match inside another word.
    expect(isCovered(prompts[0]!, [{ description: "Multiple tiles" }])).toBe(false);
  });

  it("leaves out dismissed prompts and unknown templates", () => {
    expect(keys([], ["parking", "overheads"])).not.toEqual(expect.arrayContaining(["parking", "overheads"]));
    expect(keys([], ["parking"])).toHaveLength(prompts.length - 1);
    expect(openPrompts("unknown-template.v1", [], [])).toEqual([]);
  });

  it("never returns a price or a line, only labels and words", () => {
    for (const prompt of prompts) expect(Object.keys(prompt).sort()).toEqual(["hint", "key", "label", "words"]);
  });

  it("keeps dismissals per job and template on this device", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const job = "11111111-1111-4111-8111-111111111111";
    expect(readDismissed(job, V2_QUOTE_TEMPLATE_KEY)).toEqual([]);
    expect(writeDismissed(job, V2_QUOTE_TEMPLATE_KEY, ["parking", "parking", "waste"])).toBe(true);
    expect(readDismissed(job, V2_QUOTE_TEMPLATE_KEY)).toEqual(["parking", "waste"]);
    expect(readDismissed("22222222-2222-4222-8222-222222222222", V2_QUOTE_TEMPLATE_KEY)).toEqual([]);
  });

  it("falls back to showing prompts when browser storage is unavailable or corrupt", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(readDismissed("job", V2_QUOTE_TEMPLATE_KEY)).toEqual([]);
    expect(writeDismissed("job", V2_QUOTE_TEMPLATE_KEY, ["parking"])).toBe(false);
    vi.stubGlobal("localStorage", { getItem: () => "{not json", setItem: () => undefined });
    expect(readDismissed("job", V2_QUOTE_TEMPLATE_KEY)).toEqual([]);
  });
});
