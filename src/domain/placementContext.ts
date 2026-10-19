import {circularPathClearance} from './circularPrism';
import {flatEndPathClearance} from './flatEndCover';
import {z} from 'zod';
import type {Member,Solid,Vec3} from './model';
import {boundsOf,solidsOf,solidQuantities,pathInside,pathClearance,insideBox,type Surface} from './solids';

const coordinate=z.number().finite().min(-200000).max(200000);
const regionFields={
 id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),label:z.string().trim().min(1).max(80),
 origin:z.tuple([coordinate,coordinate,coordinate]),size:z.tuple([z.number().finite().positive().max(200000),z.number().finite().positive().max(200000),z.number().finite().positive().max(200000)]),
 reference:z.string().trim().min(1).max(500),
};
const regionV1=z.object(regionFields).strict(),openingSchema=z.object(regionFields).strict();
const regionV2=z.object({...regionFields,cover:z.number().finite().nonnegative().max(200000).optional(),openings:z.array(openingSchema).max(4)}).strict();
export const placementContextSchema=z.discriminatedUnion('version',[
 z.object({version:z.literal(1),regions:z.array(regionV1).max(6)}),
 z.object({version:z.literal(2),regions:z.array(regionV2).max(6)}),
]).superRefine((c,ctx)=>{
 if(new Set(c.regions.map(r=>r.id)).size!==c.regions.length)ctx.addIssue({code:'custom',message:'รหัสพื้นที่อ้างอิงรอยต่อซ้ำ'});
 c.regions.forEach((r,i)=>r.origin.forEach((v,a)=>{if(v+r.size[a]>200000)ctx.addIssue({code:'custom',path:['regions',i,'size',a],message:'ขอบเขตพื้นที่อ้างอิงเกิน 200,000 mm'});}));
 if(c.version===2)c.regions.forEach((r,i)=>{
  if(new Set(r.openings.map(o=>o.id)).size!==r.openings.length)ctx.addIssue({code:'custom',path:['regions',i,'openings'],message:'รหัสช่องเปิดในพื้นที่อ้างอิงซ้ำ'});
  for(const [j,o] of r.openings.entries())for(let a=0;a<3;a++)if(o.origin[a]<r.origin[a]||o.origin[a]+o.size[a]>r.origin[a]+r.size[a])ctx.addIssue({code:'custom',path:['regions',i,'openings',j],message:'ช่องเปิดอ้างอิงต้องอยู่ในขอบเขตพื้นที่ที่ระบุ'});
 });
});
export type PlacementContext=z.infer<typeof placementContextSchema>;
export type PlacementContextV2=Extract<PlacementContext,{version:2}>;
export function editablePlacementContext(m:Member):PlacementContextV2{
 const c=m.placementContext;
 return c?.version===2?structuredClone(c):{version:2,regions:(c?.regions||[]).map(r=>({...structuredClone(r),openings:[]}))};
}
export const hasPlacementContext=(m:Member)=>!!m.placementContext?.regions.length;
export function contextSolids(m:Member):Solid[]{return (m.placementContext?.regions||[]).map(r=>({id:'context_'+r.id,label:r.label,origin:r.origin,size:r.size,faces:[false,false,false,false,false,false]}));}
export function contextOpenings(m:Member):Solid[]{return m.placementContext?.version===2?m.placementContext.regions.flatMap(r=>r.openings.map(o=>({id:'context_opening_'+r.id+'_'+o.id,label:o.label,origin:o.origin,size:o.size,faces:[false,false,false,false,false,false] as boolean[]}))):[];}
export const contextRegionCover=(m:Member,id:string)=>m.placementContext?.version===2?(m.placementContext.regions.find(r=>r.id===id)?.cover??m.cover):m.cover;

