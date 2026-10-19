import {quantityBasisState} from '../domain/quantityBasis';
import {appendSourceSchedulePdf} from './sourceSchedulePdf';
import {hasPlacementContext} from '../domain/placementContext';
import type {jsPDF} from 'jspdf';
import type {Member} from '../domain/model';
import {BS2000,bsEnabled} from '../domain/bs8666';
import {SCHEDULE_ROWS,scheduleReferences,validateScheduleBundle} from '../domain/cuttingSchedule';
import {Bundle,font,frozenTakeoff,label,ordered} from './exports';
import {appendBSTolerancePages} from './bsTolerancePdf';
import {appendFabricationInspectionPages} from './fabricationInspectionPdf';

const widths=[21,12,13,10,11,12,15,12,14,14,14,14,16,12];
const heads=['Member','Bar\nmark','Type\nand size','No. of\nmbrs','Bars in\neach','Total\nno.','Length of\neach bar\nmm','Shape\ncode','A\nmm','B\nmm','C\nmm','D\nmm','E / R\nmm','Rev\nletter'];
const fmt=(n:number)=>Number(n.toFixed(3)).toString();
function fit(doc:jsPDF,text:string,x:number,y:number,width:number,height:number,size=8){
 let lines:string[]=[],fs=size;
 do{doc.setFontSize(fs);lines=doc.splitTextToSize(text,width);if(lines.length*fs*.3528*1.12<=height)break;fs-=.25;}while(fs>=5.5);
 if(lines.length*fs*.3528*1.12>height)throw Error('ข้อความในตาราง A4 ยาวเกินพื้นที่ ให้ย่อข้อมูลก่อนส่งออก');
 doc.text(lines,x,y,{lineHeightFactor:1.12});
}
function header(doc:jsPDF,b:Bundle,m:Member,reference:string,title:string){
 doc.setFont('Sarabun','normal');doc.setTextColor(28,52,60);doc.setDrawColor(62,86,91);doc.setLineWidth(.3);doc.rect(10,10,190,277);
 doc.setFontSize(12);doc.text(title,15,19);doc.setFontSize(9);doc.text('Schedule ref',195,18,{align:'right'});doc.setFontSize(13);doc.text(reference,195,25,{align:'right'});
 fit(doc,`${b.project.code} / ${b.project.name}`,15,28,133,10,9);
 fit(doc,`Site: ${b.project.location} / Owner: ${b.project.owner}`,15,39,180,8,8);
 fit(doc,`Drawing: ${m.scheduleSetup!.drawingNumber} / Member: ${m.code}`,15,49,180,8,8);
 fit(doc,`Prepared: ${b.project.titleBlock.drawnBy||'UNSET'} / Checked: ${b.project.titleBlock.checkedBy||'UNSET'} / ${b.createdAt.slice(0,10)}`,15,58,180,7,8);
 if(hasPlacementContext(m)){doc.setFontSize(7);doc.text(m.placementContext?.version===2?'Context openings / regional cover: geometric checks only; no added BOQ; joint/anchorage/lap review pending.':'Placement context excluded from concrete/formwork BOQ; joint/anchorage/lap review pending.',15,275);}
 doc.setFontSize(7);if(quantityBasisState(m)==='Provisional')doc.text('PROVISIONAL INPUTS: member counts / weights are raw previews, NOT FOR FABRICATION.',15,269);doc.text(label(b),15,279);doc.text(`A4 / cutting-a4-v1 / ${b.engineVersion||'legacy'}`,15,284);
}
type Row=ReturnType<typeof frozenTakeoff>['rows'][number];
function checks(row:Row,b:Bundle){return [
 ...row.errors,...row.standard.problems,
 ...(!bsEnabled(b.project.spec)?['ชุดกฎโครงการไม่ได้เปิดตัวตรวจขั้นต่ำ BS 8666:2000']:[]),
 ...(!row.placementConfirmed?['รอยืนยันตำแหน่งเหล็กจากแบบ']:[]),
 ...(!row.standard.formula?['ยังไม่มีสูตร/มิติ BS สำหรับรูปนี้']:[]),
 ...(row.mark.length>6?['Mark เกิน 6 ตัวอักษรตามข้อ 5.5']:[]),
];}
function scheduleCells(m:Member,r:Row,quantity:number){
 const a=r.standard,dimension=(key:string)=>{const d=a.dimensions.find(v=>v.label===key);return d?(d.free?'('+fmt(d.value)+')':fmt(d.value)):'';};
 // Code 12 explicitly schedules inner R; do not substitute the centerline radius.
 return [m.code,r.mark,r.bsType?r.bsType+fmt(r.diameter):'UNMAPPED\n'+fmt(r.diameter),String(quantity),String(r.count),String(r.count*quantity),fmt(r.cutLength),r.shapeCode||'PENDING',dimension('A'),dimension('B'),dimension('C'),dimension('D'),r.shapeCode==='12'&&a.formula?fmt(a.innerRadius):dimension('E'),r.scheduleRevisionLetter||''];
}
export async function cuttingSchedulePdf(bundle:Bundle):Promise<Blob>{
 validateScheduleBundle(bundle);
 const {jsPDF}=await import('jspdf'),doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});await font(doc);
 // Frozen quantities are used throughout. The appendix separates BS formula and actual selected cut basis.
 let first=true;const next=()=>{if(!first)doc.addPage();first=false;};
 for(const m of ordered(bundle).sort((a,c)=>a.scheduleSetup!.drawingNumber.slice(-3).localeCompare(c.scheduleSetup!.drawingNumber.slice(-3))||a.scheduleSetup!.startNumber-c.scheduleSetup!.startNumber)){
  const q=frozenTakeoff(m,bundle),refs=scheduleReferences(m);
  for(let s=0;s<refs.length;s++){
   const rows=q.rows.slice(s*SCHEDULE_ROWS,(s+1)*SCHEDULE_ROWS),reference=refs[s];next();header(doc,bundle,m,reference,'BAR CUTTING / BENDING SCHEDULE');
   const pageHeads=rows.some(row=>!!row.standard.helix)?heads.map((h,i)=>i===10?'C\nturns 77\nmm other':h):heads;let x=10;pageHeads.forEach((t,i)=>{doc.setFillColor(232,240,237);doc.rect(x,66,widths[i],20,'FD');fit(doc,t,x+1,71,widths[i]-2,17,7.5);x+=widths[i];});
   for(let i=0;i<SCHEDULE_ROWS;i++){x=10;const y=86+i*18,values=rows[i]?scheduleCells(m,rows[i],q.quantity):heads.map(()=>'');values.forEach((v,j)=>{doc.rect(x,y,widths[j],18);fit(doc,v,x+1,y+4,widths[j]-2,15,8);x+=widths[j];});}
   doc.setFontSize(7);doc.setTextColor(94,64,26);doc.text('Partial BS 8666:2000 reference - engineering release pending.',15,271);
   // Each row has a complete check/calculation appendix with the SAME reference, not another schedule number.
   for(const r of rows){next();header(doc,bundle,m,reference,'CALCULATION / CHECK APPENDIX');const a=r.standard;
    const fields=[['Mark / row revision',`${r.mark} / ${r.scheduleRevisionLetter||'UNSET'}`],['Material / BS notation',`${r.grade} / ${r.bsType||'UNMAPPED'}${fmt(r.diameter)} / outside diameter ${fmt(a.outsideDiameter)} mm`],['Quantity',`${r.count} bars per member x ${q.quantity} members = ${r.count*q.quantity} bars`],['Shape / radius',`${r.shapeCode||'PENDING'} / ${a.hasBends?'centerline R '+fmt(r.radius)+' / inner r '+fmt(a.innerRadius)+' mm':'straight / no radius'}${a.helix?' / uniform helix '+a.helix.C+' turns / pitch '+a.helix.B+' mm / '+a.helix.handedness:a.semicircle?' / one continuous 180 deg semicircle':a.arc?' / continuous arc '+fmt(a.arc.sweepDegrees)+' deg / '+a.arc.supply.method:''}`],[a.helix?'BS dimensions: A diameter / B pitch / C turns':a.arc?'BS dimensions: A centreline arc / R inside':'BS outside dimensions',a.dimensions.map(d=>`${d.free?'('+d.label+')':d.label} = ${fmt(d.value)} ${d.unit==='turns'?'turns':'mm'}`).join('; ')||'Unsupported shape - outside dimensions pending'],['BS equation',a.formula?`${a.formula} = ${fmt(a.formulaLength!)} mm`:'Unsupported - no BS equation'],['Selected cut basis',`${r.lengthBasis} / calculated ${fmt(r.calculatedLength)} / cut ${fmt(r.cutLength)} mm`],['Centerline / rounding',`${fmt(r.geometricLength)} mm / increment ${fmt(bundle.project.spec.rounding)} mm`],['Weight',`${fmt(r.eachWeight)} kg each / ${fmt(r.weight*q.quantity)} kg total`]];
    if(a.oblique){const o=a.oblique;fields.push(['Table 1 Note 1',`${o.anglesDegrees.map(v=>fmt(v)+' deg').join(' / ')}; approximate ${fmt(o.approximateLength)}; exact ${fmt(o.exactLength)} mm; ${o.exactRequired?'over45: exact':'up to45: approximate'}`]);}
    let y=70;fields.forEach(([key,value])=>{doc.setDrawColor(177,192,188);doc.rect(15,y-4,180,12);fit(doc,key,17,y,48,10,8);fit(doc,value,67,y,126,10,8);y+=12;});
    const problems=Array.from(new Set(checks(r,bundle)));doc.setTextColor(problems.length?128:33,problems.length?67:96,problems.length?25:66);fit(doc,problems.length?'Minimum checks / PENDING: '+problems.join(' | '):'PASS: implemented minimum checks only. Full conformity / fabrication approval pending.',15,a.oblique?194:182,180,a.oblique?26:38,8);
    doc.setTextColor(53,74,81);fit(doc,'Note: '+(r.note||'None')+(a.helix?'\nCode77: A is outside diameter; B is axial pitch per turn; C is number of turns, not mm. If B > A/5 exact 3D length controls; otherwise Table1 C pi(A-d). No standard free dimension.':a.arc?'\nCode67: A is continuous centreline arc length; R in E/R is inside. A/R have no standard free dimension. Table5 concerns supply, not a lower bend-radius deduction.':'\nParentheses identify the standard free dimension. R in E/R is INNER R for code 12. Other shape fabrication details, coordinates and two-line code 99 drawings require separate review.')+(a.oblique?'\nNote 1: approaching 90 deg, consider Code 99 with full dimensions.':'')+(a.oblique&&r.shapeCode.trim()==='25'?' If E is critical, use Code 99 and make A or B free.':''),15,223,180,29,8);
    fit(doc,`Source: ${BS2000.edition} / ${a.helix?'Table1 printed p8; Table3 printed p11':a.arc?'Table1 printed p8; clause10 / Table5 printed p13':'clauses 5.1-5.6 / Figure 2; Table 1 / Table 3'}\nSHA256 ${BS2000.sha256}`,15,260,180,12,7);
   }
  }
 }
 await appendBSTolerancePages(doc,bundle);
 await appendFabricationInspectionPages(doc,bundle);
 if(doc.getNumberOfPages()>500)throw Error('ชุดตาราง A4 รวมภาคผนวกเกิน 500 แผ่น ให้เลือกสมาชิกหรือประเภทเพื่อแบ่งชุด');
 doc.setProperties({title:`${bundle.project.code} / A4 cutting schedule`,subject:'Draft / partial BS reference / NOT FOR CONSTRUCTION',author:bundle.project.titleBlock.drawnBy||'FORM'});
 return appendSourceSchedulePdf(doc.output('blob'),bundle,'A4');
}
