import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,require,admin,guard,login} from './auth-persistence-qa.mjs';

const ExcelJS=require('exceljs'),out='output/source-region-verification',ctx=JSON.parse(await fs.readFile(out+'/context.json','utf8'));
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),sdk=await browser.newPage();
const results=[],artifacts=[],cloud=[],errors=[],hash=b=>createHash('sha256').update(b).digest('hex');let current='setup';
for(const p of [page,sdk])await guard(p,cloud,errors);
const read=path=>sdk.evaluate(async path=>{const f=await import('/src/data/firebase.ts'),s=await import('/tests/direct-browser-harness.ts');return(await import('/src/domain/storageCodec.ts')).decodeStorage((await s.getDocFromServer(s.doc(f.db,path))).data());},path);
const check=async(name,fn)=>{current=name;await fn();results.push({name,status:'PASS'});console.log('PASS',name);};

async function exportUi(format,frozen,size){
 await page.getByRole('button',{name:'ส่งออกข้อมูลทำงาน',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'สร้างไฟล์ส่งออก',exact:true});
 if(frozen)await modal.getByLabel('ข้อมูลที่ใช้ส่งออก',{exact:true}).selectOption(ctx.revision.id);
 await modal.getByLabel('รูปแบบไฟล์ส่งออก',{exact:true}).selectOption(format);
 if(size!=='A4'&&format!=='excel')await modal.getByLabel('ขนาดกระดาษส่งออก',{exact:true}).selectOption(size);
 await modal.getByRole('region',{name:'ตัวอย่างชุดส่งออก',exact:true}).waitFor();
 const file=(frozen?'frozen':'working')+'-source-shapes-'+size+'.'+(format==='excel'?'xlsx':'pdf');
 await page.screenshot({path:out+'/'+file.replace(/\.(xlsx|pdf)$/,'-preview.png'),fullPage:true});
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:90000}),modal.getByRole('button',{name:format==='excel'?'สร้างไฟล์ Excel':'สร้างไฟล์ PDF',exact:true}).click()]);
 await download.saveAs(out+'/'+file);await modal.waitFor({state:'hidden'});
 const bytes=await fs.readFile(out+'/'+file),sha256=hash(bytes),jobs=await sdk.evaluate(async pid=>(await import('/src/data/collections.ts')).readCollectionPages(pid,'exportJobs'),ctx.pid),job=jobs.find(j=>j.file?.sha256===sha256);
 assert.ok(job);assert.equal(job.status,'Complete');assert.equal(job.file.size,bytes.length);
 const bundle=await sdk.evaluate(async j=>(await import('/src/data/snapshots.ts')).loadSnapshot(j),job);
 assert.equal(bundle.members.length,3);assert.equal(bundle.members.find(m=>m.id===ctx.gulfMid).bars.length,0);assert.equal(bundle.calculations[ctx.gulfMid].concrete,3.234);
 const stored=await sdk.evaluate(async path=>{const f=await import('/src/data/firebase.ts'),s=await import('/tests/direct-browser-harness.ts'),b=await s.getBlob(s.ref(f.storage,path));return {size:b.size,sha256:await(await import('/src/data/snapshots.ts')).sha256(await b.arrayBuffer())};},job.file.path);
 assert.deepEqual(stored,{size:bytes.length,sha256});
 const references=await sdk.evaluate(async b=>{const {sourceRegionPlans,referenceText}=await import('/src/domain/sourceRegions.ts'),{visitSourceRegions}=await import('/src/data/sourceRegionImages.ts'),hash=(await import('/src/data/snapshots.ts')).sha256,rows=[];await visitSourceRegions(sourceRegionPlans(b),async(p,image)=>{const raw=await(await fetch(image.data)).arrayBuffer();rows.push({member:p.member.code,mark:p.row.mark,bar:p.member.bars.find(b=>b.id===p.row.barId)?.mark||'UNMAPPED',file:p.attachment.name,revision:p.attachment.revision,reference:p.reference,text:referenceText(p.reference),imageHash:await hash(raw),width:image.width,height:image.height});});return rows;},bundle);
 assert.equal(references.length,9);
 if(frozen){assert.deepEqual(bundle.members,ctx.frozenBundle.members);assert.equal(references.find(r=>r.mark==='309').reference.rect.x,.935);}
 else{assert.notDeepEqual(bundle.members.find(m=>m.id===ctx.gulfMid).sourceSchedule.rows[1].shapeReference,ctx.frozenBundle.members.find(m=>m.id===ctx.gulfMid).sourceSchedule.rows[1].shapeReference);}
 if(format==='excel'){
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);const sheet=wb.getWorksheet('Source Shape References');assert.ok(sheet);assert.equal(sheet.rowCount,12);assert.equal(sheet.getImages().length,9);assert.equal(sheet.pageSetup.paperSize,8);
  const imageHashes=sheet.getImages().map(i=>hash(wb.getImage(i.imageId).buffer));assert.deepEqual(imageHashes.sort(),references.map(r=>r.imageHash).sort());
  for(const r of references){const row=sheet.getRows(4,9).find(q=>q.getCell(1).value===r.member&&q.getCell(2).value===r.mark+' → '+r.bar);assert.ok(row);assert.equal(row.getCell(3).value,r.file+' / Rev '+r.revision);assert.equal(row.getCell(4).value,r.text);assert.equal(row.height,130);}
 }
 artifacts.push({file,sha256,bytes:bytes.length,format,size,frozen,jobId:job.id,snapshotDigest:job.digest,status:bundle.status,engineVersion:bundle.engineVersion,references});
}

