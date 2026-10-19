// Find retained original bytes by committed size/hash. Never replace a reference on mismatch.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root='C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014';
const selected=JSON.parse(await fs.readFile(root+'/live-selection.json','utf8'));const {canonical}=await import(pathToFileURL(root+'/recovery-domain.mjs').href);
const decode=v=>{if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);if('integerValue'in v)return Number(v.integerValue);return Object.values(v)[0];};
const refs=new Map();function collect(v){if(!v||typeof v!=='object')return;if(typeof v.path==='string'&&v.path.startsWith('projects/'+selected.projectId+'/')&&/^[0-9a-f]{64}$/.test(v.sha256)&&Number.isSafeInteger(v.size)&&v.size>=0){const old=refs.get(v.path);if(old)assert.equal(old.sha256,v.sha256);else refs.set(v.path,{...v});}for(const x of Object.values(v))collect(x);}
for(const candidate of selected.documents)collect(Object.fromEntries(Object.entries(candidate.document.fields).map(([k,x])=>[k,decode(x)])));
const matches=new Map();const destination=root+'/reconstructed-files';await fs.mkdir(destination,{recursive:true});
async function consider(bytes,basis){const sha=createHash('sha256').update(bytes).digest('hex');if([...refs.values()].some(r=>r.sha256===sha&&r.size===bytes.length)){await fs.writeFile(destination+'/'+sha,bytes);matches.set(sha,{local:sha,size:bytes.length,basis});}}
const reconstructed=JSON.parse(await fs.readFile(root+'/reconstructed-file-index.json','utf8'));
for(const r of reconstructed)await consider(await fs.readFile(destination+'/'+r.local),'Exact content-addressed area-manifest reconstruction');
try {
 const snapshots=JSON.parse(await fs.readFile(root+'/snapshot-reconstruction-index.json','utf8'));
 for(const r of snapshots.filter(x=>x.status!=='UNRECOVERED'))await consider(await fs.readFile(destination+'/'+r.sha256),r.basis);
}catch(error){if(error.code!=='ENOENT')throw error;}
const ctx=JSON.parse(await fs.readFile('output/area-change-verification/context.json','utf8'));
async function retainedBundles(v){if(!v||typeof v!=='object')return;if(!Array.isArray(v)&&v.project&&Array.isArray(v.members))await consider(Buffer.from(canonical(v)),'Retained snapshot bundle; exact committed checksum');for(const x of Object.values(v))await retainedBundles(x);}
await retainedBundles(ctx);
for(const dir of ['output/boq-basis-verification','output/member-register-verification','output/area-change-verification']){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(entry.isFile()&&/\.(pdf|xlsx|json)$/i.test(entry.name)){const bytes=await fs.readFile(dir+'/'+entry.name);await consider(bytes,'Existing app output '+dir+'/'+entry.name);if(entry.name.endsWith('.json'))await retainedBundles(JSON.parse(bytes));}}
}
const index=[...refs.values()].map(r=>({...r,recovered:matches.has(r.sha256),...(matches.get(r.sha256)||{})}));
await fs.writeFile(root+'/project-file-recovery-index.json',JSON.stringify(index,null,2));
const summary={status:index.every(r=>r.recovered)?'PASS':'INCOMPLETE',references:index.length,recovered:index.filter(r=>r.recovered).length,missing:index.filter(r=>!r.recovered).map(r=>({sha256:r.sha256,size:r.size,contentType:r.contentType})),recoveredBytes:index.filter(r=>r.recovered).reduce((n,r)=>n+r.size,0),originalStorageWritten:false,newObjectUploaded:false};
await fs.writeFile('output/full-data-recovery-verification/project-file-results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
