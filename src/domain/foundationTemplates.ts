import {z} from 'zod';
import {DEFAULT_FOOTING_COLUMN,foundationSchema,type FoundationInput} from './elementInput';

// Project Foundation Template: the footing types of a project's foundation drawings (plan size, depth, piles, bars,
// pour stages, column positions), kept in the spec (spec.foundationTemplates) so a footing element picks a type and
// gets the whole input in one step. Column sections / starter bars still come from the column schedule.
const mm=z.number().finite().min(0).max(200000);
const off=z.number().finite().min(-100000).max(100000);
/** footing input taken from a template (the rest — detailing, columns' bars, pile length — stays the element's) */
export const foundationTemplateFieldsSchema=foundationSchema.pick({foundationType:true,shape:true,diameter:true,chamfer:true,armX:true,armY:true,
 width:true,length:true,thickness:true,pile:true,lean:true,cover:true,rebar:true,slab:true,pour:true,subbase:true,levels:true,excavation:true,blocks:true,cuts:true,walls:true,items:true});
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
 const f=structuredClone(t.fields),{blocks:_b,cuts:_c,walls:_w,items:_it,...base}=structuredClone(i),v:FoundationInput={...base,...f};
 if(!(f.pile.length>0))v.pile={...v.pile,length:i.pile.length,cutoff:i.pile.cutoff};
 const [c1,...rest]=t.columns;
 if(c1){
  const base=i.column.type==='none'?{...structuredClone(DEFAULT_FOOTING_COLUMN),...structuredClone(i.column),type:'starter' as const,shape:'rect' as const,width:c1.width||i.column.width,depth:c1.depth||i.column.depth}:structuredClone(i.column);
  v.column={...base,offsetX:c1.offsetX,offsetY:c1.offsetY};
  v.extraColumns=rest.map((c,k)=>{const old=i.extraColumns[k];return old?{...structuredClone(old),offsetX:c.offsetX,offsetY:c.offsetY}:{...structuredClone(v.column),columnNo:'',linked:true,offsetX:c.offsetX,offsetY:c.offsetY,...(c.width&&c.depth&&(c.width!==c1.width||c.depth!==c1.depth)?{linked:false,width:c.width,depth:c.depth}:{})};});
 }
 else{v.column={...v.column,type:'none'};v.extraColumns=[];}
 v.template={id:t.id,name:t.name};
 return v;
}
/** The footing still matches its template (geometry, piles without length / cut-off, bars, pours, levels, column positions);
 * false = the template in the spec changed (or the footing was edited) since it was applied. */
