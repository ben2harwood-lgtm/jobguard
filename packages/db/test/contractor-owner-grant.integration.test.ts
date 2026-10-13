import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { contractorRoles, type ContractorScope, type ContractorRole } from "@jobguard/core";
import { ContractorRepository, canonicalJson, sha256Hex, type AuthenticatedMembership } from "../src/index.js";
import * as proof from "./upgrade-proof-utils.js";
import { cluster, startSession, counts, errorShape, type Cluster, type SessionFixture } from "./contractor-practice-session-fixtures.js";
let c: Cluster, f: SessionFixture, repo: ContractorRepository;
let region: string, branch: string, team: string, otherBranch: string;
let a1: AuthenticatedMembership, a2: AuthenticatedMembership, a3: AuthenticatedMembership, o: AuthenticatedMembership, r: AuthenticatedMembership, ended: AuthenticatedMembership;
const original = process.env.JOBGUARD_ENV;
const scope = (kind: ContractorScope["kind"], id: string): ContractorScope => ({ kind, id });
async function command(actor: AuthenticatedMembership, fields: Record<string, unknown>, expectedRevision?: number) {
 const revision = (await repo.query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" })).revision;
 return { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: expectedRevision ?? revision, ...fields };
}
async function invite(role: ContractorRole, s: ContractorScope, clientId: string | null = null) {
 const raw = await command(f.p, { kind: "member.invite", role, scope: s, clientId, contractId: null, email: "member@fictional.invalid" }); await repo.command(f.p, raw);
 const row = (await c.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, raw.id])).rows[0];
 return { tenantId: f.p.tenantId, membershipId: raw.id, identityUserId: row.identity_user_id } as AuthenticatedMembership;
}
const grant = (actor: AuthenticatedMembership, target: AuthenticatedMembership, s: ContractorScope, role: ContractorRole, expected?: number) => command(actor, { kind: "grant.create", role, scope: s, membershipId: target.membershipId, contractId: null }, expected);
async function failure(work: Promise<unknown>, code: string) { let caught: unknown; try { await work; } catch (error) { caught = error; } expect(caught).toMatchObject({ code }); return errorShape(caught); }
const writes = () => counts(c.admin, ["app.role_grant", "app.command_receipt", "app.audit_event"]);
beforeAll(async () => {
 process.env.JOBGUARD_ENV = "synthetic_demo"; c = await cluster(); f = await startSession(c); repo = new ContractorRepository(c.runtime);
 const view = await repo.query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" });
 region = view.units.find(x => x.kind === "region")!.id; branch = view.units.find(x => x.kind === "branch")!.id; team = view.teams[0]!.id;
 const other = await command(f.p, { kind: "unit.create", unitKind: "branch", parentId: region, name: "Fictional second branch" }); await repo.command(f.p, other); otherBranch = other.id;
 a1 = await invite("admin", scope("tenant", f.p.tenantId)); a2 = await invite("admin", scope("branch", branch)); a3 = await invite("admin", scope("branch", otherBranch));
 o = await invite("operative", scope("team", team)); r = await invite("read_only", scope("team", team)); ended = await invite("operative", scope("team", team));
 await repo.command(f.p, await command(f.p, { kind: "membership.revoke", membershipId: ended.membershipId }));
}, 60000);
afterAll(async () => { await c?.close(); if (original === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = original; });
it.each(["P-O-tenant", "P-O-region", "P-O-branch", "P-O-team", "P-A1-tenant", "P-P-tenant", "A1-O-tenant", "A1-O-team", "A2-O-branch", "A2-O-team"])("[PH18] refuses owner grant in otherwise open cell %s", async cell => {
 const [actorName, targetName, kind] = cell.split("-"); const actors = { P: f.p, A1: a1, A2: a2 }, targets = { P: f.p, A1: a1, O: o };
 const actor = actors[actorName as keyof typeof actors], target = targets[targetName as keyof typeof targets]; const s = scope(kind as ContractorScope["kind"], { tenant: f.p.tenantId, region, branch, team }[kind as "tenant" | "region" | "branch" | "team"]);
 await expect(repo.command(actor, await grant(actor, target, s, "read_only"))).resolves.toMatchObject({ kind: "grant.create", environment: "synthetic_demo", realExternalActions: 0 });
 const raw = await grant(actor, target, s, "owner"), before = await writes();
 const shape = await failure(repo.command(actor, raw), "FORBIDDEN"); expect(await writes()).toEqual(before);
 expect((await repo.query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" })).revision).toBe(raw.expectedRevision);
 expect(await failure(repo.command(actor, await command(actor, { kind: "member.invite", role: "owner", scope: s, clientId: null, contractId: null, email: "owner@fictional.invalid" })), "FORBIDDEN")).toEqual(shape);
});
it.each(["operative", "read-only", "other-branch", "unknown-member", "revoked-member", "stale"])("[PH19] preserves the earlier refusal for %s", async cell => {
 const actor = cell === "operative" ? o : cell === "read-only" ? r : cell === "other-branch" ? a3 : f.p;
 const target = cell === "unknown-member" ? { ...o, membershipId: randomUUID() } as AuthenticatedMembership : cell === "revoked-member" ? ended : o;
 const s = scope("team", team), expected = cell === "stale" ? 0 : undefined;
 const owner = await grant(actor, target, s, "owner", expected), other = await grant(actor, target, s, "read_only", expected), before = await writes();
 const code = cell === "stale" ? "STALE_REVISION" : "NOT_FOUND";
 expect(await failure(repo.command(actor, owner), code)).toEqual(await failure(repo.command(actor, other), code)); expect(await writes()).toEqual(before);
 if (cell === "stale") expect(await failure(repo.command(actor, await command(actor, { kind: "member.invite", role: "owner", scope: s, clientId: null, contractId: null, email: "owner@fictional.invalid" }, 0)), code)).toEqual(await failure(repo.command(actor, owner), code));
});
it("[PH19] mode is refused before the new owner rule in direct SQL", async () => {
 const raw = { ...await grant(f.p, o, scope("tenant", f.p.tenantId), "owner"), environment: "pilot_no_charge" };
 await expect(proof.rolledBack(c.runtime, async client => { await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]); return client.query("SELECT app.contractor_admin_command($1,$2::jsonb,$3)", [f.p.membershipId, JSON.stringify(raw), sha256Hex(canonicalJson(raw))]); })).rejects.toMatchObject({ message: "MODE_FORBIDDEN", code: "42501" });
});
it("[PH20] direct runtime routine refuses owner without any layer above it", async () => {
 const raw = await grant(f.p, o, scope("tenant", f.p.tenantId), "owner"), before = await writes();
 await expect(proof.rolledBack(c.runtime, async client => { await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]); return client.query("SELECT app.contractor_admin_command($1,$2::jsonb,$3)", [f.p.membershipId, JSON.stringify(raw), sha256Hex(canonicalJson(raw))]); })).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" }); expect(await writes()).toEqual(before);
});
it.each(contractorRoles.filter(role => role !== "owner"))("[PH21] invitation and grant still permit role %s", async role => {
 let s = scope("tenant", f.p.tenantId), clientId: string | null = null;
 if (role === "client_approver") { const raw = await command(f.p, { kind: "client.create", branchId: branch, clientType: "main_contractor", name: "Fictional client" }); await repo.command(f.p, raw); clientId = raw.id; s = scope("client", clientId); }
 const member = await invite(role, s, clientId), raw = await grant(f.p, member, s, role), before = await writes();
 expect(await repo.command(f.p, raw)).toEqual({ id: raw.id, revision: raw.expectedRevision + 1, kind: "grant.create", environment: "synthetic_demo", realExternalActions: 0 });
 expect(Number((await writes())["app.role_grant"])).toBe(Number(before["app.role_grant"]) + 1);
});
it("[PH21] generator, direct owner insert, team move and revocations retain their behavior", async () => {
 const fresh = await startSession(c); expect((await c.admin.query("SELECT role,scope_kind,scope_id FROM app.role_grant WHERE tenant_id=$1 AND role='owner'", [fresh.p.tenantId])).rows).toEqual([{ role: "owner", scope_kind: "tenant", scope_id: fresh.p.tenantId }]);
 await proof.rolledBack(c.admin, async client => { await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]); await client.query("SET LOCAL ROLE jobguard_migration"); await client.query("INSERT INTO app.role_grant VALUES($1,$2,$3,'owner','tenant',$1,NULL)", [f.p.tenantId, randomUUID(), o.membershipId]); });
 const newTeam = await command(f.p, { kind: "team.create", branchId: branch, name: "Fictional new team" }); await repo.command(f.p, newTeam);
 await expect(repo.command(f.p, await command(f.p, { kind: "team.move", membershipId: o.membershipId, fromTeamId: team, toTeamId: newTeam.id }))).resolves.toMatchObject({ kind: "team.move" });
 const raw = await grant(f.p, o, scope("team", newTeam.id), "read_only"); await repo.command(f.p, raw);
 await expect(repo.command(f.p, await command(f.p, { kind: "grant.revoke", grantId: raw.id }))).resolves.toMatchObject({ kind: "grant.revoke" });
 await expect(repo.command(f.p, await command(f.p, { kind: "membership.revoke", membershipId: o.membershipId }))).resolves.toMatchObject({ kind: "membership.revoke" });
 await failure(repo.command(f.p, await command(f.p, { kind: "member.invite", role: "owner", scope: scope("tenant", f.p.tenantId), clientId: null, contractId: null, email: "owner@fictional.invalid" })), "FORBIDDEN");
});
