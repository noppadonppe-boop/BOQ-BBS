import type {Finish} from '../domain/archInputSchema';
import {fixtureHead,openingHead,roomHead,rowsFromFinishes,wallHead,type FinishRow,type FixtureRow,type OpeningRow,type RoomRow,type WallRow} from '../domain/archSchedules';

// Excel ⇄ architecture schedules: finish library (sheet "Finishes"), room finish schedule ("Rooms") and door / window
// schedule ("Openings"). Rows only; parsing into finishes / members lives in domain/archSchedules.ts.
function download(blob:Blob,name:string){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const text=(v:unknown)=>{if(v&&typeof v==='object'&&'result'in v)return String((v as {result:unknown}).result??'');if(v&&typeof v==='object'&&'richText'in v)return (v as {richText:{text:string}[]}).richText.map(r=>r.text).join('');return String(v??'').trim();};
export const finishHead=['ประเภท (พื้น / บัว / ผนัง / ฝ้า)','รหัส','ชื่อวัสดุผิว','รายการ BOQ','หน่วย','ตัวคูณต่อ m² (บัว: ต่อ m)'];
async function book(){const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();wb.creator='FORM BOQ & BBS';return wb;}
type Sheet=Awaited<ReturnType<typeof book>>['worksheets'][number];
function sheet(wb:Awaited<ReturnType<typeof book>>,name:string,head:string[],rows:(string|number)[][],widths:number[]):Sheet{
 const ws=wb.addWorksheet(name);ws.addRow(head);rows.forEach(r=>ws.addRow(r));ws.views=[{state:'frozen',ySplit:1}];ws.columns.forEach((c,i)=>{c.width=widths[i]||14;});
 ws.getRow(1).height=32;ws.getRow(1).eachCell(cell=>{cell.font={name:'Sarabun',bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};cell.alignment={wrapText:true,vertical:'middle'};});
 return ws;
}
async function save(wb:Awaited<ReturnType<typeof book>>,name:string){const bytes=await wb.xlsx.writeBuffer();download(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name);}
export async function exportFinishes(list:readonly Finish[],name:string){
 const wb=await book();sheet(wb,'Finishes',finishHead,rowsFromFinishes(list).map(r=>[r.kind,r.code,r.name,r.item,r.unit,r.factor===''?'':Number(r.factor)]),[16,9,36,44,9,14]);await save(wb,`${name}-finishes.xlsx`);
}
async function load(file:File){const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());return wb;}
function rowsOf<T>(ws:Sheet|undefined,map:(c:(k:number)=>string,source:string)=>T):T[]{
 const out:T[]=[];ws?.eachRow((row,i)=>{if(i===1)return;out.push(map(k=>text(row.getCell(k+1).value),`${ws.name} แถว ${i}`));});return out;
}
export async function readFinishes(file:File):Promise<FinishRow[]>{
 const wb=await load(file),ws=wb.getWorksheet('Finishes')||wb.worksheets[0];if(!ws)throw Error('ไม่พบแผ่นงาน');
 return rowsOf(ws,(c,source)=>({kind:c(0),code:c(1),name:c(2),item:c(3),unit:c(4),factor:c(5),source}));
}
/** Room + door / window schedules in one workbook (current data, or a filled-in example). */
export async function exportArchSchedules(rooms:RoomRow[],openings:OpeningRow[],walls:WallRow[],fixtures:FixtureRow[],name:string){
 const wb=await book(),ex=!rooms.length&&!openings.length&&!walls.length&&!fixtures.length;
 const r:Omit<RoomRow,'source'>[]=ex?[{building:'A',level:'L2',room:'201',name:'ห้องนอน',width:'4',length:'4',area:'',perimeter:'',height:'2.7',floor:'F2',skirting:'S1',wall:'W1',ceiling:'C1',dado:'',dadoHeight:''},{building:'A',level:'L2',room:'202',name:'ห้องน้ำ',width:'',length:'',area:'4.5',perimeter:'8.6',height:'2.4',floor:'F3',skirting:'',wall:'W1',ceiling:'C2',dado:'W2',dadoHeight:'1.5',waterproof:'WP1',upturn:'0.3'}]:rooms;
 const o:Omit<OpeningRow,'source'>[]=ex?[{code:'D1',type:'ประตู',description:'ประตูไม้ HDF บานเปิดเดี่ยว วงกบไม้',width:'900',height:'2000',locations:'A-L2-201; A-L2-202',quantity:''},{code:'W1',type:'หน้าต่าง',description:'หน้าต่างอะลูมิเนียมบานเลื่อน กระจก 6 mm',width:'1200',height:'1200',locations:'A-L2-201×2',quantity:''}]:openings;
 const n=(v:string)=>v===''?'':Number(v);
 sheet(wb,'Rooms',roomHead,r.map(x=>[x.building,x.level,x.room,x.name,n(x.width),n(x.length),n(x.area),n(x.perimeter),n(x.height),x.floor,x.skirting,x.wall,x.ceiling,x.dado,n(x.dadoHeight),x.waterproof||'',n(x.upturn||'')]),[8,8,10,24,9,9,11,12,9,7,7,7,7,11,12,11,12]);
 sheet(wb,'Openings',openingHead,o.map(x=>[x.code,x.type,x.description,n(x.width),n(x.height),x.locations,n(x.quantity)]),[10,14,44,10,10,44,14]);
 const w:Omit<WallRow,'source'>[]=ex?[{building:'A',level:'L2',code:'WL-L2-01',type:'WT1',length:'12.5',height:'3',thickness:'100',openings:'D1×2; W1',stiffenerSpacing:'2.5',tieBeams:'1',quantity:''}]:walls;
 const f:Omit<FixtureRow,'source'>[]=ex?[{code:'WC1',description:'ชักโครกแบบนั่งราบ พร้อมอุปกรณ์',unit:'ชุด',locations:'A-L2-202',quantity:''}]:fixtures;
 sheet(wb,'Fixtures',fixtureHead,f.map(x=>[x.code,x.description,x.unit,x.locations,n(x.quantity)]),[10,44,8,44,14]);
 sheet(wb,'Walls',wallHead,w.map(x=>[x.building,x.level,x.code,x.type,n(x.length),n(x.height),n(x.thickness),x.openings,n(x.stiffenerSpacing),n(x.tieBeams),n(x.quantity)]),[8,8,14,10,9,9,9,30,12,11,14]);
 const help=wb.addWorksheet('วิธีกรอก');help.getColumn(1).width=100;
 help.addRows([['Rooms: อาคาร / ชั้น ต้องมีใน WBS แล้ว · ห้องที่ยังไม่มีจะถูกเพิ่มใต้ชั้นนั้น · สมาชิก = รหัส อาคาร-ชั้น-ห้อง (เช่น A-L2-201)'],['ขนาดห้อง: กว้าง × ยาว (m) หรือพื้นที่ (m²) + เส้นรอบรูป (m) ตามแบบ (ค่าที่กรอกใช้ก่อน) · สูงฝ้า (m)'],['รหัสพื้น / บัว / ผนัง / ฝ้า ตามคลังวัสดุผิวใน General Spec · ผนังส่วนล่าง = วัสดุผนังช่วงล่างถึงความสูงที่กำหนด'],[],['Openings: ตำแหน่ง = อาคาร-ชั้น-ห้อง หรือ อาคาร-ชั้น ตามด้วย ×จำนวน คั่นหลายตำแหน่งด้วย ; เช่น A-L2-201×2; A-L2-202'],['ประตู / หน้าต่างที่วางในห้องจะถูกหักออกจากผนัง (และบัวสำหรับประตู) ด้วยปุ่ม “หักช่องเปิดจากตารางประตู-หน้าต่าง”'],[],['Fixtures: สุขภัณฑ์ / ครุภัณฑ์ / ป้าย · ตำแหน่งเหมือน Openings · Rooms: กันซึม = รหัส WP + ยกขอบ (m)'],['Walls: ผนังก่อหนึ่งแนวต่อแถว · ชนิดผนัง WT จากคลังวัสดุผิว · ช่องเปิดใช้รหัสแบบจากแผ่นงาน Openings เช่น D1×2; W1 · เสาเอ็น ทับหลัง คานเอ็นคิดให้']]);
 await save(wb,`${name}-arch-schedules.xlsx`);
}
export async function readArchSchedules(file:File):Promise<{rooms:RoomRow[];openings:OpeningRow[];walls:WallRow[];fixtures:FixtureRow[]}>{
 const wb=await load(file),rooms=wb.getWorksheet('Rooms'),openings=wb.getWorksheet('Openings'),walls=wb.getWorksheet('Walls'),fixtures=wb.getWorksheet('Fixtures');
 if(!rooms&&!openings&&!walls&&!fixtures)throw Error('ไม่พบแผ่นงาน Rooms / Openings / Walls / Fixtures');
 return {rooms:rowsOf(rooms,(c,source)=>({building:c(0),level:c(1),room:c(2),name:c(3),width:c(4),length:c(5),area:c(6),perimeter:c(7),height:c(8),floor:c(9),skirting:c(10),wall:c(11),ceiling:c(12),dado:c(13),dadoHeight:c(14),waterproof:c(15),upturn:c(16),source})),
  openings:rowsOf(openings,(c,source)=>({code:c(0),type:c(1),description:c(2),width:c(3),height:c(4),locations:c(5),quantity:c(6),source})),
  fixtures:rowsOf(fixtures,(c,source)=>({code:c(0),description:c(1),unit:c(2),locations:c(3),quantity:c(4),source})),
  walls:rowsOf(walls,(c,source)=>({building:c(0),level:c(1),code:c(2),type:c(3),length:c(4),height:c(5),thickness:c(6),openings:c(7),stiffenerSpacing:c(8),tieBeams:c(9),quantity:c(10),source}))};
}
