import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const out='output/release-scope-verification',ctx=JSON.parse(await fs.readFile('tmp/release-scope-context.json','utf8'));
const browser=await chromium.launch({headless:true}),context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),sdk=await context.newPage(),ui=await context.newPage(),cloud=[],errors=[];
try {
 for(const p of [sdk,ui])await guard(p,cloud,errors);
 await sdk.goto('http://127.0.0.1:5291');await login(sdk,admin);
 const saved=process.argv[2]==='resume'?{record:ctx.savedRecord,report:ctx.savedReport}:await sdk.evaluate(async q=>{
  const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts');
  if(!f.emulator||f.db.app.options.projectId!=='demo-boq-v041')throw Error('Local QA only');
  const project=(await h.getDocFromServer(h.doc(f.db,'projects/'+q.pid))).data();
  const record=await f.command('prepareIssue',q.pid,{revisionId:q.rid,projectVersion:project.version});
  const report=await (await import('/src/data/releaseReview.ts')).readSavedReleaseReport(record);
  return {record,report};
 },{pid:ctx.pid,rid:ctx.rb.id});
 assert.equal(saved.report.ready,false);assert.equal(saved.report.revisionDigest,ctx.rb.digest);assert.ok(saved.report.checks.some(c=>c.group==='engineering'));
 ctx.savedRecord=saved.record;ctx.savedReport=saved.report;await fs.writeFile('tmp/release-scope-context.json',JSON.stringify(ctx));
 await ui.goto('http://127.0.0.1:5300');await login(ui,admin);await ui.getByPlaceholder('ค้นหาโครงการ',{exact:true}).fill(ctx.code);await ui.locator(`[data-project-id="${ctx.pid}"]`).click();await ui.locator('nav').getByRole('button',{name:'แบบส่งงาน',exact:true}).click();
 const panel=ui.locator('.release-review');
 await ui.locator('.revision-item').filter({has:ui.locator('strong',{hasText:ctx.rb.number})}).click();
 await panel.getByRole('button',{name:'ตรวจความพร้อม Revision ที่เลือก',exact:true}).click();await panel.locator(`[data-release-report="${ctx.rb.id}"]`).waitFor();
 const downloaded=await Promise.all([ui.waitForEvent('download'),panel.getByRole('button',{name:'ดาวน์โหลดผลตรวจ JSON',exact:true}).click()]);
 await downloaded[0].saveAs(out+'/current-release-preflight.json');const actual=JSON.parse(await fs.readFile(out+'/current-release-preflight.json','utf8'));
 assert.equal(actual.projectId,ctx.pid);assert.equal(actual.revisionId,ctx.rb.id);assert.equal(actual.revisionDigest,ctx.rb.digest);assert.equal(actual.ready,false);assert.deepEqual(actual.checks,ctx.expectedB.checks);
 assert.equal(await panel.getByRole('button',{name:'ออก Issued จาก Revision ที่ตรวจครบ',exact:true}).isEnabled(),false);
 const historical=panel.locator(`[data-release-review-id="${saved.record.id}"]`);await panel.locator('summary').filter({hasText:'ประวัติผลตรวจก่อนส่งงาน'}).click();await historical.getByRole('button',{name:'เปิดผลตรวจเดิม',exact:true}).click();await panel.getByText('ผลตรวจที่บันทึกไว้',{exact:false}).waitFor();
 assert.equal(await panel.locator('[data-release-report]').getAttribute('data-release-report'),ctx.rb.id);
 await ui.screenshot({path:out+'/compiled-saved-review.png',fullPage:true});
 await panel.getByLabel('ค้นหารายการก่อน Issued').fill('QA-NONMATCH-SEARCH');
 await ui.locator('.revision-item').filter({has:ui.locator('strong',{hasText:ctx.ra.number})}).click();
 assert.equal(await panel.locator('[data-release-report]').count(),0);assert.equal(await panel.getByLabel('บันทึกออก Issued').inputValue(),'');assert.equal(await panel.getByRole('button',{name:'ตรวจความพร้อม Revision ที่เลือก',exact:true}).isEnabled(),true);
 await panel.getByRole('button',{name:'ตรวจความพร้อม Revision ที่เลือก',exact:true}).click();await panel.locator(`[data-release-report="${ctx.ra.id}"]`).waitFor();assert.equal(await panel.getByLabel('ค้นหารายการก่อน Issued').inputValue(),'');
 await ui.setViewportSize({width:390,height:844});assert.equal(await ui.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await ui.screenshot({path:out+'/compiled-reset-mobile.png',fullPage:true});
 const reread=await sdk.evaluate(async record=>(await import('/src/data/releaseReview.ts')).readSavedReleaseReport(record),saved.record);assert.deepEqual(reread,saved.report);
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/compiled-results.json',JSON.stringify({status:'PASS',actualSavedBlockedPreflight:true,savedChecksumVerified:true,actualCurrentJsonDownload:true,compiledHistoricalRead:true,revisionSwitchClearsReportAndSearch:true,inspectionEnabledAfterSwitch:true,mobileNoHorizontalOverflow:true,engineeringApproval:false,issuedNotClaimed:true,productionRequests:false,cloud,errors},null,2));
 console.log('PASS compiled current JSON/real saved blocked preflight/history/reset/mobile; no Issued or approval');
} finally {await browser.close();}
