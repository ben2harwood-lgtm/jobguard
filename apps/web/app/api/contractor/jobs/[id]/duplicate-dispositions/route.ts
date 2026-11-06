import "server-only";
import { resolveExtraDuplicateCandidates, duplicateDispositionV1, DuplicateDispositionError } from "@jobguard/db";
import { isTrustedBrowserOrigin } from "../../../origin";
import { duplicateActor, duplicateFailure, duplicateJson } from "../duplicate-candidates/transport";
export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
 if (!isTrustedBrowserOrigin(request)) return duplicateFailure({ code: "ORIGIN_FORBIDDEN" });
 try {
  const { pool, context, sessionId } = await duplicateActor();
  const parsed = duplicateDispositionV1.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new DuplicateDispositionError("INVALID_COMMAND");
  return duplicateJson(await resolveExtraDuplicateCandidates(pool, context, sessionId, (await route.params).id, parsed.data));
 } catch (error) { return duplicateFailure(error); }
}
