import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const out='output/six-category-current-verification',ctx=JSON.parse(await fs.readFile('tmp/six-category-current-context.json','utf8')),browser=await chromium.launch({headless:true}),p=await browser.newPage({acceptDownloads:true}),cloud=[],errors=[],results=[];
const call=(action,data={})=>p.evaluate(async q=>(await import('/src/data/firebase.ts')).command(q.action,q.pid,q.data),{action,pid:ctx.pid,data});
const read=(collection='',id='')=>p.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts'),s=await h.getDocFromServer(h.doc(f.db,`projects/${q.pid}${q.collection?'/'+q.collection+'/'+q.id:''}`));return s.exists()?(await import('/src/domain/storageCodec.ts')).decodeStorage(s.data()):null;},{pid:ctx.pid,collection,id});
try {
 await guard(p,cloud,errors);await p.goto('http://127.0.0.1:5291');await login(p,admin);
 const project=await read();assert.equal(project.spec.approved,false);
 if(process.argv[2]==='frames'&&!ctx.frameRecord){ctx.previousRevision=ctx.revision;ctx.previousRecord=ctx.record;ctx.previousFrozen=ctx.frozen;ctx.revision=await call('freezeRevision',{version:project.version});ctx.record=await read('revisions',ctx.revision.id);ctx.frozen=await p.evaluate(async r=>(await import('/src/data/snapshots.ts')).loadSnapshot(r),ctx.record);ctx.frameRecord=true;await fs.writeFile('tmp/six-category-current-context.json',JSON.stringify(ctx));}
 if(!ctx.revision){ctx.revision=await call('freezeRevision',{version:project.version});ctx.record=await read('revisions',ctx.revision.id);ctx.frozen=await p.evaluate(async r=>(await import('/src/data/snapshots.ts')).loadSnapshot(r),ctx.record);await fs.writeFile('tmp/six-category-current-context.json',JSON.stringify(ctx));}
 assert.equal(ctx.frozen.members.length,6);assert.ok(ctx.frozen.members.every(m=>m.quantityBasis.state==='Entered'&&m.status==='Draft'&&m.bars.every(b=>!b.placementConfirmed&&!b.bsDimensionsConfirmed)));
 const prefix=ctx.frameRecord?'Six-Category-R002':'Six-Category';
 for(const [kind,size,layout,name] of [['excel','A3',undefined,prefix+'-BOQ-BBS.xlsx'],['boq','A3',undefined,prefix+'-BOQ-A3.pdf'],['drawing','A1','details-v2',prefix+'-BBS-A1.pdf']]){
  const job=await call('exportSnapshot',{revisionId:ctx.revision.id}),d=p.waitForEvent('download',{timeout:180000});d.catch(()=>{});
  await p.evaluate(async q=>(await import('/src/data/exports.ts')).generateJob(q.pid,q.job,q.kind,q.size,q.layout,true),{pid:ctx.pid,job,kind,size,layout});
  await(await d).saveAs(path.resolve(out,name));const record=await read('exportJobs',job.id),bytes=await fs.readFile(out+'/'+name),sha256=createHash('sha256').update(bytes).digest('hex');
  assert.equal(record.status,'Complete');assert.equal(record.file.sha256,sha256);assert.equal(record.revisionId,ctx.revision.id);assert.equal(record.revisionDigest,ctx.record.digest);assert.equal(record.summary.status,'Frozen');
  results.push({name,sha256,size:bytes.length,registeredJob:true,status:'Frozen',engineeringApproval:false});console.log('PASS actual registered',name);
 }
 assert.deepEqual(await read('revisions',ctx.revision.id),ctx.record);assert.deepEqual(await p.evaluate(async r=>(await import('/src/data/snapshots.ts')).loadSnapshot(r),ctx.record),ctx.frozen);
 if(ctx.previousRecord){assert.deepEqual(await read('revisions',ctx.previousRevision.id),ctx.previousRecord);assert.deepEqual(await p.evaluate(async r=>(await import('/src/data/snapshots.ts')).loadSnapshot(r),ctx.previousRecord),ctx.previousFrozen);}
 ctx.artifacts=results;await fs.writeFile('tmp/six-category-current-context.json',JSON.stringify(ctx));assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/artifact-results.json',JSON.stringify({status:'PASS',registeredStoredDownloadedHashes:true,artifacts:results,frozenUnchanged:true,engineeringApproval:false,issuedNotClaimed:true,productionRequests:false,cloud,errors},null,2));
} finally {await browser.close();}
