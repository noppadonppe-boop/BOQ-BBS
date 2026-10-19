import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from './auth-persistence-qa.mjs';
const out='output/tapered-prism-verification',browser=await chromium.launch({headless:true}),p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('file:///'+path.resolve(out,'DEVELOPMENT_REPORT.html').replaceAll('\\','/'));assert.equal(await p.locator('#requirements tbody tr').count(),12);
 await p.locator('details').evaluateAll(a=>a.forEach(d=>{d.open=true;}));const images=await p.locator('img').count();for(let i=0;i<images;i++){const img=p.locator('img').nth(i);await img.scrollIntoViewIfNeeded();await img.evaluate(async e=>{if(!e.complete)await new Promise((resolve,reject)=>{e.onload=resolve;e.onerror=reject;});});assert.ok(await img.evaluate(e=>e.naturalWidth>0&&e.naturalHeight>0));}
 const links=await p.locator('a').evaluateAll(a=>a.map(e=>e.getAttribute('href')));for(const href of links){if(!href.startsWith('http'))await fs.access(path.resolve(out,href));}
 await p.evaluate(()=>window.scrollTo(0,0));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await p.screenshot({path:out+'/report-desktop.png'});
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await p.screenshot({path:out+'/report-mobile.png'});assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/report-view-results.json',JSON.stringify({status:'PASS',images,links:links.length,requirements:12,desktopNoOverflow:true,mobileNoOverflow:true,errors},null,2));console.log(`PASS report: ${images} images/${links.length} links/12 requirements, desktop and mobile without page overflow`);
}finally{await browser.close();}
