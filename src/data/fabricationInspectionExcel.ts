import type ExcelJS from 'exceljs';
import type {SnapshotBundle} from '../domain/model';
import type {PrintBar} from './excelPrint';
import {fabricationInspectionResult} from '../domain/fabricationInspection';

export function appendFabricationInspectionSheet(wb:ExcelJS.Workbook,bundle:SnapshotBundle,items:PrintBar[]){
 if(!items.some(i=>i.bar.fabricationInspections?.length))return;
 const sheet=wb.addWorksheet('Fabrication Checks');
 const headers=['Member','Mark','Piece/sample','Date','Recorded by (user entry)','Inspection reference','App status at export','Item','Current nominal mm','Lower mm','Upper mm','Measured mm','Range comparison (Excel)','Required free mm (captured)','Free residual mm (captured)','Scope / review notes','Recorded nominal mm','Recorded nominal policy'];
 sheet.mergeCells('A1:R1');sheet.getCell('A1').value=`${bundle.project.code} · Per-piece fabrication measurements`;
 sheet.mergeCells('A2:R2');sheet.getCell('A2').value='USER RECORDED / NOT FOR CONSTRUCTION · one piece only. Excel edits recalculate range comparison only; app status, limits and free balance are captured. Return to app for full checks; no quantity/cut adjustment.';
 sheet.getRow(1).height=30;sheet.getRow(2).height=42;sheet.addRow(headers);sheet.getRow(3).height=32;
 for(const item of items)for(const record of item.bar.fabricationInspections||[]){
  const result=fabricationInspectionResult(bundle.project.spec,item.bar,record),balance=result.balance;
  const notes=[...result.minimumProblems,...result.notes,record.note].filter(Boolean).join(' | ');
  const prefix=[item.member.code,item.bar.mark,record.pieceReference,new Date(record.inspectedOn+'T00:00:00Z'),record.observer,record.source,result.status];
  for(const c of result.criteria){const r=sheet.rowCount+1,comparison={formula:`IF(AND(ISNUMBER(L${r}),ISNUMBER(J${r}),ISNUMBER(K${r})),IF(AND(L${r}>=J${r}-0.000001,L${r}<=K${r}+0.000001),"Within range","Outside range"),"Missing")`,result:c.result};sheet.addRow([...prefix,c.label,c.nominal,c.lower,c.upper,c.measured??null,comparison,null,null,c.label==='Cut'?notes:result.stale?'Stale record; comparison against CURRENT nominal only':'Recorded range only',c.label==='Cut'?result.recordedNominal?.cut??null:result.recordedNominal?.dimensions.find(d=>d.label===c.label)?.value??null,result.recordedNominal?.policy||'Unavailable']);}
  if(!result.criteria.length)sheet.addRow([...prefix,'Cut',null,null,null,record.measuredCut,'Reference unavailable',null,null,notes]);
  for(const [label,measured] of Object.entries(record.measuredDimensions).filter(([label])=>!result.criteria.some(c=>c.label===label)))sheet.addRow([...prefix,label,null,null,null,measured,'Unmapped / review',null,null,notes]);
  if(record.measuredInnerRadius!==undefined)sheet.addRow([...prefix,'Inner r',item.bar.standard.innerRadius,null,null,record.measuredInnerRadius,'No assigned tolerance',null,null,'Recorded inner radius; no automatic Table4 radius tolerance or physical shape certification']);
  if(balance)sheet.addRow([...prefix,`Free (${balance.freeLabel})`,null,null,null,balance.available?balance.measured??null:null,'Algebra only / review',balance.available?balance.required:null,balance.available?balance.residual??null:null,balance.available?`Required free ${balance.withinFreeRange?'within':'outside'} nominal free range; residual acceptance undefined; no geometry adjustment`:'Missing actual measurements: '+balance.missing.join(', ')]);
 }
 const widths=[20,12,25,16,25,46,30,16,18,18,18,18,26,20,20,70,20,30];widths.forEach((width,i)=>sheet.getColumn(i+1).width=width);
 for(const row of sheet.getRows(1,sheet.rowCount)||[]){row.alignment={vertical:'top',wrapText:true};row.font={name:'Sarabun',size:10};if(row.number===1||row.number===3){row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};row.font={name:'Sarabun',size:10,bold:true,color:{argb:'FFFFFFFF'}};}else if(row.number>3){row.height=Math.max(36,...widths.map((width,i)=>{const value=row.getCell(i+1).value;const text=typeof value==='string'?value:'';return text.split('\n').reduce((lines,line)=>lines+Math.max(1,Math.ceil(line.length/Math.max(1,width-3))),0)*14+8;}));}}
 for(const col of [9,10,11,12,14,15,17])sheet.getColumn(col).numFmt='#,##0.000';
 sheet.getColumn(4).numFmt='yyyy-mm-dd';
 sheet.views=[{state:'frozen',ySplit:3,showGridLines:false}];sheet.autoFilter={from:'A3',to:`R${sheet.rowCount}`};
 // OOXML pageSetup paperSize8 is A3; ExcelJS's narrowed enum omits it.
 // https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.pagesetup
 sheet.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:false,scale:100,printTitlesRow:'1:3',printTitlesColumn:'A:D',printArea:`A1:R${sheet.rowCount}`,margins:{left:.25,right:.25,top:.4,bottom:.4,header:.15,footer:.15}};
 sheet.headerFooter={oddFooter:'USER RECORDED / NOT FOR CONSTRUCTION &RPage &P of &N'};
}
