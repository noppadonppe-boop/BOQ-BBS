import {memberSchema,type Member,type Vec3} from './model';
import {barPaths,roundedPath} from './engine';
import {arcGeometry} from './arcGeometry';
import {helixGeometry} from './helixGeometry';
import {polylineCoverSagitta} from './flatEndCover';
import {solidsOf} from './solids';
const sub=(a:Vec3,b:Vec3)=>a.map((n,i)=>n-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,n,i)=>s+n*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const at=(a:Vec3,b:Vec3,t:number)=>a.map((n,i)=>n+(b[i]-n)*t) as Vec3;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export function closestSegments(a:Vec3,b:Vec3,c:Vec3,d:Vec3){
 const u=sub(b,a),v=sub(d,c),w=sub(a,c),lu=Math.hypot(...u),lv=Math.hypot(...v),uu=dot(u,u),vv=dot(v,v),candidates:[number,number][]=[];
 const onV=(p:Vec3)=>vv?clamp(dot(sub(p,c),v)/vv):0,onU=(p:Vec3)=>uu?clamp(dot(sub(p,a),u)/uu):0;
 candidates.push([0,onV(a)],[1,onV(b)],[onU(c),0],[onU(d),1]);
 if(lu&&lv){const un=u.map(n=>n/lu) as Vec3,vn=v.map(n=>n/lv) as Vec3,n=cross(un,vn),det=dot(n,n);if(det>1e-24){const s=dot(cross(vn,w),n)/det/lu,t=dot(cross(un,w),n)/det/lv;if(s>=0&&s<=1&&t>=0&&t<=1)candidates.push([s,t]);}}
 let best={distance:Infinity,s:0,t:0,a,c};for(const [s,t]of candidates){const p=at(a,b,s),q=at(c,d,t),distance=Math.hypot(...sub(p,q));if(distance<best.distance)best={distance,s,t,a:p,c:q};}return best;
}
export const INTERFERENCE_LIMITS={pieces:4000,segments:50000,comparisons:1000000,pairs:1000};
type Identity={barId:string;mark:string;piece:number;poseId:string};
type Segment={a:Vec3;b:Vec3;piece:number;radius:number;error:number;lo:Vec3;hi:Vec3};
export type InterferencePair={first:Identity;second:Identity;gapLower:number;gapUpper:number;distance:number;firstPoint:Vec3;secondPoint:Vec3;endpointCandidate:boolean;approximation:number};
export type InterferenceResult={status:'Complete'|'Incomplete'|'Unentered'|'Invalid';pieces:number;segments:number;comparisons:number;pairs:InterferencePair[];problems:string[];nominalFallbackMarks:string[]};
// Review circular bounds around the sampled model centrelines. End caps and
// curve sampling can produce candidates requiring a detailed physical review.
// Same-piece closure, code spacing, other members and occurrence copies are
// intentionally outside this calculation; no engineering pass is returned.
export function rebarInterference(input:Member,limits=INTERFERENCE_LIMITS):InterferenceResult{
 const result:InterferenceResult={status:'Complete',pieces:0,segments:0,comparisons:0,pairs:[],problems:[],nominalFallbackMarks:[]},parsed=memberSchema.safeParse(input);
 if(!parsed.success)return {...result,status:'Invalid',problems:parsed.error.issues.map(i=>i.path.join('.')+': '+i.message)};
 const m=parsed.data;if(!m.bars.length)return {...result,status:'Unentered',problems:['ยังไม่มี BBS ที่กรอกให้ตรวจ']};
 const segments:Segment[]=[],identities:Identity[]=[],solids=solidsOf(m);
 for(const bar of m.bars){
  if(bar.targetSolidId&&!solids.some(s=>s.id===bar.targetSolidId))return {...result,status:'Invalid',problems:[bar.mark+': ไม่พบชิ้นส่วนที่ระบุสำหรับวางเหล็ก']};
  const curved=bar.shape==='arc'?arcGeometry(bar):bar.shape==='helix'?helixGeometry(bar):undefined;
  if(curved?.errors.length)return {...result,status:'Invalid',problems:[bar.mark+': '+curved.errors.join(' · ')]};
  const rawPoints=bar.shape==='polyline'?Math.max(2,bar.points.length):bar.shape==='link'?bar.tail?6:5:bar.shape==='U'?4:bar.shape==='L'?3:2;
  const pointEstimate=curved?curved.points.length:bar.radius?2+(rawPoints-2)*13:rawPoints;
  if(result.pieces+bar.count>limits.pieces||result.segments+Math.max(1,pointEstimate-1)*bar.count>limits.segments)return {...result,status:'Incomplete',problems:[`ชุดตรวจเกินขอบเขต ${limits.pieces} แท่ง / ${limits.segments} ช่วงแนวเหล็ก; ยังไม่ได้ตรวจครบ`]};
  const paths=barPaths(m,bar);if(paths.length!==bar.count)return {...result,status:'Invalid',problems:[bar.mark+': จำนวนแนวเหล็กไม่ตรงข้อมูล']};
  if(bar.outsideDiameter===undefined)result.nominalFallbackMarks.push(bar.mark);
  const radius=(bar.outsideDiameter??bar.diameter)/2;
  for(const [index,raw]of paths.entries()){
   const rounded=curved?{points:raw,errors:curved.errors}:roundedPath(raw,bar.radius),sagitta=curved?.sagitta??polylineCoverSagitta(raw,bar.radius);
   if(rounded.errors.length||rounded.points.length<2||rounded.points.some(p=>!p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e9)))return {...result,status:'Invalid',problems:[bar.mark+': '+(rounded.errors.join(' · ')||'แนวเหล็กไม่ถูกต้องหรือพิกัดเกินขอบเขตเครื่องตรวจ')]};
   const piece=identities.length;identities.push({barId:bar.id,mark:bar.mark,piece:index+1,poseId:bar.placementLayout?.poses[index]?.id||'แท่ง '+(index+1)});let added=0;
   for(let i=1;i<rounded.points.length;i++){
    const a=rounded.points[i-1],b=rounded.points[i];if(Math.hypot(...sub(a,b))<1e-8)continue;
    const error=sagitta+Number.EPSILON*Math.max(1,...a.map(Math.abs),...b.map(Math.abs))*64,reach=radius+error;
    segments.push({a,b,piece,radius,error,lo:a.map((n,j)=>Math.min(n,b[j])-reach) as Vec3,hi:a.map((n,j)=>Math.max(n,b[j])+reach) as Vec3});added++;
   }
   if(!added)return {...result,status:'Invalid',problems:[bar.mark+': แนวเหล็กมีแต่จุดซ้ำ']};result.pieces++;result.segments+=added;
   if(result.segments>limits.segments)return {...result,status:'Incomplete',problems:['จำนวนช่วงแนวเหล็กเกินขอบเขต ยังไม่ได้ตรวจครบ']};
  }
 }
 if(identities.length<2)return result;
 const centerLo=[Infinity,Infinity,Infinity],centerHi=[-Infinity,-Infinity,-Infinity];for(const s of segments)for(let axis=0;axis<3;axis++){const center=(s.lo[axis]+s.hi[axis])/2;centerLo[axis]=Math.min(centerLo[axis],center);centerHi[axis]=Math.max(centerHi[axis],center);}const sweep=[0,1,2].sort((a,b)=>(centerHi[b]-centerLo[b])-(centerHi[a]-centerLo[a]))[0];
 segments.sort((a,b)=>a.lo[sweep]-b.lo[sweep]);let active:Segment[]=[];const pairs=new Map<string,InterferencePair>();
 const finish=(complete:boolean,problem?:string)=>({...result,status:complete?'Complete' as const:'Incomplete' as const,pairs:[...pairs.values()].sort((a,b)=>a.gapLower-b.gapLower),problems:problem?[problem]:[]});
 for(const s of segments){
  active=active.filter(t=>t.hi[sweep]>=s.lo[sweep]);
  for(const t of active){
   result.comparisons++;if(result.comparisons>limits.comparisons)return finish(false,'จำนวนคู่ช่วงแนวเหล็กเกินขอบเขต ยังไม่ได้ตรวจครบ');
   if(s.piece===t.piece)continue;
   if([0,1,2].some(axis=>axis!==sweep&&(t.hi[axis]<s.lo[axis]||s.hi[axis]<t.lo[axis])))continue;
   const closest=closestSegments(s.a,s.b,t.a,t.b),error=s.error+t.error,gap=closest.distance-s.radius-t.radius;if(gap-error>=-1e-5)continue;
   const key=[s.piece,t.piece].sort((a,b)=>a-b).join('/'),found:InterferencePair={first:identities[s.piece],second:identities[t.piece],distance:closest.distance,gapLower:gap-error,gapUpper:gap+error,firstPoint:closest.a,secondPoint:closest.c,endpointCandidate:closest.s<1e-7||closest.s>1-1e-7||closest.t<1e-7||closest.t>1-1e-7,approximation:error};
   if(!pairs.has(key)&&pairs.size>=limits.pairs)return finish(false,'จำนวนคู่ที่เข้าข่ายเกินขอบเขต แสดงเฉพาะที่ตรวจแล้ว');
   const previous=pairs.get(key);if(!previous)pairs.set(key,found);else if(previous.gapLower>found.gapLower)pairs.set(key,{...found,gapUpper:Math.min(previous.gapUpper,found.gapUpper)});else previous.gapUpper=Math.min(previous.gapUpper,found.gapUpper);
  }
  active.push(s);
 }
 return finish(true);
}
