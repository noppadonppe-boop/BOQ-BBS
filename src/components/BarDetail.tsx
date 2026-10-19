import {BarPlacementSummary} from './BarPlacements';
import {PlanarPathInputView} from './PlanarPathInputView';
import {HelixView} from './HelixView';
import {SpatialBarView} from './SpatialBar';
import {TangentBarView} from './TangentBar';
import {Member,Bar,Spec} from '../domain/model';
import {GeneralBarView} from './GeneralBar';
import {BarEnvelopeView} from './BarEnvelope';
import {BarStandard} from './BarStandard';
import {schedule} from '../domain/engine';
import {barDetail,detailParts,shapeSketch,BarDetail as Detail,DetailPart} from '../domain/barDetails';
const fmt=(v:number)=>v.toLocaleString('en-US',{maximumFractionDigits:3});
export function DetailSketch({detail,part}:{detail:Detail;part:DetailPart}){
 const s=shapeSketch(detail,430,185,part);return <svg className="detail-sketch" viewBox="0 0 430 185" role="img" aria-label={s.planar?'รูปดัดแนวศูนย์กลางในระนาบ':'รูปดัดหลายระนาบพร้อมตารางพิกัด'}>
  { !detail.curveFrame&&!detail.helixFrame&&<polyline points={s.virtual.map(p=>p.join(',')).join(' ')} fill="none" stroke="#aab9bb" strokeWidth="1" strokeDasharray="4 3"/>}
  <polyline points={s.path.map(p=>p.join(',')).join(' ')} fill="none" stroke="#217b64" strokeWidth="2.2"/>
  {s.labels.map(l=><g key={l.kind+l.text}><line x1={l.anchor[0]} y1={l.anchor[1]} x2={l.x} y2={l.y} stroke="#8b9da3" strokeWidth=".8"/><rect x={l.x-19} y={l.y-8} width="38" height="16" rx="3" fill={l.kind==='leg'?'#f3f7f5':'#e9f0fa'}/><text x={l.x} y={l.y+4} textAnchor="middle" fill={l.kind==='leg'?'#25624e':'#315c89'} fontSize="11">{l.text}</text></g>)}
 </svg>;
}
export function BarDetails({member,bar,spec}:{member:Member;bar:Bar;spec:Spec}){
 const d=barDetail(member,bar),row=schedule(member,spec).find(r=>r.id===bar.id)!,qty=member.occurrences.reduce((n,o)=>n+o.quantity,0);
 return <section className="panel padded bar-detail"><div className="section-heading"><h3>รายละเอียดรูปดัด · {bar.mark}</h3><span className="badge">มิติ mm / มุม °</span></div><p className="muted">{bar.shape==='helix'?'H01 = เกลียวต่อเนื่องหนึ่งเส้น · P1/P2/P3 = ต้น/กลาง/ปลายจริง ไม่ใช่มุมดัด · C เป็นจำนวนรอบ':bar.shape==='arc'?'C01 = ส่วนโค้งต่อเนื่องหนึ่งส่วน · พิกัด P1/P2/P3 = ต้น/กลาง/ปลายส่วนโค้ง ไม่ใช่จุดดัด · R ในรูป 67 คือด้านใน':'L = ระยะระหว่างจุดตัดเสมือนของแนวศูนย์กลาง · เส้นประ = แนวหักมุมก่อนใช้รัศมี · R = รัศมีศูนย์กลางดัด · พิกัดสมาชิกของเหล็กเส้นแรก'}</p>
 <div className="detail-basis"><span>Ø{bar.diameter} / {bar.grade} · {bar.count} ต่อชิ้น / {bar.count*qty} รวม</span><b>ยาวตัด {fmt(row.cutLength)} mm</b><span>{bar.cutOverride>0?'ระบุยาวตัดเอง':'ปัดความยาวขึ้นทีละ '+fmt(spec.rounding)+' mm'}</span><span>{['arc','helix'].includes(bar.shape)?'R ศูนย์กลาง':'R'} = {fmt(bar.radius)} mm</span></div><PlanarPathInputView bar={bar}/><BarPlacementSummary member={member} bar={bar}/><BarStandard member={member} bar={bar} spec={spec}/><HelixView bar={bar}/><BarEnvelopeView member={member} bar={bar} spec={spec}/><GeneralBarView member={member} bar={bar}/><TangentBarView member={member} bar={bar}/><SpatialBarView member={member} bar={bar}/>
 {detailParts(d).map(part=><div key={part.part} className="detail-part"><div className="detail-visual"><DetailSketch detail={d} part={part}/><small>{shapeSketch(d,430,185,part).planar?'รูปในระนาบ / NTS':'รูปหลายระนาบ / NTS - ใช้พิกัดตรวจร่วมกัน'} · ส่วน {part.part}/{part.total}</small></div><div className="detail-tables">{!d.curveFrame&&!d.helixFrame&&<div className="table-scroll"><table><thead><tr><th>ช่วง</th><th>จุด</th><th>ระหว่างจุด mm</th><th>ตรงถึงจุดสัมผัส mm</th></tr></thead><tbody>{part.legs.map(l=><tr key={l.label}><td>{l.label}</td><td>P{l.from+1} → P{l.to+1}</td><td>{fmt(l.virtualLength)}</td><td>{fmt(l.straightLength)}</td></tr>)}</tbody></table></div>}{part.bends.length>0&&<p className="bend-values">{part.bends.map(b=>d.helixFrame?`${b.label}: ${d.helixFrame.turns} รอบ / ยาวจริง ${fmt(b.arc)} mm`:d.curveFrame?`${b.label}: มุมกวาด ${fmt(b.angle)}° / ส่วนโค้ง ${fmt(b.arc)} mm`:`${b.label} @ P${b.point+1}: ${fmt(b.angle)}° / arc ${fmt(b.arc)} mm`).join(' · ')}</p>}{part.references.length>0&&<p className="reference-values">มิติจากแบบ (อ้างอิง): {part.references.map(r=>`${r.label} = ${fmt(r.value)} mm`).join(' · ')}<small className="block">เก็บแยกจาก geometry และไม่ใช้แทนสูตรความยาวตัด</small></p>}<details><summary>{d.helixFrame?'พิกัดต้น/กลาง/ปลายและแกนเกลียว':d.curveFrame?'พิกัดต้น/กลาง/ปลายและระนาบส่วนโค้ง':'พิกัดจุดและระนาบดัด'}</summary><table><thead><tr><th>จุด</th><th>X</th><th>Y</th><th>Z</th></tr></thead><tbody>{(d.curveFrame||d.helixFrame?d.points.map((_,i)=>i):[...new Set(part.legs.flatMap(l=>[l.from,l.to]))]).map(i=><tr key={i}><td>P{i+1}</td>{d.points[i].map((n,k)=><td key={k}>{fmt(n)}</td>)}</tr>)}</tbody></table>{part.bends.map(b=><p key={b.label}>{b.label}: {d.helixFrame?'axis':'normal'} = [{b.normal.map(fmt).join(', ')}]</p>)}</details></div></div>)}
 <p className="detail-equation">ช่วงตรง {fmt(d.straightSum)} + ส่วนโค้ง {fmt(d.arcSum)} = แนวศูนย์กลาง {fmt(d.geometricLength)} mm{bar.cutOverride>0?` · ใช้ค่าระบุเอง ${fmt(bar.cutOverride)} mm`:''}</p><p className="muted">{bar.note||'ยังต้องตรวจรูปดัด ขอ รัศมี และข้อกำหนดโครงการก่อนใช้ผลิต'} · รอตรวจ BS 8666 / ACI 318</p>
 </section>;
}
