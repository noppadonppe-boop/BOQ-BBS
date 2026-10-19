// Real signed business paths against recovered local fields/bytes; no production endpoint.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {chromium,admin,guard} from './auth-persistence-qa.mjs';
const out='output/full-data-recovery-verification',ctx=JSON.parse(await fs.readFile('output/area-change-verification/context.json','utf8')),root='C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014',files=JSON.parse(await fs.readFile(root+'/project-file-recovery-index.json','utf8'));
const b=await chromium.launch({headless:true}),p=await b.newPage(),results=[],cloud=[],errors=[];const check=async(name,f)=>{await f();results.push({name,status:'PASS'});console.log('PASS '+name);};
try{
 await guard(p,cloud,errors);await p.goto('http://127.0.0.1:5236/tests/context-harness.html');await p.evaluate(async q=>{const f=await import('/src/data/firebase.ts');if(!f.emulator||f.db.app.options.projectId!=='demo-boq-v041')throw Error('Local recovery only');await(await import('/src/auth/authService.ts')).loginWithEmail(q.email,q.password);},admin);
 await check('Signed Storage reads verify every11 recovered project objects and unsigned access is denied',async()=>{
  const hashes=await p.evaluate(async files=>{const f=await import('/src/data/firebase.ts'),s=await import('/tests/direct-browser-harness.ts'),h=await import('/src/data/snapshots.ts');const result=[];for(const file of files){const blob=await s.getBlob(s.ref(f.storage,file.path));result.push({sha256:await h.sha256(await blob.arrayBuffer()),size:blob.size});}return result;},files);
  assert.deepEqual(hashes,files.map(x=>({sha256:x.sha256,size:x.size})));
  const unsigned=await fetch('http://127.0.0.1:9511/v0/b/demo-boq-bbs.appspot.com/o/'+encodeURIComponent(files[0].path)+'?alt=media',{signal:AbortSignal.timeout(15000)});assert.equal(unsigned.status,403);
 });
 await check('Both original Frozen snapshots and completed export hashes survive; current West/Roof remains separate',async()=>{
  const result=await p.evaluate(async pid=>{const c=await import('/src/data/collections.ts'),s=await import('/src/data/snapshots.ts'),q=await import('/src/domain/quantityReport.ts');const revisions=await c.readCollectionPages(pid,'revisions'),rows=[];for(const r of revisions){const bundle=await s.loadSnapshot(r),report=q.quantityReport(bundle);rows.push({number:r.number,version:bundle.version,concrete:report.totals[1],quantity:report.totals[0],m0:bundle.members.find(m=>m.id==='M000').occurrences[1].quantity});}return rows.sort((a,b)=>a.number.localeCompare(b.number));},ctx.pid);
  assert.deepEqual(result,[{number:'R001',version:59,concrete:290,quantity:285,m0:3},{number:'R002',version:63,concrete:292,quantity:286,m0:4}]);
 });
 let backup;
 await check('Actual app Backup contains latest57 members and all original immutable history bytes',async()=>{
  const download=p.waitForEvent('download',{timeout:120000});download.catch(()=>{});await p.evaluate(async pid=>(await import('/src/data/exports.ts')).backup(pid),ctx.pid);backup=out+'/Recovered-project-QA-backup.zip';await(await download).saveAs(backup);
  await p.evaluate(()=>{const input=document.createElement('input');input.type='file';input.dataset.recoveryBackup='';document.body.append(input);});await p.locator('input[data-recovery-backup]').setInputFiles(backup);
  const inspected=await p.evaluate(async()=> (await import('/src/data/backupInspection.ts')).inspectBackup(document.querySelector('input[data-recovery-backup]').files[0]));assert.ok(inspected.verifiedBytes>=708860);ctx.recoveredBackupInspection=inspected;ctx.recoveredBackupSha=createHash('sha256').update(await fs.readFile(backup)).digest('hex');
 });
 await check('Actual Restore reproduces Working57 members, original artifact hashes and inactive archived jobs/approvals',async()=>{
  const pid=await p.evaluate(async()=> (await(await import('/src/data/firebase.ts')).command('createProject',undefined,{project:{code:'RECOVERED-QA-'+Date.now(),name:'Recovered local QA / no engineering acceptance'}})).id);
  await p.evaluate(async pid=>(await import('/src/data/restore.ts')).restore(pid,document.querySelector('input[data-recovery-backup]').files[0]),pid);
  const result=await p.evaluate(async q=>{const c=await import('/src/data/collections.ts'),s=await import('/src/data/snapshots.ts'),f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts'),r=await import('/src/data/projectReadback.ts'),project=await r.readProjectRecord(q.pid),members=await c.readCollectionPages(q.pid,'members'),history=await c.readCollectionPages(q.pid,'importedHistory'),refs=history.flatMap(x=>x.sourceRefs||[]);const hashes=[];for(const file of q.files){const ref=refs.find(x=>x.sha256===file.sha256);if(!ref)throw Error('Missing original historical bytes');const blob=await h.getBlob(h.ref(f.storage,ref.path));hashes.push(await s.sha256(await blob.arrayBuffer()));}return {members:members.length,areas:members.every(m=>m.occurrences.find(o=>o.id==='B').zone==='West'&&m.occurrences.find(o=>o.id==='B').floor==='Roof'),approved:project.spec.approved,activeSpecJobs:(await c.readCollectionPages(q.pid,'specChangeJobs')).length,activeRevisions:(await c.readCollectionPages(q.pid,'revisions')).length,hashes};},{pid,files});
  assert.equal(result.members,57);assert.ok(result.areas);assert.equal(result.approved,false);assert.equal(result.activeSpecJobs,0);assert.equal(result.activeRevisions,0);assert.deepEqual(result.hashes,files.map(x=>x.sha256));ctx.recoveredRestorePid=pid;
 });
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
}catch(e){results.push({name:'Current recovered app scenario',status:'FAIL',error:e.message});throw e;}
finally{await fs.writeFile(root+'/recovered-app-context.json',JSON.stringify(ctx,null,2));await fs.writeFile(out+'/recovered-app-results.json',JSON.stringify({results,cloud,errors,productionRequests:false,backend:'Isolated recovery clone; prior Auth seed',originalBackendWritten:false},null,2));await b.close();}
