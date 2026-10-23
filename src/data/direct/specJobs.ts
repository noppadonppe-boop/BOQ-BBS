import {provisionalQuantityBasis} from '../../domain/quantityBasis';
import {getDoc} from 'firebase/firestore';
import {readCollectionPages} from '../collections';
import {attachmentSchema,Attachment,Member,Project,Spec,specSchema,SpecChangeState,SnapshotFile} from '../../domain/model';
import {validateMember} from '../../domain/engine';
import {applyElementInput,elementInputSchema,isGeneratedBar} from '../../domain/elementInput';
import {detailingFromSpec} from '../../domain/specProfiles';
import {sourceBarNames,sourceCurrent,memberSourceInfo,generalSourceInfo,validateSourceChains} from '../../domain/sourceRevisions';
import {canonical} from '../../domain/canonical';
import {decodeStorage} from '../../domain/storageCodec';
import {actor,allow,clean,encode,must,now,projectRef,recordRef,projectTransaction,writable} from './common';
import {readManifest,writeManifest,chunk} from './manifests';
import {verifiedAttachment,unverifiedAttachment} from './sources';
import {readProjectRecord} from '../projectReadback';
import {restProjectTransaction} from './restTransaction';

type Change={id:string;before:Member;after:Member};
type SourceChange={before:Attachment;after:Attachment;next:Attachment};
type SpecManifest={id:string;projectId:string;sourceVersion:number;oldSpec:Spec;newSpec:Spec;preparedAt:string;sourceScope?:'Member'|'GeneralSpec';members:Change[];sourceIntakes:Attachment[];sourceChanges:SourceChange[];sourceAdoptions:{before:Attachment;after:Attachment}[]};
type Job={id:string;status:SpecChangeState['status'];completed:number;total:number;manifest:SnapshotFile;sourceVersion:number;rollbackTotal?:number;rollbackCompleted?:number};
const state=(j:Job):SpecChangeState=>({id:j.id,status:j.status,completed:j.status==='RollingBack'?j.rollbackCompleted||0:j.completed,total:j.status==='RollingBack'?j.rollbackTotal||0:j.total});

