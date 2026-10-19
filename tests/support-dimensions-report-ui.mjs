import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium} from './auth-persistence-qa.mjs';
const out=path.resolve('output/support-dimensions-verification'),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(pathToFileURL(out+'/DEVELOPMENT_REPORT.html').href);await page.evaluate(()=>{document.querySelectorAll('details').forEach(d=>d.open=true);document.querySelectorAll('img').forEach(i=>i.loading='eager');});await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
 const links=await page.locator('a[href]').evaluateAll(a=>a.map(a=>a.href));for(const link of links){assert.ok(link.startsWith('file:'));await fs.access(fileURLToPath(link));}
 const images=await page.locator('img').count();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:out+'/report-desktop.png'});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/report-mobile.png'});assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/report-ui-results.json',JSON.stringify({status:'PASS',images,localLinks:links.length,desktop:true,mobile:true,bodyOverflow:false,errors},null,2));console.log('PASS report desktop/mobile, all images and local links');
}finally{await browser.close();}
