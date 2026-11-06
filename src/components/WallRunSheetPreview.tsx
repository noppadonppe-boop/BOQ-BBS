import {useMemo,useState} from 'react';
import {Download,FileDown,FileSpreadsheet} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {takeoff} from '../domain/engine';
import {labelReport} from '../domain/labelQa';
import {wallBbsModes,wallPagesOf,wallSheetLabelViews,type WallBbsMode,type WallLabelMode,type WallRow} from '../domain/wallRunSheet';
import {PrimsSvg} from './PrimsSvg';

const safeName=(s:string)=>s.replace(/[\\/:*?"<>|\s]+/g,'_');
/** Wall Run sheet set (docs/WALL_RUN.md): drawing page + BBS pages in one of 3 presentations; PDF, DXF (A / B / C), Excel. */
export function WallRunSheetPreview({member,project,dirty,onStandard}:{member:Member;project:Project;dirty:boolean;onStandard?:()=>void}){
 const [mode,setMode]=useState<WallBbsMode>(member.drawingSetup?.wallBbs||'lift'),[labels,setLabels]=useState<WallLabelMode>(member.drawingSetup?.wallLabels||'typ'),[page,setPage]=useState(0),[dxfMode,setDxfMode]=useState<'B'|'C'|'A'>('B');
 const qty=member.occurrences.reduce((n,o)=>n+o.quantity,0)||1;
 const rows=useMemo(()=>takeoff(member,project.spec).rows as unknown as WallRow[],[member,project.spec]);
 const opts={mode,qty,status:dirty?'DRAFT · ยังไม่บันทึก':'DRAFT / NOT FOR CONSTRUCTION',date:new Date().toISOString().slice(0,10),revision:`D${member.version}`};
 const pages=useMemo(()=>wallPagesOf({member,rows:rows as never,project,quantity:qty,status:opts.status,revision:opts.revision,date:opts.date,wall:{mode,labels}}),[member,rows,project,mode,labels,dirty,qty]);
 const p=pages[Math.min(page,pages.length-1)];
 const qa=useMemo(()=>p?labelReport(p.prims,wallSheetLabelViews(p)):[],[p]),high=qa.reduce((n,r)=>n+r.high,0),low=qa.reduce((n,r)=>n+r.low,0);
 if(!p)return <section className="panel padded"><p className="notice">กด “สร้างเหล็ก + ใช้กับสมาชิก” ในแท็บข้อมูลพื้นฐานก่อน</p></section>;
 const total=rows.reduce((n,r)=>n+r.weight,0)*qty;
 const pdf=async()=>{const [{jsPDF},{drawPrims},{font,download}]=await Promise.all([import('jspdf'),import('../data/primsPdf'),import('../data/exports')]);
  const f=p.size.toLowerCase() as 'a3'|'a2',doc=new jsPDF({orientation:'landscape',unit:'mm',format:f});await font(doc);pages.forEach((q,k)=>{if(k)doc.addPage(q.size.toLowerCase(),'landscape');drawPrims(doc,q.prims);});
  download(doc.output('blob'),safeName(`${project.code}-W-${member.code}.pdf`));};
 const dxf=async()=>{const [{exportBbsDxf},{cadStandardOf},{download}]=await Promise.all([import('../data/dxf'),import('../domain/cadStandard'),import('../data/exports')]);
  download(new Blob([exportBbsDxf(pages.map(q=>({prims:q.prims,views:q.views,w:q.w,h:q.h,size:q.size})),{mode:dxfMode,cad:cadStandardOf(project.spec)})],{type:'application/dxf'}),safeName(`${project.code}-W-${member.code}-${dxfMode}.dxf`));};
 const excel=async()=>{const [{default:ExcelJS},{appendWallRunSheets},{download}]=await Promise.all([import('exceljs'),import('../data/wallRunExcel'),import('../data/exports')]);
  const wb=new ExcelJS.Workbook();appendWallRunSheets(wb,[member],()=>({rows,quantity:qty}));download(new Blob([await wb.xlsx.writeBuffer() as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),safeName(`${project.code}-W-${member.code}-by-lift.xlsx`));};
 return <section className="sheet-preview wall-sheet" aria-label="แผ่นแบบผนัง Wall Run">
  <div className="sheet-toolbar"><b>แผ่นผนัง · {p.size} · {p.title}{member.sheetLayout?' · จัดหน้าเอง':''}</b>
   <span className="segmented" role="group" aria-label="การนำเสนอ BBS">{wallBbsModes.map(m=><button key={m.id} type="button" aria-pressed={mode===m.id} className={mode===m.id?'active':''} onClick={()=>{setMode(m.id);setPage(0);}}>{m.label}</button>)}</span>
   <span className="actions"><button disabled={!page} onClick={()=>setPage(page-1)}>‹</button><span>แผ่น {Math.min(page,pages.length-1)+1}/{pages.length}</span><button disabled={page+1>=pages.length} onClick={()=>setPage(page+1)}>›</button></span>
   <span className={high?'qa-bad':'qa-ok'} title="ตรวจป้าย Mark: ทับกัน / เส้นชี้ไขว้ / ล้นกรอบ = สำคัญ · ชิด / ทับเส้น / ยาว = ควรปรับ">ป้าย Mark: {high?`${high} สำคัญ`:'ไม่มีปัญหาสำคัญ'}{low?` · ควรปรับ ${low}`:''}</span>
   <select aria-label="โหมด DXF" value={dxfMode} onChange={e=>setDxfMode(e.target.value as 'B'|'C'|'A')}><option value="B">DXF B · Model + Viewport</option><option value="C">DXF C · Model</option><option value="A">DXF A · พิกัดกระดาษ</option></select>
   <button onClick={()=>void dxf()}><FileDown size={14}/>DXF</button><button onClick={()=>void excel()}><FileSpreadsheet size={14}/>Excel</button><button className="primary" onClick={()=>void pdf()}><Download size={14}/>PDF {p.size}</button>
   <label className="check" title="ป้ายเต็มทุกด้าน (ปกติ: ป้ายเต็มครั้งเดียวต่อ Mark ต่อด้าน + TYP. ที่เหลือเป็นรหัสสั้น)"><input type="checkbox" checked={labels==='all'} onChange={e=>setLabels(e.target.checked?'all':'typ')}/>ป้ายทุกจุด</label>
   {onStandard&&<button type="button" onClick={onStandard} title="ย้าย / ปรับขนาด / มาตราส่วนรูปบนแผ่น · บันทึก layout · Template จัดหน้า">จัดหน้าแบบ (Sheet Composer)</button>}</div>
  <div className="sheet-paper"><svg viewBox={`0 0 ${p.w} ${p.h}`} role="img" fontFamily="Sarabun, sans-serif"><rect x={0} y={0} width={p.w} height={p.h} fill="#fff"/><PrimsSvg prims={p.prims}/></svg></div>
  <p className="muted">เหล็กรวม {total.toLocaleString('en-US',{maximumFractionDigits:1})} kg (× {qty} ชุด) · ทั้ง 3 แบบการนำเสนอรวมน้ำหนักเท่ากัน · Elevation คลี่ = เหล็กตัวแทน + เส้นช่วงกระจาย 1 เส้นต่อ Mark ต่อด้าน</p>
 </section>;
}
