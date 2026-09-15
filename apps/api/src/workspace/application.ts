import type { Pool } from "pg";
import { WorkspaceService } from "./workspace.service.js";

/** The sole server-composition seam shared by Nest and deployed Next route adapters. */
export function createWorkspaceApplication(dependencies: { pool: Pool }) {
  const jobs = new WorkspaceService(dependencies.pool);
  return Object.freeze({ jobs: Object.freeze({ get: jobs.getJob.bind(jobs) }) });
}
