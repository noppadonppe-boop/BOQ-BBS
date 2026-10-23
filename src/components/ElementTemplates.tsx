import {useState} from 'react';
import {BookmarkPlus,Trash2} from 'lucide-react';
import {Modal} from './EditorControls';
import {labels,type Category,type Project} from '../domain/model';
import {templateSummary,type ElementTemplate,type TemplatePayload} from '../domain/elementTemplates';
import {deleteElementTemplate,saveElementTemplate,useElementTemplates} from '../data/elementTemplates';

const scopeLabels={workspace:'ทุกโครงการ',project:'เฉพาะโครงการนี้'} as const;

/** "Save as template" button + dialog: new template or overwrite one of the same category. `payload()` is read on save. */
export function SaveTemplateButton({project,category,defaultName,payload,disabled}:{project:Project;category:Category;defaultName:string;payload:()=>TemplatePayload;disabled?:boolean}){
 const [open,setOpen]=useState(false);
 return <><button type="button" disabled={disabled} onClick={()=>setOpen(true)} title="เก็บข้อมูลชุดนี้ไว้ใช้สร้างสมาชิกใหม่ (ในโครงการนี้หรือโครงการอื่น)"><BookmarkPlus size={15}/>บันทึกเป็น Template</button>
  {open&&<SaveTemplateDialog project={project} category={category} defaultName={defaultName} payload={payload} onClose={()=>setOpen(false)}/>}</>;
}
function SaveTemplateDialog({project,category,defaultName,payload,onClose}:{project:Project;category:Category;defaultName:string;payload:()=>TemplatePayload;onClose:()=>void}){
 const {templates,error}=useElementTemplates(project,category);
 const [name,setName]=useState(defaultName),[description,setDescription]=useState(''),[scope,setScope]=useState<'workspace'|'project'>('workspace'),[target,setTarget]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const over=templates.find(t=>t.id===target);
 const save=async()=>{setBusy(true);setMessage('');try{const t=await saveElementTemplate({...(over?{id:over.id,version:over.version}:{}),name,description,category,scope,project,payload:payload()});setMessage(`บันทึก Template “${t.name}” แล้ว (${scopeLabels[t.scope]})`);setTarget(t.id);}
  catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const remove=async(t:ElementTemplate)=>{if(!confirm(`ลบ Template “${t.name}”?`))return;setBusy(true);try{await deleteElementTemplate(t.id,t.version);if(target===t.id)setTarget('');}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 return <Modal title={`บันทึกเป็น Template · ${labels[category]}`} onClose={()=>{if(!busy)onClose();}}><div className="template-dialog">
  <p className="muted">เก็บขนาด รูปทรง ชั้นรองพื้น รายการเพิ่มเอง และการเสริมเหล็กของสมาชิกนี้ · สมาชิกที่สร้างจาก Template จะคำนวณเหล็กใหม่ตาม General Spec ของโครงการปลายทาง · ไม่เก็บจำนวน / ตำแหน่ง</p>
  {error&&<p className="notice warning">{error}</p>}
  <div className="form-grid"><label className="field"><span>บันทึกเป็น</span><select value={target} onChange={e=>{setTarget(e.target.value);const t=templates.find(x=>x.id===e.target.value);if(t){setName(t.name);setDescription(t.description);setScope(t.scope);}}}>
   <option value="">Template ใหม่</option>{templates.map(t=><option key={t.id} value={t.id}>ทับ “{t.name}”</option>)}</select></label>
   <label className="field"><span>ชื่อ Template</span><input maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="F1 ฐานเข็ม 4 ต้น 0.30"/></label>
   <label className="field full"><span>คำอธิบาย</span><input maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/></label>
   <div className="field"><span>ใช้ได้ใน</span><div className="segmented">{(['workspace','project'] as const).map(v=><button key={v} type="button" className={scope===v?'active':''} onClick={()=>setScope(v)}>{scopeLabels[v]}</button>)}</div></div></div>
  {message&&<p className="notice" role="status">{message}</p>}
  {templates.length>0&&<><h4>Template {labels[category]} ที่มีอยู่</h4><table className="subbase-table"><tbody>{templates.map(t=><tr key={t.id}><td><b>{t.name}</b><small className="block muted">{templateSummary(t)}</small></td><td><small>{scopeLabels[t.scope]}{t.projectCode?` · ${t.projectCode}`:''}</small></td><td><small>v{t.version} · {t.updatedAt.slice(0,10)}</small></td>
   <td><button type="button" className="icon-button" aria-label={`ลบ ${t.name}`} disabled={busy} onClick={()=>void remove(t)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></>}
  <footer><button type="button" onClick={onClose} disabled={busy}>ปิด</button><button type="button" className="primary" disabled={busy||!name.trim()} onClick={()=>void save()}>{busy?'กำลังบันทึก…':over?'บันทึกทับ':'บันทึก Template'}</button></footer>
 </div></Modal>;
}

/** Template choice in the "new member" dialog: none (blank) or one of this category's templates. */
export function TemplatePicker({project,category,value,onChange}:{project:Project;category:Category;value:ElementTemplate|null;onChange:(t:ElementTemplate|null)=>void}){
 const {templates,error}=useElementTemplates(project,category);
 if(error)return <p className="notice warning">{error}</p>;
 if(!templates.length)return <p className="muted">ยังไม่มี Template ของ{labels[category]} · บันทึกจากสมาชิกที่กรอกเสร็จด้วยปุ่ม “บันทึกเป็น Template”</p>;
 return <div className="template-picker"><h3>เริ่มจาก</h3>
  <label className={`check mode-card${!value?' active':''}`}><input type="radio" name="template" checked={!value} onChange={()=>onChange(null)}/><span><b>ว่าง</b><small className="block">ค่าเริ่มต้น</small></span></label>
  {templates.map(t=><label key={t.id} className={`check mode-card${value?.id===t.id?' active':''}`}><input type="radio" name="template" checked={value?.id===t.id} onChange={()=>onChange(t)}/><span><b>{t.name}</b><small className="block">{templateSummary(t)}</small><small className="block muted">{scopeLabels[t.scope]}{t.description?` · ${t.description}`:''}</small></span></label>)}
 </div>;
}
