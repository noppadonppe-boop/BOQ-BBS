import type {ReportGroup,SnapshotBundle} from './model';
import {takeoff} from './engine';
import {siteItemKey,siteKinds,siteLabels,siteUnits} from './siteWork';
import {reportCategory} from './reportCategory';
import {isWbsGroup,locationTree,occurrenceGroup,wbsGroupDisplay} from './locations';

export type SiteRow={key:string;label:string;item:string;unit:string;quantity:number};
/** Sub-base layers (sand, plastic sheet, compaction) and manual BOQ items, grouped like the BOQ report.
 * Layers come from the frozen calculation when present; manual items are per piece × occurrence quantity. */
export function siteWorkReport(bundle:SnapshotBundle,group:ReportGroup=bundle.scope?.group||'Member'){
 const rows=new Map<string,SiteRow>(),order=new Map<string,number>(),tree=locationTree(bundle.project.locations);
 for(const m of bundle.members){
  if(!m.siteWork)continue;
  const q=bundle.calculations?.[m.id]||takeoff(m,bundle.project.spec);
  const lines:{item:string;unit:string;each:number;rank:number}[]=[];
  siteKinds.forEach((k,i)=>{const each=q[k]??0;if(each>0)lines.push({item:siteLabels[k],unit:siteUnits[k],each,rank:i});});
  for(const it of m.siteWork.items)if(it.quantity>0)lines.push({item:it.label,unit:it.unit,each:it.quantity,rank:10});
  for(const o of m.occurrences){
   const raw=group==='Member'?m.code:group==='Category'?reportCategory(m):occurrenceGroup(group,o);
   for(const l of lines){
    const key=JSON.stringify([raw,siteItemKey({label:l.item,unit:l.unit})]),r=rows.get(key)||{key,label:isWbsGroup(group)?wbsGroupDisplay(tree,raw).label:raw||'ไม่ระบุ',item:l.item,unit:l.unit,quantity:0};
    r.quantity+=l.each*o.quantity;rows.set(key,r);if(!order.has(key))order.set(key,l.rank);
   }
  }
 }
 const rank=(r:SiteRow)=>isWbsGroup(group)?wbsGroupDisplay(tree,JSON.parse(r.key)[0]).rank:0;
 const list=[...rows.values()].sort((a,b)=>rank(a)-rank(b)||a.label.localeCompare(b.label,'th',{numeric:true})||order.get(a.key)!-order.get(b.key)!||a.item.localeCompare(b.item,'th'));
 // totals per item (label + unit) across all groups
 const totals=new Map<string,{item:string;unit:string;quantity:number}>();
 for(const r of list){const k=siteItemKey({label:r.item,unit:r.unit}),t=totals.get(k)||{item:r.item,unit:r.unit,quantity:0};t.quantity+=r.quantity;totals.set(k,t);}
 return {group,rows:list,totals:[...totals.values()]};
}
