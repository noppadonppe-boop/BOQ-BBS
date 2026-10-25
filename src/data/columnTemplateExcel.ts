import {layoutBarCount,sectionLayoutSchema,tiePatterns,type TiePattern} from '../domain/elementInput';
import {columnTemplatesSchema,mainText,newTemplateRow,parseMain,parseTie,splitMain,tieText,type ColumnTemplate} from '../domain/columnTemplates';

function download(blob:Blob,name:string){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
// Project Column Template ⇄ Excel: one row per level of a column type, as on the column schedule
// (main bars "32Y32", ties "5Y12@200(12@100)"); side bar counts may be left blank (split by the section sides).
const head=['Type','Inner tie pattern','Note','Level (bottom → top)','First storey on footing (Y/N)','B (mm)','D (mm)','Storey height (mm, 0 = per column)','Beam depth (mm, 0 = per column)','Main bars (nYd)','Bars per corner (1-3)','Side bars per X face','Side bars per Y face','Side bars in pairs (Y/N)','Ties nYd@S1(d@S2)','Section as drawn (JSON: bar positions + inner ties)'];
const yes=(v:unknown)=>/^(y|yes|true|1|ใช่)$/i.test(String(v??'').trim());
const num=(v:unknown)=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:NaN;};
const text=(v:unknown)=>{if(v&&typeof v==='object'&&'result'in v)return String((v as {result:unknown}).result??'');if(v&&typeof v==='object'&&'richText'in v)return (v as {richText:{text:string}[]}).richText.map(r=>r.text).join('');return String(v??'').trim();};

