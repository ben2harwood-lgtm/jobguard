import "server-only";
import { createHash, randomInt } from "node:crypto";
import { deflateSync } from "node:zlib";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ContractorError } from "@jobguard/core";
import { ContractorRepository, EvidenceService, ExtraApprovalError, WatchdogError, contractorSessionContext, northsideRole, type AuthenticatedMembership, type VerifiedTenantContext } from "@jobguard/db";
import { syntheticPool } from "./synthetic-server";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";

/** ENT-11a: the thin transport for the Northside practice demo. Synthetic mode only; the persisted session names the member and tenant, nothing else does. */
export const noStore = { "cache-control": "no-store" };
export class DemoError extends Error { constructor(readonly code: string, readonly status: number) { super(code); } }
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

export async function demoActor() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new DemoError("MODE_FORBIDDEN", 403);
  const sessionId = (await cookies()).get("jg_session")?.value;
  if (!sessionId) throw new DemoError("UNAUTHENTICATED", 401);
  const pool = syntheticPool();
  let member: AuthenticatedMembership;
  try { member = await new ContractorRepository(pool).resolveSession(sessionId); } catch { throw new DemoError("UNAUTHENTICATED", 401); }
  const context: VerifiedTenantContext = await contractorSessionContext(pool, sessionId);
  const role = await northsideRole(pool, member);
  if (!role) throw new DemoError("UNAUTHENTICATED", 401);
  return { pool, member, context, role };
}
export function requireOrigin(request: Request) { if (!isTrustedBrowserOrigin(request)) throw new DemoError("ORIGIN_FORBIDDEN", 403); }
export async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  try { const body = await request.json(); if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>; } catch { /* fall through */ }
  throw new DemoError("INVALID_COMMAND", 422);
}
const statusOf: Record<string, number> = { NOT_FOUND: 404, PERMISSION_DENIED: 403, LINK_INVALID: 403, EMAIL_MISMATCH: 403, INVALID_COMMAND: 422, UNPRICED: 409, DATABASE_UNAVAILABLE: 503 };
/** Only closed codes leave the server. */
export function failure(error: unknown) {
  if (error instanceof DemoError) return json({ code: error.code }, error.status);
  if (error instanceof ExtraApprovalError) return json({ code: error.code }, statusOf[error.code] ?? 409);
  if (error instanceof WatchdogError) return json({ code: error.code }, 409);
  if (error instanceof ContractorError) return json({ code: error.code }, error.code === "UNAUTHENTICATED" ? 401 : 409);
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[A-Z_]{3,40}$/u.test(code)) return json({ code }, 409);
  return json({ code: "DEMO_UNAVAILABLE" }, 503);
}

/** Practice-only photo store: bytes live in this server process, keyed by object, and are never sent anywhere. */
type StoredObject = { key: string; versionId: string; bytes: Uint8Array; byteLength: number; contentType: string };
class PracticeStorage {
  versions = new Map<string, StoredObject>();
  put(key: string, versionId: string, bytes: Uint8Array, contentType = "image/png") { this.versions.set(`${key}:${versionId}`, { key, versionId, bytes, byteLength: bytes.length, contentType }); }
  async createUploadUrl({ key, expiresInSeconds }: { key: string; contentType: string; expiresInSeconds: number }) { return `memory://put/${key}?expires=${expiresInSeconds}`; }
  async createDownloadUrl({ key, versionId, expiresInSeconds }: { key: string; versionId: string; expiresInSeconds: number }) { return `memory://get/${key}?version=${versionId}&expires=${expiresInSeconds}`; }
  async readExactVersion(key: string, versionId: string) { const value = this.versions.get(`${key}:${versionId}`); if (!value) throw new Error("not found"); return value; }
  async deleteExactVersion(key: string, versionId: string) { this.versions.delete(`${key}:${versionId}`); }
}
const registry = globalThis as typeof globalThis & { __northsidePhotos?: PracticeStorage };
export const practiceStorage = () => (registry.__northsidePhotos ??= new PracticeStorage());
export const evidenceService = () => new EvidenceService(syntheticPool(), practiceStorage());
/** A complete 1x1 PNG whose pixel bytes depend on the seed, so each practice photo has its own SHA-256. */
export function practicePng(): { bytes: Uint8Array; sha256: string } {
  const seed = randomInt(0, 65536);
  const crc = (bytes: Buffer) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const name = Buffer.from(type), out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc(Buffer.concat([name, data])), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, seed & 255, (seed >> 8) & 255, 40]))), chunk("IEND", Buffer.alloc(0))]);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
