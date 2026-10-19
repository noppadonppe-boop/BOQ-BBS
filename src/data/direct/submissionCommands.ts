import {verifyIssuedReference,verifyPublishedBundle} from '../releaseReview';
import {issuedReference} from '../../domain/publication';
import {getDoc} from 'firebase/firestore';
import {getBlob,getMetadata,ref} from 'firebase/storage';
import {storage} from '../firebase';
import {loadSnapshot,digestData,sha256} from '../snapshots';
import {loadSubmission} from '../submissions';
import {ExportJob,Revision,RevisionState,SnapshotFile} from '../../domain/model';
import {SubmissionJob,SubmissionManifest,SubmissionDocument,SUBMISSION_LIMITS,validateSubmissionInput,submissionReferenceKey,submissionDocumentKey,submissionZipName,validatePackageDrawingReferences,submissionRequiredState,submissionStatusLabel,validateSubmissionPublication} from '../../domain/submissions';
import {scopeLabel} from '../../domain/exportScope';
import {drawingReferences} from '../../domain/drawingStandard';
import {decodeStorage} from '../../domain/storageCodec';
import {actor,allow,clean,encode,must,now,projectRef,recordRef,projectTransaction} from './common';
import {writeManifest} from './manifests';
import {verifySubmissionPublicationRecord} from '../submissionPublication';

