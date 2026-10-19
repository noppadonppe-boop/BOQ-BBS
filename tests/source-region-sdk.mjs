import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,admin,viewer,guard} from './auth-persistence-qa.mjs';

const out='output/source-region-verification',ctx={sdkUrl:'http://127.0.0.1:5196',backend:'demo-boq-v041'},results=[],cloud=[],errors=[];
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),v=await browser.newPage();
for(const p of [page,v])await guard(p,cloud,errors);
const hash=b=>createHash('sha256').update(b).digest('hex');
const login=async(p,u)=>{await p.goto(ctx.sdkUrl+'/tests/context-harness.html');await p.evaluate(async u=>{const f=await import('/src/data/firebase.ts');if(!f.emulator||f.db.app.options.projectId!=='demo-boq-v041')throw Error('Isolated QA required');await(await import('/src/auth/authService.ts')).loginWithEmail(u.email,u.password);},u);};
const call=(action,pid,data={},id,p=page)=>p.evaluate(async q=>(await import('/src/data/firebase.ts')).command(q.action,q.pid,q.data,q.id),{action,pid,data,id});
const read=(path,p=page)=>p.evaluate(async path=>{const f=await import('/src/data/firebase.ts'),s=await import('/tests/direct-browser-harness.ts'),r=await s.getDocFromServer(s.doc(f.db,path));return r.exists()?(await import('/src/domain/storageCodec.ts')).decodeStorage(r.data()):null;},path);
async function attach(m,local,type,name){
 const bytes=await fs.readFile(local),p=await read('projects/'+ctx.pid),a=await page.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),s=await import('/tests/direct-browser-harness.ts'),id=crypto.randomUUID(),path='projects/'+q.pid+'/files/'+id+'/'+q.name,blob=new Blob([new Uint8Array(q.bytes)],{type:q.type});await s.uploadBytes(s.ref(f.storage,path),blob,{contentType:q.type});return {id,path,name:q.name,memberId:q.mid,kind:'Detail',revision:'0A',size:blob.size,contentType:q.type,page:1,sha256:await(await import('/src/data/snapshots.ts')).sha256(await blob.arrayBuffer())};},{pid:ctx.pid,mid:m.id,name,type,bytes:[...bytes]});
 await call('attach',ctx.pid,{attachment:a,projectVersion:p.version,memberVersion:m.version,note:'Read-only source-region QA; actual GULF remains unverified/no bar reconstruction'});
 const saved=await read('projects/'+ctx.pid+'/attachments/'+a.id);assert.equal(saved.sha256,hash(bytes));return saved;
}
const member=mid=>read('projects/'+ctx.pid+'/members/'+mid);
const inspect=mid=>page.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),s=await import('/tests/direct-browser-harness.ts'),decode=(await import('/src/domain/storageCodec.ts')).decodeStorage,m=decode((await s.getDocFromServer(s.doc(f.db,'projects/'+q.pid+'/members/'+q.mid))).data()),p=decode((await s.getDocFromServer(s.doc(f.db,'projects/'+q.pid))).data()),a=await(await import('/src/data/collections.ts')).readCollectionPages(q.pid,'attachments'),engine=await import('/src/domain/engine.ts');return {m,q:engine.takeoff(m,p.spec),comparison:(await import('/src/domain/sourceSchedule.ts')).compareSourceSchedule(m,engine.schedule(m,p.spec),a)};},{pid:ctx.pid,mid});
let current='setup';const check=async(name,fn)=>{current=name;await fn();results.push({name,status:'PASS'});console.log('PASS',name);};
try{
 await login(page,admin);ctx.pid=(await call('createProject',undefined,{project:{code:'SOURCE-REGION-'+Date.now(),name:'Source sketch reference QA / no engineering acceptance',notes:'Actual GULF source and separate synthetic rotation/image references. No inferred reinforcement.'}})).id;
 const profile=await page.evaluate(async pid=>{const p=(await import('/src/domain/drawingStandard.ts')).drawingProfileDraft({name:'Source reference QA',titleBlock:{company:'QA',drawnBy:'',checkedBy:''},owner:'',location:''});return {...p,language:'en',indexNumber:'QA-SRC46-INDEX',indexRevision:'0A'};},ctx.pid);
 let project=await read('projects/'+ctx.pid);await call('saveProject',ctx.pid,{project:{...project,drawingProfile:profile},version:project.version});
 await check('Actual GULF file identity and three printed rows retained; concrete3.234 and zero unentered app bars',async()=>{
  let m=await page.evaluate(async()=>({...((await import('/src/domain/model.ts')).blankMember('Column','GULF-2C1-100')),x:700,y:700,z:6600,cover:50,description:'Actual PDF/printed source only. Cover50 is an unconfirmed placeholder; no reconstructed bars or approved shape/radius.',drawingSetup:{number:'QA-SRC46-GULF',revision:'0A',title:'Actual GULF source sketch reference / unverified'}}));ctx.gulfMid=m.id;await call('saveMember',ctx.pid,{member:m});m=await member(m.id);
  ctx.gulfAttachment=await attach(m,'Referrence/ตัวอย่าง BBS/GULF-ISB-CU-FL10600-2C1-100.pdf','application/pdf','GULF-ISB-CU-FL10600-2C1-100.pdf');m=await member(m.id);
  m.sourceSchedule={version:1,attachmentId:ctx.gulfAttachment.id,sha256:ctx.gulfAttachment.sha256,page:1,basis:'perElement',statedTotalWeight:862.50,note:'Manual printed rows. Regions reference the visible rotated page only; no assumed radius/closure/paths.',rows:[{id:'gulf-4',mark:'4',diameter:12,grade:'SD40',count:148,cutLength:790,weight:103.82,note:'Source ends111/600/45deg; physical radius/closure not reconstructed.'},{id:'gulf-309',mark:'309',diameter:25,grade:'SD40',count:24,cutLength:7300,weight:675.22,note:'Source crank7deg,6400/203/700; not a straight7300 app bar.'},{id:'gulf-5',mark:'5',diameter:12,grade:'SD40',count:37,cutLength:2540,weight:83.45,note:'Source loop600x600/end111; actual physical closure pending.'}]};
  await call('saveMember',ctx.pid,{member:m});const data=await inspect(m.id);assert.equal(data.q.concrete,3.234);assert.equal(data.q.rebar,0);assert.ok(data.comparison.rows.every(r=>r.status==='Unmapped'));ctx.gulfBefore=data;
 });
 await check('Version2 saves explicit source regions,keeps all physical quantities/cuts and never reconstructs GULF steel',async()=>{
  let m=await member(ctx.gulfMid);const boxes=[{x:.935,y:.073,width:.060,height:.046},{x:.935,y:.116,width:.062,height:.035},{x:.935,y:.151,width:.060,height:.045}];
  m.sourceSchedule.version=2;m.sourceSchedule.rows=m.sourceSchedule.rows.map((r,i)=>({...r,shapeReference:{sha256:m.sourceSchedule.sha256,page:1,rect:boxes[i]}}));
  ctx.regionSaveId=crypto.randomUUID();ctx.regionSaveInput={member:structuredClone(m)};await call('saveMember',ctx.pid,ctx.regionSaveInput,ctx.regionSaveId);const data=await inspect(ctx.gulfMid);assert.deepEqual(data.q,ctx.gulfBefore.q);assert.equal(data.m.sourceSchedule.version,2);assert.equal(data.m.status,'Draft');assert.deepEqual(data.m.bars,[]);ctx.gulfRegions=data.m.sourceSchedule;
 });
 await check('Direct save rejects stale SHA,out-of-page/invalid bounds and stale versions without partial project/member writes',async()=>{
  const before=await member(ctx.gulfMid),p=await read('projects/'+ctx.pid);
  for(const patch of [{sha256:'b'.repeat(64)},{page:2},{rect:{x:.98,y:.1,width:.05,height:.1}}]){
   const bad=structuredClone(before);Object.assign(bad.sourceSchedule.rows[0].shapeReference,patch);await assert.rejects(()=>call('saveMember',ctx.pid,{member:bad}));
   assert.deepEqual(await member(ctx.gulfMid),before);assert.equal((await read('projects/'+ctx.pid)).version,p.version);
  }
  const stale=structuredClone(before);stale.version--;await assert.rejects(()=>call('saveMember',ctx.pid,{member:stale}));assert.deepEqual(await member(ctx.gulfMid),before);
 });
 await check('Synthetic source CropBox/rotations and PNG persist alongside mapped numerical BBS without becoming shape approval',async()=>{
  let m=await page.evaluate(async()=>{const d=await import('/src/domain/model.ts'),b={...d.blankBar('R01'),count:2,shapeCode:'00',outsideDiameter:16,bsType:'T',lengthMethod:'bs8666'};return {...d.blankMember('Custom','SYN-ROTATIONS'),bars:[b],drawingSetup:{number:'QA-SRC46-ROT',revision:'0A',title:'Synthetic rotated source / reference only'}};});
  ctx.rotationMid=m.id;await call('saveMember',ctx.pid,{member:m});m=await member(m.id);ctx.rotationAttachment=await attach(m,'tmp/source-fixtures/crop-rotations-stamp.pdf','application/pdf','Synthetic-crop-rotations.pdf');m=await member(m.id);
  const q=await inspect(m.id),cut=q.q.rows[0].cutLength;m.sourceSchedule={version:2,attachmentId:ctx.rotationAttachment.id,sha256:ctx.rotationAttachment.sha256,page:1,basis:'perElement',note:'Synthetic five-page CropBox/rotations reference. Numeric mapping does not assert the source picture has the app bar shape.',rows:Array.from({length:5},(_,i)=>({id:'rotation-'+(i+1),mark:i?'REF'+(i+1):'R01',diameter:16,grade:'SD40',count:2,cutLength:cut,...(!i?{barId:m.bars[0].id}:{}),note:'Synthetic region page'+(i+1)+',not engineering evidence',shapeReference:{sha256:ctx.rotationAttachment.sha256,page:i+1,rect:{x:0,y:0,width:.25,height:.25}}}))};await call('saveMember',ctx.pid,{member:m});
  assert.equal(ctx.rotationAttachment.pageCount,5);ctx.rotationBefore=(await inspect(m.id)).q;
  let image=await page.evaluate(async()=>{const d=await import('/src/domain/model.ts');return {...d.blankMember('Custom','SYN-IMAGE'),bars:[{...d.blankBar('R01'),count:2,shapeCode:'00',outsideDiameter:16,bsType:'T',lengthMethod:'bs8666'}],drawingSetup:{number:'QA-SRC46-IMG',revision:'0A',title:'Synthetic image source / reference only'}};});ctx.imageMid=image.id;await call('saveMember',ctx.pid,{member:image});image=await member(image.id);ctx.imageAttachment=await attach(image,'tmp/source-fixtures/source-grid.png','image/png','Synthetic-grid.png');image=await member(image.id);const iq=await inspect(image.id);image.sourceSchedule={version:2,attachmentId:ctx.imageAttachment.id,sha256:ctx.imageAttachment.sha256,page:1,basis:'perElement',note:'Synthetic PNG image region,not bar reconstruction.',rows:[{id:'image-1',mark:'R01',diameter:16,grade:'SD40',count:2,cutLength:iq.q.rows[0].cutLength,barId:image.bars[0].id,note:'',shapeReference:{sha256:ctx.imageAttachment.sha256,page:1,rect:{x:.1,y:.1,width:.4,height:.4}}}]};await call('saveMember',ctx.pid,{member:image});ctx.imageBefore=(await inspect(image.id)).q;
 });
 await check('Actual readers render original GULF and all5 cropped/rotated PDF pages plus PNG using pinned bytes',async()=>{
  const images=await page.evaluate(async pid=>{const b=await(await import('/src/data/snapshots.ts')).loadSnapshot(await(await import('/src/data/firebase.ts')).command('exportSnapshot',pid,{})),plans=(await import('/src/domain/sourceRegions.ts')).sourceRegionPlans(b),images=[];await(await import('/src/data/sourceRegionImages.ts')).visitSourceRegions(plans,(p,image)=>images.push({member:p.member.code,mark:p.row.mark,page:p.reference.page,...image}));return images;},ctx.pid);
  assert.equal(images.length,9);ctx.imageEvidence=[];
  for(const image of images){const name='crop-'+image.member+'-'+image.mark+'-p'+image.page+'.png',bytes=Buffer.from(image.data.split(',')[1],'base64');await fs.writeFile(out+'/'+name,bytes);ctx.imageEvidence.push({member:image.member,mark:image.mark,page:image.page,local:name,sha256:hash(bytes),width:image.width,height:image.height});}
 });
 await check('Viewer can read source references and actual image but command/raw Firestore deny modifying them',async()=>{
  await call('setRole',ctx.pid,{email:viewer.email,role:'viewer'});await login(v,viewer);assert.equal((await member(ctx.gulfMid)).sourceSchedule.version,2);
  await assert.rejects(()=>call('saveMember',ctx.pid,{member:ctx.regionSaveInput.member},undefined,v));
  await assert.rejects(()=>v.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),s=await import('/tests/direct-browser-harness.ts');await s.updateDoc(s.doc(f.db,'projects/'+q.pid+'/members/'+q.mid),{description:'forbidden'});},{pid:ctx.pid,mid:ctx.gulfMid}));
  const seen=await v.evaluate(async q=>{const r=new(await import('/src/data/sourceRegionImages.ts')).SourceRegionReader(q.a);try{return (await r.crop(q.reference)).width;}finally{await r.close();}},{a:ctx.gulfAttachment,reference:ctx.gulfRegions.rows[0].shapeReference});assert.ok(seen>0);
 });
 await check('Frozen source references keep their original region after Working edits; committed retry cannot overwrite later data',async()=>{
  const p=await read('projects/'+ctx.pid);ctx.revision=await call('freezeRevision',ctx.pid,{version:p.version});ctx.frozenRecord=await read('projects/'+ctx.pid+'/revisions/'+ctx.revision.id);ctx.frozenBundle=await page.evaluate(async r=>(await import('/src/data/snapshots.ts')).loadSnapshot(r),ctx.frozenRecord);
  const m=await member(ctx.gulfMid);m.sourceSchedule.rows[1].shapeReference.rect={x:.92,y:.11,width:.075,height:.046};await call('saveMember',ctx.pid,{member:m});const current=await member(ctx.gulfMid);await call('saveMember',ctx.pid,ctx.regionSaveInput,ctx.regionSaveId);assert.deepEqual(await member(ctx.gulfMid),current);const frozen=await page.evaluate(async r=>(await import('/src/data/snapshots.ts')).loadSnapshot(r),ctx.frozenRecord);assert.deepEqual(frozen,ctx.frozenBundle);assert.equal(frozen.members.find(m=>m.id===ctx.gulfMid).sourceSchedule.rows[1].shapeReference.rect.x,.935);
 });
 await check('Actual Backup/Restore retains version2 regions and source bytes while remapping attachment IDs/resetting confirmations',async()=>{
  const d=page.waitForEvent('download',{timeout:60000});await page.evaluate(async pid=>(await import('/src/data/exports.ts')).backup(pid),ctx.pid);await(await d).saveAs(out+'/source-regions-backup.zip');const bytes=await fs.readFile(out+'/source-regions-backup.zip');ctx.backup={bytes:bytes.length,sha256:hash(bytes)};
  ctx.restorePid=(await call('createProject',undefined,{project:{code:'REGION-RESTORE-'+Date.now(),name:'Restored source regions QA'}})).id;
  await page.evaluate(async q=>(await import('/src/data/restore.ts')).restore(q.pid,new File([new Uint8Array(q.bytes)],'regions.zip')),{pid:ctx.restorePid,bytes:[...bytes]});
  const restored=await read('projects/'+ctx.restorePid+'/members/'+ctx.gulfMid),original=await member(ctx.gulfMid);assert.notEqual(restored.sourceSchedule.attachmentId,original.sourceSchedule.attachmentId);assert.deepEqual(restored.sourceSchedule.rows,original.sourceSchedule.rows);assert.equal(restored.status,'Draft');
  const attachment=await read('projects/'+ctx.restorePid+'/attachments/'+restored.sourceSchedule.attachmentId),raw=await page.evaluate(async a=>{const f=await import('/src/data/firebase.ts'),s=await import('/tests/direct-browser-harness.ts');return Array.from(new Uint8Array(await(await s.getBlob(s.ref(f.storage,a.path))).arrayBuffer()));},attachment);assert.equal(hash(Buffer.from(raw)),ctx.gulfAttachment.sha256);
  ctx.importedHistories=await page.evaluate(async pid=>(await import('/src/data/collections.ts')).readCollectionPages(pid,'importedHistory'),ctx.restorePid);
 });
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
}catch(e){results.push({name:current,status:'FAIL',message:e.message});throw e;}
finally{await fs.writeFile(out+'/context.json',JSON.stringify(ctx,null,2));await fs.writeFile(out+'/sdk-results.json',JSON.stringify({results,cloud,errors,scope:'Actual local SDK/Rules/Storage/source rendering/Frozen/Backup/Restore. GULF reference pictures are not reconstructed reinforcement or engineering approval.'},null,2));await browser.close();}
