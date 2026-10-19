import {issuedReferenceSchema,issuedReference} from '../domain/publication';
import {getDoc,getDocsFromServer,collection,query,where,orderBy,documentId,limit,startAfter,type QueryDocumentSnapshot,type DocumentData} from 'firebase/firestore';
import {db,storage} from './firebase';
import {getBlob,ref} from 'firebase/storage';
import {recordRef,projectRef,must} from './direct/common';
import {decodeStorage} from '../domain/storageCodec';
import {loadSnapshot,digestData,sha256} from './snapshots';
import {readCollectionPages} from './collections';
import {fixtureSpec,fixtureSchema,evaluateFixture,fixtureFileProblems} from '../domain/engineeringFixtures';
import {indexedApprover} from '../domain/code99Review';
import {engineeringApprovalSchema,releaseReportSchema,releaseChecks,type EngineeringApproval,type ReleaseReport} from '../domain/releaseReview';
import {qualifiedCode99Reviews} from './code99Reviews';
import {verifiedAttachment} from './direct/sources';
import {calculationEngine} from '../domain/version';
import {selectBundle} from '../domain/exportScope';
import type {Project,Revision,RevisionState,Attachment,SnapshotBundle} from '../domain/model';

export async function readReleaseOperations(pid:string,action:string){
 const records:any[]=[];let cursor:QueryDocumentSnapshot<DocumentData>|undefined;
 for(;;){const page=await getDocsFromServer(query(collection(db,'projects',pid,'operations'),where('action','==',action),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(50)));records.push(...page.docs.map(s=>decodeStorage(s.data())));if(page.size<50)break;cursor=page.docs.at(-1);}
 return records;
}
export async function currentEngineeringApproval(p:Project,files:Attachment[]){
 if(!p.spec.approved)return undefined;
 const digest=await digestData(fixtureSpec(p.spec)),ops=await readReleaseOperations(p.id,'approveEngineeringSpec');
 for(const op of [...ops].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))){
  const parsed=engineeringApprovalSchema.safeParse(op.result);if(!parsed.success)continue;const r=parsed.data,a=files.find(a=>a.id===r.evidence.id);
  if(op.id!==r.id||op.uid!==r.actorUid||r.projectId!==p.id||!indexedApprover(p,r.actorUid)||r.specDigest!==digest||r.engineVersion!==calculationEngine(p.spec)||!a||a.id!==p.spec.evidenceFileId||a.sourceStatus==='Superseded'||a.sha256!==r.evidence.sha256||(a.version||1)!==r.evidence.version)continue;
  let valid=true;const verified=new Map<string,Attachment>();verified.set(a.id,a);
  for(const run of r.runs){const s=await getDoc(recordRef(p.id,'engineeringFixtureRuns',run.id));if(!s.exists()){valid=false;break;}const {digest,...body}=decodeStorage(s.data());if(digest!==run.digest||await digestData(body)!==digest||body.pass!==true||body.specDigest!==r.specDigest){valid=false;break;}}
  if(!valid)continue;
  for(const item of r.fixtures){const s=await getDoc(recordRef(p.id,'engineeringFixtures',item.id)),file=files.find(a=>a.id===item.sourceId);if(!s.exists()||!file||file.sourceStatus==='Superseded'||file.sha256!==item.sourceSha256||(file.version||1)!==item.sourceVersion){valid=false;break;}const {contentDigest,...body}=decodeStorage(s.data()),parsedFixture=fixtureSchema.safeParse(body);if(!parsedFixture.success||contentDigest!==item.digest||await digestData(parsedFixture.data)!==item.digest||parsedFixture.data.specDigest!==r.specDigest||!evaluateFixture(parsedFixture.data).pass||fixtureFileProblems(parsedFixture.data.source,files).length){valid=false;break;}verified.set(file.id,file);}
  if(!valid)continue;let bytes=0;for(const file of verified.values()){bytes+=file.size;must(bytes<=120*1024*1024,'หลักฐานชุดกฎเกิน120MiB');await verifiedAttachment(p.id,file);}return r;
 }
 return undefined;
}
export async function inspectRelease(pid:string,revisionId:string){
 const [ps,rs,ss,files]=await Promise.all([getDoc(projectRef(pid)),getDoc(recordRef(pid,'revisions',revisionId)),getDoc(recordRef(pid,'revisionStates',revisionId)),readCollectionPages(pid,'attachments')]);
 must(ps.exists()&&rs.exists(),'ไม่พบโครงการหรือ Revision','not-found');const p=decodeStorage(ps.data()) as Project,r=decodeStorage(rs.data()) as Revision,state=ss.exists()?decodeStorage(ss.data()) as RevisionState:undefined,b=await loadSnapshot(r),attachments=files as Attachment[];
 let approval:EngineeringApproval|undefined,approvalError='';try{approval=await currentEngineeringApproval(p,attachments);}catch(e){approvalError=(e as Error).message;}
 let reviews:Awaited<ReturnType<typeof qualifiedCode99Reviews>>=[],reviewError='';try{reviews=await qualifiedCode99Reviews({...p,spec:b.project.spec},b.members,attachments,undefined,true);}catch(e){reviewError=(e as Error).message;}
 const checks=releaseChecks(b,p,r,state,attachments,reviews,approval),sourceChecks:ReleaseReport['sourceChecks']=[];
 if(reviewError)checks.push({group:'member',code:'code99-evidence',message:reviewError});
 if(approvalError)checks.push({group:'engineering',code:'approval-file',message:approvalError});
 let bytes=0;for(const a of b.attachments.filter(a=>a.sourceStatus!=='Superseded')){
  bytes+=a.size;let message='';try{if(bytes>120*1024*1024)throw Error('แบ่งชุดตรวจ: เอกสารรวมเกิน120MiB');const actual=await verifiedAttachment(pid,a);if(actual.sha256!==a.sha256)throw Error('checksum เอกสารใน Revision ไม่ตรง');}catch(e){message=(e as Error).message;checks.push({group:'source',code:'bytes',message:a.name+': '+message,...(a.memberId?{memberId:a.memberId}:{}),sourceId:a.id});}
  sourceChecks.push({id:a.id,sha256:a.sha256||'',version:a.version||1,verified:!message,...(message?{message}:{})});
 }
 const after=await getDoc(projectRef(pid));must(after.data()?.version===p.version,'ข้อมูลโครงการเปลี่ยนระหว่างตรวจ เริ่มตรวจใหม่','aborted');
 const report:ReleaseReport={format:'release-preflight-1.0',projectId:pid,projectVersion:p.version,revisionId:r.id,revisionNumber:r.number,revisionDigest:r.digest,checkedAt:new Date().toISOString(),engineVersion:r.engineVersion,ready:!checks.length,memberCount:b.members.length,markCount:b.members.reduce((n,m)=>n+m.bars.length,0),checks,sourceChecks,...(approval?{approvalId:approval.id}:{})};return {report,p,r,state,b,approval};
}
export async function readSavedReleaseReport(record:{projectId:string;revisionId:string;digest:string;snapshot:{path:string;size:number;sha256:string}}){
 must(record.snapshot.path===`projects/${record.projectId}/snapshots/${record.digest}.json`&&record.snapshot.size<=20*1024*1024,'ผลตรวจอ้างอิงไฟล์ผิดโครงการหรือเกินขนาด');const blob=await getBlob(ref(storage,record.snapshot.path));must(blob.size===record.snapshot.size&&await sha256(await blob.arrayBuffer())===record.digest&&record.digest===record.snapshot.sha256,'ผลตรวจ checksum ไม่ตรง');const report=releaseReportSchema.parse(JSON.parse(await blob.text()));must(report.projectId===record.projectId&&report.revisionId===record.revisionId,'ผลตรวจเป็นของโครงการหรือ Revision อื่น');return report;
}
// Reprinting an Issued/Superseded document uses its immutable historical issue
// and approval records. Current role changes do not rewrite the old document.
export async function verifyIssuedReference(pid:string,r:Revision,state:RevisionState,b:SnapshotBundle){
 must(state.issuedEventId&&state.approvalId&&state.issuedBy&&state.issuedAt&&state.ruleSetDigest,'Issued ไม่มีหลักฐานการออกฉบับ ดาวน์โหลดไฟล์เดิมหรือให้ผู้รับผิดชอบตรวจทะเบียน');
 const [operation,event,approval]=await Promise.all([getDoc(recordRef(pid,'operations',state.issuedEventId)),getDoc(recordRef(pid,'revisionEvents',state.issuedEventId)),getDoc(recordRef(pid,'operations',state.approvalId))]);
 must(operation.exists()&&event.exists()&&approval.exists(),'ไม่พบหลักฐาน Issued');const op=decodeStorage(operation.data()),ev=decodeStorage(event.data()),ap=decodeStorage(approval.data()),accepted=engineeringApprovalSchema.parse(ap.result);
 must(op.id===state.issuedEventId&&op.uid===state.issuedBy&&op.action==='issue'&&op.result?.revisionId===r.id&&op.result?.revisionDigest===r.digest&&op.result?.engineVersion===b.engineVersion&&op.result?.status==='Issued'&&op.result?.approvalId===state.approvalId&&op.result?.ruleSetDigest===state.ruleSetDigest&&op.result?.issuedAt===state.issuedAt,'รายการ Issued ไม่ตรงทะเบียน');
 must(ev.createdBy===state.issuedBy&&ev.revisionId===r.id&&ev.revisionDigest===r.digest&&ev.engineVersion===b.engineVersion&&ev.action==='Issued'&&ev.approvalId===state.approvalId&&ev.ruleSetDigest===state.ruleSetDigest&&ev.createdAt===state.issuedAt,'เหตุการณ์ Issued ไม่ตรงทะเบียน');
 must(ap.id===state.approvalId&&ap.uid===accepted.actorUid&&ap.action==='approveEngineeringSpec'&&accepted.projectId===pid&&accepted.engineVersion===b.engineVersion&&accepted.specDigest===state.ruleSetDigest&&await digestData(fixtureSpec(b.project.spec))===state.ruleSetDigest,'ชุดกฎที่ออกฉบับไม่ตรง Snapshot');
 return issuedReferenceSchema.parse({format:'issued-reference-1.0',projectId:pid,revisionId:r.id,revisionDigest:r.digest,issuedEventId:state.issuedEventId,issuedAt:state.issuedAt,issuedBy:state.issuedBy,ruleSetDigest:state.ruleSetDigest,approvalId:state.approvalId,engineVersion:b.engineVersion});
}
export async function verifyPublishedBundle(b:SnapshotBundle){const reference=issuedReference(b);if(!reference)return;const [r,s]=await Promise.all([getDoc(recordRef(b.project.id,'revisions',reference.revisionId)),getDoc(recordRef(b.project.id,'revisionStates',reference.revisionId))]);must(r.exists()&&s.exists(),'ไม่พบทะเบียนฉบับที่เผยแพร่');const verified=await verifyIssuedReference(b.project.id,decodeStorage(r.data()),decodeStorage(s.data()),b);const original=await loadSnapshot(decodeStorage(r.data()));const expected=selectBundle({...original,status:b.status,issuedReference:reference},b.scope||{});must(await digestData(expected)===await digestData(b),'ข้อมูลส่งออกไม่ตรงขอบเขตของ Revision ที่ออกฉบับ');must(await digestData(verified)===await digestData(reference),'หลักฐานบนไฟล์ไม่ตรงทะเบียนออกฉบับ');if(b.status==='Issued')must(s.data().status==='Issued','ฉบับถูกแทนที่แล้ว สร้างไฟล์จากสถานะปัจจุบัน');}

