import "reflect-metadata";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const connect = vi.fn(async () => { throw new Error("health database connection attempted"); });
  const query = vi.fn(async () => { throw new Error("health database query attempted"); });
  const Pool = vi.fn(function () { return { connect, query }; });
  return { Pool, connect, query };
});

// Intercept before importing the controller, including any future import-time pool creation.
// No real driver operation or socket can occur through this pool.
vi.mock("pg", () => ({ Pool: database.Pool, default: { Pool: database.Pool } }));

async function assertDatabaseIndependent(handler: () => unknown) {
  expect(await handler()).toEqual({ status: "ok" });
  expect({
    construction: database.Pool.mock.calls.length,
    connect: database.connect.mock.calls.length,
    query: database.query.mock.calls.length,
  }, "health must perform zero database attempts").toEqual({ construction: 0, connect: 0, query: 0 });
}

describe("L134 / api-file-health#1 database independence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it.each(["construct", "connect", "query"] as const)(
    "L134 health rejects a database-touching negative control: %s",
    async (attempt) => {
      // Also detect calls through a pool created before the handler executes.
      const existingPool = new Pool();
      database.Pool.mockClear();
      const swallowedErrorHandler = async () => {
        const pool = attempt === "construct" ? new Pool() : existingPool;
        try {
          if (attempt === "connect") await pool.connect();
          if (attempt === "query") await pool.query("SELECT 1");
        } catch {
          // A response-only check still passes after a caught database failure.
        }
        return { status: "ok" };
      };

      await expect(assertDatabaseIndependent(swallowedErrorHandler)).rejects.toThrow(/zero database attempts/);
      expect(database.Pool).toHaveBeenCalledTimes(attempt === "construct" ? 1 : 0);
      expect(database.connect).toHaveBeenCalledTimes(attempt === "connect" ? 1 : 0);
      expect(database.query).toHaveBeenCalledTimes(attempt === "query" ? 1 : 0);
    },
  );

  it.each(["absent", "present"] as const)(
    "L134 real health performs zero database attempts: database configuration %s",
    async (configuration) => {
      const address = new URL("postgresql://127.0.0.1:1/health_independence");
      vi.stubEnv("DATABASE_URL", configuration === "present" ? address.toString() : undefined);
      const { HealthController } = await import("./health.controller.js");

      await assertDatabaseIndependent(() => new HealthController().health());
    },
  );
});
