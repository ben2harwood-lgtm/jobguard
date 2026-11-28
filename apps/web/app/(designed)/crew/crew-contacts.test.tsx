import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrewPicker } from "../jobs/[id]/work/work-plan";
import { CREW_PATH, CrewAddForm, CrewSaveError, crewCommand, crewRefusal, crewSaved, loadCrew, resetCrewForTests, saveCrew,
  type CrewContact } from "./crew-contacts";
import { CrewList } from "./crew-screen";

const jordan: CrewContact = { crewId: "00000000-0000-4000-8000-000000000021", revision: 1, displayName: "Jordan Fictional",
  trade: "Electrician", phone: "07700900123", email: "jordan@crew.example.invalid" };
const sam: CrewContact = { ...jordan, crewId: "00000000-0000-4000-8000-000000000022", displayName: "Sam Fictional", trade: "Plasterer" };
const draft = { displayName: " Jordan Fictional ", trade: "Electrician", phone: "07700 900123", email: "" };
const request = vi.fn<typeof fetch>();

beforeEach(() => { resetCrewForTests(); request.mockReset(); vi.stubGlobal("fetch", request); vi.stubGlobal("React", React); });
afterEach(() => vi.unstubAllGlobals());

describe("V2-C3C-UI crew contacts", () => {
  it("the add form asks for name, trade, made-up phone and an optional .invalid email", () => {
    const html = renderToStaticMarkup(<CrewAddForm/>);
    for (const label of ["Name", "Trade", "Phone (made-up practice number)", "Email (optional, ends in .invalid)"]) {
      expect(html).toContain(label);
    }
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add to crew<\/button>/u);
    expect(html).not.toContain("<form");
  });

  it("sends crew-contact.v1 unchanged, and a retry of the same details keeps its commandId", async () => {
    expect(crewCommand(draft, { commandId: "c", crewId: "k" })).toEqual({ version: "crew-contact.v1", commandId: "c", crewId: "k",
      expectedRevision: 0, displayName: "Jordan Fictional", trade: "Electrician", phone: "07700 900123", email: null });
    const pending = { current: null as { payload: string; commandId: string; crewId: string } | null };
    request.mockResolvedValueOnce(Response.json({ code: "CREW_CONTACT_UNAVAILABLE" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json(jordan, { status: 201 }));
    await expect(saveCrew(draft, pending)).rejects.toBeInstanceOf(CrewSaveError);
    await saveCrew(draft, pending);
    const [first, second] = request.mock.calls.map(([url, init]) => ({ url, body: JSON.parse(String(init!.body)) }));
    expect(first!.url).toBe(CREW_PATH);
    expect(second!.body.commandId).toBe(first!.body.commandId);
    expect(second!.body.crewId).toBe(first!.body.crewId);
    expect(pending.current).toBeNull();
  });

  it("shows the CHECK's refusal of a real-looking phone or email in plain words", async () => {
    request.mockResolvedValueOnce(Response.json({ code: "CREW_CONTACT_INVALID" }, { status: 400 }));
    const refused = await saveCrew({ ...draft, phone: "07911123456", email: "jordan@gmail.com" }, { current: null })
      .then(() => "saved", (error: CrewSaveError) => error.message);
    expect(refused).toBe("CREW_CONTACT_INVALID");
    expect(crewRefusal(refused)).toBe("Check the details. The phone must be a made-up practice number, such as 07700 900123, " +
      "01632 960123 or 020 7946 0123, and an email must end in .invalid. Nothing was saved.");
    expect(crewRefusal("FORBIDDEN")).toContain("Only the signed-in builder can add crew");
    expect(crewRefusal(undefined)).toBe("The crew member could not be saved. Check your connection and try again.");
  });

  it("a saved contact is in the crew list and the work plan's picker at once, without a reload", async () => {
    request.mockResolvedValueOnce(Response.json({ crew: [sam] }));
    await loadCrew();
    expect(renderToStaticMarkup(<CrewPicker disabled={false}/>)).not.toContain("Jordan Fictional");
    request.mockResolvedValueOnce(Response.json(jordan, { status: 201 }));
    await saveCrew(draft, { current: null });
    expect(request).toHaveBeenCalledTimes(2);
    const picker = renderToStaticMarkup(<CrewPicker disabled={false}/>);
    expect(picker).toContain(`<option value="${jordan.crewId}">Jordan Fictional · Electrician</option>`);
    expect(picker.indexOf("Jordan Fictional")).toBeLessThan(picker.indexOf("Sam Fictional"));
    expect(picker).toContain("Add someone");
    const list = renderToStaticMarkup(<CrewList/>);
    expect(list).toContain("<strong>Jordan Fictional</strong><span>Electrician</span>");
    expect(list).not.toContain("07700900123");
    crewSaved({ ...jordan, revision: 2, trade: "Electrical" });
    const corrected = renderToStaticMarkup(<CrewList/>);
    expect(corrected.match(/<strong>Jordan Fictional<\/strong>/gu)).toHaveLength(1);
    expect(corrected).toContain("<strong>Jordan Fictional</strong><span>Electrical</span>");
  });

  it("the picker stays out of the form until the crew loads, so it never clears a crew assignment", () => {
    const html = renderToStaticMarkup(<CrewPicker assigneeRef={jordan.crewId} disabled={false}/>);
    expect(html).toMatch(/<select name="assigneeRef" disabled=""/u);
    crewSaved(sam);
    const loaded = renderToStaticMarkup(<CrewPicker assigneeRef={jordan.crewId} disabled={false}/>);
    expect(loaded).toContain(`<option value="${jordan.crewId}" selected="">Crew member assigned</option>`);
  });
});