export function foundationTemplateCurrent(i:FoundationInput,t:FoundationTemplate){
 const f=t.fields,same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),pile=(p:FoundationInput['pile'])=>({...p,length:0,cutoff:0});
 if(!(Object.keys(f) as (keyof typeof f)[]).every(k=>k==='pile'?same(pile(f.pile),pile(i.pile)):same(f[k],i[k])))return false;
 const cols=[i.column,...i.extraColumns];return t.columns.every((c,k)=>cols[k]&&cols[k].offsetX===c.offsetX&&cols[k].offsetY===c.offsetY);
}
const barText=(l:{diameter:number;spacing:number})=>`Y${l.diameter}-${Math.round(l.spacing*10)/10}`;
/** One-line summary of a template (picker / spec list). */
export function foundationTemplateSummary(t:FoundationTemplate){
 const f=t.fields,p=f.pile,piles=f.foundationType!=='pile'?'ฐานแผ่':`เข็ม ${p.layout==='custom'?(p.positions||[]).length:p.layout==='grid'?p.nx*p.ny:p.count} ต้น ${p.type==='square'?'□':'Ø'}${p.size}`,r=f.rebar;
 const open=(f.cuts||[]).filter(b=>b.z0<=.5&&b.z1>=f.thickness-1),lowered=(f.cuts||[]).filter(b=>!open.includes(b));
 return [`${f.width}×${f.length}×${f.thickness}`,piles,`ล่าง${r.bottomX.shape==='41'&&f.pour.count>1?` (ตัว U ขึ้น Stage ${f.pour.count} + Ldh${r.bottomX.leg?` ${r.bottomX.leg}`:''})`:''} ${r.stirrups?.enabled&&r.stirrups.replacesBottom?(r.stirrups.dir==='x'?`${barText(r.bottomX)} / HOOP ${barText(r.stirrups)}`:`HOOP ${barText(r.stirrups)} / ${barText(r.bottomY)}`):`${barText(r.bottomX)} / ${barText(r.bottomY)}`}`,...f.pour.joints.slice(0,Math.max(0,f.pour.count-1)).map((j,k)=>j.mesh.enabled?`ตะแกรงบน Stage ${k+1} ${barText(j.mesh.x)} / ${barText(j.mesh.y)}${j.mesh.end==='straight'?'':' (ปลายงอ)'}`:''),
  r.topX.enabled?`บน${f.blocks?.length||lowered.length?(f.blocks?.some(b=>b.bars||b.rib)?' Stage 1':' (ทุกระดับ)'):f.pour.count>1?` Stage ${f.pour.count}`:''} ${barText(r.topX)}${r.topY.enabled?` / ${barText(r.topY)}`:''}${f.slab.enabled?` (ยื่นเข้าพื้น ${f.slab.extend})`:''}`:'',f.pour.count>1?`เท ${f.pour.count} ครั้ง (${[...f.pour.heights.slice(0,f.pour.count-1),Math.max(f.thickness,...(f.blocks||[]).map(b=>b.z1))-f.pour.heights.slice(0,f.pour.count-1).reduce((a,b)=>a+b,0)].join(' + ')})`:'',
  r.side.enabled?`LOOPS ${barText(r.side)}`:'',r.sideBars.enabled?`ข้าง ${r.sideBars.y?`X ${barText(r.sideBars)} Y ${barText(r.sideBars.y)}`:barText(r.sideBars)}${f.pour.count>1?(r.sideBars.toJoint?' (ถึง Stage 1)':` (ขึ้น Stage ${f.pour.count}${r.sideBars.top==='inward'?` + Ldh${r.sideBars.leg?` ${r.sideBars.leg}`:''}`:''})`):''}`:'',r.stirrups?.enabled?`${r.stirrups.replacesBottom?'HOOP':'ปลอก'} ${barText(r.stirrups)} กว้าง ${r.stirrups.width}`:'',t.columns.length>1?`เสา ${t.columns.length} ต้น`:'',f.blocks?.some(b=>!b.rib)?`ส่วนเพิ่ม ${f.blocks.filter(b=>!b.rib).length} (${[...new Set(f.blocks.filter(b=>!b.rib).map(b=>`+${b.z1-b.z0}`))].join('/')})${[...new Set(f.blocks.filter(b=>b.bars&&!b.rib).map(b=>`Y${b.bars!.diameter}-${b.bars!.spacing}`))].map(v=>` บน ${v}`).join('')}`:'',
  ...[...new Set((f.blocks||[]).filter(b=>b.rib).map(b=>{const r=b.rib!;return `บน ${r.top.count}Y${r.top.diameter}${r.links?` · U Y${r.links.diameter}-${r.links.spacing}`:''}`;}))].map(v=>`ครีบ ${(f.blocks||[]).filter(b=>b.rib).length} แนว (${v})`),
  f.items?.length?f.items.map(it=>`${it.label} ${it.quantity} ${it.unit}`).join(' · '):'',open.length?`ตัดมุมแปลน ${open.length}`:'',lowered.length?`ส่วนลดระดับ ${lowered.length}`:'',f.walls?.length?`ผนัง ${f.walls.length} ช่วง${f.walls.some(w=>w.dowels)?` (เหล็กในฐาน ${[...new Set(f.walls.filter(w=>w.dowels).map(w=>`Y${w.dowels!.diameter}-${w.dowels!.spacing}`))].join(' / ')})`:''}`:''].filter(Boolean).join(' · ');
}
