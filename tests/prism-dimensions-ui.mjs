import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,login,admin} from './auth-persistence-qa.mjs';
const out='output/prism-verification',ctx=JSON.parse(await fs.readFile(out+'/context.json','utf8')),files=JSON.parse(await fs.readFile(out+'/artifacts.json','utf8')),browser=await chromium.launch({headless:true}),context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),sdk=await context.newPage(),ui=await context.newPage(),cloud=[],errors=[];
for(const p of [sdk,ui]){p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{if(/googleapis\.com$|firebaseio\.com$|firebasestorage\.app$/.test(new URL(r.request().url()).hostname)){cloud.push(r.request().url());return r.abort();}return r.continue();});}
try{
 await ui.goto('http://127.0.0.1:5221');await login(ui,admin);await ui.getByPlaceholder('ค้นหาโครงการ',{exact:true}).fill(ctx.code);await ui.locator(`[data-project-id="${ctx.pid}"]`).click();await ui.locator('nav').getByRole('button',{name:'องค์ประกอบอื่น',exact:false}).click();await ui.locator('.member-list').getByRole('button',{name:'P-Custom',exact:false}).click();
 assert.deepEqual(await ui.locator('[data-view-width]').allTextContents(),['4000 mm','2000 mm']);await ui.screenshot({path:out+'/section-dimensions-corrected.png',fullPage:true});await ui.setViewportSize({width:390,height:844});assert.equal(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await ui.locator('svg.plan').screenshot({path:out+'/section-dimensions-mobile.png'});
 await sdk.goto('http://127.0.0.1:5215');await login(sdk,admin);await sdk.evaluate(async()=>{const f=await import('/src/data/firebase.ts');if(!f.emulator||f.db.app.options.projectId!=='demo-boq-v041')throw Error('Isolated SDK required');});
 for(const size of ['A3','A1']){
  const name='PRISM-'+size+'-draft.pdf';await fs.copyFile(out+'/'+name,out+'/before-section-dimension-'+size+'.pdf');
  const job=await sdk.evaluate(async q=>(await import('/src/data/firebase.ts')).command('exportSnapshot',q.pid,{revisionId:q.revision,scope:{memberId:q.member}}),{pid:ctx.pid,revision:ctx.revision.id,member:ctx.triangle.id}),waiting=sdk.waitForEvent('download',{timeout:180000});
  await sdk.evaluate(async q=>(await import('/src/data/exports.ts')).generateJob(q.pid,q.job,'drawing',q.size,'details-v2',true),{pid:ctx.pid,job,size});await(await waiting).saveAs(path.resolve(out,name));
  const bytes=await fs.readFile(out+'/'+name),sha256=createHash('sha256').update(bytes).digest('hex'),record=await sdk.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts');return(await h.getDocFromServer(h.doc(f.db,'projects',q.pid,'exportJobs',q.id))).data();},{pid:ctx.pid,id:job.id});assert.equal(record.file.sha256,sha256);files.splice(files.findIndex(f=>f.name===name),1,{name,bytes:bytes.length,sha256,jobId:job.id,kind:'drawing',size});
 }
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);await fs.writeFile(out+'/artifacts.json',JSON.stringify(files,null,2));await fs.writeFile(out+'/dimension-ui-results.json',JSON.stringify({status:'PASS',planWidth:4000,sectionWidth:2000,mobileNoOverflow:true,actualAppPdfsRegenerated:2,errors,cloud},null,2));console.log('PASS actual compiled2D/mobile plan4000/section2000, regenerated A3/A1 from same Frozen capture');
}finally{await browser.close();}
