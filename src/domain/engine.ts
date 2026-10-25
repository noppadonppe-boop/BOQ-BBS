import {quantityOnlyCategories} from './civilInputSchema';
import {declaredNoRebar} from './reinforcementScopeSchema';
import {CODE99_HOLD,CODE99_REVIEW_POLICY,type Code99Review} from './code99ReviewSchema';
import {FLAT_END_COVER_POLICY,polylineCoverSagitta} from './flatEndCover';
import {supportsPrismPolicy} from './prismSchema';
import {drawingViewProblems} from './drawingViews';
import {placeTemplate,placementProblems,coincidentPaths} from './barPlacement';
import {hasPlacementContext,placementGeometry,placementPathInside,placementContextProblems,placementClearance} from './placementContext';
import {beamAssemblyProblems} from './beamAssembly';
import {buriedConcreteBasis} from './earthwork';
import {siteQuantities} from './siteWork';
import {Member,Bar,Spec,Vec3,memberSchema,Stock} from './model';
import {boundsOf,solidsOf,solidQuantities,pathInside,pathClearance,pourStageQuantities} from './solids';
import {bsAssessment,bsEnabled} from './bs8666';
import {arcGeometry,arcNormal} from './arcGeometry';
import {helixGeometry} from './helixGeometry';
import {optimizeCuts,type Cut,type CuttingObjective,type CutProgress} from './cutOptimizer';
export type {Cut,Pattern} from './cutOptimizer';
export const sum=(a:number[])=>a.reduce((s,n)=>s+n,0);
const distance=(a:Vec3,b:Vec3)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const add=(a:Vec3,b:Vec3):Vec3=>a.map((n,i)=>n+b[i]) as Vec3;
const scale=(a:Vec3,n:number):Vec3=>a.map(x=>x*n) as Vec3;
const unit=(v:Vec3)=>scale(v,1/Math.hypot(...v));
const sub=(a:Vec3,b:Vec3):Vec3=>a.map((n,i)=>n-b[i]) as Vec3;
export function roundedPath(points:Vec3[],radius:number): {points:Vec3[];length:number;errors:string[]} {
 if(points.length<2)return {points,length:0,errors:['ต้องมีอย่างน้อย 2 จุด']};
 if(radius===0)return {points,length:sum(points.slice(1).map((p,i)=>distance(p,points[i]))),errors:[]};
 let length=sum(points.slice(1).map((p,i)=>distance(p,points[i]))),result:Vec3[]=[points[0]],errors:string[]=[];
 const trims:number[]=Array(points.length).fill(0);
 for(let i=1;i<points.length-1;i++){
  const p=points[i],left=sub(points[i-1],p),right=sub(points[i+1],p);
  if(Math.hypot(...left)<.001||Math.hypot(...right)<.001){errors.push('จุดดัดซ้ำ');continue;}
  const u=unit(left),v=unit(right),theta=Math.acos(Math.max(-1,Math.min(1,sum(u.map((n,j)=>n*v[j])))));
  if(theta>Math.PI-.00001){result.push(p);continue;}
  if(theta<.00001){errors.push('มุมดัดกลับ 180° ต้องระบุส่วนโค้งด้วยจุด');continue;}
  const trim=radius/Math.tan(theta/2);trims[i]=trim;
  if(trim>distance(p,points[i-1])||trim>distance(p,points[i+1]))errors.push('รัศมีดัดเกินความยาวช่วง');
  const first=add(p,scale(u,trim)),last=add(p,scale(v,trim));
  const center=add(p,scale(unit(add(u,v)),radius/Math.sin(theta/2)));
  const a=unit(sub(first,center)),b=unit(sub(last,center)),angle=Math.PI-theta;
  const perp=unit(sub(b,scale(a,Math.cos(angle))));
  result.push(first);
  for(let j=1;j<=12;j++){const t=angle*j/12;result.push(add(center,scale(add(scale(a,Math.cos(t)),scale(perp,Math.sin(t))),radius)));}
  length+=radius*angle-2*trim;
 }
 for(let i=1;i<points.length;i++)if(trims[i-1]+trims[i]>distance(points[i-1],points[i])+.001)errors.push('ส่วนโค้งดัดทับกัน');
 result.push(points.at(-1)!);return {points:result,length,errors};
}
export function barPaths(m:Member,b:Bar):Vec3[][] {
 if(!b.placementLayout)return legacyBarPaths(m,b);
 const template=legacyBarPaths(m,{...b,placementLayout:undefined,count:2})[0]||[];
 return placeTemplate(template,b.placementLayout);
}
// Analytic parameter tables describe the actual first bar, not the unplaced
// template. The first pose is identity; remaining poses never change this frame.
export function placedTemplateBar(m:Member,b:Bar):Bar {
 if(!b.placementLayout||!b.curve&&!b.helix)return b;
 const first=legacyBarPaths(m,{...b,placementLayout:undefined,count:2})[0]?.[0];if(!first)return b;
 const shift=b.placementLayout.anchor.map((n,i)=>n-first[i]),move=(p:Vec3)=>p.map((n,i)=>n+shift[i]) as Vec3;
 return {...b,...(b.curve?{curve:{...b.curve,center:move(b.curve.center)}}:{}),...(b.helix?{helix:{...b.helix,center:move(b.helix.center)}}:{})};
}
export function legacyBarPaths(m:Member,b:Bar):Vec3[][] {
 const target=b.targetSolidId?solidsOf(m).find(s=>s.id===b.targetSolidId):undefined;
 const d=target?target.size:m.geometry||m.prismGeometry?boundsOf(m):[m.x,m.y,m.z],origin=target?.origin||[0,0,0],a={X:0,Y:1,Z:2}[b.axis],dist=b.shape==='polyline'&&b.distributionAxis?{X:0,Y:1,Z:2}[b.distributionAxis]:b.shape==='link'?a:(a===0?1:0),c=m.cover+(b.outsideDiameter??b.diameter)/2;
 if(b.shape==='arc'){const geometry=arcGeometry(b);if(geometry.errors.length||!b.curve)return [];const n=arcNormal(b.curve),from=b.distributionStart||c,to=b.distributionEnd||d[a]-c;return Array.from({length:Math.max(0,Math.min(2000,Math.trunc(b.count)))},(_,i)=>{const position=b.count===1?from:from+(to-from)*i/(b.count-1);return geometry.points.map(p=>add(add(p,scale(n,position-from)),origin as Vec3));});}
 if(b.shape==='helix'){const geometry=helixGeometry(b);if(geometry.errors.length||!b.helix)return [];const n=b.helix.axis,span=b.distributionEnd-b.distributionStart;return Array.from({length:Math.max(0,Math.min(2000,Math.trunc(b.count)))},(_,i)=>geometry.points.map(p=>add(add(p,scale(n,b.count===1?0:span*i/(b.count-1))),origin as Vec3)));}
 // Offsets translate the template; optional offsetTurns first rotate it about the vertical
 // axis through its last point (e.g. column bars whose feet point away from the column centre).
 if(b.shape==='polyline'&&b.offsets?.length){const pivot=b.points.at(-1)||[0,0,0];return b.offsets.slice(0,Math.max(0,Math.min(2000,Math.trunc(b.count)))).map((o,i)=>{const t=(b.offsetTurns?.[i]||0)*Math.PI/180,c=Math.cos(t),s=Math.sin(t);return b.points.map(p=>{const dx=p[0]-pivot[0],dy=p[1]-pivot[1],q:Vec3=t?[pivot[0]+dx*c-dy*s,pivot[1]+dx*s+dy*c,p[2]]:p;return add(add(q,o),origin as Vec3);});});}
 const from=b.distributionStart||c,to=b.distributionEnd||d[dist]-c;
 const paths=Array.from({length:Math.max(0,Math.min(2000,Math.trunc(b.count)))},(_,i)=>{
  const position=b.count===1?(from+to)/2:from+(to-from)*i/(b.count-1);
  if(b.shape==='polyline')return b.points.map(p=>{const v=[...p] as Vec3;v[dist]+=position-from;return v;});
  const p:Vec3=[c,c,b.face==='top'?d[2]-c:b.face==='side'?d[2]/2:c];p[dist]=position;
  if(a===2)p[1]=b.face==='top'?d[1]-c:c;
  p[a]=c+b.start;const q=[...p] as Vec3;q[a]=d[a]-c-b.end;
  const tailAxis=a===2?1:2,sign=b.face==='top'?-1:1;
  if(b.shape==='L'){const r=[...q] as Vec3;r[tailAxis]+=sign*b.tail;return [p,q,r];}
  if(b.shape==='U'){const s=[...p] as Vec3,r=[...q] as Vec3;s[tailAxis]+=sign*b.tail;r[tailAxis]+=sign*b.tail;return [s,p,q,r];}
  if(b.shape==='link'){
   const axes=[0,1,2].filter(x=>x!==a),u=axes[0],v=axes[1];const pts:Vec3[]=[];
   for(const [hu,hv] of [[0,0],[1,0],[1,1],[0,1],[0,0]]){const t=[c,c,c] as Vec3;t[a]=position;t[u]=hu?d[u]-c:c;t[v]=hv?d[v]-c:c;pts.push(t);}
   if(b.tail){const h=[...pts[0]] as Vec3;h[u]+=b.tail/Math.sqrt(2);h[v]+=b.tail/Math.sqrt(2);pts.push(h);}
   return pts;
  }
  return [p,q];
 });return paths.map(path=>path.map(p=>add(p,origin as Vec3)));
}
export function schedule(m:Member,spec:Spec){return m.bars.map(b=>{
 const raw=barPaths(m,b),placed=placedTemplateBar(m,b),rounded=b.shape==='helix'?{...helixGeometry(b),points:raw[0]||[]}:b.shape==='arc'?{...arcGeometry(b),points:raw[0]||[]}:roundedPath(raw[0]||[],b.radius);
 const standard=bsAssessment(placed,raw[0]||[],spec),useFormula=standard.active&&b.lengthMethod==='bs8666'&&standard.formulaLength!==undefined;
 const calculatedLength=useFormula?standard.formulaLength!:rounded.length;
 const cut=b.cutOverride>0?b.cutOverride:Math.ceil((calculatedLength-.000001)/spec.rounding)*spec.rounding;
 const unitWeight=Math.PI*b.diameter*b.diameter/4*spec.density/1e6;
 return {...placed,paths:b.shape==='arc'||b.shape==='helix'?raw:raw.map(p=>roundedPath(p,b.radius).points),geometricLength:rounded.length,calculatedLength,lengthBasis:b.cutOverride>0?'Manual override':useFormula?'BS 8666:2000 code '+b.shapeCode+(standard.oblique?standard.oblique.exactRequired?' / Note 1 exact centerline':' / Note 1 approximate':standard.ovalLink?' / Table 1 oval link (closure pending)':standard.rectLink?' / Table 1 rectangular link (closure pending)':standard.semicircle?' / Table 1 semicircle coefficients':standard.arc?' / analytic centreline arc':standard.helix?standard.helix.exactRequired?' / pitch exact helix':' / Table 1 approximate helix':''):standard.active&&b.lengthMethod==='bs8666'?'Centerline fallback / BS pending':'Centerline',standard,cutLength:cut,eachWeight:cut/1000*unitWeight,weight:cut/1000*unitWeight*b.count,errors:rounded.errors};
});}
export function minimumProblems(m:Member,s:Spec,reviews:Code99Review[]=[]){return bsEnabled(s)?schedule(m,s).flatMap(b=>b.standard.problems.filter(p=>p!==CODE99_HOLD||s.code99ReviewPolicy!==CODE99_REVIEW_POLICY||!reviews.some(r=>r.memberId===m.id&&r.barId===b.id)).map(p=>`${b.mark}: ${p}`)):[];}
export function takeoff(m:Member,spec:Spec){
 // asphalt paving / precast pipes are quantity only (layers / pipe items): no concrete or formwork
 const geometry=quantityOnlyCategories.includes(m.category)?{...solidQuantities(m),volume:0,formwork:0}:solidQuantities(m),gross=geometry.volume,formGross=geometry.formwork;
 const concrete=gross-sum(m.deductions.map(d=>d.volume));
 const formwork=formGross-sum(m.deductions.map(d=>d.formwork));
 const e=m.excavation,dx=e.topX-e.bottomX,dy=e.topY-e.bottomY;
 // earthwork: footings, and shape-model members that carry site data (custom pile caps, pits, shafts …)
 const earth=m.category==='Foundation'||!!m.shapeModel?.site||m.civilInput?.kind==='pipe';
 const excavation=earth?e.depth*(e.bottomX*e.bottomY+(e.bottomX*dy+e.bottomY*dx)/2+dx*dy/3)/1e9:0;
 // lean concrete: footings / site work, and slabs or beams cast on ground (other members carry zero lean)
 const lean=m.lean.x*m.lean.y*m.lean.thickness/1e9;
 const buried=buriedConcreteBasis(m,spec,concrete).volume;
 const site=siteQuantities(m.siteWork),sand=site.sand;
 // sub-base sand inside the pit is not backfilled (same as lean concrete)
 const backfill=earth?excavation-lean-sand-buried:0;
 const rows=schedule(m,spec),rebar=sum(rows.map(r=>r.weight));
 const quantity=sum(m.occurrences.map(o=>o.quantity));
 return {quantity,concrete,formwork,excavation,lean,backfill,rebar,sand,sheet:site.sheet,compaction:site.compaction,extras:site.items,pourStages:pourStageQuantities(m),rows,gross,formGross,geometryErrors:geometry.errors,geometrySurfaces:geometry.surfaces,formulas:{concrete:m.shapeModel?'Σ ชั้นระดับ [พื้นที่ (union ชิ้นส่วนคอนกรีต − ช่องเปิด) × ความสูงชั้น] − manual deductions':m.prismGeometry?.version===4?'π × (outer radius² − inner radius²) × axis length − manual deductions':m.prismGeometry?.version===3?'Axis advance / 6 × (net start area + 4 × net mid area + net end area) − manual deductions':m.prismGeometry?.version===2?'(Outer polygon area − through-hole areas) × axis advance (not inclined run) − manual deductions':m.prismGeometry?'(Outer polygon area − through-hole areas) × extrusion length − manual deductions':m.geometry?'Union solids − geometric voids − manual deductions':`${m.x} × ${m.y} × ${m.z} / 10⁹ + pedestal − deductions`,formwork:'Σ ผิวภายนอกที่เลือก + ผิวช่องเปิดที่เลือก − manual deductions',excavation:'h × [Lb Wb + (Lb ΔW + Wb ΔL)/2 + ΔL ΔW/3] / 10⁹',backfill:sand>0?`${excavation} − ${lean} − ${sand} (ทราย) − ${buried}`:`${excavation} − ${lean} − ${buried}`,sand:'ทราย: กว้าง × ยาว × หนา / 10⁹',sheet:'พลาสติก: กว้าง × ยาว / 10⁶',compaction:'บดอัด: กว้าง × ยาว ก้นหลุม / 10⁶',rebar:'Σ (จำนวนต่อชิ้น × ความยาวตัด(m) × πd²ρ/4 × 10⁻⁶)'}};
}
export function validateMember(m:Member,spec:Spec):string[]{
 const parsed=memberSchema.safeParse(m);if(!parsed.success)return parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);
 if(m.prismGeometry&&!supportsPrismPolicy(spec.concreteGeometryPolicy,m.prismGeometry.version))return ['เลือกวิธีรูปทรงคอนกรีต '+(m.prismGeometry.version===4?'รุ่น 4 สำหรับหน้าตัดวงกลม':m.prismGeometry.version===3?'รุ่น 3 หรือ 4 สำหรับหน้าตัดเปลี่ยนขนาด':m.prismGeometry.version===2?'รุ่น 2, 3 หรือ 4 สำหรับแนวลากเอียง':'รุ่น 1, 2, 3 หรือ 4 สำหรับหน้าตัดหลายเหลี่ยม')+' และบันทึก General Spec ก่อน'];
 const earthworkProblems=buriedConcreteBasis(m,spec,0).problems;if(earthworkProblems.length)return earthworkProblems;
 const poseProblems=m.bars.flatMap(b=>placementProblems(b,spec).map(e=>b.mark+': '+e));if(poseProblems.length)return poseProblems;
 if(sum(m.bars.map(b=>b.count))>20000)return ['แยกสมาชิก: เกิน 20,000 ตำแหน่งเหล็กต่อสมาชิก'];
 const q=takeoff(m,spec),errors:string[]=[];
 if([q.concrete,q.formwork,q.excavation,q.backfill,q.lean,q.sand,q.sheet,q.compaction,q.rebar,...q.rows.flatMap(r=>[r.cutLength,r.geometricLength,r.eachWeight,r.weight])].some(n=>!Number.isFinite(n)))return ['ผลคำนวณเกินช่วงตัวเลข ตรวจมิติ สเกล ความยาวตัด และ Spec'];
 errors.push(...beamAssemblyProblems(m),...q.geometryErrors,...drawingViewProblems(m));if(!m.drawingViews&&m.sectionY!==undefined&&m.sectionY>boundsOf(m)[1])errors.push('แนวรูปตัด Y เกินสมาชิก');
 const placement=hasPlacementContext(m)?placementGeometry(m):{surfaces:q.geometrySurfaces,errors:[]};errors.push(...placementContextProblems(m));errors.push(...placement.errors.map(e=>`พื้นที่อ้างอิงรอยต่อ: ${e}`));
 const solids=solidsOf(m);if(new Set(solids.map(s=>s.id)).size!==solids.length)errors.push('รหัสชิ้นส่วนซ้ำ');
 if((m.geometry||m.prismGeometry||m.shapeModel)&&boundsOf(m).some((v,i)=>Math.abs(v-[m.x,m.y,m.z][i])>.001))errors.push('มิติรวมไม่ตรงขอบเขตชิ้นส่วน');
 if(m.cover*2>=Math.min(m.x,m.y,m.z))errors.push('ระยะ cover เกินมิติองค์ประกอบ');
 if(q.concrete<0||q.formwork<0||q.backfill<0)errors.push('ปริมาณสุทธิติดลบ ตรวจรายการหัก/ระดับขุด');
 if(m.pedestal.x>m.x||m.pedestal.y>m.y)errors.push('Pedestal เกินฐานราก');
 if(new Set(m.bars.map(b=>b.mark)).size!==m.bars.length)errors.push('Mark ซ้ำในสมาชิก');
 for(const row of q.rows){errors.push(...row.errors.map(e=>`${row.mark}: ${e}`));
  if(row.placementLayout&&coincidentPaths(row.paths))errors.push(`${row.mark}: มีแท่งเหล็กวางทับตำแหน่งเดียวกัน`);
  if(row.cutLength<=0)errors.push(`${row.mark}: ความยาวไม่ถูกต้อง`);
  if(row.targetSolidId&&!solids.some(s=>s.id===row.targetSolidId))errors.push(`${row.mark}: ไม่พบชิ้นส่วนเป้าหมาย`);
  if(row.paths.some(path=>!placementPathInside(m,path)))errors.push(`${row.mark}: ตำแหน่งเหล็กออกนอกคอนกรีตหรือผ่านช่องเปิด`);else if(row.paths.some(path=>!placementClearance(m,path,placement.surfaces,(row.outsideDiameter??row.diameter)/2+(row.shape==='helix'?helixGeometry(row).sagitta:row.shape==='arc'?arcGeometry(row).sagitta:spec.rebarCoverPolicy===FLAT_END_COVER_POLICY?polylineCoverSagitta(barPaths(m,row)[0]||[],row.radius):0),spec.rebarCoverPolicy===FLAT_END_COVER_POLICY&&!['arc','helix','link'].includes(row.shape))))errors.push(`${row.mark}: ระยะหุ้มถึงผิวเหล็กน้อยกว่า cover ที่ระบุ`);
 }
 return errors;
}
export function issueBlockers(members:Member[],spec:Spec,reviews:Code99Review[]=[]):string[]{
 const errors:string[]=[];
 for(const m of members)errors.push(...minimumProblems(m,spec,reviews).map(e=>`${m.code}: ${e}`));
 if(!spec.approved||!spec.bsEdition||!spec.aciEdition||!spec.ruleSource||!spec.ruleVersion||!spec.engineer||!spec.evidenceFileId||!spec.fixtureReferences)errors.push('รอชุดกฎวิศวกรรมและผลตรวจกรณีอ้างอิงที่อนุมัติ');
 if(!members.length)errors.push('ไม่มีสมาชิก');
 for(const m of members){errors.push(...validateMember(m,spec).map(e=>`${m.code}: ${e}`));if(m.status!=='ApprovedForIssue')errors.push(`${m.code}: ยังไม่ ApprovedForIssue`);if(!m.bars.length&&!declaredNoRebar(m))errors.push(`${m.code}: ไม่มี BBS หรือขอบเขตไม่มีเหล็กที่ชัดเจน`);for(const b of m.bars){if(!b.placementConfirmed)errors.push(`${m.code}/${b.mark}: รอยืนยันตำแหน่ง`);if(!b.shapeCode)errors.push(`${m.code}/${b.mark}: รอตรวจ Shape code`);if(b.shape!=='straight'&&b.radius<=0)errors.push(`${m.code}/${b.mark}: รอรัศมีดัดที่ตรวจแล้ว`);}}
 return errors;
}
export function cuttingDemand(members:Member[],spec:Spec):Cut[]{
 let count=0;for(const m of members){const qty=sum(m.occurrences.map(o=>o.quantity));for(const b of m.bars){const n=qty*b.count;if(!Number.isSafeInteger(n)||n<1||n>100000)throw Error('แยกแผนตัดให้เล็กลง: เกิน 100,000 ชิ้นต่อ Mark หรือจำนวนไม่ถูกต้อง');count+=n;if(count>100000)throw Error('แยกแผนตัดให้เล็กลง: เกิน 100,000 ชิ้น');}}
 const demand:Cut[]=[];for(const m of members){const qty=sum(m.occurrences.map(o=>o.quantity));for(const b of schedule(m,spec))for(let i=0;i<qty*b.count;i++)demand.push({member:m.code,memberId:m.id,mark:b.mark,barId:b.id,length:b.cutLength,diameter:b.diameter,grade:b.grade});}return demand;
}
export function optimize(members:Member[],spec:Spec,stock:Stock[],kerf:number,minOffcut:number,objective:CuttingObjective='material',onProgress?:(p:CutProgress)=>void){return optimizeCuts(cuttingDemand(members,spec),stock,kerf,minOffcut,objective,onProgress);}
