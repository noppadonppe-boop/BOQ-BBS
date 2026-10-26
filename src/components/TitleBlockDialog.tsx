import {useState} from 'react';
import {ArrowLeft,ArrowRight,Plus,X} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {command} from '../data/firebase';
import {composeDrawingNumber,MAX_DRAWING_PARTS,sheetSetupOf,viewScaleChoices,viewScaleLabel,type SheetSetup,type ViewScale} from '../domain/drawingStandard';
import {planDrawingNumbers} from '../domain/drawingNumbers';
import {Field,Modal} from './EditorControls';

type Fields={name:string;location:string;owner:string;contractor:string;subcontractor:string;company:string;drawnBy:string;checkedBy:string;approvedBy:string};
const projectLabels={name:'ชื่อโครงการ (Project Name)',location:'ที่ตั้ง (Location)',owner:'Client',contractor:'Contractor',subcontractor:'Sub Contract'};
const blockLabels={company:'บริษัท / ผู้ออกแบบ',drawnBy:'เขียนแบบ',checkedBy:'ตรวจ',approvedBy:'อนุมัติ'};
const limits:Record<keyof Fields,number>={name:200,location:300,owner:200,contractor:200,subcontractor:200,company:200,drawnBy:120,checkedBy:120,approvedBy:120};
const fieldsOf=(p:Project):Fields=>({name:p.name,location:p.location||'',owner:p.owner||'',contractor:p.contractor||'',subcontractor:p.subcontractor||'',company:p.titleBlock.company||'',drawnBy:p.titleBlock.drawnBy||'',checkedBy:p.titleBlock.checkedBy||'',approvedBy:p.titleBlock.approvedBy||''});
// default layout Prefix-Suffix1-Suffix2-BBS for projects that have not set their own segments yet
const initialParts=(p:Project)=>p.titleBlock.drawingParts?[...p.titleBlock.drawingParts]:[p.titleBlock.drawingPrefix||p.code,p.titleBlock.drawingSuffix||'','','BBS'];
const partLabel=(i:number,n:number,v:string)=>i===0?'Prefix':v.trim().toUpperCase()==='BBS'&&i===n-1?'ประเภทแบบ':`Suffix ${i}`;

/** Project-wide drawing title block (A3 BBS sheet, PDFs) and BBS drawing numbers Segment-…-Run(001–999)-R(0–9).
 * Saving keeps the owner drawing profile in step (its texts take precedence on the sheet) and renumbers members:
 * runs stay, members without a number get the next run, numbers follow the new segments. */
