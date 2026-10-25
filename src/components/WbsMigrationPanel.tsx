import {useMemo,useState} from 'react';
import {ArrowRightLeft,X} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {command} from '../data/firebase';
import {resumeSpecChange} from '../data/specChanges';
import {number} from './EditorControls';
import {locationTree,wbsCode,type OccurrenceLoc} from '../domain/locations';
import {comboIssues,comboKey,guessCombo,wbsCombos,wbsMigrationPlan,type WbsMigration} from '../domain/wbsMigration';

/** Wizard: map each (Zone, ชั้น) label pair of the members to the WBS tree, preview, then run the resumable job. */
export function WbsMigrationPanel({project,members,disabled,run,onClose}:{project:Project;members:Member[];disabled:boolean;run:(f:()=>Promise<unknown>,message?:string)=>void;onClose:()=>void}){
 const tree=useMemo(()=>locationTree(project.locations),[project.locations]),combos=useMemo(()=>wbsCombos(members),[members]);
 const [map,setMap]=useState<Record<string,OccurrenceLoc>>(()=>Object.fromEntries(combos.map(c=>{const g=guessCombo(tree,c.zone,c.floor);return [comboKey(c.zone,c.floor),g.building||!c.loc?g:c.loc];})));
 const [picked,setPicked]=useState<Set<string>>(new Set()),[bulk,setBulk]=useState(''),[relabel,setRelabel]=useState(false),[onlyUnlinked,setOnlyUnlinked]=useState(true),[note,setNote]=useState('ย้ายตำแหน่งสมาชิกเข้า WBS'),[pending,setPending]=useState<{key:string;requestId:string}|null>(null);
 const roots=tree.roots.filter(r=>!r.archived);
 const input:WbsMigration={version:project.version,locationsVersion:project.locations?.version||0,combos:combos.map(c=>({zone:c.zone,floor:c.floor,loc:map[comboKey(c.zone,c.floor)]||{}})),relabel,onlyUnlinked,note:note.trim()};
 const preview=useMemo(()=>{try{return {plan:wbsMigrationPlan(members,project.locations,project.spec,input)};}catch(e:any){return {error:String(e.message||e)};}},[members,project,JSON.stringify(input)]);
 const set=(key:string,loc:OccurrenceLoc)=>setMap({...map,[key]:Object.fromEntries(Object.entries(loc).filter(([,v])=>v))});
 const setBuilding=(keys:string[],building:string)=>{const next={...map};for(const k of keys){const c=combos.find(x=>comboKey(x.zone,x.floor)===k)!;if(!building){next[k]={};continue;}
  // keep the guessed level / zone of the new building when the labels match it
  const g=guessCombo({...tree,roots:[tree.byId.get(building)!]},c.zone,c.floor);next[k]={...g,building};}setMap(next);};
 const allKeys=combos.map(c=>comboKey(c.zone,c.floor)),mapped=allKeys.filter(k=>map[k]?.building).length;
 const start=()=>{const data=input,key=JSON.stringify(data),request=pending?.key===key?pending:{key,requestId:crypto.randomUUID()};setPending(request);
  run(async()=>{const state=await command('beginWbsMigration',project.id,data,request.requestId);onClose();await resumeSpecChange(project.id,state.id,()=>{},false,'ย้ายเข้า WBS');},'ย้ายตำแหน่งสมาชิกเข้า WBS ครบแล้ว');};
 return <section className="panel padded wbs-migrate">
  <div className="section-heading"><div><h3>ย้ายข้อมูลสมาชิกเข้า WBS</h3><p className="muted">จับคู่ชื่อ Zone / ชั้นเดิมแต่ละคู่กับอาคาร · ชั้น · โซน แล้วระบบเขียนตำแหน่ง WBS ให้ทุกแถวที่ใช้คู่นั้น · ทำเป็นงานต่อเนื่อง ยกเลิกแล้วคืนข้อมูลเดิมได้</p></div><button onClick={onClose} aria-label="ปิด"><X size={15}/></button></div>
  {!roots.length?<p className="notice warning">ยังไม่มีอาคาร / งานภายนอกใน WBS · สร้างและบันทึกโครงสร้างก่อน</p>:<>
  <div className="wbs-bulk"><span>{picked.size?`เลือก ${picked.size} คู่`:'เลือกแถวเพื่อตั้งอาคารพร้อมกัน'}</span><select aria-label="อาคารของแถวที่เลือก" value={bulk} onChange={e=>setBulk(e.target.value)}><option value="">— ไม่ผูก —</option>{roots.map(r=><option key={r.id} value={r.id}>{r.code} {r.name}</option>)}</select><button disabled={!picked.size} onClick={()=>{setBuilding([...picked],bulk);setPicked(new Set());}}>ตั้งอาคาร</button><span className="muted">จับคู่แล้ว {mapped} / {combos.length} คู่</span></div>
  <div className="table-scroll"><table className="wbs-map"><thead><tr><th><input type="checkbox" aria-label="เลือกทั้งหมด" checked={picked.size===allKeys.length&&allKeys.length>0} onChange={e=>setPicked(new Set(e.target.checked?allKeys:[]))}/></th><th>Zone เดิม</th><th>ชั้นเดิม</th><th className="num">แถว</th><th className="num">จำนวน</th><th>อาคาร / งานภายนอก</th><th>ชั้น / ช่วง</th><th>โซน</th><th>WBS</th></tr></thead><tbody>
   {combos.map(c=>{const k=comboKey(c.zone,c.floor),loc=map[k]||{},b=loc.building,issues=comboIssues(tree,loc),kids=b?tree.children(b):[];
    return <tr key={k} className={issues.length?'invalid':''}>
     <td><input type="checkbox" checked={picked.has(k)} onChange={e=>{const n=new Set(picked);if(e.target.checked)n.add(k);else n.delete(k);setPicked(n);}}/></td>
     <td>{c.zone||<span className="muted">ไม่ระบุ</span>}</td><td>{c.floor||<span className="muted">ไม่ระบุ</span>}</td><td className="num">{c.rows}{c.linked>0&&<small className="muted block">ผูกแล้ว {c.linked}</small>}</td><td className="num">{c.quantity}</td>
     <td><select value={b||''} onChange={e=>setBuilding([k],e.target.value)}><option value="">— ไม่ผูก —</option>{tree.roots.filter(r=>!r.archived||r.id===b).map(r=><option key={r.id} value={r.id}>{r.code} {r.name}</option>)}</select></td>
     <td><select disabled={!b} value={loc.level?`l:${loc.level}`:loc.segment?`s:${loc.segment}`:''} onChange={e=>{const [t,id]=e.target.value.split(':');set(k,{...loc,level:t==='l'?id:undefined,segment:t==='s'?id:undefined});}}><option value="">—</option>{kids.filter(n=>n.kind==='level').map(n=><option key={n.id} value={`l:${n.id}`}>{n.code} {n.name}</option>)}{kids.filter(n=>n.kind==='segment').map(n=><option key={n.id} value={`s:${n.id}`}>{n.code} {n.name}</option>)}</select></td>
     <td><select disabled={!b} value={loc.zone||''} onChange={e=>set(k,{...loc,zone:e.target.value||undefined})}><option value="">—</option>{kids.filter(n=>n.kind==='zone').map(n=><option key={n.id} value={n.id}>{n.code} {n.name}</option>)}</select></td>
     <td>{issues.length?<small className="warn-text">{issues.join(' · ')}</small>:b?<code>{wbsCode(tree,loc)}</code>:<span className="muted">ไม่ผูก</span>}</td>
    </tr>;})}
  </tbody></table></div>
  <div className="form-grid wbs-options">
   <label className="check full"><input type="checkbox" checked={onlyUnlinked} onChange={e=>setOnlyUnlinked(e.target.checked)}/>ย้ายเฉพาะแถวที่ยังไม่ผูก WBS (แถวที่ผูกแล้วไม่เปลี่ยน)</label>
   <label className="check full"><input type="checkbox" checked={relabel} onChange={e=>setRelabel(e.target.checked)}/>เปลี่ยนชื่อ Zone / ชั้นเดิมเป็นรหัส WBS (เช่น “1F” → “L1”, Zone ว่างเมื่อไม่มีโซน)</label>
   {relabel&&<p className="notice warning full">สมาชิกที่ชื่อ Zone / ชั้นเปลี่ยนจะกลับเป็น Draft และต้องยืนยันตำแหน่งเหล็กใหม่ เหมือนการย้ายชื่อ Zone / ชั้น · ถ้าไม่เลือก สถานะสมาชิกคงเดิม</p>}
   <label className="field full"><span>เหตุผล / หมายเหตุ (บันทึกในประวัติ)</span><input maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
  </div>
  {'error' in preview?<p role="alert" className="notice danger">{preview.error}</p>:<div className="notice"><b>ตัวอย่างผล:</b> {preview.plan!.memberCount} สมาชิก · {preview.plan!.rowCount} แถวตำแหน่ง · จำนวน {preview.plan!.quantity} · คอนกรีต {number(preview.plan!.concrete)} m³ · เหล็ก {number(preview.plan!.rebar)} kg{relabel?` · กลับเป็น Draft ${preview.plan!.relabelledCount} สมาชิก`:' · สถานะสมาชิกคงเดิม'}{preview.plan!.unlinked>0?` · ยังไม่ผูกหลังย้าย ${preview.plan!.unlinked} แถว`:''} · ปริมาณ BOQ ไม่เปลี่ยน</div>}
  <footer className="actions"><button className="primary" disabled={disabled||'error' in preview||!preview.plan!.memberCount||!note.trim()} onClick={start}><ArrowRightLeft size={15}/>เริ่มย้ายข้อมูล</button><button onClick={onClose}>ปิด</button></footer>
  </>}
 </section>;
}
