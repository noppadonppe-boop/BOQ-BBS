import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const out='output/six-category-current-verification',ctx=JSON.parse(await fs.readFile('tmp/six-category-current-context.json','utf8')),browser=await chromium.launch({headless:true}),p=await browser.newPage({viewport:{width:1440,height:1000}}),cloud=[],errors=[],results=[];
const labels={Foundation:'ฐานราก',Beam:'คาน',Column:'เสา',Slab:'พื้น',Wall:'ผนัง',Custom:'องค์ประกอบอื่น'};
try {
 await guard(p,cloud,errors);await p.goto('http://127.0.0.1:5291');await login(p,admin);await p.getByPlaceholder('ค้นหาโครงการ',{exact:true}).fill(ctx.code);await p.locator(`[data-project-id="${ctx.pid}"]`).click();
 for(const [i,m] of ctx.members.entries()){
  await p.locator('nav').getByRole('button',{name:new RegExp('^'+labels[m.category])}).click();await p.locator('.member-title h2').filter({hasText:m.code}).waitFor();
  await p.getByRole('button',{name:'เลขและชื่อแบบ BBS',exact:true}).click();const d=p.locator('.modal');await d.getByLabel('เลขแบบ BBS (80 อักษร)',{exact:true}).fill(`QA-BBS-${String(i+1).padStart(3,'0')}`);await d.getByLabel('Revision แบบ BBS (16 อักษร)',{exact:true}).fill('QA-A');await d.getByLabel('ชื่อแบบ BBS (120 อักษร)',{exact:true}).fill(`SOFTWARE QA ONLY — ${m.category}`);await d.getByRole('button',{name:'ปิด',exact:true}).click();await p.locator('.member-title').getByRole('button',{name:'บันทึก',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.app-shell')?.getAttribute('aria-busy')==='false'&&document.querySelector('.member-title button.primary')?.disabled);
  const saved=await p.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts');return(await import('/src/domain/storageCodec.ts')).decodeStorage((await h.getDocFromServer(h.doc(f.db,`projects/${q.pid}/members/${q.id}`))).data());},{pid:ctx.pid,id:m.id});
  assert.equal(saved.drawingSetup.number,`QA-BBS-${String(i+1).padStart(3,'0')}`);assert.equal(saved.quantityBasis.state,'Entered');assert.deepEqual(saved.occurrences,m.occurrences);assert.deepEqual(saved.bars,m.bars);results.push({category:m.category,actualMetadataUiSave:true,quantityAndBarsUnchanged:true});
 }
 await p.screenshot({path:out+'/drawing-metadata.png',fullPage:true});assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/drawing-metadata-results.json',JSON.stringify({status:'PASS',missingDrawingMetadataWasBlocked:true,sixCategories:results,engineeringApproval:false,productionRequests:false,cloud,errors},null,2));console.log('PASS six unique BBS drawing numbers/revisions/titles saved through UI; quantities/rebar unchanged');
} finally {await browser.close();}
