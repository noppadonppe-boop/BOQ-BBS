import type ExcelJS from 'exceljs';
import type {SnapshotBundle} from '../domain/model';
import {planarInputPoints,pathBasisConvention} from '../domain/planarPathInput';
export function appendPlanarPathSheet(wb:ExcelJS.Workbook,bundle:SnapshotBundle){
 const inputs=bundle.members.flatMap(m=>m.bars.filter(b=>b.pathInput).map(b=>({m,b})));if(!inputs.length)return;
 const s=wb.addWorksheet('Path Input');s.addRows([[`${bundle.project.code} · Entered planar path dimensions`],['DRAFT / '+pathBasisConvention],['Member','Mark','Plane / basis','Start angle °','Outside dia mm','Inside radius mm','Leg','Input length mm','Turn from previous °','Virtual leg mm','Reference']]);
 for(const {m,b}of inputs){const d=b.pathInput!,g=planarInputPoints(d);d.legs.forEach((l,i)=>s.addRow([m.code,b.mark,`${d.plane} / ${d.basis}`,d.startAngle,d.outsideDiameter,d.innerRadius,i+1,l.length,l.turn,g.virtual[i],d.reference]));}
 const widths=[14,8,16,12,12,12,7,14,14,14,40];s.columns=widths.map(width=>({width}));s.mergeCells('A1:K1');s.mergeCells('A2:K2');s.getRow(1).height=30;s.getRow(2).height=54;s.getRow(3).height=36;
 s.eachRow((row,i)=>{if(i>3)row.height=Math.min(409,Math.max(48,20+Math.ceil(String(row.getCell(11).value).length/28)*16));row.eachCell(c=>{c.font={name:'Sarabun',size:11,bold:i===1||i===3,color:{argb:i===3?'FFFFFFFF':'FF203940'}};c.alignment={wrapText:true,vertical:'middle',horizontal:typeof c.value==='number'?'right':'left'};if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245E4D'}};});});
 // Keep 100% zoom and narrower columns: native Excel changes PDF media size at lower zoom.
 s.views=[{state:'frozen',ySplit:3,showGridLines:false}];s.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:false,scale:100,margins:{left:.4,right:.4,top:.4,bottom:.4,header:.15,footer:.15},printTitlesRow:'1:3',printArea:`A1:K${s.rowCount}`};s.autoFilter=`A3:K${s.rowCount}`;for(const c of ['D','E','F','H','I'])s.getColumn(c).numFmt='General';s.getColumn('J').numFmt='0.000000';
}
