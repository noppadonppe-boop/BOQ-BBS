import {z} from 'zod';
import type {Member,Spec} from './model';
import {canonical} from './canonical';
import {takeoff} from './engine';
import {resetStaleQuantityBasis} from './quantityBasis';
import {resetStaleNoRebar} from './reinforcementCoverage';
import {guessLevel,locIssues,locationTree,occurrenceLocSchema,withLoc,type LocationNode,type LocationTree,type Locations,type OccurrenceLoc} from './locations';

// Member migration into the Location / WBS tree: every distinct (zone, floor) label pair of the occurrences is mapped once
// to {building, level, zone, segment}; the plan writes occurrence.loc (+ building label) and, with relabel, replaces the
// zone / floor text by the WBS codes. Runs through the resumable spec-change job (manifest, rollback).
const text=z.string().max(80);
export const wbsMigrationSchema=z.object({
 version:z.number().int().nonnegative(),locationsVersion:z.number().int().nonnegative(),
 combos:z.array(z.object({zone:text,floor:text,loc:occurrenceLocSchema}).strict()).min(1).max(5000),
 relabel:z.boolean(),onlyUnlinked:z.boolean(),note:z.string().trim().min(1).max(500),
}).strict().superRefine((v,c)=>{const seen=new Set<string>();v.combos.forEach((x,i)=>{const k=comboKey(x.zone,x.floor);if(seen.has(k))c.addIssue({code:'custom',path:['combos',i],message:'คู่ Zone / ชั้นซ้ำ'});seen.add(k);});});
export type WbsMigration=z.infer<typeof wbsMigrationSchema>;
export type WbsCombo=WbsMigration['combos'][number];
export const comboKey=(zone:string,floor:string)=>JSON.stringify([zone.trim(),floor.trim()]);
type Occ=Member['occurrences'][number];

/** Distinct (zone, floor) pairs with row / quantity counts and the rows already linked. */
export function wbsCombos(members:Pick<Member,'occurrences'>[]){
 const out=new Map<string,{zone:string;floor:string;rows:number;quantity:number;linked:number;loc?:OccurrenceLoc}>();
 for(const m of members)for(const o of m.occurrences){
  const k=comboKey(o.zone,o.floor),c=out.get(k)||{zone:o.zone.trim(),floor:o.floor.trim(),rows:0,quantity:0,linked:0};
  c.rows++;c.quantity+=o.quantity;if(o.loc){c.linked++;c.loc??=o.loc;}out.set(k,c);
 }
 return [...out.values()].sort((a,b)=>(guessLevel(a.floor)?.rank??5000)-(guessLevel(b.floor)?.rank??5000)||a.floor.localeCompare(b.floor,'th',{numeric:true})||a.zone.localeCompare(b.zone,'th',{numeric:true}));
}
const same=(label:string,n:LocationNode)=>{const s=label.trim().toUpperCase();return !!s&&(s===n.code.toUpperCase()||s===n.name.trim().toUpperCase());};
/** First guess for one pair: building from the zone label (or the only building), level / segment from the floor label, zone. */
export function guessCombo(tree:LocationTree,zone:string,floor:string):OccurrenceLoc{
 const roots=tree.roots.filter(r=>!r.archived),byZone=roots.find(r=>same(zone,r)),root=byZone||(roots.length===1?roots[0]:undefined);
 if(!root)return {};
 const kids=tree.children(root.id),g=guessLevel(floor);
 const level=kids.find(n=>n.kind==='level'&&same(floor,n))||(g?kids.find(n=>n.kind==='level'&&guessLevel(n.code)?.code===g.code):undefined);
 const segment=level?undefined:kids.find(n=>n.kind==='segment'&&same(floor,n));
 const z=byZone?undefined:kids.find(n=>n.kind==='zone'&&same(zone,n));
 return {building:root.id,...(level?{level:level.id}:{}),...(segment?{segment:segment.id}:{}),...(z?{zone:z.id}:{})};
}
/** Problems of a target (empty = valid; no building = pair left unlinked). */
export const comboIssues=locIssues;
function relocate(tree:LocationTree,o:Occ,loc:OccurrenceLoc,relabel:boolean):Occ{
 const n=withLoc(tree,o,loc);return relabel?n:{...n,zone:o.zone,floor:o.floor};
}
export function wbsMigrationPlan(members:Member[],locations:Locations|undefined,spec:Spec,input:WbsMigration){
 const change=wbsMigrationSchema.parse(input),tree=locationTree(locations),map=new Map<string,OccurrenceLoc>(),problems:string[]=[];
 for(const c of change.combos){if(!c.loc.building)continue;const issues=comboIssues(tree,c.loc);if(issues.length)problems.push(`${c.zone||'—'} / ${c.floor||'—'}: ${issues.join(' · ')}`);else map.set(comboKey(c.zone,c.floor),c.loc);}
 if(problems.length)throw Error(problems.slice(0,5).join('\n'));
 const pairs=members.flatMap(before=>{
  let touched=false;
  const occurrences=before.occurrences.map(o=>{const loc=map.get(comboKey(o.zone,o.floor));if(!loc||(change.onlyUnlinked&&o.loc))return structuredClone(o);const n=relocate(tree,o,loc,change.relabel);if(canonical(n)!==canonical(o))touched=true;return n;});
  if(!touched)return [];
  const after=resetStaleQuantityBasis(before,resetStaleNoRebar(before,{...structuredClone(before),occurrences}));
  // only labels that reports read changed → engineering review restarts like a Zone / floor rename
  const relabelled=before.occurrences.some((o,i)=>o.zone!==occurrences[i].zone||o.floor!==occurrences[i].floor);
  return [{id:before.id,before,after,relabelled}];
 });
 const rows=pairs.flatMap(p=>{const unit=takeoff(p.before,spec);return p.before.occurrences.flatMap((b,i)=>{const a=p.after.occurrences[i];return canonical(a)===canonical(b)?[]:[{memberId:p.id,memberCode:p.before.code,before:b,after:a,concrete:unit.concrete*b.quantity,rebar:unit.rebar*b.quantity}];});});
 return {change,pairs,rows,memberCount:pairs.length,rowCount:rows.length,relabelledCount:pairs.filter(p=>p.relabelled).length,quantity:rows.reduce((n,r)=>n+r.before.quantity,0),concrete:rows.reduce((n,r)=>n+r.concrete,0),rebar:rows.reduce((n,r)=>n+r.rebar,0),
  unlinked:members.reduce((n,m)=>n+m.occurrences.filter(o=>!o.loc&&!map.has(comboKey(o.zone,o.floor))).length,0)};
}
