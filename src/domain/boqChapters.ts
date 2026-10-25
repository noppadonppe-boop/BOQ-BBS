import {z} from 'zod';
import {categories,labels,type Category,type Member,type SnapshotBundle} from './model';
import {takeoff} from './engine';
import {reportCategory} from './reportCategory';
import {disciplineInfo,disciplineOf,disciplines,type Discipline} from './disciplines';
import {memberConcrete} from './concreteMixes';
import {pileQuantities} from './elementInput';
import {pileInput} from './pileReport';
import {siteKinds,siteLabels,siteUnits} from './siteWork';
import {locationTree} from './locations';
import {quantityBasisCoverage} from './quantityBasis';
import {reinforcementCoverage} from './reinforcementCoverage';

// Owner / consultant BOQ chapters per project (`project.boqChapters`): the owner's item list (code 1 / 1.1 / 1.1.2,
// description, unit) with a rule per quantity item telling which system quantity goes there. Every quantity of the
// selected members goes to the most specific matching item; the rest is reported as unmatched.
export const boqComponents=['concrete','formwork','excavation','backfill','lean','rebar','pile','pilecut','site'] as const;
export type BoqComponent=typeof boqComponents[number];
export const boqComponentLabels:Record<BoqComponent,string>={concrete:'คอนกรีต',formwork:'แบบหล่อ',excavation:'ขุดดิน',backfill:'ถมกลับ',lean:'คอนกรีตหยาบ',rebar:'เหล็กเสริม',pile:'เสาเข็ม',pilecut:'ตัดหัวเข็ม',site:'งานรองพื้น / รายการเพิ่มเอง'};
const baseUnits:Record<BoqComponent,string>={concrete:'m³',formwork:'m²',excavation:'m³',backfill:'m³',lean:'m³',rebar:'kg',pile:'ต้น',pilecut:'ต้น',site:''};
const componentWords:[BoqComponent,RegExp][]=[['concrete',/^(concrete|คอนกรีต(โครงสร้าง)?)$/i],['formwork',/^(formwork|แบบหล่อ|ไม้แบบ)$/i],['excavation',/^(excavation|ขุดดิน|งานดินขุด)$/i],['backfill',/^(backfill|ถมกลับ|ดินถมกลับ)$/i],['lean',/^(lean|lean concrete|คอนกรีตหยาบ)$/i],['rebar',/^(rebar|reinforcement|เหล็กเสริม|เหล็ก)$/i],['pile',/^(pile|piles|เสาเข็ม)$/i],['pilecut',/^(pile ?cut|pile cutting|ตัดหัวเข็ม|ตัดหัวเสาเข็ม)$/i],['site',/^(site|site ?work|งานรองพื้น|รายการเพิ่มเอง|รองพื้น)$/i]];
export const parseComponent=(t:string)=>componentWords.find(([,re])=>re.test(t.trim().replace(/\s+/g,' ')))?.[0];

const text=(max:number)=>z.string().trim().max(max);
export const boqRuleSchema=z.object({
 component:z.enum(boqComponents),disciplines:z.array(z.enum(disciplines)).max(4).optional(),categories:z.array(z.enum(categories)).max(categories.length).optional(),
 mix:text(60).optional(),diameters:z.array(z.number().int().min(4).max(60)).max(20).optional(),grades:z.array(text(20)).max(10).optional(),buildings:z.array(text(20)).max(50).optional(),siteItem:text(120).optional(),
}).strict();
export type BoqRule=z.infer<typeof boqRuleSchema>;
export const boqItemSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),code:text(30),title:text(300).min(1),unit:text(20),note:text(300).optional(),rule:boqRuleSchema.optional()}).strict();
export type BoqItem=z.infer<typeof boqItemSchema>;
export const boqChaptersSchema=z.object({version:z.number().int().nonnegative(),source:text(200).optional(),importedAt:text(40).optional(),items:z.array(boqItemSchema).min(1).max(3000)}).strict();
export type BoqChapters=z.infer<typeof boqChaptersSchema>;

