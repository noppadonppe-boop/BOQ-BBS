import type {Spec} from '../domain/model';
import {FLAT_END_COVER_POLICY} from '../domain/flatEndCover';
import {BEND_COVER_POLICY} from '../domain/bendCover';
// Cover check policy of the spec (General Spec). Saving the profile runs the existing spec-change job for the linked
// projects (before / after record); nothing changes in place for stored specs or Frozen revisions.
export function FlatEndCoverPolicy({spec,disabled,onChange}:{spec:Spec;disabled:boolean;onChange:(s:Spec)=>void}){
 const set=(v:string)=>{const {rebarCoverPolicy:_old,...legacy}=spec;onChange(v===FLAT_END_COVER_POLICY||v===BEND_COVER_POLICY?{...legacy,rebarCoverPolicy:v}:legacy);};
 return <section className="bar-placement-policy"><h3>ระยะหุ้มเหล็ก (วิธีตรวจ)</h3>
  {!spec.rebarCoverPolicy&&<p className="notice warning" role="note">มีวิธีตรวจใหม่ให้รับ: <b>ส่วนดัดโค้ง · คลาดได้ ≤ 0.001 mm</b> ({BEND_COVER_POLICY}) — ปลอก / เหล็กรัดขอ 135° ที่วางชิดระยะหุ้มพอดี (เช่น RB6 / RB9) ตรวจผ่านตามจริง
   ไม่ใช่ตกเพราะเศษปัดเลขทศนิยม · ไม่เปลี่ยนยาวตัด น้ำหนัก จำนวน หรือแบบ · เลือกแล้วบันทึก Spec จะอัปเดตโครงการที่ผูกผ่านงานเปลี่ยน Spec (มีบันทึกก่อน / หลัง) · Frozen เดิมคงผลเดิม
   {!disabled&&<button type="button" onClick={()=>set(BEND_COVER_POLICY)}>รับวิธีตรวจใหม่</button>}</p>}
  <label className="field"><span>วิธีตรวจระยะหุ้ม</span><select aria-label="วิธีตรวจระยะหุ้ม" disabled={disabled} value={spec.rebarCoverPolicy||''} onChange={e=>set(e.target.value)}>
   <option value="">วิธีเดิม · เผื่อรัศมีที่ปลายด้วย (คลาดได้ 0.0001 mm)</option>
   <option value={BEND_COVER_POLICY}>ส่วนดัดโค้งคลาดได้ ≤ 0.001 mm (แนะนำ · ค่าเริ่มต้นโครงการใหม่)</option>
   <option value={FLAT_END_COVER_POLICY}>ปลายตัดเรียบ · ตรวจผิวและทิศของปลาย</option></select></label>
  <p className="muted">วิธีเดิม / ส่วนดัดโค้ง: ตรวจแนวศูนย์กลางเหล็กที่ดัดโค้งตามรัศมีแล้ว ห่างผิวคอนกรีต ≥ cover + รัศมีเหล็ก · ส่วนดัดโค้งยอมให้ขาดได้ไม่เกิน 0.001 mm (เศษปัดพิกัด 3 ตำแหน่ง) เฉพาะเส้นที่มีส่วนดัด เหล็กตรงใช้วิธีเดิม ·
   ปลายตัดเรียบ: ปลายตรงที่ยาวพอใช้หน้าตัดตั้งฉากกับแนวเหล็ก รัศมีด้านข้างยังต้องมี cover ครบ ส่วนโค้งใช้ขอบเขตเผื่อความคลาดเคลื่อนจากจุดตัวอย่าง (เหล็กที่ดัดชิดระยะหุ้มพอดีอาจตรวจไม่ผ่าน — ตรวจแยก) ·
   ไม่เปลี่ยนยาวตัด/น้ำหนักและไม่รับรอง BS/ACI · Frozen เดิมใช้วิธีเดิม</p></section>;
}
