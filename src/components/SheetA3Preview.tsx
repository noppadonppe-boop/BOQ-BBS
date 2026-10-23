import {useEffect,useMemo,useState} from 'react';
import {loadProjectLogo,type LoadedLogo} from '../data/projectLogo';
import {Download,FileDown} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {takeoff,sum} from '../domain/engine';
import {quantityBasisState} from '../domain/quantityBasis';
import {elementInputSchema} from '../domain/elementInput';
import {SHEET,drawSheet,sheetPageCount,type SheetData} from '../domain/bbsSheet';
import {sheetLangOf,sheetLangs,sheetText,type SheetLang} from '../domain/sheetText';
import {PrimsSvg} from './PrimsSvg';

/** On-screen A3 sheet: identical primitives to the exported PDF (layout sheet-a3-v10).
 * The language switch shows the sheet at once and saves it as the project sheet language (used by the PDF). */
export function SheetA3Preview({member,project,dirty,onExport,onLanguage}:{member:Member;project:Project;dirty:boolean;onExport:()=>void;onLanguage?:(lang:SheetLang)=>Promise<void>}){
 const [page,setPage]=useState(0),[logo,setLogo]=useState<LoadedLogo>(),saved=sheetLangOf(project),[lang,setLang]=useState<SheetLang>(saved),[saving,setSaving]=useState(false);
 useEffect(()=>setLang(saved),[saved]);
 useEffect(()=>{let live=true;setLogo(undefined);loadProjectLogo(project).then(l=>{if(live)setLogo(l);}).catch(()=>{});return()=>{live=false;};},[project.logo?.path]);
 const data=useMemo<SheetData>(()=>{const q=takeoff(member,project.spec),parsed=elementInputSchema.safeParse(member.elementInput),shown={...project,titleBlock:{...project.titleBlock,sheetLanguage:lang}};
  return {member,rows:q.rows,input:parsed.success?parsed.data:undefined,project:shown,quantity:sum(member.occurrences.map(o=>o.quantity)),takeoff:q,status:dirty?sheetText[lang].unsaved:'DRAFT / NOT FOR CONSTRUCTION',revision:'D'+project.version,date:new Date().toISOString().slice(0,10),provisional:quantityBasisState(member)==='Provisional',logo};},[member,project,dirty,logo,lang]);
 const pages=sheetPageCount(data),safe=Math.min(page,pages-1),prims=useMemo(()=>drawSheet(data,safe),[data,safe]);
 // same primitives as the preview / PDF, every page of this member, in the language shown
 const exportDxf=async()=>{const {primsDxf}=await import('../data/primsDxf');
  const dxf=primsDxf(Array.from({length:pages},(_,i)=>drawSheet(data,i)),{w:SHEET.w,h:SHEET.h},lang==='zh'?'simsun.ttc':'tahoma.ttf'),a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([dxf],{type:'application/dxf'}));a.download=`${project.code}-${member.code}-BBS-${lang.toUpperCase()}.dxf`.replace(/[\\/:*?"<>|\s]+/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 const choose=async(next:SheetLang)=>{if(next===lang)return;setLang(next);if(!onLanguage||next===saved)return;setSaving(true);try{await onLanguage(next);}finally{setSaving(false);}};
 return <section className="sheet-preview" aria-label="แบบ BBS A3">
  <div className="sheet-toolbar"><b>แบบ & BBS · A3 (420 × 297 mm) · กรอบมาตรฐาน</b>
   <span className="segmented" role="group" aria-label="ภาษาในแบบ">{sheetLangs.map(l=><button key={l.id} type="button" className={lang===l.id?'active':''} aria-pressed={lang===l.id} disabled={saving} onClick={()=>void choose(l.id)}>{l.label}</button>)}</span>
   {lang!==saved&&<small className="muted">{saving?'กำลังบันทึกภาษา…':'ภาษานี้แสดงบนจอเท่านั้น · PDF ใช้ภาษาที่บันทึกในโครงการ'}</small>}
   {pages>1&&<span className="actions"><button disabled={!safe} onClick={()=>setPage(safe-1)}>แผ่นก่อนหน้า</button><span>แผ่น {safe+1}/{pages}</span><button disabled={safe+1>=pages} onClick={()=>setPage(safe+1)}>แผ่นถัดไป</button></span>}
   <button disabled={dirty||saving} title={dirty?'บันทึกสมาชิกก่อนส่งออก':'ไฟล์ CAD (DXF R12 · mm) ทุกแผ่นของสมาชิกนี้ วางเรียงกัน'} onClick={()=>void exportDxf()}><FileDown size={14}/>ส่งออก DXF</button>
   <button className="primary" disabled={dirty||saving} title={dirty?'บันทึกสมาชิกก่อนส่งออก':undefined} onClick={onExport}><Download size={14}/>ส่งออก PDF A3</button></div>
  <div className="sheet-paper"><svg viewBox={`0 0 ${SHEET.w} ${SHEET.h}`} role="img" fontFamily="Sarabun, 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif"><rect x={0} y={0} width={SHEET.w} height={SHEET.h} fill="#fff"/><PrimsSvg prims={prims}/></svg></div>
  <p className="muted">ตัวอย่างนี้ใช้ชุดคำสั่งวาดเดียวกับไฟล์ PDF · ไฟล์ส่งออกใช้ข้อมูลที่บันทึกแล้ว (snapshot) และลงทะเบียน checksum · ภาษาที่เลือกบันทึกเป็นภาษาแบบของโครงการ (ทุกสมาชิก)</p>
 </section>;
}
