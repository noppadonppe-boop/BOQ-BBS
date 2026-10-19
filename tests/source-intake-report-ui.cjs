const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');
(async()=>{
 const dir='output/source-intake-verification',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pathToFileURL(path.resolve(dir+'/DEVELOPMENT_REPORT.html')).href);
  await page.locator('img').first().waitFor();
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;}))));
  const links=await page.locator('a').evaluateAll(nodes=>nodes.map(n=>n.href));
  const localLinks=[...new Set(links.filter(href=>href.startsWith('file:')))];
  for(const href of localLinks)assert.ok((await fs.stat(fileURLToPath(href))).isFile(),href);
  for(const [name,width,height] of [['desktop',1500,1050],['mobile',390,844]]){
   await page.setViewportSize({width,height});
   const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,images:[...document.images].map(i=>({loaded:i.complete&&i.naturalWidth>0,src:i.getAttribute('src')}))}));
   assert.equal(state.overflow,false);assert.ok(state.images.every(i=>i.loaded));
   await page.screenshot({path:dir+'/report-'+name+'.png',fullPage:true});
   await page.screenshot({path:dir+(name==='desktop'?'/report-preview.png':'/report-mobile-preview.png')});
   checks.push({name,width,height,...state,status:'PASS'});
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(dir+'/report-layout.json',JSON.stringify({checks,localFileLinksVerified:localLinks.length,errors},null,2));
  console.log('PASS report desktop/mobile: images loaded, no overflow/browser errors;',localLinks.length,'local links exist');
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

