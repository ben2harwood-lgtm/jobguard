import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["tools/core-purity-lint.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["tools/agent-lane-boundary-lint.mjs"], { stdio: "inherit" });
