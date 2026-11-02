import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { reference } from "./enterprise-fee-reference-fixtures.js";
const t = { w: { w: { p: { tenantId: randomUUID() } }, s: { jobId: randomUUID() } }, id: randomUUID() };
const exact = (n: number | string, denominator = "1") => ({ numerator: String(n), denominator });
it("the independent command-fixture manifests exercise the core reference derivation", () => {
  for (const [approved, billed, paid, fee] of [[15000,15000,15000,1500], [15000,20000,20000,1500], [15000,12000,12000,1200], [5,5,5,0], [15,15,15,2], [25,25,25,2]])
    expect(reference(t, [{ approved: approved!, billed: billed!, paid: exact(paid!) }]).cumulativeFee.pence).toBe(fee);
  expect(reference(t, [{ approved: 24000, billed: 24000, paid: exact("250000", "31") }]).cumulativeFee.pence).toBe(806);
  expect(reference(t, [{ approved: 15000, billed: 15000, paid: exact(15000), credit: 5000 }]).cumulativeFee.pence).toBe(1000);
  expect(reference(t, [{ approved: 15000, billed: 15000, paid: exact(15000) }], 8).cumulativeFee.pence).toBe(1200);
  const canonical = randomUUID(), duplicate = randomUUID();
  expect(reference(t, [{ id: canonical, approved: 15000, billed: 15000, paid: exact(15000) },
    { id: duplicate, duplicateOf: canonical, approved: 15000, billed: 15000, paid: exact(15000) }]).cumulativeFee.pence).toBe(1500);
  for (const kind of ["office_entry", "client_instruction"] as const) expect(reference(t, [{ approved: 50000, billed: 50000, paid: exact(50000), kind }]).cumulativeFee.pence).toBe(0);
});