const overlapBox=(a:Solid,b:Solid):Solid|undefined=>{
 const origin=a.origin.map((v,i)=>Math.max(v,b.origin[i])) as Vec3,size=a.size.map((v,i)=>Math.min(a.origin[i]+v,b.origin[i]+b.size[i])-origin[i]) as Vec3;
 return size.every(v=>v>1e-6)?{...a,origin,size}:undefined;
};
// A context opening may agree with an existing owned void, but must never
// erase owned concrete only for placement while that concrete remains in BOQ.
export function placementContextProblems(m:Member):string[]{
 if(m.prismGeometry&&hasPlacementContext(m))return ['รูปทรงหลายเหลี่ยมรุ่น 1 ยังไม่รองรับพื้นที่อ้างอิงรอยต่อ'];
 const errors:string[]=[];
 for(const hole of contextOpenings(m)){
  const solids=solidsOf(m).flatMap(s=>{const clipped=overlapBox(s,hole);return clipped?[clipped]:[];});if(!solids.length)continue;
  const voids=(m.geometry?.voids||[]).flatMap(s=>{const clipped=overlapBox(s,hole);return clipped?[clipped]:[];}),q=solidQuantities({...m,geometry:{solids,voids},pedestal:{x:0,y:0,z:0}});
  errors.push(...q.errors.filter(e=>!e.includes('ไม่มีปริมาตร')).map(e=>`${hole.label}: ${e}`));
  if(q.volume>0)errors.push(`${hole.label}: ช่องเปิดอ้างอิงทับคอนกรีตสมาชิก ให้แก้ช่องเปิดในเรขาคณิตสมาชิกก่อน`);
 }
 return errors;
}

// This union is solely the declared adjacent/future concrete for geometric
// placement checks. It is never passed into takeoff, quantity totals or targets.
export function placementMember(m:Member):Member{
 if(m.prismGeometry)return m;
 return hasPlacementContext(m)?{...m,geometry:{solids:[...solidsOf(m),...contextSolids(m)],voids:[...(m.geometry?.voids||[]),...contextOpenings(m)]},pedestal:{x:0,y:0,z:0}}:m;
}
export function placementGeometry(m:Member){return solidQuantities(placementMember(m));}
export function placementPathInside(m:Member,path:Vec3[]){return pathInside(placementMember(m),path);}
export function ownPathInside(m:Member,path:Vec3[]){return pathInside(m,path);}
function ownsSide(box:Solid,surface:Surface){
 const p=surface.origin.map((v,i)=>v+surface.size[i]/2) as Vec3,a=surface.axis;
 return insideBox(p,box)&& (surface.positive?box.origin[a]<p[a]-1e-6:box.origin[a]+box.size[a]>p[a]+1e-6);
}
export function placementSurfaceCover(m:Member,surface:Surface){
 const own=solidsOf(m).some(b=>ownsSide(b,surface))&&!(m.geometry?.voids||[]).some(b=>ownsSide(b,surface)),covers=own?[m.cover]:[];
 for(const r of m.placementContext?.regions||[])if(ownsSide({id:r.id,label:r.label,origin:r.origin,size:r.size,faces:[]},surface))covers.push(contextRegionCover(m,r.id));
 return covers.length?Math.max(...covers):m.cover;
}
export function placementClearance(m:Member,path:Vec3[],surfaces:Surface[],barRadiusAndSagitta:number,flatEnds=false){
 if(m.prismGeometry?.version===4)return circularPathClearance(m.prismGeometry,path,m.cover,barRadiusAndSagitta,flatEnds);
 if(flatEnds)return flatEndPathClearance(path,surfaces,s=>m.placementContext?.version===2?placementSurfaceCover(m,s):m.cover,barRadiusAndSagitta);
 if(m.placementContext?.version!==2)return pathClearance(path,surfaces,m.cover+barRadiusAndSagitta);
 return surfaces.every(s=>pathClearance(path,[s],placementSurfaceCover(m,s)+barRadiusAndSagitta));
}
export function contextCoverPass(m:Member,path:Vec3[],required:number){const p=placementMember(m),q=solidQuantities(p);return !placementContextProblems(m).length&&!q.errors.length&&pathInside(p,path)&&placementClearance(m,path,q.surfaces,required-m.cover);}
export function placementViewBounds(m:Member){
 const max=[...boundsOf(m)] as Vec3,min:Vec3=[0,0,0];
 for(const s of contextSolids(m))for(let i=0;i<3;i++){min[i]=Math.min(min[i],s.origin[i]);max[i]=Math.max(max[i],s.origin[i]+s.size[i]);}
 return {min,max,size:max.map((v,i)=>v-min[i]) as Vec3};
}
export function applyPlacementContext(member:Member,input:PlacementContext):Member{
 const context=placementContextSchema.parse(input);
 return {...member,placementContext:context.regions.length?context:undefined,status:'Draft',bars:member.bars.map(b=>({...b,placementConfirmed:false,bsDimensionsConfirmed:false}))};
}
