import {readReleaseOperations,verifyIssuedReference,verifyPublishedBundle} from '../releaseReview';
import {issuedReference} from '../../domain/publication';
import {qualifiedCode99Reviews} from '../code99Reviews';
import {engineeringFixturesEnabled,engineeringHistoryProblem} from '../engineeringFeature';
import {getDoc} from 'firebase/firestore';
import {getBlob,getMetadata,ref,uploadBytes} from 'firebase/storage';
import {storage} from '../firebase';
import {loadSnapshot,digestData,sha256} from '../snapshots';
import {readCollectionPages} from '../collections';
import {SnapshotBundle,SnapshotRecord,SnapshotFile,Member,Project,Revision,ExportJob,ExportKind,ExportSize,ExportLayout} from '../../domain/model';
import {canonical} from '../../domain/canonical';
import {decodeStorage} from '../../domain/storageCodec';
import {takeoff,validateMember} from '../../domain/engine';
import {calculationEngine,supportsBundle} from '../../domain/version';
import {normalizeScope,hasSelection,selectBundle,scopeLabel} from '../../domain/exportScope';
import {validateExportFormat,validateScheduleBundle} from '../../domain/cuttingSchedule';
import {drawingReferences} from '../../domain/drawingStandard';
import {exportBasisProblem} from '../../domain/exportBasis';
import {inventoryScopeSchema,inventoryScopeLabel,inventoryReport} from '../../domain/inventoryReport';
import {readInventoryInput} from '../inventory';
import {projectRef,recordRef,projectTransaction,encode,clean,must,now,actor,allow} from './common';

