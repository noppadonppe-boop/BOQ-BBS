import {useMemo,useRef,useState,type PointerEvent as RPointerEvent} from 'react';
import {Copy,Plus,Trash2} from 'lucide-react';
import type {Attachment,Member,Project} from '../domain/model';
import {proposalGaps,proposalToShape,type ShapeAnswer,type ShapeProposal} from '../domain/shapeProposal';
import {aiShapeConfigured,analyseShapeWithAI} from '../data/aiShapeAnalysis';
import {drawingViews} from '../data/drawingViews';
import {shapeKindLabels,type ShapeModel,type ShapePart} from '../domain/shapeModelSchema';
import {normaliseShape,partPolygon,shapeFootprint,shapePileQuantities} from '../domain/shapeGeometry';
import {applyShapeModel,shapeProblems,shapeStageVolumes,starterShape} from '../domain/shapeApply';
import {takeoff} from '../domain/engine';
import {buildView,renderView,viewHeight} from '../domain/elementViews';
import {Field,number} from './EditorControls';
import {PrimsSvg} from './PrimsSvg';
import {ModelView} from './Geometry';

type P2=[number,number];
type Drag={mode:'move'|'size'|'radius'|'vertex'|'cutX'|'cutY';id?:string;index?:number;start:P2;orig?:ShapePart;origCut?:number};
const newId=()=>`p${crypto.randomUUID().replace(/-/g,'').slice(0,8)}`;
const base=(label:string,role:'solid'|'void',z0:number,height:number)=>({id:newId(),label,role,stage:1,z0,height,formSides:true,formBottom:false,source:''});
const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');