export async function exportColumnTemplates(list:ColumnTemplate[],name:string){
 const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();wb.creator='FORM BOQ & BBS';
 const ws=wb.addWorksheet('Column Templates'),info=wb.addWorksheet('Patterns');
 ws.addRow(head);
 for(const t of list)t.rows.forEach((r,k)=>ws.addRow([t.name,k?'':t.pattern,k?'':t.note,r.level,r.first?'Y':'N',r.width,r.depth,r.height,r.beamDepth,mainText(r).replace(/\/.*$/,''),r.main.corner.count,r.main.sideX.count,r.main.sideY.count,r.main.sideBundle===2?'Y':'N',tieText(r),r.layout?JSON.stringify(r.layout):'']));
 if(!list.length)ws.addRow(['C1','rectXY','fc\' 450 ksc','Footing → 2nd','Y',700,700,0,0,'32Y32',2,6,6,'N','5Y12@200(12@100)']);
 ws.views=[{state:'frozen',ySplit:1}];ws.columns.forEach((c,i)=>{c.width=[10,16,22,20,14,9,9,14,14,12,12,12,12,12,20,24][i];});
 ws.getRow(1).height=44;ws.getRow(1).eachCell(c=>{c.font={name:'Sarabun',bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};c.alignment={wrapText:true,vertical:'middle'};});
 info.addRows([['Inner tie pattern id'],...tiePatterns.map(p=>[p])]);info.getColumn(1).width=20;
 const bytes=await wb.xlsx.writeBuffer();download(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${name}-column-templates.xlsx`);
}

/** Read templates from the workbook; rows of the same Type in order = its levels bottom → top. Existing ids are kept by name. */
export async function importColumnTemplates(file:File,current:ColumnTemplate[]):Promise<{templates:ColumnTemplate[];notes:string[]}>{
 const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
 const ws=wb.getWorksheet('Column Templates')||wb.worksheets[0];if(!ws)throw Error('ไม่พบแผ่นงาน');
 const map=new Map<string,ColumnTemplate>(),errors:string[]=[];
 ws.eachRow((row,i)=>{
  if(i===1)return;
  const c=(k:number)=>text(row.getCell(k+1).value),name=c(0).slice(0,40);if(!name)return;
  const key=name.toUpperCase(),old=current.find(t=>t.name.toUpperCase()===key);
  const t=map.get(key)??{id:old?.id||crypto.randomUUID().replace(/-/g,'').slice(0,12),name,note:'',pattern:'auto' as TiePattern,rows:[]};
  if(!map.has(key)){const p=c(1);if(p&&!(tiePatterns as readonly string[]).includes(p))errors.push(`แถว ${i}: รูปแบบปลอกใน “${p}” ไม่รู้จัก`);else if(p)t.pattern=p as TiePattern;t.note=c(2).slice(0,300);map.set(key,t);}
  const main=parseMain(c(9)),tie=parseTie(c(14)),w=num(c(5)),d=num(c(6));
  if(!main)return void errors.push(`แถว ${i}: อ่านเหล็กยืน “${c(9)}” ไม่ได้ (เช่น 32Y32)`);
  if(!tie)return void errors.push(`แถว ${i}: อ่านเหล็กปลอก “${c(14)}” ไม่ได้ (เช่น 5Y12@200(12@100))`);
  if(!(w>0&&d>0))return void errors.push(`แถว ${i}: ขนาดหน้าตัดไม่ถูกต้อง`);
  const corner=Math.min(3,Math.max(1,Math.trunc(num(c(10)))||1)),sx=num(c(11)),sy=num(c(12)),split=splitMain(main.count,w,d,corner);
  const r=newTemplateRow(c(3).slice(0,40)||`ชั้น ${t.rows.length+1}`,c(4)?yes(c(4)):t.rows.length===0);
  r.width=w;r.depth=d;r.height=Math.max(0,num(c(7))||0);r.beamDepth=Math.max(0,num(c(8))||0);
  r.main={corner:{diameter:main.diameter,count:corner},sideX:{diameter:main.diameter,count:Number.isFinite(sx)&&c(11)!==''?Math.max(0,Math.trunc(sx)):split.sideX},sideY:{diameter:main.diameter,count:Number.isFinite(sy)&&c(12)!==''?Math.max(0,Math.trunc(sy)):split.sideY},sideBundle:yes(c(13))?2:1};
  r.tie={diameter:tie.diameter,sets:tie.sets,s1:tie.s1,s2:tie.s2};
  if(c(15)){let l;try{l=sectionLayoutSchema.safeParse(JSON.parse(c(15)));}catch{l=undefined;}
   if(!l?.success)return void errors.push(`แถว ${i} (${name}): รูปหน้าตัดตามแบบ (JSON) ไม่ถูกต้อง`);
   if(layoutBarCount(l.data)!==main.count)return void errors.push(`แถว ${i} (${name}): รูปหน้าตัดตามแบบมีเหล็ก ${layoutBarCount(l.data)} เส้น ไม่เท่ากับ ${main.count} ตามแบบ`);
   r.layout=l.data;}
  else if(4*corner+2*(r.main.sideX.count+r.main.sideY.count)!==main.count)errors.push(`แถว ${i} (${name}): เหล็กมุม + ด้าน = ${4*corner+2*(r.main.sideX.count+r.main.sideY.count)} ไม่เท่ากับ ${main.count} ตามแบบ`);
  t.rows.push(r);
 });
 if(errors.length)throw Error(errors.slice(0,8).join('\n')+(errors.length>8?`\n… อีก ${errors.length-8} รายการ`:''));
 const read=[...map.values()],templates=[...current.filter(t=>!map.has(t.name.toUpperCase())),...read];
 const parsed=columnTemplatesSchema.safeParse(templates);if(!parsed.success)throw Error(parsed.error.issues[0]?.message||'ข้อมูลไม่ถูกต้อง');
 return {templates:parsed.data,notes:[`อ่าน ${read.length} ประเภทเสา ${read.reduce((n,t)=>n+t.rows.length,0)} แถว`,...read.filter(t=>current.some(x=>x.id===t.id)).map(t=>`แทนที่ ${t.name}`)]};
}
