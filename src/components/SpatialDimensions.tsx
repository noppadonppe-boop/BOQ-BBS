import {useState} from 'react';
import type {Bar,Member,Vec3} from '../domain/model';
import {spatialBar} from '../domain/spatialBar';
import {dimensionText,SpatialDimension,spatialDimensionsSchema} from '../domain/spatialDimensions';
import {dimensionProjection,DimensionView,dimensionViewNames} from '../domain/dimensionProjection';

export function MeasurementSketch({member,bar,part=0,view}:{member:Member;bar:Bar;part?:number;view?:DimensionView}){
 const e=dimensionProjection(member,bar,part,6,view);if(!e.available)return <p className="notice warning">{e.reason}</p>;
 const {s}=e;return <svg viewBox="0 0 760 440" role="img" aria-label="มิติอ้างอิงสามมิติพร้อมจุดต้นปลาย">
 {[...s.edges,...s.caps].map((ps,i)=><polyline key={i} points={ps.map(p=>p.join(',')).join(' ')} fill="none" stroke="#217b64"/>)}
 {e.centerlineOnly&&<polyline points={s.centerline.map(p=>p.join(',')).join(' ')} fill="none" stroke="#217b64" strokeWidth="1.5"/>}
 {s.axes.filter(a=>Math.hypot(a.to[0]-a.from[0],a.to[1]-a.from[1])>1).map(a=><g key={a.label}><line x1={a.from[0]} y1={a.from[1]} x2={a.to[0]} y2={a.to[1]} stroke="#4574a5"/><text x={a.to[0]} y={a.to[1]-4} fontSize="12">+{a.label}</text></g>)}
 {e.dimensions.map((d,i)=>{const mid=d.from.map((v,k)=>(v+d.witness[k])/2),y=28+i*24;return <g key={d.label}>
 <line x1={d.from[0]} y1={d.from[1]} x2={d.witness[0]} y2={d.witness[1]} stroke="#ad641b" strokeWidth="1.5"/>
 <line x1={d.witness[0]} y1={d.witness[1]} x2={d.to[0]} y2={d.to[1]} stroke="#ad641b" strokeDasharray="4 3"/>
 {[d.from,d.to].map((p,k)=><circle key={k} cx={p[0]} cy={p[1]} r="3" fill="#ad641b"/>)}
 <line x1={mid[0]} y1={mid[1]} x2="540" y2={y-4} stroke="#c39564" strokeWidth=".7"/>
 <rect x="534" y={y-16} width="216" height="21" fill="white"/><text x="540" y={y} fontSize="12" fill="#895213">{d.text} mm · {d.axis==='distance'?'3D':d.axis}{d.status==='VISIBLE'?'':` · ${d.status}`}</text>
 {[d.from,d.to].map((p,k)=><g key={k}><line x1={p[0]} y1={p[1]} x2="534" y2={205+i*32+k*13} stroke="#c39564" strokeWidth=".5" strokeDasharray="2 3"/><rect x="534" y={196+i*32+k*13} width="216" height="13" fill="white"/><text x="540" y={208+i*32+k*13} fontSize="11">{d.label}{k+1} {k?'ปลาย':'ต้น'}{d.endpointOverlap?' · จุดซ้อนในภาพ':''}</text></g>)}
 </g>;})}<text x="20" y="425" fontSize="11">{e.view==='isometric'?'Isometric view':e.view+' / CENTERLINE PROJECTION ONLY'} / outside proposal UNVERIFIED / NTS</text></svg>;
}
export function SpatialDimensions({member,bar,onChange}:{member:Member;bar:Bar;onChange?:(b:Bar)=>void}){
 const [part,setPart]=useState(0),[inspectionView,setInspectionView]=useState<DimensionView|undefined>(),e=spatialBar(member,bar);if(!e.available)return null;
 const ds=bar.spatialDimensions||[],validation=spatialDimensionsSchema.safeParse(ds);
 const update=(next:SpatialDimension[])=>onChange?.({...bar,spatialDimensions:next,bsDimensionsConfirmed:false,placementConfirmed:false});
 const patch=(index:number,next:Partial<SpatialDimension>)=>update(ds.map((d,i)=>i===index?{...d,...next}:next.free?{...d,free:false}:d));
 const choices=[...e.detail.points.map((point,i)=>({label:'P'+String(i).padStart(2,'0')+' · แนวศูนย์กลาง',point})),...e.bends.flatMap(b=>[{label:b.label+' · จุดสัมผัสเข้า',point:b.incoming},{label:b.label+' · จุดสัมผัสออก',point:b.outgoing}])];
 return <section className="spatial-dimensions"><h4>มิติอ้างอิงสามมิติ · ระบุจุดและแนววัด</h4>
 <p className="muted">พิกัดสมาชิก mm · วัดตาม X/Y/Z หรือระยะตรง 3D · จุดที่กรอกเองไม่ผ่านการตรวจว่าอยู่บนผิวนอก · ค่ามิติไม่เปลี่ยนความยาวตัด</p>
 <label className="field"><span>มุมมองเทียบแบบต้นทาง</span><select value={onChange?bar.dimensionView||'isometric':inspectionView||bar.dimensionView||'isometric'} onChange={v=>{const view=v.target.value as DimensionView;if(onChange)onChange({...bar,dimensionView:view,bsDimensionsConfirmed:false,placementConfirmed:false});else setInspectionView(view);}}>{Object.entries(dimensionViewNames).map(([key,name])=><option value={key} key={key}>{name}</option>)}</select></label>
 <p className="muted">XY/XZ/YZ แสดงแนวศูนย์กลางเพื่อเทียบพิกัด · ไม่ใช่มิติผิวนอกหรือชุดภาพ first-angle · ระยะในตารางคำนวณจากพิกัดจริง ไม่วัดจากภาพ</p>
 {!!ds.length&&<><MeasurementSketch member={member} bar={bar} view={onChange?undefined:inspectionView} part={Math.min(part,Math.ceil(ds.length/6)-1)}/>{ds.length>6&&<div className="actions">{Array.from({length:Math.ceil(ds.length/6)},(_,i)=><button type="button" key={i} onClick={()=>setPart(i)}>มิติชุด {i+1}</button>)}</div>}{(()=>{const p=dimensionProjection(member,bar,0,12,onChange?undefined:inspectionView);return p.available&&p.dimensions.some(d=>d.status!=='VISIBLE'||d.endpointOverlap)?<p role="status" className="notice warning">{p.dimensions.filter(d=>d.status!=='VISIBLE'||d.endpointOverlap).map(d=>`${d.label}: ${d.status==='EDGE-ON'?'แนวมิติอยู่ตรงแนวมอง ไม่เห็นระยะในภาพ':d.status==='FORESHORTENED'?'ระยะในภาพสั้นมาก':'จุดต้น–ปลายซ้อนในภาพ'}`).join(' · ')} · เปลี่ยนมุมมองและตรวจตาราง XYZ ก่อนยืนยัน</p>:null;})()}</>}
 {!validation.success&&<p role="alert" className="notice danger">{validation.error.issues.map(i=>i.message).join(' / ')}</p>}
 {ds.map((d,index)=><details className="measurement-card" key={index} open={onChange?undefined:true}><summary>{dimensionText(d)} mm · {d.axis==='distance'?'ระยะตรง 3D':d.axis} · {d.purpose==='outside-proposed'?'ผิวนอกเสนอ / UNVERIFIED':'อ้างอิง'}{d.free?' · มิติอิสระเสนอ':''}</summary>{onChange?<div className="measurement-fields">
 <label className="field"><span>ชื่อมิติ {index+1}</span><select value={d.label} onChange={v=>patch(index,{label:v.target.value})}>{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c=><option key={c}>{c}</option>)}</select></label>
 <label className="field"><span>แนววัด {index+1}</span><select value={d.axis} onChange={v=>patch(index,{axis:v.target.value as SpatialDimension['axis']})}><option value="distance">ระยะตรง 3D</option>{['X','Y','Z'].map(c=><option key={c}>{c}</option>)}</select></label>
 <label className="field"><span>ประเภทมิติ {index+1}</span><select value={d.purpose} onChange={v=>patch(index,{purpose:v.target.value as SpatialDimension['purpose']})}><option value="reference">มิติอ้างอิง</option><option value="outside-proposed">มิติผิวนอกที่เสนอ (รอตรวจ)</option></select></label>
 {(['from','to'] as const).map((key,k)=><fieldset key={key}><legend>จุด{k?'ปลาย':'ต้น'}</legend><label className="field"><span>เลือกจุด{k?'ปลาย':'ต้น'} {index+1}</span><select value="" onChange={v=>{if(v.target.value)patch(index,{[key]:choices[Number(v.target.value)-1].point});}}><option value="">ระบุพิกัด / เลือกจาก geometry</option>{choices.map((c,i)=><option key={i} value={i+1}>{c.label}</option>)}</select></label>{d[key].map((n,axis)=><label className="field" key={axis}><span>{key==='from'?'ต้น':'ปลาย'} {'XYZ'[axis]} {index+1}</span><input type="number" value={n} onChange={v=>patch(index,{[key]:d[key].map((x,i)=>i===axis?Number(v.target.value):x) as Vec3})}/></label>)}</fieldset>)}
 <label className="field measurement-source"><span>ที่มา / แบบ / หน้า / จุดอ้างอิง {index+1}</span><input maxLength={300} value={d.source} onChange={v=>patch(index,{source:v.target.value})}/></label>
 <label className="check"><input type="checkbox" checked={d.free} onChange={v=>patch(index,{free:v.target.checked})}/>เลือกเป็นมิติอิสระเสนอ {index+1} (ยังไม่ชดเชย tolerance)</label>
 <button type="button" onClick={()=>update(ds.filter((_,i)=>i!==index))}>ลบมิติ {d.label}</button></div>:<p>ต้น [{d.from.join(', ')}] → ปลาย [{d.to.join(', ')}] · ที่มา: {d.source||'ไม่ระบุ'}</p>}</details>)}
 {onChange&&<button type="button" disabled={ds.length>=12} onClick={()=>{const label='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c=>!ds.some(d=>d.label===c))!;update([...ds,{label,from:[...e.detail.points[0]],to:[...e.detail.points[1]],axis:'distance',purpose:'reference',source:'',free:false}]);}}>เพิ่มมิติสามมิติ</button>}
 <p className="notice warning">มิติทั้งหมดเป็นข้อมูลเสนอเพื่อตรวจเทียบแบบ · ผิวนอกและมิติอิสระ BS ข้อ 8.5 ยัง PENDING · การเลือกวงเล็บไม่ถือเป็นการอนุมัติผลิต</p>
 </section>;
}
