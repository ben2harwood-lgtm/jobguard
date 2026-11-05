import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { EnterpriseLivePromptRepository } from "@jobguard/db";
import { EnterpriseLivePromptPersistenceError } from "@jobguard/core";
import { syntheticPool } from "../../../../../lib/synthetic-server";
const headers = { "cache-control": "no-store" };
const querySchema = z.object({
 limit: z.string().regex(/^[1-9]\d{0,2}$/u).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
 after: z.guid().optional(),
}).strict();
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 const error = (status: number, code: string) => NextResponse.json({ version: "office-signals-error.v1", code }, { status, headers });
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") return error(403, "MODE_FORBIDDEN");
 const session = z.guid().safeParse((await cookies()).get("jg_session")?.value);
 if (!session.success) return error(401, "UNAUTHENTICATED");
 const job = z.guid().safeParse((await context.params).id);
 const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if (!job.success || !query.success) return error(400, "INVALID_PROMPT_COMMAND");
 try {
  const result = await new EnterpriseLivePromptRepository(syntheticPool()).officeSignals(session.data, { version: "office-signals.v1", jobId: job.data, ...query.data });
  return NextResponse.json(result, { headers });
 } catch (cause) {
  const code = cause instanceof EnterpriseLivePromptPersistenceError ? cause.code : (cause as {code?:unknown})?.code;
  if (code === "EXTRA_FORBIDDEN") return error(404, "NOT_FOUND");
  if (code === "UNAUTHENTICATED") return error(401, "UNAUTHENTICATED");
  if (code === "INVALID_PROMPT_COMMAND") return error(400, code);
  return error(503, "OFFICE_SIGNALS_UNAVAILABLE");
 }
}
