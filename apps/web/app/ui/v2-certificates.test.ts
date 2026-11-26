import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import JobRecordsPage from "../(designed)/jobs/[id]/records/page";
import { PilotJobs } from "../(designed)/pilot-jobs";
import { V2CertificatesPanel } from "./v2-certificates-panel";
import { certificateStorageKey, isCertificateTickValid, parseCertificateTicks, serialiseCertificateTicks,
  v2Certificates, V2_CERTIFICATES_TEMPLATE_KEY } from "./v2-certificates";

vi.mock("../(designed)/pilot-jobs", () => ({ PilotJobs: () => null }));
vi.mock("../(designed)/jobs-screens", () => ({ DesignedJob: () => null }));
vi.mock("./job-sources", () => ({ JobDiary: () => null, CustomerMessages: () => null }));
vi.mock("./v2-certificates-panel", () => ({ V2CertificatesPanel: () => null }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Q30 V2-G0 certificate drafts", () => {
  it("has five complete, uniquely keyed records for the existing template", () => {
    const certificates = v2Certificates[V2_CERTIFICATES_TEMPLATE_KEY]!;
    expect(certificates).toHaveLength(5);
    expect(new Set(certificates.map(certificate => certificate.key)).size).toBe(5);
    for (const certificate of certificates) {
      for (const field of [certificate.key, certificate.label, certificate.when, certificate.whoIssues]) {
        expect(field.trim()).not.toBe("");
      }
      expect(["always", "if"]).toContain(certificate.needed);
      if (certificate.needed === "if") expect(certificate.when).toMatch(/^If /);
    }
    expect(certificates.filter(certificate => certificate.needed === "always").map(certificate => certificate.key))
      .toEqual(["tile-data", "paint-data"]);
    expect(certificates[0]!.label).toBe("Minor Electrical Installation Works Certificate (BS 7671)");
    expect(certificates.some(certificate => certificate.label.includes("Part P"))).toBe(false);
  });

  it("requires a nonblank reason of at most 200 characters for Not needed", () => {
    for (const reason of ["", "   ", "x".repeat(201)]) {
      expect(isCertificateTickValid({ status: "not_needed", reason })).toBe(false);
    }
    expect(isCertificateTickValid({ status: "not_needed", reason: "No sockets moved." })).toBe(true);
    expect(isCertificateTickValid({ status: "not_needed", reason: "x".repeat(200) })).toBe(true);
    for (const status of ["got_it", "still_needed"] as const) {
      expect(isCertificateTickValid({ status, reason: "" })).toBe(true);
    }
  });

  it("round-trips valid device drafts, excluding an unexplained exemption and unknown entries", () => {
    const saved = serialiseCertificateTicks({
      electrical: { status: "not_needed", reason: "  No sockets moved.  " },
      gas: { status: "not_needed", reason: "" },
      "tile-data": { status: "got_it", reason: "" },
      "paint-data": { status: "still_needed", reason: "" },
      unknown: { status: "got_it", reason: "" },
    });
    expect(parseCertificateTicks(saved)).toEqual({
      electrical: { status: "not_needed", reason: "No sockets moved." },
      "tile-data": { status: "got_it", reason: "" },
      "paint-data": { status: "still_needed", reason: "" },
    });
    expect(parseCertificateTicks(null)).toEqual({});
    expect(parseCertificateTicks(saved, "unknown-template")).toEqual({});
  });

  it("rejects corrupt, unversioned, invalid or overlong saved ticks", () => {
    for (const raw of ["not JSON", "null", "[]", '{}', '{"version":"old","ticks":{}}',
      ...["", "x".repeat(201)].map(reason => JSON.stringify({ version: "v2-certificates.v1",
        ticks: { gas: { status: "not_needed", reason } } })),
      '{"version":"v2-certificates.v1","ticks":{"gas":{"status":"issued","reason":""}}}',
    ]) expect(() => parseCertificateTicks(raw)).toThrow();
  });

  it("separates storage by job and template without delimiter collisions", () => {
    expect(certificateStorageKey("job-a")).toContain("job-a");
    expect(certificateStorageKey("job-a")).not.toBe(certificateStorageKey("job-b"));
    expect(certificateStorageKey("job-a", "other")).not.toBe(certificateStorageKey("job-a"));
    expect(certificateStorageKey("a:b", "c")).not.toBe(certificateStorageKey("a", "b:c"));
  });

  it("mounts the checklist exactly once only in V2 and keeps the job binding", async () => {
    vi.stubGlobal("React", React);
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    for (const mode of [undefined, "0", "true", "1"]) {
      vi.stubEnv("JOBGUARD_LOCAL_V2", mode);
      const page = await JobRecordsPage({ params: Promise.resolve({ id: "job-a" }) });
      const children = page.props.children.filter((child: unknown) => child && typeof child === "object");
      const panels = children.filter((child: { type: unknown }) => child.type === V2CertificatesPanel);
      expect(panels).toHaveLength(mode === "1" ? 1 : 0);
      expect(children).toHaveLength(mode === "1" ? 3 : 2);
      if (mode === "1") expect(panels[0].props.jobId).toBe("job-a");
    }
  });
  it("preserves the pilot records screen without mounting device-only V2 drafts", async () => {
    vi.stubGlobal("React", React);
    vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
    for (const mode of [undefined, "1"]) {
      vi.stubEnv("JOBGUARD_LOCAL_V2", mode);
      const page = await JobRecordsPage({ params: Promise.resolve({ id: "pilot-job" }) });
      expect(page.type).toBe(PilotJobs);
      expect(page.props).toEqual({ screen: "review", jobId: "pilot-job" });
    }
  });
});
