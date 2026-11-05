import "server-only";
import { z } from "zod";
import { ExtraApprovalRepository, markDuplicateV1, readExtraDuplicateCandidates, ExtraApprovalError } from "@jobguard/db";
import { isTrustedBrowserOrigin } from "../../../origin";
import { duplicateActor, duplicateFailure, duplicateJson } from "./transport";
const bodySchema = markDuplicateV1.omit({ jobId: true }).strict();
type Route = { params: Promise<{ id: string }> };
export async function GET(_request: Request, route: Route) {
 try {
  const { pool, actor, context } = await duplicateActor();
  return duplicateJson(await readExtraDuplicateCandidates(pool, context, actor, (await route.params).id));
 } catch (error) { return duplicateFailure(error); }
}
export async function POST(request: Request, route: Route) {
 if (!isTrustedBrowserOrigin(request)) return duplicateFailure({ code: "ORIGIN_FORBIDDEN" });
 try {
  const { pool, actor, context } = await duplicateActor();
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const id = z.guid().safeParse((await route.params).id);
  if (!body.success || !id.success) throw new ExtraApprovalError("INVALID_COMMAND");
  return duplicateJson(await new ExtraApprovalRepository(pool).markDuplicate(context, actor, { ...body.data, jobId: id.data }));
 } catch (error) { return duplicateFailure(error); }
}
