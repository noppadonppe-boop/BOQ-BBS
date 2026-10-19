import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out='output/component-pricing-verification',browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('file:///'+path.resolve(out+'/DEVELOPMENT_REPORT.html').replaceAll('\\','/'));
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
 assert.equal(await page.locator('img').count(),12);
 assert.match(await page.locator('h1').innerText(),/ผ่านเฉพาะชุดทดสอบ/);
 const localTargets=await page.locator('a').evaluateAll(links=>links.map(a=>a.href).filter(h=>h.startsWith('file:')));
 for(const target of localTargets)assert.ok((await fs.stat(new URL(target))).isFile(),target);
 await page.screenshot({path:out+'/report-desktop.png',fullPage:false});
 await page.setViewportSize({width:390,height:844});
 const width=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(width.scroll<=width.viewport+2,JSON.stringify(width));
 await page.screenshot({path:out+'/report-mobile.png',fullPage:false});
 await page.getByText('สถานะข้อกำหนดเดิมทั้ง 12 ข้อ',{exact:true}).click();
 assert.equal(await page.locator('details tbody tr').count(),12);
 const requirementsScroll=await page.locator('details .scroll').evaluate(e=>({available:e.clientWidth,content:e.scrollWidth}));
 assert.ok(requirementsScroll.content>=980&&requirementsScroll.content>requirementsScroll.available);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 await page.screenshot({path:out+'/report-mobile-requirements.png',fullPage:false});
 assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/report-ui-results.json',JSON.stringify({status:'PASS',images:12,requirements:12,localLinks:localTargets.length,width,requirementsScroll,errors,scope:'Offline HTML images,local links and responsive report layout only; not additional app acceptance paths.'},null,2));
 console.log('PASS all12 real images and12 requirement rows load; local links exist; report fits390px');
}finally{await browser.close();}
