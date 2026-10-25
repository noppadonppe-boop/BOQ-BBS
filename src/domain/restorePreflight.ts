import {sourceScheduleFileProblems} from './sourceSchedule';
import {attachmentSchema,memberSchema,specSchema,categories,type SnapshotBundle,type Attachment} from './model';
import {validateMember} from './engine';
import {drawingNumberKey,drawingProfileSchema,titleBlockSchema} from './drawingStandard';
import {validateSourceChains} from './sourceRevisions';
import {locationIssues,locationsSchema,occurrenceLocProblems,type Locations} from './locations';
import {boqChaptersSchema,type BoqChapters} from './boqChapters';
/** WBS tree of a backup for the restore patch (version is bumped when applied). */
export const restoredLocations=(b:SnapshotBundle):{locations?:Locations}=>b.project.locations?{locations:locationsSchema.parse(b.project.locations)}:{};
/** Owner BOQ chapters of a backup for the restore patch. */
export const restoredBoqChapters=(b:SnapshotBundle):{boqChapters?:BoqChapters}=>b.project.boqChapters?{boqChapters:boqChaptersSchema.parse(b.project.boqChapters)}:{};
import type {z} from 'zod';

export const restoreEmptyCollections=['members','attachments','stock','stockLedger','cutPlans','importedHistory'] as const;
export const restoreHistoryCollections=['revisions','revisionStates','revisionEvents','exportJobs','importedHistory','specChangeJobs','submissionJobs','accessEvents','engineeringFixtures','engineeringFixtureRuns','operations'] as const;
export const restoreTargetAnchor=(p:{version:number;stockEpoch?:string;historyEpoch?:string;revisionCounter?:number})=>({version:p.version,stockEpoch:p.stockEpoch??null,historyEpoch:p.historyEpoch??null,revisionCounter:p.revisionCounter??0});
export type BackupHistoryRecord={collection:string;id:string;data:Record<string,any>};
export type BackupHistoryArtifact={key:string;path:string;originalPath?:string;name:string;size:number;sha256:string;contentType:string};
export function historyFileReferences(record:BackupHistoryRecord){const d=record.data;return [...(d.snapshot?[d.snapshot]:[]),...(record.collection==='operations'&&d.action==='prepareIssue'&&d.result?.snapshot?[d.result.snapshot]:[]),...(['specChangeJobs','submissionJobs'].includes(record.collection)&&d.manifest?[d.manifest]:[]),...(['exportJobs','submissionJobs'].includes(record.collection)&&d.file?[d.file]:[]),...(record.collection==='importedHistory'?d.sourceRefs||[]:[])];}
const recordId=/^[a-zA-Z0-9_-]{1,80}$/;const digest=/^[a-f0-9]{64}$/;
function ensure(ok:unknown,message:string):asserts ok{if(!ok)throw Error('Backup: '+message);}
function list(value:unknown,name:string,optional=false):any[]{ensure(Array.isArray(value)||optional&&value===undefined,name+' ต้องเป็นรายการ');return value as any[]||[];}
const validId=(v:unknown):v is string=>typeof v==='string'&&recordId.test(v);
function checked<T extends z.ZodTypeAny>(schema:T,value:unknown,label:string):z.infer<T>{const result=schema.safeParse(value);if(!result.success)throw Error('Backup '+label+': '+result.error.issues.slice(0,8).map(i=>i.path.join('.')+': '+i.message).join(' · '));return result.data;}
function uniqueIds(values:any[],name:string){const seen=new Set<string>();for(const v of values){ensure(v&&typeof v==='object'&&validId(v.id),name+' มีรหัสไม่ถูกต้อง');ensure(!seen.has(v.id),name+' มีรหัสซ้ำ');seen.add(v.id);}}

