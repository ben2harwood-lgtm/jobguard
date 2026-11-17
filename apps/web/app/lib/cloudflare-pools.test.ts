import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@jobguard/db", () => ({ PracticeAccessError: class extends Error {} }));
vi.mock("@jobguard/api/workspace", () => ({ SYNTHETIC_SESSION: "fictional" }));
const identity = vi.hoisted(() => ({ create: vi.fn(() => ({})) }));
vi.mock("@jobguard/api/identity", () => ({ createIdentityApplication: identity.create }));
import { closeSyntheticPool, syntheticPool } from "./synthetic-server";
import { identityApplication } from "./identity-server";

afterEach(async () => {
  await closeSyntheticPool();
  vi.unstubAllEnvs();
  identity.create.mockClear();
  delete (globalThis as { __jobguardIdentityApplication?: unknown }).__jobguardIdentityApplication;
});

describe("Cloudflare demo database lifetime", () => {
  it("uses separate single-use pools so sockets cannot leak into the next request", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    vi.stubEnv("JOBGUARD_HOSTING", "cloudflare");
    vi.stubEnv("DATABASE_URL", "postgresql://runtime:fictional@db.invalid/jobguard_synthetic_demo");
    const first = syntheticPool(), second = syntheticPool();
    expect(first).not.toBe(second);
    expect(first.options).toMatchObject({ max: 1, maxUses: 1, connectionString: process.env.DATABASE_URL });
    expect((globalThis as { __jobguardSyntheticPool?: unknown }).__jobguardSyntheticPool).toBeUndefined();
    await Promise.all([first.end(), second.end()]);
  });
  it("preserves the existing Node/Vercel pool", () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    vi.stubEnv("JOBGUARD_HOSTING", "");
    vi.stubEnv("DATABASE_URL", "postgresql://runtime:fictional@db.invalid/jobguard_synthetic_demo");
    expect(syntheticPool()).toBe(syntheticPool());
    expect(syntheticPool().options.max).toBe(12);
  });
  it("fails closed outside the demo and without a database secret", () => {
    vi.stubEnv("JOBGUARD_HOSTING", "cloudflare");
    vi.stubEnv("JOBGUARD_ENV", "production");
    expect(() => syntheticPool()).toThrow("Synthetic workflow is unavailable");
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    vi.stubEnv("DATABASE_URL", "");
    expect(() => syntheticPool()).toThrow("Database configuration is unavailable");
  });
  it("does not cache the Worker identity application and requests single-use connections", () => {
    vi.stubEnv("JOBGUARD_HOSTING", "cloudflare");
    expect(identityApplication()).not.toBe(identityApplication());
    expect(identity.create).toHaveBeenCalledTimes(2);
    expect(identity.create).toHaveBeenCalledWith(process.env, { max: 1, maxUses: 1 });
  });
  it("preserves identity application caching on Node/Vercel", () => {
    vi.stubEnv("JOBGUARD_HOSTING", "");
    expect(identityApplication()).toBe(identityApplication());
    expect(identity.create).toHaveBeenCalledTimes(1);
    expect(identity.create).toHaveBeenCalledWith(process.env);
  });
});
