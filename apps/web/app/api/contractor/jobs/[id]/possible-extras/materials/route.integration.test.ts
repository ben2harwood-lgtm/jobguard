// Real PostgreSQL route coverage. CI only; the builder sandbox cannot start PostgreSQL.
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { EnterpriseLivePromptRepository, EvidenceService } from "@jobguard/db";
import { cluster, promptFixture, materialsInput, listInput, completionPhoto, promptSession } from "../../../../../../../../../packages/db/test/enterprise-live-prompt-fixtures.js";
import { command } from "../../../../../../../../../packages/db/test/site-extra-fixtures.js";
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/db", () => import("../../../../../../../../../packages/db/src/index.js"));
const transport = vi.hoisted(() => ({ session: "", pool: undefined as unknown }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: transport.session }) }) }));
vi.mock("../../../../../../lib/synthetic-server", () => ({ syntheticPool: () => transport.pool }));
import { POST as materials } from "./route";
import { POST as observations } from "../observations/route";
import { POST as evaluate } from "../evaluate/route";
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); transport.pool = c.runtime; }, 120000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
async function post(handler: typeof materials, session: string, input: Record<string, unknown>) {
  transport.session = session;
  const { jobId, ...body } = input;
  return handler(new Request("http://localhost:3000", { method: "POST", headers: { origin: "http://localhost:3000" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(jobId) }) });
}
it("finance and owner import, supervisor refuses; a replay returns exactly the first answer, changed payload conflicts and one prompt is readable", async () => {
  const f = await promptFixture(c), input = materialsInput(f), repo = new EnterpriseLivePromptRepository(c.runtime);
  const first = await post(materials, f.sessions.finance!, input); expect(first.status).toBe(201);
  const answer = await first.json(); expect(answer).toEqual({ sourceId: expect.any(String), quarantinedComparisons: 0, unevaluatedComparisons: expect.any(Number) });
  expect(await (await post(materials, f.sessions.finance!, input)).json()).toEqual(answer);
  expect((await post(materials, f.sessions.finance!, { ...input, quantity: "101" })).status).toBe(409);
  expect((await post(materials, f.sessions.owner!, materialsInput(f))).status).toBe(201);
  expect((await post(materials, f.sessions.supervisor!, materialsInput(f))).status).toBe(404);
  expect((await repo.list(f.sessions.supervisor!, listInput(f))).items).toHaveLength(1);
  const evaluated = await post(evaluate, f.sessions.supervisor!, { version: "evaluate-live-prompts.v1", commandId: randomUUID(), jobId: f.jobId });
  expect(evaluated.status).toBe(201);
  expect(await evaluated.json()).toEqual({ promptIds: [expect.any(String)], quarantinedComparisons: 0, unevaluatedComparisons: expect.any(Number) });
});
it.each(["equal", "unknown", "unit"])("%s materials produce no prompt through the route", async variant => {
  const f = await promptFixture(c);
  const line = (await c.admin.query("SELECT l.sor_code,l.unit,sum(l.quantity::numeric)::text quantity FROM app.work_order_line l JOIN app.work_order_current w ON(w.tenant_id,w.revision_id)=(l.tenant_id,l.revision_id) WHERE l.tenant_id=$1 AND l.job_id=$2 GROUP BY l.sor_code,l.unit ORDER BY l.sor_code LIMIT 1", [f.p.tenantId, f.jobId])).rows[0]!;
  expect((await post(materials, f.sessions.finance!, materialsInput(f, { workIdentity: variant === "unknown" ? "UNKNOWN" : line.sor_code, unit: variant === "unit" ? "pack" : line.unit, quantity: line.quantity }))).status).toBe(201);
  expect((await new EnterpriseLivePromptRepository(c.runtime).list(f.sessions.supervisor!, listInput(f))).items).toHaveLength(0);
});
it.each(["return", "correction"])("keeps a %s and holds the comparison without subtracting it", async kind => {
  const f = await promptFixture(c);
  expect((await post(materials, f.sessions.finance!, materialsInput(f))).status).toBe(201);
  const response = await post(materials, f.sessions.finance!, materialsInput(f, { kind, quantity: "99" }));
  expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ quarantinedComparisons: 1 });
  expect((await c.admin.query("SELECT fact_kind,quantity::text quantity FROM app.materials_issue_fact WHERE tenant_id=$1 ORDER BY fact_kind", [f.p.tenantId])).rows).toEqual(expect.arrayContaining([{ fact_kind: kind, quantity: "99.000000" }, { fact_kind: "issue", quantity: "100.000000" }]));
});
it("foreign, unknown and uncovered jobs refuse identically, and revoked grants cannot replay", async () => {
  const f = await promptFixture(c), foreign = await promptFixture(c);
  const input = { version: "evaluate-live-prompts.v1", commandId: randomUUID(), jobId: f.jobId };
  expect((await post(evaluate, f.sessions.supervisor!, input)).status).toBe(201);
  for (const jobId of [foreign.jobId, f.otherJob, randomUUID()]) {
    const response = await post(evaluate, f.sessions.supervisor!, { ...input, jobId });
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ version: "enterprise-live-prompt-error.v1", code: "NOT_FOUND" });
  }
  await command(c, f, { kind: "grant.revoke", grantId: f.members.supervisor.grant });
  expect((await post(evaluate, f.sessions.supervisor!, input)).status).toBe(404);
  for (const jobId of [foreign.jobId, randomUUID()]) expect((await post(materials, f.sessions.finance!, materialsInput(f, { jobId }))).status).toBe(404);
  const foreignObservation = await post(observations, f.sessions.named!, { version: "completion-observation.v1", commandId: randomUUID(), jobId: foreign.jobId, evidenceId: randomUUID(), sha256: "a".repeat(64), objectVersion: "missing", workIdentity: "CLEAR-GUTTER", locator: { kind: "photo_tag", tag: "new gutters" } });
  expect(foreignObservation.status).toBe(403);
  expect(await foreignObservation.json()).toEqual({ version: "enterprise-live-prompt-error.v1", code: "EXTRA_FORBIDDEN" });
  const uncovered = await promptSession(c, f.otherSupervisor);
  expect((await post(evaluate, uncovered, { ...input, commandId: randomUUID() })).status).toBe(404);
});
it("refuses missing evidence, pending uploads and another job’s verified photo", async () => {
  const f = await promptFixture(c), foreign = await promptFixture(c);
  const photo = await completionPhoto(c, foreign, ["new gutters"]);
  const otherJobPhoto = await completionPhoto(c, { ...f, jobId: f.otherJob }, ["new gutters"]);
  // Pending intake through the existing service; no synthetic evidence success override.
  const { MemoryStorage } = await import("../../../../../../../../../packages/db/test/site-extra-evidence-fixtures.js");
  const pending = await new EvidenceService(c.runtime, new MemoryStorage()).beginUpload(f.ctx, { jobId: f.jobId, expectedSha256: "a".repeat(64), contentType: "image/png", maximumBytes: 10000, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3600000) });
  for (const source of [{ evidenceId: randomUUID(), sha256: "a".repeat(64), objectVersion: "missing" }, { evidenceId: pending.id, sha256: "a".repeat(64), objectVersion: "pending" }, photo, otherJobPhoto]) {
    const response = await post(observations, f.sessions.supervisor!, { version: "completion-observation.v1", commandId: randomUUID(), jobId: f.jobId, ...source, workIdentity: "CLEAR-GUTTER", locator: { kind: "photo_tag", tag: "new gutters" } });
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ version: "enterprise-live-prompt-error.v1", code: "PROMPT_SOURCE_INVALID" });
  }
  expect((await new EnterpriseLivePromptRepository(c.runtime).list(f.sessions.supervisor!, listInput(f))).items).toHaveLength(0);
});
