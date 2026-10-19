import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {chromium} from './auth-persistence-qa.mjs';
const out='output/cut-quantity-readiness-verification';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const external=[];
  await page.route(/^https?:/,route=>{external.push(route.request().url());return route.abort();});
  await page.goto(pathToFileURL(path.resolve(out,'DEVELOPMENT_REPORT.html')).href);
  assert.equal(await page.locator('h1').count(),1);
  const images=await page.locator('img').evaluateAll(items=>items.map(item=>({complete:item.complete,width:item.naturalWidth})));
  assert.equal(images.length,3);
  assert.ok(images.every(item=>item.complete&&item.width>0));
  for(const href of await page.locator('a').evaluateAll(items=>items.map(item=>item.getAttribute('href')))) {
    assert.ok(href&&!/^(?:https?:|file:)/.test(href));
    await fs.access(path.resolve(out,href));
  }
  await page.screenshot({path:out+'/report-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:out+'/report-mobile.png',fullPage:true});
  assert.deepEqual(external,[]);
  await fs.writeFile(out+'/report-results.json',JSON.stringify({status:'PASS',allLinksExist:true,allImagesLoaded:true,mobileNoHorizontalOverflow:true,externalRequests:false},null,2));
  console.log('PASS report links/images/desktop/mobile; no external requests');
} finally {await browser.close();}
