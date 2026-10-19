import {publicationLabel} from '../domain/publication';
import type {Code99Review} from '../domain/code99ReviewSchema';
import {helixDrawing} from '../domain/helixDrawing';
import {code99Print} from '../domain/code99Print';
import {code99Canvas} from './code99Canvas';
import type ExcelJS from 'exceljs';
import type {Member,SnapshotBundle} from '../domain/model';
import {labels} from '../domain/model';
import type {schedule} from '../domain/engine';
import {barEnvelope,envelopeSketch} from '../domain/barEnvelope';
import {barDetail,shapeSketch} from '../domain/barDetails';
import {spatialBar,spatialSketch} from '../domain/spatialBar';
import {scopeLabel} from '../domain/exportScope';
import {quantityReport} from '../domain/quantityReport';
import {steelCoverageLabels} from '../domain/reinforcementCoverage';
import {excelPageBreaks,excelSumParts} from '../domain/excelLayout';
import {bsToleranceReference,BS_TOLERANCE_REFERENCE} from '../domain/bsTolerances';
import {bsEnabled} from '../domain/bs8666';

export type PrintBar={member:Member;bar:ReturnType<typeof schedule>[number]&{code99Review?:Code99Review};sourceRow:number;quantity:number};
const ink='FF253A40',green='FF203940',soft='FFF1F5F3';
const link=(column:string,row:number,result:number)=>({formula:`'BBS'!${column}${row}`,result});
const fmt=(n:number)=>Number(n.toFixed(3)).toLocaleString('en-US',{maximumFractionDigits:3});
const widthPx=(width:number)=>Math.floor(width*7+5);
function numericFormat(sheet:ExcelJS.Worksheet,col:number,format:string){
 sheet.getColumn(col).numFmt=format;
 for(let row=5;row<=sheet.rowCount;row++){const cell=sheet.getCell(row,col),raw=cell.value,value=raw&&typeof raw==='object'&&'result' in raw?raw.result:raw;if(typeof value==='number'&&Math.abs(value)>=1e12)cell.numFmt='0.000E+00';}
}

