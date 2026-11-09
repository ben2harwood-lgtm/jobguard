import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { SiteExtraRepository, withTenant } from "../src/index.js";
import { cluster, siteFixture, input, counts, chain } from "./site-extra-fixtures.js";
import type { Cluster } from "./extra-fixtures.js";

let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 60_000);
afterAll(async () => { await c?.close(); });

it("replays a plain site extra after invoicing while refusing new commands and changed bodies", async () => {
 const f = await siteFixture(c), repo = new SiteExtraRepository(c.runtime);
 const actor = f.members.operative.member, raw = input(f);
 const first = await repo.logSiteExtra(f.ctx, actor, raw);
 await withTenant(c.admin, f.ctx, db => db.$client.query("SELECT app.transition_job($1,$2,(SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2),'invoiced','issue_invoice',NULL,NULL,NULL,NULL)", [f.p.tenantId, f.jobId]));
 expect((await c.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.jobId])).rows).toEqual([{ status: "invoiced" }]);
 const before = await counts(c, f), head = await chain(c, f);

 expect(await repo.logSiteExtra(f.ctx, actor, raw)).toEqual(first);
 await expect(repo.logSiteExtra(f.ctx, actor, { ...raw, commandId: randomUUID() })).rejects.toMatchObject({ code: "JOB_NOT_LIVE" });
 await expect(repo.logSiteExtra(f.ctx, actor, { ...raw, note: "Fictional changed note" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
 expect(await counts(c, f)).toEqual(before);
 expect(await chain(c, f)).toBe(head);
 expect((await c.admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows).toEqual([{ result: first }]);
});