export async function beginDirectSpec(action:string,pid:string,data:Record<string,any>,id:string){
 const u=await actor(),ps=await getDoc(projectRef(pid));must(ps.exists(),'ไม่พบโครงการ');const p=decodeStorage(ps.data()) as Project;allow(p,u,['admin','qs']);
 const oldOp=await getDoc(recordRef(pid,'operations',id));if(oldOp.exists())return projectTransaction(action,pid,data,id,['admin','qs'],async()=>{throw Error('Unexpected replay');});
 writable(p);const single=['attach','replaceSource'].includes(action);must((single?data.projectVersion??p.version:data.version)===p.version,'ข้อมูลโครงการเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนเริ่ม','aborted');
 const [ms,ats,stock,plans,exports,submissions]=await Promise.all(['members','attachments','stock','cutPlans','exportJobs','submissionJobs'].map(n=>readCollectionPages(pid,n))),members=ms as Member[],attachments=ats as Attachment[];must(members.length<=5000,'แบ่งโครงการ: เกิน 5,000 สมาชิก');must(!stock.some(s=>s.reserved>0)&&!plans.some(s=>s.status==='Reserved'),'มีแผนจองสต็อกอยู่ ให้ยกเลิกหรือดำเนินการก่อนเปลี่ยนแบบหรือสเป็ค');must(![...exports,...submissions].some(j=>j.status==='Generating'&&j.leaseUntil>Date.now()),'มีงานส่งออกกำลังสร้างไฟล์ ให้รอหรือทำให้เสร็จก่อนเปลี่ยนแบบหรือสเป็ค');
 const spec=action==='beginSpecChange'?{...specSchema.parse(data.spec),approved:false,evidenceFileId:''}:p.spec,scope:SpecManifest['sourceScope']=action==='beginMemberSourceBatch'||single&&data.attachment.memberId?'Member':action==='beginSourceAdoption'?data.scope:action==='beginSpecChange'?undefined:'GeneralSpec';
 const note=String(data.note||'').trim();if(action!=='beginSpecChange')must(note.length>0&&note.length<=500,'ระบุเหตุผลรับหรือเปลี่ยนแบบ','invalid-argument');
 const manifest:SpecManifest={id,projectId:pid,sourceVersion:p.version,oldSpec:p.spec,newSpec:spec,preparedAt:now(),sourceScope:scope,members:[],sourceIntakes:[],sourceChanges:[],sourceAdoptions:[]};
 const byId=new Map(attachments.map(a=>[a.id,a])),byMember=new Map(members.map(m=>[m.id,m])),owners=new Map<string,number>();
 const items=(Array.isArray(data.items)?data.items:data.attachment?[{attachment:data.attachment,previousAttachmentId:data.previousAttachmentId,previousVersion:data.previousVersion,memberVersion:data.memberVersion}]:[]) as Record<string,any>[];
 if(action!=='beginSpecChange')must(items.length>0&&items.length<=(scope==='Member'?60:20),'จำนวนแบบต่อชุดไม่ถูกต้อง','invalid-argument');
 const seen=new Set<string>(),replaced=new Set<string>();let sourceBytes=0;
 for(const item of items){
  const before=action==='beginSourceAdoption'?byId.get(item.attachmentId):undefined;
  must(action!=='beginSourceAdoption'||data.acknowledged===true,'ยืนยันผลกระทบของการนำไฟล์เดิมเข้าทะเบียน');
  if(action==='beginSourceAdoption')must(before&&sourceCurrent(before)&&!before.sourceAdoption&&!memberSourceInfo(before)&&!generalSourceInfo(before)&&(before.version||1)===item.version,'ใช้ได้เฉพาะเอกสารเดิมที่ยังไม่เข้าทะเบียนและ version ปัจจุบัน');
  const candidate=before?{...before,kind:String(item.kind||'').trim(),revision:String(item.revision||'').trim()}:attachmentSchema.parse(item.attachment);
  must(candidate.kind.trim()&&candidate.revision.trim(),'ระบุประเภทแบบและ Revision ให้ครบ','invalid-argument');must(!seen.has(candidate.id),'รหัสแบบซ้ำในชุด','invalid-argument');seen.add(candidate.id);
  must(scope==='Member'?!!candidate.memberId:!candidate.memberId,'ขอบเขตแบบไม่ตรงรายการ','invalid-argument');
  const owner=candidate.memberId?byMember.get(candidate.memberId):undefined;
  if(scope==='Member'){must(owner,'ไม่พบสมาชิกเจ้าของแบบ');const expected=single&&item.memberVersion===undefined?owner.version:item.memberVersion;must(expected===owner.version,'ข้อมูลสมาชิกเจ้าของแบบเปลี่ยนแล้ว','aborted');must(!owners.has(owner.id)||owners.get(owner.id)===expected,'version เจ้าของแบบไม่ตรงกัน');owners.set(owner.id,expected);}
  // Registering a member drawing must not block on reading/parsing every
  // uploaded object. Content verification remains available to later
  // review/release workflows through verifiedAttachment().
  const a=action==='beginMemberSourceBatch'?unverifiedAttachment(pid,candidate):await verifiedAttachment(pid,candidate);sourceBytes+=a.size;must(sourceBytes<=(scope==='Member'?120:60)*1024*1024,'แบ่งชุดแบบ: ไฟล์ต้นทางรวมเกินขอบเขต');
  if(before){
   const info=scope==='Member'?{scope:'Member' as const,baselineBars:sourceBarNames(owner!.bars),affectedMemberCount:1 as const}:{scope:'GeneralSpec' as const,affectedMemberCount:members.length};
   const after={...a,version:(before.version||1)+1,sourceStatus:'Current' as const,sourceIntake:{...info,note,receivedAt:manifest.preparedAt,receivedBy:u.uid,specChangeJobId:id},sourceAdoption:{adoptedAt:manifest.preparedAt,adoptedBy:u.uid,specChangeJobId:id,previousVersion:before.version||1,previousKind:before.kind,previousRevision:before.revision,...(before.sha256?{previousSha256:before.sha256}:{})}};
   manifest.sourceAdoptions.push({before,after});continue;
  }
  must(!byId.has(a.id),'แบบนี้มีในโครงการแล้ว','aborted');
  const previousId=item.previousAttachmentId;
  if(previousId){
   const old=byId.get(previousId);must(old&&sourceCurrent(old)&&(old.version||1)===item.previousVersion,'แบบฉบับก่อนเปลี่ยนแล้ว','aborted');must(!replaced.has(old.id),'แทนที่แบบเดียวกันซ้ำในชุด');replaced.add(old.id);
   must(old.memberId===a.memberId&&old.kind===a.kind&&old.revision!==a.revision,'Revision หรือประเภทไม่ตรงสายเดิม');
   const next:Attachment={...a,version:1,sourceStatus:'Current',annotations:[],calibrations:{},sourceRevision:{previousAttachmentId:old.id,previousRevision:old.revision,note,changedAt:manifest.preparedAt,changedBy:u.uid,baselineBars:owner?sourceBarNames(owner.bars):[],scope:scope||'GeneralSpec',specChangeJobId:id,affectedMemberCount:scope==='Member'?1:members.length}};
   manifest.sourceChanges.push({before:old,after:{...old,version:(old.version||1)+1,sourceStatus:'Superseded',supersededById:a.id,supersededAt:manifest.preparedAt},next});
  }else{
   manifest.sourceIntakes.push({...a,version:1,sourceStatus:'Current',annotations:[],calibrations:{},sourceIntake:scope==='Member'?{scope:'Member',note,receivedAt:manifest.preparedAt,receivedBy:u.uid,specChangeJobId:id,affectedMemberCount:1,baselineBars:sourceBarNames(owner!.bars)}:{scope:'GeneralSpec',note,receivedAt:manifest.preparedAt,receivedBy:u.uid,specChangeJobId:id,affectedMemberCount:members.length}});
  }
 }
 const selected=scope==='Member'?members.filter(m=>owners.has(m.id)):members;
 // A spec change re-derives the element-input detailing (bends, laps, grade) from the new spec and
 // regenerates the auto bars (gen-*) of members built from element input; manual bars are kept.
 const regenerate=(m:Member):Member|undefined=>{
  if(action!=='beginSpecChange'||!m.elementInput)return;
  const parsed=elementInputSchema.safeParse(m.elementInput);if(!parsed.success||parsed.data.category!==m.category)return;
  // input not applied yet: only refresh its detailing so the next apply uses the new spec
  if(!parsed.data.appliedAt)return {...m,elementInput:{...parsed.data,detailing:detailingFromSpec(spec,parsed.data.detailing)}};
  try{const r=applyElementInput(m,{...parsed.data,detailing:detailingFromSpec(spec,parsed.data.detailing)},{rounding:spec.rounding,withBars:m.bars.some(isGeneratedBar)});return validateMember(r.member,spec).length?undefined:r.member;}catch{return;}
 };
 for(const m0 of selected){const fresh=regenerate(m0),m=fresh||m0;if(!fresh){const errors=validateMember(m0,spec);must(!errors.length,`${m0.code}: ${errors.join('\n')}`,'invalid-argument');}manifest.members.push({id:m0.id,before:m0,after:{...m,...(m.quantityBasis?{quantityBasis:provisionalQuantityBasis(m.quantityBasis.reference)}:{}),noRebar:undefined,status:'Draft',version:m.version+1,inputEpoch:id,updatedAt:manifest.preparedAt,bars:m.bars.map(b=>({...b,placementConfirmed:false,...(b.bsDimensionsConfirmed!==undefined?{bsDimensionsConfirmed:false}:{})}))}});}
 const nextSources=new Map(byId);manifest.sourceIntakes.forEach(a=>nextSources.set(a.id,a));manifest.sourceAdoptions.forEach(a=>nextSources.set(a.after.id,a.after));manifest.sourceChanges.forEach(c=>{nextSources.set(c.after.id,c.after);nextSources.set(c.next.id,c.next);});validateSourceChains([...nextSources.values()]);
 const file=await writeManifest(pid,'spec-manifests',clean(manifest));
 return projectTransaction(action,pid,data,id,['admin','qs'],async(tx,current)=>{
  must(current.version===p.version&&current.stockEpoch===p.stockEpoch,'ข้อมูลหรือสต็อกเปลี่ยนระหว่างเตรียมงาน','aborted');
  const summary=(a:Attachment)=>({id:a.id,name:a.name,revision:a.revision,memberId:a.memberId,kind:a.kind});
  const job={id,status:'Applying' as const,completed:0,total:manifest.members.length,manifest:file,sourceVersion:p.version,createdBy:u.uid,createdAt:manifest.preparedAt,sourceScope:scope||null,targetSpec:spec,sourceIntakes:manifest.sourceIntakes.map(summary),sourceChanges:manifest.sourceChanges.map(c=>({before:summary(c.before),next:summary(c.next)})),sourceAdoptions:manifest.sourceAdoptions.map(c=>({before:summary(c.before),after:summary(c.after)})),sourceIntakeCount:manifest.sourceIntakes.length,sourceChangeCount:manifest.sourceChanges.length,sourceAdoptionCount:manifest.sourceAdoptions.length,memberIds:manifest.members.map(m=>m.id),sourceIds:[...manifest.sourceIntakes.map(a=>a.id),...manifest.sourceChanges.flatMap(c=>[c.after.id,c.next.id]),...manifest.sourceAdoptions.map(a=>a.after.id)]};
  tx.set(recordRef(pid,'specChangeJobs',id),encode(job));tx.update(projectRef(pid),{specChangeState:state(job),historyEpoch:id});return state(job);
 });
}
export async function advanceDirectSpec(action:string,pid:string,data:Record<string,any>,id:string){
 const jr=recordRef(pid,'specChangeJobs',data.jobId),initial=await readProjectRecord(pid,'specChangeJobs',data.jobId) as Job;must(initial,'ไม่พบงานเปลี่ยนสเป็ค');const manifest=await readManifest<SpecManifest>(pid,initial.manifest);
 must(manifest.id===initial.id&&manifest.projectId===pid&&manifest.sourceVersion===initial.sourceVersion,'Manifest ไม่ตรงงาน');
 return restProjectTransaction(action,pid,data,id,['admin','qs'],async(tx,p)=>{
  const s=await tx.get(jr);must(s.exists(),'ไม่พบงาน');const job=decodeStorage(s.data()) as Job;
  if(['Complete','Cancelled'].includes(job.status))return state(job);must(p.specChangeState?.id===job.id,'งานเปลี่ยนสเป็คไม่ตรงโครงการ');
  must(!['Importing','Cancelling'].includes(p.restoreState?.status||''),'โครงการกำลัง Restore');
  const rolling=action==='cancelSpecChange'||job.status==='RollingBack',start=rolling?(job.rollbackCompleted||0):job.completed,total=rolling?(job.rollbackTotal??job.completed):job.total;
  const list=chunk(manifest.members.slice(0,total),start,e=>new TextEncoder().encode(JSON.stringify(encode(rolling?e.before:e.after))).length),ss:any[]=await tx.getMany(list.map(e=>recordRef(pid,'members',e.id)));
  ss.forEach((s,i)=>{must(s.exists(),'สมาชิกในงานหายไป');const expected=rolling?list[i].after:list[i].before;must(canonical(decodeStorage(s.data()))===canonical(expected),'สมาชิกเปลี่ยนระหว่างดำเนินงาน','aborted');});
  for(const e of list)tx.set(recordRef(pid,'members',e.id),encode(rolling?e.before:e.after));
  const end=start+list.length,complete=end===total,next:Job={...job,status:complete?(rolling?'Cancelled':'Complete'):(rolling?'RollingBack':'Applying'),...(rolling?{rollbackTotal:total,rollbackCompleted:end}:{completed:end})};
  if(complete&&!rolling){for(const a of manifest.sourceIntakes)tx.set(recordRef(pid,'attachments',a.id),encode(a));for(const c of manifest.sourceChanges){tx.set(recordRef(pid,'attachments',c.after.id),encode(c.after));tx.set(recordRef(pid,'attachments',c.next.id),encode(c.next));}for(const a of manifest.sourceAdoptions)tx.set(recordRef(pid,'attachments',a.after.id),encode(a.after));}
  tx.update(jr,encode({status:next.status,completed:next.completed,...(rolling?{rollbackTotal:total,rollbackCompleted:end}:{}),...(complete?{completedAt:now()}:{})}));
  const result=state(next);tx.update(projectRef(pid),encode({specChangeState:result,historyEpoch:id,...(complete&&!rolling?{spec:manifest.newSpec,version:p.version+1}:{})}));return result;
 });
}
