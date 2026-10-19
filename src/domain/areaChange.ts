import {z} from 'zod';
import type {Member,Spec,ExportScope} from './model';
import {takeoff} from './engine';
import {resetStaleNoRebar} from './reinforcementCoverage';
export const areaChangeSchema=z.object({version:z.number().int().nonnegative(),field:z.enum(['zone','floor']),from:z.string().max(80),to:z.string().max(80).refine(v=>v===''||v.trim()===v,'ชื่อปลายทางต้องไม่มีช่องว่างต้นหรือท้าย'),note:z.string().trim().min(1).max(500)}).strict().refine(v=>v.from!==v.to,'ชื่อเดิมและชื่อใหม่ต้องต่างกัน');
export type AreaChange= z.infer<typeof areaChangeSchema>;
export function movedAreaScope(scope:ExportScope,change:Pick<AreaChange,'field'|'from'|'to'>):ExportScope{
 const key=change.field,emptyKey=`${key}Unassigned` as 'zoneUnassigned'|'floorUnassigned';if(change.from?scope[key]!==change.from:!scope[emptyKey])return scope;
 const next={...scope};delete next[key];delete next[emptyKey];if(change.to)next[key]=change.to;else next[emptyKey]=true;return next;
}
export function areaChangePlan(members:Member[],spec:Spec,input:AreaChange){
 const change=areaChangeSchema.parse(input),pairs=members.filter(m=>m.occurrences.some(o=>o[change.field]===change.from)).map(before=>{
  const after=resetStaleNoRebar(before,{...structuredClone(before),occurrences:before.occurrences.map(o=>({...o,[change.field]:o[change.field]===change.from?change.to:o[change.field]}))});return {id:before.id,before,after};
 });
 const moved=pairs.flatMap(p=>{const q=takeoff(p.before,spec);return p.before.occurrences.filter(o=>o[change.field]===change.from).map(o=>({quantity:o.quantity,concrete:q.concrete*o.quantity,formwork:q.formwork*o.quantity,enteredRebar:q.rebar*o.quantity}));});
 return {change,pairs,memberCount:pairs.length,occurrenceCount:moved.length,quantity:moved.reduce((n,o)=>n+o.quantity,0),concrete:moved.reduce((n,o)=>n+o.concrete,0),formwork:moved.reduce((n,o)=>n+o.formwork,0),enteredRebar:moved.reduce((n,o)=>n+o.enteredRebar,0),existingDestination:members.some(m=>m.occurrences.some(o=>o[change.field]===change.to))};
}
