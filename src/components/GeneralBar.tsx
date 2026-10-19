import {useState} from 'react';
import type {Bar,Member} from '../domain/model';
import {generalBar,generalSketch} from '../domain/generalBar';
import {isSpatial} from '../domain/spatialBar';
import {hasAcuteBend} from '../domain/tangentBar';
export function GeneralBarView({member,bar,onChange}:{member:Member;bar:Bar;onChange?:(b:Bar)=>void}){
 const [part,setPart]=useState(0);if(bar.shapeCode.trim()!=='99')return null;
 const e=generalBar(member,bar),acute=hasAcuteBend(member,bar),chain=bar.pathInput?.basis==='support',spatial=isSpatial(member,bar),current=e.available?Math.min(part,Math.ceil(e.dimensions.length/6)-1):0;
 return <details className="envelope-view general-view" open><summary>{acute?'เลือกมิติอิสระของมุมแหลม · Figure 4':'รูปพิเศษ Code 99 · ผิวเหล็กสองเส้น'}</summary>
 {onChange&&<label className="field"><span>มิติอิสระของรูปพิเศษ Code 99</span><select aria-label="มิติอิสระของรูปพิเศษ Code 99" value={bar.freeDimensionLeg||''} onChange={v=>onChange({...bar,freeDimensionLeg:v.target.value?Number(v.target.value):undefined,bsDimensionsConfirmed:false,placementConfirmed:false})}><option value="">ยังไม่เลือก</option>{Array.from({length:Math.max(0,e.detail.legs.length)},(_,i)=><option value={i+1} key={i}>{acute&&!chain&&e.detail.legs.length===2?(i===0?'C (L01)':'A (L02)'):'L'+String(i+1).padStart(2,'0')+(spatial?' (อ้างอิง / รอมิติผิวนอก)':'')}</option>)}</select></label>}
 {e.available?(()=>{const s=generalSketch(e,current);return <><svg viewBox={`0 0 ${s.width} ${s.height}`} role="img" aria-label="Code 99 ผิวเหล็กสองเส้นและมิติจากจุดตัดผิวนอก">
 <polyline points={s.outline.map(p=>p.join(',')).join(' ')} fill="#eaf4ee" stroke="#217b64" strokeWidth="1.2"/>
 <polyline points={s.centerline.map(p=>p.join(',')).join(' ')} fill="none" stroke="#92aaa2" strokeDasharray="3 3" strokeWidth=".5"/>
 {s.dimensions.map(d=><g key={d.label}><line x1={d.from[0]} y1={d.from[1]} x2={d.a[0]} y2={d.a[1]} stroke="#8da19c" strokeWidth=".7"/><line x1={d.to[0]} y1={d.to[1]} x2={d.b[0]} y2={d.b[1]} stroke="#8da19c" strokeWidth=".7"/><line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke="#35584d" strokeWidth=".9"/><rect x={d.labelAt[0]-78} y={d.labelAt[1]-12} width="156" height="18" fill="white"/><text x={d.labelAt[0]} y={d.labelAt[1]} textAnchor="middle" fontSize="12" fill="#244f40">{d.text}</text></g>)}
 {s.vertices.map(v=><text key={v.label} x={v.at[0]+4} y={v.at[1]-5} fontSize="10" fill="#687d74">{v.label}</text>)}
 </svg>{s.total>1&&<div className="actions">{Array.from({length:s.total},(_,i)=><button type="button" className={i===current?'active':''} key={i} onClick={()=>setPart(i)}>มิติชุด {i+1}/{s.total}</button>)}</div>}
 <div className="table-scroll"><table><thead><tr><th>ช่วง / ผิวนอก mm</th><th>ช่วงตรง mm</th><th>มุมดัด / รัศมีด้านใน</th></tr></thead><tbody>{e.dimensions.map((d,i)=><tr key={d.label}><td>{d.free?'('+d.label+')':d.label} = {Number(d.value.toFixed(3))}</td><td>{Number(e.detail.legs[i].straightLength.toFixed(3))}</td><td>{e.angles[i+1]>1e-5?`${Number((e.angles[i+1]*180/Math.PI).toFixed(3))}° / r ${e.innerRadius} mm`:'—'}</td></tr>)}</tbody></table></div><p className="notice warning">{e.warnings.join(' · ')}</p></>;})():<p className="notice warning">{chain?'รูปจากฐานเส้นสัมผัสที่เลือกแสดงด้านล่าง · ยังรอตรวจมิติและแบบต้นทาง':e.reason}</p>}
 <p className="muted">{chain?'ดูมิติ L และเส้นสัมผัสแต่ละมุมแหลมด้านล่าง · ฐานที่เลือกยังรอตรวจแบบต้นทาง':acute?'Figure 4: ดูเส้นสัมผัสและมิติ A/B/C ด้านล่าง · ส่งออกด้วยปุ่มแบบเส้นสัมผัส A3/A1':'NTS · จุด P คือจุดตัดเส้นต่อแนวศูนย์กลาง · มิติ L วัดตามแนวช่วงจากจุดตัดเส้นต่อผิวนอก · วงเล็บ = มิติอิสระ · ยังไม่ปรับ tolerance หรือรับรองการผลิต'}</p></details>;
}