// Validation only. Never migrate the supplied bundle, restore grants, or change
// Frozen bytes. The direct command repeats role/target/file checks at commit.
export function validateBackupStructure(input:unknown,recordsInput:unknown=[],artifactsInput:unknown=[]){
 ensure(input&&typeof input==='object','ไม่มีข้อมูลโครงการ');const b=input as SnapshotBundle;
 ensure([1,2].includes(b.schemaVersion),'schema ไม่รองรับ');
 ensure(b.project&&validId(b.project.id)&&typeof b.project.code==='string'&&b.project.code.length>0&&typeof b.project.name==='string','ข้อมูลโครงการต้นทางไม่ถูกต้อง');
 const spec=checked(specSchema,b.project.spec,'สเป็ค');checked(titleBlockSchema,b.project.titleBlock,'กรอบชื่อแบบ');if(b.project.drawingProfile)checked(drawingProfileSchema,b.project.drawingProfile,'กรอบเจ้าของงาน');
 // WBS tree + every member link into it (links of a backup always point at the backup's own tree)
 if(b.project.boqChapters)checked(boqChaptersSchema,b.project.boqChapters,'หมวด BOQ');
 if(b.project.locations){const issues=locationIssues(checked(locationsSchema,b.project.locations,'โครงสร้าง WBS'));ensure(!issues.length,'โครงสร้าง WBS: '+issues.slice(0,3).join(' · '));}
 for(const m of Array.isArray(b.members)?b.members:[])if(Array.isArray(m?.occurrences)&&m.occurrences.some(o=>o?.loc)){const p=occurrenceLocProblems(b.project.locations,m.occurrences);ensure(!p.length,`${m.code}: ${p.slice(0,2).join(' · ')}`);}
 const members=list(b.members,'สมาชิก'),attachments=list(b.attachments,'ไฟล์ต้นทาง'),stock=list(b.stock,'สต็อก',true),ledger=list(b.stockLedger,'รายการสต็อก',true),cuts=list(b.cutPlans,'แผนตัด',true),records=list(recordsInput,'ประวัติ'),artifacts=list(artifactsInput,'ไฟล์ประวัติ'),index=list(b.historyIndex,'ดัชนีประวัติ',true);
 ensure(members.length<=5000,'สมาชิกเกิน5,000รายการ');ensure(records.length<=10000&&index.length===records.length,'ประวัติไม่ครบหรือเกิน10,000รายการ');
 for(const [values,name] of [[members,'สมาชิก'],[attachments,'ไฟล์ต้นทาง'],[stock,'สต็อก'],[ledger,'รายการสต็อก'],[cuts,'แผนตัด']] as const)uniqueIds(values,name);
 ensure(members.length+attachments.length+stock.length+ledger.length+cuts.length+records.length<=20000,'ข้อมูลกู้คืนเกิน20,000รายการ');
 const memberIds=new Set(members.map(m=>m.id)),codes=new Set<string>(),numbers=new Set<string>();
 for(const value of members){const m=checked(memberSchema,value,'สมาชิก '+(value.code||value.id));ensure(!codes.has(m.code),'Member no. ซ้ำ: '+m.code);codes.add(m.code);if(m.drawingSetup?.number){const key=drawingNumberKey(m.drawingSetup.number);ensure(!numbers.has(key),'เลขแบบ BBS ซ้ำ: '+m.drawingSetup.number);numbers.add(key);}const errors=validateMember(m,spec);ensure(!errors.length,m.code+': '+errors.join('\n'));}
 const parsedAttachments=attachments.map(a=>checked(attachmentSchema,a,'แบบต้นทาง')) as Attachment[];validateSourceChains(parsedAttachments);ensure(parsedAttachments.every(a=>!a.memberId||memberIds.has(a.memberId)),'ไม่พบสมาชิกเจ้าของไฟล์');
 for(const member of members){const errors=sourceScheduleFileProblems(member,parsedAttachments);ensure(!errors.length,errors.join(' · '));}
 for(const s of stock)ensure(Number.isFinite(s.length)&&s.length>0&&s.length<=50000&&Number.isInteger(s.quantity)&&s.quantity>=0&&s.quantity<=100000&&s.diameter>0&&s.diameter<=100&&typeof s.grade==='string'&&s.grade.length>0,'ข้อมูลสต็อกไม่ถูกต้อง');
 const keys=new Set<string>();for(const r of records){ensure(r&&restoreHistoryCollections.includes(r.collection)&&validId(r.id)&&r.data&&typeof r.data==='object','ประวัติมีประเภทหรือรหัสไม่ถูกต้อง');const key=r.collection+'/'+r.id;ensure(!keys.has(key),'ประวัติซ้ำ');keys.add(key);}
 const indexed=new Set<string>();for(const i of index){ensure(i&&restoreHistoryCollections.includes(i.collection)&&validId(i.id)&&digest.test(i.digest),'ดัชนีประวัติไม่ถูกต้อง');const key=i.collection+'/'+i.id;ensure(!indexed.has(key)&&keys.has(key),'ดัชนีประวัติซ้ำหรือไม่ครบ');indexed.add(key);}
 const fileMap=new Map<string,BackupHistoryArtifact>(),zipKeys=new Set<string>();
 for(const f of artifacts){ensure(f&&typeof f.key==='string'&&typeof f.path==='string'&&typeof f.name==='string'&&f.name.length>0&&Number.isFinite(f.size)&&f.size>0&&digest.test(f.sha256)&&typeof f.contentType==='string','ข้อมูลไฟล์ประวัติไม่ถูกต้อง');const original=f.originalPath||f.path;ensure(!fileMap.has(original)&&!zipKeys.has(f.key),'ไฟล์ประวัติซ้ำ');fileMap.set(original,f);zipKeys.add(f.key);}
 for(const r of records)for(const f of historyFileReferences(r)){const found=fileMap.get(f.path);ensure(found&&found.size===f.size&&found.sha256===f.sha256,'ไฟล์ประวัติอ้างอิงไม่ครบหรือขนาด/checksumไม่ตรง');}
 return {source:{id:b.project.id,code:b.project.code,name:b.project.name,createdAt:typeof b.createdAt==='string'?b.createdAt:'',version:Number.isInteger(b.version)?b.version:null,engineVersion:typeof b.engineVersion==='string'?b.engineVersion:'Legacy',minimumStandard:spec.minimumStandard||'Project defined'},
  counts:{members:members.length,instances:members.reduce((sum,m)=>sum+m.occurrences.reduce((n:number,o:any)=>n+o.quantity,0),0),marks:members.reduce((n,m)=>n+m.bars.length,0),measurements:members.reduce((n,m)=>n+m.bars.reduce((k:number,bar:any)=>k+(bar.fabricationInspections?.length||0),0),0),attachments:attachments.length,stock:stock.length,ledger:ledger.length,cutPlans:cuts.length,history:records.length,historyFiles:artifacts.length},
  categories:categories.map(category=>({category,members:members.filter(m=>m.category===category).length})),zones:[...new Set(members.flatMap(m=>m.occurrences.map((o:any)=>o.zone||'ไม่ระบุ')))] as string[],floors:[...new Set(members.flatMap(m=>m.occurrences.map((o:any)=>o.floor||'ไม่ระบุ')))] as string[]};
}
