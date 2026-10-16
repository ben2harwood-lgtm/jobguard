import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobSummary } from "./contracts";

const tenantId = randomUUID(), membershipId = randomUUID(), digest = "a".repeat(64);
let jobs: Array<{ id: string; title: string; status: string; revision: number }>;
let documents: Array<Record<string, unknown>>;
const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT id,title") ? jobs : documents }));
const list = vi.fn(async () => ({ jobs }));
function loadWorkspace() {
  const exports: { syntheticWorkspace?: () => Promise<{ jobs: JobSummary[] }> } = {};
  const adapters: Record<string, unknown> = {
    "server-only": {}, "next/headers": { cookies: async () => ({ get: () => ({ value: randomUUID() }) }) },
    "next/server": {}, "pg": {}, "@jobguard/api/workspace": {},
    "@jobguard/db": {
      authenticatePracticeSession: async () => ({ context: { tenantId }, membershipId, digest }),
      readSyntheticDemo: async () => ({ tenant: { id: tenantId }, tenants: [{ id: tenantId }] }),
      withTenant: async (_pool: unknown, _context: unknown, fn: (db: unknown) => unknown) => fn({ $client: { query } }),
      JobPartiesRepository: class { list = list; },
    },
  };
  const js = transpileModule(readFileSync(resolve("app/lib/synthetic-server.ts"), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  runInNewContext(js, { exports, require: (id: string) => {
    if (!(id in adapters)) throw new Error(`Unexpected dependency ${id}`);
    return adapters[id];
  }, process: { env: { JOBGUARD_ENV: "synthetic_demo", DATABASE_URL: "unused" } }, globalThis: { __jobguardSyntheticPool: {} } });
  return exports.syntheticWorkspace!;
}

beforeEach(() => {
  vi.clearAllMocks();
  jobs = ["Kitchen extension", "Loft conversion", "Fictional job"].map(title => ({ id: randomUUID(), title, status: "quoting", revision: 1 }));
  documents = [];
});

describe("LATER-B7 L143 authoritative home document summaries", () => {
  it("L143-1 title alone cannot create Q1007 or delivered status; no document means no document summary", async () => {
    const workspace = await loadWorkspace()();
    expect(workspace.jobs.map(job => job.document)).toEqual(jobs.map(() => ({ kind: "none", reference: null, delivery: "not_sent" })));
  });

  it("L143-2 persisted document and delivery state survive title change", async () => {
    documents = [{ job_id: jobs[0]!.id, document_id: randomUUID(), kind: "quote", reference: "FICTIONAL-Q-27", send_id: randomUUID(), status: "succeeded", adapter: "fake_quote_delivery", delivered: false }];
    const workspace = loadWorkspace();
    const before = (await workspace()).jobs[0]!.document;
    expect(before).toEqual({ kind: "quote", reference: "FICTIONAL-Q-27", delivery: "delivered" });
    jobs[0]!.title = "Renamed fictional work";
    expect((await workspace()).jobs[0]!.document).toEqual(before);
    expect(list).toHaveBeenCalledWith({ tenantId }, membershipId, digest);
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [tenantId, jobs.map(job => job.id)]);
  });

  it.each([
    [null, null, null, false, "not_sent"],
    ["pending", "fake_quote_delivery", "send", false, "queued"],
    ["executing", "fake_quote_delivery", "send", false, "queued"],
    ["retryable", "fake_quote_delivery", "send", false, "queued"],
    ["outcome_unknown", "fake_quote_delivery", "send", false, "outcome_unknown"],
    ["cancelled", "fake_quote_delivery", "send", false, "unknown"],
    ["dead_letter", "fake_quote_delivery", "send", false, "unknown"],
    [null, null, "send", false, "unknown"],
    ["future_state", "fake_quote_delivery", "send", false, "unknown"],
    ["succeeded", "other_adapter", "send", false, "unknown"],
    ["succeeded", "other_adapter", "send", true, "delivered"],
  ])("L143-3 persisted state %s keeps unknown/pending/delivered distinct (%s, %s, %s)", async (status, adapter, sendId, delivered, delivery) => {
    documents = [{ job_id: jobs[2]!.id, document_id: randomUUID(), kind: "quote", reference: "FICTIONAL-Q-31", send_id: sendId, status, adapter, delivered }];
    expect((await loadWorkspace()()).jobs[2]!.document).toEqual({ kind: "quote", reference: "FICTIONAL-Q-31", delivery });
  });

  it("L143-4 source IDs and persisted state agree; an issued invoice uses its persisted number", async () => {
    documents = [{ job_id: jobs[2]!.id, document_id: randomUUID(), kind: "invoice", reference: "FICTIONAL-INV-9", send_id: randomUUID(), status: "succeeded", adapter: "fake_invoice_delivery", delivered: false }];
    const result = await loadWorkspace()();
    expect(result.jobs[2]!.document).toEqual({ kind: "invoice", reference: "FICTIONAL-INV-9", delivery: "delivered" });
    expect(result.jobs[0]!.document.kind).toBe("none");
  });

  it("L143-5 a projection read failure cannot become a successful empty document summary", async () => {
    query.mockRejectedValueOnce(new Error("DATABASE_UNAVAILABLE"));
    await expect(loadWorkspace()()).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});
