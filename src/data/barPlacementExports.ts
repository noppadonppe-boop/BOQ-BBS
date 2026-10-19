import type ExcelJS from 'exceljs';
import type {SnapshotBundle,Member} from '../domain/model';
import {barPaths} from '../domain/engine';
import {pathBasisConvention} from '../domain/planarPathInput';
import {calculationEngine} from '../domain/version';
import {scopeLabel} from '../domain/exportScope';
import {font,ordered,label} from './exports';
import {ownerFrame,ownerOutput,ownerSheets,withOwnerSheets} from './ownerDrawingPdf';

const groups=(b:SnapshotBundle)=>ordered(b).flatMap(member=>member.bars.filter(bar=>bar.placementLayout).map(bar=>({member,bar,layout:bar.placementLayout!,paths:barPaths(member,bar)})));
const fmt=(n:number)=>Number(n.toFixed(6)).toLocaleString('en-US',{maximumFractionDigits:6});
const xyz=(v:number[])=>v.map(fmt).join(', ');
export function appendBarPlacementSheets(wb:ExcelJS.Workbook,b:SnapshotBundle){
 const gs=groups(b);if(!gs.length)return;
 const basis=wb.addWorksheet('Placement Basis'),poses=wb.addWorksheet('Bar Placements');
 basis.addRows([[`${b.project.code} · Bar placement basis`],[`${b.status} / NOT FOR CONSTRUCTION · ${calculationEngine(b.project.spec)}\n${scopeLabel(b.scope,b.members)} · All coordinates use the member common datum, including target-solid origin. Anchor is the first template point; pivot is the fixed rotation centre. Pose rotations X then Y then Z, followed by offset.`],['Member','Mark','Bars / element','Selected elements','Anchor X mm','Y mm','Z mm','Pivot X mm','Y mm','Z mm']]);
 poses.addRows([[`${b.project.code} · Individual bar placements`],['Coordinates within one member, mm / degrees. First pose is identity. Quantity multiplies the selected element count once in BBS, not here. Reference and frame are in Placement Basis. Captured geometry is not engineering approval.'],['Member','Mark','Pose ID','Offset X mm','Y mm','Z mm','Rotate X deg','Y deg','Z deg','First X mm','Y mm','Z mm','Last X mm','Y mm','Z mm']]);
 for(const {member:m,bar,layout,paths} of gs){
  basis.addRow([m.code,bar.mark,bar.count,m.occurrences.reduce((n,o)=>n+o.quantity,0),...layout.anchor,...layout.pivot]);
  const r=basis.addRow([`Reference / ${m.code} / ${bar.mark}: ${layout.reference}`]);basis.mergeCells(r.number,1,r.number,10);r.height=Math.max(35,Math.ceil(String(r.getCell(1).value).length/80)*14+12);
  layout.poses.forEach((p,i)=>poses.addRow([m.code,bar.mark,p.id,...p.offset,...p.rotation,...paths[i][0],...paths[i].at(-1)!]));
 }
 for(const [s,widths] of [[basis,[22,16,10,10,16,16,16,16,16,16]],[poses,[18,12,14,13,13,13,12,12,12,13,13,13,13,13,13]]] as [ExcelJS.Worksheet,number[]][]){
  s.columns=widths.map(width=>({width}));for(const r of [1,2])s.mergeCells(r,1,r,widths.length);
  s.eachRow((row,i)=>{row.height=row.height||Math.max(i===1?30:i===2?80:i===3?44:36,i>3?Math.ceil(Math.max(String(row.getCell(1).value).length/14,String(row.getCell(2).value).length/9,String(row.getCell(3).value).length/9))*14+10:0);row.eachCell({includeEmpty:true},c=>{c.font={name:'Sarabun',size:i===1?15:10,bold:i===1||i===3,color:{argb:i===3?'FFFFFFFF':'FF203940'}};c.alignment={vertical:'middle',wrapText:true,horizontal:typeof c.value==='number'?'right':'left'};if(typeof c.value==='number')c.numFmt=s===basis&&Number(c.col)<=4?'#,##0':'0.000000';if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};else if(i>3&&i%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F3'}};});});
  s.views=[{state:'frozen',ySplit:3,showGridLines:false}];s.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:false,scale:100,printTitlesRow:'1:3',margins:{left:.4,right:.4,top:.4,bottom:.4,header:.15,footer:.15},printArea:`A1:${s.getColumn(widths.length).letter}${s.rowCount}`};s.headerFooter={oddFooter:'&LNOT FOR CONSTRUCTION&C&A&RPage &P / &N'};
 }
 poses.autoFilter={from:{row:3,column:1},to:{row:poses.rowCount,column:15}};
}
export async function appendBarPlacementPdf(original:Blob,b:SnapshotBundle,size:'A3'|'A1'){
 const gs=groups(b);if(!gs.length)return original;
 const [{jsPDF},{default:autoTable},{PDFDocument}]=await Promise.all([import('jspdf'),import('jspdf-autotable'),import('pdf-lib')]);
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:size.toLowerCase()});await font(doc);let first=true;
 const w=size==='A3'?420:841,h=size==='A3'?297:594;
 function page(){if(!first)doc.addPage();first=false;}
 function decorate(m:Member,title:string){doc.setFont('Sarabun','normal');doc.setFontSize(12);doc.setTextColor(32,57,64);doc.text('Individual bar placements / DRAFT',15,20);doc.setFontSize(8);doc.text(doc.splitTextToSize(`${b.project.code} / ${m.code} / ${title} / ${label(b)}`,w-30),15,30);ownerFrame(doc,b,m,'Individual bar placements',h-65);doc.setFontSize(7);doc.text('Member common datum / mm / degrees. Position records are not engineering approval. NOT FOR CONSTRUCTION.',15,h-72);if(doc.getNumberOfPages()>500)throw Error('แบ่งขอบเขต: ตารางตำแหน่งรายแท่งเกิน 500 หน้า');}
 for(const {member:m,bar,layout,paths} of gs){
  page();
  autoTable(doc,{startY:48,margin:{left:15,right:15,top:48,bottom:80},head:[['Placement frame','Captured input']],body:[['Reference',layout.reference],['Template first point XYZ mm',xyz(layout.anchor)],['Rotation pivot XYZ mm',xyz(layout.pivot)],['Quantity',`${bar.count} bars per element / ${m.occurrences.reduce((n,o)=>n+o.quantity,0)} selected elements`],['Transform','Fixed member axes: rotate X, then Y, then Z about the pivot; then translate by the pose offset. First pose is identity.'],['Scope','Target-solid origin is already included in member coordinates. Original source drawing and bar shape require review.'],...(bar.pathInput?[['Input plane / basis',bar.pathInput.plane+' / '+bar.pathInput.basis+' / start '+bar.pathInput.startAngle+' degrees'],['Template rotation XYZ degrees',(bar.pathInput.templateRotation||[0,0,0]).join(' / ')],['Input outside / inner radius',bar.pathInput.outsideDiameter+' / '+bar.pathInput.innerRadius+' mm'],['Input legs: length mm / turn degrees',bar.pathInput.legs.map((l,i)=>(i+1)+': '+l.length+' / '+l.turn).join(' ; ')],['Input reference',bar.pathInput.reference],['Input convention',pathBasisConvention]]:[]),['Engine',calculationEngine(b.project.spec)]],styles:{font:'Sarabun',fontStyle:'normal',fontSize:9,cellPadding:3},headStyles:{fillColor:[32,57,64],fontStyle:'normal'},columnStyles:{0:{cellWidth:size==='A3'?85:150}},didDrawPage:()=>decorate(m,`Mark ${bar.mark} / placement basis`)});
  page();
  autoTable(doc,{startY:48,margin:{left:15,right:15,top:48,bottom:80},head:[['Pose ID','Offset X','Y','Z','Rotate X°','Y°','Z°','First X','Y','Z','Last X','Y','Z']],body:layout.poses.map((p,i)=>[p.id,...p.offset.map(fmt),...p.rotation.map(fmt),...paths[i][0].map(fmt),...paths[i].at(-1)!.map(fmt)]),styles:{font:'Sarabun',fontStyle:'normal',fontSize:8.5,cellPadding:2},headStyles:{fillColor:[32,57,64],fontStyle:'normal'},didDrawPage:()=>decorate(m,`Mark ${bar.mark} / ${layout.poses.length} physical positions in one element`)});
 }
 if(!b.project.drawingProfile){const total=doc.getNumberOfPages();for(let i=1;i<=total;i++){doc.setPage(i);doc.setFont('Sarabun','normal');doc.setFontSize(8);doc.setTextColor(32,57,64);doc.setDrawColor(160,175,178);doc.line(15,h-64,w-15,h-64);doc.text(`${b.project.code} / ${label(b)} / ${size}`,15,h-56);doc.text(`Placement appendix ${i}/${total}`,w-15,h-56,{align:'right'});}}
 const added=ownerOutput(doc),pdf=await PDFDocument.load(await original.arrayBuffer()),extra=await PDFDocument.load(await added.arrayBuffer()),offset=pdf.getPageCount();if(offset+extra.getPageCount()>500)throw Error('แบ่งขอบเขต: แบบและรายการตำแหน่งรวมเกิน 500 หน้า');
 for(const p of await pdf.copyPages(extra,extra.getPageIndices()))pdf.addPage(p);
 return withOwnerSheets(new Blob([await pdf.save() as BlobPart],{type:'application/pdf'}),[...ownerSheets(original),...ownerSheets(added).map(s=>({...s,page:s.page+offset}))]);
}
