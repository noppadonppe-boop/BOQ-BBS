import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,FileUp,History,RefreshCw,Save,X} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {labels} from '../domain/model';
import {command} from '../data/firebase';
import type {IfcModelData} from '../domain/ifcTypes';
import {checkIfcCandidate,defaultIfcOptions,planIfcImport,type IfcCandidate,type IfcImportOptions,type IfcPlan} from '../domain/ifcImport';
import {locationTree,wbsCode,type OccurrenceLoc} from '../domain/locations';
import {number} from './EditorControls';
import {MemberSketch} from './IfcMemberSketch';

type Run=(f:()=>Promise<unknown>,message?:string)=>void;
type FileRow={key:string;name:string;size:number;state:'reading'|'done'|'error';message:string;model?:IfcModelData};
const MAX_FILES=10,MAX_MB=400;
const statusTag:Record<IfcCandidate['status'],[string,string]>={add:['ใหม่','success'],update:['เปลี่ยน','warning'],same:['เหมือนเดิม',''],error:['ตรวจไม่ผ่าน','danger']};
const kindLabel:Record<string,string>={footing:'ฐานราก',pile:'เสาเข็ม',column:'เสา',beam:'คาน',wall:'ผนัง',slab:'พื้น',other:'อื่น ๆ'};
const STEPS=['เลือกไฟล์','จับคู่','ตรวจ','บันทึก'];
const storeKey=(pid:string)=>`ifc-storeys:${pid}`;
const loadStoreys=(pid:string):IfcImportOptions['storeyMap']=>{try{return JSON.parse(localStorage.getItem(storeKey(pid))||'{}');}catch{return {};}};
const saveStoreys=(pid:string,m:IfcImportOptions['storeyMap'])=>{try{localStorage.setItem(storeKey(pid),JSON.stringify(m));}catch{/* per-viewer convenience */}};

