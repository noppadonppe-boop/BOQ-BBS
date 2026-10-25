import {useEffect,useState} from 'react';
import type {Attachment,ExportScope,Member,Project,Revision,RevisionState,SnapshotBundle} from '../domain/model';
import {drawingExportPlan,exportFormats,workingExportInput} from '../domain/drawingExportPlan';
import {scopeLabel} from '../domain/exportScope';
import {exportFile} from '../data/exports';
import {digestData} from '../data/snapshots';
import {loadPublishedRevision} from '../data/publishedRevision';
import {publicationLabel,revisionPreviewKey} from '../domain/publication';
import {Modal} from './EditorControls';
import {QuantityReport,ScopeControls} from './QuantityReport';

type Props={project:Project;members:Member[];attachments:Attachment[];revisions:Revision[];states:RevisionState[];initialRevisionId?:string;initialScope?:ExportScope;run:any;onClose:()=>void};
export function DrawingExportComposer({project,members,attachments,revisions,states,initialRevisionId='',initialScope={},run,onClose}:Props){
 const [working,setWorking]=useState(()=>workingExportInput(project,members,attachments));
 const [sourceId,setSourceId]=useState(initialRevisionId),[scope,setScope]=useState<ExportScope>(()=>structuredClone(initialScope));
 const [formatId,setFormatId]=useState('schedule-v1'),[paper,setPaper]=useState<'A3'|'A1'>('A3'),[busy,setBusy]=useState(false);
 const [saved,setSaved]=useState<{id:string;digest:string;stateDigest:string;key:string;bundle:SnapshotBundle}|null>(null),[loadError,setLoadError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;setSaved(null);setLoadError('');
  if(sourceId){const record=revisions.find(r=>r.id===sourceId),state=states.find(s=>s.id===sourceId);
   if(!record||!state)setLoadError('ยังโหลด Revision หรือสถานะไม่ครบ ให้โหลดฉบับนี้อีกครั้ง');
   else Promise.race([loadPublishedRevision(project.id,record,state),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('อ่านชุดข้อมูลไม่สำเร็จภายใน 20 วินาที ตรวจการเชื่อมต่อแล้วโหลดฉบับนี้อีกครั้ง')),20000);})]).then(async bundle=>{const stateDigest=await digestData(state);if(!cancelled)setSaved({id:record.id,digest:record.digest,stateDigest,key:revisionPreviewKey(project.id,record,state),bundle});}).catch(e=>{if(!cancelled)setLoadError(e.message);}).finally(()=>clearTimeout(timer));
  }
  return ()=>{cancelled=true;clearTimeout(timer);};
  // Loaded inputs stay pinned until the user selects a source or explicitly reloads it.
 },[project.id,sourceId,refresh]);
 const input=sourceId?saved?.id===sourceId?saved.bundle:undefined:working;
 const currentRevision=revisions.find(r=>r.id===sourceId),currentState=states.find(s=>s.id===sourceId);
 const stale=sourceId?!!saved&&saved.key!==revisionPreviewKey(project.id,currentRevision,currentState):working.project.id!==project.id||working.version!==project.version;
 let plan:ReturnType<typeof drawingExportPlan>|undefined,problem='';
 if(input)try{plan=drawingExportPlan(input,scope,formatId,paper);}catch(e){problem=(e as Error).message;}
 const format=exportFormats.find(f=>f.id===formatId)!;
 const reload=()=>{if(sourceId)setRefresh(n=>n+1);else setWorking(workingExportInput(project,members,attachments));};
 const create=async()=>{
  if(!plan||!input||stale||busy)return;
  const selectedPlan=plan,basis=sourceId?{expectedRevisionDigest:saved!.digest,expectedRevisionStatus:input.status,expectedRevisionStateDigest:saved!.stateDigest}:{expectedVersion:input.version};
  setBusy(true);
  try{await run(async()=>{await exportFile(project.id,selectedPlan.format.kind,selectedPlan.size,selectedPlan.bundle.scope,sourceId||undefined,selectedPlan.format.layout,basis);onClose();},'สร้างไฟล์จากชุดข้อมูลที่ตรวจแล้ว');}finally{setBusy(false);}
 };
 return <Modal title="สร้างไฟล์ส่งออก" onClose={()=>{if(!busy)onClose();}}><div className="export-composer" aria-busy={busy}>
  <p className="muted">เลือกชุดข้อมูล ขอบเขต และรูปแบบ แล้วตรวจปริมาณก่อนสร้างไฟล์</p>
  <fieldset disabled={busy} className="profile-fields">
   <h3>1 · ชุดข้อมูล</h3><label className="field"><span>ข้อมูลที่ใช้ส่งออก</span><select aria-label="ข้อมูลที่ใช้ส่งออก" value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">ข้อมูลทำงาน · Draft</option>{[...revisions].sort((a,b)=>b.number.localeCompare(a.number)).map(r=><option key={r.id} value={r.id}>{r.number} · {states.find(s=>s.id===r.id)?.status||'กำลังโหลดสถานะ'} · รุ่น {r.sourceVersion}</option>)}</select></label>
   {loadError&&<p role="alert" className="notice danger">{loadError}</p>}
   {stale&&<p role="alert" className="notice warning">{sourceId?'Revision หรือสถานะเปลี่ยนจากตัวอย่าง':'ข้อมูลทำงานเปลี่ยนจากตัวอย่าง'} · โหลดข้อมูลอีกครั้งแล้วตรวจขอบเขตก่อนสร้างไฟล์</p>}
   <div className="actions export-source-info"><span className="badge">{input?`${input.revisionNumber||'ข้อมูลทำงาน'} · ${input.status} · รุ่น ${input.version}`:'กำลังโหลดชุดข้อมูล…'}</span><button onClick={reload}>{sourceId?'โหลดฉบับนี้อีกครั้ง':'โหลดข้อมูลทำงานล่าสุด'}</button></div>
   {input&&<>
    <h3>2 · ขอบเขตส่งออก</h3><ScopeControls members={input.members} locations={input.project.locations} scope={scope} onChange={setScope} prefix="ส่งออก" showGroup={['excel','boq'].includes(format.kind)}/>
    <p className="scope-description">ขอบเขต: <strong>{scopeLabel(scope,input.members)}</strong></p>
    <h3>3 · รูปแบบไฟล์</h3><div className="form-grid"><label className="field"><span>รูปแบบไฟล์ส่งออก</span><select aria-label="รูปแบบไฟล์ส่งออก" value={formatId} onChange={e=>setFormatId(e.target.value)}><optgroup label="รูปแบบหลัก">{exportFormats.slice(0,5).map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</optgroup><optgroup label="รายละเอียดเหล็กเพิ่มเติม">{exportFormats.slice(5).map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</optgroup></select></label><label className="field"><span>ขนาดกระดาษส่งออก</span>{format.kind==='drawing'?<select aria-label="ขนาดกระดาษส่งออก" value={paper} onChange={e=>setPaper(e.target.value as 'A3'|'A1')}><option>A3</option><option>A1</option></select>:<input aria-label="ขนาดกระดาษส่งออก" readOnly value={format.kind==='schedule'?'A4':format.kind==='excel'?'A3 · หน้าพิมพ์ใน Excel':'A3'}/>}</label></div>
    {problem&&<p role="alert" className="notice danger">{problem}</p>}
    {plan&&<section className="export-preview" aria-label="ตัวอย่างชุดส่งออก"><h3>4 · ตรวจชุดส่งออก</h3><QuantityReport bundle={plan.bundle}/>
     <p className="muted">{plan.format.label} · {plan.size} · {plan.bundle.project.drawingProfile?'กรอบชื่อแบบของชุดข้อมูลนี้':'กรอบชื่อแบบทั่วไปของชุดข้อมูลนี้'}</p>
     {!plan.quantityReview.complete&&['drawing','schedule','excel'].includes(plan.format.kind)&&<p className="notice warning" data-fabrication-input-preview>มิติ/จำนวนยังชั่วคราว {plan.quantityReview.pending.length} สมาชิก · ชุดแบบและตารางตัดจะมีหน้าตรวจปริมาณและข้อความเตือน ตัวเลขเป็นค่าประกอบรอยืนยัน ยังใช้ผลิตไม่ได้ · Excel มี BBS Quantity Review</p>}
     {plan.references.length>0&&<details><summary>เลขแบบในชุด {plan.references.length} รายการ</summary><div className="table-scroll"><table><thead><tr><th>สมาชิก</th><th>เลขแบบ</th><th>Revision</th><th>ชื่อแบบ</th></tr></thead><tbody>{plan.references.map(r=><tr key={r.number}><td>{r.memberCode}</td><td>{r.number}</td><td>{r.revision}</td><td>{r.title}</td></tr>)}</tbody></table></div></details>}
     {!!plan.sources.length&&<p className="muted">แบบต้นทาง {new Set(plan.sources.map(s=>s.attachment.id)).size} ไฟล์ · รูปอ้างอิง {plan.sources.length} แผ่น · ตรวจไฟล์ต้นทางและ checksum ขณะสร้าง PDF</p>}
    </section>}
   </>}
  </fieldset>
  <p className={input?.status==='Issued'?'notice':'notice warning'}>{input?publicationLabel(input):'กำลังตรวจสถานะและหลักฐานของฉบับ'}{input?.status==='Superseded'?' · ส่งออกเพื่ออ้างอิงประวัติเท่านั้น':input?.status==='Issued'?' · ผูกกับทะเบียนออกฉบับเดิม การสร้างไฟล์ไม่อนุมัติวิศวกรรมเพิ่ม':' · ยังรอตรวจรับกฎวิศวกรรมก่อนออก Issued'}</p>
  <footer><button disabled={busy} onClick={onClose}>ยกเลิก</button><button className="primary" disabled={!plan||stale||busy} onClick={create}>{busy?'กำลังสร้างไฟล์…':`สร้างไฟล์ ${plan?.format.kind==='excel'?'Excel':'PDF'}`}</button></footer>
 </div></Modal>;
}
