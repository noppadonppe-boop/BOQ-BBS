import {labels,categories} from '../domain/model';
import {disciplineInfo,disciplines} from '../domain/disciplines';
import {boqComponentLabels,boqComponents,rowsFromChapters,sampleChapters,type BoqChapterRow,type BoqChapters,type BoqSheetRow} from '../domain/boqChapters';

function download(blob:Blob,name:string){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
// Owner BOQ ⇄ Excel, sheet "BOQ": A–C the owner's item list, D–K the rule (D empty = heading), M–O quantities and prices.
export const boqHead=['รหัส','รายการ','หน่วย','ปริมาณจากระบบ','หมวดงาน','ประเภทองค์ประกอบ',"Mix / f'c / ชั้นท่อ",'ขนาดเหล็ก / ท่อ (mm)','เกรดเหล็ก','อาคาร (WBS)','ชื่อรายการงานรองพื้น / เพิ่มเอง','หมายเหตุ','ปริมาณ','ราคาต่อหน่วย','จำนวนเงิน'];
const text=(v:unknown)=>{if(v&&typeof v==='object'&&'result'in v)return String((v as {result:unknown}).result??'');if(v&&typeof v==='object'&&'richText'in v)return (v as {richText:{text:string}[]}).richText.map(r=>r.text).join('');return String(v??'').trim();};

/** Sheet with the owner's items, their rules and (when given) the quantities of the current scope. */
export async function exportBoqChapters(chapters:BoqChapters|undefined,rows:BoqChapterRow[]|undefined,name:string,scope:string){
 const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();wb.creator='FORM BOQ & BBS';
 const ws=wb.addWorksheet('BOQ'),help=wb.addWorksheet('วิธีกรอก'),c=chapters||sampleChapters(),q=new Map(rows?.map(r=>[r.item.id,r]));
 ws.addRow(boqHead);
 rowsFromChapters(c).forEach((r,i)=>{const item=c.items[i],row=q.get(item.id),n=ws.rowCount+1;
  ws.addRow([r.code,r.title,r.unit,r.component,r.disciplines,r.categories,r.mix,r.diameters,r.grades,r.buildings,r.siteItem,r.note,item.rule&&row?Math.round(row.quantity!*1000)/1000:null,null,item.rule?{formula:`IF(N${n}="","",M${n}*N${n})`}:null]);
  if(!item.rule)ws.getRow(n).font={name:'Sarabun',bold:true};});
 ws.views=[{state:'frozen',ySplit:1}];ws.columns.forEach((col,i)=>{col.width=[9,42,8,16,10,18,12,12,10,12,22,18,14,12,14][i];});
 ws.getRow(1).height=36;ws.getRow(1).eachCell(cell=>{cell.font={name:'Sarabun',bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};cell.alignment={wrapText:true,vertical:'middle'};});
 ws.getColumn(13).numFmt='#,##0.000';ws.getColumn(14).numFmt='#,##0.00';ws.getColumn(15).numFmt='#,##0.00';
 help.addRows([[`ขอบเขตปริมาณ: ${rows?scope:'— (แบบฟอร์ม)'}`],[],['คอลัมน์ D “ปริมาณจากระบบ” (ว่าง = หัวข้อหมวด)'],...boqComponents.map(k=>[boqComponentLabels[k]]),[],['หมวดงาน (E)'],...disciplines.map(d=>[`${disciplineInfo[d].short} · ${disciplineInfo[d].label}`]),[],['ประเภทองค์ประกอบ (F)'],...categories.map(k=>[labels[k]]),[],
  ['ตัวกรองหลายค่าคั่นด้วย , · ขนาดเหล็ก เช่น 12, 16 หรือ DB16 · Mix ใส่ชื่อ Mix หรือ f\'c (เช่น 350)'],['งานวางท่อ: ขนาดท่อ (mm) ในคอลัมน์ H · ชั้นท่อ (เช่น ชั้น 3, PN10) ในคอลัมน์ G · ปริมาณ “ความยาว” หรือ “จำนวนท่อน”'],['ปริมาณหนึ่งก้อนลงรายการที่ตรงเงื่อนไขมากที่สุด · หน่วย “m” ของเสาเข็มใช้ความยาว · หน่วย “ตัน” ของเหล็กหาร 1,000'],['คอลัมน์ M–O ใช้แสดงผลเท่านั้น ไม่ถูกอ่านตอนนำเข้า']]);
 help.getColumn(1).width=90;
 const bytes=await wb.xlsx.writeBuffer();download(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${name}-boq-${chapters?'owner':'template'}.xlsx`);
}
/** Rows of the BOQ sheet (header row 1, columns A–L). */
export async function readBoqChapters(file:File):Promise<BoqSheetRow[]>{
 const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
 const ws=wb.getWorksheet('BOQ')||wb.worksheets[0];if(!ws)throw Error('ไม่พบแผ่นงาน');
 const rows:BoqSheetRow[]=[];
 ws.eachRow((row,i)=>{if(i===1)return;const c=(k:number)=>text(row.getCell(k+1).value);
  rows.push({code:c(0),title:c(1),unit:c(2),component:c(3),disciplines:c(4),categories:c(5),mix:c(6),diameters:c(7),grades:c(8),buildings:c(9),siteItem:c(10),note:c(11),source:`แถว ${i}`});});
 return rows;
}
