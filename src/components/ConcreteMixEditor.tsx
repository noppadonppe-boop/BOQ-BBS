import {Plus,Trash2} from 'lucide-react';
import type {Spec} from '../domain/model';
import {concreteCategories,concreteCategoryLabels,concreteSpecSchema,kscToMpa,type ConcreteMix,type ConcreteSpec,type ConcreteUse} from '../domain/concreteMixes';
import {NumInput} from './EditorControls';

const newId=(p:string,list:{id:string}[])=>{let n=list.length+1;while(list.some(x=>x.id===`${p}${n}`))n++;return `${p}${n}`;};
const blankMix=(list:ConcreteMix[]):ConcreteMix=>({id:newId('mix',list),name:`CONCRETE MIX ${list.length+1}`,fc:280,fc14:0,fc7:0,wc:0,shrinkage:0,note:''});

/** Concrete mixes of the spec (strength schedule of the General Notes) and the member types that use each mix.
 * Members take the mix of their type (or one chosen on the member); its f'c picks the lap table and shows on
 * the A3 sheet and in the BOQ descriptions. */
export function ConcreteMixEditor({spec,disabled,onChange}:{spec:Spec;disabled:boolean;onChange:(s:Spec)=>void}){
 const c=spec.concrete,mixes=c?.mixes||[],uses=c?.uses||[],check=c?concreteSpecSchema.safeParse(c):undefined;
 const store=(next:ConcreteSpec|undefined)=>{const {concrete:_,...rest}=spec;onChange(next&&next.mixes.length?{...rest,concrete:next}:rest);};
 const setMix=(i:number,patch:Partial<ConcreteMix>)=>store({mixes:mixes.map((m,k)=>k===i?{...m,...patch}:m),uses});
 const setUse=(i:number,patch:Partial<ConcreteUse>)=>store({mixes,uses:uses.map((u,k)=>k===i?{...u,...patch}:u)});
 const removeMix=(i:number)=>{const id=mixes[i].id;store({mixes:mixes.filter((_,k)=>k!==i),uses:uses.filter(u=>u.mix!==id)});};
 const num=(v:number,on:(v:number)=>void,label:string,step:number|'any'=1)=><NumInput aria-label={label} type="number" min={0} step={step} style={{width:78}} value={v} onChange={e=>on(Math.max(0,Number(e.target.value)||0))}/>;
 return <section className="concrete-mixes" aria-label="กำลังอัดคอนกรีต (Concrete Mix)"><h3>คอนกรีต · กำลังอัดตามแบบ (Concrete Mix)</h3>
  <p>ตาราง Schedule of cylindrical compressive strength ใน General Notes · ชิ้นส่วนใช้ Mix ตามประเภท (แถวแรกที่ตรง) หรือเลือก Mix เองที่หน้าชิ้นส่วน · f'c ของ Mix ใช้เลือกตารางระยะทาบ (350 ksc ≈ 35 MPa, 450 ksc ≈ 45 MPa) และแสดงในแบบ A3 / คำอธิบาย BOQ</p>
  <fieldset disabled={disabled} className="profile-fields">
   <div className="table-scroll"><table className="concrete-mix-table"><thead><tr><th>รหัส</th><th>ชื่อ Mix</th><th>f'c 28 วัน (ksc)</th><th>14 วัน (ksc)</th><th>7 วัน (ksc)</th><th>W/C ไม่เกิน</th><th>Shrinkage 3 วัน (µε)</th><th>หมายเหตุ</th><th/></tr></thead>
    <tbody>{mixes.map((m,i)=><tr key={i}>
     <td><input aria-label="รหัส Mix" maxLength={24} style={{width:70}} value={m.id} onChange={e=>{const id=e.target.value.trim();store({mixes:mixes.map((x,k)=>k===i?{...x,id}:x),uses:uses.map(u=>u.mix===m.id?{...u,mix:id}:u)});}}/></td>
     <td><input aria-label="ชื่อ Mix" maxLength={80} value={m.name} onChange={e=>setMix(i,{name:e.target.value})}/></td>
     <td>{num(m.fc,v=>setMix(i,{fc:v}),"f'c 28 วัน")}<small className="muted"> ≈ {Math.round(kscToMpa(m.fc)*10)/10} MPa</small></td>
     <td>{num(m.fc14,v=>setMix(i,{fc14:v}),'กำลังอัด 14 วัน')}</td><td>{num(m.fc7,v=>setMix(i,{fc7:v}),'กำลังอัด 7 วัน')}</td>
     <td>{num(m.wc,v=>setMix(i,{wc:Math.min(1,v)}),'W/C',.01)}</td><td>{num(m.shrinkage,v=>setMix(i,{shrinkage:v}),'Shrinkage')}</td>
     <td><input aria-label="หมายเหตุ Mix" maxLength={300} value={m.note} onChange={e=>setMix(i,{note:e.target.value})}/></td>
     <td><button type="button" className="icon-button" title="ลบ Mix (และแถวการใช้งานของ Mix นี้)" onClick={()=>removeMix(i)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
   <button type="button" onClick={()=>store({mixes:[...mixes,blankMix(mixes)],uses})} disabled={mixes.length>=20}><Plus size={14}/>เพิ่ม Mix</button>
   {mixes.length>0&&<><h4>ประเภทชิ้นส่วน → Mix</h4>
    <div className="table-scroll"><table className="concrete-mix-table"><thead><tr><th>ประเภทชิ้นส่วน (ตามแบบ)</th><th>ใช้กับหมวดชิ้นส่วน</th><th>Mix</th><th/></tr></thead>
     <tbody>{uses.map((u,i)=><tr key={i}>
      <td><input aria-label="ประเภทชิ้นส่วน" maxLength={300} value={u.description} onChange={e=>setUse(i,{description:e.target.value})}/></td>
      <td className="concrete-cats">{concreteCategories.map(k=><label key={k} className="check"><input type="checkbox" checked={u.categories.includes(k)} onChange={e=>setUse(i,{categories:e.target.checked?[...u.categories,k]:u.categories.filter(x=>x!==k)})}/>{concreteCategoryLabels[k]}</label>)}</td>
      <td><select aria-label="Mix" value={u.mix} onChange={e=>setUse(i,{mix:e.target.value})}>{mixes.map(m=><option key={m.id} value={m.id}>{m.name} ({m.fc} ksc)</option>)}</select></td>
      <td><button type="button" className="icon-button" title="ลบแถว" onClick={()=>store({mixes,uses:uses.filter((_,k)=>k!==i)})}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
    <button type="button" onClick={()=>store({mixes,uses:[...uses,{id:newId('use',uses),description:'',categories:[],mix:mixes[0].id}]})} disabled={uses.length>=40}><Plus size={14}/>เพิ่มประเภทชิ้นส่วน</button>
    <p className="muted">หมวดที่ไม่มีแถวใด ใช้ f'c ของโครงการ · ชิ้นส่วนที่ต่างจากหมวด (เช่น คาน/พื้นของอาคาร DC ใช้ Mix 1) เลือก Mix ที่หน้าชิ้นส่วน</p></>}
  </fieldset>
  {check&&!check.success&&<p role="alert" className="notice warning">{check.error.issues[0]?.message||'ข้อมูล Mix ไม่ถูกต้อง'} · รหัส Mix ต้องไม่ซ้ำ และ f'c อย่างน้อย 50 ksc</p>}
 </section>;
}
