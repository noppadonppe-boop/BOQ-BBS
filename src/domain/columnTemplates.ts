import {z} from 'zod';
import {tiePatterns,type ColumnInput,type ColumnStorey,type FootingColumn,type TiePattern} from './elementInput';
import type {Spec} from './model';

// Project Column Template: the column schedule of a project (one entry per column mark, one row per level range
// as on the drawings: section, main bars, ties nYd@S1(d@S2)). Kept in the spec (spec.columnTemplates) so a
// project gets it with its General Spec; columns pick a row (single column) or the whole table (column stack).
const mm=z.number().finite().min(0).max(200000);
const dia=z.number().finite().min(0).max(60);
const layer=z.object({count:z.number().int().min(0).max(200),diameter:dia}).strict();
export const columnTemplateRowSchema=z.object({
 /** level range as on the schedule, e.g. "Footing → 2nd" */
 level:z.string().trim().max(40),
 /** first storey on the footing (zone rule `first`) */
 first:z.boolean(),
 width:mm,depth:mm,
 /** floor-to-floor height and beam depth at the top (0 = keep the column's own) */
 height:mm,beamDepth:mm,
 main:z.object({corner:z.object({diameter:dia,count:z.number().int().min(1).max(3)}).strict(),sideX:layer,sideY:layer,sideBundle:z.number().int().min(1).max(2)}).strict(),
 /** nYd@S1(d@S2): sets = n pieces per tie level (check), S1 middle zone, S2 end zones */
 tie:z.object({diameter:dia,sets:z.number().int().min(0).max(30),s1:mm,s2:mm}).strict(),
}).strict();
export type ColumnTemplateRow=z.infer<typeof columnTemplateRowSchema>;
export const columnTemplateSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),name:z.string().trim().min(1).max(40),note:z.string().max(300),
 /** set-2 (inner tie) pattern of the section */
 pattern:z.enum(tiePatterns),
 /** rows bottom → top */
 rows:z.array(columnTemplateRowSchema).min(1).max(20)}).strict();
export type ColumnTemplate=z.infer<typeof columnTemplateSchema>;
/** Tie end zones as divisors of the clear height H (storey height − beam depth): lower = H / lower, upper = H / upper
 * (+ beam depth, the joint), middle = the rest. Typical detail: first storey H/3 · H/2 · H/6, others H/6 · 2H/3 · H/6. */
const divisor=z.number().finite().min(1).max(20);
const zoneRule=z.object({lower:divisor,upper:divisor}).strict();
export const columnZoneRulesSchema=z.object({first:zoneRule,typical:zoneRule}).strict();
export type ColumnZoneRules=z.infer<typeof columnZoneRulesSchema>;
export const DEFAULT_ZONE_RULES:ColumnZoneRules={first:{lower:3,upper:6},typical:{lower:6,upper:6}};
export const columnTemplatesSchema=z.array(columnTemplateSchema).max(300).superRefine((l,ctx)=>{
 if(new Set(l.map(t=>t.id)).size!==l.length)ctx.addIssue({code:'custom',message:'รหัส Template เสาซ้ำ'});
 if(new Set(l.map(t=>t.name.toUpperCase())).size!==l.length)ctx.addIssue({code:'custom',message:'ชื่อประเภทเสาใน Template ซ้ำ'});
});

