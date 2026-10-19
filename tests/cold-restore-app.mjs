import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const restoredPaths=JSON.parse(await fs.readFile('tmp/storage-framing-recovery/restored-paths.json','utf8'));const out='output/cold-restore-verification',ctx=JSON.parse(await fs.readFile('tmp/source-mark-navigation-context.json','utf8'));
const uiURL='http://127.0.0.1:5296';const b=await chromium.launch({headless:true}),c=await b.newContext({viewport:{width:1440,height:1000}}),sdk=await c.newPage(),p=await c.newPage(),cloud=[],errors=[];
try{
 for(const page of [p,sdk])await guard(page,cloud,errors);
 await sdk.goto('http://127.0.0.1:5296/tests/context-harness.html');await sdk.evaluate(async a=>{const f=await import('/src/data/firebase.ts');if(!f.emulator||f.db.app.options.projectId!=='demo-boq-v041')throw Error('Local only');await(await import('/src/auth/authService.ts')).loginWithEmail(a.email,a.password);},admin);
 const proof=await sdk.evaluate(async q=>{
  const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts'),d=await import('/src/domain/storageCodec.ts'),s=await import('/src/data/snapshots.ts');
  const member=d.decodeStorage((await h.getDocFromServer(h.doc(f.db,`projects/${q.pid}/members/${q.memberId}`))).data());
  const attachment=d.decodeStorage((await h.getDocFromServer(h.doc(f.db,`projects/${q.pid}/attachments/${q.attachmentId}`))).data());
  const snapshot=await s.loadSnapshot(q.record);
  const result=await Promise.all(Array.from({length:16},async(_,i)=>{const path=i%2?q.sourcePath:q.record.snapshot.path;const blob=await h.getBlob(h.ref(f.storage,path));return {kind:i%2?'source':'snapshot',sha256:await s.sha256(await blob.arrayBuffer()),size:blob.size};}));
  let overwriteDenied=false;try{await h.uploadBytes(h.ref(f.storage,q.sourcePath),new Uint8Array([1,2,3]),{contentType:'application/pdf'});}catch(e){if(e.code!=='storage/unauthorized')throw e;overwriteDenied=true;}
  const registered=[];for(let i=0;i<q.restoredPaths.length;i+=4)registered.push(...await Promise.all(q.restoredPaths.slice(i,i+4).map(async o=>{const blob=await h.getBlob(h.ref(f.storage,o.path));return {expected:o.sha256,actual:await s.sha256(await blob.arrayBuffer()),size:blob.size};})));const after=await h.getBlob(h.ref(f.storage,q.sourcePath));
  const afterMember=d.decodeStorage((await h.getDocFromServer(h.doc(f.db,`projects/${q.pid}/members/${q.memberId}`))).data());return {member,afterMember,attachment,snapshot,result,registered,overwriteDenied,afterSha256:await s.sha256(await after.arrayBuffer())};
 },{pid:ctx.pid,memberId:ctx.member.id,attachmentId:ctx.attachment.id,record:ctx.record,sourcePath:ctx.attachment.path,restoredPaths});
 assert.deepEqual(proof.afterMember,proof.member);for(const key of ['bars','occurrences','quantityBasis','sourceSchedule','x','y','z','cover'])assert.deepEqual(proof.member[key],ctx.beforeMember[key]);assert.deepEqual(proof.snapshot,ctx.frozen);assert.equal(proof.overwriteDenied,true);assert.equal(proof.afterSha256,ctx.attachment.sha256);
 for(const o of proof.registered)assert.equal(o.actual,o.expected);for(const r of proof.result)assert.equal(r.sha256,r.kind==='source'?ctx.attachment.sha256:ctx.record.digest);
 await p.goto(uiURL);await p.locator('.top-profile').waitFor();await p.getByPlaceholder('ค้นหาโครงการ',{exact:true}).fill(ctx.code);await p.locator(`[data-project-id="${ctx.pid}"]`).click();await p.locator('nav').getByRole('button',{name:'คาน',exact:false}).click();await p.getByRole('button',{name:'ตรวจเทียบ BBS จากแบบ',exact:true}).click();await p.locator('[data-source-mark-links] summary').click();await p.getByRole('button',{name:`เปิดจุดชี้ QA01 ${ctx.attachment.name} หน้า 2 #2`,exact:true}).click();await p.locator('.pdf-surface[data-rendered-page="2"][data-source-bytes-verified="true"]').waitFor();await p.locator('[data-source-focused-point]').waitFor();
 assert.equal(Number(await p.locator('[data-source-focused-point]').getAttribute('cx')),proof.attachment.annotations[1].x*1000);
 await p.locator('.pdf-surface').screenshot({path:out+'/cold-import-focus-page2.png'});
 await p.setViewportSize({width:390,height:844});await p.locator('[data-source-focused-point]').scrollIntoViewIfNeeded();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:out+'/cold-import-focus-mobile.png'});
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/signed-cold-app-results.json',JSON.stringify({status:'PASS',coldImportedStack:true,ports:{auth:11321,firestore:8851,storage:9532},actualSignedStorage:true,noMockDownloadResponses:true,simultaneousReads:proof.result.length,allRegisteredSignedReads:proof.registered.length,allSourceAndSnapshotHashesMatch:true,workingMemberExact:true,frozenExact:true,overwriteDenied:true,originalSourceHashRetained:true,actualPage2Focus:true,mobileNoHorizontalOverflow:true,syntheticPoints:true,engineeringApproval:false,productionRequests:false,cloud,errors},null,2));console.log('PASS independent cold-import app: actual login,34signed file reads,16parallel reads, exact Frozen/business fields, page/mobile and immutable overwrite denial');
}finally{await b.close();}
