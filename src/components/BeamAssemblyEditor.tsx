import {useState,useRef,useEffect} from 'react';
import type {Member} from '../domain/model';
import {assembleBeam,applyBeamAssembly,type BeamAssembly} from '../domain/beamAssembly';
import {Modal,Field,number} from './EditorControls';

export function BeamAssemblyPreview({assembly}:{assembly:BeamAssembly}){
 const svgRef=useRef<SVGSVGElement>(null),[width,setWidth]=useState(800);
 useEffect(()=>{const node=svgRef.current;if(!node)return;const update=()=>setWidth(Math.max(280,Math.min(800,node.getBoundingClientRect().width)));const observer=new ResizeObserver(update);observer.observe(node);update();return()=>observer.disconnect();},[assembly]);
 try{
  const b=assembleBeam(assembly),height=width<480?150:230,base=height-50,scale=Math.min((width-50)/b.stations.at(-1)!.to,(height-70)/b.bounds[2]),left=(width-b.stations.at(-1)!.to*scale)/2;
  return <svg ref={svgRef} className="beam-preview" style={{maxWidth:800,margin:'auto'}} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`แนวคาน ${assembly.axis} และระดับท้องคาน ${b.stations.length} ช่วง`}>
   {b.stations.map((s,i)=><g key={s.id}><rect x={left+s.from*scale} y={base-(s.soffit+s.depth)*scale} width={s.length*scale} height={s.depth*scale} fill={i%2?'#e2eee8':'#f0f5f2'} stroke="#4f8276"/>{s.length*scale>=22&&<text x={left+(s.from+s.length/2)*scale} y={height-31} textAnchor="middle">S{i+1}</text>}{s.length*scale>=45&&<text x={left+(s.from+s.length/2)*scale} y={height-14} textAnchor="middle">{number(s.length,0)}</text>}</g>)}
   <text x={15} y={18}>แนว {assembly.axis} / Z · mm · มิติจริงจากช่วงที่กรอก</text>
  </svg>;
 }catch{return <p className="muted">ตรวจมิติและรอยต่อเพื่อแสดงรูปคาน</p>;}
}

export function BeamAssemblySummary({member}:{member:Member}){
 if(!member.beamAssembly)return null;
 try{const b=assembleBeam(member.beamAssembly);return <section className="panel beam-summary padded" aria-label="รายละเอียดคานต่อเนื่อง">
  <h3>คานต่อเนื่อง · แนว {b.assembly.axis} · {b.stations.length} ช่วง</h3><BeamAssemblyPreview assembly={b.assembly}/>
  <div className="table-scroll"><table><thead><tr><th>ช่วง</th><th>เริ่ม–จบ mm</th><th>กว้าง × ลึก mm</th><th>ท้องคาน Z mm</th><th>คอนกรีต m³/ชิ้น</th></tr></thead><tbody>{b.stations.map((s,i)=><tr key={s.id}><td>S{i+1} · {s.label}</td><td>{number(s.from,0)}–{number(s.to,0)}</td><td>{number(s.width,0)} × {number(s.depth,0)}</td><td>{number(s.soffit,0)}</td><td>{number(s.length*s.width*s.depth/1e9)}</td></tr>)}</tbody></table></div>
  <p className="muted">ก่อนช่องเปิด/รายการหัก: คอนกรีต {number(b.gross)} m³ · แบบหล่อ {number(b.formGross)} m²/ชิ้น รวมผิวต่างระดับที่รอยต่อ {number(b.stepForm)} m² · ดูปริมาณสุทธิและจำนวนจริงใน BOQ</p>
 </section>;}catch{return <p className="notice danger">ข้อมูลช่วงคานไม่ถูกต้อง เปิดช่วงคานเพื่อตรวจแก้</p>;}
}

