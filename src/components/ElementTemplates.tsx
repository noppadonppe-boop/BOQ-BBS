import {useMemo,useState,type ReactNode} from 'react';
import {BookmarkPlus,Search,Star,Trash2} from 'lucide-react';
import {Modal} from './EditorControls';
import {ElementGraphic} from './ElementGraphic';
import {useAuth} from '../auth/AuthContext';
import {isMasterAdmin} from '../domain/auth';
import {assignedRoles} from '../domain/authAccess';
import {labels,type Category,type Member,type Project,type Spec} from '../domain/model';
import {elementInputSchema,type ElementInput} from '../domain/elementInput';
import {takeoff} from '../domain/engine';
import {categoryDefaults,defaultInclude,memberFromTemplate,matchesSearch,newerVersion,proposalStatusLabels,sameName,specDifferences,templateFacts,templateKey,templateKeyLabel,templateSummary,
 type ElementTemplate,type ListedTemplate,type TemplateInclude,type TemplateLevel,type TemplatePayload,type TemplateProposal} from '../domain/elementTemplates';
import {decideProposal,deleteTemplate,migrateLegacyTemplates,proposeTemplate,saveTemplate,setTemplateDefault,useProposals,useTemplateLibrary} from '../data/elementTemplates';
import {HelpButton} from './HelpCenter';

const levelLabels={project:'เฉพาะโครงการนี้',central:'Template กลาง'} as const;
const includeLabels:Record<keyof TemplateInclude,string>={generated:'เหล็กจากค่าที่กรอก',manual:'เหล็กวาดเอง',siteItems:'รายการ BOQ',sheetLayout:'จัดหน้าแบบ',drawingEdits:'แก้ไขแบบ'};
const kg=(v:number)=>v.toLocaleString('th-TH',{maximumFractionDigits:1});
const m3=(v:number)=>v.toLocaleString('th-TH',{maximumFractionDigits:2});
const msg=(e:unknown)=>e instanceof Error?e.message:String(e);
/** caller's rights for templates in a project */
function useTemplateRights(project:Pick<Project,'id'>){
 const {userProfile}=useAuth(),master=isMasterAdmin(userProfile),roles=userProfile?assignedRoles(userProfile,project.id):[];
 return {master,canWrite:master||roles.some(r=>r==='admin'||r==='qs'),uid:userProfile?.uid};
}

/** Preview of a template with the given project's spec: drawing (standard elements) + size, Marks, steel and concrete per set. */
function TemplatePreview({t,project}:{t:ElementTemplate;project:Project}){
 const facts=useMemo(()=>templateFacts(t,project),[t,project]);
 const graphic=useMemo(()=>{try{const i=elementInputSchema.safeParse(t.payload.elementInput);if(!i.success)return null;const m=memberFromTemplate(t,'PREVIEW',project),q=takeoff(m,project.spec);
  return <ElementGraphic member={m} rows={q.rows} input={m.elementInput as ElementInput??i.data}/>;}catch{return null;}},[t,project]);
 return <div className="tpl-preview">{graphic&&<div className="tpl-graphic">{graphic}</div>}
  <div className="tpl-facts"><b>{facts.summary||labels[t.category]}</b><span>เหล็ก {facts.marks} Mark · {kg(facts.steel)} kg / ชุด</span><span>คอนกรีต {m3(facts.concrete)} m³ / ชุด</span>
   {facts.error&&<small className="danger-text">{facts.error}</small>}</div></div>;
}

