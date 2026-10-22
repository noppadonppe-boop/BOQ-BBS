import {useEffect,useRef,useState} from 'react';
import {ImagePlus,Trash2} from 'lucide-react';
import type {Project,ProjectLogo} from '../domain/model';
import {command} from '../data/firebase';
import {LOGO_MAX_BYTES,loadProjectLogo,previewLogoFile,uploadProjectLogo} from '../data/projectLogo';
import {Field,Modal} from './EditorControls';
import {changeSpec,resumeSpecChange} from '../data/specChanges';
import {codeInfo} from '../domain/designCodes';
import {DEFAULT_DESIGN,designConcrete,designGrades,designOf,projectSpecFrom,type ProjectDesign} from '../domain/specProfiles';
import {useSpecProfiles} from '../data/specProfiles';

type Fields={code:string;name:string;owner:string;contractor:string;subcontractor:string;location:string;company:string;notes:string};
const empty:Fields={code:'',name:'',owner:'',contractor:'',subcontractor:'',location:'',company:'',notes:''};
const labels:Record<keyof Omit<Fields,'notes'>,string>={code:'Project No. (รหัสโครงการ)',name:'Project Name (ชื่อโครงการ)',owner:'Client (ผู้ว่าจ้าง / เจ้าของงาน)',contractor:'Contractor (ผู้รับเหมาหลัก)',subcontractor:'Sub Contract (ผู้รับเหมาช่วง)',location:'Location (สถานที่ตั้ง)',company:'บริษัทผู้จัดทำแบบ (แสดงคู่โลโก้ในกรอบชื่อแบบ)'};

