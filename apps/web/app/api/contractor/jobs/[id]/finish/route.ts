import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { contractorJobFinishV1 } from "@jobguard/core";
import { EnterpriseLivePromptRepository } from "@jobguard/db";
import { enterpriseLivePromptHttpFailure, PromptBoundaryError } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../origin";
const headers = { "cache-control": "no-store" };
const bodySchema = contractorJobFinishV1.omit({ jobId: true });
/** Tenant, actor, agreement enablement and completion time are server facts. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  if (!isTrustedBrowserOrigin(request)) throw new PromptBoundaryError("ORIGIN_FORBIDDEN");
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PromptBoundaryError("MODE_FORBIDDEN");
  const session = (await cookies()).get("jg_session")?.value;
  if (!z.guid().safeParse(session).success) throw new PromptBoundaryError("UNAUTHENTICATED");
  let raw: unknown;
  try { raw = await request.json(); } catch { throw new PromptBoundaryError("INVALID_PROMPT_COMMAND"); }
  const body = bodySchema.safeParse(raw), job = z.guid().safeParse((await context.params).id);
  if (!body.success || !job.success) throw new PromptBoundaryError("INVALID_PROMPT_COMMAND");
  const result = await new EnterpriseLivePromptRepository(syntheticPool()).endCheck(session!, { ...body.data, jobId: job.data });
  return NextResponse.json(result, { status: 201, headers });
 } catch (error) {
  const failure = enterpriseLivePromptHttpFailure(error);
  return NextResponse.json(failure.body, { status: failure.status, headers });
 }
}
