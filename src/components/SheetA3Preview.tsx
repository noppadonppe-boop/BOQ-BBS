import {useEffect,useMemo,useState} from 'react';
import {loadProjectLogo,type LoadedLogo} from '../data/projectLogo';
import {Download} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {takeoff,sum} from '../domain/engine';
import {quantityBasisState} from '../domain/quantityBasis';
import {elementInputSchema} from '../domain/elementInput';
import {SHEET,drawSheet,sheetPageCount,type SheetData} from '../domain/bbsSheet';
import {PrimsSvg} from './PrimsSvg';

/** On-screen A3 sheet: identical primitives to the exported PDF (layout sheet-a3-v10). */
export function SheetA3Preview({member,project,dirty,onExport}:{member:Member;project:Project;dirty:boolean;onExport:()=>void}){
 const [page,setPage]=useState(0),[logo,setLogo]=useState<LoadedLogo>();
 useEffect(()=>{let live=true;setLogo(undefined);loadProjectLogo(project).then(l=>{if(live)setLogo(l);}).catch(()=>{});return()=>{live=false;};},[project.logo?.path]);
 const data=useMemo<SheetData>(()=>{const q=takeoff(member,project.spec),parsed=elementInputSchema.safeParse(member.elementInput);
  return {member,rows:q.rows,input:parsed.success?parsed.data:undefined,project,quantity:sum(member.occurrences.map(o=>o.quantity)),takeoff:q,status:dirty?'DRAFT · ยังไม่บันทึก':'DRAFT / NOT FOR CONSTRUCTION',revision:'D'+project.version,date:new Date().toISOString().slice(0,10),provisional:quantityBasisState(member)==='Provisional',logo};},[member,project,dirty,logo]);
 const pages=sheetPageCount(data),safe=Math.min(page,pages-1),prims=useMemo(()=>drawSheet(data,safe),[data,safe]);
 return <section className="sheet-preview" aria-label="แบบ BBS A3">
  <div className="sheet-toolbar"><b>แบบ & BBS · A3 (420 × 297 mm) · กรอบมาตรฐาน</b>
   {pages>1&&<span className="actions"><button disabled={!safe} onClick={()=>setPage(safe-1)}>แผ่นก่อนหน้า</button><span>แผ่น {safe+1}/{pages}</span><button disabled={safe+1>=pages} onClick={()=>setPage(safe+1)}>แผ่นถัดไป</button></span>}
   <button className="primary" disabled={dirty} title={dirty?'บันทึกสมาชิกก่อนส่งออก':undefined} onClick={onExport}><Download size={14}/>ส่งออก PDF A3</button></div>
  <div className="sheet-paper"><svg viewBox={`0 0 ${SHEET.w} ${SHEET.h}`} role="img" fontFamily="Sarabun, sans-serif"><rect x={0} y={0} width={SHEET.w} height={SHEET.h} fill="#fff"/><PrimsSvg prims={prims}/></svg></div>
  <p className="muted">ตัวอย่างนี้ใช้ชุดคำสั่งวาดเดียวกับไฟล์ PDF · ไฟล์ส่งออกใช้ข้อมูลที่บันทึกแล้ว (snapshot) และลงทะเบียน checksum</p>
 </section>;
}
