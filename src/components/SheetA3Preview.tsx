import {useEffect,useMemo,useState} from 'react';
import {loadProjectLogo,type LoadedLogo} from '../data/projectLogo';
import {Download,FileDown} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {takeoff,sum} from '../domain/engine';
import {quantityBasisState} from '../domain/quantityBasis';
import {elementInputSchema} from '../domain/elementInput';
import {drawSheetInfo,sheetFormat,sheetPageCount,type SheetData} from '../domain/bbsSheet';
import {sheetSetupOf,sheetStyleKeys,viewScaleChoices,viewScaleLabel,type SheetStyle,type ViewScale} from '../domain/drawingStandard';
import {sheetLangOf,sheetLangs,sheetText,type SheetLang} from '../domain/sheetText';
import {PrimsSvg} from './PrimsSvg';
import {sheetOwners,tagSheetSets} from '../domain/tagSheets';
import {DxfExportDialog} from './DxfExportDialog';
import {SheetComposer} from './SheetComposer';
import {composerSupported} from '../domain/sheetLayout';
import type {ProjectSheetTemplates,SheetLayout} from '../domain/sheetLayoutSchema';
import type {DrawingEdits} from '../domain/drawingEdits';
import {drawingStatus,drawingStatusText} from '../domain/drawingStatus';
import {labelReport,type LabelIssue} from '../domain/labelQa';
import {labelRulesOf} from '../domain/cadStandard';
import {LabelQaBar,LabelQaOverlay,zoomBox} from './LabelQa';
import {floorCtx,floorPlanScale} from '../domain/slabFloorSheet';
import {HelpButton} from './HelpCenter';

/** On-screen BBS sheet (A3 / A2): identical primitives to the exported PDF (layout sheet-a3-v10).
 * The language switch shows the sheet at once and saves it as the project sheet language (used by the PDF).
 * Paper / view scale / drawing style: project default (Title block) or this member's override (`onSheetSetup`,
 * null = use the default). */
