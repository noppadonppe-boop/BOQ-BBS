import {provisionalQuantityBasis} from './quantityBasis';
import {memberSchema,attachmentSchema,specSchema,type SnapshotBundle,type Attachment} from './model';
import {drawingProfileSchema,titleBlockSchema} from './drawingStandard';
import {encodeStorage} from './storageCodec';
import {historyFileReferences,validateBackupStructure,type BackupHistoryRecord} from './restorePreflight';
import {sourceScheduleFileProblems} from './sourceSchedule';

export type RestoreFileRef={originalPath:string;path:string;name:string;size:number;contentType:string;sha256:string};
export type RestoreEntry={collection:string;id:string;data:Record<string,any>};
export function buildRestorePlan(bundle:SnapshotBundle,attachments:Attachment[],records:BackupHistoryRecord[],fileRefs:RestoreFileRef[],jobId:string,at:string,attachmentIds:Record<string,string>={}){
 validateBackupStructure(bundle,records,fileRefs.map(f=>({...f,key:f.path,path:f.originalPath})));
 if(attachments.length!==bundle.attachments.length)throw Error('จำนวนไฟล์กู้คืนไม่ตรง Backup');
 const entries:RestoreEntry[]=[],ids=new Set<string>(),add=(collection:string,id:string,value:Record<string,any>)=>{
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(collection+'/'+id))throw Error('รหัสกู้คืนซ้ำหรือไม่ถูกต้อง');ids.add(collection+'/'+id);
  if(new TextEncoder().encode(JSON.stringify(encodeStorage(value))).length>=900000)throw Error('แบ่งข้อมูลกู้คืน: เอกสารเกิน900KB');entries.push({collection,id,data:JSON.parse(JSON.stringify(value))});
 };
 for(const value of bundle.members){const m=memberSchema.parse(value);add('members',m.id,{...m,...(m.quantityBasis?{quantityBasis:provisionalQuantityBasis(m.quantityBasis.reference)}:{}),...(m.sourceSchedule?{sourceSchedule:{...m.sourceSchedule,attachmentId:attachmentIds[m.sourceSchedule.attachmentId]||m.sourceSchedule.attachmentId}}:{}),status:'Draft',version:1,updatedAt:at,bars:m.bars.map(b=>({...b,placementConfirmed:false,...(b.bsDimensionsConfirmed!==undefined?{bsDimensionsConfirmed:false}:{})}))});}
 for(const value of attachments){const a=attachmentSchema.parse(value),next={...a,version:1};if(next.sourceIntake)next.sourceIntake={...next.sourceIntake,review:undefined};if(next.sourceRevision)next.sourceRevision={...next.sourceRevision,review:undefined};add('attachments',a.id,next);}
 const mappedFiles=entries.filter(e=>e.collection==='attachments').map(e=>e.data as Attachment);
 for(const e of entries.filter(e=>e.collection==='members')){const errors=sourceScheduleFileProblems(memberSchema.parse(e.data),mappedFiles);if(errors.length)throw Error(errors.join(' · '));}
 for(const s of bundle.stock||[])add('stock',s.id,{...s,reserved:0,version:1});
 for(const l of bundle.stockLedger||[])add('stockLedger',l.id,{...l,importedFrom:bundle.project.id});
 for(const c of bundle.cutPlans||[])add('cutPlans',c.id,{...c,status:c.status==='Consumed'?'Consumed':'Cancelled',importedFrom:bundle.project.id});
 const fileMap=new Map(fileRefs.map(f=>[f.originalPath,f]));
 for(const [i,r] of records.entries()){const sourceRefs=historyFileReferences(r).map(f=>{const value=fileMap.get(f.path);if(!value||value.size!==f.size||value.sha256!==f.sha256)throw Error('ไฟล์ประวัติอ้างอิงไม่ครบ');return value;});const id=`${jobId}-${i}`;add('importedHistory',id,{id,originalCollection:r.collection,originalId:r.id,data:r.data,importedFrom:bundle.project.id,importedAt:at,sourceRefs});}
 if(entries.length>20000)throw Error('แบ่ง Backup: จำนวนเอกสารกู้คืนเกิน20,000รายการ');
 if(new TextEncoder().encode(JSON.stringify(entries.map(e=>e.collection+'/'+e.id))).length>=700000)throw Error('แบ่ง Backup: ดัชนีรายการกู้คืนเกิน700KB');
 const spec=specSchema.parse(bundle.project.spec);
 return {entries,projectPatch:{spec:{...spec,approved:false,evidenceFileId:''},titleBlock:titleBlockSchema.parse(bundle.project.titleBlock),drawingProfile:bundle.project.drawingProfile?drawingProfileSchema.parse(bundle.project.drawingProfile):null}};
}