export async function prepareDirectSubmission(pid:string,data:Record<string,any>,id:string){
 const u=await actor(),ps=await getDoc(projectRef(pid));must(ps.exists(),'ไม่พบโครงการ');allow(ps.data() as any,u,['admin','qs']);
 const existing=await getDoc(recordRef(pid,'operations',id));if(existing.exists())return projectTransaction('prepareSubmission',pid,data,id,['admin','qs'],async()=>{throw Error('Unexpected replay');});
 const input=validateSubmissionInput(data),rr=recordRef(pid,'revisions',input.revisionId),rs=await getDoc(rr),ss=await getDoc(recordRef(pid,'revisionStates',input.revisionId));const requiredState=submissionRequiredState(input.purpose);must(rs.exists()&&ss.data()?.status===requiredState,'เลือก '+requiredState+' revision ที่ยังไม่ถูกแทนที่');const revision=decodeStorage(rs.data()) as Revision,bundle=await loadSnapshot(revision),documents:SubmissionDocument[]=[];const publication=requiredState==='Issued'?await verifyIssuedReference(pid,revision,decodeStorage(ss.data()),bundle):undefined;let sourceBytes=0;
 for(const item of input.items){
  const js=await getDoc(recordRef(pid,'exportJobs',item.exportJobId));must(js.exists(),'ไม่พบไฟล์ส่งออก');const j=decodeStorage(js.data()) as ExportJob;
  must(j.status==='Complete'&&j.file&&j.kind&&j.size&&j.revisionId===revision.id&&j.revisionDigest===revision.digest,'เลือกไฟล์ที่เสร็จจาก Frozen revision เดียวกัน');
  const snapshot=await loadSnapshot(j);if(publication){await verifyPublishedBundle(snapshot);must(snapshot.status==='Issued'&&JSON.stringify(issuedReference(snapshot))===JSON.stringify(publication),'เลือกไฟล์ที่สร้างหลังออก Issued และตรงฉบับ');}else must(snapshot.status==='Frozen'&&!snapshot.issuedReference,'เลือกไฟล์ Frozen สำหรับชุด Draft');const blob=await getBlob(ref(storage,j.file.path));must(blob.size===j.file.size&&await sha256(await blob.arrayBuffer())===j.file.sha256,'ไฟล์ต้นทาง checksum ไม่ตรง');sourceBytes+=blob.size;must(sourceBytes<=SUBMISSION_LIMITS.sourceBytes,'ไฟล์ต้นทางรวมเกิน 40 MiB');
  const d:SubmissionDocument={...item,kind:j.kind,size:j.size,drawingLayout:j.drawingLayout,scope:snapshot.scope||{},scopeLabel:scopeLabel(snapshot.scope,snapshot.members),snapshotDigest:j.digest,file:j.file,zipKey:submissionDocumentKey(documents.length,j.file.name),...(publication?{issuedReference:publication}:{})};
  if(j.kind==='drawing'&&snapshot.project.drawingProfile)d.drawingReferences=drawingReferences(snapshot,j.drawingLayout as any);
  if(j.file.contentType==='application/pdf'){const {PDFDocument}=await import('pdf-lib'),pdf=await PDFDocument.load(await blob.arrayBuffer()),dims={A3:[297,420],A1:[594,841],A4:[210,297]}[j.size];must(pdf.getPages().every(page=>{const actual=[page.getWidth(),page.getHeight()].sort((a,b)=>a-b);return actual.every((n,i)=>Math.abs(n*25.4/72-dims[i])<1);}), 'ขนาดกระดาษจริงไม่ตรงทะเบียนส่งออก');d.pages=pdf.getPageCount();}
  documents.push(d);
 }
 validatePackageDrawingReferences(documents.flatMap(d=>d.drawingReferences||[]));
 const project=bundle.project,manifest:SubmissionManifest=clean({schemaVersion:publication?2:1,id,projectId:pid,project:{code:project.code,name:project.name,owner:project.owner,location:project.location,...project.titleBlock,...(project.drawingProfile?{drawingProfile:project.drawingProfile}:{})},number:input.number,recipient:input.recipient,purpose:input.purpose,note:input.note,status:publication?'Issued':'Draft',...(publication?{issuedReference:publication}:{}),revisionId:revision.id,revisionNumber:revision.number,revisionDigest:revision.digest,sourceVersion:revision.sourceVersion,createdAt:now(),createdBy:u.uid,documents}),file=await writeManifest(pid,'submission-manifests',manifest,SUBMISSION_LIMITS.manifestBytes),numberKey=await digestData(submissionReferenceKey(input.number));
 return projectTransaction('prepareSubmission',pid,data,id,['admin','qs'],async(tx,p,actor)=>{
  const state=await tx.get(recordRef(pid,'revisionStates',revision.id)),nr=recordRef(pid,'submissionNumbers',numberKey),reservation=await tx.get(nr);must(state.data()?.status===requiredState&&(!publication||state.data()?.issuedEventId===publication.issuedEventId),'Revision หรือหลักฐานถูกเปลี่ยนระหว่างเตรียมชุด');must(!reservation.exists(),'เลขใบส่งเอกสารนี้ถูกใช้แล้ว');
  must(actor.uid===u.uid,'ผู้ใช้เปลี่ยนระหว่างเตรียมชุด','aborted');const job:SubmissionJob={id,number:input.number,revisionId:revision.id,revisionNumber:revision.number,revisionDigest:revision.digest,createdAt:manifest.createdAt,createdBy:actor.uid,status:'Prepared',digest:file.sha256,manifest:file,documentCount:documents.length,sourceBytes,purpose:input.purpose,recipient:input.recipient};
  tx.set(recordRef(pid,'submissionJobs',id),encode(job));tx.set(nr,{id:numberKey,number:input.number,jobId:id,createdBy:actor.uid});tx.update(projectRef(pid),{historyEpoch:id});return job;
 });
}
export async function directSubmission(action:string,pid:string,data:Record<string,any>,id:string){
 const jr=recordRef(pid,'submissionJobs',data.jobId),js=await getDoc(jr);must(js.exists(),'ไม่พบชุดส่งตรวจ');const initial=decodeStorage(js.data()) as SubmissionJob,manifest=await loadSubmission(initial);validateSubmissionPublication(manifest);const requiredState=submissionRequiredState(manifest.purpose);let file:SnapshotFile|undefined;
 if(action!=='failSubmission')await verifySubmissionPublicationRecord(pid,initial,manifest);
 if(action==='finishSubmission'){
  must(data.path===`projects/${pid}/submissions/${initial.id}/${initial.attempt}/${submissionZipName(manifest)}`,'ไฟล์ไม่ตรงชุดส่งตรวจ');const sr=ref(storage,data.path),meta=await getMetadata(sr),blob=await getBlob(sr);must(blob.size<SUBMISSION_LIMITS.zipBytes&&meta.contentType==='application/zip'&&meta.customMetadata?.digest===initial.digest&&await sha256(await blob.arrayBuffer())===data.sha256,'ZIP checksum หรือข้อมูลอ้างอิงไม่ตรง');
  const {default:JSZip}=await import('jszip'),zip=await JSZip.loadAsync(blob),entry=zip.file('manifest.json');must(entry&&await digestData(JSON.parse(await entry.async('string')))===initial.digest,'Manifest ภายใน ZIP ไม่ตรงชุด');must(zip.file('transmittal.pdf')&&zip.file('document-register.xlsx'),'ไม่มีใบส่งหรือทะเบียนเอกสาร');
  const cover=await zip.file('transmittal.pdf')!.async('arraybuffer'),{PDFDocument}=await import('pdf-lib'),pdf=await PDFDocument.load(cover);must(cover.byteLength<=SUBMISSION_LIMITS.coverBytes&&pdf.getPageCount()<=SUBMISSION_LIMITS.coverPages&&pdf.getSubject()===`FORM ${manifest.status==='Issued'?'ISSUED':'DRAFT'} SUBMISSION ${initial.digest}`&&pdf.getPages().every(page=>Math.abs(page.getWidth()*25.4/72-210)<1&&Math.abs(page.getHeight()*25.4/72-297)<1),'ใบส่งเอกสารไม่ตรงชุดหรือกระดาษ A4');
  const register=await zip.file('document-register.xlsx')!.async('arraybuffer');must(register.byteLength<=2*1024*1024,'ทะเบียนเอกสารเกิน 2 MiB');const {default:ExcelJS}=await import('exceljs'),workbook=new ExcelJS.Workbook();await workbook.xlsx.load(register as any);const sheet=workbook.getWorksheet('Document Register'),basis=workbook.getWorksheet('Package Basis');must(sheet&&basis&&sheet.rowCount===manifest.documents.length+3&&basis.getCell('B3').value===manifest.number&&basis.getCell('B7').value===manifest.revisionDigest&&basis.getCell('B8').value===initial.digest&&basis.getCell('B2').value===submissionStatusLabel(manifest),'ข้อมูลอ้างอิงทะเบียนเอกสารไม่ตรง Manifest');
  manifest.documents.forEach((d,i)=>{const expected=[i+1,d.reference,d.title,d.kind,d.size,d.pages||'',manifest.revisionNumber,d.scopeLabel,d.file.name,d.file.sha256,d.exportJobId,d.snapshotDigest,d.zipKey];must(expected.every((v,c)=>sheet!.getCell(i+4,c+1).value===v),'แถวทะเบียนไม่ตรงไฟล์ในชุด');});
  const expected=new Set(['manifest.json','transmittal.pdf','document-register.xlsx',...manifest.documents.map(d=>d.zipKey)]);must(Object.values(zip.files).filter(f=>!f.dir).every(f=>expected.has(f.name)),'ZIP มีไฟล์นอกทะเบียน');
  for(const d of manifest.documents){const f=zip.file(d.zipKey);must(f,'ไฟล์ในทะเบียนไม่ครบ');const bytes=await f.async('arraybuffer');must(bytes.byteLength===d.file.size&&await sha256(bytes)===d.file.sha256,'ไฟล์ในชุด checksum ไม่ตรง');}
  file={path:data.path,name:submissionZipName(manifest),size:blob.size,sha256:data.sha256,contentType:'application/zip'};
 }
 return projectTransaction(action,pid,data,id,['admin','qs'],async(tx,p,u)=>{
  const s=await tx.get(jr),state=await tx.get(recordRef(pid,'revisionStates',initial.revisionId));must(s.exists(),'ไม่พบชุด');const j=decodeStorage(s.data()) as SubmissionJob;must(j.createdBy===u.uid,'ไม่มีสิทธิ์ในชุดของบัญชีอื่น','permission-denied');
  must(j.digest===initial.digest&&j.manifest.path===initial.manifest.path&&j.revisionId===initial.revisionId&&j.purpose===initial.purpose,'ทะเบียนชุดเปลี่ยนระหว่างตรวจ','aborted');
  if(action!=='failSubmission')must(state.data()?.status===requiredState&&(!manifest.issuedReference||state.data()?.issuedEventId===manifest.issuedReference.issuedEventId),'Revision ถูกเปลี่ยนแล้ว สร้างหรือทำต่อชุดไม่ได้');
  if(action==='startSubmission'){must(j.status!=='Complete','ชุดนี้เสร็จแล้ว ให้ดาวน์โหลดจากประวัติ');must(j.status!=='Generating'||(j.leaseUntil||0)<Date.now(),'มีคำขออื่นกำลังสร้างชุด','aborted');const attempt=(j.attempt||0)+1,name=submissionZipName(manifest),lease={attempt,leaseToken:crypto.randomUUID(),name,path:`projects/${pid}/submissions/${j.id}/${attempt}/${name}`};tx.update(jr,{...lease,status:'Generating',leaseUntil:Date.now()+300000});tx.update(projectRef(pid),{historyEpoch:id});return {...lease,digest:j.digest};}
  must(j.status==='Generating'&&j.attempt===data.attempt&&j.leaseToken===data.leaseToken,'ชุดส่งตรวจเปลี่ยนแล้ว','aborted');tx.update(jr,encode(action==='finishSubmission'?{status:'Complete',file,completedAt:now(),leaseUntil:0}:{status:'Failed',error:String(data.error||'').slice(0,1000),leaseUntil:0}));tx.update(projectRef(pid),{historyEpoch:id});return {ok:true};
 });
}
export async function supersedeDirectRevision(pid:string,data:Record<string,any>,id:string){
 return projectTransaction('supersedeRevision',pid,data,id,['approver'],async(tx,p,u)=>{
  must(data.revisionId!==data.replacementId,'ต้องเลือก Revision ใหม่');const [old,os,replacement,ns]=await Promise.all([tx.get(recordRef(pid,'revisions',data.revisionId)),tx.get(recordRef(pid,'revisionStates',data.revisionId)),tx.get(recordRef(pid,'revisions',data.replacementId)),tx.get(recordRef(pid,'revisionStates',data.replacementId))]);
  must(old.exists()&&os.exists()&&replacement.exists()&&ns.exists(),'ไม่พบ Revision');must(os.data().status!=='Superseded'&&replacement.data().createdAt>=old.data().createdAt&&ns.data().status===(os.data().status==='Issued'?'Issued':'Frozen'),'Revision ใหม่ยังไม่พร้อมแทนฉบับเดิม');
  tx.update(os.ref,{status:'Superseded',supersededBy:data.replacementId});tx.set(recordRef(pid,'revisionEvents',id),{id,revisionId:data.revisionId,replacementId:data.replacementId,action:'Superseded',createdAt:now(),createdBy:u.uid});tx.update(projectRef(pid),{historyEpoch:id});return {ok:true};
 });
}
