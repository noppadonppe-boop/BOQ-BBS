import {drawingSummarySheets} from '../domain/drawingViews';
import {ownerFrame,ownerOutput} from './ownerDrawingPdf';
import type {jsPDF as Pdf} from 'jspdf';
import {generalBar,generalSketch,GENERAL_LAYOUT,GeneralBar} from '../domain/generalBar';
import {barEnvelope} from '../domain/barEnvelope';
import {frame,drawEnvelope} from './fabricationPdf';
import {Bundle,font,ordered,frozenTakeoff,drawProjection} from './exports';
import {BS2000} from '../domain/bs8666';
import {specialBar,tangentSketch,TangentBar,TANGENT_LAYOUT} from '../domain/tangentBar';
const fmt=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:3});
function fit(doc:Pdf,text:string,x:number,y:number,w:number,h:number,size=9){
 for(let fs=size;fs>=5.5;fs-=.25){doc.setFontSize(fs);const lines=doc.splitTextToSize(text,w);if(lines.length*fs*.3528*1.13<=h){doc.text(lines,x,y,{lineHeightFactor:1.13});return;}}
 throw Error('ข้อความยาวเกินพื้นที่แบบรูปพิเศษ แบ่งชุดหรือย่อข้อความก่อนส่งออก');
}
function drawGeneral(doc:Pdf,e:GeneralBar|TangentBar,part:number,x:number,y:number,w:number,h:number){
 const acuteSketch='tangents' in e?tangentSketch(e,760,440,part):undefined,s=acuteSketch??generalSketch(e,part),ratio=Math.min(w/s.width,h/s.height),at=(p:number[])=>[x+(w-s.width*ratio)/2+p[0]*ratio,y+(h-s.height*ratio)/2+p[1]*ratio];
 const line=(a:number[],b:number[])=>{const p=at(a),q=at(b);doc.line(p[0],p[1],q[0],q[1]);};
 doc.setDrawColor(31,117,88);doc.setLineWidth(.25);for(let i=1;i<s.outline.length;i++)line(s.outline[i-1],s.outline[i]);
 doc.setDrawColor(146,165,158);doc.setLineWidth(.1);doc.setLineDashPattern([1,1],0);for(let i=1;i<s.centerline.length;i++)line(s.centerline[i-1],s.centerline[i]);doc.setLineDashPattern([],0);
 if(acuteSketch){doc.setDrawColor(69,116,165);doc.setLineWidth(.15);doc.setLineDashPattern([2,1],0);for(const t of acuteSketch.tangents){line(t.from,t.to);const p=at(t.touch);doc.circle(p[0],p[1],.5,'S');doc.setFontSize(6.5);doc.setTextColor(69,116,165);const tag=at(t.labelAt);doc.setLineDashPattern([],0);line(t.touch,[t.labelAt[0]-3,t.labelAt[1]-3]);doc.setFillColor(255,255,255);doc.rect(tag[0]-.4,tag[1]-2.4,5,3.2,'F');doc.text(t.label,tag[0],tag[1]);doc.setLineDashPattern([2,1],0);}doc.setLineDashPattern([],0);}
 doc.setFontSize(8);doc.setTextColor(33,76,60);
 for(const d of s.dimensions){doc.setDrawColor(135,158,148);doc.setLineWidth(.12);line(d.from,d.a);line(d.to,d.b);doc.setDrawColor(51,84,71);line(d.a,d.b);for(const p of [d.a,d.b])line([p[0]-3,p[1]+3],[p[0]+3,p[1]-3]);const p=at(d.labelAt),tw=doc.getTextWidth(d.text);doc.setFillColor(255,255,255);doc.rect(p[0]-tw/2-.5,p[1]-2.8,tw+1,3.8,'F');doc.text(d.text,p[0],p[1],{align:'center'});}
 doc.setFontSize(6.5);doc.setTextColor(99,117,108);for(const v of s.vertices){const p=at(v.at);doc.text(v.label,p[0]+1,p[1]-1);}
 if(acuteSketch){doc.setDrawColor(125,150,140);line(acuteSketch.radius.center,acuteSketch.radius.surface);line(acuteSketch.radius.surface,[acuteSketch.radius.labelAt[0]-5,acuteSketch.radius.labelAt[1]]);const p=at(acuteSketch.radius.labelAt);doc.setFontSize(8);doc.text(acuteSketch.radius.text,p[0],p[1]);}
}
export async function generalPdf(b:Bundle,size:'A3'|'A1',layout:typeof GENERAL_LAYOUT|typeof TANGENT_LAYOUT=GENERAL_LAYOUT):Promise<Blob>{
 const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:size.toLowerCase()});await font(doc);
 const w=size==='A3'?420:841,h=size==='A3'?297:594,perSummary=size==='A3'?4:10;
 const entries=ordered(b).map(m=>({m,rows:frozenTakeoff(m,b).rows.map(r=>({r,g:layout===TANGENT_LAYOUT?specialBar(m,r):generalBar(m,r)}))}));
 const pages=(g:ReturnType<typeof specialBar>)=>g.available?Math.ceil(g.dimensions.length/6)+1:1;
 const count=entries.reduce((n,e)=>n+drawingSummarySheets(e.m,e.rows.length,perSummary).length+e.rows.reduce((v,p)=>v+(p.r.shapeCode.trim()==='99'?pages(p.g):1),0),0);
 if(count>500)throw Error('แบบรูปพิเศษเกิน 500 แผ่น เลือกสมาชิกหรือประเภทเพื่อแบ่งชุด');
 let page=0;
 for(const {m,rows} of entries){
  const viewSheets=drawingSummarySheets(m,rows.length,perSummary),summaries=viewSheets.length,total=summaries+rows.reduce((v,p)=>v+(p.r.shapeCode.trim()==='99'?pages(p.g):1),0),quantity=m.occurrences.reduce((n,o)=>n+o.quantity,0);let sheet=0,reference=summaries+1;
  const refs=rows.map(p=>{const n=reference;reference+=p.r.shapeCode.trim()==='99'?pages(p.g):1;return 'F'+String(n).padStart(2,'0');});
  const next=(title:string)=>{if(page++)doc.addPage();frame(doc,b,m,size,++sheet,total,title,layout);};
  for(let i=0;i<summaries;i++){
   next('Placement / special bar schedule');const modelH=h*.32;
   drawProjection(doc,m,b,[0,1],{x:22,y:50,w:(w-44)/2,h:modelH},viewSheets[i].offset,perSummary,true,viewSheets[i].section);
   drawProjection(doc,m,b,[0,2],{x:w/2+8,y:50,w:(w-44)/2,h:modelH},viewSheets[i].offset,perSummary,true,viewSheets[i].section);
   autoTable(doc,{startY:50+modelH+14,margin:{left:18,right:18,bottom:65},head:[['Mark','Code','Dia / Grade','Each','Total','Cut mm','Detail']],body:rows.slice(viewSheets[i].offset,viewSheets[i].offset+perSummary).map(({r},j)=>[r.mark,r.shapeCode,`${r.diameter} / ${r.grade}`,r.count,r.count*quantity,fmt(r.cutLength),refs[viewSheets[i].offset+j]]),styles:{font:'Sarabun',fontStyle:'normal',fontSize:9,cellPadding:2,minCellHeight:9},headStyles:{fillColor:[32,57,64],fontStyle:'normal'}});
   fit(doc,'Actual section at saved axis/position / detail shows first bar / NTS / Code 99 engineering review pending.',18,h-59,w-36,5,8);
  }
  for(const {r,g} of rows){
   const special=r.shapeCode.trim()==='99',parts=special&&g.available?Math.ceil(g.dimensions.length/6):1;
   const basis=`Cut used by BOQ: ${fmt(r.cutLength)} mm / ${r.lengthBasis} / exact centerline ${fmt(r.geometricLength)} mm / round up ${b.project.spec.rounding} mm / ${r.count*quantity} total`;
   for(let part=0;part<parts;part++){
    next(`${r.mark} / ${special?'Code 99 outside detail':'Standard outside detail'} / part ${part+1}/${parts}`);
    fit(doc,`Mark ${r.mark} / ${r.grade} / nominal d ${r.diameter} / outside diameter ${r.outsideDiameter??r.diameter} mm`,18,46,w-36,5,9);
    if(special&&g.available){
     drawGeneral(doc,g,part,18,50,w-36,h-203);
     fit(doc,basis,18,h-157,w-36,6,9);
     const values=g.dimensions.slice(part*6,part*6+6);
     const acute='tangents' in g;
     autoTable(doc,{startY:h-145,margin:{left:18,right:18,bottom:78},head:[['chain' in g?'Declared support / outside mm':acute?'Figure 4 outside dimension mm':'Projected outside dimension mm','Straight tangent mm','Bend / deflection degrees','Inner r / centerline R mm']],body:values.map(d=>{const chain='chain' in g,i=acute&&!chain?(d.label==='C'?0:d.label==='A'?1:-1):g.dimensions.indexOf(d),bend=acute&&!chain&&i>=0?g.angles[1]:g.angles[i+1];return [`${d.free?'('+d.label+')':d.label} = ${fmt(d.value)}`,i<0?'Overall height':fmt(g.detail.legs[i].straightLength),bend>1e-5?fmt(bend*180/Math.PI):'No bend',bend>1e-5?`${fmt(g.innerRadius)} / ${fmt(r.radius)}`:'No bend'];}),styles:{font:'Sarabun',fontStyle:'normal',fontSize:8,cellPadding:1.5},headStyles:{fillColor:[32,57,64],fontStyle:'normal'}});
     const free=g.dimensions.find(d=>d.free);
     doc.setTextColor(149,92,30);fit(doc,'PENDING / '+g.warnings.join(' | ')+'\nFree dimension: '+(free?`(${free.label})`:'NOT SELECTED')+' / No tolerance adjustment applied.',18,h-76,w-36,20,8);
    }else{
     const e=barEnvelope(m,r,b.project.spec);if(!special&&e.available)drawEnvelope(doc,e,18,50,w-36,h-203);
     else{doc.setFillColor(255,244,224);doc.rect(18,55,w-36,h-215,'F');fit(doc,'OUTSIDE DETAIL PENDING\n'+(special&&!g.available?g.reason:!e.available?e.reason:'Unresolved geometry')+'\nUse the centerline / coordinate detail for this case.',25,70,w-50,h-245,11);}
     fit(doc,basis,18,h-157,w-36,8,9);fit(doc,r.standard.formula?`BS formula: ${r.standard.formula} = ${fmt(r.standard.formulaLength!)} mm`:'No automatic BS formula for this geometry.',18,h-140,w-36,10,9);
     fit(doc,'PENDING / Engineering detailing review required.\n'+r.standard.problems.join(' | ')+'\nNote: '+(r.note||'None'),18,h-117,w-36,48,8);
    }
    doc.setTextColor(61,86,77);fit(doc,`NTS / ${'chain' in g?'Declared input plane before template/placement rotation / local circle supports at acute bends / outside intersections elsewhere':'tangents' in g?'Figure 4 p.10 / A=TA to end, C=end to TC, B=outside height':'projected outside intersections'} / square cut ends / ${BS2000.edition} / clauses 7.1, 8.5-8.7 / full conformity pending`,18,h-49,w-36,4,6.5);
   }
   if(special&&g.available){
    next(`${r.mark} / Coordinates and bending basis`);
    autoTable(doc,{startY:46,margin:{left:18,right:18,bottom:125},head:[['Virtual centerline intersection','Member X mm','Y mm','Z mm']],body:g.detail.points.map((p,i)=>['P'+String(i).padStart(2,'0'),...p.map(fmt)]),styles:{font:'Sarabun',fontStyle:'normal',fontSize:8,cellPadding:1.5},headStyles:{fillColor:[32,57,64],fontStyle:'normal'}});
    fit(doc,basis,18,h-125,w-36,8,9);
    const dimensions=g.dimensions.map(d=>`${d.free?'('+d.label+')':d.label}=${fmt(d.value)}`).join(' / '),refs=Object.entries(r.dimensions||{}).map(([k,v])=>`${k}=${fmt(v)}`).join('; ');
    fit(doc,`${'chain' in g?'Declared support / outside dimensions':'tangents' in g?'Figure 4 tangent dimensions':'Projected outside dimensions'}: ${dimensions}\nStraight sum ${fmt(g.detail.straightSum)} + centerline arc sum ${fmt(g.detail.arcSum)} = ${fmt(g.detail.geometricLength)} mm\nNote: ${r.note||'None'}${refs?'\nIndependent drawing references (not the cut basis): '+refs:''}`,18,h-109,w-36,49,8);
    fit(doc,`PENDING / coordinates are virtual centerline intersections, not tangent points / source SHA256 ${BS2000.sha256}`,18,h-49,w-36,4,6.5);
   }
  }
 }
 if(!entries.length)doc.text('No members in selected scope',20,30);return ownerOutput(doc);
}
