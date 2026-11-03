import { ContractorEntitlementAuthorityRepository } from "@jobguard/db";
// ENT-3d application boundary: log-site-extra.v3 beside v1. Written before the application, controller and repository changes.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { ContractorRepository, SiteExtraRepository, type AuthenticatedMembership } from "@jobguard/db";
import { SiteExtraError, siteExtraHttpStatus, siteExtraLoggedV3, siteExtraLoggedV1, siteExtraContentSha256V1 } from "@jobguard/core";
import { SiteExtraApplication, siteExtraHttpFailure } from "./site-extra.application.js";
import { SiteExtraController } from "./site-extra.controller.js";
import { createWorkspaceApplication } from "../workspace/application.js";
const photoId = "00000000-0000-4000-8000-0000000000aa", shown = "c".repeat(64);
const v1 = () => ({ version: "log-site-extra.v1", commandId: crypto.randomUUID(), note: "Fictional note", description: "Fictional extra" });
const v3 = (extra: Record<string, unknown> = {}) => ({ ...v1(), version: "log-site-extra.v3", ...extra });
const member = () => ({ tenantId: crypto.randomUUID(), membershipId: crypto.randomUUID(), identityUserId: crypto.randomUUID() }) as AuthenticatedMembership;
const forbiddenKeys = ["evidenceId", "residentConfirmationEvidenceId", "confirmationId", "document", "documentText", "documentSha256", "contentHash", "contentSha256", "content", "label", "statement", "residentName", "name", "signature", "signedAt", "confirmedAt", "confirmedBy", "evidenceType", "contentType", "sha256", "photoSha256", "photo", "objectKey", "objectVersionId", "uploadId", "siteVisitId", "tenantId", "membershipId", "role", "commandType", "grantId"];
beforeEach(() => { vi.spyOn(ContractorEntitlementAuthorityRepository.prototype, "requireFeature").mockResolvedValue(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("ENT-3d application boundary", () => {
 it("[E5] a v3 body reaches the repository with only parsed values, each evidence field only when present", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), m = member(), sessionId = crypto.randomUUID(), jobId = crypto.randomUUID();
  vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
  const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockResolvedValue({ variationId: crypto.randomUUID() });
  const app = createWorkspaceApplication({ pool, sessionId }).siteExtras;
  const minimal = v3(), both = v3({ photoEvidenceId: photoId, residentConfirmation: { shownContentSha256: shown } }), photoOnly = v3({ photoEvidenceId: photoId }), shownOnly = v3({ residentConfirmation: { shownContentSha256: shown } });
  for (const raw of [minimal, both, photoOnly, shownOnly]) await app.log(jobId, raw);
  const base = (raw: { commandId: string; note: string; description: string }) => ({ commandId: raw.commandId, jobId, note: raw.note, description: raw.description });
  expect(repo.mock.calls.map(call => call[2])).toEqual([base(minimal), { ...base(both), photoEvidenceId: photoId, shownContentSha256: shown }, { ...base(photoOnly), photoEvidenceId: photoId }, { ...base(shownOnly), shownContentSha256: shown }]);
  for (const call of repo.mock.calls) { expect(call[1]).toBe(m); expect(Object.keys(call[2] as object).sort()).not.toContain("version"); }
  await pool.end();
 });
 it("[E5] a different tenant, member or role in the body, path, cookie or principal changes nothing; each forbidden key is INVALID_COMMAND (400) before the service", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://app.fictional.invalid");
  const pool = new Pool(), m = member(), sessionId = crypto.randomUUID(), jobId = crypto.randomUUID(), controller = new SiteExtraController(pool);
  vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
  const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockResolvedValue({ variationId: crypto.randomUUID() });
  const cookie = `jg_session=${sessionId}; tenantId=${crypto.randomUUID()}; membershipId=${crypto.randomUUID()}; role=owner`;
  await controller.log(jobId, cookie, "https://app.fictional.invalid", v3({ photoEvidenceId: photoId })); expect(repo.mock.calls[0]![0].tenantId).toBe(m.tenantId); expect(repo.mock.calls[0]![1]).toBe(m);
  for (const key of forbiddenKeys) await expect(controller.log(jobId, cookie, "https://app.fictional.invalid", v3({ [key]: key === "role" ? "owner" : crypto.randomUUID() })), key).rejects.toMatchObject({ status: 400 });
  for (const key of ["name", "signature", "document", "contentSha256", "confirmed", "time"]) await expect(controller.log(jobId, cookie, "https://app.fictional.invalid", v3({ residentConfirmation: { shownContentSha256: shown, [key]: "x" } })), key).rejects.toMatchObject({ status: 400 });
  for (const bad of ["C".repeat(64), "c".repeat(63), "c".repeat(65), "g".repeat(64)]) await expect(controller.log(jobId, cookie, "https://app.fictional.invalid", v3({ residentConfirmation: { shownContentSha256: bad } }))).rejects.toMatchObject({ status: 400 });
  // v3 fields under the v1 version, and v1 fields under the v3 version, are both invalid.
  await expect(controller.log(jobId, cookie, "https://app.fictional.invalid", { ...v1(), photoEvidenceId: photoId })).rejects.toMatchObject({ status: 400 });
  await expect(controller.log(jobId, cookie, "https://app.fictional.invalid", { ...v3(), version: "log-site-extra.v2" })).rejects.toMatchObject({ status: 400 });
  await expect(new SiteExtraApplication(pool).log({ version: "contractor-principal.v1", sessionId, tenantId: crypto.randomUUID(), membershipId: crypto.randomUUID(), role: "owner" }, jobId, v3())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(repo).toHaveBeenCalledOnce(); await pool.end();
 });
 it("[E5] the v3 answer has exactly the v3 shape, with the content hash computed from the stored facts or the request", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), sessionId = crypto.randomUUID(), jobId = crypto.randomUUID(), extraId = crypto.randomUUID(), confirmation = crypto.randomUUID(), content = "d".repeat(64);
  vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
  const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockResolvedValue({ variationId: extraId, evidence: { photoEvidenceId: photoId, residentConfirmationEvidenceId: confirmation, contentSha256: content } });
  const app = createWorkspaceApplication({ pool, sessionId }).siteExtras;
  const answer = await app.log(jobId, v3({ photoEvidenceId: photoId, residentConfirmation: { shownContentSha256: shown } }));
  expect(answer).toEqual({ version: "site-extra-logged.v3", environment: "synthetic_demo", realExternalActions: 0, jobId, extraId, state: "logged", evidence: { photoEvidenceId: photoId, residentConfirmationEvidenceId: confirmation, contentFormat: "site-extra-content.v1", contentSha256: content } });
  expect(siteExtraLoggedV3.parse(answer)).toEqual(answer);
  // No evidence: the content hash is the pure core function of the request, with no photo.
  repo.mockResolvedValueOnce({ variationId: extraId }); const raw = v3(), plain = await app.log(jobId, raw);
  expect(plain).toEqual({ version: "site-extra-logged.v3", environment: "synthetic_demo", realExternalActions: 0, jobId, extraId, state: "logged", evidence: { photoEvidenceId: null, residentConfirmationEvidenceId: null, contentFormat: "site-extra-content.v1", contentSha256: siteExtraContentSha256V1({ jobId, description: raw.description, note: raw.note, photoSha256: null }) } });
  await pool.end();
 });
 it("[E5] a v1 body gets today's v1 answer unchanged, and v1 and v3 bodies are accepted side by side", async () => {
  // Named so that a later three-way version (v1, v2, v3, added by whichever piece merges second) can extend it.
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), sessionId = crypto.randomUUID(), jobId = crypto.randomUUID(), extraId = crypto.randomUUID();
  vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
  const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockResolvedValue({ variationId: extraId });
  const app = createWorkspaceApplication({ pool, sessionId }).siteExtras, one = v1();
  const first = await app.log(jobId, one);
  expect(first).toEqual({ version: "site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, extraId, state: "logged" }); expect(siteExtraLoggedV1.parse(first)).toEqual(first);
  expect(repo.mock.calls[0]![2]).toEqual({ commandId: one.commandId, jobId, note: one.note, description: one.description });
  const second = await app.log(jobId, v3({ photoEvidenceId: photoId }));
  expect(second).toMatchObject({ version: "site-extra-logged.v3", extraId }); expect(await app.log(jobId, one)).toEqual(first);
  await pool.end();
 });
 it("[E5] the two new codes come back as the code-only envelope, status 422", () => {
  for (const code of ["PHOTO_NOT_ACCEPTED", "CONFIRMATION_MISMATCH"] as const) {
   const failure = siteExtraHttpFailure(new SiteExtraError(code));
   expect(failure).toEqual({ status: 422, body: { version: "site-extra-error.v1", code } }); expect(siteExtraHttpStatus(code)).toBe(422);
   expect(Object.keys(failure.body)).toEqual(["version", "code"]);
  }
  expect(siteExtraHttpFailure(new SiteExtraError("COMMAND_CONFLICT"))).toEqual({ status: 409, body: { code: "IDEMPOTENCY_CONFLICT" } });
 });
 it("[E5] the controller answers a repository refusal with the code-only body and keeps no-store on the route", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://app.fictional.invalid"); const pool = new Pool();
  vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
  for (const code of ["PHOTO_NOT_ACCEPTED", "CONFIRMATION_MISMATCH"] as const) {
   vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockRejectedValue(new SiteExtraError(code));
   await expect(new SiteExtraController(pool).log(crypto.randomUUID(), `jg_session=${crypto.randomUUID()}`, "https://app.fictional.invalid", v3({ photoEvidenceId: photoId }))).rejects.toMatchObject({ status: 422, response: { version: "site-extra-error.v1", code } });
  }
  const headers = Reflect.getMetadata("__headers__", SiteExtraController.prototype.log) as Array<{ name: string; value: string }>;
  expect(headers).toContainEqual({ name: "Cache-Control", value: "no-store" }); await pool.end();
 });
});

