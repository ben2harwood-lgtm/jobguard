import { notFound } from 'next/navigation';
import PreviewEntry from './client-entry';
import './preview.css';
export const dynamic='force-dynamic';
export const metadata={title:'JobGuard · interface preview',robots:{index:false,follow:false}};
/** A branch-preview surface, never a production product landing page. */
export default function Page(){
 if(process.env.VERCEL_ENV==='production'||(process.env.NODE_ENV==='production'&&process.env.VERCEL_ENV!=='preview'&&process.env.JOBGUARD_UI_PREVIEW!=='1'))notFound();
 return <PreviewEntry/>;
}
