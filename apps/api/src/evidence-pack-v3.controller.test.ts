import type { Pool } from "pg";
import { HttpException } from "@nestjs/common";
import { afterEach, expect, it, vi } from "vitest";
import { EvidencePackRepository, EvidencePackV3Repository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { EvidencePackController } from "./evidence-pack.controller.js";
import { evidencePackFailure } from "./evidence-pack.errors.js";
const id = "ab000000-0000-4000-8000-000000000001", digest = "a".repeat(64);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("real controller refuses v3 creation and approval with a uniform 409 before queue dispatch", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const auth = vi.spyOn(PracticeAccess.prototype, "case").mockResolvedValue({ context: { tenantId: id }, digest, membershipId: id } as never);
  const writer = vi.spyOn(EvidencePackRepository.prototype, "generate");
  const queued = vi.spyOn(EvidencePackV3Repository.prototype, "request").mockRejectedValue(new Error("EVIDENCE_PACK_V3_DEPENDENCY_HELD"));
  const controller = new EvidencePackController({} as Pool), request = { headers: { cookie: `jg_session=${id}` } };
  for (const run of [
    () => controller.post(request, id, { version: "evidence-pack-command.v3", commandId: id, format: "TEXT", expectedVisibleSourceRevision: digest }),
    () => controller.approve(request, id, id, { version: "evidence-pack-attachment-approval.v3", commandId: id, expectedManifestHash: digest, expectedContentHash: digest }),
  ]) {
    const error = await run().catch(e => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({ code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD" });
  }
  expect(auth).toHaveBeenCalledWith(id); expect(writer).not.toHaveBeenCalled();
  expect(queued).not.toHaveBeenCalled();
});
it("failure mapping never includes producer details or hidden-state hints", () => {
  expect(evidencePackFailure(new Error("EVIDENCE_PACK_V3_DEPENDENCY_HELD"))).toEqual({ status: 409, code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD" });
  expect(evidencePackFailure(new Error("HOLD-EP-SV5-BINDING: secret"))).toEqual({ status: 500, code: "INTERNAL_ERROR" });
});