/** Indent level from the code: "2" → 0, "2.1" → 1, "2.1.3" → 2 (other codes: 0). */
export const itemLevel=(code:string)=>Math.max(0,code.split(/[.\-]/).filter(Boolean).length-1);
const specificity=(r:BoqRule)=>[r.disciplines,r.categories,r.mix,r.diameters,r.grades,r.buildings,r.siteItem].filter(v=>Array.isArray(v)?v.length:v).length;
/** Pile / pile cutting by length when the item unit is metres; rebar in tonnes when the unit says so. */
const unitFactor=(component:BoqComponent,unit:string)=>{const u=unit.trim().toLowerCase();if(component==='rebar'&&/^(t|ton|tons|tonne|ตัน)$/.test(u))return 0.001;return 1;};
const byLength=(component:BoqComponent,unit:string)=>(component==='pile'||component==='pilecut')&&/^(m|เมตร|ม\.?)$/i.test(unit.trim());

type Contribution={component:BoqComponent;value:number;length?:number;unit:string;label:string;memberId:string;category:Category;discipline:Discipline;mix:string;fc?:number;diameter?:number;grade?:string;building:string};
function matches(r:BoqRule,c:Contribution){
 if(r.component!==c.component)return false;
 if(r.disciplines?.length&&!r.disciplines.includes(c.discipline))return false;
 if(r.categories?.length&&!r.categories.includes(c.category))return false;
 if(r.mix){const mx=r.mix.toUpperCase(),n=Number(r.mix);if(!(c.mix.toUpperCase().includes(mx)||(Number.isFinite(n)&&c.fc===n)))return false;}
 if(r.diameters?.length&&!(c.diameter&&r.diameters.includes(c.diameter)))return false;
 if(r.grades?.length&&!(c.grade&&r.grades.some(g=>g.toUpperCase()===c.grade!.toUpperCase())))return false;
 if(r.buildings?.length&&!r.buildings.some(b=>b.toUpperCase()===c.building.toUpperCase()))return false;
 if(r.siteItem&&!c.label.toLowerCase().includes(r.siteItem.toLowerCase()))return false;
 return true;
}
/** Every quantity of the bundle (per occurrence) with what a rule can test. */
export function boqContributions(bundle:SnapshotBundle):Contribution[]{
 const out:Contribution[]=[],tree=locationTree(bundle.project.locations);
 for(const m of bundle.members){
  const frozen=bundle.calculations?.[m.id],q=frozen||takeoff(m,bundle.project.spec),category=reportCategory(m),discipline=disciplineOf(m.category),mix=memberConcrete(m),fc=(m.elementInput as {detailing?:{concrete?:{fc?:number}}}|undefined)?.detailing?.concrete?.fc;
  const pile=pileInput(m),pq=pile?pileQuantities(pile):undefined;
  for(const o of m.occurrences){
   const building=(o.loc?.building&&tree.byId.get(o.loc.building)?.code)||o.building||'',base={memberId:m.id,category,discipline,mix,fc,building};
   for(const k of ['concrete','formwork','excavation','backfill','lean'] as const){const v=(q as unknown as Record<string,number>)[k]||0;if(v>0)out.push({...base,component:k,value:v*o.quantity,unit:baseUnits[k],label:boqComponentLabels[k]});}
   for(const b of m.bars){
    const w=frozen?frozen.bars.find(r=>r.id===b.id)?.weight:('rows' in q?(q.rows as {id:string;weight:number}[]).find(r=>r.id===b.id)?.weight:undefined);
    if(w&&Number.isFinite(w))out.push({...base,component:'rebar',value:w*o.quantity,unit:'kg',label:`${b.grade} Ø${b.diameter}`,diameter:b.diameter,grade:b.grade});
   }
   if(pq?.count){out.push({...base,component:'pile',value:pq.count*o.quantity,length:pq.totalLength*o.quantity,unit:'ต้น',label:`เสาเข็ม ${pq.size} mm`});if(pq.cutCount)out.push({...base,component:'pilecut',value:pq.cutCount*o.quantity,length:pq.totalCutLength*o.quantity,unit:'ต้น',label:'ตัดหัวเข็ม'});}
   if(m.siteWork){
    siteKinds.forEach(k=>{const each=(q as unknown as Record<string,number>)[k]??0;if(each>0)out.push({...base,component:'site',value:each*o.quantity,unit:siteUnits[k],label:siteLabels[k]});});
    for(const it of m.siteWork.items)if(it.quantity>0)out.push({...base,component:'site',value:it.quantity*o.quantity,unit:it.unit,label:it.label});
   }
  }
 }
 return out;
}
export type BoqChapterRow={item:BoqItem;level:number;quantity:number|null;members:number;provisional:boolean};
export type BoqUnmatched={component:BoqComponent;label:string;unit:string;quantity:number;members:number;categories:string[]};
export function boqChapterReport(bundle:SnapshotBundle,chapters:BoqChapters){
 const items=chapters.items.filter(i=>i.rule),sums=new Map<string,{q:number;ids:Set<string>}>(),miss=new Map<string,BoqUnmatched&{ids:Set<string>;cats:Set<string>}>();
 const pending=new Set([...quantityBasisCoverage(bundle).pending.map(m=>m.id),...reinforcementCoverage(bundle).pending.map(m=>m.memberId)]),provisional=new Set<string>();
 for(const c of boqContributions(bundle)){
  let best:BoqItem|undefined,score=-1;for(const i of items)if(matches(i.rule!,c)){const s=specificity(i.rule!);if(s>score){best=i;score=s;}}
  if(best){const v=(byLength(c.component,best.unit)?c.length??0:c.value)*unitFactor(c.component,best.unit),s=sums.get(best.id)||{q:0,ids:new Set<string>()};s.q+=v;s.ids.add(c.memberId);sums.set(best.id,s);if(pending.has(c.memberId))provisional.add(best.id);continue;}
  const key=JSON.stringify([c.component,c.component==='rebar'||c.component==='site'?c.label:'',c.unit]),u=miss.get(key)||{component:c.component,label:c.label,unit:c.unit,quantity:0,members:0,categories:[],ids:new Set<string>(),cats:new Set<string>()};
  u.quantity+=c.value;u.ids.add(c.memberId);u.cats.add(labels[c.category]);miss.set(key,u);
 }
 const rows:BoqChapterRow[]=chapters.items.map(item=>({item,level:itemLevel(item.code),quantity:item.rule?sums.get(item.id)?.q??0:null,members:sums.get(item.id)?.ids.size??0,provisional:provisional.has(item.id)}));
 const unmatched=[...miss.values()].map(({ids,cats,...u})=>({...u,members:ids.size,categories:[...cats]})).sort((a,b)=>boqComponents.indexOf(a.component)-boqComponents.indexOf(b.component)||a.label.localeCompare(b.label,'th',{numeric:true}));
 return {rows,unmatched,quantityItems:items.length};
}

