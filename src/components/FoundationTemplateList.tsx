import {useState} from 'react';
import {Download,Trash2,Upload} from 'lucide-react';
import type {Spec} from '../domain/model';
import {foundationTemplateSummary,foundationTemplatesSchema,type FoundationTemplate} from '../domain/foundationTemplates';
import {FoundationTemplatePlan} from './FoundationTemplatePicker';

/** Foundation types of the spec (spec.foundationTemplates): plan sketch + summary per type, delete, JSON import / export.
 * Footing elements pick them with “Foundation Template (ตามแบบ)”. */
export function FoundationTemplateList({spec,disabled,onChange}:{spec:Spec;disabled:boolean;onChange:(s:Spec)=>void}){
 const list=spec.foundationTemplates||[],[msg,setMsg]=useState(''),[err,setErr]=useState('');
 const store=(next:FoundationTemplate[])=>{const {foundationTemplates:_,...rest}=spec;onChange(next.length?{...rest,foundationTemplates:next}:rest);};
 const importFile=async(file:File)=>{try{setErr('');const raw=JSON.parse(await file.text()),arr=Array.isArray(raw)?raw:raw?.foundationTemplates;
  const parsed=foundationTemplatesSchema.parse(arr),names=new Set(parsed.map(t=>t.name.toUpperCase()));
  store([...list.filter(t=>!names.has(t.name.toUpperCase())),...parsed]);setMsg(`นำเข้า ${file.name}: ${parsed.length} แบบ (ชื่อซ้ำแทนของเดิม) · กด “บันทึก Spec” เพื่อให้โครงการเห็น`);}
  catch(e:any){setErr(`นำเข้าไม่ได้ · ${e?.issues?.[0]?`${e.issues[0].path.join('.')}: ${e.issues[0].message}`:e?.message||e}`);}};
 const exportFile=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(list,null,1)],{type:'application/json'}));a.download='foundation-templates.json';a.click();URL.revokeObjectURL(a.href);};
 const groups=[...new Set(list.map(t=>t.group||''))];
 return <section className="foundation-templates" aria-label="Foundation Template"><h3>Foundation Template · ฐานรากตามแบบของโครงการ</h3>
  <p>ประเภทฐานรากจากแบบฐานราก (ขนาด ความสูง เสาเข็ม เหล็กล่าง/บน LOOPS เหล็กข้าง เหล็กปลอก ระดับ ตำแหน่งเสา) · หน้าฐานรากกด “Foundation Template (ตามแบบ)” เพื่อเลือก · นำเข้าเป็นไฟล์ JSON (รายการ หรือไฟล์ Spec ที่มี foundationTemplates)</p>
  <div className="actions">{!disabled&&<label className="button"><Upload size={14}/>นำเข้า JSON<input type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f);}}/></label>}
   <button type="button" disabled={!list.length} onClick={exportFile}><Download size={14}/>ส่งออก JSON</button><span className="muted">{list.length} แบบ</span></div>
  {msg&&<p className="notice success">{msg}</p>}{err&&<p className="notice danger">{err}</p>}
  {groups.map(g=><div key={g||'-'}><h4>{g||'ไม่ระบุกลุ่ม'}</h4><div className="ft-list">{list.filter(t=>(t.group||'')===g).map(t=><div key={t.id} className="ft-row">
   <FoundationTemplatePlan t={t} size={90}/><div><b>{t.name}</b><p>{foundationTemplateSummary(t)}</p>{t.note&&<p className="muted">{t.note}</p>}{t.source&&<small className="muted">{t.source}</small>}</div>
   {!disabled&&<button type="button" className="icon-button" title={`ลบ ${t.name}`} onClick={()=>{if(confirm(`ลบ Foundation Template ${t.name}? ฐานที่ใช้ไปแล้วไม่เปลี่ยน`))store(list.filter(x=>x.id!==t.id));}}><Trash2 size={14}/></button>}</div>)}</div></div>)}
 </section>;
}
