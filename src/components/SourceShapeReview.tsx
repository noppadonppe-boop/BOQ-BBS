import {sourceRowPage} from '../domain/sourceSchedule';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Attachment,Member,Spec} from '../domain/model';
import {sourceShapeReferenceSchema,regionFromCorners,type SourceShapeReference} from '../domain/sourceRegions';
import {SourceRegionReader} from '../data/sourceRegionImages';
import {auth} from '../data/firebase';
import {useAuth} from '../auth/AuthContext';
import {Modal} from './EditorControls';
import {DetailSketch} from './BarDetail';
import {barDetail,detailParts} from '../domain/barDetails';
import {schedule} from '../domain/engine';

export function SourceRegionPreview({attachment,reference}:{attachment:Attachment;reference:SourceShapeReference}){
 const {firebaseUser}=useAuth(),[actor]=useState(firebaseUser?.uid),[image,setImage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true;const reader=new SourceRegionReader(attachment);setImage('');setError('');
  reader.crop(reference).then(r=>{if(active&&auth.currentUser?.uid===actor)setImage(r.data);}).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));});
  return()=>{active=false;void reader.close();};
 },[attachment.id,attachment.path,attachment.sha256,attachment.pageCount,JSON.stringify(reference),actor]);
 if(firebaseUser?.uid!==actor)return null;
 return error?<p role="alert" className="notice warning">{error}</p>:image?<img className="source-region-image" src={image} alt="รูปดัดจากกรอบที่เลือกในต้นฉบับ"/>:<p role="status">กำลังอ่านรูปต้นทาง…</p>;
}