// ---------------------------------------------------------------- Excel rows ⇄ chapters
export type BoqSheetRow={code:string;title:string;unit:string;component:string;disciplines:string;categories:string;mix:string;diameters:string;grades:string;buildings:string;siteItem:string;note:string;source:string};
const list=(t:string)=>t.split(/[,;/]+/).map(s=>s.trim()).filter(Boolean);
const categoryWord=(t:string)=>categories.find(c=>c.toUpperCase()===t.toUpperCase()||labels[c]===t||labels[c].split(' / ')[0]===t);
const disciplineWord=(t:string)=>disciplines.find(d=>d.toUpperCase()===t.toUpperCase()||disciplineInfo[d].label.toUpperCase()===t.toUpperCase()||disciplineInfo[d].short.toUpperCase()===t.toUpperCase());
/** Sheet rows → chapters; rows without a quantity source are headings. Problems name the row. */
export function chaptersFromRows(rows:BoqSheetRow[],source:string,at:string,newId:()=>string=()=>crypto.randomUUID().replace(/-/g,'').slice(0,16)):{chapters?:BoqChapters;problems:string[]}{
 const problems:string[]=[],items:BoqItem[]=[];
 for(const r of rows){
  if(!r.title&&!r.code)continue;if(!r.title){problems.push(`${r.source}: ไม่มีรายการ`);continue;}
  let rule:BoqRule|undefined;
  if(r.component){
   const component=parseComponent(r.component);if(!component){problems.push(`${r.source}: ปริมาณจากระบบ “${r.component}” ไม่รู้จัก (${Object.values(boqComponentLabels).join(' · ')})`);continue;}
   const ds=list(r.disciplines).map(t=>[t,disciplineWord(t)] as const),cs=list(r.categories).map(t=>[t,categoryWord(t)] as const);
   const bad=[...ds.filter(x=>!x[1]).map(x=>`หมวดงาน “${x[0]}”`),...cs.filter(x=>!x[1]).map(x=>`ประเภท “${x[0]}”`)];
   const dia=list(r.diameters).map(t=>Number(t.replace(/^(DB|RB|Y|T|Ø|D)/i,'')));if(dia.some(n=>!Number.isInteger(n)||n<4||n>60))bad.push(`ขนาดเหล็ก “${r.diameters}”`);
   if(bad.length){problems.push(`${r.source}: ไม่รู้จัก ${bad.join(', ')}`);continue;}
   rule={component,...(ds.length?{disciplines:ds.map(x=>x[1]!)}:{}),...(cs.length?{categories:cs.map(x=>x[1]!)}:{}),...(r.mix?{mix:r.mix}:{}),...(dia.length?{diameters:dia}:{}),...(r.grades?{grades:list(r.grades)}:{}),...(r.buildings?{buildings:list(r.buildings)}:{}),...(r.siteItem?{siteItem:r.siteItem}:{})};
  }
  items.push({id:newId(),code:r.code,title:r.title,unit:r.unit||(rule&&baseUnits[rule.component])||'',...(r.note?{note:r.note}:{}),...(rule?{rule}:{})});
 }
 if(!items.length)problems.push('ไม่มีรายการ BOQ ในแผ่นงาน');
 if(!items.some(i=>i.rule))problems.push('ยังไม่มีรายการที่ระบุ “ปริมาณจากระบบ” · ใส่คอลัมน์ D ให้รายการที่ต้องการปริมาณ');
 const parsed=items.length?boqChaptersSchema.safeParse({version:1,source,importedAt:at,items}):undefined;
 if(parsed&&!parsed.success)problems.push(...parsed.error.issues.slice(0,5).map(i=>`${i.path.join('.')}: ${i.message}`));
 return {chapters:parsed?.success?parsed.data:undefined,problems};
}
/** Chapters → sheet rows (export / template). */
export function rowsFromChapters(c:BoqChapters):BoqSheetRow[]{
 return c.items.map(i=>({code:i.code,title:i.title,unit:i.unit,component:i.rule?boqComponentLabels[i.rule.component]:'',disciplines:(i.rule?.disciplines||[]).map(d=>disciplineInfo[d].short).join(', '),categories:(i.rule?.categories||[]).map(c=>labels[c]).join(', '),mix:i.rule?.mix||'',diameters:(i.rule?.diameters||[]).join(', '),grades:(i.rule?.grades||[]).join(', '),buildings:(i.rule?.buildings||[]).join(', '),siteItem:i.rule?.siteItem||'',note:i.note||'',source:''}));
}
export const sampleChapters=():BoqChapters=>chaptersFromRows([
 ['2','งานโครงสร้าง','','','','','','','','','',''],['2.1','งานฐานราก','','','','','','','','','',''],
 ['2.1.1','คอนกรีตหยาบรองพื้น','m³','คอนกรีตหยาบ','','ฐานราก','','','','','',''],['2.1.2','คอนกรีตฐานราก','m³','คอนกรีต','','ฐานราก','','','','','',''],['2.1.3','ไม้แบบฐานราก','m²','แบบหล่อ','','ฐานราก','','','','','',''],
 ['2.2','งานเสา คาน พื้น ผนัง','','','','','','','','','',''],['2.2.1','คอนกรีตโครงสร้าง','m³','คอนกรีต','RC','','','','','','',''],['2.2.2','ไม้แบบ','m²','แบบหล่อ','RC','','','','','','',''],
 ['2.3','งานเหล็กเสริม','','','','','','','','','',''],['2.3.1','เหล็กเสริม RB9 SR24','kg','เหล็กเสริม','','','','9','SR24','','',''],['2.3.2','เหล็กเสริม DB12–DB20 SD40','kg','เหล็กเสริม','','','','12, 16, 20','SD40','','',''],['2.3.3','เหล็กเสริม DB25 ขึ้นไป SD50','kg','เหล็กเสริม','','','','25, 28, 32','SD50','','',''],
 ['2.4','งานเสาเข็ม','','','','','','','','','',''],['2.4.1','เสาเข็ม (ความยาวรวม)','m','เสาเข็ม','','','','','','','',''],['2.4.2','ตัดหัวเสาเข็ม','ต้น','ตัดหัวเข็ม','','','','','','','',''],
].map((r,i)=>({code:r[0],title:r[1],unit:r[2],component:r[3],disciplines:r[4],categories:r[5],mix:r[6],diameters:r[7],grades:r[8],buildings:r[9],siteItem:r[10],note:r[11],source:`แถว ${i+2}`})),'ตัวอย่าง','').chapters!;
