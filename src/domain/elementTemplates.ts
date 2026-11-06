import {freeFormCategory} from './disciplines';
import {z} from 'zod';
import {APP_NAME} from './auth';
import {barSchema,blankMember,categories,labels,type Category,type Member,type Project,type Spec} from './model';
import {applyElementInput,elementInputSchema,isGeneratedBar,supportsElementInput,type ElementInput} from './elementInput';
import {detailingFromSpec} from './specDetailing';
import {shapeModelSchema,type ShapeModel} from './shapeModelSchema';
import {applyShapeModel} from './shapeApply';
import {applyPartPresets,isPresetBar} from './partRebar';
import {boqCategorySchema} from './reportCategory';
import {emptySiteWork,siteItemSchema,withSiteWork} from './siteWork';
import {provisionalQuantityBasis} from './quantityBasis';
import {sheetLayoutSchema} from './sheetLayoutSchema';
import {drawingEditsSchema} from './drawingEdits';
import {calculationEngine} from './version';
import {takeoff} from './engine';
import {templateDefaultsSchema,type MemberTemplateSource,type TemplateDefaults} from './templateSource';

// Element templates (T1), three levels:
// - project templates `projects/{pid}/elementTemplates/{id}` (scope 'project'): members of the project read, admin / QS write;
// - project defaults `project.templateDefaults[key] = templateId` (key = category or category:subtype), admin / QS;
// - central templates `${APP}/root/elementTemplates/{id}` (scope 'workspace'): every approved user reads, MasterAdmin writes.
//   Others propose one (`${APP}/root/elementTemplateProposals/{id}`), MasterAdmin approves (new central template or a new
//   version of one) or rejects with a reason.
// Saving over a template = version + 1; the previous one is kept in `<template>/versions/{n}` (append-only).
// Before the migration, old central documents with scope 'project' (+ projectId) are still read as that project's templates.
// The payload holds the element's inputs, not its quantities: a member made from a template is re-applied with the target
// project's spec (bars from the inputs regenerated, drawn bars copied and re-checked).
export const centralTemplatesPath=`${APP_NAME}/root/elementTemplates`;
/** @deprecated old name of the central path */
export const elementTemplatesPath=centralTemplatesPath;
export const projectTemplatesPath=(pid:string)=>`projects/${pid}/elementTemplates`;
export const templateProposalsPath=`${APP_NAME}/root/elementTemplateProposals`;
export const TEMPLATE_VERSIONS='versions';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
/** what a template carries besides the shape / inputs (absent = everything of the old payloads: inputs, own bars, BOQ items) */
export const templateIncludeSchema=z.object({generated:z.boolean(),manual:z.boolean(),siteItems:z.boolean(),sheetLayout:z.boolean(),drawingEdits:z.boolean()}).strict();
export type TemplateInclude=z.infer<typeof templateIncludeSchema>;
export const defaultInclude:TemplateInclude={generated:true,manual:true,siteItems:true,sheetLayout:false,drawingEdits:false};
/** spec facts of the source project, to warn when the target project uses another one */
export const templateSourceSpecSchema=z.object({designCode:z.string().max(60).optional(),bsEdition:z.string().max(60),aciEdition:z.string().max(60),rebarCoverPolicy:z.string().max(80).optional(),engine:z.string().max(400)}).strict();
export type TemplateSourceSpec=z.infer<typeof templateSourceSpecSchema>;
export const templatePayloadSchema=z.object({
 description:z.string().max(500),
 cover:z.number().finite().nonnegative().max(1000),
 elementInput:z.unknown().optional(),
 shapeModel:shapeModelSchema.optional(),
 boqCategory:boqCategorySchema.optional(),
 siteItems:z.array(siteItemSchema).max(30),
 /** bars entered by hand (Custom sketch bars, extra bars of standard elements) */
 bars:z.array(barSchema).max(300),
 include:templateIncludeSchema.optional(),
 sheetLayout:sheetLayoutSchema.optional(),
 drawingEdits:drawingEditsSchema.optional(),
 sourceSpec:templateSourceSpecSchema.optional(),
}).strict();
const originSchema=z.object({proposalId:id.optional(),projectId:id.optional(),projectCode:z.string().max(120).optional(),templateId:id.optional(),version:z.number().int().min(1).optional(),migratedFrom:z.string().max(200).optional()}).strict();
export const elementTemplateSchema=z.object({id,name:z.string().trim().min(1).max(120),description:z.string().max(500),category:z.enum(categories),
 scope:z.enum(['workspace','project']),projectId:id.optional(),projectCode:z.string().max(120).optional(),payload:templatePayloadSchema,
 tags:z.array(z.string().trim().min(1).max(40)).max(20).optional(),key:z.string().max(60).optional(),origin:originSchema.optional(),
 version:z.number().int().min(1),createdAt:z.string().max(40),updatedAt:z.string().max(40),createdBy:z.string().max(128),updatedBy:z.string().max(128)}).strict();
