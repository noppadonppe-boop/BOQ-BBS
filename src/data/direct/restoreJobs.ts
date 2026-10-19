import {provisionalQuantityBasis} from '../../domain/quantityBasis';
import {getDoc,getDocFromServer,getDocsFromServer,collection,query,limit} from 'firebase/firestore';
import {getBlob,ref} from 'firebase/storage';
import {storage,db} from '../firebase';
import {readCollectionPages} from '../collections';
import {digestData,sha256} from '../snapshots';
import {SnapshotBundle,SnapshotFile,Attachment,Project,memberSchema,specSchema,attachmentSchema,RestoreState} from '../../domain/model';
import {validateMember} from '../../domain/engine';
import {validateSourceChains} from '../../domain/sourceRevisions';
import {drawingNumberKey,drawingProfileSchema,titleBlockSchema} from '../../domain/drawingStandard';
import {decodeStorage} from '../../domain/storageCodec';
import {actor,allow,clean,encode,must,now,projectRef,recordRef,projectTransaction,writable} from './common';
import {readManifest,writeManifest,chunk} from './manifests';
import {verifiedAttachment} from './sources';
import {canonical} from '../../domain/canonical';
import {engineeringFixturesEnabled,engineeringHistoryProblem} from '../engineeringFeature';
import {historyFileReferences,restoreEmptyCollections,restoreHistoryCollections,restoreTargetAnchor,validateBackupStructure} from '../../domain/restorePreflight';
import {sourceScheduleFileProblems} from '../../domain/sourceSchedule';

