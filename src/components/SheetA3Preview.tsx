import {useEffect,useMemo,useState} from 'react';
import {loadProjectLogo,type LoadedLogo} from '../data/projectLogo';
import {Download,FileDown} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {takeoff,sum} from '../domain/engine';
import {quantityBasisState} from '../domain/quantityBasis';
import {elementInputSchema} from '../domain/elementInput';
import {drawSheet,drawSheetInfo,sheetFormat,sheetPageCount,type SheetData} from '../domain/bbsSheet';
import {sheetSetupOf,sheetStyleKeys,viewScaleChoices,viewScaleLabel,type SheetStyle,type ViewScale} from '../domain/drawingStandard';
import {sheetLangOf,sheetLangs,sheetText,type SheetLang} from '../domain/sheetText';
import {PrimsSvg} from './PrimsSvg';

/** On-screen BBS sheet (A3 / A2): identical primitives to the exported PDF (layout sheet-a3-v10).
 * The language switch shows the sheet at once and saves it as the project sheet language (used by the PDF).
 * Paper / view scale / drawing style: project default (Title block) or this member's override (`onSheetSetup`,
 * null = use the default). */
export function SheetA3Preview({member,project,dirty,onExport,onLanguage,onSheetSetup}:{member:Member;project:Project;dirty:boolean;onExport:()=>void;onLanguage?:(lang:SheetLang)=>Promise<void>;onSheetSetup?:(patch:SheetStyle|null)=>void}){
 const [page,setPage]=useState(0),[logo,setLogo]=useState<LoadedLogo>(),saved=sheetLangOf(project),[lang,setLang]=useState<SheetLang>(saved),[saving,setSaving]=useState(false);
 useEffect(()=>setLang(saved),[saved]);
 useEffect(()=>{let live=true;setLogo(undefined);loadProjectLogo(project).then(l=>{if(live)setLogo(l);}).catch(()=>{});return()=>{live=false;};},[project.logo?.path]);
 const data=useMemo<SheetData>(()=>{const q=takeoff(member,project.spec),parsed=elementInputSchema.safeParse(member.elementInput),shown={...project,titleBlock:{...project.titleBlock,sheetLanguage:lang}};
  return {member,rows:q.rows,input:parsed.success?parsed.data:undefined,project:shown,quantity:sum(member.occurrences.map(o=>o.quantity)),takeoff:q,status:dirty?sheetText[lang].unsaved:'DRAFT / NOT FOR CONSTRUCTION',revision:'D'+project.version,date:new Date().toISOString().slice(0,10),provisional:quantityBasisState(member)==='Provisional',logo};},[member,project,dirty,logo,lang]);
 const pages=sheetPageCount(data),safe=Math.min(page,pages-1),info=useMemo(()=>drawSheetInfo(data,safe),[data,safe]),prims=info.prims,F=sheetFormat(data);
 const def=sheetSetupOf(project),own=sheetStyleKeys.some(key=>member.drawingSetup?.[key]!==undefined);
 const misfit=info.scales.filter(v=>!v.fits);
 // same primitives as the preview / PDF, every page of this member, in the language shown
 const exportDxf=async()=>{const {primsDxf}=await import('../data/primsDxf');
  const dxf=primsDxf(Array.from({length:pages},(_,i)=>drawSheet(data,i)),{w:F.w,h:F.h},lang==='zh'?'simsun.ttc':'tahoma.ttf'),a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([dxf],{type:'application/dxf'}));a.download=`${project.code}-${member.code}-BBS-${lang.toUpperCase()}.dxf`.replace(/[\\/:*?"<>|\s]+/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 const choose=async(next:SheetLang)=>{if(next===lang)return;setLang(next);if(!onLanguage||next===saved)return;setSaving(true);try{await onLanguage(next);}finally{setSaving(false);}};
 return <section className="sheet-preview" aria-label={`แบบ BBS ${F.size}`}>
  <div className="sheet-toolbar"><b>แบบ & BBS · {F.size} ({F.w} × {F.h} mm)</b>
   <span className="segmented" role="group" aria-label="ขนาดกระดาษ">{(['A3','A2'] as const).map(z=><button key={z} type="button" className={F.size===z?'active':''} aria-pressed={F.size===z} disabled={!onSheetSetup} onClick={()=>onSheetSetup?.({sheetSize:z})}>{z}</button>)}</span>
   <span className="segmented" role="group" aria-label="การจัดหน้า" title="แบบเดิม = รูป + ตารางในแผ่นเดียว · แบบใหม่ = แผ่นแรกตาราง BBS + BOQ แล้วรูปใหญ่ในแผ่นถัดไป">{([['one','แบบเดิม'],['split','ตารางก่อน · แบบหน้าถัดไป']] as const).map(([v,t])=><button key={v} type="button" className={F.layout===v?'active':''} aria-pressed={F.layout===v} disabled={!onSheetSetup} onClick={()=>{setPage(0);onSheetSetup?.({sheetLayout:v});}}>{t}</button>)}</span>
   {F.layout==='split'&&<label className="sheet-scale"><span>รูปต่อหน้า</span><select value={String(F.perPage)} disabled={!onSheetSetup} onChange={e=>{setPage(0);onSheetSetup?.({viewsPerPage:Number(e.target.value)});}}><option value="0">อัตโนมัติ (แปลน / รูปตัด)</option><option value="1">1 รูป / หน้า</option><option value="2">2 รูป / หน้า</option><option value="3">3 รูป / หน้า</option></select></label>}
   <label className="sheet-scale"><span>มาตราส่วนรูป</span><select value={String(F.scale)} disabled={!onSheetSetup} onChange={e=>onSheetSetup?.({viewScale:e.target.value==='auto'?'auto':Number(e.target.value)})}>{(['auto',...viewScaleChoices] as ViewScale[]).map(v=><option key={String(v)} value={String(v)}>{v==='auto'?'Auto (มาตรฐานที่พอดีกรอบ)':viewScaleLabel(v)}</option>)}</select></label>
   <label className="sheet-scale"><span>เหล็กในแปลน</span><select value={F.bars} disabled={!onSheetSetup} onChange={e=>onSheetSetup?.({barDisplay:e.target.value==='all'?'all':'representative'})}><option value="representative">ตัวแทน + ช่วงกระจาย</option><option value="all">ทุกเส้น</option></select></label>
   <label className="check"><input type="checkbox" checked={F.split} disabled={!onSheetSetup} onChange={e=>onSheetSetup?.({planSplit:e.target.checked})}/>แยกแปลนล่าง / บน</label>
   <label className="check"><input type="checkbox" checked={F.gutter} disabled={!onSheetSetup} onChange={e=>onSheetSetup?.({markGutter:e.target.checked})}/>ป้าย Mark นอกรูป</label>
   {own?<button type="button" disabled={!onSheetSetup} title={`ค่าโครงการ: ${def.size} · ${def.layout==='split'?'ตารางก่อน · ':''}${viewScaleLabel(def.scale)} · ${def.bars==='all'?'ทุกเส้น':'ตัวแทน'}${def.split?' · แยกแปลน':''}${def.gutter?' · ป้ายนอกรูป':''}`} onClick={()=>onSheetSetup?.(null)}>ใช้ค่าโครงการ</button>:<small className="muted">ค่าโครงการ</small>}
   <span className="segmented" role="group" aria-label="ภาษาในแบบ">{sheetLangs.map(l=><button key={l.id} type="button" className={lang===l.id?'active':''} aria-pressed={lang===l.id} disabled={saving} onClick={()=>void choose(l.id)}>{l.label}</button>)}</span>
   {lang!==saved&&<small className="muted">{saving?'กำลังบันทึกภาษา…':'ภาษานี้แสดงบนจอเท่านั้น · PDF ใช้ภาษาที่บันทึกในโครงการ'}</small>}
   {pages>1&&<span className="actions"><button disabled={!safe} onClick={()=>setPage(safe-1)}>แผ่นก่อนหน้า</button><span>แผ่น {safe+1}/{pages}</span><button disabled={safe+1>=pages} onClick={()=>setPage(safe+1)}>แผ่นถัดไป</button></span>}
   <button disabled={dirty||saving} title={dirty?'บันทึกสมาชิกก่อนส่งออก':'ไฟล์ CAD (DXF R12 · mm) ทุกแผ่นของสมาชิกนี้ วางเรียงกัน'} onClick={()=>void exportDxf()}><FileDown size={14}/>ส่งออก DXF</button>
   <button className="primary" disabled={dirty||saving} title={dirty?'บันทึกสมาชิกก่อนส่งออก':undefined} onClick={onExport}><Download size={14}/>ส่งออก PDF {F.size}</button></div>
  {misfit.length>0&&<p className="notice warning" role="status">{misfit.map(v=>v.title).join(', ')}: {viewScaleLabel(F.scale)} ไม่พอดีกรอบบน {F.size} · ใช้ {[...new Set(misfit.map(v=>v.n?`1:${v.n}`:'NTS'))].join(' / ')} แทน · เลือกมาตราส่วนเล็กลงหรือใช้กระดาษ A2</p>}
  {F.size==='A2'&&<p className="notice">A2 (594 × 420 mm) · พิมพ์บนกระดาษ A2 เท่านั้น · ย่อลง A3 ตัวหนังสือจะเล็กเกินอ่าน</p>}
  {F.size==='A3'&&info.scales.some(v=>v.title===sheetText[lang].planBottom)&&<p className="notice">แยกแปลนล่าง / บนบน A3 รูปจะเล็ก · แนะนำกระดาษ A2</p>}
  <div className="sheet-paper"><svg viewBox={`0 0 ${F.w} ${F.h}`} role="img" fontFamily="Sarabun, 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif"><rect x={0} y={0} width={F.w} height={F.h} fill="#fff"/><PrimsSvg prims={prims}/></svg></div>
  <p className="muted">ตัวอย่างนี้ใช้ชุดคำสั่งวาดเดียวกับไฟล์ PDF · ไฟล์ส่งออกใช้ข้อมูลที่บันทึกแล้ว (snapshot) และลงทะเบียน checksum · ภาษาที่เลือกบันทึกเป็นภาษาแบบของโครงการ (ทุกสมาชิก)</p>
 </section>;
}
