import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FirmDetailsForm, FirmProfileLink, FirmTradingName } from "./firm-details";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], sets: [] as unknown[], effects: [] as Array<() => unknown> }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
 useState: (initial: unknown) => [hooks.values.length ? hooks.values.shift() : initial, (value: unknown) => hooks.sets.push(value)],
 useEffect: (effect: () => unknown) => hooks.effects.push(effect),
}));
vi.stubGlobal("React", React);
const profile = { version: "firm-profile.v1" as const, tradingName: "Fictional Oak Works", addressLines: ["12 Example Lane"], contactEmail: "oak@fictional.invalid", contactPhone: "" };
beforeEach(() => { vi.stubGlobal("React", React); hooks.values = []; hooks.sets = []; hooks.effects = []; });
afterEach(() => vi.unstubAllGlobals());
function form(canSave = true) {
 return FirmDetailsForm({ initial: { profile, canSave } });
}
// Invoke the actual form submit handler with the hook state retained above.
async function submit() {
 const tree = form();
 const children = tree.props.children as React.ReactElement[];
 const element = children.find(x => React.isValidElement(x) && x.type === "form")!;
 await (element.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> }).onSubmit({ preventDefault() {} });
 // The component intentionally uses a void event adapter; finish the fetch chain.
 await new Promise(resolve => setTimeout(resolve, 0));
}
it("renders the editable firm fields and owner save", () => {
 vi.stubGlobal("React", React);
 const html = renderToStaticMarkup(form());
 for (const label of ["Your firm details", "Trading name", "Address line 1", "Address line 2", "Address line 3", "Contact email", "Contact phone", "Save firm details"]) expect(html).toContain(label);
 expect(html).toContain("Fictional Oak Works"); expect(html).not.toContain("<fieldset disabled");
});
it("keeps another member read-only and provides a sign-in refusal", () => {
 vi.stubGlobal("React", React);
 expect(renderToStaticMarkup(form(false))).toContain("<fieldset disabled");
 expect(renderToStaticMarkup(form(false))).toContain("Only the company owner can save firm details.");
 expect(renderToStaticMarkup(FirmDetailsForm({ initial: null, refusal: "Sign in to your company to see firm details." }))).toContain("Sign in to your company");
});
it.each([401,403,400,503])("shows a definite refusal or uncertain result for HTTP %i without claiming a save", async status => {
 const fetch = vi.fn().mockResolvedValue({ ok: false, status }); vi.stubGlobal("fetch", fetch);
 await submit();
 expect(fetch).toHaveBeenCalledWith("/api/firm-profile", expect.objectContaining({ method: "POST" }));
 expect(hooks.sets.join(" ")).not.toContain("Firm details saved.");
 expect(hooks.sets.join(" ")).toMatch(/owner|Sign in|Check the firm|could not be confirmed/);
});
it("saves only the profile fields and reports the immutable quote rule", async () => {
 const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ profile, canSave: true }) }); vi.stubGlobal("fetch", fetch);
 await submit(); expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(profile);
 expect(hooks.sets.join(" ")).toContain("Already-issued quotes keep their original details.");
});
it("keeps the quote fallback name and hides the link until a signed-in profile response", () => {
 vi.stubGlobal("React", React);
 expect(renderToStaticMarkup(<FirmTradingName/>)).toBe("A Builder Ltd");
 expect(renderToStaticMarkup(<FirmProfileLink/>)).toBe("");
 hooks.values = [{ profile: null, canSave: true }];
 expect(renderToStaticMarkup(<FirmProfileLink/>)).toContain("Add your firm details");
 hooks.values = [{ profile, canSave: true }];
 expect(renderToStaticMarkup(<FirmProfileLink/>)).toContain("Your firm details");
});
it("uses the saved trading name after an authenticated read", async () => {
 vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ profile, canSave: true }) }));
 FirmTradingName(); hooks.effects[0]!();
 await new Promise(resolve => setTimeout(resolve, 0));
 expect(hooks.sets).toContain("Fictional Oak Works");
});

it("keeps practice firms on the sample name and disables their save handler", async () => {
 const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
 const tree = FirmDetailsForm({ initial: { profile: null, canSave: false, isPractice: true } });
 const html = renderToStaticMarkup(tree);
 expect(html).toContain("A Builder Ltd");
 expect(html).toContain("Practice firms use the sample name");
 expect(html).toContain("<fieldset disabled");
 expect(html).not.toContain("Only the company owner");
 const element = (tree.props.children as React.ReactElement[]).find(x => React.isValidElement(x) && x.type === "form")!;
 await (element.props as { onSubmit: (event: { preventDefault: () => void }) => void }).onSubmit({ preventDefault() {} });
 expect(fetch).not.toHaveBeenCalled();
});

it("lets an eligible practice owner save firm details while remaining a practice firm", async () => {
 const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ profile, canSave: true, isPractice: true }) });
 vi.stubGlobal("fetch", fetch);
 const tree = FirmDetailsForm({ initial: { profile, canSave: true, isPractice: true } });
 const html = renderToStaticMarkup(tree);
 expect(html).toContain("Save firm details");
 expect(html).not.toContain("<fieldset disabled");
 expect(html).not.toContain("Practice firms use the sample name");
 const element = (tree.props.children as React.ReactElement[]).find(x => React.isValidElement(x) && x.type === "form")!;
 (element.props as { onSubmit: (event: { preventDefault: () => void }) => void }).onSubmit({ preventDefault() {} });
 await new Promise(resolve => setTimeout(resolve, 0));
 expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(profile);
 expect(hooks.sets.join(" ")).toContain("Firm details saved.");
});