export function BeamAssemblyEditor({member,onApply,onClose,readOnly=false}:{member:Member;onApply:(m:Member)=>void;onClose:()=>void;readOnly?:boolean}){
 const [assembly,setAssembly]=useState<BeamAssembly>(()=>structuredClone(member.beamAssembly||{version:1,axis:member.x>=member.y?'X':'Y',formwork:{bottom:true,top:false,start:true,end:true},spans:[{id:member.geometry?.solids[0]?.id||'main',label:'ช่วง 1',length:Math.max(member.x,member.y),width:Math.min(member.x,member.y),depth:member.z,soffit:0}]})),[error,setError]=useState('');
 const change=(id:string,patch:Partial<BeamAssembly['spans'][number]>)=>setAssembly({...assembly,spans:assembly.spans.map(s=>s.id===id?{...s,...patch}:s)});
 const reorder=(i:number,dir:number)=>{const spans=[...assembly.spans];[spans[i],spans[i+dir]]=[spans[i+dir],spans[i]];setAssembly({...assembly,spans});};
 let preview:string='';try{const b=assembleBeam(assembly);preview=`คอนกรีตก่อนหัก ${number(b.gross)} m³ · แบบหล่อก่อนหัก ${number(b.formGross)} m² · ผิวต่างระดับที่รอยต่อ ${number(b.stepForm)} m²/ชิ้น`;}catch{}
 const apply=()=>{if(readOnly)return;try{onApply(applyBeamAssembly(member,assembly));onClose();}catch(e:any){setError(e.issues?e.issues.map((i:any)=>i.message).join(' · '):e.message);}};
 return <Modal title={`คานต่อเนื่องหลายช่วง · ${member.code}`} disabledFields={readOnly} onClose={onClose}>
  <p className="notice">กรอกระยะที่คิดคอนกรีตจริงจากแบบ ตามแนวศูนย์กลางคานเดียวกัน · เริ่มช่วงแรกที่ 0 mm และต่อช่วงตามลำดับ · ระดับท้องคาน Z ใช้จุดอ้างอิงเดียวกัน</p>
  <label className="field"><span>แนวคานต่อเนื่อง</span><select value={assembly.axis} onChange={e=>setAssembly({...assembly,axis:e.target.value as 'X'|'Y'})}><option value="X">X</option><option value="Y">Y</option></select></label>
  <div className="beam-span-list">{assembly.spans.map((s,i)=><section className="solid-editor" key={s.id} data-beam-span={i+1}><div className="section-heading"><b>ช่วง S{i+1}</b><div className="actions"><button onClick={()=>reorder(i,-1)} disabled={i===0} aria-label={`เลื่อนช่วง ${i+1} ขึ้น`}>ขึ้น</button><button onClick={()=>reorder(i,1)} disabled={i===assembly.spans.length-1} aria-label={`เลื่อนช่วง ${i+1} ลง`}>ลง</button><button onClick={()=>setAssembly({...assembly,spans:assembly.spans.filter(p=>p.id!==s.id)})} disabled={assembly.spans.length===1} aria-label={`ลบช่วง ${i+1}`}>ลบ</button></div></div>
   <Field label={`ชื่อช่วง ${i+1} / Grid อ้างอิง`} value={s.label} onChange={label=>change(s.id,{label})}/><div className="form-grid">{(['length','width','depth','soffit'] as const).map(k=><Field key={k} label={`${{length:'ยาว',width:'กว้าง',depth:'ลึก',soffit:'ระดับท้องคาน Z'}[k]}ช่วง ${i+1} mm`} value={s[k]} type="number" onChange={v=>change(s.id,{[k]:v})}/>)}</div>
  </section>)}</div>
  <button disabled={assembly.spans.length>=12} onClick={()=>{const last=assembly.spans.at(-1)!;setAssembly({...assembly,spans:[...assembly.spans,{...last,id:crypto.randomUUID(),label:`ช่วง ${assembly.spans.length+1}`}]});}}>เพิ่มช่วงคาน</button>
  <h3>ผิวที่คิดแบบหล่อ</h3><div className="actions">{(['bottom','top','start','end'] as const).map(k=><label className="check" key={k}><input type="checkbox" checked={assembly.formwork[k]} onChange={e=>setAssembly({...assembly,formwork:{...assembly.formwork,[k]:e.target.checked}})}/>{{bottom:'ใต้ท้อง',top:'ด้านบน',start:'หัวคานแรก',end:'ปลายคานสุดท้าย'}[k]}</label>)}</div>
  <p className="muted">คิดผิวข้างและผิวต่างระดับที่รอยต่อ ส่วนหน้าตัดร่วมภายในไม่คิดแบบหล่อ · หากแนบกับเสา/พื้น ให้ตรวจขอบเขตงานและรายการหักตามวิธีวัดของโครงการ</p>
  <BeamAssemblyPreview assembly={assembly}/>{preview&&<p className="notice" role="status">{preview}</p>}
  <p className="notice warning">เมื่อใช้รูปทรงนี้ จะสร้างชิ้นส่วนคานแทนชุดเดิม และคงช่องเปิด/รายการหักไว้ เหล็กและ Zone/ชั้นยังอยู่ แต่ต้องตรวจมิติและตำแหน่งเหล็กใหม่ โดยเฉพาะ Mark ที่อ้างถึงช่วงที่ลบหรือเปลี่ยนแนวคาน</p>
  {error&&<p className="notice danger" role="alert">{error}</p>}<footer><button className="primary" onClick={apply}>ใช้ช่วงคานในหน้าทำงาน</button></footer>
 </Modal>;
}
