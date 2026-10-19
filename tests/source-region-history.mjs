import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,admin,guard} from './auth-persistence-qa.mjs';
const out='output/source-region-verification',ctx=JSON.parse(await fs.readFile(out+'/context.json','utf8')),browser=await chromium.launch({headless:true}),page=await browser.newPage(),results=[],cloud=[],errors=[];
await guard(page,cloud,errors);let current='setup';
const check=async(name,fn)=>{current=name;await fn();results.push({name,status:'PASS'});console.log('PASS',name);};
try{
 await page.goto(ctx.sdkUrl+'/tests/context-harness.html');await page.evaluate(async u=>(await import('/src/auth/authService.ts')).loginWithEmail(u.email,u.password),admin);
 await check('Restored project own Frozen Storage bytes preserve exact originalGULF shape references,nine regions andR001 digest',async()=>{
  const records=await page.evaluate(async pid=>(await import('/src/data/collections.ts')).readCollectionPages(pid,'importedHistory'),ctx.restorePid),r=records.find(r=>r.originalCollection==='revisions'&&r.originalId===ctx.revision.id);
  assert.ok(r);const file=r.sourceRefs.find(f=>f.sha256===r.data.digest);assert.ok(file.path.includes(ctx.restorePid));assert.notEqual(file.path,r.data.snapshot.path);
  const restored=await page.evaluate(async q=>(await import('/src/data/snapshots.ts')).loadSnapshot({digest:q.digest,snapshot:q.file}),{digest:r.data.digest,file});assert.deepEqual(restored,ctx.frozenBundle);
  assert.equal(createHash('sha256').update(await fs.readFile(out+'/source-regions-backup.zip')).digest('hex'),ctx.backup.sha256);
 });
 await check('Restored Working source pictures render from its own remapped attachment paths,includingrotatedPDF andPNG',async()=>{
  const originalCalls=[];const listener=req=>{if(req.url().includes(encodeURIComponent('projects/'+ctx.pid+'/')))originalCalls.push(req.url());};page.on('request',listener);
  const data=await page.evaluate(async pid=>{const c=await import('/src/data/collections.ts'),{sourceRegionPlans}=await import('/src/domain/sourceRegions.ts'),{visitSourceRegions}=await import('/src/data/sourceRegionImages.ts'),b={members:await c.readCollectionPages(pid,'members'),attachments:await c.readCollectionPages(pid,'attachments')},plans=sourceRegionPlans(b),hash=(await import('/src/data/snapshots.ts')).sha256,images=[];
   if(plans.some(p=>!p.attachment.path.startsWith('projects/'+pid+'/')))throw Error('Restored source path notowned');
   await visitSourceRegions(plans,async(p,image)=>images.push({member:p.member.code,mark:p.row.mark,page:p.reference.page,path:p.attachment.path,attachmentId:p.attachment.id,sha256:await hash(await(await fetch(image.data)).arrayBuffer()),width:image.width,height:image.height,reference:p.reference}));return images;},ctx.restorePid);
  page.off('request',listener);assert.equal(data.length,9);assert.deepEqual(originalCalls,[]);
  assert.ok(data.every(d=>d.width>0&&d.height>0&&d.path.includes(ctx.restorePid)));
  const image=data.find(d=>d.member==='SYN-IMAGE');assert.equal(image.sha256,ctx.imageEvidence.find(d=>d.member==='SYN-IMAGE').sha256);
  const gulf=data.find(d=>d.mark==='309');assert.equal(gulf.reference.rect.x,.92);assert.notEqual(gulf.attachmentId,ctx.gulfAttachment.id);
  await fs.writeFile(out+'/restored-region-pictures.json',JSON.stringify(data,null,2));
 });
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
}catch(e){results.push({name:current,status:'FAIL',message:e.message});throw e;}
finally{await fs.writeFile(out+'/history-results.json',JSON.stringify({results,cloud,errors,scope:'Actual own restored Storage bytes and source pictures. Frozen bytes remain historical; Working binds remappedown attachments. No construction approval.'},null,2));await browser.close();}
