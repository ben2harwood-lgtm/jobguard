import { describe, expect, it } from "vitest";
import { allocateSubscriptionDay, allocateSubscriptionPennies, disposeSubscriptionCorrections } from "./subscription-allocation.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const jobs = Array.from({length: 14}, (_, n) => ({tenantId: id(1), jobId: id(100+n), customerId: id(200+n), siteId: id(300+n), small: n === 0}));
const input = {version:"subscription-allocation-day.v1",date:"2028-03-01",plan:"Builder",sourceRevision:1,jobs};
describe("subscription attribution", () => {
  it("one place survives representative-job changes", () => {
    const first = allocateSubscriptionDay({...input,jobs:[jobs[0]]}).places[0]!;
    const next = allocateSubscriptionDay({...input,sourceRevision:2,jobs:[{...jobs[0],jobId:id(500)}]}).places[0]!;
    expect(next.placeKey).toBe(first.placeKey);
    expect(next.representativeJobId).not.toBe(first.representativeJobId);
  });
  it("permutation preserves allowance grace lines and hashes", async () => {
    const cryptoModule = "node:crypto";
    const { createHash } = await import(cryptoModule) as {createHash(algorithm:string): {update(value:string): {digest(encoding:string): string}}};
    const a = allocateSubscriptionDay(input), b = allocateSubscriptionDay({...input,jobs:[...jobs].reverse()});
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect(hash(a)).toBe(hash(b));
    for (let shift = 1; shift < jobs.length; shift++) {
      const permuted = [...jobs.slice(shift), ...jobs.slice(0, shift)];
      expect(hash(allocateSubscriptionDay({...input,jobs:permuted}))).toBe(hash(a));
    }
    expect(a.places.filter(p => p.attribution === "grace")).toHaveLength(1);
    expect(a.places.filter(p => p.attribution === "paid_extra")).toHaveLength(5);
  });
  it("equal remainders use canonical line keys", () => {
    expect(allocateSubscriptionPennies({lines:[{lineKey:"b",numeratorPence:"1"},{lineKey:"a",numeratorPence:"1"}],denominatorDays:2,targetPence:1})).toEqual([{lineKey:"a",pence:1},{lineKey:"b",pence:0}]);
  });
  it("allocation rejects arbitrary targets duplicate keys and foreign-company mixtures", () => {
    expect(() => allocateSubscriptionPennies({lines:[{lineKey:"a",numeratorPence:"1"}],denominatorDays:2,targetPence:1})).toThrow();
    expect(() => allocateSubscriptionPennies({lines:[{lineKey:"a",numeratorPence:"1"},{lineKey:"a",numeratorPence:"1"}],denominatorDays:2,targetPence:1})).toThrow();
    expect(() => allocateSubscriptionDay({...input,jobs:[jobs[0],{...jobs[1],tenantId:id(2)}]})).toThrow();
  });
  it("correction caps preserve every positive penny regardless of source order", () => {
    for (let principal = 0; principal <= 4900; principal += 49) {
      const corrections = [{correctionId:id(1),pence:150},{correctionId:id(2),pence:5000},{correctionId:id(3),pence:-100}];
      const result = disposeSubscriptionCorrections({principalPence:principal,maximumPence:4900,corrections});
      expect(result).toEqual(disposeSubscriptionCorrections({principalPence:principal,maximumPence:4900,corrections:[...corrections].reverse()}));
      expect(result.issuedPence).toBeLessThanOrEqual(4900);
      for (const d of result.dispositions.filter(d => d.fullPence > 0))
        expect(d.appliedPence + d.uncollectedPence).toBe(d.fullPence);
    }
  });
  it("late corrections share the maximum and retain excess", () => {
    expect(disposeSubscriptionCorrections({principalPence:4800,maximumPence:4900,corrections:[{correctionId:id(1),pence:300}]})).toEqual({
      issuedPence:4900, dispositions:[{correctionId:id(1),fullPence:300,appliedPence:100,uncollectedPence:200,requiresAlert:true,negativeHeld:false}],
    });
  });
  it("negative corrections create no refund or carry-forward", () => {
    expect(disposeSubscriptionCorrections({principalPence:4800,maximumPence:4900,corrections:[{correctionId:id(1),pence:-300}]})).toEqual({
      issuedPence:4800, dispositions:[{correctionId:id(1),fullPence:-300,appliedPence:0,uncollectedPence:0,requiresAlert:false,negativeHeld:true}],
    });
  });
});

it('SB-20: A period exceeds its monthly maximum', () => {
 const correctionId = id(1);
 const fitting = disposeSubscriptionCorrections({ principalPence: 4800, maximumPence: 4900, corrections: [{ correctionId, pence: 100 }] });
 expect(fitting.issuedPence).toBe(4900);
 expect(fitting.dispositions[0]).toMatchObject({ appliedPence: 100, uncollectedPence: 0, requiresAlert: false });
 const excess = disposeSubscriptionCorrections({ principalPence: 4800, maximumPence: 4900, corrections: [{ correctionId, pence: 101 }] });
 expect(excess.issuedPence).toBe(4900);
 expect(excess.dispositions[0]).toMatchObject({ appliedPence: 100, uncollectedPence: 1, requiresAlert: true });
});
