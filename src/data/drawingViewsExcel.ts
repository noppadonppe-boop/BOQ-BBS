import type ExcelJS from 'exceljs';
import type {SnapshotBundle} from '../domain/model';
export function appendDrawingViewsSheet(wb:ExcelJS.Workbook,b:SnapshotBundle){
 const members=b.members.filter(m=>m.drawingViews);if(!members.length)return;
 const s=wb.addWorksheet('Drawing Views');s.addRow(['SAVED DRAWING VIEWS / '+(b.revisionNumber||'D'+b.version)]);s.addRow(['Member coordinates mm / presentation inputs only / NOT FOR CONSTRUCTION']);s.addRow(['Member','Primary plane','Section','Normal axis','Position mm','Drawing / view basis']);s.columns=[{width:20},{width:16},{width:18},{width:16},{width:20},{width:72}];
 for(const m of members)for(const cut of m.drawingViews!.sections){const r=s.addRow([m.code,m.drawingViews!.primaryPlane,cut.label,cut.axis,cut.position,m.drawingViews!.basis]);r.height=Math.max(24,14*Math.ceil(m.drawingViews!.basis.length/57)+12);}
 s.mergeCells('A1:F1');s.mergeCells('A2:F2');s.getRow(1).height=36;s.getRow(2).height=38;s.getRow(3).height=38;s.views=[{state:'frozen',ySplit:3}];s.autoFilter=`A3:F${s.rowCount}`;s.getColumn(5).numFmt='0.000';
 s.eachRow((r,i)=>r.eachCell(c=>{c.font={name:'Sarabun',size:i===1?14:11,color:{argb:i===3?'FFFFFFFF':'FF253B42'}};c.alignment={vertical:'middle',wrapText:true};if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};}));
 s.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',scale:100,fitToPage:false,printArea:`A1:F${s.rowCount}`,printTitlesRow:'1:3'};
}
