import type {Member,SnapshotBundle,ReportGroup} from './model';
import {canonical} from './canonical';
import {schedule} from './engine';
import {compareSourceSchedule} from './sourceSchedule';
import {sourceComparisonQuantity} from './sourceQuantityBasis';

export type SteelCoverageState='Unentered'|'SourcePending'|'Entered'|'DeclaredZero'|'Conflict';
export type SteelCoverage={memberId:string;memberCode:string;state:SteelCoverageState;complete:boolean;reasons:string[];basis:string};
export const steelCoverageLabels:Record<SteelCoverageState,string>={Unentered:'รอ BBS',SourcePending:'รอเทียบแบบ',Entered:'BBS ที่กรอก',DeclaredZero:'ไม่มีเหล็กตามขอบเขตที่ระบุ',Conflict:'ขอบเขตเหล็กขัดกับข้อมูล'};
export const steelCoverageEnglish:Record<SteelCoverageState,string>={Unentered:'BBS NOT ENTERED',SourcePending:'SOURCE COMPARISON PENDING',Entered:'ENTERED BBS',DeclaredZero:'DECLARED NO REBAR',Conflict:'CONFLICTING STEEL SCOPE'};
// Changing the physical/context/source definition invalidates a reused zero
// statement. Pricing/status changes alone do not change its physical scope.
export const reinforcementScopeKey=(m:Member)=>canonical([m.code,m.category,m.x,m.y,m.z,m.cover,m.geometry,m.prismGeometry,m.beamAssembly,m.pedestal,m.placementContext,m.occurrences,m.bars,m.sourceSchedule]);
export function resetStaleNoRebar(old:Member|undefined,next:Member):Member{
 if(old?.noRebar&&next.noRebar&&canonical(old.noRebar)===canonical(next.noRebar)&&reinforcementScopeKey(old)!==reinforcementScopeKey(next)){const result={...next};delete result.noRebar;return result;}return next;
}
export function steelCoverage(m:Member,b:Omit<Pick<SnapshotBundle,'project'|'attachments'|'calculations'|'sourceMemberQuantities'|'scope'>,'project'>&{project:Pick<SnapshotBundle['project'],'spec'>}):SteelCoverage{
 const base={memberId:m.id,memberCode:m.code,basis:m.noRebar?.basis||''};
 if(m.noRebar){if(m.bars.length||m.sourceSchedule)return {...base,state:'Conflict',complete:false,reasons:['ระบุว่าไม่มีเหล็ก แต่มี BBS หรือตารางเหล็กต้นทาง']};return {...base,state:'DeclaredZero',complete:true,reasons:[]};}
 if(!m.bars.length)return {...base,state:'Unentered',complete:false,reasons:[m.sourceSchedule?'ตารางต้นทางมีเหล็ก แต่ยังไม่ได้สร้าง BBS':'ยังไม่ได้กรอก BBS หรือระบุขอบเขตที่ไม่มีเหล็กเสริม']};
 if(m.sourceSchedule){
  const f=b.calculations?.[m.id],rows=f?m.bars.flatMap(bar=>{const r=f.bars.find(r=>r.id===bar.id);return r?[{...bar,cutLength:r.cutLength,weight:r.weight}]:[]}):schedule(m,b.project.spec);
  let referenceQuantity:number|undefined;try{referenceQuantity=sourceComparisonQuantity(m,b);}catch(e){return {...base,state:'SourcePending',complete:false,reasons:[e instanceof Error?e.message:'ฐานจำนวนต้นทางไม่ครบ']};}
  const result=compareSourceSchedule(m,rows,b.attachments||[],referenceQuantity)!;
  // This is arithmetic comparison precision, not an accepted engineering
  // tolerance. Printed rounding differences require a documented resolution.
  const weightProblems=result.rows.filter(r=>r.weightDifference!==undefined&&Math.abs(r.weightDifference)>1e-6).map(r=>r.source.mark+': น้ำหนัก BBS ต่างจากต้นทาง ยังไม่มีเกณฑ์ยอมรับ');
  for(const page of result.pageWeights)if(page.difference!==undefined&&Math.abs(page.difference)>1e-6)weightProblems.push('หน้า '+page.page+': น้ำหนักรวมที่ระบุในแบบต่างจากผลรวมแถวต้นทาง ยังไม่มีเกณฑ์ยอมรับ');
  if(!result.coreMatched||weightProblems.length)return {...base,state:'SourcePending',complete:false,reasons:[...result.sourceProblems,...result.rows.filter(r=>r.status!=='Matched').map(r=>r.source.mark+': '+(r.status==='Unmapped'?'ยังไม่จับคู่':r.status==='Missing bar'?'ไม่พบ BBS':r.differences.join(' / ')+' ต่างจากต้นทาง')),...result.extraBars.map(r=>r.mark+': ไม่มีแถวต้นทางที่จับคู่'),...weightProblems]};
 }
 return {...base,state:'Entered',complete:true,reasons:[]};
}
export function reinforcementCoverage(b:Pick<SnapshotBundle,'members'|'project'|'attachments'|'calculations'|'sourceMemberQuantities'|'scope'>,group:ReportGroup='Member'){
 const members=b.members.map(m=>steelCoverage(m,b)),pending=members.filter(m=>!m.complete),pendingIds=new Set(pending.map(m=>m.memberId)),groups=new Map<string,Set<string>>();
 for(const m of b.members)for(const o of m.occurrences){const raw=group==='Member'?m.id:group==='Category'?m.category:group==='Zone'?o.zone:group==='Floor'?o.floor:'Summary',key=JSON.stringify([group,raw]);const ids=groups.get(key)||new Set<string>();if(pendingIds.has(m.id))ids.add(m.id);groups.set(key,ids);}
 return {members,pending,complete:!pending.length,groupPending:new Map([...groups].map(([key,ids])=>[key,ids.size]))};
}
