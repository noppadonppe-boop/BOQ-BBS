import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out='output/member-copy-verification',ctx=JSON.parse(await fs.readFile(out+'/context.json','utf8')),admin=JSON.parse(await fs.readFile('output/auth-integration-verification/bootstrap-context.json','utf8'));
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),results=[],cloud=[];
await page.route('**/*',r=>{if(/googleapis\.com$|firebaseio\.com$|firebasestorage\.app$/.test(new URL(r.request().url()).hostname)){cloud.push(r.request().url());return r.abort();}return r.continue();});
try{
 await page.goto(ctx.sdkUrl+'/tests/context-harness.html');await page.evaluate(async u=>(await import('/src/auth/authService.ts')).loginWithEmail(u.email,u.password),admin);
 const evidence=await page.evaluate(async q=>{
  const f=await import('/src/data/firebase.ts'),s=await import('/tests/direct-browser-harness.ts'),d=await import('/src/domain/model.ts'),e=await import('/src/domain/engine.ts'),codec=await import('/src/domain/storageCodec.ts');
  const read=async p=>codec.decodeStorage((await s.getDoc(s.doc(f.db,p))).data());
  const m=d.blankMember('Custom','ROUND-SOURCE');m.bars=[{...d.blankBar('R01'),count:2,distributionStart:100,distributionEnd:850,shape:'polyline',shapeCode:'00',points:[[100,100,100],[911,100,100]]}];await f.command('saveMember',q.pid,{member:m});
  const id=(await f.command('createProject',undefined,{project:{code:'COPY-ROUND-'+Date.now(),name:'Synthetic target rounding QA'}})).id;let target=await read('projects/'+id);
  await(await import('/src/data/specChanges.ts')).changeSpec(id,{...target.spec,density:8000,rounding:50},target.version);target=await read('projects/'+id);
  const source=await read(`projects/${q.pid}/members/${m.id}`),project=await read('projects/'+q.pid),input={sourceProjectId:q.pid,sourceMemberId:m.id,sourceProjectVersion:project.version,sourceMemberVersion:source.version,targetProjectVersion:target.version,memberId:crypto.randomUUID(),code:'ROUND-TARGET',occurrences:[{id:crypto.randomUUID(),zone:'NEW',floor:'L3',grid:'',quantity:3}]};
  const result=await f.command('copyMember',id,input),copy=await read(`projects/${id}/members/${result.id}`);
  return {source:e.takeoff(source,project.spec),target:e.takeoff(copy,target.spec),copy,sourcePoints:source.bars[0].points,pid:id,sourceVersionAfter:(await read(`projects/${q.pid}/members/${m.id}`)).version};
 },{pid:ctx.pid});
 assert.equal(evidence.source.rows[0].geometricLength,811);assert.equal(evidence.source.rows[0].cutLength,825);assert.equal(evidence.target.rows[0].geometricLength,811);assert.equal(evidence.target.rows[0].cutLength,850);assert.equal(evidence.target.quantity,3);assert.deepEqual(evidence.copy.bars[0].points,evidence.sourcePoints);assert.equal(evidence.sourceVersionAfter,1);assert.ok(Math.abs(evidence.target.rebar*3-6*.85*Math.PI*.016**2/4*8000)<1e-9);
 results.push({name:'Actual source 811mm/825mm at25mm rounding becomes850mm at target50mm with independent steel mass; original points/source version unchanged',status:'PASS'});
 assert.deepEqual(cloud,[]);await fs.writeFile(out+'/spec-evidence.json',JSON.stringify(evidence,null,2));console.log('PASS target rounding recalculated, original inputs unchanged');
}finally{await fs.writeFile(out+'/spec-results.json',JSON.stringify({results,cloud,scope:'Actual local SDK/change-Spec workflow; synthetic 811mm path only; no engineering acceptance.'},null,2));await browser.close();}