function SourceShapePicker({attachment,mark,initial,readOnly,onApply,onClose}:{attachment:Attachment;mark:string;initial?:SourceShapeReference;readOnly:boolean;onApply:(r:SourceShapeReference)=>void;onClose:()=>void}){
 const {firebaseUser}=useAuth(),[actor]=useState(firebaseUser?.uid),[basis]=useState(()=>({...attachment})),readerRef=useRef<SourceRegionReader|null>(null);
 const [page,setPage]=useState(initial?.page||1),[zoom,setZoom]=useState(1),[busy,setBusy]=useState(true),[loadedPage,setLoadedPage]=useState(0),[error,setError]=useState(''),[corners,setCorners]=useState<number[][]>([]);
 const [values,setValues]=useState(()=>initial?[initial.rect.x,initial.rect.y,initial.rect.width,initial.rect.height].map(v=>String(v*100)):['','','','']);
 const canvas=useRef<HTMLCanvasElement>(null);
 const stale=attachment.path!==basis.path||attachment.sha256!==basis.sha256||attachment.pageCount!==basis.pageCount||attachment.version!==basis.version;
 const parsed=sourceShapeReferenceSchema.safeParse({sha256:basis.sha256,page,rect:{x:Number(values[0])/100,y:Number(values[1])/100,width:Number(values[2])/100,height:Number(values[3])/100}});
 const selection=values.every(v=>v.trim()!=='')&&parsed.success?parsed.data:undefined;
 useEffect(()=>{if(actor!==firebaseUser?.uid)onClose();},[actor,firebaseUser?.uid,onClose]);
 // Each effect lifetime owns a fresh reader. React StrictMode cleanup/setup
 // must not reuse the reader that was deliberately closed by the first setup.
 useEffect(()=>{const reader=new SourceRegionReader(basis);readerRef.current=reader;return()=>{if(readerRef.current===reader)readerRef.current=null;void reader.close();};},[basis,actor]);
 useEffect(()=>{let active=true;const reader=readerRef.current!;setBusy(true);setLoadedPage(0);setError('');
  reader.page(page).then(image=>{if(active&&canvas.current&&auth.currentUser?.uid===actor){canvas.current.width=image.canvas.width;canvas.current.height=image.canvas.height;canvas.current.getContext('2d')!.drawImage(image.canvas,0,0);setLoadedPage(page);}}).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[basis,page,actor]);
 if(firebaseUser?.uid!==actor)return null;
 const click=(e:React.MouseEvent<HTMLDivElement>)=>{
  if(busy||readOnly||stale||loadedPage!==page)return;
  const r=canvas.current?.getBoundingClientRect();if(!r?.width||!r.height)return;
  const p=[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];if(p.some(n=>n<0||n>1))return;
  if(corners.length!==1){setCorners([p]);return;}
  try{const selected=regionFromCorners(basis.sha256!,page,corners[0],p);setValues([selected.rect.x,selected.rect.y,selected.rect.width,selected.rect.height].map(v=>String(v*100)));setCorners([]);setError('');}catch{setError('เลือกสองมุมให้กรอบมีพื้นที่อย่างน้อย 0.1% ของหน้า');setCorners([]);}
 };
 return createPortal(<Modal title={'รูปดัดต้นทาง · Mark '+mark} onClose={onClose}><div className="source-shape-picker">
  <p>คลิกมุมซ้ายบนและมุมขวาล่างของรูปดัด หรือกรอกขอบเขตเป็นเปอร์เซ็นต์ของหน้าที่เห็น รวมการหมุน PDF แล้ว · รูปนี้เป็นหลักฐานอ้างอิง ไม่สร้างแนวเหล็กหรืออนุมัติรูปดัด</p>
  <p className="muted">{attachment.name} / Rev {attachment.revision}</p>
  <div className="form-grid"><label className="field"><span>หน้ารูปดัด</span><input aria-label="หน้ารูปดัด" type="number" min="1" max={attachment.pageCount} value={page} onChange={e=>{setPage(Number(e.target.value));setCorners([]);setValues(['','','','']);}}/></label><label className="field"><span>ซูมหน้าแบบ</span><select aria-label="ซูมหน้าแบบ" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[1,1.5,2,3,4].map(v=><option key={v} value={v}>{v*100}%</option>)}</select></label></div>
  {stale&&<p role="alert" className="notice warning">ไฟล์ต้นทางเปลี่ยนแล้ว ปิดและเปิดใหม่ก่อนเลือกกรอบ</p>}
  {error&&<p role="alert" className="notice warning">{error}</p>}
  <div className="source-page-scroll"><div className="source-page-select" style={{width:zoom*100+'%'}} onClick={click} data-source-region-page={loadedPage} data-source-region-sha={basis.sha256}><canvas ref={canvas}/><svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">{selection&&<rect x={selection.rect.x*1000} y={selection.rect.y*1000} width={selection.rect.width*1000} height={selection.rect.height*1000}/>} {corners.map((p,i)=><circle key={i} cx={p[0]*1000} cy={p[1]*1000} r="5"/>)}</svg></div></div>
  {busy&&<p role="status">กำลังอ่านหน้าแบบ…</p>}
  <fieldset disabled={readOnly||stale} className="profile-fields"><div className="source-region-coordinates">{['ซ้าย (%)','บน (%)','กว้าง (%)','สูง (%)'].map((label,i)=><label className="field" key={label}><span>{label}</span><input aria-label={label} type="number" min="0" max="100" step="any" value={values[i]} onChange={e=>setValues(v=>v.map((s,k)=>k===i?e.target.value:s))}/></label>)}</div></fieldset>
  {!selection&&<p role="alert" className="notice warning">กรอกกรอบที่มีพื้นที่และอยู่ภายในหน้าแบบทั้งหมด</p>}
  <footer><button type="button" onClick={onClose}>ยกเลิก</button><button type="button" className="primary" disabled={readOnly||stale||busy||loadedPage!==page||!selection} onClick={()=>{if(selection&&auth.currentUser?.uid===actor)onApply(selection);}}>ใช้รูปต้นทางนี้</button></footer>
 </div></Modal>,document.body);
}