/** Custom element · step 3 “ยืนยันรูปทรง”: parts list, interactive plan, sections, 3D, checks and quantities. */
export function ShapeModelEditor({member,project,attachments=[],readOnly,onApply}:{member:Member;project:Project;attachments?:Attachment[];readOnly:boolean;onApply:(m:Member)=>void}){
 const [draft,setDraft]=useState<ShapeModel>(()=>structuredClone(member.shapeModel||starterShape(member)));
 const [sel,setSel]=useState(draft.parts[0]?.id||''),[snap,setSnap]=useState(50),[cut,setCut]=useState<P2>(()=>[member.x/2,member.y/2]);
 const part=draft.parts.find(p=>p.id===sel);
 const put=(id:string,patch:Partial<ShapePart>)=>setDraft(d=>({...d,confirmed:false,parts:d.parts.map(p=>p.id===id?{...p,...patch} as ShapePart:p)}));
 const add=(p:ShapePart)=>{setDraft(d=>({...d,confirmed:false,parts:[...d.parts,p]}));setSel(p.id);};
 const top=Math.max(...draft.parts.filter(p=>p.role==='solid').map(p=>p.z0+p.height),0),bx=Math.max(1000,...draft.parts.map(p=>partPolygon(p)[0].reduce((m,v)=>Math.max(m,v[0]),0)));
 const adders:[string,()=>ShapePart][]=[
  ['กล่อง',()=>({...base('กล่อง','solid',0,600),shape:'box',x:bx,y:0,w:1000,d:1000})],
  ['หลายเหลี่ยม',()=>({...base('หลายเหลี่ยม','solid',0,600),shape:'polygon',points:[[bx,0],[bx+2000,0],[bx+2000,1000],[bx+1000,1000],[bx+1000,2000],[bx,2000]]})],
  ['ทรงกระบอก / ผนังกลม',()=>({...base('ผนังกลม','solid',top||0,3000),shape:'circle',cx:bx+1500,cy:1500,diameter:3000,inner:2600})],
  ['ปล่อง',()=>({...base('ปล่อง','solid',0,3000),shape:'shaft',x:bx,y:0,w:2000,d:2000,wall:200})],
  ['ช่องเปิด / หลุม',()=>({...base('ช่องเปิด','void',Math.max(0,top-500),500),shape:'box',x:0,y:0,w:1000,d:1000,formSides:true})],
  ['ช่องเปิดกลม',()=>({...base('ช่องเปิดกลม','void',0,top||1000),shape:'circle',cx:500,cy:500,diameter:600,inner:0})],
 ];
 // preview member (normalised) for sections, 3D, takeoff
 const {preview,shift,applyError}=useMemo(()=>{try{const n=normaliseShape(draft);return {preview:applyShapeModel(member,draft),shift:n.shift,applyError:''};}catch(e){return {preview:undefined,shift:[0,0,0] as [number,number,number],applyError:e instanceof Error?e.message:String(e)};}},[draft,member]);
 const checks=useMemo(()=>shapeProblems(draft),[draft]);
 const q=useMemo(()=>{try{return preview?takeoff(preview,project.spec):undefined;}catch{return undefined;}},[preview,project.spec]);
 const stages=useMemo(()=>{try{return shapeStageVolumes(normaliseShape(draft).model);}catch{return [];}},[draft]);
 const piles=draft.piles?shapePileQuantities(draft):undefined;
 const blocked=readOnly||!preview||checks.blockers.length>0;
 const apply=()=>{if(blocked||!preview)return;if((member.geometry||member.prismGeometry||member.beamAssembly)&&!confirm('สมาชิกนี้ใช้รูปทรงแบบเดิม (กล่อง / หน้าตัด / ช่วงคาน) การใช้รูปทรงหลายชิ้นส่วนจะแทนที่ทั้งหมด ดำเนินการต่อ?'))return;onApply(applyShapeModel(member,draft));};
 return <section className="panel padded shape-editor">
  <div className="section-heading"><div><h3>รูปทรงหลายชิ้นส่วน · {member.code}</h3><p className="muted">ประกอบจากชิ้นส่วน (กล่อง · หลายเหลี่ยม · ทรงกระบอก/ผนังกลม · ปล่อง) และช่องเปิด · ชิ้นส่วนซ้อนกันนับครั้งเดียว · แก้ได้ทั้งในแปลนและช่องคุณสมบัติ · มิติ mm</p></div>
   <div className="actions"><label className="field compact"><span>Snap</span><select value={snap} onChange={e=>setSnap(Number(e.target.value))}>{[1,10,25,50,100].map(v=><option key={v} value={v}>{v} mm</option>)}</select></label></div></div>
  <AiShapePanel member={member} project={project} attachments={attachments} readOnly={readOnly} onUse={shape=>{setDraft(shape);setSel(shape.parts[0].id);}}/>
  <div className="shape-layout">
   <aside className="shape-parts">
    <h4>ชิ้นส่วน ({draft.parts.length}/40)</h4>
    {draft.parts.map((p,i)=><button key={p.id} type="button" className={`shape-part ${p.id===sel?'active':''} ${p.role}`} onClick={()=>setSel(p.id)}>
     <i className={`stage-${Math.min(p.stage,3)}`}/><span><b>{i+1}. {p.label}</b><small>{p.role==='void'?'ช่องเปิด · ':''}{shapeKindLabels[p.shape]} · สูง {fmt(p.height)} · Stage {p.stage}</small></span></button>)}
    {!readOnly&&<div className="shape-add">{adders.map(([l,f])=><button key={l} type="button" disabled={draft.parts.length>=40} onClick={()=>add(f())}><Plus size={12}/>{l}</button>)}</div>}
    <PilesPanel draft={draft} readOnly={readOnly} onChange={piles=>setDraft(d=>({...d,confirmed:false,piles}))}/>
    <SitePanel draft={draft} readOnly={readOnly} onChange={site=>setDraft(d=>({...d,site}))}/>
   </aside>
   <div className="shape-views">
    <div className="shape-view"><b className="shape-view-title">PLAN (TOP VIEW) · ลากชิ้นส่วน / ด้าม · เส้นประ = แนวตัด</b><PlanEditor draft={draft} sel={sel} snap={snap} cut={cut} readOnly={readOnly} onSelect={setSel} onPart={put} onCut={setCut}/></div>
    <div className="shape-view"><b className="shape-view-title">3D</b>{preview?<ModelView member={preview} spec={project.spec} selected="" onSelect={()=>{}}/>:<p className="notice danger">{applyError}</p>}</div>
    {preview&&<><div className="shape-view"><b className="shape-view-title">SECTION X–X (Y = {fmt(cut[1])})</b><SectionView member={preview} axes={[0,2]} normal={1} cut={cut[1]+shift[1]}/></div>
     <div className="shape-view"><b className="shape-view-title">SECTION Y–Y (X = {fmt(cut[0])})</b><SectionView member={preview} axes={[1,2]} normal={0} cut={cut[0]+shift[0]}/></div></>}
   </div>
   <aside className="shape-props">
    {part?<PartProps part={part} index={draft.parts.indexOf(part)} readOnly={readOnly} onChange={patch=>put(part.id,patch)}
     onDuplicate={()=>{const c={...structuredClone(part),id:newId(),label:`${part.label} (สำเนา)`};add(c);}}
     onDelete={()=>{if(draft.parts.filter(p=>p.role==='solid').length===1&&part.role==='solid')return;setDraft(d=>({...d,confirmed:false,parts:d.parts.filter(p=>p.id!==part.id)}));setSel(draft.parts.find(p=>p.id!==part.id)?.id||'');}}/>:<p className="muted">เลือกชิ้นส่วน</p>}
    <h4>ตรวจมิติ</h4>
    {checks.blockers.length?<ul className="shape-check bad">{checks.blockers.map(t=><li key={t}>{t}</li>)}</ul>:<p className="ok-text">✔ รูปทรงคำนวณได้ · ไม่มีชิ้นส่วนลอย / เข็มนอกแปลน</p>}
    {checks.notes.length>0&&<ul className="shape-check">{checks.notes.map(t=><li key={t}>{t}</li>)}</ul>}
    <h4>ปริมาณ (พรีวิว ต่อ 1 ชิ้น)</h4>
    {q?<table className="shape-qty"><tbody><tr><td>คอนกรีต</td><td>{number(q.concrete)} m³</td></tr>
     {stages.length>1&&stages.map(s=><tr key={s.stage}><td>&nbsp; Stage {s.stage}</td><td>{number(s.volume)} m³</td></tr>)}
     <tr><td>แบบหล่อ</td><td>{number(q.formwork)} m²</td></tr>
     {draft.site&&<><tr><td>งานขุด</td><td>{number(q.excavation)} m³</td></tr><tr><td>Lean</td><td>{number(q.lean)} m³</td></tr><tr><td>ถมกลับ</td><td>{number(q.backfill)} m³</td></tr></>}
     {piles&&piles.count>0&&<><tr><td>เสาเข็ม</td><td>{piles.count} ต้น · {number(piles.totalLength,2)} m</td></tr>{piles.cutCount>0&&<tr><td>ตัดหัวเข็ม</td><td>{piles.cutCount} ต้น</td></tr>}</>}
     <tr><td>ขนาดรวม X/Y/Z</td><td>{fmt(preview!.x)} / {fmt(preview!.y)} / {fmt(preview!.z)}</td></tr></tbody></table>:<p className="muted">—</p>}
    <p className="muted">ทรงกลมคำนวณด้วยรูปหลายเหลี่ยมพื้นที่เท่าวงกลม (ปริมาตรตรง · แนวขอบต่างไม่เกิน ~2 mm)</p>
    <label className="check"><input type="checkbox" disabled={readOnly} checked={draft.confirmed} onChange={e=>setDraft(d=>({...d,confirmed:e.target.checked}))}/>ตรวจมิติทุกชิ้นกับแบบแล้ว (ยืนยันรูปทรง)</label>
    <button className="primary shape-apply" disabled={blocked} onClick={apply}>ใช้รูปทรงนี้กับสมาชิก</button>
    <p className="muted">หลังใช้: ตรวจรูปในแท็บ “แบบ & BBS” แล้วเพิ่มชุดเหล็ก · กดบันทึกสมาชิก</p>
   </aside>
  </div>
 </section>;
}

