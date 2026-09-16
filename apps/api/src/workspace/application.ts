import type { Pool } from "pg";
import { WorkspaceService } from "./workspace.service.js";
import { SandboxRepository } from "@jobguard/db";
import { SandboxService } from "../sandbox/sandbox.service.js";
import { CaptureApplication } from "../capture/capture.application.js";
import { QuoteApplication } from "../quote/quote.application.js";

/** The sole server-composition seam shared by Nest and deployed Next route adapters. */
export function createWorkspaceApplication(dependencies: { pool: Pool }) {
  const jobs = new WorkspaceService(dependencies.pool);
  const sandbox = new SandboxService(new SandboxRepository(dependencies.pool));
  const capture = new CaptureApplication(dependencies.pool);
  const quote = new QuoteApplication(dependencies.pool);
  return Object.freeze({ jobs: Object.freeze({ get: jobs.getJob.bind(jobs) }), capture:Object.freeze({create:capture.capture.bind(capture),get:capture.view.bind(capture),save:capture.save.bind(capture),confirm:capture.confirm.bind(capture)}),quote:Object.freeze({get:quote.get.bind(quote),save:quote.save.bind(quote),preview:quote.preview.bind(quote),issue:quote.issue.bind(quote),deliveryView:quote.deliveryView.bind(quote),execute:quote.execute.bind(quote),pdf:quote.pdf.bind(quote)}), sandbox:Object.freeze({create:sandbox.create.bind(sandbox),get:sandbox.get.bind(sandbox),reset:sandbox.reset.bind(sandbox),archive:sandbox.archive.bind(sandbox),advance:sandbox.advance.bind(sandbox)}) });
}
