import {quantityBasisState,quantityComponentReady} from './quantityBasis';
import {memberFieldsSchema} from './model';
import type {Member,SnapshotBundle,ExportScope} from './model';
import {selectBundle} from './exportScope';
import {takeoff} from './engine';
import {steelCoverage} from './reinforcementCoverage';
import {canonical} from './canonical';

export const occurrencesSchema=memberFieldsSchema.shape.occurrences.superRefine((rows,c)=>{const seen=new Set<string>();for(const [i,row]of rows.entries()){if(seen.has(row.id))c.addIssue({code:'custom',path:[i,'id'],message:'รหัสตำแหน่งซ้ำ'});seen.add(row.id);}});
export function memberRegister(bundle:SnapshotBundle,scope:ExportScope={},search='',status=''){
 const selected=selectBundle(bundle,scope),term=search.trim().toLocaleLowerCase(),rows=selected.members.flatMap(m=>{
  if(status&&m.status!==status)return [];const q=selected.calculations?.[m.id]||takeoff(m,bundle.project.spec),coverage=steelCoverage(m,selected),quantityState=quantityBasisState(m);
  if(q.quantity!==m.occurrences.reduce((n,o)=>n+o.quantity,0))throw Error(`${m.code}: จำนวนตำแหน่งไม่ตรงฐานคำนวณ`);
  return m.occurrences.filter(o=>!term||[m.code,m.description,m.category,o.zone,o.floor,o.grid].some(s=>s.toLocaleLowerCase().includes(term))).map(o=>({memberId:m.id,memberCode:m.code,category:m.category,status:m.status,occurrence:o,marks:m.bars.length,quantityState,completeQuantity:quantityComponentReady({...m,occurrences:[o]},'count')?o.quantity:null,completeConcrete:quantityComponentReady({...m,occurrences:[o]},'concrete')?q.concrete*o.quantity:null,completeFormwork:quantityComponentReady({...m,occurrences:[o]},'formwork')?q.formwork*o.quantity:null,concrete:q.concrete*o.quantity,formwork:q.formwork*o.quantity,enteredRebar:q.rebar*o.quantity,completeRebar:coverage.complete&&quantityComponentReady({...m,occurrences:[o]},'rebar')?q.rebar*o.quantity:null,steelState:coverage.state}));
 }).sort((a,b)=>a.memberCode.localeCompare(b.memberCode,'th',{numeric:true})||a.occurrence.zone.localeCompare(b.occurrence.zone,'th',{numeric:true})||a.occurrence.floor.localeCompare(b.occurrence.floor,'th',{numeric:true})||a.occurrence.id.localeCompare(b.occurrence.id));
 return {rows,completeQuantity:rows.some(r=>r.completeQuantity===null)?null:rows.reduce((n,r)=>n+r.completeQuantity!,0),completeConcrete:rows.some(r=>r.completeConcrete===null)?null:rows.reduce((n,r)=>n+r.completeConcrete!,0),completeFormwork:rows.some(r=>r.completeFormwork===null)?null:rows.reduce((n,r)=>n+r.completeFormwork!,0),memberCount:new Set(rows.map(r=>r.memberId)).size,quantity:rows.reduce((n,r)=>n+r.occurrence.quantity,0),concrete:rows.reduce((n,r)=>n+r.concrete,0),formwork:rows.reduce((n,r)=>n+r.formwork,0),enteredRebar:rows.reduce((n,r)=>n+r.enteredRebar,0),completeRebar:rows.some(r=>r.completeRebar===null)?null:rows.reduce((n,r)=>n+r.completeRebar!,0)};
}
export function locationEdit(member:Member,rows:Member['occurrences']){
 const occurrences=occurrencesSchema.parse(rows);return {member:{...structuredClone(member),occurrences},changed:canonical(member.occurrences)!==canonical(occurrences)};
}
