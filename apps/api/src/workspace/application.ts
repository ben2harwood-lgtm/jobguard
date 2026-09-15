import type { Pool } from "pg";
import { WorkspaceService } from "./workspace.service.js";
import { SandboxRepository } from "@jobguard/db";
import { SandboxService } from "../sandbox/sandbox.service.js";

/** The sole server-composition seam shared by Nest and deployed Next route adapters. */
export function createWorkspaceApplication(dependencies: { pool: Pool }) {
  const jobs = new WorkspaceService(dependencies.pool);
  const sandbox = new SandboxService(new SandboxRepository(dependencies.pool));
  return Object.freeze({ jobs: Object.freeze({ get: jobs.getJob.bind(jobs) }), sandbox:Object.freeze({create:sandbox.create.bind(sandbox),get:sandbox.get.bind(sandbox),reset:sandbox.reset.bind(sandbox),archive:sandbox.archive.bind(sandbox),advance:sandbox.advance.bind(sandbox)}) });
}