async function stored(pid:string,bundle:SnapshotBundle):Promise<SnapshotRecord>{
 const digest=await digestData(bundle),path=`projects/${pid}/snapshots/${digest}.json`,blob=new Blob([canonical(bundle)],{type:'application/json'});must(blob.size<=20*1024*1024,'แบ่งข้อมูลโครงการ: Snapshot เกิน 20 MiB');
 try{const existing=await getBlob(ref(storage,path));must(existing.size===blob.size&&await sha256(await existing.arrayBuffer())===digest,'ไฟล์ Snapshot ที่มีอยู่ checksum ไม่ตรง');}catch(e:any){if(e.code!=='storage/object-not-found')throw e;await uploadBytes(ref(storage,path),blob,{contentType:'application/json',customMetadata:{sha256:digest}});}
 return {digest,snapshot:{path,name:`${digest}.json`,size:blob.size,sha256:digest,contentType:'application/json'},summary:{version:bundle.version,status:bundle.status,revisionNumber:bundle.revisionNumber||'',engineVersion:bundle.engineVersion||'',memberCount:bundle.members.length,scope:bundle.scope,scopeLabel:bundle.inventory?inventoryScopeLabel(bundle.inventory.scope):scopeLabel(bundle.scope,bundle.members)}};
}
async function capture(pid:string,p:Project):Promise<SnapshotBundle>{
 const [members,attachments,stock,stockLedger,cutPlans]=await Promise.all(['members','attachments','stock','stockLedger','cutPlans'].map(n=>readCollectionPages(pid,n)));
 must(members.length<=5000,'แบ่งโครงการ: Snapshot รองรับไม่เกิน 5,000 สมาชิก');
 const code99Reviews=await qualifiedCode99Reviews(p,members as Member[],attachments as any[],undefined,true);
 const calculations=Object.fromEntries((members as Member[]).map(m=>{const q=takeoff(m,p.spec);return [m.id,{quantity:q.quantity,concrete:q.concrete,formwork:q.formwork,excavation:q.excavation,backfill:q.backfill,lean:q.lean,rebar:q.rebar,...(q.sand||q.sheet||q.compaction?{sand:q.sand,sheet:q.sheet,compaction:q.compaction}:{}),bars:q.rows.map(b=>({id:b.id,cutLength:b.cutLength,geometricLength:b.geometricLength,eachWeight:b.eachWeight,weight:b.weight}))}];}));
 return clean({schemaVersion:2,project:p,members,attachments,stock,stockLedger,cutPlans,createdAt:now(),status:'Draft',version:p.version,engineVersion:calculationEngine(p.spec),calculations,...(code99Reviews.length?{code99Reviews}:{})}) as SnapshotBundle;
}
const anchor=(p:Project)=>canonical({version:p.version,stockEpoch:p.stockEpoch,historyEpoch:p.historyEpoch,revisionCounter:p.revisionCounter});
export async function directSnapshot(action:string,pid:string,data:Record<string,any>,id:string){
 const u=await actor(),ps=await getDoc(projectRef(pid));must(ps.exists(),'ไม่พบโครงการ','not-found');const initial=decodeStorage(ps.data()) as Project;
 const allowed=action==='freezeRevision'?['admin','qs','checker','approver'] as const:['admin','qs','checker','approver','viewer'] as const;allow(initial,u,[...allowed]);
 if(data.backup)must(!engineeringHistoryProblem(initial),engineeringHistoryProblem(initial));
 const scope=normalizeScope(data.scope||{});must(!data.backup||!data.revisionId&&!hasSelection(scope)&&!scope.group,'Backup ต้องเก็บ Working data ทั้งโครงการ','invalid-argument');
 must(data.inventory===undefined||data.inventory===true,'ชนิดทะเบียนสต็อกไม่ถูกต้อง','invalid-argument');must(!data.inventory||action==='exportSnapshot'&&!data.backup&&!data.revisionId&&!hasSelection(scope)&&!scope.group,'ทะเบียนสต็อกต้องใช้ข้อมูลทำงานทั้งโครงการและตัวกรองสต็อก','invalid-argument');
 must(data.expectedStockEpoch===undefined||data.inventory,'รุ่นสต็อกยืนยันใช้กับทะเบียนสต็อกเท่านั้น','invalid-argument');
 // Replay before uploading another immutable object after an uncertain response.
 const oldOp=await getDoc(recordRef(pid,'operations',id));if(oldOp.exists())return projectTransaction(action,pid,data,id,[...allowed],async()=>{throw Error('Unexpected replay');});
 let bundle:SnapshotBundle,revision:Revision|undefined;
 if(data.inventory){const problem=exportBasisProblem(data,{version:initial.version,stockEpoch:initial.stockEpoch});must(!problem,problem,'aborted');bundle=await readInventoryInput(pid,inventoryScopeSchema.parse(data.inventoryScope||{}));must(anchor(bundle.project)===anchor(initial),'ข้อมูลเปลี่ยนก่อนตรึงทะเบียนสต็อก','aborted');inventoryReport(bundle,bundle.inventory!.scope);}else if(data.revisionId){const [rs,state]=await Promise.all([getDoc(recordRef(pid,'revisions',data.revisionId)),getDoc(recordRef(pid,'revisionStates',data.revisionId))]);must(rs.exists()&&state.exists(),'ไม่พบ Revision','not-found');revision=decodeStorage(rs.data()) as Revision;const problem=exportBasisProblem(data,{version:initial.version,digest:revision.digest,status:state.data().status,stateDigest:await digestData(decodeStorage(state.data()))});must(!problem,problem,'aborted');const frozen=await loadSnapshot(revision);if(state.data().status==='Issued'||state.data().issuedEventId)frozen.issuedReference=await verifyIssuedReference(pid,revision,decodeStorage(state.data()) as any,frozen);must(supportsBundle(frozen),'รุ่นคำนวณเปลี่ยนแล้ว ดาวน์โหลดไฟล์เดิมหรือสร้าง Revision ใหม่');bundle=selectBundle({...frozen,status:state.data().status},scope);}else {const problem=exportBasisProblem(data,{version:initial.version});must(!problem,problem,'aborted');bundle=selectBundle(await capture(pid,initial),scope);}
 must(data.backup||data.inventory||bundle.members.length>0,'ไม่มีสมาชิกตรงกับตัวเลือกนี้','invalid-argument');
 if(data.backup){bundle.historyIndex=[];for(const name of ['revisions','revisionStates','revisionEvents','exportJobs','importedHistory','specChangeJobs','submissionJobs','accessEvents',...(engineeringFixturesEnabled?['engineeringFixtures','engineeringFixtureRuns']:[])])for(const item of await readCollectionPages(pid,name))bundle.historyIndex.push({collection:name,id:item.id,digest:await digestData(item)});for(const action of ['prepareIssue','approveEngineeringSpec','issue'])for(const item of await readReleaseOperations(pid,action))bundle.historyIndex!.push({collection:'operations',id:item.id,digest:await digestData(item)});}
 const number=`R${String((initial.revisionCounter||0)+1).padStart(3,'0')}`;
 if(action==='freezeRevision'){must(initial.version===data.version,'ข้อมูลโครงการเปลี่ยนแล้ว','aborted');must(bundle.members.every(m=>!validateMember(m,initial.spec).length),'ข้อมูลมิติ / BBS ไม่ผ่านการตรวจ');bundle={...bundle,status:'Frozen',revisionNumber:number};}
 const record=await stored(pid,bundle),createdAt=now();
 return projectTransaction(action,pid,data,id,[...allowed],async(tx,p,actor)=>{
  must(actor.uid===u.uid,'ผู้ใช้เปลี่ยนระหว่างตรึงข้อมูล','aborted');must(anchor(p)===anchor(initial),'ข้อมูลหรือประวัติโครงการเปลี่ยนระหว่างตรึง Snapshot กรุณาลองใหม่','aborted');
  if(action==='freezeRevision'){
   const r={id,number,...record,sourceVersion:p.version,engineVersion:calculationEngine(p.spec),createdAt,createdBy:actor.uid};
   // revisionCounter already anchors concurrent captures. Keeping this update to
   // that field also permits project checkers/approvers under the existing Rules.
   tx.set(recordRef(pid,'revisions',id),encode(r));tx.set(recordRef(pid,'revisionStates',id),{id,status:'Frozen'});tx.set(recordRef(pid,'revisionEvents',id),{id,revisionId:id,action:'Frozen',createdAt,createdBy:actor.uid});tx.update(projectRef(pid),{revisionCounter:(p.revisionCounter||0)+1});return {id,number,digest:record.digest};
  }
  if(revision){
   const [rs,ss]=await Promise.all([tx.get(recordRef(pid,'revisions',revision.id)),tx.get(recordRef(pid,'revisionStates',revision.id))]);
   must(rs.exists()&&ss.exists()&&await digestData(decodeStorage(rs.data()))===await digestData(revision),'ทะเบียนฉบับเปลี่ยนระหว่างตรึง Snapshot','aborted');
   const problem=exportBasisProblem(data,{version:p.version,digest:rs.data().digest,status:ss.data().status,stateDigest:await digestData(decodeStorage(ss.data()))});must(!problem,problem,'aborted');
   must(ss.data().status===bundle.status,'สถานะฉบับเปลี่ยนระหว่างตรึง Snapshot','aborted');
   if(bundle.issuedReference)must(ss.data().issuedEventId===bundle.issuedReference.issuedEventId,'หลักฐานฉบับเปลี่ยนระหว่างตรึง Snapshot','aborted');
  }
  const job={id,...record,createdBy:actor.uid,createdAt,status:'Snapshot',...(revision?{revisionId:revision.id,revisionDigest:revision.digest}:{})};tx.set(recordRef(pid,'exportJobs',id),encode(job));tx.update(projectRef(pid),{historyEpoch:id});return job;
 });
}
export async function directExport(action:string,pid:string,data:Record<string,any>,id:string){
 const jr=recordRef(pid,'exportJobs',data.jobId),js=await getDoc(jr);must(js.exists(),'ไม่พบงานส่งออก','not-found');const initial=decodeStorage(js.data()) as ExportJob;
 const checkedBundle=action==='failExport'?undefined:await loadSnapshot(initial);if(checkedBundle)await verifyPublishedBundle(checkedBundle);const publication=checkedBundle?.status==='Issued'?issuedReference(checkedBundle):undefined;
 let format:Record<string,unknown>|undefined,file:SnapshotFile|undefined;
 if(action==='startExport'){
  const kind=data.kind as ExportKind,size=data.size as ExportSize,layout=(data.drawingLayout||(kind==='schedule'?'cutting-a4-v1':'schedule-v1')) as ExportLayout;
  must(['excel','drawing','boq','schedule','inventory-excel','inventory-pdf'].includes(kind)&&['A3','A1','A4'].includes(size),'รูปแบบไฟล์ไม่ถูกต้อง','invalid-argument');validateExportFormat(kind,size,layout);
  const b=checkedBundle!;must(supportsBundle(b),'รุ่นคำนวณเปลี่ยนแล้ว ดาวน์โหลดไฟล์เดิมหรือสร้าง Revision ใหม่');if(kind==='schedule')validateScheduleBundle(b);if(kind==='drawing'&&b.project.drawingProfile)drawingReferences(b,layout as any);
  must(!!b.inventory===kind.startsWith('inventory-'),'รูปแบบไฟล์ไม่ตรงชนิดชุดข้อมูล');if(kind.startsWith('inventory-'))must(b.inventory?.version===1&&!b.members.length,'งานนี้ไม่มีฐานทะเบียนสต็อก');
  const xlsx=kind==='excel'||kind==='inventory-excel',name=`${b.project.code.replace(/[^a-zA-Z0-9_-]/g,'_')}-${kind}-${b.revisionNumber||'D'+b.version}-${size}.${xlsx?'xlsx':'pdf'}`;
  format={kind,size,...(['drawing','schedule'].includes(kind)?{drawingLayout:layout}:{}),name,contentType:xlsx?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf'};
 }else if(action==='finishExport'){
  must(data.path===`projects/${pid}/exports/${initial.id}/${initial.attempt}/${initial.name}`,'ไฟล์ไม่ตรงงานส่งออก');const sr=ref(storage,data.path),meta=await getMetadata(sr),blob=await getBlob(sr),hash=await sha256(await blob.arrayBuffer());
  must(blob.size>0&&blob.size<=50*1024*1024&&hash===data.sha256&&meta.contentType===initial.contentType&&meta.customMetadata?.digest===initial.digest,'ไฟล์ส่งออก checksum หรือข้อมูลอ้างอิงไม่ตรง');file={path:data.path,name:initial.name!,size:blob.size,sha256:hash,contentType:initial.contentType!};
 }
 return projectTransaction(action,pid,data,id,['admin','qs','checker','approver','viewer'],async(tx,p,u)=>{
  const s=await tx.get(jr);must(s.exists(),'ไม่พบงานส่งออก');const job=decodeStorage(s.data()) as ExportJob;must(job.createdBy===u.uid,'ไม่มีสิทธิ์ในงานส่งออกของบัญชีอื่น','permission-denied');
  must(job.digest===initial.digest,'ฐานส่งออกเปลี่ยนระหว่างตรวจ','aborted');if(publication){const state=await tx.get(recordRef(pid,'revisionStates',publication.revisionId));must(state.data()?.status==='Issued'&&state.data()?.issuedEventId===publication.issuedEventId,'ฉบับถูกแทนที่ระหว่างส่งออก','aborted');}
  if(action==='startExport'){
   must(job.status!=='Complete','ไฟล์เสร็จแล้ว ให้ดาวน์โหลดจากประวัติ');must(job.status!=='Generating'||(job.leaseUntil||0)<Date.now(),'มีคำขออื่นกำลังสร้างไฟล์นี้อยู่','aborted');
   must(!job.kind||(job.kind===data.kind&&job.size===data.size&&(!['drawing','schedule'].includes(job.kind)||(job.drawingLayout||'schedule-v1')===format!.drawingLayout)),'Retry ต้องใช้รูปแบบเดิม');
   const attempt=(job.attempt||0)+1,leaseToken=crypto.randomUUID(),path=`projects/${pid}/exports/${job.id}/${attempt}/${format!.name}`;tx.update(jr,encode({...format,status:'Generating',attempt,leaseToken,path,leaseUntil:Date.now()+300000}));tx.update(projectRef(pid),{historyEpoch:id});return {...format,attempt,leaseToken,path,digest:job.digest};
  }
  must(job.status==='Generating'&&job.attempt===data.attempt&&job.leaseToken===data.leaseToken,'งานส่งออกเปลี่ยนแล้ว','aborted');
  tx.update(jr,encode(action==='finishExport'?{status:'Complete',file,completedAt:now(),leaseUntil:0}:{status:'Failed',error:String(data.error||'').slice(0,1000),leaseUntil:0}));tx.update(projectRef(pid),{historyEpoch:id});return {ok:true};
 });
}
