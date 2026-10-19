import type {jsPDF} from 'jspdf';
import type {SnapshotBundle} from '../domain/model';
import {fabricationInspectionResult} from '../domain/fabricationInspection';
import {ordered,frozenTakeoff,label} from './exports';
const fmt=(n:number|undefined)=>n===undefined?'-':n.toLocaleString('en-US',{maximumFractionDigits:3});
export async function appendFabricationInspectionPages(doc:jsPDF,bundle:SnapshotBundle){
 const records=ordered(bundle).flatMap(member=>frozenTakeoff(member,bundle).rows.flatMap(row=>(row.fabricationInspections||[]).map(record=>({member,row,record}))));
 if(!records.length)return;
 const {default:autoTable}=await import('jspdf-autotable');
 for(const {member,row,record} of records){
  if(doc.getNumberOfPages()>=500)throw Error('ชุดผลวัดรวมเกิน500หน้า ให้แบ่งขอบเขตส่งออก');
  const result=fabricationInspectionResult(bundle.project.spec,row,record);
  const header=[`${bundle.project.code} / ${bundle.project.name}`,`${member.code} / Mark ${row.mark} / Piece ${record.pieceReference}`,`${record.inspectedOn} / Recorded by (user entry): ${record.observer}`,`Source: ${record.source}`,`App status: ${result.status}`];
  if(result.recordedNominal)header.push(`Nominal stored with record: code ${result.recordedNominal.code}, cut ${fmt(result.recordedNominal.cut)} mm; ${result.recordedNominal.dimensions.map(d=>`${d.label} ${fmt(d.value)}`).join(' / ')}; ${result.recordedNominal.policy}`);
  doc.setFont('Sarabun','normal');doc.setFontSize(8.5);
  const lines=header.flatMap(text=>doc.splitTextToSize(text,185) as string[]),startY=28+lines.length*4+8;
  if(startY>150)throw Error('รายละเอียดหัวผลวัดยาวเกิน A4 ให้ลดชื่อ/ข้อมูลกำหนดที่ไม่จำเป็น');
  const body:any[]=result.criteria.map(c=>[c.label,fmt(c.nominal),fmt(c.lower),fmt(c.upper),fmt(c.measured),c.result]);
  if(!body.length)body.push(['Cut','-','-','-',fmt(record.measuredCut),'Reference unavailable']);
  for(const [key,value] of Object.entries(record.measuredDimensions).filter(([key])=>!result.criteria.some(c=>c.label===key)))body.push([key,'-','-','-',fmt(value),'Unmapped / review']);
  if(record.measuredInnerRadius!==undefined)body.push(['Inner r',fmt(row.standard.innerRadius),'-','-',fmt(record.measuredInnerRadius),'No assigned tolerance']);
  if(result.balance){const b=result.balance;body.push([{content:`Free (${b.freeLabel})`},{content:b.available?`From measured cut and other dimensions: required ${fmt(b.required)}, measured ${fmt(b.measured)}, residual ${fmt(b.residual)} mm. Required ${b.withinFreeRange?'within':'outside'} nominal free range; permissible residual undefined. Algebra only, no physical adjustment.`:`Missing actual measurements: ${b.missing.join(', ')}`,colSpan:5}]);}
  for(const note of [...result.minimumProblems,...result.notes,record.note].filter(Boolean))body.push([{content:'Review'},{content:note,colSpan:5}]);
  doc.addPage('a4','portrait');
  autoTable(doc,{startY,margin:{top:startY,bottom:27,left:12.5,right:12.5},head:[['Item','Current nominal\nmm','Lower\nmm','Upper\nmm','Measured\nmm','Comparison / review']],body,
   styles:{font:'Sarabun',fontStyle:'normal',fontSize:8.5,cellPadding:1.7,overflow:'linebreak',valign:'top'},headStyles:{fillColor:[32,57,64],textColor:[255,255,255]},alternateRowStyles:{fillColor:[242,246,243]},columnStyles:Object.fromEntries([20,28,28,28,28,53].map((cellWidth,i)=>[i,{cellWidth}])),rowPageBreak:'avoid',showHead:'everyPage',
   didDrawPage:()=>{if(doc.getNumberOfPages()>500)throw Error('ชุดผลวัดรวมเกิน500หน้า ให้แบ่งขอบเขตส่งออก');doc.setFont('Sarabun','normal');doc.setTextColor(28,52,60);doc.setFontSize(12);doc.text('PER-PIECE FABRICATION MEASUREMENTS',12.5,18);doc.setFontSize(8.5);doc.text(lines,12.5,28,{lineHeightFactor:1.33});doc.setFontSize(6.5);doc.text(doc.splitTextToSize(label(bundle),185),12.5,274);doc.text('USER RECORDED / NOT FOR CONSTRUCTION',12.5,284);doc.text(`A4 / Page ${doc.getNumberOfPages()}`,197.5,289,{align:'right'});}
  });
 }
}
