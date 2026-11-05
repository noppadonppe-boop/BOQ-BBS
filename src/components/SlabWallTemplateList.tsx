import {useState,type ReactNode} from 'react';
import {Trash2,Upload} from 'lucide-react';
import type {Spec} from '../domain/model';
import {groupLabel,orderGroups} from '../domain/specBuildings';
import type {TopExtra} from '../domain/slabFloorSchema';
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
 const block=<T extends SlabTemplate|WallTemplate>(title:string,list:T[],summary:(t:T)=>string,remove:(t:T)=>void,extra?:(t:T)=>ReactNode)=>{
  const groups=orderGroups(spec.buildings,[...new Set(list.map(t=>t.group||''))]);
  return <div><h4>{title} <span className="muted">({list.length})</span></h4>{!list.length&&<p className="muted">ยังไม่มี</p>}
   {groups.map(g=><details key={g||'-'} open={groups.length===1}><summary><b>{groupLabel(spec.buildings,g)}</b> <span className="muted">({list.filter(t=>(t.group||'')===g).length})</span></summary>
    <div className="ft-list">{list.filter(t=>(t.group||'')===g).map(t=><div key={t.id} className="ft-row"><div><b>{t.name}</b><p>{summary(t)}</p>{t.note&&<p className="muted">{t.note}</p>}{t.source&&<small className="muted">{t.source}</small>}{extra?.(t)}</div>
     {!disabled&&<button type="button" className="icon-button" title={`ลบ ${t.name}`} onClick={()=>{if(confirm(`ลบ ${t.name}? ชิ้นส่วนที่ใช้ไปแล้วไม่เปลี่ยน`))remove(t);}}><Trash2 size={14}/></button>}</div>)}</div></details>)}</div>;};
 return <section className="foundation-templates slab-wall-templates" aria-label="Slab / Wall Template"><h3>Slab / Wall Template · พื้นและผนังตามแบบของโครงการ</h3>
  <p>เบอร์พื้นจาก Slab List (หนา · เหล็ก 1 / 2 = ด้านสั้น บน / ล่าง · 3 / 4 = ด้านยาว บน / ล่าง · บนเสริมที่คาน Ø@ ยาวคงที่ หรือ L/3 · L/4 ใช้กับพื้นทั้งชั้น) และเบอร์ผนังจาก RC Wall List · หน้าพื้น / ผนังเลือกเบอร์ในช่อง “Template (ตามแบบ)” · นำเข้าเป็นไฟล์ Spec JSON ที่มี slabTemplates / wallTemplates</p>
  <div className="actions">{!disabled&&<label className="button"><Upload size={14}/>นำเข้า JSON<input type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f);}}/></label>}</div>
  {msg&&<p className="notice success">{msg}</p>}{err&&<p className="notice danger">{err}</p>}
  {block('พื้น (Slab List)',spec.slabTemplates||[],slabTemplateSummary,t=>store('slabTemplates',(spec.slabTemplates||[]).filter(x=>x.id!==t.id)),t=><TopExtraCell value={t.rebar.topExtra} disabled={disabled} onChange={e=>store('slabTemplates',(spec.slabTemplates||[]).map(x=>{if(x.id!==t.id)return x;const {topExtra:_e,...r}=x.rebar;return {...x,rebar:e?{...r,topExtra:e}:r};}))}/>)}
  {block('ผนัง (RC Wall List)',spec.wallTemplates||[],wallTemplateSummary,t=>store('wallTemplates',(spec.wallTemplates||[]).filter(x=>x.id!==t.id)))}
 </section>;
}
/** Extra top bars over the beams (บนเสริม) of a slab mark: Ø@S + length fixed (from the beam face / centre) or L/3 · L/4. */
function TopExtraCell({value,disabled,onChange}:{value?:TopExtra;disabled:boolean;onChange:(v:TopExtra|undefined)=>void}){
 const v=value||{diameter:12,spacing:0,length:{mode:'fixed' as const,value:1000,from:'face' as const}},on=!!value&&value.spacing>0;
 const set=(p:Partial<TopExtra>)=>{const n={...v,...p};onChange(n.spacing>0?n:undefined);};
 return <div className="topextra-cell"><span className="muted">บนเสริม</span>
  <select aria-label="บนเสริม Ø" disabled={disabled} value={v.diameter} onChange={e=>set({diameter:Number(e.target.value)})}>{[9,10,12,16,20,25].map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select>
  <input aria-label="บนเสริม @" type="number" min={0} disabled={disabled} value={v.spacing} onChange={e=>set({spacing:Math.max(0,Number(e.target.value)||0)})} title="0 = ไม่มี"/>
  <select aria-label="ความยาวบนเสริม" disabled={disabled||!on} value={v.length.mode==='ratio'?`r${v.length.n}`:`f-${v.length.from}`} onChange={e=>{const k=e.target.value;set({length:k==='r3'?{mode:'ratio',n:3}:k==='r4'?{mode:'ratio',n:4}:{mode:'fixed',value:v.length.mode==='fixed'?v.length.value:1000,from:k==='f-centre'?'centre':'face'}});}}>
   <option value="f-face">ยาวจากหน้าคาน</option><option value="f-centre">ยาวจากศูนย์กลางคาน</option><option value="r4">L/4</option><option value="r3">L/3</option></select>
  {v.length.mode==='fixed'&&<input aria-label="ระยะบนเสริม" type="number" min={0} disabled={disabled||!on} value={v.length.value} onChange={e=>set({length:{...(v.length as {mode:'fixed';value:number;from:'face'|'centre'}),value:Math.max(0,Number(e.target.value)||0)}})}/>}
 </div>;
}
