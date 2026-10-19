import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium, guard, login} from './auth-persistence-qa.mjs';
const out='output/profile-uri-verification',ctx=JSON.parse(await fs.readFile('tmp/profile-uri-context.json','utf8')),user=ctx.users[0];
const b=await chromium.launch({headless:true}),context=await b.newContext({viewport:{width:1440,height:1000}}),ui=await context.newPage(),sdk=await context.newPage(),cloud=[],errors=[];
try{
 for(const p of [ui,sdk])await guard(p,cloud,errors);
 await sdk.goto('http://127.0.0.1:5306/tests/context-harness.html');await sdk.evaluate(async u=>(await import('/src/auth/authService.ts')).loginWithEmail(u.email,u.password),user);
 const read=()=>sdk.evaluate(async u=>({project:await(await import('/src/data/projectReadback.ts')).readProjectRecord(u.pid),member:await(await import('/src/data/projectReadback.ts')).readProjectRecord(u.pid,'members',u.memberId)}),user);
 const before=await read();
 await ui.goto('http://127.0.0.1:5307');await login(ui,user);await ui.locator(`[data-project-id="${user.pid}"]`).waitFor();assert.equal(await ui.locator('[data-project-id]').count(),1);await ui.locator(`[data-project-id="${user.pid}"]`).click();
 await ui.locator('nav').getByRole('button',{name:'ทะเบียนสมาชิก',exact:true}).click();await ui.locator('.member-register').waitFor();
 await ui.getByRole('button',{name:'ย้ายชื่อ Zone / ชั้นทั้งโครงการ',exact:true}).click();const d=ui.locator('.area-change-editor');
 await d.getByLabel('ชื่อพื้นที่เดิม').selectOption(JSON.stringify('Zone?2'));await d.getByLabel('ชื่อพื้นที่ใหม่').fill('Compiled#Zone');await d.getByLabel('เหตุผลย้ายพื้นที่').fill('Compiled URI account QA');await d.getByRole('button',{name:'ย้ายชื่อและปรับสมาชิกทั้งชุด',exact:true}).click();
 await d.waitFor({state:'detached'});await ui.getByLabel('Zone ใน ทะเบียน',{exact:true}).getByRole('option',{name:'Compiled#Zone',exact:true}).waitFor({state:'attached'});
 const after=await read();assert.equal(after.member.occurrences[0].zone,'Compiled#Zone');assert.equal(after.member.occurrences[0].quantity,3);assert.equal(after.member.occurrences[0].floor,'F#2');assert.deepEqual(after.project.spec,before.project.spec);assert.equal(after.project.spec.approved,false);
 await ui.screenshot({path:out+'/compiled-register.png'});await ui.setViewportSize({width:390,height:844});assert.equal(await ui.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await ui.screenshot({path:out+'/compiled-mobile.png',fullPage:true});
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);await fs.writeFile(out+'/compiled-results.json',JSON.stringify({status:'PASS',reservedCharacterAccountLogin:true,oneAssignedProject:true,compiledUiAreaChangeCommitted:true,memberQuantityAndFloorUnchanged:true,specAndApprovalUnchanged:true,mobileNoPageOverflow:true,productionRequests:false,rulesChanged:false},null,2));console.log('PASS compiled # account login/area batch/one project/mobile');
}finally{await context.close();await b.close();}
