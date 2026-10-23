import {useState} from 'react';
import {BadgeCheck,ClipboardCheck,Crown,Eye,FolderCog,PencilRuler,RotateCcw,ShieldCheck,UserRound} from 'lucide-react';
import {Modal} from './EditorControls';

type Card={id:string;name:string;sub:string;tone:string;icon:typeof Crown;text:string;can:string[]};
const systemRoles:Card[]=[
 {id:'master',name:'MasterAdmin',sub:'ผู้ดูแลระบบ',tone:'violet',icon:Crown,text:'ดูแลระบบทั้งหมดและทุกโครงการ',can:['อนุมัติ / ปฏิเสธผู้สมัครใหม่','กำหนด Role และโครงการให้ผู้ใช้','จัดการ API (คีย์ AI)','ทำได้ทุกอย่างในทุกโครงการ']},
 {id:'project-admin',name:'ProjectAdmin',sub:'ผู้ดูแลโครงการ (Admin เดิม)',tone:'blue',icon:FolderCog,text:'ดูแลโครงการที่ได้รับมอบหมาย',can:['สร้างโครงการ','จัดการ General Spec ส่วนกลาง','ข้อมูลโครงการ Title block ภาษาแบบ','ทีม สิทธิ์ Backup / Restore']},
 {id:'staff',name:'Staff',sub:'ผู้ใช้งานทั่วไป',tone:'grey',icon:UserRound,text:'สมัครแล้ว รอกำหนด Role งาน',can:['อ่านข้อมูลในโครงการที่ได้รับมอบหมาย','ได้สิทธิ์เพิ่มเมื่อกำหนด Role งาน']},
];
const projectRoles:Card[]=[
 {id:'qs',name:'ผู้ถอดปริมาณ',sub:'QS · เขียนแบบ (Drawn)',tone:'teal',icon:PencilRuler,text:'สร้างและแก้สมาชิก BOQ / BBS',can:['เพิ่ม / แก้ / ทำสำเนาสมาชิก','อัปโหลดแบบต้นทาง อ่านแบบด้วย AI','ยืนยันตำแหน่งเหล็กและที่มาปริมาณ','ตัดเหล็ก สต็อก และเตรียมชุดส่งตรวจ']},
 {id:'checker',name:'ผู้ตรวจ',sub:'Checker',tone:'amber',icon:ClipboardCheck,text:'ตรวจความถูกต้องของแบบและปริมาณ',can:['ตรวจสมาชิก → Checked','ส่งกลับ Draft พร้อมหมายเหตุ','ตรึง Revision และรันชุดทดสอบ']},
 {id:'approver',name:'ผู้อนุมัติ',sub:'Approver',tone:'green',icon:BadgeCheck,text:'อนุมัติให้ใช้งาน (IFC)',can:['ทุกอย่างที่ผู้ตรวจทำได้','อนุมัติสมาชิก → IFC (ได้ Revision)','อนุมัติ Spec และออกเอกสาร (Issue)']},
 {id:'viewer',name:'ผู้อ่าน',sub:'Viewer',tone:'grey',icon:Eye,text:'ดูข้อมูลและนำไปใช้',can:['ดูสมาชิก BOQ และแบบ','ส่งออก PDF / Excel / DXF']},
];
const matrix:[string,...boolean[]][]=[
 ['ข้อมูลโครงการ Title block ทีม Backup',true,false,false,false,false],
 ['เพิ่ม / แก้ / ลบสมาชิก (เขียนแบบ)',true,true,false,false,false],
 ['แบบต้นทาง Spec ราคา BOQ ตัดเหล็ก',true,true,false,false,false],
 ['ส่งกลับ Draft',true,true,true,true,false],
 ['ตรวจ → Checked',false,false,true,true,false],
 ['อนุมัติ → IFC / ออกเอกสาร',false,false,false,true,false],
 ['ดูและส่งออกไฟล์',true,true,true,true,true],
];
type Step={who:string;tone:string;title:string;text:string;status?:string};
const steps:Step[]=[
 {who:'MasterAdmin',tone:'violet',title:'อนุมัติผู้ใช้',text:'ผู้ใช้สมัครเข้าระบบ · MasterAdmin อนุมัติ กำหนด Role และโครงการ'},
 {who:'ProjectAdmin',tone:'blue',title:'ตั้งค่าโครงการ',text:'สร้างโครงการ เลือก General Spec f\'c / เกรดเหล็ก · ตั้ง Title block เลขแบบ และภาษาแบบ'},
 {who:'ProjectAdmin',tone:'blue',title:'จัดทีม',text:'มอบหมาย QS ผู้ตรวจ และผู้อนุมัติ ในหน้า โครงการ & สำรองข้อมูล'},
 {who:'QS',tone:'teal',title:'รับแบบต้นทาง',text:'อัปโหลด PDF / รูป / DWG-DXF / IFC · ใช้ AI อ่านแบบหรือกรอกเอง',status:'Draft'},
 {who:'QS',tone:'teal',title:'เขียนแบบ & BBS',text:'กรอกมิติ ใส่เหล็กเสริม ตรวจ Bar cut list · ระบบบันทึกชื่อผู้เขียนแบบ (Drawn)',status:'Draft'},
 {who:'QS',tone:'teal',title:'ยืนยันข้อมูล',text:'ยืนยันตำแหน่งเหล็กทุก Mark และที่มาข้อมูลปริมาณ BOQ ก่อนส่งตรวจ',status:'Draft'},
 {who:'ผู้ตรวจ',tone:'amber',title:'ตรวจแบบ',text:'ตรวจแบบ BBS และปริมาณ · ผ่าน → Checked · ไม่ผ่าน → ส่งกลับ Draft พร้อมหมายเหตุ',status:'Checked'},
 {who:'ผู้อนุมัติ',tone:'green',title:'อนุมัติ IFC',text:'อนุมัติให้ใช้งาน → IFC · ได้ Revision R0 และเลขแบบ BBS ใช้ Rev นี้',status:'IFC'},
 {who:'ทุก Role',tone:'grey',title:'นำไปใช้',text:'ส่งออกแบบ A3 PDF / DXF · BOQ Summary แสดงสถานะ IFC · ชุดส่งตรวจ / ออกเอกสาร',status:'IFC'},
 {who:'QS',tone:'teal',title:'ตัดเหล็ก & สต็อก',text:'วางแผนตัดเหล็ก ใช้ปริมาณที่อนุมัติแล้ว',status:'IFC'},
];

