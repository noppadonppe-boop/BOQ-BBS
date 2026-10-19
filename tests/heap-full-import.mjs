// Write a preserved snapshot only to the owned empty diagnostic emulator.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014';
const cold=process.argv.includes('--cold'),port=cold?8665:8664;
const runtime=JSON.parse(await fs.readFile('output/full-data-recovery-verification/'+(cold?'cold-full-runtime.json':'full-runtime.json'),'utf8'));assert.equal(runtime.port,port);assert.equal(runtime.diagnosticOnly,true);
const preserved=JSON.parse(await fs.readFile(root+'/live-database.json','utf8')),base='http://127.0.0.1:'+port+'/v1/projects/demo-boq-v041/databases/(default)/documents',headers={Authorization:'Bearer owner','Content-Type':'application/json'};
assert.equal(preserved.scope,'all-default-database-row-histories');const names=new Set(preserved.documents.map(x=>x.document.name));assert.equal(names.size,preserved.documents.length);
const request=async(url,options={})=>{assert.equal(new URL(url).origin,'http://127.0.0.1:'+port);const r=await fetch(url,{headers,...options,signal:AbortSignal.timeout(20000)});assert.ok(r.ok,'HTTP'+r.status);return r.json();};
if(!cold){
const existing=await request(base+':listCollectionIds',{method:'POST',body:'{}'});assert.equal(existing.collectionIds?.length||0,0,'Do not overwrite a nonempty datastore');
for(let offset=0;offset<preserved.documents.length;offset+=100){const writes=preserved.documents.slice(offset,offset+100).map(x=>({update:{name:x.document.name,fields:x.document.fields}}));assert.ok(writes.every(x=>x.update.name.startsWith('projects/demo-boq-v041/databases/(default)/documents/')));await request(base+':commit',{method:'POST',body:JSON.stringify({writes})});if(offset%5000===0)console.log('Imported',Math.min(offset+100,preserved.documents.length),'of',preserved.documents.length);}
}
const normalizeValue=v=>'nullValue'in v?{nullValue:'NULL_VALUE'}:'mapValue'in v?{mapValue:{fields:normalizeFields(v.mapValue.fields||{})}}:'arrayValue'in v?{arrayValue:{values:(v.arrayValue.values||[]).map(normalizeValue)}}:'timestampValue'in v?{timestampValue:v.timestampValue.replace(/(?:\.(\d+))?Z$/,(_,n)=>'.'+(n||'').padEnd(9,'0')+'Z')}:v;
const normalizeFields=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalizeValue(x)]));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest=v=>createHash('sha256').update(canonical(normalizeFields(v))).digest('hex');
let verified=0;for(let offset=0;offset<preserved.documents.length;offset+=100){
 const documents=preserved.documents.slice(offset,offset+100).map(x=>x.document);
 const observed=await request(base+':batchGet',{method:'POST',body:JSON.stringify({documents:documents.map(x=>x.name)})});assert.ok(Array.isArray(observed));const byName=new Map(observed.filter(x=>x.found).map(x=>[x.found.name,x.found]));
 for(const doc of documents){assert.equal(digest(byName.get(doc.name).fields),digest(doc.fields));verified++;}if(offset%5000===0)console.log('Verified',verified,'of',preserved.documents.length);
}
if(cold){const checkpoint=JSON.parse(await fs.readFile('output/full-data-recovery-verification/full-checkpoint-results.json','utf8'));checkpoint.status='PASS';checkpoint.coldReimportVerified=true;checkpoint.exactColdFieldReadbacks=verified;await fs.writeFile('output/full-data-recovery-verification/full-checkpoint-results.json',JSON.stringify(checkpoint,null,2));}
else await fs.writeFile('output/full-data-recovery-verification/full-import-results.json',JSON.stringify({status:'PASS',documentsWrittenAndReadback:verified,source:'Latest row states of preserved local heap snapshot',originalDataWritten:false,fullAuthRecovered:false,fullStorageRecovered:false,productionRequests:false},null,2));console.log('PASS full preserved Firestore field snapshot '+(cold?'cold readback ':'imported/readback ')+verified);
