import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { AiGateway, extractCaptureFixture } from "@jobguard/ai";
import { contractorPartyEventTypes, contractorPartyAuditPayload, contractorPartyAuditPayloadV1, jobPartiesListV1, jobPartiesWorkspaceV1, contractorWorkspaceV1 } from "@jobguard/core";
const id = "11111111-1111-4111-8111-111111111111";
const contact = { name: "Fictional Resident Canary", phone: "00000123456", email: "resident-canary@example.invalid" };
/** Keep this projection allowlist passing when ENT-6 exports and ENT-9 dashboards arrive. */
const projections = ["packages/db/src/job-parties-repository.ts", "packages/db/src/demo-runtime.ts", "packages/db/src/contractor-repository.ts", "apps/api/src/workspace/workspace.service.ts"];
describe("CH-3b resident privacy", () => {
  it("allows no contact keys for any CH-3b audit event", () => {
    for (const event of contractorPartyEventTypes) {
      const payload = contractorPartyAuditPayload(event.endsWith("bound") ? "bound" : "customer_linked", id, id, "a".repeat(64));
      for (const [key, value] of Object.entries(contact)) expect(contractorPartyAuditPayloadV1.safeParse({ ...payload, references: { ...payload.references, [key]: value } }).success).toBe(false);
      expect(Object.keys(payload.references).sort()).toEqual(["commandId", "environment", "identityId"]);
    }
  });
  it("keeps existing list/workspace builders outside the restricted table and their schemas outside resident fields", async () => {
    for (const path of projections) {
      const source = await readFile(new URL(`../../../../${path}`, import.meta.url), "utf8");
      expect(source).not.toContain("contractor_resident_contact"); expect(source).not.toContain("read_contractor_resident");
    }
    const list = jobPartiesListV1.parse({ version: "job-parties-list.v1", environment: "synthetic_demo", jobs: [{ id, title: "Fictional job", status: "draft", revision: 0, customerLabel: "Fictional Client", siteLabel: "Fictional site", resident: contact }] });
    expect(list.jobs[0]).not.toHaveProperty("resident");
    expect(Object.keys(jobPartiesWorkspaceV1.shape)).not.toContain("resident"); expect(Object.keys(contractorWorkspaceV1.shape)).not.toContain("resident");
  });
  it("captures the actual zero-spend request handed to the existing gateway; structured resident data is absent", async () => {
    const contractorJob = { id, workDescription: "Fit a door. Quantity 1. Unit item. Price £100.", resident: contact };
    const calls: unknown[] = [], original = AiGateway.prototype.generate;
    const spy = vi.spyOn(AiGateway.prototype, "generate").mockImplementation(function (this: AiGateway, ...args: Parameters<typeof original>) { calls.push(args[0]); return original.apply(this, args); });
    try {
      // Existing gateway builds requests solely from reviewed work text; it takes no party/workspace object.
      await extractCaptureFixture(contractorJob.id, contractorJob.workDescription, "ch3b-privacy");
      expect(calls).toHaveLength(1);
      for (const value of Object.values(contact)) expect(JSON.stringify(calls[0])).not.toContain(value);
      expect(calls[0]).toMatchObject({ operation: "capture_job_record_proposal", sources: [{ content: contractorJob.workDescription }] });
    } finally { spy.mockRestore(); }
  });
  it("both Next adapters use contractor session composition, no-store and the shared typed failure", async () => {
    for (const path of ["clients/[clientId]/customer-link", "jobs/[id]/resident-contact"]) {
      const source = await readFile(new URL(`../../../web/app/api/contractor/${path}/route.ts`, import.meta.url), "utf8");
      for (const token of ["createContractorPartiesApplication", "syntheticPool()", 'get("jg_session")', '"no-store"', "contractorPartiesHttpFailure"]) expect(source).toContain(token);
      expect(source).not.toContain("console.");
    }
  });
});
