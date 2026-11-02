import {useState} from 'react';
import {Trash2,Upload} from 'lucide-react';
import type {Spec} from '../domain/model';
import {groupLabel,orderGroups} from '../domain/specBuildings';
import {mergeByName,slabTemplateSummary,slabTemplatesSchema,wallTemplateSummary,wallTemplatesSchema,type SlabTemplate,type WallTemplate} from '../domain/slabWallTemplates';

/** Slab list / RC wall list marks of the spec (spec.slabTemplates / spec.wallTemplates): summary per mark by group,
 * delete, JSON import (a spec file with slabTemplates / wallTemplates). Slab and wall elements pick them in their panel. */
export function SlabWallTemplateList({spec,disabled,onChange}:{spec:Spec;disabled:boolean;onChange:(s:Spec)=>void}){
 const [msg,setMsg]=useState(''),[err,setErr]=useState('');
 const store=<K extends 'slabTemplates'|'wallTemplates'>(k:K,next:NonNullable<Spec[K]>)=>{const {[k]:_,...rest}=spec;onChange((next.length?{...rest,[k]:next}:rest) as Spec);};
 const importFile=async(file:File)=>{try{setErr('');const raw=JSON.parse(await file.text());
  const slabs=raw?.slabTemplates?slabTemplatesSchema.parse(raw.slabTemplates):[],walls=raw?.wallTemplates?wallTemplatesSchema.parse(raw.wallTemplates):[];
  if(!slabs.length&&!walls.length)throw new Error('ไม่พบ slabTemplates / wallTemplates');
  const {slabTemplates:_s,wallTemplates:_w,...rest}=spec,s=mergeByName(spec.slabTemplates,slabs),w=mergeByName(spec.wallTemplates,walls);
  onChange({...rest,...(s.length?{slabTemplates:s}:{}),...(w.length?{wallTemplates:w}:{})});
  setMsg(`นำเข้า ${file.name}: พื้น ${slabs.length} · ผนัง ${walls.length} แบบ (ชื่อซ้ำแทนของเดิม) · กด “บันทึก Spec” เพื่อให้โครงการเห็น`);}
  catch(e:any){setErr(`นำเข้าไม่ได้ · ${e?.issues?.[0]?`${e.issues[0].path.join('.')}: ${e.issues[0].message}`:e?.message||e}`);}};
 const block=<T extends SlabTemplate|WallTemplate>(title:string,list:T[],summary:(t:T)=>string,remove:(t:T)=>void)=>{
  const groups=orderGroups(spec.buildings,[...new Set(list.map(t=>t.group||''))]);
  return <div><h4>{title} <span className="muted">({list.length})</span></h4>{!list.length&&<p className="muted">ยังไม่มี</p>}
   {groups.map(g=><details key={g||'-'} open={groups.length===1}><summary><b>{groupLabel(spec.buildings,g)}</b> <span className="muted">({list.filter(t=>(t.group||'')===g).length})</span></summary>
    <div className="ft-list">{list.filter(t=>(t.group||'')===g).map(t=><div key={t.id} className="ft-row"><div><b>{t.name}</b><p>{summary(t)}</p>{t.note&&<p className="muted">{t.note}</p>}{t.source&&<small className="muted">{t.source}</small>}</div>
     {!disabled&&<button type="button" className="icon-button" title={`ลบ ${t.name}`} onClick={()=>{if(confirm(`ลบ ${t.name}? ชิ้นส่วนที่ใช้ไปแล้วไม่เปลี่ยน`))remove(t);}}><Trash2 size={14}/></button>}</div>)}</div></details>)}</div>;};
 return <section className="foundation-templates slab-wall-templates" aria-label="Slab / Wall Template"><h3>Slab / Wall Template · พื้นและผนังตามแบบของโครงการ</h3>
  <p>เบอร์พื้นจาก Slab List (หนา · เหล็ก 1 / 2 = ด้านสั้น บน / ล่าง · 3 / 4 = ด้านยาว บน / ล่าง) และเบอร์ผนังจาก RC Wall List · หน้าพื้น / ผนังเลือกเบอร์ในช่อง “Template (ตามแบบ)” · นำเข้าเป็นไฟล์ Spec JSON ที่มี slabTemplates / wallTemplates</p>
  <div className="actions">{!disabled&&<label className="button"><Upload size={14}/>นำเข้า JSON<input type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f);}}/></label>}</div>
  {msg&&<p className="notice success">{msg}</p>}{err&&<p className="notice danger">{err}</p>}
  {block('พื้น (Slab List)',spec.slabTemplates||[],slabTemplateSummary,t=>store('slabTemplates',(spec.slabTemplates||[]).filter(x=>x.id!==t.id)))}
  {block('ผนัง (RC Wall List)',spec.wallTemplates||[],wallTemplateSummary,t=>store('wallTemplates',(spec.wallTemplates||[]).filter(x=>x.id!==t.id)))}
 </section>;
}