function appearance(sheet:ExcelJS.Worksheet,headers:string[],widths:number[],bundle:SnapshotBundle,title:string,subtitle:string){
 sheet.addRows([[title],[`${bundle.project.code} · ${bundle.project.name}`],[`${publicationLabel(bundle)} · ${bundle.revisionNumber||'D'+bundle.version} · ${scopeLabel(bundle.scope,bundle.members)}\n${subtitle}`],headers]);
 sheet.columns=widths.map(width=>({width}));
 for(let row=1;row<=3;row++)sheet.mergeCells(row,1,row,widths.length);
 sheet.views=[{state:'frozen',ySplit:4,showGridLines:false}];
 sheet.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:false,scale:100,margins:{left:.4,right:.4,top:.4,bottom:.4,header:.15,footer:.15},printTitlesRow:'1:4',horizontalCentered:true};
 // Escape Excel header control characters in user-supplied project codes.
 sheet.headerFooter={oddHeader:'&L'+bundle.project.code.replaceAll('&','&&')+'&R'+sheet.name.replaceAll('&','&&'),oddFooter:'&L'+publicationLabel(bundle).replaceAll('&','&&')+'&C&A&RPage &P / &N'};
 const sizes=[30,30,48,34],span=widths.reduce((n,w)=>n+widthPx(w),0);
 for(const r of [2,3]){const lines=String(sheet.getCell(r,1).value).split('\n').reduce((n,text)=>n+Math.max(1,Math.ceil(text.length*12/span)),0);sizes[r-1]=Math.max(sizes[r-1],lines*15+6);}
 sheet.eachRow((row,i)=>{row.height=sizes[i-1];row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Sarabun',size:i===1?16:11,color:{argb:ink},bold:i===1||i===4};cell.alignment={vertical:'middle',wrapText:true,horizontal:i===4?'center':'left'};if(i===4)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE1ECE6'}};});});
}
function body(sheet:ExcelJS.Worksheet,row:ExcelJS.Row,height:number){
 row.height=height;row.eachCell({includeEmpty:true},cell=>{if(cell.value==='')cell.value=null;const result=cell.value&&typeof cell.value==='object'&&'result' in cell.value?cell.value.result:cell.value,numeric=typeof result==='number'||cell.type===6&&typeof result!=='string';cell.font={name:'Sarabun',size:11,color:{argb:ink}};cell.alignment={vertical:'middle',wrapText:true,horizontal:numeric?'right':'left',indent:!numeric&&Number(cell.col)>1?1:0};if(row.number%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:soft}};cell.border={bottom:{style:'hair',color:{argb:'FFDCE5E1'}}};});
}
function finish(sheet:ExcelJS.Worksheet,columns:number,dataHeights:number[],totals:(number|ExcelJS.CellFormulaValue|string|null)[],bundle:SnapshotBundle,totalHeight=28){
 const last=sheet.rowCount,total=sheet.addRow(totals);body(sheet,total,totalHeight);total.eachCell({includeEmpty:true},c=>{c.font={...c.font,bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE1ECE6'}};c.border={top:{style:'thin',color:{argb:green}}};});
 // A3 landscape: 841.89 pt minus margins, repeated titles and footer clearance.
 const header=[1,2,3,4].reduce((n,r)=>n+(sheet.getRow(r).height||20),0),budget=841.89-.8*72-header-24;
 for(const before of excelPageBreaks(dataHeights,budget,totalHeight))sheet.getRow(4+before).addPageBreak();
 sheet.pageSetup.printArea=`A1:${sheet.getColumn(columns).letter}${total.number}`;
 if(last>4)sheet.autoFilter={from:{row:4,column:1},to:{row:last,column:columns}};
 for(let i=5;i<=sheet.rowCount;i++)for(let col=1;col<=columns;col++){const c=sheet.getCell(i,col);if(typeof c.value==='number'||c.type===6)c.numFmt=Math.abs(Number(typeof c.value==='object'&&c.value?'result' in c.value?c.value.result:0:c.value))>=1e12?'0.000E+00':col<=3?'#,##0':'#,##0.000';}
}

// Each thumbnail is a reference to the first physical bar. Actual cuts and
// weights are linked from the original BBS rows; a thumbnail never recalculates them.
function thumbnail(item:PrintBar,bundle:SnapshotBundle){
 const special=item.bar.shapeCode.trim()==='99'?code99Print(item.member,item.bar):undefined;
 if(special?.available)return {base64:code99Canvas(special),envelope:barEnvelope(item.member,item.bar,bundle.project.spec)};
 const canvas=document.createElement('canvas');canvas.width=600;canvas.height=330;const c=canvas.getContext('2d');if(!c)throw Error('ไม่สามารถสร้างรูปเหล็กใน Excel ได้');
 c.fillStyle='#fff';c.fillRect(0,0,600,330);const envelope=barEnvelope(item.member,item.bar,bundle.project.spec);
 const line=(a:number[],b:number[])=>{c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();};
 if(item.bar.shape==='helix'){const s=helixDrawing(item.bar);if(s.available){const scale=Math.min(600/s.width,300/s.height),point=(p:number[])=>[p[0]*scale+(600-s.width*scale)/2,p[1]*scale+5];c.strokeStyle='#217558';c.lineWidth=2;s.paths.forEach(path=>{c.beginPath();path.forEach((p,i)=>{const at=point(p);if(i)c.lineTo(at[0],at[1]);else c.moveTo(at[0],at[1]);});c.stroke();});c.strokeStyle='#768e85';c.lineWidth=1;s.lines.forEach(([a,b])=>line(point(a),point(b)));c.fillStyle='#203940';c.font='13px Arial';c.textAlign='center';s.labels.forEach(l=>{const at=point(l.at);c.fillText(l.text,at[0],at[1]);});c.font='20px Arial';c.fillText('A/B mm · C turns · NTS',300,320);}else{c.fillStyle='#956026';c.font='24px Arial';c.fillText('HELIX DATA PENDING',140,160);}}else if(envelope.available){const s=envelopeSketch(envelope);c.strokeStyle='#217558';c.lineWidth=3;c.beginPath();s.outline.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();
  c.strokeStyle='#768e85';c.lineWidth=1.5;c.font='28px Arial';c.fillStyle='#203940';c.textAlign='center';c.textBaseline='middle';
  for(const d of s.dimensions){line(d.from,d.a);line(d.to,d.b);if(d.arcPoints){for(let i=1;i<d.arcPoints.length;i++)line(d.arcPoints[i-1],d.arcPoints[i]);}else line(d.a,d.b);for(const p of [d.a,d.b])line([p[0]-5,p[1]+5],[p[0]+5,p[1]-5]);const text=d.free?'('+d.label+')':d.label;c.save();c.translate(...d.labelAt);if(d.angle)c.rotate(-Math.PI/2);c.fillStyle='#fff';c.fillRect(-c.measureText(text).width/2-3,-17,c.measureText(text).width+6,34);c.fillStyle='#203940';c.fillText(text,0,0);c.restore();}
  if(s.radius){line(s.radius.center,s.radius.surface);c.textAlign='left';c.fillText(envelope.assessment.arc?'R':'r',s.radius.labelAt[0],s.radius.labelAt[1]);}
 }else{const detail=barDetail(item.member,item.bar),s=shapeSketch(detail,600,290),spatial=!s.planar?spatialBar(item.member,item.bar):undefined,iso=spatial?.available?spatialSketch(spatial,0,600,290):undefined;
  c.strokeStyle='#217558';c.lineWidth=4;c.beginPath();(iso?.centerline||s.path).forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();
  if(iso){c.strokeStyle='#768e85';c.lineWidth=2;c.font='24px Arial';c.fillStyle='#203940';for(const a of iso.axes){line(a.from,a.to);c.fillText(a.label,a.to[0],a.to[1]);}}
  c.fillStyle='#956026';c.textAlign='center';c.font='24px Arial';c.fillText(s.planar?'CENTERLINE REFERENCE':iso?'ISOMETRIC REFERENCE':'REFERENCE / CHECK 3D',300,310);}
 return {base64:canvas.toDataURL('image/png'),envelope};
}

export function steelPrintNote(report:ReturnType<typeof quantityReport>){return !report.memberCount?'ไม่มีสมาชิกในขอบเขตนี้':!report.quantityCoverage.complete?'จำนวน/มิติยังชั่วคราว น้ำหนัก BBS เป็นค่าคำนวณประกอบ ยอดพร้อมยังรอยืนยัน · ดู Quantity Basis / BOQ Coverage':report.coverage.complete?'ข้อมูลเหล็กครบตามที่กรอก · ดูที่มา/ขอบเขตที่ไม่มีเหล็กใน BOQ Coverage · ยังไม่รับรองวิศวกรรม':`ข้อมูลเหล็กยังไม่ครบ · ${report.coverage.pending.length} สมาชิก รอ BBS/เทียบแบบ · ตัวเลขเป็นเฉพาะรายการที่กรอก ไม่ใช่ยอดเหล็กครบ · ดู BOQ Coverage`;}
export function appendQuantityPrintSheets(wb:ExcelJS.Workbook,bundle:SnapshotBundle,items:PrintBar[]){
 const report=quantityReport(bundle),boq=wb.addWorksheet('BOQ Print'),rebar=wb.addWorksheet('Rebar Summary');
 const note=(report.quantityCoverage.complete?'':`ข้อมูลปริมาณยังชั่วคราว ${report.quantityCoverage.pending.length} สมาชิก · ช่องปริมาณพร้อมเป็นว่าง · ดู Quantity Basis\n`)+steelPrintNote(report),states=new Map(report.coverage.members.map(c=>['Member:'+JSON.stringify(c.memberId),c]));
 appearance(boq,['กลุ่ม / Group','ประเภท','จำนวน','คอนกรีต m³','แบบหล่อ m²','ขุด m³','ถม m³','หยาบ m³',report.quantityCoverage.complete?'เหล็กที่กรอก kg':'เหล็กคำนวณประกอบ kg',report.quantityCoverage.complete?'เหล็กครบตามข้อมูล kg':'เหล็กพร้อมตามข้อมูล kg','สถานะปริมาณ / เหล็ก'],[25,14,8,13,13,13,13,13,17,17,35],bundle,'BOQ สำหรับพิมพ์',`จัดกลุ่ม ${report.group} · ปริมาณตามตำแหน่งที่เลือก\n${note}`);
 // Narrow widths at100% preserve physical A3 in the verified native exporter. Keep coverage/status with its
 // quantities on one horizontal page; allow normal vertical pagination.
 boq.pageSetup.fitToPage=false;boq.pageSetup.scale=100;delete boq.pageSetup.fitToWidth;delete boq.pageSetup.fitToHeight;
 const boqHeights:number[]=[];
 report.rows.forEach((r,i)=>{const source=i+4,state=states.get(r.key),status=r.pendingQuantityMembers?`รอยืนยันปริมาณ ${r.pendingQuantityMembers} สมาชิก${r.pendingRebarMembers?' / รอ BBS '+r.pendingRebarMembers+' สมาชิก':''}`:r.pendingRebarMembers?`รอ BBS / เทียบแบบ · ${r.pendingRebarMembers} สมาชิก`:state?.state==='DeclaredZero'?steelCoverageLabels.DeclaredZero:'ครบตามข้อมูลที่กรอก',row=boq.addRow([{formula:`'BOQ Summary'!A${source}`,result:r.label+(r.unassigned?' (ไม่ระบุ)':'')},r.category?labels[r.category as keyof typeof labels]:'',...r.values.map((v,j)=>j!==6&&r.completeValues[j]===null?null:({formula:`'BOQ Summary'!${String.fromCharCode(67+j)}${source}`,result:v})),r.completeRebar===null?null:{formula:`'BOQ Summary'!K${source}`,result:r.completeRebar},status]);const height=Math.max(42,Math.ceil((r.label.length+12)*12/widthPx(25))*15+6,Math.ceil(status.length/26)*15+10);body(boq,row,height);boqHeights.push(height);});
 finish(boq,11,boqHeights,['TOTAL','',...report.totals.map((v,i)=>i!==6&&report.completeTotals[i]===null?null:report.rows.length?{formula:`SUM(${String.fromCharCode(67+i)}5:${String.fromCharCode(67+i)}${boq.rowCount})`,result:v}:0),!report.memberCount||report.completeRebar===null?null:{formula:`'BOQ Summary'!K${report.rows.length+4}`,result:report.completeRebar},!report.memberCount?'ไม่มีสมาชิกในขอบเขตนี้':!report.quantityCoverage.complete?'รอยืนยันข้อมูลปริมาณ':report.coverage.complete?'ครบตามข้อมูลที่กรอก':`รอ BBS / เทียบแบบ · ${report.coverage.pending.length} สมาชิก`],bundle,48);

 appearance(rebar,['ขนาด mm','เกรด','ชิ้นที่กรอก','ความยาวที่กรอก m','น้ำหนักที่กรอก kg'],[17,24,22,28,28],bundle,'สรุปเหล็กที่กรอกแยกขนาด',`จาก BBS · จำนวนต่อสมาชิก × จำนวนสมาชิกครั้งเดียว\n${note}`);
 const groups=report.rebar.map(r=>({...r,items:items.filter(i=>i.bar.diameter===r.diameter&&i.bar.grade===r.grade)})),helperStart=groups.length+9;
 let helperRow=helperStart;const helperValues:{row:number;values:(string|number|ExcelJS.CellFormulaValue)[]}[]=[],rebarHeights:number[]=[];
 groups.forEach(group=>{
  const pieces=group.pieces,length=group.items.reduce((n,i)=>n+i.bar.count*i.quantity*i.bar.cutLength/1000,0),weight=group.weight;
  const totals=[pieces,length,weight],sourceColumns=['K','L','M'],values=sourceColumns.map((column,j)=>{
   const parts=excelSumParts(group.items.map(i=>i.sourceRow),column);if(parts.length<=1)return {formula:parts[0]||'0',result:totals[j]};
   const rows:number[]=[];parts.forEach((formula,k)=>{const row=helperRow++;rows.push(row);const slice=group.items.filter(i=>{
    // The compact source ranges are disjoint. Determine the cached result from
    // the exact source references, including contiguous ranges.
    const ranges=[...formula.matchAll(/![KLM](\d+)(?::[KLM](\d+))?/g)];return ranges.some(r=>i.sourceRow>=Number(r[1])&&i.sourceRow<=Number(r[2]||r[1]));
   });const result=slice.reduce((n,i)=>n+(j===0?i.bar.count*i.quantity:j===1?i.bar.count*i.quantity*i.bar.cutLength/1000:i.bar.weight*i.quantity),0);helperValues.push({row,values:[group.diameter,group.grade,`Part ${k+1} / ${column}`,{formula,result}]});});
   return {formula:`SUM(D${rows[0]}:D${rows.at(-1)})`,result:totals[j]};
  });const row=rebar.addRow([group.diameter,group.grade,...values]),height=Math.max(30,Math.ceil(group.grade.length/17)*15+6);body(rebar,row,height);rebarHeights.push(height);
 });
 finish(rebar,5,rebarHeights,['TOTAL ENTERED','',...['C','D','E'].map((column,i)=>groups.length?{formula:`SUM(${column}5:${column}${rebar.rowCount})`,result:groups.reduce((n,g)=>n+(i===0?g.pieces:i===1?g.items.reduce((s,b)=>s+b.bar.count*b.quantity*b.bar.cutLength/1000,0):g.weight),0)}:0)],bundle,42);
 numericFormat(rebar,3,'#,##0');for(let r=5;r<rebar.rowCount;r++)rebar.getCell(r,1).numFmt=Number.isInteger(rebar.getCell(r,1).value)?'#,##0':'#,##0.000';
 if(helperValues.length){rebar.getRow(helperStart-1).values=['รายละเอียดการรวมจาก BBS'];for(const h of helperValues){const row=rebar.getRow(h.row);row.values=h.values;row.outlineLevel=1;body(rebar,row,24);}}
 return report;
}
export async function appendPrintSheets(wb:ExcelJS.Workbook,bundle:SnapshotBundle,items:PrintBar[]){
 const report=appendQuantityPrintSheets(wb,bundle,items),bbs=wb.addWorksheet('BBS Print');
 const hasArc=items.some(i=>i.bar.shape==='arc'),hasHelix=items.some(i=>i.bar.shape==='helix');
 appearance(bbs,['สมาชิก','Mark','Ø mm / เกรด','Code','รูปเหล็ก NTS',hasHelix?'A/B mm · C รอบ':hasArc?'มิติตามรูป mm':'มิติผิวนอก mm','ต่อชิ้น','สมาชิก','รวมชิ้น','ตัด mm','น้ำหนักที่กรอก kg'],[19,11,15,8,36,28,10,13,16,13,18],bundle,'Bar Bending Schedule สำหรับพิมพ์',hasHelix?'รูปแท่งแรก · รูป 77: A เส้นผ่านศูนย์กลาง / B ระยะต่อรอบ mm / C จำนวนรอบ · สมการและพารามิเตอร์ใน Helix Geometry · แก้ในแอปแล้วส่งออกใหม่':hasArc?'รูปแท่งแรก · รูป 67: A แนวศูนย์กลางโค้ง / R ด้านใน / เส้นชี้รัศมีตัดย่อ NTS · ข้อมูลเส้นโค้งใน Curve Geometry · แก้ในแอปแล้วส่งออกใหม่':'รูปแท่งแรก · วงเล็บ = มิติอิสระ · รัศมี r ด้านใน · แก้รูปและมิติในแอปแล้วส่งออกใหม่');
 const bbsHeader=bbs.getCell('A3');bbsHeader.value=String(bbsHeader.value)+'\n'+steelPrintNote(report);const bbsSpan=bbs.columns.reduce((n,c)=>n+widthPx(c.width||20),0);bbs.getRow(3).height=Math.max(bbs.getRow(3).height||48,String(bbsHeader.value).split('\n').reduce((n,t)=>n+Math.max(1,Math.ceil(t.length*12/bbsSpan)),0)*15+6);
 const cache=new Map<string,{id:number;envelope:ReturnType<typeof barEnvelope>}>(),heights:number[]=[];
 for(const [index,item] of items.entries()){
  const {member,bar:b,sourceRow:r,quantity}=item,origin=b.paths[0]?.[0]||[0,0,0],key=JSON.stringify([b.shapeCode,b.radius,b.diameter,b.outsideDiameter,b.paths[0]?.map(p=>p.map((v,i)=>v-origin[i])),b.standard.dimensions,b.freeDimensionLeg,b.pathInput?.basis,b.pathInput?.startAngle]);
  let image=cache.get(key);if(!image){const rendered=thumbnail(item,bundle);image={id:wb.addImage({base64:rendered.base64,extension:'png'}),envelope:rendered.envelope};cache.set(key,image);}
  const special=b.shapeCode.trim()==='99'?code99Print(member,b):undefined;
  const dimensions=b.standard.dimensions.map(d=>`${d.free?'('+d.label+')':d.label} = ${fmt(d.value)}${d.unit==='turns'?' turns':''}`);if(b.standard.helix)dimensions.push('A/B mm · C รอบ',b.standard.helix.exactRequired?'B > A/5: exact 3D':'B ≤ A/5: Table 1');else if(b.standard.arc)dimensions.push('A = แนวศูนย์กลางโค้ง / R ด้านใน',b.standard.arc.supply.method);else if(b.standard.hasBends)dimensions.push(`r = ${fmt(b.standard.innerRadius)}`);
  if(special?.available){dimensions.splice(0,dimensions.length,...special.parts.flatMap(p=>p.dimensions.map(d=>(d.free?'('+d.label+')':d.label)+' = '+fmt(d.value))),'ดู Code99 Details / Coordinates');}else if(b.code99Review?.request.mode==='external')dimensions.unshift('มิติตามหลักฐานภายนอก · ดู Code99 Review');else if(!image.envelope.available)dimensions.unshift('ผิวนอกรอรายละเอียด');
  if(b.standard.ovalLink)dimensions.push('รูป 33 · สามครึ่งวงกลม / ปิดปลายรอตรวจ');
  if(b.standard.semicircle)dimensions.push('ครึ่งวงกลม 180° / สูตร Table 1');
  dimensions.push(b.cutOverride>0?'ตัดกำหนดเอง':b.lengthBasis.startsWith('BS')?'ตัดตาม BS':'ตัดแนวศูนย์กลาง');
  if(b.standard.problems.length||b.errors.length)dimensions.push('รอตรวจ · ดู BBS แถว '+r);
  const row=bbs.addRow([member.code,b.mark,`Ø${fmt(b.diameter)} / ${b.grade}`,b.shapeCode||'PENDING','',dimensions.join('\n')||'ดูรายละเอียดใน BBS แถว '+r,link('G',r,b.count),link('H',r,quantity),link('K',r,b.count*quantity),link('I',r,b.cutLength),link('M',r,b.weight*quantity)]);const rowHeight=Math.max(100,dimensions.reduce((n,t)=>n+Math.max(1,Math.ceil(t.length/24)),0)*14+10);body(bbs,row,rowHeight);heights.push(rowHeight);row.getCell(6).font={name:'Sarabun',size:10,color:{argb:ink}};
  const imageHeight=124,imageWidth=imageHeight*600/330;bbs.addImage(image.id,{tl:{col:4+(widthPx(36)-imageWidth)/2/widthPx(36),row:row.number-1+.03},ext:{width:imageWidth,height:imageHeight},editAs:'oneCell'});
  if(index%100===99)await new Promise(resolve=>setTimeout(resolve,0));
 }
 finish(bbs,11,heights,['TOTAL ENTERED','','','','','','','',items.length?{formula:`SUM(I5:I${bbs.rowCount})`,result:items.reduce((n,i)=>n+i.bar.count*i.quantity,0)}:0,'',items.length?{formula:`SUM(K5:K${bbs.rowCount})`,result:report.totals[6]}:0],bundle,items.length?42:64);
 for(const col of [7,8,9])numericFormat(bbs,col,'#,##0');numericFormat(bbs,11,'#,##0.000');for(let r=5;r<bbs.rowCount;r++){const value=bbs.getCell(r,10).value as ExcelJS.CellFormulaValue;bbs.getCell(r,10).numFmt=typeof value.result==='number'&&Math.abs(value.result)>=1e12?'0.000E+00':Number.isInteger(value.result)?'#,##0':'#,##0.000';}
 for(const col of [1,2,3,4,6])bbs.getColumn(col).numFmt='@';
 if(!items.length)bbs.getCell('E5').value=!report.memberCount?'ไม่มีสมาชิกในขอบเขตนี้':!report.quantityCoverage.complete?'จำนวน/มิติยังชั่วคราว น้ำหนัก BBS เป็นค่าคำนวณประกอบ ยอดพร้อมยังรอยืนยัน · ดู Quantity Basis / BOQ Coverage':report.coverage.complete?'ไม่มีรายการเหล็กตามขอบเขตที่ระบุ':'รอ BBS · ยังไม่มีรายการที่กรอก';
 if(bsEnabled(bundle.project.spec))appendToleranceSheet(wb,bundle,items);
 await (await import('./code99Excel')).appendCode99Sheets(wb,bundle,items);
}

export {appearance as printAppearance,body as printBody};

function appendToleranceSheet(wb:ExcelJS.Workbook,bundle:SnapshotBundle,items:PrintBar[]){
 const sheet=wb.addWorksheet('BS Tolerances'),heights:number[]=[];
 appearance(sheet,['สมาชิก','Mark','Code','รายการ mm','กำหนด mm','เพิ่ม mm','ลด mm','ขอบล่าง mm','ขอบบน mm','สถานะ / ข้อจำกัด'],[19,12,9,16,14,12,12,15,15,45],bundle,'ค่าคลาดเคลื่อนอ้างอิง BS Table 4',`${BS_TOLERANCE_REFERENCE.id} · ข้อ 9 / หน้า 13 · REFERENCE ONLY / ไม่ปรับยาวตัดหรือ geometry`);
 for(const item of items){const reference=bsToleranceReference(bundle.project.spec,item.bar)!;
  const limits=[{label:'ยาวตัด',free:false,nominal:item.bar.cutLength,plus:reference.cut?.plus,minus:reference.cut?.minus,lower:reference.cut?.lower,upper:reference.cut?.upper},...reference.dimensions];
  limits.forEach((limit,index)=>{
   const row=sheet.rowCount+1,notes=index===0?reference.notes.join('\n'):limit.free?'มิติอิสระ / ยังไม่รับค่าคลาดเคลื่อนสะสม':'มิติดัดอ้างอิง / รอตรวจการผลิต';
   const record=sheet.addRow([item.member.code,item.bar.mark,item.bar.shapeCode||'PENDING',limit.free?'('+limit.label+')':limit.label,index===0?link('I',item.sourceRow,limit.nominal):limit.nominal,limit.plus??null,limit.minus??null,limit.lower===undefined?null:{formula:`E${row}-G${row}`,result:limit.lower},limit.upper===undefined?null:{formula:`E${row}+F${row}`,result:limit.upper},notes]);
   const lines=notes.split('\n').reduce((n,text)=>n+Math.max(1,Math.ceil(text.length/34)),0),height=Math.max(30,lines*13+8);
   body(sheet,record,height);record.getCell(10).font={name:'Sarabun',size:10,color:{argb:ink}};heights.push(height);
  });
 }
 finish(sheet,10,heights,['REFERENCE ONLY','','','','','','','','','ตรวจการรับค่าคลาดเคลื่อนร่วมกับแบบ/ข้อกำหนดการผลิตก่อนใช้งาน'],bundle,56);
 for(const col of [1,2,3,4,10])sheet.getColumn(col).numFmt='@';
 for(const col of [5,6,7,8,9]){numericFormat(sheet,col,'#,##0.000');for(let r=5;r<sheet.rowCount;r++){const cell=sheet.getCell(r,col),raw=cell.value,n=raw&&typeof raw==='object'&&'formula' in raw?raw.result??0:raw;if(typeof n==='number'&&Math.abs(n)<1e12&&Number.isInteger(n))cell.numFmt='#,##0';}}
 if(!items.length)sheet.getCell('J5').value='ไม่มีรายการเหล็กในชุดนี้';
}
