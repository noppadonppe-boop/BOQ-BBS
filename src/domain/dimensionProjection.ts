import {dimensionViewSchema,type DimensionView} from './spatialDimensionSchema';
export {dimensionViewSchema,type DimensionView} from './spatialDimensionSchema';
import type {Bar,Member,Vec3} from './model';
import {spatialBar,spatialSketch} from './spatialBar';
import {dimensionText,dimensionValue,dimensionWitness,spatialDimensionsSchema} from './spatialDimensions';

export const dimensionViewNames:Record<DimensionView,string>={isometric:'Isometric · อัตโนมัติ',XY:'XY · มองตาม Z',XZ:'XZ · มองตาม Y',YZ:'YZ · มองตาม X'};
const delta=(a:Vec3,b:Vec3)=>b.map((v,i)=>v-a[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i],0);
// Orthographic sheets are coordinate-reference aids, not a first-angle drawing
// arrangement or outside-surface fabrication detail. Original ISO pages remain.
export function dimensionProjection(m:Member,b:Bar,part=0,perPage=6,view:DimensionView=b.dimensionView||'isometric'){
 const parsed=spatialDimensionsSchema.safeParse(b.spatialDimensions||[]);
 if(!parsed.success)return {available:false as const,reason:parsed.error.issues.map(i=>i.message).join(' / ')};
 const all=parsed.data,refs=all.flatMap(d=>[delta(d.from,d.to),delta(d.from,dimensionWitness(d))]);
 const e=spatialBar(m,b,refs);if(!e.available)return {available:false as const,reason:e.reason};
 const plane=view==='XY'?[0,1]:view==='XZ'?[0,2]:[1,2];
 const axisX=view==='isometric'?e.axisX:([0,1,2].map(i=>i===plane[0]?1:0) as Vec3);
 const axisY=view==='isometric'?e.axisY:([0,1,2].map(i=>i===plane[1]?1:0) as Vec3);
 const project=(p:Vec3):[number,number]=>{const d=delta(e.detail.points[0],p);return [dot(d,axisX),-dot(d,axisY)];};
 const projected=view==='isometric'?e:{...e,axisX,axisY,project,centerline:e.samples.map(s=>project(s.point)),edges:[],caps:[]};
 const ds=all.slice(part*perPage,(part+1)*perPage),s=spatialSketch(projected,0,650,440,ds.flatMap(d=>[d.from,d.to,dimensionWitness(d)]));
 const visibility=(v:Vec3)=>Math.hypot(dot(v,axisX),dot(v,axisY))/Math.hypot(...v);
 const dimensions=ds.map((d,i)=>{
  const ratio=visibility(delta(d.from,dimensionWitness(d))),endpointRatio=visibility(delta(d.from,d.to));
  const status=ratio<1e-4?'EDGE-ON':ratio<.05?'FORESHORTENED':'VISIBLE';
  return {...d,coordinates:{from:d.from,to:d.to},value:dimensionValue(d),text:dimensionText(d),from:s.extra[i*3],to:s.extra[i*3+1],witness:s.extra[i*3+2],status,endpointOverlap:endpointRatio<1e-4,projectedRatio:ratio};
 });
 // Reserve left space for the coordinate triad; +X must not overlap the
 // leftmost reference endpoint when an orthographic projection fits tightly.
 const axes=s.axes.map(a=>({...a,from:[a.from[0]-25,a.from[1]] as [number,number],to:[a.to[0]-25,a.to[1]] as [number,number]}));
 return {available:true as const,view,axisX,axisY,s:{...s,width:760,axes},dimensions,total:Math.max(1,Math.ceil(all.length/perPage)),centerlineOnly:view!=='isometric'};
}
