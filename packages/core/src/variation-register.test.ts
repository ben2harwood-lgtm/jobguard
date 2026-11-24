import { describe, expect, it } from "vitest";
import { buildVariationRegisterV1, formatRegisterPence, latestClosedRegisterWeekV1, registerWeekWindowV1, renderVariationRegisterPdf, variationRegisterPdfBlocks,
  VariationRegisterError, type RegisterSource } from "./variation-register.js";

const jobA = "11111111-1111-4111-8111-111111111111", jobB = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const extra = (n: number, over: Partial<RegisterSource> & { amount?: string | null; pricedAt?: string } = {}): RegisterSource => {
  const { amount = "10000", pricedAt = "2026-11-18T10:00:00.000Z", ...rest } = over;
  return { jobId: jobA, jobTitle: "Fictional kitchen", variationId: id(n), createdAt: "2026-11-01T09:00:00.000Z", description: `Fictional extra ${n}`,
    revision: amount === null ? null : { id: id(100 + n), number: 1, description: `Fictional extra ${n}`, signedDeltaPence: amount, createdAt: pricedAt },
    approvedAt: null, rejectedAt: null, ...rest };
};
const friday = "2026-11-20", after = new Date("2026-11-21T09:00:00.000Z");

describe("register week (closes Friday 18:00 UK time)", () => {
  it("runs Friday 18:00 to Friday 18:00 in winter and summer", () => {
    expect(registerWeekWindowV1("2026-11-20")).toEqual({ friday: "2026-11-20", opensAt: "2026-11-13T18:00:00.000Z", closesAt: "2026-11-20T18:00:00.000Z" });
    expect(registerWeekWindowV1("2026-07-03")).toEqual({ friday: "2026-07-03", opensAt: "2026-06-26T17:00:00.000Z", closesAt: "2026-07-03T17:00:00.000Z" });
  });
  it("spans the clock changes: 167 hours in March, 169 in October", () => {
    const march = registerWeekWindowV1("2026-04-03"), october = registerWeekWindowV1("2026-10-30");
    expect(march).toMatchObject({ opensAt: "2026-03-27T18:00:00.000Z", closesAt: "2026-04-03T17:00:00.000Z" });
    expect(october).toMatchObject({ opensAt: "2026-10-23T17:00:00.000Z", closesAt: "2026-10-30T18:00:00.000Z" });
    expect((Date.parse(march.closesAt) - Date.parse(march.opensAt)) / 3_600_000).toBe(167);
    expect((Date.parse(october.closesAt) - Date.parse(october.opensAt)) / 3_600_000).toBe(169);
  });
  it("defaults to the latest closed week", () => {
    expect(latestClosedRegisterWeekV1(new Date("2026-11-20T17:59:59.999Z"))).toBe("2026-11-13");
    expect(latestClosedRegisterWeekV1(new Date("2026-11-20T18:00:00.000Z"))).toBe("2026-11-20");
    expect(latestClosedRegisterWeekV1(new Date("2026-11-24T12:00:00.000Z"))).toBe("2026-11-20");
    expect(latestClosedRegisterWeekV1(new Date("2026-07-03T17:00:00.000Z"))).toBe("2026-07-03");
    expect(latestClosedRegisterWeekV1(new Date("2026-07-03T16:59:59.999Z"))).toBe("2026-06-26");
  });
  it("refuses non-Fridays, malformed dates and an open week", () => {
    for (const value of ["2026-11-19", "2026-02-30", "2026-11-2", "latest"]) expect(() => registerWeekWindowV1(value)).toThrow(VariationRegisterError);
    expect(() => buildVariationRegisterV1(friday, new Date("2026-11-20T17:59:59.999Z"), [])).toThrow("REGISTER_WEEK_NOT_CLOSED");
  });
});

