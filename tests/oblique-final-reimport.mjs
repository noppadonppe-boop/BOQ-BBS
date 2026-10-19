import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initializeApp, deleteApp} from 'firebase/app';
import {getAuth, connectAuthEmulator, signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore, connectFirestoreEmulator, collection, query, where, getDocs, doc, getDoc} from 'firebase/firestore';
import ExcelJS from 'exceljs';
import {PDFDocument} from 'pdf-lib';
import {read, readObject, readFile, list, bytesHash} from './helpers/firebase-local.mjs';

const dir='output/oblique-shape-verification';
const evidenceDir=process.argv.includes('--access-checkpoint')?'output/project-access-verification':dir;
const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const ctx=await json(dir+'/context.json'), final=await json(dir+'/final-results.json'), ui=await json(dir+'/ui-results.json');
const app=initializeApp({apiKey:'demo-api-key',projectId:'demo-boq-bbs'},'oblique-readonly-reimport');
const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
await signInWithEmailAndPassword(auth,ctx.email,ctx.password);
const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
const c={app,auth,db}, results=[];
const records=async(pid,type)=>(await list(c,pid,type)).docs.map(d=>d.data());
const bytes=async file=>{const r=await readFile(c,file.path);assert.ok(r.ok);const b=Buffer.from(await r.arrayBuffer());assert.equal(bytesHash(b),file.sha256);return b;};
const check=async(name,f)=>{await f();results.push({name,status:'PASS'});console.log('PASS',name);};
try{
 await check('project-specific ACL, v3 Working qty5 and four saved builder geometries recover',async()=>{
  const p=(await getDoc(doc(db,'projects',ctx.projectId))).data();assert.equal(p.spec.minimumStandard,'bs8666-2000-v3');assert.equal(p.acl[auth.currentUser.uid],'admin');
  const ms=await records(ctx.projectId,'members'),m=ms.find(m=>m.id===ctx.memberId),builder=ms.find(m=>m.id===ctx.wizardMemberId);
  assert.equal(m.occurrences.reduce((n,o)=>n+o.quantity,0),5);assert.equal(m.scheduleSetup.revisionLetter,'B');assert.equal(m.status,'Draft');
  assert.deepEqual(builder.bars.map(b=>b.mark),['V15','V25','V26','V46']);assert.ok(builder.bars.every(b=>b.bsDimensionsConfirmed&&!b.placementConfirmed));
  await assert.rejects(()=>getDoc(doc(db,'projects',ctx.peerProjectId)),/permission/i);await assert.rejects(()=>getDoc(doc(db,'CMG-BOQ-BBS/root')),/permission/i);
 });
 await check('original v2 and v3 Frozen snapshots retain own policies, qty3 and exact recorded cuts',async()=>{
  for(const [id,version,cuts] of [[ctx.legacyRevisionId,'geometry-2.0+bs8666-2000-v2',[1000,1200,1400,2200,1000,1400]],[ctx.revisionId,'geometry-2.0+bs8666-2000-v3',ctx.cuts]]){
   const r=(await read(c,ctx.projectId,'revisions',id)).data(),b=await readObject(c,r.snapshot);assert.equal(b.engineVersion,version);
   assert.equal(b.calculations[ctx.memberId].quantity,3);assert.deepEqual(b.calculations[ctx.memberId].bars.map(b=>b.cutLength),cuts);assert.equal(b.members.find(m=>m.id===ctx.memberId).scheduleSetup.revisionLetter,'A');
  }
 });
 await check('latest completed A3/A1/A4 and Excel exports recover with exact SHA, page counts and six Note1 rows',async()=>{
  const jobs=await records(ctx.projectId,'exportJobs');
  for(const f of [...final.exports,final.xlsx]){
   const j=jobs.find(j=>j.status==='Complete'&&j.file?.sha256===f.sha256);assert.ok(j,f.path);assert.equal(j.revisionId,ctx.revisionId);const raw=await bytes(j.file);assert.equal(bytesHash(await fs.readFile(f.path)),f.sha256);
   if(f.size)assert.equal((await PDFDocument.load(raw)).getPageCount(),f.size==='A3'?8:7);
   else{const wb=new ExcelJS.Workbook();await wb.xlsx.load(raw);assert.equal(wb.getWorksheet('BS Note 1').rowCount,9);assert.deepEqual([4,5,6,7,8,9].map(i=>wb.getWorksheet('BBS').getCell('I'+i).value),ctx.cuts);}
  }
 });
 await check('restored Working geometry remains Draft with confirmations cleared and original archived PDF bytes',async()=>{
  const ps=await getDocs(query(collection(db,'projects'),where('acl.'+auth.currentUser.uid,'in',['admin','qs','checker','approver','viewer'])));
  const restored=ps.docs.filter(d=>d.data().code.startsWith('OBLIQUE-RESTORE-'));assert.equal(restored.length,1);const p=restored[0].data();assert.equal(p.spec.minimumStandard,'bs8666-2000-v3');
  const ms=await records(restored[0].id,'members');assert.equal(ms.length,2);assert.ok(ms.every(m=>m.status==='Draft'&&m.bars.every(b=>!b.bsDimensionsConfirmed&&!b.placementConfirmed)));
  const builder=ms.find(m=>m.code==='OBLIQUE-BUILDER');assert.deepEqual(builder.bars.map(b=>b.shapeCode),['15','25','26','46']);
  const hs=await records(restored[0].id,'importedHistory');const allRefs=hs.flatMap(h=>h.sourceRefs||[]),pdf=allRefs.find(f=>f.sha256===ui.restoredPdfHash);assert.ok(pdf);assert.equal(bytesHash(await bytes(pdf)),ui.restoredPdfHash);assert.equal((await list(c,restored[0].id,'exportJobs')).size,0);
 });
 await check('project creation retry guard persists independently of v3 profile and shared-root access stays closed',async()=>{
  const ps=await getDocs(query(collection(db,'projects'),where('acl.'+auth.currentUser.uid,'in',['admin','qs','checker','approver','viewer'])));
  const p=ps.docs.find(d=>d.data().code.startsWith('REQUEST-')&&d.data().name==='Idempotent creation QA');assert.ok(p);assert.match(p.data().creationInputHash,/^[a-f0-9]{64}$/);assert.deepEqual(p.data().acl,{[auth.currentUser.uid]:'admin'});assert.equal(p.data().spec.minimumStandard,'bs8666-2000-v3');
  assert.equal(bytesHash(await fs.readFile('Referrence/BS 8666.pdf')),'9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43');
 });
 const pid=Number((await fs.readFile(evidenceDir+'/restart-emulator-pid.txt','utf8')).trim());assert.ok(Number.isSafeInteger(pid)&&pid>0);
 await fs.writeFile(evidenceDir+(evidenceDir===dir?'/final-reimport-results.json':'/oblique-regression-results.json'),JSON.stringify({results,restartEmulatorPid:pid,scope:'Five representative read-only application checks after verified normal default import. Separate from fresh software scenarios; not whole-database parity or production disaster recovery acceptance.'},null,2));
}catch(e){await fs.writeFile(evidenceDir+(evidenceDir===dir?'/final-reimport-failure.json':'/oblique-regression-failure.json'),JSON.stringify({error:String(e),results},null,2));throw e;}finally{await deleteApp(app);}
