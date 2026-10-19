import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out='output/auth-persistence-verification',url='http://127.0.0.1:5198';
await fs.mkdir(out,{recursive:true});
const admin=JSON.parse(await fs.readFile('output/auth-integration-verification/bootstrap-context.json','utf8'));
const paths=(await fs.readdir('output/priced-boq-dist/assets')).filter(f=>/^index-.*\.js$/.test(f)).map(f=>'/assets/'+f);
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),tab=await context.newPage(),cloud=[],errors=[];
for(const p of [page,tab]){await p.route('**/*',r=>{if(/googleapis\.com$|firebaseio\.com$|firebasestorage\.app$/.test(new URL(r.request().url()).hostname)){cloud.push(r.request().url());return r.abort();}return r.continue();});p.on('pageerror',e=>errors.push(e.message));}
// Observe the actual compiled Auth object; do not alter it, storage or events.
const observe=p=>p.evaluate(async paths=>{let auth;for(const path of paths){const m=await import(path);auth=Object.values(m).find(v=>v&&typeof v==='object'&&typeof v.authStateReady==='function'&&typeof v.signOut==='function'&&v.app?.options.projectId==='demo-boq-v041');if(auth)break;}if(!auth)throw Error('Isolated compiled Auth missing');await auth.authStateReady();const persistence=auth.persistenceManager.persistence;return {authenticated:!!auth.currentUser,anonymous:!!auth.currentUser?.isAnonymous,storageKind:'dbPromise' in persistence?'IndexedDB':persistence.storage===localStorage?'localStorage':'other',localUserKeyPresent:Object.keys(localStorage).some(k=>k.startsWith('firebase:authUser:'))};},paths);
let result;
try{
 await page.goto(url);await page.getByLabel('อีเมล',{exact:true}).fill(admin.email);await page.getByLabel('รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)').fill(admin.password);await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await page.locator('.top-profile').waitFor();
 const before=await observe(page);assert.equal(before.authenticated,true);assert.equal(before.storageKind,'localStorage');await page.screenshot({path:out+'/before-main-signed-in.png',fullPage:true});
 await tab.goto(url);await tab.locator('.top-profile').waitFor();await page.getByLabel('อีเมล',{exact:true}).waitFor({timeout:15000});
 const after={main:await observe(page),newTab:await observe(tab)};assert.equal(after.main.authenticated,false);assert.equal(after.newTab.authenticated,true);assert.equal(after.newTab.storageKind,'IndexedDB');assert.equal(after.main.localUserKeyPresent,false);
 await page.screenshot({path:out+'/before-main-unexpected-signout.png',fullPage:true});await tab.screenshot({path:out+'/before-new-tab-signed-in.png',fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(cloud,[]);
 result={status:'REPRODUCED',before,after,scope:'Actual v0.43 compiled app public UI login/new tab. Only read-only Auth/storage observation; no credential/token/storage contents recorded, no mocked Auth or injected storage events.'};console.log('REPRODUCED: opening new tab migrates login state to IndexedDB and signs the localStorage tab out');
}catch(e){result={status:'FAIL',message:e.message};await page.screenshot({path:out+'/probe-failure.png',fullPage:true});throw e;}finally{await fs.writeFile(out+'/before-results.json',JSON.stringify({...result,cloud,errors},null,2));await browser.close();}