/** "Save as template" button + dialog (artboard 11). `payload(include, spec)` is read on save / preview. */
export function SaveTemplateButton({project,member,defaultName,payload,disabled}:{project:Project;member:Member;defaultName:string;payload:(o:{include:TemplateInclude;spec:Spec})=>TemplatePayload;disabled?:boolean}){
 const [open,setOpen]=useState(false);
 return <><button type="button" disabled={disabled} onClick={()=>setOpen(true)} title="เก็บข้อมูลชุดนี้ไว้ใช้สร้างสมาชิกใหม่ (ในโครงการนี้ หรือเสนอเข้า Template กลาง)"><BookmarkPlus size={15}/>บันทึกเป็น Template</button>
  {open&&<SaveTemplateDialog project={project} member={member} defaultName={defaultName} payload={payload} onClose={()=>setOpen(false)}/>}</>;
}
function SaveTemplateDialog({project,member,defaultName,payload,onClose}:{project:Project;member:Member;defaultName:string;payload:(o:{include:TemplateInclude;spec:Spec})=>TemplatePayload;onClose:()=>void}){
 const category=member.category,lib=useTemplateLibrary(project,category),{master,canWrite,uid}=useTemplateRights(project),{proposals}=useProposals(uid);
 const [name,setName]=useState(defaultName),[description,setDescription]=useState(''),[level,setLevel]=useState<TemplateLevel>('project'),[asDefault,setAsDefault]=useState(false);
 const [include,setInclude]=useState<TemplateInclude>({...defaultInclude}),[target,setTarget]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState('');
 const draft=useMemo(()=>{try{return payload({include,spec:project.spec});}catch{return undefined;}},[payload,include,project.spec]);
 const key=useMemo(()=>templateKey(category,draft?.elementInput),[category,draft]);
 const manualCount=member.bars.filter(b=>!b.id.startsWith('gen-')).length;
 const list=level==='project'?lib.project:lib.central,same=sameName(list,name,category),proposeOnly=level==='central'&&!master;
 const previewTpl=useMemo(()=>draft?{id:'preview',name,description,category,scope:'project' as const,payload:draft,version:1,createdAt:'',updatedAt:'',createdBy:'',updatedBy:''}:undefined,[draft,name,description,category]);
 const mine=proposals.filter(p=>p.category===category).slice(0,6);
 const save=async()=>{if(!draft)return;setBusy(true);setMessage('');setFailed('');
  try{const p=payload({include,spec:project.spec});
   if(proposeOnly){await proposeTemplate({project,name,description,category,payload:p,...(target?{targetCentralId:target}:{})});setMessage(`ส่งคำขอ “${name.trim()}” เข้า Template กลางแล้ว · รอ MasterAdmin พิจารณา`);}
   else{const t=await saveTemplate({level,project,...(same?{id:same.id,version:same.version}:{}),name,description,category,payload:p,key,setDefault:level==='project'&&asDefault});
    setMessage(`บันทึก “${t.name}” v${t.version} แล้ว (${levelLabels[level]}${level==='project'&&asDefault?' · ค่ามาตรฐานของโครงการ':''})`);}}
  catch(e){setFailed(msg(e));}finally{setBusy(false);}};
 const remove=async(t:ListedTemplate)=>{if(!confirm(`ลบ Template “${t.name}”? · เวอร์ชันก่อนหน้าที่เก็บไว้ไม่ถูกลบ`))return;setBusy(true);try{await deleteTemplate(t,project.id);}catch(e){setFailed(msg(e));}finally{setBusy(false);}};
 const check=(k:keyof TemplateInclude,label:string,off?:boolean)=><label className="check"><input type="checkbox" disabled={off} checked={include[k]&&!off} onChange={e=>setInclude({...include,[k]:e.target.checked})}/>{label}</label>;
 return <Modal title={`บันทึก ${member.code} เป็น Template`} onClose={()=>{if(!busy)onClose();}}><div className="tpl-dialog tpl-save">
  <div className="tpl-main">
   {lib.error&&<p className="notice warning">{lib.error}</p>}
   <div className="form-grid"><label className="field"><span>ชื่อ Template</span><input maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="ฐานรากเสาเข็ม 4 ต้น · 2 Stage"/></label>
    <label className="field"><span>หมวด</span><input value={templateKeyLabel(key)} disabled/></label>
    <label className="field full"><span>คำอธิบาย / ป้ายค้นหา</span><input maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="F-02 J-078 · เข็มเจาะ 600 · ตอม่อ 1 ต้น"/></label></div>
   <h4>ใช้กับที่ไหน <HelpButton topic="element-templates"/></h4>
   <label className={`tpl-scope${level==='project'?' active':''}`}><input type="radio" name="tpl-level" checked={level==='project'} disabled={!canWrite} onChange={()=>setLevel('project')}/><span><b>เฉพาะโครงการนี้ ({project.code})</b><small>เห็นเฉพาะคนในโครงการ · Admin / QS ของโครงการบันทึกได้</small>
    {level==='project'&&<label className="check tpl-default"><input type="checkbox" checked={asDefault} onChange={e=>setAsDefault(e.target.checked)}/><span><b>ตั้งเป็นค่ามาตรฐานของโครงการ</b> · ใช้เป็นค่าเริ่มต้นเมื่อ “เพิ่ม{templateKeyLabel(key)}” ในโครงการนี้</span></label>}</span></label>
   <label className={`tpl-scope${level==='central'?' active':''}`}><input type="radio" name="tpl-level" checked={level==='central'} disabled={!canWrite} onChange={()=>setLevel('central')}/><span><b>Template กลาง (ทุกโครงการ)</b><small>คลังของบริษัท · MasterAdmin เผยแพร่ได้ทันที · ผู้ใช้อื่นกด “เสนอเข้า Template กลาง” แล้วรอ MasterAdmin อนุมัติ</small>
    {proposeOnly&&lib.central.length>0&&<label className="field"><span>เสนอเป็น</span><select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Template กลางใหม่</option>{lib.central.map(t=><option key={t.id} value={t.id}>เวอร์ชันใหม่ของ “{t.name}” (v{t.version + 1})</option>)}</select></label>}</span></label>
   {!canWrite&&<p className="notice warning">บทบาทของคุณในโครงการนี้บันทึก Template ไม่ได้ (เฉพาะ Admin / QS)</p>}
   <h4>สิ่งที่เก็บใน Template</h4>
   <div className="tpl-include"><label className="check"><input type="checkbox" checked disabled/>รูปทรง + ค่าที่กรอก</label>{check('generated','เหล็กที่สร้างจากค่าที่กรอก')}{check('manual',`เหล็กที่วาด / แก้เอง (${manualCount} Mark)`)}
    {check('siteItems','รายการ BOQ เพิ่มเติม')}{check('sheetLayout','การจัดหน้าแบบ (Sheet layout)',!member.sheetLayout)}{check('drawingEdits','การแก้ไขแบบ (Drawing Edit)',!member.drawingEdits)}</div>
   <small className="muted">ไม่เก็บ: จำนวน / Zone / ชั้น, ไฟล์แนบ, สถานะตรวจ — ส่วน Spec (ระยะทาบ, ขอ, เกรด) ใช้ของโครงการที่นำไปใช้ · เก็บ Spec ต้นทางไว้เตือนเมื่อปลายทางต่างกัน</small>
   {(lib.project.length>0||lib.central.length>0)&&<><h4>Template {labels[category]} ที่มีอยู่</h4><table className="subbase-table"><tbody>{[...lib.project,...lib.central].map(t=><tr key={t.level+t.id}><td><b>{t.name}</b><small className="block muted">{templateSummary(t)}</small></td>
    <td><small>{levelLabels[t.level]}{t.legacy?' · ยังไม่ย้าย':''}{t.level==='central'&&t.projectCode?` · จาก ${t.projectCode}`:''}</small></td><td><small>v{t.version} · {t.updatedAt.slice(0,10)}</small></td>
    <td>{(t.level==='project'?canWrite&&!t.legacy:master)&&<button type="button" className="icon-button" aria-label={`ลบ ${t.name}`} disabled={busy} onClick={()=>void remove(t)}><Trash2 size={14}/></button>}</td></tr>)}</tbody></table></>}
   {mine.length>0&&<><h4>คำขอเข้า Template กลางของฉัน</h4><ul className="tpl-requests">{mine.map(p=><li key={p.id}><b>{p.name}</b> · {p.createdAt.slice(0,10)} · <span className={`tpl-status ${p.status}`}>{proposalStatusLabels[p.status]}</span>{p.status==='approved'&&p.centralVersion?` (v${p.centralVersion})`:''}{p.reason?<small className="block">เหตุผล: {p.reason}</small>:null}</li>)}</ul></>}
  </div>
  <aside className="tpl-side"><b>ตัวอย่าง</b>{previewTpl?<TemplatePreview t={previewTpl} project={project}/>:<p className="notice warning">ยังสร้างตัวอย่างไม่ได้ (ตรวจค่าที่กรอก)</p>}
   {same&&!proposeOnly&&<p className="notice">Template ชื่อนี้มีใน{levelLabels[level]}แล้ว → บันทึกเป็น <b>เวอร์ชันใหม่ (v{same.version+1})</b> · สมาชิกที่สร้างจาก v{same.version} ไม่เปลี่ยน</p>}
   {proposeOnly&&<p className="notice">คำขอจะไปที่ MasterAdmin · อนุมัติแล้วจะเป็น{target?'เวอร์ชันใหม่ของ Template กลางที่เลือก':'รายการใหม่ใน Template กลาง'} · ดูสถานะได้ในหน้านี้</p>}
   {message&&<p className="notice success" role="status">{message}</p>}{failed&&<p className="notice danger" role="alert">{failed}</p>}</aside>
  <footer><button type="button" onClick={onClose} disabled={busy}>ปิด</button><button type="button" className="primary" disabled={busy||!canWrite||!name.trim()||!draft} onClick={()=>void save()}>{busy?'กำลังบันทึก…':proposeOnly?'เสนอเข้า Template กลาง':same?`บันทึกเป็น v${same.version+1}`:'บันทึก Template'}</button></footer>
 </div></Modal>;
}

