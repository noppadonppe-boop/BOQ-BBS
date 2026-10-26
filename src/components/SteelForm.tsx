import {useMemo,useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import type {Member} from '../domain/model';
import {assemblyTypeLabels,assemblyTypes,steelInputSchema,type SteelBolt,type SteelInput,type SteelPart,type SteelWeld} from '../domain/steelInputSchema';
import {applySteelInput,defaultSteelInput,partLines,steelProblems,steelQuantities} from '../domain/steelInput';
import {kgPerMetre} from '../domain/steelProfiles';
import {NumInput,number} from './EditorControls';

const newId=()=>crypto.randomUUID().replace(/-/g,'').slice(0,12);
const nextMark=(list:SteelPart[])=>{let k=list.length+1;while(list.some(p=>p.mark===`PL${k}`))k++;return `PL${k}`;};

/** Tab “Assembly เหล็ก”: parts (main + secondary, Tekla material list), bolts, welds, paint → weight / BOQ items. */
export function SteelForm({member,readOnly,onApply}:{member:Member;readOnly:boolean;onApply:(m:Member)=>void}){
 const [input,setInput]=useState<SteelInput>(()=>member.steelInput||defaultSteelInput());
 const set=(p:Partial<SteelInput>)=>setInput({...input,...p}),check=steelInputSchema.safeParse(input),problems=check.success?steelProblems(input):[];
 const preview=useMemo<{next:Member}|{error:string}|null>(()=>{if(!check.success||problems.length)return null;try{return {next:applySteelInput(member,input)};}catch(e:any){return {error:String(e?.message||e)};}},[member,input]);
 const lines=partLines(input),q=steelQuantities(input),items=preview&&'next' in preview?preview.next.siteWork?.items.filter(i=>i.id.startsWith('stl-'))||[]:[];
 const putPart=(id:string,p:Partial<SteelPart>)=>set({parts:input.parts.map(x=>x.id===id?{...x,...p}:p.main?{...x,main:false}:x)});
 const putBolt=(id:string,p:Partial<SteelBolt>)=>set({bolts:input.bolts.map(x=>x.id===id?{...x,...p}:x)}),putWeld=(id:string,p:Partial<SteelWeld>)=>set({welds:input.welds.map(x=>x.id===id?{...x,...p}:x)});
 const n=(v:string)=>Math.max(0,Number(v)||0);
 return <section className="civil-form steel-form">
  <div className="section-heading"><div><h3>Assembly เหล็กรูปพรรณ · {member.code}</h3><p className="muted">รายการชิ้นส่วนแบบ Material list ของ Tekla · Profile เช่น H-150X150X7X10, PL10*115, L-50X50X5, C-150X65X20X3.2, PIPE-114.3X4.5 · น้ำหนักคำนวณจากหน้าตัด (ρ 7,850) หรือใส่น้ำหนักต่อชิ้นตามรายการ</p></div></div>
  <fieldset disabled={readOnly}>
   <div className="form-grid"><label className="field"><span>ประเภท</span><select value={input.type} onChange={e=>set({type:e.target.value as SteelInput['type']})}>{assemblyTypes.map(t=><option key={t} value={t}>{assemblyTypeLabels[t]}</option>)}</select></label>
    <label className="field"><span>ชื่อ / รายละเอียด</span><input maxLength={120} value={input.name} onChange={e=>set({name:e.target.value})} placeholder="ASSEMBLY NO. C"/></label>
    <label className="field full"><span>ระบบสี (รายการ BOQ ตามพื้นที่ทาสี · ว่าง = ไม่คิด)</span><input maxLength={120} value={input.paint} onChange={e=>set({paint:e.target.value})}/></label></div>
   <div className="table-scroll"><table className="civil-layers steel-parts"><thead><tr><th>Main</th><th>Mark</th><th>Profile</th><th>Material</th><th className="num">No.</th><th className="num">Length (mm)</th><th className="num">kg/m</th><th className="num">kg / ชิ้น (ใส่เองได้)</th><th className="num">รวม kg</th><th/></tr></thead><tbody>
    {lines.map(({part:p,profile,each,weight})=><tr key={p.id} className={profile||p.weight!==undefined?'':'warn-row'}>
     <td><input type="radio" name={`main-${member.id}`} aria-label="ชิ้นหลัก" checked={p.main} onChange={()=>putPart(p.id,{main:true})}/></td>
     <td><input aria-label="Mark" maxLength={20} value={p.mark} onChange={e=>putPart(p.id,{mark:e.target.value})}/></td>
     <td><input aria-label="Profile" maxLength={60} value={p.profile} onChange={e=>putPart(p.id,{profile:e.target.value})}/></td>
     <td><input aria-label="Material" maxLength={20} value={p.grade} onChange={e=>putPart(p.id,{grade:e.target.value})}/></td>
     <td><NumInput aria-label="No." type="number" min={1} value={p.count} onChange={e=>putPart(p.id,{count:Math.max(1,Math.trunc(Number(e.target.value)||1))})}/></td>
     <td><NumInput aria-label="Length" type="number" min={1} value={p.length} onChange={e=>putPart(p.id,{length:Math.max(1,Number(e.target.value)||1)})}/></td>
     <td className="num">{profile?number(kgPerMetre(profile),2):'—'}</td>
     <td><NumInput aria-label="kg ต่อชิ้น" type="number" min={0} step="any" placeholder={number(each,2)} value={p.weight??''} onChange={e=>{const v=e.target.value;const {weight:_w,...rest}=p;putPart(p.id,v===''?{...rest,weight:undefined}:{weight:n(v)});}}/></td>
     <td className="num">{number(weight,1)}</td>
     <td><button type="button" aria-label="ลบชิ้นส่วน" disabled={input.parts.length===1} onClick={()=>set({parts:input.parts.filter(x=>x.id!==p.id)})}><Trash2 size={14}/></button></td></tr>)}
    <tr className="total"><td colSpan={8}>รวม · พื้นที่ทาสี {number(q.paint,2)} m²</td><td className="num">{number(q.weight,1)}</td><td/></tr></tbody></table></div>
   <button type="button" disabled={input.parts.length>=200} onClick={()=>set({parts:[...input.parts,{id:newId(),mark:nextMark(input.parts),profile:'PL10*100',grade:input.parts[0]?.grade||'SS400',count:1,length:100,main:false}]})}><Plus size={14}/>ชิ้นส่วน</button>
   <div className="civil-rebar"><b>Bolt list</b>
    <table className="civil-layers"><thead><tr><th>Size</th><th>Grade</th><th className="num">Length (mm)</th><th className="num">No.</th><th className="num">รู (mm)</th><th/></tr></thead><tbody>{input.bolts.map(b=><tr key={b.id}>
     <td><input aria-label="Bolt size" maxLength={12} value={b.size} onChange={e=>putBolt(b.id,{size:e.target.value.toUpperCase()})}/></td><td><input aria-label="Bolt grade" maxLength={20} value={b.grade} onChange={e=>putBolt(b.id,{grade:e.target.value})}/></td>
     <td><NumInput aria-label="Bolt length" type="number" min={0} value={b.length} onChange={e=>putBolt(b.id,{length:n(e.target.value)})}/></td><td><NumInput aria-label="Bolt no" type="number" min={1} value={b.count} onChange={e=>putBolt(b.id,{count:Math.max(1,Math.trunc(Number(e.target.value)||1))})}/></td>
     <td><NumInput aria-label="Hole" type="number" min={0} value={b.hole} onChange={e=>putBolt(b.id,{hole:n(e.target.value)})}/></td><td><button type="button" aria-label="ลบน็อต" onClick={()=>set({bolts:input.bolts.filter(x=>x.id!==b.id)})}><Trash2 size={14}/></button></td></tr>)}</tbody></table>
    <button type="button" disabled={input.bolts.length>=50} onClick={()=>set({bolts:[...input.bolts,{id:newId(),size:'M20',grade:'8.8',length:60,count:2,hole:22}]})}><Plus size={14}/>น็อต</button></div>
   <div className="civil-rebar"><b>รอยเชื่อม</b>
    <table className="civil-layers"><thead><tr><th>ชนิด</th><th className="num">ขนาด (mm)</th><th className="num">ยาว (mm)</th><th className="num">จำนวน</th><th/></tr></thead><tbody>{input.welds.map(w=><tr key={w.id}>
     <td><select aria-label="ชนิดรอยเชื่อม" value={w.type} onChange={e=>putWeld(w.id,{type:e.target.value as SteelWeld['type']})}><option value="fillet">Fillet</option><option value="butt">Butt (CJP)</option></select></td>
     <td><NumInput aria-label="ขนาดเชื่อม" type="number" min={0} value={w.size} onChange={e=>putWeld(w.id,{size:n(e.target.value)})}/></td><td><NumInput aria-label="ยาวเชื่อม" type="number" min={1} value={w.length} onChange={e=>putWeld(w.id,{length:Math.max(1,n(e.target.value))})}/></td>
     <td><NumInput aria-label="จำนวนเชื่อม" type="number" min={1} value={w.count} onChange={e=>putWeld(w.id,{count:Math.max(1,Math.trunc(Number(e.target.value)||1))})}/></td><td><button type="button" aria-label="ลบรอยเชื่อม" onClick={()=>set({welds:input.welds.filter(x=>x.id!==w.id)})}><Trash2 size={14}/></button></td></tr>)}</tbody></table>
    <button type="button" disabled={input.welds.length>=50} onClick={()=>set({welds:[...input.welds,{id:newId(),type:'fillet',size:4,length:100,count:2}]})}><Plus size={14}/>รอยเชื่อม</button></div>
  </fieldset>
  {!check.success?<p role="alert" className="notice danger">กรอกให้ครบ ({check.error.issues[0]?.path.join('.')}: {check.error.issues[0]?.message})</p>
   :problems.length?<p role="alert" className="notice danger">{problems.join(' · ')}</p>
   :preview&&'error' in preview?<p role="alert" className="notice danger">{preview.error}</p>
   :<div className="table-scroll"><table className="civil-layers"><thead><tr><th>รายการ BOQ (ต่อ 1 Assembly)</th><th>หน่วย</th><th className="num">ปริมาณ</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td>{i.label}</td><td>{i.unit}</td><td className="num">{number(i.quantity,2)}</td></tr>)}</tbody></table></div>}
  <footer className="actions"><button className="primary" disabled={readOnly||!preview||'error' in preview} onClick={()=>preview&&'next' in preview&&onApply(preview.next)}>คำนวณปริมาณ</button><span className="muted">น็อต {q.bolts} ชุด · เชื่อม {number(q.weld,2)} m · รายการ BOQ ที่เพิ่มเองยังคงอยู่</span></footer>
 </section>;
}
