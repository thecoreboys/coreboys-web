import { z } from "zod";
import { VIDEO_FINGERPRINT_ALGORITHM } from "./face-processing-costs";

export const BrowserVideoReviewInput = z.object({
  sourceId: z.string().uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  algorithm: z.literal(VIDEO_FINGERPRINT_ALGORITHM),
  byteSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  durationMs: z.number().int().positive().max(24 * 60 * 60 * 1000),
  fileName: z.string().trim().min(1).max(240).refine(value=>!/[\u0000-\u001f\u007f/\\]/.test(value)),
}).strict();

export type BrowserVideoReview = {
  id: string; sourceId: string; fingerprint: string; durationMs: number; reused: boolean;
  markers: Array<{id: string; identityId: string | null; startMs: number; endMs: number; status: string}>;
};

/** Runs in a worker with bounded memory. No video or frame pixels are uploaded. */
export function fingerprintLocalVideo(file: File, progress: (percent:number)=>void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException("Cancelled","AbortError"));return;}
    const worker=new Worker("/workers/video-fingerprint.js");
    const stop=()=>{worker.terminate();signal.removeEventListener("abort",cancel);};
    const cancel=()=>{stop();reject(new DOMException("Cancelled","AbortError"));};
    signal.addEventListener("abort",cancel,{once:true});
    worker.onerror=()=>{stop();reject(new Error("This browser could not prepare the video. Try the latest Chrome."));};
    worker.onmessage=(event:MessageEvent)=>{
      const message=event.data;
      if(message?.type==="progress")progress(message.percent);
      if(message?.type==="complete"&&/^[a-f0-9]{64}$/.test(message.fingerprint)){stop();resolve(message.fingerprint);}
      if(message?.type==="error"){stop();reject(new Error("This browser could not read the selected video."));}
    };
    worker.postMessage({file});
  });
}