const faceLabels:Record<string,string>={B:'ตะแกรงล่าง',T:'ตะแกรงบน',EF:'แนวตั้งผิวข้าง',LOOP:'ปลอกรอบผิว',ADD:'เสริมเพิ่ม',NOTE:'ข้อกำหนด'};
const roles=['แปลน (Top view)','รูปตัด X–X','รูปตัด Y–Y','รูปตัดอื่น','3D / Axonometric','หลายรูปในหน้าเดียว'];
/** Steps 1–2: send the member's drawings to the AI one after another (each refines the previous proposal), answer the gaps, use as shape. */
function AiShapePanel({member,project,attachments,readOnly,onUse}:{member:Member;project:Project;attachments:Attachment[];readOnly:boolean;onUse:(s:ShapeModel)=>void}){
 const [pick,setPick]=useState<Record<string,string>>(()=>Object.fromEntries(attachments.map(a=>[a.id,'หลายรูปในหน้าเดียว']))),[on,setOn]=useState<Record<string,boolean>>({});
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[proposal,setProposal]=useState<ShapeProposal|null>(null),[replies,setReplies]=useState<Record<string,string>>({});
 const files=attachments.filter(a=>on[a.id]),configured=aiShapeConfigured(),gaps=proposal?proposalGaps(proposal):[];
 /** First read, or a re-read that refines `proposal` with the user's replies to its questions. */
 const run=async(answers?:ShapeAnswer[])=>{setBusy(true);setError('');let cur:ShapeProposal|undefined=answers?proposal||undefined:undefined;try{for(const [i,a] of files.entries()){
  const at=`ไฟล์ ${i+1}/${files.length}`;setProgress(`${at} · กำลังเตรียมภาพขยายของแบบ…`);
  const views=await drawingViews(a).catch(()=>undefined);
  cur=await analyseShapeWithAI({attachment:a,member,project,role:pick[a.id]||roles[5],current:cur,views,answers,onProgress:p=>setProgress(`${at} · ${p.label}`)});}if(cur){setProposal(cur);setReplies({});}}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);setProgress('');}};
 const shapeQs=proposal?.missing.filter(x=>x.kind!=='rebar')||[],rebarQs=proposal?.missing.filter(x=>x.kind==='rebar')||[];
 const qKey=(x:{part:string;question:string})=>`${x.part}|${x.question}`,answers:ShapeAnswer[]=(proposal?.missing||[]).map(x=>({part:x.part,question:x.question,answer:(replies[qKey(x)]||'').trim()})).filter(a=>a.answer);
 const ask=(x:{part:string;question:string},i:number)=><label key={i} className="shape-ai-q"><span>❓ {x.part?`${x.part}: `:''}{x.question}</span><textarea rows={2} disabled={readOnly||busy} placeholder="พิมพ์คำตอบ เช่น ขอบเขต / ระดับ / ค่าที่ใช้ (เว้นว่างได้)" value={replies[qKey(x)]||''} onChange={e=>setReplies(r=>({...r,[qKey(x)]:e.target.value}))}/></label>;
 const answer=(g:{part:number;field:string},value:number)=>setProposal(p=>{if(!p)return p;if(g.part<0)return {...p,piles:p.piles?{...p.piles,[g.field]:value}:p.piles};return {...p,parts:p.parts.map((q,i)=>i===g.part?{...q,[g.field]:value}:q)};});
 return <details className="shape-ai" open={!member.shapeModel}><summary>✨ ขั้นที่ 1–2 · ให้ AI อ่านรูปทรงจากแบบต้นทาง ({attachments.length} ไฟล์)</summary>
  {!configured&&<p className="notice warning">ยังไม่ได้ตั้งค่าบริการ AI (VITE_AI_DRAWING_ANALYSIS_ENDPOINT) · สร้างรูปทรงด้วยมือได้ด้านล่าง</p>}
  {!attachments.length?<p className="muted">อัปโหลดแบบ (แปลน / รูปตัด / 3D) ในแท็บ “แบบต้นทาง / อ่านจากแบบ” ก่อน</p>:<table className="shape-ai-files"><thead><tr><th/><th>ไฟล์</th><th>บทบาทของรูป</th></tr></thead><tbody>{attachments.map(a=><tr key={a.id}><td><input type="checkbox" disabled={busy} checked={!!on[a.id]} onChange={e=>setOn({...on,[a.id]:e.target.checked})}/></td><td>{a.name}<small className="block">{a.kind||''} {a.revision?`Rev ${a.revision}`:''}</small></td><td><select disabled={busy} value={pick[a.id]||roles[5]} onChange={e=>setPick({...pick,[a.id]:e.target.value})}>{roles.map(r=><option key={r}>{r}</option>)}</select></td></tr>)}</tbody></table>}
  <div className="actions"><button className="primary" disabled={readOnly||busy||!configured||!files.length} onClick={()=>void run()}>{busy?'กำลังอ่าน…':`อ่านรูปทรงจาก ${files.length} ไฟล์`}</button>{progress&&<span role="status" className="muted">{progress}</span>}</div>
  <p className="muted">AI อ่านทีละไฟล์ตามลำดับ ไฟล์ถัดไปใช้ผลก่อนหน้าเติมให้ครบ · ค่าที่อ่านไม่ได้จะถามด้านล่าง ไม่เดาค่า</p>
  {error&&<p className="notice danger">{error}</p>}
  {proposal&&<div className="shape-ai-result"><h4>ผล AI · ความมั่นใจ {proposal.confidence} · {proposal.parts.length} ชิ้นส่วน{proposal.piles?` · เสาเข็ม ${proposal.piles.positions.length} ต้น`:''}</h4>
   <table className="shape-qty"><thead><tr><th>ชิ้นส่วน</th><th>ชนิด</th><th>มิติ</th><th>ที่มา</th></tr></thead><tbody>{proposal.parts.map((q,i)=><tr key={i}><td>{q.role==='void'?'(ช่องเปิด) ':''}{q.label}</td><td>{shapeKindLabels[q.shape]}</td><td>{q.shape==='circle'?`Ø${q.diameter??'?'}${q.inner?` / Ø${q.inner}`:''}`:q.shape==='polygon'?`${q.points?.length||0} จุด`:`${q.w??'?'} × ${q.d??'?'}`} · z {q.z0??'?'} · h {q.height??'?'}</td><td><small>{q.source}</small></td></tr>)}</tbody></table>
   {!!proposal.levels?.length&&<p className="muted">ระดับที่อ่านได้: {proposal.levels.map(l=>`${l.name}${l.elevation!==null?` ${l.elevation.toFixed(3)}`:''}${l.z!==null?` (z ${fmt(l.z)})`:''}`).join(' · ')}</p>}
   {!!proposal.checks?.length&&<ul className="shape-check ok">{proposal.checks.map((t,i)=><li key={i}>✔ {t}</li>)}</ul>}
   {(gaps.length>0||shapeQs.length>0)&&<><h4>ข้อมูลรูปทรงที่ขาด — ตอบก่อนใช้ ({gaps.length+shapeQs.length})</h4>
    {gaps.map(g=><label key={`${g.part}-${g.field}`} className="shape-gap"><span>⚠ {g.label}</span>{g.field!=='points'&&<input type="number" placeholder="mm" onChange={e=>{const v=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(v))answer(g,v);}}/>}</label>)}
    {shapeQs.map(ask)}</>}
   {proposal.conflicts.length>0&&<div className="notice warning">{proposal.conflicts.join('\n')}</div>}
   {proposal.rebarNotes.length>0&&<><h4>Note เหล็กจากแบบ ({proposal.rebarNotes.length}) · ใช้สร้างเหล็กในขั้นถัดไป</h4>
    <table className="shape-qty"><thead><tr><th>Note</th><th>ชิ้นส่วน</th><th>ตำแหน่ง</th><th>ความหมาย</th></tr></thead><tbody>{proposal.rebarNotes.map((n,i)=><tr key={i}><td><b>{n.text}</b></td><td>{n.part||'-'}</td><td>{[n.face&&faceLabels[n.face],n.dir,n.level].filter(Boolean).join(' · ')||'-'}</td><td><small>{n.meaning}{n.source?` · ${n.source}`:''}</small></td></tr>)}</tbody></table></>}
   {rebarQs.length>0&&<><h4>ข้อมูลเหล็กที่แบบไม่ได้ระบุ ({rebarQs.length})</h4>{rebarQs.map(ask)}<p className="muted">คำถามเหล่านี้จะแสดงอีกครั้งในขั้นใส่เหล็ก</p></>}
   {proposal.references.length>0&&<p className="muted">โครงสร้างอ้างอิง (ไม่คิดปริมาณ): {proposal.references.map(r=>r.label).join(' · ')}</p>}
   {proposal.missing.length>0&&<div className="actions"><button disabled={readOnly||busy||!configured||!files.length||!answers.length} onClick={()=>void run(answers)}>{busy?'กำลังอ่าน…':`อ่านแบบใหม่พร้อมคำตอบ (${answers.length}/${proposal.missing.length})`}</button>
    <span className="muted">{files.length?'AI อ่านไฟล์ที่ติ๊กไว้อีกครั้ง โดยใช้ผลนี้และคำตอบของคุณ แล้วถามเฉพาะส่วนที่ยังขาด':'ติ๊กไฟล์ด้านบนก่อนอ่านใหม่'}</span></div>}
   <div className="actions"><button className="primary" disabled={readOnly} onClick={()=>{if(gaps.length&&!confirm(`ยังมี ${gaps.length} ค่าที่ไม่ได้ตอบ · ระบบจะใส่ค่าชั่วคราวและทำเครื่องหมาย ⚠ ไว้ที่ชิ้นส่วน ใช้ต่อ?`))return;onUse(proposalToShape(proposal));}}>ใช้ผล AI เป็นรูปทรง (แทนที่ด้านล่าง)</button>
    <span className="muted">ตรวจ 3D / รูปตัดด้านล่าง → ติ๊ก “ตรวจมิติทุกชิ้นกับแบบแล้ว” → ใช้รูปทรง → ระบบพาไปขั้นใส่เหล็กจาก Note</span></div>
  </div>}
 </details>;
}

