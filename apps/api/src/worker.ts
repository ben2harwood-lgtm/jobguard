// Graphile Worker and business tasks arrive in M0-9. This compose entrypoint is
// intentionally inert so M0-1 does not invent an execution mechanism.
console.log("JobGuard worker scaffold ready; no tasks are registered in M0-1.");
setInterval(() => undefined, 60_000);
