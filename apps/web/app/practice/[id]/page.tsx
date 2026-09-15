import {PracticeRun} from "../../ui/practice-run";export default async function Page({params}:{params:Promise<{id:string}>}){return <PracticeRun runId={(await params).id}/>}
