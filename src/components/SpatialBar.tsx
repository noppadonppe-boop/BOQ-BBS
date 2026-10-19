import {SpatialDimensions} from './SpatialDimensions';
import {useState} from 'react';
import type {Bar,Member} from '../domain/model';
import {isSpatial,spatialBar,spatialSketch} from '../domain/spatialBar';
export function SpatialBarView({member,bar,onChange}:{member:Member;bar:Bar;onChange?:(b:Bar)=>void}){
 const [part,setPart]=useState(0);if(bar.shape==='helix'||bar.shapeCode.trim()!=='99'||!isSpatial(member,bar))return null;
 const e=spatialBar(member,bar);
 return <details open className="envelope-view spatial-view"><summary>หลายระนาบ · Isometric view · BS 8666:2000 ข้อ 8.8</summary>{e.available?(()=>{const s=spatialSketch(e,Math.min(part,Math.ceil(e.detail.legs.length/6)-1));return <>
 <svg viewBox={`0 0 ${s.width} ${s.height}`} role="img" aria-label="Code 99 Isometric view พิกัดและจุดดัดหลายระนาบ">
 {[...s.edges,...s.caps].map((p,i)=><polyline key={i} points={p.map(p=>p.join(',')).join(' ')} fill="none" stroke="#217b64" strokeWidth="1.2"/>)}
 <polyline points={s.centerline.map(p=>p.join(',')).join(' ')} fill="none" stroke="#92aaa2" strokeDasharray="3 3" strokeWidth=".5"/>
 <polyline points={s.virtual.map(p=>p.join(',')).join(' ')} fill="none" stroke="#bdc8c4" strokeDasharray="6 5" strokeWidth=".5"/>
 {s.labels.map(l=><g key={l.text}><line x1={l.anchor[0]} y1={l.anchor[1]} x2={l.at[0]} y2={l.at[1]} stroke="#8da19c" strokeWidth=".6"/><rect x={l.at[0]-16} y={l.at[1]-10} width="32" height="15" fill="white"/><text x={l.at[0]} y={l.at[1]} textAnchor="middle" fontSize="11" fill="#244f40">{l.text}</text></g>)}
 {s.axes.map(a=><g key={a.label}><line x1={a.from[0]} y1={a.from[1]} x2={a.to[0]} y2={a.to[1]} stroke="#4574a5"/><text x={a.to[0]} y={a.to[1]-3} fontSize="11">{a.label}</text></g>)}
 <text x="20" y="22" fontSize="12">Isometric view / NTS / outside bending dimensions PENDING</text>
 </svg>{s.total>1&&<div className="actions">{Array.from({length:s.total},(_,i)=><button key={i} type="button" onClick={()=>setPart(i)}>จุดกำกับชุด {i+1}/{s.total}</button>)}</div>}
 <div className="table-scroll"><table><thead><tr><th>ช่วง</th><th>แนวศูนย์กลางเสมือน mm</th><th>ตรงระหว่างจุดสัมผัส mm</th><th>ตัดส่วนโค้งต้น / ปลาย mm</th></tr></thead><tbody>{e.detail.legs.map(l=><tr key={l.label}><td>{l.label}{e.selectedLeg===l.label?' · เลือกอ้างอิง':''}</td><td>{Number(l.virtualLength.toFixed(3))}</td><td>{Number(l.straightLength.toFixed(3))}</td><td>{Number(l.trimStart.toFixed(3))} / {Number(l.trimEnd.toFixed(3))}</td></tr>)}</tbody></table></div>
 <p>รัศมีด้านใน {e.innerRadius} / ศูนย์กลาง {bar.radius} mm · เลือกช่วง {e.selectedLeg||'ยังไม่เลือก'} · มิติอิสระผิวนอก: PENDING</p><p className="notice warning">{e.warnings.join(' · ')}</p></>;})():<p className="notice warning">{e.reason}</p>}<SpatialDimensions member={member} bar={bar} onChange={onChange}/><p className="muted">จุด P = จุดตัดแนวศูนย์กลาง · จุด B = โค้งดัด · แบบส่งออกมีพิกัดจุดสัมผัสเข้า/ออกและเวกเตอร์ตั้งฉากระนาบดัด · Draft รอตรวจวิศวกรรม</p></details>;
}
