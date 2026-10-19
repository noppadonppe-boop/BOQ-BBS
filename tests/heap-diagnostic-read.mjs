// Read only business access to an isolated candidate datastore, not recovered-state acceptance.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,viewer,login,guard} from './auth-persistence-qa.mjs';
const ctx=JSON.parse(await fs.readFile('output/area-change-verification/context.json','utf8'));
const out='output/data-recovery-verification', b=await chromium.launch({headless:true}), p=await b.newPage({viewport:{width:1440,height:1000}}), results=[],cloud=[],errors=[];
const check=async(name,f)=>{await f();results.push({name,status:'PASS'});console.log('PASS '+name);};
try {
 await guard(p,cloud,errors); await p.goto('http://127.0.0.1:5234/tests/context-harness.html');
 await p.evaluate(async q=>{const f=await import('/src/data/firebase.ts');if(!f.emulator||f.auth.app.options.projectId!=='demo-boq-v041')throw Error('Local candidate runtime required');await(await import('/src/auth/authService.ts')).loginWithEmail(q.email,q.password);},admin);
 const observed=await p.evaluate(async pid=>{
  const c=await import('/src/data/collections.ts'),d=await import('/src/data/projectReadback.ts'), q=await import('/src/domain/quantityReport.ts'), s=await import('/src/domain/exportScope.ts');
  const project=await d.readProjectRecord(pid),members=await c.readCollectionPages(pid,'members');
  const bundle={schemaVersion:1,project,members,attachments:[],status:'Draft',version:project.version,createdAt:'',revisionNumber:'Working'};
  const full=q.quantityReport(bundle), scoped=q.quantityReport(s.selectBundle(bundle,{zone:'West',floor:'Roof'}));
  return {version:project.version,state:project.specChangeState,revisionCounter:project.revisionCounter,approved:project.spec.approved,members:members.length,full:{concrete:full.totals[1],quantity:full.totals[0]},scope:{concrete:scoped.totals[1],quantity:scoped.totals[0]},completeRebar:full.completeRebar};
 },ctx.pid);
 await check('Signed user reads the candidate project under exact owner Rules and reproduces saved arithmetic',async()=>{
  assert.equal(observed.version,66);assert.equal(observed.members,57);assert.equal(observed.state.status,'Complete');assert.equal(observed.state.completed,57);assert.equal(observed.full.concrete,292);assert.equal(observed.full.quantity,286);assert.equal(observed.scope.concrete,176);assert.equal(observed.scope.quantity,172);assert.equal(observed.approved,false);assert.equal(observed.completeRebar,null);
 });
 await p.goto('http://127.0.0.1:5234');await p.locator('.top-profile').waitFor();
 await p.getByPlaceholder('ค้นหาโครงการ',{exact:true}).fill(ctx.code);await p.locator(`[data-project-id="${ctx.pid}"]`).click();
 await p.locator('nav').getByRole('button',{name:'ทะเบียนสมาชิก',exact:true}).click();await p.locator('[data-register-members="57"]').waitFor();
 await check('Candidate register opens through the real read-only inspection path with full57 members',async()=>{
  await p.locator('.member-register .kpis').getByText('292.000 m³',{exact:true}).waitFor();await p.screenshot({path:out+'/diagnostic-register-desktop.png'});
  await p.getByLabel('Zone ใน ทะเบียน',{exact:true}).selectOption(JSON.stringify('West'));await p.getByLabel('ชั้น ใน ทะเบียน',{exact:true}).selectOption(JSON.stringify('Roof'));
  await p.locator('.member-register .kpis').getByText('176.000 m³',{exact:true}).waitFor();
  await p.setViewportSize({width:390,height:844});await p.locator('.member-register .kpis').scrollIntoViewIfNeeded();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:out+'/diagnostic-register-mobile.png'});
 });
 await fs.writeFile(out+'/diagnostic-project-observation.json',JSON.stringify(observed,null,2));
 assert.deepEqual(cloud,[]); assert.deepEqual(errors,[]);
}catch(e){results.push({name:'Current diagnostic read',status:'FAIL',error:e.message});throw e;}
finally{await fs.writeFile(out+'/diagnostic-read-results.json',JSON.stringify({results,readOnly:true,candidateDatastore:true,fullRecoveryProven:false,productionRequests:false,cloud,errors},null,2));await b.close();}