describe("register states and totals (exact pence)", () => {
  const sources = [
    extra(1, { approvedAt: "2026-11-19T12:00:00.000Z" }),
    extra(2, { amount: "-2550", approvedAt: "2026-11-02T12:00:00.000Z", pricedAt: "2026-11-02T10:00:00.000Z" }),
    extra(3, { amount: "33333" }),
    extra(4, { amount: "1205", rejectedAt: "2026-11-14T08:00:00.000Z", pricedAt: "2026-11-03T10:00:00.000Z" }),
    extra(5, { amount: null }),
    extra(6, { jobId: jobB, jobTitle: "Fictional bathroom", amount: "900000000000001", approvedAt: "2026-11-10T12:00:00.000Z", pricedAt: "2026-11-09T10:00:00.000Z" }),
  ];
  const register = buildVariationRegisterV1(friday, after, sources);
  it("maps each extra to its state at the close and flags this week's activity", () => {
    const a = register.jobs.find(job => job.jobId === jobA)!;
    expect(a.extras.map(x => [x.state, x.signedDeltaPence, x.thisWeek])).toEqual([
      ["approved", "10000", true], ["approved", "-2550", false], ["pending", "33333", true], ["rejected", "1205", true], ["draft", null, false]]);
    expect(register.jobs.map(job => job.title)).toEqual(["Fictional bathroom", "Fictional kitchen"]);
  });
  it("sums every total from its lines in BigInt, including negative omissions and values beyond 2^53", () => {
    expect(register.jobs.find(job => job.jobId === jobA)!.totals).toEqual({ approvedPence: "7450", pendingPence: "33333", rejectedPence: "1205" });
    expect(register.totals).toEqual({ approvedPence: "900000000007451", pendingPence: "33333", rejectedPence: "1205" });
    for (const key of ["approvedPence", "pendingPence", "rejectedPence"] as const) {
      expect(register.jobs.reduce((total, job) => total + BigInt(job.totals[key]), 0n)).toBe(BigInt(register.totals[key]));
      for (const job of register.jobs) expect(job.extras.filter(x => `${x.state}Pence` === key && x.signedDeltaPence).reduce((t, x) => t + BigInt(x.signedDeltaPence!), 0n)).toBe(BigInt(job.totals[key]));
    }
  });
  it("formats pence exactly", () => {
    expect(formatRegisterPence("0")).toBe("GBP 0.00");
    expect(formatRegisterPence("-2550")).toBe("-GBP 25.50");
    expect(formatRegisterPence("123456705")).toBe("GBP 1,234,567.05");
    expect(formatRegisterPence("900000000007451")).toBe("GBP 9,000,000,000,074.51");
    expect(() => formatRegisterPence("1.5")).toThrow();
  });
  it("hashes the body: stable under input order and read time, changed by any edit", () => {
    const again = buildVariationRegisterV1(friday, new Date("2026-12-25T00:00:00.000Z"), [...sources].reverse());
    expect(again.readHash).toBe(register.readHash); expect(again.readAt).not.toBe(register.readAt);
    expect(buildVariationRegisterV1(friday, after, [...sources.slice(1), extra(1, { amount: "10001", approvedAt: "2026-11-19T12:00:00.000Z" })]).readHash).not.toBe(register.readHash);
  });
  it("refuses rows recorded after the close and contradictory rows", () => {
    expect(() => buildVariationRegisterV1(friday, after, [extra(1, { pricedAt: "2026-11-20T18:00:00.000Z" })])).toThrow("REGISTER_SOURCE_AFTER_CLOSE");
    expect(() => buildVariationRegisterV1(friday, after, [extra(1, { approvedAt: "2026-11-19T12:00:00.000Z", rejectedAt: "2026-11-19T12:00:00.000Z" })])).toThrow();
    expect(() => buildVariationRegisterV1(friday, after, [extra(1, { amount: null, approvedAt: "2026-11-19T12:00:00.000Z" })])).toThrow();
  });
  it("is empty but valid with no extras", () => {
    expect(buildVariationRegisterV1(friday, after, [])).toMatchObject({ jobs: [], totals: { approvedPence: "0", pendingPence: "0", rejectedPence: "0" } });
  });
});

describe("register PDF", () => {
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
  const register = buildVariationRegisterV1(friday, after, [extra(1, { description: "Fix (left) wall \\ beam", revision: { id: id(101), number: 2, description: "Fix (left) wall \\ beam — café", signedDeltaPence: "12345", createdAt: "2026-11-18T10:00:00.000Z" } })]);
  it("is byte-stable for the same read and carries the banner, week, read time and hash on every page", () => {
    const bytes = renderVariationRegisterPdf(register);
    expect(text(bytes)).toBe(text(renderVariationRegisterPdf(register)));
    expect(text(bytes).startsWith("%PDF-1.4\n")).toBe(true); expect(text(bytes).endsWith("%%EOF")).toBe(true);
    for (const needle of ["PRACTICE SANDBOX", "Week 2026-11-20: 2026-11-13T18:00:00.000Z to 2026-11-20T18:00:00.000Z", `Generated ${register.readAt}`, `Read hash ${register.readHash}`])
      expect(text(bytes).split(needle).length - 1).toBe(2);
    expect(text(bytes)).toContain("/Count 2");
  });
  it("escapes brackets and backslashes and keeps the text ASCII", () => {
    const pdf = text(renderVariationRegisterPdf(register));
    expect(pdf).toContain("* Fix \\(left\\) wall \\\\ beam ? cafe");
    expect(/[^\x09\x0a\x0d\x20-\x7e]/u.test(pdf)).toBe(false);
  });
  it("keeps every character of a long description across wrapped lines", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}abcdefghijklmnop`.slice(0, 8 + (i % 9))).join(" ");
    const blocks = variationRegisterPdfBlocks(buildVariationRegisterV1(friday, after, [extra(1, { revision: { id: id(101), number: 1, description: long, signedDeltaPence: "1", createdAt: "2026-11-01T10:00:00.000Z" } })]));
    const lines = blocks[1]!.slice(3, blocks[1]!.findIndex(line => line.trim().startsWith("Waiting for customer")));
    expect(lines.every(line => line.length <= 88)).toBe(true);
    expect(lines.map(line => line.slice(0, 70).trim()).join(" ")).toBe(long);
  });
  it("right-aligns amounts and paginates long jobs, one job per page start", () => {
    const many = buildVariationRegisterV1(friday, after, [
      ...Array.from({ length: 30 }, (_, i) => extra(i + 1)), extra(99, { jobId: jobB, jobTitle: "Fictional bathroom" })]);
    const blocks = variationRegisterPdfBlocks(many);
    expect(blocks).toHaveLength(3);
    const line = blocks[2]!.find(value => value.includes("Fictional extra 1 "))!;
    expect(line).toHaveLength(88); expect(line.endsWith("GBP 100.00")).toBe(true);
    // Cover 1 page, bathroom 1 page, kitchen 30 extras x 2 lines + headers = 2 pages.
    expect(text(renderVariationRegisterPdf(many))).toContain("/Count 4");
    expect(text(renderVariationRegisterPdf(many))).toContain("Page 4 of 4");
  });
});
