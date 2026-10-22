import {useEffect,useMemo,useRef,useState} from 'react';
import type {Attachment,Member,Project} from '../domain/model';
import {memberSchema} from '../domain/model';
import {mergeSheetGroups,sheetDetailSchema,buildSheetDraft,type SheetGroup} from '../domain/aiSheet';
import {aiToolCatalog} from '../domain/aiModelTools';
import {mapSheet,readSheetGroup,type SheetMap,type SheetResult} from '../data/aiSheetAnalysis';
import {aiDrawingAnalysisConfigured} from '../data/aiDrawingAnalysis';
import {command} from '../data/firebase';
import {download} from '../data/exports';
import {ModelView} from './Geometry';
import {takeoff} from '../domain/engine';

function memberFromSheet(data:SheetResult,code:string,project:Project,attachment:Attachment,group:SheetGroup,edited=false){
 const result=data.result,{member}=buildSheetDraft(result,code,project.spec);
 member.drawingExtraction={attachmentId:attachment.id,fileName:attachment.name,extractedAt:new Date().toISOString(),pages:Math.max(...group.regions.map(r=>r.page)),status:'Needs review',confidence:'Low',dimensions:(['x','y','z'] as const).flatMap(axis=>result.dimensions[axis]===null?[]:[{axis,value:result.dimensions[axis]!,label:axis,source:group.code}]),reinforcement:[],textSample:result.summary.slice(0,2400),warnings:[...[...result.warnings,...group.warnings].slice(0,48),`Source SHA256: ${data.sourceDigest}`,...(edited?['ผู้ใช้แก้ไขผลอ่านก่อนสร้างโมเดล']:[])],evidence:result.evidence,source:'ai',provider:data.provider,model:data.model};
 return memberSchema.parse(member);
}

