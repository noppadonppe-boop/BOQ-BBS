import type ExcelJS from 'exceljs';
import type {SnapshotBundle} from '../domain/model';
import {pricingReport,componentLabels} from '../domain/boqPricing';
import {scopeLabel} from '../domain/exportScope';

function appearance(sheet:ExcelJS.Worksheet,bundle:SnapshotBundle,title:string,subtitle:string,headers:string[],widths:number[]){
 sheet.addRows([[`${bundle.project.code} · ${title}`],[`${bundle.status} / NOT FOR CONSTRUCTION · ${bundle.revisionNumber||'D'+bundle.version}\n${subtitle}`],headers]);
 sheet.columns=widths.map(width=>({width}));sheet.mergeCells(1,1,1,widths.length);sheet.mergeCells(2,1,2,widths.length);
 sheet.views=[{state:'frozen',ySplit:3,showGridLines:false}];
 sheet.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:3'};
 sheet.headerFooter={oddFooter:'&LPRICE SNAPSHOT / NOT FOR CONSTRUCTION&C&A&RPage &P / &N'};
}
function finish(sheet:ExcelJS.Worksheet){
 sheet.eachRow((row,index)=>{
  let lines=index===2?3:1;
  if(index<=2){const span=sheet.columns.reduce((n,c)=>n+(c.width||20),0);lines=Math.max(lines,String(row.getCell(1).value||'').split('\n').reduce((n,s)=>n+Math.max(1,Math.ceil(s.length/(span*.85))),0));}
  row.eachCell({includeEmpty:true},(cell,column)=>{if(index>2&&typeof cell.value==='string')lines=Math.max(lines,cell.value.split('\n').reduce((n,s)=>n+Math.max(1,Math.ceil(s.length/Math.max(8,(sheet.getColumn(column).width||20)*.85))),0));cell.font={name:'Sarabun',size:index===1?15:10,bold:index===1||index===3,color:{argb:index===3?'FFFFFFFF':'FF203940'}};const numeric=typeof cell.value==='number'||sheet.name==='BOQ Prices'&&[5,7,8].includes(column);cell.alignment={vertical:'middle',wrapText:true,horizontal:numeric?'right':'left',indent:index>3&&!numeric&&column>1?1:0};if(index===3)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};else if(index>3&&index%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F3'}};});
  row.height=Math.min(409,Math.max(index===1?32:index===3?44:24,lines*14+10));
 });
 sheet.pageSetup.printArea=`A1:${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}`;
 if(sheet.rowCount>3)sheet.autoFilter={from:{row:3,column:1},to:{row:sheet.rowCount,column:sheet.columnCount}};
}
// Cost cells capture this snapshot. They do not recalculate from mutable live prices.
// Decimal quantity/rate text retains the exact billing input; money has at most
// fifteen significant minor-unit digits, enforced by the domain calculator.
export function appendPricingSheets(wb:ExcelJS.Workbook,bundle:SnapshotBundle){
 if(!bundle.members.some(m=>m.pricing))return;
 const report=pricingReport(bundle),detail=wb.addWorksheet('BOQ Prices'),summary=wb.addWorksheet('Price Summary'),basis=wb.addWorksheet('Price Basis');
 appearance(detail,bundle,'BOQ Prices',`${report.policy} · Captured values; change rates in the app for a new version. Blank amount = missing rate/basis.\n${scopeLabel(bundle.scope,bundle.members)}`,['Member','Zone / Floor / Grid','Item','Unit','Billed quantity (exact decimal)','Currency','Unit rate (exact decimal)','Amount','Price source','Rate note','Qty / money decimals','State','Cost component','Pricing policy'],[18,22,26,8,16,10,16,20,32,26,14,18,18,24]);
 for(const l of report.lines){const r=detail.addRow([l.memberCode,[l.zone||'—',l.floor||'—',l.grid||'—'].join(' / '),l.label,l.unit,l.quantityDecimals===null?null:l.quantity,l.currency,l.entry?.rate??null,l.amount===null?null:Number(l.amount),l.entry?.source||null,l.entry?.note||null,`${l.quantityDecimals??'?'}/${l.amountDecimals??'?'}`,l.amount===null?'MISSING RATE / BASIS':'PRICED',componentLabels[l.component],l.policy]);r.getCell(5).numFmt='@';r.getCell(7).numFmt='@';r.getCell(8).numFmt='#,##0'+(l.amountDecimals?'.'+'0'.repeat(l.amountDecimals):'');}
 appearance(summary,bundle,'Price Summary',`${report.group} · ${report.missing} missing lines. A complete total stays blank until quantities and all selected item prices are entered.\nCurrencies are separate; no exchange, VAT, OH or profit is added automatically.`,['Group / currency','Currency','Priced lines','Missing in scope/group','Known subtotal (partial)','Complete total','State','Members with pending quantities','Entered price total (quantities may be partial)'],[34,12,14,20,24,24,40,24,30]);
 for(const r of report.rows){const row=summary.addRow([r.label,r.currency,r.priced,r.missing,Number(r.subtotal),r.completeTotal===null?null:Number(r.completeTotal),r.pendingQuantities?'QUANTITIES PENDING':r.completeTotal===null?'RATES / BASIS PENDING':'COMPLETE ENTERED INPUTS',r.pendingQuantities,r.total===null?null:Number(r.total)]);for(const c of [5,6,9])row.getCell(c).numFmt='#,##0'+(r.decimals?'.'+'0'.repeat(r.decimals):'');}
 for(const c of report.currencies){const row=summary.addRow(['ALL SELECTED',c.currency,c.priced,report.missing,Number(c.subtotal),c.completeTotal===null?null:Number(c.completeTotal),(!report.coverage.complete||!report.quantityCoverage.complete)?'QUANTITIES PENDING':c.completeTotal===null?'RATES / BASIS PENDING':'COMPLETE ENTERED INPUTS',report.pendingQuantityMembers,c.total===null?null:Number(c.total)]);for(const col of [5,6,9])row.getCell(col).numFmt='#,##0'+(c.decimals?'.'+'0'.repeat(c.decimals):'');}
 appearance(basis,bundle,'Price Basis',`${bundle.createdAt} · ${report.policy}\nCommercial estimate only; no engineering or owner approval.`,['Member / field','Captured value'],[28,110]);
 basis.addRow(['Scope',scopeLabel(bundle.scope,bundle.members)]);basis.addRow(['Billing policy','Round quantity per item × occurrence once; multiply by the explicit rate; round the line amount; sum rounded lines. Grouping never recalculates the amount.']);basis.addRow(['Workbook policy','Snapshot values. Quantity and rate are exact decimal text; amounts are numeric captured results. Existing engineering quantity formulas are unchanged. Blank rate/amount is not zero.']);basis.addRow(['Quantity coverage','Provisional geometry/earthwork input and missing BBS/source comparison are not ready quantities. Entered price total preserves the captured arithmetic but is not the complete estimate while quantities are pending. See BOQ Coverage for members and explicit no-rebar scope bases; input coverage is not engineering approval.']);
basis.addRow(['Limit','100,000 cost lines; maximum 15 digits in money minor units. Split scope if a bound is exceeded.']);
 basis.addRow(['Component policy','Version1 retains a combined rate; version2 rounds material and labor amounts separately for each item/occurrence, then sums. Both parts require rates/sources, including explicit zero. Component subtotals include only entered parts; legacy combined prices are never allocated. Do not sum repeated billed quantities across cost components as physical takeoff.']);
 for(const m of bundle.members){basis.addRow([m.code,m.pricing?`${m.pricing.currency}; pricing version ${m.pricing.version}; quantity decimals ${m.pricing.quantityDecimals}; amount decimals ${m.pricing.amountDecimals}; member version ${m.version}\n${m.pricing.note||'No commercial conditions entered'}`:'No pricing basis / rates entered']);}
 [detail,summary,basis].forEach(finish);
 if(report.lines.some(l=>l.component!=='combined')){const parts=wb.addWorksheet('Cost Components');appearance(parts,bundle,'Cost Components','Entered component subtotals only. Missing parts are not zero; combined legacy prices are not allocated.\nUse Price Summary for the complete estimate status. Currencies stay separate.',['Cost component','Currency','Priced parts','Pending parts','Known subtotal (partial)','Meaning'],[24,12,16,16,24,85]);for(const c of report.components){const row=parts.addRow([componentLabels[c.component],c.currency,c.priced,c.missing,Number(c.subtotal),c.component==='combined'?'Combined legacy/unknown basis; no inferred material/labor split':'Entered '+c.component+' parts only; not a complete-project cost claim']);row.getCell(5).numFmt='#,##0'+(c.decimals?'.'+'0'.repeat(c.decimals):'');}finish(parts);}
}
