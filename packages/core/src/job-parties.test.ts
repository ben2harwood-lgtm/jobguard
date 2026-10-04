import { describe, expect, it } from "vitest";
import { customerV1, isIndividual, jobPartiesCommandV1, siteMatchKey, siteV1, ukPostcodeV1 } from "./job-parties.js";
const site = { version: "site.v1", addressLines: ["14 Fictional Street"], town: "London", postcode: "sw1a1aa" };
describe("customer.v1, site.v1 and job-parties.v1", () => {
  it("normalizes UK postcodes and rejects malformed postcodes, UPRNs and types", () => {
    for (const postcode of ["sw1a1aa", "SW1A  1AA", " sw1a 1aa "]) expect(ukPostcodeV1.parse(postcode)).toBe("SW1A 1AA");
    for (const postcode of ["N1 1AA", "M1 1AE", "B33 8TH", "CR2 6XH", "DN55 1PT", "GIR 0AA", "EC1A 1BB", "W1A 0AX"]) expect(ukPostcodeV1.safeParse(postcode).success).toBe(true);
    for (const postcode of ["fake", "N1AA", "A1AA", "SW1A 1A", "ZZ1 1ZZ", "SW1A 1CI", "SW1A1AA123"]) expect(ukPostcodeV1.safeParse(postcode).success).toBe(false);
    expect(siteV1.safeParse({ ...site, uprn: "12-34" }).success).toBe(false);
    expect(customerV1.safeParse({ version: "customer.v1", name: "Fixture", type: "homeowner" }).success).toBe(false);
  });
  it("derives isIndividual and discards client authority fields", () => {
    const customer = customerV1.parse({ version: "customer.v1", name: "Fixture", type: "business", isIndividual: true, tenantId: "forged", provenance: "work_order_import" });
    expect(customer).toEqual({ version: "customer.v1", name: "Fixture", type: "business" }); expect(isIndividual(customer)).toBe(false);
    expect(isIndividual({ type: "person" })).toBe(true);
  });
  it("keys normalized addresses and UPRNs deterministically, preserving flats and ambiguity", () => {
    expect(siteMatchKey(site)).toBe(siteMatchKey({ ...site, postcode: "SW1A 1AA", addressLines: [" 14 fictional street "] }));
    expect(siteMatchKey({ ...site, unit: "Flat 1" })).not.toBe(siteMatchKey({ ...site, unit: "Flat 2" }));
    expect(siteMatchKey({ ...site, unit: "Flat 1" })).not.toBe(siteMatchKey(site));
    expect(siteMatchKey({ ...site, uprn: "00123" })).toBe(siteMatchKey({ ...site, uprn: "123", addressLines: ["A corrected spelling"] }));
    expect(siteMatchKey({ ...site, uprn: "123", unit: "1" })).not.toBe(siteMatchKey({ ...site, uprn: "123", unit: "2" }));
    expect(siteMatchKey({ ...site, addressLines: ["14 Fictional St"] })).not.toBe(siteMatchKey(site));
  });
  it("validates versioned command inputs without accepting provenance or tenant authority", () => {
    const result = jobPartiesCommandV1.parse({ version: "job-parties-command.v1", action: "create_customer", commandId: "11111111-1111-4111-8111-111111111111", customer: { version: "customer.v1", name: "Fixture", type: "person" }, tenantId: "wrong", provenance: "work_order_import" });
    expect(result).not.toHaveProperty("tenantId"); expect(result).not.toHaveProperty("provenance");
  });
});
