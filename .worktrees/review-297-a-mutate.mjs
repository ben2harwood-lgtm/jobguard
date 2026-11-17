import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const file = "packages/core/src/sync-download.ts";
const orig = readFileSync(file, "utf8");
const muts = [
 ["status guard", `authority.status !== "active" || `, ``],
 ["authority parse fail -> invalid_request", `if (!authorityParse.success) return refuse("authority_required");`, `if (!authorityParse.success) return refuse("invalid_request");`],
 ["duplicate not refused", `if (invalid || duplicate)`, `if (invalid)`],
 ["source_invalid drops admitted", `return refuse("source_invalid", [...admitted].sort());`, `return refuse("source_invalid");`],
 ["source_invalid cleanup none", `cleanup: reason === "invalid_request" ? "none" : "required"`, `cleanup: reason === "authority_required" ? "required" : "none"`],
 ["admit before tenant filter", `  if (row.tenantId !== authority.tenantId || !assigned.has(row.jobId) || (narrow && !narrow.has(row.jobId))) continue;\n  if (admitted.has(row.jobId)) duplicate = true;\n  admitted.add(row.jobId);`, `  if (admitted.has(row.jobId)) duplicate = true;\n  admitted.add(row.jobId);\n  if (row.tenantId !== authority.tenantId || !assigned.has(row.jobId) || (narrow && !narrow.has(row.jobId))) continue;`],
 ["no consistency refine", `}).strict().refine(d => {\n if (d.outcome === "allowed")`, `}).strict().refine(d => { return true;\n if (d.outcome === "allowed")`],
 ["no tombstone dedupe", `const delivered = [...new Set(parsed.data.delivered)];`, `const delivered = parsed.data.delivered;`],
 ["allowed admits all assigned", `admittedJobIds: rows.map(r => r.jobId), cleanup: "none" };`, `admittedJobIds: [...assigned].sort(), cleanup: "none" };`],
 ["token accepts malformed authority", `if (!facts.success || !authority?.success || evaluateSyncDownloadV1`, `if (!facts.success || evaluateSyncDownloadV1`],
 ["role guard", `|| !syncRoles.includes(authority.role)`, ``],
 ["tenant request guard", `\n  || authority.tenantId !== request.requestedTenantId)`, `)`],
 ["row tenant filter", `row.tenantId !== authority.tenantId || `, ``],
 ["assignment filter", `!assigned.has(row.jobId) || `, ``],
 ["narrow filter", ` || (narrow && !narrow.has(row.jobId))`, ``],
 ["projection passthrough", `const projection = syncJobProjectionV1.safeParse(picked);`, `const projection = syncJobProjectionV1.passthrough().safeParse({ ...row, ...picked });`],
 ["no sort", `rows.sort((a, b) => (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0));`, ``],
 ["paging >=", `r.jobId > args.data.afterJobId!`, `r.jobId >= args.data.afterJobId!`],
 ["request not strict", `jobIds: z.array(uuid).max(1000).optional(),\n}).strict();`, `jobIds: z.array(uuid).max(1000).optional(),\n}).passthrough();`],
 ["cleanup none on authority", `cleanup: reason === "invalid_request" ? "none" : "required"`, `cleanup: "none"`],
 ["tenant mismatch distinct reason", `|| authority.tenantId !== request.requestedTenantId) return refuse("authority_required");`, `) return refuse("authority_required");\n if (authority.tenantId !== request.requestedTenantId) return refuse("invalid_request");`],
 ["tombstone carries content", `.map(jobId => ({ jobId }));`, `.map(jobId => ({ jobId, reference: "WO-leak" }));`],
 ["refused keeps data", `const permitted = new Set(decision.admittedJobIds);`, `const permitted = new Set(decision.outcome === "allowed" ? decision.admittedJobIds : delivered);`],
 ["no exp>iat", `.strict().refine(c => c.exp > c.iat, { message: "expiry must follow issue time", path: ["exp"] });`, `.strict();`],
 ["default lifetime", `issuedAtSeconds: seconds, expiresAtSeconds: seconds,`, `issuedAtSeconds: seconds, expiresAtSeconds: seconds.default(9e12),`],
 ["token skips authority", `|| evaluateSyncDownloadV1(facts.data).outcome !== "allowed")`, `)`],
 ["claims carry role", `generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), aud:`, `role: z.string().optional(), generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), aud:`],
 ["page ignores authority loss", `if (decision.outcome === "refused") return { ...decision, nextAfterJobId: null };`, `if (decision.outcome === "refused" && false) return { ...decision, nextAfterJobId: null };`],
];
for (const [name, a, b] of muts) {
 if (!orig.includes(a)) { console.log(`NOAPPLY ${name}`); continue; }
 writeFileSync(file, orig.replace(a, b));
 let killed = false;
 try { execSync("npx vitest run --maxWorkers=2 src/sync-download.test.ts", { cwd: "packages/core", stdio: "pipe" }); } catch { killed = true; }
 console.log(`${killed ? "KILLED " : "SURVIVED"} ${name}`);
}
writeFileSync(file, orig);