type Entry={collection:string;id:string;data:Record<string,any>};
type Manifest={id:string;projectId:string;sourceProjectId:string;sourceVersion:number;entries:Entry[];projectPatch:Record<string,any>};
type Job={id:string;status:RestoreState['status'];completed:number;total:number;manifest:SnapshotFile;cancelTotal?:number;cancelCompleted?:number};
const state=(j:Job):RestoreState=>({id:j.id,status:j.status,completed:j.status==='Cancelling'?j.cancelCompleted||0:j.completed,total:j.status==='Cancelling'?j.cancelTotal||0:j.total});
const histories=restoreHistoryCollections.filter(name=>name!=='operations');
export async function inspectRestoreTarget(pid:string){
 const u=await actor(),s=await getDocFromServer(projectRef(pid));must(s.exists(),'ไม่พบโครงการ');const p=decodeStorage(s.data()) as Project;allow(p,u,['admin']);writable(p);
 must(!engineeringHistoryProblem(p),engineeringHistoryProblem(p));
 const empty=await Promise.all([...restoreEmptyCollections,...(engineeringFixturesEnabled?['engineeringFixtures','engineeringFixtureRuns']:[])].map(n=>getDocsFromServer(query(collection(db,'projects',pid,n),limit(1)))));must(empty.every(s=>s.empty),'Restore ลงโครงการว่างเท่านั้น');
 return restoreTargetAnchor(p);
}
export async function beginDirectRestore(pid:string,data:Record<string,any>,id:string){
 const u=await actor(),ps=await getDoc(projectRef(pid));must(ps.exists(),'ไม่พบโครงการ');const p=decodeStorage(ps.data()) as Project;allow(p,u,['admin']);
 must(!engineeringHistoryProblem(p),engineeringHistoryProblem(p));
 const oldOp=await getDoc(recordRef(pid,'operations',id));if(oldOp.exists())return projectTransaction('beginRestore',pid,data,id,['admin'],async()=>{throw Error('Unexpected replay');});writable(p);
 must(!data.targetAnchor||canonical(data.targetAnchor)===canonical(restoreTargetAnchor(p)),'โครงการเป้าหมายเปลี่ยนหลังตรวจ Backup กรุณาตรวจใหม่','aborted');
 const raw=await readManifest<any>(pid,data.manifest,20*1024*1024),bundle=raw.bundle as SnapshotBundle;
 must([1,2].includes(bundle?.schemaVersion),'Backup schema ไม่รองรับ');must((bundle.schemaVersion===1?await sha256(new TextEncoder().encode(JSON.stringify(bundle)).buffer):await digestData(bundle))===raw.bundleDigest,'Backup checksum ไม่ตรง');
 validateBackupStructure(bundle,raw.historyRecords||[],(raw.historyFileRefs||[]).map((f:any)=>({...f,path:f.originalPath,key:f.path})));
 const empty=await Promise.all([...restoreEmptyCollections,...(engineeringFixturesEnabled?['engineeringFixtures','engineeringFixtureRuns']:[])].map(n=>readCollectionPages(pid,n)));must(empty.every(a=>a.length===0),'Restore ลงโครงการว่างเท่านั้น');
 const spec=specSchema.parse(bundle.project.spec),attachments=(raw.attachments||[]).map((a:unknown)=>attachmentSchema.parse(a)) as Attachment[];validateSourceChains(attachments);
 must(bundle.members.length<=5000&&attachments.length===bundle.attachments.length,'จำนวนสมาชิกหรือไฟล์กู้คืนไม่ถูกต้อง');
 const codes=new Set<string>(),drawingNumbers=new Set<string>();for(const m of bundle.members){const code=memberSchema.parse(m).code;must(!codes.has(code),'Member no. ซ้ำใน Backup');codes.add(code);if(m.drawingSetup?.number){const key=drawingNumberKey(m.drawingSetup.number);must(!drawingNumbers.has(key),'เลขแบบ BBS ซ้ำใน Backup');drawingNumbers.add(key);}}
 for(const m of bundle.members)if(m.sourceSchedule)must(typeof raw.attachmentIds?.[m.sourceSchedule.attachmentId]==='string','ไม่พบรหัสไฟล์ใหม่ของตารางเทียบ BBS');
 const memberIds=new Set(bundle.members.map(m=>m.id));must(attachments.every(a=>!a.memberId||memberIds.has(a.memberId)),'ไม่พบสมาชิกเจ้าของไฟล์ใน Backup');
 const entries:Entry[]=[],ids=new Set<string>();
 const add=(collection:string,id:string,value:Record<string,any>)=>{must(/^[a-zA-Z0-9_-]{1,80}$/.test(id)&&!ids.has(collection+'/'+id),'รหัสกู้คืนซ้ำหรือไม่ถูกต้อง');ids.add(collection+'/'+id);must(new TextEncoder().encode(JSON.stringify(encode(value))).length<900000,'แบ่งข้อมูลกู้คืน: เอกสารเกิน 900 KB');entries.push({collection,id,data:clean(value)});};
 for(const value of bundle.members){const m=memberSchema.parse(value),errors=validateMember(m,spec);must(!errors.length,`${m.code}: ${errors.join('\n')}`);add('members',m.id,{...m,...(m.quantityBasis?{quantityBasis:provisionalQuantityBasis(m.quantityBasis.reference)}:{}),...(m.sourceSchedule?{sourceSchedule:{...m.sourceSchedule,attachmentId:raw.attachmentIds[m.sourceSchedule.attachmentId]}}:{}),status:'Draft',version:1,updatedAt:now(),bars:m.bars.map(b=>({...b,placementConfirmed:false,...(b.bsDimensionsConfirmed!==undefined?{bsDimensionsConfirmed:false}:{})}))});}
 for(const a of attachments){
  must(a.path.startsWith(`projects/${pid}/files/${a.id}/`),'ไฟล์กู้คืนไม่ตรงโครงการ');const originalId=Object.entries(raw.attachmentIds||{}).find(([,newId])=>newId===a.id)?.[0];must(originalId&&raw.fileHashes?.[originalId],'ไม่มี checksum แบบต้นทาง');const blob=await getBlob(ref(storage,a.path));must(blob.size===a.size&&await sha256(await blob.arrayBuffer())===raw.fileHashes[originalId],'ไฟล์กู้คืน checksum ไม่ตรง');
  const next={...await verifiedAttachment(pid,a),version:1};if(next.sourceIntake)next.sourceIntake={...next.sourceIntake,review:undefined};if(next.sourceRevision)next.sourceRevision={...next.sourceRevision,review:undefined};add('attachments',a.id,next);
 }
 const mappedFiles=entries.filter(e=>e.collection==='attachments').map(e=>e.data as Attachment);
 for(const e of entries.filter(e=>e.collection==='members')){const problems=sourceScheduleFileProblems(memberSchema.parse(e.data),mappedFiles);must(!problems.length,problems.join(' · '));}
 for(const s of bundle.stock||[]){must(Number.isFinite(s.length)&&s.length>0&&s.length<=50000&&Number.isInteger(s.quantity)&&s.quantity>=0&&s.quantity<=100000&&s.diameter>0&&s.diameter<=100&&typeof s.grade==='string'&&s.grade.length>0,'ข้อมูลสต็อก Backup ไม่ถูกต้อง');add('stock',s.id,{...s,reserved:0,version:1});}
 for(const l of bundle.stockLedger||[])add('stockLedger',l.id,{...l,importedFrom:bundle.project.id});
 for(const c of bundle.cutPlans||[])add('cutPlans',c.id,{...c,status:c.status==='Consumed'?'Consumed':'Cancelled',importedFrom:bundle.project.id});
 const records=raw.historyRecords||[],index=bundle.historyIndex||[],fileRefs=raw.historyFileRefs||[];must(records.length===index.length&&records.length<=10000&&new Set(records.map((r:any)=>r.collection+'/'+r.id)).size===records.length,'ประวัติ Backup ไม่ครบ ซ้ำ หรือเกิน 10,000 รายการ');
 const indexed=new Map(index.map(i=>[i.collection+'/'+i.id,i.digest]));for(const r of records)must(restoreHistoryCollections.includes(r.collection)&&indexed.get(r.collection+'/'+r.id)===await digestData(r.data),'ประวัติ Backup checksum ไม่ตรง');
 const fileMap=new Map<string,SnapshotFile&{originalPath:string}>();for(const f of fileRefs){must(f.path.startsWith(`projects/${pid}/archive/`)&&!fileMap.has(f.originalPath),'ไฟล์ประวัติไม่ตรงโครงการหรือซ้ำ');const blob=await getBlob(ref(storage,f.path));must(blob.size===f.size&&await sha256(await blob.arrayBuffer())===f.sha256,'ไฟล์ประวัติ checksum ไม่ตรง');fileMap.set(f.originalPath,f);}
 for(const [i,r] of records.entries()){
  const refs=historyFileReferences(r);
  const sourceRefs=refs.map((f:SnapshotFile)=>{const restored=fileMap.get(f.path);must(restored&&restored.size===f.size&&restored.sha256===f.sha256,'ไฟล์ประวัติอ้างอิงไม่ครบ');return restored;});
  add('importedHistory',`${id}-${i}`,{id:`${id}-${i}`,originalCollection:r.collection,originalId:r.id,data:r.data,importedFrom:bundle.project.id,importedAt:now(),sourceRefs});
 }
 must(entries.length<=20000,'แบ่ง Backup: จำนวนเอกสารกู้คืนเกิน 20,000 รายการ');
 must(new TextEncoder().encode(JSON.stringify(entries.map(e=>e.collection+'/'+e.id))).length<700000,'แบ่ง Backup: ดัชนีรายการกู้คืนเกิน 700 KB');
 const manifest:Manifest={id,projectId:pid,sourceProjectId:bundle.project.id,sourceVersion:p.version,entries,projectPatch:{spec:{...spec,approved:false,evidenceFileId:''},titleBlock:titleBlockSchema.parse(bundle.project.titleBlock),drawingProfile:bundle.project.drawingProfile?drawingProfileSchema.parse(bundle.project.drawingProfile):null}},file=await writeManifest(pid,'restore-manifests',manifest);
 return projectTransaction('beginRestore',pid,data,id,['admin'],async(tx,current)=>{
  must(current.version===p.version&&current.stockEpoch===p.stockEpoch&&current.historyEpoch===p.historyEpoch,'โครงการเปลี่ยนระหว่างเตรียม Restore','aborted');const job={id,status:'Importing' as const,completed:0,total:entries.length,manifest:file,sourceVersion:p.version,createdBy:u.uid,createdAt:now(),recordKeys:entries.map(e=>e.collection+'/'+e.id)};
  tx.set(recordRef(pid,'restoreJobs',id),encode(job));tx.update(projectRef(pid),{restoreState:state(job),historyEpoch:id});return state(job);
 });
}
export async function advanceDirectRestore(action:string,pid:string,data:Record<string,any>,id:string){
 const jr=recordRef(pid,'restoreJobs',data.jobId),js=await getDoc(jr);must(js.exists(),'ไม่พบงาน Restore');const initial=decodeStorage(js.data()) as Job,manifest=await readManifest<Manifest>(pid,initial.manifest);must(manifest.id===initial.id&&manifest.projectId===pid,'Manifest ไม่ตรง Restore');
 return projectTransaction(action,pid,data,id,['admin'],async(tx,p)=>{
  const s=await tx.get(jr);must(s.exists(),'ไม่พบงาน');const job=decodeStorage(s.data()) as Job;if(['Complete','Cancelled'].includes(job.status))return state(job);must(p.restoreState?.id===job.id,'งาน Restore ไม่ตรงโครงการ');
  const cancelling=action==='cancelRestore'||job.status==='Cancelling',start=cancelling?(job.cancelCompleted||0):job.completed,total=cancelling?(job.cancelTotal??job.completed):job.total,list=chunk(manifest.entries.slice(0,total),start,e=>new TextEncoder().encode(JSON.stringify(encode(e.data))).length),snapshots=await Promise.all(list.map(e=>tx.get(recordRef(pid,e.collection,e.id))));
 snapshots.forEach(s=>must(cancelling?s.exists():!s.exists(),'ข้อมูลเป้าหมายเปลี่ยนระหว่าง Restore','aborted'));
  for(const e of list){if(cancelling)tx.delete(recordRef(pid,e.collection,e.id));else tx.set(recordRef(pid,e.collection,e.id),encode(e.data));}
  const end=start+list.length,complete=end===total,next:Job={...job,status:complete?(cancelling?'Cancelled':'Complete'):(cancelling?'Cancelling':'Importing'),...(cancelling?{cancelTotal:total,cancelCompleted:end}:{completed:end})},result=state(next);
  tx.update(jr,encode({status:next.status,completed:next.completed,...(cancelling?{cancelTotal:total,cancelCompleted:end}:{}),...(complete?{completedAt:now()}:{})}));
  tx.update(projectRef(pid),encode({restoreState:result,historyEpoch:id,...(complete&&!cancelling?{...manifest.projectPatch,version:p.version+1,stockEpoch:id}:{})}));return result;
 },true);
}
