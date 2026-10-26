import {useState} from 'react';
import {Download,Plus,Trash2,Upload} from 'lucide-react';
import type {Spec} from '../domain/model';
import {finishKindLabels,finishKinds,finishesSchema,type Finish,type FinishKind} from '../domain/archInputSchema';
import {finishesFromRows,sampleFinishes} from '../domain/archSchedules';
import {NumInput} from './EditorControls';

const newId=()=>crypto.randomUUID().replace(/-/g,'').slice(0,12);
const prefix:Record<FinishKind,string>={floor:'F',skirting:'S',wall:'W',ceiling:'C',masonry:'WT',roof:'R'};

/** Finish library of the spec (spec.finishes): code per face kind with its BOQ items per m² (skirting per m). Rooms of
 * the Architecture discipline pick these codes; the items become the room's BOQ lines. Excel import / export. */
export function FinishLibrary({spec,disabled,onChange}:{spec:Spec;disabled:boolean;onChange:(s:Spec)=>void}){
 const list=spec.finishes||[],[msg,setMsg]=useState(''),[err,setErr]=useState(''),check=finishesSchema.safeParse(list);
 const store=(next:Finish[])=>{const {finishes:_,...rest}=spec;onChange(next.length?{...rest,finishes:next}:rest);};
 const put=(id:string,patch:Partial<Finish>)=>store(list.map(f=>f.id===id?{...f,...patch}:f));
 const add=(kind:FinishKind)=>{const used=new Set(list.filter(f=>f.kind===kind).map(f=>f.code.toUpperCase()));let n=1;while(used.has(`${prefix[kind]}${n}`))n++;store([...list,{id:newId(),kind,code:`${prefix[kind]}${n}`,name:`${finishKindLabels[kind]}ใหม่`,items:[]}]);};
 const importFile=async(file:File)=>{try{setErr('');const {readFinishes}=await import('../data/archExcel'),r=finishesFromRows(await readFinishes(file));
  if(!r.finishes.length)throw Error(r.problems.slice(0,3).join(' · ')||'ไม่มีรายการ');
  const keys=new Set(r.finishes.map(f=>`${f.kind}|${f.code.toUpperCase()}`));store([...list.filter(f=>!keys.has(`${f.kind}|${f.code.toUpperCase()}`)),...r.finishes]);
  setMsg(`นำเข้า ${file.name}: ${r.finishes.length} รายการ (รหัสซ้ำแทนของเดิม) · กด “บันทึก Spec” เพื่อให้โครงการเห็น${r.problems.length?` · ข้าม ${r.problems.length} แถว: ${r.problems.slice(0,3).join(' · ')}`:''}`);}
  catch(e:any){setErr(`นำเข้าไม่ได้ · ${e?.message||e}`);}};
 return <section className="foundation-templates finish-library" aria-label="คลังวัสดุผิว"><h3>คลังวัสดุผิว (Finish) · งานสถาปัตย์</h3>
  <p>รหัสวัสดุผิวตาม Finish Schedule ของแบบ (พื้น F · บัว S · ผนัง W · ฝ้า C · ผนังก่อ WT · หลังคา R) · แต่ละรหัสมีรายการ BOQ ต่อ m² ของผิว (บัวต่อ m) · ห้องในหมวด Architecture เลือกรหัสเหล่านี้ แล้วรายการกลายเป็นปริมาณ BOQ ของห้อง</p>
  <div className="actions">{!disabled&&<label className="button"><Upload size={14}/>นำเข้า Excel<input type="file" accept=".xlsx" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f);}}/></label>}
   <button type="button" onClick={()=>void import('../data/archExcel').then(x=>x.exportFinishes(list.length?list:sampleFinishes(),list.length?'spec':'template'))}><Download size={14}/>{list.length?'ส่งออก Excel':'แบบฟอร์ม Excel (ตัวอย่าง)'}</button>
   {!disabled&&!list.length&&<button type="button" onClick={()=>store(sampleFinishes())}><Plus size={14}/>เริ่มจากชุดตัวอย่าง</button>}
   <span className="muted">{list.length} รายการ</span></div>
  {msg&&<p className="notice success">{msg}</p>}{err&&<p className="notice danger">{err}</p>}
  {!check.success&&<p role="alert" className="notice danger">{check.error.issues[0]?.message}</p>}
  <fieldset disabled={disabled} className="profile-fields">{finishKinds.map(kind=>{const rows=list.filter(f=>f.kind===kind);return <div key={kind} className="finish-kind">
   <div className="finish-kind-head"><b>{finishKindLabels[kind]}</b><small className="muted">ต่อ {kind==='skirting'?'m':'m²'}</small><button type="button" onClick={()=>add(kind)}><Plus size={14}/>เพิ่ม{finishKindLabels[kind]}</button></div>
   {rows.map(f=><details key={f.id} className="finish-row"><summary><b>{f.code}</b> {f.name} <small className="muted">· {f.items.length?f.items.map(i=>i.label).join(' + '):'ไม่มีรายการย่อย (ใช้ชื่อวัสดุผิวเป็นรายการ BOQ)'}</small></summary>
    <div className="form-grid"><label className="field"><span>รหัส</span><input maxLength={20} value={f.code} onChange={e=>put(f.id,{code:e.target.value.toUpperCase().replace(/\s+/g,'')})}/></label><label className="field"><span>ชื่อวัสดุผิว</span><input maxLength={120} value={f.name} onChange={e=>put(f.id,{name:e.target.value})}/></label></div>
    <table className="finish-items"><thead><tr><th>รายการ BOQ</th><th>หน่วย</th><th className="num">ตัวคูณ</th><th/></tr></thead><tbody>{f.items.map(it=><tr key={it.id}>
     <td><input aria-label="รายการ BOQ" maxLength={120} value={it.label} onChange={e=>put(f.id,{items:f.items.map(x=>x.id===it.id?{...x,label:e.target.value}:x)})}/></td>
     <td><input aria-label="หน่วย" maxLength={12} style={{width:60}} value={it.unit} onChange={e=>put(f.id,{items:f.items.map(x=>x.id===it.id?{...x,unit:e.target.value}:x)})}/></td>
     <td><NumInput aria-label="ตัวคูณ" type="number" min={0} step="any" style={{width:70}} value={it.factor} onChange={e=>put(f.id,{items:f.items.map(x=>x.id===it.id?{...x,factor:Math.max(0,Number(e.target.value)||0)}:x)})}/></td>
     <td><button type="button" className="icon-button" aria-label="ลบรายการ" onClick={()=>put(f.id,{items:f.items.filter(x=>x.id!==it.id)})}><Trash2 size={14}/></button></td></tr>)}</tbody></table>
    <div className="actions"><button type="button" disabled={f.items.length>=6} onClick={()=>put(f.id,{items:[...f.items,{id:newId(),label:f.name,unit:kind==='skirting'?'m':'m²',factor:1}]})}><Plus size={14}/>รายการ BOQ</button>
     <button type="button" className="danger-text" onClick={()=>{if(confirm(`ลบ ${f.code}? ห้องที่ใช้รหัสนี้จะแจ้งว่าไม่พบ เมื่อสร้างปริมาณใหม่`))store(list.filter(x=>x.id!==f.id));}}><Trash2 size={14}/>ลบ {f.code}</button></div></details>)}
  </div>;})}</fieldset>
 </section>;
}
