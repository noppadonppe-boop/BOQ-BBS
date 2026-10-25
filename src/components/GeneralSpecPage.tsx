import {useEffect,useMemo,useState} from 'react';
import {Copy,Plus,RefreshCw,Trash2,Upload} from 'lucide-react';
import type {Project,Spec} from '../domain/model';
import {projectMaterialsSchema} from '../domain/projectMaterials';
import {codeInfo} from '../domain/designCodes';
import {applySpecImport,profileSpec,specImportSchema,specLabel,starterProfileSpec,type SpecProfile} from '../domain/specProfiles';
import {deleteSpecProfile,saveSpecProfile,syncProjectsToProfile,useSpecProfiles} from '../data/specProfiles';
import {Field} from './EditorControls';
import {SpecEditor} from './SpecEditor';

type Draft={id?:string;version?:number;name:string;description:string;spec:Spec;archived?:boolean};
type Props={projects:Project[];canManage:boolean;canChange:(p:Project)=>boolean;run:(f:()=>Promise<unknown>,m?:string)=>Promise<void>;onFailure:(m:string)=>void;initialId?:string};
const fromProfile=(p:SpecProfile):Draft=>({id:p.id,version:p.version,name:p.name,description:p.description,spec:p.spec,archived:p.archived});

/** Workspace-level General Spec: a library of spec profiles. Projects choose a profile in the
 * project form; saving a profile re-applies it to every linked project (live link). */
