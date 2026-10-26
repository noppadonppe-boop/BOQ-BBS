import {blankMember,type Category,type Member,type Project} from './model';
import {steelCategories,steelInputSchema,assemblyTypes,type SteelCategory,type SteelInput,type SteelPart} from './steelInputSchema';
import {parseProfile,pieceQuantities,profileKindLabels,type Profile} from './steelProfiles';
import {emptySiteWork,withSiteWork,type SiteItem} from './siteWork';
import {locationTree,withLoc} from './locations';
import {parsePlacements,type ImportAction} from './archSchedules';
import {canonical} from './canonical';

export const isSteelCategory=(c:Category):c is SteelCategory=>(steelCategories as readonly string[]).includes(c);
export const STEEL_ITEM_PREFIX='stl-';
export const isSteelItem=(i:Pick<SiteItem,'id'>)=>i.id.startsWith(STEEL_ITEM_PREFIX);
const key=()=>crypto.randomUUID().replace(/-/g,'').slice(0,12);
export function defaultSteelInput():SteelInput{
 return {kind:'assembly',type:'column',name:'',parts:[{id:key(),mark:'M1',profile:'H-150X150X7X10',grade:'SS400',count:1,length:3000,main:true}],bolts:[],welds:[],paint:'ทาสีกันสนิม 2 ชั้น + สีทับหน้า 2 ชั้น'};
}
const round=(v:number,d=6)=>Number(v.toFixed(d));
export type PartLine={part:SteelPart;profile?:Profile;each:number;weight:number;paint:number};
/** Weight (kg, listed weight first) and paint area (m²) per part line × count; unknown profiles weigh 0 (problem). */
export function partLines(i:SteelInput):PartLine[]{
 return i.parts.map(part=>{const profile=parseProfile(part.profile),q=profile?pieceQuantities(profile,part.length):{weight:0,paint:0},each=part.weight??q.weight;
  return {part,profile,each,weight:each*part.count,paint:q.paint*part.count};});
}
export function steelQuantities(i:SteelInput){
 const lines=partLines(i),weight=lines.reduce((n,l)=>n+l.weight,0),paint=lines.reduce((n,l)=>n+l.paint,0);
 const main=i.parts.find(p=>p.main)||i.parts[0],mp=parseProfile(main.profile);
 return {lines,weight,paint,bolts:i.bolts.reduce((n,b)=>n+b.count,0),weld:i.welds.reduce((n,w)=>n+w.length*w.count,0)/1000,main,mainProfile:mp};
}
export function steelProblems(i:SteelInput):string[]{
 const out=i.parts.filter(p=>!parseProfile(p.profile)&&p.weight===undefined).map(p=>`${p.mark}: ไม่รู้จัก Profile “${p.profile}” (เช่น H-150X150X7X10, PL10*115, L-50X50X5) หรือใส่น้ำหนักต่อชิ้น`);
 if(i.parts.filter(p=>p.main).length>1)out.push('ชิ้นหลัก (Main part) มีได้ชิ้นเดียว');
 const marks=i.parts.map(p=>p.mark.toUpperCase());if(new Set(marks).size!==marks.length)out.push('Mark ชิ้นส่วนซ้ำใน Assembly');
 return out;
}
/** BOQ items of an assembly: kg per section profile + grade, plates per thickness + grade, bolts per size / grade /
 * length, weld length per type / size, paint area. Grouped coarser (per profile kind) when they would exceed 30. */
