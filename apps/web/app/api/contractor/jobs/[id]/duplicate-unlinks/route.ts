import "server-only";
import { z } from "zod";
import { extraDuplicateUnlinkV1, ExtraPersistenceError } from "@jobguard/core";
import { ExtraRepository } from "@jobguard/db";
import { isTrustedBrowserOrigin } from "../../../origin";
import { duplicateActor, duplicateFailure, duplicateJson } from "../duplicate-candidates/transport";
const bodySchema = extraDuplicateUnlinkV1.omit({ jobId: true, actorMembershipId: true }).strict();
export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
 if (!isTrustedBrowserOrigin(request)) return duplicateFailure({ code: "ORIGIN_FORBIDDEN" });
 try {
  const { pool, actor, context } = await duplicateActor();
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const id = z.guid().safeParse((await route.params).id);
  if (!body.success || !id.success) throw new ExtraPersistenceError("INVALID_COMMAND");
  return duplicateJson(await new ExtraRepository(pool).unlinkDuplicate(context, { ...body.data, jobId: id.data, actorMembershipId: actor.membershipId }));
 } catch (error) { return duplicateFailure(error); }
}
