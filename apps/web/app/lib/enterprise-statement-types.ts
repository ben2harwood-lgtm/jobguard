import type { EnterpriseFeeRepository } from "@jobguard/db";

/** Browser response types inferred from the server repository; no runtime DB dependency. */
export type StatementView = {
  statement: Awaited<ReturnType<EnterpriseFeeRepository["readStatement"]>>;
  derivations: Awaited<ReturnType<EnterpriseFeeRepository["read"]>>[];
  postings: Awaited<ReturnType<EnterpriseFeeRepository["readPostings"]>>;
};
