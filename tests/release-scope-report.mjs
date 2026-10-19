import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {chromium} from './auth-persistence-qa.mjs';
const out='output/release-scope-verification',browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),external=[];
 await page.route(/^https?:/,r=>{external.push(r.request().url());return r.abort();});
 await page.goto(pathToFileURL(path.resolve(out,'DEVELOPMENT_REPORT.html')).href);
 const images=await page.locator('img').evaluateAll(items=>items.map(i=>({complete:i.complete,width:i.naturalWidth})));
 assert.equal(images.length,2);assert.ok(images.every(i=>i.complete&&i.width>0));
 for(const href of await page.locator('a').evaluateAll(items=>items.map(i=>i.getAttribute('href'))))await fs.access(path.resolve(out,href));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:out+'/report-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:out+'/report-mobile.png',fullPage:true});assert.deepEqual(external,[]);
 await fs.writeFile(out+'/report-results.json',JSON.stringify({status:'PASS',allImagesLoaded:true,allLocalLinksExist:true,desktop:true,mobileNoHorizontalOverflow:true,externalRequests:false},null,2));
 console.log('PASS report desktop/mobile/images/links; no external requests');
} finally {await browser.close();}
