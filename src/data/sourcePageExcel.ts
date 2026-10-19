import type ExcelJS from 'exceljs';
import type {SnapshotBundle} from '../domain/model';
import {compareSourceSchedule} from '../domain/sourceSchedule';
import {sourceComparisonQuantity} from '../domain/sourceQuantityBasis';
import {takeoff} from '../domain/engine';
export function appendSourcePageSheet(wb:ExcelJS.Workbook,b:SnapshotBundle){
 const members=b.members.filter(m=>m.sourceSchedule?.version===3);if(!members.length)return;const s=wb.addWorksheet('Source Page Register');
 s.addRows([[`${b.project.code} · Source BBS page register`],['Printed totals are literal per-page values. No combined printed Total is inferred. Row sums and differences are review data, not acceptance or BOQ quantities.'],['Member','Page','Rows','Printed page Total kg','Transcribed row sum kg','Rows - printed kg','Reference / page scope','Source SHA256']]);
 for(const m of members){const result=compareSourceSchedule(m,takeoff(m,b.project.spec).rows,b.attachments,sourceComparisonQuantity(m,b))!;for(const t of result.pageWeights){const row=s.rowCount+1;s.addRow([m.code,t.page,t.rows,t.statedTotalWeight??null,t.weightComplete?t.rowWeight:null,t.difference===undefined?null:{formula:`E${row}-D${row}`,result:t.difference},t.note,result.source.sha256]);}}
 s.columns=[22,10,10,24,26,24,70,68].map(width=>({width}));s.mergeCells('A1:H1');s.mergeCells('A2:H2');s.eachRow((r,i)=>{r.height=i===1?30:i===2?60:i===3?44:Math.min(409,Math.max(100,String(r.getCell(7).value||'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/55)),0)*16+18));r.eachCell(c=>{c.font={name:'Sarabun',size:10,bold:i===1||i===3,color:{argb:i===3?'FFFFFFFF':'FF203940'}};c.alignment={vertical:'middle',wrapText:true,horizontal:i>3&&Number(c.col)>=2&&Number(c.col)<=6?'right':'left'};if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245E4D'}};if(i>3&&Number(c.col)>=4&&Number(c.col)<=6)c.numFmt='0.000000';});});s.views=[{state:'frozen',ySplit:3,showGridLines:false}];s.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:3',printArea:`A1:H${s.rowCount}`};
}
