import type {Spec} from './model';
import type {Detailing} from './elementInput';
import {codeInfo,codeValues,isCustomCode,tableCode,type LapRow} from './designCodes';
import {concreteMixFor,lapConcreteFor} from './concreteMixes';

// Kept free of runtime imports from model / elementInput (both use it) to avoid import cycles.
export type ProjectDesign={fc:number;grade:'SD40'|'SD50'};
export const DEFAULT_DESIGN:ProjectDesign={fc:28,grade:'SD40'};
export const designOf=(spec:Spec):ProjectDesign=>spec.projectDesign?{fc:spec.projectDesign.fc,grade:spec.projectDesign.grade}:DEFAULT_DESIGN;
export const specLabel=(spec:Spec)=>[spec.profileRef?.name||'ไม่ผูก Spec ส่วนกลาง',spec.designCode?codeInfo(spec,spec.designCode)[isCustomCode(spec.designCode)?'label':'sub']:'',spec.projectDesign?`f'c ${spec.projectDesign.fc} MPa · ${spec.projectDesign.grade}`:''].filter(Boolean).join(' · ');

const avg=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
const step=(v:number,s=.05)=>Number((Math.round(v/s)*s).toFixed(2));
/** Element-input detailing defaults derived from a project spec: bend radii from the hook tables,
 * per-diameter lap lengths (FTL tension) from the f'c lap table of each bar's grade, main grade = project grade.
 * `member` = category / own mix: the spec's concrete mix of the member sets f'c (lap table) instead of the project f'c. */
export function detailingFromSpec(spec:Spec,base:Detailing,member:{category?:string;mix?:string}={}):Detailing{
 const mix=concreteMixFor(spec.concrete,member.category,member.mix),{concrete:_c,...plain}=base;
 const withMix=(d:Detailing):Detailing=>mix?{...d,concrete:{mix:mix.id,name:mix.name.slice(0,80),fc:mix.fc}}:d;
 const code=spec.designCode,specRef=[specLabel(spec),mix?`${mix.name} f'c ${mix.fc} ksc`:''].filter(Boolean).join(' · ').slice(0,200);
 if(!tableCode(code)){const {lapTable:_l,...rest}=plain;return withMix({...rest,mainGrade:spec.projectDesign?designOf(spec).grade:base.mainGrade,specRef});}
 const v=codeValues(spec.codeData,code),fcs=[...new Set(Object.keys(v.lap).map(k=>Number(k.split('-')[0])).filter(Number.isFinite))];
 const design={...designOf(spec)};if(mix)design.fc=lapConcreteFor(mix.fc,fcs)??design.fc;
 const table=v.lap[`${design.fc}-${design.grade}`]||v.lap['28-SD40'];
 // each bar size laps by its own grade (spec grade per bar, e.g. DB25+ SD50); other grades use the project grade
 const barGrade=(bar:number)=>{const g=v.grades.find(r=>r.bar===bar)?.grade;return g==='SD40'||g==='SD50'?g:design.grade;};
 const lapRows=[...new Set(['SD40','SD50'].flatMap(g=>(v.lap[`${design.fc}-${g}`]||[]).map(r=>r.bar)))].sort((a,b)=>a-b)
  .map(bar=>(v.lap[`${design.fc}-${barGrade(bar)}`]||table).find(r=>r.bar===bar)).filter((r):r is LapRow=>!!r);
 // D = finished (inside) bend diameter → inner radius / d
 const ratio=(rows:{bar:number;D:number}[],lo:number,hi:number)=>avg(rows.filter(r=>r.bar>=lo&&r.bar<=hi&&r.bar>0).map(r=>r.D/2/r.bar));
 const bendSmall=step(ratio(v.endHooks,1,16))||base.bendSmall,bendLarge=step(ratio(v.endHooks,20,32))||base.bendLarge,tieBend=step(ratio(v.stirrupHooks,1,16))||base.tieBend;
 const lapTable=lapRows.map(r=>({bar:r.bar,length:r.ftlTension,...(r.ftlTop>0?{top:r.ftlTop}:{}),...(r.sha>0?{ldh:r.sha}:{})}));
 return withMix({...plain,mainGrade:design.grade,bendSmall,bendLarge,tieBend,hook90:12,hook135:6,hook135Min:75,lap:Math.round(avg(lapRows.map(r=>r.ftlTension/r.bar)))||base.lap,lapTable,specRef,beam:{...v.beam},grades:v.grades.map(r=>({bar:r.bar,grade:r.grade}))});
}
