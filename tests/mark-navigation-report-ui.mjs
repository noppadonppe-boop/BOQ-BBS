import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {chromium} from './auth-persistence-qa.mjs';
const out='output/mark-navigation-verification',url=pathToFileURL(resolve(out+'/DEVELOPMENT_REPORT.html')).href,browser=await chromium.launch({headless:true}),p=await browser.newPage(),results=[];
try{
 await p.goto(url);await p.locator('img').last().waitFor();const images=await p.locator('img').evaluateAll(nodes=>nodes.map(n=>({src:n.getAttribute('src'),loaded:n.complete&&n.naturalWidth>0})));assert.equal(images.length,13);assert.ok(images.every(n=>n.loaded));const links=await p.locator('a').evaluateAll(nodes=>nodes.map(n=>n.href));for(const link of links)await fs.access(fileURLToPath(link));assert.equal(await p.locator('section').last().locator('tbody tr').count(),12);
 for(const [width,height,name] of [[1440,1000,'desktop'],[390,844,'mobile']]){await p.setViewportSize({width,height});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:out+`/report-${name}.png`,fullPage:true});await p.screenshot({path:out+`/report-${name}-top.png`});results.push({name:`Report ${name}:13 rendered images, all links,12 original requirements and no page overflow`,status:'PASS'});}
}catch(e){results.push({name:'Report verification',status:'FAIL',message:e.message});throw e;}finally{await fs.writeFile(out+'/report-ui-results.json',JSON.stringify({results},null,2));await browser.close();}
