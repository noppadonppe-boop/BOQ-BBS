import {useMemo,useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import {labels,type Member,type Project} from '../domain/model';
import {archInputSchema,finishKindLabels,type ArchInput,type FinishKind,type FixtureInput,type OpeningInput,type RailingInput,type RoofInput,type RoomInput,type RoomOpening,type WallInput} from '../domain/archInputSchema';
import {applyArchInput,archItems,defaultArchInput,isArchCategory,openingItems,openingQuantities,roofQuantities,roomProblems,roomQuantities,wallQuantities} from '../domain/archInput';
import {Field,NumInput,number} from './EditorControls';

const newId=()=>crypto.randomUUID().replace(/-/g,'').slice(0,12);
const basisLabels={set:'ต่อชุด',area:'ต่อ m² ช่องเปิด',perimeter:'ต่อ m วงกบ'} as const;

/** Tab “งานสถาปัตย์” of Room / Opening members: room size + finish codes (spec finish library) + openings, or the
 * door / window type with its BOQ items. Apply writes the quantities as the member's BOQ items. */
export function ArchForm({member,project,readOnly,onApply}:{member:Member;project:Project;readOnly:boolean;onApply:(m:Member)=>void}){
 const [input,setInput]=useState<ArchInput>(()=>member.archInput||defaultArchInput(isArchCategory(member.category)?member.category:'Room'));
 const check=archInputSchema.safeParse(input);
 const preview=useMemo(()=>{if(!check.success)return null;try{const next=applyArchInput(member,input,project.spec);return {next,problems:archItems(member.code,input,project.spec.finishes).problems};}catch(e:any){return {error:String(e?.message||e)};}},[member,input,project.spec]);
 const items=preview&&!('error' in preview)?preview.next.siteWork?.items.filter(i=>i.id.startsWith('arch-'))||[]:[];
 return <section className="civil-form arch-form">
  <div className="section-heading"><div><h3>งานสถาปัตย์ · {labels[member.category]}</h3><p className="muted">{input.kind==='room'?'ขนาดห้อง + รหัสวัสดุผิวจากคลังวัสดุผิว (General Spec) → ปริมาณพื้น บัว ผนัง ฝ้า หักช่องเปิดให้':input.kind==='wall'?'แนวผนังก่อ: ยาว × สูง − ช่องเปิด · ชนิดผนังจากคลังวัสดุผิว · เสาเอ็น ทับหลัง คานเอ็นคิดให้เป็นความยาว':input.kind==='roof'?'พื้นที่แปลน + มุมลาด → พื้นที่มุงจริง · วัสดุมุงจากคลังวัสดุผิว · ครอบสัน เชิงชาย ปั้นลมเป็นความยาว':input.kind==='railing'?'แนวราว: ความยาว × รายการของชนิดราว (คลังวัสดุผิว → ราว)':input.kind==='fixture'?'สุขภัณฑ์ / ครุภัณฑ์ / ป้าย · รหัสสมาชิกคือรหัสตามแบบ · จำนวนกรอกในตารางตำแหน่ง (ห้องใน WBS)':'แบบประตู / หน้าต่าง · รหัสสมาชิกคือรหัสแบบ (D1, W1 …) · ตำแหน่งและจำนวนกรอกในตารางตำแหน่ง (ห้อง / ชั้น ใน WBS)'}</p></div></div>
  <fieldset disabled={readOnly}>{input.kind==='room'?<RoomFields input={input} project={project} onChange={setInput}/>:input.kind==='wall'?<WallFields input={input} project={project} onChange={setInput}/>:input.kind==='roof'?<RoofFields input={input} project={project} onChange={setInput}/>:input.kind==='railing'?<RailingFields input={input} project={project} onChange={setInput}/>:input.kind==='fixture'?<FixtureFields input={input} onChange={setInput}/>:<OpeningFields input={input} onChange={setInput}/>}</fieldset>
  {!check.success?<p role="alert" className="notice danger">กรอกตัวเลขให้ถูกต้อง ({check.error.issues[0]?.path.join('.')}: {check.error.issues[0]?.message})</p>
   :preview&&'error' in preview?<p role="alert" className="notice danger">{preview.error}</p>
   :preview&&<>{input.kind==='room'&&<RoomKpis input={input}/>}{input.kind==='wall'&&<Kpis rows={(q=>[['ผนังสุทธิ',`${number(q.net,2)} m²`],['ช่องเปิด',`${number(q.open,2)} m²`],['เสาเอ็น',`${q.stiffeners} ต้น · ${number(q.stiffener,2)} m`],['ทับหลัง',`${number(q.lintel,2)} m`],['คานเอ็น',`${number(q.tie,2)} m`]])(wallQuantities(input))}/>}
    {input.kind==='roof'&&<Kpis rows={(q=>[['พื้นที่แปลน',`${number(q.plan,2)} m²`],['พื้นที่มุง (ตามลาด)',`${number(q.slope,2)} m²`]])(roofQuantities(input))}/>}
    {input.kind==='opening'&&<div className="kpis compact">{[['พื้นที่ช่องเปิด',`${number(openingQuantities(input).area,2)} m²`],['ความยาววงกบ',`${number(openingQuantities(input).perimeter,2)} m`]].map(([k,v])=><div key={k}><small>{k}</small><strong>{v}</strong></div>)}</div>}
    {preview.problems.length>0&&<p className="notice warning">{preview.problems.join(' · ')}</p>}
    <div className="table-scroll"><table className="civil-layers"><thead><tr><th>รายการ BOQ (ต่อ 1 {input.kind==='room'?'ห้อง':input.kind==='opening'||input.kind==='fixture'?'ชุด':'แนว / หลัง'})</th><th>หน่วย</th><th className="num">ปริมาณ</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td>{i.label}</td><td>{i.unit}</td><td className="num">{number(i.quantity,2)}</td></tr>)}{!items.length&&<tr><td colSpan={3} className="muted">ยังไม่เลือกวัสดุผิว</td></tr>}</tbody></table></div></>}
  <footer className="actions"><button className="primary" disabled={readOnly||!preview||'error' in preview} onClick={()=>preview&&!('error' in preview)&&onApply(preview.next)}>คำนวณปริมาณ</button><span className="muted">รายการ BOQ ที่เพิ่มเองในสมาชิกยังคงอยู่</span></footer>
 </section>;
}
const Kpis=({rows}:{rows:string[][]})=><div className="kpis compact">{rows.map(([k,v])=><div key={k}><small>{k}</small><strong>{v}</strong></div>)}</div>;
function RoomKpis({input}:{input:RoomInput}){
 const q=roomQuantities(input);
 return <div className="kpis compact">{[['พื้น',`${number(q.floor,2)} m²`],['เส้นรอบรูป',`${number(q.perimeter,2)} m`],['บัว',`${number(q.skirting,2)} m`],['ผนัง',`${number(q.wall,2)} m²`],...(input.dado?[['ผนังส่วนล่าง',`${number(q.dado,2)} m²`]]:[]),...(input.waterproof?[['กันซึม',`${number(q.waterproof,2)} m²`]]:[]),['ฝ้า',`${number(q.ceiling,2)} m²`],['ช่องเปิด',`${number(q.openArea,2)} m²`]].map(([k,v])=><div key={k}><small>{k}</small><strong>{v}</strong></div>)}</div>;
}
const m2mm=(v:number)=>Number.isFinite(v)?Math.round(v*1000):0;
function RoomFields({input,project,onChange}:{input:RoomInput;project:Project;onChange:(i:ArchInput)=>void}){
 const set=(p:Partial<RoomInput>)=>onChange({...input,...p}),lib=project.spec.finishes||[],bad=roomProblems(input);
 const pick=(kind:FinishKind,value:string,on:(v:string)=>void,label:string)=>{const opts=lib.filter(f=>f.kind===kind),known=!value||opts.some(f=>f.code===value);
  return <label className="field"><span>{label}</span><select value={value} onChange={e=>on(e.target.value)}><option value="">— ไม่มี —</option>{opts.map(f=><option key={f.id} value={f.code}>{f.code} · {f.name}</option>)}{!known&&<option value={value}>{value} (ไม่มีในคลัง)</option>}</select></label>;};
 return <>{!lib.length&&<p className="notice warning">ยังไม่มีคลังวัสดุผิวใน General Spec · เพิ่มที่ General Spec → คลังวัสดุผิว (มีชุดตัวอย่าง)</p>}
  <div className="form-grid">
   <label className="field full"><span>ชื่อห้อง</span><input maxLength={120} value={input.name} onChange={e=>set({name:e.target.value})} placeholder="ห้องนอน 1"/></label>
   <Field label="กว้าง (m)" type="number" step="0.01" value={input.width/1000} onChange={v=>set({width:m2mm(v)})}/>
   <Field label="ยาว (m)" type="number" step="0.01" value={input.length/1000} onChange={v=>set({length:m2mm(v)})}/>
   <Field label="พื้นที่ตามแบบ (m² · 0 = กว้าง × ยาว)" type="number" step="0.01" value={input.area} onChange={v=>set({area:Math.max(0,v||0)})}/>
   <Field label="เส้นรอบรูปตามแบบ (m · 0 = คำนวณ)" type="number" step="0.01" value={input.perimeter} onChange={v=>set({perimeter:Math.max(0,v||0)})}/>
   <Field label="สูงฝ้า (m)" type="number" step="0.01" value={input.height/1000} onChange={v=>set({height:m2mm(v)})}/>
  </div>
  {bad.length>0&&<p className="notice warning">{bad.join(' · ')}</p>}
  <div className="form-grid civil-site">
   {pick('floor',input.floor,v=>set({floor:v}),`${finishKindLabels.floor} (F)`)}{pick('skirting',input.skirting,v=>set({skirting:v}),`${finishKindLabels.skirting} (S)`)}
   {pick('wall',input.wall,v=>set({wall:v}),`${finishKindLabels.wall} (W)`)}{pick('ceiling',input.ceiling,v=>set({ceiling:v}),`${finishKindLabels.ceiling} (C)`)}
   <label className="check full"><input type="checkbox" checked={!!input.dado} onChange={e=>set({dado:e.target.checked?{finish:lib.find(f=>f.kind==='wall'&&f.code!==input.wall)?.code||input.wall||'W2',height:1200}:undefined})}/>ผนังส่วนล่างใช้วัสดุอื่น (เช่น บุกระเบื้องถึงความสูง)</label>
   <label className="check full"><input type="checkbox" checked={!!input.waterproof} onChange={e=>set({waterproof:e.target.checked?{finish:lib.find(f=>f.kind==='waterproof')?.code||'WP1',upturn:300}:undefined})}/>งานกันซึม (พื้น + ยกขอบผนัง)</label>
   {input.waterproof&&<>{pick('waterproof',input.waterproof.finish,v=>set({waterproof:{...input.waterproof!,finish:v||input.waterproof!.finish}}),'ระบบกันซึม (WP)')}<Field label="ยกขอบกันซึม (mm)" type="number" value={input.waterproof.upturn} onChange={v=>set({waterproof:{...input.waterproof!,upturn:Math.max(0,v||0)}})}/></>}
   {input.dado&&<>{pick('wall',input.dado.finish,v=>set({dado:{...input.dado!,finish:v||input.dado!.finish}}),'ผนังส่วนล่าง')}<Field label="สูงผนังส่วนล่าง (m)" type="number" step="0.01" value={input.dado.height/1000} onChange={v=>set({dado:{...input.dado!,height:m2mm(v)}})}/></>}
  </div>
  <OpeningsTable title="ช่องเปิดในห้อง" hint="(หักผนัง · ประตูหักบัวด้วย · ดึงอัตโนมัติจากตารางประตู-หน้าต่างได้ที่หน้า Architecture)" list={input.openings} onChange={openings=>set({openings})}/></>;
}
function OpeningFields({input,onChange}:{input:OpeningInput;onChange:(i:ArchInput)=>void}){
 const set=(p:Partial<OpeningInput>)=>onChange({...input,...p});
 return <><div className="form-grid">
  <label className="field"><span>ประเภท</span><select value={input.type} onChange={e=>set({type:e.target.value as OpeningInput['type']})}><option value="door">ประตู</option><option value="window">หน้าต่าง / ช่องแสง</option></select></label>
  <Field label="กว้าง (mm)" type="number" value={input.width} onChange={v=>set({width:Math.max(1,v||0)})}/>
  <Field label="สูง (mm)" type="number" value={input.height} onChange={v=>set({height:Math.max(1,v||0)})}/>
  <label className="field full"><span>รายละเอียด (วัสดุ บาน วงกบ อุปกรณ์)</span><input maxLength={200} value={input.description} onChange={e=>set({description:e.target.value})}/></label></div>
  <div className="civil-rebar"><b>รายการ BOQ ของแบบนี้</b> <small className="muted">(ว่าง = 1 รายการต่อชุด ชื่อ = รหัส + รายละเอียด + ขนาด)</small>
   <table className="civil-layers"><thead><tr><th>รายการ</th><th>หน่วย</th><th>คิดจาก</th><th className="num">ตัวคูณ</th><th/></tr></thead><tbody>{input.items.map(it=><tr key={it.id}>
    <td><input aria-label="รายการ" maxLength={120} value={it.label} onChange={e=>set({items:input.items.map(x=>x.id===it.id?{...x,label:e.target.value}:x)})}/></td>
    <td><input aria-label="หน่วย" maxLength={12} value={it.unit} onChange={e=>set({items:input.items.map(x=>x.id===it.id?{...x,unit:e.target.value}:x)})}/></td>
    <td><select aria-label="คิดจาก" value={it.basis} onChange={e=>set({items:input.items.map(x=>x.id===it.id?{...x,basis:e.target.value as typeof it.basis}:x)})}>{(Object.keys(basisLabels) as (keyof typeof basisLabels)[]).map(b=><option key={b} value={b}>{basisLabels[b]}</option>)}</select></td>
    <td><NumInput aria-label="ตัวคูณ" type="number" min={0} step="any" value={it.factor} onChange={e=>set({items:input.items.map(x=>x.id===it.id?{...x,factor:Math.max(0,Number(e.target.value)||0)}:x)})}/></td>
    <td><button type="button" aria-label="ลบรายการ" onClick={()=>set({items:input.items.filter(x=>x.id!==it.id)})}><Trash2 size={14}/></button></td></tr>)}</tbody></table>
   <button type="button" disabled={input.items.length>=10} onClick={()=>set({items:[...input.items,input.items.length?{id:newId(),label:'วงกบ',unit:'m',basis:'perimeter',factor:1}:{id:newId(),label:openingItems('',input)[0].label.trim(),unit:'ชุด',basis:'set',factor:1}]})}><Plus size={14}/>รายการ BOQ</button></div></>;
}
function OpeningsTable({title,hint,list,onChange}:{title:string;hint:string;list:RoomOpening[];onChange:(l:RoomOpening[])=>void}){
 const put=(k:number,p:Partial<RoomOpening>)=>onChange(list.map((x,j)=>j===k?{...x,...p}:x));
 return <div className="civil-rebar"><b>{title}</b> <small className="muted">{hint}</small>
  <table className="civil-layers"><thead><tr><th>แบบ</th><th>ประตู</th><th className="num">กว้าง (mm)</th><th className="num">สูง (mm)</th><th className="num">จำนวน</th><th/></tr></thead><tbody>{list.map((o,k)=><tr key={k}>
   <td><input aria-label="แบบช่องเปิด" maxLength={20} value={o.code} onChange={e=>put(k,{code:e.target.value})}/></td>
   <td><input aria-label="เป็นประตู" type="checkbox" checked={o.door} onChange={e=>put(k,{door:e.target.checked})}/></td>
   {(['width','height','count'] as const).map(f=><td key={f}><NumInput aria-label={f} type="number" min={0} value={o[f]} onChange={e=>put(k,{[f]:Math.max(0,f==='count'?Math.trunc(Number(e.target.value)||0):Number(e.target.value)||0)})}/></td>)}
   <td><button type="button" aria-label="ลบช่องเปิด" onClick={()=>onChange(list.filter((_,j)=>j!==k))}><Trash2 size={14}/></button></td></tr>)}</tbody></table>
  <button type="button" disabled={list.length>=40} onClick={()=>onChange([...list,{code:`D${list.length+1}`,door:true,width:900,height:2000,count:1}])}><Plus size={14}/>ช่องเปิด</button></div>;
}
/** Library code select of one kind (codes not in the library stay selectable so old input is not lost). */
function LibraryPick({project,kind,value,label,onChange}:{project:Project;kind:FinishKind;value:string;label:string;onChange:(v:string)=>void}){
 const opts=(project.spec.finishes||[]).filter(f=>f.kind===kind),known=!value||opts.some(f=>f.code===value);
 return <label className="field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}><option value="">— ไม่มี —</option>{opts.map(f=><option key={f.id} value={f.code}>{f.code} · {f.name}</option>)}{!known&&<option value={value}>{value} (ไม่มีในคลัง)</option>}</select></label>;
}
function WallFields({input,project,onChange}:{input:WallInput;project:Project;onChange:(i:ArchInput)=>void}){
 const set=(p:Partial<WallInput>)=>onChange({...input,...p});
 return <><div className="form-grid">
  <Field label="ยาวตามแนวผนัง (m)" type="number" step="0.01" value={input.length/1000} onChange={v=>set({length:Math.max(1,m2mm(v))})}/>
  <Field label="สูง (m)" type="number" step="0.01" value={input.height/1000} onChange={v=>set({height:Math.max(1,m2mm(v))})}/>
  <Field label="หนา (mm)" type="number" value={input.thickness} onChange={v=>set({thickness:Math.max(0,v||0)})}/>
  <LibraryPick project={project} kind="masonry" value={input.type} label={`${finishKindLabels.masonry} (WT)`} onChange={v=>set({type:v})}/></div>
  <div className="form-grid civil-site">
   <Field label="เสาเอ็นห่างไม่เกิน (m · 0 = เฉพาะปลาย)" type="number" step="0.1" value={input.stiffenerSpacing/1000} onChange={v=>set({stiffenerSpacing:Math.max(0,m2mm(v))})}/>
   <Field label="ทับหลังฝากเข้าผนังข้างละ (mm)" type="number" value={input.lintelBearing} onChange={v=>set({lintelBearing:Math.max(0,v||0)})}/>
   <Field label="คานเอ็น (จำนวนแนวตลอดความยาว)" type="number" value={input.tieBeams} onChange={v=>set({tieBeams:Math.max(0,Math.min(10,Math.trunc(v)||0))})}/>
   <label className="check full"><input type="checkbox" checked={input.stiffenersAtOpenings} onChange={e=>set({stiffenersAtOpenings:e.target.checked})}/>เสาเอ็นข้างช่องเปิดทั้งสองข้าง</label></div>
  <OpeningsTable title="ช่องเปิดในผนัง" hint="(หักพื้นที่ผนัง · ทับหลังเหนือทุกช่อง)" list={input.openings} onChange={openings=>set({openings})}/></>;
}
function RoofFields({input,project,onChange}:{input:RoofInput;project:Project;onChange:(i:ArchInput)=>void}){
 const set=(p:Partial<RoofInput>)=>onChange({...input,...p});
 return <div className="form-grid">
  <Field label="กว้างแปลน (m)" type="number" step="0.01" value={input.width/1000} onChange={v=>set({width:m2mm(v)})}/>
  <Field label="ยาวแปลน (m)" type="number" step="0.01" value={input.length/1000} onChange={v=>set({length:m2mm(v)})}/>
  <Field label="พื้นที่แปลนตามแบบ (m² · 0 = กว้าง × ยาว)" type="number" step="0.01" value={input.area} onChange={v=>set({area:Math.max(0,v||0)})}/>
  <Field label="มุมลาดหลังคา (องศา)" type="number" step="0.5" value={input.pitch} onChange={v=>set({pitch:Math.max(0,Math.min(75,v||0))})}/>
  <LibraryPick project={project} kind="roof" value={input.covering} label={`วัสดุมุง${finishKindLabels.roof} (R)`} onChange={v=>set({covering:v})}/>
  <Field label="ครอบสัน (m)" type="number" step="0.01" value={input.ridge} onChange={v=>set({ridge:Math.max(0,v||0)})}/>
  <Field label="เชิงชาย (m)" type="number" step="0.01" value={input.eave} onChange={v=>set({eave:Math.max(0,v||0)})}/>
  <Field label="ปั้นลม (m)" type="number" step="0.01" value={input.verge} onChange={v=>set({verge:Math.max(0,v||0)})}/></div>;
}
function RailingFields({input,project,onChange}:{input:RailingInput;project:Project;onChange:(i:ArchInput)=>void}){
 const set=(p:Partial<RailingInput>)=>onChange({...input,...p});
 return <div className="form-grid">
  <Field label="ความยาวราว (m)" type="number" step="0.01" value={input.length/1000} onChange={v=>set({length:Math.max(1,m2mm(v))})}/>
  <Field label="สูง (mm)" type="number" value={input.height} onChange={v=>set({height:Math.max(0,v||0)})}/>
  <LibraryPick project={project} kind="railing" value={input.type} label={`ชนิด${finishKindLabels.railing} (RL)`} onChange={v=>set({type:v})}/></div>;
}
function FixtureFields({input,onChange}:{input:FixtureInput;onChange:(i:ArchInput)=>void}){
 const set=(p:Partial<FixtureInput>)=>onChange({...input,...p});
 return <><div className="form-grid">
  <label className="field full"><span>รายละเอียด (ยี่ห้อ / รุ่น / ขนาด ตามแบบ)</span><input maxLength={200} value={input.description} onChange={e=>set({description:e.target.value})} placeholder="ชักโครกแบบนั่งราบ พร้อมอุปกรณ์"/></label>
  <label className="field"><span>หน่วย</span><input maxLength={12} value={input.unit} onChange={e=>set({unit:e.target.value||'ชุด'})}/></label></div>
  <div className="civil-rebar"><b>รายการ BOQ ต่อชุด</b> <small className="muted">(ว่าง = 1 รายการ: รหัส + รายละเอียด)</small>
   <table className="civil-layers"><thead><tr><th>รายการ</th><th>หน่วย</th><th className="num">ต่อชุด</th><th/></tr></thead><tbody>{input.items.map(it=><tr key={it.id}>
    <td><input aria-label="รายการ" maxLength={120} value={it.label} onChange={e=>set({items:input.items.map(x=>x.id===it.id?{...x,label:e.target.value}:x)})}/></td>
    <td><input aria-label="หน่วย" maxLength={12} value={it.unit} onChange={e=>set({items:input.items.map(x=>x.id===it.id?{...x,unit:e.target.value}:x)})}/></td>
    <td><NumInput aria-label="ต่อชุด" type="number" min={0} step="any" value={it.factor} onChange={e=>set({items:input.items.map(x=>x.id===it.id?{...x,factor:Math.max(0,Number(e.target.value)||0)}:x)})}/></td>
    <td><button type="button" aria-label="ลบรายการ" onClick={()=>set({items:input.items.filter(x=>x.id!==it.id)})}><Trash2 size={14}/></button></td></tr>)}</tbody></table>
   <button type="button" disabled={input.items.length>=10} onClick={()=>set({items:[...input.items,{id:newId(),label:input.items.length?'อุปกรณ์ประกอบ':input.description||'รายการ',unit:input.unit,basis:'set',factor:1}]})}><Plus size={14}/>รายการ BOQ</button></div></>;
}