export type ElementTemplate=z.infer<typeof elementTemplateSchema>;
export type TemplatePayload=z.infer<typeof templatePayloadSchema>;
/** a stored previous version (`versions/{n}`): the template as it was + when / by whom it was replaced */
export const templateVersionSchema=elementTemplateSchema.extend({supersededAt:z.string().max(40),supersededBy:z.string().max(128)});
export type TemplateVersion=z.infer<typeof templateVersionSchema>;
export type TemplateLevel='project'|'central';
/** level of a template as the UI shows it (old central documents with scope 'project' are project templates) */
export const templateLevel=(t:Pick<ElementTemplate,'scope'>):TemplateLevel=>t.scope==='project'?'project':'central';
/** Template list entry: where it is stored (`legacy` = still in the central collection with scope 'project'). */
export type ListedTemplate=ElementTemplate&{level:TemplateLevel;legacy?:boolean};

export const proposalSchema=z.object({id,status:z.enum(['pending','approved','rejected']),uid:z.string().min(1).max(128),email:z.string().max(200),proposerName:z.string().max(200),
 projectId:id,projectCode:z.string().max(120),sourceTemplateId:id.optional(),targetCentralId:id.optional(),
 name:z.string().trim().min(1).max(120),description:z.string().max(500),category:z.enum(categories),tags:z.array(z.string().trim().min(1).max(40)).max(20).optional(),payload:templatePayloadSchema,
 createdAt:z.string().max(40),decidedAt:z.string().max(40).optional(),decidedBy:z.string().max(128).optional(),reason:z.string().max(500).optional(),
 centralId:id.optional(),centralVersion:z.number().int().min(1).optional()}).strict();
export type TemplateProposal=z.infer<typeof proposalSchema>;
export const proposalStatusLabels={pending:'รอพิจารณา',approved:'อนุมัติแล้ว',rejected:'ไม่อนุมัติ'} as const;

/** Spec facts kept with a template. */
export function templateSourceSpec(spec:Spec):TemplateSourceSpec{
 return templateSourceSpecSchema.parse({...(spec.designCode?{designCode:spec.designCode}:{}),bsEdition:spec.bsEdition||'',aciEdition:spec.aciEdition||'',...(spec.rebarCoverPolicy?{rebarCoverPolicy:spec.rebarCoverPolicy}:{}),engine:calculationEngine(spec).slice(0,400)});
}
const standardOf=(s:TemplateSourceSpec)=>s.bsEdition?`BS 8666 (${s.bsEdition})`:`ACI 318${s.aciEdition?` (${s.aciEdition})`:''}`;
/** Differences between the template's source spec and the target project's spec (empty = same, or no source recorded). */
export function specDifferences(source:TemplateSourceSpec|undefined,spec:Spec):string[]{
 if(!source)return [];const t=templateSourceSpec(spec),out:string[]=[];
 if(standardOf(source)!==standardOf(t))out.push(`มาตรฐานเหล็ก ${standardOf(source)} → ${standardOf(t)}`);
 if((source.designCode||'ACI')!==(t.designCode||'ACI'))out.push(`Design code ${source.designCode||'ACI'} → ${t.designCode||'ACI'}`);
 if((source.rebarCoverPolicy||'')!==(t.rebarCoverPolicy||''))out.push(`วิธีตรวจระยะหุ้ม ${source.rebarCoverPolicy||'เดิม'} → ${t.rebarCoverPolicy||'เดิม'}`);
 if(!out.length&&source.engine!==t.engine)out.push(`เครื่องคำนวณ ${source.engine} → ${t.engine}`);
 return out;
}

/** Default key of an element: category, or category:subtype for footings (spread / pile), beams (single / group),
 * columns (single / stack) and slabs (single / floor). */
