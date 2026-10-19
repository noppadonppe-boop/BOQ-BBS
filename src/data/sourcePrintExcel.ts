import {sourceRowPage,sourcePagesLabel} from '../domain/sourceSchedule';
import type ExcelJS from 'exceljs';
import type {SnapshotBundle} from '../domain/model';
import {compareSourceSchedule} from '../domain/sourceSchedule';
import {sourceComparisonQuantity} from '../domain/sourceQuantityBasis';
import {sourceRegionPlans} from '../domain/sourceRegions';
import {frozenTakeoff,label} from './exports';

export function appendSourcePrintSheets(wb:ExcelJS.Workbook,bundle:SnapshotBundle){
 const members=bundle.members.filter(m=>m.sourceSchedule);if(!members.length)return;
 const sheet=wb.addWorksheet('Source BBS Print');
 sheet.addRow([bundle.project.code+' · Source BBS comparison']);sheet.addRow([label(bundle)+' · SOURCE REFERENCE / mm / kg · Blank BBS values are pending, not zero. Full source identity, notes and numeric formulas remain in Source BBS Check / Notes.']);
 sheet.addRow(['Member','Source Mark','BBS Mark','Ø source / BBS','Grade source / BBS','Count source / BBS','Cut source / BBS mm','Source kg','BBS kg','Delta kg','Captured result','Source page / basis']);
 for(const m of members){const r=compareSourceSchedule(m,frozenTakeoff(m,bundle).rows,bundle.attachments,sourceComparisonQuantity(m,bundle))!;
  const at=sheet.rowCount+1;sheet.addRow([`${m.code} · ${r.attachment?.name||'SOURCE MISSING'} · Rev ${r.attachment?.revision||'—'} · pages ${sourcePagesLabel(r.source)} · SHA256 ${r.source.sha256}\n${r.source.version===3?'Printed totals by page: '+r.pageWeights.map(t=>'p'+t.page+'='+String(t.statedTotalWeight??'not entered')+' kg').join('; '):'Printed total: '+String(r.source.statedTotalWeight??'not entered')+' kg'} / row sum: ${r.sourceWeightComplete?r.sourceWeight:'incomplete'} kg / Source basis qty ${r.quantity}; selected qty ${r.selectedQuantity}. REFERENCE ONLY / NO ENGINEERING APPROVAL`]);sheet.mergeCells(`A${at}:L${at}`);sheet.getRow(at).height=r.source.version===3?65:44;
  for(const row of r.rows)sheet.addRow([m.code,row.source.mark,row.bar?.mark||'UNMAPPED',`${row.source.diameter} / ${row.bar?.diameter??'—'}`,`${row.source.grade} / ${row.bar?.grade??'—'}`,`${row.source.count} / ${row.actualCount??'—'}`,`${row.source.cutLength} / ${row.bar?.cutLength??'—'}`,row.source.weight??null,row.actualWeight??null,row.weightDifference??null,row.status,`${sourceRowPage(r.source,row.source)} / ${r.source.basis}`]);
 }
 printStyle(sheet,[16,10,11,13,16,17,19,15,15,15,18,22],'L',28);
 const plans=sourceRegionPlans(bundle),raw=wb.getWorksheet('Source Shape References'),images=raw?.getImages()||[];if(!plans.length)return;
 if(images.length!==plans.length)throw Error('รูปดัดต้นทางไม่ครบก่อนจัดหน้าพิมพ์');
 const shapes=wb.addWorksheet('Source Shapes Print');shapes.addRow([bundle.project.code+' · Source bending shape references']);shapes.addRow([label(bundle)+' · REFERENCE ONLY / NTS · Original-file crops do not create a bar path or validate geometry, placement or source approval.']);shapes.addRow(['Source identity / declared input / pending BBS','Original source bending shape']);
 plans.forEach((p,i)=>{const row=shapes.rowCount+1,b=p.member.bars.find(b=>b.id===p.row.barId);shapes.addRow([`${p.member.code} · Source Mark ${p.row.mark} → BBS ${b?.mark||'UNMAPPED'}\n${p.attachment.name} / Rev ${p.attachment.revision} / page ${p.reference.page}\nD${p.row.diameter} / ${p.row.grade} / ${p.row.count} pcs / cut ${p.row.cutLength} mm\nSHA256 ${p.reference.sha256}\n${b?'Mapped identity only; geometry/placement still need review.':'No reconstructed BBS geometry; source image is reference only.'}`]);shapes.getRow(row).height=150;const ext=(images[i].range as unknown as {ext?:{width:number;height:number}}).ext;if(!ext||ext.width<=0||ext.height<=0)throw Error('ขนาดรูปอ้างอิงไม่ถูกต้อง');const scale=Math.min(640/ext.width,175/ext.height),width=ext.width*scale,height=ext.height*scale;shapes.addImage(Number(images[i].imageId),{tl:{col:1+.04+(640-width)/2/672,row:row-1+.04+(175-height)/2/200},ext:{width,height},editAs:'oneCell'});});
 printStyle(shapes,[80,96],'B',150);
}

function printStyle(sheet:ExcelJS.Worksheet,widths:number[],last:string,height:number){
 sheet.columns=widths.map(width=>({width}));sheet.mergeCells(`A1:${last}1`);sheet.mergeCells(`A2:${last}2`);sheet.getRow(1).height=28;sheet.getRow(2).height=40;sheet.getRow(3).height=36;
 sheet.eachRow((row,i)=>{if(i>3&&!row.height)row.height=height;row.eachCell(c=>{c.font={name:'Sarabun',size:i===1?14:i===2?9:10,bold:i===1||i===3,color:{argb:i===3?'FFFFFFFF':'FF203940'}};c.alignment={vertical:'middle',wrapText:true,horizontal:typeof c.value==='number'?'right':sheet.name==='Source BBS Print'&&(i===3||i>3&&String(c.value??'').length<=40)?'center':'left'};if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245E4D'}};if(typeof c.value==='number')c.numFmt='0.000000';});});
 sheet.views=[{state:'frozen',ySplit:3,showGridLines:false}];sheet.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:false,scale:100,printTitlesRow:'1:3',printArea:`A1:${last}${sheet.rowCount}`,margins:{left:.25,right:.25,top:.3,bottom:.3,header:.15,footer:.15}};
}