export const zoneRulesOf=(spec?:Pick<Spec,'columnZoneRules'>):ColumnZoneRules=>spec?.columnZoneRules||DEFAULT_ZONE_RULES;
/** "H/3", "2H/3", "H/2" … for a zone fraction. */
export function fractionText(f:number){
 for(const q of [1,2,3,4,5,6,8,10,12]){const p=Math.round(f*q);if(p>0&&Math.abs(p/q-f)<1e-6)return `${p===1?'':p}H${q===1?'':`/${q}`}`;}
 return `${Math.round(f*1000)/1000}H`;
}
/** Zone fractions of H for a storey kind. */
export function zoneFractions(rules:ColumnZoneRules,first:boolean){const r=first?rules.first:rules.typical;return {lower:1/r.lower,upper:1/r.upper,middle:Math.max(0,1-1/r.lower-1/r.upper)};}
const up50=(v:number)=>Math.ceil(v/50-1e-9)*50;
/** Tie zone lengths (mm, rounded up to 50) of a column of height `height` with a beam `beam` deep at its top. */
export function zoneLengths(height:number,beam:number,first:boolean,rules:ColumnZoneRules){
 const clear=Math.max(1,height-beam),f=zoneFractions(rules,first),lower=up50(clear*f.lower),upper=Math.min(height-lower,up50(clear*f.upper+beam));
 return {clear,lower,upper,middle:Math.max(0,height-lower-upper)};
}

export const templateMainCount=(r:Pick<ColumnTemplateRow,'main'>)=>4*r.main.corner.count+2*(r.main.sideX.count+r.main.sideY.count);
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
const yName=(d:number)=>`${d<=9?'RB':'Y'}${d}`;
/** "32Y32" (main bars as on the schedule). */
export function mainText(r:Pick<ColumnTemplateRow,'main'>){const m=r.main,ds=[...new Set([m.corner.diameter,m.sideX.count?m.sideX.diameter:0,m.sideY.count?m.sideY.diameter:0].filter(Boolean))];return `${templateMainCount(r)}${ds.map(yName).join('/')}`;}
/** "5Y12@200(12@100)" (ties as on the schedule). */
export const tieText=(r:Pick<ColumnTemplateRow,'tie'>)=>`${r.tie.sets||''}${yName(r.tie.diameter)}@${r.tie.s1}(${r.tie.diameter}@${r.tie.s2})`;
export const rowSummary=(t:ColumnTemplate,r:ColumnTemplateRow)=>`${r.width}×${r.depth} · ${mainText(r)} · ${tieText(r)}`;
export {barName as templateBarName};

/** Split a main-bar total (e.g. 32 of "32Y32") into corner bundles + side bars, proportional to the section sides. */
export function splitMain(total:number,w:number,d:number,corner:number):{sideX:number;sideY:number}{
 const extra=Math.max(0,total-4*corner),x=Math.round(extra*w/((w+d)||1)/2);
 return {sideX:x,sideY:Math.max(0,Math.round((extra-2*x)/2))};
}
/** Read "32Y32" / "32-DB32" → count + diameter. */
export function parseMain(text:string){const m=String(text).toUpperCase().replace(/\s/g,'').match(/^(\d+)[-]?(?:Y|DB|RB|D|Ø)?(\d+)$/);return m?{count:+m[1],diameter:+m[2]}:undefined;}
/** Read "5Y12@200(12@100)" → n, d, S1, S2. */
export function parseTie(text:string){
 const m=String(text).toUpperCase().replace(/\s/g,'').match(/^(\d*)[-]?(?:Y|DB|RB|D|Ø)?(\d+)@(\d+)(?:\((?:(?:Y|DB|RB|D|Ø)?\d+)?@(\d+)\))?$/);
 return m?{sets:m[1]?+m[1]:0,diameter:+m[2],s1:+m[3],s2:m[4]?+m[4]:+m[3]}:undefined;
}

export const newTemplateRow=(level='Footing → 2nd',first=true):ColumnTemplateRow=>({level,first,width:400,depth:400,height:0,beamDepth:0,
 main:{corner:{diameter:20,count:1},sideX:{diameter:20,count:1},sideY:{diameter:20,count:1},sideBundle:1},tie:{diameter:12,sets:0,s1:200,s2:100}});
export const newTemplate=(name:string):ColumnTemplate=>({id:crypto.randomUUID().replace(/-/g,'').slice(0,12),name,note:'',pattern:'auto',rows:[newTemplateRow()]});

