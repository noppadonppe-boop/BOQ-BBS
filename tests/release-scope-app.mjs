import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const out='output/release-scope-verification',browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),sdk=await context.newPage(),ui=await context.newPage(),cloud=[],errors=[];
const call=(action,pid,data={})=>sdk.evaluate(async q=>(await import('/src/data/firebase.ts')).command(q.action,q.pid,q.data),{action,pid,data});
const read=p=>sdk.evaluate(async p=>{const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts'),s=await h.getDocFromServer(h.doc(f.db,p));return s.exists()?(await import('/src/domain/storageCodec.ts')).decodeStorage(s.data()):null;},p);
let releaseDelayed,delayedPath='';
try {
 await fs.mkdir(out,{recursive:true});for(const p of [sdk,ui])await guard(p,cloud,errors);
 await sdk.goto('http://127.0.0.1:5291');await login(sdk,admin);
 await sdk.evaluate(async()=>{const f=await import('/src/data/firebase.ts');assertLocal();function assertLocal(){if(!f.emulator||f.db.app.options.projectId!=='demo-boq-v041')throw Error('Local QA only');}});
 let code,pid,ra,rb,expectedA,expectedB;
 if(process.argv[2]==='resume')({code,pid,ra,rb,expectedA,expectedB}=JSON.parse(await fs.readFile('tmp/release-scope-context.json','utf8')));
 else {
 code='RELEASE-SCOPE-'+Date.now();pid=(await call('createProject',undefined,{project:{code,name:'Release scope SOFTWARE QA ONLY'}})).id;
 const member=await sdk.evaluate(async()=>{const {blankMember}=await import('/src/domain/model.ts');return blankMember('Custom','SCOPE-MEMBER-QA');});
 await call('saveMember',pid,{member});
 const aid=randomUUID(),file='Referrence/ตัวอย่าง BBS/GULF-ISB-CU-FL4000-B-101 - Rev 0A.pdf',bytes=await fs.readFile(file),sha256=createHash('sha256').update(bytes).digest('hex'),filePath=`projects/${pid}/files/${aid}/qa-reference.pdf`;
 await sdk.evaluate(()=>{const i=document.createElement('input');i.type='file';i.dataset.releaseScopeUpload='true';document.body.append(i);});
 await sdk.locator('[data-release-scope-upload]').setInputFiles(path.resolve(file));
 await sdk.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts');await h.uploadBytes(h.ref(f.storage,q.path),document.querySelector('[data-release-scope-upload]').files[0],{contentType:'application/pdf'});},{path:filePath});
 await call('attach',pid,{memberVersion:(await read(`projects/${pid}/members/${member.id}`)).version,note:'Original source bytes; no reconstructed geometry/Mark acceptance',attachment:{id:aid,name:'B101 SOFTWARE QA reference.pdf',path:filePath,memberId:member.id,kind:'Plan',revision:'QA1',page:1,size:bytes.length,contentType:'application/pdf',sha256}});
 let project=await read('projects/'+pid);
 const a=await call('freezeRevision',pid,{version:project.version});ra=await read(`projects/${pid}/revisions/${a.id}`);
 let saved=await read(`projects/${pid}/members/${member.id}`);await call('saveMember',pid,{member:{...saved,quantity:2}});project=await read('projects/'+pid);
 const b=await call('freezeRevision',pid,{version:project.version});rb=await read(`projects/${pid}/revisions/${b.id}`);
 expectedA=await call('inspectIssue',pid,{revisionId:a.id});expectedB=await call('inspectIssue',pid,{revisionId:b.id});
 assert.equal(expectedA.ready,false);assert.equal(expectedB.ready,false);assert.ok(expectedB.checks.some(c=>c.group==='engineering'));
 await fs.writeFile('tmp/release-scope-context.json',JSON.stringify({pid,code,ra,rb,expectedA,expectedB}));
 }
 let oldFinished;const oldCommandFinished=new Promise(resolve=>oldFinished=resolve);
 await ui.exposeFunction('releaseScopeCommandFinished',revisionId=>{if(revisionId===ra.id)oldFinished();});
 // Observe real command completion; preserve all arguments/results and the actual network requests.
 let observedDispatcher=0;
 await ui.route('**/src/data/firebase.ts*',async route=>{
  const response=await route.fetch(),body=await response.text(),match=body.match(/return directCommand\(action, (projectId\d*), data, requestId\);/);
  assert.ok(match,'Expected unchanged dispatcher boundary');
  observedDispatcher++;
  await route.fulfill({response,body:body.replace(match[0],`const result = await directCommand(action, ${match[1]}, data, requestId); if (action === "inspectIssue") await window.releaseScopeCommandFinished(data.revisionId); return result;`)});
 });
 await ui.goto('http://127.0.0.1:5291');await ui.getByPlaceholder('ค้นหาโครงการ',{exact:true}).fill(code);assert.ok(observedDispatcher>0,'Command completion observer must be installed');await ui.locator(`[data-project-id="${pid}"]`).click();await ui.locator('nav').getByRole('button',{name:'แบบส่งงาน',exact:true}).click();
 const panel=ui.locator('.release-review'),inspect=()=>panel.getByRole('button',{name:'ตรวจความพร้อม Revision ที่เลือก',exact:true}).click();
 await ui.locator('.revision-item').filter({has:ui.locator('strong',{hasText:ra.number})}).click();
 await ui.waitForFunction(()=>!document.querySelector('.revision-workarea .empty')?.textContent.includes('กำลังโหลด'));
 let entered;const delayed=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>releaseDelayed=resolve);delayedPath=ra.snapshot.path;
 await ui.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.hostname==='127.0.0.1'&&url.port==='9531'&&request.method()==='GET'&&decodeURIComponent(url.pathname).includes(delayedPath)){entered();await gate;}await route.continue();});
 const observations=[];await ui.exposeFunction('recordReleaseScope',value=>observations.push(value));
 await ui.evaluate(()=>{new MutationObserver(()=>{const panel=document.querySelector('.release-review');if(panel)window.recordReleaseScope({selected:panel.getAttribute('data-release-context'),report:panel.querySelector('[data-release-report]')?.getAttribute('data-release-report')||null});}).observe(document.body,{subtree:true,childList:true,attributes:true});});
 await inspect();await Promise.race([delayed,new Promise((_,reject)=>setTimeout(()=>reject(Error('Actual inspect snapshot GET not observed')),15000))]);
 assert.equal(await panel.getByRole('button',{name:'บันทึกผลตรวจไว้ในโครงการ',exact:true}).isEnabled(),false);
 await ui.locator('.revision-item').filter({has:ui.locator('strong',{hasText:rb.number})}).click();await inspect();await panel.locator(`[data-release-report="${rb.id}"]`).waitFor();
 const oldResponse=ui.waitForResponse(r=>r.request().method()==='GET'&&decodeURIComponent(new URL(r.url()).pathname).includes(delayedPath));releaseDelayed();await (await oldResponse).finished();
 await Promise.race([oldCommandFinished,new Promise((_,reject)=>setTimeout(()=>reject(Error('Old actual command completion not observed')),20000))]);
 await ui.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await panel.locator('[data-release-report]').getAttribute('data-release-report'),rb.id);
 assert.ok(!observations.some(o=>o.selected===rb.id&&o.report===ra.id));
 assert.equal(await panel.getByRole('button',{name:'ออก Issued จาก Revision ที่ตรวจครบ',exact:true}).isEnabled(),false);
 await ui.screenshot({path:out+'/current-revision.png',fullPage:true});
 await ui.setViewportSize({width:390,height:844});assert.equal(await ui.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await ui.screenshot({path:out+'/current-revision-mobile.png',fullPage:true});
 assert.equal((await read('projects/'+pid)).spec.approved,false);
 assert.equal((await read(`projects/${pid}/revisionStates/${ra.id}`)).status,'Frozen');assert.equal((await read(`projects/${pid}/revisionStates/${rb.id}`)).status,'Frozen');
 assert.deepEqual(await read(`projects/${pid}/revisions/${ra.id}`),ra);assert.deepEqual(await read(`projects/${pid}/revisions/${rb.id}`),rb);
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/app-results.json',JSON.stringify({status:'PASS',actualSignedPreflight:true,actualOldSnapshotGetDelayed:true,currentRevisionReportRetained:true,noOldReportInNewRevision:!observations.some(o=>o.selected===rb.id&&o.report===ra.id),busySaveDisabled:true,engineeringApproval:false,issuedButtonDisabled:true,bothFrozenRecordsUnchanged:true,mobileNoHorizontalOverflow:true,productionRequests:false,cloud,errors},null,2));
 console.log('PASS actual delayed old preflight cannot replace selected revision report; Frozen unchanged, approval false');
} finally {releaseDelayed?.();await browser.close();}
