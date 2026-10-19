import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,login,admin,require} from './auth-persistence-qa.mjs';
const out='output/prism-verification',ctx=JSON.parse(await fs.readFile(out+'/context.json','utf8')),files=JSON.parse(await fs.readFile(out+'/artifacts.json','utf8')),ExcelJS=require('exceljs'),browser=await chromium.launch({headless:true}),page=await browser.newPage({acceptDownloads:true}),cloud=[];
await page.route('**/*',r=>{if(/googleapis\.com$|firebaseio\.com$|firebasestorage\.app$/.test(new URL(r.request().url()).hostname)){cloud.push(r.request().url());return r.abort();}return r.continue();});
try{
 await page.goto('http://127.0.0.1:5215');await login(page,admin);await page.evaluate(async()=>{const f=await import('/src/data/firebase.ts');if(!f.emulator||f.db.app.options.projectId!=='demo-boq-v041')throw Error('Isolated SDK required');});
 const job=await page.evaluate(async q=>(await import('/src/data/firebase.ts')).command('exportSnapshot',q.pid,{revisionId:q.revision,scope:{}}),{pid:ctx.pid,revision:ctx.revision.id});
 const waiting=page.waitForEvent('download',{timeout:180000});await page.evaluate(async q=>(await import('/src/data/exports.ts')).generateJob(q.pid,q.job,'excel','A3',undefined,true),{pid:ctx.pid,job});
 const before=await fs.readFile(out+'/PRISM-draft.xlsx');await fs.writeFile(out+'/triangle-only-attempt.xlsx',before);await(await waiting).saveAs(path.resolve(out,'PRISM-draft.xlsx'));
 const w=new ExcelJS.Workbook();await w.xlsx.readFile(out+'/PRISM-draft.xlsx');const c=w.getWorksheet('Prism Check'),edges=w.getWorksheet('Prism Edges'),boq=w.getWorksheet('BOQ');assert.equal(c.rowCount,9);assert.equal(edges.rowCount,26);
 const rows=Object.fromEntries(Array.from({length:6},(_,i)=>[c.getCell('A'+(i+4)).value,i+4]));
 const slab=rows['P-Slab'],tri=rows['P-Custom'];assert.equal(c.getCell('E'+slab).value.result,16e6);assert.equal(c.getCell('F'+slab).value.result,1e6);assert.equal(c.getCell('G'+slab).value.result,15e6);assert.equal(c.getCell('H'+slab).value.result,20000);assert.equal(c.getCell('J'+slab).value.result,3);assert.equal(c.getCell('K'+slab).value.result,19);assert.equal(c.getCell('L'+tri).value.result,3);assert.equal(c.getCell('O'+tri).value.result,9);assert.equal(boq.getCell('J10').value.result,24);assert.equal(boq.getCell('K10').value.result,145);assert.equal(w.getWorksheet('BBS').getCell('K4').value.result,6);
 const bytes=await fs.readFile(out+'/PRISM-draft.xlsx'),sha256=createHash('sha256').update(bytes).digest('hex'),record=await page.evaluate(async q=>{const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts');return(await h.getDocFromServer(h.doc(f.db,'projects',q.pid,'exportJobs',q.id))).data();},{pid:ctx.pid,id:job.id});assert.equal(record.status,'Complete');assert.equal(record.file.sha256,sha256);
 files.splice(files.findIndex(f=>f.name==='PRISM-draft.xlsx'),1,{name:'PRISM-draft.xlsx',kind:'excel',size:'A3',bytes:bytes.length,sha256,jobId:job.id,scope:'Full project / six categories'});await fs.writeFile(out+'/artifacts.json',JSON.stringify(files,null,2));
 await fs.writeFile(out+'/project-export-results.json',JSON.stringify({status:'PASS',members:6,edgeRows:23,concreteTotal:24,formworkTotal:145,holeVolume:3,holeFormwork:19,totalBars:6,sha256,cloud},null,2));assert.deepEqual(cloud,[]);console.log('PASS actual full-project frozen Excel, all6 categories, hole area/formwork, aggregate24m3/145m2,6 bars');
}finally{await browser.close();}
