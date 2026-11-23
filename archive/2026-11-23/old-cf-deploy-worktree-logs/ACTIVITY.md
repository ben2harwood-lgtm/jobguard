# Archive: old cf-deploy worktree logs

2026-11-23, All-builds coordinator. Free disk was 41 GiB (< 45 GiB floor). Worktrees cf-deploy-54e3a125f and cf-deploy-ca648dfba are superseded demo deploy checkouts (live web is 517f0cc6, rehearsed pin ea10154b; both kept). Their only non-rebuildable files are the deploy logs, zipped here and verified byte-identical. node_modules, .open-next, .turbo and .wrangler are rebuildable caches. Worktrees then removed with plain git worktree remove. Supersedes the first commit of this archive, which missed the 54e3 logs.
