import {z} from 'zod';
import type {WallRun} from './wallRunSchema';
import type {ElementInput} from './elementInput';
import {topExtraSchema,DEFAULT_SLAB_REBAR,type FloorMark,type TopExtra} from './slabFloorSchema';

// Project Slab / Wall Template: the slab list and RC wall list of a project's drawings (mark, thickness, bars), kept in
// the spec (spec.slabTemplates / spec.wallTemplates) so a slab or wall element picks a mark and gets its thickness and
// bars in one step. Slab bars follow the usual list: 1 / 2 = short span top / bottom, 3 / 4 = long span top / bottom;
// applying puts the short-span bars along the shorter side of the element.
const mm=z.number().finite().min(0).max(200000);
const dia=z.number().finite().min(0).max(60);
/** spacing 0 = no bars */
const barSchema=z.object({diameter:dia,spacing:mm}).strict();
const head={
 id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
 name:z.string().trim().min(1).max(40),
 /** building / drawing group (a spec building code groups the marks under that building) */
 group:z.string().max(40).default(''),
 note:z.string().max(500).default(''),
 /** drawing reference (sheet / detail) */
 source:z.string().max(300).default(''),
};
export const slabTemplateSchema=z.object({...head,thickness:mm,
 /** ground = slab on ground (S.O.G) */
 support:z.enum(['elevated','ground']),
 rebar:z.object({shortTop:barSchema,shortBottom:barSchema,longTop:barSchema,longBottom:barSchema,
  /** extra top bars over the beams (บนเสริม, slab floors): Ø@S, length fixed from the beam face / centre or L/3 · L/4 of the short span */
  topExtra:topExtraSchema.optional(),
  /** slab floors: outer edge (top bars bent into the edge beam / U bars) and bottom bars at the beams */
  edge:z.enum(['bend','ubar']).optional(),bottomAtBeam:z.enum(['continuous','stop']).optional()}).strict()}).strict();
export type SlabTemplate=z.infer<typeof slabTemplateSchema>;
const countSchema=z.object({count:z.number().int().min(0).max(20),diameter:dia}).strict();
export const wallTemplateSchema=z.object({...head,thickness:mm,layers:z.union([z.literal(1),z.literal(2)]),vertical:barSchema,horizontal:barSchema,
 /** EDGE BAR (free end) / CORNER BAR (end at another wall): total count + Ø */
 edge:countSchema.optional(),corner:countSchema.optional(),
 /** bars around openings: count per face per side (2x2-DB16 = 2), diagonal bars at the corners */
 opening:z.object({count:z.number().int().min(0).max(6),diameter:dia,diagonal:z.boolean()}).strict().optional(),
 /** Wall Run: inner-face bars when they differ from the outer face (vertical / horizontal above = outer face; absent = same) */
 inner:z.object({vertical:barSchema,horizontal:barSchema}).strict().optional()}).strict();
export type WallTemplate=z.infer<typeof wallTemplateSchema>;
const unique=(what:string)=>(list:{id:string;name:string}[],ctx:z.RefinementCtx)=>{const ids=new Set<string>(),names=new Set<string>();list.forEach((t,i)=>{
 if(ids.has(t.id))ctx.addIssue({code:'custom',path:[i,'id'],message:`รหัส Template ${what}ซ้ำ`});
 if(names.has(t.name.toUpperCase()))ctx.addIssue({code:'custom',path:[i,'name'],message:`${what} ${t.name} ซ้ำ`});ids.add(t.id);names.add(t.name.toUpperCase());});};
export const slabTemplatesSchema=z.array(slabTemplateSchema).max(300).superRefine(unique('พื้น'));
export const wallTemplatesSchema=z.array(wallTemplateSchema).max(300).superRefine(unique('ผนัง'));

const barText=(b:{diameter:number;spacing:number})=>b.spacing>0?`${b.diameter<=9?'RB':'DB'}${b.diameter}@${b.spacing}`:'–';
/** Extra top bar text: DB12@200 ยาว 1000 จากหน้าคาน / L/4 */
export const topExtraText=(e:TopExtra|undefined)=>!e||!(e.spacing>0)?'–':`${barText(e)} ${e.length.mode==='ratio'?`L/${e.length.n}`:`ยาว ${e.length.value} จาก${e.length.from==='face'?'หน้าคาน':'ศูนย์กลางคาน'}`}`;
export const slabTemplateSummary=(t:SlabTemplate)=>`หนา ${t.thickness}${t.support==='ground'?' (S.O.G)':''} · ด้านสั้น บน ${barText(t.rebar.shortTop)} ล่าง ${barText(t.rebar.shortBottom)} · ด้านยาว บน ${barText(t.rebar.longTop)} ล่าง ${barText(t.rebar.longBottom)}${t.rebar.topExtra?.spacing?` · บนเสริม ${topExtraText(t.rebar.topExtra)}`:''}`;
/** Slab floor mark from a slab list template (missing bar layers = none, missing floor options = defaults). */
export function floorMarkFromTemplate(t:SlabTemplate):FloorMark{
 const r=t.rebar;return {name:t.name.replace(/[^A-Za-z0-9-]/g,'').slice(0,12)||'S1',thickness:t.thickness,support:t.support,template:t.id,
  rebar:{shortBottom:{...r.shortBottom},longBottom:{...r.longBottom},shortTop:{...r.shortTop},longTop:{...r.longTop},...(r.topExtra?{topExtra:structuredClone(r.topExtra)}:{}),edge:r.edge??DEFAULT_SLAB_REBAR.edge,bottomAtBeam:r.bottomAtBeam??DEFAULT_SLAB_REBAR.bottomAtBeam}};
}
const countText=(b:{count:number;diameter:number})=>`${b.count}-${b.diameter<=9?'RB':'DB'}${b.diameter}`;
export const wallTemplateSummary=(t:WallTemplate)=>[`หนา ${t.thickness}`,`${t.layers} ชั้น`,`แนวตั้ง ${barText(t.vertical)}`,`แนวนอน ${barText(t.horizontal)}`,t.edge?.count?`EDGE ${countText(t.edge)}`:'',t.corner?.count?`CORNER ${countText(t.corner)}`:'',
 t.opening?.count?`รอบช่องเปิด ${t.layers}x${countText(t.opening)}${t.opening.diagonal?' + ทแยง':''}`:'',t.inner?`ผิวใน ตั้ง ${barText(t.inner.vertical)} นอน ${barText(t.inner.horizontal)}`:''].filter(Boolean).join(' · ');

