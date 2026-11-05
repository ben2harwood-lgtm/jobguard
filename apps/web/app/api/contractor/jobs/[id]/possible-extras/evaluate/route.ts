import { promptSourcesResponse } from "../../../../../../lib/prompt-sources-server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return promptSourcesResponse(request, context.params, "evaluate");
}
