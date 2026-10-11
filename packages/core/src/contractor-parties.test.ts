import { describe, expect, it } from "vitest";
import { contractorCustomerLinkV1, contractorPartyImportV1, contractorPartyImportBoundaryV1, residentContactV1, noResidentReasons, contractorPartyAuditPayloadV1, contractorPartyAuditPayload } from "./contractor-parties.js";
const id = "11111111-1111-4111-8111-111111111111";
const link = { version: "contractor-customer-link.v1", environment: "synthetic_demo", commandId: id, customerRevisionId: id };
const binding = { version: "contractor-party-import.v1", environment: "synthetic_demo", commandId: id, jobId: id, workOrderId: id, expectedJobRevision: 0, clientId: id, contractId: id, siteRevisionId: id, resident: { kind: "contact", contact: { version: "resident-contact.v1", name: "Fictional Resident", email: "resident@example.invalid" } } };
describe("CH-3b strict boundaries", () => {
  it("requires a name and phone or email, trims text, and accepts both", () => {
    expect(residentContactV1.parse({ version: "resident-contact.v1", name: " Fictional Resident ", phone: "00000000000" }).name).toBe("Fictional Resident");
    expect(residentContactV1.safeParse(binding.resident.contact).success).toBe(true);
    for (const raw of [{ version: "resident-contact.v1", name: "Name" }, { ...binding.resident.contact, name: "  " }, { ...binding.resident.contact, email: "bad" }, { ...binding.resident.contact, phone: " " }, { ...binding.resident.contact, email: "real@example.org" }, { ...binding.resident.contact, email: "resident@example.INVALID" }]) expect(residentContactV1.safeParse(raw).success).toBe(false);
  });
  it("accepts exactly the closed no-resident reasons", () => {
    expect(noResidentReasons).toEqual(["void_property", "communal_area", "client_withheld"]);
    for (const reason of noResidentReasons) expect(contractorPartyImportV1.safeParse({ ...binding, resident: { kind: "none", reason } }).success).toBe(true);
    for (const resident of [null, { kind: "none", reason: "unknown" }, { kind: "contact", contact: binding.resident.contact, reason: "void_property" }]) expect(contractorPartyImportV1.safeParse({ ...binding, resident }).success).toBe(false);
  });
  it("requires every party and rejects browser authority at every nesting level", () => {
    expect(contractorPartyImportV1.safeParse(binding).success).toBe(true);
    expect(contractorCustomerLinkV1.safeParse(link).success).toBe(true);
    for (const key of ["clientId", "contractId", "siteRevisionId", "resident"]) expect(contractorPartyImportV1.safeParse({ ...binding, [key]: undefined }).success).toBe(false);
    for (const key of ["tenantId", "role", "provenance", "isIndividual"]) {
      expect(contractorPartyImportV1.safeParse({ ...binding, [key]: id }).success).toBe(false);
      expect(contractorCustomerLinkV1.safeParse({ ...link, [key]: id }).success).toBe(false);
      expect(residentContactV1.safeParse({ ...binding.resident.contact, [key]: id }).success).toBe(false);
    }
  });
  it("permits only explicit identifier/hash audit payloads for both effects", () => {
    for (const action of ["customer_linked", "bound"] as const) {
      const payload = contractorPartyAuditPayload(action, id, id, "a".repeat(64));
      expect(contractorPartyAuditPayloadV1.safeParse(payload).success).toBe(true);
      for (const field of ["name", "phone", "email", "resident", "contact"]) {
        expect(contractorPartyAuditPayloadV1.safeParse({ ...payload, [field]: "secret" }).success).toBe(false);
        expect(contractorPartyAuditPayloadV1.safeParse({ ...payload, references: { ...payload.references, [field]: "secret" } }).success).toBe(false);
      }
    }
  });
});

describe("CH-3b import-entry boundary (the routine, not the schema, refuses a missing party)", () => {
  it("is the strict schema plus nullable parties: complete imports parse identically", () => {
    expect(contractorPartyImportBoundaryV1.parse(binding)).toEqual(contractorPartyImportV1.parse(binding));
    for (const reason of noResidentReasons) expect(contractorPartyImportBoundaryV1.safeParse({ ...binding, resident: { kind: "none", reason } }).success).toBe(true);
  });
  it("lets an absent or null party through so the routine can raise CONTRACTOR_PARTIES_REQUIRED", () => {
    for (const key of ["clientId", "contractId", "siteRevisionId", "resident"]) {
      expect(contractorPartyImportBoundaryV1.safeParse({ ...binding, [key]: null }).success).toBe(true);
      expect(contractorPartyImportBoundaryV1.safeParse({ ...binding, [key]: undefined }).success).toBe(true);
    }
    const base = { version: "resident-contact.v1" };
    for (const resident of [{ kind: "contact", contact: null }, { kind: "contact" }, { kind: "none", reason: null }, { kind: "none" }, { kind: "contact", contact: { ...base, name: "Fictional Resident" } }, { kind: "contact", contact: { ...base, phone: "00000000000" } }]) {
      expect(contractorPartyImportBoundaryV1.safeParse({ ...binding, resident }).success).toBe(true);
      expect(contractorPartyImportV1.safeParse({ ...binding, resident }).success).toBe(false);
    }
  });
  it("still refuses malformed values and browser authority at every level", () => {
    const base = { version: "resident-contact.v1", name: "Fictional Resident" };
    for (const resident of [{ kind: "none", reason: "unknown" }, { kind: "contact", contact: { ...base, email: "bad" } }, { kind: "contact", contact: { ...base, phone: " " } }, { kind: "contact", contact: { ...base, email: "real@example.org" } }, { kind: "contact", contact: { ...base, phone: "00000000000", role: "owner" } }, { kind: "other" }]) {
      expect(contractorPartyImportBoundaryV1.safeParse({ ...binding, resident }).success).toBe(false);
    }
    for (const key of ["tenantId", "role", "provenance", "isIndividual"]) expect(contractorPartyImportBoundaryV1.safeParse({ ...binding, [key]: id }).success).toBe(false);
    for (const key of ["clientId", "contractId", "siteRevisionId"]) expect(contractorPartyImportBoundaryV1.safeParse({ ...binding, [key]: "not-a-uuid" }).success).toBe(false);
  });
  it.each([
    { version: "resident-contact.v1", name: null, phone: "00000000000" },
    { version: "resident-contact.v1", name: "Fictional Resident", phone: null },
    { version: "resident-contact.v1", name: "Fictional Resident", phone: null, email: null },
    { version: "resident-contact.v1", name: "Fictional Resident", phone: null, email: "resident@example.invalid" },
  ])("passes null contact fields to the routine while the strict schema refuses them: %j", contact => {
    const input = { ...binding, resident: { kind: "contact", contact } };
    expect(contractorPartyImportBoundaryV1.parse(input)).toEqual(input);
    expect(contractorPartyImportV1.safeParse(input).success).toBe(false);
  });
});