function SectionView({member,axes,normal,cut}:{member:Member;axes:[number,number];normal:number;cut:number}){
 const W=520,data=useMemo(()=>buildView(member,[],undefined,{axes,normal,cut}),[member,axes[0],axes[1],normal,cut]),H=viewHeight(data,W,300);
 const prims=useMemo(()=>renderView(data,{x:0,y:0,w:W,h:H},{colors:new Map()}),[data,H]);
 return <svg className="graphic-view" viewBox={`0 0 ${W} ${H}`} role="img" fontFamily="Sarabun, sans-serif"><PrimsSvg prims={prims}/></svg>;
}

/** Interactive plan: parts in raw model coordinates (Y up), drag body to move, grips to resize / reshape, cut lines draggable. */
function PlanEditor({draft,sel,snap,cut,readOnly,onSelect,onPart,onCut}:{draft:ShapeModel;sel:string;snap:number;cut:P2;readOnly:boolean;onSelect:(id:string)=>void;onPart:(id:string,patch:Partial<ShapePart>)=>void;onCut:(c:P2)=>void}){
 const svg=useRef<SVGSVGElement>(null),[drag,setDrag]=useState<Drag|null>(null),W=560,H=380,M=56;
 const pts=[...draft.parts.flatMap(p=>partPolygon(p)[0]),...(draft.piles?.positions||[])];
 const lo=[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1]))],hi=[Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];
 const s=Math.min((W-2*M)/Math.max(1,hi[0]-lo[0]),(H-2*M)/Math.max(1,hi[1]-lo[1])),ox=M+((W-2*M)-(hi[0]-lo[0])*s)/2,oy=H-M-((H-2*M)-(hi[1]-lo[1])*s)/2;
 const X=(x:number)=>ox+(x-lo[0])*s,Y=(y:number)=>oy-(y-lo[1])*s;
 const world=(e:{clientX:number;clientY:number}):P2=>{const m=svg.current!.getScreenCTM()!.inverse(),p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m);return [(p.x-ox)/s+lo[0],(oy-p.y)/s+lo[1]];};
 const sn=(v:number)=>Math.round(v/snap)*snap;
 const begin=(e:RPointerEvent,d:Omit<Drag,'start'>)=>{if(readOnly)return;e.stopPropagation();(e.target as Element).setPointerCapture?.(e.pointerId);setDrag({...d,start:world(e)});};
 const move=(e:RPointerEvent)=>{if(!drag)return;const w=world(e),dx=sn(w[0]-drag.start[0]),dy=sn(w[1]-drag.start[1]),o=drag.orig as any;
  if(drag.mode==='cutX'){onCut([cut[0],sn(w[1])]);return;}if(drag.mode==='cutY'){onCut([sn(w[0]),cut[1]]);return;}
  if(!o||!drag.id)return;
  if(drag.mode==='move'){if(o.shape==='box'||o.shape==='shaft')onPart(drag.id,{x:o.x+dx,y:o.y+dy});else if(o.shape==='circle')onPart(drag.id,{cx:o.cx+dx,cy:o.cy+dy});else onPart(drag.id,{points:o.points.map(([x,y]:P2)=>[x+dx,y+dy])});}
  if(drag.mode==='size')onPart(drag.id,{w:Math.max(snap,o.w+dx),d:Math.max(snap,o.d+dy)});
  if(drag.mode==='radius')onPart(drag.id,{diameter:Math.max(2*snap,sn(2*Math.hypot(w[0]-o.cx,w[1]-o.cy)))});
  if(drag.mode==='vertex')onPart(drag.id,{points:o.points.map((p:P2,i:number)=>i===drag.index?[sn(w[0]),sn(w[1])]:p)});
 };
 const fp=useMemo(()=>{try{return shapeFootprint(draft);}catch{return [];}},[draft]);
 const path=(rings:P2[][])=>rings.map(r=>`M${r.map(p=>`${X(p[0])},${Y(p[1])}`).join('L')}Z`).join('');
 const selPart=draft.parts.find(p=>p.id===sel);
 const dimH=(x0:number,x1:number,y:number,t:string)=><g className="dim"><line x1={X(x0)} x2={X(x1)} y1={y} y2={y}/><line x1={X(x0)} x2={X(x0)} y1={y-4} y2={y+4}/><line x1={X(x1)} x2={X(x1)} y1={y-4} y2={y+4}/><text x={(X(x0)+X(x1))/2} y={y-4} textAnchor="middle">{t}</text></g>;
 const dimV=(y0:number,y1:number,x:number,t:string)=><g className="dim"><line y1={Y(y0)} y2={Y(y1)} x1={x} x2={x}/><line y1={Y(y0)} y2={Y(y0)} x1={x-4} x2={x+4}/><line y1={Y(y1)} y2={Y(y1)} x1={x-4} x2={x+4}/><text x={x-5} y={(Y(y0)+Y(y1))/2} textAnchor="end" dominantBaseline="middle">{t}</text></g>;
 return <svg ref={svg} className="shape-plan" viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerUp={()=>setDrag(null)} onPointerLeave={()=>setDrag(null)} onPointerDown={()=>onSelect('')} role="img" aria-label="แปลนรูปทรง">
  <path d={fp.map(poly=>path(poly.map(r=>r.slice(0,-1) as P2[]))).join('')} className="fp" fillRule="evenodd"/>
  {draft.parts.map(p=><path key={p.id} d={path(partPolygon(p))} fillRule="evenodd" className={`part ${p.role} stage${Math.min(p.stage,3)} ${p.id===sel?'sel':''}`} onPointerDown={e=>{onSelect(p.id);begin(e,{mode:'move',id:p.id,orig:structuredClone(p)});}}/>)}
  {draft.piles?.positions.map(([x,y],i)=><circle key={i} cx={X(x)} cy={Y(y)} r={Math.max(3,draft.piles!.size/2*s)} className="pile"/>)}
  <line className="cut" x1={X(lo[0])-20} x2={X(hi[0])+20} y1={Y(cut[1])} y2={Y(cut[1])} onPointerDown={e=>begin(e,{mode:'cutX'})}/><text className="cut-t" x={X(hi[0])+24} y={Y(cut[1])+4}>X</text>
  <line className="cut" y1={Y(lo[1])+20} y2={Y(hi[1])-20} x1={X(cut[0])} x2={X(cut[0])} onPointerDown={e=>begin(e,{mode:'cutY'})}/><text className="cut-t" x={X(cut[0])+4} y={Y(hi[1])-24}>Y</text>
  {dimH(lo[0],hi[0],H-14,fmt(hi[0]-lo[0]))}{dimV(lo[1],hi[1],18,fmt(hi[1]-lo[1]))}
  {selPart&&!readOnly&&(()=>{const p=selPart as any;
   if(p.shape==='box'||p.shape==='shaft')return <><rect className="grip" x={X(p.x+p.w)-5} y={Y(p.y+p.d)-5} width={10} height={10} onPointerDown={e=>begin(e,{mode:'size',id:p.id,orig:structuredClone(p)})}/>{dimH(p.x,p.x+p.w,Y(p.y+p.d)-12,fmt(p.w))}{dimV(p.y,p.y+p.d,X(p.x)-10,fmt(p.d))}</>;
   if(p.shape==='circle')return <><rect className="grip" x={X(p.cx+p.diameter/2)-5} y={Y(p.cy)-5} width={10} height={10} onPointerDown={e=>begin(e,{mode:'radius',id:p.id,orig:structuredClone(p)})}/><text className="grip-t" x={X(p.cx)} y={Y(p.cy)} textAnchor="middle">Ø{fmt(p.diameter)}{p.inner?` / Ø${fmt(p.inner)}`:''}</text></>;
   if(p.shape==='polygon')return p.points.map(([x,y]:P2,i:number)=>{const n=p.points[(i+1)%p.points.length],len=Math.hypot(n[0]-x,n[1]-y);return <g key={i}><rect className="grip" x={X(x)-5} y={Y(y)-5} width={10} height={10} onPointerDown={e=>begin(e,{mode:'vertex',id:p.id,index:i,orig:structuredClone(p)})}/>{len*s>40&&<text className="grip-t" x={(X(x)+X(n[0]))/2} y={(Y(y)+Y(n[1]))/2-4} textAnchor="middle">{fmt(len)}</text>}</g>;});
   return null;})()}
 </svg>;
}

