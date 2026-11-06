import type {Workbook} from 'exceljs';
import type {Member} from '../domain/model';
import {isWallRunMember} from '../domain/wallRun';
import {wallBbsItems,wallBbsSummary,type WallRow} from '../domain/wallRunSheet';

/** Wall Run members (docs/WALL_RUN.md): sheet “Wall BBS by lift” (header row per pour band with its kg, then Mark, size,
 * shape, cut length, pcs and kg of that band) and the band × bar size summary, after every existing sheet. */
export function appendWallRunSheets(wb:Workbook,members:Member[],takeoff:(m:Member)=>{rows:WallRow[];quantity:number}){
 const walls=members.filter(isWallRunMember);if(!walls.length)return;
 const sh=wb.addWorksheet('Wall BBS by lift');
 sh.addRow(['Wall Run · bar bending schedule by pour lift (ช่วงเท) · × member quantity']);
 sh.addRow(['Member','Lift / band','Mark','Diameter mm','Grade','Shape code','Cut length mm','Total pcs','Total weight kg']);
 for(const m of walls){const q=takeoff(m),rows=q.rows.filter(r=>/^gen-wr-/.test(r.id));let band='';
  for(const it of wallBbsItems(m,rows,'lift',q.quantity)){if('head' in it){band=it.head;sh.addRow([m.code,band,'','','','','','',Number(String(it.sub||'').replace(/[^0-9.]/g,''))||null]).font={bold:true};continue;}
   sh.addRow([m.code,band,it.row.mark,it.row.diameter,it.row.grade,it.row.shapeCode,it.row.cutLength,it.count,it.weight]);}
  const s=wallBbsSummary(m,rows,'lift',q.quantity);sh.addRow([]);sh.addRow([m.code,'Lift / band × size',...s.sizes.map(d=>`${d<=9?'RB':'DB'}${d} kg`),'Total kg']).font={bold:true};
  for(const g of s.groups)sh.addRow([m.code,g.name,...s.sizes.map(d=>g.kg.get(d)||0),g.total]);
  sh.addRow([m.code,'TOTAL',...s.sizes.map(d=>s.groups.reduce((n,g)=>n+(g.kg.get(d)||0),0)),s.total]).font={bold:true};sh.addRow([]);}
 sh.columns.forEach((c,i)=>c.width=[16,24,14,12,10,10,14,12,16][i]||14);sh.getRow(2).font={bold:true};
 sh.eachRow((row,i)=>{if(i>2)row.eachCell(cell=>{if(typeof cell.value==='number'&&!Number.isInteger(cell.value))cell.numFmt='0.00';});});
}
