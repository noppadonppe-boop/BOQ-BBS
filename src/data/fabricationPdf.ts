import {drawingSummarySheets} from '../domain/drawingViews';
import {drawHelix} from './helixPdf';
import {helixDrawing} from '../domain/helixDrawing';
import {ownerFrame,ownerOutput} from './ownerDrawingPdf';
import type {jsPDF as Pdf} from 'jspdf';
import type {Member} from '../domain/model';
import {barEnvelope,envelopeSketch,FABRICATION_LAYOUT} from '../domain/barEnvelope';
import {bsEnabled,bsProfile,BS2000} from '../domain/bs8666';
import {Bundle,font,label,ordered,frozenTakeoff,drawProjection} from './exports';
const fmt=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:3});
function fit(doc:Pdf,text:string,x:number,y:number,w:number,h:number,size=9){
 for(let fs=size;fs>=5.5;fs-=.25){doc.setFontSize(fs);const lines=doc.splitTextToSize(text,w);if(lines.length*fs*.3528*1.13<=h){doc.text(lines,x,y,{lineHeightFactor:1.13});return;}}
 throw Error('ข้อความในแบบผิวเหล็กยาวเกินพื้นที่ ให้ย่อข้อความหรือแบ่งชุดส่งออก');
}
export function frame(doc:Pdf,b:Bundle,m:Member,size:'A3'|'A1',sheet:number,total:number,title:string,layout:string=FABRICATION_LAYOUT){
 const w=size==='A3'?420:841,h=size==='A3'?297:594,ty=h-42;
 doc.setDrawColor(44,72,65);doc.setLineWidth(.35);doc.rect(10,10,w-20,h-20);doc.setTextColor(34,59,66);
 fit(doc,`${m.code} / ${title}`,18,23,w-36,8,15);
 fit(doc,`${label(b)} / ${b.project.code} / Layout ${layout}`,18,32,w-36,5,8);
 fit(doc,`${m.bars.some(r=>r.shape==='helix')?'Code77: A outside diameter / B pitch in mm / C turns; Code67: A arc / R inside':m.bars.some(r=>r.shape==='arc')?'Dimensions in mm / Code 67: A centreline arc, R inside':'Outside dimensions in mm'} / NTS / ${bsEnabled(b.project.spec)?bsProfile(b.project.spec).version:'Project policy / BS checks inactive'}`,18,39,w-36,4,7);
 if(ownerFrame(doc,b,m,title,ty))return;doc.rect(10,ty,w-20,32);doc.line(w*.48,ty,w*.48,h-10);doc.line(w*.75,ty,w*.75,h-10);
 fit(doc,`${b.project.titleBlock.company||b.project.owner}\n${b.project.name}\n${b.project.location}`,18,ty+6,w*.45-20,24,8);
 fit(doc,`Drawing: ${b.project.titleBlock.drawingPrefix}-${m.code}-F${String(sheet).padStart(2,'0')}\nBy: ${b.project.titleBlock.drawnBy} / Check: ${b.project.titleBlock.checkedBy}\nRev: ${b.revisionNumber||'D'+b.version} / ${b.createdAt.slice(0,10)}`,w*.48+8,ty+6,w*.25-16,24,8);
 fit(doc,`Sheet ${sheet}/${total} / ${size}\nMember qty: ${m.occurrences.reduce((n,o)=>n+o.quantity,0)}\nDraft / engineering release pending`,w*.75+8,ty+6,w*.25-18,24,8);
}
export function drawEnvelope(doc:Pdf,e:Extract<ReturnType<typeof barEnvelope>,{available:true}>,x:number,y:number,w:number,h:number){
 const s=envelopeSketch(e),ratio=Math.min(w/s.width,h/s.height),at=(p:number[])=>[x+(w-s.width*ratio)/2+p[0]*ratio,y+(h-s.height*ratio)/2+p[1]*ratio];
 const line=(a:number[],b:number[])=>{const p=at(a),q=at(b);doc.line(p[0],p[1],q[0],q[1]);};
 doc.setDrawColor(31,117,88);doc.setLineWidth(.25);for(let i=1;i<s.outline.length;i++)line(s.outline[i-1],s.outline[i]);
 doc.setDrawColor(146,165,158);doc.setLineWidth(.1);doc.setLineDashPattern([1,1],0);for(let i=1;i<s.centerline.length;i++)line(s.centerline[i-1],s.centerline[i]);doc.setLineDashPattern([],0);
 doc.setFontSize(Math.min(12,Math.max(8,12*ratio/.3528)));doc.setTextColor(33,76,60);
 for(const d of s.dimensions){doc.setDrawColor(135,158,148);doc.setLineWidth(.12);line(d.from,d.a);line(d.to,d.b);doc.setDrawColor(51,84,71);doc.setLineWidth(.18);if(d.arcPoints){for(let i=1;i<d.arcPoints.length;i++)line(d.arcPoints[i-1],d.arcPoints[i]);}else line(d.a,d.b);for(const p of [d.a,d.b])line([p[0]-3,p[1]+3],[p[0]+3,p[1]-3]);const p=at(d.labelAt);
  // jsPDF's align:center subtracts an unrotated X offset even for 90-degree text.
  // Place the baseline explicitly so vertical labels stay beside the dimension line.
  if(d.u){const tw=doc.getTextWidth(d.text),th=doc.getFontSize()*.3528;doc.setFillColor(255,255,255);doc.rect(p[0]-tw/2-1,p[1]-th*.85,tw+2,th*1.2,'F');}
  if(d.angle)doc.text(d.text,p[0],p[1]+doc.getTextWidth(d.text)/2,{angle:90});else doc.text(d.text,p[0],p[1],{align:'center'});
 }
 if(s.radius){doc.setDrawColor(125,150,140);doc.setLineWidth(.12);doc.setLineDashPattern([1,1],0);line(s.radius.center,s.radius.surface);doc.setLineDashPattern([],0);line(s.radius.surface,[s.radius.labelAt[0]-8,s.radius.labelAt[1]-4]);const p=at(s.radius.labelAt);if(s.dimensions.some(d=>d.u)||e.assessment.semicircle||e.assessment.arc){const th=doc.getFontSize()*.3528;doc.setFillColor(255,255,255);doc.rect(p[0]-.7,p[1]-th*.85,doc.getTextWidth(s.radius.text)+1.4,th*1.2,'F');}doc.text(s.radius.text,p[0],p[1]);}
}
export async function fabricationPdf(b:Bundle,size:'A3'|'A1'):Promise<Blob>{
 const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:size.toLowerCase()});await font(doc);
 const w=size==='A3'?420:841,h=size==='A3'?297:594,perSummary=size==='A3'?4:10;
 const entries=ordered(b).map(m=>({m,rows:frozenTakeoff(m,b).rows})),count=entries.reduce((n,e)=>n+drawingSummarySheets(e.m,e.rows.length,perSummary).length+e.rows.length,0);
 if(count>500)throw Error('แบบผิวเหล็กเกิน 500 แผ่น เลือกสมาชิกหรือประเภทเพื่อแบ่งชุด');
 let page=0;
 for(const {m,rows} of entries){const viewSheets=drawingSummarySheets(m,rows.length,perSummary),summary=viewSheets.length,total=summary+rows.length,quantity=m.occurrences.reduce((n,o)=>n+o.quantity,0);let sheet=0;
  const next=(title:string)=>{if(page++)doc.addPage();frame(doc,b,m,size,++sheet,total,title);};
  for(let i=0;i<summary;i++){
   next('Placement / bar schedule');const part=rows.slice(viewSheets[i].offset,viewSheets[i].offset+perSummary),modelH=h*.32;
   drawProjection(doc,m,b,[0,1],{x:22,y:50,w:(w-44)/2,h:modelH},viewSheets[i].offset,perSummary,true,viewSheets[i].section);
   drawProjection(doc,m,b,[0,2],{x:w/2+8,y:50,w:(w-44)/2,h:modelH},viewSheets[i].offset,perSummary,true,viewSheets[i].section);
   autoTable(doc,{startY:50+modelH+14,margin:{left:18,right:18,bottom:65},head:[['Mark','Code','Dia / Grade','Each','Total','Cut mm','Weight kg','Outside detail']],body:part.map((r,j)=>[r.mark,r.shapeCode||'PENDING',`${r.diameter} / ${r.grade}`,r.count,r.count*quantity,fmt(r.cutLength),fmt(r.weight*quantity),`F${String(summary+viewSheets[i].offset+j+1).padStart(2,'0')}`]),styles:{font:'Sarabun',fontStyle:'normal',fontSize:9,cellPadding:2,minCellHeight:9},headStyles:{fillColor:[32,57,64],fontStyle:'normal'}});
   fit(doc,'Actual section at saved axis/position. Bars outside this plane are not shown in section. Detail sheets use the first bar geometry.',18,h-59,w-36,5,8);
  }
  for(const r of rows){
   next(`${r.mark} / ${r.shape==='helix'?'Uniform helix detail':r.shape==='arc'?'Curved bar detail':'Outside bar detail'} / code ${r.shapeCode||'PENDING'}`);
   const e=barEnvelope(m,r,b.project.spec),a=r.standard,helix=r.shape==='helix'?helixDrawing(r):undefined;
   fit(doc,`Mark ${r.mark} / ${r.grade} / nominal d ${r.diameter} / outside diameter ${a.outsideDiameter} mm / ${r.count} each / ${r.count*quantity} total`,18,46,w-36,5,9);
   if(helix?.available)drawHelix(doc,r,18,50,w-36,h-183);else if(e.available)drawEnvelope(doc,e,18,50,w-36,h-183);
   else {doc.setFillColor(255,244,224);doc.rect(18,55,w-36,h-198,'F');fit(doc,'OUTSIDE DETAIL PENDING\n'+e.reason+'\nUnsupported shapes: use the centerline detail/coordinate export and project detailing review.',25,70,w-50,h-240,11);}
   const dims=a.dimensions.map(d=>`${d.free?'('+d.label+')':d.label} = ${fmt(d.value)}${d.unit==='turns'?' turns':''}`).join(' / ')||'Outside dimensions: not implemented';
   fit(doc,`${dims} / ${a.hasBends?'inner r = '+fmt(a.innerRadius)+' / centerline R = '+fmt(r.radius)+' mm':'Straight / no bend radius'}`,18,h-121,w-36,6,10);
   fit(doc,`BS formula: ${a.formula||'UNSUPPORTED'}${a.formula?' = '+fmt(a.formulaLength!)+' mm':''}${r.shapeCode.trim()==='12'?' / formula R = inside '+fmt(a.innerRadius)+' mm':''}`,18,h-104,w-36,6,10);
   fit(doc,`Cut used by BOQ: ${fmt(r.cutLength)} mm / ${r.lengthBasis} / round up ${b.project.spec.rounding} mm / exact centerline ${fmt(r.geometricLength)} mm`,18,h-97,w-36,5,9);
   if(a.oblique){const o=a.oblique;fit(doc,`Note 1: bend angles ${o.anglesDegrees.map(v=>fmt(v)+' deg').join(' / ')} / Table equation ${o.tableFormula} = ${fmt(o.approximateLength)} mm / exact centerline ${fmt(o.exactLength)} mm / ${o.exactRequired?'over 45 deg: exact selected':'45 deg or less: approximate selected'}`,18,h-91,w-36,4,7);}
   if(a.helix)fit(doc,`Code77: Table1 ${fmt(a.helix.approximateLength)} / exact ${fmt(a.helix.exactLength)} mm / ${a.helix.exactRequired?'B > A/5: exact selected':'B <= A/5: Table1 selected'} / ${a.helix.handedness} / H01 continuous helix.`,18,h-91,w-36,4,7);
   if(a.arc)fit(doc,`Code 67: A = analytic centreline arc length / inside R / sweep ${fmt(a.arc.sweepDegrees)} deg / Table 5: ${a.arc.supply.method} / radius leader shortened, NTS.`,18,h-91,w-36,4,7);
   if(a.semicircle)fit(doc,'Code 13: one continuous 180 deg semicircle / two tangent quarter arcs share one centre / Table 1 Note 2: large curves require fabrication review.',18,h-91,w-36,4,7);
   const checks=[...r.errors,...a.problems,...(!bsEnabled(b.project.spec)?['Minimum BS checks inactive']:[]),...(!r.placementConfirmed?['Placement not confirmed']:[]),...(!e.available&&!helix?.available?[e.reason]:[])];
   const status=checks.length?'PENDING: '+[...new Set(checks)].join(' | '):'PASS for implemented checks only; full BS/ACI / tolerances / engineering fabrication approval pending.';
   const refs=Object.entries(r.dimensions||{}).map(([k,v])=>`${k}=${fmt(v)}`).join('; ');
   doc.setTextColor(checks.length?149:30,checks.length?92:115,checks.length?30:82);
   fit(doc,status+'\nNote: '+(r.note||'None')+(a.oblique?'\nTable 1 Note 1: approaching 90 deg, consider Code 99 with all dimensions.':'')+(a.oblique&&r.shapeCode.trim()==='25'?' If E is critical, use Code 99; A or B must be free.':'')+(refs?'\nDrawing reference dimensions (not the cut basis): '+refs:''),18,h-86,w-36,29,8);
   doc.setTextColor(61,86,77);fit(doc,`NTS / parentheses = standard free dimension / square cut ends / Source ${BS2000.edition} Table 1 / SHA256 ${BS2000.sha256}`,18,h-49,w-36,4,6.5);
  }
 }
 if(!entries.length){doc.setFontSize(14);doc.text('No members in selected scope',20,30);}return ownerOutput(doc);
}
