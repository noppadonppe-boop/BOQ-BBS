import {useAuth} from '../auth/AuthContext';
import {assignedRoles,profileMaster} from '../domain/authAccess';
import {useEffect,useRef,useState} from 'react';
import {Plus,RefreshCw,Users,ShieldCheck} from 'lucide-react';
import type {Project,Role} from '../domain/model';
import {canonical} from '../domain/canonical';
import {projectRoles,roleLabel,roleDescriptions,AccessUser,AccessRoster,AccessEventPage} from '../domain/projectAccess';
import {command} from '../data/firebase';
import {Modal} from './EditorControls';

type Change={user?:AccessUser;email:string;role:Role|'remove';reason:string;digest:string;requestId:string;submitted:boolean};
type Run=(f:()=>Promise<unknown>,message?:string)=>Promise<void>;
export function ProjectAccess({project,uid,run}:{project:Project;uid:string;run:Run}){
 const {userProfile}=useAuth(),admin=!!userProfile&&assignedRoles(userProfile,project.id).includes('admin'),key=canonical({acl:project.acl,roleSets:project.roleSets||{}}),sequence=useRef(0);
 const [roster,setRoster]=useState<AccessRoster>(),[history,setHistory]=useState<AccessEventPage>(),[loading,setLoading]=useState(false),[error,setError]=useState(''),[change,setChange]=useState<Change>(),[changeError,setChangeError]=useState(''),[saving,setSaving]=useState(false);
 const refresh=async()=>{
  const current=++sequence.current;setLoading(true);setError('');
  try{const [team,events]=await Promise.all([command('listProjectAccess',project.id),command('listProjectAccessEvents',project.id)]);if(sequence.current===current){setRoster(team);setHistory(events);}}
  catch(e:any){if(sequence.current===current)setError(e.message||'โหลดทีมไม่สำเร็จ');}
  finally{if(sequence.current===current)setLoading(false);}
 };
 useEffect(()=>{setChange(undefined);setChangeError('');},[project.id,uid,admin]);
 useEffect(()=>{setRoster(undefined);setHistory(undefined);if(admin)void refresh();return()=>{sequence.current++;};},[project.id,uid,admin,key]);
 const open=(user?:AccessUser)=>{if(!roster)return;setChangeError('');setChange({user,email:'',role:user&&user.accountState!=='active'?'remove':user&&projectRoles.includes(user.role as Role)?user.role as Role:'viewer',reason:'',digest:roster.digest,requestId:crypto.randomUUID(),submitted:false});};
 const more=async(kind:'users'|'events')=>{
  if(loading||!roster)return;const current=++sequence.current;setLoading(true);setError('');
  try{
   if(kind==='users'){const page:AccessRoster=await command('listProjectAccess',project.id,{cursor:roster.nextCursor,expectedDigest:roster.digest});if(sequence.current===current)setRoster({...page,users:[...roster.users,...page.users]});}
   else{const page:AccessEventPage=await command('listProjectAccessEvents',project.id,{cursor:history?.nextCursor});if(sequence.current===current)setHistory({...page,events:[...(history?.events||[]),...page.events]});}
  }catch(e:any){if(sequence.current===current)setError(e.message||'โหลดข้อมูลเพิ่มไม่สำเร็จ');}
  finally{if(sequence.current===current)setLoading(false);}
 };
 const submit=async()=>{
  if(!change||saving)return;const selected={...change,submitted:true};setChange(selected);setChangeError('');setSaving(true);
  const payload={target:selected.user?{uid:selected.user.uid}:{email:selected.email.trim().toLowerCase()},role:selected.role,reason:selected.reason.trim(),expectedDigest:selected.digest};
  try{await run(async()=>{
   try{await command('setProjectAccess',project.id,payload,selected.requestId);setChange(undefined);await refresh();}
   catch(e:any){setChangeError(e.message||'บันทึกไม่สำเร็จ');if(['failed-precondition','invalid-argument','aborted','permission-denied'].includes(e.code))setChange(v=>v?{...v,requestId:crypto.randomUUID(),submitted:false}:v);throw e;}
  },'บันทึกสิทธิ์ในโครงการแล้ว');}finally{setSaving(false);}
 };
 const selfRole=project.acl[uid]||'viewer';
 if(!admin)return <section className="panel padded project-access"><h3><ShieldCheck size={18}/>สิทธิ์ในโครงการ</h3><p>บทบาทของคุณ: <b>{roleLabel(selfRole)}</b></p><p className="muted">{roleDescriptions[selfRole]} · ผู้ดูแลโครงการเป็นผู้จัดการรายชื่อและสิทธิ์ทีม</p></section>;
 return <section className="panel padded project-access" aria-label="ทีมและสิทธิ์โครงการ">
  <div className="section-heading"><div><h3><Users size={18}/>ทีมและสิทธิ์โครงการ</h3><p className="muted">เพิ่มสิทธิ์ให้บัญชีที่สมัครแล้ว · ใช้เฉพาะโครงการนี้</p></div><div className="actions"><button onClick={()=>void refresh()} disabled={loading} aria-label="โหลดทีมล่าสุด"><RefreshCw size={15}/></button><button className="primary" disabled={loading||!roster} onClick={()=>open()}><Plus size={15}/>เพิ่มผู้ใช้</button></div></div>
  {error&&<p role="alert" className="notice danger">{error} <button onClick={()=>void refresh()}>โหลดใหม่</button></p>}
  {loading&&<p role="status">กำลังโหลดข้อมูลทีม…</p>}
  {roster&&<><p className="muted">แสดง {roster.users.length} / {roster.total} บัญชี</p><div className="table-scroll"><table className="access-table"><thead><tr><th>บัญชีผู้ใช้</th><th>บทบาท</th><th>สถานะการอนุมัติ</th><th>จัดการ</th></tr></thead><tbody>{roster.users.map(u=><tr key={u.uid} data-access-user={u.uid}><td><strong>{u.email||u.displayName||'บัญชีที่ไม่พบข้อมูล'}</strong>{u.displayName&&u.email&&<small className="block">{u.displayName}</small>}{u.self&&<small className="block">คุณ</small>}</td><td>{(u.roles||[u.role]).map(r=><span className="badge" key={r}>{roleLabel(r)}</span>)}<small className="block">{(u.roles||[u.role]).join(" + ")}</small></td><td>{u.accountState==='active'?'อนุมัติแล้ว':u.accountState==='disabled'?'ยังไม่ได้รับอนุมัติ':'ยังไม่มีโปรไฟล์ในแอป'}</td><td><button disabled={u.self||loading} onClick={()=>open(u)}>เปลี่ยนสิทธิ์</button></td></tr>)}</tbody></table></div>{roster.nextCursor&&<button className="access-load-more" disabled={loading} onClick={()=>void more('users')}>โหลดผู้ใช้เพิ่ม</button>}</>}
  <p className="muted">คุณเปลี่ยนสิทธิ์ตนเองไม่ได้ ให้ผู้ดูแลอีกคนดำเนินการ · ไม่มีการส่งอีเมลจากหน้านี้</p>
  <details className="access-history" open><summary>ประวัติการเปลี่ยนสิทธิ์</summary>{history&&!history.events.length&&<p className="muted">ยังไม่มีประวัติที่บันทึกด้วยรุ่นนี้ การเปิดหน้าทีมไม่สร้างประวัติย้อนหลัง</p>}{history?.events.map(e=><article key={e.id} data-access-event={e.id}><div><b>{e.targetLabel}</b><small>{new Date(e.createdAt).toLocaleString('th-TH')} · โดย {e.actorLabel}</small></div><p>{roleLabel(e.beforeRole)} → <b>{roleLabel(e.afterRole)}</b></p><p className="access-reason">{e.reason}</p>{e.legacy&&<small>คำขอจากรุ่นเดิม</small>}</article>)}{history?.nextCursor&&<button disabled={loading} onClick={()=>void more('events')}>โหลดประวัติเพิ่ม</button>}</details>
  {change&&<Modal title={change.user?'เปลี่ยนสิทธิ์ในโครงการ':'เพิ่มผู้ใช้ในโครงการ'} onClose={()=>{if(!saving)setChange(undefined);}}><form onSubmit={e=>{e.preventDefault();void submit();}}>
   <p>โครงการ <b>{project.code} · {project.name}</b></p>
   {change.user?<p>บัญชี <b>{change.user.email||change.user.displayName||'บัญชีที่ไม่พบข้อมูล'}</b><br/>สิทธิ์ปัจจุบัน: {roleLabel(change.user.role)}</p>:<label className="field"><span>อีเมลบัญชีที่สมัครแล้ว</span><input type="email" required maxLength={320} disabled={saving||change.submitted} value={change.email} onChange={e=>setChange({...change,email:e.target.value})}/></label>}
   <label className="field"><span>สิทธิ์ใหม่</span><select disabled={saving||change.submitted} value={change.role} onChange={e=>setChange({...change,role:e.target.value as Role|'remove'})}>{projectRoles.map(r=><option key={r} value={r} disabled={!!change.user&&change.user.accountState!=='active'}>{roleLabel(r)} ({r})</option>)}{change.user&&<option value="remove">นำออกจากโครงการ</option>}</select></label>
   <p className={change.role==='remove'?'notice warning':'muted'}>{change.role==='remove'?'บัญชีนี้จะอ่านและทำงานในโครงการนี้ไม่ได้ ข้อมูลโครงการและประวัติเดิมยังเก็บอยู่':roleDescriptions[change.role]}</p>
   <label className="field"><span>เหตุผลการเปลี่ยนสิทธิ์</span><textarea required maxLength={500} disabled={saving||change.submitted} value={change.reason} onChange={e=>setChange({...change,reason:e.target.value})}/></label>
   <p className="muted">เหตุผลเก็บในประวัติโครงการ พร้อมผู้ดำเนินการและเวลาจริง · ไม่เปลี่ยน BBS หรือการยืนยันตำแหน่งเหล็ก</p>
   {roster&&change.digest!==roster.digest&&<p className="notice warning">สิทธิ์เปลี่ยนหลังเปิดหน้าต่างนี้ หากยังไม่ได้บันทึก ให้ปิดแล้วเลือกจากทีมล่าสุด</p>}
   {changeError&&<p role="alert" className="notice danger">{changeError}</p>}
   {change.submitted&&!saving&&changeError&&<p className="muted">หากไม่ทราบว่าคำขอสำเร็จหรือไม่ ให้ลองคำขอเดิมอีกครั้ง หรือปิดหน้าต่างแล้วโหลดทีมล่าสุดก่อนเปลี่ยนข้อมูล</p>}
   <footer><button type="button" disabled={saving} onClick={()=>setChange(undefined)}>ยกเลิก</button><button className="primary" type="submit" disabled={saving||!change.reason.trim()||(!change.user&&!change.email.trim())||(!!change.user&&change.role===change.user.role)}>{saving?'กำลังบันทึก…':change.submitted?'ลองคำขอเดิมอีกครั้ง':change.role==='remove'?'ยืนยันนำออก':'บันทึกสิทธิ์'}</button></footer>
  </form></Modal>}
 </section>;
}

