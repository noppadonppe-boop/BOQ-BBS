import type ExcelJS from 'exceljs';
import type {SnapshotBundle} from '../domain/model';
import {code99Print} from '../domain/code99Print';
import {code99Canvas} from './code99Canvas';
import {printAppearance,printBody,type PrintBar} from './excelPrint';

const widths=[24,10,16,14,14,12,12,16,16,16,29];
const px=(w:number)=>Math.floor(w*7+5);
const link=(column:string,row:number,result:number)=>({formula:`'BBS'!${column}${row}`,result});
function sheet(wb:ExcelJS.Workbook,bundle:SnapshotBundle,name:string,coordinates=false){
 const s=wb.addWorksheet(name);
 printAppearance(s,coordinates?['Member','Mark','Vertex','X mm','Y mm','Z mm','Cut mm','Total pcs','Entered kg','Frame','Status']:['Member','Mark','Leg / reference','Outside mm','Straight mm','Bend after °','Inside r mm','Cut mm','Total pcs','Entered kg','Basis / status'],widths,bundle,coordinates?'Code99 physical coordinates':'Code99 outside drawing details','Captured first physical bar / NTS / geometric detailing only. Parentheses identify the free dimension. Repeated cut/count/weight cells identify the same bar; do not sum dimension or vertex rows. Edit geometry in the app and export again. BS/material/source/placement/fabrication approval remains pending.');
 s.getRow(3).height=54;s.pageSetup.printArea='A1:K4';return s;
}
const textHeight=(text:string,min=40)=>Math.max(min,Math.ceil(text.length*12/widths.reduce((n,w)=>n+px(w),0))*16+8);
const group=(s:ExcelJS.Worksheet,text:string)=>{const row=s.addRow([text]);s.mergeCells(row.number,1,row.number,11);printBody(s,row,textHeight(text));return row;};
const dataHeight=(values:unknown[],min=24)=>Math.max(min,...values.map((v,i)=>typeof v==='string'?Math.ceil(v.length*12/px(widths[i]))*15+8:0));
const area=(s:ExcelJS.Worksheet)=>s.pageSetup.printArea=`A1:K${s.rowCount}`;
const anchor=(pixels:number)=>{for(let i=0;i<widths.length;i++){const w=px(widths[i]);if(pixels<=w)return i+pixels/w;pixels-=w;}return widths.length;};

export async function appendCode99Sheets(wb:ExcelJS.Workbook,bundle:SnapshotBundle,items:PrintBar[]){
 const entries=items.filter(i=>i.bar.shapeCode.trim()==='99');if(!entries.length)return;
 let details:ExcelJS.Worksheet|undefined,points:ExcelJS.Worksheet|undefined,detailIndex=0,coordinateIndex=0,detailBlocks=0,pointRows=0;
 const cache=new Map<string,number>();
 for(const item of entries){
  const {member,bar:b,sourceRow:r}=item,p=code99Print(member,b),cut=link('I',r,b.cutLength),count=link('K',r,b.count*item.quantity),weight=link('M',r,b.weight*item.quantity);
  for(const part of p.parts){
   if(!details||detailBlocks===200){details=sheet(wb,bundle,'Code99 Details'+(detailIndex?' '+(detailIndex+1):''));detailIndex++;detailBlocks=0;}
   if(detailBlocks)details.getRow(details.rowCount).addPageBreak();detailBlocks++;
   const heading=group(details,`${member.code} / Mark ${b.mark} / part ${part.number}/${p.parts.length} / ${p.frame} / ${b.pathInput?.reference||'Manual coordinates; source convention unconfirmed'}`);
   if(p.available){
    const key=JSON.stringify([p.drawing.outline,p.drawing.dimensions,b.radius,part.number]);let id=cache.get(key);
    if(id===undefined){id=wb.addImage({base64:code99Canvas(p,part.number-1),extension:'png'});cache.set(key,id);}
    const warningText='PENDING / '+p.drawing.warnings.join(' | '),warningHeight=textHeight(warningText,46),dimensionRows=part.dimensions.map(d=>[member.code,b.mark,d.free?'('+d.label+')':d.label,d.value,d.straight,d.bendDegrees,d.innerRadius,cut,count,weight,d.leg===null?'Overall reference':b.code99Review?'Captured user review / NOT FOR CONSTRUCTION':'Pending review']);
    const headers=[1,2,3,4].reduce((n,r)=>n+(details!.getRow(r).height||20),0),height=Math.max(120,Math.min(388,841.89-.8*72-24-headers-(heading.height||40)-dimensionRows.reduce((n,r)=>n+dataHeight(r),0)-warningHeight)),imageHeight=(height-6)*4/3,imageWidth=imageHeight*1140/660;
    const row=details.addRow([]);row.height=height;details.mergeCells(row.number,1,row.number,11);
    details.addImage(id,{tl:{col:anchor((widths.reduce((n,w)=>n+px(w),0)-imageWidth)/2),row:row.number-1+.01},ext:{width:imageWidth,height:imageHeight},editAs:'oneCell'});
    for(const values of dimensionRows){const row=details.addRow(values);printBody(details,row,dataHeight(values));}
    const warning=details.addRow(['PENDING / '+p.drawing.warnings.join(' | ')]);details.mergeCells(warning.number,1,warning.number,11);printBody(details,warning,textHeight(String(warning.getCell(1).value),46));
   }else{const row=details.addRow([member.code,b.mark,b.code99Review?'EXTERNAL REVIEW':'OUTSIDE PENDING',null,null,null,null,cut,count,weight,p.reason+(b.code99Review?' / See captured Code99 Review dimensions/evidence':'')]);printBody(details,row,125);}
   area(details);
  }
  if(!points||pointRows+p.points.length>8000){points=sheet(wb,bundle,'Code99 Coordinates'+(coordinateIndex?' '+(coordinateIndex+1):''),true);coordinateIndex++;pointRows=0;}
  if(pointRows)points.getRow(points.rowCount).addPageBreak();
  group(points,`${member.code} / Mark ${b.mark} / physical member datum / virtual centerline intersections, not curve tangent points / ${p.available?p.frame:'Outside drawing unavailable: '+p.reason}`);
  for(const [i,v]of p.points.entries()){const values=[member.code,b.mark,'P'+String(i).padStart(2,'0'),...v,cut,count,weight,'Member XYZ',b.code99Review?'Captured user review':p.available?'Pending review':'Outside pending'];const row=points.addRow(values);printBody(points,row,dataHeight(values,32));pointRows++;}
  area(points);if(pointRows%100===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 for(const s of wb.worksheets.filter(s=>s.name.startsWith('Code99 '))){for(const col of [4,5,6,7,8,9,10])s.getColumn(col).numFmt='0.000000';for(const col of s.name.startsWith('Code99 Coordinates')?[8]:[9])s.getColumn(col).numFmt='#,##0';s.views=[{state:'frozen',ySplit:4,showGridLines:false}];}
}
