import {z} from 'zod';
import {categories} from './model';
import type {ExportScope,Member,SnapshotBundle} from './model';

export const reportGroups=['Member','Category','Zone','Floor','Summary'] as const;
const optionalText=(max:number)=>z.preprocess(v=>v===''?undefined:v,z.string().max(max).optional());
export const exportScopeSchema=z.object({
 memberId:optionalText(80).refine(v=>!v||/^[a-zA-Z0-9_-]+$/.test(v),'Member id ไม่ถูกต้อง'),
 category:z.preprocess(v=>v===''?undefined:v,z.enum(categories).optional()),
 zone:optionalText(80),floor:optionalText(80),zoneUnassigned:z.boolean().optional(),floorUnassigned:z.boolean().optional(),group:z.enum(reportGroups).optional()
}).strict().superRefine((s,c)=>{for(const k of ['zone','floor'] as const)if(s[k]&&s[`${k}Unassigned`])c.addIssue({code:'custom',path:[k],message:'เลือกพื้นที่ที่ระบุชื่อหรือไม่ระบุอย่างใดอย่างหนึ่ง'});});
export function normalizeScope(input:unknown={}):ExportScope{
 const value=exportScopeSchema.parse(input);return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined&&v!==false)) as ExportScope;
}
export function hasSelection(scope:ExportScope){return !!(scope.memberId||scope.category||scope.zone||scope.floor||scope.zoneUnassigned||scope.floorUnassigned);}
export function selectedMembers(members:Member[],input:ExportScope):Member[]{
 const scope=normalizeScope(input);
 return members.filter(m=>(!scope.memberId||m.id===scope.memberId)&&(!scope.category||m.category===scope.category)).map(m=>({...m,occurrences:m.occurrences.filter(o=>(!scope.zone||o.zone===scope.zone)&&(!scope.floor||o.floor===scope.floor)&&(!scope.zoneUnassigned||o.zone==='')&&(!scope.floorUnassigned||o.floor===''))})).filter(m=>m.occurrences.length);
}
export function selectBundle(bundle:SnapshotBundle,input:ExportScope):SnapshotBundle{
 const scope=normalizeScope(input),members=selectedMembers(bundle.members,scope),ids=new Set(members.map(m=>m.id)),sourceMemberQuantities:NonNullable<SnapshotBundle['sourceMemberQuantities']>={};
 const area=!!(scope.zone||scope.floor||scope.zoneUnassigned||scope.floorUnassigned),calculations:SnapshotBundle['calculations']={};
 for(const m of members){
  const original=bundle.members.find(a=>a.id===m.id)!,record=bundle.calculations?.[m.id],quantity=m.occurrences.reduce((n,o)=>n+o.quantity,0);
  if(m.sourceSchedule?.basis==='allOccurrences'){
   const previous=bundle.sourceMemberQuantities?.[m.id];
   if(previous)sourceMemberQuantities[m.id]=previous;
   else if(!(bundle.scope?.zone||bundle.scope?.floor||bundle.scope?.zoneUnassigned||bundle.scope?.floorUnassigned))sourceMemberQuantities[m.id]={quantity:original.occurrences.reduce((n,o)=>n+o.quantity,0),memberVersion:original.version};
  }
  if(area&&bundle.status!=='Draft'&&!record)throw Error(`${m.code}: revision เก่าไม่มีฐานคำนวณที่ตรึงไว้สำหรับแยกพื้นที่ ดาวน์โหลดไฟล์เดิมหรือสร้าง revision ใหม่`);
  if(record){
   const originalQuantity=original.occurrences.reduce((n,o)=>n+o.quantity,0);
   if(!Number.isFinite(record.quantity)||record.quantity!==originalQuantity)throw Error(`${m.code}: จำนวนในฐานคำนวณไม่ตรงตำแหน่งที่ตรึงไว้`);
   // Per-member unit values and every stored cut/weight remain exactly frozen.
   calculations[m.id]={...record,quantity};
  }
 }
 return {...bundle,scope,members,...(bundle.code99Reviews?{code99Reviews:bundle.code99Reviews.filter(r=>ids.has(r.memberId))}:{}),...(Object.keys(sourceMemberQuantities).length||bundle.sourceMemberQuantities?{sourceMemberQuantities}:{}),attachments:bundle.attachments.filter(a=>!a.memberId||ids.has(a.memberId)),...(bundle.calculations?{calculations}:{})};
}
export function scopeLabel(scope:ExportScope={},members?:Pick<Member,'id'|'code'>[]):string{
 const s=normalizeScope(scope),parts=[];
 if(s.memberId)parts.push('Member: '+(members?.find(m=>m.id===s.memberId)?.code||s.memberId));if(s.category)parts.push('Category: '+s.category);
 for(const k of ['zone','floor'] as const)if(s[`${k}Unassigned`])parts.push(`${k==='zone'?'Zone':'Floor'}: ไม่ระบุ`);else if(s[k])parts.push(`${k==='zone'?'Zone':'Floor'}: ${JSON.stringify(s[k])}`);
 return parts.length?parts.join(' / '):'ทั้งโครงการ';
}
// Empty means all. JSON null represents unspecified; JSON strings cannot collide.
export function areaSelection(value:string):{value?:string;unassigned?:boolean}{if(value==='')return {};const parsed=JSON.parse(value);if(parsed===null)return {unassigned:true};if(typeof parsed!=='string'||!parsed)throw Error('พื้นที่ที่เลือกไม่ถูกต้อง');return {value:parsed};}
export function areaValue(scope:ExportScope,key:'zone'|'floor'){return scope[`${key}Unassigned`]?'null':scope[key]?JSON.stringify(scope[key]):'';}
