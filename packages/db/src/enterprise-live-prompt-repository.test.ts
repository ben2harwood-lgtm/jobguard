import { expect, it, vi } from "vitest";
import type { Pool } from "pg";
const state = vi.hoisted(() => ({ context: Object.freeze({}), bridge: vi.fn(), tenant: vi.fn(), query: vi.fn() }));
vi.mock("./contractor-session-context.js", () => ({ contractorSessionContext: state.bridge }));
vi.mock("./tenant-context.js", () => ({ withTenant: state.tenant }));
import { EnterpriseLivePromptRepository } from "./enterprise-live-prompt-repository.js";
const job = "00000000-0000-4000-8000-000000000001";
it("resolves session context and calls only the narrow guarded read with parameterised session/job", async () => {
 const result = { version: "observation-evidence.v1", items: [] }, pool = {} as Pool;
 state.bridge.mockResolvedValue(state.context); state.query.mockResolvedValue({ rows: [{ result }] });
 state.tenant.mockImplementation(async (_pool, _context, fn) => fn({ $client: { query: state.query } }));
 expect(await new EnterpriseLivePromptRepository(pool).observationEvidence(job, job)).toBe(result);
 expect(state.bridge).toHaveBeenCalledWith(pool, job); expect(state.tenant.mock.calls[0]![1]).toBe(state.context);
 expect(state.query).toHaveBeenCalledWith("SELECT app.contractor_job_evidence_read($1,$2) result", [job, job]);
});
it("preserves the guarded authority refusal", async () => {
 state.bridge.mockRejectedValue(new Error("EXTRA_FORBIDDEN"));
 await expect(new EnterpriseLivePromptRepository({} as Pool).observationEvidence(job, job)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
});
it("rejects invalid job identifiers before session resolution", async () => {
 state.bridge.mockClear();
 await expect(new EnterpriseLivePromptRepository({} as Pool).observationEvidence(job, "invalid")).rejects.toMatchObject({ code: "INVALID_PROMPT_COMMAND" });
 expect(state.bridge).not.toHaveBeenCalled();
});
