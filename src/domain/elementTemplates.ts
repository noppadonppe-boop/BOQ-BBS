import {z} from 'zod';
import {APP_NAME} from './auth';
import {barSchema,blankMember,categories,type Category,type Member,type Project} from './model';
import {applyElementInput,elementInputSchema,isGeneratedBar,supportsElementInput,type ElementInput} from './elementInput';
import {detailingFromSpec} from './specDetailing';
import {shapeModelSchema,type ShapeModel} from './shapeModelSchema';
import {applyShapeModel} from './shapeApply';
import {boqCategorySchema} from './reportCategory';
import {emptySiteWork,siteItemSchema,withSiteWork} from './siteWork';
import {provisionalQuantityBasis} from './quantityBasis';

// Element templates live at workspace level (like General Spec profiles). scope 'project' = shown only in
// that project; 'workspace' = every project. The payload holds the element's inputs, not its quantities:
// a member made from a template is re-applied with the target project's spec (bars regenerated).
export const elementTemplatesPath=`${APP_NAME}/root/elementTemplates`;
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const templatePayloadSchema=z.object({
 description:z.string().max(500),
 cover:z.number().finite().nonnegative().max(1000),
 elementInput:z.unknown().optional(),
 shapeModel:shapeModelSchema.optional(),
 boqCategory:boqCategorySchema.optional(),
 siteItems:z.array(siteItemSchema).max(30),
 /** bars entered by hand (Custom sketch bars, extra bars of standard elements) */
 bars:z.array(barSchema).max(300),
}).strict();
export const elementTemplateSchema=z.object({id,name:z.string().trim().min(1).max(120),description:z.string().max(500),category:z.enum(categories),
 scope:z.enum(['workspace','project']),projectId:id.optional(),projectCode:z.string().max(120).optional(),payload:templatePayloadSchema,
 version:z.number().int().min(1),createdAt:z.string().max(40),updatedAt:z.string().max(40),createdBy:z.string().max(128),updatedBy:z.string().max(128)}).strict();
export type ElementTemplate=z.infer<typeof elementTemplateSchema>;
export type TemplatePayload=z.infer<typeof templatePayloadSchema>;

/** Payload from an element's current inputs (the input panel state or the shape editor draft). */
export function templatePayload(m:Member,over:{elementInput?:ElementInput;shapeModel?:ShapeModel;siteItems?:TemplatePayload['siteItems'];bars?:Member['bars'];cover?:number;boqCategory?:Member['boqCategory']}={}):TemplatePayload{
 const input=over.elementInput??(supportsElementInput(m.category)?elementInputSchema.safeParse(m.elementInput).data:undefined);
 const {appliedAt:_a,source:_s,...cleanInput}=(input||{}) as ElementInput&{appliedAt?:string;source?:unknown};
 const shape=over.shapeModel??m.shapeModel,bars=(over.bars??m.bars).filter(b=>!isGeneratedBar(b));
 return templatePayloadSchema.parse({description:m.description,cover:over.cover??m.cover,...(input?{elementInput:{...cleanInput,mode:'manual'}}:{}),
  ...(m.category==='Custom'&&shape?{shapeModel:{...structuredClone(shape),confirmed:false}}:{}),...(m.category==='Custom'&&(over.boqCategory??m.boqCategory)?{boqCategory:over.boqCategory??m.boqCategory}:{}),
  siteItems:over.siteItems??m.siteWork?.items??[],bars:bars.map(b=>({...b,placementConfirmed:false}))});
}
/** Summary line of a template for pickers. */
export function templateSummary(t:ElementTemplate){
 const p=t.payload,i=elementInputSchema.safeParse(p.elementInput);
 if(i.success){const v=i.data;switch(v.category){
  case 'Foundation':return `${v.shape==='circle'?`Ø${v.diameter}`:`${v.width}×${v.length}`}×${v.thickness}${v.foundationType==='pile'?` · เข็ม ${v.pile.count||v.pile.nx*v.pile.ny} ต้น`:''}${v.column.type!=='none'?` · ${v.column.type==='pedestal'?'ตอม่อ':'Starter'} ${1+v.extraColumns.length} ต้น`:''}`;
  case 'Beam':return v.layout==='group'?`กลุ่มคาน ${v.spans.length} ช่วง · ${[...new Set(v.spans.map(s=>s.mark))].join(', ')}`:`${v.width}×${v.depth} ยาว ${v.length}`;
  case 'Column':return `${v.shape==='circle'?`Ø${v.diameter}`:`${v.width}×${v.depth}`} สูง ${v.height}`;
  case 'Slab':return `${v.lengthX}×${v.lengthY} หนา ${v.thickness}${v.ground.support==='ground'?' · บนดิน':''}`;
  case 'Wall':return `ยาว ${v.length} หนา ${v.thickness} สูง ${v.height}`;}}
 return p.shapeModel?`${p.shapeModel.parts.length} ชิ้นส่วน${p.shapeModel.piles?` · เข็ม ${p.shapeModel.piles.positions.length} ต้น`:''}`:'';
}
/** New member (unsaved, version 0) from a template, applied with the target project's spec. */
export function memberFromTemplate(t:ElementTemplate,code:string,project:Project):Member{
 const p=templatePayloadSchema.parse(t.payload),category=t.category as Category;
 let m:Member={...blankMember(category,code),description:p.description,cover:p.cover,quantityBasis:provisionalQuantityBasis(),bars:p.bars.map(b=>({...b,id:b.id.startsWith('sk-')?`sk-${crypto.randomUUID()}`:crypto.randomUUID(),placementConfirmed:false}))};
 if(p.siteItems.length)m=withSiteWork(m,{...emptySiteWork(),items:p.siteItems.map(i=>({...i,id:crypto.randomUUID()}))});
 if(p.boqCategory&&category==='Custom')m={...m,boqCategory:p.boqCategory};
 const parsed=p.elementInput!==undefined?elementInputSchema.safeParse(p.elementInput):undefined;
 if(parsed?.success&&parsed.data.category===category){
  const input={...parsed.data,detailing:detailingFromSpec(project.spec,parsed.data.detailing)} as ElementInput;
  m=applyElementInput(m,input,{rounding:project.spec.rounding}).member;
 }else if(p.shapeModel&&category==='Custom')m={...applyShapeModel(m,p.shapeModel),cover:p.cover};
 return m;
}
