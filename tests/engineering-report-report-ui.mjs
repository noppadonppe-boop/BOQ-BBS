import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from './auth-persistence-qa.mjs';
const out='output/engineering-report-verification',browser=await chromium.launch({headless:true}),p=await browser.newPage({viewport:{width:1360,height:900}}),errors=[],results=[];
p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('file:///F:/Project%20Code/BOQ_BBS/'+out+'/DEVELOPMENT_REPORT.html');
 await p.getByRole('heading',{level:1}).filter({hasText:'v0.59'}).waitFor();
 assert.equal(await p.locator('#requirements tbody tr').count(),12);assert.equal(await p.locator('img').count(),36);
 await p.locator('img').evaluateAll(nodes=>nodes.forEach(n=>n.loading='eager'));
 await p.waitForFunction(()=>Array.from(document.images).every(n=>n.complete));
 const brokenImages=await p.locator('img').evaluateAll(nodes=>nodes.filter(n=>!n.naturalWidth).map(n=>n.src));assert.deepEqual(brokenImages,[]);
 const links=await p.locator('a').evaluateAll(nodes=>nodes.map(n=>n.href));for(const link of links)if(link.startsWith('file:'))await fs.access(fileURLToPath(link));
 for(const[label,width,height]of [['desktop',1360,900],['mobile',390,844]]){await p.setViewportSize({width,height});await p.evaluate(()=>window.scrollTo(0,0));if(!(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))){console.log(JSON.stringify(await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll('main > section,.stat,figure,summary')].map(n=>({tag:n.tagName,cls:n.className,right:n.getBoundingClientRect().right,text:n.textContent.slice(0,100)})).filter(n=>n.right>innerWidth+1)}))));}assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:out+'/report-'+label+'.png'});results.push({name:label+' report /36 images /all local links /12 requirements /no overall overflow',status:'PASS'});}
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/report-view-results.json',JSON.stringify({results,images:36,localLinks:links.length,brokenImages,errors},null,2));console.log('PASS report desktop/mobile,36 images, all local links and12 requirements');
}finally{await browser.close();}
