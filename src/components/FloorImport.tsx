import {useEffect,useMemo,useRef,useState} from 'react';
import type {Attachment,Member,Project} from '../domain/model';
import {IMPORT_ROLES,type FloorImportMap,type FloorUnderlay,type ImportRole,type SlabFloor} from '../domain/slabFloorSchema';
import {docToFloor,entSegments,insUnits,UNIT_MM,type CadDoc,type CadUnits,type P2} from '../domain/cadEntities';
import {applyProposal,defaultPicks,guessLayerRoles,guessPdfRoles,proposalDiff,readFloorPlan,type DiffItem,type FloorProposal,type LayerRoles,type ProposalKind} from '../domain/slabPlanImport';
import {aiAllowed,aiDefaultPicks,aiLayerRoles,aiToProposal,mergeProposals,withAlternatives,type AiFloorProposal,type AiSchedule,type Similarity,type ViewFrame} from '../domain/aiSlabPlan';
import {beamTemplatesFromTable,readRuledTable,slabTemplatesFromTable,templateDiff,type TableRead} from '../domain/scheduleImport';
import {floorBeamRects} from '../domain/slabFloor';
import {PDF_1_100} from '../domain/underlay';
import {loadUnderlay,type UnderlaySource} from '../data/underlaySource';
import {requestSlabAI,ruleSummary,slabAiAvailability,textsForAi,windowViews} from '../data/aiSlabPlan';
import {importTemplatesViaSpecJob} from '../data/scheduleSpec';
import {HelpButton} from './HelpCenter';

