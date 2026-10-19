import {quantityBasisCoverage} from './quantityBasis';
import {takeoff} from './engine';
import {reinforcementCoverage} from './reinforcementCoverage';
import type {Member,SnapshotBundle,ReportGroup} from './model';
import {boqPricingSchema,priceKey,priceEntryKey,type PriceEntry,type PriceKind,type CostComponent} from './boqPricingSchema';
export const PRICING_POLICY='boq-pricing-1.0';
export const COMPONENT_PRICING_POLICY='boq-pricing-2.0';
export const componentLabels:Record<CostComponent,string>={combined:'ราคารวมเดิม',material:'ค่าวัสดุ',labor:'ค่าแรง'};
const MAX_MINOR=999999999999999n;
const pow=(n:number)=>10n**BigInt(n);
function decimal(s:string){if(!/^\d+(\.\d+)?$/.test(s))throw Error('ตัวเลขทศนิยมไม่ถูกต้อง');const [a,b='']=s.split('.');return {integer:BigInt(a+b),scale:b.length};}
function halfUp(n:bigint,divisor:bigint){return (n+divisor/2n)/divisor;}
export function fixedDecimal(n:bigint,scale:number){const s=n.toString().padStart(scale+1,'0');return scale?s.slice(0,-scale)+'.'+s.slice(-scale):s;}
export function roundedQuantity(quantity:number,decimals:number){
 if(!Number.isFinite(quantity)||quantity<0||quantity>=1e21||!Number.isInteger(decimals)||decimals<0||decimals>6)throw Error('ปริมาณหรือทศนิยมสำหรับคิดราคาไม่ถูกต้อง');
 // Use the canonical decimal value from the quantity engine; do not first
 // round to twelve places, which can move a just-below-half value across a tie.
 const [mantissa,exponent='0']=String(quantity).split(/e/i),base=decimal(mantissa),scale=base.scale-Number(exponent),d=scale<0?{integer:base.integer*pow(-scale),scale:0}:{integer:base.integer,scale};
 const n=d.scale>decimals?halfUp(d.integer,pow(d.scale-decimals)):d.integer*pow(decimals-d.scale);return fixedDecimal(n,decimals);
}
export function exactAmount(quantity:string,rate:string,decimals:number){
 if(!Number.isInteger(decimals)||decimals<0||decimals>4)throw Error('ทศนิยมจำนวนเงินไม่ถูกต้อง');
 const q=decimal(quantity),r=decimal(rate),scale=q.scale+r.scale,n=q.integer*r.integer;
 const minor=scale>decimals?halfUp(n,pow(scale-decimals)):n*pow(decimals-scale);
 if(minor>MAX_MINOR)throw Error('จำนวนเงินเกินความละเอียดที่รองรับ แบ่งรายการก่อนส่งออก');return {minor:minor.toString(),amount:fixedDecimal(minor,decimals)};
}
export const moneyText=(text:string)=>{const [whole,frac]=text.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(frac!==undefined?'.'+frac:'');};
export const priceLabels:Record<PriceKind,string>={concrete:'คอนกรีต',formwork:'แบบหล่อ',excavation:'ขุดดิน',backfill:'ถมกลับ',lean:'Lean concrete',rebar:'เหล็ก BBS'};
export type PriceItem={key:string;kind:PriceKind;diameter?:number;grade?:string;label:string;unit:'m³'|'m²'|'kg';each:number};
export function priceItems(member:Member,bundle:Pick<SnapshotBundle,'project'|'calculations'>):PriceItem[]{
 const frozen=bundle.calculations?.[member.id],q=frozen||takeoff(member,bundle.project.spec),items:PriceItem[]=[];
 for(const kind of ['concrete','formwork','excavation','backfill','lean'] as const){const each=q[kind];if(!Number.isFinite(each)||each<0)throw Error(member.code+': ปริมาณสำหรับคิดราคาไม่ถูกต้อง');if(each>0)items.push({kind,key:priceKey({kind}),label:priceLabels[kind],unit:kind==='formwork'?'m²':'m³',each});}
 const steel=new Map<string,PriceItem>();
 for(const b of member.bars){const weight=frozen?frozen.bars.find(r=>r.id===b.id)?.weight:'rows' in q?q.rows.find(r=>r.id===b.id)?.weight:undefined;if(weight===undefined||!Number.isFinite(weight)||weight<0)throw Error(member.code+'/'+b.mark+': ไม่มีน้ำหนักสำหรับคิดราคา');const key=priceKey({kind:'rebar',diameter:b.diameter,grade:b.grade}),item=steel.get(key)||{key,kind:'rebar',diameter:b.diameter,grade:b.grade,label:`เหล็ก Ø${b.diameter} / ${b.grade}`,unit:'kg',each:0};item.each+=weight;steel.set(key,item);}
 return [...items,...[...steel.values()].filter(s=>s.each>0).sort((a,b)=>a.diameter!-b.diameter!||a.grade!.localeCompare(b.grade!))];
}
export type PriceLine=PriceItem&{component:CostComponent;policy:string|null;memberId:string;memberCode:string;category:string;occurrenceId:string;zone:string;floor:string;grid:string;groupKey:string;groupLabel:string;rawQuantity:number;quantity:string;quantityDecimals:number|null;currency:string|null;amountDecimals:number|null;entry:PriceEntry|null;amount:string|null;minor:string|null};
export type PriceGroup={key:string;label:string;currency:string|null;decimals:number;priced:number;missing:number;subtotal:string;total:string|null};
export function pricingReport(bundle:SnapshotBundle,group:ReportGroup=bundle.scope?.group||'Member'){
 const lines:PriceLine[]=[],groups=new Map<string,{record:PriceGroup;minor:bigint}>(),policies=new Set<string>();
 for(const m of bundle.members){const frozen=bundle.calculations?.[m.id];if(frozen&&frozen.quantity!==m.occurrences.reduce((n,o)=>n+o.quantity,0))throw Error(m.code+': จำนวนในฐานคำนวณไม่ตรงตำแหน่ง');const p=m.pricing?boqPricingSchema.parse(m.pricing):undefined;
  const items=priceItems(m,bundle),sourceEntries:PriceEntry[]=p?.entries||[],entries=new Map(sourceEntries.map(e=>[priceEntryKey(e),e])),policy=p?.version===2?COMPONENT_PRICING_POLICY:p?PRICING_POLICY:null;if(policy)policies.add(policy);
  const components:CostComponent[]=p?.version===2?['material','labor']:['combined'];
  for(const o of m.occurrences)for(const item of items)for(const component of components){
   if(lines.length>=100000)throw Error('รายการราคามากกว่า100,000รายการ เลือกสมาชิก/ประเภท/โซน/ชั้นเพื่อแบ่งขอบเขต');
   const rawQuantity=item.each*o.quantity,quantity=p?roundedQuantity(rawQuantity,p.quantityDecimals):String(rawQuantity),entry=entries.get(JSON.stringify([item.key,component]))||null,amount=entry&&entry.rate!==null?exactAmount(quantity,entry.rate,p!.amountDecimals):null;
   const raw=group==='Member'?m.id:group==='Category'?m.category:group==='Zone'?o.zone:group==='Floor'?o.floor:'Summary',groupKey=JSON.stringify([group,raw]),groupLabel=group==='Member'?m.code:raw||'ไม่ระบุ';
   const line:PriceLine={...item,component,policy,memberId:m.id,memberCode:m.code,category:m.category,occurrenceId:o.id,zone:o.zone,floor:o.floor,grid:o.grid,rawQuantity,quantity,quantityDecimals:p?.quantityDecimals??null,currency:p?.currency||null,amountDecimals:p?.amountDecimals??null,entry,amount:amount?.amount??null,minor:amount?.minor??null,groupKey,groupLabel};lines.push(line);
   const key=JSON.stringify([groupKey,line.currency]),decimals=p?.amountDecimals??2,old=groups.get(key)||{record:{key:groupKey,label:groupLabel,currency:line.currency,decimals,priced:0,missing:0,subtotal:'0',total:null},minor:0n},scale=Math.max(decimals,old.record.decimals);
   old.minor*=pow(scale-old.record.decimals);if(amount)old.minor+=BigInt(amount.minor)*pow(scale-decimals);if(old.minor>MAX_MINOR)throw Error('ยอดรวมเกินความละเอียดที่รองรับ แบ่งขอบเขตส่งออก');old.record.decimals=scale;old.record.priced+=amount?1:0;old.record.missing+=amount?0:1;groups.set(key,old);
  }
 }
 const missing=lines.filter(l=>l.amount===null).length,groupMissing=new Map<string,number>();for(const g of groups.values())groupMissing.set(g.record.key,(groupMissing.get(g.record.key)||0)+g.record.missing);
 const quantityCoverage=quantityBasisCoverage(bundle,group),coverage=reinforcementCoverage(bundle,group);
 const pendingIds=new Set([...quantityCoverage.pending.map(m=>m.id),...coverage.pending.map(m=>m.memberId)]),pendingGroups=new Map<string,Set<string>>();for(const m of bundle.members)for(const o of m.occurrences){const raw=group==='Member'?m.id:group==='Category'?m.category:group==='Zone'?o.zone:group==='Floor'?o.floor:'Summary',key=JSON.stringify([group,raw]),set=pendingGroups.get(key)||new Set<string>();if(pendingIds.has(m.id))set.add(m.id);pendingGroups.set(key,set);}
 const rows=[...groups.values()].map(g=>{const pending=pendingGroups.get(g.record.key)?.size||0,total=groupMissing.get(g.record.key)?null:fixedDecimal(g.minor,g.record.decimals);return {...g.record,missing:groupMissing.get(g.record.key)||0,subtotal:fixedDecimal(g.minor,g.record.decimals),total,completeTotal:pending?null:total,pendingQuantities:pending};});
 const currencies=new Map<string,{currency:string|null;decimals:number;minor:bigint;priced:number;missing:number}>();
 for(const g of groups.values()){const key=g.record.currency||'',c=currencies.get(key)||{currency:g.record.currency,decimals:g.record.decimals,minor:0n,priced:0,missing:0},scale=Math.max(c.decimals,g.record.decimals);c.minor=c.minor*pow(scale-c.decimals)+g.minor*pow(scale-g.record.decimals);if(c.minor>MAX_MINOR)throw Error('ยอดสกุลเงินเกินความละเอียดที่รองรับ แบ่งขอบเขตส่งออก');c.decimals=scale;c.priced+=g.record.priced;c.missing+=g.record.missing;currencies.set(key,c);}
 // Partitions show only explicitly entered components. Legacy combined prices
 // are never allocated to material/labor, and these subtotals are not a new
 // claim that all selected physical items have a complete cost breakdown.
 const componentGroups=new Map<string,{component:CostComponent;currency:string|null;decimals:number;minor:bigint;priced:number;missing:number}>();
 for(const l of lines){const key=JSON.stringify([l.currency,l.component]),decimals=l.amountDecimals??2,c=componentGroups.get(key)||{component:l.component,currency:l.currency,decimals,minor:0n,priced:0,missing:0},scale=Math.max(decimals,c.decimals);c.minor*=pow(scale-c.decimals);if(l.minor!==null)c.minor+=BigInt(l.minor)*pow(scale-decimals);if(c.minor>MAX_MINOR)throw Error('ยอดส่วนประกอบราคาเกินความละเอียดที่รองรับ');c.decimals=scale;c.priced+=l.amount===null?0:1;c.missing+=l.amount===null?1:0;componentGroups.set(key,c);}
 return {policy:[...policies].join(' + ')||PRICING_POLICY,policies:[...policies],group,pendingQuantityMembers:pendingIds.size,quantityCoverage,coverage,lines,rows,components:[...componentGroups.values()].map(({minor,...c})=>({...c,subtotal:fixedDecimal(minor,c.decimals)})),currencies:[...currencies.values()].map(c=>({currency:c.currency,decimals:c.decimals,priced:c.priced,missing:c.missing,subtotal:fixedDecimal(c.minor,c.decimals),total:missing?null:fixedDecimal(c.minor,c.decimals),completeTotal:missing||!coverage.complete||!quantityCoverage.complete?null:fixedDecimal(c.minor,c.decimals)})),missing,priced:lines.length-missing};
}