const mainOf=(r:ColumnTemplateRow):ColumnInput['rebar']['main']=>({corner:{...r.main.corner},sideX:{...r.main.sideX},sideY:{...r.main.sideY},diameter:r.main.corner.diameter,count:templateMainCount(r),...(r.main.sideBundle===2?{sideBundle:2}:{})});
/** Single column from row `k` of a template: section, main bars, tie zones by the zone rules (lower / middle / upper,
 * hoop and inner ties at S2 / S1 / S2). `beam` = beam depth at the column top (default: the pour beam depth). */
export function applyTemplateRow(i:ColumnInput,t:ColumnTemplate,k:number,rules:ColumnZoneRules,opts:{beam?:number;linked?:boolean}={}):ColumnInput{
 const r=t.rows[k];if(!r)return i;
 const v=structuredClone(i),beam=opts.beam??(r.beamDepth||v.pour?.beam||0);
 if(r.height>0)v.height=r.height;
 v.layout='single';v.shape='rect';v.width=r.width;v.depth=r.depth;v.rebar.main=mainOf(r);
 const z=zoneLengths(v.height,beam,r.first,rules),d=r.tie.diameter,zone=(spacing:number)=>({pattern:t.pattern,spacing});
 v.rebar.tie={diameter:d,spacing:r.tie.s1,lower:{length:z.lower,spacing:r.tie.s2},upper:{length:z.upper,spacing:r.tie.s2},inner:{diameter:d,lower:zone(r.tie.s2),middle:zone(r.tie.s1),upper:zone(r.tie.s2)}};
 v.template={id:t.id,name:t.name,row:k,beam,linked:opts.linked??true};
 return v;
}
/** Column stack from every row of a template (bottom → top); storey heights / beam depths kept from the column
 * where the template has none. */
export function applyTemplateStack(i:ColumnInput,t:ColumnTemplate,rules:ColumnZoneRules,opts:{linked?:boolean}={}):ColumnInput{
 const v=structuredClone(i),old=v.stack.storeys;
 v.layout='stack';v.shape='rect';
 v.stack.storeys=t.rows.map((r,k):ColumnStorey=>({name:r.level.slice(0,40),height:r.height||old[k]?.height||v.height||4000,beamDepth:r.beamDepth||old[k]?.beamDepth||600,width:r.width,depth:r.depth,
  main:mainOf(r),tie:{diameter:r.tie.diameter,sets:r.tie.sets,pattern:t.pattern as TiePattern,s1:r.tie.s1,s2:r.tie.s2}}));
 if(t.rows.length)v.stack.footing.enabled=t.rows[0].first;
 v.stack.zones=structuredClone(rules);
 v.template={id:t.id,name:t.name,row:-1,beam:0,linked:opts.linked??true};
 return v;
}
/** Pedestal / starter bar on a footing from row `k` of a template: rect section, column no. = template name, main bars;
 * pedestal ties at the end-zone spacing S2 (the pedestal is below the first storey). Position, height, embedment kept. */
export function applyTemplateFooting(c:FootingColumn,t:ColumnTemplate,k:number,type:'pedestal'|'starter'):FootingColumn{
 const r=t.rows[k];if(!r)return c;
 return {...structuredClone(c),type,columnNo:t.name.slice(0,50),shape:'rect',width:r.width,depth:r.depth,
  main:{...c.main,corner:{...r.main.corner},sideX:{...r.main.sideX},sideY:{...r.main.sideY},diameter:r.main.corner.diameter,count:templateMainCount(r)},
  tie:{diameter:r.tie.diameter,spacing:r.tie.s2||r.tie.s1}};
}
/** Re-apply the linked template (spec change / template edit); unlinked or missing templates leave the input as is. */
export function syncColumnTemplate(i:ColumnInput,spec:Pick<Spec,'columnTemplates'|'columnZoneRules'>):ColumnInput{
 const ref=i.template;if(!ref?.linked)return i;
 const t=spec.columnTemplates?.find(x=>x.id===ref.id);if(!t)return i;
 const rules=zoneRulesOf(spec);
 return ref.row<0?applyTemplateStack(i,t,rules):ref.row<t.rows.length?applyTemplateRow(i,t,ref.row,rules,{beam:ref.beam}):i;
}