export function steelItems(i:SteelInput):SiteItem[]{
 const q=steelQuantities(i),w=new Map<string,{label:string;kg:number}>(),add=(k:string,label:string,kg:number)=>{const v=w.get(k)||{label,kg:0};v.kg+=kg;w.set(k,v);};
 const extra:SiteItem[]=[
  ...Object.values(i.bolts.reduce<Record<string,SiteItem>>((acc,b)=>{const label=`สลักเกลียว ${b.size}${b.grade?` เกรด ${b.grade}`:''}${b.length?` ยาว ${Math.round(b.length)} mm`:''}`,k=label;acc[k]=acc[k]||{id:`${STEEL_ITEM_PREFIX}bolt-${Object.keys(acc).length+1}`,label:label.slice(0,120),unit:'ชุด',quantity:0};acc[k].quantity+=b.count;return acc;},{})),
  ...Object.values(i.welds.reduce<Record<string,SiteItem>>((acc,x)=>{const label=`งานเชื่อม ${x.type==='fillet'?'Fillet':'Butt (CJP)'}${x.size?` ${x.size} mm`:''}`;acc[label]=acc[label]||{id:`${STEEL_ITEM_PREFIX}weld-${Object.keys(acc).length+1}`,label,unit:'m',quantity:0};acc[label].quantity=round(acc[label].quantity+x.length*x.count/1000);return acc;},{})),
  ...(i.paint.trim()&&q.paint>0?[{id:`${STEEL_ITEM_PREFIX}paint`,label:i.paint.trim().slice(0,120),unit:'m²',quantity:round(q.paint)}]:[])];
 const grade=(l:PartLine)=>l.part.grade.trim()?` ${l.part.grade.trim()}`:'';
 for(const l of q.lines){if(!l.weight)continue;const p=l.profile;
  if(p?.plate)add(`PL${p.plate.t}|${l.part.grade}`,`แผ่นเหล็ก PL${p.plate.t} mm${grade(l)}`,l.weight);else add(`${p?.name||l.part.profile}|${l.part.grade}`,`${p?profileKindLabels[p.kind]:'เหล็กรูปพรรณ'} ${p?.name||l.part.profile}${grade(l)}`,l.weight);}
 if(w.size+extra.length>30){w.clear();for(const l of q.lines){if(!l.weight)continue;const k=l.profile?.kind||'H';add(`${k}|${l.part.grade}`,`${profileKindLabels[k]}${grade(l)}`,l.weight);}}
 return [...[...w.values()].map((v,k)=>({id:`${STEEL_ITEM_PREFIX}kg-${k+1}`,label:v.label.slice(0,120),unit:'kg',quantity:round(v.kg,3)})),...extra].slice(0,30);
}
/** Applies an assembly input: no concrete, BOQ items `stl-*` (other items kept), box = main part length × size. */
export function applySteelInput(m:Member,raw:SteelInput):Member{
 const input=steelInputSchema.parse(raw),bad=steelProblems(input);if(bad.length)throw Error(bad.join(' · '));
 const {shapeModel:_s,geometry:_g,prismGeometry:_p,civilInput:_c,archInput:_a,...rest}=m,items=steelItems(input),q=steelQuantities(input);
 const sw=withSiteWork({...rest},{...(m.siteWork||emptySiteWork()),items:[...items,...(m.siteWork?.items||[]).filter(i=>!isSteelItem(i)).slice(0,30-items.length)]});
 const side=(v:number)=>Math.max(1,Math.round(v)),p=q.mainProfile;
 return {...sw,x:side(q.main.length),y:side(p?.width||100),z:side(p?.depth||100),cover:0,faces:[false,false,false,false,false,false],pedestal:{x:0,y:0,z:0},lean:{x:0,y:0,thickness:0},excavation:{bottomX:0,bottomY:0,topX:0,topY:0,depth:0,buriedConcrete:0},steelInput:input,status:'Draft'};
}
/** Measures for the owner BOQ: painted area (m²). */
export function steelMeasures(m:Pick<Member,'steelInput'>):{area?:number}{return m.steelInput?{area:steelQuantities(m.steelInput).paint}:{};}

