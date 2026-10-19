# Archive: leftovers from merged JobGuard worktrees (19 Oct 2026)

Ben (18 Oct, chat "Today's build plan (18 Oct)"): "do the disk cleanup". Disk was 24-31 GB free; builders stop below 40 GB.
Each zip holds the untracked scratch/test-config files of one worktree whose branch is already merged into main. Each was verified to open and match byte for byte before its worktree was removed. Installed packages (node_modules) are rebuildable and were not archived. Each removed worktree's commit is kept by an archive/2026-10-19/<worktree> tag.
