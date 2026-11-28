import "server-only";
import { commercialFailure, commercialJson, commercialReader, workListQuery } from "./transport";
/** GET: the caller's open extras, one state each, scoped by the session's grants (contract extra-commercial-reads-v1, work list). */
export async function GET(request: Request) {
 try {
  const query = workListQuery(request);
  const { repository, context, session } = await commercialReader();
  return commercialJson(await repository.workList(context, session, query));
 } catch (error) { return commercialFailure(error); }
}
