import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { DEMO_JOB_ID, DEMO_SCOPE_ITEM_ID, DEMO_TENANT_ID, SyntheticDemoReadError } from "@jobguard/db";
import { WorkspaceService, WorkspaceServiceError } from "./workspace.service.js";

const read = vi.hoisted(() => vi.fn());
vi.mock("@jobguard/db", async (original) => ({ ...(await original<typeof import("@jobguard/db")>()), readSyntheticDemoJob: read }));
const principal = { sessionId: "opaque" };
describe("workspace application service", () => {
  beforeEach(() => read.mockReset());
  it("maps the authoritative database projection to the versioned contract", async () => {
    read.mockResolvedValue({ job: { id: DEMO_JOB_ID, title: "Practice kitchen", status: "quoting", revision: 7, scopeIdentityIds: [DEMO_SCOPE_ITEM_ID], updatedAt: new Date("2026-09-15T10:00:00.000Z") } });
    await expect(new WorkspaceService({} as Pool).getJob(principal, DEMO_JOB_ID)).resolves.toEqual({ version: 1, environment: "synthetic_demo", job: { id: DEMO_JOB_ID, tenantId: DEMO_TENANT_ID, title: "Practice kitchen", status: "quoting", revision: 7, scopeIdentityIds: [DEMO_SCOPE_ITEM_ID], updatedAt: "2026-09-15T10:00:00.000Z" } });
  });
  it.each([{ status: "invented-status" }, { scopeIdentityIds: ["not-a-uuid"] }, { scopeIdentityIds: undefined }])("refuses an invalid authoritative projection: %j", async invalid => {
    read.mockResolvedValue({ job: { id: DEMO_JOB_ID, title: "Fictional job", status: "live", revision: 1, updatedAt: new Date(), scopeIdentityIds: [], ...invalid } });
    await expect(new WorkspaceService({} as Pool).getJob(principal, DEMO_JOB_ID)).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
  it("fails closed for authentication and caller-selected tenants", async () => {
    const service = new WorkspaceService({} as Pool);
    await expect(service.getJob(null, DEMO_JOB_ID)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(service.getJob({ ...principal, requestedTenantId: "22222222-2222-4222-8222-222222222222" }, DEMO_JOB_ID)).rejects.toMatchObject({ code: "TENANT_FORBIDDEN" });
    expect(read).not.toHaveBeenCalled();
  });
  it("keeps missing jobs distinct and converts database outages to a recoverable type", async () => {
    const service = new WorkspaceService({} as Pool); read.mockRejectedValueOnce(new SyntheticDemoReadError("JOB_NOT_FOUND"));
    await expect(service.getJob(principal, DEMO_JOB_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
    read.mockRejectedValueOnce(new Error("connection refused"));
    await expect(service.getJob(principal, DEMO_JOB_ID)).rejects.toEqual(expect.objectContaining<Partial<WorkspaceServiceError>>({ code: "DATABASE_UNAVAILABLE" }));
  });
});
