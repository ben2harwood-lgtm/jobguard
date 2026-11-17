import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Handler-level regression tests for the POST same-origin gate. Downstream services are replaced so only the gate is exercised.
const { application } = vi.hoisted(() => ({ application: { start: vi.fn(async () => ({ ok: "start" })), command: vi.fn(async () => ({ ok: "command" })), read: vi.fn(), resume: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "00000000-0000-4000-8000-000000000000" }) }) }));
vi.mock("@jobguard/api/workspace", () => ({ createContractorApplication: vi.fn(() => application), contractorHttpStatus: () => 503 }));
vi.mock("../../lib/synthetic-server", () => ({ syntheticPool: () => ({}) }));
import { POST } from "./route";
const post = (url: string, headers: Record<string, string>) => POST(new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" }));

beforeEach(() => { vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_URL", "app.example.com"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", ""); application.start.mockClear(); application.command.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("contractor POST same-origin gate", () => {
  it("rejects a foreign Origin even when the caller supplies a matching X-Forwarded-Host", async () => {
    const response = await post("https://app.example.com/api/contractor", { origin: "https://evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "FORBIDDEN" });
    expect(application.command).not.toHaveBeenCalled();
  });
  it("rejects an http Origin on an https request even when the caller supplies X-Forwarded-Proto: http", async () => {
    const response = await post("https://app.example.com/api/contractor", { origin: "http://app.example.com", "x-forwarded-host": "app.example.com", "x-forwarded-proto": "http" });
    expect(response.status).toBe(403);
    expect(application.command).not.toHaveBeenCalled();
  });
  it("rejects the same forged headers on the start action", async () => {
    const response = await post("https://app.example.com/api/contractor?action=start", { origin: "https://evil.example", "x-forwarded-host": "evil.example" });
    expect(response.status).toBe(403);
    expect(application.start).not.toHaveBeenCalled();
  });
  it("rejects a missing Origin and the opaque null Origin", async () => {
    for (const headers of [{}, { origin: "null" }]) expect((await post("https://app.example.com/api/contractor", headers)).status).toBe(403);
    expect(application.command).not.toHaveBeenCalled();
  });
  it("accepts the configured deployment origin, with or without forwarded headers", async () => {
    for (const extra of [{}, { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }]) {
      const response = await post("https://app.example.com/api/contractor", { origin: "https://app.example.com", ...extra });
      expect(response.status).toBe(200);
    }
    expect(application.command).toHaveBeenCalledTimes(2);
  });
});


describe("contractor malformed JSON boundary", () => {
  it.each(["", "?action=start"])("rejects malformed JSON on %s with typed 422 before a service call", async action => {
    const response = await POST(new Request(`https://app.example.com/api/contractor${action}`, {
      method: "POST", headers: { "content-type": "application/json", origin: "https://app.example.com" }, body: "{broken",
    }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ version: "contractor-error.v1", code: "INVALID_COMMAND", recoverable: false });
    expect(application.start).not.toHaveBeenCalled();expect(application.command).not.toHaveBeenCalled();
  });
});
