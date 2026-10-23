import type {Member,ReportGroup,SnapshotBundle} from './model';
import {elementInputSchema,pileQuantities,pileTypeLabels,type FoundationInput} from './elementInput';
import {reportCategory} from './reportCategory';

/** Structured pile-cap input of a member, if any (stored input is migrated on read). */
export function pileInput(m:Member):FoundationInput|undefined{
 const parsed=elementInputSchema.safeParse(m.elementInput);
 return parsed.success&&parsed.data.category==='Foundation'&&parsed.data.foundationType==='pile'?parsed.data:undefined;
}
export type PileRow={key:string;label:string;pile:string;count:number;length:number;cutCount:number;cutLength:number};
/** Pile work (งานเสาเข็ม) and pile cutting (งานตัดหัวเข็ม), grouped like the BOQ report.
 * count/length use the ordered pile length; cutLength = Σ cut-off length (m). */
export function pileReport(bundle:SnapshotBundle,group:ReportGroup=bundle.scope?.group||'Member'){
 const rows=new Map<string,PileRow>();
 for(const m of bundle.members){
  const input=pileInput(m);if(!input)continue;
  const q=pileQuantities(input);if(!q.count)continue;
  const pile=`${pileTypeLabels[q.type]} ${q.size} mm × ${q.lengthEach} m`;
  for(const o of m.occurrences){
   const raw=group==='Member'?m.code:group==='Category'?reportCategory(m):group==='Zone'?o.zone:group==='Floor'?o.floor:'Summary',key=`${raw}|${pile}`;
   const r=rows.get(key)||{key,label:raw||'ไม่ระบุ',pile,count:0,length:0,cutCount:0,cutLength:0};
   r.count+=q.count*o.quantity;r.length+=q.totalLength*o.quantity;r.cutCount+=q.cutCount*o.quantity;r.cutLength+=q.totalCutLength*o.quantity;rows.set(key,r);
  }
 }
 const list=[...rows.values()].sort((a,b)=>a.label.localeCompare(b.label,'th',{numeric:true})||a.pile.localeCompare(b.pile));
 const totals=list.reduce((t,r)=>({count:t.count+r.count,length:t.length+r.length,cutCount:t.cutCount+r.cutCount,cutLength:t.cutLength+r.cutLength}),{count:0,length:0,cutCount:0,cutLength:0});
 return {group,rows:list,totals};
}
