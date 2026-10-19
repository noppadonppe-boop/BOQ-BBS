import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const root='C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014';
const selection=JSON.parse(await fs.readFile(root+'/live-selection.json','utf8'));
const base='http://127.0.0.1:8663/v1/';
const normalizeValue=v=>{
 if('nullValue'in v)return {nullValue:'NULL_VALUE'};
 if('arrayValue'in v)return {arrayValue:{values:(v.arrayValue.values||[]).map(normalizeValue)}};
 if('mapValue'in v)return {mapValue:{fields:normalizeFields(v.mapValue.fields||{})}};
 if('timestampValue'in v){const m=v.timestampValue.match(/^(.*?)(?:\.(\d+))?Z$/);assert.ok(m);return {timestampValue:m[1]+'.'+(m[2]||'').padEnd(9,'0')+'Z'};}
 return v;
};
const normalizeFields=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalizeValue(x)]));
let verified=0;
for(const candidate of selection.documents){
 const r=await fetch(base+candidate.document.name,{headers:{Authorization:'Bearer owner'},signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);
 const observed=await r.json();assert.deepEqual(normalizeFields(observed.fields),normalizeFields(candidate.document.fields));verified++;
}
const unsigned=await fetch(base+'projects/demo-boq-v041/databases/(default)/documents/projects/'+selection.projectId,{signal:AbortSignal.timeout(10000)});assert.equal(unsigned.status,403);
const checkpoint=JSON.parse(await fs.readFile('output/data-recovery-verification/selected-checkpoint-results.json','utf8'));
checkpoint.status='PASS';checkpoint.coldReimportVerified=true;checkpoint.exactSelectedDocuments=verified;checkpoint.unsignedCurrentProjectDenied=true;
await fs.writeFile('output/data-recovery-verification/selected-checkpoint-results.json',JSON.stringify(checkpoint,null,2));
console.log('PASS cold reimport '+verified+' selected documents and unsigned denial; whole recovery UNPROVEN');
