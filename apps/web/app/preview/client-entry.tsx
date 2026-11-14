'use client';
import { PreviewApp } from '../ui/premium/workspace';
import { NorthsideClient } from '../ui/premium/practice';
import { PracticeTransport } from '../ui/premium/transport';
export default function PreviewEntry(){return <PreviewApp createPracticeClient={()=>{let store:Storage|undefined;try{store=window.sessionStorage;}catch{/* Writes fail closed without a persistent interruption guard. */}return new NorthsideClient(new PracticeTransport(window.fetch.bind(window),store));}}/>;}
