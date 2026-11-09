import "server-only";

let cachedToken:{value:string;expires:number}|null=null;
export function faceWorkerWakeConfigured(){
  return /^[a-z0-9]{3,24}$/.test(process.env.FACE_WORK_QUEUE_ACCOUNT??"")
    && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(process.env.FACE_WORK_QUEUE_NAME??"");
}

async function storageToken(){
  if(cachedToken&&cachedToken.expires>Date.now()+60000)return cachedToken.value;
  const endpoint=new URL(process.env.IDENTITY_ENDPOINT??"http://invalid.invalid");
  if(endpoint.protocol!=="http:"||!["localhost","127.0.0.1","[::1]"].includes(endpoint.hostname)&&!/^169\.254\./.test(endpoint.hostname)||!process.env.IDENTITY_HEADER)throw new Error("managed_identity_unavailable");
  endpoint.searchParams.set("resource","https://storage.azure.com/");endpoint.searchParams.set("api-version","2019-08-01");
  if(process.env.FACE_WORK_QUEUE_CLIENT_ID)endpoint.searchParams.set("client_id",process.env.FACE_WORK_QUEUE_CLIENT_ID);
  const response=await fetch(endpoint,{headers:{"X-IDENTITY-HEADER":process.env.IDENTITY_HEADER},signal:AbortSignal.timeout(5000),cache:"no-store",redirect:"error"});
  if(!response.ok)throw new Error("managed_identity_unavailable");
  const body=await response.json();if(typeof body.access_token!=="string")throw new Error("managed_identity_unavailable");
  cachedToken={value:body.access_token,expires:Number(body.expires_on)*1000||Date.now()+300000};return cachedToken.value;
}

/** A content-free wake hint. Database jobs and permissions remain authoritative. */
export async function wakeFaceWorker(){
  if(!faceWorkerWakeConfigured())return{onDemand:false,wakeQueued:false};
  try{
    const token=await storageToken();
    const response=await fetch(`https://${process.env.FACE_WORK_QUEUE_ACCOUNT}.queue.core.windows.net/${process.env.FACE_WORK_QUEUE_NAME}/messages?messagettl=86400`,{
      method:"POST",headers:{Authorization:`Bearer ${token}`,"x-ms-version":"2022-11-02","x-ms-date":new Date().toUTCString(),"Content-Type":"application/xml"},
      body:"<QueueMessage><MessageText>d2FrZQ==</MessageText></QueueMessage>",signal:AbortSignal.timeout(10000),cache:"no-store",redirect:"error",
    });
    if(!response.ok)throw new Error("wake_queue_unavailable");
    return{onDemand:true,wakeQueued:true};
  }catch{
    console.warn("[faces] worker wake delayed; the database request remains queued");
    return{onDemand:true,wakeQueued:false};
  }
}

export async function wakeFaceWorkerForPendingWork(){
  if(!faceWorkerWakeConfigured())return;
  // Dynamic import avoids a store/config cycle; never wakes idle compute.
  try{
    const {faceWorkerHasPendingWork}=await import("@/lib/face-recognition-store");
    if(await faceWorkerHasPendingWork())await wakeFaceWorker();
  }catch{console.warn("[faces] purge wake delayed; retention will retry the durable request");}
}
