import {z} from 'zod';
import type {Member,Spec} from './model';
export const EARTHWORK_POLICY='earthwork-1.0' as const;
export const buriedConcreteInputSchema=z.discriminatedUnion('mode',[
 z.object({version:z.literal(1),mode:z.literal('automatic')}).strict(),
 z.object({version:z.literal(1),mode:z.literal('manual'),basis:z.string().trim().min(1,'ระบุที่มาของปริมาตรคอนกรีตใต้ระดับถม').max(500)}).strict(),
]);
export function buriedConcreteBasis(m:Member,s:Spec,netConcrete:number){
 const input=m.excavation.buriedInput;
 const problems:string[]=[];
 if(input){
  const parsed=buriedConcreteInputSchema.safeParse(input);
  if(!parsed.success)problems.push(...parsed.error.issues.map(i=>i.message));
  if(m.category!=='Foundation')problems.push('โหมดคอนกรีตใต้ระดับถมใช้กับ Foundation เท่านั้น');
  if(s.earthworkPolicy!==EARTHWORK_POLICY)problems.push('เปิดวิธีวัดงานดินรุ่น 1 ใน General Spec ก่อนใช้โหมดคอนกรีตใต้ระดับถม');
 }
 const mode:'legacy'|'automatic'|'manual'=input?.mode||'legacy';
 const volume=mode==='manual'?m.excavation.buriedConcrete:mode==='automatic'?netConcrete:m.excavation.buriedConcrete||netConcrete;
 const basis=mode==='manual'&&input?.mode==='manual'?input.basis:mode==='automatic'?'Net concrete of this member, including deductions':m.excavation.buriedConcrete===0?'Legacy zero: use net concrete automatically':'Legacy entered buried concrete volume';
 return {mode,volume,basis,problems};
}