function PartProps({part:p,index,readOnly,onChange,onDuplicate,onDelete}:{part:ShapePart;index:number;readOnly:boolean;onChange:(patch:Partial<ShapePart>)=>void;onDuplicate:()=>void;onDelete:()=>void}){
 const num=(label:string,key:string,min=0)=><Field key={key} label={label} type="number" disabled={readOnly} value={(p as any)[key]} onChange={v=>onChange({[key]:Math.max(min,Number(v)||0)} as any)}/>;
 const coord=(label:string,key:string)=><Field key={key} label={label} type="number" disabled={readOnly} value={(p as any)[key]} onChange={v=>onChange({[key]:Number(v)||0} as any)}/>;
 return <div className="shape-part-props">
  <div className="section-heading"><h4>{index+1}. คุณสมบัติ · {shapeKindLabels[p.shape]}</h4><span className="actions"><button type="button" title="ทำสำเนา" disabled={readOnly} onClick={onDuplicate}><Copy size={13}/></button><button type="button" className="danger-text" title="ลบ" disabled={readOnly} onClick={onDelete}><Trash2 size={13}/></button></span></div>
  <Field label="ชื่อชิ้นส่วน" value={p.label} disabled={readOnly} onChange={v=>onChange({label:String(v).slice(0,80)})}/>
  <div className="form-grid">
   <label className="field"><span>บทบาท</span><select disabled={readOnly} value={p.role} onChange={e=>onChange({role:e.target.value as ShapePart['role']})}><option value="solid">คอนกรีต</option><option value="void">ช่องเปิด / หลุม (หัก)</option></select></label>
   <label className="field"><span>Stage การเท</span><select disabled={readOnly||p.role==='void'} value={p.stage} onChange={e=>onChange({stage:Number(e.target.value)})}>{[1,2,3,4,5].map(n=><option key={n} value={n}>Stage {n}</option>)}</select></label>
   {coord('ระดับล่าง z0','z0')}{num('ความสูง','height',1)}
   {(p.shape==='box'||p.shape==='shaft')&&<>{coord('มุม X','x')}{coord('มุม Y','y')}{num('กว้าง X','w',1)}{num('ยาว Y','d',1)}</>}
   {p.shape==='shaft'&&num('ความหนาผนัง','wall',1)}
   {p.shape==='circle'&&<>{coord('ศูนย์กลาง X','cx')}{coord('ศูนย์กลาง Y','cy')}{num('Ø นอก','diameter',1)}{num('Ø ใน (0 = ตัน)','inner')}</>}
  </div>
  {p.shape==='polygon'&&<div className="shape-points"><span className="field-label">จุดยอดแปลน (X, Y)</span>{p.points.map(([x,y],i)=><div key={i} className="shape-point"><b>{i+1}</b><input type="number" disabled={readOnly} value={x} onChange={e=>onChange({points:p.points.map((q,k)=>k===i?[Number(e.target.value)||0,q[1]]:q)} as any)}/><input type="number" disabled={readOnly} value={y} onChange={e=>onChange({points:p.points.map((q,k)=>k===i?[q[0],Number(e.target.value)||0]:q)} as any)}/>
    <button type="button" disabled={readOnly||p.points.length>=64} title="แทรกจุดถัดไป" onClick={()=>{const n=p.points[(i+1)%p.points.length];onChange({points:[...p.points.slice(0,i+1),[(x+n[0])/2,(y+n[1])/2],...p.points.slice(i+1)]} as any);}}><Plus size={12}/></button>
    <button type="button" disabled={readOnly||p.points.length<=3} title="ลบจุด" onClick={()=>onChange({points:p.points.filter((_,k)=>k!==i)} as any)}><Trash2 size={12}/></button></div>)}</div>}
  <label className="check"><input type="checkbox" disabled={readOnly} checked={p.formSides} onChange={e=>onChange({formSides:e.target.checked})}/>{p.role==='void'?'คิดแบบหล่อผิวช่องเปิด':'คิดแบบหล่อผิวข้าง'}</label>
  <label className="check"><input type="checkbox" disabled={readOnly} checked={p.formBottom} onChange={e=>onChange({formBottom:e.target.checked})}/>{p.role==='void'?'คิดแบบหล่อใต้ท้องเหนือช่องเปิด':'คิดแบบหล่อใต้ท้อง (ส่วนยื่น / ลอย)'}</label>
  <Field label="ที่มาของมิติ (แบบ / รูปตัด / หน้า)" value={p.source} disabled={readOnly} onChange={v=>onChange({source:String(v).slice(0,200)})}/>
 </div>;
}

