import {spatialDimensionSchema,spatialDimensionsSchema,dimensionValue,type SpatialDimension} from './spatialDimensionSchema';
export {spatialDimensionSchema,spatialDimensionsSchema,dimensionValue,type SpatialDimension} from './spatialDimensionSchema';
import type {Bar,Member,Vec3} from './model';
import {spatialBar,spatialSketch} from './spatialBar';

export const dimensionText=(d:SpatialDimension)=>`${d.free?'('+d.label+')':d.label} = ${dimensionValue(d).toLocaleString('en-US',{maximumFractionDigits:3})}`;
export function dimensionWitness(d:SpatialDimension):Vec3{
 if(d.axis==='distance')return d.to;
 const p=[...d.from] as Vec3;p['XYZ'.indexOf(d.axis)]=d.to['XYZ'.indexOf(d.axis)];return p;
}
export function spatialDimensionSketch(m:Member,b:Bar,part=0,perPage=6){
 const e=spatialBar(m,b);if(!e.available)return {available:false as const,reason:e.reason};
 const parsed=spatialDimensionsSchema.safeParse(b.spatialDimensions||[]);if(!parsed.success)return {available:false as const,reason:parsed.error.issues.map(i=>i.message).join(' / ')};
 const ds=parsed.data.slice(part*perPage,part*perPage+perPage),s=spatialSketch(e,0,650,440,ds.flatMap(d=>[d.from,d.to,dimensionWitness(d)]));
 return {available:true as const,s:{...s,width:760},dimensions:ds.map((d,i)=>({...d,value:dimensionValue(d),text:dimensionText(d),from:s.extra[i*3],to:s.extra[i*3+1],witness:s.extra[i*3+2]})),total:Math.max(1,Math.ceil(parsed.data.length/perPage))};
}
