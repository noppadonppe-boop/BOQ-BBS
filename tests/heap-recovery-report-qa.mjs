import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {chromium} from './auth-persistence-qa.mjs';
const out=path.resolve(process.argv.includes('--occurrences')?'output/occurrence-batch-verification':process.argv.includes('--full')?'output/full-data-recovery-verification':'output/data-recovery-verification'), b=await chromium.launch({headless:true}),p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
try {
 await p.goto(pathToFileURL(out+'/DEVELOPMENT_REPORT.html').href);await p.locator('img').evaluateAll(xs=>Promise.all(xs.map(x=>x.decode())));
 const links=await p.locator('a').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')));
 for(const href of links){assert.ok(!href.includes(':')&&!href.includes('..'));assert.equal(path.dirname(path.resolve(out,href)),out);await fs.access(path.resolve(out,href));assert.ok(!/hprof|selection|objects.sqlite|accounts|context/i.test(href));}
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  await p.setViewportSize({width,height});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:out+'/report-'+name+'.png'});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/report-qa-results.json',JSON.stringify({status:'PASS',localLinks:links.length,images:await p.locator('img').count(),noPrivatePayloadLinks:true,desktopAndMobileOverflow:false,errors},null,2));console.log('PASS report links/private payload exclusion/layout');
}finally{await b.close();}
