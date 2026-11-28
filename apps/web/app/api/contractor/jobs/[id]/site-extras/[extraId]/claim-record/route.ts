import "server-only";
import { commercialFailure, commercialJson, commercialReader, contractOption } from "../../../../../extra-work-list/transport";
type Route = { params: Promise<{ id: string; extraId: string }> };
/** GET: read-only, contractor session only; job and extra come from the path (contract extra-commercial-reads-v1). */
export async function GET(request: Request, route: Route) {
 try {
  const option = contractOption(request);
  const { id, extraId } = await route.params;
  const { repository, context, session } = await commercialReader();
  return commercialJson(await repository.claimRecord(context, session, id, extraId, option));
 } catch (error) { return commercialFailure(error); }
}
