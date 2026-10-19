import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const out='output/source-mark-navigation-verification',ctx=JSON.parse(await fs.readFile('tmp/source-mark-navigation-context.json','utf8'));
const bytes=await fs.readFile('Referrence/ตัวอย่าง BBS/'+ctx.attachment.name);
const b=await chromium.launch({headless:true}),c=await b.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),cloud=[],errors=[];
try{
 await guard(p,cloud,errors);
 // Read-only UI uses signed local metadata. Only the download response is simulated.
 await p.route('**/v0/b/**',async r=>{const u=new URL(r.request().url());if(u.port==='9531'&&u.searchParams.get('alt')==='media')await r.fulfill({status:200,body:bytes,contentType:'application/pdf',headers:{'access-control-allow-origin':'*'}});else await r.fallback();});
 await p.goto('http://127.0.0.1:5295');await login(p,admin);
 await p.getByPlaceholder('ค้นหาโครงการ',{exact:true}).fill(ctx.code);await p.locator(`[data-project-id="${ctx.pid}"]`).click();
 await p.locator('nav').getByRole('button',{name:'คาน',exact:false}).click();await p.getByRole('button',{name:'ตรวจเทียบ BBS จากแบบ',exact:true}).click();
 await p.locator('[data-source-mark-links] summary').click();assert.equal(await p.locator('.source-mark-targets button').count(),2);
 await p.getByRole('button',{name:`เปิดจุดชี้ QA01 ${ctx.attachment.name} หน้า 2 #2`,exact:true}).click();
 await p.locator('.pdf-surface[data-rendered-page="2"][data-source-bytes-verified="true"]').waitFor();await p.locator('[data-source-focused-point]').waitFor();
 const coordinate=Number(await p.locator('[data-source-focused-point]').getAttribute('cx'));assert.ok(coordinate>=500&&coordinate<=600);
 assert.equal(await p.locator('.member-title').getByRole('button',{name:'บันทึก',exact:true}).isEnabled(),false);
 await p.locator('.pdf-surface').screenshot({path:out+'/compiled-focused-page2.png'});
 await p.setViewportSize({width:390,height:844});await p.locator('[data-source-focused-point]').scrollIntoViewIfNeeded();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:out+'/compiled-focused-mobile.png'});
 await p.getByLabel('หน้า PDF',{exact:true}).fill('5');await p.getByText('หน้าแบบที่เลือกเกินไฟล์จริง',{exact:false}).waitFor();assert.equal(await p.locator('[data-source-focused-point]').count(),0);assert.equal(await p.locator('.pdf-surface canvas').isVisible(),false);
 await p.getByLabel('หน้า PDF',{exact:true}).fill('2');await p.locator('[data-source-focused-point]').waitFor();
 // Wrong bytes are rejected by the compiled code before a canvas or point is displayed.
 await p.route('**/v0/b/**',async r=>{const u=new URL(r.request().url());if(u.port==='9531'&&u.searchParams.get('alt')==='media')await r.fulfill({status:200,body:Buffer.from('wrong bytes'),contentType:'application/pdf',headers:{'access-control-allow-origin':'*'}});else await r.fallback();});
 await p.getByLabel('หน้า PDF',{exact:true}).fill('1');await p.getByText('SHA256ไฟล์จริงไม่ตรงฉบับที่บันทึก',{exact:false}).waitFor();assert.equal(await p.locator('[data-source-focused-point]').count(),0);assert.equal(await p.locator('.pdf-surface canvas').isVisible(),false);
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/compiled-results.json',JSON.stringify({status:'PASS',build:'0.95.0',actualSignedMetadata:true,fixtureDownloadResponse:true,actualStorageRereadVerified:false,readonly:true,targets:2,storedPointCX:coordinate,desktop:true,mobileNoHorizontalOverflow:true,outOfRangePageRejected:true,correctPageRecovered:true,wrongBytesRejected:true,cloud,errors,productionRequests:false},null,2));console.log('PASS compiled signed UI with explicit fixture download response: targets, page/focus, mobile, bounds and wrong hash');
}finally{await b.close();}