// ---------------------------------------------------------------- Excel (Tekla material list style)
export type SteelPartRow={assembly:string;mark:string;profile:string;grade:string;count:string;length:string;weight:string;main:string;source:string};
export type SteelBoltRow={assembly:string;size:string;grade:string;length:string;count:string;hole:string;source:string};
export type SteelWeldRow={assembly:string;type:string;size:string;length:string;count:string;source:string};
export type SteelAssemblyRow={assembly:string;type:string;name:string;quantity:string;locations:string;paint:string;source:string};
export const steelHeads={parts:['Assembly','Mark','Profile','Material','No.','Length (mm)','Weight / ชิ้น (kg · ว่าง = คำนวณ)','Main (Y)'],bolts:['Assembly','Size (M..)','Grade','Length (mm)','No.','Hole (mm)'],welds:['Assembly','Type (Fillet / Butt)','Size (mm)','Length (mm)','No.'],assemblies:['Assembly','Type','Name','Quantity','ตำแหน่ง (WBS × จำนวน)','ระบบสี (ว่าง = ไม่มี)']};
const num=(t:string)=>{const v=Number(String(t).replace(/,/g,'').trim());return t.trim()&&Number.isFinite(v)?v:undefined;};
const typeWord=(t:string)=>assemblyTypes.find(k=>k===t.trim().toLowerCase())||(/เสา|^col/i.test(t)?'column':/คาน|^beam|^b$/i.test(t)?'beam':/ค้ำ|brac/i.test(t)?'brace':/แป|purlin|girt/i.test(t)?'purlin':/truss|ถัก/i.test(t)?'truss':/บันได|stair/i.test(t)?'stair':undefined);
/** Rows of the Parts / Bolts / Welds / Assemblies sheets → SteelAssembly members (code = assembly mark). */
export function planSteelImport(project:Project,members:Member[],rows:{parts:SteelPartRow[];bolts:SteelBoltRow[];welds:SteelWeldRow[];assemblies:SteelAssemblyRow[]}):{members:ImportAction<Member>[];problems:string[]}{
 const problems:string[]=[],out:ImportAction<Member>[]=[],tree=locationTree(project.locations),norm=(s:string)=>s.trim().toUpperCase();
 const codes=[...new Set(rows.parts.map(r=>r.assembly.trim()).filter(Boolean))];
 for(const code of codes){
  const parts:SteelPart[]=[],bad:string[]=[];
  for(const r of rows.parts.filter(x=>norm(x.assembly)===norm(code))){const c=num(r.count)??1,L=num(r.length),w=num(r.weight);
   if(!r.mark||!r.profile||!(L&&L>0)||!(c>=1)){bad.push(`${r.source}: กรอก Mark / Profile / Length / No. ให้ครบ`);continue;}
   parts.push({id:key(),mark:r.mark.trim().slice(0,20),profile:r.profile.trim().slice(0,60),grade:r.grade.trim().slice(0,20),count:Math.round(c),length:L,main:/^(y|yes|1|main|✓|x)$/i.test(r.main.trim()),...(w!==undefined?{weight:w}:{})});}
  if(bad.length){problems.push(...bad);continue;}
  if(!parts.some(p=>p.main))parts[0].main=true;
  const a=rows.assemblies.find(x=>norm(x.assembly)===norm(code)),old=members.find(m=>m.category==='SteelAssembly'&&norm(m.code)===norm(code)),oldIn=old?.steelInput;
  const input:SteelInput={kind:'assembly',type:(a&&typeWord(a.type))||oldIn?.type||'other',name:(a?.name||oldIn?.name||'').trim().slice(0,120),parts,
   bolts:rows.bolts.filter(x=>norm(x.assembly)===norm(code)).map(b=>{const size=b.size.trim().toUpperCase().replace(/^(\d)/,'M$1'),d=Number(size.replace(/\D/g,''))||0;return {id:key(),size:size.slice(0,12),grade:b.grade.trim().slice(0,20),length:num(b.length)??0,count:Math.max(1,Math.round(num(b.count)??1)),hole:num(b.hole)??(d?d+2:0)};}),
   welds:rows.welds.filter(x=>norm(x.assembly)===norm(code)).flatMap(x=>{const L=num(x.length);return L&&L>0?[{id:key(),type:/butt|cjp|ร่อง/i.test(x.type)?'butt' as const:'fillet' as const,size:num(x.size)??0,length:L,count:Math.max(1,Math.round(num(x.count)??1))}]:[];}),
   paint:a?a.paint.trim().slice(0,120):oldIn?.paint??defaultSteelInput().paint};
  let occurrences=old?.occurrences||[{id:crypto.randomUUID(),zone:'',floor:'',grid:'',quantity:Math.max(1,Math.round(num(a?.quantity||'')??1))}];
  if(a?.locations.trim()){const placed=parsePlacements(tree,a.locations);if(typeof placed==='string'){problems.push(`${a.source}: ${placed}`);continue;}occurrences=placed.map(p=>withLoc(tree,{id:crypto.randomUUID(),zone:'',floor:'',grid:'',quantity:p.quantity},p.loc));}
  else if(a&&num(a.quantity)!==undefined&&!old)occurrences=[{...occurrences[0],quantity:Math.max(1,Math.round(num(a.quantity)!))}];
  try{const next=applySteelInput({...(old||blankMember('SteelAssembly',code)),description:input.name,occurrences},input);
   const same=!!old&&canonical([old.steelInput,old.occurrences.map(o=>[o.loc||null,o.quantity])])===canonical([next.steelInput,next.occurrences.map(o=>[o.loc||null,o.quantity])]);
   out.push({item:next,code,action:!old?'add':same?'same':'update'});}
  catch(e:any){problems.push(`${code}: ${e?.message||e}`);}
 }
 for(const r of [...rows.bolts,...rows.welds,...rows.assemblies])if(r.assembly.trim()&&!codes.some(c=>norm(c)===norm(r.assembly))&&!members.some(m=>m.category==='SteelAssembly'&&norm(m.code)===norm(r.assembly)))problems.push(`${r.source}: ไม่มี Assembly ${r.assembly} ในแผ่นงาน Parts`);
 return {members:out,problems};
}