type SlabIn=Extract<ElementInput,{category:'Slab'}>;type WallIn=Extract<ElementInput,{category:'Wall'}>;
/** Slab input with the template's thickness, support and bars (short-span bars along the shorter side; shapes kept). */
export function applySlabTemplate(i:SlabIn,t:SlabTemplate):SlabIn{
 const xShort=i.lengthX<=i.lengthY,r=i.rebar,s=t.rebar;
 const [bx,by,tx,ty]=xShort?[s.shortBottom,s.longBottom,s.shortTop,s.longTop]:[s.longBottom,s.shortBottom,s.longTop,s.shortTop];
 const mesh=(m:SlabIn['rebar']['bottomX'],b:{diameter:number;spacing:number})=>b.spacing>0?{...m,diameter:b.diameter,spacing:b.spacing}:m;
 const opt=(m:SlabIn['rebar']['topX'],b:{diameter:number;spacing:number})=>b.spacing>0?{...m,enabled:true,diameter:b.diameter,spacing:b.spacing}:{...m,enabled:false};
 return {...i,thickness:t.thickness,ground:{...i.ground,support:t.support},rebar:{...r,bottomX:mesh(r.bottomX,bx),bottomY:mesh(r.bottomY,by),topX:opt(r.topX,tx),topY:opt(r.topY,ty)}};
}
/** Wall input with the template's thickness, layers and bars (shapes kept); edge / corner / opening bars of the template
 * replace the element's (which ends are free / at a corner stays the element's choice: default both ends free). */
export function applyWallTemplate(i:WallIn,t:WallTemplate):WallIn{
 const r=i.rebar,none={count:0,diameter:12},{ends:_e,opening:_o,...plain}=r,hasEnds=!!(t.edge?.count||t.corner?.count);
 const ends=hasEnds?{start:r.ends?.start??'edge',end:r.ends?.end??'edge',edge:t.edge??none,corner:t.corner??none}:undefined;
 const opening=t.opening?.count?{count:t.opening.count,diameter:t.opening.diameter,ext:r.opening?.ext??0,diagonal:t.opening.diagonal}:undefined;
 return {...i,thickness:t.thickness,rebar:{...plain,...(ends?{ends}:{}),...(opening?{opening}:{}),layers:t.layers,vertical:{...r.vertical,diameter:t.vertical.diameter,spacing:t.vertical.spacing||r.vertical.spacing},horizontal:{...r.horizontal,diameter:t.horizontal.diameter,spacing:t.horizontal.spacing||r.horizontal.spacing}}};
}
/** Merge imported templates by name (imported rows replace, others kept). */
export function mergeByName<T extends {name:string}>(current:T[]|undefined,incoming:T[]){const names=new Set(incoming.map(t=>t.name.toUpperCase()));return [...(current||[]).filter(t=>!names.has(t.name.toUpperCase())),...incoming];}
/** Wall Run filled from an RC wall list row: every segment's thickness, layers, outer / inner bars (inner = outer when the row
 * has no inner columns), EDGE bars of free ends and opening trims. */
export function applyWallTemplateToRun(run:WallRun,t:WallTemplate):WallRun{
 const m=(b:{diameter:number;spacing:number},o:{diameter:number;spacing:number})=>({diameter:b.diameter||o.diameter,spacing:b.spacing||o.spacing});
 const r=run.rebar,outer={vertical:m(t.vertical,r.outer.vertical),horizontal:m(t.horizontal,r.outer.horizontal)},inner=t.inner?{vertical:m(t.inner.vertical,r.inner.vertical),horizontal:m(t.inner.horizontal,r.inner.horizontal)}:outer;
 return {...run,path:{...run.path,segments:run.path.segments.map(s=>({...s,thickness:t.thickness}))},branches:run.branches?.map(b=>({...b,thickness:t.thickness})),
  rebar:{...r,layers:t.layers,outer,inner,...(t.edge?.count?{edgeBar:{...t.edge}}:{})},
  openings:t.opening?.count?run.openings.map(o=>({...o,trim:{...o.trim,count:t.opening!.count,diameter:t.opening!.diameter,diagonal:t.opening!.diagonal}})):run.openings};
}