export function templateKey(category:Category,input?:unknown):string{
 const i=elementInputSchema.safeParse(input);if(!i.success||i.data.category!==category)return category;const v=i.data as ElementInput&Record<string,unknown>;
 const sub=category==='Foundation'?v.foundationType:['Beam','Column','Slab'].includes(category)?v.layout:undefined;
 return typeof sub==='string'&&/^[a-z]{1,20}$/.test(sub)?`${category}:${sub}`:category;
}
const subLabels:Record<string,string>={spread:'ฐานแผ่',pile:'เข็ม',single:'เดี่ยว',group:'กลุ่มคาน',stack:'หลายชั้น',floor:'ทั้งชั้น'};
export function templateKeyLabel(key:string){const [c,s]=key.split(':');return `${labels[c as Category]||c}${s?` (${subLabels[s]||s})`:''}`;}
/** Project default template ids of a category (exact `category` key first, then the subtype keys). */
export function categoryDefaults(defaults:TemplateDefaults|null|undefined,category:Category):{key:string;id:string}[]{
 const d=defaults||{};return Object.entries(d).filter(([k])=>k===category||k.startsWith(category+':')).sort(([a],[b])=>(a===category?-1:0)-(b===category?-1:0)||a.localeCompare(b)).map(([key,id])=>({key,id}));
}
/** templateDefaults with one key set (id) or cleared (null). */
export function withDefault(defaults:TemplateDefaults|null|undefined,key:string,templateId:string|null):TemplateDefaults{
 const next={...(defaults||{})};if(templateId)next[key]=templateId;else delete next[key];return templateDefaultsSchema.parse(next);
}
/** Defaults that still point at a usable template (a project template of the project, or a central one). */
export function usableDefaults(defaults:TemplateDefaults|null|undefined,ids:Set<string>):TemplateDefaults{
 return Object.fromEntries(Object.entries(defaults||{}).filter(([,v])=>ids.has(v)));
}

/** Payload from an element's current inputs (the input panel state or the shape editor draft). */
export function templatePayload(m:Member,over:{elementInput?:ElementInput;shapeModel?:ShapeModel;siteItems?:TemplatePayload['siteItems'];bars?:Member['bars'];cover?:number;boqCategory?:Member['boqCategory'];include?:TemplateInclude;spec?:Spec}={}):TemplatePayload{
 const input=over.elementInput??(supportsElementInput(m.category)?elementInputSchema.safeParse(m.elementInput).data:undefined);
 const {appliedAt:_a,source:_s,...cleanInput}=(input||{}) as ElementInput&{appliedAt?:string;source?:unknown};
 const inc=over.include,shape=over.shapeModel??m.shapeModel,bars=(over.bars??m.bars).filter(b=>!isGeneratedBar(b));
 return templatePayloadSchema.parse({description:m.description,cover:over.cover??m.cover,...(input?{elementInput:{...cleanInput,mode:'manual'}}:{}),
  ...(freeFormCategory(m.category)&&shape?{shapeModel:{...structuredClone(shape),confirmed:false}}:{}),...(m.category==='Custom'&&(over.boqCategory??m.boqCategory)?{boqCategory:over.boqCategory??m.boqCategory}:{}),
  siteItems:inc&&!inc.siteItems?[]:over.siteItems??m.siteWork?.items??[],bars:inc&&!inc.manual?[]:bars.map(b=>({...b,placementConfirmed:false})),
  ...(inc?{include:inc}:{}),...(inc?.sheetLayout&&m.sheetLayout?{sheetLayout:structuredClone(m.sheetLayout)}:{}),...(inc?.drawingEdits&&m.drawingEdits?{drawingEdits:(({check:_c,...e})=>structuredClone(e))(m.drawingEdits)}:{}),
  ...(over.spec?{sourceSpec:templateSourceSpec(over.spec)}:{})});
}
/** Summary line of a template for pickers. */
export function templateSummary(t:Pick<ElementTemplate,'payload'>){
 const p=t.payload,i=elementInputSchema.safeParse(p.elementInput);
 if(i.success){const v=i.data;switch(v.category){
  case 'Foundation':return `${v.shape==='circle'?`Ø${v.diameter}`:`${v.width}×${v.length}`}×${v.thickness}${v.foundationType==='pile'?` · เข็ม ${v.pile.count||v.pile.nx*v.pile.ny} ต้น`:''}${v.column.type!=='none'?` · ${v.column.type==='pedestal'?'ตอม่อ':'Starter'} ${1+v.extraColumns.length} ต้น`:''}`;
  case 'Beam':return v.layout==='group'?`กลุ่มคาน ${v.spans.length} ช่วง · ${[...new Set(v.spans.map(s=>s.mark))].join(', ')}`:`${v.width}×${v.depth} ยาว ${v.length}`;
  case 'Column':return `${v.shape==='circle'?`Ø${v.diameter}`:`${v.width}×${v.depth}`} สูง ${v.height}`;
  case 'Slab':return v.layout==='floor'?'พื้นทั้งชั้น':`${v.lengthX}×${v.lengthY} หนา ${v.thickness}${v.ground.support==='ground'?' · บนดิน':''}`;
  case 'Wall':return `ยาว ${v.length} หนา ${v.thickness} สูง ${v.height}`;}}
 return p.shapeModel?`${p.shapeModel.parts.length} ชิ้นส่วน${p.shapeModel.piles?` · เข็ม ${p.shapeModel.piles.positions.length} ต้น`:''}`:'';
}
/** Search text of a template (name, description, tags, summary). */
export const templateSearchText=(t:ElementTemplate)=>[t.name,t.description,...(t.tags||[]),templateSummary(t),t.projectCode||''].join(' ').toLowerCase();
export function matchesSearch(t:ElementTemplate,q:string){const s=templateSearchText(t);return q.toLowerCase().split(/\s+/).filter(Boolean).every(w=>s.includes(w));}

