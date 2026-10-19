import {cutQuantityInput} from './cutPlanBasis';
import {quantityBasisState} from './quantityBasis';
import {validateAllocationSubset} from './cutBatch';
import type {CutBatch} from './cutBatch';
import {z} from 'zod';
import type {SnapshotBundle,Stock,ExportScope} from './model';
import type {CutPlanBasis,CutDemandRow} from './cutPlanBasis';
import {selectBundle} from './exportScope';
import {steelCoverage} from './reinforcementCoverage';
import {issuedReferenceSchema,type IssuedReference} from './publication';
import {selectedMembers} from './exportScope';
import {manufacturedAllocations,type CutExecutionState} from './cutReceipts';

export type CutAllocation={memberId:string;occurrenceId:string;barId:string;count:number};
export type CutPublication={issuedReference:IssuedReference;revisionNumber:string;allocations:CutAllocation[];batch?:CutBatch};
export const cutExecutionSchema=z.object({confirmedPlan:z.literal(true),note:z.string().trim().min(1).max(2000),offcutLocation:z.string().trim().min(1).max(200)}).strict();
export function captureCutAllocations(b:SnapshotBundle,scope:ExportScope){const rows:CutAllocation[]=[];let total=0;for(const m of selectedMembers(b.members,scope))for(const occurrence of m.occurrences)for(const bar of m.bars){const count=occurrence.quantity*bar.count;if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(total+=count)||rows.length>=100000)throw Error('ยอดชิ้นงานตามตำแหน่งไม่ถูกต้อง/เกิน100,000ตำแหน่ง');rows.push({memberId:m.id,occurrenceId:occurrence.id,barId:bar.id,count});}return rows;}
const allocationKey=(a:CutAllocation)=>JSON.stringify([a.memberId,a.occurrenceId,a.barId]);
export function assertCutAllocationsAvailable(plan:{id:string;issuedReference:IssuedReference;allocations:CutAllocation[]},other:{id:string;status:string;issuedReference?:IssuedReference;allocations?:CutAllocation[];executionState?:CutExecutionState}[],capacity:CutAllocation[]){
 const limits=new Map(capacity.map(a=>[allocationKey(a),a.count])),used=new Map<string,number>();
 const add=(rows:CutAllocation[]|undefined)=>{if(!Array.isArray(rows)||!rows.length||rows.length>100000)throw Error('แผนที่ใช้งานขาดฐานยอดชิ้นงานตามตำแหน่ง');for(const row of rows){const key=allocationKey(row);if(!Number.isSafeInteger(row.count)||row.count<1||!limits.has(key))throw Error('ฐานยอดชิ้นงานไม่ตรงฉบับ');used.set(key,(used.get(key)||0)+row.count);if(used.get(key)!>limits.get(key)!)throw Error('ชิ้นงาน Mark/ตำแหน่งนี้ถูกจองหรือตัดไปแล้ว ห้ามจองเกิน BBS ของฉบับ');}};
 for(const p of other)if(p.id!==plan.id&&p.issuedReference?.revisionId===plan.issuedReference.revisionId&&p.issuedReference.revisionDigest===plan.issuedReference.revisionDigest){if(['Reserved','Consumed'].includes(p.status))add(p.allocations);else if(p.status==='Cancelled'&&p.executionState)add(manufacturedAllocations(p as any));}
 add(plan.allocations);
}

// Production cutting uses saved cuts and frozen bar counts. It never reruns
// the geometry/BS engine to replace a released cutting length.
export function captureIssuedCutBasis(original:SnapshotBundle,stock:Stock[],scope:ExportScope,selection?:CutAllocation[]):CutPlanBasis{
 const b=selectBundle(original,scope);if(b.members.some(m=>quantityBasisState(m)==='Provisional'))throw Error('ฉบับ Issued มีจำนวนสมาชิกชั่วคราว ต้องตรวจฉบับก่อนวางแผนตัด');const demand:CutDemandRow[]=[],chosen=selection?validateAllocationSubset(selection,captureCutAllocations(original,scope)):undefined,counts=new Map<string,number>();for(const a of chosen||[]){const key=JSON.stringify([a.memberId,a.barId]);counts.set(key,(counts.get(key)||0)+a.count);}let total=0;
 for(const m of b.members){const quantity=m.occurrences.reduce((n,o)=>n+o.quantity,0),f=b.calculations?.[m.id];
  if(!f||f.quantity!==quantity||f.bars.length!==m.bars.length||new Set(f.bars.map(r=>r.id)).size!==f.bars.length)throw Error('ฉบับออกแล้วไม่มีฐาน BBS ที่ตรึงครบ');
  for(const bar of m.bars){const row=f.bars.find(r=>r.id===bar.id),count=chosen?(counts.get(JSON.stringify([m.id,bar.id]))||0):quantity*bar.count;
   if(chosen&&count===0)continue;
   if(!row||!Number.isFinite(row.cutLength)||row.cutLength<=0||!Number.isSafeInteger(count)||count<1||(total+=count)>100000)throw Error('ความยาวหรือจำนวนชิ้นใน Issued ไม่ถูกต้อง/เกิน100,000ชิ้น');
   demand.push({memberId:m.id,member:m.code,barId:bar.id,mark:bar.mark,diameter:bar.diameter,grade:bar.grade,length:row.cutLength,quantity:count});
  }
 }
 if(!demand.length)throw Error('ขอบเขต Issued ที่เลือกไม่มีเหล็กสำหรับตัด');
 const keys=new Set(demand.map(d=>JSON.stringify([d.diameter,d.grade])));
 return {version:1,project:{id:b.project.id,code:b.project.code,name:b.project.name,version:b.project.version},engineVersion:b.engineVersion!,spec:structuredClone(b.project.spec),members:b.members.map(m=>({id:m.id,code:m.code,version:m.version,...cutQuantityInput(original.members.find(x=>x.id===m.id)!),quantity:m.occurrences.reduce((n,o)=>n+o.quantity,0),sourceQuantity:original.members.find(x=>x.id===m.id)!.occurrences.reduce((n,o)=>n+o.quantity,0),coverage:steelCoverage(m,b)})),sources:b.attachments.filter(a=>a.sourceStatus!=='Superseded').map(a=>({id:a.id,sha256:a.sha256||'',path:a.path,size:a.size,name:a.name,revision:a.revision})),demand,stock:stock.filter(s=>keys.has(JSON.stringify([s.diameter,s.grade]))).map(s=>({...s}))};
}
export function cutPublicationLabel(p:Partial<CutPublication>){if(!p.issuedReference)return 'WORKING PROPOSAL / NOT FOR CONSTRUCTION';const r=issuedReferenceSchema.parse(p.issuedReference);return `Issued ${p.revisionNumber||r.revisionId} / ตามทะเบียนออกฉบับ`;}
