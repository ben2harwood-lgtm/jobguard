import { PracticeAccess } from "./practice-access.js";
import { PracticeAccessError, practiceMaterialPool } from "@jobguard/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { EvidencePackApplication } from "./evidence-pack.application.js";
import { evidencePackApprovalCommandV1, evidencePackCommandV1, evidencePackInspectionQueryV1 } from "./evidence-pack.contracts.js";

const repository = vi.hoisted(() => ({ list: vi.fn(), generate: vi.fn(), approveAttachment: vi.fn(), inspect: vi.fn(), download: vi.fn(), membership: vi.fn() }));
vi.mock("@jobguard/db", async original => ({
  ...(await original<typeof import("@jobguard/db")>()),
  EvidencePackRepository: class { list = repository.list; generate = repository.generate; approveAttachment = repository.approveAttachment; inspect = repository.inspect; download = repository.download; },
  practiceMaterialPool: vi.fn((pool: unknown) => pool),
  withTenant: (_pool: unknown, _context: unknown, run: (db: unknown) => unknown) => run({ $client: { query: repository.membership } }),
}));
const sessionId = "18000000-0000-4000-8000-000000000001";
const caseId = "18000000-0000-4000-8000-000000000002";
const packId = "18000000-0000-4000-8000-000000000003";
const commandId = "18000000-0000-4000-8000-000000000004";
const hash = "a".repeat(64);
const membershipId = "18000000-0000-4000-8000-000000000005";

describe("evidence pack API repair boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); repository.list.mockResolvedValue([]); repository.membership.mockResolvedValue({ rows: [{ id: membershipId }] });
    vi.spyOn(PracticeAccess.prototype,"case").mockImplementation(async function(this:any,id:unknown) {
      if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
      if(!this.sessionId||this.sessionId==="forged")throw new PracticeAccessError("UNAUTHENTICATED");
      if(this.sessionId!==sessionId||id!==caseId)throw new PracticeAccessError("NOT_FOUND");
      const member=(await repository.membership()).rows[0];if(!member)throw new Error("FORBIDDEN");
      return {context:{tenantId:"11111111-1111-4111-8111-111111111111"},membershipId:member.id,digest:hash} as never;
    }); });
  afterEach(() => {vi.unstubAllEnvs();vi.restoreAllMocks();});
  it.each(["production_billing", "pilot_no_charge"])("refuses the synthetic pack seam in %s", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode);
    await expect(new EvidencePackApplication({} as Pool).list(sessionId, caseId)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(repository.membership).not.toHaveBeenCalled();
  });
  it("accepts only the text artifact actually produced and rejects invented client authority", () => {
    const command = { version: "evidence-pack-command.v1", commandId };
    expect(evidencePackCommandV1.parse(command)).toMatchObject({ format: "TEXT" });
    for (const extra of [{ format: "ZIP" }, { format: "PDF" }, { actorRef: "forged" }, { evidenceVersion: 2 }, { tenantId: caseId }]) {
      expect(evidencePackCommandV1.safeParse({ ...command, ...extra }).success).toBe(false);
    }
  });
  it("binds a recorded attachment approval to both immutable hashes", () => {
    const command = { version: "evidence-pack-attachment-approval.v1", commandId, expectedManifestHash: hash, expectedContentHash: hash };
    expect(evidencePackApprovalCommandV1.parse(command)).toEqual(command);
    expect(evidencePackApprovalCommandV1.safeParse({ ...command, expectedContentHash: "bad" }).success).toBe(false);
    expect(evidencePackApprovalCommandV1.safeParse({ ...command, approved: true }).success).toBe(false);
  });
  it("validates a bounded, explicitly synthetic server inspection scenario", () => {
    expect(evidencePackInspectionQueryV1.parse({})).toEqual({ scenario: "intact" });
    for (const scenario of ["missing", "tampered", "wrong-version", "checkpoint"]) expect(evidencePackInspectionQueryV1.parse({ scenario }).scenario).toBe(scenario);
    expect(evidencePackInspectionQueryV1.safeParse({ scenario: "trusted", trusted: true }).success).toBe(false);
  });
  it("refuses missing or malformed sessions before touching persisted pack state", async () => {
    const app = new EvidencePackApplication({} as Pool);
    for (const session of [undefined, "forged"]) await expect(app.list(session, caseId)).rejects.toThrow("UNAUTHENTICATED");
    expect(repository.list).not.toHaveBeenCalled();
  });
  it("derives a stable recorded actor from verified membership and returns environment identity", async () => {
    const app = new EvidencePackApplication({} as Pool);
    const response = await app.generate(sessionId, caseId, { version: "evidence-pack-command.v1", commandId });
    expect(practiceMaterialPool).toHaveBeenCalledWith(expect.anything(),hash);
    expect(repository.generate).toHaveBeenCalledWith(expect.anything(), caseId, { commandId, format: "TEXT" }, `membership:${membershipId}`);
    await expect(app.generate("18000000-0000-4000-8000-000000000099", caseId, { version: "evidence-pack-command.v1", commandId })).rejects.toThrow("NOT_FOUND");
    expect(repository.generate).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({ version: "evidence-pack-response.v1", environment: "synthetic_demo", realExternalActions: 0, packs: [] });
  });
  it("uses the same persisted approval and inspection paths for API and web adapters", async () => {
    const app = new EvidencePackApplication({} as Pool);
    const command = { version: "evidence-pack-attachment-approval.v1", commandId, expectedManifestHash: hash, expectedContentHash: hash };
    await app.approveAttachment(sessionId, caseId, packId, command);
    expect(repository.approveAttachment).toHaveBeenCalledWith(expect.anything(), caseId, packId, { commandId, expectedManifestHash: hash, expectedContentHash: hash }, `membership:${membershipId}`);
    repository.inspect.mockResolvedValue({ findings: ["Content hash mismatch"], complete: false, contentMatches: false });
    expect(await app.inspect(sessionId, caseId, packId, { scenario: "tampered" })).toMatchObject({ environment: "synthetic_demo", scenario: "tampered", findings: ["Content hash mismatch"], complete: false });
    expect(repository.inspect).toHaveBeenCalledWith(expect.anything(), caseId, packId, "tampered");
  });
  it("denies revoked or missing membership for reads and approvals", async () => {
    repository.membership.mockResolvedValue({ rows: [] });
    const app = new EvidencePackApplication({} as Pool);
    await expect(app.list(sessionId, caseId)).rejects.toThrow("FORBIDDEN");
    expect(repository.list).not.toHaveBeenCalled();
  });
});
