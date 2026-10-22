import type {Spec} from './model';
import type {Detailing} from './elementInput';
import {codeInfo,codeValues,isCustomCode,tableCode} from './designCodes';

// Kept free of runtime imports from model / elementInput (both use it) to avoid import cycles.
export type ProjectDesign={fc:number;grade:'SD40'|'SD50'};
export const DEFAULT_DESIGN:ProjectDesign={fc:28,grade:'SD40'};
export const designOf=(spec:Spec):ProjectDesign=>spec.projectDesign?{fc:spec.projectDesign.fc,grade:spec.projectDesign.grade}:DEFAULT_DESIGN;
export const specLabel=(spec:Spec)=>[spec.profileRef?.name||'ไม่ผูก Spec ส่วนกลาง',spec.designCode?codeInfo(spec,spec.designCode)[isCustomCode(spec.designCode)?'label':'sub']:'',spec.projectDesign?`f'c ${spec.projectDesign.fc} MPa · ${spec.projectDesign.grade}`:''].filter(Boolean).join(' · ');

const avg=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
const step=(v:number,s=.05)=>Number((Math.round(v/s)*s).toFixed(2));
/** Element-input detailing defaults derived from a project spec: bend radii from the hook tables,
 * per-diameter lap lengths (FTL tension) from the f'c / grade lap table, main grade = project grade. */
export function detailingFromSpec(spec:Spec,base:Detailing):Detailing{
 const design=designOf(spec),code=spec.designCode,specRef=specLabel(spec).slice(0,200);
 if(!tableCode(code)){const {lapTable:_l,...rest}=base;return {...rest,mainGrade:spec.projectDesign?design.grade:base.mainGrade,specRef};}
 const v=codeValues(spec.codeData,code),table=v.lap[`${design.fc}-${design.grade}`]||v.lap['28-SD40'];
 // D = finished (inside) bend diameter → inner radius / d
 const ratio=(rows:{bar:number;D:number}[],lo:number,hi:number)=>avg(rows.filter(r=>r.bar>=lo&&r.bar<=hi&&r.bar>0).map(r=>r.D/2/r.bar));
 const bendSmall=step(ratio(v.endHooks,1,16))||base.bendSmall,bendLarge=step(ratio(v.endHooks,20,32))||base.bendLarge,tieBend=step(ratio(v.stirrupHooks,1,16))||base.tieBend;
 const lapTable=table.map(r=>({bar:r.bar,length:r.ftlTension}));
 return {...base,mainGrade:design.grade,bendSmall,bendLarge,tieBend,hook90:12,hook135:6,hook135Min:75,lap:Math.round(avg(table.map(r=>r.ftlTension/r.bar)))||base.lap,lapTable,specRef};
}
