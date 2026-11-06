import {useCallback,useEffect,useMemo,useState} from 'react';
import {ExternalLink,Trash2} from 'lucide-react';
import {memberSchema,type Member,type Project} from '../domain/model';
import {beamLinkState,linkedBeams,planFloorBeams,type BeamPlanRow,type BeamPlanStatus} from '../domain/floorBeams';
import {readCollectionPages} from '../data/collections';
import {command} from '../data/firebase';
import {HelpButton} from './HelpCenter';
import {openMember} from './memberNav';

// S3 “สร้าง / อัปเดตคานจากแปลนพื้น”: preview of the beam groups the saved floor gives (new / update / same / edited / no longer
// in the plan / code taken), then the members are written by command syncFloorBeams (≤ 25 per call). Nothing is deleted
// unless the user deletes a “ไม่อยู่ในแปลนแล้ว” row and confirms.

/** Project members (decoded) + the saved floor member; reload after writes. */
export function useProjectMembers(projectId:string,enabled:boolean){
 const [members,setMembers]=useState<Member[]|null>(null),[error,setError]=useState('');
 const reload=useCallback(async()=>{if(!enabled)return;setError('');try{const all=await readCollectionPages(projectId,'members');setMembers(all.flatMap((x:unknown)=>{const r=memberSchema.safeParse(x);return r.success?[r.data]:[];}));}catch(e){setError(e instanceof Error?e.message:String(e));}},[projectId,enabled]);
 useEffect(()=>{void reload();},[reload]);
 return {members,error,reload};
}
export const beamStatusLabel:Record<BeamPlanStatus,string>={new:'ใหม่',update:'อัปเดต',same:'ไม่เปลี่ยน',edited:'แก้เองแล้ว',removed:'ไม่อยู่ในแปลนแล้ว',conflict:'รหัสซ้ำ'};
export const linkStateLabel={current:'ล่าสุด',stale:'ต้องอัปเดต',edited:'แก้เองแล้ว',missing:'ไม่อยู่ในแปลนแล้ว'} as const;
/** Linked beam members of a floor with their state (for the floor editor's beam list / 3D). */
export function floorLinks(floor:Member|undefined,members:Member[]|null,project:Project){
 if(!floor||!members)return [];
 return linkedBeams(members,floor.id).map(m=>({member:m,state:beamLinkState(m,floor,project.spec),input:m.elementInput as {placement?:{along:'X'|'Y';line:string}}}));
}