/** Create or edit a project: details, company logo and input note. */
export function ProjectForm({project,run,onClose,onSaved}:{project?:Project;run:(f:()=>Promise<unknown>,m?:string)=>Promise<void>;onClose:()=>void;onSaved:(id:string)=>void}){
 const [f,setF]=useState<Fields>(project?{code:project.code,name:project.name,owner:project.owner||'',contractor:project.contractor||'',subcontractor:project.subcontractor||'',location:project.location||'',company:project.titleBlock?.company||'',notes:project.notes||''}:empty);
 // General Spec is a workspace profile; the project picks one plus its own f'c / steel grade
 const {profiles,loading}=useSpecProfiles(),choices=profiles.filter(p=>!p.archived||p.id===project?.spec.profileRef?.id);
 const ref=project?.spec.profileRef,design0=project?designOf(project.spec):DEFAULT_DESIGN;
 const [profileId,setProfileId]=useState(ref?.id||''),[fc,setFc]=useState(design0.fc),[grade,setGrade]=useState<ProjectDesign['grade']>(design0.grade),[progress,setProgress]=useState(''),[jobBusy,setJobBusy]=useState(false),[jobError,setJobError]=useState('');
 useEffect(()=>{if(!project&&!profileId&&choices[0])setProfileId(choices[0].id);},[choices.length]);
 const profile=profiles.find(p=>p.id===profileId),design:ProjectDesign={fc,grade};
 const specChanged=!!project&&!!profile&&(profile.id!==ref?.id||profile.version!==ref?.version||fc!==design0.fc||grade!==design0.grade||!project.spec.projectDesign);
 const specBusy=!!project?.specChangeState&&['Applying','RollingBack'].includes(project.specChangeState.status);
 const [file,setFile]=useState<File|null>(null),[removed,setRemoved]=useState(false),[preview,setPreview]=useState(''),[error,setError]=useState(''),input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(file){void previewLogoFile(file).then(setPreview);return;}if(project?.logo&&!removed)loadProjectLogo(project).then(l=>setPreview(l?.src||'')).catch(()=>setPreview(''));else setPreview('');},[file,removed,project?.logo?.path]);
 const pick=(next:File|undefined)=>{setError('');if(!next)return;if(!['image/png','image/jpeg'].includes(next.type)){setError('โลโก้ต้องเป็นไฟล์ PNG หรือ JPEG');return;}if(next.size>LOGO_MAX_BYTES){setError('โลโก้ต้องมีขนาดไม่เกิน 2 MB');return;}setFile(next);setRemoved(false);};
 const save=()=>run(async()=>{
  const {company,...fields}=f;
  if(!project){const id=crypto.randomUUID(),logo:ProjectLogo|null=file?await uploadProjectLogo(id,file):null;const r=await command('createProject',undefined,{project:{...fields,company,logo,...(profile?{spec:projectSpecFrom(profile,design)}:{})}},id);onSaved(r.id);return;}
  const logo=file?await uploadProjectLogo(project.id,file):removed?null:project.logo||null;
  const saved=await command('saveProject',project.id,{project:{...project,...fields,logo,titleBlock:{...project.titleBlock,company}},version:project.version});
  // apply the chosen spec through the spec-change job: members → Draft, element-input detailing re-derived, auto bars regenerated
  if(specChanged&&profile)await changeSpec(project.id,projectSpecFrom(profile,design),saved.version,setProgress);
  onSaved(project.id);
 },project?'บันทึกข้อมูลโครงการแล้ว':'สร้างโครงการแล้ว');
 // finish or roll back a stuck spec-change job; the dialog closes so it reopens with the new project version
 // single-flight: a second click must not start a parallel loop (conflicting transactions retry and burn Firestore quota)
 const clearJob=async(cancel:boolean)=>{
  if(jobBusy)return;setJobBusy(true);setJobError('');
  try{await resumeSpecChange(project!.id,project!.specChangeState!.id,setProgress,cancel);onSaved(project!.id);}
  catch(e:any){setJobError(e?.message||String(e));}
  finally{setJobBusy(false);setProgress('');}
 };
 return <Modal title={project?`แก้ไขโครงการ · ${project.code}`:'สร้างโครงการ'} onClose={onClose}>
  <form className="project-form" onSubmit={e=>{e.preventDefault();void save();}}>
   <div className="project-form-grid"><div className="form-grid">{(Object.keys(labels) as (keyof typeof labels)[]).map(k=><Field key={k} label={labels[k]} value={f[k]} onChange={v=>setF({...f,[k]:String(v)})}/>)}</div>
    <div className="logo-box"><span className="field-label">โลโก้บริษัท</span>
     <button type="button" className="logo-drop" onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();pick(e.dataTransfer.files[0]);}}>{preview?<img src={preview} alt="โลโก้บริษัท"/>:<span><ImagePlus size={26}/><small className="block">คลิกหรือลากไฟล์ PNG / JPEG (≤ 2 MB)</small></span>}</button>
     <input ref={input} type="file" hidden accept="image/png,image/jpeg" onChange={e=>{pick(e.target.files?.[0]);e.target.value='';}}/>
     {preview&&<button type="button" onClick={()=>{setFile(null);setRemoved(true);}}><Trash2 size={14}/>ลบโลโก้</button>}
     {error&&<p className="notice danger">{error}</p>}
     <div className="design-code-field">
      <label className="field"><span>General Spec (จากคลังส่วนกลาง)</span><select value={profileId} onChange={e=>setProfileId(e.target.value)}>{(!profileId||!profile)&&<option value="">{loading?'กำลังโหลด…':ref?`${ref.name} (ไม่พบในคลัง)`:'— ใช้ข้อกำหนดเดิม / ยังไม่เลือก —'}</option>}{choices.map(p=><option key={p.id} value={p.id}>{p.name} · v{p.version}{p.spec.designCode?` · ${codeInfo(p.spec,p.spec.designCode).label}`:''}</option>)}</select></label>
      <div className="design-pair"><label className="field"><span>f'c (MPa)</span><select value={fc} onChange={e=>setFc(Number(e.target.value))}>{designConcrete.map(v=><option key={v} value={v}>{v} MPa</option>)}</select></label>
       <label className="field"><span>เกรดเหล็ก</span><select value={grade} onChange={e=>setGrade(e.target.value as ProjectDesign['grade'])}>{designGrades.map(v=><option key={v} value={v}>{v}</option>)}</select></label></div>
      <small className="muted">{profile?`${profile.spec.designCode?`${codeInfo(profile.spec,profile.spec.designCode).label} · ${codeInfo(profile.spec,profile.spec.designCode).sub}`:'ยังไม่เลือกหมวด'} · ปัดยาวตัด ${profile.spec.rounding} mm · ระยะทาบ/ขอ/เกรดเหล็กของสมาชิกใช้ตาม Spec นี้`:!profiles.length&&!loading?'ยังไม่มี Spec ในคลัง · สร้างที่เมนู General Spec (ส่วนกลาง)':'เลือก Spec ที่โครงการนี้ใช้'}</small></div>
     {specChanged&&<p className="notice warning">บันทึกแล้วโครงการจะใช้ Spec นี้ · สมาชิกทั้งหมดเป็น Draft และสร้าง Bar list อัตโนมัติใหม่ตาม Spec (เหล็กที่เพิ่มเองคงเดิม)</p>}
     {specBusy&&<div className="notice danger"><p>มีงานเปลี่ยนสเป็คค้างอยู่ ({project!.specChangeState!.completed} / {project!.specChangeState!.total} สมาชิก · {project!.specChangeState!.status}) ทำต่อหรือยกเลิกก่อน</p>
      <div className="actions"><button type="button" className="primary" disabled={jobBusy} onClick={()=>void clearJob(false)}>{jobBusy?'กำลังดำเนินการ…':'ทำต่อให้เสร็จ'}</button><button type="button" disabled={jobBusy} onClick={()=>void clearJob(true)}>ยกเลิกและคืนสเป็คเดิม</button></div>
      {jobBusy&&<small>{progress||'กำลังเชื่อมต่อ Firebase…'} · ห้ามปิดหน้าเว็บระหว่างทำงาน</small>}
      {jobError&&<p>{jobError}</p>}</div>}</div></div>
   <label className="field full"><span>Input note (หมายเหตุโครงการ)</span><textarea rows={4} maxLength={10000} value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} placeholder="ข้อกำหนดพิเศษ เงื่อนไขสัญญา ผู้ติดต่อ ฯลฯ"/></label>
   {!project&&<p className="notice">{profile?`โครงการใหม่ใช้ Spec “${profile.name}” · f'c ${fc} MPa · ${grade}`:'ยังไม่เลือก Spec · โครงการใหม่จะเริ่มด้วย BS 8666:2000 · ปัดยาวตัด 25 mm'} · เปลี่ยนได้ภายหลังในหน้าแก้ไขโครงการ</p>}
   {progress&&<p role="status">{progress}</p>}
   <footer><button type="button" onClick={onClose}>ยกเลิก</button><button className="primary" disabled={jobBusy||!f.code.trim()||!f.name.trim()||specChanged&&specBusy}>{project?'บันทึกการแก้ไข':'สร้างโครงการ'}</button></footer>
  </form>
 </Modal>;
}

