import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {chromium} from './auth-persistence-qa.mjs';
const out='output/component-quantity-verification',browser=await chromium.launch({headless:true});
try {
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),external=[];await p.route(/^https?:/,r=>{external.push(r.request().url());return r.abort();});await p.goto(pathToFileURL(path.resolve(out,'DEVELOPMENT_REPORT.html')).href);
 const images=await p.locator('img').evaluateAll(items=>items.map(i=>({complete:i.complete,width:i.naturalWidth})));assert.equal(images.length,3);assert.ok(images.every(i=>i.complete&&i.width>0));for(const href of await p.locator('a').evaluateAll(items=>items.map(i=>i.getAttribute('href'))))await fs.access(path.resolve(out,href));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:out+'/report-desktop.png',fullPage:true});await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:out+'/report-mobile.png',fullPage:true});await p.screenshot({path:out+'/report-mobile-first.png'});assert.deepEqual(external,[]);await fs.writeFile(out+'/report-results.json',JSON.stringify({status:'PASS',images3:true,allLocalLinksExist:true,desktop:true,mobileNoHorizontalOverflow:true,externalRequests:false},null,2));console.log('PASS component review report links/3images/desktop/mobile');
} finally {await browser.close();}
