import {useState,useEffect} from 'react';
import type {Member} from '../domain/model';
import {steelCoverageLabels,type SteelCoverage} from '../domain/reinforcementCoverage';

export function ReinforcementScopeEditor({member,coverage,readOnly,onChange}:{member:Member;coverage:SteelCoverage;readOnly:boolean;onChange:(m:Member)=>void}){
 const [open,setOpen]=useState(false),[basis,setBasis]=useState(member.noRebar?.basis||'');
 useEffect(()=>{setBasis(member.noRebar?.basis||'');},[member.noRebar?.basis]);
 const allowed=!member.bars.length&&!member.sourceSchedule;
 return <section className="panel padded steel-scope" aria-label="ขอบเขตเหล็กเสริม"><h3>ขอบเขตเหล็กเสริม · {steelCoverageLabels[coverage.state]}</h3>
  {!coverage.complete&&<p role="status" className="notice warning">{coverage.reasons[0]} · ปริมาณและราคาเฉพาะที่กรอกยังไม่ใช่ยอดครบขอบเขต</p>}
  {member.noRebar&&<><p>ที่มาขอบเขต: {member.noRebar.basis}</p><button type="button" disabled={readOnly} onClick={()=>{const next={...member};delete next.noRebar;onChange(next);setOpen(false);}}>ยกเลิกขอบเขตไม่มีเหล็ก</button></>}
  {allowed&&!member.noRebar&&<><p className="muted">ถ้ายังต้องถอดเหล็ก ให้เพิ่ม BBS จากแบบ หากขอบเขตนี้ไม่มีเหล็กเสริม ให้ระบุเหตุผลและที่มาโดยชัดแจ้ง ไม่ใช้ช่องว่างแทนศูนย์</p><button type="button" disabled={readOnly} onClick={()=>setOpen(v=>!v)}>ระบุขอบเขตที่ไม่มีเหล็กเสริม</button></>}
  {open&&allowed&&!member.noRebar&&<div className="steel-zero-form"><label className="field"><span>เหตุผลและที่มาของขอบเขตไม่มีเหล็ก</span><textarea aria-label="เหตุผลและที่มาของขอบเขตไม่มีเหล็ก" maxLength={500} rows={3} disabled={readOnly} value={basis} onChange={e=>setBasis(e.target.value)}/></label><p className="muted">เป็นข้อมูลขอบเขตงานที่ผู้ใช้ระบุ ไม่ใช่การอนุมัติทางวิศวกรรม การเปลี่ยนมิติ/ตำแหน่ง/แบบหรือคัดลอกสมาชิกให้ตรวจขอบเขตใหม่</p><button type="button" disabled={readOnly||!basis.trim()} onClick={()=>{onChange({...member,noRebar:{version:1,basis:basis.trim()}});setOpen(false);}}>ใช้ขอบเขตไม่มีเหล็กเสริม</button></div>}
 </section>;
}

export function ReinforcementCoverageNotice({members,purpose='boq'}:{members:SteelCoverage[];purpose?:'boq'|'cutting'}){
 const pending=members.filter(m=>!m.complete),[page,setPage]=useState(0),pages=Math.max(1,Math.ceil(pending.length/20)),current=Math.min(page,pages-1);
 if(!members.length)return null;
 if(!pending.length)return <p className="muted" data-steel-coverage="entered">ปริมาณเหล็กอ้าง BBS ที่กรอก หรือขอบเขตไม่มีเหล็กที่ระบุ · ความครบข้อมูลไม่ใช่การอนุมัติรูปดัด/ตำแหน่ง/วิศวกรรม</p>;
 return <section aria-label="ตรวจความครบปริมาณเหล็ก" className="notice warning" data-steel-coverage="pending"><p role="status"><strong>รอปริมาณเหล็ก {pending.length} สมาชิก</strong> · {purpose==='cutting'?'เป็นแผนจากชิ้นงานที่กรอก ยังไม่ใช่ความต้องการครบขอบเขต จองสต็อกเมื่อข้อมูลครบ':'ยอดเหล็กและราคาเฉพาะที่กรอกเป็นยอดบางส่วน ไม่ถือว่าปริมาณที่ขาดเป็นศูนย์'}</p><details><summary>ดูสมาชิกที่รอ BBS / ตรวจเทียบแบบ</summary><ul>{pending.slice(current*20,(current+1)*20).map(m=><li key={m.memberId}><strong>{m.memberCode} · {steelCoverageLabels[m.state]}</strong> — {m.reasons.slice(0,3).join(' / ')}{m.reasons.length>3?' · อีก '+(m.reasons.length-3)+' รายการ ให้เปิดตรวจเทียบ BBS จากแบบ':''}</li>)}</ul>{pages>1&&<div className="pagination"><span>หน้า {current+1}/{pages}</span><div className="actions"><button type="button" disabled={!current} onClick={()=>setPage(current-1)}>หน้าก่อนสมาชิกที่รอ BBS</button><button type="button" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>หน้าถัดไปสมาชิกที่รอ BBS</button></div></div>}</details></section>;
}