/** Project page “นำเข้าโมเดล BIM (IFC)”: Revit / Tekla IFC → footings / columns / beams with their bars, read in the browser. */
export function IfcImportPage({project,members,canEdit,busy,run}:{project:Project;members:Member[];canEdit:boolean;busy:boolean;run:Run}){
 const [files,setFiles]=useState<FileRow[]>([]),[step,setStep]=useState(0),[opt,setOpt]=useState<IfcImportOptions>(()=>({...defaultIfcOptions,storeyMap:loadStoreys(project.id)}));
 const [plan,setPlan]=useState<IfcPlan|null>(null),[sel,setSel]=useState(''),[skip,setSkip]=useState<Set<string>>(new Set()),[remove,setRemove]=useState<Set<string>>(new Set());
 const [filter,setFilter]=useState<'all'|IfcCandidate['status']>('all'),[checking,setChecking]=useState(0),[saved,setSaved]=useState<{ok:number;failed:string[]}|null>(null);
 const ro=!canEdit||busy,models=files.filter(f=>f.model).map(f=>f.model!),reading=files.some(f=>f.state==='reading');
 const queue=useRef(Promise.resolve());

 const addFiles=(list:FileList|null)=>{
  const picked=[...(list||[])].filter(f=>/\.ifc$/i.test(f.name));if(!picked.length)return;
  const rows:FileRow[]=picked.slice(0,MAX_FILES-files.length).map(f=>({key:`${f.name}:${f.size}:${f.lastModified}`,name:f.name,size:f.size,state:f.size>MAX_MB*1e6?'error':'reading',message:f.size>MAX_MB*1e6?`เกิน ${MAX_MB} MB`:'รอคิว'}));
  const fresh=rows.filter(r=>!files.some(x=>x.key===r.key));setFiles(x=>[...x,...fresh]);setPlan(null);setStep(0);
  // one file at a time: web-ifc keeps a whole model in memory
  for(const r of fresh.filter(r=>r.state==='reading')){const file=picked.find(f=>`${f.name}:${f.size}:${f.lastModified}`===r.key)!;
   queue.current=queue.current.then(async()=>{
    const set=(p:Partial<FileRow>)=>setFiles(x=>x.map(y=>y.key===r.key?{...y,...p}:y));
    try{const {readIfcModel}=await import('../data/ifcModel');const model=await readIfcModel(file,file.name,s=>set({message:s}));set({state:'done',model,message:''});}
    catch(e:any){set({state:'error',message:`อ่านไม่ได้: ${e?.message||e}`});}
   });}
 };
 const summary=useMemo(()=>{const c=(k:string)=>models.reduce((n,m)=>n+m.elements.filter(e=>e.kind===k).length,0);
  return {footing:c('footing'),column:c('column'),beam:c('beam'),pile:c('pile'),sets:models.reduce((n,m)=>n+m.barSets.length,0),bars:models.reduce((n,m)=>n+m.barSets.reduce((k,s)=>k+s.bars.length,0),0),storeys:new Set(models.flatMap(m=>m.storeys.map(s=>s.name))).size};},[files]);

 const build=(o=opt)=>{try{const p=planIfcImport(models,{project,members,spec:project.spec},o);setPlan(p);setSel(p.candidates[0]?.key||'');setRemove(new Set());setSaved(null);setStep(1);}catch(e:any){setPlan(null);alert(`จับคู่ไม่ได้: ${e?.message||e}`);}};
 const setOption=(p:Partial<IfcImportOptions>)=>{const o={...opt,...p};setOpt(o);if(p.storeyMap)saveStoreys(project.id,p.storeyMap);if(plan)build(o);};
 // member checks one by one (≈ 0.4 s on big mats) so the page stays responsive
 useEffect(()=>{
  if(!plan)return;let stop=false;
  (async()=>{for(let i=0;i<plan.candidates.length&&!stop;i++){const c=plan.candidates[i];if(c.checked)continue;await new Promise(r=>setTimeout(r,0));if(stop)return;
   const next=checkIfcCandidate(c,project.spec);setChecking(i+1);setPlan(p=>p&&p.candidates[i]?.key===c.key?{...p,candidates:p.candidates.map((x,j)=>j===i?next:x)}:p);}
   setChecking(0);})();
  return ()=>{stop=true;};
 },[plan?.candidates.length,plan?.files.join('|'),opt]);

 const cands=plan?.candidates||[],current=cands.find(c=>c.key===sel),pending=cands.filter(c=>!c.checked).length;
 const toSave=cands.filter(c=>!skip.has(c.key)&&c.checked&&(c.status==='add'||c.status==='update'));
 const save=()=>run(async()=>{
  let ok=0;const failed:string[]=[];
  for(const c of toSave){try{await command('saveMember',project.id,{member:c.member});ok++;}catch(e:any){failed.push(`${c.code}: ${e?.message||e}`);}}
  for(const m of plan!.missing.filter(m=>remove.has(m.id))){try{await command('deleteMember',project.id,{memberId:m.id,version:m.version});}catch(e:any){failed.push(`${m.code}: ${e?.message||e}`);}}
  setSaved({ok,failed});setStep(3);
 },'นำเข้าจาก IFC แล้ว');

 return <>
  <div className="heading"><div><div className="eyebrow">IFC IMPORT</div><h1>นำเข้าโมเดล BIM (IFC)</h1><p>อ่านเหล็กและองค์อาคารจาก Revit / Tekla โดยตรง · อ่านในเบราว์เซอร์ ไม่ส่งไฟล์ให้ AI</p></div>
   <div className="actions"><span className="badge"><History size={13}/> สมาชิกจาก IFC {members.filter(m=>m.ifcSource).length}</span></div></div>
  {!canEdit&&<p className="notice">ดูได้อย่างเดียว · นำเข้าได้เฉพาะผู้ดูแลโครงการ / QS</p>}
  <ol className="ifc-steps">{STEPS.map((s,i)=><li key={s} className={i<step?'done':i===step||(step===1&&i===2)?'on':''}><span>{i<step?<Check size={14}/>:i+1}</span>{s}</li>)}</ol>

  {step===0&&<div className="ifc-grid">
   <section className="panel padded">
    <h3>1. เลือกไฟล์ (เลือกได้หลายไฟล์)</h3>
    <label className={`ifc-drop${ro?' disabled':''}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!ro)addFiles(e.dataTransfer.files);}}>
     <FileUp size={26}/><b>ลากไฟล์ .ifc มาวาง (หลายไฟล์ได้) หรือแตะเพื่อเลือก</b>
     <small>แยกโซน / แยกฐานราก-เสา-คาน / Revit + Tekla รวมกันได้ · สูงสุด {MAX_FILES} ไฟล์ · ไฟล์ละ ≤ {MAX_MB} MB</small>
     <input hidden type="file" accept=".ifc" multiple disabled={ro} onChange={e=>{addFiles(e.target.files);e.target.value='';}}/></label>
    {files.length>0&&<div className="table-scroll"><table><thead><tr><th>ไฟล์</th><th>ผู้สร้าง</th><th>IFC</th><th className="num">องค์อาคาร</th><th className="num">เหล็ก (เส้น)</th><th>สถานะ</th><th/></tr></thead><tbody>
     {files.map(f=>{const m=f.model;return <tr key={f.key}><td><b>{f.name}</b> <small className="muted">{number(f.size/1e6,1)} MB</small></td>
      <td>{m?<span className="badge">{m.tool==='other'?m.app:m.tool}</span>:'—'}</td><td>{m?.schema||'—'}</td>
      <td className="num">{m?m.elements.filter(e=>['footing','column','beam'].includes(e.kind)).length:'—'}</td><td className="num">{m?number(m.barSets.reduce((n,s)=>n+s.bars.length,0),0):'—'}</td>
      <td>{f.state==='reading'?<span className="badge warning">{f.message||'กำลังอ่าน…'}</span>:f.state==='error'?<span className="badge danger">{f.message}</span>:m!.warnings.length?<span className="badge warning" title={m!.warnings.join('\n')}>อ่านแล้ว · {m!.warnings[0]}</span>:<span className="badge success">อ่านแล้ว</span>}</td>
      <td><button className="icon" aria-label={`เอา ${f.name} ออก`} disabled={f.state==='reading'} onClick={()=>{setFiles(x=>x.filter(y=>y.key!==f.key));setPlan(null);}}><X size={14}/></button></td></tr>;})}
    </tbody></table></div>}
    <p className="muted">ไฟล์เดียวกันซ้ำ (GlobalId ซ้ำ) นับครั้งเดียว · ชิ้นส่วนจากต่างไฟล์จับคู่กันด้วยตำแหน่ง · หน่วยอ่านจากไฟล์ (mm / m)</p>
    <footer className="actions"><button className="primary" disabled={!models.length||reading} onClick={()=>build()}>ถัดไป: จับคู่</button></footer>
   </section>
   <aside className="ifc-side">
    <section className="panel padded"><h3>สรุปทุกไฟล์</h3><table><tbody>
     <tr><td>ฐานราก</td><td className="num">{summary.footing}</td></tr><tr><td>เสา / ตอม่อ</td><td className="num">{summary.column}</td></tr><tr><td>คาน</td><td className="num">{summary.beam}</td></tr>
     <tr><td>เสาเข็ม</td><td className="num">{summary.pile}</td></tr><tr><td>เหล็ก (ชุด / เส้น)</td><td className="num">{number(summary.sets,0)} / {number(summary.bars,0)}</td></tr><tr><td>ชั้น (IfcBuildingStorey)</td><td className="num">{summary.storeys}</td></tr></tbody></table></section>
    <section className="panel padded ifc-howto"><h3>วิธี export</h3>
     <b>Revit: File › Export › IFC</b><p>IFC4 Reference View หรือ IFC2x3 CV 2.0 · Export base quantities · เปิด Structural Rebar ใน View ที่ export</p>
     <b>Tekla: File › Export › IFC</b><p>IFC2x3 / IFC4 · เลือก Assemblies + Reinforcing bars · Property set: Mark / Grade / Size / Shape</p>
     <b>ทั้งคู่</b><p>หน่วย mm · export ทีละโซนหรือทีละแบบ · ไฟล์ .rvt / .db1 อ่านไม่ได้ ต้อง export เป็น .ifc</p></section>
   </aside>
  </div>}

  {step>=1&&step<3&&plan&&<>
   {plan.warnings.length>0&&<div className="notice warning">{plan.warnings.slice(0,6).map(w=><div key={w}>{w}</div>)}</div>}
   <div className="ifc-grid wide">
    <section className="panel padded">
     <div className="section-heading"><h3>จับคู่องค์อาคาร ({cands.length})</h3><button onClick={()=>{setStep(0);setPlan(null);}}>ย้อนกลับ</button></div>
     <div className="ifc-options">
      <span className="muted">จับเหล็กเข้าองค์อาคารโดย</span>
      {(['assembly','position'] as const).map(k=><label key={k}><input type="radio" name="ifc-host" checked={opt.hostBy===k} onChange={()=>setOption({hostBy:k})}/>{k==='assembly'?'Assembly / Cast unit (ไม่มีจึงใช้ตำแหน่ง)':'ตำแหน่ง (เหล็กอยู่ในก้อนไหน)'}</label>)}
      <label><input type="checkbox" checked={opt.mergeMarks} onChange={e=>setOption({mergeMarks:e.target.checked})}/>รวมเหล็กที่เหมือนกันเป็น Mark เดียว</label>
      <label><input type="checkbox" checked={opt.useIfcMarks} onChange={e=>setOption({useIfcMarks:e.target.checked})}/>ใช้ Mark ตาม IFC</label>
     </div>
     <div className="ifc-chips">{(['all','add','update','same','error'] as const).map(k=>{const n=k==='all'?cands.length:cands.filter(c=>c.status===k).length;return (k==='all'||n>0)&&<button key={k} className={`badge ${k==='all'?'':statusTag[k][1]}${filter===k?' active':''}`} onClick={()=>setFilter(k)}>{k==='all'?'ทั้งหมด':statusTag[k][0]} {n}</button>;})}
      {checking>0&&<span className="badge warning"><RefreshCw size={12}/> กำลังตรวจ {checking}/{cands.length}</span>}</div>
     <div className="table-scroll ifc-list"><table><thead><tr><th/><th>ใน IFC</th><th>เป็น</th><th>รหัส</th><th>ชั้น</th><th className="num">Mark / เส้น</th><th className="num">kg</th><th/></tr></thead><tbody>
      {cands.filter(c=>filter==='all'||c.status===filter).map(c=><tr key={c.key} className={c.key===sel?'selected':''} onClick={()=>setSel(c.key)}>
       <td><input type="checkbox" aria-label={`นำเข้า ${c.code}`} disabled={c.status==='same'||c.status==='error'} checked={!skip.has(c.key)&&c.status!=='same'&&c.status!=='error'} onClick={e=>e.stopPropagation()} onChange={e=>setSkip(s=>{const n=new Set(s);if(e.target.checked)n.delete(c.key);else n.add(c.key);return n;})}/></td>
       <td><b>{c.mark||c.name}</b>{c.pedestals>0&&<small className="muted"> +{c.category==='Foundation'?'ตอม่อ':'ชิ้นส่วน'} {c.pedestals}</small>}{c.piles>0&&<small className="muted"> +เข็ม {c.piles}</small>}</td>
       <td>{labels[c.category]}</td><td><code>{c.code}</code></td><td>{c.storeys.map(s=>`${s.name}${s.count>1?` ×${s.count}`:''}`).join(', ')}</td>
       <td className="num">{c.marks} / {c.bars}</td><td className="num">{number(c.weight,0)}</td>
       <td>{!c.checked?<span className="badge">รอตรวจ</span>:<span className={`badge ${statusTag[c.status][1]}`}>{statusTag[c.status][0]}</span>}</td></tr>)}
     </tbody></table></div>
     {(plan.unassigned.bars>0||plan.skipped.length>0)&&<p className="muted">ไม่นำเข้า: {[...plan.skipped.map(s=>`${kindLabel[s.kind]||s.kind} ${s.elements} ชิ้น${s.bars?` (เหล็ก ${number(s.bars,0)} เส้น)`:''}`),plan.unassigned.bars?`เหล็กที่ไม่อยู่ในองค์อาคารใด ${number(plan.unassigned.bars,0)} เส้น`:''].filter(Boolean).join(' · ')} · รุ่นนี้รองรับฐานราก (+ตอม่อ / เข็ม) เสา และคานที่มีเหล็ก</p>}
     {plan.storeys.length>0&&<StoreyMap project={project} storeys={plan.storeys} value={opt.storeyMap} onChange={m=>setOption({storeyMap:m})}/>}
     {plan.missing.length>0&&<div className="notice warning"><b>สมาชิกจาก IFC ที่ไม่มีในไฟล์ชุดนี้ ({plan.missing.length})</b>
      {plan.missing.map(m=><label key={m.id} className="ifc-missing"><input type="checkbox" checked={remove.has(m.id)} onChange={e=>setRemove(s=>{const n=new Set(s);if(e.target.checked)n.add(m.id);else n.delete(m.id);return n;})}/><code>{m.code}</code> {m.description} <small>{remove.has(m.id)?'ลบเมื่อบันทึก':'เก็บไว้'}</small></label>)}</div>}
    </section>
    <section className="panel padded ifc-detail">{current?<CandidateDetail c={current}/>:<p className="empty">เลือกองค์อาคารทางซ้าย</p>}
     <footer className="actions"><small className="muted">{pending?`ตรวจอีก ${pending} รายการ · `:''}บันทึกเป็น Draft · ส่งตรวจตามขั้นตอนเดิม</small>
      <button className="primary" disabled={ro||!toSave.length&&!remove.size} onClick={save}><Save size={15}/>บันทึก {toSave.length} สมาชิก{remove.size?` · ลบ ${remove.size}`:''}</button></footer></section>
   </div>
  </>}
  {step===3&&saved&&<section className="panel padded">
   <h3>บันทึกแล้ว {saved.ok} สมาชิก</h3>
   {saved.failed.length>0&&<div className="notice danger"><b>บันทึกไม่ได้ {saved.failed.length} รายการ</b><ul>{saved.failed.slice(0,20).map(f=><li key={f}>{f}</li>)}</ul></div>}
   <p className="muted">สมาชิกอยู่ในเมนูตามประเภท (ฐานราก / เสา / คาน) · แท็บ “แบบ &amp; BBS”, BOQ และ 3D ใช้ได้ทันที · นำเข้าไฟล์ใหม่อีกครั้งเพื่ออัปเดตตาม GlobalId</p>
   <footer className="actions"><button onClick={()=>{setFiles([]);setPlan(null);setStep(0);setSaved(null);}}>นำเข้าไฟล์อื่น</button></footer></section>}
 </>;
}

function StoreyMap({project,storeys,value,onChange}:{project:Project;storeys:string[];value:IfcImportOptions['storeyMap'];onChange:(m:IfcImportOptions['storeyMap'])=>void}){
 const tree=locationTree(project.locations),opts:{loc:OccurrenceLoc;label:string}[]=[];
 for(const r of tree.roots){if(r.archived)continue;opts.push({loc:{building:r.id},label:r.code});for(const l of tree.children(r.id,'level'))if(!l.archived)opts.push({loc:{building:r.id,level:l.id},label:wbsCode(tree,{building:r.id,level:l.id})});}
 return <div className="ifc-storeys"><h4>ชั้นใน IFC › WBS <small className="muted">(จำไว้ใช้ครั้งต่อไป)</small></h4>
  {!opts.length&&<p className="muted">โครงการยังไม่มีโครงสร้าง WBS · ใช้ชื่อชั้นจาก IFC เป็นชั้นของสมาชิก</p>}
  {opts.length>0&&<table><tbody>{storeys.map(s=><tr key={s}><td>{s}</td><td><select value={JSON.stringify(value[s]||null)} onChange={e=>onChange({...value,[s]:JSON.parse(e.target.value)||undefined})}>
   <option value="null">ใช้ชื่อชั้นจาก IFC</option>{opts.map(o=><option key={o.label} value={JSON.stringify(o.loc)}>{o.label}</option>)}</select></td></tr>)}</tbody></table>}</div>;
}

function CandidateDetail({c}:{c:IfcCandidate}){
 const diff=c.ifcWeight>0?(c.weight-c.ifcWeight)/c.ifcWeight*100:0,ok=Math.abs(diff)<=2;
 return <>
  <h3>ตรวจ: {c.code} · {labels[c.category]} <small className="muted">({c.files.join(' + ')})</small></h3>
  <div className="ifc-detail-top">
   <MemberSketch key={c.key} member={c.member}/>
   <table className="ifc-facts"><tbody>
    <tr><td>ขนาด</td><td>{number(c.member.x,0)} × {number(c.member.y,0)} × {number(c.member.z,0)} mm</td></tr>
    <tr><td>คอนกรีต</td><td>{number(c.concrete,2)} ม³</td></tr>
    <tr><td>เหล็ก</td><td>{number(c.weight,0)} kg <small className="muted">(IFC {number(c.ifcWeight,0)})</small> {c.ifcWeight>0&&<span className={`badge ${ok?'success':'warning'}`}>{diff>=0?'+':''}{number(diff,1)}%</span>}</td></tr>
    <tr><td>Mark / เส้น</td><td>{c.marks} Mark · {c.bars} เส้น</td></tr>
    <tr><td>ระยะหุ้ม</td><td>{c.member.cover} mm</td></tr>
    <tr><td>จำนวน</td><td>{c.storeys.map(s=>`${s.name} × ${s.count}`).join(', ')}</td></tr>
   </tbody></table>
  </div>
  {c.changes.length>0&&<div className="notice warning"><b>เปลี่ยนจากข้อมูลเดิม</b><ul>{c.changes.map(x=><li key={x}>{x}</li>)}</ul></div>}
  {c.problems.length>0&&<div className="notice danger"><b>ตรวจไม่ผ่าน (ไม่บันทึก)</b><ul>{c.problems.slice(0,8).map(x=><li key={x}>{x}</li>)}</ul></div>}
  {c.notes.length>0&&<ul className="ifc-notes">{c.notes.map(x=><li key={x}>{x}</li>)}</ul>}
  <div className="table-scroll"><table><thead><tr><th>Mark</th><th className="num">Ø</th><th>Shape</th><th className="num">จำนวน</th><th className="num">ยาวตัด</th><th className="num">IFC ยาว</th><th className="num">kg</th><th/></tr></thead><tbody>
   {c.rows.map(r=>{const d=r.cut&&r.ifcLength?r.cut-r.ifcLength:0;return <tr key={r.mark}><td><b>{r.mark}</b></td><td className="num">{r.diameter}</td><td>{r.shapeCode}{r.note&&<small className="muted"> ({r.note})</small>}</td><td className="num">{r.count}</td>
    <td className="num">{r.cut?number(r.cut,0):'—'}</td><td className="num">{number(r.ifcLength,0)}</td><td className="num">{number(r.weight,1)}</td>
    <td>{!r.cut?'':Math.abs(d)<=Math.max(25,.01*r.ifcLength)?<span className="badge success">ตรง</span>:<span className="badge warning">ยาว {d>0?'+':''}{d}</span>}</td></tr>;})}
  </tbody></table></div>
 </>;
}
