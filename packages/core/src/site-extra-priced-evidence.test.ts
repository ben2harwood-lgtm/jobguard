import { describe, expect, it } from "vitest";
import { logSorSiteExtraV1, parseLogSorSiteExtra, parseSorSiteExtraInput } from "./site-extra-pricing.js";

const body = () => ({ version: "log-sor-site-extra.v2", workStatus: "finished", commandId: crypto.randomUUID(), sorCode: "CLEAR-GUTTER", quantity: "2", note: "Fictional note", description: "Fictional extra", photoEvidenceId: crypto.randomUUID(), residentConfirmation: { shownContentSha256: "a".repeat(64) }, siteVisitId: crypto.randomUUID() });
describe("ENT-3 priced evidence boundary", () => {
  it.each(["photoEvidenceId", "residentConfirmation", "description"])("requires %s on v2", field => {
    const raw: Record<string, unknown> = body(); delete raw[field];
    expect(() => parseLogSorSiteExtra(raw)).toThrow("INVALID_COMMAND");
    expect(() => parseSorSiteExtraInput({ ...raw, jobId: crypto.randomUUID() })).toThrow("INVALID_COMMAND");
  });
  it.each(["tenantId", "actor", "role", "track", "origin", "serverRecordedAt", "netPence"])("refuses forged %s", field => {
    expect(() => parseLogSorSiteExtra({ ...body(), [field]: "forged" })).toThrow("INVALID_COMMAND");
  });
  it("keeps all evidence and visit fields through both boundaries", () => {
    const raw = body();
    expect(parseLogSorSiteExtra(raw)).toEqual(raw);
    expect(parseSorSiteExtraInput({ ...raw, jobId: raw.commandId })).toEqual({ ...raw, jobId: raw.commandId });
    expect(logSorSiteExtraV1.safeParse({ ...raw, version: "log-sor-site-extra.v1" }).success).toBe(false);
  });
  it("preserves the v1 body and rejects evidence on v1", () => {
    const raw = { version: "log-sor-site-extra.v1", commandId: crypto.randomUUID(), sorCode: "CLEAR-GUTTER", quantity: "2", note: "Fictional note" };
    expect(parseLogSorSiteExtra(raw)).toEqual(raw);
    expect(() => parseLogSorSiteExtra({ ...raw, photoEvidenceId: crypto.randomUUID() })).toThrow("INVALID_COMMAND");
    expect(() => parseLogSorSiteExtra({ ...body(), quantity: "0" })).toThrow("INVALID_QUANTITY");
  });
});

it.each(["not_started", "under_way", "finished"])("accepts only the operative statement %s", workStatus => {
  expect(parseLogSorSiteExtra({ ...body(), workStatus })).toMatchObject({ workStatus });
});
it.each([undefined, null, "approved", "done", { status: "finished", pence: 1 }])("refuses invalid or absent work status %j", workStatus => {
  expect(() => parseLogSorSiteExtra({ ...body(), workStatus })).toThrow("INVALID_COMMAND");
  expect(() => parseSorSiteExtraInput({ ...body(), jobId: crypto.randomUUID(), workStatus })).toThrow("INVALID_COMMAND");
});
it.each(["tenant", "operativeMembershipId", "recordedAt", "price", "amount", "doneWithoutRequiredPreapproval", "workStartedAt"])("refuses statement metadata or effects %s", field => {
  expect(() => parseLogSorSiteExtra({ ...body(), [field]: "forged" })).toThrow("INVALID_COMMAND");
});
