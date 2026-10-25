import {locationKindLabels,type Locations} from '../domain/locations';
import {parseKind,rowsFromLocations,type WbsImportRow} from '../domain/wbsImport';

function download(blob:Blob,name:string){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
// Project WBS ⇄ Excel: one row per node; child rows name their building / external work in column 1.
const head=['อาคาร / งานภายนอก (รหัส)','ประเภท (อาคาร · งานภายนอก · ชั้น · โซน · ช่วง)','รหัส','ชื่อ','ระดับ SSL (m)','Chainage เริ่ม (m)','Chainage สิ้นสุด (m)','โซนใช้กับชั้น (รหัส คั่นด้วย ,)','หมายเหตุ','IFC GlobalId'];
const text=(v:unknown)=>{if(v&&typeof v==='object'&&'result'in v)return String((v as {result:unknown}).result??'');if(v&&typeof v==='object'&&'richText'in v)return (v as {richText:{text:string}[]}).richText.map(r=>r.text).join('');return String(v??'').trim();};
const num=(v:string)=>{if(!v)return undefined;const n=Number(v.replace(/,/g,''));return Number.isFinite(n)?n:NaN;};
const sample:WbsImportRow[]=[{root:'A',kind:'building',code:'A',name:'อาคาร A',source:''},{root:'A',kind:'level',code:'FDN',name:'ฐานราก',elevation:-1500,source:''},{root:'A',kind:'level',code:'GF',name:'ชั้นล่าง',elevation:0,source:''},{root:'A',kind:'level',code:'L1',name:'ชั้น 1',elevation:3500,source:''},{root:'A',kind:'zone',code:'Z1',name:'Zone 1',source:''},{root:'A',kind:'zone',code:'Z2',name:'Zone 2',levels:['L1'],source:''},{root:'EXT',kind:'external',code:'EXT',name:'งานภายนอกอาคาร',source:''},{root:'EXT',kind:'segment',code:'ROAD-01',name:'ถนน',chainage:{from:0,to:100},source:''}];

export async function exportWbsExcel(locations:Locations|undefined,name:string){
 const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();wb.creator='FORM BOQ & BBS';
 const ws=wb.addWorksheet('WBS'),rows=rowsFromLocations(locations);ws.addRow(head);
 for(const r of rows.length?rows:sample)ws.addRow([r.root,locationKindLabels[r.kind],r.code,r.name,r.elevation===undefined?null:r.elevation/1000,r.chainage?.from??null,r.chainage?.to??null,r.levels?.join(', ')||null,r.note||null,r.ifcGuid||null]);
 ws.views=[{state:'frozen',ySplit:1}];ws.columns.forEach((c,i)=>{c.width=[16,16,12,26,12,12,12,22,24,24][i];});
 ws.getRow(1).height=36;ws.getRow(1).eachCell(c=>{c.font={name:'Sarabun',bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};c.alignment={wrapText:true,vertical:'middle'};});
 const bytes=await wb.xlsx.writeBuffer();download(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${name}-wbs.xlsx`);
}

/** Rows of the WBS sheet (header row 1); problems per row are returned, not thrown. */
export async function readWbsExcel(file:File):Promise<{rows:WbsImportRow[];problems:string[]}>{
 const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
 const ws=wb.getWorksheet('WBS')||wb.worksheets[0];if(!ws)throw Error('ไม่พบแผ่นงาน');
 const rows:WbsImportRow[]=[],problems:string[]=[];
 ws.eachRow((row,i)=>{
  if(i===1)return;const c=(k:number)=>text(row.getCell(k+1).value),source=`แถว ${i}`;
  if(!c(0)&&!c(1)&&!c(2))return;
  const kind=parseKind(c(1));if(!kind)return void problems.push(`${source}: ประเภท “${c(1)}” ไม่รู้จัก (อาคาร · งานภายนอก · ชั้น · โซน · ช่วง)`);
  const code=c(2).toUpperCase().replace(/\s+/g,''),root=(c(0)||(kind==='building'||kind==='external'?code:'')).toUpperCase().replace(/\s+/g,'');
  if(!/^[A-Z0-9+._-]{1,20}$/.test(code))return void problems.push(`${source}: รหัส “${c(2)}” ใช้ A–Z 0–9 + . _ - ไม่เกิน 20 ตัว`);
  if(!root)return void problems.push(`${source}: ไม่ระบุอาคาร / งานภายนอกของ ${code}`);
  const elev=num(c(4)),from=num(c(5)),to=num(c(6));
  if(Number.isNaN(elev)||Number.isNaN(from)||Number.isNaN(to))return void problems.push(`${source}: ระดับ / Chainage ต้องเป็นตัวเลข`);
  rows.push({root,kind,code,name:c(3).slice(0,120),source,...(elev!==undefined&&kind==='level'?{elevation:Math.round(elev*1000)}:{}),...(kind==='segment'&&(from!==undefined||to!==undefined)?{chainage:{from:from??0,to:to??from??0}}:{}),...(kind==='zone'&&c(7)?{levels:c(7).split(/[,;\s]+/).map(s=>s.toUpperCase()).filter(Boolean)}:{}),...(c(8)?{note:c(8).slice(0,500)}:{}),...(c(9)?{ifcGuid:c(9).slice(0,64)}:{})});
 });
 if(!rows.length&&!problems.length)problems.push('ไม่มีแถวข้อมูลในแผ่นงาน WBS');
 return {rows,problems};
}
