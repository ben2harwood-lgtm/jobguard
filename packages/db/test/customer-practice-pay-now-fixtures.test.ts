import { Client, Pool } from "pg";
import { expect, it, vi } from "vitest";
import { seedFinalCheckJob } from "./final-check-fixture.js";
import { issueApprovedCatchInvoice } from "./customer-practice-pay-now-fixtures.js";

vi.mock("./final-check-fixture.js", () => ({
 FINAL_CHECK_ACTOR: "d1500000-0000-4000-8000-000000000003",
 seedFinalCheckJob: vi.fn(), availableFinalCheck: vi.fn(),
}));

// Exercise pg's real credential precedence without connecting or seeding a DB.
// Stop at the first seed call, after the helper creates its restricted pool.
it.each([
 { host: "127.0.0.1", port: 55432, database: "jobguard_synthetic_demo", user: "postgres", password: "fictional" },
 { connectionString: "postgres://postgres:fictional@127.0.0.1:55432/jobguard_synthetic_demo" },
])("catch worker authenticates as a shadow login, never the inherited admin (%j)", async options => {
 const admin=new Pool(options), runtime=new Pool(options), stopped=new Error("stop before database setup");
 const query=vi.spyOn(admin,"query").mockResolvedValue({ rows: [{ name: "jobguard_synthetic_demo" }] } as never);
 vi.mocked(seedFinalCheckJob).mockImplementationOnce(async fixture => {
  const worker=new Client(fixture.shadow.options);
  expect(worker.user).toMatch(/^customer_catch_[a-f0-9]+$/u);
  expect(worker.user).not.toBe("postgres");
  expect(worker.database).toBe("jobguard_synthetic_demo");
  expect(worker.host).toBe("127.0.0.1");
  expect(worker.port).toBe(55432);
  throw stopped;
 });
 try {
  await expect(issueApprovedCatchInvoice({admin,runtime},1000)).rejects.toBe(stopped);
 } finally {query.mockRestore();await Promise.all([admin.end(),runtime.end()]);}
});