export function TitleBlockDialog({project,members,run,onClose}:{project:Project;members:Member[];run:(f:()=>Promise<unknown>,m?:string)=>Promise<void>;onClose:()=>void}){
 const [initial]=useState(()=>({fields:fieldsOf(project),parts:initialParts(project),sheet:sheetSetupOf(project)}));
 const [f,setF]=useState<Fields>(initial.fields),[parts,setParts]=useState<string[]>(initial.parts),[sheet,setSheet]=useState<SheetSetup>(initial.sheet),[saving,setSaving]=useState(false);
 const set=(k:keyof Fields,v:string)=>setF({...f,[k]:v.slice(0,limits[k])});
 const setPart=(i:number,v:string)=>setParts(parts.map((p,j)=>j===i?v.slice(0,50):p));
 const move=(i:number,d:number)=>{const n=[...parts];[n[i],n[i+d]]=[n[i+d],n[i]];setParts(n);};
 // a new segment goes before a trailing "BBS" so the layout stays …-Suffix n-BBS-Run-Rev
 const add=()=>{const at=parts.length&&parts[parts.length-1].trim().toUpperCase()==='BBS'?parts.length-1:parts.length;setParts([...parts.slice(0,at),'',...parts.slice(at)]);};
 const changed=JSON.stringify({fields:f,parts,sheet})!==JSON.stringify(initial);
 // closing with unsaved text asks first (× / outside click / ยกเลิก)
 const close=()=>{if(!changed||window.confirm('ยังไม่ได้บันทึก Title block · ปิดและทิ้งข้อความที่แก้?'))onClose();};
 const cleanParts=parts.map(s=>s.trim());
 const tb={...project.titleBlock,drawingParts:cleanParts,drawingPrefix:cleanParts[0]||'',drawingSuffix:cleanParts[1]||''},next={code:project.code,titleBlock:tb};
 let plan:ReturnType<typeof planDrawingNumbers>=[],planError='';
 try{plan=planDrawingNumbers(next,members);}catch(e:any){planError=e?.message||String(e);}
 const fresh=plan.filter(c=>!c.member.drawingSetup?.run).length,manual=members.filter(m=>m.drawingSetup?.number&&!m.drawingSetup.run).length;
 const sample=members.find(m=>m.drawingSetup?.run),sampleNo=composeDrawingNumber(next,sample?.drawingSetup?.run||1,sample?.drawingSetup?.rev||0);
 const tooLong=sampleNo.length>80;
 const save=()=>{setSaving(true);return run(async()=>{
  const {company,drawnBy,checkedBy,approvedBy,...fields}=f,trim=(s:string)=>s.trim(),prof=project.drawingProfile;
  const drawingProfile=prof?{...prof,projectName:trim(fields.name).slice(0,80),company:trim(company).slice(0,80),owner:trim(fields.owner).slice(0,80),location:trim(fields.location).slice(0,80),preparedBy:trim(drawnBy).slice(0,60),checkedBy:trim(checkedBy).slice(0,60)}:prof;
  await command('saveProject',project.id,{project:{...project,...fields,name:trim(fields.name),titleBlock:{...tb,company,drawnBy,checkedBy,approvedBy,sheetSize:sheet.size,viewScale:sheet.scale,barDisplay:sheet.bars,planSplit:sheet.split,markGutter:sheet.gutter},drawingProfile},version:project.version});
  await command('renumberDrawings',project.id,{parts:cleanParts});
  onClose();
 },'บันทึก Title block และเลขแบบ BBS แล้ว').finally(()=>setSaving(false));};
 const grid:[string,string][][]=[[['Client',f.owner||'—'],['Contractor',f.contractor||'—'],['Sub Contract',f.subcontractor||'—']],[['เขียนแบบ',f.drawnBy],['ตรวจ',f.checkedBy],['อนุมัติ',f.approvedBy]],[['เลขที่แบบ',sampleNo],['Revision',sampleNo.split('-').pop()!],['วันที่',new Date().toISOString().slice(0,10)]]];
 return <Modal title={`Drawing Title block · ${project.code}`} onClose={close}>
  <form onSubmit={e=>{e.preventDefault();if(!saving)void save();}}>
   <p className="muted">ข้อความในกรอบชื่อแบบของทุกแผ่น (แบบ BBS A3, PDF ตัด/ดัดเหล็ก, ชุดส่งตรวจ) · บันทึกแล้วแบบที่เปิดอยู่อัปเดตทันที</p>
   <h3>ข้อมูลโครงการบนกรอบ</h3>
   <div className="form-grid">{(Object.keys(projectLabels) as (keyof typeof projectLabels)[]).map(k=><Field key={k} label={projectLabels[k]} value={f[k]} onChange={v=>set(k,String(v))}/>)}</div>
   <h3>ผู้จัดทำ</h3>
   <div className="form-grid">{(Object.keys(blockLabels) as (keyof typeof blockLabels)[]).map(k=><Field key={k} label={blockLabels[k]} value={f[k]} onChange={v=>set(k,String(v))}/>)}</div>
   <h3>กระดาษ มาตราส่วน และรูปแบบรูป (ค่าเริ่มต้นของแบบ BBS)</h3>
   <div className="form-grid">
    <div className="field"><span>ขนาดกระดาษเริ่มต้น</span><span className="segmented" role="group" aria-label="ขนาดกระดาษเริ่มต้น">{(['A3','A2'] as const).map(z=><button key={z} type="button" className={sheet.size===z?'active':''} aria-pressed={sheet.size===z} onClick={()=>setSheet({...sheet,size:z})}>{z==='A3'?'A3 · 420 × 297':'A2 · 594 × 420'}</button>)}</span></div>
    <label className="field"><span>มาตราส่วนรูปเริ่มต้น</span><select value={String(sheet.scale)} onChange={e=>setSheet({...sheet,scale:e.target.value==='auto'?'auto':Number(e.target.value)})}>{(['auto',...viewScaleChoices] as ViewScale[]).map(v=><option key={String(v)} value={String(v)}>{v==='auto'?'Auto (มาตรฐานที่พอดีกรอบ)':viewScaleLabel(v)}</option>)}</select></label>
    <label className="field"><span>เหล็กในแปลน</span><select value={sheet.bars} onChange={e=>setSheet({...sheet,bars:e.target.value==='all'?'all':'representative'})}><option value="representative">ตัวแทน + ช่วงกระจาย (F01 36-DB32@250)</option><option value="all">ทุกเส้น</option></select></label>
    <div className="field"><span>รูปแบบรูป</span><label className="check"><input type="checkbox" checked={sheet.split} onChange={e=>setSheet({...sheet,split:e.target.checked})}/>แยกแปลนเหล็กล่าง / บน (แนะนำ A2)</label><label className="check"><input type="checkbox" checked={sheet.gutter} onChange={e=>setSheet({...sheet,gutter:e.target.checked})}/>ป้าย Mark นอกรูป (เส้นชี้ไม่ซ้อนกัน)</label></div>
   </div>
   <p className="muted">ใช้กับทุกสมาชิกที่ไม่ได้เลือกเอง · เปลี่ยนรายสมาชิกได้ที่แถบเครื่องมือ “แบบ & BBS” · Auto = มาตราส่วนมาตรฐาน (1:20, 1:25, 1:50, 1:75, 1:100 …) ที่ใหญ่ที่สุดที่พอดีกรอบ</p>
   <h3>เลขแบบ BBS · Prefix-Suffix…-BBS-Run(001–999)-R(0–9)</h3>
   <div className="drawing-parts">
    {parts.map((v,i)=><div className="drawing-part" key={i}>
     <label className="field"><span>{partLabel(i,parts.length,v)}</span><input aria-label={`ช่องเลขแบบ ${i+1}`} value={v} maxLength={50} onChange={e=>setPart(i,e.target.value)}/></label>
     <span className="drawing-part-tools">
      <button type="button" disabled={i===0} onClick={()=>move(i,-1)} aria-label="เลื่อนไปซ้าย" title="เลื่อนไปซ้าย"><ArrowLeft size={13}/></button>
      <button type="button" disabled={i===parts.length-1} onClick={()=>move(i,1)} aria-label="เลื่อนไปขวา" title="เลื่อนไปขวา"><ArrowRight size={13}/></button>
      <button type="button" className="danger-text" disabled={parts.length<=1} onClick={()=>setParts(parts.filter((_,j)=>j!==i))} aria-label="ลบช่อง" title="ลบช่อง"><X size={13}/></button>
     </span>
    </div>)}
    <div className="drawing-part fixed"><label className="field"><span>Run no.</span><input disabled value="001–999"/></label></div>
    <div className="drawing-part fixed"><label className="field"><span>Rev.</span><input disabled value="R0–R9"/></label></div>
   </div>
   <button type="button" disabled={parts.length>=MAX_DRAWING_PARTS} onClick={add}><Plus size={14}/>เพิ่มช่อง</button>
   <p className="muted">ช่องที่เว้นว่างจะไม่แสดงในเลขแบบ · Run no. อัตโนมัติ (เรียงตามหมวด / Member no.) · Rev. ของแต่ละสมาชิก · แก้ Run / Rev ได้ที่ปุ่ม “เลขและชื่อแบบ BBS” ในหน้าสมาชิก · Run no. หรือเลขแบบซ้ำบันทึกไม่ได้</p>
   <p>ตัวอย่าง: <b>{sampleNo}</b>{plan.length>0&&<span className="muted"> · บันทึกแล้วปรับเลขแบบ {plan.length} สมาชิก{fresh?` (ให้ Run no. ใหม่ ${fresh})`:''}</span>}</p>
   {tooLong&&<p role="alert" className="notice danger">เลขแบบยาวเกิน 80 อักษร · ย่อหรือลบบางช่อง</p>}
   {planError&&<p role="alert" className="notice danger">{planError} · แก้ Run no. ในหน้าสมาชิกก่อนบันทึก</p>}
   {manual>0&&<p className="notice warning">{manual} สมาชิกใช้เลขแบบที่พิมพ์เอง · เลขเหล่านั้นไม่เปลี่ยนตามช่องเลขแบบ (เปลี่ยนเป็นอัตโนมัติได้ในหน้าสมาชิก)</p>}
   <h3>ตัวอย่างกรอบ</h3>
   <div className="title-block-preview" aria-label="ตัวอย่าง Title block">
    <div className="tb-row"><div><small>บริษัท / ผู้ออกแบบ</small><b>{f.company||f.contractor||'—'}</b></div></div>
    <div className="tb-row"><div><small>โครงการ</small>{project.code} · {f.name}{f.location?` · ${f.location}`:''}</div></div>
    {grid.map((row,i)=><div className="tb-row three" key={i}>{row.map(([l,v])=><div key={l}><small>{l}</small>{v||' '}</div>)}</div>)}
   </div>
   {project.drawingProfile&&<p className="notice">โครงการใช้กรอบชื่อแบบกำหนดเอง (หน้า โครงการ & สำรองข้อมูล) · ชื่อโครงการ บริษัท เจ้าของ ที่ตั้ง ผู้เขียนแบบ และผู้ตรวจในกรอบนั้นจะอัปเดตตามนี้ด้วย</p>}
   <footer><button type="button" onClick={close}>ยกเลิก</button><button className="primary" disabled={saving||!f.name.trim()||!!planError||tooLong}>{saving?'กำลังบันทึก…':'บันทึก Title block'}</button></footer>
  </form>
 </Modal>;
}
