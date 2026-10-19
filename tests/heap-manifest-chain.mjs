// Read only original Storage; reconstruct a private candidate package, never original data.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014/candidate-scan-v2';
const selection=JSON.parse(await fs.readFile(root+'/diagnostic-selection.json','utf8')),jobs=JSON.parse(await fs.readFile(root+'/known-jobs.json','utf8'));
try {
const manifests=[];
for(const job of jobs){
 const file=job.manifest;assert.ok(file.path.startsWith('projects/'+selection.projectId+'/spec-manifests/'));
 const url='http://127.0.0.1:9509/download/storage/v1/b/demo-boq-bbs.appspot.com/o/'+encodeURIComponent(file.path)+'?alt=media';
 const r=await fetch(url,{headers:{Authorization:'Bearer owner'},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);
 const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,file.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
 const manifest=JSON.parse(bytes);assert.equal(manifest.id,job.id);assert.equal(manifest.projectId,selection.projectId);assert.equal(manifest.sourceVersion,job.sourceVersion);assert.equal(manifest.members.length,57);
 await fs.writeFile(root+'/manifest-'+file.sha256+'.json',bytes);manifests.push({job,manifest});
}
const chain=manifests.filter(x=>x.job.status==='Complete').sort((a,b)=>a.job.sourceVersion-b.job.sourceVersion);
assert.deepEqual(chain.map(x=>x.job.sourceVersion),[63,64,65]);
assert.equal(selection.project.version,66);assert.equal(selection.project.specChangeState.id,chain.at(-1).job.id);
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
let exactPairs=0;
for(let i=1;i<chain.length;i++){
 const previous=new Map(chain[i-1].manifest.members.map(x=>[x.id,x.after]));
 for(const pair of chain[i].manifest.members){assert.equal(canonical(previous.get(pair.id)),canonical(pair.before));exactPairs++;}
 assert.equal(canonical(chain[i-1].manifest.newSpec),canonical(chain[i].manifest.oldSpec));
}
const latest=chain.at(-1);assert.equal(canonical(latest.manifest.newSpec),canonical(selection.project.spec));
assert.equal(latest.job.completed,57);assert.equal(latest.job.total,57);assert.equal(latest.job.status,'Complete');
const reconstructed=latest.manifest.members.map(x=>x.after);
assert.deepEqual(reconstructed.map(x=>x.id).sort(),selection.members.map(x=>x.id).sort());
assert.ok(reconstructed.every(m=>m.occurrences.find(o=>o.id==='B').zone==='West'&&m.occurrences.find(o=>o.id==='B').floor==='Roof'));
await fs.writeFile(root+'/reconstructed-members.json',JSON.stringify(reconstructed));
await fs.writeFile('output/data-recovery-verification/manifest-chain-results.json',JSON.stringify({status:'PASS',verifiedManifests:manifests.length,completeChainVersions:[63,64,65,66],exactBeforeAfterPairs:exactPairs,finalMembers:reconstructed.length,finalProjectJobMatches:true,originalStorageReadOnly:true,fullDatabaseRecovered:false,candidateCurrentFieldsWereStale:true,reconstructionBasis:'Hash-verified immutable completed-job manifests; not independent current datastore parity',hashes:manifests.map(x=>({status:x.job.status,sourceVersion:x.job.sourceVersion,sha256:x.job.manifest.sha256,size:x.job.manifest.size}))},null,2));
console.log('PASS immutable manifest chain; 57 latest members reconstructed, full recovery UNPROVEN');
} catch(error) {
 await fs.writeFile('output/data-recovery-verification/manifest-chain-results.json',JSON.stringify({status:'INCOMPLETE',errorCode:error.cause?.code||error.code||error.name,verifiedManifests:0,originalObjectWrites:0,fullDatabaseRecovered:false,reconstructionApplied:false},null,2));
 throw error;
}
