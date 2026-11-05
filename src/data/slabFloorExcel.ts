import type {Workbook} from 'exceljs';
import type {Member} from '../domain/model';
import {floorCtx,floorLayerToken,floorSpacingNote,floorSteelSummary,slabMarkOf} from '../domain/slabFloorSheet';

type Row={id:string;mark:string;note:string;diameter:number;grade:string;shapeCode:string;cutLength:number;count:number;weight:number;paths:[number,number,number][][]};
/** Slab floors (S2): sheet “Slab BBS” (bars grouped by slab mark: layer, Mark, size, shape, cut length, count, kg) and
 * “Slab Summary” (kg per slab mark × bar size + totals) after every existing sheet (old sheets / columns unchanged).
 * `takeoff` = the frozen takeoff of a member (rows + member quantity). */
export function appendSlabFloorSheets(wb:Workbook,members:Member[],takeoff:(m:Member)=>{rows:Row[];quantity:number}){
 const floors=members.filter(m=>floorCtx(m));if(!floors.length)return;
 const bbs=wb.addWorksheet('Slab BBS'),sum=wb.addWorksheet('Slab Summary');
 bbs.addRow(['Slab floor · bar bending schedule by slab mark (เบอร์พื้น)']);
 bbs.addRow(['Member','Slab mark','Layer','Mark','Diameter mm','Grade','Shape code','Cut length mm','Qty each','Member qty','Total pcs','Total weight kg','Note']);
 sum.addRow(['Slab floor · steel by slab mark × bar size (kg, × member quantity)']);
 for(const m of floors){const q=takeoff(m),rows=q.rows.filter(r=>/^gen-/.test(r.id)),marks=[...new Set(rows.map(r=>slabMarkOf(r)))].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
  for(const mk of marks){bbs.addRow([m.code,mk,'','','','','','','','','',rows.filter(r=>slabMarkOf(r)===mk).reduce((t,r)=>t+r.weight,0)*q.quantity,`เบอร์พื้น ${mk}`]).font={bold:true};
   for(const r of rows.filter(x=>slabMarkOf(x)===mk))bbs.addRow([m.code,mk,floorLayerToken(r.note),r.mark,r.diameter,r.grade,r.shapeCode,r.cutLength,r.count,q.quantity,r.count*q.quantity,r.weight*q.quantity,[r.note,floorSpacingNote(m,r)].filter(Boolean).join(' · ')]);}
  const t=floorSteelSummary(rows,q.quantity);sum.addRow([]);sum.addRow([m.code,'Slab mark',...t.sizes.map(d=>`${d<=9?'RB':'DB'}${d} kg`),'Total kg']).font={bold:true};
  t.marks.forEach((mk,i)=>sum.addRow([m.code,mk,...t.kg[i],t.byMark[i]]));sum.addRow([m.code,'TOTAL',...t.bySize,t.total]).font={bold:true};}
 bbs.columns.forEach((c,i)=>c.width=[18,12,8,12,12,10,10,14,10,10,10,16,60][i]);bbs.getRow(2).font={bold:true};
 sum.columns.forEach((c,i)=>c.width=i<2?16:14);
 for(const sh of [bbs,sum])sh.eachRow((row,i)=>{if(i>1)row.eachCell(cell=>{if(typeof cell.value==='number'&&!Number.isInteger(cell.value))cell.numFmt='0.00';});});
}
