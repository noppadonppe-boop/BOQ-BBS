import {useMemo,useState} from 'react';
import {Download,FileSpreadsheet,Trash2} from 'lucide-react';
import {labels,type Project,type SnapshotBundle} from '../domain/model';
import {command} from '../data/firebase';
import {boqChapterReport,boqComponentLabels,chaptersFromRows,type BoqChapters} from '../domain/boqChapters';
import {number} from './EditorControls';

/** BOQ Summary in the owner's / consultant's chapters (`project.boqChapters`), for the selected scope. */
export function OwnerBoq({project,bundle,scopeText,canEdit,run}:{project:Project;bundle:SnapshotBundle;scopeText:string;canEdit:boolean;run:(f:()=>Promise<unknown>,message?:string)=>void}){
 const saved=project.boqChapters||undefined,[incoming,setIncoming]=useState<{name:string;chapters?:BoqChapters;problems:string[]}|null>(null),[error,setError]=useState('');
 const shown=incoming?.chapters||saved,report=useMemo(()=>shown?boqChapterReport(bundle,shown):undefined,[bundle,shown]);
 const read=async(file?:File)=>{if(!file)return;setError('');try{const rows=await (await import('../data/boqChaptersExcel')).readBoqChapters(file);setIncoming({name:file.name,...chaptersFromRows(rows,file.name,new Date().toISOString())});}catch(e:any){setError(`อ่าน ${file.name} ไม่ได้: ${e?.message||e}`);}};
 const exportFile=(withChapters:boolean)=>void (async()=>{await (await import('../data/boqChaptersExcel')).exportBoqChapters(withChapters?shown:undefined,withChapters?report?.rows:undefined,project.code,scopeText);})();
 const save=(chapters:BoqChapters|null)=>run(async()=>{await command('saveBoqChapters',project.id,{chapters,version:project.version});setIncoming(null);},chapters?'บันทึกหมวด BOQ ของโครงการแล้ว':'ล้างหมวด BOQ แล้ว');
 return <div className="owner-boq">
  <div className="section-heading"><div><h3>BOQ ตามหมวดของเจ้าของงาน / ที่ปรึกษา</h3><p className="muted">{saved?`${saved.source||'หมวด BOQ'} · ${saved.items.length} บรรทัด · ${saved.items.filter(i=>i.rule).length} รายการมีปริมาณ`:'ยังไม่ได้ตั้งหมวด BOQ ของโครงการ · ดาวน์โหลดแบบฟอร์ม กรอกรายการตาม BOQ ของเจ้าของงาน แล้วนำเข้า'}</p></div>
   <span className="actions">
    <label className={`button${canEdit?'':' disabled'}`}><FileSpreadsheet size={15}/>{saved?'นำเข้า Excel ใหม่':'นำเข้า Excel'}<input hidden type="file" accept=".xlsx" disabled={!canEdit} onChange={e=>{void read(e.target.files?.[0]);e.target.value='';}}/></label>
    <button onClick={()=>exportFile(!!shown)}><Download size={15}/>{shown?'ส่งออก Excel (พร้อมปริมาณ)':'ดาวน์โหลดแบบฟอร์ม'}</button>
    {saved&&!incoming&&<button className="danger-text" disabled={!canEdit} onClick={()=>{if(confirm('ล้างหมวด BOQ ของโครงการนี้?'))save(null);}}><Trash2 size={14}/>ล้าง</button>}
   </span></div>
  {error&&<p role="alert" className="notice danger">{error}</p>}
  {incoming&&<div className={`notice ${incoming.chapters?'warning':'danger'}`}><b>ตัวอย่างจาก {incoming.name}</b> · {incoming.chapters?`${incoming.chapters.items.length} บรรทัด · ตารางด้านล่างคำนวณตามไฟล์นี้ (ยังไม่บันทึก)`:'ใช้ไม่ได้'}
   {incoming.problems.length>0&&<ul>{incoming.problems.slice(0,10).map(p=><li key={p}>{p}</li>)}{incoming.problems.length>10&&<li>… อีก {incoming.problems.length-10} รายการ</li>}</ul>}
   <div className="actions"><button className="primary" disabled={!incoming.chapters||!canEdit} onClick={()=>save(incoming.chapters!)}>{saved?'แทนที่หมวด BOQ เดิม':'บันทึกหมวด BOQ'}</button><button onClick={()=>setIncoming(null)}>ยกเลิก</button></div></div>}
  {report&&<><div className="table-scroll"><table className="owner-boq-table"><thead><tr><th>รหัส</th><th>รายการ</th><th>หน่วย</th><th className="num">ปริมาณ</th><th className="num">สมาชิก</th><th>ปริมาณจากระบบ</th></tr></thead><tbody>
   {report.rows.map(r=><tr key={r.item.id} className={r.item.rule?'':'heading-row'}><td>{r.item.code}</td><td style={{paddingLeft:8+r.level*16}}>{r.item.title}{r.item.note&&<small className="block muted">{r.item.note}</small>}</td><td>{r.item.unit}</td>
    <td className="num">{r.quantity===null?'':<>{number(r.quantity)}{r.provisional&&<small className="block warn-text">มีค่าชั่วคราว</small>}</>}</td><td className="num">{r.item.rule?r.members:''}</td><td><small className="muted">{r.item.rule?ruleText(r.item.rule):''}</small></td></tr>)}
  </tbody></table></div>
  {report.unmatched.length>0?<div className="notice warning"><b>ปริมาณที่ยังไม่อยู่ในหมวด BOQ</b> · เพิ่มเงื่อนไขในไฟล์ Excel แล้วนำเข้าใหม่<ul>{report.unmatched.map(u=><li key={u.component+u.label+u.unit}>{boqComponentLabels[u.component]}{u.component==='rebar'||u.component==='site'?` · ${u.label}`:''}: {number(u.quantity)} {u.unit} · {u.members} สมาชิก ({u.categories.join(', ')})</li>)}</ul></div>:<p className="notice success">ปริมาณทุกรายการของขอบเขตนี้อยู่ในหมวด BOQ แล้ว</p>}
  <p className="muted">ขอบเขต: {scopeText} · ปริมาณหนึ่งก้อนลงรายการที่เงื่อนไขตรงมากที่สุด · ราคาต่อหน่วยกรอกในไฟล์ที่ส่งออก</p></>}
 </div>;
}
function ruleText(r:NonNullable<BoqChapters['items'][number]['rule']>){
 return [boqComponentLabels[r.component],r.disciplines?.join(', '),r.categories?.map(c=>labels[c]).join(', '),r.mix&&`Mix ${r.mix}`,r.diameters?.length&&`Ø${r.diameters.join(', ')}`,r.grades?.join(', '),r.buildings?.length&&`อาคาร ${r.buildings.join(', ')}`,r.siteItem].filter(Boolean).join(' · ');
}
