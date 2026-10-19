import {z} from 'zod';
import type {Member,Solid,Vec3} from './model';

const mm=z.number().finite().positive().max(200000);
export const beamAssemblySchema=z.object({
 version:z.literal(1),axis:z.enum(['X','Y']),
 formwork:z.object({bottom:z.boolean(),top:z.boolean(),start:z.boolean(),end:z.boolean()}),
 spans:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),label:z.string().trim().min(1).max(80),length:mm,width:mm,depth:mm,soffit:z.number().finite().nonnegative().max(200000)})).min(1).max(12),
}).superRefine((a,ctx)=>{
 const fail=(message:string,path:(string|number)[]=[])=>ctx.addIssue({code:'custom',message,path});
 if(new Set(a.spans.map(s=>s.id)).size!==a.spans.length)fail('รหัสช่วงคานซ้ำ');
 if(a.spans.reduce((n,s)=>n+s.length,0)>200000)fail('ความยาวคานรวมเกิน 200,000 mm');
 for(let i=0;i<a.spans.length;i++){
  const s=a.spans[i];if(s.soffit+s.depth>200000)fail('ระดับบนคานเกิน 200,000 mm',['spans',i,'soffit']);
  if(i){const p=a.spans[i-1],overlap=Math.min(p.soffit+p.depth,s.soffit+s.depth)-Math.max(p.soffit,s.soffit);if(overlap<=.001)fail(`ช่วง ${i} และ ${i+1} ไม่มีหน้าตัดร่วมที่รอยต่อ ให้ตรวจระดับท้องคาน`,['spans',i,'soffit']);}
 }
});
export type BeamAssembly=z.infer<typeof beamAssemblySchema>;

// Spans are butt-joined along one common centreline. Width/depth/soffit are
// entered dimensions, not effective spans inferred from support/grid labels.
export function assembleBeam(input:BeamAssembly){
 const a=beamAssemblySchema.parse(input),run=a.axis==='X'?0:1,lateral=1-run;
 const maxWidth=Math.max(...a.spans.map(s=>s.width));let offset=0;
 const stations=a.spans.map(s=>{const from=offset;offset+=s.length;return {...s,from,to:offset};});
 const solids:Solid[]=stations.map((s,i)=>{
  const origin:Vec3=[0,0,s.soffit],size:Vec3=[0,0,s.depth];origin[run]=s.from;origin[lateral]=(maxWidth-s.width)/2;size[run]=s.length;size[lateral]=s.width;
  const faces=[true,true,true,true,a.formwork.bottom,a.formwork.top];
  if(i===0)faces[run*2]=a.formwork.start;
  if(i===stations.length-1)faces[run*2+1]=a.formwork.end;
  return {id:s.id,label:s.label,origin,size,faces};
 });
 const bounds:Vec3=[0,0,Math.max(...stations.map(s=>s.soffit+s.depth))];bounds[run]=offset;bounds[lateral]=maxWidth;
 const steps=stations.slice(1).map((s,i)=>{
  const p=stations[i],overlapWidth=Math.min(p.width,s.width),overlapHeight=Math.min(p.soffit+p.depth,s.soffit+s.depth)-Math.max(p.soffit,s.soffit);
  return {fromId:p.id,toId:s.id,station:s.from,area:(p.width*p.depth+s.width*s.depth-2*overlapWidth*overlapHeight)/1e6};
 });
 const gross=stations.reduce((n,s)=>n+s.length*s.width*s.depth/1e9,0);
 const longitudinalForm=stations.reduce((n,s)=>n+s.length*(2*s.depth+s.width*(Number(a.formwork.bottom)+Number(a.formwork.top)))/1e6,0);
 const first=stations[0],last=stations.at(-1)!;
 const endForm=(Number(a.formwork.start)*first.width*first.depth+Number(a.formwork.end)*last.width*last.depth)/1e6;
 return {assembly:a,stations,solids,bounds,steps,gross,longitudinalForm,endForm,stepForm:steps.reduce((n,s)=>n+s.area,0),formGross:longitudinalForm+endForm+steps.reduce((n,s)=>n+s.area,0)};
}

export function applyBeamAssembly(member:Member,input:BeamAssembly):Member{
 if(member.category!=='Beam')throw Error('คานต่อเนื่องใช้กับสมาชิกประเภทคานเท่านั้น');
 const b=assembleBeam(input),[x,y,z]=b.bounds;
 return {...member,prismGeometry:undefined,beamAssembly:b.assembly,geometry:{solids:b.solids,voids:structuredClone(member.geometry?.voids||[])},x,y,z,pedestal:{x:0,y:0,z:0},sectionY:member.sectionY!==undefined&&member.sectionY<=y?member.sectionY:y/2,status:'Draft',bars:member.bars.map(bar=>({...bar,placementConfirmed:false,bsDimensionsConfirmed:false}))};
}

// Saved authoring parameters must describe the actual solids being calculated.
// Direct manual geometry editing explicitly detaches the authoring parameters.
export function beamAssemblyProblems(member:Member):string[]{
 if(!member.beamAssembly)return [];
 if(member.category!=='Beam')return ['ข้อมูลช่วงคานใช้กับประเภทคานเท่านั้น'];
 try{
  const expected=assembleBeam(member.beamAssembly),actual=member.geometry?.solids;
  if(!actual||actual.length!==expected.solids.length)return ['ข้อมูลช่วงคานไม่ตรงชิ้นส่วนคอนกรีต เปิดช่วงคานแล้วใช้รูปทรงใหม่'];
  const eq=(a:number,b:number)=>Math.abs(a-b)<=.000001;
  if(actual.some((s,i)=>{const e=expected.solids[i];return s.id!==e.id||s.label!==e.label||s.origin.some((v,j)=>!eq(v,e.origin[j]))||s.size.some((v,j)=>!eq(v,e.size[j]))||s.faces.some((v,j)=>v!==e.faces[j]);}))return ['ข้อมูลช่วงคานไม่ตรงชิ้นส่วนคอนกรีต เปิดช่วงคานแล้วใช้รูปทรงใหม่'];
  if([member.x,member.y,member.z].some((v,i)=>!eq(v,expected.bounds[i]))||Object.values(member.pedestal).some(v=>v!==0))return ['มิติรวมหรือ Pedestal ไม่ตรงข้อมูลช่วงคาน'];
  return [];
 }catch{return ['ข้อมูลช่วงคานไม่ถูกต้อง'];}
}
