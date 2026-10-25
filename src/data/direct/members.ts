import {resetStaleQuantityBasis,quantityBasisState} from '../../domain/quantityBasis';
import {qualifiedCode99Reviews} from '../code99Reviews';
import {declaredNoRebar} from '../../domain/reinforcementScopeSchema';
import {sourceScheduleFileProblems,sourceScheduleReviewProblems} from '../../domain/sourceSchedule';
import {resetStaleNoRebar} from '../../domain/reinforcementCoverage';
import {collection,getDocs,query,where,limit,getDoc,orderBy} from 'firebase/firestore';
import {db} from '../firebase';
import {memberSchema,Member,Attachment,Project} from '../../domain/model';
import {validateMember,minimumProblems,schedule} from '../../domain/engine';
import {sourceReviewProblems,generalSourceProblems} from '../../domain/sourceRevisions';
import {drawingNumberKey,drawingRunText,type DrawingSetup} from '../../domain/drawingStandard';
import {numberedSetup} from '../../domain/drawingNumbers';
import {nextReview,statusLabel} from '../../domain/memberReview';
import {displayName} from '../../domain/auth';
import {canonical} from '../../domain/canonical';
import {occurrenceLocProblems} from '../../domain/locations';
import {decodeStorage} from '../../domain/storageCodec';
import {projectTransaction,recordRef,projectRef,encode,must,now} from './common';

