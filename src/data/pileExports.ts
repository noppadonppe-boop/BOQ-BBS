import type ExcelJS from 'exceljs';
import type {jsPDF} from 'jspdf';
import type {SnapshotBundle} from '../domain/model';
import {pileReport} from '../domain/pileReport';
import {scopeLabel} from '../domain/exportScope';

const header=['Group','Pile','Piles (no.)','Pile length total (m)','Pile cut (no.)','Cut length total (m)'];

/** Excel sheet: pile work and pile-head cutting quantities. */
export function appendPileSheet(wb:ExcelJS.Workbook,b:SnapshotBundle){
 const r=pileReport(b);if(!r.rows.length)return;
 const s=wb.addWorksheet('Piles');
 s.addRows([[`${b.project.code} · งานเสาเข็ม / งานตัดหัวเข็ม`],[`${b.status} / NOT FOR CONSTRUCTION · ${b.revisionNumber||'D'+b.version} · ${scopeLabel(b.scope,b.members)} · group ${r.group}`],header]);
 for(const row of r.rows)s.addRow([row.label,row.pile,row.count,row.length,row.cutCount,row.cutLength]);
 s.addRow(['TOTAL',null,r.totals.count,r.totals.length,r.totals.cutCount,r.totals.cutLength]);
 const widths=[22,46,14,20,16,20];s.columns=widths.map(width=>({width}));s.mergeCells('A1:F1');s.mergeCells('A2:F2');
 s.eachRow((row,i)=>{row.eachCell({includeEmpty:true},(c,j)=>{c.font={name:'Sarabun',size:i===1?14:10,bold:i===1||i===3||i===s.rowCount,color:{argb:i===3?'FFFFFFFF':'FF203940'}};c.alignment={vertical:'middle',wrapText:true,horizontal:typeof c.value==='number'?'right':'left'};if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};if(i>3&&(j===4||j===6))c.numFmt='0.00';if(i>3&&(j===3||j===5))c.numFmt='0';});row.height=i===1?28:20;});
 s.views=[{state:'frozen',ySplit:3,showGridLines:false}];s.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:3'};
}

/** BOQ PDF page: pile work and pile-head cutting. */
export async function appendPilePdf(doc:jsPDF,b:SnapshotBundle){
 const r=pileReport(b);if(!r.rows.length)return;
 const {default:autoTable}=await import('jspdf-autotable');doc.addPage();
 autoTable(doc,{startY:40,margin:{left:15,right:15,top:40,bottom:20},head:[['กลุ่ม','เสาเข็ม','จำนวน (ต้น)','ความยาวรวม (m)','ตัดหัวเข็ม (ต้น)','ความยาวตัดรวม (m)']],body:r.rows.map(x=>[x.label,x.pile,x.count,x.length.toFixed(2),x.cutCount,x.cutLength.toFixed(2)]),foot:[['TOTAL','',r.totals.count,r.totals.length.toFixed(2),r.totals.cutCount,r.totals.cutLength.toFixed(2)]],showFoot:'lastPage',styles:{font:'Sarabun',fontStyle:'normal',fontSize:10},headStyles:{fillColor:[32,57,64],fontStyle:'normal'},footStyles:{fillColor:[232,240,235],textColor:[32,57,64],fontStyle:'normal'},columnStyles:{2:{halign:'right'},3:{halign:'right'},4:{halign:'right'},5:{halign:'right'}},
  didDrawPage:()=>{doc.setFont('Sarabun','normal');doc.setTextColor(32,57,64);doc.setFontSize(12);doc.text(`${b.project.code} · งานเสาเข็ม / งานตัดหัวเข็ม`,15,16);doc.setFontSize(8);doc.text(doc.splitTextToSize(`${b.status} / NOT FOR CONSTRUCTION · ${b.revisionNumber||'D'+b.version} · Scope: ${scopeLabel(b.scope,b.members)}`,390),15,28);}});
}
