import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { JobImportV3Repository, JobImportV3Error } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { JobImportV3Application } from "./job-import-v3.application.js";
import { JobImportV3Controller } from "./job-import-v3.controller.js";

afterEach(() => vi.restoreAllMocks());
describe("CH-5 API authority", () => {
  it("checks current job ownership before every preview, import, read or malformed request", async () => {
    const job = vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(new Error("denied"));
    const preview = vi.spyOn(JobImportV3Repository.prototype, "preview"), adopt = vi.spyOn(JobImportV3Repository.prototype, "adopt"), read = vi.spyOn(JobImportV3Repository.prototype, "read");
    const app = new JobImportV3Application({} as Pool, "session");
    await expect(app.preview("foreign", {})).rejects.toThrow("denied");
    await expect(app.adopt("foreign", {})).rejects.toThrow("denied");
    await expect(app.read("foreign")).rejects.toThrow("denied");
    expect(job).toHaveBeenCalledTimes(3); expect(preview).not.toHaveBeenCalled(); expect(adopt).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it("maps live admission refusal to a typed conflict", async () => {
    vi.spyOn(JobImportV3Application.prototype, "adopt").mockRejectedValue(new JobImportV3Error("METER_PLACE_SOURCE_HANDOFF_HELD"));
    await expect(new JobImportV3Controller({} as Pool).adopt({ headers: {} }, "job", {})).rejects.toMatchObject({ status: 409, response: { code: "METER_PLACE_SOURCE_HANDOFF_HELD" } });
  });
});
