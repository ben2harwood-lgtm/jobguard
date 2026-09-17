import type { Pool } from "pg";
import { WorkspaceService } from "./workspace.service.js";
import { SandboxRepository } from "@jobguard/db";
import { SandboxService } from "../sandbox/sandbox.service.js";
import { CaptureApplication } from "../capture/capture.application.js";
import { QuoteApplication } from "../quote/quote.application.js";
import { VariationApplication } from "../variation/variation.application.js";
import { RecoveryApplication } from "./recovery.application.js";
import { DecisionsApplication } from "../decisions/decisions.application.js";
import { FeeIllustrationApplication } from "./fee-illustration.application.js";

/** The sole server-composition seam shared by Nest and deployed Next route adapters. */
export function createWorkspaceApplication(dependencies: { pool: Pool }) {
  const jobs = new WorkspaceService(dependencies.pool);
  const sandbox = new SandboxService(new SandboxRepository(dependencies.pool));
  const capture = new CaptureApplication(dependencies.pool);
  const quote = new QuoteApplication(dependencies.pool);
  const variation = new VariationApplication(dependencies.pool);
  const recovery = new RecoveryApplication(dependencies.pool);
  const decisions = new DecisionsApplication(dependencies.pool);
  const fees = new FeeIllustrationApplication(dependencies.pool);
  return Object.freeze({ fees:Object.freeze({read:fees.read.bind(fees),create:fees.create.bind(fees),whatIf:fees.whatIf.bind(fees)}), recovery:Object.freeze({read:recovery.read.bind(recovery),select:recovery.select.bind(recovery),approve:recovery.approve.bind(recovery)}), decisions:Object.freeze({list:decisions.list.bind(decisions),evaluate:decisions.evaluate.bind(decisions),dismiss:decisions.dismiss.bind(decisions)}), jobs: Object.freeze({ get: jobs.getJob.bind(jobs) }), capture:Object.freeze({create:capture.capture.bind(capture),get:capture.view.bind(capture),save:capture.save.bind(capture),confirm:capture.confirm.bind(capture)}),quote:Object.freeze({get:quote.get.bind(quote),save:quote.save.bind(quote),preview:quote.preview.bind(quote),issue:quote.issue.bind(quote),deliveryView:quote.deliveryView.bind(quote),execute:quote.execute.bind(quote),pdf:quote.pdf.bind(quote),acceptanceView:quote.acceptanceView.bind(quote),accept:quote.accept.bind(quote),disposition:quote.disposition.bind(quote),activationView:quote.activationView.bind(quote),activate:quote.activate.bind(quote)}),variation:Object.freeze({get:variation.get.bind(variation),command:variation.command.bind(variation)}), sandbox:Object.freeze({create:sandbox.create.bind(sandbox),get:sandbox.get.bind(sandbox),reset:sandbox.reset.bind(sandbox),archive:sandbox.archive.bind(sandbox),advance:sandbox.advance.bind(sandbox)}) });
}
