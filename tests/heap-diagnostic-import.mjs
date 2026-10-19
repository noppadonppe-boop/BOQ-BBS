// Administrative writes are limited to a newly owned, disposable recovery emulator.
// This is data inspection, never engineering, owner-policy or business acceptance.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const privateRoot='C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014/candidate-scan-v2';
const initial=JSON.parse(await fs.readFile(privateRoot+'/diagnostic-selection.json','utf8'));
const live=process.argv.includes('--live');
const latest=live?JSON.parse(await fs.readFile(privateRoot+'/../live-selection.json','utf8')):null;
const selection=latest?{projectId:latest.projectId,documents:latest.documents.map(x=>x.document),members:latest.documents.filter(x=>x.document.name.includes('/members/'))}:initial;
const runtime=JSON.parse(await fs.readFile('output/data-recovery-verification/diagnostic-runtime.json','utf8'));
assert.equal(runtime.port,8662); assert.equal(runtime.diagnosticOnly,true);
const database='projects/demo-boq-v041/databases/(default)';
const base='http://127.0.0.1:8662/v1/'+database+'/documents';
const headers={Authorization:'Bearer owner','Content-Type':'application/json'};
const request=async(url,options={})=>{assert.equal(new URL(url).origin,'http://127.0.0.1:8662');const r=await fetch(url,{...options,headers,signal:AbortSignal.timeout(20000)});const body=await r.json();if(!r.ok)throw Error('Diagnostic request failed HTTP'+r.status);return body;};
const existing=await request(base+'/projects?pageSize=2');
if(!live)assert.equal(existing.documents?.length||0,0,'Disposable emulator must be empty');
else {
 assert.equal(existing.documents?.length,1);assert.equal(existing.documents[0].name,base.replace('http://127.0.0.1:8662/v1/','')+'/projects/'+selection.projectId);
 const names=new Set(selection.documents.map(x=>x.name));
 assert.ok(initial.documents.every(x=>names.has(x.name)),'Do not retain a stale candidate that was deleted in live history');
}
for(const doc of selection.documents){
 assert.ok(doc.name.startsWith(database+'/documents/projects/'+selection.projectId)||doc.name.startsWith(database+'/documents/my-boq-app/'));
}
for(let offset=0;offset<selection.documents.length;offset+=25){
 await request(base+':commit',{method:'POST',body:JSON.stringify({writes:selection.documents.slice(offset,offset+25).map(doc=>({update:{name:doc.name,fields:doc.fields}}))})});
}
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
// Protobuf JSON omits empty repeated/maps and emits the named null enum.
// Normalize only those defined wire defaults; field types and scalar values stay strict.
const normalizeValue=v=>{
 if('nullValue'in v)return {nullValue:'NULL_VALUE'};
 if('arrayValue'in v)return {arrayValue:{values:(v.arrayValue.values||[]).map(normalizeValue)}};
 if('mapValue'in v)return {mapValue:{fields:normalizeFields(v.mapValue.fields||{})}};
 if('timestampValue'in v){const m=v.timestampValue.match(/^(.*?)(?:\.(\d+))?Z$/);assert.ok(m);return {timestampValue:m[1]+'.'+(m[2]||'').padEnd(9,'0')+'Z'};}
 return v;
};
const normalizeFields=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalizeValue(x)]));
const digest=v=>createHash('sha256').update(canonical(normalizeFields(v))).digest('hex');
let verified=0;
for(const doc of selection.documents){
 const observed=await request(base+'/'+doc.name.split('/documents/')[1]);
 assert.equal(digest(observed.fields),digest(doc.fields));verified++;
}
await fs.writeFile('output/data-recovery-verification/'+(live?'live-import-results.json':'diagnostic-import-results.json'),JSON.stringify({status:'PASS',documentsWrittenAndReadback:verified,memberCount:selection.members.length,sourceProjectVersion:initial.project.version,diagnosticOnly:true,fullDatabaseRecovered:false,oldDataReplaced:false,originalServicesStopped:false,productionRequests:false,readbackBasis:live?'Exact Firestore field-value equality to selected latest datastore row snapshots; original commit timestamps retained only in private provenance':'Exact Firestore field-value equality in isolated emulator; timestamps/protobuf datastore authority not recovered'},null,2));
console.log('PASS diagnostic import/readback '+verified+' documents; full recovery UNPROVEN');
