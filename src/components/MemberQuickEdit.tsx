import {useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import {labels,type Member} from '../domain/model';
import {command} from '../data/firebase';
import {Field,Modal} from './EditorControls';

/** Edit a member's number, description and locations / quantities straight from the member list. */
export function MemberQuickEdit({member,projectId,run,onClose}:{member:Member;projectId:string;run:(f:()=>Promise<unknown>,m?:string)=>Promise<void>;onClose:()=>void}){
 const [code,setCode]=useState(member.code),[description,setDescription]=useState(member.description),[rows,setRows]=useState(member.occurrences);
 const total=rows.reduce((n,o)=>n+(Number(o.quantity)||0),0),valid=code.trim().length>0&&code.trim().length<=50&&rows.length>0;
 const put=(id:string,patch:Partial<Member['occurrences'][number]>)=>setRows(rows.map(o=>o.id===id?{...o,...patch}:o));
 const save=()=>run(async()=>{await command('saveMember',projectId,{member:{...member,code:code.trim(),description:description.trim(),occurrences:rows}});onClose();},`บันทึก ${code.trim()} แล้ว`);
 return <Modal title={`แก้ไขสมาชิก · ${member.code}`} onClose={onClose}>
  <form className="member-quick-edit" onSubmit={e=>{e.preventDefault();if(valid)void save();}}>
   <div className="form-grid"><Field label="Member no. (ชื่อ / เบอร์สมาชิก)" value={code} onChange={v=>setCode(String(v).slice(0,50))}/><label className="field"><span>ประเภท</span><input value={labels[member.category]} disabled/></label></div>
   <label className="field full"><span>Description (คำอธิบาย)</span><textarea rows={2} maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="เช่น ฐานรากเสาเข็ม 2 ต้น หล่อรวมพื้น"/></label>
   <h3>ตำแหน่งและจำนวน · รวม {total.toLocaleString()} ชิ้น</h3>
   <div className="table-scroll"><table className="occurrence-table"><thead><tr><th>Zone</th><th>ชั้น</th><th>Grid</th><th className="num">จำนวน</th><th/></tr></thead><tbody>{rows.map(o=><tr key={o.id}>
    {(['zone','floor','grid'] as const).map(k=><td key={k}><input aria-label={k} maxLength={80} value={o[k]} onChange={e=>put(o.id,{[k]:e.target.value})}/></td>)}
    <td><input aria-label="จำนวน" type="number" min={1} value={o.quantity} onChange={e=>put(o.id,{quantity:Math.max(1,Math.min(100000,Math.trunc(Number(e.target.value)||1)))})}/></td>
    <td><button type="button" aria-label="ลบตำแหน่ง" disabled={rows.length===1} onClick={()=>setRows(rows.filter(n=>n.id!==o.id))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
   <button type="button" disabled={rows.length>=1000} onClick={()=>setRows([...rows,{id:crypto.randomUUID(),zone:rows.at(-1)?.zone||'',floor:rows.at(-1)?.floor||'',grid:'',quantity:1}])}><Plus size={14}/>เพิ่มตำแหน่ง</button>
   <p className="muted">มิติ เหล็กเสริม และ Bar list แก้ในหน้ารายละเอียดของสมาชิก · การบันทึกเปลี่ยนสถานะเป็น Draft (ต้องตรวจใหม่)</p>
   <footer className="actions"><button type="button" onClick={onClose}>ยกเลิก</button><button className="primary" disabled={!valid}>บันทึกการแก้ไข</button></footer>
  </form>
 </Modal>;
}
