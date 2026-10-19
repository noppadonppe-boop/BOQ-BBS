import type {Member,Spec,Attachment} from '../domain/model';
import {takeoff} from '../domain/engine';
import {quantityBasisState,quantityComponentReady} from '../domain/quantityBasis';
import {steelCoverage} from '../domain/reinforcementCoverage';
import {FoundationEarthworkSummary} from './FoundationEarthwork';
import {number} from './EditorControls';

export function MemberQuantityReport({member:m,spec,attachments}:{member:Member;spec:Spec;attachments:Attachment[]}){
 const q=takeoff(m,spec),provisional=quantityBasisState(m)==='Provisional',countPending=!quantityComponentReady(m,'count'),steel=steelCoverage(m,{project:{spec},attachments}),keys=(['concrete','formwork','excavation','backfill','lean','rebar'] as const).filter(k=>m.category==='Foundation'||!['excavation','backfill','lean'].includes(k));
 const names={concrete:'คอนกรีต',formwork:'แบบหล่อ',excavation:'ขุดดิน',backfill:'ดินถมกลับ',lean:'คอนกรีตหยาบ',rebar:'เหล็กจาก BBS'};
 return <section className="panel padded member-quantity-report" data-member-quantity-report><h3>ปริมาณต่อชิ้นและรวม</h3><p>จำนวนองค์ประกอบ {countPending?'รอยืนยัน · ที่กรอก ':''}{number(q.quantity,0)}{countPending?' (ชั่วคราว)':''}</p>{provisional&&<p className="notice warning">ยังมีรายการ input ที่รอยืนยัน แสดงยอดเฉพาะรายการที่ตรวจแล้ว ตัวเลขประกอบของรายการอื่นเป็นค่าคำนวณชั่วคราวจาก input ปัจจุบัน</p>}
 <div className="table-scroll"><table><thead><tr><th>รายการ</th><th className="num">ต่อชิ้น</th><th className="num">รวมองค์ประกอบ</th><th>ที่มา</th></tr></thead><tbody>{keys.map(k=>{const inputPending=!quantityComponentReady(m,k),pending=inputPending||k==='rebar'&&!steel.complete,unit=k==='rebar'?'kg':k==='formwork'?'m²':'m³';return <tr key={k} data-member-quantity={k}><td>{names[k]} {unit}</td><td className="num">{pending?<><b>{inputPending?'รอยืนยัน':'รอ BBS'}</b><small className="block">{inputPending?'ชั่วคราว':'ที่กรอก'} {number(q[k])}</small></>:number(q[k])}</td><td className="num">{pending?<><b>{inputPending?'รอยืนยัน':'รอ BBS'}</b><small className="block">{inputPending?'ชั่วคราว':'บางส่วน'} {number(q[k]*q.quantity)}</small></>:number(q[k]*q.quantity)}</td><td>{(q.formulas as Record<string,string>)[k]||'L × W × t / 10⁹'}</td></tr>;})}</tbody></table></div><p className="muted">ผิวแบบหล่อและรายการหักกำหนดในมิติสมาชิก · การยืนยัน input แยกจากการตรวจรับวิศวกรรม</p>{provisional&&m.category==='Foundation'&&<p className="notice">รายละเอียดงานดิน/Lean ด้านล่างเป็นค่าประกอบชั่วคราวจาก input ปัจจุบัน</p>}<FoundationEarthworkSummary member={m} spec={spec}/><p>{spec.measurementNotes}</p>
 </section>;
}
