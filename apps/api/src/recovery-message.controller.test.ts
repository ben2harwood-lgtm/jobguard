import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import type { Pool } from "pg";

const application = vi.hoisted(() => ({ read: vi.fn(), preview: vi.fn(), command: vi.fn() }));
vi.mock("./recovery-message.application.js", async original => ({
  ...(await original<typeof import("./recovery-message.application.js")>()),
  RecoveryMessageApplication: class { read = application.read; preview = application.preview; command = application.command; },
}));
const { RecoveryMessageController } = await import("./recovery-message.controller.js");

const request = { headers: { cookie: "theme=dark; jg_session=19000000-0000-4000-8000-000000000001" } };
const caseId = "19000000-0000-4000-8000-000000000002", messageId = "19000000-0000-4000-8000-000000000003";
async function failureOf(run: () => Promise<unknown>) {
  try { await run(); } catch (error) { expect(error).toBeInstanceOf(HttpException); return { status: (error as HttpException).getStatus(), body: (error as HttpException).getResponse() }; }
  throw new Error("expected the call to fail");
}

describe("recovery message controller", () => {
  beforeEach(() => vi.clearAllMocks());
  it("passes the practice session cookie, case and message identity to the shared application", async () => {
    const controller = new RecoveryMessageController({} as Pool);
    application.read.mockResolvedValue({ ok: 1 }); application.preview.mockResolvedValue({ ok: 2 }); application.command.mockResolvedValue({ ok: 3 });
    expect(await controller.get(request, caseId)).toEqual({ ok: 1 });
    expect(await controller.preview(request, caseId, { a: 1 })).toEqual({ ok: 2 });
    expect(await controller.command(request, caseId, messageId, { b: 2 })).toEqual({ ok: 3 });
    expect(application.read).toHaveBeenCalledWith("19000000-0000-4000-8000-000000000001", caseId);
    expect(application.preview).toHaveBeenCalledWith("19000000-0000-4000-8000-000000000001", caseId, { a: 1 });
    expect(application.command).toHaveBeenCalledWith("19000000-0000-4000-8000-000000000001", caseId, messageId, { b: 2 });
  });
  it("answers a typed conflict with its code and status, and never echoes unexpected error text", async () => {
    const controller = new RecoveryMessageController({} as Pool);
    application.command.mockRejectedValue(Object.assign(new Error("RECOVERY_MESSAGE_CHANGED"), { code: "RECOVERY_MESSAGE_CHANGED" }));
    expect(await failureOf(() => controller.command(request, caseId, messageId, {}))).toEqual({ status: 409, body: { code: "RECOVERY_MESSAGE_CHANGED" } });
    const leak = 'relation "app.recovery_message" does not exist at character 15';
    application.read.mockRejectedValue(new Error(leak));
    const failure = await failureOf(() => controller.get(request, caseId));
    expect(failure).toEqual({ status: 500, body: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(failure)).not.toContain("relation");
  });
});
