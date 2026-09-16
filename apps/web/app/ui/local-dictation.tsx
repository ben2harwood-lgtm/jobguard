"use client";

import { useEffect, useRef, useState } from "react";

export type LocalAvailability = "installed" | "downloadable" | "downloading" | "unavailable";
export type LocalSpeechSession = { stop():void; cancel():void };
export type LocalSpeechAdapter = {
  readonly configuration:{language:"en-GB";processLocally:true;remoteFallback:false};
  available():Promise<LocalAvailability>;
  install():Promise<boolean>;
  start(callbacks:{interim(text:string):void;final(text:string,eventId:string):void;error(code:string):void;end():void}):LocalSpeechSession;
};

declare global { interface Window { __JOBGUARD_SPEECH_ADAPTER__?:LocalSpeechAdapter } }

type Recognition = {lang:string;interimResults:boolean;continuous:boolean;processLocally:boolean;start():void;stop():void;abort():void;onresult:((event:any)=>void)|null;onerror:((event:any)=>void)|null;onend:(()=>void)|null};
type RecognitionConstructor = {new():Recognition;prototype:object;available?(options:{langs:string[];processLocally:boolean}):Promise<string>;install?(options:{langs:string[];processLocally:boolean}):Promise<boolean>};

export function browserLocalSpeechAdapter():LocalSpeechAdapter|null {
  if(typeof window==="undefined")return null;
  if(window.__JOBGUARD_SPEECH_ADAPTER__)return window.__JOBGUARD_SPEECH_ADAPTER__;
  const C=(window as any).SpeechRecognition as RecognitionConstructor|undefined;
  // Static capability discovery plus a real prototype member are required. Assigning an expando is not evidence.
  if(!C || typeof C.available!=="function" || !("processLocally" in C.prototype))return null;
  return {configuration:{language:"en-GB",processLocally:true,remoteFallback:false},
    async available(){const value=await C.available!({langs:["en-GB"],processLocally:true});return value==="available"?"installed":value==="downloadable"?"downloadable":value==="downloading"?"downloading":"unavailable"},
    install:typeof C.install==="function"?()=>C.install!({langs:["en-GB"],processLocally:true}):async()=>false,
    start(callbacks){const recognition=new C();recognition.lang="en-GB";recognition.interimResults=true;recognition.continuous=true;recognition.processLocally=true;
      recognition.onresult=(event:any)=>{for(let i=event.resultIndex;i<event.results.length;i++){const result=event.results[i],text=String(result[0]?.transcript??"");result.isFinal?callbacks.final(text,`${i}:${text}`):callbacks.interim(text)}};
      recognition.onerror=(event:any)=>callbacks.error(String(event.error??"unknown"));recognition.onend=callbacks.end;recognition.start();
      return{stop:()=>recognition.stop(),cancel:()=>recognition.abort()};
    }};
}

export function LocalDictation({onUse}:{onUse:(text:string,raw:string)=>void}){
  const[adapter,setAdapter]=useState<LocalSpeechAdapter|null>(null),[availability,setAvailability]=useState<LocalAvailability|"checking">("checking"),[listening,setListening]=useState(false),[interim,setInterim]=useState(""),[finalText,setFinalText]=useState(""),[message,setMessage]=useState("");
  const session=useRef<LocalSpeechSession|null>(null), seen=useRef(new Set<string>());
  useEffect(()=>{const value=browserLocalSpeechAdapter();setAdapter(value);if(!value){setAvailability("unavailable");return}if(value.configuration.language!=="en-GB"||!value.configuration.processLocally||value.configuration.remoteFallback){setAvailability("unavailable");return}void value.available().then(setAvailability).catch(()=>setAvailability("unavailable"));return()=>{session.current?.cancel();session.current=null}},[]);
  function start(){if(!adapter||availability!=="installed")return;setMessage("");setInterim("");seen.current.clear();setListening(true);try{session.current=adapter.start({interim:setInterim,final:(text,id)=>{if(seen.current.has(id))return;seen.current.add(id);setFinalText(old=>`${old}${old?" ":""}${text}`.trim());setInterim("")},error:code=>{session.current?.cancel();session.current=null;setListening(false);setInterim("");setMessage(code==="no-speech"?"Microphone unavailable. You can type instead.":"Microphone unavailable. You can type instead.")},end:()=>{session.current=null;setListening(false);setInterim("")}})}catch{setListening(false);setMessage("Microphone unavailable. You can type instead.")}}
  function stop(){session.current?.stop();session.current=null;setListening(false);setInterim("")}
  function cancel(){session.current?.cancel();session.current=null;setListening(false);setInterim("");setFinalText("")}
  async function install(){if(!adapter)return;setAvailability("downloading");setMessage("Installing the on-device speech model… Progress is not provided by this browser.");try{await adapter.install();setAvailability(await adapter.available());setMessage("On-device speech model installed. Choose Talk through the example when you are ready.")}catch{setAvailability("downloadable");setMessage("The on-device speech model could not be installed. You can type instead.")}}
  const unavailable=availability==="unavailable"||availability==="checking";
  return <section className="dictation" aria-label="On-device dictation">
    <h2>Talk through the example</h2><p>Your browser must support an installed on-device English (UK) speech model. Audio never leaves this device and is never saved.</p>
    {availability==="unavailable"&&<p>On-device voice is unavailable in this browser. Type or use the example.</p>}
    {availability==="downloadable"&&<button type="button" onClick={()=>void install()}>Install on-device voice</button>}
    {availability==="downloading"&&<p>Installing the on-device speech model… Progress is not provided by this browser.</p>}
    <button type="button" disabled={unavailable||availability!=="installed"||listening} onClick={start}>Talk through the example</button>
    {listening&&<><p>Listening on this device</p><button type="button" onClick={stop}>Stop listening</button><button type="button" onClick={cancel}>Cancel dictation</button></>}
    {interim&&<p className="dictation-interim" data-testid="interim-transcript"><span>Provisional: </span>{interim}</p>}
    {finalText&&<><label htmlFor="dictation-final">Words to review</label><textarea id="dictation-final" value={finalText} onChange={e=>setFinalText(e.target.value)}/><button type="button" onClick={()=>onUse(finalText,[...seen.current].map(x=>x.slice(x.indexOf(":")+1)).join(" "))}>Use these words</button></>}
    {message&&<p>{message}</p>}
  </section>;
}