try{
 await sdk.goto(ctx.sdkUrl+'/tests/context-harness.html');await sdk.evaluate(async u=>{const f=await import('/src/data/firebase.ts');if(!f.emulator||f.db.app.options.projectId!=='demo-boq-v041')throw Error('Isolated backend required');await(await import('/src/auth/authService.ts')).loginWithEmail(u.email,u.password);},admin);
 // Working-only A4 identities do not alter the existing FrozenR001 snapshot.
 for(const [i,mid] of [ctx.gulfMid,ctx.rotationMid,ctx.imageMid].entries()){
  const m=await read('projects/'+ctx.pid+'/members/'+mid);m.scheduleSetup={drawingNumber:'QA-SRC46-'+String(100+i),startNumber:1,revisionLetter:'A'};
  await sdk.evaluate(async q=>(await import('/src/data/firebase.ts')).command('saveMember',q.pid,{member:q.member}),{pid:ctx.pid,member:m});
 }
 await page.goto('http://127.0.0.1:5202');await login(page,admin);await page.locator('[data-project-id="'+ctx.pid+'"]').click();await page.waitForFunction(()=>!document.querySelector('.page-content')?.inert);await page.locator('nav').getByRole('button',{name:'แบบส่งงาน',exact:true}).click();
 await check('Actual compiled Frozen XLSX embeds all nine original source crops,fullSHA/page/rect and immutableR001 rows',()=>exportUi('excel',true,'A3'));
 await check('Actual compiled working XLSX embeds the changed regions without inventing GULF bars or changing3.234m3',()=>exportUi('excel',false,'A3'));
 await check('Actual compiled Frozen A3 BBS PDF includes nine original shape reference pages and owner frames',()=>exportUi('details-v2',true,'A3'));
 await check('Actual compiled Frozen A1 BBS PDF preserves the same original reference coordinates and pictures',()=>exportUi('details-v2',true,'A1'));
 await check('Actual compiled working A4 cutting schedule appends all source shape reference pages using the currentregions',()=>exportUi('cutting-a4-v1',false,'A4'));
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
}catch(e){results.push({name:current,status:'FAIL',message:e.message});await page.screenshot({path:out+'/export-failure.png',fullPage:true});throw e;}
finally{await fs.writeFile(out+'/export-results.json',JSON.stringify({results,artifacts,cloud,errors,scope:'Actual compiled public UI downloads,captured jobs/snapshots and complete Storage bytes. Original source references are NOT construction/shape/engineering approval.'},null,2));await browser.close();}
