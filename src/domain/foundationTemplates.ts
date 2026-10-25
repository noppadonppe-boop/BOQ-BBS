import {z} from 'zod';
import {DEFAULT_FOOTING_COLUMN,foundationSchema,type FoundationInput} from './elementInput';

// Project Foundation Template: the footing types of a project's foundation drawings (plan size, depth, piles, bars,
// pour stages, column positions), kept in the spec (spec.foundationTemplates) so a footing element picks a type and
// gets the whole input in one step. Column sections / starter bars still come from the column schedule.
const mm=z.number().finite().min(0).max(200000);
const off=z.number().finite().min(-100000).max(100000);
/** footing input taken from a template (the rest — detailing, columns' bars, pile length — stays the element's) */
export const foundationTemplateFieldsSchema=foundationSchema.pick({foundationType:true,shape:true,diameter:true,chamfer:true,armX:true,armY:true,
 width:true,length:true,thickness:true,pile:true,lean:true,cover:true,rebar:true,slab:true,pour:true,subbase:true,levels:true,excavation:true});
export type FoundationTemplateFields=z.infer<typeof foundationTemplateFieldsSchema>;
export const foundationTemplateSchema=z.object({
 id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
 name:z.string().trim().min(1).max(40),
 /** delivery group / phase (e.g. "Phase 1") */
 group:z.string().max(40).default(''),
 note:z.string().max(1000).default(''),
 /** drawing reference (sheet / detail) */
 source:z.string().max(300).default(''),
 fields:foundationTemplateFieldsSchema,
 /** columns on the footing as drawn: offset of the column centre from the footing centre + reference section */
 columns:z.array(z.object({offsetX:off,offsetY:off,width:mm,depth:mm}).strict()).max(10),
}).strict();
export type FoundationTemplate=z.infer<typeof foundationTemplateSchema>;
export const foundationTemplatesSchema=z.array(foundationTemplateSchema).max(300)
 .superRefine((list,ctx)=>{const ids=new Set<string>(),names=new Set<string>();list.forEach((t,i)=>{if(ids.has(t.id))ctx.addIssue({code:'custom',path:[i,'id'],message:'รหัส Template ฐานรากซ้ำ'});
  if(names.has(t.name.toUpperCase()))ctx.addIssue({code:'custom',path:[i,'name'],message:`ชื่อฐานราก ${t.name} ซ้ำ`});ids.add(t.id);names.add(t.name.toUpperCase());});});

/** Footing input from a template: geometry, piles (pile length / cut-off kept when the template has none), bars,
 * pour stages and levels; columns moved to the template positions (C1 + extra columns linked to C1), keeping the
 * element's column type, section and bars (a footing without columns gets starter bars at the reference size). */
export function applyFoundationTemplate(i:FoundationInput,t:FoundationTemplate):FoundationInput{
 const f=structuredClone(t.fields),v:FoundationInput={...structuredClone(i),...f};
 if(!(f.pile.length>0))v.pile={...v.pile,length:i.pile.length,cutoff:i.pile.cutoff};
 const [c1,...rest]=t.columns;
 if(c1){
  const base=i.column.type==='none'?{...structuredClone(DEFAULT_FOOTING_COLUMN),...structuredClone(i.column),type:'starter' as const,shape:'rect' as const,width:c1.width||i.column.width,depth:c1.depth||i.column.depth}:structuredClone(i.column);
  v.column={...base,offsetX:c1.offsetX,offsetY:c1.offsetY};
  v.extraColumns=rest.map((c,k)=>{const old=i.extraColumns[k];return old?{...structuredClone(old),offsetX:c.offsetX,offsetY:c.offsetY}:{...structuredClone(v.column),columnNo:'',linked:true,offsetX:c.offsetX,offsetY:c.offsetY,...(c.width&&c.depth&&(c.width!==c1.width||c.depth!==c1.depth)?{linked:false,width:c.width,depth:c.depth}:{})};});
 }
 v.template={id:t.id,name:t.name};
 return v;
}
const barText=(l:{diameter:number;spacing:number})=>`Y${l.diameter}-${Math.round(l.spacing*10)/10}`;
/** One-line summary of a template (picker / spec list). */
export function foundationTemplateSummary(t:FoundationTemplate){
 const f=t.fields,p=f.pile,piles=f.foundationType!=='pile'?'ฐานแผ่':`เข็ม ${p.layout==='grid'?p.nx*p.ny:p.count} ต้น Ø${p.size}`,r=f.rebar;
 return [`${f.width}×${f.length}×${f.thickness}`,piles,`ล่าง ${barText(r.bottomX)} / ${barText(r.bottomY)}`,r.topX.enabled?`บน ${barText(r.topX)}${r.topY.enabled?` / ${barText(r.topY)}`:''}`:'',
  r.side.enabled?`LOOPS ${barText(r.side)}`:'',r.sideBars.enabled?`ข้าง ${barText(r.sideBars)}`:'',r.stirrups?.enabled?`ปลอก ${barText(r.stirrups)} กว้าง ${r.stirrups.width}`:'',t.columns.length>1?`เสา ${t.columns.length} ต้น`:''].filter(Boolean).join(' · ');
}
