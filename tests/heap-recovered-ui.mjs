import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const out='output/full-data-recovery-verification',ctx=JSON.parse(await fs.readFile('output/area-change-verification/context.json','utf8')),b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:1440,height:1000}}),cloud=[],errors=[];
try{
 await guard(p,cloud,errors);await p.goto('http://127.0.0.1:5236');await login(p,admin);await p.getByPlaceholder('ค้นหาโครงการ',{exact:true}).fill(ctx.code);await p.locator(`[data-project-id="${ctx.pid}"]`).click();
 await p.locator('nav').getByRole('button',{name:'โครงการ & สำรองข้อมูล',exact:true}).click();await p.getByLabel('เลือก Backup เพื่อตรวจ',{exact:true}).setInputFiles(out+'/Recovered-project-QA-backup.zip');
 const preview=p.locator('.backup-preview');await preview.getByRole('heading',{name:'ตรวจ Backup ผ่าน · ยังไม่เริ่มกู้คืน',exact:true}).waitFor();assert.match(await preview.innerText(),/Version 66/);
 const counts=await preview.locator('.backup-counts').innerText();assert.match(counts,/57\s*สมาชิก/);assert.match(counts,/286\s*จำนวนองค์ประกอบ/);assert.match(counts,/11\s*ไฟล์ประวัติ/);
 await p.getByText('กำลังเปิดกรอบชื่อแบบ…',{exact:true}).waitFor({state:'detached'});await p.getByText('กำลังเปิดทีมโครงการ…',{exact:true}).waitFor({state:'detached'});
 await preview.getByRole('alert').waitFor();assert.match(await preview.getByRole('alert').innerText(),/Restore ลงโครงการว่างเท่านั้น/);assert.equal(await preview.getByRole('button',{name:'เริ่มกู้คืนลงโครงการนี้',exact:true}).isDisabled(),true);
 await preview.scrollIntoViewIfNeeded();await p.screenshot({path:out+'/backup-preview-desktop.png'});await p.setViewportSize({width:390,height:844});await preview.locator('.backup-counts').scrollIntoViewIfNeeded();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:out+'/backup-preview-mobile.png'});
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);await fs.writeFile(out+'/recovered-ui-results.json',JSON.stringify({status:'PASS',actualBackupPreview:{version:66,members:57,instances:286,historyFiles:11},sourceNotOverwritten:true,productionRequests:false,errors,cloud},null,2));console.log('PASS actual recovered Backup preview desktop/mobile');
}finally{await b.close();}