export function SourceShapeReview({member,spec,attachment,readOnly,onChange}:{member:Member;spec:Spec;attachment?:Attachment;readOnly:boolean;onChange:(m:Member)=>void}){
 const {firebaseUser}=useAuth(),s=member.sourceSchedule!,[selected,setSelected]=useState(s.rows[0]?.id||''),[picker,setPicker]=useState<{row:string;sha:string;actor:string}|null>(null);
 const row=s.rows.find(r=>r.id===selected)||s.rows[0],bar=member.bars.find(b=>b.id===row?.barId),detail=bar?barDetail(member,bar):undefined;
 const usable=!!attachment&&attachment.sha256===s.sha256&&!!attachment.pageCount&&attachment.sourceStatus!=='Superseded';
 const apply=(reference:SourceShapeReference)=>{if(!picker||readOnly||!usable||picker.sha!==s.sha256||picker.actor!==auth.currentUser?.uid||!s.rows.some(r=>r.id===picker.row))return;
  onChange({...member,sourceSchedule:{...s,version:s.version===3?3:2,rows:s.rows.map(r=>r.id===picker.row?{...r,shapeReference:reference}:r)}});setPicker(null);
 };
 if(!row)return null;
 return <section className="source-shape-review" aria-label="รูปดัดต้นทางเทียบกับ BBS"><h4>รูปดัดต้นทางและรูป BBS</h4><p>เลือกรูปในต้นฉบับให้ตรง Mark แล้วดูคู่กับ geometry ที่กรอกจริง · ช่องตัวเลขตรงกันไม่ได้ยืนยันว่ารูปดัดและตำแหน่งตรงกัน</p>
  <label className="field"><span>Mark สำหรับดูรูป</span><select aria-label="Mark สำหรับดูรูป" value={row.id} onChange={e=>setSelected(e.target.value)}>{s.rows.map(r=><option key={r.id} value={r.id}>{r.mark||'ยังไม่ระบุ Mark'} / หน้า {sourceRowPage(s,r)} / Ø{r.diameter}</option>)}</select></label>
  <div className="source-shape-pair"><div><h5>รูปดัดจากต้นฉบับ · Mark {row.mark}</h5>{row.shapeReference&&attachment?<SourceRegionPreview key={row.id+JSON.stringify(row.shapeReference)+firebaseUser?.uid} attachment={attachment} reference={row.shapeReference}/>:<p className="empty">ยังไม่เลือกรูปต้นทาง</p>}{row.shapeReference&&<p className="muted">หน้า {row.shapeReference.page} · ผูกกับไฟล์ {row.shapeReference.sha256.slice(0,16)}…</p>}</div><div><h5>รูป BBS ในแอป · {bar?.mark||'ยังไม่จับคู่'}</h5>{detail?detailParts(detail).map(part=><div key={part.part}><DetailSketch detail={detail} part={part}/><p className="muted">ส่วน {part.part}/{part.total} · NTS / แนวศูนย์กลาง</p></div>):<p className="empty">ต้องกรอกแนวเหล็กและจับคู่ BBS ก่อนดูรูปที่คำนวณ · รูปต้นทางไม่สร้างเหล็กเอง</p>}{bar&&<p>Ø{bar.diameter} / {bar.grade} · ยาวตัด {schedule(member,spec).find(b=>b.id===bar.id)?.cutLength} mm</p>}</div></div>
  <div className="actions"><button type="button" disabled={readOnly||!usable||!firebaseUser} onClick={()=>setPicker({row:row.id,sha:s.sha256,actor:firebaseUser!.uid})}>{row.shapeReference?'เลือกกรอบรูปดัดใหม่':'เลือกรูปดัดต้นทาง'}</button>{row.shapeReference&&<button type="button" disabled={readOnly} onClick={()=>onChange({...member,sourceSchedule:{...s,rows:s.rows.map(r=>r.id===row.id?{...r,shapeReference:undefined}:r)}})}>ลบรูปอ้างอิงของ Mark นี้</button>}</div>
  {picker&&picker.actor===firebaseUser?.uid&&picker.sha===s.sha256&&s.rows.find(r=>r.id===picker.row)&&usable&&<SourceShapePicker attachment={attachment!} mark={s.rows.find(r=>r.id===picker.row)!.mark} initial={s.rows.find(r=>r.id===picker.row)!.shapeReference} readOnly={readOnly} onApply={apply} onClose={()=>setPicker(null)}/>}
 </section>;
}
