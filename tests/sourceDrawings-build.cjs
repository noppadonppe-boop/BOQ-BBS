const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
(async()=>{
 const dir='output/source-verification',ctx=JSON.parse(await fs.readFile(dir+'/context.json','utf8'));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1500,height:1050},acceptDownloads:true}),reads=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(/\/assets\/.*\.js$/.test(r.url()))reads.push(r.body().then(b=>({file:r.url().split('/').pop(),bytes:b.length})));});
 try{
  await page.goto('http://127.0.0.1:5000');await page.getByLabel('อีเมล',{exact:true}).fill(ctx.email);await page.getByLabel('รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)').fill(ctx.password);await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await page.locator(`[data-project-id="${ctx.projectId}"]`).click();await page.locator('.kpis').waitFor();
  const scripts=await Promise.all(reads),total=scripts.reduce((n,s)=>n+s.bytes,0);assert.ok(total<1120000,total);assert.ok(!scripts.some(s=>/ModelView|sourcePdf|generalPdf|spatialPdf|fabricationPdf|cuttingSchedulePdf|bendingPdf|exceljs|jspdf|jszip|pdf-/.test(s.file)));assert.match(await page.locator('.topbar').innerText(),/v0\.15/);
  await page.locator('nav').getByRole('button',{name:'แบบส่งงาน',exact:true}).click();await page.locator('.revision-item').filter({hasText:'R001'}).click();await page.getByLabel('ดูสมาชิกใน revision').selectOption(ctx.memberId);await page.getByLabel('ขนาดกระดาษ').selectOption('A1');
  const pending=page.waitForEvent('download',{timeout:180000});pending.catch(()=>{});await page.getByRole('button',{name:'BBS + จุดชี้แบบต้นทาง A1 · สมาชิกที่เลือก',exact:true}).click();await (await pending).saveAs(dir+'/downloads/built-source-A1.pdf');assert.ok((await fs.stat(dir+'/downloads/built-source-A1.pdf')).size>100000);assert.deepEqual(errors,[]);await page.screenshot({path:dir+'/built-delivery.png',fullPage:true});
  await fs.writeFile(dir+'/build-results.json',JSON.stringify({status:'PASS',scenarioCount:1,buildServedBy:'Firebase Hosting emulator / local only',initialScripts:scripts,totalInitialJavaScriptBytes:total,heavyModulesDeferred:true,actualFirstUseBuiltA1Download:true,errors},null,2));console.log('PASS built v0.15 first-use Frozen source A1 PDF / deferred modules',scripts);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
