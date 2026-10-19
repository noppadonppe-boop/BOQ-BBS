import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const out='output/six-category-current-verification',ctx=JSON.parse(await fs.readFile('tmp/six-category-current-context.json','utf8')),browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),context=await browser.newContext({viewport:{width:1440,height:1000}}),sdk=await context.newPage(),ui=await context.newPage(),cloud=[],errors=[],results=[];
const labels={Foundation:'ฐานราก',Beam:'คาน',Column:'เสา',Slab:'พื้น',Wall:'ผนัง',Custom:'องค์ประกอบอื่น'},hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=id=>sdk.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts');return(await import('/src/domain/storageCodec.ts')).decodeStorage((await h.getDocFromServer(h.doc(f.db,`projects/${q.pid}/members/${q.id}`))).data());},{pid:ctx.pid,id});
const frames=()=>ui.evaluate(()=>new Promise(resolve=>{let n=0;const step=()=>++n>=12?resolve():requestAnimationFrame(step);requestAnimationFrame(step);}));
async function save(){await ui.locator('.member-title').getByRole('button',{name:'บันทึก',exact:true}).click();await ui.waitForFunction(()=>document.querySelector('.app-shell')?.getAttribute('aria-busy')==='false'&&document.querySelector('.member-title button.primary')?.disabled);}
async function countInput(value){await ui.locator('.member-title').getByRole('button',{name:'แก้มิติ / ตำแหน่ง',exact:true}).click();await ui.locator('.modal .occurrence').first().getByLabel('quantity',{exact:true}).fill(String(value));await ui.locator('.modal').getByRole('button',{name:'ปิด',exact:true}).click();await save();}
try {
 for(const p of [sdk,ui])await guard(p,cloud,errors);await sdk.goto('http://127.0.0.1:5291');await login(sdk,admin);
 await ui.goto('http://127.0.0.1:5291');await ui.locator('.top-profile').waitFor();await ui.getByPlaceholder('ค้นหาโครงการ',{exact:true}).fill(ctx.code);await ui.locator(`[data-project-id="${ctx.pid}"]`).click();
 for(const original of ctx.members){
  await ui.locator('nav').getByRole('button',{name:new RegExp('^'+labels[original.category])}).click();await ui.locator('.member-title h2').filter({hasText:original.code}).waitFor();
  const before=await read(original.id);assert.equal(before.occurrences[0].quantity,2);assert.equal(before.quantityBasis.state,'Entered');
  await countInput(3);const changed=await read(original.id);assert.equal(changed.occurrences[0].quantity,3);assert.equal(changed.occurrences[1].quantity,before.occurrences[1].quantity);assert.equal(changed.quantityBasis.state,'Provisional');assert.deepEqual(changed.bars,before.bars);
  assert.equal(await ui.locator('.kpis').first().locator('strong').filter({hasText:'รอยืนยัน'}).count(),4);
  await countInput(2);
  await ui.getByRole('button',{name:'BOQ / วิธีคำนวณ',exact:true}).click();const basis=ui.locator('[data-quantity-basis]');if(await basis.getAttribute('open')===null)await basis.locator('summary').click();await ui.getByLabel('ที่มาข้อมูลปริมาณ BOQ',{exact:true}).fill('UI reviewed current synthetic dimensions/count; not engineering approval');await ui.getByLabel('ยืนยันตรวจ input ปริมาณ BOQ ฉบับปัจจุบัน',{exact:true}).check();await ui.getByRole('button',{name:'ยืนยันข้อมูลปริมาณ',exact:true}).click();await save();
  const reviewed=await read(original.id);assert.equal(reviewed.quantityBasis.state,'Entered');assert.deepEqual(reviewed.occurrences,original.occurrences);assert.deepEqual(reviewed.bars,original.bars);
  await ui.getByRole('button',{name:'แบบ & BBS',exact:true}).click();await ui.getByRole('button',{name:'3D',exact:true}).click();const canvas=ui.locator('.model-canvas canvas');await canvas.waitFor();await frames();const iso=hash(await canvas.screenshot());await ui.locator('.view-tools').getByRole('button',{name:'Z',exact:true}).click();await frames();const z=hash(await canvas.screenshot());assert.notEqual(z,iso,original.category+' Z view');
  for(const axis of ['X','Y','ISO']){await ui.locator('.view-tools').getByRole('button',{name:axis,exact:true}).click();await frames();}
  const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;await ui.mouse.move(cx,cy);const initial=hash(await canvas.screenshot());await ui.mouse.wheel(0,-250);await frames();assert.notEqual(hash(await canvas.screenshot()),initial,original.category+' zoom');await ui.mouse.down();await ui.mouse.move(cx+50,cy+30,{steps:8});await ui.mouse.up();await frames();
  await canvas.screenshot({path:out+`/${original.category}-3d.png`});
  results.push({category:original.category,actualUiQuantityEditAndSave:true,quantityChangeResetsReview:true,otherOccurrenceAndBarsUnchanged:true,actualInputReview:true,webglCanvas:true,axisViewChanged:true,zoomChanged:true,orbitMouseDragExecuted:true});await fs.writeFile(out+'/ui-checkpoint.json',JSON.stringify(results,null,2));console.log('PASS',original.category,'UI count/edit/review/3D axes/zoom/drag');
 }
 await ui.locator('nav').getByRole('button',{name:'BOQ Summary',exact:true}).click();const report=ui.locator('.quantity-report');await report.waitFor();await report.screenshot({path:out+'/full-project-boq.png'});
 await ui.getByLabel('Zone',{exact:true}).selectOption(JSON.stringify('North'));await ui.getByLabel('ชั้น',{exact:true}).selectOption(JSON.stringify('F1'));await report.screenshot({path:out+'/north-f1-boq.png'});
 await ui.setViewportSize({width:390,height:844});assert.equal(await ui.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await ui.screenshot({path:out+'/scope-mobile.png',fullPage:true});
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);await fs.writeFile(out+'/ui-results.json',JSON.stringify({status:'PASS',sixCategories:results,desktop:true,mobileNoHorizontalOverflow:true,engineeringApproval:false,productionRequests:false,cloud,errors},null,2));
} finally {await browser.close();}
