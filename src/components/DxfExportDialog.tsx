import {useEffect,useMemo,useState} from 'react';
import {FileDown} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {drawSheet,drawSheetInfo,type SheetData} from '../domain/bbsSheet';
import {cadFonts,cadStandardOf,defaultCadStandard} from '../domain/cadStandard';
import type {DxfMode,DxfSheet,DxfSummary} from '../data/dxf';
import {Modal} from './EditorControls';
import {HelpButton} from './HelpCenter';

/** Scales a CAD reader expects on a structural sheet; others (1:30, 1:40 …) are flagged. */
const PREFERRED=[1,2,5,10,20,25,50,75,100,200,250,500,1000];
const safeName=(s:string)=>s.replace(/[\\/:*?"<>|\s]+/g,'_');
type Page={d:SheetData;i:number};
const toDxf=(p:Page):DxfSheet=>{const s=drawSheetInfo(p.d,p.i);return {prims:s.prims,views:s.views,w:s.w,h:s.h,size:s.size};};

/** DXF export window (BBS sheets of one member, saved data): layout mode B (model 1:1 + layouts) / C (model only) /
 * A (sheet coordinates), editable object switches, CAD standard of the project spec, font, all sheets or one file per
 * Tag (ZIP), and a summary of what the file will hold. “R12” keeps the old line + text file. */
export function DxfExportDialog({member,project,pages,lang,onClose}:{member:Member;project:Project;pages:Page[];lang:string;onClose:()=>void}){
 const own=!!project.spec.cadStandard,[std,setStd]=useState<'project'|'app'>(own?'project':'app'),cad=useMemo(()=>std==='project'?cadStandardOf(project.spec):defaultCadStandard(),[std,project.spec]);
 const [mode,setMode]=useState<DxfMode>('B'),[r12,setR12]=useState(false),[font,setFont]=useState<string>(lang==='zh'?'simsun.ttc':cad.text.font);
 const [edit,setEdit]=useState({dims:true,leaders:true,mtext:true,markBlock:cad.mark.useBlock}),[split,setSplit]=useState(false),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const sets=useMemo(()=>{const m=new Map<SheetData,Page[]>();for(const p of pages)(m.get(p.d)||m.set(p.d,[]).get(p.d)!).push(p);return [...m.entries()];},[pages]);
 const sheets=useMemo(()=>pages.map(toDxf),[pages]);
 const [dxf,setDxf]=useState<typeof import('../data/dxf')>();
 useEffect(()=>{let live=true;void import('../data/dxf').then(m=>{if(live)setDxf(m);});return()=>{live=false;};},[]);
 const summary=useMemo<DxfSummary|undefined>(()=>{if(!dxf||r12)return;try{return dxf.buildBbsDxf(sheets,{mode,cad,font,edit}).summary;}catch{return;}},[dxf,sheets,mode,cad,font,edit,r12]);
 const views=sheets.flatMap(s=>s.views),nts=views.filter(v=>!v.n),odd=[...new Set(views.filter(v=>v.n&&!PREFERRED.includes(v.n)).map(v=>v.n))];
 const base=`${project.code}-${member.code}-BBS-${lang.toUpperCase()}${r12?'-R12':`-${mode}`}`;
 const run=async()=>{setBusy(true);setErr('');try{
  const {download}=await import('../data/exports'),lib=dxf||await import('../data/dxf'),opts={mode,cad,font,edit};
  const one=async(list:Page[])=>r12?(await import('../data/primsDxf')).primsDxf(list.map(p=>drawSheet(p.d,p.i)),{w:list[0]?toDxf(list[0]).w:420,h:list[0]?toDxf(list[0]).h:297},font):lib.exportBbsDxf(list.map(toDxf),opts);
  if(split&&sets.length>1){const {default:JSZip}=await import('jszip'),zip=new JSZip();
   for(const [d,list] of sets){const tag=d.scope?.kind==='tag'?d.scope.tag:d.scope?.kind==='summary'?'SUMMARY':'ALL';zip.file(safeName(`${project.code}-${member.code}-${tag}-BBS-${lang.toUpperCase()}${r12?'-R12':`-${mode}`}.dxf`),await one(list));}
   download(await zip.generateAsync({type:'blob'}),safeName(`${base}.zip`));}
  else download(new Blob([await one(pages)],{type:'application/dxf'}),safeName(`${base}.dxf`));
  onClose();}catch(e){setErr(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const box=(k:keyof typeof edit,title:string,note:string,n?:number)=><label className="dxf-option"><input type="checkbox" checked={edit[k]} disabled={r12} onChange={e=>setEdit({...edit,[k]:e.target.checked})}/><span><b>{title}</b><small>{note}</small></span>{n!==undefined&&<code>{n}</code>}</label>;
 return <Modal title={`ส่งออก DXF · ${member.code}`} onClose={onClose}>
  <div className="dxf-export">
   <div className="dxf-left">
    <h4>1. รูปแบบไฟล์ <HelpButton topic="dxf-export"/></h4>
    <div className="dxf-modes" role="radiogroup" aria-label="รูปแบบการจัดวาง">{([['B','B · Model + Layout','ค่าเริ่มต้น · รูปขนาดจริง · viewport ตามมาตราส่วน'],['C','C · Model อย่างเดียว','กรอบแผ่นขยาย ×N · รูปขนาดจริง'],['A','A · พิกัดกระดาษ','ตำแหน่งเหมือน PDF · Dimension ใช้ DIMLFAC']] as const).map(([v,t,n])=>
     <label key={v} className={mode===v&&!r12?'active':''}><input type="radio" name="dxf-mode" checked={mode===v} disabled={r12} onChange={()=>setMode(v)}/><span><b>{t}</b><small>{n}</small></span></label>)}</div>
    <label className="check"><input type="checkbox" checked={r12} onChange={e=>setR12(e.target.checked)}/>ไฟล์แบบเดิม R12 (เส้นและข้อความตายตัว · พิกัดกระดาษ) สำหรับโปรแกรมรุ่นเก่า</label>
    <label className="field inline"><span>เวอร์ชัน DXF</span><select value="2018" disabled={r12} onChange={()=>{}}><option value="2018">AutoCAD 2018 (AC1032)</option><option disabled>AutoCAD 2013 (AC1027) · รอบถัดไป</option><option disabled>AutoCAD 2010 (AC1024) · รอบถัดไป</option></select></label>
    <h4>2. Object ที่แก้ไขได้</h4>
    <div className="dxf-options">
     {box('dims','Dimension → DIMENSION','DIMSTYLE BBS-DIM-1-n ตามมาตราส่วน · ปิด = เส้น + ข้อความแบบเดิม',summary?.dims)}
     {box('leaders','Leader → LEADER','เส้นชี้ป้าย Mark ที่เหล็ก (จุดที่เหล็กเป็น HATCH)',summary?.leaders)}
     {box('mtext','ข้อความ → MTEXT','หมายเหตุ / ช่องตารางเป็นก้อนเดียว · ไทย / จีนเป็น UTF-8',summary?.mtext)}
     {box('markBlock','ป้าย Mark → Block + Attribute',`Block ${cad.mark.blockName}: LABEL / MARK / N / SIZE / SPACING · แก้ด้วย ATTEDIT`,summary?.marks)}
     <p className="muted">ตาราง BBS / BOQ / Title block: เส้น + MTEXT รายช่อง (ไม่ใช้ AutoCAD TABLE)</p>
    </div>
    <h4>3. มาตรฐาน CAD</h4>
    <div className="form-grid">
     <label className="field"><span>ชุดมาตรฐาน</span><select value={std} disabled={r12} onChange={e=>setStd(e.target.value as 'project'|'app')}>{own&&<option value="project">General Spec ของโครงการ</option>}<option value="app">ค่าเริ่มต้นของแอป (S-*)</option></select></label>
     <label className="field"><span>ฟอนต์ (STYLE)</span><select value={font} onChange={e=>setFont(e.target.value)}>{cadFonts.map(f=><option key={f}>{f}</option>)}</select></label>
    </div>
    <h4>4. แผ่นที่ส่งออก</h4>
    <div className="actions"><label className="check"><input type="radio" name="dxf-pages" checked={!split} onChange={()=>setSplit(false)}/>ทุกแผ่น ({pages.length}) ในไฟล์เดียว</label>
     <label className="check"><input type="radio" name="dxf-pages" checked={split} disabled={sets.length<2} onChange={()=>setSplit(true)}/>แยกไฟล์ตาม Tag (ZIP{sets.length>1?` · ${sets.length} ไฟล์`:''})</label></div>
   </div>
   <aside className="dxf-summary">
    <h4>ในไฟล์จะได้</h4>
    {r12?<p className="muted">DXF R12: ทุกแผ่นวางเรียงในพิกัดกระดาษ · Layer SHEET / TEXT / MARK-* · Dimension / Leader เป็นเส้น + ข้อความ</p>:!summary?<p className="muted">กำลังคำนวณ…</p>:<>
     <div className="dxf-stats"><div><b>{summary.layouts}</b><span>Layout{summary.layouts?` (${sheets[0]?.size}-01…)`:''}</span></div><div><b>{summary.viewports}</b><span>Viewport</span></div><div><b>{summary.dimstyles.length}</b><span>DIMSTYLE</span></div></div>
     <div className="dxf-list"><small>LAYER</small>{summary.layers.map(l=><code key={l}>{l}</code>)}</div>
     <div className="dxf-list"><small>DIMSTYLE</small>{summary.dimstyles.map(l=><code key={l}>{l}</code>)}</div>
     {summary.blocks.length>0&&<div className="dxf-list"><small>BLOCK</small>{summary.blocks.map(l=><code key={l}>{l}</code>)}</div>}
    </>}
    {(nts.length>0||odd.length>0||(summary?.warnings.length??0)>0)&&<div className="notice warning"><b>ตรวจก่อนส่งออก:</b><ul>
     {nts.length>0&&<li>{nts.length} รูปไม่ได้ใช้มาตราส่วน (NTS){mode==='B'?' · วางใน Paper space ของ Layout':mode==='C'?' · วาดบนกรอบ · ตัวเลขใช้ DIMLFAC':''}</li>}
     {odd.length>0&&<li>มาตราส่วนที่ไม่ใช่มาตรฐาน: {odd.map(n=>`1:${n}`).join(', ')} · แนะนำเลือกมาตราส่วนรูปหรือใช้กระดาษ A2</li>}
     {mode==='C'&&summary?.warnings.filter(w=>w.includes('Block')).slice(0,4).map(w=><li key={w}>{w}</li>)}</ul></div>}
    <p className="muted">ใช้ข้อมูลที่บันทึกแล้วเหมือน PDF · ยังมีคำเตือน NOT FOR CONSTRUCTION / DRAFT ใน Title block · ไฟล์ DXF ดาวน์โหลดตรง (ยังไม่ลงทะเบียน checksum)</p>
   </aside>
  </div>
  {err&&<p className="notice danger" role="alert">{err}</p>}
  <footer className="actions dxf-footer"><span className="muted">{safeName(`${base}.${split&&sets.length>1?'zip':'dxf'}`)}</span><button onClick={onClose}>ยกเลิก</button><button className="primary" disabled={busy||!pages.length} onClick={()=>void run()}><FileDown size={14}/>{busy?'กำลังสร้างไฟล์…':'ส่งออก DXF'}</button></footer>
 </Modal>;
}
