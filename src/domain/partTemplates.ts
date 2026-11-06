import type {Spec} from './model';
import type {PartRebar,ShapeModel} from './shapeModelSchema';
import {rowPattern,type ColumnTemplate} from './columnTemplates';
import {partTieInFromType,type EmbedTieStandard,type EmbedTies} from './embedTie';
import type {Detailing} from './elementInput';

// Custom column parts linked to a project Column Template type / row (`part.rebar.template`): main bars, ties at S2, set-2
// pattern and ties in the part below come from the type; re-applied after a spec change (`syncPartTemplates`). The
// part's size is never changed here (the panel offers a resize button); the bar extension (`ext`) is kept.

/** Rebar of a column part filled from row `k` of type `t` (`std` = General Spec standard for the ties in the support). */
export function partRebarFromType(r:PartRebar,t:ColumnTemplate,k:number,std?:EmbedTieStandard):PartRebar{
 const q=t.rows[k];if(!q)return r;
 const ti=partTieInFromType(t.embedTie,q.tie.diameter,std);
 // a column-set choice (own / none / outer-all) stays unless it came from the type
 const keep=r.tieIn&&!r.tieIn.type,tieIn=keep?r.tieIn:ti?{...ti,type:true as const}:r.tieIn;
 const next:PartRebar={...r,purpose:'column',main:{d:q.main.corner.diameter,nx:Math.min(20,q.main.sideX.count+2),ny:Math.min(20,q.main.sideY.count+2)},
  tie:{d:q.tie.diameter,s:q.tie.s2||q.tie.s1},template:{id:t.id,row:k}};
 // section as drawn: bar positions + inner ties of the row (pattern 'custom'); else counts per face + the type's pattern
 if(q.layout)next.layout=structuredClone(q.layout);else delete next.layout;
 const pat=rowPattern(t,q);if(pat==='none'||(pat==='custom'&&!q.layout)){delete next.tiePattern;}else next.tiePattern=pat;
 // ties in the support need the anchorage into it
 if(tieIn&&tieIn.s>0)next.anchor=true;
 if(tieIn)next.tieIn=tieIn;else delete next.tieIn;
 return next;
}
/** Linked parts re-filled from the spec's types (missing type / row = unchanged); same object when nothing changed. */
export function syncPartTemplates(sm:ShapeModel,spec:Pick<Spec,'columnTemplates'|'columnEmbedTie'>):ShapeModel{
 let changed=false;
 const parts=sm.parts.map(p=>{const r=p.rebar,ref=r?.template;if(!r||!ref)return p;
  const t=spec.columnTemplates?.find(x=>x.id===ref.id);if(!t||!t.rows[ref.row])return p;
  const next=partRebarFromType(r,t,ref.row,spec.columnEmbedTie);
  if(JSON.stringify(next)===JSON.stringify(r))return p;changed=true;return {...p,rebar:next};});
 return changed?{...sm,parts}:sm;
}
/** Parts whose presets depend on the spec beyond the detailing (linked type, ties per the standard). */
export const specLinkedParts=(sm:ShapeModel|undefined)=>!!sm?.parts.some(p=>p.rebar?.purpose==='column'&&(p.rebar.template||p.rebar.tieIn?.std||p.rebar.anchor));
/** Ties in the part below of a column part as used by the presets: mode, size, spacing, outer / all. */
export function partTieInState(r:PartRebar,det:Pick<Detailing,'embedTie'>):{mode:'std'|'type'|'own'|'off';d:number;s:number;ties:EmbedTies}{
 const ES=det.embedTie,ti=r.tieIn,dt=r.tie?.d||12;
 if(!ti){if(!r.anchor)return {mode:'off',d:dt,s:0,ties:'all'};
  return ES?.enabled?{mode:'std',d:ES.diameter||dt,s:ES.spacing,ties:ES.ties??'all'}:r.tie&&r.tie.s>0?{mode:'own',d:dt,s:300,ties:'all'}:{mode:'off',d:dt,s:0,ties:'all'};}
 if(ti.s<=0)return {mode:'off',d:ti.d,s:0,ties:ti.ties??'all'};
 const mode=ti.type?'type':ti.std?'std':'own';
 return ti.std&&ES?{mode,d:ES.diameter||dt||ti.d,s:ES.spacing,ties:ti.ties??ES.ties??'all'}:{mode,d:ti.d,s:ti.s,ties:ti.ties??ES?.ties??'all'};
}
