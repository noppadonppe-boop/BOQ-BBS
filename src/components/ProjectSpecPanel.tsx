import {RefreshCw} from 'lucide-react';
import type {Attachment,Project} from '../domain/model';
import {codeInfo,codeValues} from '../domain/designCodes';
import {bsProfile} from '../domain/bs8666';
import {designOf,projectSpecFrom,specLabel,specOutdated} from '../domain/specProfiles';
import {useSpecProfiles} from '../data/specProfiles';
import {changeSpec} from '../data/specChanges';
import {EngineeringApprovalPanel} from './EngineeringApproval';
import {FilePanel} from './LazyFiles';

/** Project side of the workspace General Spec: which profile the project uses, its f'c / grade,
 * live-link status (re-sync when the profile changed), engineering approval and project files. */
export function ProjectSpecPanel({project:p,attachments,memberCount,uid,canChange,blocked,run}:{project:Project;attachments:Attachment[];memberCount:number;uid:string;canChange:boolean;blocked:boolean;run:(f:()=>Promise<unknown>,m?:string)=>Promise<void>}){
 const {profiles}=useSpecProfiles(),s=p.spec,profile=s.profileRef&&profiles.find(x=>x.id===s.profileRef!.id),outdated=specOutdated(s,profiles);
 return <>
  <section className="panel padded project-spec">
   <div className="section-heading"><div><h3>General Spec ของโครงการ</h3><p className="muted">เลือก / เปลี่ยน Spec และ f'c / เกรดเหล็ก ในหน้า “แก้ไขข้อมูลโครงการ” · แก้ไขเนื้อหา Spec ที่เมนู General Spec (ส่วนกลาง)</p></div></div>
   {!s.profileRef&&<p className="notice warning">โครงการนี้ยังไม่ได้เลือก Spec ส่วนกลาง (ใช้ข้อกำหนดเดิมของโครงการ) · เลือก Spec ในหน้าแก้ไขโครงการ</p>}
   {s.profileRef&&!profile&&<p className="notice warning">ไม่พบ Spec “{s.profileRef.name}” ในคลังส่วนกลาง (อาจถูกลบ) · โครงการยังใช้ค่าชุดเดิม v{s.profileRef.version}</p>}
   {outdated&&profile&&<div className="notice warning">Spec “{profile.name}” มีรุ่นใหม่ v{profile.version} (โครงการใช้ v{s.profileRef!.version}) <button disabled={!canChange||blocked} onClick={()=>run(()=>changeSpec(p.id,projectSpecFrom(profile,designOf(s)),p.version),'อัปเดตโครงการตาม Spec ล่าสุดแล้ว')}><RefreshCw size={14}/>อัปเดตตาม Spec ล่าสุด</button></div>}
   <ProjectSpecDetails project={p}/>
  </section>
  <EngineeringApprovalPanel project={p} attachments={attachments} uid={uid} blocked={blocked||!canChange} run={run}/>
  <FilePanel readOnly={blocked||!canChange} memberDirty={false} projectMemberCount={memberCount} project={p} memberId="" attachments={attachments.filter(a=>!a.memberId)} run={run}/>
 </>;
}
/** Details of the Spec the project selected (resolved copy in project.spec). */
export function ProjectSpecDetails({project:p}:{project:Project}){
 const s=p.spec,bs=s.minimumStandard?bsProfile(s):undefined,provisions=codeValues(s.codeData,s.designCode).provisions.filter(x=>x.title.trim()||x.value.trim()||x.detail.trim());
 return <dl className="project-spec-grid">
    <dt>Spec</dt><dd>{s.profileRef?`${s.profileRef.name} · v${s.profileRef.version}`:'—'}</dd>
    <dt>มาตรฐานออกแบบ</dt><dd>{s.designCode?`${codeInfo(s,s.designCode).label} · ${codeInfo(s,s.designCode).sub}`:'ยังไม่เลือก'}</dd>
    <dt>f'c / เกรดเหล็ก</dt><dd>{s.projectDesign?`${s.projectDesign.fc} MPa · ${s.projectDesign.grade}`:'ยังไม่กำหนด'}</dd>
    <dt>ชุดกฎตัด/ดัด</dt><dd>{bs?`${bs.edition} · ${bs.version}`:'ข้อกำหนดโครงการ / legacy'} · ปัดยาวตัด {s.rounding} mm · เหล็ก {s.density} kg/m³</dd>
    <dt>ค่าที่ใช้กับสมาชิก</dt><dd>{specLabel(s)} · รัศมีดัด / ระยะทาบตามตาราง / เกรดเหล็กหลัก ใช้เป็นค่าเริ่มต้นของข้อมูลพื้นฐานสมาชิก และสร้าง Bar list อัตโนมัติใหม่เมื่อเปลี่ยน Spec</dd>
    {provisions.length>0&&<><dt>ข้อกำหนดเพิ่มเติม</dt><dd><ol className="spec-provisions">{provisions.map(x=><li key={x.id}><b>{x.title||'—'}</b>{x.value&&<> · {x.value}</>}{x.detail&&<small className="block">{x.detail}</small>}</li>)}</ol></dd></>}
   </dl>;
}
