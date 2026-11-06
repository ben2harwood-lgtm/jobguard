import { expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn(async () => new Response("{}")));
vi.mock("../../../lib/platform-documents-server", () => ({ platformDocumentsRequest: read }));
import * as route from "./route";
it("exposes only a dynamic GET delegating the session read", async () => {
  const request = new Request("https://company.invalid/api/plans/platform-documents");
  await route.GET(request);
  expect(read).toHaveBeenCalledWith(request);
  expect(Object.keys(route).sort()).toEqual(["GET", "dynamic"]);
  expect(route.dynamic).toBe("force-dynamic");
});
