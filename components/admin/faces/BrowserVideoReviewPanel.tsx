"use client";

import { useEffect,useRef,useState } from "react";
import { fingerprintLocalVideo,type BrowserVideoReview } from "@/lib/browser-video-review";
import { VIDEO_FINGERPRINT_ALGORITHM } from "@/lib/face-processing-costs";
import type { FaceCanonicalPerson,FaceIdentity,FaceSource } from "./types";

const input="mt-1 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary";
const button="inline-flex min-h-10 items-center justify-center rounded-lg border border-secondary px-3 text-sm font-semibold text-secondary disabled:opacity-50";

export function BrowserVideoReviewPanel({apiBase,sources,identities,people,disabled,onSaved}:{
  apiBase:string;sources:FaceSource[];identities:FaceIdentity[];people:FaceCanonicalPerson[];disabled:boolean;onSaved:()=>void;
}){
  const [sourceId,setSourceId]=useState(sources.find(s=>s.kind==="archive")?.id??"");
  const [file,setFile]=useState<File|null>(null),[url,setUrl]=useState("");
  const [fingerprint,setFingerprint]=useState(""),[progress,setProgress]=useState(0),[duration,setDuration]=useState(0);
  const [project,setProject]=useState<BrowserVideoReview|null>(null),[working,setWorking]=useState("");
  const [error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const [start,setStart]=useState(0),[end,setEnd]=useState(1000),[identityId,setIdentityId]=useState("");
  const [confirmed,setConfirmed]=useState(false),[previews,setPreviews]=useState<Array<{url:string;ms:number}>>([]);
  const video=useRef<HTMLVideoElement>(null),generation=useRef(0),controller=useRef<AbortController|null>(null);
  const source=sources.find(s=>s.id===sourceId);
  const valid=Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>start&&end<=duration;
  useEffect(()=>{
    if(!file)return;
    const objectUrl=URL.createObjectURL(file);setUrl(objectUrl);
    return()=>URL.revokeObjectURL(objectUrl);
  },[file]);
  useEffect(()=>()=>{generation.current++;controller.current?.abort();},[]);
  useEffect(()=>()=>{for(const preview of previews)URL.revokeObjectURL(preview.url);},[previews]);
  function invalidate(){generation.current++;controller.current?.abort();setProject(null);setConfirmed(false);setPreviews([]);setError(null);setNotice(null);}
  async function chooseFile(next:File|null){
    invalidate();setFile(next);setFingerprint("");setDuration(0);setWorking("");setProgress(0);if(!next){setUrl("");return;}
    const version=generation.current,abort=new AbortController();controller.current=abort;setWorking("prepare");
    try{const hash=await fingerprintLocalVideo(next,setProgress,abort.signal);if(version===generation.current)setFingerprint(hash);}
    catch(reason){if(version===generation.current&&!(reason instanceof DOMException&&reason.name==="AbortError"))setError(reason instanceof Error?reason.message:"Video preparation failed.");}
    finally{if(version===generation.current)setWorking("");}
  }
  async function post(path:string,body:unknown){
    const response=await fetch(apiBase+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"The review could not be saved.");return result;
  }
  async function openReview(){
    if(!file||!source||!fingerprint||!duration||!confirmed)return;
    const version=generation.current;setWorking("save");setError(null);
    try{
      const saved=await post("/browser-reviews",{sourceId:source.id,fingerprint,algorithm:VIDEO_FINGERPRINT_ALGORITHM,byteSize:file.size,durationMs:duration,fileName:file.name});
      if(version!==generation.current)return;setProject(saved);setNotice(saved.reused?"Opened your saved review. Existing labels were reused.":"Review saved. The video remains on this computer.");
    }catch(reason){if(version===generation.current)setError(reason instanceof Error?reason.message:"Unable to open review.");}
    finally{if(version===generation.current)setWorking("");}
  }
  async function saveMark(){
    if(!project||!valid)return;const version=generation.current;setWorking("save");setError(null);
    try{
      const result=await post("/tracks",{sourceId:project.sourceId,browserReviewId:project.id,identityId:identityId||null,startMs:start,endMs:end});
      if(version!==generation.current)return;
      const updated=await post("/browser-reviews",{sourceId:project.sourceId,fingerprint,algorithm:VIDEO_FINGERPRINT_ALGORITHM,byteSize:file!.size,durationMs:duration,fileName:file!.name});
      if(version!==generation.current)return;setProject(updated);setNotice(result.reused?"This saved mark already exists; it was reused.":"Appearance saved to the review queue. Approval and publication are separate.");onSaved();
    }catch(reason){if(version===generation.current)setError(reason instanceof Error?reason.message:"Unable to save appearance.");}
    finally{if(version===generation.current)setWorking("");}
  }
  async function previewInterval(){
    if(!video.current||!valid)return;
    const element=video.current,version=generation.current,previous=element.currentTime,created:Array<{url:string;ms:number}>=[];
    setWorking("preview");setError(null);element.pause();
    try{
      const canvas=document.createElement("canvas"),ratio=Math.min(1,640/Math.max(element.videoWidth,element.videoHeight));
      canvas.width=Math.round(element.videoWidth*ratio);canvas.height=Math.round(element.videoHeight*ratio);
      const context=canvas.getContext("2d");if(!context)throw new Error("This browser cannot prepare previews.");
      for(let index=0;index<12;index++){
        const ms=Math.min(end-1,Math.round(start+(end-start)*index/12));
        await new Promise<void>((resolve,reject)=>{
          const cleanup=()=>{clearTimeout(timer);element.removeEventListener("seeked",done);};
          const done=()=>{cleanup();resolve();};
          const timer=setTimeout(()=>{cleanup();reject(new Error("The video could not seek to this interval."));},10000);
          element.addEventListener("seeked",done,{once:true});element.currentTime=ms/1000;
          if(!element.seeking&&Math.abs(element.currentTime-ms/1000)<.0001&&element.readyState>=2)requestAnimationFrame(done);
        });
        if(version!==generation.current)return;
        context.drawImage(element,0,0,canvas.width,canvas.height);
        const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",.8));
        if(blob)created.push({url:URL.createObjectURL(blob),ms});
      }
      if(version===generation.current){setPreviews([...created]);created.length=0;}
    }catch(reason){if(version===generation.current)setError(reason instanceof Error?reason.message:"Previews are unavailable for this video.");}
    finally{for(const item of created)URL.revokeObjectURL(item.url);if(version===generation.current){element.currentTime=previous;setWorking("");}}
  }
  const candidates=identities.filter(person=>person.consent.status==="active"&&person.consent.adultConfirmed&&source
    &&person.consent.approvedArchiveScopes.some(scope=>scope.contentId===source.contentId&&scope.startMs<=start&&scope.endMs>=end));
  return <div id="face-panel-video" role="tabpanel" aria-labelledby="face-tab-video" className="space-y-4 rounded-xl border border-secondary bg-primary p-5">
    <div><h2 className="text-lg font-semibold text-primary">Review video in Chrome</h2>
      <p className="mt-2 text-sm text-tertiary">Play, seek and prepare previews on this computer. Save your appearance labels for everyone to reuse. Only small file metadata and labels are sent to the site; the video and preview images stay here.</p>
      <p className="mt-2 text-sm text-tertiary">Choose a local video you are allowed to review. YouTube and Twitch embeds cannot supply frames to this tool; use an authorized video file.</p>
    </div>
    {error?<p role="alert" className="text-sm text-error-primary">{error}</p>:null}
    {notice?<p role="status" className="text-sm text-success-primary">{notice}</p>:null}
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm text-secondary">Archive source<select className={input} value={sourceId} disabled={disabled||Boolean(working)} onChange={event=>{invalidate();setSourceId(event.target.value);}}><option value="">Choose a saved archive source</option>{sources.filter(s=>s.kind==="archive").map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-sm text-secondary">Local video<input className={input} type="file" accept="video/*" disabled={disabled||working==="save"} onChange={event=>void chooseFile(event.target.files?.[0]??null)} /></label>
    </div>
    {working==="prepare"?<p role="status" className="text-sm text-tertiary">Checking the file on this computer… {progress}%</p>:null}
    {url?<video ref={video} src={url} controls preload="metadata" className="max-h-[520px] w-full rounded-xl bg-black" onLoadedMetadata={event=>{
      const ms=Math.round(event.currentTarget.duration*1000);if(Number.isFinite(ms)&&ms>0){setDuration(ms);setStart(0);setEnd(Math.min(ms,60000));}else setError("Choose a finite, supported archive video.");
    }} onError={()=>setError("Chrome could not play this video format. Choose a supported MP4 or WebM file.")} />:null}
    <label className="flex items-center gap-2 text-sm text-secondary"><input type="checkbox" checked={confirmed} disabled={!file||Boolean(working)} onChange={event=>setConfirmed(event.target.checked)} />I verified that this file is the selected source video.</label>
    <button type="button" className={button} disabled={disabled||Boolean(working)||!confirmed||!source||!fingerprint||!duration} onClick={()=>void openReview()}>Open or reuse saved review</button>
    {url?<>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-secondary">Start (milliseconds)<input type="number" min="0" step="1" className={input} value={start} onChange={event=>setStart(Number(event.target.value))} /></label>
        <label className="text-sm text-secondary">End (milliseconds)<input type="number" min="1" step="1" className={input} value={end} onChange={event=>setEnd(Number(event.target.value))} /></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={button} disabled={Boolean(working)} onClick={()=>setStart(Math.round((video.current?.currentTime??0)*1000))}>Use playhead as start</button>
        <button type="button" className={button} disabled={Boolean(working)} onClick={()=>setEnd(Math.round((video.current?.currentTime??0)*1000))}>Use playhead as end</button>
        <button type="button" className={button} disabled={!valid||Boolean(working)} onClick={()=>void previewInterval()}>Preview interval here</button>
      </div>
      {previews.length?<div className="grid grid-cols-3 gap-2 md:grid-cols-6">{previews.map(item=><button key={item.url} type="button" onClick={()=>{if(video.current)video.current.currentTime=item.ms/1000;}} className="text-xs text-tertiary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={`Local preview at ${item.ms} milliseconds`} className="w-full rounded" />{(item.ms/1000).toFixed(1)}s
      </button>)}</div>:null}
      <label className="block text-sm text-secondary">Person appearing in this interval<select className={input} value={identityId} onChange={event=>setIdentityId(event.target.value)}><option value="">Unknown / needs review</option>{candidates.map(person=><option key={person.id} value={person.id}>{people.find(p=>p.key===person.canonicalKey)?.displayName??person.displayName}</option>)}</select></label>
      <p className="text-xs text-tertiary">Named appearances need current permission covering this source and the complete interval. Your saved labels do not retrain the face model or start a paid scan.</p>
      <button type="button" className={button} disabled={disabled||Boolean(working)||!project||!valid} onClick={()=>void saveMark()}>Save appearance for review</button>
    </>:null}
    {project?<div><h3 className="font-semibold text-primary">Saved appearances · {project.markers.length}</h3><ul className="mt-2 space-y-2">{project.markers.map(mark=><li key={mark.id} className="text-sm text-tertiary">{(mark.startMs/1000).toFixed(1)}–{(mark.endMs/1000).toFixed(1)}s · {identities.find(i=>i.id===mark.identityId)?.displayName??"Unknown"} · {mark.status}</li>)}</ul></div>:null}
  </div>;
}