/** "Add member" dialog (artboard 12): templates of this project / central (search, project default badge, preview) or a blank
 * member. Opens on the project default template when the category has one ("เริ่มจากค่าว่าง" = the old blank start). */
export function CreateMemberDialog({category,project,members,blank,onBlank,onCreate,onClose}:{category:Category;project:Project;members:Pick<Member,'code'>[];
 blank:(code:string)=>ReactNode;onBlank:(code:string)=>void;onCreate:(member:Member,t:ListedTemplate)=>Promise<void>|void;onClose:()=>void}){
 const lib=useTemplateLibrary(project,category),{canWrite}=useTemplateRights(project);
 const defaults=useMemo(()=>categoryDefaults(project.templateDefaults,category),[project.templateDefaults,category]),defaultIds=new Set(defaults.map(d=>d.id));
 const firstDefault=lib.all.find(t=>defaultIds.has(t.id));
 const [picked,setPicked]=useState<string|null|undefined>(undefined),[tab,setTab]=useState<TemplateLevel|undefined>(undefined),[q,setQ]=useState('');
 const [code,setCode]=useState(''),[qty,setQty]=useState(1),[zone,setZone]=useState(''),[floor,setFloor]=useState(''),[busy,setBusy]=useState(false),[failed,setFailed]=useState('');
 // undefined = not chosen yet → the project default (if any), else blank
 const selected=picked===undefined?firstDefault:picked===null?undefined:lib.all.find(t=>t.level+':'+t.id===picked);
 const level=tab??(selected?.level||(lib.project.length||!lib.central.length?'project':'central'));
 const shown=(level==='project'?lib.project:lib.central).filter(t=>!q.trim()||matchesSearch(t,q));
 const dup=!!code.trim()&&members.some(m=>m.code.trim().toUpperCase()===code.trim().toUpperCase());
 const diffs=selected?specDifferences(selected.payload.sourceSpec,project.spec):[];
 const create=async()=>{if(!selected)return;setBusy(true);setFailed('');try{await onCreate(memberFromTemplate(selected,code.trim(),project,{level:selected.level,occurrence:{quantity:qty,zone,floor}}),selected);}catch(e){setFailed(msg(e));}finally{setBusy(false);}};
 const toggleDefault=async(t:ListedTemplate)=>{const key=t.key&&(t.key===category||t.key.startsWith(category+':'))?t.key:templateKey(category,t.payload.elementInput),on=project.templateDefaults?.[key]===t.id;
  setBusy(true);setFailed('');try{await setTemplateDefault(project.id,key,on?null:t.id,project.version);}catch(e){setFailed(msg(e));}finally{setBusy(false);}};
 const badge=(t:ListedTemplate)=>defaultIds.has(t.id)?<span className="tpl-badge default">ค่ามาตรฐาน</span>:t.legacy?<span className="tpl-badge">เดิม · ยังไม่ย้าย</span>:<span className="tpl-badge">{t.level==='project'?'โครงการนี้':'กลาง'}</span>;
 return <Modal title={`เพิ่ม${labels[category]}`} onClose={()=>{if(!busy)onClose();}}><div className="tpl-dialog tpl-create">
  <div className="tpl-main">
   <div className="tpl-tabs"><div role="tablist" aria-label="เริ่มจาก" className="segmented">
    <button type="button" role="tab" aria-selected={!selected} className={!selected?'active':''} onClick={()=>setPicked(null)}>เริ่มจากค่าว่าง</button>
    {(['project','central'] as const).map(l=><button key={l} type="button" role="tab" aria-selected={!!selected&&level===l} className={selected&&level===l||!selected&&tab===l?'active':''} onClick={()=>setTab(l)}>{l==='project'?'โครงการนี้':'Template กลาง'} ({(l==='project'?lib.project:lib.central).length})</button>)}</div>
    <label className="tpl-search"><Search size={14}/><input aria-label="ค้นหา Template" placeholder="ค้นหา: เข็ม 4 ต้น, F-02, 2 Stage…" value={q} onChange={e=>setQ(e.target.value)}/></label><HelpButton topic="element-templates"/></div>
   {lib.error&&<p className="notice warning">{lib.error}</p>}
   {lib.loading?<p className="muted">กำลังโหลด Template…</p>:!shown.length?<p className="muted">{q?'ไม่พบ Template ที่ตรงกับคำค้น':level==='project'?`ยังไม่มี Template ${labels[category]}ของโครงการนี้ · บันทึกจากสมาชิกที่กรอกเสร็จด้วยปุ่ม “บันทึกเป็น Template”`:'ยังไม่มี Template กลางของหมวดนี้'}</p>
    :<div className="tpl-list">{shown.map(t=><button type="button" key={t.level+t.id} className={`tpl-item${selected?.id===t.id&&selected.level===t.level?' active':''}`} onClick={()=>{setPicked(t.level+':'+t.id);setTab(t.level);}}>
     <span><b>{t.name}</b><small>{[templateSummary(t),`v${t.version}`,`แก้ล่าสุด ${t.updatedAt.slice(0,10)}`,t.level==='central'&&t.projectCode?`จาก ${t.projectCode}`:''].filter(Boolean).join(' · ')}</small>{t.description&&<small className="muted">{t.description}</small>}</span>{badge(t)}</button>)}</div>}
  </div>
  <aside className="tpl-side">{selected?<>
   <b className="tpl-title">{selected.name} <small>v{selected.version} · {levelLabels[selected.level]}{defaultIds.has(selected.id)?' · ค่ามาตรฐาน':''}</small></b>
   <div className="form-grid"><label className="field"><span>รหัสสมาชิกใหม่</span><input autoFocus value={code} onChange={e=>setCode(e.target.value)} aria-invalid={dup}/>{dup&&<small className="danger-text">มี {code.trim()} ในโครงการแล้ว</small>}</label>
    <label className="field"><span>จำนวน</span><input type="number" min={1} value={qty} onChange={e=>setQty(Math.max(1,Number(e.target.value)||1))}/></label>
    <label className="field"><span>Zone</span><input maxLength={80} value={zone} onChange={e=>setZone(e.target.value)}/></label><label className="field"><span>ชั้น</span><input maxLength={80} value={floor} onChange={e=>setFloor(e.target.value)}/></label></div>
   <div className="tpl-link"><b>หลังสร้างแล้ว</b><label className="tpl-scope active"><input type="radio" name="tpl-link" checked readOnly/><span><b>สมาชิกอิสระ</b><small>คัดลอกทุกอย่างมาเป็นของ {code.trim()||'สมาชิกใหม่'} · แก้ขนาด / เหล็ก / Mark / จัดหน้าแบบได้เต็มที่เหมือนสมาชิกปกติ · Template เปลี่ยนภายหลังไม่กระทบ</small></span></label>
    <label className="tpl-scope disabled"><input type="radio" name="tpl-link" disabled/><span><b>ผูกกับ Template</b> <span className="tpl-badge">รอบถัดไป</span><small>เมื่อ Template มีเวอร์ชันใหม่ จะขึ้นแจ้ง “อัปเดตได้”</small></span></label></div>
   <TemplatePreview t={selected} project={project}/>
   <p className="notice"><b>ปรับตามโครงการปลายทางอัตโนมัติ</b><br/>ระยะทาบ / ขอ / เกรดเหล็ก / ส่วนผสมคอนกรีต ใช้ General Spec ของโครงการนี้ · เหล็กที่สร้างจากค่าที่กรอกถูกสร้างใหม่ · เหล็กที่วาดเองคัดลอกมาตามเดิม (ตรวจระยะหุ้มใหม่เมื่อบันทึก)</p>
   {diffs.length>0&&<p className="notice warning">Template นี้มาจาก{selected.projectCode?`โครงการ ${selected.projectCode} ซึ่ง`:'โครงการที่'}ใช้ Spec ต่างจากโครงการนี้: {diffs.join(' · ')} → ความยาวทาบและขออาจต่างจากต้นฉบับ</p>}
   {canWrite&&<button type="button" className="tpl-star" disabled={busy} onClick={()=>void toggleDefault(selected)}><Star size={14}/>{defaultIds.has(selected.id)?'ยกเลิกค่ามาตรฐานของโครงการ':'ตั้งเป็นค่ามาตรฐานของโครงการ'}</button>}
   {failed&&<p className="notice danger" role="alert">{failed}</p>}
   <footer><button type="button" onClick={onClose} disabled={busy}>ยกเลิก</button><button type="button" className="primary" disabled={busy||!code.trim()||dup} onClick={()=>void create()}>{busy?'กำลังสร้าง…':`สร้าง ${code.trim()||'สมาชิก'} แล้วเปิดแก้ไข`}</button></footer>
  </>:<>
   <label className="field"><span>Member no.</span><input autoFocus value={code} onChange={e=>setCode(e.target.value)} aria-invalid={dup}/>{dup&&<small className="danger-text">มี {code.trim()} ในโครงการแล้ว</small>}</label>
   {blank(code)}
   {firstDefault&&<p className="muted">โครงการนี้มีค่ามาตรฐาน “{firstDefault.name}” · เลือกจากรายการด้านซ้ายเพื่อใช้</p>}
   <footer><button type="button" onClick={onClose}>ยกเลิก</button><button type="button" className="primary" disabled={!code.trim()||dup} onClick={()=>onBlank(code.trim())}>สร้างสมาชิก</button></footer>
  </>}</aside>
 </div></Modal>;
}

