const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL,fileURLToPath}=require('node:url');
(async()=>{
 const dir=path.resolve('output/project-access-verification'),browser=await chromium.launch({headless:true}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pathToFileURL(dir+'/DEVELOPMENT_REPORT.html').href);await page.locator('h1').waitFor();
  const links=await page.locator('a[href]').evaluateAll(as=>as.map(a=>a.href));for(const link of links.filter(h=>h.startsWith('file:')))assert.ok((await fs.stat(fileURLToPath(link))).isFile(),link);
  const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[]);
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:dir+'/report-'+name+'.png',fullPage:false});
   await page.screenshot({path:dir+'/report-'+name+'-top.png'});
  }
  assert.deepEqual(errors,[]);await fs.writeFile(dir+'/report-layout-results.json',JSON.stringify({status:'PASS',allLocalLinksExist:links.filter(h=>h.startsWith('file:')).length,allImagesLoaded:true,desktopAnd390pxFit:true,errors,scope:'Report layout/link QA only; separate from320 scoped application software scenarios.'},null,2));console.log('PASS report links/images/desktop390px layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
