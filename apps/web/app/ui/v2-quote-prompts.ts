// V2 "don't forget" prompts, keyed by the V2 work plan template key (c1).
// A prompt names a cost a quote for this kind of job usually carries. It never
// adds a line or a price: the builder decides, and adds any line through the
// existing Scope review route. `words` are the words a covering quote line
// would usually contain, so "already covered" is worked out from the lines.

// The V2 workspace plans every job from c1's splashback and hall template.
export const V2_QUOTE_TEMPLATE_KEY = "splashback-decorating.v1";

export interface QuotePrompt {
  key: string;
  label: string;
  hint: string;
  words: readonly string[];
}

export const v2QuotePrompts: Readonly<Record<string, readonly QuotePrompt[]>> = {
  [V2_QUOTE_TEMPLATE_KEY]: [
    { key: "waste", label: "Skip or waste removal", hint: "Old tiles, adhesive, packaging and dust sheets need taking away.",
      words: ["skip", "waste", "rubbish", "tip", "disposal", "clearance", "removal of debris"] },
    { key: "parking", label: "Parking permit", hint: "Some streets need a paid permit or suspended bay for the van.",
      words: ["parking", "permit", "bay suspension"] },
    { key: "making-good", label: "Making good", hint: "Plaster and filling where old tiles, sockets or fixings come off.",
      words: ["making good", "make good", "plaster", "plastering", "patch"] },
    { key: "decorating-after", label: "Decorating after", hint: "Paint touch-ups around the new splashback and any patched walls.",
      words: ["touch up", "touch-up", "touch-ups", "decorating after", "redecorate", "redecoration"] },
    { key: "protection", label: "Protection and cleaning", hint: "Floor protection, masking and a final clean of the kitchen and hall.",
      words: ["protection", "protect", "dust sheet", "dust sheets", "masking", "clean", "cleaning"] },
    { key: "overheads", label: "Overheads", hint: "Van, insurance, tools and your time pricing and ordering.",
      words: ["overhead", "overheads", "admin", "preliminaries", "prelims"] },
    { key: "contingency", label: "Contingency", hint: "An allowance for what you can't see until the old finish is off.",
      words: ["contingency", "allowance", "provisional"] },
  ],
};

export interface PromptLine { description: string }

function normalise(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim()} `;
}

/** A prompt is covered when any quote line, included or excluded, contains one of its words. */
export function isCovered(prompt: QuotePrompt, lines: readonly PromptLine[]) {
  const texts = lines.map(line => normalise(line.description));
  return prompt.words.some(word => {
    const needle = normalise(word);
    return texts.some(text => text.includes(needle));
  });
}

/** Prompts for this template that no line covers and the builder has not dismissed. */
export function openPrompts(templateKey: string, lines: readonly PromptLine[], dismissed: readonly string[]) {
  return (v2QuotePrompts[templateKey] ?? []).filter(prompt => !dismissed.includes(prompt.key) && !isCovered(prompt, lines));
}

// Dismissals are kept on this device only (no server record), per job and template.
const storageKey = (jobId: string, templateKey: string) => `jobguard:v2-quote-prompts:dismissed:${jobId}:${templateKey}`;

export function readDismissed(jobId: string, templateKey: string): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(storageKey(jobId, templateKey)) ?? "[]");
    return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function writeDismissed(jobId: string, templateKey: string, keys: readonly string[]) {
  try {
    globalThis.localStorage?.setItem(storageKey(jobId, templateKey), JSON.stringify([...new Set(keys)]));
    return true;
  } catch {
    return false;
  }
}