function PilesPanel({draft,readOnly,onChange}:{draft:ShapeModel;readOnly:boolean;onChange:(p:ShapeModel['piles'])=>void}){
 const p=draft.piles,[grid,setGrid]=useState({nx:2,ny:2,sx:3000,sy:3000,x:1000,y:1000});
 return <div className="shape-sub"><label className="check"><input type="checkbox" disabled={readOnly} checked={!!p} onChange={e=>onChange(e.target.checked?{type:'round',size:600,length:12,cutoff:500,embed:75,positions:[]}:undefined)}/><b>เสาเข็ม</b>{p?` · ${p.positions.length} ต้น`:''}</label>
  {p&&<><div className="form-grid">
   <label className="field"><span>ชนิด</span><select disabled={readOnly} value={p.type} onChange={e=>onChange({...p,type:e.target.value as 'round'|'square'})}><option value="round">กลม</option><option value="square">สี่เหลี่ยม</option></select></label>
   <Field label={p.type==='round'?'Ø (mm)':'ขนาด (mm)'} type="number" disabled={readOnly} value={p.size} onChange={v=>onChange({...p,size:Math.max(1,Number(v)||1)})}/>
   <Field label="ยาว (m)" type="number" disabled={readOnly} value={p.length} onChange={v=>onChange({...p,length:Math.max(0,Number(v)||0)})}/>
   <Field label="ตัดหัว / ต้น (mm)" type="number" disabled={readOnly} value={p.cutoff} onChange={v=>onChange({...p,cutoff:Math.max(0,Number(v)||0)})}/>
   <Field label="ฝังในคอนกรีต (mm)" type="number" disabled={readOnly} value={p.embed} onChange={v=>onChange({...p,embed:Math.max(0,Number(v)||0)})}/></div>
   <label className="field"><span>ตำแหน่ง X, Y (บรรทัดละต้น)</span><textarea rows={3} disabled={readOnly} value={p.positions.map(q=>q.join(', ')).join('\n')} onChange={e=>onChange({...p,positions:e.target.value.split('\n').map(l=>l.split(/[,\s]+/).filter(Boolean).map(Number)).filter(v=>v.length===2&&v.every(Number.isFinite)).slice(0,100) as P2[]})}/></label>
   <details><summary>สร้างตำแหน่งแบบตาราง</summary><div className="form-grid">{(['nx','ny','sx','sy','x','y'] as const).map(k=><Field key={k} label={{nx:'จำนวน X',ny:'จำนวน Y',sx:'ระยะ X',sy:'ระยะ Y',x:'ต้นแรก X',y:'ต้นแรก Y'}[k]} type="number" value={grid[k]} onChange={v=>setGrid({...grid,[k]:Number(v)||0})}/>)}</div>
    <button type="button" disabled={readOnly} onClick={()=>{const out:P2[]=[];for(let j=0;j<Math.min(20,grid.ny);j++)for(let i=0;i<Math.min(20,grid.nx);i++)out.push([grid.x+i*grid.sx,grid.y+j*grid.sy]);onChange({...p,positions:out.slice(0,100)});}}>ใช้ตำแหน่งตาราง</button></details></>}
 </div>;
}
function SitePanel({draft,readOnly,onChange}:{draft:ShapeModel;readOnly:boolean;onChange:(s:ShapeModel['site'])=>void}){
 const s=draft.site,f=(label:string,k:keyof NonNullable<ShapeModel['site']>)=><Field key={k} label={label} type="number" disabled={readOnly} value={s![k]} onChange={v=>onChange({...s!,[k]:Math.max(0,Number(v)||0)})}/>;
 return <div className="shape-sub"><label className="check"><input type="checkbox" disabled={readOnly} checked={!!s} onChange={e=>onChange(e.target.checked?{excavationDepth:1500,workingSpace:300,slope:0,leanThickness:50,leanProjection:100}:undefined)}/><b>งานดิน / Lean</b></label>
  {s&&<div className="form-grid">{f('ความลึกขุด (จากดินถึงก้นหลุม)','excavationDepth')}{f('เผื่อทำงาน / ด้าน','workingSpace')}{f('ความลาด H:V','slope')}{f('Lean หนา','leanThickness')}{f('Lean ยื่น / ด้าน','leanProjection')}</div>}
 </div>;
}
