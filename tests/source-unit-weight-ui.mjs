import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {chromium} from './auth-persistence-qa.mjs';
const out='output/source-unit-weight-verification',b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:1440,height:1000}}),requests=[],errors=[],results=[];
await fs.mkdir(out,{recursive:true});await p.route('**/*',r=>{const u=new URL(r.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)){requests.push(u.hostname);return r.abort();}return r.continue();});p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('http://127.0.0.1:5271/tests/source-unit-weight-harness.html');await p.getByRole('heading',{name:'น้ำหนักต่อเส้นและตัวเลขที่พิมพ์ในแบบ',exact:true}).waitFor();
 const rows=p.locator('.source-unit-weight-review tbody tr');assert.equal(await rows.count(),2);assert.equal(await rows.first().locator('td').nth(1).innerText(),'0');assert.equal(await rows.nth(1).locator('td').nth(1).innerText(),'ไม่ได้กรอก');assert.match(await p.locator('.source-unit-weight-review').innerText(),/ยังไม่พร้อม/);
 await p.screenshot({path:out+'/unit-weight-desktop.png',fullPage:true});results.push({name:'Standalone React review preserves zero versus blank and shows unresolved BBS mass',status:'PASS'});
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.locator('.source-unit-weight-review').screenshot({path:out+'/unit-weight-mobile.png'});results.push({name:'Mobile page stays within viewport with scrollable review table',status:'PASS'});
 assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
}catch(e){results.push({name:'UI verification',status:'FAIL',message:e.message});throw e;}finally{await fs.writeFile(out+'/ui-results.json',JSON.stringify({results,externalRequests:requests,errors,basis:'React fixture only; no Firebase writes or fresh app export'},null,2));await b.close();}
