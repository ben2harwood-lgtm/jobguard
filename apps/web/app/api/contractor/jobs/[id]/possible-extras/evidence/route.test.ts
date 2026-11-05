import { expect, it, vi } from "vitest";
const transport = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/observation-evidence-server", () => ({ observationEvidenceResponse: transport }));
import { GET } from "./route";
it("passes only the GET request and route params to the session-only transport", async () => {
 const request = new Request("http://localhost/evidence"), params = Promise.resolve({ id: crypto.randomUUID() });
 const response = new Response("{}", { headers: { "cache-control": "no-store" } }); transport.mockResolvedValue(response);
 expect(await GET(request, { params })).toBe(response); expect(transport).toHaveBeenCalledWith(request, params);
});
