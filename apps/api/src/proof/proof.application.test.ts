import{describe,expect,it}from"vitest";import{hasCompleteImage}from"@jobguard/db";import{proofCommandV1}from"./contracts.js";import{generatePracticePng}from"./proof.application.js";
describe("UIWIRE-7 proof API service boundary",()=>{it("generates a complete runtime PNG rather than a committed binary or header",()=>{const bytes=generatePracticePng();expect(hasCompleteImage(bytes,"image/png")).toBe(true);expect(hasCompleteImage(bytes.subarray(0,16),"image/png")).toBe(false);const corrupt=Buffer.from(bytes);corrupt.fill(0,45,55);expect(hasCompleteImage(corrupt,"image/png")).toBe(false)});it("strictly rejects deployment modes, arbitrary bytes and wrong actions",()=>{const base={version:"practice-proof-command.v1",action:"select_generated",commandId:crypto.randomUUID(),scopeItemId:crypto.randomUUID(),fixture:"completion-photo"};expect(proofCommandV1.safeParse(base).success).toBe(true);for(const extra of[{deploymentMode:"production"},{bytes:"real-upload"},{amount:1},{action:"send"}])expect(proofCommandV1.safeParse({...base,...extra}).success).toBe(false)})});


// Exercise the actual ownership lookup and application error mapping; only DB/storage
// infrastructure and the proof command outcome are doubled here.
import type { Pool } from "pg";
import { afterEach, vi } from "vitest";
import { ProofCommandError, ProofCommandService } from "@jobguard/db";
import { ProofApplication } from "./proof.application.js";
const jobId = "18000000-0000-4000-8000-000000000001";
const scopeId = "18000000-0000-4000-8000-000000000002";
const pendingId = "18000000-0000-4000-8000-000000000003";
const tenantId = "11111111-1111-4111-8111-111111111111";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(["owned pending upload", "foreign upload", "unknown evidence"])(
  "proof complete preserves ownership and domain validation for %s", async scenario => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("authenticate_practice_session")) return { rows: [{ tenant_id: tenantId, membership_id: jobId, identity_user_id: scopeId }] };
      if (sql.includes("practice_session_digest=$3")) return { rows: [{ id: jobId }] };
      if (sql.startsWith("SELECT 1 FROM app.membership")) return { rows: [{}] };
      if (sql.includes("SELECT id FROM app.evidence")) {
        expect(values).toEqual([tenantId, jobId, pendingId]);
        return { rows: scenario === "owned pending upload" && sql.includes("app.evidence_upload") ? [{ id: pendingId }] : [] };
      }
      return { rows: [] };
    });
    const pool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
    const app = new ProofApplication(pool, jobId);
    const get = vi.spyOn(app, "get").mockResolvedValue({ scopeItemId: scopeId, decisionId: null } as never);
    const complete = vi.spyOn(ProofCommandService.prototype, "complete").mockRejectedValue(new ProofCommandError("PROOF_NOT_FINAL"));
    await expect(app.command(jobId, { version: "practice-proof-command.v1", action: "complete", commandId: jobId, scopeItemId: scopeId, evidenceId: pendingId })).rejects.toThrow(
      scenario === "owned pending upload" ? "PROOF_INVALID" : "NOT_FOUND");
    expect(complete).toHaveBeenCalledTimes(scenario === "owned pending upload" ? 1 : 0);
    expect(get).toHaveBeenCalledTimes(scenario === "owned pending upload" ? 1 : 0);
  });
