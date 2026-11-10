"use client";

import { useEffect, useRef, useState } from "react";
import { cancelLocalSpeech, createLocalSpeechAdapter, LOCAL_SPEECH_DOWNLOAD_MIB } from "./local-speech";

export type LocalAvailability = "installed" | "downloadable" | "downloading" | "unavailable";
export type LocalSpeechSession = { stop():void; cancel():void };
export type LocalSpeechAdapter = {
  readonly configuration:{language:"en-GB";processLocally:true;remoteFallback:false};
  available():Promise<LocalAvailability>;
  install():Promise<boolean>;
  start(callbacks:{interim(text:string):void;final(text:string,eventId:string):void;error(code:string):void;end():void}):LocalSpeechSession;
};

declare global { interface Window { __JOBGUARD_SPEECH_ADAPTER__?:LocalSpeechAdapter } }

// Retain the deterministic contract hook; real engines are created only on a tap.
export function browserLocalSpeechAdapter(_discoverNative=true):LocalSpeechAdapter|null {
  return typeof window === "undefined" ? null : window.__JOBGUARD_SPEECH_ADAPTER__ ?? null;
}

export function LocalDictation({onUse}:{onUse:(text:string,raw:string)=>void}){
  const[adapter,setAdapter]=useState<LocalSpeechAdapter|null>(null),[availability,setAvailability]=useState<LocalAvailability|"checking">("installed"),[listening,setListening]=useState(false),[interim,setInterim]=useState(""),[finalText,setFinalText]=useState(""),[message,setMessage]=useState("");
  const session=useRef<LocalSpeechSession|null>(null), seen=useRef(new Set<string>()),raw=useRef<string[]>([]);
  const active=useRef(true), engine=useRef<LocalSpeechAdapter|null>(null), busy=useRef(false);
  useEffect(()=>{active.current=true;
    // Only test injection is inspected on mount. No real capability probe, permission, worker or model load.
    const injected=browserLocalSpeechAdapter();
    if(injected){setAdapter(injected);void injected.available().then(value=>{if(active.current)setAvailability(value)}).catch(()=>{if(active.current)setAvailability("unavailable")})}
    return()=>{active.current=false;session.current?.cancel();cancelLocalSpeech(engine.current);session.current=null};
  },[]);
  async function tap(){
    if(busy.current)return;
    if(adapter){start(adapter);return}
    busy.current=true;setMessage("");
    const value=createLocalSpeechAdapter(percent=>{if(active.current)setMessage(`Loading on-device voice: ${percent}%`)});
    if(!value){setAvailability("unavailable");busy.current=false;return}
    engine.current=value;setAvailability("downloading");setMessage("Allow the microphone to load on-device voice…");
    const installed=await value.install();busy.current=false;
    if(!active.current){cancelLocalSpeech(value);return}
    if(!installed){setAvailability("unavailable");setMessage("Microphone unavailable. You can type instead.");return}
    setAvailability("installed");start(value);
  }
  function start(value:LocalSpeechAdapter){if(value.configuration.language!=="en-GB"||!value.configuration.processLocally||value.configuration.remoteFallback){setAvailability("unavailable");return}setMessage("");setInterim("");seen.current.clear();setListening(true);try{session.current=value.start({interim:setInterim,final:(text,id)=>{if(seen.current.has(id))return;seen.current.add(id);raw.current.push(text);setFinalText(old=>`${old}${old?" ":""}${text}`.trim());setInterim("")},error:code=>{session.current?.cancel();session.current=null;setListening(false);setInterim("");setMessage(code==="no-speech"?"Microphone unavailable. You can type instead.":"Microphone unavailable. You can type instead.")},end:()=>{session.current=null;setListening(false);setInterim("")}})}catch{cancelLocalSpeech(value);setListening(false);setMessage("Microphone unavailable. You can type instead.")}}
  function stop(){session.current?.stop();setInterim("")}
  function cancel(){session.current?.cancel();session.current=null;setListening(false);setInterim("");setFinalText("");raw.current=[]}
  async function install(){if(!adapter)return;setAvailability("downloading");setMessage("Installing the on-device speech model… Progress is not provided by this browser.");try{const installed=await adapter.install(),next=installed?await adapter.available():"unavailable";if(next!=="installed"){setAvailability("unavailable");setMessage("");return}setAvailability(next);setMessage("On-device speech model installed. Choose Talk through the example when you are ready.")}catch{setAvailability("unavailable");setMessage("")}}
  const unavailable=availability==="unavailable"||availability==="checking";
  return <section className="dictation" aria-label="On-device dictation">
    <h2>Talk through the example</h2><p>Speak fictional work only. Audio never leaves this device and is never saved. Voice downloads {LOCAL_SPEECH_DOWNLOAD_MIB} MiB from JobGuard on first use (browser caching may require a repeat download). Review and edit the words before using them.</p>
    {availability==="unavailable"&&<p>On-device voice is unavailable in this browser. Type or use the example.</p>}
    {availability==="downloadable"&&<button type="button" onClick={()=>void install()}>Install on-device voice</button>}
    {availability==="downloading"&&<p role="status">Preparing on-device voice…</p>}
    <button type="button" disabled={unavailable||availability!=="installed"||listening} onClick={()=>void tap()}>Talk through the example</button>
    {listening&&<><p>Listening on this device</p><button type="button" onClick={stop}>Stop listening</button><button type="button" onClick={cancel}>Cancel dictation</button></>}
    {interim&&<p className="dictation-interim" data-testid="interim-transcript"><span>Provisional: </span>{interim}</p>}
    {finalText&&<><label htmlFor="dictation-final">Words to review</label><textarea id="dictation-final" value={finalText} onChange={e=>setFinalText(e.target.value)}/><button type="button" onClick={()=>{session.current?.cancel();cancelLocalSpeech(engine.current);setListening(false);onUse(finalText,raw.current.join(" "))}}>Use these words</button></>}
    {message&&<p>{message}</p>}
  </section>;
}
