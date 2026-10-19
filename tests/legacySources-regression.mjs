import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {client,call,create,upload,read,readObject,list,doc,getDoc,deleteApp} from './helpers/firebase-local.mjs';
const dir='output/legacy-source-verification',c=await client('qa@form.local','legacy-regression');
const {blankMember,blankBar,defaultSpec}=await import(pathToFileURL(process.cwd()+'/tmp/legacy-source-domain/model.js'));
const results=[];let pid;
const check=async(name,f)=>{await f();results.push({name,status:'PASS'});console.log('PASS',name);};
try{
 pid=await create(c,'LEGACY-ENGINE-REGRESSION');await call(c,'saveSpec',pid,{version:1,spec:defaultSpec});
 const project=async()=>(await getDoc(doc(c.db,`projects/${pid}`))).data();
 const ms=['Foundation','Beam'].map((category,i)=>{const m=blankMember(category,'REG-'+(i+1));m.bars=[{...blankBar('B01'),count:1,cutOverride:1000,note:'Software regression fixture'}];return m;});
 for(const member of ms)await call(c,'saveMember',pid,{member});
 async function file(memberId,name,kind='Plan',revision='A'){
  const bytes=await fs.readFile('tmp/source-fixtures/source-grid.png'),id=randomUUID(),path=`projects/${pid}/files/${id}/${name}`;
  assert.ok((await upload(c,pid,bytes,name,'image/png','files',path)).response.ok);
  return{id,name,path,memberId,kind,revision,size:bytes.length,contentType:'image/png',page:1};
 }
 const before=(await list(c,pid,'members')).docs.map(d=>d.data()),plans=await Promise.all(ms.map((m,i)=>file(m.id,'ordinary-plan-'+i+'.png')));
 let initial;
 await check('ordinary member intake still publishes both new sources with blank points/scales and exact owner versions',async()=>{
  initial=await call(c,'beginMemberSourceBatch',pid,{version:(await project()).version,note:'Ordinary new-file intake after adoption engine changes',items:plans.map(a=>({attachment:a,memberVersion:before.find(m=>m.id===a.memberId).version}))});
  assert.equal((await list(c,pid,'attachments')).size,0);
  await call(c,'advanceSpecChange',pid,{jobId:initial.id});
  for(const a of plans){const current=(await read(c,pid,'attachments',a.id)).data();assert.equal(current.sourceIntake.scope,'Member');assert.deepEqual(current.annotations,[]);assert.deepEqual(current.calibrations,{});assert.equal(current.sourceAdoption,undefined);}
 });
 const replacement=await file(ms[0].id,'ordinary-revision-B.png','Plan','B'),section=await file(ms[1].id,'ordinary-section.png','Section','A'),baseline=(await list(c,pid,'members')).docs.map(d=>d.data());let mixed;
 await check('ordinary mixed member replacement and new file still share an immutable before/after manifest',async()=>{
  mixed=await call(c,'beginMemberSourceBatch',pid,{version:(await project()).version,note:'Mixed normal revision and first section',items:[{attachment:replacement,memberVersion:baseline.find(m=>m.id===ms[0].id).version,previousAttachmentId:plans[0].id,previousVersion:1},{attachment:section,memberVersion:baseline.find(m=>m.id===ms[1].id).version}]});
  const job=(await read(c,pid,'specChangeJobs',mixed.id)).data(),manifest=await readObject(c,job.manifest);assert.equal(manifest.sourceChanges.length,1);assert.equal(manifest.sourceIntakes.length,1);assert.equal(manifest.sourceAdoptions,undefined);
  await call(c,'cancelSpecChange',pid,{jobId:mixed.id});
  for(const m of baseline)assert.deepEqual((await read(c,pid,'members',m.id)).data(),m);assert.equal((await list(c,pid,'attachments')).size,2);
 });
 await check('cancelled normal batch can be prepared again and publishes reciprocal lineage with new-source provenance intact',async()=>{
  const job=await call(c,'beginMemberSourceBatch',pid,{version:(await project()).version,note:'Retry after cancelled mixed intake',items:[{attachment:replacement,memberVersion:baseline.find(m=>m.id===ms[0].id).version,previousAttachmentId:plans[0].id,previousVersion:1},{attachment:section,memberVersion:baseline.find(m=>m.id===ms[1].id).version}]});
  await call(c,'advanceSpecChange',pid,{jobId:job.id});assert.equal((await read(c,pid,'attachments',plans[0].id)).data().supersededById,replacement.id);assert.equal((await read(c,pid,'attachments',replacement.id)).data().sourceRevision.previousAttachmentId,plans[0].id);assert.equal((await read(c,pid,'attachments',section.id)).data().sourceIntake.scope,'Member');
 });
 const general=await file('','ordinary-general-A.png','Standard Detail','A');
 await check('ordinary General Spec first intake still resets all members and publishes only at completion',async()=>{
  const job=await call(c,'beginGeneralSourceBatch',pid,{version:(await project()).version,note:'Ordinary General Spec intake regression',items:[{attachment:general}]});assert.equal((await read(c,pid,'attachments',general.id)).exists(),false);await call(c,'advanceSpecChange',pid,{jobId:job.id});assert.equal((await read(c,pid,'attachments',general.id)).data().sourceIntake.affectedMemberCount,2);assert.ok((await list(c,pid,'members')).docs.every(d=>d.data().status==='Draft'));
 });
 await check('ordinary General Spec replacement retains its original branch and leaves adoption provenance absent',async()=>{
  const next=await file('','ordinary-general-B.png','Standard Detail','B'),job=await call(c,'beginGeneralSourceRevision',pid,{version:(await project()).version,previousAttachmentId:general.id,previousVersion:1,note:'Ordinary General Spec revision regression',attachment:next});await call(c,'advanceSpecChange',pid,{jobId:job.id});const a=(await read(c,pid,'attachments',next.id)).data();assert.equal(a.sourceRevision.scope,'GeneralSpec');assert.equal(a.sourceRevision.previousAttachmentId,general.id);assert.equal(a.sourceAdoption,undefined);
 });
 await fs.writeFile(dir+'/regression-results.json',JSON.stringify({results,projectId:pid,scope:'Five fresh ordinary intake/revision branch regressions on shared batch engine; not engineering fixtures or repeat of all historical suites.'},null,2));
}catch(e){await fs.writeFile(dir+'/regression-failure.json',JSON.stringify({error:String(e),results,projectId:pid},null,2));throw e;}finally{await deleteApp(c.app);}