export function SheetA3Preview({member,project,dirty,onExport,onLanguage,onSheetSetup,onCompose,onSaveDrawing,onSaveTemplates,siblings,onCopyEdits}:{/** members of the same category (copy of the Drawing Edit layer) */ siblings?:Member[];onCopyEdits?:(t:{member:Member;edits:DrawingEdits|undefined}[])=>Promise<void>;member:Member;project:Project;dirty:boolean;onExport:()=>void;onLanguage?:(lang:SheetLang)=>Promise<void>;onSheetSetup?:(patch:(SheetStyle&{partTags?:string[];floorMerge?:boolean;floorLabels?:'typ'|'all'})|null)=>void;
 /** Sheet Composer result (member with sheetLayout / drawingViews); absent = read only */ onCompose?:(m:Member)=>void;
 /** drawing-only save of the Composer (layout + Drawing Edit, member status kept) */ onSaveDrawing?:(d:{sheetLayout?:SheetLayout;drawingEdits?:DrawingEdits})=>Promise<void>;onSaveTemplates?:(next:ProjectSheetTemplates)=>Promise<void>}){
 const [page,setPage]=useState(0),[dxfOpen,setDxfOpen]=useState(false),[compose,setCompose]=useState(false),[logo,setLogo]=useState<LoadedLogo>(),saved=sheetLangOf(project),[lang,setLang]=useState<SheetLang>(saved),[saving,setSaving]=useState(false);
 useEffect(()=>setLang(saved),[saved]);
 useEffect(()=>{let live=true;setLogo(undefined);loadProjectLogo(project).then(l=>{if(live)setLogo(l);}).catch(()=>{});return()=>{live=false;};},[project.logo?.path]);
 const data=useMemo<SheetData>(()=>{const q=takeoff(member,project.spec),parsed=elementInputSchema.safeParse(member.elementInput),shown={...project,titleBlock:{...project.titleBlock,sheetLanguage:lang}};
  return {member,rows:q.rows,input:parsed.success?parsed.data:undefined,project:shown,quantity:sum(member.occurrences.map(o=>o.quantity)),takeoff:q,status:dirty?sheetText[lang].unsaved:'DRAFT / NOT FOR CONSTRUCTION',revision:'D'+project.version,date:new Date().toISOString().slice(0,10),provisional:quantityBasisState(member)==='Provisional',logo};},[member,project,dirty,logo,lang]);
 // Drawing Edit status (P4): the edited drawing vs the current model
 const dstat=useMemo(()=>{const d=drawingStatus(data);return {...d,...drawingStatusText(d)};},[data]);
 // custom elements with tagged parts may be split into sheet sets per Tag (+ summary): pages run across the sets
 const sets=useMemo(()=>tagSheetSets(data),[data]),flat=useMemo(()=>sets.flatMap(d=>Array.from({length:sheetPageCount(d)},(_,i)=>({d,i}))),[sets]);
 const pages=flat.length,safe=Math.min(page,pages-1),cur=flat[safe],info=useMemo(()=>drawSheetInfo(cur.d,cur.i),[cur]),prims=info.prims,F=sheetFormat(data);
 const owners=useMemo(()=>sheetOwners(member),[member]),picked=member.drawingSetup?.partTags||[],floor=!!floorCtx(member);
 const def=sheetSetupOf(project),own=sheetStyleKeys.some(key=>member.drawingSetup?.[key]!==undefined);
 const misfit=info.scales.filter(v=>!v.fits);
 // Mark label check of this page (drawing only)
 const qa=useMemo(()=>labelReport(info.prims,info.views,labelRulesOf(project.spec)),[info,project.spec]),[qaShow,setQaShow]=useState(false),[qaFocus,setQaFocus]=useState<LabelIssue>();
 useEffect(()=>setQaFocus(undefined),[qa]);
 const choose=async(next:SheetLang)=>{if(next===lang)return;setLang(next);if(!onLanguage||next===saved)return;setSaving(true);try{await onLanguage(next);}finally{setSaving(false);}};
 return <section className="sheet-preview" aria-label={`แบบ BBS ${F.size}`}>
  <div className="sheet-toolbar"><b>แบบ & BBS · {F.size} ({F.w} × {F.h} mm)</b>
   <span className="segmented" role="group" aria-label="ขนาดกระดาษ">{(floor?['A3','A2','A1'] as const:['A3','A2'] as const).map(z=><button key={z} type="button" className={F.size===z?'active':''} aria-pressed={F.size===z} disabled={!onSheetSetup} onClick={()=>onSheetSetup?.({sheetSize:z})}>{z}</button>)}</span>
   {!floor&&<span className="segmented" role="group" aria-label="การจัดหน้า" title="แบบเดิม = รูป + ตารางในแผ่นเดียว · แบบใหม่ = แผ่นแรกตาราง BBS + BOQ แล้วรูปใหญ่ในแผ่นถัดไป">{([['one','แบบเดิม'],['split','ตารางก่อน · แบบหน้าถัดไป']] as const).map(([v,t])=><button key={v} type="button" className={F.layout===v?'active':''} aria-pressed={F.layout===v} disabled={!onSheetSetup} onClick={()=>{setPage(0);onSheetSetup?.({sheetLayout:v});}}>{t}</button>)}</span>}
   {F.layout==='split'&&!floor&&<label className="sheet-scale"><span>รูปต่อหน้า</span><select value={String(F.perPage)} disabled={!onSheetSetup} onChange={e=>{setPage(0);onSheetSetup?.({viewsPerPage:Number(e.target.value)});}}><option value="0">อัตโนมัติ (แปลน / รูปตัด)</option><option value="1">1 รูป / หน้า</option><option value="2">2 รูป / หน้า</option><option value="3">3 รูป / หน้า</option></select></label>}
   {owners.length>0&&<span className="segmented" role="group" aria-label="ชุดแบบ" title={floor?'พื้นทั้งชั้น: 1 เบอร์พื้น = 1 ชุดแผ่น (แผ่นแบบ + BBS) หรือรวมทั้งชั้น / หลายเบอร์ในชุดเดียว (BBS จัดกลุ่มตามเบอร์ + แผ่นสรุปน้ำหนัก)':'องค์ประกอบที่มี Tag no.: แบบทั้งโมเดล 1 ชุด หรือแยกชุดละ Tag (เหล็กของชิ้นนั้น · ชิ้นอื่นเป็นเส้นอ้างอิง) + แผ่นสรุปท้ายชุด'}>{(floor?[['tag','เฉพาะเบอร์พื้น'],['model','รวมทั้งชั้น / หลายเบอร์']] as const:[['model','ทั้งโมเดล'],['tag','แยกตาม Tag']] as const).map(([v,t])=><button key={v} type="button" className={F.parts===v?'active':''} aria-pressed={F.parts===v} disabled={!onSheetSetup} onClick={()=>{setPage(0);onSheetSetup?.({partSheets:v});}}>{t}</button>)}</span>}
   {owners.length>0&&(F.parts==='tag'||floor)&&<details className="sheet-tags"><summary>{floor?'เบอร์พื้น':'Tag'}: {picked.length?picked.join(', '):'ทั้งหมด'}</summary>{owners.map(o=><label key={o.id} className="check"><input type="checkbox" disabled={!onSheetSetup} checked={!picked.length||picked.includes(o.tag)} onChange={e=>{const all=owners.map(x=>x.tag),cur=picked.length?picked:all,next=e.target.checked?[...cur,o.tag]:cur.filter(t=>t!==o.tag);setPage(0);onSheetSetup?.({partTags:next.length===all.length||!next.length?undefined:all.filter(t=>next.includes(t))});}}/>{o.tag} · {o.label}</label>)}</details>}
   {floor&&F.parts!=='tag'&&<label className="check" title="เหล็กที่รูปร่าง / ความยาว / ขนาด / เกรดเท่ากันข้ามเบอร์พื้นใช้ Mark เดียว (SF-01 …) · ตารางบอกว่าใช้ในเบอร์ไหน กี่เส้น"><input type="checkbox" checked={!!member.drawingSetup?.floorMerge} disabled={!onSheetSetup} onChange={e=>{setPage(0);onSheetSetup?.({floorMerge:e.target.checked||undefined});}}/>รวม Mark ที่เหมือนกันข้ามเบอร์</label>}
   <label className="sheet-scale"><span>มาตราส่วนรูป</span><select value={String(F.scale)} disabled={!onSheetSetup} onChange={e=>onSheetSetup?.({viewScale:e.target.value==='auto'?'auto':Number(e.target.value)})}>{(['auto',...viewScaleChoices] as ViewScale[]).map(v=><option key={String(v)} value={String(v)}>{v==='auto'?'Auto (มาตรฐานที่พอดีกรอบ)':viewScaleLabel(v)}</option>)}</select></label>
   <label className="sheet-scale"><span>เหล็กในแปลน</span><select value={F.bars} disabled={!onSheetSetup} onChange={e=>onSheetSetup?.({barDisplay:e.target.value==='all'?'all':'representative'})}><option value="representative">ตัวแทน + ช่วงกระจาย</option><option value="all">ทุกเส้น</option></select></label>
   {!floor&&<label className="check"><input type="checkbox" checked={F.split} disabled={!onSheetSetup} onChange={e=>onSheetSetup?.({planSplit:e.target.checked})}/>แยกแปลนล่าง / บน</label>}
   {floor?<label className="check" title="ปกติ: ป้ายเต็มครั้งเดียวต่อ Mark (แผงที่เหล็กเหมือนกันใส่ TYP.) แผงอื่นแสดงรหัสสั้น เช่น B01 · ติ๊ก = ป้ายเต็มทุกแผง"><input type="checkbox" checked={member.drawingSetup?.floorLabels==='all'} disabled={!onSheetSetup} onChange={e=>onSheetSetup?.({floorLabels:e.target.checked?'all':undefined})}/>ป้ายทุกแผง</label>
    :<label className="check"><input type="checkbox" checked={F.gutter} disabled={!onSheetSetup} onChange={e=>onSheetSetup?.({markGutter:e.target.checked})}/>ป้าย Mark นอกรูป</label>}
   {own?<button type="button" disabled={!onSheetSetup} title={`ค่าโครงการ: ${def.size} · ${def.layout==='split'?'ตารางก่อน · ':''}${viewScaleLabel(def.scale)} · ${def.bars==='all'?'ทุกเส้น':'ตัวแทน'}${def.split?' · แยกแปลน':''}${def.gutter?' · ป้ายนอกรูป':''}`} onClick={()=>onSheetSetup?.(null)}>ใช้ค่าโครงการ</button>:<small className="muted">ค่าโครงการ</small>}
   <span className="segmented" role="group" aria-label="ภาษาในแบบ">{sheetLangs.map(l=><button key={l.id} type="button" className={lang===l.id?'active':''} aria-pressed={lang===l.id} disabled={saving} onClick={()=>void choose(l.id)}>{l.label}</button>)}</span>
   {lang!==saved&&<small className="muted">{saving?'กำลังบันทึกภาษา…':'ภาษานี้แสดงบนจอเท่านั้น · PDF ใช้ภาษาที่บันทึกในโครงการ'}</small>}
   {pages>1&&<span className="actions"><button disabled={!safe} onClick={()=>setPage(safe-1)}>แผ่นก่อนหน้า</button><span>แผ่น {safe+1}/{pages}{sets.length>1&&cur.d.scope?` · ${cur.d.scope.kind==='tag'?cur.d.scope.tag:'สรุป'}`:''}{floor&&cur.d.floor?.mode==='floor'?` · ${cur.d.floor.marks.join(', ')}`:''}</span><button disabled={safe+1>=pages} onClick={()=>setPage(safe+1)}>แผ่นถัดไป</button></span>}
   <button disabled={!composerSupported(data.input)} title={composerSupported(data.input)?`จัดรูปบนแผ่นเอง · เพิ่มรูปตัด · Template${member.sheetLayout?' (จัดหน้าเองแล้ว)':''}`:'กลุ่มคาน / เสาหลายชั้นจัดหน้าตามช่วง / ชั้น'} onClick={()=>setCompose(true)}>จัดหน้าแบบ{member.sheetLayout?' ✓':''}</button>
   {dstat.state!=='auto'&&<button className={`ds-pill ${dstat.state}`} title={dstat.detail} onClick={()=>setCompose(true)}>{dstat.label}</button>}
   <button disabled={dirty||saving} title={dirty?'บันทึกสมาชิกก่อนส่งออก':'ไฟล์ CAD DXF 2018 (แก้ไขได้: Dimension / Leader / MTEXT / Block Mark) ทุกแผ่นของสมาชิกนี้'} onClick={()=>setDxfOpen(true)}><FileDown size={14}/>ส่งออก DXF</button>
   <button className="primary" disabled={dirty||saving} title={dirty?'บันทึกสมาชิกก่อนส่งออก':undefined} onClick={onExport}><Download size={14}/>ส่งออก PDF {F.size}</button></div>
  {misfit.length>0&&<p className="notice warning" role="status">{misfit.map(v=>v.title).join(', ')}: {viewScaleLabel(F.scale)} ไม่พอดีกรอบบน {F.size} · ใช้ {[...new Set(misfit.map(v=>v.n?`1:${v.n}`:'NTS'))].join(' / ')} แทน · เลือกมาตราส่วนเล็กลงหรือใช้กระดาษ A2</p>}
  {floor&&(()=>{const n2=floorPlanScale(member,'A2'),auto=!member.drawingSetup?.sheetSize;return n2>100?<p className="notice">{auto&&F.size==='A1'?`แปลนบน A2 ได้แค่ 1:${n2} (เล็กกว่า 1:100) · ใช้ A1 อัตโนมัติ`:F.size==='A2'?`แปลนบน A2 ได้ 1:${n2} (เล็กกว่า 1:100) · แนะนำ A1`:`แปลนบน A2 ได้แค่ 1:${n2} · ใช้ ${F.size}`}</p>:null;})()}
  {floor&&<p className="notice">พื้นทั้งชั้น: แผ่นแรก = แปลนเหล็กล่าง / บน · ตารางพื้น · สัญลักษณ์ · Key plan · รูปตัด · รูปขยายช่องเปิด · รายละเอียดมาตรฐาน (Template ระบบ “พื้น” ถ้าไม่ได้จัดหน้าเอง) แล้วตาราง BBS ในแผ่นถัดไป <HelpButton topic="slab-floor-sheet"/></p>}
  {F.size==='A2'&&<p className="notice">A2 (594 × 420 mm) · พิมพ์บนกระดาษ A2 เท่านั้น · ย่อลง A3 ตัวหนังสือจะเล็กเกินอ่าน</p>}
  {F.size==='A3'&&info.scales.some(v=>v.title===sheetText[lang].planBottom)&&<p className="notice">แยกแปลนล่าง / บนบน A3 รูปจะเล็ก · แนะนำกระดาษ A2</p>}
  <LabelQaBar reports={qa} show={qaShow} onShow={setQaShow} focus={qaFocus} onFocus={setQaFocus}/>
  <div className="sheet-paper"><svg viewBox={zoomBox(F.w,F.h,qaFocus)} role="img" fontFamily="Sarabun, 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif"><rect x={0} y={0} width={F.w} height={F.h} fill="#fff"/><PrimsSvg prims={prims}/>{qaShow&&<LabelQaOverlay reports={qa} focus={qaFocus}/>}</svg></div>
  {compose&&<SheetComposer member={member} project={{...project,titleBlock:{...project.titleBlock,sheetLanguage:lang}}} readOnly={!onCompose&&!onSaveDrawing} onApply={onCompose} onSaveDrawing={onSaveDrawing} siblings={siblings} onCopyEdits={onCopyEdits} memberDirty={dirty} onSaveTemplates={onSaveTemplates} onClose={()=>setCompose(false)}/>}
  {dxfOpen&&<DxfExportDialog member={member} project={project} pages={flat} lang={lang} onClose={()=>setDxfOpen(false)}/>}
  <p className="muted">ตัวอย่างนี้ใช้ชุดคำสั่งวาดเดียวกับไฟล์ PDF · ไฟล์ส่งออกใช้ข้อมูลที่บันทึกแล้ว (snapshot) และลงทะเบียน checksum · ภาษาที่เลือกบันทึกเป็นภาษาแบบของโครงการ (ทุกสมาชิก)</p>
 </section>;
}