/** Role descriptions, permission table and the drawing workflow from user approval to IFC and revisions. */
export function RoleGuide({onClose}:{onClose:()=>void}){
 const [tab,setTab]=useState<'roles'|'workflow'>('roles');
 const card=(c:Card)=><article key={c.id} className={`role-card tone-${c.tone}`}><header><span className="role-icon"><c.icon size={18}/></span><div><b>{c.name}</b><small>{c.sub}</small></div></header><p>{c.text}</p><ul>{c.can.map(t=><li key={t}>{t}</li>)}</ul></article>;
 return <Modal title="Role & Workflow ของระบบ" onClose={onClose}>
  <div className="role-guide">
   <div className="tabs"><button className={tab==='roles'?'active':''} onClick={()=>setTab('roles')}><ShieldCheck size={14}/> Role และสิทธิ์</button><button className={tab==='workflow'?'active':''} onClick={()=>setTab('workflow')}><PencilRuler size={14}/> ขั้นตอนเขียนแบบถึงอนุมัติ</button></div>
   {tab==='roles'?<>
    <h3>Role ระดับระบบ <small className="muted">กำหนดในหน้าจัดการผู้ใช้งาน</small></h3>
    <div className="role-grid">{systemRoles.map(card)}</div>
    <h3>Role ในโครงการ <small className="muted">1 คนมีได้หลาย Role · กำหนดต่อโครงการได้</small></h3>
    <div className="role-grid">{projectRoles.map(card)}</div>
    <h3>ตารางสิทธิ์ในโครงการ</h3>
    <div className="table-scroll"><table className="role-matrix"><thead><tr><th>งาน</th>{['ผู้ดูแลโครงการ','QS','ผู้ตรวจ','ผู้อนุมัติ','ผู้อ่าน'].map(h=><th key={h}>{h}</th>)}</tr></thead>
     <tbody>{matrix.map(([task,...cells])=><tr key={task}><td>{task}</td>{cells.map((ok,i)=><td key={i} className={ok?'yes':'no'}>{ok?'✓':'—'}</td>)}</tr>)}</tbody></table></div>
    <p className="notice">ผู้ดูแลโครงการตรวจหรืออนุมัติเองไม่ได้ ถ้าไม่มี Role ผู้ตรวจ / ผู้อนุมัติเพิ่ม · แยกคนเขียน คนตรวจ และคนอนุมัติ ตามหลักการตรวจสอบแบบ</p>
   </>:<>
    <div className="status-legend"><span className="badge">Draft · กำลังเขียน / แก้ไข</span><span className="badge member-status-checked">Checked · ตรวจแล้ว รออนุมัติ</span><span className="badge member-status-approved">IFC · อนุมัติใช้งาน</span></div>
    <ol className="workflow-flow">{steps.map((s,i)=><li key={i} className={`tone-${s.tone}`}><span className="flow-no">{i+1}</span><div><div className="flow-head"><b>{s.title}</b><span className="flow-who">{s.who}</span>{s.status&&<span className={`badge ${s.status==='IFC'?'member-status-approved':s.status==='Checked'?'member-status-checked':''}`}>{s.status}</span>}</div><p>{s.text}</p></div></li>)}</ol>
    <div className="notice warning revision-loop"><RotateCcw size={16}/><div><b>แก้ไขหลังอนุมัติ (Revision)</b><p>แก้สมาชิกที่เป็น IFC → กลับเป็น Draft ทันที · Revision แสดง R0 → R1 · ทำขั้นตอน 7–8 ใหม่ · อนุมัติแล้วได้ R1 · ทุกการแก้ไข ตรวจ และอนุมัติ ถูกบันทึกในประวัติของสมาชิก (ใคร เมื่อไร หมายเหตุ)</p></div></div>
   </>}
  </div>
 </Modal>;
}
