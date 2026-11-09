/** Provision the single enrollment worker. Secrets remain in memory and Azure. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { rootCertificates } from "node:tls";
import pg from "pg";

const apply=process.argv.includes("--apply");
const check=process.argv.includes("--check");
if (!apply && !check) {
  console.log("Use --apply after reviewing the Azure enrollment deployment. Adds one 0.5-vCPU/1-GiB worker and two private file shares; no face consent or photos are created.");
  process.exit(0);
}
const image=process.env.FACE_DEPLOY_IMAGE;
if (apply && (!image || !/^coreboysprodc245e8\.azurecr\.io\/coreboys-face-worker:[a-z0-9.-]+$/.test(image))) throw new Error("Set a versioned FACE_DEPLOY_IMAGE.");
const auth=JSON.parse(execFileSync(process.platform==="win32"?"powershell.exe":"az",process.platform==="win32"
  ?["-NoProfile","-Command","az account get-access-token --resource https://management.azure.com --output json"]
  :["account","get-access-token","--resource","https://management.azure.com","--output","json"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
const subscription=auth.subscription;
const group=`/subscriptions/${subscription}/resourceGroups/coreboys-prod`;
async function arm(path,method="GET",body,version="2024-03-01") {
  const url=`https://management.azure.com${path}?api-version=${version}`;
  const response=await fetch(url,{method,headers:{Authorization:`Bearer ${auth.accessToken}`,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  if (!response.ok) {
    const error=await response.json().catch(()=>({}));
    // Never print request bodies, database URLs, or returned secret values.
    throw new Error(`Azure ${method} ${path}: ${response.status} ${error.error?.code ?? "request failed"}`);
  }
  const payload=await response.text();
  return payload.trim()?JSON.parse(payload):null;
}
const webPath=`${group}/providers/Microsoft.App/containerApps/coreboys-web`;
const workerPath=`${group}/providers/Microsoft.App/containerApps/coreboys-face-worker`;
const web=await arm(webPath);
const webSecrets=await arm(`${webPath}/listSecrets`,"POST");
const databaseUrl=webSecrets.value.find(secret=>secret.name==="database-url")?.value;
if (!databaseUrl) throw new Error("Existing database secret is unavailable");
const database=new URL(databaseUrl);
const databaseCa=readFileSync(new URL("../workers/face-analyzer/supabase-root-2021.crt",import.meta.url),"utf8");
const db=new pg.Client({host:database.hostname,port:Number(database.port||5432),database:database.pathname.slice(1),
  user:decodeURIComponent(database.username),password:decodeURIComponent(database.password),ssl:{rejectUnauthorized:true,ca:[...rootCertificates,databaseCa]},connectionTimeoutMillis:15000});
await db.connect();
if (check && !apply) {
  await db.query("SELECT 1");
  if ((await db.query("SELECT to_regclass('public.face_enrollment_jobs') IS NOT NULL AS installed")).rows[0].installed) {
    const workers=await db.query("SELECT worker_id,status,enrollment_capable,last_heartbeat_at>now()-interval '90 seconds' AS fresh FROM face_worker_heartbeats");
    const counts=await db.query("SELECT (SELECT count(*)::int FROM face_identities) AS people,(SELECT count(*)::int FROM face_reference_assets WHERE state='approved') AS approved_photos,(SELECT count(*)::int FROM face_template_sets WHERE state='active') AS active_template_sets,(SELECT count(*)::int FROM admin_users WHERE role='admin' AND deleted_at IS NULL AND totp_enabled) AS mfa_ready_admins");
    console.log(JSON.stringify({workers:workers.rows,counts:counts.rows[0]}));
  }
  await db.end();
  console.log("Production database connection verified with certificate and hostname validation. No changes made.");
  process.exit(0);
}
let workerPassword=randomBytes(36).toString("base64url");
try {
  const existing=await arm(`${workerPath}/listSecrets`,"POST");
  const value=existing.value.find(secret=>secret.name==="worker-database-url")?.value;
  if (value) workerPassword=decodeURIComponent(new URL(value).password);
} catch(error) {if (!error.message.includes(": 404 ")) throw error;}
try {
  // This identity is dedicated to this deployment; retries preserve its credential.
  await db.query("BEGIN");
  if (!(await db.query("SELECT 1 FROM pg_roles WHERE rolname='core_face_worker'")).rowCount) await db.query("CREATE ROLE core_face_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
  await db.query(`ALTER ROLE core_face_worker PASSWORD ${pg.escapeLiteral(workerPassword)}`);
  await db.query("GRANT CONNECT ON DATABASE postgres TO core_face_worker");
  await db.query("GRANT USAGE ON SCHEMA public TO core_face_worker");
  for(const name of ["024_face_presence.sql","056_face_guest_profiles.sql","057_face_site_enrollment.sql","061_face_private_access.sql","062_face_profile_review.sql"]) await db.query(readFileSync(new URL(`./migrations/${name}`,import.meta.url),"utf8"));
  await db.query("COMMIT");
  console.log("Enrollment schema and restricted database role provisioned.");
} catch(error) {
  await db.query("ROLLBACK");
  throw new Error(`Enrollment database provisioning failed (${error.code ?? error.name}).`);
} finally {await db.end();}
const tenantSuffix=decodeURIComponent(database.username).split(".").slice(1).join(".");
database.username=`core_face_worker${tenantSuffix?`.${tenantSuffix}`:""}`;
database.password=workerPassword;
database.search="";
database.searchParams.set("sslmode","verify-full");
database.searchParams.set("sslrootcert","/etc/ssl/certs/ca-certificates.crt");
const storagePath=`${group}/providers/Microsoft.Storage/storageAccounts/coreboysfacesc245e8`;
const keys=await arm(`${storagePath}/listKeys`,"POST",{},"2023-05-01");
const storageKey=keys.keys[0].value;
for(const share of ["references","worker-data"]) await arm(`${storagePath}/fileServices/default/shares/${share}`,"PUT",{properties:{shareQuota:10,enabledProtocols:"SMB"}},"2023-05-01");
const environment=web.properties.managedEnvironmentId;
for(const [name,share,accessMode] of [["face-references","references","ReadWrite"],["face-references-readonly","references","ReadOnly"],["face-worker-data","worker-data","ReadWrite"]]) {
  await arm(`${environment}/storages/${name}`,"PUT",{properties:{azureFile:{accountName:"coreboysfacesc245e8",accountKey:storageKey,shareName:share,accessMode}}});
}
console.log("Private reference and worker volumes configured.");
const identityPath=`${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/coreboys-face-worker`;
const identity=await arm(identityPath,"PUT",{location:web.location},"2023-01-31");
await arm(`${group}/providers/Microsoft.ContainerRegistry/registries/coreboysprodc245e8/providers/Microsoft.Authorization/roleAssignments/b03e6f67-ec8d-435e-aef2-f4df90a6bf59`,"PUT",{properties:{
  roleDefinitionId:`/subscriptions/${subscription}/providers/Microsoft.Authorization/roleDefinitions/7f951dda-4ed3-4680-a7ca-43fe172d538d`,principalId:identity.properties.principalId,principalType:"ServicePrincipal"}},"2022-04-01");
const worker=await arm(workerPath,"PUT",{location:web.location,identity:{type:"UserAssigned",userAssignedIdentities:{[identityPath]:{}}},tags:{purpose:"face-enrollment",owner:"coreboys"},properties:{managedEnvironmentId:environment,workloadProfileName:"Consumption",
  configuration:{activeRevisionsMode:"Single",secrets:[{name:"worker-database-url",value:database.toString()}],
    registries:[{server:"coreboysprodc245e8.azurecr.io",identity:identityPath}]},
  template:{containers:[{name:"enrollment",image,resources:{cpu:0.5,memory:"1Gi"},
    env:[{name:"FACE_ANALYZER_DATABASE_URL",secretRef:"worker-database-url"},{name:"FACE_ANALYZER_DATABASE_TLS_HOST",value:database.hostname},
      {name:"FACE_ANALYZER_WORKER_ID",value:"azure-enrollment-01"},{name:"FACE_ANALYZER_ENABLED",value:"true"},
      {name:"FACE_SITE_ENROLLMENT_ENABLED",value:"true"},{name:"FACE_AUTOMATIC_MATCHING_ENABLED",value:"false"}],
    volumeMounts:[{volumeName:"references",mountPath:"/references"},{volumeName:"worker-data",mountPath:"/data"}]}],
    volumes:[{name:"references",storageType:"AzureFile",storageName:"face-references-readonly",mountOptions:"uid=1001,gid=1001,dir_mode=0700,file_mode=0600"},
      {name:"worker-data",storageType:"AzureFile",storageName:"face-worker-data",mountOptions:"uid=1001,gid=1001,dir_mode=0700,file_mode=0600"}],
    scale:{minReplicas:1,maxReplicas:1}}}});
console.log(`Worker deployment submitted: ${worker.name}.`);
// Attach only the reference share to the web app; preserve its other configuration.
const template=web.properties.template;
template.volumes=[...(template.volumes??[]).filter(volume=>volume.name!=="face-references"),
  {name:"face-references",storageType:"AzureFile",storageName:"face-references",mountOptions:"uid=1001,gid=1001,dir_mode=0700,file_mode=0600"}];
for(const container of template.containers) {
  container.volumeMounts=[...(container.volumeMounts??[]).filter(volume=>volume.volumeName!=="face-references"),{volumeName:"face-references",mountPath:"/mnt/face-references"}];
}
delete template.revisionSuffix;
await arm(webPath,"PATCH",{properties:{template}});
console.log("Web reference storage mounted. Enable site flags through the normal GitHub deployment after tests pass.");
