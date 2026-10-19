import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve('tmp/storage-framing-recovery'),out=path.resolve('output/storage-runtime-verification');
await fs.mkdir(out,{recursive:true});
const base='http://127.0.0.1:8751/v1/projects/demo-boq-v041/databases/(default)/documents';
const hash=b=>createHash('sha256').update(b).digest('hex');
const value=v=>'stringValue'in v?v.stringValue:'integerValue'in v?Number(v.integerValue):'doubleValue'in v?v.doubleValue:'booleanValue'in v?v.booleanValue:'arrayValue'in v?(v.arrayValue.values||[]).map(value):'mapValue'in v?fields(v.mapValue.fields):'nullValue'in v?null:v.timestampValue;
const fields=f=>Object.fromEntries(Object.entries(f||{}).map(([k,v])=>[k,value(v)]));
async function get(resource){const r=await fetch(base+'/'+resource,{headers:{Authorization:'Bearer owner'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Local metadata read failed HTTP '+r.status);return r.json();}
async function list(resource){const docs=[];let token='';do{const r=await get(resource+'?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):''));docs.push(...(r.documents||[]));token=r.nextPageToken||'';}while(token);return docs;}
const admin=JSON.parse(await fs.readFile('output/auth-integration-verification/bootstrap-context.json','utf8'));
const profile=fields((await get('my-boq-app/root/users/'+encodeURIComponent(admin.email.toLowerCase()))).fields);
if(profile.status!=='approved'||!profile.uid)throw Error('Only restore the existing local QA account; never invent approval');
const identity=await fetch('http://127.0.0.1:10121/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({localId:profile.uid,email:admin.email,password:admin.password,displayName:'Software QA'}),signal:AbortSignal.timeout(10000)});
if(!identity.ok){const body=await identity.json();if(body.error?.message!=='EMAIL_EXISTS'&&body.error?.message!=='DUPLICATE_LOCAL_ID')throw Error('Local Auth identity restore failed HTTP '+identity.status);const check=await fetch('http://127.0.0.1:10121/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-key',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({email:[admin.email]}),signal:AbortSignal.timeout(10000)});const data=await check.json();if(!check.ok||data.users?.[0]?.localId!==profile.uid)throw Error('Existing local identity UID differs from stored profile');}
await fs.writeFile(path.join(root,'profile-before.json'),JSON.stringify(profile));
const docs=await list('projects'),objects=new Map(),registered=[];
function find(v,contentType){
 if(!v||typeof v!=='object')return;
 if(typeof v.path==='string'&&v.path.startsWith('projects/')&&/^[a-f0-9]{64}$/.test(v.sha256||''))objects.set(v.path,{path:v.path,sha256:v.sha256,size:v.size,contentType:v.contentType||contentType});
 for(const w of Object.values(v))if(w&&typeof w==='object')find(w,v.contentType||contentType);
}
for(const doc of docs){
 const pid=doc.name.split('/').at(-1);registered.push(doc);find(fields(doc.fields));
 for(const collection of ['attachments','revisions','exportJobs','submissionJobs','restoreJobs','specChangeJobs','projectChangeJobs','importedHistory'])for(const d of await list('projects/'+encodeURIComponent(pid)+'/'+collection)){registered.push(d);find(fields(d.fields));}
}
await fs.writeFile(path.join(root,'registered-before.json'),JSON.stringify(registered));
const mime=p=>p.endsWith('.pdf')?'application/pdf':p.endsWith('.xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':p.endsWith('.zip')?'application/zip':p.endsWith('.png')?'image/png':p.endsWith('.jpg')||p.endsWith('.jpeg')?'image/jpeg':p.endsWith('.json')?'application/json':undefined;
const restored=[],missing=[];
for(const obj of objects.values()){
 const disk=path.join(root,'preserved',obj.sha256);let bytes;try{bytes=await fs.readFile(disk);}catch(e){if(e.code!=='ENOENT')throw e;missing.push({sha256:obj.sha256,reason:'No preserved exact-hash bytes'});continue;}
 if(hash(bytes)!==obj.sha256||obj.size!==undefined&&bytes.length!==obj.size)throw Error('Preserved object does not match registration');
 const contentType=obj.contentType||mime(obj.path);if(!contentType)throw Error('Unspecified media type');
 const url='http://127.0.0.1:9531/v0/b/demo-boq-bbs.appspot.com/o?uploadType=media&name='+encodeURIComponent(obj.path);
 const boundary='boq-local-recovery-boundary',metadata={name:obj.path,contentType,metadata:{sha256:obj.sha256}};const body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=utf-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: '+contentType+'\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'multipart/related; boundary='+boundary,'X-Goog-Upload-Protocol':'multipart'},body,signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Local object reconstruction failed HTTP '+r.status);
 const read=await fetch('http://127.0.0.1:9531/v0/b/demo-boq-bbs.appspot.com/o/'+encodeURIComponent(obj.path)+'?alt=media',{headers:{Authorization:'Bearer owner'},signal:AbortSignal.timeout(10000)});
 if(!read.ok||hash(Buffer.from(await read.arrayBuffer()))!==obj.sha256)throw Error('Restored bytes mismatch');
 restored.push({sha256:obj.sha256,size:bytes.length,contentType});
}
const after=fields((await get('my-boq-app/root/users/'+encodeURIComponent(admin.email.toLowerCase()))).fields);
if(JSON.stringify(after)!==JSON.stringify(profile))throw Error('Recovery must not change profile/approval');
await fs.writeFile(path.join(root,'restored-paths.json'),JSON.stringify([...objects.values()]));
await fs.writeFile(path.join(out,'recovery-results.json'),JSON.stringify({status:'PASS',scope:'Local software-QA Auth identity and registered exact-hash objects reconstructed; not full metadata/Auth disaster recovery',firestoreProcessRetained:true,identityUIDMatchedStoredProfile:true,profileAndApprovalUnchanged:true,projectsRead:docs.length,registeredObjects:objects.size,restoredObjects:restored.length,missingObjects:missing.length,restored,missing,storageTimestampsAndMetadataNotRecovered:true,otherAuthAccountsNotRecovered:true,ownerChannelReconstructionOnly:true,productionRequests:false},null,2));
console.log('PASS local QA identity restored; profile unchanged; exact-hash registered objects:',restored.length,'missing:',missing.length);
