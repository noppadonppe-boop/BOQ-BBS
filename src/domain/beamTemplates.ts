import {z} from 'zod';
import {beamRebarSchema,beamZones,type BeamInput,type BeamRebar,type BeamSpan,type BeamZone} from './elementInput';
import type {Spec} from './model';

// Project Beam Template: the beam schedule of a project's beam details (one entry per beam mark, sections
// END / MID / CON / CANT or ALL SPAN as drawn), kept in the spec (spec.beamTemplates) so a project gets it with its
// General Spec; spans of a beam group pick a mark and get its size and bars. Bar cut-offs follow the spec's beam
// rules (e.g. the "BEAM CONFIGURATION" detail: L1/3, La/3, L/8, L/10), laps are placed by the beam group generator.
const mm=z.number().finite().min(0).max(200000);
export const beamTemplateZones=['all',...beamZones] as const;
export type BeamTemplateZone=typeof beamTemplateZones[number];
/** one section as drawn: labels as written on the drawing (e.g. "7Y32+2Y32(EX)", "Y16@100", "R9@600", "10Y25") */
export const beamSectionTextSchema=z.object({zone:z.enum(beamTemplateZones),top:z.string().max(60),bottom:z.string().max(60),stirrup:z.string().max(40),
 legs:z.number().int().min(0).max(12),tie:z.string().max(40).default(''),side:z.string().max(40).default(''),width:mm.optional(),depth:mm.optional()}).strict();
export type BeamSectionText=z.infer<typeof beamSectionTextSchema>;
export const beamTemplateSchema=z.object({
 id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
 name:z.string().trim().min(1).max(32),
 /** drawing group, e.g. the floor or "BEAM DETAILS-2" */
 group:z.string().max(60).default(''),
 note:z.string().max(1000).default(''),
 /** drawing reference (sheet / detail) */
 source:z.string().max(300).default(''),
 width:mm,depth:mm,
 sections:z.array(beamSectionTextSchema).min(1).max(5),
 /** bars of a beam-group span (main bars continuous, EX per section, stirrups per section, side bars per face) */
 rebar:beamRebarSchema,
}).strict();
export type BeamTemplate=z.infer<typeof beamTemplateSchema>;
export const beamTemplatesSchema=z.array(beamTemplateSchema).max(600)
 .superRefine((list,ctx)=>{const ids=new Set<string>(),names=new Set<string>();list.forEach((t,i)=>{if(ids.has(t.id))ctx.addIssue({code:'custom',path:[i,'id'],message:'รหัส Template คานซ้ำ'});
  if(names.has(t.name.toUpperCase()))ctx.addIssue({code:'custom',path:[i,'name'],message:`เบอร์คาน ${t.name} ซ้ำ`});ids.add(t.id);names.add(t.name.toUpperCase());});});

type Part={count:number;diameter:number;ex:boolean};
/** "7Y32+2Y32(EX)" → parts; "Y", "DB", "RB", "R" prefixes; "(EX)" / "(EX.)" marks extra bars of the section. */
export function parseBarText(s:string):Part[]{
 return [...String(s||'').toUpperCase().replace(/\s+/g,'').matchAll(/(\d+)(?:[YDR]B?|T|Ø)(\d+)(\(EX\.?\))?/g)].map(m=>({count:Number(m[1]),diameter:Number(m[2]),ex:!!m[3]}));
}
/** "Y16@100" / "2Y12@150" / "R9@600" → diameter + spacing. */
export function parseSpacingText(s:string){
 const m=String(s||'').toUpperCase().replace(/\s+/g,'').match(/(?:\d+)?(?:[YDR]B?|T|Ø)(\d+)@(\d+)/);
 return m?{diameter:Number(m[1]),spacing:Number(m[2])}:undefined;
}
const area=(p:{count:number;diameter:number})=>p.count*p.diameter**2;
/** total of a layer as one size (the largest), counting other sizes by area */
function asOne(parts:Part[]){
 if(!parts.length)return {count:0,diameter:0};
 const d=Math.max(...parts.map(p=>p.diameter));
 return {count:parts.reduce((s,p)=>s+(p.diameter===d?p.count:Math.ceil(area(p)/d**2)),0),diameter:d};
}

/** Section of the schedule used at a span position (fallbacks: CANT → CON → END, END ↔ CON, MID → CON / END). */
function sectionAt(t:Pick<BeamTemplate,'sections'>,z:BeamZone){
 const s=t.sections,f=(k:BeamTemplateZone)=>s.find(x=>x.zone===k);
 const order:Record<BeamZone,BeamZone[]>={end:['end','con','mid'],con:['con','end','mid'],mid:['mid','con','end'],cant:['cant','con','end','mid']};
 return f('all')||order[z].map(f).find(Boolean)||s[0];
}

/** Span bars from the schedule labels: main top / bottom = the bars every section has (min over the sections, the
 * non-EX part), EX of a section = the rest of that section; ALL SPAN = one section → no EX (all bars continuous);
 * stirrups: the largest size / legs, spacing per section; side bars "10Y25" = both faces → 5 per face. */
