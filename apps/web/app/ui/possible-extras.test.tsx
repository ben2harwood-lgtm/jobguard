import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PossibleExtraDetail, possibleExtraDetailV1, possibleExtraChoicesV1, possibleExtrasPageV1, promptResolutionBody } from "./possible-extras";
vi.stubGlobal("React", React);
const promptId = "00000000-0000-4000-8000-000000000001", jobId = "00000000-0000-4000-8000-000000000002";
const detail = possibleExtraDetailV1.parse({ id: promptId, jobId, promptHash: "a".repeat(64), rule: "a", ruleVersion: "work.v1", surfacedAt: "2026-11-03T12:00:00Z", resolution: null, reason: null, variationId: null,
 citations: [{ kind: "completion_photo", sourceId: promptId, sha256: "b".repeat(64), evidenceId: promptId, objectVersion: "immutable-v1", locator: { kind: "photo_tag", tag: "Fictional repair" } }] });
const render = (patch: Partial<Parameters<typeof PossibleExtraDetail>[0]> = {}) => renderToStaticMarkup(createElement(PossibleExtraDetail, { detail, choices: [], busy: false, ambiguous: false, resolve: () => undefined, ...patch }));
it("shows cited immutable sources, explicit confirmation and dismissal without financial or shadow projections", () => {
 const html = render();
 for (const label of ["Fictional repair", "immutable-v1", "Confirm possible extra", "Reason for dismissal", "Dismiss possible extra", "unpriced"]) expect(html).toContain(label);
 expect(html).not.toMatch(/£|shadow|fee|pricePence/);
});
it("has no working confirm where a work identity or unresolved match is needed, retaining dismissal", () => {
 for (const patch of [{ detail: { ...detail, rule: "c" as const } }, { detail: { ...detail, rule: "d" as const } }, { ambiguous: true }]) {
  const html = render(patch); expect(html).not.toContain("Confirm possible extra"); expect(html).toContain("cannot be confirmed from this screen yet"); expect(html).toContain("Dismiss possible extra");
 }
});
it("offers only supplied authorised extra choices without selecting a match", () => {
 const extraId = crypto.randomUUID();
 const html = render({ choices: [{ jobId, extraId, description: "Fictional existing extra" }] });
 expect(html).toContain(extraId); expect(html).toContain("server verifies the match"); expect(html).toContain('value="" selected=""');
});
it("shows no resolution controls when access is unavailable or a resolution already exists", () => {
 expect(render({ resolve: undefined } as unknown as Partial<Parameters<typeof PossibleExtraDetail>[0]>)).not.toContain("Dismiss possible extra");
 const html = render({ detail: { ...detail, resolution: "coalesced" } });
 expect(html).toContain("Recorded: coalesced"); expect(html).not.toContain("Confirm possible extra"); expect(html).not.toContain("Dismiss possible extra");
});
it("disables both mutations while busy and binds commands to the exact prompt hash", () => {
 const html = render({ busy: true }); expect(html).toContain('disabled="">Confirm possible extra'); expect(html).toContain('disabled="">Dismiss possible extra');
 const commandId = crypto.randomUUID(), existingExtraId = crypto.randomUUID();
 expect(promptResolutionBody(detail, "confirm", commandId, "ignored", { existingExtraId })).toEqual({ version: "confirm-prompt.v1", commandId, promptHash: detail.promptHash, existingExtraId });
 expect(promptResolutionBody(detail, "dismiss", commandId, "  Duplicate  ", { existingExtraId })).toEqual({ version: "dismiss-prompt.v1", commandId, promptHash: detail.promptHash, reason: "Duplicate" });
});
it("rejects malformed projections and ignores unrelated financial fields", () => {
 expect(possibleExtrasPageV1.safeParse({ items: [{ ...detail, promptHash: "stale" }], nextCursor: null }).success).toBe(false);
 expect(possibleExtraDetailV1.safeParse({ ...detail, citations: [{}] }).success).toBe(false);
 expect(possibleExtraChoicesV1.parse({ version: "northside-extras.v1", extras: [{ extraId: promptId, jobId, description: "Fictional", netPence: 100 }] }).extras[0]).not.toHaveProperty("netPence");
});

it("only submits explicit work and instructed-line choices, never inferring them from citations", () => {
 const selection = { confirmedWorkIdentity: "FIT-LOCK", excessScopeItemId: crypto.randomUUID(), existingExtraId: crypto.randomUUID() };
 expect(promptResolutionBody(detail, "confirm", promptId, "", selection)).toEqual({ version: "confirm-prompt.v1", commandId: promptId, promptHash: detail.promptHash, ...selection });
 const html = render({ detail: { ...detail, rule: "b" }, lines: [{ position: 0, scopeItemId: promptId, clientLineReference: null, sorCode: "REPAIR-DOOR", description: "Fictional instructed door", unit: "each", quantity: "1" }] });
 expect(html).toContain("Instructed line (the server verifies the excess)"); expect(html).toContain("Fictional instructed door"); expect(html).toContain('value="" selected=""');
});
it("offers catalogue search for visit prompts and keeps confirmation absent before an explicit work choice", () => {
 const html = render({ detail: { ...detail, rule: "c" }, searchWork: async () => [] });
 expect(html).toContain("Search work catalogue"); expect(html).toContain("Search work identities"); expect(html).not.toContain("Confirm possible extra"); expect(html).toContain("Dismiss possible extra");
});