describe("ENT-3d source rules", () => {
 const root = resolve(process.cwd(), "../..");
 const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => { const path = resolve(dir, name); return statSync(path).isDirectory() ? (name === "node_modules" || name === "dist" ? [] : sources(path)) : /\.(?:ts|tsx|mjs)$/u.test(name) && !/\.(?:test|spec)\./u.test(name) ? [path] : []; });
 const files = [...sources(resolve(root, "apps/api/src")), ...sources(resolve(root, "apps/web/app")), ...readdirSync(resolve(root, "packages")).filter(n => statSync(resolve(root, "packages", n)).isDirectory()).flatMap(n => { try { return sources(resolve(root, "packages", n, "src")); } catch { return []; } })];
 it("[E6] the writer's routine name appears in exactly one application source file, once; the repository still meets the four ENT-3a text conditions", () => {
  const holders = files.filter(file => readFileSync(file, "utf8").includes("ent3d_record_resident_confirmation")).map(file => relative(root, file));
  expect(holders).toEqual(["packages/db/src/site-extra-repository.ts"]);
  const source = readFileSync(resolve(root, holders[0]!), "utf8");
  expect(source.match(/ent3d_record_resident_confirmation/gu)).toHaveLength(1);
  expect(source.match(/LogSiteExtra/gu)).toHaveLength(1); expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/u); expect(source).toMatch(/await siteExtraAuthoritySeam\(db, fact\)/u);
  expect(source).not.toMatch(/(?:logSiteExtra|siteExtraAuthoritySeam)\([^)]*commandType/u);
  const callers = files.filter(file => /\.raiseExtra\s*\(/u.test(readFileSync(file, "utf8"))).map(file => relative(root, file)); expect(callers).toEqual(["packages/db/src/site-extra-repository.ts"]);
 });
 it("[E6] none of the source files in the lane contains the text commandType: with a quote", () => {
  const lane = ["packages/core/src/site-extra-evidence.ts", "packages/core/src/site-extra.ts", "packages/db/src/site-extra-repository.ts", "apps/api/src/contractor/site-extra.application.ts", "apps/api/src/contractor/site-extra.controller.ts", "apps/web/app/api/contractor/jobs/[id]/site-extras/route.ts"];
  for (const file of lane) expect(readFileSync(resolve(root, file), "utf8"), file).not.toContain('commandType: "');
 });
});
