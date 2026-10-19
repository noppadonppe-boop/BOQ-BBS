import type {jsPDF} from 'jspdf';
import type {SnapshotBundle} from '../domain/model';
import {bsEnabled} from '../domain/bs8666';
import {bsToleranceReference,BS_TOLERANCE_REFERENCE} from '../domain/bsTolerances';
import {frozenTakeoff,ordered,label} from './exports';
import {scheduleReferences,SCHEDULE_ROWS} from '../domain/cuttingSchedule';

const fmt=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:3});
// Append reference ranges to newly generated schedules; archived original PDF
// bytes and selected cuts are never rewritten or adjusted by this appendix.
export async function appendBSTolerancePages(doc:jsPDF,bundle:SnapshotBundle){
 if(!bsEnabled(bundle.project.spec))return;
 const rows:(string|number)[][]=[];
 for(const member of ordered(bundle)){
  const refs=scheduleReferences(member);
  frozenTakeoff(member,bundle).rows.forEach((row,index)=>{
   const reference=bsToleranceReference(bundle.project.spec,row)!;
   const limits=[{label:'Cut',free:false,endMinimum:undefined,nominal:row.cutLength,plus:reference.cut?.plus,minus:reference.cut?.minus,lower:reference.cut?.lower,upper:reference.cut?.upper},...reference.dimensions];
   for(const limit of limits){const status=limit.lower===undefined?'Range unavailable / review':limit.endMinimum!==undefined&&limit.lower<limit.endMinimum?'Table 3 limit: review':limit.label==='Cut'&&row.cutOverride>0?'Manual cut / review':limit.free?'Free / allowance pending':'Reference only';
    rows.push([refs[Math.floor(index/SCHEDULE_ROWS)],member.code,row.mark,row.shapeCode||'PENDING',limit.free?'('+limit.label+')':limit.label,fmt(limit.nominal),limit.plus??'-',limit.minus??'-',limit.lower===undefined?'-':fmt(limit.lower),limit.upper===undefined?'-':fmt(limit.upper),status]);
   }
  });
 }
 if(!rows.length)return;
 const {default:autoTable}=await import('jspdf-autotable');doc.addPage('a4','portrait');
 autoTable(doc,{
  startY:73,margin:{top:73,bottom:31,left:12.5,right:12.5},
  head:[['Ref','Member','Mark','Code','Item','Nominal\nmm','+ mm','- mm','Lower\nmm','Upper\nmm','Status']],body:rows,
  styles:{font:'Sarabun',fontSize:7.5,cellPadding:1.4,overflow:'linebreak',valign:'middle',lineWidth:.15,lineColor:[190,205,198]},
  headStyles:{fillColor:[32,57,64],textColor:[255,255,255],fontStyle:'normal'},alternateRowStyles:{fillColor:[241,245,243]},
  columnStyles:Object.fromEntries([17,17,12,9,14,20,10,10,22,22,32].map((cellWidth,index)=>[index,{cellWidth,halign:index>=5&&index<=9?'right':'left'}])),
  rowPageBreak:'avoid',showHead:'everyPage',
  didDrawPage:()=>{
   doc.setFont('Sarabun','normal');doc.setTextColor(28,52,60);doc.setFontSize(12);doc.text('BAR TOLERANCE REFERENCE / Table 4',12.5,18);
   doc.setFontSize(8);const projectLines=doc.splitTextToSize(`${bundle.project.code} / ${bundle.project.name}`,185);if(projectLines.length>4)throw Error('ชื่อโครงการยาวเกินหัวหน้าค่าคลาดเคลื่อน A4');doc.text(projectLines,12.5,26);
   doc.setFontSize(8);doc.text(['BS 8666:2000 + Amd1/2 / clause 9 / printed p.13','Cut: +25 / -25 mm. Bend: +5 / -5, -10 or -25 mm by nominal dimension.','Individual ranges only. No cumulative tolerance or free-leg adjustment.','Manual cuts, unmapped shapes and full fabrication / ACI review remain pending.'],12.5,44);
   doc.setFontSize(6.5);doc.text(doc.splitTextToSize(label(bundle),185),12.5,273);
   doc.text(`${BS_TOLERANCE_REFERENCE.id} / REFERENCE ONLY`,12.5,282);
   doc.text(`A4 / Page ${doc.getNumberOfPages()}`,197.5,289,{align:'right'});
  },
 });
}