export function GeneralSpecPage({projects,canManage,canChange,run,onFailure,initialId}:Props){
 const {profiles,loading}=useSpecProfiles(onFailure);
 const [selected,setSelected]=useState(initialId||''),[draft,setDraft]=useState<Draft|null>(null),[dirty,setDirty]=useState(false),[progress,setProgress]=useState(''),[source,setSource]=useState('');
 const current=profiles.find(p=>p.id===selected);
 useEffect(()=>{if(!selected&&profiles.length&&!draft)setSelected(profiles[0].id);},[profiles,selected,draft]);
 useEffect(()=>{if(current&&!dirty)setDraft(fromProfile(current));},[current,dirty]);
 const linked=useMemo(()=>(id?:string)=>projects.filter(p=>id&&p.spec.profileRef?.id===id),[projects]);
 const edit=(next:Partial<Draft>)=>{setDirty(true);setDraft(d=>d&&{...d,...next});};
 const startNew=(spec:Spec,name:string)=>{setSelected('');setDirty(true);setDraft({name,description:'',spec:profileSpec(spec)});};
 const readOnly=!canManage;
 const invalid=!draft||!draft.name.trim()||!!draft.spec.projectMaterials&&(!draft.spec.minimumStandard||!projectMaterialsSchema.safeParse(draft.spec.projectMaterials).success);
 // spec: save with this spec instead of the current draft (direct saves from a table, e.g. steel grades)
 const save=(spec?:Spec)=>draft&&run(async()=>{
  const saved=await saveSpecProfile(spec?{...draft,spec}:draft);setDirty(false);setSelected(saved.id);setDraft(fromProfile(saved));
  const r=await syncProjectsToProfile(saved,projects,canChange,setProgress);
  const parts=[r.done.length?`อัปเดตโครงการ ${r.done.join(', ')}`:'',r.skipped.length?`ข้ามโครงการ (ไม่มีสิทธิ์ / มีงานค้าง) ${r.skipped.join(', ')} · ผู้ดูแลโครงการนั้นกดอัปเดตได้ภายหลัง`:'',r.failed.length?`ไม่สำเร็จ ${r.failed.join(' · ')}`:''].filter(Boolean);
  setProgress(parts.join(' · '));
  if(r.failed.length)throw Error(`บันทึก Spec แล้ว · ${parts.join(' · ')}`);
 },'บันทึก Spec แล้ว และปรับโครงการที่ผูกไว้ตาม Spec');
 const remove=()=>{
  if(!draft?.id)return;const n=linked(draft.id).length;
  if(n)return onFailure(`ลบไม่ได้ · มี ${n} โครงการใช้ Spec นี้อยู่ · เปลี่ยน Spec ของโครงการก่อน หรือใช้ “เก็บถาวร” แทน`);
  if(!confirm(`ลบ Spec “${draft.name}” ถาวร? การลบไม่สามารถย้อนกลับได้`))return;
  const {id,version=1}=draft;
  void run(async()=>{await deleteSpecProfile(id,version);setDirty(false);setDraft(null);setSelected(profiles.find(p=>p.id!==id)?.id||'');},'ลบ Spec แล้ว');
 };
 const importFile=async(file:File)=>{
  if(!draft)return;
  try{
   const input=specImportSchema.parse(JSON.parse(await file.text())),r=applySpecImport(draft.spec,input);
   edit({spec:r.spec,...(input.description!==undefined?{description:input.description}:{})});
   setProgress(`นำเข้า ${file.name}${input.source?` (${input.source})`:''}: ${r.notes.join(' · ')} · ตรวจค่าแล้วกด “บันทึก Spec”`);
  }catch(e:any){onFailure(`นำเข้าไฟล์ไม่ได้ · ${e?.issues?.[0]?`${e.issues[0].path.join('.')}: ${e.issues[0].message}`:e?.message||e}`);}
 };
 const syncOne=(p:Project)=>current&&run(async()=>{const r=await syncProjectsToProfile(current,[p],canChange,setProgress,true);setProgress('');if(r.failed.length)throw Error(r.failed.join(' · '));},`อัปเดต ${p.code} ตาม Spec ล่าสุดแล้ว`);

 return <>
  <div className="heading"><div><div className="eyebrow">WORKSPACE STANDARDS</div><h1>General Spec (ส่วนกลาง)</h1><p>คลัง Spec หลายชุด · แต่ละโครงการเลือก Spec ในหน้าสร้าง/แก้ไขโครงการ · แก้ Spec แล้วโครงการที่ผูกไว้ปรับตามทันที (สมาชิกเป็น Draft และสร้าง Bar list อัตโนมัติใหม่)</p></div>
   {canManage&&<div className="actions"><button className="primary" onClick={()=>startNew(starterProfileSpec(),'Spec ใหม่')}><Plus size={16}/>สร้าง Spec ใหม่</button>
    <label className="field spec-from"><span>สร้างจาก Spec ของโครงการ</span><select value={source} onChange={e=>{const p=projects.find(x=>x.id===e.target.value);setSource('');if(p)startNew(p.spec,`Spec จาก ${p.code}`);}}><option value="">— เลือกโครงการ —</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label></div>}</div>
  {!canManage&&<p className="notice">ดูได้อย่างเดียว · ผู้ดูแลระบบหรือผู้ดูแลโครงการเท่านั้นที่แก้ไข General Spec ได้</p>}
  <div className="spec-profiles-layout">
   <aside className="spec-profile-list" aria-label="รายการ Spec">{loading?<p role="status">กำลังโหลด…</p>:!profiles.length&&!draft?<p className="muted">ยังไม่มี Spec · กด “สร้าง Spec ใหม่”</p>:null}
    {profiles.map(p=>{const n=linked(p.id).length,out=linked(p.id).filter(x=>x.spec.profileRef!.version<p.version).length;return <button key={p.id} className={`spec-profile-card ${p.id===selected?'active':''} ${p.archived?'archived':''}`} onClick={()=>{if(dirty&&!confirm('ทิ้งการแก้ไขที่ยังไม่บันทึก?'))return;setDirty(false);setSelected(p.id);}}>
     <b>{p.name}</b><small>{p.spec.designCode?codeInfo(p.spec,p.spec.designCode).label:'ยังไม่เลือกหมวด'} · v{p.version}{p.archived?' · เก็บถาวร':''}</small>
     <span className="spec-profile-meta">{n} โครงการ{out?<em> · รออัปเดต {out}</em>:''}</span></button>;})}
    {draft&&!draft.id&&<div className="spec-profile-card active"><b>{draft.name||'Spec ใหม่'}</b><small>ยังไม่บันทึก</small></div>}
   </aside>
   {draft&&<div className="spec-profile-editor">
    <section className="panel padded"><div className="form-grid">
     <Field label="ชื่อ Spec" value={draft.name} disabled={readOnly} onChange={v=>edit({name:String(v).slice(0,120)})}/>
     <label className="field full"><span>คำอธิบาย</span><textarea rows={2} maxLength={1000} disabled={readOnly} value={draft.description} onChange={e=>edit({description:e.target.value})}/></label></div>
     {draft.id&&<div className="actions spec-profile-actions"><button disabled={readOnly} onClick={()=>startNew(draft.spec,`${draft.name} (สำเนา)`)}><Copy size={14}/>ทำสำเนา</button>
      <label className={`button ${readOnly?'disabled':''}`} title="นำเข้าค่าจากไฟล์ Spec (.json) แล้วกดบันทึก"><Upload size={14}/>นำเข้าจากไฟล์<input type="file" accept=".json,application/json" hidden disabled={readOnly} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f);}}/></label>
      <label className="check"><input type="checkbox" disabled={readOnly} checked={!!draft.archived} onChange={e=>edit({archived:e.target.checked})}/>เก็บถาวร (ไม่แสดงให้เลือกในโครงการใหม่)</label>
      <button className="danger-text" disabled={readOnly||dirty} title={dirty?'บันทึกหรือยกเลิกการแก้ไขก่อนลบ':linked(draft.id).length?'มีโครงการใช้ Spec นี้อยู่':'ลบ Spec นี้'} onClick={remove}><Trash2 size={14}/>ลบ Spec</button></div>}
    </section>
    <SpecEditor spec={draft.spec} readOnly={readOnly} onChange={spec=>edit({spec})} onSave={draft.name.trim()?spec=>void save(spec):undefined}/>
    {draft.id&&<section className="panel padded"><h3>โครงการที่ใช้ Spec นี้</h3>{linked(draft.id).length?<div className="table-scroll"><table><thead><tr><th>Project No.</th><th>ชื่อ</th><th>f'c / เกรด</th><th>รุ่น Spec ที่ใช้</th><th/></tr></thead><tbody>{linked(draft.id).map(p=>{const ref=p.spec.profileRef!,old=!!current&&ref.version<current.version;return <tr key={p.id}><td>{p.code}</td><td>{p.name}</td><td>{p.spec.projectDesign?`${p.spec.projectDesign.fc} MPa · ${p.spec.projectDesign.grade}`:'—'}</td><td>v{ref.version}{old?<b className="code-own"> · รออัปเดต</b>:' · ล่าสุด'}</td><td><button disabled={!canChange(p)||dirty} title={old?'ปรับโครงการเป็น Spec รุ่นล่าสุด':'ใช้ Spec รุ่นนี้กับโครงการอีกครั้ง · คำนวณ detailing และเหล็กอัตโนมัติใหม่ (สมาชิกเป็น Draft)'} onClick={()=>{if(old||confirm(`ใช้ Spec v${current?.version} กับ ${p.code} อีกครั้ง? สมาชิกจะเป็น Draft และสร้างเหล็กอัตโนมัติใหม่`))void syncOne(p);}}><RefreshCw size={14}/>{old?'อัปเดตตาม Spec':'ใช้ Spec อีกครั้ง'}</button></td></tr>;})}</tbody></table></div>:<p className="muted">ยังไม่มีโครงการเลือกใช้ · เลือกได้ในหน้าสร้าง/แก้ไขโครงการ</p>}</section>}
    <footer className="actions spec-profile-save">{progress&&<span role="status">{progress}</span>}<button className="primary" disabled={readOnly||invalid||!dirty} onClick={()=>void save()}>บันทึก Spec{draft.id&&linked(draft.id).length?` และปรับ ${linked(draft.id).length} โครงการ`:''}</button>{dirty&&<button onClick={()=>{setDirty(false);if(!draft.id){setDraft(null);setSelected(profiles[0]?.id||'');}}}>ยกเลิกการแก้ไข</button>}</footer>
    <p className="muted">ใช้กับโครงการ: {draft.id?specLabel({...draft.spec,profileRef:{id:draft.id,version:draft.version||1,name:draft.name}}):draft.name} · การปรับโครงการใช้ขั้นตอนเปลี่ยนสเป็คเดิม (สมาชิกเป็น Draft · ตรวจตำแหน่งเหล็กใหม่ · Revision ที่ตรึงไว้คงเดิม)</p>
   </div>}
  </div>
 </>;
}