/** Soft delete with Project No. confirmation. */
export function ProjectDeleteDialog({project,run,onClose,onDeleted}:{project:Project;run:(f:()=>Promise<unknown>,m?:string)=>Promise<void>;onClose:()=>void;onDeleted:()=>void}){
 const [code,setCode]=useState(''),[reason,setReason]=useState('');
 return <Modal title={`ลบโครงการ · ${project.code}`} onClose={onClose}>
  <p className="notice danger">โครงการ “{project.name}” จะถูกนำออกจากรายการและเปลี่ยนเป็นอ่านอย่างเดียว · ข้อมูลสมาชิก ไฟล์ และประวัติยังเก็บไว้ในระบบเพื่อตรวจสอบหรือกู้คืนโดยผู้ดูแล</p>
  <Field label={`พิมพ์ Project No. “${project.code}” เพื่อยืนยัน`} value={code} onChange={v=>setCode(String(v))}/>
  <label className="field"><span>เหตุผล (ไม่บังคับ)</span><textarea rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  <footer><button onClick={onClose}>ยกเลิก</button><button className="danger-solid" disabled={code.trim()!==project.code} onClick={()=>run(async()=>{await command('deleteProject',project.id,{confirmCode:code.trim(),reason,version:project.version});onDeleted();},'ลบโครงการแล้ว')}><Trash2 size={14}/>ลบโครงการ</button></footer>
 </Modal>;
}

/** Project logo (checksum-verified) or nothing. */
export function ProjectLogoImage({project,className}:{project:Pick<Project,'logo'|'name'>;className?:string}){
 const [src,setSrc]=useState('');
 useEffect(()=>{let live=true;setSrc('');if(project.logo)loadProjectLogo(project).then(l=>{if(live)setSrc(l?.src||'');}).catch(()=>{});return()=>{live=false;};},[project.logo?.path]);
 return src?<img className={className} src={src} alt={`โลโก้ ${project.name}`}/>:null;
}
