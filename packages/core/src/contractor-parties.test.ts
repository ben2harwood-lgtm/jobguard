import { describe, expect, it } from "vitest";
import { contractorCustomerLinkV1, contractorPartyImportV1, residentContactV1, noResidentReasons, contractorPartyAuditPayloadV1, contractorPartyAuditPayload } from "./contractor-parties.js";
const id = "11111111-1111-4111-8111-111111111111";
const link = { version: "contractor-customer-link.v1", environment: "synthetic_demo", commandId: id, customerRevisionId: id };
const binding = { version: "contractor-party-import.v1", environment: "synthetic_demo", commandId: id, jobId: id, workOrderId: id, expectedJobRevision: 0, clientId: id, contractId: id, siteRevisionId: id, resident: { kind: "contact", contact: { version: "resident-contact.v1", name: "Fictional Resident", email: "resident@example.invalid" } } };
describe("CH-3b strict boundaries", () => {
  it("requires a name and phone or email, trims text, and accepts both", () => {
    expect(residentContactV1.parse({ version: "resident-contact.v1", name: " Fictional Resident ", phone: "00000000000" }).name).toBe("Fictional Resident");
    expect(residentContactV1.safeParse(binding.resident.contact).success).toBe(true);
    for (const raw of [{ version: "resident-contact.v1", name: "Name" }, { ...binding.resident.contact, name: "  " }, { ...binding.resident.contact, email: "bad" }, { ...binding.resident.contact, phone: " " }, { ...binding.resident.contact, email: "real@example.org" }]) expect(residentContactV1.safeParse(raw).success).toBe(false);
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
