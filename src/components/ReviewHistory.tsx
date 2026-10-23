import type {Member} from '../domain/model';
import {actionText,reviewPeople,revText,statusLabel} from '../domain/memberReview';

/** Review trail of one member: current drawn / checked / approved and every edit / review step, newest first. */
export function ReviewHistory({member}:{member:Member}){
 const log=[...(member.review?.log||[])].reverse(),people=reviewPeople(member);
 const when=(at:string)=>at.slice(0,16).replace('T',' ');
 return <details className="panel review-history"><summary>ประวัติการแก้ไขและการตรวจ · {log.length} รายการ</summary>
  <div className="review-current">{([['เขียนแบบ (Drawn)',people.drawn],['ตรวจ (Checked)',people.checked],['อนุมัติ (Approved)',people.approved]] as const).map(([l,p])=><div key={l}><small>{l}</small><b>{p?.name||'—'}</b>{p&&<small>{when(p.at)}</small>}</div>)}</div>
  {log.length?<div className="table-scroll"><table><thead><tr><th>วันเวลา</th><th>ผู้ดำเนินการ</th><th>รายการ</th><th>สถานะ</th><th>Revision</th><th>หมายเหตุ</th></tr></thead><tbody>
   {log.map((e,i)=><tr key={i}><td>{when(e.at)}</td><td>{e.name}</td><td>{actionText[e.action]}</td><td>{e.from?`${statusLabel(e.from as Member['status'])} → `:''}{statusLabel(e.to as Member['status'])}</td><td>{e.rev===null?'—':revText(e.rev)}</td><td>{e.note||''}</td></tr>)}
  </tbody></table></div>:<p className="muted">ยังไม่มีประวัติ · ระบบเริ่มบันทึกตั้งแต่การบันทึกหรือการตรวจครั้งถัดไป</p>}
 </details>;
}
