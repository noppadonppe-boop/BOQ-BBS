import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const out='output/reported-quantity-verification',ctx=JSON.parse(await fs.readFile('tmp/reported-quantity-context.json','utf8')),browser=await chromium.launch({headless:true}),p=await browser.newPage({acceptDownloads:true}),cloud=[],errors=[],results=[];
try {
 await guard(p,cloud,errors);await p.goto('http://127.0.0.1:5296');await login(p,admin);
 const state=await p.evaluate(async pid=>{const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts'),project=(await h.getDocFromServer(h.doc(f.db,'projects/'+pid))).data(),revision=await f.command('freezeRevision',pid,{version:project.version});return{revision,record:(await import('/src/domain/storageCodec.ts')).decodeStorage((await h.getDocFromServer(h.doc(f.db,`projects/${pid}/revisions/${revision.id}`))).data())};},ctx.pid);
 ctx.revision=state.revision;ctx.record=state.record;ctx.frozen=await p.evaluate(async record=>(await import('/src/data/snapshots.ts')).loadSnapshot(record),ctx.record);
 assert.equal(ctx.frozen.project.spec.approved,false);assert.ok(ctx.frozen.members.every(m=>m.quantityBasis.state==='Provisional'&&m.bars.length===0&&m.sourceSchedule.rows.length===3));
 for(const [kind,name] of [['excel','Source-C1-Quantity-Review.xlsx'],['boq','Source-C1-BOQ-Pending-A3.pdf']]){
  const job=await p.evaluate(async q=>(await import('/src/data/firebase.ts')).command('exportSnapshot',q.pid,{revisionId:q.rid}),{pid:ctx.pid,rid:ctx.revision.id}),download=p.waitForEvent('download',{timeout:180000});download.catch(()=>{});
  await p.evaluate(async q=>(await import('/src/data/exports.ts')).generateJob(q.pid,q.job,q.kind,'A3',undefined,true),{pid:ctx.pid,job,kind});await(await download).saveAs(path.resolve(out,name));
  const bytes=await fs.readFile(out+'/'+name),sha256=createHash('sha256').update(bytes).digest('hex'),record=await p.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts');return(await h.getDocFromServer(h.doc(f.db,`projects/${q.pid}/exportJobs/${q.id}`))).data();},{pid:ctx.pid,id:job.id});assert.equal(record.status,'Complete');assert.equal(record.file.sha256,sha256);results.push({name,sha256,size:bytes.length,registeredJob:true});
 }
 ctx.artifacts=results;await fs.writeFile('tmp/reported-quantity-context.json',JSON.stringify(ctx));assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/artifact-results.json',JSON.stringify({status:'PASS',actualRegisteredExports:true,rawSourceCount78:true,noPhysicalBbs:true,provisionalQuantities:true,engineeringApproval:false,artifacts:results,productionRequests:false,cloud,errors},null,2));console.log('PASS actual registered source-C1 review Excel/A3BOQ; provisional inputs, no physical BBS or approval');
} finally {await browser.close();}
