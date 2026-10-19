import type ExcelJS from 'exceljs';
import type {Member,SnapshotBundle} from '../domain/model';
import {assembleBeam} from '../domain/beamAssembly';
import {takeoff} from '../domain/engine';

export function appendBeamAssemblySheets(wb:ExcelJS.Workbook,bundle:SnapshotBundle,orderedMembers:Member[]){
 if(!orderedMembers.some(m=>m.beamAssembly))return;
 const spans=wb.addWorksheet('Beam Spans'),check=wb.addWorksheet('Beam Check');
 spans.addRows([[`${bundle.project.code} · Continuous beam spans`],['DRAFT / NOT FOR CONSTRUCTION · gross references before openings/deductions. Editing these references does not change captured BOQ/BBS. Common centreline; mm.'],['Member','Axis','Span / Grid','From mm','Length mm','Width mm','Depth mm','Soffit Z mm','To mm','Gross concrete m³','Longitudinal form m²','Step / end form m²','Gross form m²','Member qty','Gross concrete total m³','Gross form total m²']]);
 check.addRows([[`${bundle.project.code} · Continuous beam reconciliation`],['DRAFT / NOT FOR CONSTRUCTION · Net values link to captured BOQ. Gross minus net includes geometric voids and manual deductions. No reinforcement design or installation approval.'],['Member','Axis','Qty','Gross concrete each m³','Gross form each m²','Net concrete each m³','Net form each m²','Concrete gross−net m³','Form gross−net m²','Net concrete total m³','Net form total m²']]);
 const cell=(formula:string,result:number)=>({formula,result});
 orderedMembers.forEach((m,mi)=>{
  if(!m.beamAssembly)return;
  const b=assembleBeam(m.beamAssembly),q=bundle.calculations?.[m.id]||takeoff(m,bundle.project.spec),start=spans.rowCount+1,cr=check.rowCount+1,boqRow=4+mi;
  b.stations.forEach((s,i)=>{
   const r=spans.rowCount+1,p=r-1,first=i===0,last=i===b.stations.length-1;
   const endParts:string[]=[],endArea:number[]=[];
   if(first&&b.assembly.formwork.start){endParts.push(`F${r}*G${r}`);endArea.push(s.width*s.depth);}
   if(!first){endParts.push(`F${p}*G${p}+F${r}*G${r}-2*MIN(F${p},F${r})*MAX(0,MIN(H${p}+G${p},H${r}+G${r})-MAX(H${p},H${r}))`);endArea.push(b.steps[i-1].area*1e6);}
   if(last&&b.assembly.formwork.end){endParts.push(`F${r}*G${r}`);endArea.push(s.width*s.depth);}
   const vol=s.length*s.width*s.depth/1e9,long=s.length*(2*s.depth+s.width*(Number(b.assembly.formwork.bottom)+Number(b.assembly.formwork.top)))/1e6,end=endArea.reduce((n,v)=>n+v,0)/1e6;
   spans.addRow([m.code,b.assembly.axis,`S${i+1} · ${s.label}`,i?cell(`I${p}`,s.from):s.from,s.length,s.width,s.depth,s.soffit,cell(`D${r}+E${r}`,s.to),cell(`E${r}*F${r}*G${r}/1000000000`,vol),cell(`E${r}*(2*G${r}+F${r}*${Number(b.assembly.formwork.bottom)+Number(b.assembly.formwork.top)})/1000000`,long),cell(`(${endParts.join('+')||'0'})/1000000`,end),cell(`K${r}+L${r}`,long+end),cell(`'BOQ'!C${boqRow}`,q.quantity),cell(`J${r}*N${r}`,vol*q.quantity),cell(`M${r}*N${r}`,(long+end)*q.quantity)]);
  });
  const end=spans.rowCount;
  check.addRow([m.code,b.assembly.axis,cell(`'BOQ'!C${boqRow}`,q.quantity),cell(`SUM('Beam Spans'!J${start}:J${end})`,b.gross),cell(`SUM('Beam Spans'!M${start}:M${end})`,b.formGross),cell(`'BOQ'!D${boqRow}`,q.concrete),cell(`'BOQ'!E${boqRow}`,q.formwork),cell(`D${cr}-F${cr}`,b.gross-q.concrete),cell(`E${cr}-G${cr}`,b.formGross-q.formwork),cell(`C${cr}*F${cr}`,q.quantity*q.concrete),cell(`C${cr}*G${cr}`,q.quantity*q.formwork)]);
 });
 for(const sheet of [spans,check]){
  sheet.views=[{state:'frozen',ySplit:3}];sheet.columns.forEach((c,i)=>c.width=i===0?22:i===1?10:i===2&&sheet===spans?32:20);
  sheet.mergeCells(1,1,1,sheet.columnCount);sheet.mergeCells(2,1,2,sheet.columnCount);sheet.getRow(2).height=42;sheet.getRow(3).height=38;
  sheet.eachRow((r,i)=>r.eachCell(c=>{c.font={name:'Sarabun',size:10,color:{argb:i===3?'FFFFFFFF':'FF253A40'}};c.alignment={vertical:'middle',wrapText:true};if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};if(i>3){r.height=32;c.numFmt='#,##0.000';}}));
  sheet.autoFilter={from:{row:3,column:1},to:{row:sheet.rowCount,column:sheet.columnCount}};
  sheet.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:3',printArea:`A1:${sheet===spans?'P':'K'}${sheet.rowCount}`};
 }
 spans.getColumn(14).numFmt='0';check.getColumn(3).numFmt='0';
}
