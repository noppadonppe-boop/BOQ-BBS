import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,guard} from './auth-persistence-qa.mjs';
const objects=JSON.parse(await fs.readFile('tmp/storage-framing-recovery/restored-paths.json','utf8'));
const b=await chromium.launch({headless:true}),c=await b.newContext(),original=await c.newPage(),imported=await c.newPage(),cloud=[],errors=[];
async function read(p,url){
 await guard(p,cloud,errors);await p.goto(url+'/tests/context-harness.html');
 return p.evaluate(async q=>{
  const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts'),s=await import('/src/data/snapshots.ts');
  if(!f.emulator||f.db.app.options.projectId!=='demo-boq-v041')throw Error('Local only');
  await(await import('/src/auth/authService.ts')).loginWithEmail(q.admin.email,q.admin.password);
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const results=[];
  for(let i=0;i<q.objects.length;i+=4)results.push(...await Promise.all(q.objects.slice(i,i+4).map(async o=>{
   const m=await h.getMetadata(h.ref(f.storage,o.path));const clean=Object.fromEntries(Object.entries(m).filter(([k])=>k!=='ref'));
   return {digest:await s.sha256(new TextEncoder().encode(JSON.stringify(canonical(clean))).buffer),fields:Object.keys(clean).sort()};
  })));
  return results;
 },{objects,admin});
}
try{
 const before=await read(original,'http://127.0.0.1:5291'),after=await read(imported,'http://127.0.0.1:5296');
 assert.equal(before.length,34);assert.equal(after.length,before.length);
 for(let i=0;i<before.length;i++){assert.equal(after[i].digest,before[i].digest,'Metadata digest differs for local object ordinal '+i);assert.deepEqual(after[i].fields,before[i].fields);}
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile('output/cold-restore-verification/storage-metadata-results.json',JSON.stringify({status:'PASS',objects:before.length,allSDKMetadataExact:true,includesTimeCreatedUpdatedGenerationCustomMetadata:true,comparedCurrentPostRecoveryCapture:true,doesNotRecoverPreIncidentMetadata:true,noMetadataValuesOrDownloadTokensPublished:true,productionRequests:false,cloud,errors},null,2));
 console.log('PASS34cold-import Storage metadata digests match original post-recovery service including timestamps/generations/custom fields');
}finally{await b.close();}