export type FromTemplateOptions={level?:TemplateLevel;occurrence?:{quantity?:number;zone?:string;floor?:string}};
/** New member (unsaved, version 0) from a template, applied with the target project's spec. Always an independent member:
 * everything is copied, nothing stays linked (`templateSource` records the origin only). */
export function memberFromTemplate(t:ElementTemplate,code:string,project:Project,o:FromTemplateOptions={}):Member{
 const p=templatePayloadSchema.parse(t.payload),category=t.category as Category,inc=p.include??defaultInclude;
 // bar ids are kept: they are unique within the template, and `sk-<part>-…` / `pp-<part>-…` carry the owning part / preset
 const ids=new Set<string>(),bars=p.bars.map(b=>{const id=ids.has(b.id)?crypto.randomUUID():b.id;ids.add(id);return {...b,id,placementConfirmed:false};});
 let m:Member={...blankMember(category,code),description:p.description,cover:p.cover,quantityBasis:provisionalQuantityBasis(),bars};
 if(p.siteItems.length)m=withSiteWork(m,{...emptySiteWork(),items:p.siteItems.map(i=>({...i,id:crypto.randomUUID()}))});
 if(p.boqCategory&&category==='Custom')m={...m,boqCategory:p.boqCategory};
 const parsed=p.elementInput!==undefined?elementInputSchema.safeParse(p.elementInput):undefined;
 if(parsed?.success&&parsed.data.category===category){
  const input={...parsed.data,detailing:detailingFromSpec(project.spec,parsed.data.detailing,{category:parsed.data.category,mix:parsed.data.concreteMix})} as ElementInput;
  m=applyElementInput(m,input,{rounding:project.spec.rounding}).member;
  if(!inc.generated)m={...m,bars:m.bars.filter(b=>!isGeneratedBar(b))};
 }else if(p.shapeModel&&freeFormCategory(category)){
  // as the shape editor's apply: part presets rebuilt with the target spec, reference parts (genref-*) and bar ends past
  // the concrete (genext-*) become placement regions again (the template does not carry the placement context)
  m={...applyShapeModel(m,p.shapeModel),cover:p.cover};
  m=applyPartPresets(m,project.spec).member;
  if(!inc.generated)m={...m,bars:m.bars.filter(b=>!isPresetBar(b))};
 }
 if(p.sheetLayout)m={...m,sheetLayout:structuredClone(p.sheetLayout)};
 if(p.drawingEdits)m={...m,drawingEdits:structuredClone(p.drawingEdits)};
 const occ=o.occurrence;if(occ&&m.occurrences.length){const [first,...rest]=m.occurrences;m={...m,occurrences:[{...first,...(occ.quantity?{quantity:Math.max(1,Math.min(100000,Math.round(occ.quantity)))}:{}),...(occ.zone!==undefined?{zone:occ.zone.slice(0,80)}:{}),...(occ.floor!==undefined?{floor:occ.floor.slice(0,80)}:{})},...rest]};}
 const level=o.level??templateLevel(t),source:MemberTemplateSource={scope:level,templateId:t.id,version:t.version,name:t.name.slice(0,120),...(t.projectCode?{projectCode:t.projectCode}:{})};
 return {...m,templateSource:source};
}
/** Preview facts: summary, Mark count, steel per set (kg), concrete per set (m³) with the given spec. */
export function templateFacts(t:ElementTemplate,project:Project){
 try{const m=memberFromTemplate(t,'PREVIEW',project),one={...m,occurrences:m.occurrences.slice(0,1).map(o=>({...o,quantity:1}))},q=takeoff(one,project.spec);
  return {summary:templateSummary(t),marks:m.bars.length,steel:q.rebar,concrete:q.concrete,error:''};}
 catch(e){return {summary:templateSummary(t),marks:t.payload.bars.length,steel:0,concrete:0,error:e instanceof Error?e.message:String(e)};}
}
/** "มีเวอร์ชันใหม่ vN" for a member made from an older version (information only). */
export function newerVersion(source:MemberTemplateSource|undefined,templates:ElementTemplate[]):number|undefined{
 const t=source&&templates.find(x=>x.id===source.templateId);return t&&t.version>source!.version?t.version:undefined;
}

