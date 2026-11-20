import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const wording = {
  "quote-editor.tsx": [
    ["Preview immutable quote", "Preview this quote"],
    ["Preparing immutable quote…", "Preparing your quote…"],
    ["Human-added extra", "Added by you"],
    ["Captured scope", "From your description"],
    ["Rate provenance: ", "Price: "],
    ["entered by builder", "entered by you"],
    ['"not confirmed"', "not confirmed yet"],
    ["Human-added extras: ", "Extras you added: "],
    ["Download runtime PDF", "Download quote PDF"],
    ["builder-attested claim", "recorded by you, not confirmed by the customer"],
    ["Previewing immutable quote version ${data.view.documentVersion} for ${recipient}.", "Showing quote version ${data.view.documentVersion} for ${recipient}."],
    ["Practice job started with its immutable accepted baseline and cap snapshot.", "Practice job started. The agreed quote and its price limit are saved."],
    ["Practice job started with its immutable accepted baseline and activation terms.", "Practice job started. The agreed quote and its terms are saved."],
    ["Live · baseline frozen", "Job started · agreed quote saved"],
  ],
  "job-parties.tsx": [
    ["The supplied fictional underway job can be imported with these saved parties. Its £1,000.00 baseline is builder-attested; it creates no historic billing.", "You can bring in the practice job that's already under way, using these saved details. Its £1,000.00 starting value is the figure you gave; it creates no past bills."],
    ["Import the fictional underway job", "Bring in the practice job already under way"],
  ],
  "job-value.tsx": [
    ["This page does not guess ROI or add approved extras to invoice totals. Every outcome below links to its persisted source.", "This page does not guess what the job earned you, and does not add approved extras to invoice totals. Each result below links to where it was saved."],
  ],
  "job-variations.tsx": [
    ["Scope lineage", "Which work does this change?"],
    ["New work — create linked ID", ">New work<"],
    ["Change accepted scope — retain ID", "Change work already agreed"],
    ["Approved immutable commercial fact", "Approved and saved"],
  ],
  "voice-journey.tsx": [
    ["Preview immutable quote", "Preview this quote"],
    ["builder-attested practice acceptance", "practice acceptance recorded by you"],
  ],
};

describe("plain job wording", () => {
  for (const [file, replacements] of Object.entries(wording)) {
    const directory = file === "voice-journey.tsx" ? "app/practice-company/walkthrough" : "app/ui";
    const source = readFileSync(resolve(directory, file), "utf8");

    for (const [oldText, newText] of replacements) {
      it(`${file} uses ${newText}`, () => {
        expect(source).not.toContain(oldText);
        expect(source).toContain(newText);
      });
    }
  }
});