export function beamRebarFromSections(t:Pick<BeamTemplate,'sections'>,warn:(s:string)=>void=()=>{}):BeamRebar{
 const all=t.sections.some(s=>s.zone==='all');
 const layer=(key:'top'|'bottom')=>{
  const per=Object.fromEntries(beamZones.map(z=>{const p=parseBarText(sectionAt(t,z)[key]);return [z,{main:asOne(p.filter(x=>all||!x.ex)),ex:asOne(p.filter(x=>!all&&x.ex)),total:asOne(p)}];})) as Record<BeamZone,{main:{count:number;diameter:number};ex:{count:number;diameter:number};total:{count:number;diameter:number}}>;
  const drawn=beamZones.filter(z=>t.sections.some(s=>s.zone===z||s.zone==='all'));
  const mains=(drawn.length?drawn:beamZones).map(z=>per[z].main).filter(m=>m.count>0);
  // mixed sizes between the sections (drawing oddity): the smallest section's size runs through
  const d=mains.length?mains.reduce((a,b)=>area(b)<area(a)?b:a).diameter:0;
  const main={count:mains.length?Math.min(...mains.map(m=>m.diameter===d?m.count:Math.floor(area(m)/d**2))):0,diameter:d||16};
  if(mains.some(m=>m.diameter!==d))warn(`เหล็ก${key==='top'?'บน':'ล่าง'}หลักมีหลายขนาด · ใช้ ${main.count}Y${main.diameter} ต่อเนื่อง`);
  const ex=Object.fromEntries(beamZones.map(z=>{const p=per[z],extraMain=p.main.diameter===d?Math.max(0,p.main.count-main.count):0;
   const e=p.ex.count?{count:p.ex.count+(p.ex.diameter===d?extraMain:0),diameter:p.ex.diameter}:{count:extraMain,diameter:d||16};
   if(p.ex.count&&extraMain&&p.ex.diameter!==d)warn(`${z.toUpperCase()}: เหล็กหลัก${key==='top'?'บน':'ล่าง'}เกิน ${extraMain} เส้น ต่างขนาดกับ EX · ไม่ได้รวม`);
   return [z,e];})) as Record<BeamZone,{count:number;diameter:number}>;
  return {main,ex};};
 const top=layer('top'),bottom=layer('bottom');
 const st=beamZones.map(z=>({z,s:parseSpacingText(sectionAt(t,z).stirrup),legs:sectionAt(t,z).legs}));
 const sd=Math.max(0,...st.map(x=>x.s?.diameter||0))||9,legs=Math.max(2,...st.map(x=>x.legs||2));
 const sideSec=t.sections.find(s=>parseBarText(s.side).length)||t.sections[0],side=asOne(parseBarText(sideSec.side)),tie=parseSpacingText(sideSec.tie);
 return {top:top.main,bottom:bottom.main,
  ex:Object.fromEntries(beamZones.map(z=>[z,{top:top.ex[z],bottom:bottom.ex[z]}])) as BeamRebar['ex'],
  stirrup:{diameter:sd,legs:Math.min(8,legs+legs%2),spacing:Object.fromEntries(st.map(x=>[x.z,x.s?.spacing||200])) as BeamRebar['stirrup']['spacing']},
  side:{count:Math.min(20,Math.ceil(side.count/2)),diameter:side.diameter||12,tie:{diameter:tie?.diameter||9,spacing:tie?.spacing||600}}};
}
/** Template from schedule labels (id from the mark). */
export function beamTemplateFromSchedule(e:{name:string;width:number;depth:number;sections:BeamSectionText[];group?:string;source?:string;note?:string},warn?:(s:string)=>void):BeamTemplate{
 return {id:e.name.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,40),name:e.name,group:e.group||'',note:e.note||'',source:e.source||'',width:e.width,depth:e.depth,sections:e.sections,rebar:beamRebarFromSections(e,warn)};
}

/** Span takes the template's mark, size and bars (length, level, supports stay) and keeps the link. */
export function applyBeamTemplate(s:BeamSpan,t:BeamTemplate):BeamSpan{
 return {...s,mark:t.name,width:t.width,depth:t.depth,rebar:structuredClone(t.rebar),template:t.id};
}
/** The span still matches its template (size and bars). */
export const beamTemplateCurrent=(s:BeamSpan,t:BeamTemplate)=>s.width===t.width&&s.depth===t.depth&&s.mark===t.name&&JSON.stringify(s.rebar)===JSON.stringify(t.rebar);
/** Spans linked to a template follow the template of the spec (spec change job). */
export function syncBeamTemplates(i:BeamInput,spec:Pick<Spec,'beamTemplates'>):BeamInput{
 if(i.layout!=='group'||!i.spans.some(s=>s.template))return i;
 return {...i,spans:i.spans.map(s=>{const t=s.template&&spec.beamTemplates?.find(x=>x.id===s.template);return t?applyBeamTemplate(s,t):s;})};
}

const name=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
const bars=(b:{count:number;diameter:number})=>b.count>0?`${b.count}${name(b.diameter)}`:'';
/** One-line summary of a template (picker / spec list). */
export function beamTemplateSummary(t:BeamTemplate){
 const r=t.rebar,zones=t.sections.map(s=>s.zone).filter((z):z is BeamZone=>z!=='all');
 const ex=(k:'top'|'bottom')=>zones.map(z=>r.ex[z][k].count?`${z.toUpperCase()} +${bars(r.ex[z][k])}`:'').filter(Boolean).join(' ');
 return [`${t.width}×${t.depth}`,`บน ${bars(r.top)||'—'}${ex('top')?` (${ex('top')})`:''}`,`ล่าง ${bars(r.bottom)||'—'}${ex('bottom')?` (${ex('bottom')})`:''}`,
  `ปลอก ${name(r.stirrup.diameter)}${r.stirrup.legs>2?`×${r.stirrup.legs}ขา`:''} @${[...new Set((zones.length?zones:['mid' as BeamZone]).map(z=>r.stirrup.spacing[z]))].join('/')}`,
  r.side.count?`ข้าง ${r.side.count*2}${name(r.side.diameter)} · ยึด ${name(r.side.tie.diameter)}@${r.side.tie.spacing}`:''].filter(Boolean).join(' · ');
}
