import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidencePackRepository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { EvidencePackApplication } from "./evidence-pack.application.js";
import { evidencePackCommandV3, evidencePackApprovalCommandV3 } from "./evidence-pack.contracts.js";

const id = "ab000000-0000-4000-8000-000000000001", digest = "a".repeat(64);
const generation = { version: "evidence-pack-command.v3", commandId: id, format: "TEXT", expectedVisibleSourceRevision: digest };
const approval = { version: "evidence-pack-attachment-approval.v3", commandId: id, expectedManifestHash: digest, expectedContentHash: digest };
const app = () => new EvidencePackApplication({} as Pool);
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.spyOn(PracticeAccess.prototype, "case").mockResolvedValue({ context: { tenantId: id }, digest, membershipId: id } as never);
  vi.spyOn(EvidencePackRepository.prototype, "generate").mockResolvedValue({} as never);
  vi.spyOn(EvidencePackRepository.prototype, "approveAttachment").mockResolvedValue({} as never);
  vi.spyOn(EvidencePackRepository.prototype, "list").mockResolvedValue([]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("CH8-V authenticated refusal while producer binding is held", () => {
  it("valid v3 generation and approval never use the legacy writer or list", async () => {
    await expect(app().generate(id, id, generation)).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
    await expect(app().approveAttachment(id, id, id, approval)).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
    expect(EvidencePackRepository.prototype.generate).not.toHaveBeenCalled();
    expect(EvidencePackRepository.prototype.approveAttachment).not.toHaveBeenCalled();
    expect(EvidencePackRepository.prototype.list).not.toHaveBeenCalled();
  });
  it.each(["UNAUTHENTICATED", "NOT_FOUND", "FORBIDDEN", "SYNTHETIC_MODE_REQUIRED"])("%s precedes parsing or dependency disclosure", async code => {
    vi.mocked(PracticeAccess.prototype.case).mockRejectedValue(new Error(code));
    for (const raw of [generation, approval, null, { tenantId: id }]) {
      await expect(app().generate(id, id, raw)).rejects.toThrow(code);
      await expect(app().approveAttachment(id, id, id, raw)).rejects.toThrow(code);
    }
    expect(EvidencePackRepository.prototype.generate).not.toHaveBeenCalled();
    expect(EvidencePackRepository.prototype.approveAttachment).not.toHaveBeenCalled();
  });
  it("preserves v1 dispatch and membership-derived actor", async () => {
    await app().generate(id, id, { version: "evidence-pack-command.v1", commandId: id });
    expect(EvidencePackRepository.prototype.generate).toHaveBeenCalledWith({ tenantId: id }, id, { commandId: id, format: "TEXT" }, `membership:${id}`);
    await app().approveAttachment(id, id, id, { ...approval, version: "evidence-pack-attachment-approval.v1" });
    expect(EvidencePackRepository.prototype.approveAttachment).toHaveBeenCalledTimes(1);
  });
  it("canonicalises UUID input before comparison and rejects every client authority field", () => {
    expect(evidencePackCommandV3.parse({ ...generation, commandId: id.toUpperCase() }).commandId).toBe(id);
    expect(evidencePackApprovalCommandV3.parse({ ...approval, commandId: id.toUpperCase() }).commandId).toBe(id);
    for (const extra of [{ tenantId: id }, { actorRef: id }, { checkComplete: true }, { hiddenCount: 0 }, { settled: true }, { now: "2026-10-24" }, { fee: 0 }]) {
      expect(evidencePackCommandV3.safeParse({ ...generation, ...extra }).success).toBe(false);
      expect(evidencePackApprovalCommandV3.safeParse({ ...approval, ...extra }).success).toBe(false);
    }
    for (const format of ["ZIP", "PDF", undefined]) expect(evidencePackCommandV3.safeParse({ ...generation, format }).success).toBe(false);
    for (const expectedVisibleSourceRevision of [undefined, "bad", digest.toUpperCase()]) expect(evidencePackCommandV3.safeParse({ ...generation, expectedVisibleSourceRevision }).success).toBe(false);
    for (const key of ["expectedManifestHash", "expectedContentHash"]) expect(evidencePackApprovalCommandV3.safeParse({ ...approval, [key]: "bad" }).success).toBe(false);
  });
});

// Test-only inspection of accepted CH8-A preparation; no runtime deep import or binding claim.
const preparationUrl = new URL("../../../packages/core/src/evidence-pack-v3.ts", import.meta.url).href;
const fixtureUrl = new URL("../../../docs/fixtures/evidence-pack-v3.json", import.meta.url).href;
const preparation = await import(preparationUrl);
const { default: fixtures } = await import(fixtureUrl, { with: { type: "json" } });
describe("CH8-A acceptance carry: isolated declared-link guards", () => {
  it("rejects a self-link with otherwise valid owner/version/hash and section", () => {
    const input = structuredClone(fixtures.specimens.find((s: { name: string }) => s.name === "settled_catch").input);
    const manifest = preparation.buildEvidenceManifestV3(input);
    const entry = manifest.entries.find((e: { kind: string }) => e.kind === "lock");
    const { tenantId, jobId, caseId, sourceId, sourceVersion, objectVersion, contentHash } = entry;
    entry.links = [{ tenantId, jobId, caseId, sourceId, sourceVersion, objectVersion, contentHash }];
    const parsed = preparation.evidenceManifestV3.safeParse(manifest);
    expect(parsed.success).toBe(false);
    expect(parsed.error.issues.map((i: { message: string }) => i.message)).toEqual(["Missing or conflicting declared link"]);
  });
  it("rejects a duplicated section link with otherwise valid source graph", () => {
    const input = structuredClone(fixtures.specimens.find((s: { name: string }) => s.name === "settled_catch").input);
    const manifest = preparation.buildEvidenceManifestV3(input);
    const section = manifest.sections.find((s: { kind: string }) => s.kind === "lock");
    section.sourceIds.push(section.sourceIds[0]);
    const parsed = preparation.evidenceManifestV3.safeParse(manifest);
    expect(parsed.success).toBe(false);
    expect(parsed.error.issues.map((i: { message: string }) => i.message)).toEqual(["Duplicate section link"]);
  });
});

const portsUrl = new URL("../../../packages/db/src/evidence-pack-v3-ports.ts", import.meta.url).href;
const writerUrl = new URL("../../../packages/db/src/evidence-pack-v3-command.ts", import.meta.url).href;
const sourceUrl = new URL("../../../packages/db/src/evidence-pack-v3-sources.ts", import.meta.url).href;
const ports = await import(portsUrl), writer = await import(writerUrl), source = await import(sourceUrl);
it("unbound producer ports and checked writer all fail closed with the same public code", async () => {
  await expect(ports.heldEvidencePackV3Ports.mustSurface.requestCheck()).rejects.toMatchObject({ code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD", hold: "HOLD-EP-MUST-SURFACE" });
  await expect(ports.heldEvidencePackV3Ports.mustSurface.readCompletion()).rejects.toMatchObject({ code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD", hold: "HOLD-EP-MUST-SURFACE" });
  await expect(ports.heldEvidencePackV3Ports.lockReveal.requirePublishedBinding()).rejects.toMatchObject({ code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD", hold: "HOLD-EP-SV5-BINDING" });
  expect(writer.requireEvidencePackV3Writer).toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
});
it("a structural binding forgery never reaches a source query", async () => {
  const query = vi.fn();
  await expect(source.loadEvidencePackV3Sources({ $client: { query } }, { tenantId: id, jobId: id, caseId: id, locked: false }))
    .rejects.toThrow("NOT_FOUND");
  expect(query).not.toHaveBeenCalled();
});

const ordinaryModule = await import(new URL("../../../packages/db/src/evidence-pack-sources.ts", import.meta.url).href);
it("source binding refuses mismatched principal and missing ownership before content queries (unit SQL doubles)", async () => {
  for (const principal of [undefined, { tenant_id: "ab000000-0000-4000-8000-000000000099", membership_id: id }]) {
    const query = vi.fn().mockResolvedValue({ rows: principal ? [principal] : [] });
    await expect(source.verifyEvidencePackV3Case({ $client: { query } }, id, id, digest)).rejects.toThrow("UNAUTHENTICATED");
    expect(query).toHaveBeenCalledTimes(1);
  }
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ tenant_id: id, membership_id: id }] }).mockResolvedValueOnce({ rows: [] });
  await expect(source.verifyEvidencePackV3Case({ $client: { query } }, id, id, digest)).rejects.toThrow("NOT_FOUND");
  expect(query).toHaveBeenCalledTimes(2);
});
it("locked source binding cannot fall through to ordinary content or hidden reads (unit SQL doubles)", async () => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ tenant_id: id, membership_id: id }] })
    .mockResolvedValueOnce({ rows: [{ job_id: id, locked: true }] }).mockResolvedValue({ rows: [] });
  const tx = { $client: { query } }, binding = await source.verifyEvidencePackV3Case(tx, id, id, digest);
  query.mockClear();
  await expect(source.loadEvidencePackV3Sources(tx, binding)).rejects.toMatchObject({ hold: "HOLD-EP-SV5-BINDING" });
  expect(query).not.toHaveBeenCalled();
});
it("cross-job source rows fail the independent consumer guard (unit source double)", async () => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ tenant_id: id, membership_id: id }] })
    .mockResolvedValueOnce({ rows: [{ job_id: id, locked: false }] }).mockResolvedValue({ rows: [] });
  const tx = { $client: { query } }, binding = await source.verifyEvidencePackV3Case(tx, id, id, digest);
  const other = "ab000000-0000-4000-8000-000000000099";
  const read = vi.spyOn(ordinaryModule, "loadEvidencePackSources");
  for (const wrong of [{ jobId: other, sources: [], omissions: [] }, { jobId: id, sources: [{ jobId: other }], omissions: [] }]) {
    read.mockResolvedValue(wrong);
    await expect(source.loadEvidencePackV3Sources(tx, binding)).rejects.toThrow("NOT_FOUND");
  }
});
it("malformed session digest fails before principal or source SQL (unit boundary)", async () => {
  const query = vi.fn();
  await expect(source.verifyEvidencePackV3Case({ $client: { query } }, id, id, "forged")).rejects.toThrow("UNAUTHENTICATED");
  expect(query).not.toHaveBeenCalled();
});
