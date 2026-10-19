import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out='output/source-region-verification',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('file:///'+path.resolve(out+'/DEVELOPMENT_REPORT.html').replaceAll('\\','/'));
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));assert.equal(await page.locator('img').count(),12);
 assert.match(await page.locator('h1').innerText(),/ผ่านเฉพาะชุดทดสอบ/);
 const targets=await page.locator('a').evaluateAll(links=>links.map(a=>a.href).filter(h=>h.startsWith('file:')));for(const url of targets)assert.ok((await fs.stat(new URL(url))).isFile(),url);
 await page.screenshot({path:out+'/report-desktop.png',fullPage:false});await page.setViewportSize({width:390,height:844});
 const width=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(width.scroll<=width.viewport+2,JSON.stringify(width));await page.screenshot({path:out+'/report-mobile.png',fullPage:false});
 await page.getByText('สถานะข้อกำหนดเดิมทั้ง 12 ข้อ',{exact:true}).click();assert.equal(await page.locator('details tbody tr').count(),12);const table=await page.locator('details .scroll').evaluate(e=>({available:e.clientWidth,content:e.scrollWidth}));assert.ok(table.content>=1000&&table.content>table.available);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:out+'/report-mobile-requirements.png',fullPage:false});assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/report-ui-results.json',JSON.stringify({status:'PASS',images:12,requirements:12,localLinks:targets.length,width,requirementsScroll:table,errors,scope:'Offline report links/images/responsive390px only; not additionalapp acceptance paths.'},null,2));console.log('PASS report12images/12requirements/'+targets.length+'locallinks/390px');
}finally{await browser.close();}
