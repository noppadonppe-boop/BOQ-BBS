import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from './auth-persistence-qa.mjs';
const out='F:/Project Code/BOQ_BBS/output/quantity-print-verification';
const browser=await chromium.launch({headless:true}),p=await browser.newPage({viewport:{width:1440,height:1000}}),results=[],errors=[];
p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('file:///'+out+'/DEVELOPMENT_REPORT.html');
 await p.getByRole('heading',{level:1}).filter({hasText:'v0.52'}).waitFor();
 assert.equal(await p.locator('#requirements tbody tr').count(),12);
 const images=p.locator('img');assert.equal(await images.count(),16);
 for(const img of await images.all()){await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.decode());assert.ok(await img.evaluate(e=>e.naturalWidth>0&&e.naturalHeight>0));}
 for(const href of await p.locator('a[href]').evaluateAll(a=>a.map(e=>e.href))){assert.equal(new URL(href).protocol,'file:');await fs.access(fileURLToPath(href));}
 await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:path.join(out,'report-desktop.png')});
 results.push({name:'Report16 images, every local link, all12 original requirements and actual evidence load',status:'PASS'});
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>window.scrollTo(0,0));
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert.equal(await p.locator('#requirements tbody tr').count(),12);
 await p.screenshot({path:path.join(out,'report-mobile.png')});
 results.push({name:'Report390px retains all12 requirements with scrollable tables and no document overflow',status:'PASS'});
 assert.deepEqual(errors,[]);console.log('PASS report desktop/mobile/16 images/12 requirements');
}catch(e){results.push({name:'Report validation',status:'FAIL',message:e.message});throw e;}finally{await fs.writeFile(path.join(out,'report-ui-results.json'),JSON.stringify({results,errors},null,2));await browser.close();}
