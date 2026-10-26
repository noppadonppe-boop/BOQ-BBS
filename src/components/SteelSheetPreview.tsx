import {useMemo,useState} from 'react';
import {Download,FileDown} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {STEEL_SHEET,drawSteelSheet,steelSheetPages} from '../domain/steelSheet';
import {PrimsSvg} from './PrimsSvg';

const safeName=(s:string)=>s.replace(/[\\/:*?"<>|\s]+/g,'_');
/** A3 material / bolt list sheet of a steel assembly: preview, PDF and DXF from the same primitives. */
export function SteelSheetPreview({member,project,dirty}:{member:Member;project:Project;dirty:boolean}){
 const [page,setPage]=useState(0),i=member.steelInput,pages=i?steelSheetPages(i):1,safe=Math.min(page,pages-1);
 const opts=(p:number)=>({page:p,status:dirty?'DRAFT · ยังไม่บันทึก':'FOR FABRICATION (CHECK BEFORE USE)',date:new Date().toISOString().slice(0,10),revision:`D${project.version}`});
 const prims=useMemo(()=>i?drawSteelSheet(member,project,opts(safe)):[],[member,project,safe,dirty]);
 if(!i)return <section className="panel padded"><p className="notice">กรอกชิ้นส่วนในแท็บ “Assembly เหล็ก” แล้วกด “คำนวณปริมาณ” ก่อน</p></section>;
 const all=()=>Array.from({length:pages},(_,p)=>drawSteelSheet(member,project,opts(p)));
 const pdf=async()=>{const [{jsPDF},{drawPrims},{font,download}]=await Promise.all([import('jspdf'),import('../data/primsPdf'),import('../data/exports')]);
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3'});await font(doc);all().forEach((p,k)=>{if(k)doc.addPage('a3','landscape');drawPrims(doc,p);});
  download(doc.output('blob'),safeName(`${project.code}-AS-${member.code}.pdf`));};
 const dxf=async()=>{const {primsDxf}=await import('../data/primsDxf'),a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([primsDxf(all(),{w:STEEL_SHEET.w,h:STEEL_SHEET.h},'tahoma.ttf')],{type:'application/dxf'}));a.download=safeName(`${project.code}-AS-${member.code}.dxf`);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 return <section className="sheet-preview" aria-label="Material / Bolt list A3">
  <div className="sheet-toolbar"><b>Assembly sheet · A3 · Material / Bolt list</b>
   {pages>1&&<span className="actions"><button disabled={!safe} onClick={()=>setPage(safe-1)}>แผ่นก่อนหน้า</button><span>แผ่น {safe+1}/{pages}</span><button disabled={safe+1>=pages} onClick={()=>setPage(safe+1)}>แผ่นถัดไป</button></span>}
   <button onClick={()=>void dxf()}><FileDown size={14}/>DXF</button><button className="primary" onClick={()=>void pdf()}><Download size={14}/>PDF A3</button></div>
  <div className="sheet-paper"><svg viewBox={`0 0 ${STEEL_SHEET.w} ${STEEL_SHEET.h}`} role="img" fontFamily="Sarabun, sans-serif"><rect x={0} y={0} width={STEEL_SHEET.w} height={STEEL_SHEET.h} fill="#fff"/><PrimsSvg prims={prims}/></svg></div>
  <p className="muted">ระยะ 4a: ตาราง Material list · Bolt list · รอยเชื่อม · รูปแผ่นเหล็ก · Elevation / Section พร้อมมิติและสัญลักษณ์เชื่อมอยู่ในระยะ 4b</p>
 </section>;
}
