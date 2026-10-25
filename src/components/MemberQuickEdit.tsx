import {useState} from 'react';
import {labels,type Member} from '../domain/model';
import type {Locations} from '../domain/locations';
import {command} from '../data/firebase';
import {Field,Modal} from './EditorControls';
import {OccurrenceTable} from './LocationPicker';

/** Edit a member's number, description and locations / quantities straight from the member list. */
export function MemberQuickEdit({member,projectId,locations,run,onClose}:{member:Member;projectId:string;locations?:Locations;run:(f:()=>Promise<unknown>,m?:string)=>Promise<void>;onClose:()=>void}){
 const [code,setCode]=useState(member.code),[description,setDescription]=useState(member.description),[rows,setRows]=useState(member.occurrences);
 const total=rows.reduce((n,o)=>n+(Number(o.quantity)||0),0),valid=code.trim().length>0&&code.trim().length<=50&&rows.length>0;
 const save=()=>run(async()=>{await command('saveMember',projectId,{member:{...member,code:code.trim(),description:description.trim(),occurrences:rows}});onClose();},`บันทึก ${code.trim()} แล้ว`);
 return <Modal title={`แก้ไขสมาชิก · ${member.code}`} onClose={onClose}>
  <form className="member-quick-edit" onSubmit={e=>{e.preventDefault();if(valid)void save();}}>
   <div className="form-grid"><Field label="Member no. (ชื่อ / เบอร์สมาชิก)" value={code} onChange={v=>setCode(String(v).slice(0,50))}/><label className="field"><span>ประเภท</span><input value={labels[member.category]} disabled/></label></div>
   <label className="field full"><span>Description (คำอธิบาย)</span><textarea rows={2} maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="เช่น ฐานรากเสาเข็ม 2 ต้น หล่อรวมพื้น"/></label>
   <h3>ตำแหน่งและจำนวน · รวม {total.toLocaleString()} ชิ้น</h3>
   <OccurrenceTable locations={locations} rows={rows} onChange={setRows}/>
   <p className="muted">มิติ เหล็กเสริม และ Bar list แก้ในหน้ารายละเอียดของสมาชิก · การบันทึกเปลี่ยนสถานะเป็น Draft (ต้องตรวจใหม่)</p>
   <footer className="actions"><button type="button" onClick={onClose}>ยกเลิก</button><button className="primary" disabled={!valid}>บันทึกการแก้ไข</button></footer>
  </form>
 </Modal>;
}
