import {useMemo,useState} from 'react';
import {isCoverQuestion} from '../domain/shapeProposal';
import {standardCover} from '../domain/shapeApply';
import {barsFromSuggestions,suggestFromNotes,type NoteAction,type Suggestion} from '../domain/rebarNotes';
import type {Bar,Member} from '../domain/model';
import {isSketchBar,layoutOf,loopBars,meshBars,nextMark,type HookEnd,type HookTable,type LayoutRule,type P2,type SketchView} from '../domain/rebarSketch';
import {loopPieces,type Detailing} from '../domain/elementInput';
import {Field} from './EditorControls';

// Sub-tools of the rebar workspace (`RebarWorkspace.tsx`): notes → bar sets, end hooks, layout rule, plan mesh, loops.
export const DIAS=[6,9,10,12,16,20,25,28,32,36,40];
const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');
export type Tool='draw'|'select'|'mesh'|'loop'|'notes';
export const viewOfBar=(b:Bar):SketchView|undefined=>b.shape==='polyline'&&b.distributionAxis&&b.points.length>=2?{kind:b.distributionAxis==='Y'?'sx':b.distributionAxis==='X'?'sy':'plan',at:b.distributionStart}:undefined;

const actionLabels:Record<NoteAction,string>={bottom:'ตะแกรงล่าง',top:'ตะแกรงบน',loops:'ลูปรอบผิว',vertical:'แนวตั้งรอบผิว',skip:'ข้าม'};
/** Phase 3: reinforcement notes (AI-read or typed) → suggested bar sets to confirm one by one. */
export function NotesTool({m,readOnly,gradeOf,onNotes,onCreate}:{m:Member;readOnly:boolean;gradeOf:(d:number)=>string;onNotes:(n:NonNullable<NonNullable<Member['shapeModel']>['rebarNotes']>)=>void;onCreate:(b:Bar[])=>void}){
 const saved=m.shapeModel?.rebarNotes||[],questions=(m.shapeModel?.rebarQuestions||[]).filter(q=>!isCoverQuestion({field:'',question:q})),[text,setText]=useState(saved.map(n=>n.text).join('\n')||'Y32-150 (B)\nY32-150 (T)\nY16-200 LOOPS\n15d');
 const lines=text.split('\n').map(l=>l.trim()).filter(Boolean).slice(0,60);
 const first=useMemo(()=>saved.length&&!m.bars.some(isSketchBar)?suggestFromNotes(m,lines,saved):[],[]);
 const [list,setList]=useState<Suggestion[]>(first),[picked,setPicked]=useState<Record<string,boolean>>(()=>Object.fromEntries(first.map(x=>[x.id,x.action!=='skip'])));
 const suggest=()=>{const s=suggestFromNotes(m,lines,saved);setList(s);setPicked(Object.fromEntries(s.map(x=>[x.id,x.action!=='skip'])));onNotes(lines.map(t=>{const n=saved.find(x=>x.text===t);return n?{...n,text:t.slice(0,120)}:{text:t.slice(0,120),meaning:'',source:''};}));};
 const put=(id:string,patch:Partial<Suggestion>)=>setList(l=>l.map(s=>s.id===id?{...s,...patch}:s));
 const chosen=list.filter(s=>picked[s.id]&&s.action!=='skip');
 const [creating,setCreating]=useState(false),[result,setResult]=useState<{ok:boolean;text:string}|null>(null);
 /** Builds per suggestion so one failing note is reported without losing the others; yields first so the busy state paints. */
 const create=()=>{setCreating(true);setResult(null);setTimeout(()=>{
  const made:Bar[]=[],fails:string[]=[],empty:string[]=[];let work=m;
  for(const s of chosen){try{const bars=barsFromSuggestions(work,[s],gradeOf);if(!bars.length)empty.push(s.note.text);made.push(...bars);work={...work,bars:[...work.bars,...bars]};}
   catch(e){fails.push(`${s.note.text}: ${e instanceof Error?e.message:String(e)}`);}}
  if(made.length)onCreate(made);
  setResult({ok:made.length>0&&!fails.length,text:[made.length?`สร้างแล้ว ${made.length} ชุด (${made.map(b=>b.mark).join(', ')}) · ดูในรายการเหล็กและมุมมองด้านขวา`:'ไม่ได้สร้างเหล็ก',
   empty.length?`ไม่พบช่วงคอนกรีตที่ระดับ Z ที่กำหนด: ${empty.join(' · ')} (ตรวจ Z / ระดับของรูปทรง)`:'',fails.length?`ผิดพลาด: ${fails.join(' · ')}`:''].filter(Boolean).join('\n')});
  setCreating(false);},30);};
 return <div className="sketch-sub notes-tool"><h4>Note เหล็กในแบบ → ชุดเหล็ก</h4>
  <p className="muted">หนึ่งบรรทัดต่อหนึ่ง Note เช่น Y32-150 (B), DB16@200 LOOPS, ADD Y20-150, 15d {saved.length?`· มี ${saved.length} Note จากผลอ่านแบบ (ตำแหน่ง / ชิ้นส่วนตามที่ AI อ่าน)`:''}</p>
  <p className="muted">Cover ที่ใช้สร้างเหล็ก: <b>{m.cover} mm</b>{m.shapeModel&&m.cover===standardCover(m.shapeModel)?' (ค่ามาตรฐาน)':''} · แก้ได้ในแท็บ “รูปทรง” หรือคลิกขวา “องค์ประกอบ (คอนกรีต)” ใน 3D Modal แล้วสร้างชุดเหล็กใหม่</p>
  {questions.length>0&&<div className="notice warning"><b>ข้อมูลเหล็กที่แบบไม่ได้ระบุ — ตรวจ / กำหนดก่อนยืนยัน</b>{questions.map((q,i)=><div key={i}>❓ {q}</div>)}</div>}
  <textarea rows={5} disabled={readOnly} value={text} onChange={e=>setText(e.target.value)}/>
  <button type="button" className="primary" disabled={readOnly||!lines.length} onClick={suggest}>เสนอชุดเหล็กจาก Note</button>
  {list.length>0&&<div className="notes-suggest">{list.map(s=>{const ai=saved.find(n=>n.text===s.note.text)?.meaning;return <div key={s.id} className={`note-row ${s.action==='skip'?'skip':''}`}>
   <label className="check"><input type="checkbox" disabled={readOnly||s.action==='skip'} checked={!!picked[s.id]&&s.action!=='skip'} onChange={e=>setPicked({...picked,[s.id]:e.target.checked})}/><b>{s.note.text}</b></label>
   <small>{s.reason}{ai?` · AI: ${ai}`:''}{s.manual?` · ${s.manual}`:''}</small>
   {s.action!=='skip'||s.note.diameter?<div className="form-grid">
    <label className="field"><span>ใช้เป็น</span><select disabled={readOnly} value={s.action} onChange={e=>put(s.id,{action:e.target.value as NoteAction})}>{(Object.keys(actionLabels) as NoteAction[]).map(k=><option key={k} value={k}>{actionLabels[k]}</option>)}</select></label>
    <label className="field"><span>ขนาด</span><select disabled={readOnly} value={s.diameter} onChange={e=>put(s.id,{diameter:Number(e.target.value)})}>{DIAS.map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select></label>
    <Field label="@ (mm)" type="number" disabled={readOnly} value={s.spacing} onChange={v=>put(s.id,{spacing:Math.max(50,Number(v)||50)})}/>
    {(s.action==='bottom'||s.action==='top')&&<label className="field"><span>ทิศ</span><select disabled={readOnly} value={s.dirs.join('')} onChange={e=>put(s.id,{dirs:e.target.value.split('') as ('X'|'Y')[]})}><option value="XY">X + Y</option><option value="X">X</option><option value="Y">Y</option></select></label>}
    {s.action!=='skip'&&<Field label={s.action==='loops'?'Z ล่าง':'Z (ศูนย์กลางเหล็ก)'} type="number" disabled={readOnly} value={Math.round(s.z)} onChange={v=>put(s.id,{z:Number(v)||0})}/>}
    {(s.action==='loops'||s.action==='vertical')&&<Field label="Z บน" type="number" disabled={readOnly} value={Math.round(s.zTop)} onChange={v=>put(s.id,{zTop:Number(v)||0})}/>}
    {(s.action==='bottom'||s.action==='top'||s.action==='vertical')&&<Field label={s.action==='vertical'?'ขางอเข้าใน (0 = ตรง)':'ขางอ (+ขึ้น / −ลง)'} type="number" disabled={readOnly} value={s.leg} onChange={v=>put(s.id,{leg:Number(v)||0})}/>}
   </div>:null}</div>;})}
   <button type="button" className="primary" disabled={readOnly||creating||!chosen.length} onClick={create}>{creating?'กำลังสร้างชุดเหล็ก…':`สร้างชุดเหล็กที่เลือก (${chosen.length})`}</button>
   {result&&<p className={`notice ${result.ok?'':'warning'}`} role="status" style={{whiteSpace:'pre-line'}}>{result.text}</p>}
   <p className="muted">ทุกชุดอยู่ในแนว cover ของสมาชิก · ลูป/เหล็กแนวตั้งหยุดก่อนระดับที่แปลนเปลี่ยน · ตรวจผลในมุมมองและรายการด้านขวาก่อนบันทึก</p></div>}
 </div>;
}
export function HookFields({label,value,d,table,onChange}:{label:string;value:HookEnd;d:number;table:HookTable;onChange:(v:HookEnd)=>void}){
 const row=table.find(t=>t.bar===d)||table.filter(t=>t.bar>=d).sort((x,y)=>x.bar-y.bar)[0],std=row?row.a90:12*d;
 return <div className="form-grid sketch-hook"><label className="field"><span>{label}</span><select value={value.kind} onChange={e=>onChange({...value,kind:e.target.value as HookEnd['kind'],leg:value.leg||std})}>
  <option value="none">ไม่มีขอ (ปลายตรง)</option><option value="std90">ขอมาตรฐาน 90° (A/G {fmt(std)})</option><option value="std135">ขอมาตรฐาน 135° (6d ≥ 75)</option><option value="std180">ขอมาตรฐาน 180°</option><option value="custom">ฉาก 90° กำหนดความยาวเอง</option></select></label>
  {value.kind==='custom'?<Field label="ความยาวฉาก (mm)" type="number" value={value.leg} onChange={v=>onChange({...value,leg:Math.max(0,Number(v)||0)})}/>:<span/>}</div>;
}
export function LayoutFields({layout:l,onChange,disabled=false}:{layout:LayoutRule;onChange:(l:LayoutRule)=>void;disabled?:boolean}){
 return <div className="form-grid">
  <label className="field"><span>กฎการกระจาย</span><select disabled={disabled} value={l.rule} onChange={e=>onChange({...l,rule:e.target.value as LayoutRule['rule']})}><option value="spacing">กลุ่ม · ระยะ @ สูงสุด</option><option value="count">กลุ่ม · จำนวนเส้น</option><option value="single">เส้นเดี่ยว</option></select></label>
  {l.rule==='spacing'&&<Field label="ระยะ @ (mm)" type="number" disabled={disabled} value={l.spacing} onChange={v=>onChange({...l,spacing:Math.max(10,Number(v)||10)})}/>}
  {l.rule==='count'&&<Field label="จำนวน (เส้น)" type="number" disabled={disabled} value={l.count} onChange={v=>onChange({...l,count:Math.max(1,Math.min(2000,Math.trunc(Number(v)||1)))})}/>}
  <Field label="เริ่ม (mm)" type="number" disabled={disabled} value={Number(l.from.toFixed(1))} onChange={v=>onChange({...l,from:Number(v)||0})}/>
  {l.rule!=='single'&&<Field label="สิ้นสุด (mm)" type="number" disabled={disabled} value={Number(l.to.toFixed(1))} onChange={v=>onChange({...l,to:Number(v)||0})}/>}
  {l.rule!=='single'&&(()=>{const n=layoutOf(l),gap=n.count>1?(n.to-n.from)/(n.count-1):0;return <p className="layout-count"><b>= {n.count} เส้น</b>{n.count>1?` · @ จริง ${fmt(gap)} mm · ช่วง ${fmt(n.to-n.from)} mm`:''}</p>;})()}
 </div>;
}
export function MeshTool({m,z,dia,cover,grade,within,readOnly,onCreate}:{m:Member;z:number;dia:number;cover:number;grade:string;within?:string[];readOnly:boolean;onCreate:(b:Bar[])=>void}){
 const [o,setO]=useState({spacing:200,x:true,y:true,leg:0});
 return <div className="sketch-sub"><h4>ตะแกรงตามแปลน (Area)</h4><p className="muted">วางเหล็กตรง{within?.length?'เฉพาะในแปลนของชิ้นที่เลือก':'ทั้งพื้นที่คอนกรีต'}ที่ระดับ Z = {fmt(z)} (ระยะ cover ทุกขอบ · แบ่ง Mark ตามความยาว)</p>
  <div className="form-grid"><Field label="ระยะ @ (mm)" type="number" value={o.spacing} onChange={v=>setO({...o,spacing:Math.max(50,Number(v)||50)})}/><Field label="ขางอปลาย (+ขึ้น / −ลง, 0 = ตรง)" type="number" value={o.leg} onChange={v=>setO({...o,leg:Number(v)||0})}/>
   <label className="check"><input type="checkbox" checked={o.x} onChange={e=>setO({...o,x:e.target.checked})}/>ทิศ X</label><label className="check"><input type="checkbox" checked={o.y} onChange={e=>setO({...o,y:e.target.checked})}/>ทิศ Y</label></div>
  <button type="button" className="primary" disabled={readOnly||(!o.x&&!o.y)} onClick={()=>onCreate(meshBars(m,{z,diameter:dia,grade,spacing:o.spacing,cover,dirs:[...(o.x?['X' as const]:[]),...(o.y?['Y' as const]:[])],leg:o.leg,note:`ตะแกรง Z ${fmt(z)}`,within}))}>สร้างตะแกรง</button>
  <p className="muted">ตั้ง Z ให้เป็นศูนย์กลางเหล็ก เช่น ตะแกรงล่าง = cover + d/2 · ชั้นที่ 2 บวกขนาดเหล็กชั้นแรก</p></div>;
}
/** Horizontal loops / hoops round the plan at Z: closed with one lap (1 จุด), or lapped pieces at 2 / 3 points (`loopPieces`,
 * the footing loop rule: laps inside one side, clear of the bends, no piece over the stock length). */
export function LoopTool({m,z,dia,cover,grade,det,within,readOnly,onCreate}:{m:Member;z:number;dia:number;cover:number;grade:string;det:Detailing;within?:string[];readOnly:boolean;onCreate:(b:Bar[])=>void}){
 const [o,setO]=useState({zTop:Math.round(m.z-cover-dia),spacing:200,lap:Math.round(40*dia),pattern:'1' as '1'|'2'|'3'});
 const split=o.pattern==='1'?undefined:(ring:P2[])=>loopPieces(ring,{pattern:o.pattern,length:'custom',value:o.lap,at:[]},det,dia).pieces.map(p=>p.pts as P2[]);
 return <div className="sketch-sub"><h4>ลูปรอบผิวข้าง (LOOPS)</h4><p className="muted">ปลอกแนวนอนรอบขอบนอกของแปลน{within?.length?'ของชิ้นที่เลือก':''}ที่ระดับ Z = {fmt(z)} เรียงขึ้นถึง Z บน</p>
  <div className="form-grid"><Field label="Z บนสุด (mm)" type="number" value={o.zTop} onChange={v=>setO({...o,zTop:Number(v)||0})}/><Field label="ระยะ @ (mm)" type="number" value={o.spacing} onChange={v=>setO({...o,spacing:Math.max(50,Number(v)||50)})}/><Field label="ระยะทาบ (mm)" type="number" value={o.lap} onChange={v=>setO({...o,lap:Math.max(0,Number(v)||0)})}/></div>
  <div className="segmented loop-laps" role="group" aria-label="จุดต่อทาบ">{(['1','2','3'] as const).map(p=><button key={p} type="button" className={o.pattern===p?'active':''} onClick={()=>setO({...o,pattern:p})}>ต่อ {p} จุด</button>)}</div>
  <p className="muted">{o.pattern==='1'?'ปลอกปิดรอบ ทาบ 1 จุด (Hoop)':`แบ่ง ${o.pattern==='2'?'2':'ทุกด้าน (3+)'} ท่อน ทาบกลางด้าน ห่างมุมดัด · ท่อนยาวเกินเหล็กสต็อกจะเพิ่มจุดทาบเอง`}</p>
  <button type="button" className="primary" disabled={readOnly} onClick={()=>onCreate(loopBars(m,{z,zTop:o.zTop,diameter:dia,grade,spacing:o.spacing,cover,lap:o.lap,mark:nextMark(m),note:'ลูปรอบผิว',split,within}))}>สร้างลูป</button></div>;
}