// S4a / S4b: “นำเข้าจากแบบ (DXF / PDF)” — 1 layer roles (DXF layers, PDF pseudo-layers: OCG or colour · width · dash; guessed
// from the project's earlier imports, the names, the geometry) → 2 scale + window (one plan / one table of a sheet) → 3 review
// (proposal over the drawing, add / edit / remove / same, rule ↔ AI readings) → one commit. AI only on request, only when the
// project allows it, after a confirmation naming provider / model / file / page / window; schedules → Slab / Beam Templates
// through the spec-change job.
export const roleLabel:Record<ImportRole,string>={grid:'กริด (เส้น)',gridLabel:'ชื่อกริด (วงกลม / ข้อความ)',beam:'คาน (เส้นขอบ)',column:'เสา',opening:'ช่องเปิด',slabMark:'ป้ายเบอร์พื้น',text:'ข้อความ (Mark / ขนาด)'};
const kindLabel:Record<ProposalKind,string>={grid:'กริด',beam:'คาน',column:'เสา',opening:'ช่องเปิด',panelMark:'เบอร์พื้น'};
const opLabel={add:'เพิ่ม',edit:'แก้',remove:'ลบ',same:'เหมือนเดิม'};
const originLabel:Record<string,string>={rule:'กฎ',ai:'AI',both:'กฎ + AI'};
const kindColor:Record<ProposalKind,string>={grid:'#2563eb',beam:'#15803d',column:'#dc2626',opening:'#ea580c',panelMark:'#7e22ce'};
const ACI=['#000','#ff0000','#ffff00','#00ff00','#00ffff','#0000ff','#ff00ff','#1f2937','#808080','#c0c0c0'];
type Step=1|2|3;
type Win=[number,number,number,number];
/** client point → viewBox coordinates (letterboxed SVG safe) */
export function svgPoint(el:SVGSVGElement,e:{clientX:number;clientY:number}):[number,number]{const m=el.getScreenCTM();if(!m){const r=el.getBoundingClientRect(),vb=el.viewBox.baseVal;return [(e.clientX-r.left)*vb.width/r.width,(e.clientY-r.top)*vb.height/r.height];}const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return [q.x,q.y];}
const isImportFile=(a:Attachment)=>a.contentType==='image/vnd.dxf'||a.contentType==='application/pdf'||a.contentType==='image/png'||a.contentType==='image/jpeg';
const swatch=(layer:string,color:number,pdf:boolean)=>pdf?(/^#[0-9A-F]{6}/i.test(layer)?layer.slice(0,7):'#9ca3af'):ACI[color]||'#9ca3af';

export function FloorImport({floor,project,member,files,initialFile,saved,readOnly,onApply,onClose}:{floor:SlabFloor;project:Project;member?:Member;files:Attachment[];initialFile?:string;
 /** layer maps of the project's floors (this floor first) */ saved:FloorImportMap[];readOnly:boolean;onApply:(f:SlabFloor)=>void;onClose:()=>void}){
 const list=files.filter(isImportFile),u=floor.underlay;
 const [fileId,setFileId]=useState(initialFile&&list.some(a=>a.id===initialFile)?initialFile:list[0]?.id||''),[page,setPage]=useState(u&&u.attachmentId===initialFile?u.page||1:1);
 const [src,setSrc]=useState<UnderlaySource|null>(null),[err,setErr]=useState(''),[step,setStep]=useState<Step>(1),[mode,setMode]=useState<'plan'|'schedule'>('plan'),[schedKind,setSchedKind]=useState<'slab'|'beam'>('slab');
 const [roles,setRoles]=useState<LayerRoles>({}),[units,setUnits]=useState<CadUnits|''>(''),[scaleMode,setScaleMode]=useState<'underlay'|'calibration'|'ratio'>('ratio'),[ratio,setRatio]=useState(100),[round,setRound]=useState(5);
 const [win,setWin]=useState<Win|undefined>(),[picks,setPicks]=useState<Set<string>>(new Set()),[useAi,setUseAi]=useState<Set<string>>(new Set()),[useAsUnder,setUseAsUnder]=useState(true),[msg,setMsg]=useState(''),[preview,setPreview]=useState('');
 const [ai,setAi]=useState<AiFloorProposal|null>(null),[aiTable,setAiTable]=useState<AiSchedule|null>(null),[aiBusy,setAiBusy]=useState(''),[aiAsk,setAiAsk]=useState<null|{provider:{id:string;model:string};answers?:{question:string;answer:string}[]}>(null),[answers,setAnswers]=useState<Record<string,string>>({});
 const [avail,setAvail]=useState<{reason:string;provider?:{id:string;model:string}}|null>(null),[tickT,setTickT]=useState<Set<string>>(new Set()),[specBusy,setSpecBusy]=useState('');
 const file=list.find(a=>a.id===fileId),isPdf=file?.contentType==='application/pdf',isDxf=file?.contentType==='image/vnd.dxf';
 useEffect(()=>{if(!file)return;let live=true;setSrc(null);setErr('');setStep(1);setAi(null);setAiTable(null);setUseAi(new Set());
  loadUnderlay(file,page).then(s=>{if(!live)return;setSrc(s);setWin(undefined);
   if(s.doc)setRoles(s.doc.kind==='pdf'?guessPdfRoles(s.doc,saved):guessLayerRoles(s.doc.layers,saved));
   if(s.doc?.kind==='dxf'){setUnits(insUnits(s.doc.insunits)||'');setRound(0);}else{setRound(5);
    const und=!!(u&&u.attachmentId===file.id&&(u.page||1)===page&&u.align),cal=!!file.calibrations?.[String(page)];setScaleMode(und?'underlay':cal?'calibration':'ratio');}})
   .catch(e=>{if(live)setErr(e instanceof Error?e.message:String(e));});
  return ()=>{live=false;};},[file?.id,page]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{let live=true;slabAiAvailability(project).then(a=>{if(live)setAvail(a);});return ()=>{live=false;};},[project]);
 const doc=src?.doc,scanned=!!src&&!doc,spec=project.spec;
 // source → floor (before the origin): DXF units, PDF alignment / calibration / 1:N, picture 10 mm / px
 const T=useMemo<Similarity|null>(()=>{if(!file)return null;
  if(isDxf)return units?{scale:UNIT_MM[units],rotation:0,tx:0,ty:0}:null;
  if(isPdf){if(scaleMode==='underlay'&&u&&u.attachmentId===file.id)return u.transform;if(scaleMode==='calibration'){const c=file.calibrations?.[String(page)]?.mmPerPoint;if(c)return {scale:c,rotation:0,tx:0,ty:0};}return {scale:ratio*PDF_1_100/100,rotation:0,tx:0,ty:0};}
  return u&&u.attachmentId===file.id?u.transform:{scale:10,rotation:0,tx:0,ty:0};},[file,isDxf,isPdf,units,scaleMode,ratio,page,u]);
 const box:Win|undefined=win||src?.image?.box||doc?.bounds;
 const beamSizes=useMemo(()=>Object.fromEntries((spec.beamTemplates||[]).map(t=>[t.name,{width:t.width,depth:t.depth}])),[spec.beamTemplates]);
 const source=useMemo(()=>file?{kind:(isDxf?'dxf':'pdf') as 'dxf'|'pdf',attachmentId:file.id,...(isPdf?{page}:{})}:null,[file,isDxf,isPdf,page]);
 const rule=useMemo<FloorProposal|null>(()=>{if(step!==3||mode!=='plan'||!doc||!T||!source)return null;
  return readFloorPlan(docToFloor(doc,T,win),roles,{source,floor,slabMarks:(spec.slabTemplates||[]).map(t=>t.name),beamSizes,round});},[step,mode,doc,T,win,roles,source,floor,spec.slabTemplates,beamSizes,round]);
 const frames=useRef<ViewFrame[]>([]);
 const merged=useMemo<FloorProposal|null>(()=>{if(mode!=='plan'||!source||!T)return null;if(!ai)return rule;
  return mergeProposals(rule,aiToProposal(ai,frames.current,T,{floor,origin:rule?.origin,source,round:round||1,scanned,beamSizes}));},[mode,rule,ai,T,floor,source,round,scanned,beamSizes]);
 const proposal=useMemo(()=>merged?withAlternatives(merged,useAi):null,[merged,useAi]);
 const diff=useMemo(()=>proposal?proposalDiff(floor,proposal):[],[proposal,floor]);
 useEffect(()=>{if(!merged){setPicks(new Set());return;}const d=proposalDiff(floor,merged);setPicks(ai?aiDefaultPicks(d,merged,scanned):defaultPicks(d));},[merged]);// eslint-disable-line react-hooks/exhaustive-deps
 // ---------- schedules
 const table=useMemo<TableRead|null>(()=>{if(step!==3||mode!=='schedule')return null;if(aiTable)return {header:aiTable.header,rows:aiTable.rows};if(!doc)return null;
  return readRuledTable(docToFloor(doc,{scale:1,rotation:0,tx:0,ty:0},win))||null;},[step,mode,doc,win,aiTable]);
 const tpl=useMemo(()=>table?(schedKind==='slab'?slabTemplatesFromTable(table,file?.name||''):beamTemplatesFromTable(table,file?.name||'')):null,[table,schedKind,file]);
 const tplRows=useMemo(()=>tpl?templateDiff(spec,schedKind,tpl.templates):[],[tpl,spec,schedKind]);
 useEffect(()=>{setTickT(new Set(tplRows.filter(r=>r.op!=='same'&&!aiTable).map(r=>r.name)));},[tplRows]);// eslint-disable-line react-hooks/exhaustive-deps
 const setRole=(layer:string,r:ImportRole|'')=>setRoles(prev=>{const n:LayerRoles={};for(const k of IMPORT_ROLES){const l=(prev[k]||[]).filter(x=>x!==layer);if(l.length)n[k]=l;}if(r)(n[r]||=[]).push(layer);return n;});
 const roleOf=(layer:string)=>IMPORT_ROLES.find(r=>roles[r]?.includes(layer))||'';
 const apply=()=>{if(!proposal||!file||!T)return;
  const t={...T,tx:T.tx-proposal.origin[0],ty:T.ty-proposal.origin[1]};
  const under:FloorUnderlay|undefined=useAsUnder&&(!u||u.attachmentId===file.id)?{attachmentId:file.id,...(isPdf?{page}:{}),transform:t,opacity:u?.opacity??0.45,locked:u?.locked??false,hidden:false,...(u?.align&&u.attachmentId===file.id&&(u.page||1)===page&&scaleMode==='underlay'?{align:u.align}:{})}:undefined;
  const map:FloorImportMap={layers:Object.fromEntries(IMPORT_ROLES.flatMap(r=>roles[r]?.length?[[r,roles[r]]]:[])),...(isDxf&&units?{units}:{}),at:new Date().toISOString()};
  const r=applyProposal(floor,proposal,picks,{slabTemplates:spec.slabTemplates,underlay:under,importMap:map});
  if(r.floor===floor){setMsg('ไม่ได้เลือกรายการใด · แปลนพื้นไม่เปลี่ยน');return;}
  onApply(r.floor);onClose();};
 // ---------- AI (asked only on the button; confirmation before every send)
 const askAi=(answersList?:{question:string;answer:string}[])=>{if(!avail?.provider){setMsg(avail?.reason||'กำลังตรวจการตั้งค่า AI…');return;}setAiAsk({provider:avail.provider,answers:answersList});};
 const sendAi=async()=>{const req=aiAsk;if(!req||!file||!src?.image||!box||!member)return;setAiAsk(null);setAiBusy('กำลังเตรียมภาพของกรอบที่เลือก…');setMsg('');
  try{const {views,frames:fr}=await windowViews(src.image,box);frames.current=fr;
   const base={project,member,attachment:file,page,box,views,frames:fr,texts:textsForAi(doc,fr[0]),layers:(doc?.layers||[]).filter(l=>l.count).map(l=>({name:l.name,count:l.count,...(roleOf(l.name)?{role:roleOf(l.name)}:{})})),
    provider:req.provider,answers:req.answers,onProgress:(p:{label:string})=>setAiBusy(p.label)};
   if(mode==='schedule'){setAiTable(await requestSlabAI({...base,part:'schedule',scheduleKind:schedKind}));}
   else{const r=await requestSlabAI({...base,part:'plan',ruleSummary:ruleSummary(rule)});setAi(r);setUseAi(new Set());
    if(!rule&&doc){const sug=aiLayerRoles(r,doc.layers.map(l=>l.name),roles);if(JSON.stringify(sug)!==JSON.stringify(roles))setMsg('AI แนะนำบทบาทของกลุ่มเส้น · กด “ใช้บทบาท layer จาก AI” ที่ขั้น 1 แล้วอ่านใหม่ได้');}}
   setStep(3);}
  catch(e){setMsg(e instanceof Error?e.message:String(e));}finally{setAiBusy('');}};
 const sendSpec=async()=>{if(!tpl)return;
  if(!confirm(`ส่ง ${tickT.size} ${schedKind==='slab'?'เบอร์พื้น':'เบอร์คาน'} เข้า Spec ของโครงการผ่านงานเปลี่ยนสเป็ค (บันทึกก่อน / หลัง · สมาชิกที่ใช้เบอร์เหล่านี้ถูกคำนวณใหม่)?`))return;
  setSpecBusy('เริ่มงานเปลี่ยนสเป็ค…');try{await importTemplatesViaSpecJob(project,schedKind,tpl.templates,tickT,m=>setSpecBusy(m));setMsg(`ส่งเข้า Spec แล้ว (${tickT.size} รายการ) · โหลดโครงการล่าสุดเพื่อเห็นในตาราง`);setTickT(new Set());}
  catch(e){setMsg(e instanceof Error?e.message:String(e));}finally{setSpecBusy('');}};
 const counts=useMemo(()=>doc?doc.layers.filter(l=>l.count>0):[],[doc]);
 const canAi=!!avail&&!avail.reason&&!!member;
 const aiButton=(label:string)=><button type="button" disabled={readOnly||!canAi||!!aiBusy||!box} title={avail?.reason||(member?undefined:'บันทึกสมาชิกก่อน')} onClick={()=>askAi()}>{label}</button>;
 return <div className="modal-shade" role="dialog" aria-modal="true" aria-label="นำเข้าแปลนพื้นจากแบบ"><section className="modal floor-import-dialog">
  <header><b>นำเข้าจากแบบ (DXF / PDF)</b><span className="fi-steps">{([1,2,3] as Step[]).map(k=><span key={k} className={step===k?'on':step>k?'done':''}>{k}. {k===1?(scanned?'ไฟล์':'จับคู่ layer'):k===2?'มาตราส่วนและพื้นที่':'ตรวจข้อเสนอ'}</span>)}</span>
   <HelpButton topic="slab-floor-pdf-ai"/><button type="button" className="icon-button" aria-label="ปิด" onClick={onClose}>×</button></header>
  {!list.length&&<p className="notice warning">ยังไม่มีไฟล์ DXF / PDF แนบในสมาชิกนี้หรือในโครงการ · แนบไฟล์ที่แท็บ “แบบต้นทาง” (DWG: Save As → DXF)</p>}
  {list.length>0&&<div className="fi-file"><label className="field inline"><span>ไฟล์</span><select value={fileId} onChange={e=>{setFileId(e.target.value);setPage(1);}}>{list.map(a=><option key={a.id} value={a.id}>{a.name}{a.memberId?'':' (โครงการ)'}</option>)}</select></label>
   {isPdf&&<label className="field inline"><span>หน้า</span><input type="number" min={1} max={src?.pages||9999} value={page} onChange={e=>setPage(Math.max(1,Math.round(Number(e.target.value)||1)))}/>{src?<small className="muted">/ {src.pages}</small>:null}</label>}
   <div className="segmented" role="group" aria-label="สิ่งที่นำเข้า">{([['plan','แปลนพื้น'],['schedule','ตาราง (Template)']] as const).map(([v,l])=><button key={v} type="button" className={mode===v?'active':''} onClick={()=>{setMode(v);setStep(1);}}>{l}</button>)}</div>
   {mode==='schedule'&&<select aria-label="ชนิดตาราง" value={schedKind} onChange={e=>setSchedKind(e.target.value as 'slab'|'beam')}><option value="slab">ตารางพื้น → Slab Template</option><option value="beam">ตารางคาน → Beam Template</option></select>}</div>}
  {err&&<p className="notice warning">{err}</p>}
  {file&&!src&&!err&&<p className="muted">กำลังอ่านไฟล์…</p>}
  {aiBusy&&<p className="notice" role="status">AI: {aiBusy}</p>}
  {msg&&<p className="notice" role="status">{msg}</p>}
  {src&&step===1&&<>
   {scanned?<p className="notice warning">ไฟล์นี้ไม่มีเส้น vector (ภาพสแกน / รูป) · อ่านด้วยกฎไม่ได้ ใช้ AI ช่วยอ่านได้อย่างเดียว ผลทุกรายการต้องติ๊กเอง</p>:
    mode==='plan'?<p className="muted">เลือกว่า layer {isPdf?'(PDF: ชั้น Optional Content หรือกลุ่มเส้นตามสี · ความหนา · เส้นประ) ':''}ไหนคืออะไร · เดาจากการนำเข้าครั้งก่อนของโครงการ แล้วจากชื่อ{isPdf?' และรูปเส้น':''} · คลิกแถวเพื่อดูเส้นบนภาพ</p>:<p className="muted">โหมดตาราง: ไม่ต้องจับคู่ layer · ขั้นถัดไปลากกรอบรอบตาราง</p>}
   {doc&&mode==='plan'&&<div className="fi-step1"><div className="fi-layers"><table className="data-table"><thead><tr><th>Layer</th><th>จำนวน</th><th>สี</th><th>เป็น</th></tr></thead><tbody>
    {counts.map(l=><tr key={l.name} className={preview===l.name?'on':''} onClick={()=>setPreview(l.name)}><td className="mono">{l.name}</td><td>{l.count.toLocaleString('en-US')}</td><td><span className="fi-swatch" style={{background:swatch(l.name,l.color,isPdf)}}/>{isPdf?'':l.color}</td>
     <td><select aria-label={`บทบาทของ layer ${l.name}`} value={roleOf(l.name)} onClick={e=>e.stopPropagation()} onChange={e=>setRole(l.name,e.target.value as ImportRole|'')}><option value="">— ไม่อ่าน —</option>{IMPORT_ROLES.map(r=><option key={r} value={r}>{roleLabel[r]}</option>)}</select></td></tr>)}</tbody></table></div>
    {src.image&&<LayerPreview doc={doc} image={src.image} layer={preview}/>}</div>}
   {ai&&doc&&mode==='plan'&&<p><button type="button" onClick={()=>{setRoles(aiLayerRoles(ai,doc.layers.map(l=>l.name),{}));setMsg('ใช้บทบาท layer จาก AI แล้ว · ตรวจแล้วกดถัดไป');}}>ใช้บทบาท layer จาก AI</button></p>}
   <footer className="actions"><button type="button" onClick={onClose}>ยกเลิก</button><button type="button" className="primary" disabled={mode==='plan'&&!scanned&&!roles.grid?.length} title={mode==='plan'&&!scanned&&!roles.grid?.length?'เลือก layer ของกริดก่อน':undefined} onClick={()=>setStep(2)}>ถัดไป</button></footer></>}
  {src?.image&&step===2&&<>
   <div className="fi-scale">
    {isDxf&&<label className="field"><span>หน่วยในไฟล์ ($INSUNITS{doc?.insunits?` = ${doc.insunits}`:' ไม่ระบุ'})</span><select value={units} onChange={e=>setUnits(e.target.value as CadUnits)}><option value="">— เลือกหน่วย —</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="inch">inch</option></select></label>}
    {!isDxf&&mode==='plan'&&<label className="field"><span>มาตราส่วนของหน้า</span><select value={scaleMode} onChange={e=>setScaleMode(e.target.value as typeof scaleMode)}>
     <option value="underlay" disabled={!(u&&u.attachmentId===file?.id&&(u.page||1)===page)}>ตามการจัดแนวแบบพื้นหลัง{u?.align&&u.attachmentId===file?.id?'':' (ยังไม่จัดแนว)'}</option>
     <option value="calibration" disabled={!file?.calibrations?.[String(page)]}>ตาม Calibrate หน้านี้</option><option value="ratio">1 : N</option></select></label>}
    {!isDxf&&mode==='plan'&&scaleMode==='ratio'&&<label className="field"><span>1 :</span><input type="number" min={1} value={ratio} onChange={e=>setRatio(Math.max(1,Number(e.target.value)||100))}/></label>}
    {!isDxf&&mode==='plan'&&<label className="field"><span>ปัดค่า (mm)</span><select value={round} onChange={e=>setRound(Number(e.target.value))}>{[1,5,10,25].map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
    <div className="field"><span>พื้นที่ที่อ่าน</span><span>{win?<>กรอบที่ลาก <button type="button" onClick={()=>setWin(undefined)}>ทั้งหน้า</button></>:mode==='schedule'?'ลากกรอบรอบตาราง':'ทั้งหน้า (ลากกรอบเพื่อเลือกแปลนเดียว)'}</span></div></div>
   <WindowPicker image={src.image} win={win} onWin={setWin} label={`${file?.name||''} · ลากกรอบเพื่อเลือกพื้นที่`}/>
   <footer className="actions"><button type="button" onClick={()=>setStep(1)}>ย้อนกลับ</button>
    {(scanned||mode==='schedule')&&aiButton(mode==='schedule'?'ให้ AI อ่านตาราง…':'ให้ AI อ่านแปลน…')}
    {!scanned&&<button type="button" className="primary" disabled={isDxf&&!units||mode==='schedule'&&!win} onClick={()=>setStep(3)}>{mode==='schedule'?'อ่านตาราง':'อ่านแปลน'}</button>}</footer></>}
  {src?.image&&step===3&&mode==='plan'&&proposal&&T&&<>
   {proposal.warnings.length>0&&<ul className="notice warning">{proposal.warnings.map(w=><li key={w}>{w}</li>)}</ul>}
   {ai&&ai.questions.length>0&&<div className="fi-questions"><b>คำถามจาก AI</b>{ai.questions.map(q=><label key={q.id} className="field"><span>{q.text}</span><input value={answers[q.id]||''} onChange={e=>setAnswers({...answers,[q.id]:e.target.value})}/></label>)}
    <button type="button" disabled={!canAi||!!aiBusy||!ai.questions.some(q=>answers[q.id]?.trim())} onClick={()=>askAi(ai.questions.filter(q=>answers[q.id]?.trim()).map(q=>({question:q.text,answer:answers[q.id].trim()})))}>ส่งคำตอบให้ AI อ่านอีกครั้ง…</button></div>}
   <div className="fi-review">
    <ProposalView floor={floor} p={proposal} diff={diff} picks={picks} image={src.image} t={T}/>
    <div className="fi-list">
     {(Object.keys(kindLabel) as ProposalKind[]).map(k=>{const rows=diff.filter(d=>d.kind===k);if(!rows.length)return null;const ids=rows.filter(r=>r.op!=='same').map(r=>r.id);
      return <details key={k} open><summary><span className="fi-dot" style={{background:kindColor[k]}}/>{kindLabel[k]} {rows.length} <small className="muted">· เพิ่ม {rows.filter(r=>r.op==='add').length} · แก้ {rows.filter(r=>r.op==='edit').length} · ลบ {rows.filter(r=>r.op==='remove').length}</small>
        {ids.length>0&&<label className="check"><input type="checkbox" checked={ids.every(i=>picks.has(i))} onChange={e=>setPicks(p=>{const n=new Set(p);for(const i of ids)if(e.target.checked)n.add(i);else n.delete(i);return n;})}/>ทั้งหมด</label>}</summary>
       <ul>{rows.map(r=><DiffRow key={r.id} r={r} on={picks.has(r.id)} useAi={useAi.has(r.id)} onToggle={v=>setPicks(p=>{const n=new Set(p);if(v)n.add(r.id);else n.delete(r.id);return n;})}
        onAlt={v=>setUseAi(s=>{const n=new Set(s);if(v)n.add(r.id);else n.delete(r.id);return n;})}/>)}</ul></details>;})}
    </div>
   </div>
   <label className="check"><input type="checkbox" checked={useAsUnder} disabled={!!u&&u.attachmentId!==file?.id} onChange={e=>setUseAsUnder(e.target.checked)}/>ใช้ไฟล์นี้เป็นแบบพื้นหลัง (วางตรงกริดที่นำเข้า){u&&u.attachmentId!==file?.id?' · แปลนนี้มีแบบพื้นหลังไฟล์อื่นอยู่แล้ว':''}</label>
   <footer className="actions"><button type="button" onClick={()=>setStep(2)}>ย้อนกลับ</button>{!scanned&&aiButton(ai?'ให้ AI อ่านอีกครั้ง…':'ให้ AI ช่วยตรวจ / เติม…')}
    <span className="muted">เลือก {[...picks].filter(i=>diff.some(d=>d.id===i&&d.op!=='same')).length} รายการ{scanned?' · จากภาพสแกน: ติ๊กเองทุกรายการ':''} · ใช้แล้วย้อนกลับได้ 1 ครั้ง</span>
    <button type="button" className="primary" disabled={readOnly} onClick={apply}>ใช้กับแปลนพื้น</button></footer></>}
  {step===3&&mode==='schedule'&&<>
   {!table&&<p className="notice warning">ไม่พบตารางเส้นในกรอบที่เลือก (ต้องมีเส้นแบ่งแถว / คอลัมน์) · ลากกรอบใหม่ หรือให้ AI อ่านตาราง</p>}
   {tpl&&tpl.warnings.length>0&&<ul className="notice warning">{tpl.warnings.map(w=><li key={w}>{w}</li>)}</ul>}
   {table&&<details className="fi-table"><summary>ตารางที่อ่านได้ ({table.rows.length} แถว{aiTable?' · อ่านโดย AI':' · อ่านจากเส้น + ข้อความ'})</summary><table className="data-table"><thead><tr>{table.header.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{table.rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></details>}
   {tplRows.length>0&&<ul className="fi-tpl">{tplRows.map(r=><li key={r.name} className={`fi-${r.op}`}><label className="check"><input type="checkbox" disabled={r.op==='same'} checked={tickT.has(r.name)} onChange={e=>setTickT(s=>{const n=new Set(s);if(e.target.checked)n.add(r.name);else n.delete(r.name);return n;})}/>
    <span className={`fi-op fi-op-${r.op}`}>{opLabel[r.op]}</span>{r.text}</label></li>)}</ul>}
   {specBusy&&<p className="notice" role="status">{specBusy}</p>}
   <footer className="actions"><button type="button" onClick={()=>setStep(2)}>ย้อนกลับ</button>{aiButton(aiTable?'ให้ AI อ่านตารางอีกครั้ง…':'ให้ AI อ่านตาราง…')}
    <span className="muted">{aiTable?'ผลจาก AI: ตรวจและติ๊กเองทุกรายการ · ':''}ส่งเข้า Spec ผ่านงานเปลี่ยนสเป็คเดิม (บันทึกก่อน / หลัง)</span>
    <button type="button" className="primary" disabled={readOnly||!tickT.size||!!specBusy} onClick={()=>void sendSpec()}>ส่งเข้า Spec ของโครงการ</button></footer></>}
  {aiAsk&&file&&box&&<div className="fi-confirm" role="alertdialog" aria-label="ยืนยันการส่งแบบให้ AI"><b>ยืนยันการส่งแบบให้ AI</b>
   <ul><li>ผู้ให้บริการ: <b>{aiAsk.provider.id}</b> · โมเดล <b>{aiAsk.provider.model}</b></li><li>ไฟล์: {file.name}{isPdf?` · หน้า ${page}`:''}</li>
    <li>ส่งเฉพาะ: ภาพของ{win?'กรอบที่เลือก':'ทั้งหน้า'} (ภาพรวม + ภาพขยาย 6 ภาพ){doc?' + ข้อความ / กลุ่มเส้นที่อ่านได้':''}{rule?' + ผลจากกฎ':''} · ไม่ส่งไฟล์ทั้งไฟล์</li>
    <li>{mode==='schedule'?`อ่านตาราง${schedKind==='slab'?'พื้น':'คาน'}`:'อ่านแปลนพื้น'}{aiAsk.answers?.length?` · พร้อมคำตอบ ${aiAsk.answers.length} ข้อ`:''} · บันทึกในประวัติการส่งของโครงการ</li></ul>
   <footer className="actions"><button type="button" onClick={()=>setAiAsk(null)}>ยกเลิก</button><button type="button" className="primary" onClick={()=>void sendAi()}>ยืนยันส่ง</button></footer></div>}
  {!aiAllowed(project)&&step>=2&&<p className="muted fi-ai-off">AI: {avail?.reason||'โครงการนี้ยังไม่อนุญาตส่งแบบให้ AI'}</p>}
 </section></div>;
}
function DiffRow({r,on,useAi,onToggle,onAlt}:{r:DiffItem;on:boolean;useAi:boolean;onToggle:(v:boolean)=>void;onAlt:(v:boolean)=>void}){
 return <li className={`fi-${r.op}${r.alt?' fi-conflict':''}`}><label className="check"><input type="checkbox" disabled={r.op==='same'} checked={r.op!=='same'&&on} onChange={e=>onToggle(e.target.checked)}/>
  <span className={`fi-op fi-op-${r.op}`}>{opLabel[r.op]}</span>{r.text}</label>
  {r.origin&&<span className={`fi-src fi-src-${r.origin}`}>{originLabel[r.origin]}</span>}
  {r.op!=='remove'&&<small className={`muted${r.confidence<0.7?' fi-low':''}`} title={r.evidence?.handles.length||r.evidence?.text?`หลักฐาน: ${r.evidence?.handles.slice(0,6).join(', ')}${r.evidence?.text?` · “${r.evidence.text}”`:''}`:undefined}> {Math.round(r.confidence*100)}%</small>}
  {r.alt&&<span className="fi-alt">ขัดกัน: {useAi?'ใช้ค่า AI':'ใช้ค่าจากกฎ'} · อีกค่า: {r.alt}<button type="button" onClick={()=>onAlt(!useAi)}>{useAi?'กลับใช้ค่าจากกฎ':'ใช้ค่าอีกค่า'}</button></span>}</li>;
}
/** Drawing preview (source units, y up) with a drag rectangle → window. */
function WindowPicker({image,win,onWin,label}:{image:{href:string;box:Win};win?:Win;onWin:(w:Win)=>void;label:string}){
 const b=image.box,W=900,H=520,s=Math.min(W/(b[2]-b[0]),H/(b[3]-b[1])),X=(x:number)=>(x-b[0])*s,Y=(y:number)=>H-(y-b[1])*s;
 const svg=useRef<SVGSVGElement>(null),[drag,setDrag]=useState<[P2,P2]|null>(null);
 const at=(e:{clientX:number;clientY:number}):P2=>{const [px,py]=svgPoint(svg.current!,e);return [b[0]+px/s,b[1]+(H-py)/s];};
 const box=drag?[Math.min(drag[0][0],drag[1][0]),Math.min(drag[0][1],drag[1][1]),Math.max(drag[0][0],drag[1][0]),Math.max(drag[0][1],drag[1][1])]:win;
 return <svg ref={svg} className="fi-window" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}
  onPointerDown={e=>{(e.target as Element).setPointerCapture?.(e.pointerId);const p=at(e);setDrag([p,p]);}} onPointerMove={e=>{if(drag)setDrag([drag[0],at(e)]);}}
  onPointerUp={()=>{if(drag){const w:Win=[Math.min(drag[0][0],drag[1][0]),Math.min(drag[0][1],drag[1][1]),Math.max(drag[0][0],drag[1][0]),Math.max(drag[0][1],drag[1][1])];if((w[2]-w[0])*s>10&&(w[3]-w[1])*s>10)onWin(w);}setDrag(null);}}>
  <rect x={0} y={0} width={W} height={H} fill="#fff"/>
  <image href={image.href} x={X(b[0])} y={Y(b[3])} width={(b[2]-b[0])*s} height={(b[3]-b[1])*s} preserveAspectRatio="none"/>
  {box&&<rect x={X(box[0])} y={Y(box[3])} width={(box[2]-box[0])*s} height={(box[3]-box[1])*s} className="fi-win"/>}
 </svg>;
}
/** The drawing with one layer's lines drawn red (sample of a PDF pseudo-layer / DXF layer). */
function LayerPreview({doc,image,layer}:{doc:CadDoc;image:{href:string;box:Win};layer:string}){
 const b=image.box,W=420,H=300,s=Math.min(W/(b[2]-b[0]),H/(b[3]-b[1])),X=(x:number)=>(x-b[0])*s,Y=(y:number)=>H-(y-b[1])*s;
 const d=useMemo(()=>{if(!layer)return '';let out='',n=0;for(const e of doc.ents){if(e.layer!==layer||e.k==='text')continue;for(const q of entSegments(e,[])){out+=`M${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}L${X(q[2]).toFixed(1)} ${Y(q[3]).toFixed(1)}`;if(++n>6000)return out;}}return out;},[doc,layer]);// eslint-disable-line react-hooks/exhaustive-deps
 return <svg className="fi-layer-preview" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={layer?`เส้นของ ${layer} บนแบบ`:'เลือกแถว layer เพื่อดูเส้นบนแบบ'}>
  <rect x={0} y={0} width={W} height={H} fill="#fff"/><image href={image.href} x={X(b[0])} y={Y(b[3])} width={(b[2]-b[0])*s} height={(b[3]-b[1])*s} preserveAspectRatio="none" opacity={0.3}/>
  {d&&<path d={d} stroke="#dc2626" strokeWidth={1.4} fill="none"/>}{!layer&&<text x={W/2} y={H/2} textAnchor="middle" className="fi-t">คลิกแถว layer เพื่อดูเส้น</text>}</svg>;
}
/** Proposal over the drawing in floor coordinates (image placed by the source → floor similarity minus the origin). */
function ProposalView({floor,p,diff,picks,image,t}:{floor:SlabFloor;p:FloorProposal;diff:DiffItem[];picks:Set<string>;image:{href:string;box:Win};t:Similarity}){
 const tmp:SlabFloor={...floor,gridsX:p.grids.filter(g=>g.axis==='X').map(g=>({label:g.label,at:g.at})),gridsY:p.grids.filter(g=>g.axis==='Y').map(g=>({label:g.label,at:g.at})),
  beams:p.beams.map(b=>({id:b.id,mark:b.mark,along:b.along,line:b.line,from:b.from,to:b.to,width:b.width,depth:b.depth,offset:b.offset}))};
 const xs=[...tmp.gridsX.map(g=>g.at),...floor.gridsX.map(g=>g.at),0],ys=[...tmp.gridsY.map(g=>g.at),...floor.gridsY.map(g=>g.at),0];
 const x0=Math.min(...xs)-2500,x1=Math.max(...xs)+2500,y0=Math.min(...ys)-2500,y1=Math.max(...ys)+2500,W=620,H=460,s=Math.min(W/(x1-x0),H/(y1-y0));
 const X=(x:number)=>(x-x0)*s,Y=(y:number)=>H-(y-y0)*s,on=(id:string)=>{const d=diff.find(x=>x.id===id);return !d||d.op==='same'||picks.has(id);};
 const C=Math.cos(t.rotation)*t.scale,S=Math.sin(t.rotation)*t.scale,tx=t.tx-p.origin[0],ty=t.ty-p.origin[1],b=image.box;
 const rects=floorBeamRects(tmp),gx=tmp.gridsX,gy=tmp.gridsY;
 return <svg className="fi-proposal" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ข้อเสนอวางบนแบบ: กริด (น้ำเงิน) คาน (เขียว) เสา (แดง) ช่องเปิด (ส้ม) เบอร์พื้น (ม่วง)">
  <rect x={0} y={0} width={W} height={H} fill="#fff"/>
  <g transform={`matrix(${s*C} ${-s*S} ${-s*S} ${-s*C} ${s*(tx-x0)} ${H+s*(y0-ty)})`} opacity={0.35}><image href={image.href} x={b[0]} y={-b[3]} width={b[2]-b[0]} height={b[3]-b[1]} transform="scale(1,-1)" preserveAspectRatio="none"/></g>
  {p.grids.map(g=>{const o=on(g.id)?1:.25;return g.axis==='X'?<g key={g.id} opacity={o}><line x1={X(g.at)} x2={X(g.at)} y1={Y(y0+1200)} y2={Y(y1-1200)} stroke={kindColor.grid} strokeDasharray="8 3 2 3"/><text x={X(g.at)} y={Y(y0+600)} fill={kindColor.grid} className="fi-t">{g.label}</text></g>
   :<g key={g.id} opacity={o}><line y1={Y(g.at)} y2={Y(g.at)} x1={X(x0+1200)} x2={X(x1-1200)} stroke={kindColor.grid} strokeDasharray="8 3 2 3"/><text x={X(x0+600)} y={Y(g.at)+4} fill={kindColor.grid} className="fi-t">{g.label}</text></g>;})}
  {rects.map(r=><rect key={r.beam.id} x={X(r.x0)} y={Y(r.y1)} width={(r.x1-r.x0)*s} height={(r.y1-r.y0)*s} fill={kindColor.beam} fillOpacity={0.35} stroke={kindColor.beam} opacity={on(r.beam.id)?1:.25}><title>{`${r.beam.mark} ${r.beam.width}×${r.beam.depth}`}</title></rect>)}
  {p.columns.map(c=>{const cx=gx.find(g=>g.label===c.x)?.at,cy=gy.find(g=>g.label===c.y)?.at;if(cx===undefined||cy===undefined)return null;return <rect key={c.id} x={X(cx-c.sx/2)} y={Y(cy+c.sy/2)} width={c.sx*s} height={c.sy*s} fill={kindColor.column} opacity={on(c.id)?.85:.25}/>;})}
  {p.openings.map(o=><g key={o.id} opacity={on(o.id)?1:.25}><rect x={X(o.x)} y={Y(o.y+o.h)} width={o.w*s} height={o.h*s} fill="none" stroke={kindColor.opening} strokeWidth={2}/><path d={`M${X(o.x)} ${Y(o.y)}L${X(o.x+o.w)} ${Y(o.y+o.h)}M${X(o.x+o.w)} ${Y(o.y)}L${X(o.x)} ${Y(o.y+o.h)}`} stroke={kindColor.opening}/></g>)}
  {p.panelMarks.map(m=><text key={m.id} x={X(m.at[0])} y={Y(m.at[1])} fill={kindColor.panelMark} className="fi-t fi-mark" opacity={on(m.id)?1:.3}>{m.mark}{m.thickness?` t=${m.thickness}`:''}</text>)}
 </svg>;
}
