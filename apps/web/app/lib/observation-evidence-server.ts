import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { EnterpriseLivePromptRepository } from "@jobguard/db";
import { syntheticPool } from "./synthetic-server";

const item = z.object({ evidenceId: z.guid(), sha256: z.string().regex(/^[a-f0-9]{64}$/u),
 objectVersion: z.string().min(1), mediaKind: z.enum(["completion_photo", "completion_note"]),
 photoTags: z.array(z.string()), capturedAt: z.string().nullable() }).strict();
export const observationEvidenceV1 = z.object({ version: z.literal("observation-evidence.v1"), items: z.array(item) }).strict();
/** Session-only browser read: no caller-selected identity, query filters or machine authority. */
export async function observationEvidenceResponse(request: Request, params: Promise<{ id: string }>) {
 const headers = { "cache-control": "no-store" };
 const refuse = (status: number, code: string) => NextResponse.json({ version: "observation-evidence-error.v1", code }, { status, headers });
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") return refuse(403, "MODE_FORBIDDEN");
 const session = (await cookies()).get("jg_session")?.value;
 if (!z.guid().safeParse(session).success) return refuse(401, "UNAUTHENTICATED");
 const { id } = await params;
 if (!z.guid().safeParse(id).success || new URL(request.url).search) return refuse(400, "INVALID_REQUEST");
 try {
  const result = await new EnterpriseLivePromptRepository(syntheticPool()).observationEvidence(session!, id);
  return NextResponse.json(observationEvidenceV1.parse(result), { headers });
 } catch (error) {
  const code = (error as { code?: string }).code;
  if (["42501", "FORBIDDEN", "EXTRA_FORBIDDEN", "JOB_NOT_LIVE", "UNAUTHENTICATED", "MODE_FORBIDDEN", "PROMPT_PRACTICE_ONLY", "PLAN_FEATURE_DISABLED"].includes(code ?? "")) return refuse(404, "NOT_FOUND");
  return refuse(503, "EVIDENCE_UNAVAILABLE");
 }
}
