// Recover verified object bytes to the owned isolated Storage only.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
const root='C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014';
const index=JSON.parse(await fs.readFile(root+'/project-file-recovery-index.json','utf8')),selection=JSON.parse(await fs.readFile(root+'/live-selection.json','utf8'));
assert.ok(index.every(x=>x.recovered));
const decode=v=>'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):'arrayValue'in v?(v.arrayValue.values||[]).map(decode):'integerValue'in v?Number(v.integerValue):Object.values(v)[0];
const jobs=selection.documents.filter(x=>x.document.name.includes('/exportJobs/')).map(x=>Object.fromEntries(Object.entries(x.document.fields).map(([k,v])=>[k,decode(v)])));
let verified=0;
for(const file of index){
 const bytes=await fs.readFile(root+'/reconstructed-files/'+file.local);assert.equal(bytes.length,file.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
 const matching=jobs.find(j=>j.file?.path===file.path),metadata={name:file.path,contentType:file.contentType,metadata:{sha256:file.sha256,...(matching?{digest:matching.digest}:{})}};
 const boundary='Recovery-'+randomUUID();const body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: '+file.contentType+'\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
 const r=await fetch('http://127.0.0.1:9511/upload/storage/v1/b/demo-boq-bbs.appspot.com/o?uploadType=multipart',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'multipart/related; boundary='+boundary},body,signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);
 const read=await fetch('http://127.0.0.1:9511/download/storage/v1/b/demo-boq-bbs.appspot.com/o/'+encodeURIComponent(file.path)+'?alt=media',{headers:{Authorization:'Bearer owner'},signal:AbortSignal.timeout(20000)});assert.equal(read.status,200);assert.equal(createHash('sha256').update(Buffer.from(await read.arrayBuffer())).digest('hex'),file.sha256);verified++;
}
await fs.writeFile('output/full-data-recovery-verification/storage-import-results.json',JSON.stringify({status:'PASS',exactProjectObjects:verified,originalStorageWritten:false,isolatedStoragePort:9511,fullOtherProjectStorageRecovered:false,metadataBasis:'New local metadata with preserved checksum/contentType and completed-job digest; original Storage timestamps/download tokens not recovered'},null,2));console.log('PASS isolated recovery Storage bytes '+verified);