/** "สร้างจาก Template … v3" (+ "มีเวอร์ชันใหม่ vN") on a member made from a template: information only. */
export function TemplateSourceNote({member,project}:{member:Member;project:Project}){
 const s=member.templateSource,lib=useTemplateLibrary(s?project:undefined,member.category);
 if(!s)return null;const newer=newerVersion(s,s.scope==='project'?lib.project:lib.central);
 return <span className="tpl-source" title="ข้อมูลอ้างอิงเท่านั้น · สมาชิกนี้เป็นสมาชิกอิสระ แก้ไขได้ทุกอย่าง">สร้างจาก Template {s.scope==='central'?'กลาง ':''}“{s.name}” v{s.version}{s.projectCode&&s.scope==='project'&&s.projectCode!==project.code?` (${s.projectCode})`:''}{newer&&<b> · มีเวอร์ชันใหม่ v{newer}</b>}</span>;
}

/** Admin page: proposals to the central library (MasterAdmin approves / rejects) + the one-time migration of old templates. */
export function CentralTemplateAdmin({projects,run}:{projects:Project[];run:(f:()=>Promise<unknown>,message?:string)=>Promise<void>}){
 const {userProfile}=useAuth(),{proposals,error}=useProposals(userProfile?.uid,true),lib=useTemplateLibrary(undefined);
 const [filter,setFilter]=useState<'pending'|'all'>('pending'),[open,setOpen]=useState<string>(''),[reason,setReason]=useState(''),[target,setTarget]=useState(''),[plan,setPlan]=useState<Awaited<ReturnType<typeof migrateLegacyTemplates>>|null>(null);
 const list=proposals.filter(p=>filter==='all'||p.status==='pending'),pending=proposals.filter(p=>p.status==='pending').length,cur=proposals.find(p=>p.id===open);
 const centralCount=lib.central.length,oldDocs=lib.legacyCount;
 const projectOf=(p:TemplateProposal)=>projects.find(x=>x.id===p.projectId)||projects[0];
 const asTemplate=(p:TemplateProposal):ElementTemplate=>({id:p.id,name:p.name,description:p.description,category:p.category,scope:'workspace',payload:p.payload,version:1,createdAt:p.createdAt,updatedAt:p.createdAt,createdBy:p.uid,updatedBy:p.uid,projectCode:p.projectCode});
 return <section className="panel padded tpl-admin"><div className="section-heading"><div><h3>คำขอ Template กลาง {pending>0&&<span className="badge warning">{pending} รอพิจารณา</span>} <HelpButton topic="element-templates"/></h3>
  <p className="muted">Admin / QS ของโครงการเสนอ Template เข้าคลังกลาง · อนุมัติ = คัดลอกเป็น Template กลางใหม่ หรือเป็นเวอร์ชันใหม่ของรายการที่เลือก · ไม่อนุมัติต้องระบุเหตุผล (ผู้เสนอเห็น) · Template กลางมี {centralCount} รายการ</p></div>
  <div className="segmented">{(['pending','all'] as const).map(v=><button key={v} type="button" className={filter===v?'active':''} onClick={()=>setFilter(v)}>{v==='pending'?'รอพิจารณา':'ทั้งหมด'}</button>)}</div></div>
  {error&&<p className="notice warning">{error}</p>}
  {!list.length?<p className="muted">ไม่มีคำขอ{filter==='pending'?'ที่รอพิจารณา':''}</p>:<div className={`tpl-admin-grid${cur?'':' single'}`}><table><thead><tr><th>Template</th><th>หมวด</th><th>จากโครงการ</th><th>ผู้เสนอ</th><th>วันที่</th><th>สถานะ</th></tr></thead><tbody>
   {list.map(p=><tr key={p.id} className={open===p.id?'selected':''} onClick={()=>{setOpen(p.id);setReason('');setTarget(p.targetCentralId||'');}} style={{cursor:'pointer'}}><td><b>{p.name}</b><small className="block muted">{templateSummary(p)}</small></td><td>{labels[p.category]}</td><td>{p.projectCode}</td><td>{p.proposerName}</td><td>{p.createdAt.slice(0,10)}</td>
    <td><span className={`tpl-status ${p.status}`}>{proposalStatusLabels[p.status]}</span>{p.reason&&<small className="block muted">{p.reason}</small>}</td></tr>)}</tbody></table>
   {cur&&<aside className="tpl-side"><b>{cur.name}</b>{cur.description&&<small className="muted">{cur.description}</small>}{projectOf(cur)?<TemplatePreview t={asTemplate(cur)} project={projectOf(cur)!}/>:<p className="muted">{templateSummary(cur)}</p>}
    {cur.payload.sourceSpec&&<small className="muted">Spec ต้นทาง: {cur.payload.sourceSpec.bsEdition?`BS 8666 ${cur.payload.sourceSpec.bsEdition}`:`ACI 318 ${cur.payload.sourceSpec.aciEdition}`} · เก็บ: {['ค่าที่กรอก',...(cur.payload.include?Object.entries(cur.payload.include).filter(([,v])=>v).map(([k])=>includeLabels[k as keyof TemplateInclude]):['เหล็กวาดเอง','รายการ BOQ'])].join(' · ')}</small>}
    {cur.status==='pending'?<>
     <label className="field"><span>อนุมัติเป็น</span><select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Template กลางใหม่</option>{lib.central.filter(t=>t.category===cur.category).map(t=><option key={t.id} value={t.id}>เวอร์ชันใหม่ของ “{t.name}” (v{t.version+1})</option>)}</select></label>
     <label className="field"><span>เหตุผล / หมายเหตุ (จำเป็นเมื่อไม่อนุมัติ)</span><textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
     <div className="actions"><button type="button" disabled={!reason.trim()} onClick={()=>void run(()=>decideProposal({id:cur.id,approve:false,reason}),'ไม่อนุมัติคำขอแล้ว · ผู้เสนอเห็นเหตุผล')}>ไม่อนุมัติ</button>
      <button type="button" className="primary" onClick={()=>void run(()=>decideProposal({id:cur.id,approve:true,reason,targetCentralId:target||null}),target?'อนุมัติเป็นเวอร์ชันใหม่ของ Template กลางแล้ว':'อนุมัติแล้ว · เพิ่มเข้า Template กลาง')}>อนุมัติ</button></div></>
     :<p className="muted">{proposalStatusLabels[cur.status]} {cur.decidedAt?.slice(0,10)}{cur.centralVersion?` · Template กลาง v${cur.centralVersion}`:''}</p>}</aside>}</div>}
  <h4>ย้าย Template เดิม (เฉพาะโครงการ) เข้าโครงการ</h4>
  <p className="muted">Template รุ่นเดิมที่เลือก “เฉพาะโครงการนี้” เก็บรวมกับ Template กลาง ({oldDocs} รายการ) · ย้ายไปเก็บในโครงการของมัน (รหัสเดิม) · ทำซ้ำได้ ไม่ซ้ำซ้อน · ลบต้นฉบับเมื่อย้ายครบทุกรายการแล้วเท่านั้น · ระหว่างนี้หน้าจออ่านได้ทั้งสองที่</p>
  <div className="actions"><button type="button" onClick={()=>void run(async()=>setPlan(await migrateLegacyTemplates({dryRun:true})),'ตรวจรายการที่จะย้ายแล้ว')}>ตรวจก่อนย้าย</button>
   <button type="button" className="primary" disabled={!plan||!plan.total} onClick={()=>void run(async()=>setPlan(await migrateLegacyTemplates()),'ย้าย Template เดิมเข้าโครงการแล้ว')}>ย้ายเข้าโครงการ</button>
   {plan&&<span className="muted">ทั้งหมด {plan.total} · ย้าย {plan.moved} · มีแล้ว {plan.skipped} · ลบต้นฉบับ {plan.deleted}{plan.conflicts.length?` · ปลายทางใหม่กว่า: ${plan.conflicts.join(', ')}`:''}</span>}</div>
 </section>;
}
