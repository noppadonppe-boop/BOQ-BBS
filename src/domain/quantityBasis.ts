import {z} from 'zod';
import {sha256} from '@noble/hashes/sha2.js';
import type {Member,SnapshotBundle,ReportGroup} from './model';
import {canonical} from './canonical';
export const quantityComponents=['count','concrete','formwork','excavation','backfill','lean','rebar'] as const;
export type QuantityComponent=typeof quantityComponents[number];
export const quantityComponentLabels:Record<QuantityComponent,string>={count:'จำนวนองค์ประกอบ',concrete:'คอนกรีต',formwork:'แบบหล่อ',excavation:'ขุดดิน',backfill:'ดินถมกลับ',lean:'Lean concrete',rebar:'ปริมาณเหล็ก BBS ที่กรอก'};
const token=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const review=z.object({key:z.string().regex(/^[a-f0-9]{64}$/),reference:z.string().trim().min(1).max(500),reviewToken:token}).strict();
const countReview=review.extend({occurrences:z.array(z.object({id:token,quantity:z.number().int().min(1).max(100000)}).strict()).min(1).max(1000)}).superRefine((v,c)=>{if(new Set(v.occurrences.map(o=>o.id)).size!==v.occurrences.length)c.addIssue({code:'custom',message:'รายการจำนวนที่ตรวจซ้ำ'});});
const v1=z.object({version:z.literal(1),state:z.enum(['Provisional','Entered']),reference:z.string().trim().max(500),reviewToken:token.optional()}).strict().superRefine((v,c)=>{if(v.state==='Entered'&&(!v.reference||!v.reviewToken))c.addIssue({code:'custom',message:'ยืนยันข้อมูลปริมาณต้องมีที่มาและตัวตนการยืนยัน'});});
const v2=z.object({version:z.literal(2),state:z.literal('Partial'),reference:z.string().trim().max(500),reviews:z.object({count:countReview.optional(),concrete:review.optional(),formwork:review.optional(),excavation:review.optional(),backfill:review.optional(),lean:review.optional(),rebar:review.optional()}).strict()}).strict();
export const quantityBasisSchema=z.union([v1,v2]);
export const provisionalQuantityBasis=(reference='มิติเริ่มต้น/ข้อมูลชั่วคราว ยังไม่ยืนยันจากแบบ')=>({version:1 as const,state:'Provisional' as const,reference});
// Keep v1 review behavior and its historical input key unchanged.
export const quantityInputKey=(m:Member)=>canonical([m.code,m.category,m.x,m.y,m.z,m.faces,m.geometry,m.prismGeometry,m.beamAssembly,m.pedestal,m.excavation,m.lean,m.deductions,m.occurrences.map(o=>o.quantity)]);
const geometryInput=(m:Member)=>[m.x,m.y,m.z,m.geometry&&{solids:m.geometry.solids.map(({faces,...s})=>s),voids:m.geometry.voids.map(({faces,...s})=>s)},m.prismGeometry,m.beamAssembly,m.pedestal,m.deductions.map(d=>d.volume)];
export function quantityComponentInputKey(m:Member,component:QuantityComponent){
 const geometry=geometryInput(m),input=component==='count'?[]:component==='concrete'?geometry:component==='formwork'?[geometry,m.faces,m.geometry,m.prismGeometry,m.beamAssembly,m.deductions.map(d=>d.formwork)]:component==='excavation'?m.excavation:component==='lean'?m.lean:component==='backfill'?[geometry,m.excavation,m.lean]:[m.x,m.y,m.z,m.cover,m.geometry,m.prismGeometry,m.beamAssembly,m.placementContext,m.sourceSchedule,m.noRebar,m.bars.map(({placementConfirmed,bsDimensionsConfirmed,note,scheduleRevisionLetter,...b})=>b)];
 return Array.from(sha256(new TextEncoder().encode(canonical([m.code,m.category,component,input]))),b=>b.toString(16).padStart(2,'0')).join('');
}
export function quantityReviewedComponents(m:Member):boolean[]{
 if(m.quantityBasis===undefined)return quantityComponents.map(()=>true);
 const parsed=quantityBasisSchema.safeParse(m.quantityBasis);if(!parsed.success)return quantityComponents.map(()=>false);
 if(parsed.data.version===1){const entered=parsed.data.state==='Entered';return quantityComponents.map(()=>entered);}
 const reviews=parsed.data.reviews;
 return quantityComponents.map(component=>{const r=reviews[component];if(!r||r.key!==quantityComponentInputKey(m,component))return false;return component!=='count'||('occurrences' in r&&m.occurrences.every(o=>r.occurrences.some(p=>p.id===o.id&&p.quantity===o.quantity)));});
}
export const quantityComponentReviewed=(m:Member,component:QuantityComponent)=>quantityReviewedComponents(m)[quantityComponents.indexOf(component)];
export const quantityComponentReadiness=(m:Member)=>{const reviewed=quantityReviewedComponents(m);return reviewed.map((ready,i)=>reviewed[0]&&(i===0||ready));};
export const quantityComponentReady=(m:Member,component:QuantityComponent)=>quantityComponentReadiness(m)[quantityComponents.indexOf(component)];
export function reviewQuantityComponents(m:Member,components:QuantityComponent[],reference:string){
 if(!reference.trim()||!components.length)throw Error('ระบุที่มาและเลือกรายการที่ตรวจแล้ว');
 const selected=z.array(z.enum(quantityComponents)).min(1).max(7).parse(components),reviews:Record<string,unknown>={};
 if(m.quantityBasis?.version===2)for(const key of quantityComponents)if(quantityComponentReviewed(m,key))reviews[key]=m.quantityBasis.reviews[key];
 for(const key of selected)reviews[key]={key:quantityComponentInputKey(m,key),reference:reference.trim(),reviewToken:crypto.randomUUID(),...(key==='count'?{occurrences:m.occurrences.map(({id,quantity})=>({id,quantity}))}:{})};
 return quantityBasisSchema.parse({version:2,state:'Partial',reference:reference.trim(),reviews});
}
export function resetStaleQuantityBasis(old:Member|undefined,next:Member):Member{
 if(next.quantityBasis?.version===2){
  const reviews={...next.quantityBasis.reviews};
  for(const key of quantityComponents){const r=reviews[key];if(!r)continue;if(r.key!==quantityComponentInputKey(next,key)){delete reviews[key];continue;}if(key==='count'&&'occurrences' in r){const remaining=r.occurrences.filter(row=>next.occurrences.some(o=>o.id===row.id&&o.quantity===row.quantity));if(remaining.length)reviews.count={...r,occurrences:remaining};else delete reviews.count;}}
  return {...next,quantityBasis:{...next.quantityBasis,reviews}};
 }
 if(old?.quantityBasis?.state==='Entered'&&next.quantityBasis&&canonical(old.quantityBasis)===canonical(next.quantityBasis)&&quantityInputKey(old)!==quantityInputKey(next))return {...next,quantityBasis:provisionalQuantityBasis(old.quantityBasis.reference)};
 return next;
}
export const quantityBasisState=(m:Member):'Legacy'|'Entered'|'Provisional'=>m.quantityBasis===undefined?'Legacy':quantityReviewedComponents(m).every(Boolean)?'Entered':'Provisional';
export const quantityBasisEnglish=(m:Member)=>m.quantityBasis?.version===2&&quantityBasisState(m)==='Provisional'?'PARTIAL QUANTITY INPUT REVIEW':({Provisional:'PROVISIONAL QUANTITY INPUTS',Entered:'USER-ENTERED QUANTITY BASIS',Legacy:'LEGACY INPUTS / BASIS NOT RECORDED'}[quantityBasisState(m)]);
export function quantityBasisCoverage(b:Pick<SnapshotBundle,'members'>,group:ReportGroup='Member'){
 const ready=new Map(b.members.map(m=>[m,quantityComponentReadiness(m)])),pending=b.members.filter(m=>!ready.get(m)!.every(Boolean)),groups=new Map<string,Set<string>>(),componentGroups=new Map<string,Set<string>[]>();
 for(const m of b.members)for(const o of m.occurrences){
  const raw=group==='Member'?m.id:group==='Category'?m.category:group==='Zone'?o.zone:group==='Floor'?o.floor:'Summary',key=JSON.stringify([group,raw]),set=groups.get(key)||new Set<string>(),sets=componentGroups.get(key)||quantityComponents.map(()=>new Set<string>());
  if(!ready.get(m)!.every(Boolean))set.add(m.id);ready.get(m)!.forEach((value,i)=>{if(!value)sets[i].add(m.id);});groups.set(key,set);componentGroups.set(key,sets);
 }
 return {complete:!pending.length,pending,groupPending:new Map([...groups].map(([key,set])=>[key,set.size])),componentPending:quantityComponents.map((_,i)=>b.members.filter(m=>!ready.get(m)![i]).length),groupComponentPending:new Map([...componentGroups].map(([key,sets])=>[key,sets.map(set=>set.size)])),legacy:b.members.filter(m=>m.quantityBasis===undefined)};
}