/** Next template document when saving over `old` (or creating it): version + 1, the old one goes to versions/{old.version}. */
export function nextTemplate(old:ElementTemplate|undefined,data:{id:string;name:string;description:string;category:Category;level:TemplateLevel;projectId?:string;projectCode?:string;payload:TemplatePayload;tags?:string[];key?:string;origin?:ElementTemplate['origin']},uid:string,at:string){
 const next=elementTemplateSchema.parse({id:data.id,name:data.name.trim(),description:data.description,category:data.category,scope:data.level==='project'?'project':'workspace',
  ...(data.level==='project'&&data.projectId?{projectId:data.projectId,projectCode:data.projectCode}:{}),...(data.level==='central'&&data.projectCode?{projectCode:data.projectCode}:{}),payload:data.payload,
  ...(data.tags?.length?{tags:data.tags}:{}),...(data.key?{key:data.key}:{}),...(data.origin?{origin:data.origin}:old?.origin?{origin:old.origin}:{}),
  version:old?old.version+1:1,createdAt:old?.createdAt||at,updatedAt:at,createdBy:old?.createdBy||uid,updatedBy:uid});
 const previous=old?templateVersionSchema.parse({...old,supersededAt:at,supersededBy:uid}):undefined;
 return {next,previous};
}
/** Template with the same name (case / space insensitive) in a list → saving under that name = a new version of it. */
export const sameName=(list:ElementTemplate[],name:string,category:Category)=>{const k=name.trim().replace(/\s+/g,' ').toLowerCase();return list.find(t=>t.category===category&&t.name.trim().replace(/\s+/g,' ').toLowerCase()===k);};

/** Migration plan of old central documents with scope 'project': copy to projects/{pid}/elementTemplates/{same id}. Idempotent:
 * a target that already holds the same id and version is skipped; originals are deleted only after every copy exists. */
export function templateMigrationPlan(central:ElementTemplate[],existing:Map<string,ElementTemplate>){
 const move=central.filter(t=>t.scope==='project'&&t.projectId);
 const copy=move.filter(t=>{const e=existing.get(`${t.projectId}/${t.id}`);return !e||e.version<t.version;});
 const conflicts=move.filter(t=>{const e=existing.get(`${t.projectId}/${t.id}`);return !!e&&e.version>t.version;});
 return {move,copy,skip:move.length-copy.length,conflicts,keep:central.filter(t=>t.scope!=='project'||!t.projectId).length};
}
/** Project templates of a backup, checked (restore keeps the ids: the target project is empty). */
export function backupTemplates(list:unknown):ElementTemplate[]{
 if(list===undefined)return [];if(!Array.isArray(list)||list.length>500)throw Error('Backup Template ของโครงการไม่ถูกต้อง');
 const out=list.map(v=>{const r=elementTemplateSchema.safeParse(v);if(!r.success||r.data.scope!=='project')throw Error('Backup Template ของโครงการไม่ถูกต้อง: '+(r.success?'ระดับ':r.error.issues[0]?.message));return r.data;});
 if(new Set(out.map(t=>t.id)).size!==out.length)throw Error('Backup Template ของโครงการมีรหัสซ้ำ');return out;
}
/** Template restored into project `pid` (owner fields re-pointed, history versions not carried). */
export const restoredTemplate=(t:ElementTemplate,pid:string,code:string):ElementTemplate=>elementTemplateSchema.parse({...t,projectId:pid,projectCode:code});
/** templateDefaults of a restored project: the id map (old → new, identity when absent) applied; keys whose template is
 * neither restored nor in `central` are dropped. */
export function restoredDefaults(defaults:unknown,idMap:Map<string,string>,central?:Set<string>):TemplateDefaults|undefined{
 if(!defaults)return undefined;const d=templateDefaultsSchema.parse(defaults),out:TemplateDefaults={};
 for(const [k,v] of Object.entries(d)){const n=idMap.get(v);if(n)out[k]=n;else if(!central||central.has(v))out[k]=v;}
 return out;
}
