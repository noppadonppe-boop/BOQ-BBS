import {sourceRowPage,sourcePagesLabel} from '../domain/sourceSchedule';
import type ExcelJS from 'exceljs';
import type {SnapshotBundle} from '../domain/model';
import type {PrintBar} from './excelPrint';
import {compareSourceSchedule} from '../domain/sourceSchedule';
import {sourceComparisonQuantity} from '../domain/sourceQuantityBasis';
export function appendSourceUnitWeightSheet(wb:ExcelJS.Workbook,bundle:SnapshotBundle,items:PrintBar[]){
 const members=bundle.members.filter(m=>m.sourceSchedule?.rows.some(r=>r.unitWeight!==undefined));if(!members.length)return;
 const sheet=wb.addWorksheet('Source Unit Weight');const multi=members.some(m=>m.sourceSchedule?.version===3);
 sheet.addRows([[bundle.project.code+' · Source per-piece weight'],['kg/p is per bar piece. Printed inputs and computed BBS values stay separate. Differences are for review; source rounding/acceptance is not inferred. This check does not feed BOQ, cutting demand or approval.'],['Member','Source Mark','BBS Mark','Source kg/p','BBS kg/p','BBS - source kg/p','Source count','Source kg/p × count','Source row kg','Row - product kg','Captured mapping','Source basis',...(multi?['Source page']:[])]]);
 for(const m of members){const result=compareSourceSchedule(m,items.filter(i=>i.member.id===m.id).map(i=>i.bar),bundle.attachments,sourceComparisonQuantity(m,bundle))!,identity=sheet.rowCount+1;
  sheet.addRow([`${m.code} · ${result.attachment?.name||'MISSING'} · Rev ${result.attachment?.revision||''} · pages ${sourcePagesLabel(result.source)}\nSHA256 ${result.source.sha256} · Source qty basis ${result.quantity}; selected member qty ${result.selectedQuantity}`]);sheet.mergeCells(`A${identity}:L${identity}`);sheet.getRow(identity).height=46;
  for(const r of result.rows){const row=sheet.rowCount+1,ref=items.find(i=>i.member.id===m.id&&i.bar.id===r.source.barId)?.sourceRow;
   sheet.addRow([m.code,r.source.mark,r.bar?.mark??null,r.source.unitWeight??null,ref?{formula:`'BBS'!I${ref}*'BBS'!J${ref}/1000`,result:r.actualUnitWeight}:null,ref&&r.source.unitWeight!==undefined?{formula:`E${row}-D${row}`,result:r.unitWeightDifference}:null,r.source.count,r.source.unitWeight!==undefined?{formula:`D${row}*G${row}`,result:r.sourceProductWeight}:null,r.source.weight??null,r.source.weight!==undefined&&r.source.unitWeight!==undefined?{formula:`I${row}-H${row}`,result:r.sourceRowProductDifference}:null,result.sourceProblems.length?'Source review required':r.status,result.source.basis,...(multi?[sourceRowPage(result.source,r.source)]:[])]);
  }
 }
 const widths=[16,12,12,16,16,20,14,21,19,21,25,22,...(multi?[14]:[])];sheet.columns=widths.map(width=>({width}));sheet.mergeCells(multi?'A1:M1':'A1:L1');sheet.mergeCells(multi?'A2:M2':'A2:L2');sheet.getRow(1).height=30;sheet.getRow(2).height=48;sheet.getRow(3).height=42;
 sheet.eachRow((row,i)=>{if(i>3&&!row.height)row.height=32;row.eachCell(c=>{c.font={name:'Sarabun',size:i===1?14:10,bold:i===1||i===3,color:{argb:i===3?'FFFFFFFF':'FF203940'}};c.alignment={vertical:'middle',wrapText:true,horizontal:i>3&&Number(c.col)>=4&&Number(c.col)<=10?'right':'left'};if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245E4D'}};});});
 for(const key of ['D','E','F','H','I','J'])sheet.getColumn(key).numFmt='0.000000';sheet.getColumn('G').numFmt='0';sheet.views=[{state:'frozen',ySplit:3,showGridLines:false}];sheet.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:3',printArea:`A1:${multi?'M':'L'}${sheet.rowCount}`,margins:{left:.25,right:.25,top:.3,bottom:.3,header:.15,footer:.15}};
}