export function AiSheetPanel({project,attachment,blocked}:{project:Project;attachment:Attachment;blocked:boolean}){
 const [maps,setMaps]=useState<SheetMap[]>([]),[groups,setGroups]=useState<SheetGroup[]>([]),[selected,setSelected]=useState<string[]>([]),[results,setResults]=useState<Record<string,SheetResult>>({});
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[pageLimit,setPageLimit]=useState(10),[groupEdit,setGroupEdit]=useState<string|null>(null);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const sourceDigest=maps[0]?.sourceDigest;
 const report=(p:{label:string;detail?:string})=>setProgress([p.label,p.detail].filter(Boolean).join(' · '));
 const run=async(action:(signal:AbortSignal)=>Promise<void>)=>{if(controller.current)return;const c=new AbortController();controller.current=c;setBusy(true);setError('');try{await action(c.signal);}catch(e){setError(c.signal.aborted?'ยกเลิกแล้ว · ผลที่อ่านเสร็จยังอยู่':e instanceof Error?e.message:String(e));}finally{controller.current=null;setBusy(false);setProgress('');}};
 const discover=()=>run(async signal=>{
  setMaps([]);setGroups([]);setResults({});setSelected([]);setGroupEdit(null);let found:SheetGroup[]=[],digest:string|undefined;
  for(let page=1;page<=pageLimit;page++){
   const m=await mapSheet(project,attachment,page,digest,signal,report);digest=m.sourceDigest;
   found=mergeSheetGroups([...found,...m.groups]);setMaps(prev=>[...prev,m]);setGroups(found);
   if(page>=m.pages)break;
  }
 });
 const analyse=()=>run(async signal=>{
  for(const g of groups.filter(g=>selected.includes(g.code))){
   if(results[g.code]?.savedMember)continue;
   try{
    const r=await readSheetGroup(project,attachment,g,sourceDigest!,signal,report);
    setResults(prev=>({...prev,[g.code]:r}));
    if(signal.aborted)throw Error('ยกเลิกแล้ว');
    if(!r.executionError&&!r.result.missing.length&&!r.result.conflicts.length){
     const member=memberFromSheet(r,g.code,project,attachment,g);
     report({label:`กำลังสร้างและบันทึกโมเดล 3D · ${g.code}`});
     await command('saveMember',project.id,{member});
     setResults(prev=>({...prev,[g.code]:{...r,savedMember:member}}));
    }
   }
   catch(e){if(signal.aborted)throw e;setError(prev=>[prev,`${g.code}: ${e instanceof Error?e.message:String(e)}`].filter(Boolean).join('\n'));}
  }
 });
 return <section className="drawing-extraction" aria-label="AI อ่านแบบรวมแยกชิ้นงาน">
  <h4>AI อ่านแบบรวม → แยกชิ้นงาน → สร้าง 3D</h4>
  <p>สำรวจแปลน รูปตัด และรายละเอียดตามรหัสชิ้นงาน แล้วอ่านภาพขยายของแต่ละกลุ่ม แต่ละกลุ่มจะสร้างเป็นสมาชิกใหม่แยกกัน</p>
  <div className="actions"><label>จำนวนหน้าที่สำรวจจากหน้าแรก <input aria-label="จำนวนหน้าที่สำรวจ" type="number" min={1} max={40} value={pageLimit} disabled={busy} onChange={e=>setPageLimit(Math.max(1,Math.min(40,Number(e.target.value)||1)))}/></label>
   <button disabled={blocked||busy||!aiDrawingAnalysisConfigured()} onClick={()=>void discover()}>1. สำรวจและแยกกลุ่ม</button>
   <button disabled={blocked||busy||!selected.length||!sourceDigest} onClick={()=>void analyse()}>2. อ่านละเอียดและสร้าง 3D {selected.length} กลุ่ม</button>
   {busy&&<button onClick={()=>controller.current?.abort()}>ยกเลิก</button>}
  </div>
  <p className="muted">PDF ขยายจากต้นฉบับ · รูปภาพใช้ความละเอียดที่มี · แต่ละหน้าและแต่ละกลุ่มเรียก AI แยกครั้ง</p>
  <p>ใช้ไฟล์ที่แนบไว้แล้ว สร้างคำสั่งและโมเดลในแอพโดยตรง ไม่ต้องอัปโหลดไฟล์ MCP · บันทึกสมาชิกแบบร่างอัตโนมัติเมื่อมิติและคำสั่งผ่านการตรวจ</p>
  {busy&&<p role="status">กำลังรอ AI · ปุ่มจะเปิดอีกครั้งเมื่องานเสร็จหรือยกเลิก · รอสูงสุด 8 นาทีต่อคำขอ</p>}
  {!busy&&!groups.length&&<p className="muted">เริ่มจาก “1. สำรวจและแยกกลุ่ม” เมื่อพบกลุ่มแล้วเลือกกลุ่มเพื่อเปิดปุ่ม “2. อ่านละเอียด”</p>}
  {progress&&<p role="status">{progress}</p>}{error&&<p role="alert" className="notice danger" style={{whiteSpace:'pre-wrap'}}>{error}</p>}
  {maps.length>0&&maps.length<maps[0].pages&&<p className="notice warning">สำรวจ {maps.length} จาก {maps[0].pages} หน้า · เพิ่มจำนวนหน้าแล้วสำรวจใหม่เพื่ออ่านหน้าที่เหลือ</p>}
  {maps.flatMap(m=>m.warnings.map((w,i)=><p className="notice warning" key={`${m.page}-${i}`}>หน้า {m.page}: {w}</p>))}
  {maps.map(m=><details key={m.page}><summary>ดูกรอบกลุ่มที่ AI เลือก · หน้า {m.page}</summary>{m.preview&&<div style={{position:'relative',maxWidth:1000}}><img src={m.preview} alt={`แบบหน้า ${m.page}`} style={{width:'100%',display:'block'}}/>{groups.flatMap((g,i)=>g.regions.filter(r=>r.page===m.page).map((r,j)=><div key={`${i}-${j}`} title={`${g.code} · ${r.label}`} style={{position:'absolute',left:`${r.box[0]*100}%`,top:`${r.box[1]*100}%`,width:`${r.box[2]*100}%`,height:`${r.box[3]*100}%`,border:'2px solid #167561',pointerEvents:'none'}}><small style={{background:'white',color:'#164b3c'}}>{g.code} · {r.kind}</small></div>))}</div>}</details>)}
  {!!groups.length&&<div className="table-scroll"><table><thead><tr><th>เลือก</th><th>รหัส</th><th>ภาพที่จับคู่</th><th>ข้อสังเกต</th></tr></thead><tbody>{groups.map(g=><tr key={g.code}><td><input aria-label={`เลือก ${g.code}`} type="checkbox" disabled={busy} checked={selected.includes(g.code)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,g.code]:prev.filter(c=>c!==g.code))}/></td><td>{g.code}<small className="block">{g.label}</small></td><td>{g.regions.map(r=>`หน้า ${r.page} ${r.kind} ${r.label}`).join(' · ')}</td><td>{g.warnings.join(' · ')}</td></tr>)}</tbody></table></div>}
  {!!groups.length&&<details><summary>แก้การจับคู่และกรอบภาพก่อนอ่านละเอียด</summary><p>box = [ซ้าย, บน, กว้าง, สูง] เป็นสัดส่วน 0–1 ของหน้า · แยกรหัสชิ้นงานและย้ายแปลน/รูปตัดไปยังกลุ่มที่ถูกต้องได้</p><textarea aria-label="แก้กลุ่มแบบ" rows={12} style={{width:'100%'}} disabled={blocked||busy} value={groupEdit??JSON.stringify(groups,null,2)} onChange={e=>setGroupEdit(e.target.value)}/><button disabled={blocked||busy||groupEdit===null} onClick={()=>{try{const next=mergeSheetGroups(JSON.parse(groupEdit!));if(next.some(g=>g.regions.some(r=>!maps.some(m=>m.page===r.page))))throw Error('กรอบอ้างหน้าที่ยังไม่ได้สำรวจ');setGroups(next);setResults({});setSelected([]);setGroupEdit(null);setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}>ใช้กลุ่มที่แก้ไขและล้างผลอ่านเดิม</button></details>}
  {groups.filter(g=>results[g.code]).map(g=><SheetResultCard key={`${g.code}-${sourceDigest}`} group={g} data={results[g.code]} project={project} attachment={attachment} blocked={blocked||busy}/>)}
  <details><summary>คำสั่งสร้างแบบและเหล็กที่ AI ใช้ได้ ({aiToolCatalog().length})</summary><ul>{aiToolCatalog().map(t=><li key={t.name}><code>{t.name}</code> — {t.description}</li>)}</ul></details>
  <McpDraftImport project={project} blocked={blocked||busy}/>
 </section>;
}

function SheetResultCard({group,data,project,attachment,blocked}:{group:SheetGroup;data:SheetResult;project:Project;attachment:Attachment;blocked:boolean}){
 const [code,setCode]=useState(group.code),[saved,setSaved]=useState(Boolean(data.savedMember)),[saving,setSaving]=useState(false),[error,setError]=useState(''),[edited,setEdited]=useState<string|null>(null);
 useEffect(()=>{setEdited(null);setError('');setSaved(Boolean(data.savedMember));},[data]);
 const parsed=useMemo(()=>{try{return {result:edited===null?data.result:sheetDetailSchema.parse(JSON.parse(edited)),error:''};}catch(e){return {result:data.result,error:e instanceof Error?e.message:String(e)};}},[data,edited]);
 const result=parsed.result;
 const draft=useMemo(()=>{
  try{
   if(parsed.error)throw Error(parsed.error);
   if(result.code!==group.code)throw Error('รหัสในผลอ่านต้องตรงกับกลุ่ม');
   return {member:data.savedMember||memberFromSheet({...data,result},code,project,attachment,group,edited!==null),error:''};
  }catch(e){return {member:undefined,error:e instanceof Error?e.message:String(e)};}
 },[data,edited,parsed,result,code,project.spec,attachment,group]);
 const q=useMemo(()=>draft.member?takeoff(draft.member,project.spec):undefined,[draft.member,project.spec]);
 const save=async()=>{if(!draft.member||saving||saved||blocked)return;setSaving(true);setError('');try{await command('saveMember',project.id,{member:draft.member});setSaved(true);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}};
 return <section className="panel padded"><h4>{group.code} · ผลอ่านรายละเอียด</h4><p>{result.summary}</p>
  {saved&&<p role="status">สร้างสมาชิก {code} ในโครงการแล้ว เปิดตรวจได้จากรายการสมาชิกและมุมมอง 3D</p>}
  <p>มิติจากแบบ X × Y × Z: {(['x','y','z'] as const).map(k=>result.dimensions[k]??'?').join(' × ')} mm · ลึกขุด {result.dimensions.excavationDepth??'?'} mm</p>
  {result.warnings.map((w,i)=><p className="notice warning" key={i}>{w}</p>)}
  {draft.error&&<p className="notice warning" style={{whiteSpace:'pre-wrap'}}>ยังสร้างไม่ได้: {draft.error}</p>}
  {draft.member&&<><ModelView member={draft.member} spec={project.spec} selected="" onSelect={()=>{}}/><p>ขนาดโมเดล {draft.member.x} × {draft.member.y} × {draft.member.z} mm · คอนกรีต {q?.concrete.toFixed(3)} m³ · เหล็ก {draft.member.bars.length} Marks</p></>}
  <details><summary>หลักฐานจากแบบ ({result.evidence.length})</summary><ul>{result.evidence.map((e,i)=><li key={i}>หน้า {e.page} · {e.field}: {e.quote}</li>)}</ul></details>
  <details><summary>แก้ผลอ่าน มิติที่ขาด และคำสั่งสร้างโมเดล</summary><p>ตรวจจากแบบแล้วเติม dimensions และ commands ให้ตรงกัน พร้อมหลักฐาน จากนั้นนำข้อที่ตอบแล้วออกจาก missing / conflicts</p><textarea aria-label={`คำสั่ง ${group.code}`} rows={12} style={{width:'100%'}} disabled={saving||saved||blocked} value={edited??JSON.stringify(data.result,null,2)} onChange={e=>setEdited(e.target.value)}/></details>
  <div className="actions"><label>รหัสสมาชิกใหม่ <input value={code} disabled={saving||saved||blocked} onChange={e=>setCode(e.target.value)}/></label><button className="primary" disabled={blocked||saving||saved||!draft.member||!code.trim()} onClick={()=>void save()}>{saved?'สร้างสมาชิกแล้ว':saving?'กำลังบันทึก…':'สร้างสมาชิกจากผลนี้'}</button><button onClick={()=>download(new Blob([JSON.stringify({group,...data,result},null,2)],{type:'application/json'}),`analysis-${group.code.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`)}>ดาวน์โหลดผลอ่าน</button></div>
  {error&&<p role="alert" className="notice danger">{error}</p>}
 </section>;
}

function McpDraftImport({project,blocked}:{project:Project;blocked:boolean}){
 const [draft,setDraft]=useState<Member|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 return <details><summary>นำเข้าแบบร่างที่สร้างผ่าน MCP</summary><input aria-label="นำเข้าแบบร่าง MCP" type="file" accept="application/json" disabled={blocked||saving} onChange={async e=>{setError('');setDraft(null);try{const f=e.target.files?.[0];if(!f)return;if(f.size>700000)throw Error('ไฟล์ใหญ่เกิน 700 KB');const r=JSON.parse(await f.text()),m=memberSchema.parse(r.member||r);setDraft({...m,id:crypto.randomUUID(),version:0,status:'Draft',bars:m.bars.map(b=>({...b,placementConfirmed:false,bsDimensionsConfirmed:false}))});}catch(e){setError(e instanceof Error?e.message:String(e));}}}/>{draft&&<><p>{draft.code} · {draft.x} × {draft.y} × {draft.z} mm</p><ModelView member={draft} spec={project.spec} selected="" onSelect={()=>{}}/><button disabled={blocked||saving} onClick={async()=>{setSaving(true);try{await command('saveMember',project.id,{member:draft});setDraft(null);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}}}>สร้างสมาชิกจากแบบร่าง MCP</button></>}{error&&<p role="alert" className="notice danger">{error}</p>}</details>;
}
