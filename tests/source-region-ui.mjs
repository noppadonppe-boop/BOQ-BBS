import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,viewer,guard,login,logout} from './auth-persistence-qa.mjs';

const out='output/source-region-verification',ctx=JSON.parse(await fs.readFile(out+'/context.json','utf8')),url=process.env.QA_REGION_URL||'http://127.0.0.1:5196';
if(!/^http:\/\/127\.0\.0\.1:(5196|5202)$/.test(url))throw Error('Isolated app required');
const prefix=url.endsWith(':5202')?'built':'dev',browser=await chromium.launch({headless:true});
const shared=await browser.newContext({viewport:{width:1440,height:1000}}),page=await shared.newPage(),sdk=await browser.newPage(),v=await browser.newPage(),results=[],cloud=[],errors=[];
for(const p of [page,sdk,v])await guard(p,cloud,errors);
const read=path=>sdk.evaluate(async path=>{const f=await import('/src/data/firebase.ts'),s=await import('/tests/direct-browser-harness.ts');return(await import('/src/domain/storageCodec.ts')).decodeStorage((await s.getDocFromServer(s.doc(f.db,path))).data());},path);
const openProject=async p=>{await p.locator('.project-switch').click();await p.locator('[data-project-id="'+ctx.pid+'"]').click();await p.waitForFunction(()=>!document.querySelector('.page-content')?.inert);};
const member=async(p,code,column=false)=>{await p.locator('nav').getByRole('button',{name:column?/^เสา/:/^องค์ประกอบอื่น/}).click();await p.locator('.member-list').getByRole('button',{name:new RegExp('^'+code)}).click();await p.getByRole('button',{name:'ตรวจเทียบ BBS จากแบบ',exact:true}).click();};
const review=p=>p.getByRole('region',{name:'รูปดัดต้นทางเทียบกับ BBS',exact:true});
const picker=()=>page.getByRole('dialog',{name:/^รูปดัดต้นทาง · Mark/});
const open=async()=>{await review(page).getByRole('button',{name:/^(เลือกรูปดัดต้นทาง|เลือกกรอบรูปดัดใหม่)$/,exact:true}).click();await picker().locator('[data-source-region-page]:not([data-source-region-page="0"])').waitFor();};
const setRect=async values=>{for(const [i,label] of ['ซ้าย (%)','บน (%)','กว้าง (%)','สูง (%)'].entries())await picker().getByLabel(label,{exact:true}).fill(String(values[i]));};
const apply=async()=>{await picker().getByRole('button',{name:'ใช้รูปต้นทางนี้',exact:true}).click();await picker().waitFor({state:'hidden'});await review(page).getByAltText('รูปดัดจากกรอบที่เลือกในต้นฉบับ').waitFor();};
const save=async()=>{await page.getByRole('button',{name:'บันทึก',exact:true}).click();await page.getByText('มีการแก้ไขยังไม่บันทึก',{exact:true}).waitFor({state:'hidden'});};
let current='setup';const check=async(name,fn)=>{current=name;await fn();results.push({name,status:'PASS'});console.log('PASS',name);};
try{
 await sdk.goto(ctx.sdkUrl+'/tests/context-harness.html');await sdk.evaluate(async u=>(await import('/src/auth/authService.ts')).loginWithEmail(u.email,u.password),admin);
 await page.goto(url);await login(page,admin);await openProject(page);await member(page,'GULF-2C1-100',true);
 await check('Actual original GULF sketch renders beside explicitly unconstructed app geometry,with all three Mark choices',async()=>{
  await review(page).getByLabel('Mark สำหรับดูรูป').selectOption('gulf-309');const image=review(page).getByAltText('รูปดัดจากกรอบที่เลือกในต้นฉบับ');await image.waitFor();await page.waitForFunction(()=>{const i=document.querySelector('.source-region-image');return i?.complete&&i.naturalWidth>0;});assert.match(await review(page).innerText(),/ยังไม่จับคู่/);assert.equal(await review(page).getByLabel('Mark สำหรับดูรูป').locator('option').count(),3);await review(page).scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+prefix+'-gulf-source-pair.png',fullPage:false});
 });
 await check('Invalid/empty/outside source-region coordinates prevent applying; original record remains unchanged',async()=>{
  const before=await read('projects/'+ctx.pid+'/members/'+ctx.gulfMid);await open();await setRect([98,10,5,10]);assert.equal(await picker().getByRole('button',{name:'ใช้รูปต้นทางนี้',exact:true}).isDisabled(),true);await picker().getByLabel('กว้าง (%)',{exact:true}).fill('');assert.equal(await picker().getByRole('button',{name:'ใช้รูปต้นทางนี้',exact:true}).isDisabled(),true);await picker().getByRole('button',{name:'ยกเลิก',exact:true}).click();assert.deepEqual(await read('projects/'+ctx.pid+'/members/'+ctx.gulfMid),before);
 });
 await check('Two real pointer corners select the visible rotated PDF region,without interpreting or multiplying steel',async()=>{
  await open();const canvas=picker().locator('canvas'),r=await canvas.boundingBox();assert.ok(r);await page.mouse.click(r.x+r.width*.935,r.y+r.height*.116);await page.mouse.click(r.x+r.width*.997,r.y+r.height*.151);assert.ok(Math.abs(Number(await picker().getByLabel('ซ้าย (%)').inputValue())-93.5)<.2);await page.screenshot({path:out+'/'+prefix+'-gulf-region-picker.png',fullPage:false});await apply();assert.match(await page.locator('.member-title').innerText(),/มีการแก้ไขยังไม่บันทึก/);await save();const m=await read('projects/'+ctx.pid+'/members/'+ctx.gulfMid);assert.equal(m.sourceSchedule.version,2);assert.equal(m.bars.length,0);const ref=m.sourceSchedule.rows.find(r=>r.id==='gulf-309').shapeReference;assert.equal(ref.sha256,ctx.gulfAttachment.sha256);assert.equal(ref.page,1);
 });
 await check('Saved source rectangle reloads; selecting another Mark shows its own image and stays Unmapped',async()=>{
  await page.reload();await openProject(page);await member(page,'GULF-2C1-100',true);await review(page).getByLabel('Mark สำหรับดูรูป').selectOption('gulf-309');await review(page).getByAltText('รูปดัดจากกรอบที่เลือกในต้นฉบับ').waitFor();await review(page).getByLabel('Mark สำหรับดูรูป').selectOption('gulf-4');await review(page).getByAltText('รูปดัดจากกรอบที่เลือกในต้นฉบับ').waitFor();assert.match(await review(page).innerText(),/ยังไม่จับคู่/);
 });
 await check('Source picker fits390px and zoom changes display only; explicit numeric selection survives zoom',async()=>{
  await page.setViewportSize({width:390,height:844});await open();await setRect([93.5,7.3,6,4.6]);await picker().getByLabel('ซูมหน้าแบบ').selectOption('2');assert.equal(await picker().getByLabel('ซ้าย (%)').inputValue(),'93.5');const width=await picker().evaluate(e=>({available:e.clientWidth,scroll:e.scrollWidth}));assert.ok(width.scroll<=width.available+2,JSON.stringify(width));await picker().getByRole('button',{name:'ใช้รูปต้นทางนี้',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+prefix+'-region-mobile.png',fullPage:false});await picker().getByRole('button',{name:'ยกเลิก',exact:true}).click();await page.setViewportSize({width:1440,height:1000});
 });
 await check('Changing source page clears the old rectangle; another rotated/CropBox page can be explicitly selected and saved',async()=>{
  await member(page,'SYN-ROTATIONS');await review(page).getByLabel('Mark สำหรับดูรูป').selectOption('rotation-1');await open();const target=(await picker().getByLabel('หน้ารูปดัด',{exact:true}).inputValue())==='2'?3:2;await picker().getByLabel('หน้ารูปดัด',{exact:true}).fill(String(target));await picker().locator('[data-source-region-page="'+target+'"]').waitFor();assert.equal(await picker().getByLabel('ซ้าย (%)').inputValue(),'');assert.equal(await picker().getByRole('button',{name:'ใช้รูปต้นทางนี้',exact:true}).isDisabled(),true);await setRect([0,0,25,25]);await apply();await save();const m=await read('projects/'+ctx.pid+'/members/'+ctx.rotationMid);assert.equal(m.sourceSchedule.page,1);assert.equal(m.sourceSchedule.rows[0].shapeReference.page,target);await review(page).scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+prefix+'-rotated-source-pair.png',fullPage:false});
 });
 await check('Mapped bar displays the real app geometry beside source evidence; remove/cancel/edit do not delete the bar',async()=>{
  const before=await read('projects/'+ctx.pid+'/members/'+ctx.rotationMid);assert.equal(await review(page).getByRole('img',{name:'รูปดัดแนวศูนย์กลางในระนาบ'}).count(),1);await review(page).getByRole('button',{name:'ลบรูปอ้างอิงของ Mark นี้',exact:true}).click();assert.match(await review(page).innerText(),/ยังไม่เลือกรูปต้นทาง/);await page.getByRole('button',{name:'ย้อนการแก้ไข',exact:true}).click();await review(page).getByAltText('รูปดัดจากกรอบที่เลือกในต้นฉบับ').waitFor();assert.deepEqual(await read('projects/'+ctx.pid+'/members/'+ctx.rotationMid),before);await page.getByRole('button',{name:'บันทึก',exact:true}).waitFor({state:'visible'});
 });
 await check('Viewer reads original source pictures and app BBS,with capture/remove controls disabled',async()=>{
  await v.goto(url);await login(v,viewer);await openProject(v);await member(v,'GULF-2C1-100',true);await review(v).getByLabel('Mark สำหรับดูรูป').selectOption('gulf-309');await review(v).getByAltText('รูปดัดจากกรอบที่เลือกในต้นฉบับ').waitFor();assert.equal(await review(v).getByRole('button',{name:'เลือกกรอบรูปดัดใหม่',exact:true}).isDisabled(),true);assert.equal(await review(v).getByRole('button',{name:'ลบรูปอ้างอิงของ Mark นี้',exact:true}).isDisabled(),true);await review(v).scrollIntoViewIfNeeded();await v.screenshot({path:out+'/'+prefix+'-source-viewer.png',fullPage:false});
 });
 await check('Public UI account switch closes the old actor source picker and clears old editor state',async()=>{
  await open();const switcher=await page.context().newPage();await guard(switcher,cloud,errors);await switcher.goto(url);await switcher.locator('.top-profile').waitFor();await logout(switcher);await login(switcher,viewer);await page.locator('.top-profile').waitFor();assert.equal(await page.getByRole('dialog',{name:/^รูปดัดต้นทาง/}).count(),0);assert.equal(await page.locator('.source-region-image').count(),0);await page.screenshot({path:out+'/'+prefix+'-switched-account.png',fullPage:false});await switcher.close();
 });
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
}catch(e){results.push({name:current,status:'FAIL',message:e.message});await page.screenshot({path:out+'/'+prefix+'-failure.png',fullPage:true});throw e;}
finally{await fs.writeFile(out+'/'+prefix+'-results.json',JSON.stringify({results,cloud,errors,url,scope:'Actual public UI/source byte rendering/save/reload/read roles/account switch. GULF remains source-only; no engineering/shape approval.'},null,2));await browser.close();}
