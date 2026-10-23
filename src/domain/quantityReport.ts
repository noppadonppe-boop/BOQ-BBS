import {quantityBasisCoverage} from './quantityBasis';
import {takeoff} from './engine';
import type {SnapshotBundle,ReportGroup} from './model';
import {reinforcementCoverage} from './reinforcementCoverage';
import {reportCategory} from './reportCategory';
export const BOQ_READINESS_POLICY='quantity-readiness-2.0';
export const COMPONENT_BOQ_READINESS_POLICY='quantity-readiness-3.0';
export const quantityKeys=['concrete','formwork','excavation','backfill','lean','rebar'] as const;
export type QuantityRow={key:string;label:string;category:string;unassigned:boolean;values:number[]};
export function quantityReport(bundle:SnapshotBundle,group:ReportGroup=bundle.scope?.group||'Member'){
 const totals=Array(7).fill(0);
 const rows=new Map<string,QuantityRow>(),rebar=new Map<string,{diameter:number;grade:string;weight:number;pieces:number}>();
 for(const m of bundle.members){
  const frozen=bundle.calculations?.[m.id],q=frozen||takeoff(m,bundle.project.spec),quantity=m.occurrences.reduce((n,o)=>n+o.quantity,0);
  if(q.quantity!==quantity)throw Error(`${m.code}: จำนวนสมาชิกในชุดส่งงานไม่ตรงฐานคำนวณ`);
  [1,...quantityKeys.map(k=>q[k])].forEach((value,i)=>totals[i]+=value*quantity);
  for(const o of m.occurrences){
   const raw=group==='Member'?m.id:group==='Category'?reportCategory(m):group==='Zone'?o.zone:group==='Floor'?o.floor:'Summary',key=group+':'+JSON.stringify(raw);
   const row=rows.get(key)||{key,label:group==='Member'?m.code:raw||'ไม่ระบุ',category:group==='Member'?reportCategory(m):'',unassigned:(group==='Zone'||group==='Floor')&&!raw,values:Array(7).fill(0)};
   [1,...quantityKeys.map(k=>q[k])].forEach((value,i)=>row.values[i]+=value*o.quantity);rows.set(key,row);
  }
  for(const b of m.bars){
   const weight=frozen?frozen.bars.find(r=>r.id===b.id)?.weight:('rows' in q?q.rows.find(r=>r.id===b.id)?.weight:undefined);
   if(weight===undefined||!Number.isFinite(weight))throw Error(`${m.code}/${b.mark}: ไม่มีน้ำหนักที่ตรวจได้ในชุดส่งงาน`);
   const key=JSON.stringify([b.diameter,b.grade]),r=rebar.get(key)||{diameter:b.diameter,grade:b.grade,weight:0,pieces:0};r.weight+=weight*quantity;r.pieces+=b.count*quantity;rebar.set(key,r);
  }
 }
 const quantityCoverage=quantityBasisCoverage(bundle,group),coverage=reinforcementCoverage(bundle,group),list=[...rows.values()].sort((a,b)=>a.label.localeCompare(b.label,'th',{numeric:true})||a.key.localeCompare(b.key)).map(row=>{const raw=JSON.parse(row.key.slice(group.length+1)),key=JSON.stringify([group,raw]),pending=coverage.groupPending.get(key)||0,provisional=quantityCoverage.groupPending.get(key)||0,componentPending=quantityCoverage.groupComponentPending.get(key)||Array(7).fill(0);return {...row,pendingQuantityMembers:provisional,pendingQuantityComponents:componentPending,completeValues:row.values.map((value,i)=>componentPending[i]||i===6&&pending?null:value),pendingRebarMembers:pending,completeRebar:pending||componentPending[6]?null:row.values[6]};});
 return {readinessPolicy:bundle.members.some(m=>m.quantityBasis?.version===2)?COMPONENT_BOQ_READINESS_POLICY:BOQ_READINESS_POLICY,group,rows:list,totals,quantityCoverage,completeTotals:totals.map((value,i)=>quantityCoverage.componentPending[i]||i===6&&!coverage.complete?null:value),coverage,completeRebar:coverage.complete&&!quantityCoverage.componentPending[6]?totals[6]:null,rebar:[...rebar.values()].sort((a,b)=>a.diameter-b.diameter||a.grade.localeCompare(b.grade)),memberCount:bundle.members.length,occurrenceCount:bundle.members.reduce((n,m)=>n+m.occurrences.length,0)};
}
