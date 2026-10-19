import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,login,guard} from './auth-persistence-qa.mjs';
const out='output/support-dimensions-verification',ctx=JSON.parse(await fs.readFile(out+'/context.json','utf8'));
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage(),cloud=[],errors=[];await guard(p,cloud,errors);
try{
 await p.goto('http://127.0.0.1:5237');await login(p,admin);await p.getByPlaceholder('ค้นหาโครงการ',{exact:true}).fill(ctx.code);await p.locator(`[data-project-id="${ctx.pid}"]`).click();await p.locator('nav').getByRole('button',{name:/^เสา/}).click();await p.locator('.member-list').getByRole('button',{name:/^2C1-M4-DRAFT/}).click();await p.getByRole('button',{name:'แบบ & BBS',exact:true}).click();await p.locator('.bbs').getByRole('button',{name:'4',exact:true}).click();
 const svg=p.getByRole('dialog',{name:'ชุดเหล็ก · 4',exact:true}).getByRole('img',{name:'รูปหลายขา Code 99 มิติ L และเส้นสัมผัส',exact:true});await svg.screenshot({path:out+'/support-drawing-desktop.png'});
 await p.setViewportSize({width:390,height:844});await svg.screenshot({path:out+'/support-drawing-mobile.png'});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/visual-results.json',JSON.stringify({status:'PASS',desktop:true,mobile:true,bodyOverflow:false,cloud,errors},null,2));console.log('PASS actual compiled support SVG desktop/mobile and no body overflow');
}finally{await browser.close();}
