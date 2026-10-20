import {useEffect,useRef,useState} from 'react';
import {ImagePlus,Trash2} from 'lucide-react';
import type {Project,ProjectLogo} from '../domain/model';
import {command} from '../data/firebase';
import {LOGO_MAX_BYTES,loadProjectLogo,previewLogoFile,uploadProjectLogo} from '../data/projectLogo';
import {Field,Modal} from './EditorControls';

type Fields={code:string;name:string;owner:string;contractor:string;subcontractor:string;location:string;company:string;notes:string};
const empty:Fields={code:'',name:'',owner:'',contractor:'',subcontractor:'',location:'',company:'',notes:''};
const labels:Record<keyof Omit<Fields,'notes'>,string>={code:'Project No. (รหัสโครงการ)',name:'Project Name (ชื่อโครงการ)',owner:'Client (ผู้ว่าจ้าง / เจ้าของงาน)',contractor:'Contractor (ผู้รับเหมาหลัก)',subcontractor:'Sub Contract (ผู้รับเหมาช่วง)',location:'Location (สถานที่ตั้ง)',company:'บริษัทผู้จัดทำแบบ (แสดงคู่โลโก้ในกรอบชื่อแบบ)'};

/** Create or edit a project: details, company logo and input note. */
export function ProjectForm({project,run,onClose,onSaved}:{project?:Project;run:(f:()=>Promise<unknown>,m?:string)=>Promise<void>;onClose:()=>void;onSaved:(id:string)=>void}){
 const [f,setF]=useState<Fields>(project?{code:project.code,name:project.name,owner:project.owner||'',contractor:project.contractor||'',subcontractor:project.subcontractor||'',location:project.location||'',company:project.titleBlock?.company||'',notes:project.notes||''}:empty);
 const [file,setFile]=useState<File|null>(null),[removed,setRemoved]=useState(false),[preview,setPreview]=useState(''),[error,setError]=useState(''),input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(file){void previewLogoFile(file).then(setPreview);return;}if(project?.logo&&!removed)loadProjectLogo(project).then(l=>setPreview(l?.src||'')).catch(()=>setPreview(''));else setPreview('');},[file,removed,project?.logo?.path]);
 const pick=(next:File|undefined)=>{setError('');if(!next)return;if(!['image/png','image/jpeg'].includes(next.type)){setError('โลโก้ต้องเป็นไฟล์ PNG หรือ JPEG');return;}if(next.size>LOGO_MAX_BYTES){setError('โลโก้ต้องมีขนาดไม่เกิน 2 MB');return;}setFile(next);setRemoved(false);};
 const save=()=>run(async()=>{
  const {company,...fields}=f;
  if(!project){const id=crypto.randomUUID(),logo:ProjectLogo|null=file?await uploadProjectLogo(id,file):null;const r=await command('createProject',undefined,{project:{...fields,company,logo}},id);onSaved(r.id);return;}
  const logo=file?await uploadProjectLogo(project.id,file):removed?null:project.logo||null;
  await command('saveProject',project.id,{project:{...project,...fields,logo,titleBlock:{...project.titleBlock,company}},version:project.version});onSaved(project.id);
 },project?'บันทึกข้อมูลโครงการแล้ว':'สร้างโครงการแล้ว');
 return <Modal title={project?`แก้ไขโครงการ · ${project.code}`:'สร้างโครงการ'} onClose={onClose}>
  <form className="project-form" onSubmit={e=>{e.preventDefault();void save();}}>
   <div className="project-form-grid"><div className="form-grid">{(Object.keys(labels) as (keyof typeof labels)[]).map(k=><Field key={k} label={labels[k]} value={f[k]} onChange={v=>setF({...f,[k]:String(v)})}/>)}</div>
    <div className="logo-box"><span className="field-label">โลโก้บริษัท</span>
     <button type="button" className="logo-drop" onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();pick(e.dataTransfer.files[0]);}}>{preview?<img src={preview} alt="โลโก้บริษัท"/>:<span><ImagePlus size={26}/><small className="block">คลิกหรือลากไฟล์ PNG / JPEG (≤ 2 MB)</small></span>}</button>
     <input ref={input} type="file" hidden accept="image/png,image/jpeg" onChange={e=>{pick(e.target.files?.[0]);e.target.value='';}}/>
     {preview&&<button type="button" onClick={()=>{setFile(null);setRemoved(true);}}><Trash2 size={14}/>ลบโลโก้</button>}
     {error&&<p className="notice danger">{error}</p>}</div></div>
   <label className="field full"><span>Input note (หมายเหตุโครงการ)</span><textarea rows={4} maxLength={10000} value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} placeholder="ข้อกำหนดพิเศษ เงื่อนไขสัญญา ผู้ติดต่อ ฯลฯ"/></label>
   {!project&&<p className="notice">โครงการใหม่เริ่มด้วย BS 8666:2000 · ปัดยาวตัด 25 mm · ปรับได้ใน General Spec</p>}
   <footer><button type="button" onClick={onClose}>ยกเลิก</button><button className="primary" disabled={!f.code.trim()||!f.name.trim()}>{project?'บันทึกการแก้ไข':'สร้างโครงการ'}</button></footer>
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
