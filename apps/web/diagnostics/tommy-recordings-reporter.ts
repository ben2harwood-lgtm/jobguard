import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";

const webRoot = resolve(__dirname, "..");
const metadataDir = resolve(webRoot, "test-results/tommy-recordings-meta");
const manualDir = resolve(webRoot, "test-results/tommy-recordings/manual-contexts");
const expected = new Map([
  ["ENT-11b.spec.ts", "Separate fictional client approval"],
  ["DEMO-J1-core-1000.spec.ts", "Separate unrelated-person access refusal"],
  ["DEMO-J2.spec.ts", "Separate unrelated-person access refusal"],
  ["DEMO-J3-shadow.spec.ts", "Separate authenticated customer approvals"],
]);
type Video = { path: string; role: string; roleBasis: string; bytes?: number; sha256?: string; error?: string };
type RecordedTest = {
  id: string; title: string; file: string; project: string; status: string; expectedStatus: string;
  retry: number; startedAt: string; durationMs: number; videos: Video[];
};
const manualFiles = () => existsSync(manualDir)
  ? readdirSync(manualDir).filter(name => name.endsWith(".webm")).map(name => resolve(manualDir, name)).sort()
  : [];
const displayPath = (path: string) => relative(webRoot, path);

export default class TommyRecordingsReporter implements Reporter {
  private before = new Map<string, Set<string>>();
  private records: RecordedTest[] = [];
  private problems: string[] = [];
  private active: string | undefined;

  onBegin(config: FullConfig, suite: Suite) {
    mkdirSync(metadataDir, { recursive: true });
    const tests = suite.allTests();
    if (config.workers !== 1 || config.projects.length !== 1 || config.projects[0]?.name !== "desktop") {
      this.problems.push("Recording attribution requires exactly one worker and the desktop project.");
    }
    if (tests.length !== 4 || new Set(tests.map(test => basename(test.location.file))).size !== 4 ||
        tests.some(test => !expected.has(basename(test.location.file)))) {
      this.problems.push("Discovery did not select exactly one of each of the four intended specs.");
    }
    if (manualFiles().length) this.problems.push("Manual video directory was not empty at the start of this execution.");
  }

  onTestBegin(test: TestCase) {
    if (this.active) this.problems.push("Overlapping tests prevent reliable supplemental-video attribution.");
    this.active = test.id;
    this.before.set(test.id, new Set(manualFiles()));
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const prior = this.before.get(test.id);
    if (!prior || this.active !== test.id) this.problems.push("Missing sequential test-start receipt for " + test.id);
    const supplemental = manualFiles().filter(path => !prior?.has(path));
    const videos: Video[] = result.attachments.filter(item => item.name === "video" && item.path).map(item => ({
      path: displayPath(item.path!), role: "Main page fixture",
      roleBasis: "Playwright's per-test video attachment",
    }));
    for (const path of supplemental) {
      result.attachments.push({ name: "supplemental-context-video", contentType: "video/webm", path });
      videos.push({
        path: displayPath(path),
        role: expected.get(basename(test.location.file)) ?? "Unclassified separate context",
        roleBasis: "New raw context video during this single-worker test; role described by the unchanged spec",
      });
    }
    const record: RecordedTest = {
      id: test.id, title: test.title, file: displayPath(test.location.file),
      project: test.parent.project()?.name ?? "unknown", status: result.status,
      expectedStatus: test.expectedStatus, retry: result.retry,
      startedAt: result.startTime.toISOString(), durationMs: result.duration, videos,
    };
    this.records.push(record);
    this.active = undefined;
    console.log("TOMMY_RECORDING_RECEIPT " + JSON.stringify(record));
  }

  async onEnd(result: FullResult) {
    mkdirSync(metadataDir, { recursive: true });
    let source: Record<string, unknown> | null = null;
    try {
      source = JSON.parse(readFileSync(resolve(metadataDir, "source-binding.json"), "utf8")) as Record<string, unknown>;
      if (source.checkoutSha !== source.expectedSha || source.productTree !== source.expectedProductTree ||
          !/^[0-9a-f]{40}$/.test(String(source.checkoutSha)) ||
          !/^[0-9a-f]{40}$/.test(String(source.productTree))) {
        this.problems.push("Source binding did not validate the expected checkout and product tree.");
      }
    } catch {
      this.problems.push("The workflow's source-binding receipt is unavailable.");
    }
    const bound = new Set<string>();
    for (const record of this.records) {
      const mains = record.videos.filter(video => video.role === "Main page fixture");
      const supplements = record.videos.filter(video => video.role !== "Main page fixture");
      if (mains.length !== 1 || supplements.length !== 1) {
        this.problems.push(record.id + ": expected one main and one separate-context video, observed " +
          mains.length + " main and " + supplements.length + " supplemental.");
      }
      for (const video of record.videos) {
        const path = resolve(webRoot, video.path);
        bound.add(path);
        try {
          video.bytes = statSync(path).size;
          if (!video.bytes) throw new Error("empty recording");
          const hash = createHash("sha256");
          for await (const chunk of createReadStream(path)) hash.update(chunk);
          video.sha256 = hash.digest("hex");
        } catch (error) {
          video.error = error instanceof Error ? error.message : String(error);
          this.problems.push(record.id + ": could not verify recorded bytes for " + video.path);
        }
      }
    }
    const unboundSupplementalVideos = manualFiles().filter(path => !bound.has(path)).map(displayPath);
    if (unboundSupplementalVideos.length) this.problems.push("Some separate-context videos could not be attributed.");
    const fourPassed = this.records.length === 4 && this.records.every(record =>
      record.status === "passed" && record.expectedStatus === "passed" && record.retry === 0);
    const complete = result.status === "passed" && fourPassed && this.problems.length === 0;
    const manifest = {
      version: "tommy-demo-recordings.v1",
      recordedAt: new Date().toISOString(),
      source,
      executionStatus: result.status,
      fourJourneysPassedWithRecordedFiles: complete,
      mediaValidation: "Nonempty files and SHA-256 only; playback review remains necessary.",
      environment: "Production Next build on the existing ephemeral synthetic CI database and real local worker.",
      viewport: { width: 1280, height: 800 },
      tests: this.records,
      unboundSupplementalVideos,
      problems: this.problems,
      limits: [
        "Genuine automated Chromium recordings; no generated UI, audio, narration, provider or product changes.",
        "Separate customer and access-refusal pages are separate videos, not part of the main page recording.",
        "The role labels derive from the unchanged source; view the files to verify their presentation.",
        "API and database assertions are evidenced by the test result and trace, not necessarily visible on video.",
        "These are synthetic CI journeys, not a hosted Cloudflare or real-device rehearsal.",
        "Raw automation speed and worker waits are preserved; no presentation pacing or edits were added.",
        "A timeout or cancellation may leave incomplete media; failed journeys are not complete demonstrations.",
      ],
    };
    writeFileSync(resolve(metadataDir, "recordings-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log("TOMMY_RECORDINGS_COMPLETE " + JSON.stringify({
      executionStatus: result.status, fourJourneysPassedWithRecordedFiles: complete,
      tests: this.records.length, problems: this.problems,
    }));
    if (result.status === "passed" && !complete) return { status: "failed" as const };
  }
}
