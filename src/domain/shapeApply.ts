import type {Member} from './model';
import {shapeModelSchema,type ShapeModel,type ShapePart} from './shapeModelSchema';
import {inMulti,normaliseShape,partPolygon,shapeFootprint,shapeGeometry,shapePileQuantities,shapeVolumeBelow} from './shapeGeometry';

const AUTO='[auto] ';
/** Dimension / consistency check of a shape model. blockers stop “ใช้รูปทรง”; notes are review items. */
export function shapeProblems(input:ShapeModel):{blockers:string[];notes:string[]}{
 const parsed=shapeModelSchema.safeParse(input);
 if(!parsed.success)return {blockers:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`),notes:[]};
 const sm=parsed.data,g=shapeGeometry(sm),blockers=[...g.errors],notes:string[]=[];
 const name=(p:ShapePart,i:number)=>`ชิ้น ${i+1} ${p.label}`;
 sm.parts.forEach((p,i)=>{
  if(p.shape==='polygon'){const pts=p.points;if(pts.some((a,k)=>{const b=pts[(k+1)%pts.length];return Math.hypot(b[0]-a[0],b[1]-a[1])<1;}))blockers.push(`${name(p,i)}: มีจุดยอดซ้ำ / ด้านยาวเป็นศูนย์`);}
  if(p.role==='void'){const hit=g.slabs.some(s=>s.voids.some(v=>v.id===p.id)&&s.solids.length);if(!hit)notes.push(`${name(p,i)}: ช่องเปิดไม่ตัดผ่านคอนกรีต (ไม่มีผลต่อปริมาณ)`);}
  if(!p.source.trim())notes.push(`${name(p,i)}: ยังไม่ระบุที่มาของมิติ (แบบ / รูปตัด)`);
 });
 // parts must touch the rest (no floating concrete)
 const solids=sm.parts.filter(p=>p.role==='solid');
 if(solids.length>1){const fp=solids.map(p=>partPolygon(p)[0]),touch=(a:number,b:number)=>{const A=solids[a],B=solids[b];const zOk=A.z0<=B.z0+B.height+1e-6&&B.z0<=A.z0+A.height+1e-6;if(!zOk)return false;const xa=fp[a].map(v=>v[0]),ya=fp[a].map(v=>v[1]),xb=fp[b].map(v=>v[0]),yb=fp[b].map(v=>v[1]);return Math.min(...xa)<=Math.max(...xb)+1e-6&&Math.min(...xb)<=Math.max(...xa)+1e-6&&Math.min(...ya)<=Math.max(...yb)+1e-6&&Math.min(...yb)<=Math.max(...ya)+1e-6;};
  const seen=new Set([0]),queue=[0];while(queue.length){const a=queue.pop()!;solids.forEach((_,b)=>{if(!seen.has(b)&&touch(a,b)){seen.add(b);queue.push(b);}});}
  solids.forEach((p,k)=>{if(!seen.has(k))blockers.push(`${p.label}: ชิ้นส่วนลอย ไม่ต่อกับชิ้นส่วนอื่น · ตรวจตำแหน่ง/ระดับ`);});}
 if(sm.piles){const fp=shapeFootprint(sm);sm.piles.positions.forEach(([x,y],k)=>{if(!inMulti([x,y],fp,1))blockers.push(`เสาเข็มต้นที่ ${k+1} อยู่นอกแปลนคอนกรีต`);});
  if(!(sm.piles.length>0))notes.push('ยังไม่ระบุความยาวเสาเข็ม');}
 if(!sm.confirmed)notes.push('ยังไม่ได้ยืนยันว่ามิติทุกชิ้นตรวจกับแบบแล้ว');
 return {blockers,notes};
}

/** Standard cover (mm) when the drawings give none: 75 for concrete cast on ground / piles (site or piles present), else 40. */
export const standardCover=(sm:Pick<ShapeModel,'piles'|'site'>)=>sm.piles||sm.site?75:40;
/** Applies a shape model to a member: normalised geometry, member bounds, pile-head deduction, earthwork. */
export function applyShapeModel(m:Member,input:ShapeModel):Member{
 const sm=normaliseShape(shapeModelSchema.parse(input)).model,g=shapeGeometry(sm),[x,y,z]=g.max,piles=shapePileQuantities(sm);
 const {geometry:_g,prismGeometry:_p,beamAssembly:_b,...rest}=m;
 const deductions=[...m.deductions.filter(d=>!d.reason.startsWith(AUTO)),...(piles.headVolume>0?[{reason:`${AUTO}หัวเข็มฝังในคอนกรีต ${piles.count} ต้น × ${sm.piles!.embed} mm`,volume:piles.headVolume,formwork:0}]:[])];
 const s=sm.site;let earth:Pick<Member,'excavation'|'lean'>={excavation:{bottomX:0,bottomY:0,topX:0,topY:0,depth:0,buriedConcrete:0},lean:{x:0,y:0,thickness:0}};
 if(s){const lx=x+2*s.leanProjection,ly=y+2*s.leanProjection,bx=Math.max(lx,x+2*s.workingSpace),by=Math.max(ly,y+2*s.workingSpace),grow=2*s.excavationDepth*s.slope;
  // ground line: excavation depth measured from the bottom of the lean layer
  const ground=s.excavationDepth-s.leanThickness,buried=Math.max(0,shapeVolumeBelow(sm,ground)-piles.headVolume);
  earth={excavation:{bottomX:bx,bottomY:by,topX:bx+grow,topY:by+grow,depth:s.excavationDepth,buriedConcrete:Number(buried.toFixed(6))},lean:{x:s.leanThickness>0?lx:0,y:s.leanThickness>0?ly:0,thickness:s.leanThickness}};}
 return {...rest,...earth,shapeModel:sm,x,y,z,pedestal:{x:0,y:0,z:0},deductions,status:'Draft',bars:m.bars.map(b=>({...b,placementConfirmed:false,bsDimensionsConfirmed:false}))};
}
/** Concrete per pour stage (m³) after voids; pile heads are deducted from stage 1. */
export function shapeStageVolumes(sm:ShapeModel){const g=shapeGeometry(sm),head=shapePileQuantities(sm).headVolume;return g.stages.map((s,i)=>({...s,volume:i===0?s.volume-head:s.volume}));}
/** Starter model from the current member box (used when a Custom member opens the shape editor). */
export function starterShape(m:Member):ShapeModel{
 return {version:1,confirmed:false,note:'',parts:[{id:'p1',label:'ชิ้นส่วนหลัก',role:'solid',stage:1,z0:0,height:m.z,formSides:true,formBottom:false,source:'',shape:'box',x:0,y:0,w:m.x,d:m.y}]};
}
