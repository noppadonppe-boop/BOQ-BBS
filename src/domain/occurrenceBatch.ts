import {resetStaleQuantityBasis} from './quantityBasis';
import {z} from 'zod';
import type {Member,Spec} from './model';
import {canonical} from './canonical';
import {takeoff} from './engine';
import {resetStaleNoRebar} from './reinforcementCoverage';
import {locIssues,locationTree,occurrenceLocSchema,unlinkLoc,withLoc,type LocationTree,type Locations} from './locations';
type Occ=Member['occurrences'][number];
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const text=z.string().max(80).refine(v=>v===''||v.trim()===v,'ข้อความต้องไม่มีช่องว่างต้นหรือท้าย');
export const occurrenceBatchSchema=z.object({
 version:z.number().int().nonnegative(),
 rows:z.array(z.object({memberId:id,occurrenceId:id}).strict()).min(1).max(10000),
 patch:z.object({zone:text.optional(),floor:text.optional(),grid:text.optional(),quantity:z.number().int().min(1).max(100000).optional(),loc:occurrenceLocSchema.optional()}).strict().refine(p=>Object.keys(p).length>0&&Object.values(p).every(v=>v!==undefined),'เลือกข้อมูลและระบุค่าของทุกช่องที่เลือก'),
 note:z.string().trim().min(1).max(500)
}).strict().superRefine((v,c)=>{const seen=new Set<string>();for(const [i,row]of v.rows.entries()){const key=JSON.stringify([row.memberId,row.occurrenceId]);if(seen.has(key))c.addIssue({code:'custom',path:['rows',i],message:'ตำแหน่งที่เลือกซ้ำ'});seen.add(key);}});
export type OccurrenceBatch=z.infer<typeof occurrenceBatchSchema>;
// patch.loc links the rows to WBS (labels follow the codes); a zone / floor text patch unlinks linked rows
function patched(o:Occ,patch:OccurrenceBatch['patch'],tree:LocationTree):Occ{
 const {loc,...text}=patch;if(loc)return withLoc(tree,{...o,...text},loc);
 const next={...o,...text};return text.zone!==undefined||text.floor!==undefined?unlinkLoc(next):next;
}
export function occurrenceBatchPlan(members:Member[],spec:Spec,input:OccurrenceBatch,locations?:Locations){
 const change=occurrenceBatchSchema.parse(input),byId=new Map(members.map(m=>[m.id,m])),selected=new Map<string,Set<string>>(),tree=locationTree(locations);
 if(change.patch.loc){const issues=change.patch.loc.building?locIssues(tree,change.patch.loc):['เลือกอาคาร / งานภายนอก'];if(issues.length)throw Error(issues.join(' · '));if(change.patch.zone!==undefined||change.patch.floor!==undefined)throw Error('ตั้งตำแหน่ง WBS แล้ว ไม่ต้องปรับ Zone / ชั้นแยก');}
 for(const row of change.rows){const member=byId.get(row.memberId);if(!member||!member.occurrences.some(o=>o.id===row.occurrenceId))throw Error('ไม่พบสมาชิกหรือตำแหน่งที่เลือกในโครงการนี้');const set=selected.get(row.memberId)||new Set<string>();set.add(row.occurrenceId);selected.set(row.memberId,set);}
 const pairs=members.filter(m=>selected.has(m.id)).flatMap(before=>{
  const ids=selected.get(before.id)!,after=resetStaleQuantityBasis(before,resetStaleNoRebar(before,{...structuredClone(before),occurrences:before.occurrences.map(o=>ids.has(o.id)?patched(o,change.patch,tree):structuredClone(o))}));
  return canonical(before.occurrences)===canonical(after.occurrences)?[]:[{id:before.id,before,after}];
 });
 const rows=pairs.flatMap(p=>{const unit=takeoff(p.before,spec);return p.before.occurrences.flatMap(before=>{const after=p.after.occurrences.find(o=>o.id===before.id)!;return canonical(before)===canonical(after)?[]:[{memberId:p.id,memberCode:p.before.code,before,after,concreteBefore:unit.concrete*before.quantity,concreteAfter:unit.concrete*after.quantity,formworkBefore:unit.formwork*before.quantity,formworkAfter:unit.formwork*after.quantity,rebarBefore:unit.rebar*before.quantity,rebarAfter:unit.rebar*after.quantity}];});});
 return {change,pairs,rows,memberCount:pairs.length,rowCount:rows.length,quantityBefore:rows.reduce((n,r)=>n+r.before.quantity,0),quantityAfter:rows.reduce((n,r)=>n+r.after.quantity,0),concreteBefore:rows.reduce((n,r)=>n+r.concreteBefore,0),concreteAfter:rows.reduce((n,r)=>n+r.concreteAfter,0),formworkBefore:rows.reduce((n,r)=>n+r.formworkBefore,0),formworkAfter:rows.reduce((n,r)=>n+r.formworkAfter,0),rebarBefore:rows.reduce((n,r)=>n+r.rebarBefore,0),rebarAfter:rows.reduce((n,r)=>n+r.rebarAfter,0)};
}
