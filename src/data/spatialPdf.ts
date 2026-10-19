import {drawingSummarySheets} from '../domain/drawingViews';
import {ownerFrame,ownerOutput} from './ownerDrawingPdf';
import type {jsPDF as Pdf} from 'jspdf';
import {spatialBar,spatialSketch,SPATIAL_LAYOUT,SpatialBar} from '../domain/spatialBar';
import {barEnvelope} from '../domain/barEnvelope';
import {frame,drawEnvelope} from './fabricationPdf';
import {Bundle,font,ordered,frozenTakeoff,drawProjection} from './exports';
import {BS2000} from '../domain/bs8666';
import {spatialDimensionSketch} from '../domain/spatialDimensions';
import {dimensionProjection} from '../domain/dimensionProjection';
const fmt=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:3});
const xyz=(p:number[])=>p.map(fmt).join(' / ');
function fit(doc:Pdf,text:string,x:number,y:number,w:number,h:number,size=9){
 for(let fs=size;fs>=5.5;fs-=.25){doc.setFontSize(fs);const lines=doc.splitTextToSize(text,w);if(lines.length*fs*.3528*1.13<=h){doc.text(lines,x,y,{lineHeightFactor:1.13});return;}}
 throw Error('ข้อความในแบบ Isometric ยาวเกินพื้นที่ แบ่งชุดหรือย่อข้อความก่อนส่งออก');
}
function drawSpatial(doc:Pdf,e:SpatialBar,part:number,x:number,y:number,w:number,h:number){
 const s=spatialSketch(e,part),ratio=Math.min(w/s.width,h/s.height),at=(p:number[])=>[x+(w-s.width*ratio)/2+p[0]*ratio,y+(h-s.height*ratio)/2+p[1]*ratio];
 const line=(a:number[],b:number[])=>{const p=at(a),q=at(b);doc.line(p[0],p[1],q[0],q[1]);};
 doc.setDrawColor(31,117,88);doc.setLineWidth(.25);for(const edge of [...s.edges,...s.caps])for(let i=1;i<edge.length;i++)line(edge[i-1],edge[i]);
 doc.setDrawColor(146,165,158);doc.setLineWidth(.1);doc.setLineDashPattern([1,1],0);for(let i=1;i<s.centerline.length;i++)line(s.centerline[i-1],s.centerline[i]);
 doc.setDrawColor(188,199,193);doc.setLineDashPattern([2,2],0);for(let i=1;i<s.virtual.length;i++)line(s.virtual[i-1],s.virtual[i]);doc.setLineDashPattern([],0);
 doc.setTextColor(33,76,60);doc.setFontSize(7);for(const l of s.labels){doc.setDrawColor(135,158,148);line(l.anchor,l.at);const p=at(l.at),tw=doc.getTextWidth(l.text);doc.setFillColor(255,255,255);doc.rect(p[0]-tw/2-.5,p[1]-2.5,tw+1,3.5,'F');doc.text(l.text,p[0],p[1],{align:'center'});}
 doc.setDrawColor(69,116,165);for(const a of s.axes){line(a.from,a.to);const p=at(a.to);doc.text(a.label,p[0],p[1]-1);}
}
function drawMeasurements(doc:Pdf,m:Bundle['members'][number],r:Bundle['members'][number]['bars'][number],part:number,perPage:number,x:number,y:number,w:number,h:number,projected=false){
 const e=projected?dimensionProjection(m,r,part,perPage):spatialDimensionSketch(m,r,part,perPage);if(!e.available)return;
 const s=e.s,ratio=Math.min(w/s.width,h/s.height),at=(p:number[])=>[x+(w-s.width*ratio)/2+p[0]*ratio,y+(h-s.height*ratio)/2+p[1]*ratio];
 const line=(a:number[],b:number[])=>{const p=at(a),q=at(b);doc.line(p[0],p[1],q[0],q[1]);};
 doc.setDrawColor(31,117,88);doc.setLineWidth(.25);for(const edge of [...s.edges,...s.caps])for(let i=1;i<edge.length;i++)line(edge[i-1],edge[i]);
 if(projected){if('centerlineOnly' in e&&e.centerlineOnly)for(let i=1;i<s.centerline.length;i++)line(s.centerline[i-1],s.centerline[i]);doc.setDrawColor(69,116,165);doc.setFontSize(7);for(const a of s.axes){if(Math.hypot(a.to[0]-a.from[0],a.to[1]-a.from[1])<1)continue;line(a.from,a.to);const q=at(a.to);doc.text('+'+a.label,q[0],q[1]-1);}}
 for(const [i,d] of e.dimensions.entries()){
  doc.setDrawColor(173,100,27);line(d.from,d.witness);doc.setLineDashPattern([1,1],0);line(d.witness,d.to);doc.setLineDashPattern([],0);
  for(const p of [d.from,d.to]){const q=at(p);doc.circle(q[0],q[1],.7,'S');}
  const label=[540,28+i*24],mid=d.from.map((v,k)=>(v+d.witness[k])/2);line(mid,label);const q=at(label);
  const text=`${d.text} mm / ${d.axis==='distance'?'3D':d.axis}`;doc.setFontSize(7);doc.setTextColor(137,82,19);doc.setFillColor(255,255,255);doc.rect(q[0]-1,q[1]-3,doc.getTextWidth(text)+2,4,'F');doc.text(text,q[0],q[1]);
  if(projected&&'status' in d){for(const [k,p] of [d.from,d.to].entries()){line(p,[534,205+i*32+k*13]);const q=at([540,208+i*32+k*13]);doc.setFontSize(6);const text=`${d.label}${k+1} ${k?'end':'start'} / ${d.status}${'endpointOverlap' in d&&d.endpointOverlap?' / OVERLAP':''}`;doc.setFillColor(255,255,255);doc.rect(q[0]-1,q[1]-2,doc.getTextWidth(text)+2,3,'F');doc.text(text,q[0],q[1]);}}
 }
}
export async function spatialPdf(b:Bundle,size:'A3'|'A1',measured=false,projected=false):Promise<Blob>{
 const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:size.toLowerCase()});await font(doc);
 const w=size==='A3'?420:841,h=size==='A3'?297:594,perSummary=size==='A3'?4:10,perBend=size==='A3'?4:8,perDimension=size==='A3'?3:6;
 const entries=ordered(b).map(m=>({m,rows:frozenTakeoff(m,b).rows.map(r=>({r,e:spatialBar(m,r)}))}));
 const pages=(e:ReturnType<typeof spatialBar>,r:Bundle['members'][number]['bars'][number])=>(e.available?Math.ceil(e.detail.legs.length/6)+1+Math.ceil(e.bends.length/perBend):1)+(measured&&e.available?Math.ceil((r.spatialDimensions?.length||0)/perDimension):0);
 const count=entries.reduce((n,e)=>n+drawingSummarySheets(e.m,e.rows.length,perSummary).length+e.rows.reduce((v,p)=>v+pages(p.e,p.r),0),0);if(count>500)throw Error('แบบ Isometric เกิน 500 แผ่น เลือกสมาชิกหรือประเภทเพื่อแบ่งชุด');
 let page=0;
 for(const {m,rows} of entries){
  const viewSheets=drawingSummarySheets(m,rows.length,perSummary),summaries=viewSheets.length,total=summaries+rows.reduce((n,p)=>n+pages(p.e,p.r),0),quantity=m.occurrences.reduce((n,o)=>n+o.quantity,0);let sheet=0,reference=summaries+1;
  const refs=rows.map(p=>{const n=reference;reference+=pages(p.e,p.r);return 'F'+String(n).padStart(2,'0');});
  const next=(title:string)=>{if(page++)doc.addPage();frame(doc,b,m,size,++sheet,total,title,projected?'projections-v8':measured?'measurements-v7':SPATIAL_LAYOUT);doc.setFillColor(255,255,255);doc.rect(17,35,w-34,8,'F');doc.setTextColor(34,59,66);fit(doc,'Isometric view / coordinates and tangent lengths in mm / outside bending dimensions PENDING / '+BS2000.edition,18,39,w-36,4,7);};
  const table=(startY:number,head:string[],body:(string|number)[][],bottom=65)=>autoTable(doc,{startY,margin:{left:18,right:18,bottom},head:[head],body,styles:{font:'Sarabun',fontStyle:'normal',fontSize:8,cellPadding:1.5},headStyles:{fillColor:[32,57,64],fontStyle:'normal'}});
  for(let i=0;i<summaries;i++){
   next('Placement / Isometric view schedule');const modelH=h*.32;
   drawProjection(doc,m,b,[0,1],{x:22,y:50,w:(w-44)/2,h:modelH},viewSheets[i].offset,perSummary,true,viewSheets[i].section);drawProjection(doc,m,b,[0,2],{x:w/2+8,y:50,w:(w-44)/2,h:modelH},viewSheets[i].offset,perSummary,true,viewSheets[i].section);
   table(50+modelH+14,['Mark','Code / View','Dia / Grade','Each','Total','Cut mm','Detail'],rows.slice(viewSheets[i].offset,viewSheets[i].offset+perSummary).map(({r,e},j)=>[r.mark,`${r.shapeCode} / ${e.available?'Isometric view':'PENDING'}`,`${r.diameter} / ${r.grade}`,r.count,r.count*quantity,fmt(r.cutLength),refs[viewSheets[i].offset+j]]));
   fit(doc,'Actual section at saved axis/position / detail shows first bar / Isometric view / NTS / BS 8.5 outside and free bending dimensions remain PENDING.',18,h-59,w-36,6,8);
  }
  for(const {r,e} of rows){
   const basis=`Cut used by BOQ: ${fmt(r.cutLength)} mm / ${r.lengthBasis} / exact centerline ${fmt(r.geometricLength)} mm / round up ${b.project.spec.rounding} mm / ${r.count*quantity} total`,parts=e.available?Math.ceil(e.detail.legs.length/6):1;
   for(let part=0;part<parts;part++){
    next(`${r.mark} / ${e.available?'Isometric view':r.shapeCode.trim()==='99'?'Isometric pending':'Standard outside detail'} / part ${part+1}/${parts}`);fit(doc,`Mark ${r.mark} / ${r.grade} / nominal d ${r.diameter} / outside diameter ${r.outsideDiameter??r.diameter} mm`,18,46,w-36,5,9);
    if(e.available){
     drawSpatial(doc,e,part,18,50,w-36,h-210);fit(doc,basis,18,h-163,w-36,7,9);
     table(h-150,['Virtual leg (NOT outside dimension)','Virtual length mm','Straight tangent mm','Start / end trim mm'],e.detail.legs.slice(part*6,part*6+6).map(l=>[l.label,fmt(l.virtualLength),fmt(l.straightLength),`${fmt(l.trimStart)} / ${fmt(l.trimEnd)}`]),82);
     doc.setTextColor(149,92,30);fit(doc,`Outside and free bending dimensions: PENDING / selected virtual reference leg: ${e.selectedLeg||'NONE'}\nInside r ${fmt(e.innerRadius)} / centerline R ${fmt(r.radius)} mm / circular projected surface edges / rear edges not hidden\nNo tolerance adjustment / BS, ACI, fabrication separation and engineering approval pending.`,18,h-76,w-36,20,8);
    }else{
     const env=barEnvelope(m,r,b.project.spec);if(r.shapeCode.trim()!=='99'&&env.available)drawEnvelope(doc,env,18,50,w-36,h-210);else{doc.setFillColor(255,244,224);doc.rect(18,55,w-36,h-221,'F');fit(doc,'ISOMETRIC DETAIL PENDING\n'+e.reason+'\nPlanar and single acute details are available in their separate drawing layouts.',25,70,w-50,h-245,11);}
     fit(doc,basis,18,h-163,w-36,8,9);fit(doc,'PENDING / '+r.standard.problems.join(' | ')+'\nNote: '+(r.note||'None'),18,h-141,w-36,63,8);
    }
    doc.setTextColor(61,86,77);fit(doc,'Isometric view / NTS / BS 8666:2000 clauses 8.6, 8.8 / coordinates define bend orientation / full conformity pending',18,h-49,w-36,4,6.5);
   }
   if(!e.available)continue;
   next(`${r.mark} / Coordinates and length basis`);
   table(46,['Virtual centerline intersection','Member X mm','Y mm','Z mm'],e.detail.points.map((p,i)=>['P'+String(i).padStart(2,'0'),...p.map(fmt)]),125);
   fit(doc,basis,18,h-125,w-36,8,9);const refs=Object.entries(r.dimensions||{}).map(([k,v])=>`${k}=${fmt(v)}`).join('; ');
   fit(doc,`Straight sum ${fmt(e.detail.straightSum)} + centerline arc sum ${fmt(e.detail.arcSum)} = ${fmt(e.detail.geometricLength)} mm\nP are virtual centerline intersections, NOT bend tangent points. Outside and free bending dimensions: PENDING.\nNote: ${r.note||'None'}${refs?'\nIndependent drawing references (not the cut basis): '+refs:''}`,18,h-109,w-36,49,8);
   fit(doc,`Isometric view / source SHA256 ${BS2000.sha256}`,18,h-49,w-36,4,6.5);
   for(let i=0;i<Math.ceil(e.bends.length/perBend);i++){
    next(`${r.mark} / Bend tangent coordinates / part ${i+1}/${Math.ceil(e.bends.length/perBend)}`);
    table(46,['Bend / vertex','Deflection / inner r / R mm','Incoming tangent X/Y/Z','Outgoing tangent X/Y/Z','Arc center X/Y/Z','Unit normal X/Y/Z','Arc mm'],e.bends.slice(i*perBend,i*perBend+perBend).map(t=>[`${t.label} / P${String(t.point).padStart(2,'0')}`,`${fmt(t.angle)} deg\n${fmt(e.innerRadius)} / ${fmt(r.radius)}`,xyz(t.incoming),xyz(t.outgoing),xyz(t.center),xyz(t.normal),fmt(t.arc)]),98);
    fit(doc,`Member coordinates in mm / traverse P00 to last point / bend plane normal = incoming direction cross outgoing direction\nIncoming/outgoing coordinates are actual CENTERLINE tangent points, not outer surface intersections.\nCenterline R ${fmt(r.radius)} / inside r ${fmt(e.innerRadius)} mm. Angles supplement coordinates; do not specify bends by angle alone.`,18,h-94,w-36,25,9);
    fit(doc,'Isometric view / BS 8.6, 8.8 / no machine bending instruction / outside dimensions and engineering release PENDING',18,h-49,w-36,4,6.5);
   }
   if(measured)for(let part=0;part<Math.ceil((r.spatialDimensions?.length||0)/perDimension);part++){
    const ds=r.spatialDimensions!.slice(part*perDimension,part*perDimension+perDimension),sketch=projected?dimensionProjection(m,r,part,perDimension):spatialDimensionSketch(m,r,part,perDimension);
    next(`${r.mark} / Proposed dimension references / part ${part+1}/${Math.ceil(r.spatialDimensions!.length/perDimension)}`);
    fit(doc,projected?`Reference view: ${r.dimensionView||'isometric'} / ${r.dimensionView&&r.dimensionView!=='isometric'?'CENTERLINE PROJECTION ONLY':'Isometric view'} / endpoints A1=start, A2=end; likewise each label / NTS`:'Explicit member-coordinate endpoints / actual measurement in mm / NOT automatic BS outside dimensions',18,46,w-36,5,9);
    if(!sketch.available)throw Error(sketch.reason);
    drawMeasurements(doc,m,r,part,perDimension,18,50,w-36,h-220,projected);fit(doc,basis,18,h-169,w-36,7,8);
    table(h-156,['Dimension / mm',projected?'Measure / visibility':'Measure','From X/Y/Z mm','To X/Y/Z mm','Purpose / source (user supplied)'],sketch.dimensions.map(d=>[d.text,(d.axis==='distance'?'Straight 3D':`Abs delta ${d.axis}`)+(projected&&'status' in d?`\n${d.status}${'endpointOverlap' in d&&d.endpointOverlap?' / OVERLAP':''}`:''),xyz(ds.find(v=>v.label===d.label)!.from),xyz(ds.find(v=>v.label===d.label)!.to),`${d.purpose==='outside-proposed'?'Outside proposal / UNVERIFIED':'Reference only'}\n${d.source||'Source not specified'}`]),85);
    fit(doc,projected?'EDGE-ON: dimension vector is along view. FORESHORTENED: projected ratio <5%. OVERLAP: distinct endpoints coincide in image.\nSwitch view and inspect XYZ coordinates; true measured mm is never the screen distance. Orthographic reference aids are NOT a first-angle arrangement.\nParentheses are a proposed free dimension; no tolerance or cut adjustment. Surface location and BS/ACI/engineering approval PENDING.':'Parentheses indicate the user-proposed free dimension ONLY. No tolerance adjustment.\nEndpoints and their surface location are unverified; coordinate changes do not update the cut length.\nInspect the source drawing, projected surface intersections, BS/ACI and project rules before acceptance.',18,h-76,w-36,22,8);
    fit(doc,projected?'Isometric view pages retained / projections-v8 reference aid / UNVERIFIED / NOT FOR CONSTRUCTION':'Isometric view / measurement-v7 references / outside/free dimension approval PENDING / NOT FOR CONSTRUCTION',18,h-49,w-36,4,6.5);
   }
  }
 }
 if(!entries.length)doc.text('No members in selected scope',20,30);return ownerOutput(doc);
}
