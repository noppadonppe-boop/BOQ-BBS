import type ExcelJS from 'exceljs';
import type {jsPDF} from 'jspdf';
import type {SnapshotBundle} from '../domain/model';
import {projectMaterialsSchema} from '../domain/projectMaterials';
import {publicationLabel} from '../domain/publication';
import {font} from './exports';
import {ownerFrame,ownerOutput,ownerSheets,withOwnerSheets} from './ownerDrawingPdf';

export function appendProjectMaterialSheet(wb:ExcelJS.Workbook,b:SnapshotBundle){
 if(!b.project.spec.projectMaterials)return;
 const rules=projectMaterialsSchema.parse(b.project.spec.projectMaterials).entries,s=wb.addWorksheet('Project Material X');
 s.addRows([[`${b.project.code} / Project material X limits`],[`${publicationLabel(b)} / ${b.revisionNumber||'D'+b.version}. Explicit project values; no equivalence to BS grades, strength/ductility class, ACI or fabrication approval.`],['Grade','Nominal mm','Inside r min mm','Mandrel min mm','End dimension min mm','Document / revision / page','Source basis / scope','Type'],...rules.map(r=>[r.grade,r.diameter,r.innerRadius,r.formerDiameter,r.endDimension,r.reference,r.basis,'X'])]);
 s.columns=[16,12,18,20,22,45,75,8].map(width=>({width}));s.mergeCells('A1:H1');s.mergeCells('A2:H2');
 s.eachRow((row,i)=>{row.height=i<4?i===2?42:30:Math.max(42,Math.ceil(Math.max(String(row.getCell(6).value||'').length/30,String(row.getCell(7).value||'').length/50))*14+14);row.eachCell({includeEmpty:true},c=>{c.font={name:'Sarabun',size:10,bold:i===1||i===3,color:{argb:i===3?'FFFFFFFF':'FF203940'}};c.alignment={vertical:'top',wrapText:true};if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};});});
 s.views=[{state:'frozen',ySplit:3,showGridLines:false}];s.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:3',printArea:'A1:H'+s.rowCount};
}
export async function projectMaterialTable(doc:jsPDF,b:SnapshotBundle,size:'A3'|'A1',owner=false){
 const rules=projectMaterialsSchema.parse(b.project.spec.projectMaterials).entries,{default:autoTable}=await import('jspdf-autotable'),w=size==='A3'?420:841,h=size==='A3'?297:594;
 autoTable(doc,{startY:48,margin:{left:15,right:15,top:48,bottom:owner?80:25},head:[['Grade / nominal','Inside r / mandrel / end min (mm)','Document / revision / page','Basis / scope']],body:rules.map(r=>[`${r.grade} / Ø${r.diameter}`,`${r.innerRadius} / ${r.formerDiameter} / ${r.endDimension}`,r.reference,r.basis]),styles:{font:'Sarabun',fontStyle:'normal',fontSize:10,cellPadding:3,overflow:'linebreak'},headStyles:{fillColor:[32,57,64],fontStyle:'normal'},columnStyles:{0:{cellWidth:size==='A3'?45:70},1:{cellWidth:size==='A3'?75:130},2:{cellWidth:size==='A3'?90:160}},didDrawPage:()=>{doc.setFont('Sarabun','normal');doc.setTextColor(32,57,64);doc.setFontSize(12);doc.text('Project material X limits / '+b.project.code,15,20);doc.setFontSize(8);doc.text(doc.splitTextToSize(`${publicationLabel(b)} / ${b.revisionNumber||'D'+b.version} / Explicit project limits; no BS-grade equivalence, strength/ductility, ACI or fabrication approval.`,w-30),15,30);if(owner&&b.members[0])ownerFrame(doc,b,b.members[0],'Project material X limits',h-65);if(doc.getNumberOfPages()>500)throw Error('แบ่งชุด: ภาคผนวกวัสดุ X เกิน500หน้า');}});
}
export async function appendProjectMaterialPdf(original:Blob,b:SnapshotBundle,size:'A3'|'A1'){
 if(!b.project.spec.projectMaterials)return original;
 const [{jsPDF},{PDFDocument}]=await Promise.all([import('jspdf'),import('pdf-lib')]);const doc=new jsPDF({orientation:'landscape',unit:'mm',format:size.toLowerCase()});await font(doc);await projectMaterialTable(doc,b,size,true);
 const added=ownerOutput(doc),pdf=await PDFDocument.load(await original.arrayBuffer()),extra=await PDFDocument.load(await added.arrayBuffer()),offset=pdf.getPageCount();if(offset+extra.getPageCount()>500)throw Error('แบ่งชุด: แบบพร้อมข้อกำหนดวัสดุ X เกิน500หน้า');for(const p of await pdf.copyPages(extra,extra.getPageIndices()))pdf.addPage(p);
 return withOwnerSheets(new Blob([await pdf.save() as BlobPart],{type:'application/pdf'}),[...ownerSheets(original),...ownerSheets(added).map(s=>({...s,page:s.page+offset}))]);
}
