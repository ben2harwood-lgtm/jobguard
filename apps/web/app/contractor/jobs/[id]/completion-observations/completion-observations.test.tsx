import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { completionObservationBodyV1 } from "@jobguard/core";
import { CompletionObservations, observationBody, sendObservation } from "./completion-observations";
vi.stubGlobal("React", React);
const source = { evidenceId: "00000000-0000-4000-8000-000000000001", sha256: "b".repeat(64), objectVersion: "immutable-version", mediaKind: "completion_photo" as const, photoTags: ["Fictional vent"], capturedAt: null };
const fields = { work: "FIT-VENT", tag: "Fictional vent", sourceText: "new vent", quote: "vent", start: "4", end: "8" };
const commandId = "00000000-0000-4000-8000-000000000002";
it("sends exact stored identity/hash/version and a human work identity, with no photo sourceText", () => {
 const body = observationBody(source, fields, commandId);
 expect(body).toEqual({ version: "completion-observation.v1", commandId, evidenceId: source.evidenceId, sha256: source.sha256, objectVersion: source.objectVersion, workIdentity: "FIT-VENT", locator: { kind: "photo_tag", tag: "Fictional vent" } });
 expect(completionObservationBodyV1.safeParse(body).success).toBe(true);
});
it("text requires the supplied source text, exact quote and explicit offsets without deriving them", () => {
 const body = observationBody({ ...source, mediaKind: "completion_note" }, fields, commandId);
 expect(body.sourceText).toBe("new vent"); expect(body.locator).toEqual({ kind: "text_span", quote: "vent", start: 4, end: 8 });
 const { sourceText: _text, ...missing } = body;
 expect(completionObservationBodyV1.safeParse(missing).success).toBe(false);
 for (const start of ["", "-1", "1.2"]) expect(() => observationBody({ ...source, mediaKind: "completion_note" }, { ...fields, start }, commandId)).toThrow();
});
it("keeps the exact command through an uncertain retry and displays a refusal without changing it", async () => {
 const body = observationBody(source, fields, commandId), before = structuredClone(body);
 const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network"))
  .mockResolvedValueOnce(new Response(JSON.stringify({ code: "PROMPT_SOURCE_INVALID" }), { status: 409 }));
 expect((await sendObservation("/observations", body, request)).uncertain).toBe(true);
 expect(await sendObservation("/observations", body, request)).toEqual({ uncertain: false, saved: false, message: "The server refused this evidence or its citation. Check your selection and exact text." });
 expect(request.mock.calls[0]).toEqual(request.mock.calls[1]); expect(body).toEqual(before);
});
it("uncertain or malformed success responses never claim success; valid server references do", async () => {
 const body = observationBody(source, fields, commandId);
 for (const response of [new Response("private", { status: 503 }), new Response("{}", { status: 201 }), new Response("{}", { status: 408 })]) {
  expect(await sendObservation("/observations", body, vi.fn().mockResolvedValue(response))).toMatchObject({ uncertain: true, saved: false });
 }
 expect(await sendObservation("/observations", body, vi.fn().mockResolvedValue(new Response(JSON.stringify({ observationId: commandId }), { status: 201 })))).toEqual({ uncertain: false, saved: true, message: `Observation recorded. Reference: ${commandId}` });
});
it("renders a labelled mobile form with a live status and 44px controls", () => {
 const html = renderToStaticMarkup(React.createElement(CompletionObservations, { jobId: commandId }));
 for (const text of ["Completion observations", "Completion evidence", "Work identity", 'role="status"', "min-height:44px"]) expect(html).toContain(text);
 expect(html).not.toMatch(/price|fee|storageKey/);
});

it("validates without normalising a stored object version before transport", () => {
 expect(observationBody({ ...source, objectVersion: " stored-version " }, fields, commandId).objectVersion).toBe(" stored-version ");
});
