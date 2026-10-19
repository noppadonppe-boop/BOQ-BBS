import {z} from 'zod';
import {getDoc} from 'firebase/firestore';
import {ref,uploadBytes} from 'firebase/storage';
import {storage} from '../firebase';
import {engineeringFixturesEnabled} from '../engineeringFeature';
import {readCollectionPages} from '../collections';
import {inspectRelease} from '../releaseReview';
import {verifiedAttachment} from './sources';
import {digestData} from '../snapshots';
import {canonical} from '../../domain/canonical';
import {decodeStorage} from '../../domain/storageCodec';
import {engineeringApprovalSchema} from '../../domain/releaseReview';
import {fixtureSpec,fixtureSchema,evaluateFixture,fixtureFileProblems} from '../../domain/engineeringFixtures';
import {steelCoverage} from '../../domain/reinforcementCoverage';
import {sourceCurrent,generalSourceReview} from '../../domain/sourceRevisions';
import {indexedApprover} from '../../domain/code99Review';
import {bsEnabled,bsProfile} from '../../domain/bs8666';
import {calculationEngine} from '../../domain/version';
import type {Project,Attachment} from '../../domain/model';
import {actor,allow,must,now,projectRef,recordRef,projectTransaction,encode} from './common';
const idSchema=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),version=z.number().int().nonnegative();
async function replay(action:string,pid:string,input:Record<string,unknown>,id:string,roles:('admin'|'qs'|'checker'|'approver')[]){const old=await getDoc(recordRef(pid,'operations',id));return old.exists()?{value:await projectTransaction(action,pid,input,id,roles,async()=>{throw Error('Unexpected replay');})}:undefined;}
export async function approveEngineeringSpec(pid:string,input:Record<string,unknown>,id:string){
 const request=z.object({projectVersion:version,evidenceId:idSchema,runIds:z.array(idSchema).min(1).max(20),note:z.string().trim().min(1).max(2000),independentReferences:z.literal(true),aciEvidenceReviewed:z.literal(true)}).strict().parse(input);
 must(engineeringFixturesEnabled,'เปิดการเก็บกรณีตรวจหลังผู้ดูแลจัดสิทธิ์ ก่อนรับรองชุดกฎ');
 const repeated=await replay('approveEngineeringSpec',pid,input,id,['approver']);if(repeated)return repeated.value;
 const u=await actor(),ps=await getDoc(projectRef(pid));must(ps.exists(),'ไม่พบโครงการ');const p=decodeStorage(ps.data()) as Project;allow(p,u,['approver']);must(indexedApprover(p,u.uid),'ต้องเป็นผู้อนุมัติในทีมโครงการ');must(p.version===request.projectVersion,'โครงการเปลี่ยนแล้ว','aborted');
 const old=await getDoc(recordRef(pid,'operations',id));if(old.exists())return projectTransaction('approveEngineeringSpec',pid,input,id,['approver'],async()=>{throw Error('Unexpected replay');});
 must(bsEnabled(p.spec)&&p.spec.ruleVersion===bsProfile(p.spec).version,'ชุดกฎขั้นต่ำ/รุ่นตรวจไม่ตรงกับตัวคำนวณที่รองรับ');
 must(p.spec.aciEdition.trim()&&p.spec.engineer.trim()&&p.spec.ruleSource.trim()&&p.spec.fixtureReferences.trim(),'ระบุปีฉบับ ACI ผู้รับผิดชอบ ที่มาชุดกฎ และคำอธิบายชุดกรณีอ้างอิงก่อนเตรียมกรณีตรวจ');
 must(new Set(request.runIds).size===request.runIds.length,'ผลตรวจซ้ำ');
 const files=await readCollectionPages(pid,'attachments') as Attachment[],evidence=files.find(a=>a.id===request.evidenceId);
 must(evidence&&!evidence.memberId&&sourceCurrent(evidence)&&generalSourceReview(evidence).reviewed,'เลือกหลักฐานโครงการฉบับปัจจุบันที่ทบทวนแล้ว');
 const specDigest=await digestData(fixtureSpec(p.spec)),engineVersion=calculationEngine(p.spec),runs:{id:string;digest:string}[]=[],fixtures=new Map<string,{id:string;digest:string;sourceId:string;sourceSha256:string;sourceVersion:number}>(),categories=new Set<string>(),shapeCodes=new Set<string>(),sources=new Map<string,Attachment>();sources.set(evidence.id,evidence);
 let positive=0,negative=0;
 for(const rid of request.runIds){
  const rs=await getDoc(recordRef(pid,'engineeringFixtureRuns',rid));must(rs.exists(),'ไม่พบผลตรวจ');const raw=decodeStorage(rs.data()),{digest,...body}=raw;
  must(digest&&await digestData(body)===digest&&body.specDigest===specDigest&&body.engineVersion===engineVersion&&body.pass===true&&body.engineeringApproved===false,'ผลตรวจไม่ครบ ไม่ผ่าน หรือ Spec/รุ่นต่างกัน');
  must(Array.isArray(body.results)&&body.results.length>0&&body.results.length<=20,'ผลตรวจไม่มีกรณีอ้างอิง');
  for(const result of body.results){
   const fs=await getDoc(recordRef(pid,'engineeringFixtures',idSchema.parse(result.fixtureId)));must(fs.exists(),'ไม่พบกรณีอ้างอิง');const {contentDigest,...fixtureBody}=decodeStorage(fs.data()),f=fixtureSchema.parse(fixtureBody);
   must(contentDigest===result.fixtureDigest&&await digestData(f)===contentDigest&&f.specDigest===specDigest&&f.engineVersion===engineVersion,'ข้อมูลกรณีตรวจหรือ checksum เปลี่ยน');
   must(evaluateFixture(f).pass,'เทียบกรณีอ้างอิงซ้ำไม่ผ่าน');const source=files.find(a=>a.id===f.source.id);must(source&&sourceCurrent(source)&&!fixtureFileProblems(f.source,files).length,'เอกสารกรณีอ้างอิงไม่ใช่ฉบับปัจจุบัน');sources.set(source.id,source);fixtures.set(f.id,{id:f.id,digest:contentDigest,sourceId:source.id,sourceSha256:source.sha256!,sourceVersion:source.version||1});
   if(f.outcome==='valid'){must(steelCoverage(f.member,{project:{spec:f.spec},attachments:files}).complete,'กรณีบวกยังไม่มีขอบเขตเหล็กครบ');positive++;categories.add(f.member.category);for(const bar of f.member.bars)shapeCodes.add(bar.shapeCode.trim());}else negative++;
  }
  runs.push({id:rid,digest});
 }
 must(positive>0&&negative>0,'ต้องมีกรณีบวกและกรณีลบที่ตรงตามผลอ้างอิง');
 let bytes=0;for(const a of sources.values()){bytes+=a.size;must(bytes<=120*1024*1024,'แบ่งชุดหลักฐานเกิน120MiB');await verifiedAttachment(pid,a);}
 return projectTransaction('approveEngineeringSpec',pid,input,id,['approver'],async(tx,current,signer)=>{
  must(indexedApprover(current,signer.uid)&&current.version===p.version&&canonical(fixtureSpec(current.spec))===canonical(fixtureSpec(p.spec)),'สิทธิ์หรือ Spec เปลี่ยนระหว่างตรวจ','aborted');
  const docs=await Promise.all(runs.map(r=>tx.get(recordRef(pid,'engineeringFixtureRuns',r.id))));must(docs.every((d,i)=>d.data()?.digest===runs[i].digest),'ผลตรวจเปลี่ยนระหว่างรับรอง','aborted');
  const sourceDocs=await Promise.all([...sources.values()].map(a=>tx.get(recordRef(pid,'attachments',a.id))));must(sourceDocs.every((d,i)=>d.exists()&&d.data().version===[...sources.values()][i].version),'หลักฐานเปลี่ยนระหว่างรับรอง','aborted');
  const record=engineeringApprovalSchema.parse({format:'engineering-approval-1.0',id,projectId:pid,specDigest,engineVersion,actorUid:signer.uid,createdAt:now(),evidence:{id:evidence.id,version:evidence.version||1,sha256:evidence.sha256},runs,fixtures:[...fixtures.values()],categories:[...categories],shapeCodes:[...shapeCodes],note:request.note,aciReview:'Manual review of project evidence; not automatic ACI certification'});
  tx.update(projectRef(pid),{spec:{...current.spec,approved:true,evidenceFileId:evidence.id},version:current.version+1});return record;
 });
}
export async function prepareIssue(pid:string,input:Record<string,unknown>,id:string){
 const repeated=await replay('prepareIssue',pid,input,id,['admin','qs','checker','approver']);if(repeated)return repeated.value;
 const request=z.object({revisionId:idSchema,projectVersion:version}).strict().parse(input),u=await actor(),preflight=await inspectRelease(pid,request.revisionId);allow(preflight.p,u,['admin','qs','checker','approver']);must(preflight.p.version===request.projectVersion,'โครงการเปลี่ยนแล้ว เริ่มตรวจใหม่','aborted');
 const report=preflight.report,digest=await digestData(report),path=`projects/${pid}/snapshots/${digest}.json`,blob=new Blob([canonical(report)],{type:'application/json'});must(blob.size<=20*1024*1024,'แบ่ง Revision: ผลตรวจก่อนส่งงานเกิน20MiB');await uploadBytes(ref(storage,path),blob,{contentType:'application/json',customMetadata:{sha256:digest}});
 return projectTransaction('prepareIssue',pid,input,id,['admin','qs','checker','approver'],async(tx,p,signer)=>{
  const state=await tx.get(recordRef(pid,'revisionStates',request.revisionId));must(p.version===preflight.p.version&&state.data()?.status===preflight.state?.status,'ข้อมูลหรือสถานะเปลี่ยนระหว่างบันทึกผลตรวจ','aborted');
  tx.update(projectRef(pid),{version:p.version+1});return {id,projectId:pid,revisionId:request.revisionId,revisionNumber:report.revisionNumber,revisionDigest:report.revisionDigest,createdAt:report.checkedAt,actorUid:signer.uid,ready:report.ready,checkCount:report.checks.length,digest,snapshot:{path,name:'release-preflight-'+id+'.json',size:blob.size,sha256:digest,contentType:'application/json'}};
 });
}
export async function issueRevision(pid:string,input:Record<string,unknown>,id:string){
 const repeated=await replay('issue',pid,input,id,['approver']);if(repeated)return repeated.value;
 const request=z.object({revisionId:idSchema,projectVersion:version,revisionDigest:z.string().regex(/^[a-f0-9]{64}$/),note:z.string().trim().min(1).max(2000)}).strict().parse(input),u=await actor(),preflight=await inspectRelease(pid,request.revisionId);allow(preflight.p,u,['approver']);must(indexedApprover(preflight.p,u.uid),'ต้องเป็นผู้อนุมัติในทีมโครงการ');must(preflight.p.version===request.projectVersion&&preflight.r.digest===request.revisionDigest,'ข้อมูลหรือ Revision เปลี่ยนแล้ว','aborted');must(preflight.report.ready,'ยังออก Issued ไม่ได้:\n'+preflight.report.checks.map(c=>c.message).join('\n'));must(preflight.approval,'ไม่มีบันทึกรับรองชุดกฎ');
 return projectTransaction('issue',pid,input,id,['approver'],async(tx,p,signer)=>{
  const [revision,state]=await Promise.all([tx.get(recordRef(pid,'revisions',request.revisionId)),tx.get(recordRef(pid,'revisionStates',request.revisionId))]);
  must(indexedApprover(p,signer.uid)&&p.version===preflight.p.version&&revision.data()?.digest===request.revisionDigest&&state.data()?.status==='Frozen','ข้อมูล สิทธิ์ หรือสถานะเปลี่ยนแล้ว','aborted');
  const issuedAt=now(),ruleSetDigest=preflight.approval!.specDigest;
  tx.update(state.ref,{status:'Issued',issuedAt,issuedBy:signer.uid,ruleSetDigest,approvalId:preflight.approval!.id,issuedEventId:id});tx.set(recordRef(pid,'revisionEvents',id),{id,revisionId:request.revisionId,revisionDigest:request.revisionDigest,engineVersion:preflight.r.engineVersion,action:'Issued',createdAt:issuedAt,createdBy:signer.uid,ruleSetDigest,approvalId:preflight.approval!.id,note:request.note});tx.update(projectRef(pid),{version:p.version+1});return {revisionId:request.revisionId,revisionDigest:request.revisionDigest,engineVersion:preflight.r.engineVersion,status:'Issued',issuedAt,ruleSetDigest,approvalId:preflight.approval!.id};
 });
}
