import { platformDocumentsRequest } from "../../../lib/platform-documents-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return platformDocumentsRequest(request); }
