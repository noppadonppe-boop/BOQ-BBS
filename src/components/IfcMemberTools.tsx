import {useMemo,useState} from 'react';
import type {Member,Spec} from '../domain/model';
import {applyIfcConvert,ifcConvertBlocker,ifcConvertPlan} from '../domain/ifcConvert';
import {Modal,number} from './EditorControls';

/** Banner of a member imported from IFC: where it came from, re-import hint and “แปลงเป็นข้อมูลกรอก”. */
export function IfcSourceBanner({member:m,spec,readOnly,onConvert}:{member:Member;spec:Spec;readOnly:boolean;onConvert:(next:Member)=>void}){
 const [open,setOpen]=useState(false),s=m.ifcSource;if(!s)return null;
 const blocker=ifcConvertBlocker(m);
 return <div className="notice ifc-banner" data-ifc-source>
  <div><b>จาก IFC · {s.files.join(' + ')} · {s.tool}</b><br/><small>นำเข้า {new Date(s.importedAt).toLocaleDateString('th-TH')} · {s.barSets} ชุดเหล็กในโมเดล · น้ำหนักในโมเดล {number(s.ifcWeight,0)} kg
   {s.converted?' · แปลงเป็นข้อมูลกรอกแล้ว (เหล็กที่แปลงไม่ได้ยังเป็นเหล็ก IFC)':' · แก้เหล็กในโมเดลแล้วนำเข้าใหม่ที่เมนู “นำเข้าโมเดล BIM (IFC)”'}</small></div>
  {!s.converted&&<div className="actions"><button className="primary" disabled={readOnly||!!blocker} title={blocker||undefined} onClick={()=>setOpen(true)}>แปลงเป็นข้อมูลกรอก</button></div>}
  {open&&<ConvertDialog member={m} spec={spec} onClose={()=>setOpen(false)} onApply={next=>{setOpen(false);onConvert(next);}}/>}
 </div>;
}

function ConvertDialog({member,spec,onClose,onApply}:{member:Member;spec:Spec;onClose:()=>void;onApply:(m:Member)=>void}){
 const plan=useMemo(()=>ifcConvertPlan(member,spec),[member,spec]);
 const [keys,setKeys]=useState(()=>new Set(plan.rows.filter(r=>r.state!=='keep').map(r=>r.key)));
 const result=useMemo(()=>plan.input?applyIfcConvert(member,plan,keys,spec):null,[plan,keys]);
 const diff=result&&plan.before>0?(result.after-plan.before)/plan.before*100:0;
 return <Modal title={`แปลงเหล็ก IFC เป็นข้อมูลกรอก · ${member.code}`} onClose={onClose}>
  <p className="muted">แอปอ่านเหล็กจาก IFC แล้วจัดเป็นชุดเหล็กของฐานราก · ติ๊กออกได้ (ชุดที่ไม่ติ๊กเก็บเป็นเหล็ก IFC) · หลังแปลงแก้ขนาด / ระยะในแท็บข้อมูลได้ เหล็กคำนวณใหม่ตาม Spec</p>
  {plan.problems.length>0&&<div className="notice danger">{plan.problems.join(' · ')}</div>}
  {plan.rows.length>0&&<div className="table-scroll"><table><thead><tr><th/><th>ชุดเหล็ก</th><th>จาก IFC</th><th>เป็นข้อมูลกรอก</th><th/></tr></thead><tbody>
   {plan.rows.map(r=><tr key={r.key}><td>{r.state!=='keep'&&<input type="checkbox" aria-label={r.label} checked={keys.has(r.key)} onChange={e=>setKeys(k=>{const n=new Set(k);if(e.target.checked)n.add(r.key);else n.delete(r.key);return n;})}/>}</td>
    <td><b>{r.label}</b></td><td>{r.from}</td><td>{r.to}{r.note&&<><br/><small className="muted">{r.note}</small></>}</td>
    <td><span className={`badge ${r.state==='ok'?'success':r.state==='warn'?'warning':''}`}>{r.state==='ok'?'ตรง':r.state==='warn'?'ตรวจ':'คงไว้'}</span></td></tr>)}
  </tbody></table></div>}
  {result&&<div className={`notice ${Math.abs(diff)<=3?'success':'warning'}`}>น้ำหนักเหล็ก ก่อน <b>{number(plan.before,0)} kg</b> · หลังแปลง <b>{number(result.after,0)} kg</b> ({diff>=0?'+':''}{number(diff,1)}%)
   {Math.abs(diff)>3&&' · ต่างเกิน 3% ตรวจระยะเรียง / ขา / ตำแหน่งต่อทาบ ก่อนใช้'}</div>}
  {result&&result.problems.length>0&&<div className="notice danger"><b>ตรวจไม่ผ่าน</b> {result.problems.slice(0,4).join(' · ')} · ติ๊กชุดที่เกี่ยวข้องออก หรือแก้หลังแปลง</div>}
  {result&&result.warnings.length>0&&<ul className="ifc-notes">{result.warnings.slice(0,6).map(w=><li key={w}>{w}</li>)}</ul>}
  <footer className="actions"><button onClick={onClose}>ยกเลิก</button>
   <button className="primary" disabled={!result||!!result.problems.length||!keys.size} onClick={()=>result&&onApply(result.member)}>แปลง {keys.size} ชุด (เก็บข้อมูล IFC ไว้)</button></footer>
 </Modal>;
}
