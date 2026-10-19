// Reconstruct exact content-addressed bytes only when the original SHA256 matches.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import path from 'node:path';import {build} from 'esbuild';
const root='C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014';
const selection=JSON.parse(await fs.readFile(root+'/live-selection.json','utf8'));
const ctx=JSON.parse(await fs.readFile('output/area-change-verification/context.json','utf8'));
const entry=root+'/recovery-domain.mjs';await build({stdin:{contents:"export {areaChangePlan} from './src/domain/areaChange';export {canonical} from './src/domain/canonical';export {decodeStorage} from './src/domain/storageCodec';",resolveDir:path.resolve('.')},outfile:entry,bundle:true,platform:'node',format:'esm'});
const {areaChangePlan,canonical,decodeStorage}=await import(pathToFileURL(entry).href);
const decode=v=>{if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);if('integerValue'in v)return Number(v.integerValue);return Object.values(v)[0];};
const jobs=selection.documents.filter(x=>x.document.name.includes('/specChangeJobs/')).map(x=>decodeStorage(Object.fromEntries(Object.entries(x.document.fields).map(([k,v])=>[k,decode(v)])))).sort((a,b)=>a.sourceVersion-b.sourceVersion||a.createdAt.localeCompare(b.createdAt));
let members=ctx.beforeMembers, version=ctx.beforeProject.version;
const recovered=[];const destination=root+'/reconstructed-files';await fs.mkdir(destination,{recursive:true});
for(const job of jobs){
 assert.equal(job.sourceVersion,version);assert.equal(job.total,57);assert.ok(['Complete','Cancelled'].includes(job.status));
 const input={version:job.sourceVersion,field:job.areaChange.field,from:job.areaChange.from,to:job.areaChange.to,note:job.areaChange.note};
 const plan=areaChangePlan(members,ctx.beforeProject.spec,input);
 const changes=plan.pairs.map(e=>({...e,after:{...e.after,status:'Draft',version:e.before.version+1,inputEpoch:job.id,updatedAt:job.createdAt,bars:e.after.bars.map(b=>({...b,placementConfirmed:false}))}}));
 const manifest={id:job.id,projectId:selection.projectId,sourceVersion:job.sourceVersion,oldSpec:ctx.beforeProject.spec,newSpec:ctx.beforeProject.spec,preparedAt:job.createdAt,areaChange:job.areaChange,members:changes,sourceIntakes:[],sourceChanges:[],sourceAdoptions:[]};
 const bytes=Buffer.from(canonical(manifest)),sha=createHash('sha256').update(bytes).digest('hex');
 assert.equal(sha,job.manifest.sha256,'Reconstructed bytes must match original committed hash');assert.equal(bytes.length,job.manifest.size);
 await fs.writeFile(destination+'/'+sha+'.json',bytes);recovered.push({...job.manifest,local:sha+'.json',basis:'Reconstructed from retained inputs plus committed job metadata; exact original SHA256 and size'});
 if(job.status==='Complete'){members=changes.map(e=>e.after);version++;}
}
assert.equal(version,66);assert.equal(members.length,57);assert.ok(members.every(m=>m.occurrences.find(o=>o.id==='B').zone==='West'&&m.occurrences.find(o=>o.id==='B').floor==='Roof'));
await fs.writeFile(root+'/reconstructed-file-index.json',JSON.stringify(recovered,null,2));
await fs.writeFile('output/full-data-recovery-verification/area-file-reconstruction.json',JSON.stringify({status:'PASS',exactOriginalHashes:recovered.length,finalSourceVersion:version,memberCount:members.length,originalDataWritten:false,files:recovered.map(x=>({sha256:x.sha256,size:x.size,basis:x.basis}))},null,2));console.log('PASS exact original area-manifest bytes reconstructed '+recovered.length);