export function FloorBeamsDialog({project,floorId,editedInput,readOnly,members,onReload,onClose}:{project:Project;floorId:string;
 /** the editor's current floor input: differs from the saved floor → notice (the preview uses the saved floor) */ editedInput:unknown;
 readOnly:boolean;members:Member[]|null;onReload:()=>Promise<void>;onClose:()=>void}){
 const [overwrite,setOverwrite]=useState<string[]>([]),[skip,setSkip]=useState<string[]>([]),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const floor=members?.find(m=>m.id===floorId);
 const plan=useMemo(()=>floor&&members?planFloorBeams(floor,members,project.spec,{overwrite}):undefined,[floor,members,project.spec,overwrite]);
 const unsaved=!!floor&&JSON.stringify((floor.elementInput as {floor?:unknown})?.floor)!==JSON.stringify((editedInput as {floor?:unknown})?.floor);
 // failed member check (r.errors) = never written; the user may also untick lines
 const writes=(plan?.rows||[]).filter(r=>r.member&&!skip.includes(r.key)),failed=(plan?.rows||[]).filter(r=>r.errors?.length),skipped=[...failed,...(plan?.rows||[]).filter(r=>r.member&&skip.includes(r.key))];
 const run=async()=>{if(!floor||!writes.length)return;setBusy(true);setMsg('');
  try{for(let i=0;i<writes.length;i+=25){const batch=writes.slice(i,i+25);
    await command('syncFloorBeams',project.id,{floorId:floor.id,floorVersion:floor.version,members:batch.map(r=>({...r.member!,version:r.existing?.version||0}))});}
   setMsg(`บันทึก ${writes.length} สมาชิกคานแล้ว (สถานะ Draft)`);setOverwrite([]);setSkip([]);await onReload();}
  catch(e){setMsg(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const remove=async(r:BeamPlanRow)=>{const m=r.existing;if(!m||!confirm(`ลบสมาชิกคาน ${m.code}? · ลบแล้วกู้คืนไม่ได้ (ยกเว้นจาก Backup)`))return;setBusy(true);setMsg('');
  try{await command('deleteMember',project.id,{memberId:m.id,version:m.version});setMsg(`ลบ ${m.code} แล้ว`);await onReload();}catch(e){setMsg(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 return <div className="modal-shade" role="dialog" aria-modal="true" aria-label="สร้าง / อัปเดตคานจากแปลนพื้น"><section className="modal floor-beams-dialog">
  <header><b>สร้าง / อัปเดตคานจากแปลนพื้น {floor?.code||''}</b> <HelpButton topic="slab-floor-beams"/><button type="button" className="icon-button" aria-label="ปิด" onClick={onClose}>×</button></header>
  {!members&&<p className="muted">กำลังอ่านสมาชิกของโครงการ…</p>}
  {members&&!floor&&<p className="notice warning">ยังไม่ได้บันทึกแปลนพื้นนี้ · บันทึกสมาชิกพื้นก่อนสร้างคาน</p>}
  {unsaved&&<p className="notice warning">แปลนพื้นมีการแก้ไขที่ยังไม่บันทึก · พรีวิวนี้ใช้แปลนที่บันทึกแล้ว (v{floor?.version}) · บันทึกสมาชิกพื้นก่อนถ้าต้องการใช้แปลนล่าสุด</p>}
  {plan&&<>
   {plan.warnings.length>0&&<ul className="notice warning">{plan.warnings.map(w=><li key={w}>{w}</li>)}</ul>}
   <table className="data-table"><thead><tr><th title="ติ๊ก = เขียนแนวนี้">เขียน</th><th>แนวคาน</th><th>สมาชิก</th><th>สถานะ</th><th>ช่วง</th><th>คอนกรีตโดยประมาณ (m³)</th><th/></tr></thead>
    <tbody>{plan.rows.map(r=><tr key={`${r.key}-${r.code}`} className={`fb-${r.status}`}>
     <td>{(r.member||r.errors)&&<input type="checkbox" aria-label={`เขียน ${r.code}`} disabled={readOnly||!r.member} checked={!!r.member&&!skip.includes(r.key)} onChange={e=>setSkip(o=>e.target.checked?o.filter(x=>x!==r.key):[...o,r.key])}/>}</td>
     <td>{r.along?`${r.along} · ${r.line}`:'—'}</td><td>{r.code}{r.existing&&r.status!=='conflict'&&<button type="button" className="icon-button" title="เปิดสมาชิก" onClick={()=>openMember(r.existing!.id)}><ExternalLink size={13}/></button>}</td>
     <td>{beamStatusLabel[r.status]}{r.note?<small className="muted"> · {r.note}</small>:null}
      {r.errors?.length?<div className="fb-failed"><b className="danger-text">ตรวจไม่ผ่าน · ข้ามแนวนี้</b><ul>{r.errors.map(e=><li key={e}><small>{e}</small></li>)}</ul></div>:null}
      {r.status==='edited'&&<label className="check"><input type="checkbox" disabled={readOnly} checked={overwrite.includes(r.existing!.id)} onChange={e=>setOverwrite(o=>e.target.checked?[...o,r.existing!.id]:o.filter(x=>x!==r.existing!.id))}/>เขียนทับ</label>}</td>
     <td>{r.spans||''}</td><td>{r.concrete?r.concrete.toFixed(3):''}</td>
     <td>{r.status==='removed'&&<button type="button" disabled={readOnly||busy} onClick={()=>void remove(r)}><Trash2 size={13}/>ลบ</button>}</td></tr>)}</tbody></table>
   {failed.length>0&&<p className="notice warning">ตรวจสมาชิกไม่ผ่าน {failed.length} แนว ({failed.map(r=>r.code).join(', ')}) · แนวเหล่านี้จะไม่ถูกเขียน · แก้ขนาดคานในแปลน หรือใส่ Beam Template ที่วางเหล็กได้</p>}
   <p className="muted">ปริมาณ: คานนับเต็มความลึก (หยุดที่หน้าเสา / หน้าคานหลัก) · พื้นนับระหว่างหน้าคาน · คานในแปลนพื้นยังเป็นอ้างอิง (ไม่นับซ้ำ) · เหล็กคานตาม Beam Template ของเบอร์ · เบอร์ที่ไม่มี Template ใช้ชุดค่าเริ่มต้นชุดแรกที่ตรวจผ่าน (อัปเดตแล้วเหล็กตามเบอร์คงเดิม)</p>
  </>}
  {msg&&<p className="notice" role="status">{msg}</p>}
  <footer className="actions"><button type="button" onClick={onClose}>ปิด</button>
   <button type="button" className="primary" disabled={readOnly||busy||!writes.length} onClick={()=>void run()}>{writes.length?`สร้าง / อัปเดต ${writes.length} สมาชิก`:'ไม่มีอะไรต้องเขียน'}{skipped.length?` · ข้าม ${skipped.length} แนว (${skipped.map(r=>r.code).join(', ')})`:''}</button></footer>
 </section></div>;
}