// drawing number / title are sheet labels, not member data: changing them keeps confirmations
const semantics=(m:Member)=>canonical({...memberSchema.parse(m),drawingSetup:null,review:null,version:0,inputEpoch:'',status:'Draft',updatedAt:'',bars:m.bars.map(b=>({...b,placementConfirmed:false,bsDimensionsConfirmed:false}))});
export async function directMember(action:string,pid:string,data:Record<string,any>,requestId:string){
 if(action==='saveMember'){
  const operation=await getDoc(recordRef(pid,'operations',requestId));if(operation.exists())return projectTransaction(action,pid,data,requestId,['admin','qs'],async()=>{throw Error('Unexpected replay');});
  const m=memberSchema.parse(data.member),anchor=await getDoc(projectRef(pid)),version=anchor.data()?.version;
  const duplicate=await getDocs(query(collection(db,'projects',pid,'members'),where('code','==',m.code),limit(2)));
  must(!duplicate.docs.some(s=>s.id!==m.id),'Member no. ซ้ำในโครงการ','invalid-argument');
  // automatic BBS drawing number: next run for members without a number, run / rev recomposed with the current prefix / suffix
  const anchorProject=decodeStorage(anchor.data()||{}) as Project;
  if(anchorProject.titleBlock&&!m.drawingSetup?.number&&!m.drawingSetup?.run){const last=await getDocs(query(collection(db,'projects',pid,'members'),orderBy('drawingSetup.run','desc'),limit(1)));m.drawingSetup={title:'',...m.drawingSetup,run:((decodeStorage(last.docs[0]?.data()||{}) as Member).drawingSetup?.run||0)+1} as DrawingSetup;}
  if(anchorProject.titleBlock&&m.drawingSetup?.run){m.drawingSetup=numberedSetup(anchorProject,m.drawingSetup,m.drawingSetup.run);const rs=await getDocs(query(collection(db,'projects',pid,'members'),where('drawingSetup.run','==',m.drawingSetup.run),limit(2)));must(!rs.docs.some(s=>s.id!==m.id),`Run no. ${drawingRunText(m.drawingSetup.run!)} ซ้ำในโครงการ`,'invalid-argument');}
  if(m.drawingSetup){m.drawingSetup.numberKey=drawingNumberKey(m.drawingSetup.number);if(m.drawingSetup.numberKey){const ds=await getDocs(query(collection(db,'projects',pid,'members'),where('drawingSetup.numberKey','==',m.drawingSetup.numberKey),limit(2)));must(!ds.docs.some(s=>s.id!==m.id),'เลขแบบ BBS ซ้ำในโครงการ','invalid-argument');}}
  must(new TextEncoder().encode(JSON.stringify(encode(m))).length<700000,'แบ่งสมาชิก: พิกัดเหล็กเกินขนาดเอกสาร 700 KB');
  return projectTransaction(action,pid,data,requestId,['admin','qs'],async(tx,p,u)=>{
   if(data.expectedVersion!==undefined)must(Number.isSafeInteger(data.expectedVersion)&&data.expectedVersion===p.version,'รุ่นโครงการเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนบันทึก','aborted');
   must(p.version===version,'ข้อมูลโครงการเปลี่ยนแล้ว กรุณาลองบันทึกใหม่','aborted');
   const r=recordRef(pid,'members',m.id),s=await tx.get(r),old=s.exists()?decodeStorage(s.data()) as Member:undefined;
   must((old?.version||0)===m.version,'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก','aborted');
   // WBS links: only rows whose link is new or changed are checked (links kept from before stay valid when nodes archive)
   const locProblems=occurrenceLocProblems(p.locations,m.occurrences.map(o=>{const was=old?.occurrences.find(x=>x.id===o.id);return was&&canonical(was.loc||null)===canonical(o.loc||null)?{...o,loc:undefined}:o;}));must(!locProblems.length,locProblems.slice(0,3).join(' · '),'invalid-argument');
   must(!old?.quantityBasis||!!m.quantityBasis,'ที่มาข้อมูลปริมาณที่บันทึกแล้วลบไม่ได้ ให้ระบุเป็นค่าชั่วคราว','invalid-argument');
   must(canonical(old?.copySource||null)===canonical(m.copySource||null),'ที่มาของสมาชิกเปลี่ยนไม่ได้ ใช้คำสั่งทำสำเนาเพื่อสร้างที่มาใหม่','invalid-argument');
   if(m.sourceSchedule){const ss=await tx.get(recordRef(pid,'attachments',m.sourceSchedule.attachmentId)),files=ss.exists()?[decodeStorage(ss.data()) as Attachment]:[];const problems=sourceScheduleFileProblems(m,files);must(!problems.length,problems.join(' · '),'invalid-argument');}
   const errors=validateMember(m,p.spec);must(!errors.length,errors.join('\n'),'invalid-argument');
   const changed=!old||semantics(old)!==semantics(m);
   const sourceChanged=!!old&&canonical([old.sourceSchedule])!==canonical([m.sourceSchedule]);
   const geometryChanged=!!old&&canonical([old.x,old.y,old.z,old.cover,old.geometry,old.prismGeometry,old.pedestal,old.placementContext,old.shapeModel?.parts||null])!==canonical([m.x,m.y,m.z,m.cover,m.geometry,m.prismGeometry,m.pedestal,m.placementContext,m.shapeModel?.parts||null]);
   const next={...resetStaleQuantityBasis(old,resetStaleNoRebar(old,m)),status:'Draft',version:m.version+1,inputEpoch:changed||!old?.inputEpoch?requestId:old.inputEpoch,updatedAt:now(),bars:m.bars.map(b=>{
    const prior=old?.bars.find(x=>x.id===b.id),barGeometry=(v:typeof b)=>canonical({...v,placementConfirmed:false,bsDimensionsConfirmed:false,note:'',scheduleRevisionLetter:'',count:0}),dimensionsChanged=geometryChanged||sourceChanged||!!prior&&barGeometry(prior)!==barGeometry(b);
    return {...b,placementConfirmed:changed?false:b.placementConfirmed,...(dimensionsChanged?{bsDimensionsConfirmed:false}:{})};
   })};
   // review trail is server-side: the saver becomes "drawn"; an edit of a Checked / IFC member returns it to Draft and is logged
   const at=now(),logged=!old||changed||old.status!=='Draft',review=logged?nextReview(old?.review,{action:old?'Edited':'Created',from:old?.status||'',to:'Draft',actor:{uid:u.uid,name:displayName(u)},at,note:typeof data.note==='string'?data.note:''}):old?.review;
   tx.set(r,encode({...next,...(review?{review}:{})}));tx.update(projectRef(pid),{version:p.version+1});return {version:next.version};
  });
 }
 if(action==='deleteMember')return projectTransaction(action,pid,data,requestId,['admin','qs'],async(tx,p)=>{const r=recordRef(pid,'members',data.memberId),s=await tx.get(r);must(s.exists()&&s.data().version===data.version,'ข้อมูลเปลี่ยนแล้ว','aborted');tx.delete(r);tx.update(projectRef(pid),{version:p.version+1});return {ok:true};});
 const status=data.status;must(['Draft','Checked','ApprovedForIssue'].includes(status),'สถานะไม่ถูกต้อง','invalid-argument');
 // Perform queries and file verification before taking transaction locks.
 // All application review/source edits bump the parent version, which is checked
 // again with the member version inside the transaction to reject concurrent edits.
 const anchor=await getDoc(projectRef(pid));must(anchor.exists(),'ไม่พบโครงการ','not-found');const before=decodeStorage(anchor.data()) as Project;
 if(status!=='Draft'){
  const [memberDoc,sources]=await Promise.all([getDoc(recordRef(pid,'members',data.memberId)),getDocs(collection(db,'projects',pid,'attachments')).then(s=>s.docs.map(s=>decodeStorage(s.data()) as Attachment))]);
  const m=memberDoc.exists()?decodeStorage(memberDoc.data()) as Member:undefined;must(m&&m.version===data.version,'ข้อมูลเปลี่ยนแล้ว','aborted');
  const reviews=await qualifiedCode99Reviews(before,[m],sources,undefined,true);
  must(quantityBasisState(m)!=='Provisional','ยืนยันที่มาข้อมูลปริมาณ BOQ ก่อนตรวจสมาชิก');
  const plain=declaredNoRebar(m),errors=[...validateMember(m,before.spec),...minimumProblems(m,before.spec,reviews),...sourceScheduleReviewProblems(m,schedule(m,before.spec),sources),...sourceReviewProblems(sources.filter(a=>a.memberId===m.id),m.bars,plain?m.noRebar!.basis:undefined),...generalSourceProblems(sources.filter(a=>!a.memberId))];
  must(!errors.length,errors.join('\n'));must(plain||m.bars.length>0&&m.bars.every(b=>b.placementConfirmed),'กรอกและยืนยัน BBS หรือระบุขอบเขตไม่มีเหล็กให้ชัดเจนก่อนตรวจ');
 }
 return projectTransaction(action,pid,data,requestId,status==='ApprovedForIssue'?['approver']:status==='Checked'?['checker','approver']:['admin','qs','checker','approver'],async(tx,p,u)=>{
  must(p.version===anchor.data()?.version,'ข้อมูลแบบหรือโครงการเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนตรวจ','aborted');
  const r=recordRef(pid,'members',data.memberId),s=await tx.get(r),m=s.exists()?decodeStorage(s.data()) as Member:undefined;
  must(m&&m.version===data.version,'ข้อมูลเปลี่ยนแล้ว','aborted');
  must(status!=='ApprovedForIssue'||m.status==='Checked','ต้องตรวจ Checked ก่อน');
  must(status!==m.status,`สมาชิกอยู่ในสถานะ ${statusLabel(m.status)} แล้ว`,'failed-precondition');
  // review trail + IFC revision; an approved drawing number takes the issued revision (R0–R9)
  const at=now(),review=nextReview(m.review,{action:status==='ApprovedForIssue'?'Approved':status==='Checked'?'Checked':'Returned',from:m.status,to:status,actor:{uid:u.uid,name:displayName(u)},at,note:typeof data.note==='string'?data.note:''});
  const drawingSetup=status==='ApprovedForIssue'&&m.drawingSetup?.run&&p.titleBlock?numberedSetup(p,m.drawingSetup,m.drawingSetup.run,Math.min(9,review.issuedRev??0)):m.drawingSetup;
  tx.set(r,encode({...m,status,review,...(drawingSetup?{drawingSetup}:{}),version:m.version+1,updatedAt:at}));tx.update(projectRef(pid),{version:p.version+1});return {version:m.version+1};
 });
}
