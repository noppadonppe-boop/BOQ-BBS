import type {Spec} from '../domain/model';
import type {schedule} from '../domain/engine';
import {bsToleranceReference} from '../domain/bsTolerances';

const fmt=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:3});
export function BSTolerances({spec,row}:{spec:Spec;row:ReturnType<typeof schedule>[number]}){
 const reference=bsToleranceReference(spec,row);if(!reference)return null;
 const rows=[...(reference.cut?[{label:'ยาวตัด',free:false,...reference.cut}]:[]),...reference.dimensions];
 return <details className="bs-tolerances"><summary>ค่าคลาดเคลื่อนอ้างอิง BS Table 4 · {row.mark}</summary>
  <p className="muted">ข้อ 9 / หน้า 13 · ตัด +25/−25 mm · ดัด +5 mm และขอบล่างตามขนาดมิติ · ไม่บวกค่าเผื่อกับ BOQ หรือยาวตัด</p>
  <div className="table-scroll"><table><thead><tr><th>รายการ</th><th>กำหนด mm</th><th>ค่าคลาดเคลื่อน mm</th><th>ช่วงอ้างอิง mm</th></tr></thead><tbody>{rows.map(r=><tr key={r.label}><td>{r.free?'('+r.label+')':r.label}{r.free?' · มิติอิสระ':''}</td><td>{fmt(r.nominal)}</td><td>+{r.plus} / −{r.minus}</td><td>{fmt(r.lower)} ถึง {fmt(r.upper)}</td></tr>)}</tbody></table></div>
  <p className="muted scroll-hint">เลื่อนตารางแนวนอนเพื่อดูช่วงอ้างอิงครบ</p>
  {reference.notes.map(note=><p className="muted" key={note}>{note}</p>)}
 </details>;
}
