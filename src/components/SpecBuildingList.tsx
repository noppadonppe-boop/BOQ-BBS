import {Plus,Trash2} from 'lucide-react';
import type {Spec} from '../domain/model';
import {specBuildingsSchema,type SpecBuilding} from '../domain/specBuildings';

/** Buildings of the spec (spec.buildings): code + name + note. Foundation / beam templates whose group is a building code
 * are listed under that building; the project WBS page adds these buildings as WBS roots. */
export function SpecBuildingList({spec,disabled,onChange}:{spec:Spec;disabled:boolean;onChange:(s:Spec)=>void}){
 const list=spec.buildings||[],check=specBuildingsSchema.safeParse(list);
 const store=(next:SpecBuilding[])=>{const {buildings:_,...rest}=spec;onChange(next.length?{...rest,buildings:next}:rest);};
 const put=(i:number,patch:Partial<SpecBuilding>)=>store(list.map((b,k)=>k===i?{...b,...patch}:b));
 const count=(code:string)=>[...(spec.foundationTemplates||[]),...(spec.beamTemplates||[]),...(spec.slabTemplates||[]),...(spec.wallTemplates||[])].filter(t=>(t.group||'').trim().toUpperCase()===code).length;
 const add=()=>{const used=new Set(list.map(b=>b.code));let n=list.length+1;while(used.has(`B${n}`))n++;store([...list,{code:`B${n}`,name:`อาคาร ${n}`,note:''}]);};
 return <section className="foundation-templates spec-buildings" aria-label="อาคารของโครงการ"><h3>อาคารของโครงการ</h3>
  <p>รหัส + ชื่ออาคาร · ข้อมูลแบบที่นำเข้าทีละอาคาร (Foundation / Beam Template) ใช้รหัสอาคารเป็น “กลุ่ม” แล้วจะแสดงใต้อาคารนั้น · หน้า WBS ของโครงการกด “เพิ่มอาคารจาก General Spec” เพื่อสร้างอาคารรหัสเดียวกัน</p>
  {!check.success&&<p role="alert" className="notice danger">{check.error.issues[0]?.message}</p>}
  <fieldset disabled={disabled} className="profile-fields">
   {list.length>0&&<table className="finish-items"><thead><tr><th>รหัส</th><th>ชื่ออาคาร</th><th>หมายเหตุ</th><th className="num">Template</th><th/></tr></thead><tbody>{list.map((b,i)=><tr key={i}>
    <td><input aria-label="รหัสอาคาร" maxLength={20} style={{width:80}} value={b.code} onChange={e=>put(i,{code:e.target.value.toUpperCase().replace(/\s+/g,'')})}/></td>
    <td><input aria-label="ชื่ออาคาร" maxLength={120} value={b.name} onChange={e=>put(i,{name:e.target.value})}/></td>
    <td><input aria-label="หมายเหตุ" maxLength={500} value={b.note} onChange={e=>put(i,{note:e.target.value})}/></td>
    <td className="num">{count(b.code)||'–'}</td>
    <td><button type="button" className="icon-button" aria-label={`ลบ ${b.code}`} onClick={()=>{if(confirm(`ลบอาคาร ${b.code}? Template กลุ่ม ${b.code} ยังอยู่ (แสดงเป็นกลุ่มธรรมดา) · WBS ของโครงการไม่เปลี่ยน`))store(list.filter((_,k)=>k!==i));}}><Trash2 size={14}/></button></td></tr>)}</tbody></table>}
   <div className="actions"><button type="button" disabled={list.length>=50} onClick={add}><Plus size={14}/>เพิ่มอาคาร</button><span className="muted">{list.length} อาคาร</span></div>
  </fieldset>
 </section>;
}
