import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
const ctx=JSON.parse(await fs.readFile('tmp/six-category-current-context.json','utf8')),pid=ctx.pid,project='demo-boq-v041',basePath=`projects/${project}/databases/(default)/documents`,root=`projects/${pid}`;
assert.match(pid,/^[a-zA-Z0-9_-]{1,80}$/);
const digest=b=>createHash('sha256').update(b).digest('hex'),stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
async function request(port,url,options={}){
 const readOnly=!options.method||url.endsWith(':listCollectionIds');
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(`http://127.0.0.1:${port}${url}`,{...options,headers:{Authorization:'Bearer owner',...options.headers},signal:AbortSignal.timeout(20000)});
  if(response.status===500&&readOnly&&attempt<2){await new Promise(resolve=>setTimeout(resolve,400));continue;}
  if(!response.ok&&response.status!==404)throw Error(`Local QA request HTTP${response.status} on${port}`);return response;
 }
}
async function document(port,name){const r=await request(port,`/v1/${basePath}/${name}`);return r.status===404?null:r.json();}
const source=await document(8751,root),dest=await document(8851,root);assert.ok(source);
if(dest)assert.equal(stable(dest.fields),stable(source.fields),'Existing destination must be the exact fixture');
const documents=[source];
async function collect(parent){let pageToken;do{const r=await request(8751,`/v1/${basePath}/${parent}:listCollectionIds`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageSize:100,...(pageToken?{pageToken}:{})})}),data=await r.json();for(const collection of data.collectionIds||[]){let next;do{const url=`/v1/${basePath}/${parent}/${collection}?pageSize=100${next?'&pageToken='+encodeURIComponent(next):''}`,list=await(await request(8751,url)).json();for(const d of list.documents||[]){documents.push(d);assert.ok(documents.length<=2000);await collect(d.name.slice((basePath+'/').length));}next=list.nextPageToken;}while(next);}pageToken=data.nextPageToken;}while(pageToken);}
await collect(root);
function value(field){if(field.mapValue)return Object.fromEntries(Object.entries(field.mapValue.fields||{}).map(([k,v])=>[k,value(v)]));if(field.arrayValue)return(field.arrayValue.values||[]).map(value);if(field.stringValue!==undefined)return field.stringValue;if(field.integerValue!==undefined)return Number(field.integerValue);if(field.doubleValue!==undefined)return field.doubleValue;if(field.booleanValue!==undefined)return field.booleanValue;return null;}
// Snapshot semantic digests and encoded file byte hashes are distinct. Only
// explicit file SHA256 metadata is a byte checksum; recurse into snapshot refs.
const refs=new Map();function files(v){if(!v||typeof v!=='object')return;if(typeof v.path==='string'&&v.path.startsWith(root+'/')&&v.sha256){const sha256=v.sha256;assert.match(sha256,/^[a-f0-9]{64}$/);const previous=refs.get(v.path);if(previous)assert.equal(previous.sha256,sha256);refs.set(v.path,{path:v.path,sha256});}for(const item of Object.values(v))files(item);}
for(const d of documents)files(value({mapValue:{fields:d.fields}}));
const metadataPath=path=>' /v0/b/demo-boq-bbs.appspot.com/o/'+encodeURIComponent(path);
for(const file of refs.values()){
 const url=metadataPath(file.path).trim(),sourceMetadata=await(await request(9531,url)).json(),bytes=Buffer.from(await(await request(9531,url+'?alt=media')).arrayBuffer());assert.equal(digest(bytes),file.sha256);
 const existing=await request(9532,url);
 if(existing.status!==404){const existingBytes=Buffer.from(await(await request(9532,url+'?alt=media')).arrayBuffer());if(digest(existingBytes)===file.sha256)continue;
  // Repair only this helper's interrupted multipart-as-media payload under an
  // absent new fixture prefix. Never replace an existing project/artifact.
  assert.equal(dest,null);assert.ok(existingBytes.toString('utf8',0,500).startsWith('--sixfixture-'));assert.ok(existingBytes.toString('utf8',0,500).includes(file.path));
 }
 const boundary='sixfixture-'+randomUUID(),metadata={name:file.path,contentType:sourceMetadata.contentType||'application/octet-stream',metadata:sourceMetadata.metadata||{}},body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${metadata.contentType}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
 await request(9532,'/v0/b/demo-boq-bbs.appspot.com/o?uploadType=media&name='+encodeURIComponent(file.path),{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`,'X-Goog-Upload-Protocol':'multipart'},body});assert.equal(digest(Buffer.from(await(await request(9532,url+'?alt=media')).arrayBuffer())),file.sha256);
}
const writes=[];for(const d of documents){const name=d.name.slice((basePath+'/').length);assert.ok(name===root||name.startsWith(root+'/'));const existing=await document(8851,name);if(existing)assert.equal(stable(existing.fields),stable(d.fields));else writes.push({update:{name:d.name,fields:d.fields},currentDocument:{exists:false}});}
assert.ok(writes.length<=500);if(writes.length)await request(8851,`/v1/projects/${project}/databases/(default)/documents:commit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes})});
for(const d of documents)assert.equal(stable((await document(8851,d.name.slice((basePath+'/').length))).fields),stable(d.fields));
await fs.writeFile('tmp/six-category-cold-copy.json',JSON.stringify({pid,project,documents:documents.length,files:[...refs.values()]},null,2));
await fs.writeFile('output/six-category-current-verification/cold-copy-results.json',JSON.stringify({status:'PASS',scope:'Exact six-category QA project subtree and referenced file bytes copied into existing independent local QA; no profile/Auth or existing fixture replacement',documentFieldsVerified:documents.length,fileBytesVerified:refs.size,newProjectPrefixOnly:true,sourceServicesRetained:true,originalStorageTimestampsNotClaimed:true,productionRequests:false},null,2));
console.log('PASS exact six-category QA copy:',documents.length,'document fields;',refs.size,'file hashes; original services/profile/Auth retained');
