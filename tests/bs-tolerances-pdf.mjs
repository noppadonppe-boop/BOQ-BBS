import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bundle=JSON.parse(await fs.readFile('output/tolerance-verification/bundle.json','utf8')),browser=await chromium.launch({headless:true}),page=await browser.newPage(),results=[];
try{
 await page.goto('http://127.0.0.1:5175');await page.evaluate(async()=>{const f=await import('/src/data/firebase.ts');assertLocal(f.emulator,f.db.app.options.projectId);function assertLocal(e,p){if(!e||p!=='demo-boq-bbs')throw Error('Refusing cloud configuration');}});
 for(const mode of ['multiple','precision']){
  const bytes=await page.evaluate(async({bundle,mode})=>{const b=structuredClone(bundle);b.status='Draft';b.revisionNumber=undefined;b.calculations=undefined;
   if(mode==='multiple')b.members=Array.from({length:6},(_,i)=>({...b.members[0],id:'T4-M-'+i,code:'T4-M-'+i,scheduleSetup:{...b.members[0].scheduleSetup,startNumber:i+1}}));
   else b.members[0].bars=[{...b.members[0].bars[0],cutOverride:1e18}];
   return [...new Uint8Array(await(await(await import('/src/data/cuttingSchedulePdf.ts')).cuttingSchedulePdf(b)).arrayBuffer())];},{bundle,mode});
  assert.ok(bytes.length>10000);await fs.mkdir('tmp/pdfs/tolerance',{recursive:true});await fs.writeFile('tmp/pdfs/tolerance/'+mode+'.pdf',Buffer.from(bytes));results.push({name:mode==='multiple'?'Six-member schedule retains independent references across automatic Table4 page continuations':'Unrepresentable manual cut is labeled range unavailable in PDF',status:'GENERATED'});
 }
 await fs.writeFile('output/tolerance-verification/pdf-generation.json',JSON.stringify({results},null,2));
}finally{await browser.close();}
