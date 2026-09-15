import { WorkspaceShell } from "../../ui/workspace-shell";
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) { return <WorkspaceShell jobId={(await params).id}/>; }
