import {getDoc} from 'firebase/firestore';
import {getBlob,ref} from 'firebase/storage';
import {storage} from '../firebase';
import {engineeringFixturesEnabled} from '../engineeringFeature';
import type {Member,Attachment,Project} from '../../domain/model';
import {fixtureRequestSchema,fixtureSchema,fixtureSpec,evaluateFixture,fixtureFileProblems,type EngineeringFixture} from '../../domain/engineeringFixtures';
import {calculationEngine} from '../../domain/version';
import {digestData,sha256} from '../snapshots';
import {inspectAttachmentDocument} from '../documentInspection';
import {decodeStorage} from '../../domain/storageCodec';
import {readCollectionPages} from '../collections';
import {projectTransaction,projectRef,recordRef,must,encode,now,actor,allow,writable} from './common';
const budget=(value:unknown)=>must(new TextEncoder().encode(JSON.stringify(encode(value))).length<700000,'แบ่งชุดตรวจ: ข้อมูลหนึ่งรายการเกิน700KB');
export async function createEngineeringFixture(pid:string,data:Record<string,any>,id:string){
 must(engineeringFixturesEnabled,'ยังไม่เปิดการบันทึกกรณีตรวจในฐานข้อมูล ให้ผู้ดูแลจัดสิทธิ์ก่อน');
 const request=fixtureRequestSchema.parse(data.fixture);
 return projectTransaction('createEngineeringFixture',pid,data,id,['admin','qs'],async(tx,p,u)=>{
  const [ms,ss,existing]=await Promise.all([tx.get(recordRef(pid,'members',request.memberId)),tx.get(recordRef(pid,'attachments',request.sourceId)),tx.get(recordRef(pid,'engineeringFixtures',id))]);
  must(ms.exists()&&ss.exists(),'ไม่พบสมาชิกหรือไฟล์กรณีอ้างอิง');must(!existing.exists(),'รหัสกรณีตรวจซ้ำ');const member=decodeStorage(ms.data()) as Member,source=decodeStorage(ss.data()) as Attachment;
  must(member.version===request.memberVersion,'สมาชิกเปลี่ยนแล้ว โหลดล่าสุดก่อนเก็บกรณีตรวจ','aborted');must(!source.memberId||source.memberId===member.id,'ไฟล์อ้างอิงเป็นของสมาชิกอื่น');must(source.sha256&&source.pageCount&&request.sourcePage<=source.pageCount,'ต้องมี SHA256 และเลขหน้าที่ตรวจแล้ว');
  must(source.sha256===request.sourceSha256,'ไฟล์อ้างอิงเปลี่ยนแล้ว เลือกไฟล์ล่าสุด','aborted');must(await digestData(fixtureSpec(p.spec))===request.specDigest,'Spec เปลี่ยนแล้ว เปิดฟอร์มใหม่ก่อนเก็บกรณีตรวจ','aborted');
  const spec=fixtureSpec(p.spec),f=fixtureSchema.parse({id,version:1,label:request.label,member,spec,specDigest:await digestData(spec),engineVersion:calculationEngine(spec),source:{id:source.id,memberId:source.memberId,name:source.name,revision:source.revision,sha256:source.sha256,page:request.sourcePage,pageCount:source.pageCount},reference:request.reference,note:request.note,outcome:request.outcome,expectedErrors:request.expectedErrors,expected:request.expected,tolerance:request.tolerance,createdAt:now(),createdBy:u.uid}),contentDigest=await digestData(f);budget({...f,contentDigest});
  tx.set(recordRef(pid,'engineeringFixtures',id),encode({...f,contentDigest}));tx.update(projectRef(pid),{historyEpoch:id,engineeringFixtureEpoch:id});return {id,contentDigest};
 });
}
export async function runEngineeringFixtures(pid:string,data:Record<string,any>,id:string){
 must(engineeringFixturesEnabled,'ยังไม่เปิดการบันทึกกรณีตรวจในฐานข้อมูล ให้ผู้ดูแลจัดสิทธิ์ก่อน');
 must(Array.isArray(data.fixtureIds)&&data.fixtureIds.length>0&&data.fixtureIds.length<=20&&new Set(data.fixtureIds).size===data.fixtureIds.length&&data.fixtureIds.every((s:unknown)=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(s)),'เลือกกรณีตรวจไม่ซ้ำ1–20รายการ','invalid-argument');
 const anchor=await getDoc(projectRef(pid));must(anchor.exists(),'ไม่พบโครงการ');const initial=decodeStorage(anchor.data()) as Project,u=await actor(),roles=['admin','qs','checker','approver'] as const;allow(initial,u,[...roles]);writable(initial);
 // A retried successful operation keeps its original captured result, even if
 // reference bytes or the current specification have subsequently changed.
 const old=await getDoc(recordRef(pid,'operations',id));if(old.exists())return projectTransaction('runEngineeringFixtures',pid,data,id,[...roles],async()=>{throw Error('Unexpected replay');});
 const attachments=await readCollectionPages(pid,'attachments') as Attachment[],staged=new Map<string,{digest:string;sourceProblems:string[]}>(),verifiedSources=new Map<string,string[]>();let size=0;
 for(const fid of data.fixtureIds){const d=await getDoc(recordRef(pid,'engineeringFixtures',fid));must(d.exists(),'ไม่พบกรณีตรวจ');const {contentDigest,...body}=decodeStorage(d.data()),f=fixtureSchema.parse(body);must(f.id===fid&&await digestData(f)===contentDigest&&await digestData(fixtureSpec(f.spec))===f.specDigest,'กรณีตรวจ checksum หรือรหัส/Spec ไม่ตรง');const problems=fixtureFileProblems(f.source,attachments),a=attachments.find(a=>a.id===f.source.id);
  if(a&&!problems.length){const key=a.id+'/'+f.source.sha256;let bytesProblems=verifiedSources.get(key);if(!bytesProblems){size+=a.size;must(size<=120*1024*1024,'แบ่งชุดตรวจ: ไฟล์อ้างอิงรวมเกิน120MiB');bytesProblems=[];try{const blob=await getBlob(ref(storage,a.path),50*1024*1024);if(blob.size!==a.size||await sha256(await blob.arrayBuffer())!==f.source.sha256)bytesProblems.push('เนื้อไฟล์อ้างอิงกรณีตรวจ checksum หรือขนาดไม่ตรง');else await inspectAttachmentDocument(a,blob);}catch{bytesProblems.push('อ่านหรือตรวจเนื้อไฟล์อ้างอิงกรณีตรวจไม่ได้');}verifiedSources.set(key,bytesProblems);}problems.push(...bytesProblems);}
  staged.set(fid,{digest:contentDigest,sourceProblems:problems});
 }
 return projectTransaction('runEngineeringFixtures',pid,data,id,['admin','qs','checker','approver'],async(tx,p,u)=>{
  must(p.version===anchor.data()?.version,'ข้อมูลโครงการเปลี่ยนระหว่างเตรียมชุดตรวจ','aborted');
  const existing=await tx.get(recordRef(pid,'engineeringFixtureRuns',id));must(!existing.exists(),'รหัสผลตรวจซ้ำ ห้ามแก้ทับผลเดิม');
  const docs=await Promise.all(data.fixtureIds.map((fid:string)=>tx.get(recordRef(pid,'engineeringFixtures',fid)))),currentSpecDigest=await digestData(fixtureSpec(p.spec)),results=[];
  for(const doc of docs){must(doc.exists(),'ไม่พบกรณีตรวจ');const raw=decodeStorage(doc.data()) as EngineeringFixture&{contentDigest:string},{contentDigest,...body}=raw,f=fixtureSchema.parse(body),prepared=staged.get(doc.id);must(await digestData(f)===contentDigest&&prepared?.digest===contentDigest,'กรณีตรวจ checksum ไม่ตรงหรือเปลี่ยนระหว่างเตรียมชุดตรวจ');const result=evaluateFixture(f),sourceProblems=prepared.sourceProblems,specMatches=f.specDigest===currentSpecDigest;results.push({...result,fixtureDigest:contentDigest,specMatches,sourceProblems,pass:result.pass&&result.engineMatches&&specMatches&&!sourceProblems.length});}
  const run={id,createdAt:now(),createdBy:u.uid,specDigest:currentSpecDigest,engineVersion:calculationEngine(p.spec),results,pass:results.every(r=>r.pass),engineeringApproved:false,kind:'Numerical fixture comparison',scope:'User-entered expected values and tolerances; no engineering or construction approval'},digest=await digestData(run);budget({...run,digest});
  tx.set(recordRef(pid,'engineeringFixtureRuns',id),encode({...run,digest}));tx.update(projectRef(pid),{historyEpoch:id,engineeringFixtureEpoch:id});return {id,pass:run.pass,digest};
 });
}
