import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,guard,login} from './auth-persistence-qa.mjs';
const out='output/component-quantity-verification',ctx=JSON.parse(await fs.readFile('tmp/component-quantity-context.json','utf8')),browser=await chromium.launch({headless:true}),p=await browser.newPage(),cloud=[],errors=[];
try {
 await guard(p,cloud,errors);await p.goto('http://127.0.0.1:5296');await login(p,admin);
 const result=await p.evaluate(async q=>{
  const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts'),{decodeStorage}=await import('/src/domain/storageCodec.ts'),{quantityReport}=await import('/src/domain/quantityReport.ts'),{reviewQuantityComponents}=await import('/src/domain/quantityBasis.ts'),read=async()=>decodeStorage((await h.getDocFromServer(h.doc(f.db,`projects/${q.pid}/members/${q.mid}`))).data()),report=async()=>{const project=await(await import('/src/data/projectReadback.ts')).readProjectRecord(q.pid),members=await(await import('/src/data/collections.ts')).readCollectionPages(q.pid,'members');return quantityReport({project,members,attachments:[],status:'Draft'}).completeTotals;},original=await read(),results={};
  await f.command('saveMember',q.pid,{member:{...original,faces:original.faces.map(()=>false)}});results.faceChange=await report();
  let current=await read();await f.command('saveMember',q.pid,{member:{...current,faces:original.faces,z:6500}});results.heightChange=await report();
  current=await read();await f.command('saveMember',q.pid,{member:{...current,z:6600,quantityBasis:reviewQuantityComponents({...current,z:6600},['concrete'],'Rechecked original source700×700×6600; not engineering approval')}});results.concreteRereview=await report();
  current=await read();await f.command('saveMember',q.pid,{member:{...current,occurrences:current.occurrences.map(o=>({...o,quantity:o.quantity+1}))}});results.countChange=await report();
  current=await read();const restored={...current,occurrences:original.occurrences};await f.command('saveMember',q.pid,{member:{...restored,quantityBasis:reviewQuantityComponents(restored,['count'],'Rechecked original printed source quantity; not approval')}});results.countRereview=await report();return results;
 },{pid:ctx.pid,mid:ctx.items[1].id});
 assert.deepEqual(result.faceChange,[78,252.252,null,null,null,null,null]);assert.deepEqual(result.heightChange,[78,null,null,null,null,null,null]);assert.deepEqual(result.concreteRereview,[78,252.252,null,null,null,null,null]);assert.deepEqual(result.countChange,Array(7).fill(null));assert.deepEqual(result.countRereview,[78,252.252,null,null,null,null,null]);assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/lifecycle-results.json',JSON.stringify({status:'PASS',actualMemberTransactions:true,unrelatedFormworkEditRetainsCountConcrete:true,geometryChangeInvalidatesConcrete:true,countChangeHoldsDependentTotals:true,explicitRereviewRestoresOnlySelectedQuantities:true,engineeringApproval:false,productionRequests:false,cloud,errors},null,2));console.log('PASS actual component review dependency invalidation/rereview; original numbers restored, no approval');
} finally {await browser.close();}
