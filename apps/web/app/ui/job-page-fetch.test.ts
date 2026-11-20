import { afterEach, describe, expect, it, vi } from "vitest";
import { JOB_SAVED_EVENT, jobPageFetch } from "./job-page-fetch";

afterEach(() => vi.unstubAllGlobals());

describe("job page save notifications", () => {
  it.each(["diary", "customer-messages", "proof", "variations", "supplier-documents/facts/confirm", "final-account/lock"])("publishes the saved job after a successful %s command", async path => {
    const window = new EventTarget(), saved = vi.fn();
    window.addEventListener(JOB_SAVED_EVENT, saved);
    vi.stubGlobal("window", window);
    const response = Response.json({ saved: true });
    const request = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", request);
    const options = { method: "POST", body: "exact command" };
    expect(await jobPageFetch(`/api/jobs/job-1/${path}`, options)).toBe(response);
    expect(request).toHaveBeenCalledWith(`/api/jobs/job-1/${path}`, options);
    expect(saved).toHaveBeenCalledOnce();
    expect(saved.mock.calls[0]![0].detail).toEqual({ jobId: "job-1" });
    expect(await response.json()).toEqual({ saved: true });
  });

  it("does not publish reads, refusals, other endpoints or unknown outcomes", async () => {
    const window = new EventTarget(), saved = vi.fn();
    window.addEventListener(JOB_SAVED_EVENT, saved);
    vi.stubGlobal("window", window);
    const request = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", request);
    await jobPageFetch("/api/jobs/job-1/proof");
    await jobPageFetch("/api/jobs/job-1/proof", { method: "GET" });
    await jobPageFetch("/api/session", { method: "POST" });
    request.mockResolvedValueOnce(Response.json({}, { status: 409 }));
    await jobPageFetch("/api/jobs/job-1/proof", { method: "POST" });
    request.mockRejectedValueOnce(new Error("Connection lost"));
    await expect(jobPageFetch("/api/jobs/job-1/proof", { method: "POST" })).rejects.toThrow("Connection lost");
    expect(saved).not.toHaveBeenCalled();
  });
});
