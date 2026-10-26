import type {Member} from '../domain/model';
import {assemblyTypeLabels} from '../domain/steelInputSchema';
import {steelHeads,type SteelAssemblyRow,type SteelBoltRow,type SteelPartRow,type SteelWeldRow} from '../domain/steelInput';
import {locationTree} from '../domain/locations';
import type {Locations} from '../domain/locations';

// Excel ⇄ steel assemblies (Tekla material list style): sheets Parts, Bolts, Welds, Assemblies.
function download(blob:Blob,name:string){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const text=(v:unknown)=>{if(v&&typeof v==='object'&&'result'in v)return String((v as {result:unknown}).result??'');if(v&&typeof v==='object'&&'richText'in v)return (v as {richText:{text:string}[]}).richText.map(r=>r.text).join('');return String(v??'').trim();};
export async function exportSteel(members:Member[],locations:Locations|undefined,name:string){
 const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook(),tree=locationTree(locations);wb.creator='FORM BOQ & BBS';
 const list=members.filter(m=>m.category==='SteelAssembly'&&m.steelInput),ex=!list.length;
 const sheet=(n:string,head:string[],rows:(string|number)[][],widths:number[])=>{const ws=wb.addWorksheet(n);ws.addRow(head);rows.forEach(r=>ws.addRow(r));ws.views=[{state:'frozen',ySplit:1}];ws.columns.forEach((c,i)=>{c.width=widths[i]||12;});
  ws.getRow(1).eachCell(cell=>{cell.font={name:'Sarabun',bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};cell.alignment={wrapText:true,vertical:'middle'};});ws.getRow(1).height=30;};
 const parts=ex?[['C21','MP/94','H-150X150X7X10','SS400',1,3230,'','Y'],['C21','BP/1001','PL15*250','SS400',1,250,'',''],['C21','PL/15','PL10*115','SS400',1,264,2.2,'']]
  :list.flatMap(m=>m.steelInput!.parts.map(p=>[m.code,p.mark,p.profile,p.grade,p.count,p.length,p.weight??'',p.main?'Y':'']));
 const bolts=ex?[['C21','M20','8.8',60,8,22]]:list.flatMap(m=>m.steelInput!.bolts.map(b=>[m.code,b.size,b.grade,b.length||'',b.count,b.hole||'']));
 const welds=ex?[['C21','Fillet',4,500,4]]:list.flatMap(m=>m.steelInput!.welds.map(w=>[m.code,w.type==='fillet'?'Fillet':'Butt',w.size||'',w.length,w.count]));
 const asm=ex?[['C21','column','ASSEMBLY NO. C',1,'','ทาสีกันสนิม 2 ชั้น + สีทับหน้า 2 ชั้น']]:list.map(m=>{const i=m.steelInput!,placed=m.occurrences.filter(o=>o.loc?.level);
  return [m.code,i.type,i.name,placed.length?'':m.occurrences.reduce((n,o)=>n+o.quantity,0),placed.map(o=>`${[o.loc!.building,o.loc!.level,o.loc!.room].map(id=>id&&tree.byId.get(id)?.code).filter(Boolean).join('-')}${o.quantity>1?`×${o.quantity}`:''}`).join('; '),i.paint];});
 sheet('Parts',steelHeads.parts,parts,[10,12,24,10,6,12,18,8]);sheet('Bolts',steelHeads.bolts,bolts,[10,10,10,12,8,10]);sheet('Welds',steelHeads.welds,welds,[10,16,10,12,8]);sheet('Assemblies',steelHeads.assemblies,asm,[10,10,28,10,30,36]);
 const help=wb.addWorksheet('วิธีกรอก');help.getColumn(1).width=100;
 help.addRows([['Parts: หนึ่งแถวต่อชิ้นส่วน (เหมือน Material list ของ Tekla) · Assembly = รหัสสมาชิก · Main = Y ที่ชิ้นหลัก (ไม่ใส่ = แถวแรก)'],['Profile: H-150X150X7X10 · PL10*115 · L-50X50X5 · C-150X65X20X3.2 · [-150X75X6.5X10 · PIPE-114.3X4.5 · RHS-100X50X3.2 · RB20'],['Weight / ชิ้น: ว่าง = คำนวณจากหน้าตัด × ยาว × 7,850 kg/m³ · ใส่ค่าจากรายงาน Tekla ได้ (หักรอยตัดแล้ว)'],[`Assemblies (ไม่บังคับ): Type = ${Object.entries(assemblyTypeLabels).map(([k,v])=>`${k} (${v})`).join(' · ')} · ตำแหน่ง = อาคาร-ชั้น × จำนวน`]]);
 const bytes=await wb.xlsx.writeBuffer();download(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${name}-steel${ex?'-template':''}.xlsx`);
}
export async function readSteel(file:File):Promise<{parts:SteelPartRow[];bolts:SteelBoltRow[];welds:SteelWeldRow[];assemblies:SteelAssemblyRow[]}>{
 const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
 const rows=<T,>(name:string,map:(c:(k:number)=>string,source:string)=>T):T[]=>{const ws=wb.getWorksheet(name),out:T[]=[];ws?.eachRow((row,i)=>{if(i===1)return;out.push(map(k=>text(row.getCell(k+1).value),`${name} แถว ${i}`));});return out;};
 if(!wb.getWorksheet('Parts'))throw Error('ไม่พบแผ่นงาน Parts');
 return {parts:rows('Parts',(c,source)=>({assembly:c(0),mark:c(1),profile:c(2),grade:c(3),count:c(4),length:c(5),weight:c(6),main:c(7),source})),
  bolts:rows('Bolts',(c,source)=>({assembly:c(0),size:c(1),grade:c(2),length:c(3),count:c(4),hole:c(5),source})),
  welds:rows('Welds',(c,source)=>({assembly:c(0),type:c(1),size:c(2),length:c(3),count:c(4),source})),
  assemblies:rows('Assemblies',(c,source)=>({assembly:c(0),type:c(1),name:c(2),quantity:c(3),locations:c(4),paint:c(5),source}))};
}
