import { expect, it, vi } from "vitest";
const work = vi.hoisted(() => vi.fn().mockResolvedValue(new Response("{}")));
vi.mock("../../../../../../lib/managed-recovery-server", () => ({ managedRecoveryRequest: work }));
import { GET, POST } from "./route";
it("delegates both methods to the single boundary with the exact path scope", async () => {
  const params = { id: "job", caseId: "case" }, context = { params: Promise.resolve(params) };
  const request = new Request("https://practice.invalid/");
  await GET(request, context); expect(work).toHaveBeenLastCalledWith(request, params);
  await POST(request, context); expect(work).toHaveBeenLastCalledWith(request, params, true);
});
