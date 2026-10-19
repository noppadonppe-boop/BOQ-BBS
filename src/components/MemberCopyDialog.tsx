import {useEffect,useMemo,useState} from 'react';
import {doc,getDocFromServer} from 'firebase/firestore';
import {db,command} from '../data/firebase';
import {readCollectionPages} from '../data/collections';
import {decodeStorage} from '../domain/storageCodec';
import {copyMemberInputs,memberCopyRequestSchema,type MemberCopyRequest} from '../domain/memberCopy';
import {takeoff,validateMember} from '../domain/engine';
import {labels,type Member,type Project} from '../domain/model';
import {Modal,number} from './EditorControls';

type Location={id:string;zone:string;floor:string;grid:string;quantity:string};
type Preview={sourceProject:Project;source:Member;target:Project;members:Member[]};
type Props={sourceProject:Project;source:Member;projects:Project[];targets:Project[];run:(f:()=>Promise<unknown>,message?:string)=>Promise<void>;onClose:()=>void;onCreated:(pid:string,id:string,category:Member['category'])=>void};
const location=():Location=>({id:crypto.randomUUID(),zone:'',floor:'',grid:'',quantity:''});
export function MemberCopyDialog({sourceProject,source,projects,targets,run,onClose,onCreated}:Props){
 const [targetId,setTargetId]=useState(targets.some(p=>p.id===sourceProject.id)?sourceProject.id:targets[0]?.id||'');
 const [code,setCode]=useState(''),[locations,setLocations]=useState<Location[]>(()=>[location()]);
 const [memberId]=useState(()=>crypto.randomUUID()),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false);
 const [preview,setPreview]=useState<Preview|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [pending,setPending]=useState<{pid:string;input:MemberCopyRequest;requestId:string;category:Member['category']}|null>(null);
 useEffect(()=>{
  let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
  setLoading(true);setPreview(null);setError('');
  const load=async()=>{
   if(!targetId)throw Error('ไม่มีโครงการที่คุณมีสิทธิ์เพิ่มสมาชิก');
   const [sp,tp,sm]=await Promise.all([getDocFromServer(doc(db,'projects',sourceProject.id)),getDocFromServer(doc(db,'projects',targetId)),getDocFromServer(doc(db,'projects',sourceProject.id,'members',source.id))]);
   if(!sp.exists()||!tp.exists()||!sm.exists())throw Error('ไม่พบต้นแบบหรือโครงการปลายทาง');
   const members=await readCollectionPages(targetId,'members',()=>{},()=>active);
   const [spAfter,tpAfter]=await Promise.all([getDocFromServer(doc(db,'projects',sourceProject.id)),getDocFromServer(doc(db,'projects',targetId))]);
   if(spAfter.data()?.version!==sp.data().version||tpAfter.data()?.version!==tp.data().version)throw Error('ข้อมูลเปลี่ยนระหว่างโหลด กดโหลดต้นแบบและปลายทางใหม่');
   return {sourceProject:decodeStorage(sp.data()) as Project,source:decodeStorage(sm.data()) as Member,target:decodeStorage(tp.data()) as Project,members};
  };
  Promise.race([load(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('โหลดไม่สำเร็จภายใน 20 วินาที ตรวจการเชื่อมต่อแล้วลองใหม่')),20000);})]).then(value=>{if(active)setPreview(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{clearTimeout(timer);if(active)setLoading(false);});
  return ()=>{active=false;clearTimeout(timer);};
 },[targetId,attempt,sourceProject.id,source.id]);
 const targetLive=projects.find(p=>p.id===targetId),sourceLive=projects.find(p=>p.id===sourceProject.id);
 const permitted=targets.some(p=>p.id===targetId);
 const locked=(p?:Project)=>['Importing','Cancelling'].includes(p?.restoreState?.status||'')||['Applying','RollingBack'].includes(p?.specChangeState?.status||'');
 const stale=!!preview&&(!sourceLive||!targetLive||preview.sourceProject.version!==sourceLive.version||preview.target.version!==targetLive.version);
 const plan=useMemo(()=>{
  if(!preview)return null;
  try{
   const input=memberCopyRequestSchema.parse({sourceProjectId:preview.sourceProject.id,sourceMemberId:preview.source.id,sourceProjectVersion:preview.sourceProject.version,sourceMemberVersion:preview.source.version,targetProjectVersion:preview.target.version,memberId,code,occurrences:locations.map(o=>({...o,quantity:o.quantity.trim()?Number(o.quantity):0}))});
   const member=copyMemberInputs(preview.source,input),problems=validateMember(member,preview.target.spec);
   if(preview.members.some(m=>m.code===input.code))problems.unshift('Member no. ซ้ำในโครงการปลายทาง');
   return {input,member,quantity:takeoff(member,preview.target.spec),problems};
  }catch{return null;}
 },[preview,memberId,code,locations]);
 const execute=async(request:NonNullable<typeof pending>)=>{
  if(busy||!permitted)return;setPending(request);setBusy(true);
  try{await run(async()=>{const result=await command('copyMember',request.pid,request.input,request.requestId);setPending(null);onCreated(request.pid,result.id,request.category);},'ทำสำเนาสมาชิกแล้ว · รอตรวจมิติและเหล็กใหม่');}finally{setBusy(false);}
 };
 const create=()=>{
  if(!plan||plan.problems.length||stale||!permitted||locked(sourceLive)||locked(targetLive)||busy||pending)return;
  void execute({pid:targetId,input:plan.input,requestId:crypto.randomUUID(),category:plan.member.category});
 };
 return <Modal title="ทำสำเนาสมาชิก" onClose={()=>{if(!busy)onClose();}}><div className="member-copy" aria-busy={busy||loading}>
  <p>ใช้มิติ รูปทรง และรายการ BBS ของสมาชิกที่บันทึกแล้วเป็นต้นแบบ เลือกโครงการปลายทางและกรอกตำแหน่งใหม่</p>
  <fieldset className="profile-fields" disabled={busy||!!pending}>
   <div className="form-grid"><label className="field"><span>โครงการปลายทาง</span><select aria-label="โครงการปลายทาง" value={targetId} onChange={e=>setTargetId(e.target.value)}>{targets.map(p=><option value={p.id} key={p.id}>{p.code} · {p.name}</option>)}</select></label><label className="field"><span>Member no. ใหม่</span><input aria-label="Member no. ใหม่" maxLength={50} value={code} onChange={e=>setCode(e.target.value)}/></label></div>
   <p className="muted">ต้นทาง {preview?.sourceProject.code||sourceProject.code} / {preview?.source.code||source.code} · ประเภท {labels[preview?.source.category||source.category]}{preview&&` · รุ่นสมาชิก ${preview.source.version} / โครงการ ${preview.sourceProject.version}`}</p>
   {loading&&<p role="status">กำลังโหลดต้นแบบและปลายทาง…</p>}
   {error&&<p role="alert" className="notice danger">{error}</p>}
   {stale&&<p role="alert" className="notice warning">ต้นแบบหรือปลายทางเปลี่ยนจากตัวอย่าง โหลดใหม่แล้วตรวจปริมาณอีกครั้ง</p>}
   {!permitted&&<p role="alert" className="notice danger">ไม่มีสิทธิ์เพิ่มสมาชิกในปลายทาง</p>}
   {(locked(sourceLive)||locked(targetLive))&&<p role="alert" className="notice warning">โครงการกำลังรับข้อมูลหรือเปลี่ยนสเป็ค รอให้เสร็จก่อนทำสำเนา</p>}
   <button disabled={loading} onClick={()=>setAttempt(n=>n+1)}>โหลดต้นแบบและปลายทางใหม่</button>
   <h3>จำนวนและตำแหน่งใหม่</h3><p className="muted">จำนวนต่อ Mark ใช้ตามต้นแบบ แต่จำนวนองค์ประกอบและ Zone / Floor / Grid ต้องกรอกใหม่</p>
   {locations.map((o,i)=><div className="copy-location" key={o.id}>{(['zone','floor','grid','quantity'] as const).map(k=><label className="field" key={k}><span>{({zone:'Zone',floor:'Floor',grid:'Grid',quantity:'จำนวน'})[k]} {i+1}</span><input aria-label={`${({zone:'Zone',floor:'Floor',grid:'Grid',quantity:'จำนวน'})[k]}ใหม่ ${i+1}`} type={k==='quantity'?'number':'text'} min={k==='quantity'?1:undefined} max={k==='quantity'?100000:undefined} step={k==='quantity'?1:undefined} maxLength={k==='quantity'?undefined:80} value={o[k]} onChange={e=>setLocations(rows=>rows.map(row=>row.id===o.id?{...row,[k]:e.target.value}:row))}/></label>)}<button aria-label={`ลบตำแหน่งใหม่ ${i+1}`} disabled={locations.length===1} onClick={()=>setLocations(rows=>rows.filter(row=>row.id!==o.id))}>ลบ</button></div>)}
   <button disabled={locations.length>=1000} onClick={()=>setLocations(rows=>[...rows,location()])}>เพิ่มตำแหน่งใหม่</button>
   {plan?<section className="copy-preview" aria-label="ตัวอย่างสมาชิกใหม่"><h3>ตรวจปริมาณสมาชิกใหม่</h3><p>{plan.member.code} · {plan.member.x} × {plan.member.y} × {plan.member.z} mm · {plan.member.bars.length} Mark · Draft</p><div className="kpis">{[['จำนวน',plan.quantity.quantity,'ชิ้น'],['คอนกรีต',plan.quantity.concrete*plan.quantity.quantity,'m³'],['แบบหล่อ',plan.quantity.formwork*plan.quantity.quantity,'m²'],['เหล็ก BBS',plan.quantity.rebar*plan.quantity.quantity,'kg']].map(([label,value,unit])=><div key={String(label)}><small>{label}</small><strong>{label==='เหล็ก BBS'&&!plan.member.bars.length?'รอ BBS':number(Number(value),label==='จำนวน'?0:3)} <em>{unit}</em></strong></div>)}</div>{plan.problems.map((problem,i)=><p key={i} role="alert" className="notice danger">{problem}</p>)}<p className="muted">คำนวณตาม Spec ปลายทาง · {preview?.target.spec.bsEdition||'ยังไม่กำหนดมาตรฐาน'} · ปัดความยาว {preview?.target.spec.rounding} mm</p></section>:preview&&<p className="notice">กรอก Member no. และจำนวนเต็มบวกในทุกตำแหน่งเพื่อดูปริมาณ</p>}
  </fieldset>
  <p className="notice warning">ไม่ย้ายไฟล์แบบ จุดชี้ Mark ผลตรวจวัด หรือการยืนยันจากต้นทาง ต้องแนบแบบและตรวจใหม่ รวมทั้งตั้งเลขแบบ BBS และตาราง A4 ใหม่ก่อนส่งออก</p>
  {pending&&!busy&&<div role="alert" className="notice warning">ยังไม่ได้รับผลสำเร็จ ลองคำขอเดิมเพื่อรับผลโดยไม่เพิ่มสมาชิกซ้ำ หรือกลับไปแก้ข้อมูลแล้วโหลดใหม่<div className="actions"><button disabled={!permitted} onClick={()=>void execute(pending)}>ลองคำขอเดิมอีกครั้ง</button><button onClick={()=>{setPending(null);setAttempt(n=>n+1);}}>กลับไปแก้ข้อมูล</button></div></div>}
  <footer><button disabled={busy} onClick={onClose}>ยกเลิก</button><button className="primary" disabled={busy||!!pending||loading||!plan||!!plan.problems.length||stale||!permitted||locked(sourceLive)||locked(targetLive)} onClick={create}>{busy?'กำลังทำสำเนา…':'สร้างสมาชิกจากต้นแบบ'}</button></footer>
 </div></Modal>;
}
