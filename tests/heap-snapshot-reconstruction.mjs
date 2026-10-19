// Historical candidate inputs become file evidence only after an exact committed SHA256 match.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
const root='C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014';
const entry=root+'/snapshot-recovery-domain.mjs';await build({stdin:{contents:"export {canonical} from './src/domain/canonical';export {decodeStorage} from './src/domain/storageCodec';export {takeoff} from './src/domain/engine';export {selectBundle} from './src/domain/exportScope';export {calculationEngine} from './src/domain/version';",resolveDir:path.resolve('.')},outfile:entry,bundle:true,platform:'node',format:'esm'});
const {canonical,decodeStorage,takeoff,selectBundle,calculationEngine}=await import(pathToFileURL(entry).href);
const decode=v=>'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):'arrayValue'in v?(v.arrayValue.values||[]).map(decode):'integerValue'in v?Number(v.integerValue):Object.values(v)[0];
const fields=doc=>decodeStorage(Object.fromEntries(Object.entries(doc.fields).map(([k,x])=>[k,decode(x)])));
const selected=JSON.parse(await fs.readFile(root+'/live-selection.json','utf8'));
const records=selected.documents.filter(x=>/\/(exportJobs|revisions)\//.test(x.document.name)).map(x=>fields(x.document));
const roots=JSON.parse(await fs.readFile(root+'/retained-root-history.json','utf8')).map(doc=>({doc,value:fields(doc)}));
const allMembers=JSON.parse(await fs.readFile(root+'/retained-member-history.json','utf8'));
const prior=JSON.parse(await fs.readFile(root+'/project-file-recovery-index.json','utf8'));
const results=[];let attempts=0;
for(const record of records){
 if(prior.find(r=>r.path===record.snapshot.path)?.recovered)continue;
 const cutoff=Date.parse(record.createdAt),latestMembers=new Map();
 for(const doc of allMembers){if(Date.parse(doc.updateTime)>cutoff)continue;const value=fields(doc),old=latestMembers.get(value.id);if(!old||Date.parse(doc.updateTime)>Date.parse(old.doc.updateTime))latestMembers.set(value.id,{doc,value});}
 const members=[...latestMembers.values()].map(x=>x.value).sort((a,b)=>a.id.localeCompare(b.id));assert.equal(members.length,57);
 let found=false;
 for(const candidate of roots.filter(x=>x.value.version===record.summary.version&&Date.parse(x.doc.updateTime)<=cutoff)){
  const project=candidate.value,calculations=Object.fromEntries(members.map(m=>{const q=takeoff(m,project.spec);return [m.id,{quantity:q.quantity,concrete:q.concrete,formwork:q.formwork,excavation:q.excavation,backfill:q.backfill,lean:q.lean,rebar:q.rebar,bars:q.rows.map(b=>({id:b.id,cutLength:b.cutLength,geometricLength:b.geometricLength,eachWeight:b.eachWeight,weight:b.weight}))}];}));
  let bundle=selectBundle({schemaVersion:2,project,members,attachments:[],stock:[],stockLedger:[],cutPlans:[],createdAt:'__snapshot_time__',status:'Draft',version:project.version,engineVersion:calculationEngine(project.spec),calculations},record.summary.scope||{});
  if(record.summary.status==='Frozen')bundle={...bundle,status:'Frozen',revisionNumber:record.summary.revisionNumber};
  const body=canonical(bundle),marker='__snapshot_time__';assert.equal(body.split(marker).length,2);const [prefix,suffix]=body.split(marker);
  for(let delta=0;delta<=5000;delta++){
   const text=prefix+new Date(cutoff-delta).toISOString()+suffix,bytes=Buffer.from(text);if(bytes.length!==record.snapshot.size)continue;
   attempts++;const sha=createHash('sha256').update(bytes).digest('hex');if(sha!==record.snapshot.sha256)continue;
   await fs.writeFile(root+'/reconstructed-files/'+sha,bytes);await fs.writeFile(root+'/reconstructed-files/'+sha+'.json',bytes);
   results.push({sha256:sha,size:bytes.length,createdAt:new Date(cutoff-delta).toISOString(),captureOffsetMs:delta,basis:'Retained historical inputs and bounded capture-time search; exact committed size and SHA256'});found=true;break;
  }
  if(found)break;
 }
 if(!found)results.push({sha256:record.snapshot.sha256,status:'UNRECOVERED',basis:'No exact hash match; no substitute file created'});
 console.log('Snapshot result',record.summary.status,found?'exact hash matched':'unrecovered');
}
await fs.writeFile(root+'/snapshot-reconstruction-index.json',JSON.stringify(results,null,2));
await fs.writeFile('output/full-data-recovery-verification/snapshot-reconstruction-results.json',JSON.stringify({status:results.every(x=>x.status!=='UNRECOVERED')?'PASS':'INCOMPLETE',attempts,files:results,originalDataWritten:false},null,2));
