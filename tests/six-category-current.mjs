import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const out='output/six-category-current-verification',browser=await chromium.launch({headless:true}),context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),sdk=await context.newPage(),ui=await context.newPage(),cloud=[],errors=[];
const call=(action,pid,data={})=>sdk.evaluate(async q=>(await import('/src/data/firebase.ts')).command(q.action,q.pid,q.data),{action,pid,data});
const read=(pid,collection='',id='')=>sdk.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts'),s=await h.getDocFromServer(h.doc(f.db,`projects/${q.pid}${q.collection?'/'+q.collection+'/'+q.id:''}`));return s.exists()?(await import('/src/domain/storageCodec.ts')).decodeStorage(s.data()):null;},{pid,collection,id});
const close=(a,b)=>assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),`${a} expected ${b}`);
try {
 await fs.mkdir(out,{recursive:true});for(const p of [sdk,ui])await guard(p,cloud,errors);
 await sdk.goto('http://127.0.0.1:5291');await login(sdk,admin);
 await sdk.evaluate(async()=>{const f=await import('/src/data/firebase.ts');if(!f.emulator||f.db.app.options.projectId!=='demo-boq-v041')throw Error('Local QA only');});
 let ctx;
 if(process.argv[2]==='resume')ctx=JSON.parse(await fs.readFile('tmp/six-category-current-context.json','utf8'));
 else {
  const code='SIX-CURRENT-'+Date.now(),pid=(await call('createProject',undefined,{project:{code,name:'Six category SOFTWARE QA ONLY',owner:'QA fixture; not engineering approval',location:'Local isolated QA',notes:'Synthetic rectangular fixtures, independent arithmetic; no reconstructed GULF geometry'}})).id;
  const members=await sdk.evaluate(async()=>{
   const {categories,blankMember,blankBar}=await import('/src/domain/model.ts');
   return categories.map((category,i)=>{
    const m=blankMember(category,`QA-${category.toUpperCase()}`),d=i%2===0?16:12;
    m.occurrences=[{id:crypto.randomUUID(),zone:'North',floor:'F1',grid:'QA-A',quantity:2},{id:crypto.randomUUID(),zone:'South',floor:'F2',grid:'QA-B',quantity:i+1}];
    m.quantityBasis={version:1,state:'Entered',reference:'Independent rectangular input arithmetic SOFTWARE QA ONLY',reviewToken:crypto.randomUUID()};
    const axis=category==='Column'?'Z':'X',points=axis==='Z'?[[100,100,100],[100,100,m.z-100]]:[[100,100,100],[m.x-100,100,100]];
    m.bars=[{...blankBar('QA-B1'),diameter:d,outsideDiameter:d,grade:'QA-R',type:'R',shape:'polyline',shapeCode:'00',lengthMethod:'bs8666',count:2,axis,points,distributionStart:100,distributionEnd:120}];
    return m;
   });
  });
  for(const member of members)await call('saveMember',pid,{member});
  const project=await read(pid),profile=await sdk.evaluate(async p=>(await import('/src/domain/drawingStandard.ts')).drawingProfileDraft(p),project);
  await call('saveProject',pid,{version:project.version,project:{code:project.code,name:project.name,owner:project.owner,location:project.location,notes:project.notes,titleBlock:project.titleBlock,drawingProfile:profile}});
  ctx={code,pid,members:await Promise.all(members.map(m=>read(pid,'members',m.id)))};
  await fs.writeFile('tmp/six-category-current-context.json',JSON.stringify(ctx));
 }
 const reports=await sdk.evaluate(async pid=>{
  const project=await(await import('/src/data/projectReadback.ts')).readProjectRecord(pid),members=await(await import('/src/data/collections.ts')).readCollectionPages(pid,'members'),attachments=await(await import('/src/data/collections.ts')).readCollectionPages(pid,'attachments'),bundle={project,members,attachments,status:'Draft'};
  const {takeoff}=await import('/src/domain/engine.ts'),{quantityReport}=await import('/src/domain/quantityReport.ts'),{selectBundle}=await import('/src/domain/exportScope.ts');
  return {project,units:members.map(m=>({category:m.category,code:m.code,quantity:takeoff(m,project.spec).quantity,...takeoff(m,project.spec)})),full:quantityReport(bundle),north:quantityReport(selectBundle(bundle,{zone:'North',floor:'F1'})),south:quantityReport(selectBundle(bundle,{zone:'South',floor:'F2'})),cross:quantityReport(selectBundle(bundle,{zone:'North',floor:'F2'}))};
 },ctx.pid);
 const unitExpected={Foundation:[3,3.456,5.76,10.8,6.668,.676,2200],Beam:[4,1.08,9,0,0,0,5800],Column:[5,.512,5.12,0,0,0,3000],Slab:[6,3.6,27,0,0,0,5800],Wall:[7,3.6,37.2,0,0,0,5800],Custom:[8,1,6,0,0,0,800]};
 for(const row of reports.units){const expected=unitExpected[row.category];for(const [i,key] of ['quantity','concrete','formwork','excavation','backfill','lean'].entries())close(row[key],expected[i]);assert.equal(row.rows.length,1);assert.equal(row.rows[0].count,2);assert.equal(row.rows[0].cutLength,expected[6]);}
 const expectedFull=[33,72.048,549.28,32.4,20.004,2.028];for(let i=0;i<6;i++){close(reports.full.totals[i],expectedFull[i]);close(reports.full.completeTotals[i],expectedFull[i]);}
 const mass16=124.4*Math.PI*16*16*7850/4e6,mass12=128.8*Math.PI*12*12*7850/4e6;
 assert.equal(reports.full.rebar.find(r=>r.diameter===16).pieces,30);assert.equal(reports.full.rebar.find(r=>r.diameter===12).pieces,36);close(reports.full.rebar.find(r=>r.diameter===16).weight,mass16);close(reports.full.rebar.find(r=>r.diameter===12).weight,mass12);close(reports.full.completeTotals[6],mass16+mass12);
 close(reports.north.totals[0],12);close(reports.north.totals[1],26.496);close(reports.south.totals[0],21);close(reports.south.totals[1],45.552);assert.ok(reports.cross.totals.every(v=>v===0));
 assert.equal(reports.project.spec.approved,false);assert.equal(reports.project.spec.minimumStandard,'bs8666-2000-v8');
 ctx.reports=reports;await fs.writeFile('tmp/six-category-current-context.json',JSON.stringify(ctx));
 await fs.writeFile(out+'/quantity-results.json',JSON.stringify({status:'PASS',scope:'Independent synthetic rectangular inputs; no engineering/source acceptance',sixCategories:true,totals:[...expectedFull,mass16+mass12],rebar:[{diameter:16,pieces:30,lengthMetres:124.4,weight:mass16},{diameter:12,pieces:36,lengthMetres:128.8,weight:mass12}],northQuantity:12,southQuantity:21,sameOccurrenceCrossScopeZero:true,allSixExplicitInputReviewed:true,bsStartupMinimum:'bs8666-2000-v8',engineeringApproval:false,cloud,errors},null,2));
 console.log('PASS six categories independent geometry/count/BS00 cut arithmetic;33members,72.048m3,549.28m2 and scoped counts once');
} finally {await browser.close();}
