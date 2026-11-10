import { testActorContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { SiteExtraRepository, withTenant } from "../src/index.js";
import { recentItems } from "../src/site-extra-pricing-queries.js";
import { cluster, siteFixture, sorInput, newPriceList, newContract, newOrder, reviseOrder, written, type Cluster } from "./site-extra-pricing-fixtures.js";
import { cancel } from "./site-extra-fixtures.js";
let c: Cluster, repo: SiteExtraRepository;
beforeAll(async () => { c = await cluster(); repo = new SiteExtraRepository(c.runtime); }, 90_000);
afterAll(async () => { await c?.close(); });

it("recents are distinct, newest first, limited to five, personal and restricted to the target price list", async () => {
 const f = await siteFixture(c), operative = f.members.operative.member;
 const codes = ["A", "B", "C", "D", "E", "F", "RETIRED", "OTHER-OPERATIVE", "BASE"];
 const versionId = await newPriceList(c, f, codes.map(code => [code, "each", 100]), "2026-01-01");
 const source = await newOrder(c, f, [["L1", "BASE", "1"]], { contractId: await newContract(c, f, [versionId], "0", "1") });
 await reviseOrder(c, f, source, [["L1", "BASE", "1"]], { assignedMembershipIds: [operative.membershipId, f.unassigned.member.membershipId] });
 const log = async (code: string, actor = operative) => repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, sorInput(source.jobId, { sorCode: code }));
 for (const code of codes.slice(0, 7)) await log(code);
 await log("B");
 await log("OTHER-OPERATIVE", f.unassigned.member);
 const targetVersion = await newPriceList(c, f, [...codes.slice(0, 6), "OTHER-OPERATIVE", "BASE"].map(code => [code, "each", 200]), "2026-01-01");
 const target = await newOrder(c, f, [["L1", "BASE", "1"]], { contractId: await newContract(c, f, [targetVersion], "0", "1") });
 await reviseOrder(c, f, target, [["L1", "BASE", "1"]], { assignedMembershipIds: [operative.membershipId, f.unassigned.member.membershipId] });
 const before = await written(c, f.p.tenantId);
 const result = await repo.sorRecentItems(await testActorContext(c.admin, f.ctx, operative), operative, target.jobId);
 expect(result.sorVersionId).toBe(targetVersion);
 expect(result.items.map(item => item.code)).toEqual(["B", "F", "E", "D", "C"]);
 expect(result.items).toEqual(result.items.map(item => ({ code: item.code, description: `Item ${item.code}`, unit: "each" })));
 expect(await written(c, f.p.tenantId)).toEqual(before);
 expect((await repo.sorRecentItems(await testActorContext(c.admin, f.ctx, f.unassigned.member), f.unassigned.member, target.jobId)).items.map(item => item.code)).toEqual(["OTHER-OPERATIVE"]);
 // The helper also names the tenant explicitly, even inside the authenticated tenant transaction.
 const foreign = await siteFixture(c);
 expect(await withTenant(c.runtime, f.ctx, db => recentItems(db, foreign.p.tenantId, targetVersion, operative.membershipId))).toEqual([]);
 expect((await repo.sorRecentItems(await testActorContext(c.admin, foreign.ctx, foreign.members.operative.member), foreign.members.operative.member, foreign.jobId)).items).toEqual([]);
});

it("empty history is successful; search and recents have identical target refusals", async () => {
 const f = await siteFixture(c), foreign = await siteFixture(c), actor = f.members.operative.member;
 expect((await repo.sorRecentItems(await testActorContext(c.admin, f.ctx, actor), actor, f.jobId)).items).toEqual([]);
 for (const [member, job] of [[actor, randomUUID()], [actor, foreign.jobId], [f.unassigned.member, f.jobId]] as const) {
  await expect(repo.sorRecentItems(await testActorContext(c.admin, f.ctx, member), member, job)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.sorItems(await testActorContext(c.admin, f.ctx, member), member, job, { q: "A" })).rejects.toMatchObject({ code: "NOT_FOUND" });
 }
 await cancel(c, f);
 await expect(repo.sorRecentItems(await testActorContext(c.admin, f.ctx, actor), actor, f.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(repo.sorItems(await testActorContext(c.admin, f.ctx, actor), actor, f.jobId, { q: "A" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
